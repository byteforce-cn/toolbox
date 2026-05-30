/// 剪贴板文件路径读取命令。
///
/// macOS：通过 NSPasteboard 读取 `NSFilenamesPboardType`（文件复制，Cmd+C）
/// 或 `public.file-url`（单文件 URL），返回绝对路径列表。
///
/// WKWebView 中 `navigator.clipboard.readText()` 无法读取这类 native 文件类型，
/// 必须经由此命令才能在 Tauri 中拿到从 VSCode/Finder 复制的文件完整路径。
///
/// 无文件内容时返回空列表，不视为错误。
#[tauri::command]
pub fn clipboard_read_file_paths() -> Vec<String> {
    read_file_paths_impl()
}

/// 将文件路径列表写入系统剪贴板（macOS NSFilenamesPboardType / Windows CF_HDROP）。
///
/// 写入后可在 Finder、VSCode 等应用中粘贴（Cmd+V）。
/// paths 为空时静默返回 Ok。
#[tauri::command]
pub fn clipboard_write_file_paths(paths: Vec<String>) -> Result<(), String> {
    write_file_paths_impl(paths)
}

/// 读取系统剪贴板中的纯文本内容。
///
/// macOS：读取 `NSPasteboardTypeString`。
/// Windows：读取 `CF_UNICODETEXT`。
/// 剪贴板为空或无文本内容时返回空字符串。
#[tauri::command]
pub fn clipboard_read_text() -> String {
    read_text_impl()
}

#[cfg(target_os = "macos")]
fn read_text_impl() -> String {
    use cocoa::base::{id, nil};
    use objc::{class, msg_send};
    use std::os::raw::c_char;
    unsafe {
        let pb: id = msg_send![class!(NSPasteboard), generalPasteboard];
        let type_str: id = msg_send![
            class!(NSString),
            stringWithUTF8String: b"NSPasteboardTypeString\0".as_ptr() as *const c_char
        ];
        let val: id = msg_send![pb, stringForType: type_str];
        if val == nil {
            return String::new();
        }
        nsstring_to_rust(val).unwrap_or_default()
    }
}

#[cfg(target_os = "windows")]
fn read_text_impl() -> String {
    use windows::Win32::System::DataExchange::{CloseClipboard, GetClipboardData, OpenClipboard};
    unsafe {
        if OpenClipboard(None).is_err() {
            return String::new();
        }
        let text = (|| {
            // CF_UNICODETEXT = 13
            let handle = GetClipboardData(13).ok()?;
            if handle.is_invalid() {
                return None;
            }
            let ptr = handle.0 as *const u16;
            if ptr.is_null() {
                return None;
            }
            let mut len = 0usize;
            while *ptr.add(len) != 0 {
                len += 1;
            }
            Some(String::from_utf16_lossy(std::slice::from_raw_parts(ptr, len)).to_string())
        })()
        .unwrap_or_default();
        let _ = CloseClipboard();
        text
    }
}

#[cfg(not(any(target_os = "macos", target_os = "windows")))]
fn read_text_impl() -> String {
    String::new()
}

// ── macOS 实现 ────────────────────────────────────────────────────────────────

