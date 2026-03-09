//! Context compaction API (CTX-004).

use tauri::State;
use tracing::info;

use super::state::AppDatabase;
use crate::data::db::repository;

/// Response from context compaction
#[derive(Debug, Clone, serde::Serialize, serde::Deserialize)]
pub struct ContextCompactionResponse {
    /// Number of messages that were compacted
    pub messages_compacted: usize,
    /// Token count before compaction
    pub tokens_before: usize,
    /// Token count after compaction
    pub tokens_after: usize,
    /// Token savings percentage
    pub savings_percent: f32,
    /// Whether a summary was created
    pub summary_created: bool,
    /// Focus area used for compaction (if specified)
    pub focus: Option<String>,
    /// User-friendly message about the result
    pub message: String,
}

/// Compact the context of a conversation to reduce token usage
///
/// # Arguments
/// * `conversation_id` - The conversation to compact
/// * `focus` - Optional focus area to preserve (e.g., "code", "decisions", "errors")
/// * `user_id` - The user ID for authorization
///
/// # Returns
/// Compaction statistics and result message
#[tauri::command]
pub async fn chat_compact_context(
    db: State<'_, AppDatabase>,
    conversation_id: i64,
    focus: Option<String>,
    user_id: String,
) -> Result<ContextCompactionResponse, String> {
    use crate::core::agent::context_compactor::{CompactionConfig, ContextCompactor};

    if conversation_id <= 0 {
        return Err(format!(
            "Invalid conversation ID: {}. ID must be positive",
            conversation_id
        ));
    }
    if user_id.is_empty() {
        return Err("User ID cannot be empty".to_string());
    }

    // Load messages in a block to release the connection before async operations
    let messages = {
        let conn = db.connection()?;

        // Verify conversation ownership
        repository::get_conversation(&conn, conversation_id, &user_id)
            .map_err(|e| format!("Access denied or conversation not found: {e}"))?;

        // Load messages for the conversation
        repository::list_messages(&conn, conversation_id)
            .map_err(|e| format!("Failed to load messages: {e}"))?
    };

    if messages.is_empty() {
        return Ok(ContextCompactionResponse {
            messages_compacted: 0,
            tokens_before: 0,
            tokens_after: 0,
            savings_percent: 0.0,
            summary_created: false,
            focus: focus.clone(),
            message: "No messages to compact in this conversation.".to_string(),
        });
    }

    // Calculate current token count
    let tokens_before: usize = messages
        .iter()
        .map(|m| m.tokens.unwrap_or(0) as usize)
        .sum();

    // Check if compaction is needed
    if messages.len() < 10 {
        return Ok(ContextCompactionResponse {
            messages_compacted: 0,
            tokens_before,
            tokens_after: tokens_before,
            savings_percent: 0.0,
            summary_created: false,
            focus: focus.clone(),
            message: format!(
                "Conversation has only {} messages. Compaction not needed (minimum 10 messages).",
                messages.len()
            ),
        });
    }

    // Create compactor with custom config based on focus
    let config = CompactionConfig {
        max_tokens: 100_000,
        target_tokens: 50_000,
        keep_recent: match focus.as_deref() {
            Some("errors") | Some("debug") => 15, // Keep more recent for debugging
            Some("decisions") | Some("todo") => 5, // Keep fewer, focus on decisions
            _ => 10,                              // Default
        },
        min_messages: 10,
    };

    let compactor = ContextCompactor::new(config);

    // Check if compaction would be beneficial
    if !compactor.should_compact(&messages) {
        return Ok(ContextCompactionResponse {
            messages_compacted: 0,
            tokens_before,
            tokens_after: tokens_before,
            savings_percent: 0.0,
            summary_created: false,
            focus: focus.clone(),
            message: format!(
                "Context is within limits ({} tokens). No compaction needed.",
                tokens_before
            ),
        });
    }

    // Generate summary using heuristic method (LLM integration would require async setup)
    let summary = compactor
        .generate_summary(&messages)
        .await
        .map_err(|e| format!("Failed to generate summary: {e}"))?;

    // Get compacted messages
    let compacted = compactor.get_compacted_messages(&messages, &summary);
    let tokens_after: usize = compacted
        .iter()
        .map(|m| m.tokens.unwrap_or(0) as usize)
        .sum();

    let messages_compacted = messages.len() - compacted.len();
    let savings_percent = if tokens_before > 0 {
        ((tokens_before - tokens_after) as f32 / tokens_before as f32) * 100.0
    } else {
        0.0
    };

    info!(
        "[Chat] Context compaction: {} messages → {} messages, {} → {} tokens ({:.1}% saved)",
        messages.len(),
        compacted.len(),
        tokens_before,
        tokens_after,
        savings_percent
    );

    // Note: We don't actually delete messages from DB - the compaction is for the LLM context
    // The summary could be stored as a system message if needed

    Ok(ContextCompactionResponse {
        messages_compacted,
        tokens_before,
        tokens_after,
        savings_percent,
        summary_created: true,
        focus: focus.clone(),
        message: format!(
            "Compacted {} messages, saving {:.1}% of tokens ({} → {}).",
            messages_compacted, savings_percent, tokens_before, tokens_after
        ),
    })
}
