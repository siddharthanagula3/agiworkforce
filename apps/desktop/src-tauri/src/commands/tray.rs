use tauri::AppHandle;

#[tauri::command]
pub fn tray_set_unread_badge(_app: AppHandle, count: u32) -> Result<(), String> {
    ::tracing::debug!(count, "[tray] placeholder unread badge update request");
    Ok(())
}
