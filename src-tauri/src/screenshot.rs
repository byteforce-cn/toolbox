/// 开发者调试用截图命令。
///
/// macOS：通过 WKWebView.takeSnapshot 滚动分段截取指定可滚动容器的完整内容（scrollHeight），
/// 逐段拍照后垂直拼接为全高 PNG，通过 NSPasteboard 写入系统剪贴板。

/// 截取指定 CSS 选择器元素的完整可滚动内容，直接写入系统剪贴板（PNG）。
///
/// - `selector`：CSS 选择器（用于 eval 控制 scrollTop）
/// - `x`, `y`：元素在视口中的 CSS 逻辑像素坐标（`getBoundingClientRect()`）
/// - `width`, `height`：元素可见区域尺寸（clientWidth / clientHeight）
/// - `scroll_height`：元素完整内容高度（scrollHeight）
/// - `scale_factor`：设备像素比（`window.devicePixelRatio`）
#[tauri::command]
pub async fn copy_element_screenshot(
    window: tauri::WebviewWindow,
    selector: String,
    x: f64,
    y: f64,
    width: f64,
    height: f64,
    scroll_height: f64,
    scale_factor: f64,
) -> Result<(), String> {
    use image::{imageops, ImageFormat, RgbaImage};
    use std::io::Cursor;
    use std::time::Duration;

    let sf = scale_factor.max(1.0);
    let px_x = (x * sf).round() as u32;
    let px_y = (y * sf).round() as u32;
    let client_w_px = (width * sf).round() as u32;
    let client_h_px = (height * sf).round() as u32;
    let total_h_px = (scroll_height * sf).round() as u32;

    if client_w_px == 0 || client_h_px == 0 || total_h_px == 0 {
        return Err("元素尺寸为零".to_string());
    }

    // selector 由前端硬编码传入，JSON 序列化后作为 JS 字符串字面量（防注入）
    let selector_js = serde_json::to_string(&selector)
        .map_err(|e| format!("selector 序列化失败: {e}"))?;
    let max_scroll_css = (scroll_height - height).max(0.0);
    let num_strips = ((total_h_px + client_h_px - 1) / client_h_px) as usize;
    let mut output = RgbaImage::new(client_w_px, total_h_px);

    for i in 0..num_strips {
        // 本段在输出图像中的行范围
        let dest_start = i as u32 * client_h_px;
        let dest_end = (dest_start + client_h_px).min(total_h_px);
        let n_rows = dest_end - dest_start;

        // 本段需要的 scrollTop（不超过最大可滚动量）
        let actual_scroll_css = (dest_start as f64 / sf).min(max_scroll_css);

        // 滚动到目标位置（eval 发往 WKWebView 主线程，FIFO 顺序执行）
        window
            .eval(&format!(
                "document.querySelector({selector_js}).scrollTop={actual_scroll_css}"
            ))
            .map_err(|e| e.to_string())?;

        // 等待滚动 + 重绘（sleep 在 tokio 上下文，不阻塞主线程）
        tokio::time::sleep(Duration::from_millis(100)).await;

        // 截取整个视口 PNG
        let (tx, rx) = tokio::sync::oneshot::channel::<Result<Vec<u8>, String>>();
        capture_webview_png(&window, tx)?;
        let full_png = rx.await.map_err(|_| "截图通道已关闭".to_string())??;

        // 解码 → 裁剪到元素可见矩形
        let full_img = image::load(Cursor::new(&full_png), ImageFormat::Png)
            .map_err(|e| format!("PNG 解码失败: {e}"))?
            .into_rgba8();
        // crop_imm returns SubImage; call to_image() to get an owned RgbaImage with get_pixel
        let strip = imageops::crop_imm(&full_img, px_x, px_y, client_w_px, client_h_px).to_image();

        // 本段截图在 strip 中的起始行（处理最后一段与前一段的内容重叠）
        // strip 展示的内容从 actual_scroll_css 开始，而我们需要的内容从 dest_start/sf 开始
        let strip_row_start = (dest_start as f64 - actual_scroll_css * sf).round() as u32;

        // 复制到输出
        for row in 0..n_rows {
            for col in 0..client_w_px {
                let pixel = *strip.get_pixel(col, strip_row_start + row);
                output.put_pixel(col, dest_start + row, pixel);
            }
        }
    }

    // 编码拼接后的全高图像为 PNG
    let mut png_out = Vec::<u8>::new();
    output
        .write_to(&mut Cursor::new(&mut png_out), ImageFormat::Png)
        .map_err(|e| format!("PNG 编码失败: {e}"))?;

    // 通过 NSPasteboard 写入系统剪贴板（绕过 JS clipboard 权限）
    write_png_to_clipboard(&png_out)
}

// ── 平台分发 ──────────────────────────────────────────────────────────────────

#[cfg(target_os = "macos")]
fn capture_webview_png(
    window: &tauri::WebviewWindow,
    tx: tokio::sync::oneshot::Sender<Result<Vec<u8>, String>>,
) -> Result<(), String> {
    capture_png_macos(window, tx)
}

#[cfg(not(target_os = "macos"))]
fn capture_webview_png(
    _window: &tauri::WebviewWindow,
    tx: tokio::sync::oneshot::Sender<Result<Vec<u8>, String>>,
) -> Result<(), String> {
    let _ = tx.send(Err("当前平台暂不支持截图功能".to_string()));
    Ok(())
}

// ── macOS WKWebView.takeSnapshot ──────────────────────────────────────────────

