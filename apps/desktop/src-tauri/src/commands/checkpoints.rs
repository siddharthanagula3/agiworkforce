/**
 * Conversation Checkpoints
 *
 * Provides safe AI editing with Git-like checkpoint system.
 * Users can create snapshots of conversation state and restore to any point.
 */

use chrono::Utc;
use rusqlite::{params, Connection};
use serde::{Deserialize, Serialize};
use uuid::Uuid;

use crate::db::get_connection;

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct Checkpoint {
    pub id: String,
    pub conversation_id: i64,
    pub checkpoint_name: String,
    pub description: Option<String>,
    pub message_count: usize,
    pub messages_snapshot: String, // JSON
    pub context_snapshot: Option<String>, // JSON
    pub metadata: Option<String>, // JSON
    pub parent_checkpoint_id: Option<String>,
    pub branch_name: Option<String>,
    pub created_at: i64,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct CreateCheckpointRequest {
    pub conversation_id: i64,
    pub checkpoint_name: String,
    pub description: Option<String>,
    pub parent_checkpoint_id: Option<String>,
    pub branch_name: Option<String>,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct RestoreCheckpointRequest {
    pub checkpoint_id: String,
    pub conversation_id: i64,
}

/// Create a checkpoint for a conversation
#[tauri::command]
pub async fn checkpoint_create(request: CreateCheckpointRequest) -> Result<Checkpoint, String> {
    let conn = get_connection().map_err(|e| format!("Failed to get connection: {}", e))?;

    // Get all messages for this conversation
    let messages = get_conversation_messages(&conn, request.conversation_id)
        .map_err(|e| format!("Failed to get messages: {}", e))?;

    let message_count = messages.len();
    let messages_snapshot =
        serde_json::to_string(&messages).map_err(|e| format!("Failed to serialize messages: {}", e))?;

    // Create checkpoint
    let checkpoint_id = Uuid::new_v4().to_string();
    let created_at = Utc::now().timestamp_millis();

    conn.execute(
        "INSERT INTO conversation_checkpoints (
            id, conversation_id, checkpoint_name, description,
            message_count, messages_snapshot, context_snapshot,
            metadata, parent_checkpoint_id, branch_name, created_at
        ) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11)",
        params![
            checkpoint_id,
            request.conversation_id,
            request.checkpoint_name,
            request.description,
            message_count,
            messages_snapshot,
            None::<String>, // context_snapshot
            None::<String>, // metadata
            request.parent_checkpoint_id,
            request.branch_name,
            created_at,
        ],
    )
    .map_err(|e| format!("Failed to create checkpoint: {}", e))?;

    // Return created checkpoint
    Ok(Checkpoint {
        id: checkpoint_id,
        conversation_id: request.conversation_id,
        checkpoint_name: request.checkpoint_name,
        description: request.description,
        message_count,
        messages_snapshot,
        context_snapshot: None,
        metadata: None,
        parent_checkpoint_id: request.parent_checkpoint_id,
        branch_name: request.branch_name,
        created_at,
    })
}

/// Restore a conversation to a checkpoint
#[tauri::command]
pub async fn checkpoint_restore(request: RestoreCheckpointRequest) -> Result<(), String> {
    let conn = get_connection().map_err(|e| format!("Failed to get connection: {}", e))?;

    // Get checkpoint
    let checkpoint = get_checkpoint(&conn, &request.checkpoint_id)
        .map_err(|e| format!("Failed to get checkpoint: {}", e))?;

    if checkpoint.conversation_id != request.conversation_id {
        return Err("Checkpoint does not belong to this conversation".to_string());
    }

    // Parse messages snapshot
    let messages: Vec<serde_json::Value> = serde_json::from_str(&checkpoint.messages_snapshot)
        .map_err(|e| format!("Failed to parse messages snapshot: {}", e))?;

    // Begin transaction
    conn.execute("BEGIN TRANSACTION", [])
        .map_err(|e| format!("Failed to begin transaction: {}", e))?;

    // Delete all messages for this conversation
    conn.execute(
        "DELETE FROM messages WHERE conversation_id = ?1",
        params![request.conversation_id],
    )
    .map_err(|e| {
        let _ = conn.execute("ROLLBACK", []);
        format!("Failed to delete messages: {}", e)
    })?;

    // Restore messages from snapshot
    for msg in messages {
        conn.execute(
            "INSERT INTO messages (
                id, conversation_id, role, content, provider, model, tokens, cost,
                context_items, images, tool_calls, created_at
            ) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12)",
            params![
                msg.get("id"),
                request.conversation_id,
                msg.get("role"),
                msg.get("content"),
                msg.get("provider"),
                msg.get("model"),
                msg.get("tokens"),
                msg.get("cost"),
                msg.get("context_items").and_then(|v| v.as_str()),
                msg.get("images").and_then(|v| v.as_str()),
                msg.get("tool_calls").and_then(|v| v.as_str()),
                msg.get("created_at"),
            ],
        )
        .map_err(|e| {
            let _ = conn.execute("ROLLBACK", []);
            format!("Failed to restore message: {}", e)
        })?;
    }

    // Record restore in history
    let restore_id = Uuid::new_v4().to_string();
    let restored_at = Utc::now().timestamp_millis();
    conn.execute(
        "INSERT INTO checkpoint_restore_history (
            id, checkpoint_id, conversation_id, restored_at,
            restored_message_count, success
        ) VALUES (?1, ?2, ?3, ?4, ?5, 1)",
        params![
            restore_id,
            request.checkpoint_id,
            request.conversation_id,
            restored_at,
            checkpoint.message_count,
        ],
    )
    .map_err(|e| {
        let _ = conn.execute("ROLLBACK", []);
        format!("Failed to record restore history: {}", e)
    })?;

    // Commit transaction
    conn.execute("COMMIT", [])
        .map_err(|e| format!("Failed to commit transaction: {}", e))?;

    Ok(())
}

