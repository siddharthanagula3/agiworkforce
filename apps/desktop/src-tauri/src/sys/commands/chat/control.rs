use tracing::info;

use super::state::{mark_tool_cancelled, request_stop, set_conversation_plan_mode};

#[tauri::command]
pub async fn chat_stop_generation(conversation_id: Option<i64>) -> Result<(), String> {
    info!(
        "[Chat] Stopping generation - setting stop flag for conversation: {:?}",
        conversation_id
    );
    for stopped in request_stop(conversation_id) {
        super::pending::discard_pending_messages_for_conversation(stopped);
    }

    Ok(())
}

/// Puts a conversation in or out of plan mode. While it is in plan mode the
/// chat tool loop refuses every tool that could write or act.
#[tauri::command]
pub async fn chat_set_plan_mode(conversation_id: i64, enabled: bool) -> Result<(), String> {
    info!(
        "[Chat] Plan mode {} for conversation {}",
        if enabled { "on" } else { "off" },
        conversation_id
    );
    set_conversation_plan_mode(conversation_id, enabled);
    Ok(())
}

#[tauri::command]
pub async fn cancel_tool_execution(tool_id: String) -> Result<bool, String> {
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
    Ok(true)
}
