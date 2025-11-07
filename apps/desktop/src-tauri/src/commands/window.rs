use crate::{
    state::{AppState, DockPosition},
    window,
};
use serde::Serialize;
use tauri::{AppHandle, Manager, State, WebviewWindow};

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct WindowStatePayload {
    pub pinned: bool,
    pub always_on_top: bool,
    pub dock: Option<DockPosition>,
    pub maximized: bool,
    pub fullscreen: bool,
}

fn main_window(app: &AppHandle) -> Result<WebviewWindow, String> {
    app.get_webview_window("main")
        .ok_or_else(|| "Main window not found".to_string())
}

#[tauri::command]
pub fn window_get_state(state: State<AppState>) -> Result<WindowStatePayload, String> {
    let snapshot = state.snapshot();
    Ok(WindowStatePayload {
        pinned: snapshot.pinned,
        always_on_top: snapshot.always_on_top,
        dock: snapshot.dock,
        maximized: snapshot.maximized,
        fullscreen: snapshot.fullscreen,
    })
}

#[tauri::command]
pub fn window_set_pinned(
    app: AppHandle,
    state: State<AppState>,
    pinned: bool,
) -> Result<(), String> {
    let window = main_window(&app)?;
    window::set_pinned(&window, &state, pinned).map_err(|err| err.to_string())
}

#[tauri::command]
pub fn window_set_always_on_top(
    app: AppHandle,
    state: State<AppState>,
    value: bool,
) -> Result<(), String> {
    let window = main_window(&app)?;
    window::set_always_on_top(&window, &state, value).map_err(|err| err.to_string())
}

#[tauri::command]
pub fn window_set_visibility(app: AppHandle, visible: bool) -> Result<(), String> {
    let window = main_window(&app)?;
    if visible {
        window::show_window(&window)
    } else {
        window::hide_window(&window)
    }
    .map_err(|err| err.to_string())
}

#[tauri::command]
pub fn window_dock(
    app: AppHandle,
    state: State<AppState>,
    position: Option<DockPosition>,
) -> Result<(), String> {
    let window = main_window(&app)?;
    match position {
        Some(position) => {
            window::apply_dock(&window, &state, position).map_err(|err| err.to_string())
        }
        None => window::undock(&window, &state).map_err(|err| err.to_string()),
    }
}

#[tauri::command]
pub fn window_is_maximized(app: AppHandle) -> Result<bool, String> {
    let window = main_window(&app)?;
    window.is_maximized().map_err(|err| err.to_string())
}

#[tauri::command]
pub fn window_maximize(app: AppHandle) -> Result<(), String> {
    let window = main_window(&app)?;
    window.maximize().map_err(|err| err.to_string())
}

#[tauri::command]
pub fn window_unmaximize(app: AppHandle) -> Result<(), String> {
    let window = main_window(&app)?;
    window.unmaximize().map_err(|err| err.to_string())
}

#[tauri::command]
pub fn window_toggle_maximize(app: AppHandle, _state: State<AppState>) -> Result<(), String> {
    let window = main_window(&app)?;

    // Use standard maximize/unmaximize (respects taskbar)
    let is_maximized = window.is_maximized().map_err(|e| e.to_string())?;

    if is_maximized {
        window.unmaximize().map_err(|e| e.to_string())?;
    } else {
        window.maximize().map_err(|e| e.to_string())?;
    }

    // State will be updated via resize event handler
    Ok(())
}

#[tauri::command]
pub fn window_set_fullscreen(
    app: AppHandle,
    state: State<AppState>,
    fullscreen: bool,
) -> Result<(), String> {
    let window = main_window(&app)?;
    window
        .set_fullscreen(fullscreen)
        .map_err(|e| e.to_string())?;

    state
        .update(|s| {
            s.fullscreen = fullscreen;
            true
        })
        .map_err(|e| e.to_string())?;

    Ok(())
}

#[tauri::command]
pub fn window_is_fullscreen(app: AppHandle) -> Result<bool, String> {
    let window = main_window(&app)?;
    window.is_fullscreen().map_err(|e| e.to_string())
}
