//! Pending user message queue — allows users to queue messages while AI is processing.

use chrono::Utc;
use tauri::Emitter;
use tracing::info;

use super::state::{MAX_PENDING_MESSAGE_CHARS, PENDING_MESSAGES};

// ============================================================================
// Types
// ============================================================================

#[derive(Debug, Clone, serde::Serialize, serde::Deserialize)]
pub struct PendingUserMessage {
    pub id: String,
    pub content: String,
    pub timestamp: chrono::DateTime<Utc>,
    pub conversation_id: Option<i64>,
}

#[derive(Debug, Clone, serde::Serialize, serde::Deserialize)]
pub struct AddPendingMessageRequest {
    pub content: String,
    #[serde(default, alias = "conversationId")]
    pub conversation_id: Option<i64>,
}

#[derive(Debug, Clone, serde::Serialize, serde::Deserialize)]
pub struct PopPendingMessageRequest {
    #[serde(default, alias = "conversationId")]
    pub conversation_id: Option<i64>,
    #[serde(default, alias = "pendingMessageId")]
    pub pending_message_id: Option<String>,
}

// ============================================================================
// Tauri command handlers
// ============================================================================

#[tauri::command]
pub async fn chat_add_pending_message(
    app_handle: tauri::AppHandle,
    request: AddPendingMessageRequest,
) -> Result<PendingUserMessage, String> {
    let trimmed_content = request.content.trim();
    if trimmed_content.is_empty() {
        return Err("Pending message content cannot be empty".to_string());
    }
    if trimmed_content.len() > MAX_PENDING_MESSAGE_CHARS {
        return Err(format!(
            "Pending message content cannot exceed {} characters",
            MAX_PENDING_MESSAGE_CHARS
        ));
    }

    let pending_msg = PendingUserMessage {
        id: uuid::Uuid::new_v4().to_string(),
        content: trimmed_content.to_string(),
        timestamp: Utc::now(),
        conversation_id: request.conversation_id,
    };

    {
        const MAX_PENDING_QUEUE_SIZE: usize = 20;
        let mut queue = PENDING_MESSAGES
            .lock()
            .map_err(|e| format!("Failed to lock pending messages queue: {e}"))?;
        if queue.len() >= MAX_PENDING_QUEUE_SIZE {
            return Err(format!(
                "Pending message queue is full (max {MAX_PENDING_QUEUE_SIZE} messages). Please wait for the agent to process current messages."
            ));
        }
        queue.push(pending_msg.clone());
        info!(
            "[Chat] Added pending message (queue size: {}): {}...",
            queue.len(),
            &trimmed_content.chars().take(50).collect::<String>()
        );
    }

    // Emit event to notify frontend
    let _ = app_handle.emit("chat:pending-message-added", &pending_msg);

    Ok(pending_msg)
}

#[tauri::command]
pub async fn chat_get_pending_messages() -> Result<Vec<PendingUserMessage>, String> {
    let queue = PENDING_MESSAGES
        .lock()
        .map_err(|e| format!("Failed to lock pending messages queue: {e}"))?;
    Ok(queue.clone())
}

#[tauri::command]
pub async fn chat_clear_pending_messages(app_handle: tauri::AppHandle) -> Result<(), String> {
    let mut queue = PENDING_MESSAGES
        .lock()
        .map_err(|e| format!("Failed to lock pending messages queue: {e}"))?;
    let count = queue.len();
    queue.clear();
    info!("[Chat] Cleared {} pending messages", count);

    // Emit event to notify frontend
    let _ = app_handle.emit(
        "chat:pending-messages-cleared",
        serde_json::json!({ "count": count }),
    );

    Ok(())
}

#[tauri::command]
pub async fn chat_pop_pending_message(
    app_handle: tauri::AppHandle,
    request: PopPendingMessageRequest,
) -> Result<Option<PendingUserMessage>, String> {
    let mut queue = PENDING_MESSAGES
        .lock()
        .map_err(|e| format!("Failed to lock pending messages queue: {e}"))?;

    if queue.is_empty() {
        return Ok(None);
    }

    // Pop by explicit pending message ID when available to avoid FIFO mismatches.
    let msg = if let Some(pending_message_id) = request.pending_message_id.as_deref() {
        let idx = queue.iter().position(|m| {
            m.id == pending_message_id
                && request
                    .conversation_id
                    .map(|cid| m.conversation_id == Some(cid))
                    .unwrap_or(true)
        });
        if let Some(idx) = idx {
            queue.remove(idx)
        } else {
            return Ok(None);
        }
    } else if let Some(conversation_id) = request.conversation_id {
        // AUDIT-STREAM-062 fix: Pop message for specific conversation if provided.
        let idx = queue
            .iter()
            .position(|m| m.conversation_id == Some(conversation_id));
        if let Some(idx) = idx {
            queue.remove(idx)
        } else {
            return Ok(None);
        }
    } else {
        // Fallback to global queue behavior for backward compatibility
        queue.remove(0)
    };

    info!(
        "[Chat] Popped pending message (remaining: {}): {}...",
        queue.len(),
        &msg.content.chars().take(50).collect::<String>()
    );

    // Emit event to notify frontend
    let _ = app_handle.emit(
        "chat:pending-message-consumed",
        serde_json::json!({
            "message": msg,
            "remaining": queue.len()
        }),
    );

    Ok(Some(msg))
}

// ============================================================================
// Utility functions (used internally by streaming / agentic loop)
// ============================================================================

/// Check if there are pending messages (used by tool executor)
pub fn has_pending_messages() -> bool {
    PENDING_MESSAGES
        .lock()
        .map(|q| !q.is_empty())
        .unwrap_or(false)
}

// AUDIT-STREAM-062 fix: Check pending messages for a specific conversation
pub fn has_pending_messages_for_conversation(conversation_id: i64) -> bool {
    PENDING_MESSAGES
        .lock()
        .map(|q| q.iter().any(|m| m.conversation_id == Some(conversation_id)))
        .unwrap_or(false)
}

/// Get pending messages count
pub fn pending_messages_count() -> usize {
    PENDING_MESSAGES.lock().map(|q| q.len()).unwrap_or(0)
}

/// Peek at pending messages without removing them
pub fn peek_pending_messages() -> Vec<PendingUserMessage> {
    PENDING_MESSAGES
        .lock()
        .map(|q| q.clone())
        .unwrap_or_default()
}

// AUDIT-STREAM-062 fix: Peek at pending messages for a specific conversation
pub fn peek_pending_messages_for_conversation(conversation_id: i64) -> Vec<PendingUserMessage> {
    PENDING_MESSAGES
        .lock()
        .map(|q| {
            q.iter()
                .filter(|m| m.conversation_id == Some(conversation_id))
                .cloned()
                .collect()
        })
        .unwrap_or_default()
}

/// Pop the first pending message for a specific conversation (used by agentic loop).
pub fn pop_pending_message_for_conversation(conversation_id: i64) -> Option<PendingUserMessage> {
    PENDING_MESSAGES.lock().ok().and_then(|mut q| {
        let idx = q
            .iter()
            .position(|m| m.conversation_id == Some(conversation_id))?;
        Some(q.remove(idx))
    })
}
