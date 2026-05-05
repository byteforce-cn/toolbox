/// Platform-specific code for Windows.
use tauri::WebviewWindow;

/// Apply Windows-specific window customizations.
///
/// Currently a no-op — the default Tauri window chrome is used. This
/// function exists as a hook so platform-specific tweaks (e.g. Mica /
/// Acrylic backdrop, custom caption buttons) can be added later without
/// touching any call-site.
#[allow(unused_variables)]
pub fn setup_win_window(window: &WebviewWindow) {
    // No Windows-specific customisation required at the moment.
}
