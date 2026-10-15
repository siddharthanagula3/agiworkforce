use rusqlite::{params, Connection, OptionalExtension};
use serde::Deserialize;
use tauri::{Manager, State};

use crate::data::db::repository;
use crate::sys::commands::chat::state::AppDatabase;

const CUSTOM_INSTRUCTIONS_FILE: &str = "custom_instructions.json";

/// Longest per-chat instruction text that is stored, matching the Settings
/// limit for global instructions.
const MAX_CONVERSATION_INSTRUCTIONS_CHARS: usize = 10_000;

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

    let path = app_data_dir.join(CUSTOM_INSTRUCTIONS_FILE);

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

    let path = app_data_dir.join(CUSTOM_INSTRUCTIONS_FILE);

    if !path.exists() {
        return Ok(String::new());
    }

    let contents = tokio::fs::read_to_string(&path)
        .await
        .map_err(|e| format!("Failed to read custom instructions: {}", e))?;

    tracing::info!("Custom instructions loaded from {:?}", path);
    Ok(contents)
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct SavedCustomInstructions {
    #[serde(default)]
    global_instructions: String,
    #[serde(default = "enabled_by_default")]
    global_instructions_enabled: bool,
}

fn enabled_by_default() -> bool {
    true
}

/// The instructions for all conversations as the Settings screen saved them,
/// or `None` when they are empty or switched off.
fn parse_global_instructions(contents: &str) -> Option<String> {
    let saved: SavedCustomInstructions = serde_json::from_str(contents).ok()?;
    if !saved.global_instructions_enabled {
        return None;
    }
    let text = saved.global_instructions.trim();
    (!text.is_empty()).then(|| text.to_string())
}

/// Read the saved instructions for all conversations for the chat prompt.
pub fn load_global_instructions(app_handle: &tauri::AppHandle) -> Option<String> {
    let path = app_handle
        .path()
        .app_data_dir()
        .ok()?
        .join(CUSTOM_INSTRUCTIONS_FILE);
    let contents = std::fs::read_to_string(path).ok()?;
    parse_global_instructions(&contents)
}

/// The instructions saved for one conversation, for the chat prompt.
pub fn load_conversation_instructions(conn: &Connection, conversation_id: i64) -> Option<String> {
    conn.query_row(
        "SELECT instructions FROM conversation_instructions WHERE conversation_id = ?1",
        params![conversation_id],
        |row| row.get::<_, String>(0),
    )
    .optional()
    .ok()
    .flatten()
    .filter(|text| !text.trim().is_empty())
}

fn store_conversation_instructions(
    conn: &Connection,
    conversation_id: i64,
    instructions: &str,
) -> rusqlite::Result<()> {
    let instructions: String = instructions
        .trim()
        .chars()
        .take(MAX_CONVERSATION_INSTRUCTIONS_CHARS)
        .collect();
    if instructions.is_empty() {
        conn.execute(
            "DELETE FROM conversation_instructions WHERE conversation_id = ?1",
            params![conversation_id],
        )?;
    } else {
        conn.execute(
            "INSERT INTO conversation_instructions (conversation_id, instructions, updated_at)
             VALUES (?1, ?2, ?3)
             ON CONFLICT(conversation_id) DO UPDATE SET
                 instructions = excluded.instructions,
                 updated_at = excluded.updated_at",
            params![
                conversation_id,
                instructions,
                chrono::Utc::now().to_rfc3339()
            ],
        )?;
    }
    Ok(())
}

/// Read the instructions the user set for one local conversation.
#[tauri::command]
pub async fn chat_get_conversation_instructions(
    conversation_id: i64,
    user_id: String,
    db: State<'_, AppDatabase>,
) -> Result<String, String> {
    let conn = db.connection()?;
    repository::get_conversation(&conn, conversation_id, &user_id)
        .map_err(|e| format!("Access denied or conversation not found: {e}"))?;
    Ok(load_conversation_instructions(&conn, conversation_id).unwrap_or_default())
}

/// Save, or clear with empty text, the instructions for one local
/// conversation. They are deleted with the conversation.
#[tauri::command]
pub async fn chat_set_conversation_instructions(
    conversation_id: i64,
    user_id: String,
    instructions: String,
    db: State<'_, AppDatabase>,
) -> Result<(), String> {
    let conn = db.connection()?;
    repository::get_conversation(&conn, conversation_id, &user_id)
        .map_err(|e| format!("Access denied or conversation not found: {e}"))?;
    store_conversation_instructions(&conn, conversation_id, &instructions)
        .map_err(|e| format!("Failed to save conversation instructions: {e}"))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn global_instructions_follow_the_switch() {
        assert_eq!(
            parse_global_instructions(
                r#"{"globalInstructions":"  Use metric units. ","globalInstructionsEnabled":true}"#
            )
            .as_deref(),
            Some("Use metric units.")
        );
        assert_eq!(
            parse_global_instructions(
                r#"{"globalInstructions":"Use metric units.","globalInstructionsEnabled":false}"#
            ),
            None
        );
        assert_eq!(
            parse_global_instructions(r#"{"globalInstructions":"Keep it short."}"#).as_deref(),
            Some("Keep it short.")
        );
        assert_eq!(
            parse_global_instructions(r#"{"globalInstructions":"   "}"#),
            None
        );
        assert_eq!(parse_global_instructions("not json"), None);
    }

    #[test]
    fn conversation_instructions_round_trip_clear_and_cascade() {
        let conn = Connection::open_in_memory().unwrap();
        conn.execute_batch(
            "PRAGMA foreign_keys = ON;
             CREATE TABLE conversations (id INTEGER PRIMARY KEY AUTOINCREMENT, title TEXT);
             CREATE TABLE conversation_instructions (
                conversation_id INTEGER PRIMARY KEY
                    REFERENCES conversations(id) ON DELETE CASCADE,
                instructions TEXT NOT NULL,
                updated_at TEXT NOT NULL
             );
             INSERT INTO conversations (title) VALUES ('chat');",
        )
        .unwrap();

        assert_eq!(load_conversation_instructions(&conn, 1), None);
        store_conversation_instructions(&conn, 1, "  Be brief.  ").unwrap();
        assert_eq!(
            load_conversation_instructions(&conn, 1).as_deref(),
            Some("Be brief.")
        );

        store_conversation_instructions(&conn, 1, "   ").unwrap();
        assert_eq!(load_conversation_instructions(&conn, 1), None);

        store_conversation_instructions(&conn, 1, "Be brief.").unwrap();
        conn.execute("DELETE FROM conversations WHERE id = 1", [])
            .unwrap();
        let remaining: i64 = conn
            .query_row(
                "SELECT COUNT(*) FROM conversation_instructions",
                [],
                |row| row.get(0),
            )
            .unwrap();
        assert_eq!(remaining, 0);
    }
}
