//! Infinite Chats — automatic context compaction during the chat message flow.
//!
//! When a conversation's assembled LLM messages approach the model's context
//! window limit, this module transparently compacts older messages into a
//! summary so the conversation can continue indefinitely.
//!
//! The trigger is **95 % of the model's context window** (configurable via
//! `CompactionConfig::auto_compact_threshold`).  When triggered the module:
//!
//! 1. Emits a `compaction:auto-triggered` Tauri event so the frontend can
//!    show a progress indicator immediately.
//! 2. Uses the existing [`ContextCompactor`] to generate a summary of older
//!    messages and splice it into the message list.
//! 3. Persists the compacted state to the database so future loads start
//!    with the already-compacted history.
//! 4. Emits a `compaction:completed` Tauri event so the frontend can
//!    dismiss the progress indicator.

use crate::core::agent::context_compactor::{
    should_auto_compact, CompactionConfig, ContextCompactor,
};
use crate::core::llm::models_config;
use crate::core::llm::token_counter::TokenCounter;
use crate::core::llm::ChatMessage;
use crate::data::db::models::Message;
use crate::data::db::repository;
use std::collections::HashMap;
use std::sync::Mutex;
use std::time::Instant;
use tauri::Emitter;
use tracing::{debug, info};

use super::AppDatabase;

/// Minimum number of conversation messages required before we even consider
/// compacting.  Very short conversations do not benefit from summarization.
const MIN_MESSAGES_FOR_AUTO_COMPACT: usize = 12;

/// Number of recent messages to preserve verbatim during compaction.
const KEEP_RECENT_MESSAGES: usize = 10;

/// Per-conversation cooldown tracker.  Records the last time auto-compaction
/// was performed for each conversation so we respect the cooldown window.
static LAST_COMPACT_TIMES: std::sync::LazyLock<Mutex<HashMap<i64, Instant>>> =
    std::sync::LazyLock::new(|| Mutex::new(HashMap::new()));

/// Payload emitted on the `compaction:auto-triggered` Tauri event (before
/// compaction starts) so the frontend can show a progress indicator.
#[derive(Debug, Clone, serde::Serialize)]
pub struct CompactionAutoTriggeredEvent {
    pub conversation_id: i64,
    pub current_tokens: usize,
    pub max_tokens: usize,
    pub percentage: f32,
}

/// Payload emitted on the `compaction:completed` Tauri event (after
/// compaction finishes) so the frontend can dismiss the progress indicator.
#[derive(Debug, Clone, serde::Serialize)]
pub struct CompactionCompletedEvent {
    pub conversation_id: i64,
    pub messages_compacted: usize,
    pub tokens_before: usize,
    pub tokens_after: usize,
    pub savings_percent: f32,
}