#[cfg(target_os = "macos")]
fn read_file_paths_impl() -> Vec<String> {
    use cocoa::base::{id, nil};
    use objc::{class, msg_send, sel, sel_impl};

    unsafe {
        let pb: id = msg_send![class!(NSPasteboard), generalPasteboard];

        // ① VS Code 私有格式 "code/file-list"
        //    Electron 通过 clipboard.writeBuffer 写入，内容为 UTF-8 文本，
        //    每行一条 file:// URI（如 file:///abs/path）。
        let vscode_type: id = msg_send![
            class!(NSString),
            stringWithUTF8String: b"code/file-list\0".as_ptr()
                as *const std::os::raw::c_char
        ];
        let data: id = msg_send![pb, dataForType: vscode_type];
        if data != nil {
            let len: usize = msg_send![data, length];
            if len > 0 {
                let bytes: *const u8 = msg_send![data, bytes];
                let slice = std::slice::from_raw_parts(bytes, len);
                if let Ok(text) = std::str::from_utf8(slice) {
                    let paths: Vec<String> = text
                        .lines()
                        .filter_map(|line| {
                            let line = line.trim();
                            // 去掉 file:// 或 file:///（file:// + /abs/path = 3 slashes on Unix）
                            let rest = if let Some(r) = line.strip_prefix("file://") {
                                r
                            } else {
                                return None;
                            };
                            let decoded = percent_decode(rest);
                            if decoded.is_empty() { None } else { Some(decoded) }
                        })
                        .collect();
                    if !paths.is_empty() {
                        #[cfg(debug_assertions)]
                        eprintln!(
                            "[clipboard:read] code/file-list → {} paths: {:?}",
                            paths.len(),
                            paths
                        );
                        return paths;
                    }
                }
            }
        }

        // ② 现代 Finder/AirDrop API：readObjectsForClasses:[NSURL.class]
        let url_class: id = msg_send![class!(NSURL), class];
        let classes: id = msg_send![class!(NSArray), arrayWithObject: url_class];
        let key_str: id = msg_send![
            class!(NSString),
            stringWithUTF8String: b"NSPasteboardURLReadingFileURLsOnly\0".as_ptr()
                as *const std::os::raw::c_char
        ];
        let true_num: id = msg_send![class!(NSNumber), numberWithBool: 1i8];
        let options: id = msg_send![
            class!(NSDictionary),
            dictionaryWithObject: true_num forKey: key_str
        ];
        let urls: id = msg_send![pb, readObjectsForClasses: classes options: options];
        if urls != nil {
            let count: usize = msg_send![urls, count];
            if count > 0 {
                let mut paths = Vec::with_capacity(count);
                for i in 0..count {
                    let url: id = msg_send![urls, objectAtIndex: i];
                    let path_obj: id = msg_send![url, path];
                    if let Some(s) = nsstring_to_rust(path_obj) {
                        if !s.is_empty() {
                            paths.push(s);
                        }
                    }
                }
                if !paths.is_empty() {
                    #[cfg(debug_assertions)]
                    eprintln!(
                        "[clipboard:read] NSURL readObjectsForClasses → {} paths",
                        paths.len()
                    );
                    return paths;
                }
            }
        }

        // ③ 老式 deprecated NSFilenamesPboardType（极少数老应用）
        let ns_type: id = msg_send![
            class!(NSString),
            stringWithUTF8String: b"NSFilenamesPboardType\0".as_ptr()
                as *const std::os::raw::c_char
        ];
        let names: id = msg_send![pb, propertyListForType: ns_type];
        if names != nil {
            if let Some(paths) = nsarray_to_strings(names) {
                if !paths.is_empty() {
                    #[cfg(debug_assertions)]
                    eprintln!(
                        "[clipboard:read] NSFilenamesPboardType (legacy) → {} paths",
                        paths.len()
                    );
                    return paths;
                }
            }
        }

        // ④ public.file-url 字符串（单文件场景）
        let url_type: id = msg_send![
            class!(NSString),
            stringWithUTF8String: b"public.file-url\0".as_ptr()
                as *const std::os::raw::c_char
        ];
        let url_str: id = msg_send![pb, stringForType: url_type];
        if url_str != nil {
            if let Some(file_url) = nsstring_to_rust(url_str) {
                if let Some(path) = file_url.strip_prefix("file://") {
                    let decoded = percent_decode(path);
                    if !decoded.is_empty() {
                        #[cfg(debug_assertions)]
                        eprintln!("[clipboard:read] public.file-url string → 1 path");
                        return vec![decoded];
                    }
                }
            }
        }

        // ⑤ 纯文本路径（VSCode "Copy Path" / 直接复制文件路径字符串）
        //    读 NSPasteboardTypeString，若内容看起来是绝对路径则作为文件路径返回。
        //    这样就不再依赖 navigator.clipboard.readText()，不触发 macOS paste 气泡。
        let string_type: id = msg_send![
            class!(NSString),
            stringWithUTF8String: b"NSPasteboardTypeString\0".as_ptr()
                as *const std::os::raw::c_char
        ];
        let text_val: id = msg_send![pb, stringForType: string_type];
        if text_val != nil {
            if let Some(s) = nsstring_to_rust(text_val) {
                let s = s.trim().to_string();
                if is_absolute_path(&s) {
                    #[cfg(debug_assertions)]
                    eprintln!("[clipboard:read] NSPasteboardTypeString text path → 1 path");
                    return vec![s];
                }
            }
        }

        #[cfg(debug_assertions)]
        eprintln!("[clipboard:read] no file paths found");
        vec![]
    }
}

