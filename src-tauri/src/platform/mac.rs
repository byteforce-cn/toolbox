/// Platform-specific code for macOS.
use cocoa::appkit::{NSView, NSWindow, NSWindowButton, NSWindowStyleMask, NSWindowTitleVisibility};
use cocoa::base::{id, YES};
use cocoa::foundation::{NSPoint, NSRect};
use tauri::WebviewWindow;

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
