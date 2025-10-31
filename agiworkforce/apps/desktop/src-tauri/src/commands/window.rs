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
