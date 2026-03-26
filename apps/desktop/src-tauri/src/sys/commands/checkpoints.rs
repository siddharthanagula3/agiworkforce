use chrono::Utc;
use rusqlite::{params, Connection};
use serde::{Deserialize, Serialize};
use tauri::State;
use uuid::Uuid;

use crate::sys::commands::AppDatabase;

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct Checkpoint {
    pub id: String,
    pub conversation_id: i64,
    pub checkpoint_name: String,
    pub description: Option<String>,
    pub message_count: usize,
    pub messages_snapshot: String,
    pub context_snapshot: Option<String>,
    pub metadata: Option<String>,
    pub parent_checkpoint_id: Option<String>,
    pub branch_name: Option<String>,
    pub created_at: i64,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct CreateCheckpointRequest {
    #[serde(alias = "conversationId")]
    pub conversation_id: i64,
    #[serde(alias = "checkpointName")]
    pub checkpoint_name: String,
    pub description: Option<String>,
    #[serde(default, alias = "parentCheckpointId")]
    pub parent_checkpoint_id: Option<String>,
    #[serde(default, alias = "branchName")]
    pub branch_name: Option<String>,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct RestoreCheckpointRequest {
    #[serde(alias = "checkpointId")]
    pub checkpoint_id: String,
    #[serde(alias = "conversationId")]
    pub conversation_id: i64,
}

#[tauri::command]
pub async fn checkpoint_create(
    request: CreateCheckpointRequest,
    db: State<'_, AppDatabase>,
) -> Result<Checkpoint, String> {
    let conn = db.connection()?;

    let messages = get_conversation_messages(&conn, request.conversation_id)
        .map_err(|e| format!("Failed to get messages: {}", e))?;

    let message_count = messages.len();
    let messages_snapshot = serde_json::to_string(&messages)
        .map_err(|e| format!("Failed to serialize messages: {}", e))?;

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
            message_count as i64,
            messages_snapshot,
            None::<String>,
            None::<String>,
            request.parent_checkpoint_id,
            request.branch_name,
            created_at,
        ],
    )
    .map_err(|e| format!("Failed to create checkpoint: {}", e))?;

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

#[tauri::command]
pub async fn checkpoint_restore(
    request: RestoreCheckpointRequest,
    db: State<'_, AppDatabase>,
) -> Result<(), String> {
    let mut conn = db.connection()?;
    restore_checkpoint_inner(&mut conn, &request)
}

fn restore_checkpoint_inner(
    conn: &mut Connection,
    request: &RestoreCheckpointRequest,
) -> Result<(), String> {
    let checkpoint = get_checkpoint(conn, &request.checkpoint_id)
        .map_err(|e| format!("Failed to get checkpoint: {}", e))?;

    if checkpoint.conversation_id != request.conversation_id {
        return Err("Checkpoint does not belong to this conversation".to_string());
    }

    let messages: Vec<serde_json::Value> = serde_json::from_str(&checkpoint.messages_snapshot)
        .map_err(|e| format!("Failed to parse messages snapshot: {}", e))?;

    let tx = conn
        .transaction()
        .map_err(|e| format!("Failed to begin transaction: {}", e))?;

    tx.execute(
        "DELETE FROM messages WHERE conversation_id = ?1",
        params![request.conversation_id],
    )
    .map_err(|e| format!("Failed to delete messages: {}", e))?;

    for msg in messages {
        tx.execute(
            "INSERT INTO messages (
                id, conversation_id, role, content, provider, model, tokens, cost,
                context_items, images, tool_calls, created_at
            ) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12)",
            params![
                msg.get("id").and_then(|v| v.as_i64()),
                request.conversation_id,
                msg.get("role").and_then(|v| v.as_str()),
                msg.get("content").and_then(|v| v.as_str()),
                msg.get("provider").and_then(|v| v.as_str()),
                msg.get("model").and_then(|v| v.as_str()),
                msg.get("tokens").and_then(|v| v.as_i64()),
                msg.get("cost").and_then(|v| v.as_f64()),
                msg.get("context_items").and_then(|v| v.as_str()),
                msg.get("images").and_then(|v| v.as_str()),
                msg.get("tool_calls").and_then(|v| v.as_str()),
                msg.get("created_at").and_then(|v| v.as_str()),
            ],
        )
        .map_err(|e| format!("Failed to restore message: {}", e))?;
    }

    let restore_id = Uuid::new_v4().to_string();
    let restored_at = Utc::now().timestamp_millis();
    tx.execute(
        "INSERT INTO checkpoint_restore_history (
            id, checkpoint_id, conversation_id, restored_at,
            restored_message_count, success
        ) VALUES (?1, ?2, ?3, ?4, ?5, 1)",
        params![
            restore_id,
            request.checkpoint_id,
            request.conversation_id,
            restored_at,
            checkpoint.message_count as i64,
        ],
    )
    .map_err(|e| format!("Failed to record restore history: {}", e))?;

    tx.commit()
        .map_err(|e| format!("Failed to commit transaction: {}", e))?;

    Ok(())
}

