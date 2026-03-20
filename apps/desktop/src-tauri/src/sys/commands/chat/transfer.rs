//! Transfer commands — move conversations between local SQLite and cloud Supabase.
//!
//! `transfer_local_to_cloud` reads a conversation + its messages from SQLite,
//! creates them in Supabase via the cloud CRUD commands, then optionally deletes
//! the local source rows.
//!
//! `transfer_cloud_to_local` reads from Supabase, creates in SQLite via
//! repository functions, then optionally deletes the cloud source rows.

use serde::{Deserialize, Serialize};
use tauri::State;
use tracing::debug;

use crate::data::db::models::{Message, MessageRole};
use crate::data::db::repository;

use super::cloud::{
    cloud_create_conversation, cloud_create_message, cloud_delete_conversation, cloud_get_messages,
    CloudMessage,
};
use super::state::AppDatabase;

// ---------------------------------------------------------------------------
// Return type
// ---------------------------------------------------------------------------

/// Result from a transfer operation returned to the frontend.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct TransferResult {
    /// The conversation identifier in the *destination* system.
    /// For local→cloud this is the Supabase UUID string.
    /// For cloud→local this is the SQLite i64 as a string.
    pub conversation_id: String,
    /// Number of messages successfully written to the destination.
    pub messages_transferred: usize,
    /// "local_to_cloud" or "cloud_to_local"
    pub direction: String,
}

// ---------------------------------------------------------------------------
// local → cloud
// ---------------------------------------------------------------------------

/// Transfer a local SQLite conversation and its messages to Supabase cloud.
///
/// Parameters:
/// - `local_conversation_id` — the SQLite primary key (i64)
/// - `user_id` — the local user ID to authorize the SQLite read
/// - `delete_local` — if true, delete the local conversation after transfer
#[tauri::command]
pub async fn transfer_local_to_cloud(
    db: State<'_, AppDatabase>,
    local_conversation_id: i64,
    user_id: String,
    delete_local: Option<bool>,
) -> Result<TransferResult, String> {
    if local_conversation_id <= 0 {
        return Err(format!(
            "Invalid local_conversation_id: {}. Must be positive",
            local_conversation_id
        ));
    }
    if user_id.is_empty() {
        return Err("user_id cannot be empty".to_string());
    }

    // 1. Read local conversation + messages (scope the lock to this block)
    let (conversation, messages) = {
        let conn = db.connection()?;
        let conv = repository::get_conversation(&conn, local_conversation_id, &user_id)
            .map_err(|e| format!("Local conversation {local_conversation_id} not found: {e}"))?;
        let msgs = repository::list_messages(&conn, local_conversation_id)
            .map_err(|e| format!("Failed to list messages for conversation {local_conversation_id}: {e}"))?;
        (conv, msgs)
    };

    debug!(
        "Transferring local conversation {} ({} messages) to cloud",
        local_conversation_id,
        messages.len()
    );

    // 2. Create the conversation in cloud
    let cloud_conv = cloud_create_conversation(
        Some(conversation.title.clone()),
        None,
        None,
        Some("desktop".to_string()),
    )
    .await?;

    let cloud_conv_id = cloud_conv.id.clone();

    // 3. Create each message in cloud
    let mut transferred = 0usize;
    for msg in &messages {
        let role_str = msg.role.as_str().to_string();
        match cloud_create_message(
            cloud_conv_id.clone(),
            role_str,
            msg.content.clone(),
            msg.model.clone(),
            msg.provider.clone(),
            msg.tokens,
            msg.cost,
        )
        .await
        {
            Ok(_) => transferred += 1,
            Err(e) => {
                tracing::warn!(
                    "transfer_local_to_cloud: message {} failed: {}",
                    msg.id,
                    e
                );
            }
        }
    }

    // 4. Optionally delete local source
    if delete_local.unwrap_or(false) {
        let conn = db.connection()?;
        repository::delete_conversation(&conn, local_conversation_id, &user_id)
            .map_err(|e| format!("Failed to delete local conversation {local_conversation_id}: {e}"))?;
        debug!("Deleted local conversation {local_conversation_id} after transfer");
    }

    Ok(TransferResult {
        conversation_id: cloud_conv_id,
        messages_transferred: transferred,
        direction: "local_to_cloud".to_string(),
    })
}

