use tauri::State;

use crate::sys::commands::AppDatabase;

#[tauri::command]
pub async fn get_user_preference(
    db: State<'_, AppDatabase>,
    key: String,
) -> Result<Option<serde_json::Value>, String> {
    use serde_json::json;

    let conn = db.connection()?;

    let result = conn.query_row(
        "SELECT value, data_type FROM user_preferences WHERE key = ?1",
        [&key],
        |row| Ok((row.get::<_, String>(0)?, row.get::<_, String>(1)?)),
    );

    match result {
        Ok((value, data_type)) => {
            let parsed_value = match data_type.as_str() {
                "boolean" => json!({ "value": value, "type": "boolean" }),
                "number" => json!({ "value": value, "type": "number" }),
                "json" => json!({ "value": value, "type": "json" }),
                _ => json!({ "value": value, "type": "string" }),
            };
            Ok(Some(parsed_value))
        }
        Err(rusqlite::Error::QueryReturnedNoRows) => Ok(None),
        Err(e) => Err(format!("Failed to get user preference: {}", e)),
    }
}

#[tauri::command]
pub async fn set_user_preference(
    db: State<'_, AppDatabase>,
    key: String,
    value: String,
    category: String,
    data_type: String,
    description: Option<String>,
) -> Result<(), String> {
    let conn = db.connection()?;

    let now = chrono::Utc::now().timestamp();

    conn.execute(
        "INSERT INTO user_preferences (key, value, category, data_type, description, created_at, updated_at)
         VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?6)
         ON CONFLICT(key) DO UPDATE SET
           value = excluded.value,
           category = excluded.category,
           data_type = excluded.data_type,
           description = COALESCE(excluded.description, description),
           updated_at = excluded.updated_at",
        rusqlite::params![key, value, category, data_type, description, now.to_string()],
    )
    .map_err(|e| format!("Failed to set user preference: {}", e))?;

    Ok(())
}