/// Check whether the assembled LLM messages exceed the context threshold and,
/// if so, compact the conversation's persisted history and rewrite the
/// in-memory message list.
///
/// This function is designed to be called from `prepare_send_message` after
/// the full message list (system prompts + history + user message) has been
/// assembled but before the `LLMRequest` is constructed.
///
/// Uses [`should_auto_compact`] with `CompactionConfig` defaults (95%
/// threshold, 120 s cooldown) to decide whether to trigger.
///
/// # Arguments
///
/// * `llm_messages` — the mutable vec of chat messages about to be sent to
///   the LLM.  On compaction this is rewritten in-place.
/// * `model` — the model ID string used to look up the context window size.
/// * `db` — database handle for reading/writing conversation messages.
/// * `conversation_id` — the current conversation ID (skipped for incognito
///   conversations with id <= 0).
/// * `user_id` — used for database authorization.
/// * `app_handle` — Tauri app handle for emitting frontend events.
///
/// Returns `Ok(true)` if compaction was performed, `Ok(false)` otherwise.
pub async fn maybe_compact_context(
    llm_messages: &mut Vec<ChatMessage>,
    model: &str,
    db: &AppDatabase,
    conversation_id: i64,
    user_id: &str,
    app_handle: &tauri::AppHandle,
) -> Result<bool, String> {
    // Skip incognito or invalid conversations
    if conversation_id <= 0 {
        return Ok(false);
    }

    // Estimate total tokens in the assembled message list
    let total_tokens = TokenCounter::estimate_prompt_tokens(llm_messages) as usize;

    // Look up the context window for this model
    let context_window = models_config::get_context_window(model) as usize;

    // Build the auto-compaction config (uses 95% threshold by default)
    let auto_config = CompactionConfig::default();

    // Read the per-conversation cooldown timestamp
    let last_compact_time = LAST_COMPACT_TIMES
        .lock()
        .ok()
        .and_then(|map| map.get(&conversation_id).copied());

    if !should_auto_compact(total_tokens, context_window, &auto_config, last_compact_time) {
        let threshold_pct = (auto_config.auto_compact_threshold * 100.0) as u32;
        debug!(
            "[Chat] Auto-compaction not needed: {} tokens / {} window (threshold {}%)",
            total_tokens, context_window, threshold_pct,
        );
        return Ok(false);
    }

    // Load the persisted conversation messages for compaction
    let messages = {
        let conn = db.connection()?;
        repository::list_messages(&conn, conversation_id)
            .map_err(|e| format!("Failed to load messages for compaction: {e}"))?
    };

    if messages.len() < MIN_MESSAGES_FOR_AUTO_COMPACT {
        debug!(
            "[Chat] Only {} messages in conversation — below minimum {} for auto-compaction",
            messages.len(),
            MIN_MESSAGES_FOR_AUTO_COMPACT,
        );
        return Ok(false);
    }

    let percentage = if context_window > 0 {
        (total_tokens as f32 / context_window as f32) * 100.0
    } else {
        0.0
    };

    info!(
        "[Chat] Auto-compaction triggered at {}/{} tokens ({:.1}%)",
        total_tokens, context_window, percentage,
    );

    // Emit "auto-triggered" event so frontend can show progress immediately
    let _ = app_handle.emit(
        "compaction:auto-triggered",
        &CompactionAutoTriggeredEvent {
            conversation_id,
            current_tokens: total_tokens,
            max_tokens: context_window,
            percentage,
        },
    );

    // Configure the compactor — target half the context window so there is
    // plenty of room for the model's reply and future messages.
    let threshold = (context_window as f64 * auto_config.auto_compact_threshold as f64) as usize;
    let compaction_config = CompactionConfig {
        max_tokens: threshold,
        target_tokens: context_window / 2,
        keep_recent: KEEP_RECENT_MESSAGES,
        min_messages: MIN_MESSAGES_FOR_AUTO_COMPACT,
        ..auto_config
    };
    let compactor = ContextCompactor::new(compaction_config);

    // Generate a summary of the older messages
    let summary = compactor
        .generate_summary(&messages)
        .await
        .map_err(|e| format!("Auto-compaction summary generation failed: {e}"))?;

    let compacted_db_messages = compactor.get_compacted_messages(&messages, &summary);

    // Persist the compacted state
    persist_auto_compaction(db, conversation_id, user_id, &messages, &compacted_db_messages)?;

    // Record compaction time for cooldown tracking
    if let Ok(mut map) = LAST_COMPACT_TIMES.lock() {
        map.insert(conversation_id, Instant::now());
    }

    // Calculate stats
    let tokens_before = total_tokens;
    let tokens_after_db: usize = compacted_db_messages
        .iter()
        .map(|m| m.tokens.unwrap_or(0) as usize)
        .sum();
    // The LLM messages include system prompts that are not in the DB messages,
    // so estimate the overhead from non-history messages.
    let history_tokens: usize = messages
        .iter()
        .map(|m| m.tokens.unwrap_or(0) as usize)
        .sum();
    let overhead_tokens = total_tokens.saturating_sub(history_tokens);
    let tokens_after = tokens_after_db + overhead_tokens;

    let messages_compacted = messages.len().saturating_sub(compacted_db_messages.len());
    let savings_percent = if tokens_before > 0 {
        ((tokens_before.saturating_sub(tokens_after)) as f32 / tokens_before as f32) * 100.0
    } else {
        0.0
    };

    info!(
        "[Chat] Auto-compaction complete: {} messages compacted, {} -> {} tokens ({:.1}% saved)",
        messages_compacted,
        tokens_before,
        tokens_after,
        savings_percent,
    );

    // Rebuild the LLM message list from the compacted DB messages.
    // Strategy: keep all system-prompt messages (those before history) intact,
    // then replace history messages with compacted versions.
    rebuild_llm_messages(llm_messages, &compacted_db_messages);

    // Emit "completed" event so frontend can dismiss progress indicator
    let _ = app_handle.emit(
        "compaction:completed",
        &CompactionCompletedEvent {
            conversation_id,
            messages_compacted,
            tokens_before,
            tokens_after,
            savings_percent,
        },
    );

    // Also emit the legacy event for backwards compatibility
    let _ = app_handle.emit(
        "chat:context-compacted",
        &CompactionCompletedEvent {
            conversation_id,
            messages_compacted,
            tokens_before,
            tokens_after,
            savings_percent,
        },
    );

    Ok(true)
}

