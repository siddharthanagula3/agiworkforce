use tauri::Manager;

/// Save custom instructions to the app data directory.
/// Instructions are stored as a JSON string in a file.
#[tauri::command]
pub async fn save_custom_instructions(
    instructions: String,
    app_handle: tauri::AppHandle,
) -> Result<(), String> {
    let app_data_dir = app_handle
        .path()
        .app_data_dir()
        .map_err(|e| format!("Failed to get app data dir: {}", e))?;

    // Ensure the directory exists
    if !app_data_dir.exists() {
        tokio::fs::create_dir_all(&app_data_dir)
            .await
            .map_err(|e| format!("Failed to create app data dir: {}", e))?;
    }

    let path = app_data_dir.join("custom_instructions.json");

    tokio::fs::write(&path, instructions)
        .await
        .map_err(|e| format!("Failed to save custom instructions: {}", e))?;

    tracing::info!("Custom instructions saved to {:?}", path);
    Ok(())
}

/// Load custom instructions from the app data directory.
/// Returns the JSON string of instructions, or an empty string if not found.
#[tauri::command]
pub async fn load_custom_instructions(app_handle: tauri::AppHandle) -> Result<String, String> {
    let app_data_dir = app_handle
        .path()
        .app_data_dir()
        .map_err(|e| format!("Failed to get app data dir: {}", e))?;

    let path = app_data_dir.join("custom_instructions.json");

    if !path.exists() {
        return Ok(String::new());
    }

    let contents = tokio::fs::read_to_string(&path)
        .await
        .map_err(|e| format!("Failed to read custom instructions: {}", e))?;

    tracing::info!("Custom instructions loaded from {:?}", path);
    Ok(contents)
}