#[cfg(target_os = "macos")]
unsafe fn nsstring_to_rust(s: cocoa::base::id) -> Option<String> {
    use cocoa::base::nil;
    use objc::{sel, sel_impl};

    if s == nil {
        return None;
    }
    let ptr: *const std::os::raw::c_char = objc::msg_send![s, UTF8String];
    if ptr.is_null() {
        return None;
    }
    Some(
        std::ffi::CStr::from_ptr(ptr)
            .to_string_lossy()
            .into_owned(),
    )
}

#[cfg(target_os = "macos")]
unsafe fn nsarray_to_strings(arr: cocoa::base::id) -> Option<Vec<String>> {
    use cocoa::base::nil;
    use objc::{sel, sel_impl};

    if arr == nil {
        return None;
    }
    let count: usize = objc::msg_send![arr, count];
    let mut result = Vec::with_capacity(count);
    for i in 0..count {
        let item: cocoa::base::id = objc::msg_send![arr, objectAtIndex: i];
        if let Some(s) = nsstring_to_rust(item) {
            result.push(s);
        }
    }
    Some(result)
}

/// 简单 percent-decode，仅处理 ASCII %XX 序列（路径常见场景足够）
#[cfg(target_os = "macos")]
fn percent_decode(s: &str) -> String {
    let bytes = s.as_bytes();
    let mut out = Vec::with_capacity(bytes.len());
    let mut i = 0;
    while i < bytes.len() {
        if bytes[i] == b'%' && i + 2 < bytes.len() {
            if let (Some(h), Some(l)) = (from_hex(bytes[i + 1]), from_hex(bytes[i + 2])) {
                out.push((h << 4) | l);
                i += 3;
                continue;
            }
        }
        out.push(bytes[i]);
        i += 1;
    }
    String::from_utf8_lossy(&out).into_owned()
}

#[cfg(target_os = "macos")]
fn from_hex(b: u8) -> Option<u8> {
    match b {
        b'0'..=b'9' => Some(b - b'0'),
        b'a'..=b'f' => Some(b - b'a' + 10),
        b'A'..=b'F' => Some(b - b'A' + 10),
        _ => None,
    }
}

// ── Windows 实现 ──────────────────────────────────────────────────────────────

