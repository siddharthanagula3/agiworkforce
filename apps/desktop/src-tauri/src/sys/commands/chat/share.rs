//! Conversation sharing command — packages local messages for upload to the web app.

use crate::sys::commands::chat::AppDatabase;
use tauri::State;
use tracing::warn;
use uuid::Uuid;

/// Result returned to the frontend after packaging a conversation for sharing.
#[derive(Debug, Clone, serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ShareResult {
    /// Unique random token used as the share identifier and URL slug.
    pub token: String,
    /// JSON-serialised array of `{role, content, created_at}` objects.
    pub messages_json: String,
    /// The numeric conversation ID that was exported.
    pub conversation_id: String,
    /// Human-readable title of the conversation.
    pub title: String,
}

/// Package a conversation's messages so the frontend can upload them to the web API.
///
/// This command is intentionally read-only — it does NOT write to Supabase.
/// The frontend receives `messages_json` and `token`, then calls `POST /api/shared`
/// on the web app with those values.
///
/// # Parameters
/// - `conversation_id`: the conversation's string-encoded integer ID (must be a valid i64)
///
/// # Errors
/// Returns a human-readable error string if the conversation ID is invalid or the
/// database query fails.
#[tauri::command]
pub async fn conversation_share(
    conversation_id: String,
    db: State<'_, AppDatabase>,
) -> Result<ShareResult, String> {
    let conv_id: i64 = conversation_id
        .parse()
        .map_err(|_| format!("Invalid conversation ID: {conversation_id}"))?;

    let conn = db.connection()?;

    // Fetch the conversation title for display on the share page.
    let title: String = conn
        .query_row(
            "SELECT title FROM conversations WHERE id = ?1",
            rusqlite::params![conv_id],
            |row| row.get(0),
        )
        .unwrap_or_else(|e| {
            warn!("Could not fetch title for conversation {conv_id}: {e}");
            "Untitled Conversation".to_string()
        });

    // Fetch messages ordered chronologically. We include only role, content,
    // and created_at — no user_id or cost data is shared publicly.
    let mut stmt = conn
        .prepare(
            "SELECT role, content, created_at \
             FROM messages \
             WHERE conversation_id = ?1 \
             ORDER BY created_at ASC",
        )
        .map_err(|e| format!("Failed to prepare message query: {e}"))?;

    #[derive(serde::Serialize)]
    struct ExportedMessage {
        role: String,
        content: String,
        created_at: String,
    }

    let messages: Vec<ExportedMessage> = stmt
        .query_map(rusqlite::params![conv_id], |row| {
            Ok(ExportedMessage {
                role: row.get(0)?,
                content: row.get(1)?,
                created_at: row.get(2).unwrap_or_default(),
            })
        })
        .map_err(|e| format!("Failed to query messages: {e}"))?
        .collect::<Result<Vec<_>, _>>()
        .map_err(|e| format!("Failed to read message rows: {e}"))?;

    if messages.is_empty() {
        return Err("Cannot share an empty conversation".to_string());
    }

    let messages_json =
        serde_json::to_string(&messages).map_err(|e| format!("Failed to serialise messages: {e}"))?;

    let token = Uuid::new_v4().to_string();

    Ok(ShareResult {
        token,
        messages_json,
        conversation_id,
        title,
    })
}
