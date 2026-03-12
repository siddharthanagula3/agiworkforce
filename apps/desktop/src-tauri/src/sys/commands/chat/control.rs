use std::sync::atomic::Ordering;

use chrono::Utc;
use tauri::{AppHandle, Emitter};
use tracing::info;

use super::state::{mark_tool_cancelled, ACTIVE_STOP_CONVERSATION, STOP_GENERATION};

#[tauri::command]
pub async fn chat_stop_generation(conversation_id: Option<i64>) -> Result<(), String> {
    info!(
        "[Chat] Stopping generation - setting stop flag for conversation: {:?}",
        conversation_id
    );
    STOP_GENERATION.store(true, Ordering::SeqCst);

    if let Some(conv_id) = conversation_id {
        if let Ok(mut active) = ACTIVE_STOP_CONVERSATION.lock() {
            *active = Some(conv_id);
        }
    }

    Ok(())
}

#[tauri::command]
pub async fn cancel_tool_execution(app_handle: AppHandle, tool_id: String) -> Result<bool, String> {
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
pub async fn chat_handle_stop(app_handle: AppHandle) -> Result<bool, String> {
    info!("[Chat] Handling stop command - setting stop flag and emitting event");
    STOP_GENERATION.store(true, Ordering::SeqCst);

    let _ = app_handle.emit(
        "chat:stop-requested",
        serde_json::json!({
            "timestamp": Utc::now().to_rfc3339(),
            "source": "user_command"
        }),
    );

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
