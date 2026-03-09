//! Stop generation, cancel tool execution, handle stop, and clear database commands.

use chrono::Utc;
use std::sync::atomic::Ordering;
use tauri::{Emitter, State};
use tracing::info;

use super::state::{
    mark_tool_cancelled, AppDatabase, ACTIVE_STOP_CONVERSATION, PENDING_MESSAGES, STOP_GENERATION,
};

#[tauri::command]
pub async fn chat_stop_generation(conversation_id: Option<i64>) -> Result<(), String> {
    info!(
        "[Chat] Stopping generation - setting stop flag for conversation: {:?}",
        conversation_id
    );
    STOP_GENERATION.store(true, Ordering::SeqCst);
    // AUDIT-STREAM-038 fix: Track which conversation is being stopped
    if let Some(conv_id) = conversation_id {
        if let Ok(mut active) = ACTIVE_STOP_CONVERSATION.lock() {
            *active = Some(conv_id);
        }
    }
    Ok(())
}

#[tauri::command]
pub async fn cancel_tool_execution(
    app_handle: tauri::AppHandle,
    tool_id: String,
) -> Result<bool, String> {
    let trimmed = tool_id.trim();
    if trimmed.is_empty() {
        return Err("Tool id is required for cancellation".to_string());
    }

    if !crate::ui::events::tool_stream::is_tool_active(trimmed) {
        return Err(format!(
            "No active tool execution found for id '{}'",
            trimmed
        ));
    }

    mark_tool_cancelled(trimmed);
    info!(
        "[Chat] Cancellation requested for active tool execution: {}",
        trimmed
    );
    let _ = app_handle.emit(
        "agi:tool_cancel_requested",
        serde_json::json!({
            "tool_id": trimmed,
            "reason": "Cancelled by user",
        }),
    );
    Ok(true)
}

/// Handle stop command - sets stop flag and emits event
#[tauri::command]
pub async fn chat_handle_stop(app_handle: tauri::AppHandle) -> Result<bool, String> {
    info!("[Chat] Handling stop command - setting stop flag and emitting event");
    STOP_GENERATION.store(true, Ordering::SeqCst);

    // Emit stop event to all listeners
    let _ = app_handle.emit(
        "chat:stop-requested",
        serde_json::json!({
            "timestamp": Utc::now().to_rfc3339(),
            "source": "user_command"
        }),
    );

    // Emit AGI cancel event - the orchestrator listens for this
    let _ = app_handle.emit(
        "agi:goal:cancelled",
        serde_json::json!({
            "reason": "user_stop_command",
            "timestamp": Utc::now().to_rfc3339()
        }),
    );
    info!("[Chat] AGI orchestrator cancellation event emitted");

    Ok(true)
}

#[tauri::command]
pub fn clear_local_database(db: State<'_, AppDatabase>) -> Result<(), String> {
    let conn = db.connection()?;
    // Delete user-specific data from tables
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

    // Clear in-memory pending messages
    if let Ok(mut queue) = PENDING_MESSAGES.lock() {
        queue.clear();
    }

    Ok(())
}
