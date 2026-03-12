use super::*;

#[tauri::command]
pub fn clear_local_database(db: State<'_, AppDatabase>) -> Result<(), String> {
    let conn = db.connection()?;
    conn.execute("DELETE FROM messages", [])
        .map_err(|e| e.to_string())?;
    conn.execute("DELETE FROM conversations", [])
        .map_err(|e| e.to_string())?;
    conn.execute("DELETE FROM automation_history", [])
        .map_err(|e| e.to_string())?;
    conn.execute("DELETE FROM command_history", [])
        .map_err(|e| e.to_string())?;
    conn.execute("DELETE FROM clipboard_history", [])
        .map_err(|e| e.to_string())?;
    conn.execute("DELETE FROM overlay_events", [])
        .map_err(|e| e.to_string())?;
    conn.execute("DELETE FROM settings", [])
        .map_err(|e| e.to_string())?;
    conn.execute("DELETE FROM settings_v2", [])
        .map_err(|e| e.to_string())?;

    if let Ok(mut queue) = PENDING_MESSAGES.lock() {
        queue.clear();
    }

    Ok(())
}