/// List all checkpoints for a conversation
#[tauri::command]
pub async fn checkpoint_list(conversation_id: i64) -> Result<Vec<Checkpoint>, String> {
    let conn = get_connection().map_err(|e| format!("Failed to get connection: {}", e))?;

    let mut stmt = conn
        .prepare(
            "SELECT id, conversation_id, checkpoint_name, description,
             message_count, messages_snapshot, context_snapshot, metadata,
             parent_checkpoint_id, branch_name, created_at
             FROM conversation_checkpoints
             WHERE conversation_id = ?1
             ORDER BY created_at DESC",
        )
        .map_err(|e| format!("Failed to prepare statement: {}", e))?;

    let checkpoints = stmt
        .query_map(params![conversation_id], |row| {
            Ok(Checkpoint {
                id: row.get(0)?,
                conversation_id: row.get(1)?,
                checkpoint_name: row.get(2)?,
                description: row.get(3)?,
                message_count: row.get(4)?,
                messages_snapshot: row.get(5)?,
                context_snapshot: row.get(6)?,
                metadata: row.get(7)?,
                parent_checkpoint_id: row.get(8)?,
                branch_name: row.get(9)?,
                created_at: row.get(10)?,
            })
        })
        .map_err(|e| format!("Failed to query checkpoints: {}", e))?
        .collect::<Result<Vec<_>, _>>()
        .map_err(|e| format!("Failed to collect checkpoints: {}", e))?;

    Ok(checkpoints)
}

/// Delete a checkpoint
#[tauri::command]
pub async fn checkpoint_delete(checkpoint_id: String) -> Result<(), String> {
    let conn = get_connection().map_err(|e| format!("Failed to get connection: {}", e))?;

    conn.execute(
        "DELETE FROM conversation_checkpoints WHERE id = ?1",
        params![checkpoint_id],
    )
    .map_err(|e| format!("Failed to delete checkpoint: {}", e))?;

    Ok(())
}

/// Helper: Get all messages for a conversation
fn get_conversation_messages(
    conn: &Connection,
    conversation_id: i64,
) -> Result<Vec<serde_json::Value>, rusqlite::Error> {
    let mut stmt = conn.prepare(
        "SELECT id, conversation_id, role, content, provider, model,
         tokens, cost, context_items, images, tool_calls, created_at
         FROM messages
         WHERE conversation_id = ?1
         ORDER BY created_at ASC",
    )?;

    let messages = stmt
        .query_map(params![conversation_id], |row| {
            Ok(serde_json::json!({
                "id": row.get::<_, i64>(0)?,
                "conversation_id": row.get::<_, i64>(1)?,
                "role": row.get::<_, String>(2)?,
                "content": row.get::<_, String>(3)?,
                "provider": row.get::<_, Option<String>>(4)?,
                "model": row.get::<_, Option<String>>(5)?,
                "tokens": row.get::<_, Option<i64>>(6)?,
                "cost": row.get::<_, Option<f64>>(7)?,
                "context_items": row.get::<_, Option<String>>(8)?,
                "images": row.get::<_, Option<String>>(9)?,
                "tool_calls": row.get::<_, Option<String>>(10)?,
                "created_at": row.get::<_, String>(11)?,
            }))
        })?
        .collect::<Result<Vec<_>, _>>()?;

    Ok(messages)
}

/// Helper: Get a single checkpoint
fn get_checkpoint(conn: &Connection, checkpoint_id: &str) -> Result<Checkpoint, rusqlite::Error> {
    conn.query_row(
        "SELECT id, conversation_id, checkpoint_name, description,
         message_count, messages_snapshot, context_snapshot, metadata,
         parent_checkpoint_id, branch_name, created_at
         FROM conversation_checkpoints
         WHERE id = ?1",
        params![checkpoint_id],
        |row| {
            Ok(Checkpoint {
                id: row.get(0)?,
                conversation_id: row.get(1)?,
                checkpoint_name: row.get(2)?,
                description: row.get(3)?,
                message_count: row.get(4)?,
                messages_snapshot: row.get(5)?,
                context_snapshot: row.get(6)?,
                metadata: row.get(7)?,
                parent_checkpoint_id: row.get(8)?,
                branch_name: row.get(9)?,
                created_at: row.get(10)?,
            })
        },
    )
}
