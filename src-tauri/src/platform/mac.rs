/// Platform-specific code for macOS.
use cocoa::appkit::{NSView, NSWindow, NSWindowButton, NSWindowStyleMask, NSWindowTitleVisibility};
use cocoa::base::{id, YES};
use cocoa::foundation::{NSPoint, NSRect};
use tauri::WebviewWindow;

// ── Paste callout suppression ────────────────────────────────────────────────

/// Override 实现：对 `paste:` 返回 NO 阻断原生 Paste 气泡，
/// 其余 action 用 `[self respondsToSelector:]` 保持默认行为。
///
/// 不保存原始 IMP，因为 WryWebView 本身没有 canPerformAction:withSender: 实现，
/// 原始行为来自 NSResponder，而 NSResponder 的实现等价于 `respondsToSelector`。
extern "C" fn replacement_can_perform_action(
    this: id,
    _cmd: objc::runtime::Sel,
    action: objc::runtime::Sel,
    _sender: id,
) -> objc::runtime::BOOL {
    unsafe {
        #[cfg(debug_assertions)]
        if action.name() == "paste:" {
            eprintln!(
                "[toolbox:paste-swizzle] canPerformAction:paste: → NO"
            );
        }

        let paste_sel = sel!(paste:);
        if action == paste_sel {
            return objc::runtime::NO;
        }
        // 其余 action：是否能响应由 respondsToSelector 决定（等价于 NSResponder 默认行为）
        let can: objc::runtime::BOOL = objc::msg_send![this, respondsToSelector: action];
        can
    }
}

/// 向 WryWebView 类添加 `canPerformAction:withSender:` override，
/// 阻止 macOS Ventura+ 在右键时弹出原生 "Paste" 气泡。
///
/// ## 实现原理
///
/// - `class_getInstanceMethod` 在 objc 0.2 + 现代 macOS 上无法找到
///   `canPerformAction:withSender:`（该方法可能通过 `+resolveInstanceMethod:`
///   动态注册，不在静态方法表中）。
/// - 使用 `class_addMethod` 绕过这一问题：直接向目标类写入新的 IMP，
///   不依赖对已有方法的查找。
/// - 目标类：通过 `wv.inner()` 拿到 webview 实例，`object_getClass` 得到
///   KVO 包装类 `NSKVONotifying_WryWebView`，再 `class_getSuperclass` 得到
///   实际的 `WryWebView`——添加到这里可被所有实例继承。
pub fn suppress_paste_callout(window: &WebviewWindow) {
    use objc::runtime::{object_getClass, Class, Imp};
    use std::os::raw::c_char;
    use std::sync::Once;
    static ONCE: Once = Once::new();

    extern "C" {
        fn class_addMethod(
            cls: *mut Class,
            name: objc::runtime::Sel,
            imp: Imp,
            types: *const c_char,
        ) -> bool;
        fn class_replaceMethod(
            cls: *mut Class,
            name: objc::runtime::Sel,
            imp: Imp,
            types: *const c_char,
        ) -> Imp;
        fn class_getSuperclass(cls: *const Class) -> *const Class;
        fn class_getName(cls: *const Class) -> *const c_char;
    }

    let _ = window.with_webview(move |wv| {
        ONCE.call_once(|| unsafe {
            let webview: id = wv.inner() as id;
            if webview.is_null() {
                return;
            }

            // object_getClass → NSKVONotifying_WryWebView（KVO 包装）
            // class_getSuperclass → WryWebView（真正的 webview 子类）
            let kvo_cls: *const Class = object_getClass(webview as *const _);
            if kvo_cls.is_null() {
                return;
            }
            let target_cls: *const Class = class_getSuperclass(kvo_cls);
            if target_cls.is_null() {
                return;
            }

            let sel_can_perform = sel!(canPerformAction:withSender:);
            let new_imp: Imp = std::mem::transmute::<
                extern "C" fn(id, objc::runtime::Sel, objc::runtime::Sel, id) -> objc::runtime::BOOL,
                Imp,
            >(replacement_can_perform_action);
            // type encoding: BOOL(B) id(@) SEL(:) SEL(:) id(@)
            let types: *const c_char = b"B@::@\0".as_ptr() as *const c_char;

            // class_addMethod: 若目标类没有自己的实现则添加，返回 true
            // class_replaceMethod: 若已有实现则替换（不管继承链）
            let added = class_addMethod(target_cls as *mut _, sel_can_perform, new_imp, types);
            if !added {
                // 目标类已有自己的实现，用 replaceMethod 替换
                class_replaceMethod(target_cls as *mut _, sel_can_perform, new_imp, types);
            }

            #[cfg(debug_assertions)]
            {
                let cls_name = std::ffi::CStr::from_ptr(class_getName(target_cls))
                    .to_str()
                    .unwrap_or("?");
                eprintln!(
                    "[toolbox:paste-swizzle] added canPerformAction override to {cls_name} (added={added})"
                );
            }
        });
    });
}

/// Apply macOS-specific window customizations (transparent title bar, etc.).
///
/// - Makes the title bar transparent and full-size content view
/// - Positions the traffic light (close/miniaturize/zoom) buttons so they are
///   vertically centered within the 40px title bar and offset 12px from the left
pub fn setup_mac_window(window: &WebviewWindow) {
    let ns_window = window.ns_window().expect("ns_window unavailable on macOS") as id;
    unsafe {
        ns_window.setTitlebarAppearsTransparent_(YES);
        ns_window.setTitleVisibility_(NSWindowTitleVisibility::NSWindowTitleHidden);

        let style_mask = ns_window.styleMask() | NSWindowStyleMask::NSFullSizeContentViewWindowMask;
        ns_window.setStyleMask_(style_mask);
    }

    position_traffic_lights(window);
}

/// Re-apply traffic light positions after fullscreen transitions.
pub fn reposition_traffic_lights(window: &WebviewWindow) {
    position_traffic_lights(window);
}

fn position_traffic_lights(window: &WebviewWindow) {
    let ns_window = window.ns_window().expect("ns_window unavailable on macOS") as id;
    unsafe {
        let close = ns_window.standardWindowButton_(NSWindowButton::NSWindowCloseButton);
        let mini = ns_window.standardWindowButton_(NSWindowButton::NSWindowMiniaturizeButton);
        let zoom = ns_window.standardWindowButton_(NSWindowButton::NSWindowZoomButton);

        if close.is_null() || mini.is_null() || zoom.is_null() {
            return;
        }

        let superview: id = msg_send![close, superview];
        let superview_frame: NSRect = NSView::frame(superview);
        let title_bar_h = superview_frame.size.height;

        let close_frame: NSRect = NSView::frame(close);
        let mini_frame: NSRect = NSView::frame(mini);

        let button_h = close_frame.size.height;
        let y = (title_bar_h - button_h) / 2.0;
        let x0 = 12.0_f64;
        let gap = 6.0_f64;

        let _: () = msg_send![close, setFrameOrigin: NSPoint { x: x0, y }];
        let _: () = msg_send![mini,
            setFrameOrigin: NSPoint { x: x0 + close_frame.size.width + gap, y }];
        let _: () = msg_send![zoom,
        setFrameOrigin: NSPoint {
            x: x0 + close_frame.size.width + gap + mini_frame.size.width + gap,
            y
        }];
    }
}