// ---------------------------------------------------------------------------
// cloud → local
// ---------------------------------------------------------------------------

/// Transfer a cloud Supabase conversation and its messages to local SQLite.
///
/// Parameters:
/// - `cloud_conversation_id` — the Supabase UUID string
/// - `user_id` — the local user ID to use for the SQLite insert
/// - `delete_cloud` — if true, delete the cloud conversation after transfer
#[tauri::command]
pub async fn transfer_cloud_to_local(
    db: State<'_, AppDatabase>,
    cloud_conversation_id: String,
    user_id: String,
    delete_cloud: Option<bool>,
) -> Result<TransferResult, String> {
    if cloud_conversation_id.is_empty() {
        return Err("cloud_conversation_id cannot be empty".to_string());
    }
    if user_id.is_empty() {
        return Err("user_id cannot be empty".to_string());
    }

    // 1. Fetch cloud messages
    let cloud_messages: Vec<CloudMessage> =
        cloud_get_messages(cloud_conversation_id.clone()).await?;

    // Fetch the title from the first available conversation listing or use a fallback.
    // We don't have a single-row GET by ID command, so derive the title from metadata
    // if present, or fall back to the cloud_conversation_id.
    let title = derive_title_from_messages(&cloud_messages)
        .unwrap_or_else(|| cloud_conversation_id.clone());

    debug!(
        "Transferring cloud conversation {} ({} messages) to local",
        cloud_conversation_id,
        cloud_messages.len()
    );

    // 2. Create local conversation (scope the lock)
    let local_conv_id = {
        let conn = db.connection()?;
        repository::create_conversation(&conn, title, user_id.clone())
            .map_err(|e| format!("Failed to create local conversation: {e}"))?
    };

    // 3. Insert each message into SQLite
    let mut transferred = 0usize;
    for cloud_msg in &cloud_messages {
        let role = MessageRole::from_str(&cloud_msg.role).unwrap_or(MessageRole::User);
        let msg = Message {
            id: 0,
            conversation_id: local_conv_id,
            user_id: user_id.clone(),
            role,
            content: cloud_msg.content.clone(),
            tokens: cloud_msg.token_count,
            cost: cloud_msg.cost,
            provider: cloud_msg.provider.clone(),
            model: cloud_msg.model.clone(),
            created_at: parse_cloud_timestamp(&cloud_msg.created_at),
            parent_message_id: None,
            branch_id: Some("main".to_string()),
        };

        let conn = db.connection()?;
        match repository::create_message(&conn, &msg) {
            Ok(_) => transferred += 1,
            Err(e) => {
                tracing::warn!(
                    "transfer_cloud_to_local: cloud message {} failed: {}",
                    cloud_msg.id,
                    e
                );
            }
        }
    }

    // 4. Optionally delete cloud source
    if delete_cloud.unwrap_or(false) {
        cloud_delete_conversation(cloud_conversation_id.clone()).await?;
        debug!("Deleted cloud conversation {cloud_conversation_id} after transfer");
    }

    Ok(TransferResult {
        conversation_id: local_conv_id.to_string(),
        messages_transferred: transferred,
        direction: "cloud_to_local".to_string(),
    })
}

// ---------------------------------------------------------------------------
// Private helpers
// ---------------------------------------------------------------------------

/// Try to derive a meaningful title from cloud message metadata.
/// Returns None if no suitable title is found.
fn derive_title_from_messages(messages: &[CloudMessage]) -> Option<String> {
    // Look for a title in the first message's metadata
    for msg in messages.iter().take(3) {
        if let Some(meta) = &msg.metadata {
            if let Some(title) = meta.get("conversation_title").and_then(|v| v.as_str()) {
                if !title.is_empty() {
                    return Some(title.to_string());
                }
            }
        }
    }
    None
}

/// Parse a Supabase ISO 8601 timestamp string into a `DateTime<Utc>`.
/// Falls back to `Utc::now()` on parse failure.
fn parse_cloud_timestamp(ts: &str) -> chrono::DateTime<chrono::Utc> {
    ts.parse::<chrono::DateTime<chrono::Utc>>()
        .unwrap_or_else(|_| chrono::Utc::now())
}
