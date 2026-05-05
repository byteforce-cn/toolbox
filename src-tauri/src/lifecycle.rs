/// Shell lifecycle IPC commands.
use std::collections::HashMap;
use std::sync::Mutex;

use serde::Serialize;
use tauri::{AppHandle, Emitter, Manager, Runtime};

const IPC_PROTOCOL_VERSION: &str = "1.0.0";

// ── Startup flag state ─────────────────────────────────────────────────────

/// Shared flag store managed as Tauri state.
pub struct StartupFlags {
    pub flags: Mutex<HashMap<String, String>>,
}

impl Default for StartupFlags {
    fn default() -> Self {
        Self {
            flags: Mutex::new(HashMap::new()),
        }
    }
}

fn has_flag(storage: &StartupFlags, key: &str) -> Result<bool, String> {
    Ok(storage
        .flags
        .lock()
        .map_err(|e| format!("Storage lock poisoned: {e}"))?
        .contains_key(key))
}

fn set_flag(storage: &StartupFlags, key: &str) -> Result<(), String> {
    storage
        .flags
        .lock()
        .map_err(|e| format!("Storage lock poisoned: {e}"))?
        .insert(key.to_owned(), String::new());
    Ok(())
}

fn finalize_startup_if_ready<R: Runtime>(
    app: &AppHandle<R>,
    storage: &StartupFlags,
) -> Result<(), String> {
    let backend_ready = has_flag(storage, "backend_ready")?;
    let frontend_ready = has_flag(storage, "frontend_ready")?;
    let startup_done = has_flag(storage, "startup_done")?;

    if startup_done || !backend_ready || !frontend_ready {
        return Ok(());
    }

    set_flag(storage, "startup_done")?;

    // Close splashscreen directly — no event round-trip needed
    if let Some(splash) = app.get_webview_window("splashscreen") {
        let _ = splash.close();
    }

    // Ensure main window is visible and focused
    if let Some(main_win) = app.get_webview_window("main") {
        let _ = main_win.show();
        let _ = main_win.set_focus();
    }

    Ok(())
}

// ── Version negotiation payloads ───────────────────────────────────────────

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct VersionInfo {
    pub app_version: String,
    pub protocol_version: String,
    pub compatible: bool,
}

// ── IPC commands ───────────────────────────────────────────────────────────

/// Called by the splash screen on load. Emits `backend_ready` so the
/// splash can update its status text. The main window stays hidden until
/// `finalize_startup_if_ready` runs (after `frontend_ready`).
#[tauri::command]
pub async fn init(
    app: AppHandle<impl Runtime>,
    storage: tauri::State<'_, StartupFlags>,
) -> Result<(), String> {
    let _ = app.emit(
        "splash_message",
        serde_json::json!({ "message": "检查应用设置..." }),
    );

    set_flag(storage.inner(), "backend_ready")?;

    let _ = app.emit("backend_ready", serde_json::json!({}));

    // Check in case frontend_ready arrived before init
    finalize_startup_if_ready(&app, storage.inner())?;

    Ok(())
}

/// Called by the main frontend after bootstrap completes.
/// Triggers splash close when both sides are ready.
#[tauri::command]
pub async fn frontend_ready(
    app: AppHandle<impl Runtime>,
    storage: tauri::State<'_, StartupFlags>,
) -> Result<(), String> {
    set_flag(storage.inner(), "frontend_ready")?;
    finalize_startup_if_ready(&app, storage.inner())?;
    Ok(())
}

#[tauri::command]
pub async fn negotiate_version(_frontend_protocol: String) -> Result<VersionInfo, String> {
    let protocol = IPC_PROTOCOL_VERSION;
    Ok(VersionInfo {
        app_version: env!("CARGO_PKG_VERSION").to_string(),
        protocol_version: protocol.to_string(),
        compatible: true,
    })
}

/// Fallback command for the splash screen JS failsafe timer.
#[tauri::command]
pub async fn close_splashscreen(app: AppHandle<impl Runtime>) -> Result<(), String> {
    if let Some(splash) = app.get_webview_window("splashscreen") {
        splash
            .close()
            .map_err(|e| format!("Failed to close splashscreen: {e}"))?;
    }
    if let Some(main_win) = app.get_webview_window("main") {
        let _ = main_win.show();
        let _ = main_win.set_focus();
    }
    Ok(())
}
