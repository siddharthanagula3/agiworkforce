use crate::core::llm::{ChatMessage, ContentPart};
use crate::data::db::models::{Message, MessageRole};
use crate::sys::commands::chat::memory_handler::ChatMemoryHandler;
use crate::sys::commands::chat::pending::has_pending_messages;
use tauri::Emitter;
use tracing::{debug, info, warn};

pub(super) fn append_history_messages(
    llm_messages: &mut Vec<ChatMessage>,
    history: &[Message],
    user_message_id: i64,
    multimodal_parts: Option<&Vec<ContentPart>>,
) {
    let history_len = history.len();
    for (index, message) in history.iter().enumerate() {
        let is_current_user_message = index == history_len - 1
            && message.role == MessageRole::User
            && message.id == user_message_id;

        let multimodal = if is_current_user_message {
            multimodal_parts.cloned()
        } else {
            None
        };

        llm_messages.push(ChatMessage {
            role: match message.role {
                MessageRole::User => "user".to_string(),
                MessageRole::Assistant => "assistant".to_string(),
                MessageRole::System => "system".to_string(),
            },
            content: message.content.clone(),
            tool_calls: None,
            tool_call_id: None,
            multimodal_content: multimodal,
        });
    }
}

/// Load relevant project memories and inject them as a system message into the LLM context.
///
/// This is non-fatal: if loading fails, a warning is logged but execution continues.
pub(super) fn inject_memory_context(
    memory_handler: &ChatMemoryHandler,
    project_folder: Option<&str>,
    llm_messages: &mut Vec<ChatMessage>,
) {
    match memory_handler.load_project_memories(project_folder) {
        Ok(memory_response) => {
            if memory_response.injection_result.has_relevant_memories {
                llm_messages.push(ChatMessage {
                    role: "system".to_string(),
                    content: memory_response.system_prompt_enhancement,
                    tool_calls: None,
                    tool_call_id: None,
                    multimodal_content: None,
                });
                info!(
                    "[Chat] Injected {} memories into context (Decisions: {}, Preferences: {}, Facts: {})",
                    memory_response.injection_result.memories_loaded,
                    memory_response.injection_result.summary.decisions,
                    memory_response.injection_result.summary.preferences,
                    memory_response.injection_result.summary.facts
                );
            } else {
                debug!("[Chat] No relevant memories found for this conversation");
            }
        }
        Err(error) => {
            warn!("[Chat] Failed to load memories (non-fatal): {}", error);
        }
    }
}

pub(super) fn emit_stream_failure(
    app_handle: &tauri::AppHandle,
    conversation_id: i64,
    message_id: &str,
    error: String,
    partial_content: Option<&str>,
) {
    let _ = app_handle.emit(
        "chat:stream-error",
        serde_json::json!({
            "conversation_id": conversation_id,
            "message_id": message_id,
            "error": error
        }),
    );
    let _ = app_handle.emit(
        "chat:stream-end",
        serde_json::json!({
            "conversation_id": conversation_id,
            "message_id": message_id,
            "content": partial_content.unwrap_or_default(),
            "error": true,
            "has_pending_messages": has_pending_messages()
        }),
    );
}
