mod clipboard;
mod git;
mod lifecycle;
mod screenshot;
mod workspace_fs;
#[cfg(target_os = "macos")]
#[macro_use]
extern crate objc;
#[cfg(target_os = "macos")]
mod platform {
    pub mod mac;
}
#[cfg(target_os = "windows")]
mod platform {
    pub mod win;
}

use tauri::{Manager, WebviewUrl, WebviewWindowBuilder};

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_fs::init())
        .plugin(tauri_plugin_dialog::init())
        .plugin(toolbox_plugin_crypto::init())
        .plugin(toolbox_plugin_ai::init())
        .manage(lifecycle::StartupFlags::default())
        .manage(workspace_fs::WorkspaceBrokerState::default())
        .invoke_handler(tauri::generate_handler![
            lifecycle::init,
            lifecycle::frontend_ready,
            lifecycle::close_splashscreen,
            lifecycle::negotiate_version,
            git::workspace_git_status,
            workspace_fs::workspace_register,
            workspace_fs::workspace_unregister,
            workspace_fs::workspace_read_dir,
            workspace_fs::workspace_read_text_file,
            workspace_fs::workspace_write_text_file,
            workspace_fs::workspace_mkdir,
            workspace_fs::workspace_rename,
            workspace_fs::workspace_remove,
            workspace_fs::workspace_exists,
        workspace_fs::workspace_copy_external_file,
        screenshot::copy_element_screenshot,
        clipboard::clipboard_read_file_paths,
        clipboard::clipboard_write_file_paths,
        clipboard::clipboard_read_text,
        ])
        .setup(|app| {
            setup_windows(app)?;

            // Failsafe: force-close splash after 15s if frontend never signals ready
            let handle = app.handle().clone();
            tauri::async_runtime::spawn(async move {
                tokio::time::sleep(std::time::Duration::from_secs(15)).await;
                if let Some(splash) = handle.get_webview_window("splashscreen") {
                    let _ = splash.close();
                }
                if let Some(main_win) = handle.get_webview_window("main") {
                    let _ = main_win.show();
                    let _ = main_win.set_focus();
                }
            });

            Ok(())
        })
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}

fn setup_windows(app: &mut tauri::App) -> Result<(), Box<dyn std::error::Error>> {
    // ── Splash window (visible, no decorations, always on top) ──────────
    let _ = WebviewWindowBuilder::new(app, "splashscreen", WebviewUrl::App("splash.html".into()))
        .inner_size(538.0, 404.0)
        .decorations(false)
        .always_on_top(true)
        .center()
        .build()?;

    // ── Main window (hidden until `frontend_ready` shows it) ────────────
    let win_builder = WebviewWindowBuilder::new(app, "main", WebviewUrl::default())
        .title("")
        .inner_size(1200.0, 800.0)
        .min_inner_size(800.0, 600.0)
        .center()
        .visible(false);

    #[cfg(target_os = "macos")]
    let win_builder = win_builder.title_bar_style(tauri::TitleBarStyle::Overlay);

    let _window = win_builder.build()?;

    #[cfg(target_os = "macos")]
    {
        if let Some(window) = app.get_webview_window("main") {
            platform::mac::setup_mac_window(&window);
            // 阻止 macOS Ventura+ WKWebView 弹出原生 "Paste" 气泡（覆盖右键菜单）
            platform::mac::suppress_paste_callout(&window);
        }
    }

    #[cfg(target_os = "windows")]
    {
        if let Some(window) = app.get_webview_window("main") {
            platform::win::setup_win_window(&window);
        }
    }

    Ok(())
}
