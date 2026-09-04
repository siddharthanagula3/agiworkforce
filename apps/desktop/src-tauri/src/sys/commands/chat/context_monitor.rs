
use crate::core::agent::context_compactor::{
    resolve_context_window, should_auto_compact, CompactionConfig, ContextCompactor,
};
use crate::core::llm::llm_router::{LLMRouter, RouterPreferences};
use crate::core::llm::token_counter::TokenCounter;
use crate::core::llm::ChatMessage;
use crate::data::db::models::Message;
use crate::data::db::repository;
use std::collections::HashMap;
use std::sync::{Arc, Mutex};
use std::time::Instant;
use tauri::Emitter;
use tokio::sync::RwLock;
use tracing::{debug, info};

use super::{compaction::persist_compacted_context, AppDatabase};

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

pub async fn maybe_compact_context(
    llm_messages: &mut Vec<ChatMessage>,
    model: &str,
    reserved_output_tokens: usize,
    db: &AppDatabase,
    conversation_id: i64,
    user_id: &str,
    app_handle: &tauri::AppHandle,
    router: Arc<RwLock<LLMRouter>>,
    preferences: RouterPreferences,
) -> Result<bool, String> {
    // Skip incognito or invalid conversations
    if conversation_id <= 0 {
        return Ok(false);
    }

    // Estimate total tokens in the assembled message list
    let total_tokens = TokenCounter::estimate_prompt_tokens(llm_messages) as usize;

    // Look up the context window for this model
    let context_window = resolve_context_window(Some(model)).ok_or_else(|| {
        format!(
            "Cannot monitor chat context for {model}: the catalog does not define a token context window for this model."
        )
    })?;
    let usable_input_tokens = context_window
        .saturating_sub(reserved_output_tokens.min(context_window.saturating_sub(1)))
        .max(1);

    // Build the auto-compaction config (uses 95% threshold by default)
    let auto_config = CompactionConfig::default();

    // Read the per-conversation cooldown timestamp
    let last_compact_time = LAST_COMPACT_TIMES
        .lock()
        .ok()
        .and_then(|map| map.get(&conversation_id).copied());

    if !should_auto_compact(
        total_tokens,
        usable_input_tokens,
        &auto_config,
        last_compact_time,
    ) {
        let threshold_pct = (auto_config.auto_compact_threshold * 100.0) as u32;
        debug!(
            "[Chat] Auto-compaction not needed: {} tokens / {} window (threshold {}%)",
            total_tokens, usable_input_tokens, threshold_pct,
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
            "[Chat] Only {} messages in conversation, below minimum {} for auto-compaction",
            messages.len(),
            MIN_MESSAGES_FOR_AUTO_COMPACT,
        );
        return Ok(false);
    }

    let percentage = if usable_input_tokens > 0 {
        (total_tokens as f32 / usable_input_tokens as f32) * 100.0
    } else {
        0.0
    };

    info!(
        "[Chat] Auto-compaction triggered at {}/{} tokens ({:.1}%)",
        total_tokens, usable_input_tokens, percentage,
    );

    // Emit "auto-triggered" event so frontend can show progress immediately
    let _ = app_handle.emit(
        "compaction:auto-triggered",
        &CompactionAutoTriggeredEvent {
            conversation_id,
            current_tokens: total_tokens,
            max_tokens: usable_input_tokens,
            percentage,
        },
    );

    let threshold =
        (usable_input_tokens as f64 * auto_config.auto_compact_threshold as f64) as usize;
    let compaction_config = CompactionConfig {
        max_tokens: threshold,
        target_tokens: usable_input_tokens / 2,
        keep_recent: KEEP_RECENT_MESSAGES,
        min_messages: MIN_MESSAGES_FOR_AUTO_COMPACT,
        ..auto_config
    };
    let compactor = ContextCompactor::with_router(compaction_config, router, preferences);
    let result = compactor
        .compact_messages(&messages)
        .await
        .map_err(|e| format!("Auto-compaction failed: {e}"))?
        .ok_or_else(|| "Auto-compaction selected no eligible historical messages".to_string())?;
    let compacted_db_messages = result.messages;

    // Persist the compacted state
    persist_compacted_context(
        db,
        conversation_id,
        user_id,
        &messages,
        &compacted_db_messages,
    )?;

    // Record compaction time for cooldown tracking
    if let Ok(mut map) = LAST_COMPACT_TIMES.lock() {
        map.insert(conversation_id, Instant::now());
    }

    // Calculate stats
    let tokens_before = total_tokens;
    let tokens_after_db = result.tokens_after;
    // The LLM messages include system prompts that are not in the DB messages,
    // so estimate the overhead from non-history messages.
    let history_tokens = ContextCompactor::calculate_tokens(&messages);
    let overhead_tokens = total_tokens.saturating_sub(history_tokens);
    let tokens_after = tokens_after_db + overhead_tokens;

    let messages_compacted = result.messages_compacted;
    let savings_percent = if tokens_before > 0 {
        ((tokens_before.saturating_sub(tokens_after)) as f32 / tokens_before as f32) * 100.0
    } else {
        0.0
    };

    info!(
        "[Chat] Auto-compaction complete: {} messages compacted, {} -> {} tokens ({:.1}% saved)",
        messages_compacted, tokens_before, tokens_after, savings_percent,
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
                crate::data::db::models::MessageRole::Assistant,
                &format!(
                    "{}\nSummary of older conversation",
                    agiworkforce_agent_core::context::UNTRUSTED_SUMMARY_MARKER
                ),
            ),
            make_db_msg(
                crate::data::db::models::MessageRole::User,
                "latest question",
            ),
        ];

        rebuild_llm_messages(&mut llm_messages, &compacted_db);

        assert_eq!(llm_messages.len(), 4); // 2 system + 1 untrusted assistant summary + 1 user
        assert_eq!(llm_messages[0].role, "system");
        assert_eq!(llm_messages[0].content, "You are helpful.");
        assert_eq!(llm_messages[1].role, "system");
        assert_eq!(llm_messages[1].content, "OS: macOS");
        assert_eq!(llm_messages[2].role, "assistant");
        assert!(llm_messages[2]
            .content
            .contains(agiworkforce_agent_core::context::UNTRUSTED_SUMMARY_MARKER));
        assert_eq!(llm_messages[3].role, "user");
        assert_eq!(llm_messages[3].content, "latest question");
    }

    #[test]
    fn threshold_calculation_is_correct() {
        // Default auto_compact_threshold is 0.95 (stored as f32).
        // For a 128K context window: 0.95f32 as f64 = 0.9499999284744263,
        // so 128000 * 0.9499999... = 121599.99... which truncates to 121599.
        // The 1-token difference vs exact math is an acceptable f32 precision artifact.
        let config = CompactionConfig::default();
        let context_window = 128_000usize;
        let threshold = (context_window as f64 * config.auto_compact_threshold as f64) as usize;
        assert_eq!(threshold, 121_599);
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
        assert!(should_auto_compact(122_880, max_tokens, &config, None));
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
        let recent = Instant::now() - std::time::Duration::from_secs(1);
        assert!(!should_auto_compact(
            128_000,
            max_tokens,
            &config,
            Some(recent)
        ));
        let old = Instant::now() - std::time::Duration::from_secs(200);
        assert!(should_auto_compact(128_000, max_tokens, &config, Some(old)));
    }
}
