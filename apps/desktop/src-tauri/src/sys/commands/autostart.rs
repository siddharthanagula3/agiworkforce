use tauri::AppHandle;
use tauri_plugin_autostart::ManagerExt;

#[tauri::command]
pub async fn autostart_get_enabled(app: AppHandle) -> Result<bool, String> {
    app.autolaunch()
        .is_enabled()
        .map_err(|error| format!("Failed to read launch-at-login state: {error}"))
}

#[tauri::command]
pub async fn autostart_set_enabled(enabled: bool, app: AppHandle) -> Result<(), String> {
    let manager = app.autolaunch();
    let result = if enabled {
        manager.enable()
    } else {
        manager.disable()
    };
    result.map_err(|error| format!("Failed to update launch-at-login setting: {error}"))
}