#[tauri::command]
pub async fn checkpoint_list(
    conversation_id: i64,
    db: State<'_, AppDatabase>,
) -> Result<Vec<Checkpoint>, String> {
    let conn = db.connection()?;

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
                message_count: row.get::<_, i64>(4)? as usize,
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

#[tauri::command]
pub async fn checkpoint_delete(
    checkpoint_id: String,
    db: State<'_, AppDatabase>,
) -> Result<(), String> {
    let conn = db.connection()?;

    conn.execute(
        "DELETE FROM conversation_checkpoints WHERE id = ?1",
        params![checkpoint_id],
    )
    .map_err(|e| format!("Failed to delete checkpoint: {}", e))?;

    Ok(())
}

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
                message_count: row.get::<_, i64>(4)? as usize,
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

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_restore_checkpoint_inner_replaces_messages_and_records_history() {
        let mut conn = Connection::open_in_memory().unwrap();
        crate::data::db::migrations::run_migrations(&conn).unwrap();

        conn.execute(
            "INSERT INTO conversations (id, title, created_at, updated_at) VALUES (?1, ?2, ?3, ?4)",
            params![
                1_i64,
                "Test",
                "2026-01-01T00:00:00Z",
                "2026-01-01T00:00:00Z"
            ],
        )
        .unwrap();

        conn.execute(
            "INSERT INTO messages (
                id, conversation_id, role, content, provider, model, tokens, cost,
                context_items, images, tool_calls, created_at
            ) VALUES (?1, ?2, ?3, ?4, NULL, NULL, NULL, NULL, NULL, NULL, NULL, ?5)",
            params![
                101_i64,
                1_i64,
                "user",
                "stale message",
                "2026-01-01T00:00:00Z"
            ],
        )
        .unwrap();

        let snapshot = serde_json::json!([
            {
                "id": 201,
                "conversation_id": 1,
                "role": "user",
                "content": "restored user",
                "provider": null,
                "model": null,
                "tokens": null,
                "cost": null,
                "context_items": null,
                "images": null,
                "tool_calls": null,
                "created_at": "2026-01-01T00:01:00Z"
            },
            {
                "id": 202,
                "conversation_id": 1,
                "role": "assistant",
                "content": "restored assistant",
                "provider": null,
                "model": null,
                "tokens": null,
                "cost": null,
                "context_items": null,
                "images": null,
                "tool_calls": null,
                "created_at": "2026-01-01T00:02:00Z"
            }
        ]);

        conn.execute(
            "INSERT INTO conversation_checkpoints (
                id, conversation_id, checkpoint_name, description, message_count, messages_snapshot,
                context_snapshot, metadata, parent_checkpoint_id, branch_name, created_at
            ) VALUES (?1, ?2, ?3, NULL, ?4, ?5, NULL, NULL, NULL, NULL, ?6)",
            params![
                "cp_1",
                1_i64,
                "Initial",
                2_i64,
                snapshot.to_string(),
                Utc::now().timestamp_millis()
            ],
        )
        .unwrap();

        restore_checkpoint_inner(
            &mut conn,
            &RestoreCheckpointRequest {
                checkpoint_id: "cp_1".to_string(),
                conversation_id: 1,
            },
        )
        .unwrap();

        let messages: Vec<(i64, String)> = {
            let mut stmt = conn
                .prepare(
                    "SELECT id, content FROM messages WHERE conversation_id = ?1 ORDER BY id ASC",
                )
                .unwrap();
            stmt.query_map(params![1_i64], |row| Ok((row.get(0)?, row.get(1)?)))
                .unwrap()
                .collect::<Result<Vec<_>, _>>()
                .unwrap()
        };

        assert_eq!(
            messages,
            vec![
                (201_i64, "restored user".to_string()),
                (202_i64, "restored assistant".to_string())
            ]
        );

        let restore_count: i64 = conn
            .query_row(
                "SELECT COUNT(*) FROM checkpoint_restore_history WHERE checkpoint_id = ?1",
                params!["cp_1"],
                |row| row.get(0),
            )
            .unwrap();
        assert_eq!(restore_count, 1);
    }
}