#[cfg(target_os = "windows")]
fn read_file_paths_impl() -> Vec<String> {
    use windows::Win32::System::DataExchange::{CloseClipboard, GetClipboardData, OpenClipboard};
    use windows::Win32::UI::Shell::{DragQueryFileW, HDROP};
    use windows::core::PWSTR;

    // CF_HDROP = 15（Windows 标准剪贴板格式，文件拖放/复制均使用此格式）
    const CF_HDROP: u32 = 15;

    unsafe {
        if OpenClipboard(None).is_err() {
            #[cfg(debug_assertions)]
            eprintln!("[clipboard:read] OpenClipboard failed");
            return vec![];
        }

        let result = (|| {
            let handle = match GetClipboardData(CF_HDROP) {
                Ok(h) if !h.is_invalid() => h,
                _ => {
                    #[cfg(debug_assertions)]
                    eprintln!("[clipboard:read] GetClipboardData(CF_HDROP) returned no data");
                    return vec![];
                }
            };

            // SAFETY: CF_HDROP handle 与 HDROP（GlobalAlloc 句柄）布局相同
            let hdrop = HDROP(handle.0);

            // index = 0xFFFFFFFF 时、buffer 为 null → 返回文件总数
            let count = DragQueryFileW(hdrop, 0xFFFF_FFFF, PWSTR::null(), 0);
            let mut paths = Vec::with_capacity(count as usize);

            for i in 0..count {
                let len = DragQueryFileW(hdrop, i, PWSTR::null(), 0) as usize;
                if len == 0 {
                    continue;
                }
                let mut buf = vec![0u16; len + 1];
                let written =
                    DragQueryFileW(hdrop, i, PWSTR(buf.as_mut_ptr()), (len + 1) as u32);
                if written > 0 {
                    let path = String::from_utf16_lossy(&buf[..written as usize]);
                    paths.push(path);
                }
            }

            #[cfg(debug_assertions)]
            eprintln!("[clipboard:read] CF_HDROP → {} paths", paths.len());
            paths
        })();

        // CF_HDROP 没有内容时，回退读纯文本路径（Windows "Copy Path"）
        let paths = if result.is_empty() {
            (|| unsafe {
                use windows::Win32::System::DataExchange::GetClipboardData;
                use windows::core::PWSTR;
                // CF_UNICODETEXT = 13
                let handle = GetClipboardData(13).ok()?;
                if handle.is_invalid() {
                    return None;
                }
                let ptr = handle.0 as *const u16;
                if ptr.is_null() {
                    return None;
                }
                let mut len = 0usize;
                while *ptr.add(len) != 0 {
                    len += 1;
                }
                let s = String::from_utf16_lossy(std::slice::from_raw_parts(ptr, len));
                let s = s.trim().to_string();
                if is_absolute_path(&s) {
                    #[cfg(debug_assertions)]
                    eprintln!("[clipboard:read] CF_UNICODETEXT text path → 1 path");
                    Some(vec![s])
                } else {
                    None
                }
            })()
            .unwrap_or_default()
        } else {
            result
        };

        let _ = CloseClipboard();
        paths
    }
}

// ── 其他平台（暂不支持） ─────────────────────────────────────────────────────

#[cfg(not(any(target_os = "macos", target_os = "windows")))]
fn read_file_paths_impl() -> Vec<String> {
    vec![]
}

// ── 跨平台工具函数 ─────────────────────────────────────────────────────────────

/// 判断字符串是否为绝对文件路径（Unix 或 Windows）。
/// 用于从纯文本剪贴板内容中识别"Copy Path"写入的路径。
fn is_absolute_path(s: &str) -> bool {
    if s.is_empty() {
        return false;
    }
    // Unix: /abs/path
    if s.starts_with('/') {
        return true;
    }
    // Windows: C:\... 或 C:/...
    let bytes = s.as_bytes();
    if bytes.len() >= 3
        && bytes[0].is_ascii_alphabetic()
        && bytes[1] == b':'
        && (bytes[2] == b'\\' || bytes[2] == b'/')
    {
        return true;
    }
    // Windows UNC: \\server\share
    if s.starts_with("\\\\") {
        return true;
    }
    false
}

// ── 写剪贴板：macOS ───────────────────────────────────────────────────────────