/// Rebuild the in-memory LLM message list after compaction.
///
/// The LLM messages contain a mix of system prompts (injected by
/// prepare_send_message) and history messages (from the DB).  We identify
/// the boundary: system messages at the start are kept, then the remaining
/// history portion is replaced with the compacted DB messages converted to
/// ChatMessage format.
fn rebuild_llm_messages(llm_messages: &mut Vec<ChatMessage>, compacted_db_messages: &[Message]) {
    // Find where history starts: the first non-system message, or the first
    // message whose role is "user" or "assistant" after the system block.
    let history_start = llm_messages
        .iter()
        .position(|m| m.role != "system")
        .unwrap_or(llm_messages.len());

    // Keep the system prefix
    llm_messages.truncate(history_start);

    // Append compacted messages
    for msg in compacted_db_messages {
        llm_messages.push(ChatMessage {
            role: msg.role.as_str().to_string(),
            content: msg.content.clone(),
            tool_calls: None,
            tool_call_id: None,
            multimodal_content: None,
        });
    }
}

/// Persist the compacted context to the database.
///
/// This mirrors the logic in `compaction.rs::persist_compacted_context` but
/// is kept separate to avoid tight coupling and to allow the auto-compaction
/// path to evolve independently.
fn persist_auto_compaction(
    db: &AppDatabase,
    conversation_id: i64,
    user_id: &str,
    original_messages: &[Message],
    compacted_messages: &[Message],
) -> Result<(), String> {
    // The first compacted message should be the summary (id == 0, System role)
    let summary_message = compacted_messages
        .first()
        .filter(|m| m.id == 0 && m.role == crate::data::db::models::MessageRole::System)
        .ok_or_else(|| "Auto-compaction produced no summary message".to_string())?;

    let keep_recent_count = compacted_messages
        .len()
        .checked_sub(1)
        .ok_or_else(|| "Auto-compaction output is missing recent messages".to_string())?;
    let recent_start = original_messages.len().saturating_sub(keep_recent_count);
    let old_messages = &original_messages[..recent_start];
    if old_messages.is_empty() {
        return Ok(()); // Nothing to compact
    }

    let summary_created_at = original_messages
        .get(recent_start)
        .map(|m| m.created_at - chrono::Duration::seconds(1))
        .unwrap_or_else(|| old_messages[old_messages.len() - 1].created_at);
    let summary_created_at_sql = summary_created_at.format("%Y-%m-%d %H:%M:%S").to_string();
    let summary_branch_id = old_messages
        .last()
        .and_then(|m| m.branch_id.clone())
        .unwrap_or_else(|| "main".to_string());

    let conn = db.connection()?;
    let tx = conn
        .unchecked_transaction()
        .map_err(|e| format!("Failed to start auto-compaction transaction: {e}"))?;

    // Mark conversation as updated
    tx.execute(
        "UPDATE conversations SET updated_at = CURRENT_TIMESTAMP WHERE id = ?1 AND user_id = ?2",
        rusqlite::params![conversation_id, user_id],
    )
    .map_err(|e| format!("Failed to update conversation timestamp: {e}"))?;

    // Remove old messages
    for msg in old_messages {
        tx.execute(
            "DELETE FROM messages WHERE id = ?1 AND conversation_id = ?2",
            rusqlite::params![msg.id, conversation_id],
        )
        .map_err(|e| format!("Failed to remove compacted message {}: {e}", msg.id))?;
    }

    // Insert summary message
    tx.execute(
        "INSERT INTO messages (
            conversation_id, user_id, role, content, tokens, cost,
            provider, model, created_at, parent_message_id, branch_id
        ) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11)",
        rusqlite::params![
            conversation_id,
            user_id,
            summary_message.role.as_str(),
            summary_message.content,
            summary_message.tokens,
            summary_message.cost,
            summary_message.provider.as_deref(),
            summary_message.model.as_deref(),
            summary_created_at_sql,
            summary_message.parent_message_id,
            summary_branch_id,
        ],
    )
    .map_err(|e| format!("Failed to save compacted summary: {e}"))?;

    tx.commit()
        .map_err(|e| format!("Failed to commit auto-compaction: {e}"))?;

    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::core::llm::ChatMessage;

    fn make_chat_msg(role: &str, content: &str) -> ChatMessage {
        ChatMessage {
            role: role.to_string(),
            content: content.to_string(),
            tool_calls: None,
            tool_call_id: None,
            multimodal_content: None,
        }
    }

    fn make_db_msg(role: crate::data::db::models::MessageRole, content: &str) -> Message {
        Message {
            id: 0,
            conversation_id: 1,
            user_id: "test".to_string(),
            role,
            content: content.to_string(),
            tokens: Some(100),
            cost: None,
            provider: None,
            model: None,
            created_at: chrono::Utc::now(),
            parent_message_id: None,
            branch_id: Some("main".to_string()),
        }
    }

    #[test]
    fn rebuild_preserves_system_prefix_and_replaces_history() {
        let mut llm_messages = vec![
            make_chat_msg("system", "You are helpful."),
            make_chat_msg("system", "OS: macOS"),
            make_chat_msg("user", "old question 1"),
            make_chat_msg("assistant", "old answer 1"),
            make_chat_msg("user", "old question 2"),
            make_chat_msg("assistant", "old answer 2"),
            make_chat_msg("user", "latest question"),
        ];

        let compacted_db = vec![
            make_db_msg(
                crate::data::db::models::MessageRole::System,
                "[Compacted Context]\n\nSummary of older conversation",
            ),
            make_db_msg(
                crate::data::db::models::MessageRole::User,
                "latest question",
            ),
        ];

        rebuild_llm_messages(&mut llm_messages, &compacted_db);

        assert_eq!(llm_messages.len(), 4); // 2 system + 1 compacted system + 1 user
        assert_eq!(llm_messages[0].role, "system");
        assert_eq!(llm_messages[0].content, "You are helpful.");
        assert_eq!(llm_messages[1].role, "system");
        assert_eq!(llm_messages[1].content, "OS: macOS");
        assert_eq!(llm_messages[2].role, "system");
        assert!(llm_messages[2].content.contains("Compacted Context"));
        assert_eq!(llm_messages[3].role, "user");
        assert_eq!(llm_messages[3].content, "latest question");
    }

    #[test]
    fn threshold_calculation_is_correct() {
        // Default auto_compact_threshold is 0.95 — for a 128K context window
        // the trigger should be at 121,600 tokens.
        let config = CompactionConfig::default();
        let context_window = 128_000usize;
        let threshold =
            (context_window as f64 * config.auto_compact_threshold as f64) as usize;
        assert_eq!(threshold, 121_600);
    }

    #[test]
    fn rebuild_handles_all_system_messages() {
        let mut llm_messages = vec![
            make_chat_msg("system", "prompt 1"),
            make_chat_msg("system", "prompt 2"),
        ];

        let compacted_db = vec![make_db_msg(
            crate::data::db::models::MessageRole::User,
            "hello",
        )];

        rebuild_llm_messages(&mut llm_messages, &compacted_db);

        assert_eq!(llm_messages.len(), 3);
        assert_eq!(llm_messages[0].content, "prompt 1");
        assert_eq!(llm_messages[1].content, "prompt 2");
        assert_eq!(llm_messages[2].content, "hello");
    }

    #[test]
    fn should_auto_compact_triggers_above_threshold() {
        let config = CompactionConfig::default(); // threshold = 0.95
        let max_tokens = 128_000;
        // 96% usage — should trigger
        assert!(should_auto_compact(122_880, max_tokens, &config, None));
        // 90% usage — below 95% threshold
        assert!(!should_auto_compact(115_200, max_tokens, &config, None));
    }

    #[test]
    fn should_auto_compact_respects_disabled_flag() {
        let config = CompactionConfig {
            auto_compact_enabled: false,
            ..Default::default()
        };
        // Even at 100% usage, disabled config should not trigger
        assert!(!should_auto_compact(128_000, 128_000, &config, None));
    }

    #[test]
    fn should_auto_compact_respects_cooldown() {
        let config = CompactionConfig::default(); // cooldown = 120s
        let max_tokens = 128_000;
        // Just compacted 1 second ago — cooldown not elapsed
        let recent = Instant::now() - std::time::Duration::from_secs(1);
        assert!(!should_auto_compact(128_000, max_tokens, &config, Some(recent)));
        // Compacted 200 seconds ago — cooldown elapsed
        let old = Instant::now() - std::time::Duration::from_secs(200);
        assert!(should_auto_compact(128_000, max_tokens, &config, Some(old)));
    }
}