/// 调用 WKWebView.takeSnapshot(with:completionHandler:) 捕获 webview 内容。
/// 使用 `block` crate 构造 ObjC 回调块，结果通过 oneshot 通道传回 async 上下文。
#[cfg(target_os = "macos")]
fn capture_png_macos(
    window: &tauri::WebviewWindow,
    tx: tokio::sync::oneshot::Sender<Result<Vec<u8>, String>>,
) -> Result<(), String> {
    // ConcreteBlock 要求 Fn（可重复调用），而 oneshot::Sender::send 消费 self（FnOnce）。
    // 用 Arc<Mutex<Option<_>>> 包装，使 Fn 闭包可安全地 take 出 Sender 并发送一次。
    use std::sync::{Arc, Mutex};
    let tx_slot: Arc<Mutex<Option<tokio::sync::oneshot::Sender<Result<Vec<u8>, String>>>>> =
        Arc::new(Mutex::new(Some(tx)));

    window
        .with_webview(move |wv| {
            use block::ConcreteBlock;
            use cocoa::base::{id, nil};
            use objc::{class, msg_send, sel, sel_impl};

            let tx_slot = tx_slot.clone();

            unsafe {
                let wkwv: id = wv.inner() as id;
                if wkwv.is_null() {
                    if let Some(s) = tx_slot.lock().unwrap().take() {
                        let _ = s.send(Err("WKWebView 指针为空".to_string()));
                    }
                    return;
                }

                // ObjC 完成块：(NSImage*, NSError*) -> void
                let block = ConcreteBlock::new(move |image: id, error: id| {
                    let sender = tx_slot.lock().unwrap().take();
                    let Some(tx) = sender else { return };

                    if !error.is_null() {
                        let desc: id = msg_send![error, localizedDescription];
                        let c_str: *const std::os::raw::c_char =
                            msg_send![desc, UTF8String];
                        let msg = std::ffi::CStr::from_ptr(c_str)
                            .to_string_lossy()
                            .into_owned();
                        let _ = tx.send(Err(format!("takeSnapshot 失败: {msg}")));
                        return;
                    }
                    if image.is_null() {
                        let _ = tx.send(Err("takeSnapshot 返回空图像".to_string()));
                        return;
                    }
                    match nsimage_to_png(image) {
                        Ok(png) => {
                            let _ = tx.send(Ok(png));
                        }
                        Err(e) => {
                            let _ = tx.send(Err(e));
                        }
                    }
                })
                .copy();

                // takeSnapshotWithConfiguration:nil = 截取当前可见视口
                let _: () = msg_send![
                    wkwv,
                    takeSnapshotWithConfiguration: nil
                    completionHandler: &*block
                ];
            }
        })
        .map_err(|e| e.to_string())
}

/// NSImage* → PNG 字节。路径：NSImage → TIFF → NSBitmapImageRep → PNG NSData → Vec<u8>
#[cfg(target_os = "macos")]
unsafe fn nsimage_to_png(image: cocoa::base::id) -> Result<Vec<u8>, String> {
    use cocoa::base::id;
    use objc::{class, msg_send, sel, sel_impl};

    let tiff: id = msg_send![image, TIFFRepresentation];
    if tiff.is_null() {
        return Err("NSImage.TIFFRepresentation 返回 nil".to_string());
    }

    let bitmap: id = msg_send![class!(NSBitmapImageRep), imageRepWithData: tiff];
    if bitmap.is_null() {
        return Err("NSBitmapImageRep.imageRepWithData 返回 nil".to_string());
    }

    // NSBitmapImageFileTypePNG = 4
    let props: id = msg_send![class!(NSDictionary), new];
    let _: id = msg_send![props, autorelease];
    let png_type: usize = 4;
    let png_data: id =
        msg_send![bitmap, representationUsingType: png_type properties: props];
    if png_data.is_null() {
        return Err("NSBitmapImageRep PNG 转换返回 nil".to_string());
    }

    let bytes_ptr: *const u8 = msg_send![png_data, bytes];
    let length: usize = msg_send![png_data, length];
    Ok(std::slice::from_raw_parts(bytes_ptr, length).to_vec())
}

// ── 剪贴板写入 ────────────────────────────────────────────────────────────────

#[cfg(target_os = "macos")]
fn write_png_to_clipboard(png: &[u8]) -> Result<(), String> {
    use cocoa::base::id;
    use objc::{class, msg_send, sel, sel_impl};

    unsafe {
        // NSPasteboard.generalPasteboard
        let pb: id = msg_send![class!(NSPasteboard), generalPasteboard];
        let _: i64 = msg_send![pb, clearContents];

        // NSData.dataWithBytes:length:
        let ns_data: id = msg_send![
            class!(NSData),
            dataWithBytes: png.as_ptr() as *const std::os::raw::c_void
            length: png.len()
        ];

        // NSPasteboardTypePNG = "public.png"
        let type_str: id = msg_send![
            class!(NSString),
            stringWithUTF8String: b"public.png\0".as_ptr() as *const std::os::raw::c_char
        ];

        let ok: bool = msg_send![pb, setData: ns_data forType: type_str];
        if ok {
            Ok(())
        } else {
            Err("NSPasteboard setData 失败".to_string())
        }
    }
}

#[cfg(not(target_os = "macos"))]
fn write_png_to_clipboard(_png: &[u8]) -> Result<(), String> {
    Err("当前平台暂不支持写入剪贴板".to_string())
}