#[cfg(target_os = "macos")]
fn write_file_paths_impl(paths: Vec<String>) -> Result<(), String> {
    use cocoa::base::{id, nil};
    use objc::{class, msg_send};
    use std::ffi::CString;

    if paths.is_empty() {
        return Ok(());
    }

    unsafe {
        let pb: id = msg_send![class!(NSPasteboard), generalPasteboard];
        // clearContents 返回 NSInteger（change count），丢弃即可
        let _: isize = msg_send![pb, clearContents];

        let url_class = class!(NSURL);
        let nsstring_class = class!(NSString);

        let urls: Vec<id> = paths
            .iter()
            .filter_map(|path| {
                let c_str = CString::new(path.as_str()).ok()?;
                let ns_path: id =
                    msg_send![nsstring_class, stringWithUTF8String: c_str.as_ptr()];
                if ns_path == nil {
                    return None;
                }
                let url: id = msg_send![url_class, fileURLWithPath: ns_path];
                if url == nil { None } else { Some(url) }
            })
            .collect();

        if urls.is_empty() {
            return Err("No valid file URLs created".to_string());
        }

        // NSArray +arrayWithObjects:count:
        let array: id = msg_send![
            class!(NSArray),
            arrayWithObjects: urls.as_ptr()
            count: urls.len() as usize
        ];

        // writeObjects: 返回 BOOL（i8 on macOS）
        let success: bool = msg_send![pb, writeObjects: array];
        if success {
            Ok(())
        } else {
            Err("NSPasteboard writeObjects failed".to_string())
        }
    }
}

// ── 写剪贴板：Windows ─────────────────────────────────────────────────────────

#[cfg(target_os = "windows")]
fn write_file_paths_impl(paths: Vec<String>) -> Result<(), String> {
    use windows::Win32::Foundation::{BOOL, HANDLE, POINT};
    use windows::Win32::System::DataExchange::{
        CloseClipboard, EmptyClipboard, OpenClipboard, SetClipboardData,
    };
    use windows::Win32::System::Memory::{GlobalAlloc, GlobalLock, GlobalUnlock, GMEM_MOVEABLE};
    use windows::Win32::UI::Shell::DROPFILES;

    const CF_HDROP: u32 = 15;

    if paths.is_empty() {
        return Ok(());
    }

    unsafe {
        // 构建宽字符多字符串：每条路径 null 结尾，最后再加一个 null
        let wide_paths: Vec<Vec<u16>> = paths
            .iter()
            .map(|p| {
                let mut w: Vec<u16> = p.encode_utf16().collect();
                w.push(0);
                w
            })
            .collect();

        let total_wchars: usize = wide_paths.iter().map(|w| w.len()).sum::<usize>() + 1;
        let dropfiles_size = std::mem::size_of::<DROPFILES>();
        let total_bytes = dropfiles_size + total_wchars * 2;

        let hmem = GlobalAlloc(GMEM_MOVEABLE, total_bytes)
            .map_err(|e| format!("GlobalAlloc failed: {e}"))?;

        {
            let ptr = GlobalLock(hmem) as *mut u8;
            if ptr.is_null() {
                return Err("GlobalLock returned null".to_string());
            }
            std::ptr::write_bytes(ptr, 0, total_bytes);

            let df = ptr as *mut DROPFILES;
            (*df).pFiles = dropfiles_size as u32;
            (*df).fWide = BOOL(1);
            (*df).pt = POINT { x: 0, y: 0 };
            (*df).fNC = BOOL(0);

            let wchar_ptr = ptr.add(dropfiles_size) as *mut u16;
            let mut offset = 0usize;
            for wide in &wide_paths {
                std::ptr::copy_nonoverlapping(wide.as_ptr(), wchar_ptr.add(offset), wide.len());
                offset += wide.len();
            }
            let _ = GlobalUnlock(hmem);
        }

        OpenClipboard(None).map_err(|e| format!("OpenClipboard failed: {e}"))?;

        if EmptyClipboard().is_err() {
            let _ = CloseClipboard();
            return Err("EmptyClipboard failed".to_string());
        }
        if SetClipboardData(CF_HDROP, HANDLE(hmem.0)).is_err() {
            let _ = CloseClipboard();
            return Err("SetClipboardData failed".to_string());
        }
        let _ = CloseClipboard();
        Ok(())
    }
}

// ── 写剪贴板：其他平台 ────────────────────────────────────────────────────────

#[cfg(not(any(target_os = "macos", target_os = "windows")))]
fn write_file_paths_impl(_paths: Vec<String>) -> Result<(), String> {
    Ok(())
}
