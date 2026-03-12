use super::llm::LLMState;

use crate::data::db::models::{Conversation, Message, MessageRole};
use crate::data::db::repository;
use crate::data::supabase_sync;
use chrono::Utc;
use std::sync::Arc;
use tauri::{Emitter, Manager, State};

use tracing::{debug, error, info, warn};

pub mod agent_mode;
pub mod attachments;
pub mod branching;
pub mod browser_context;
pub mod compaction;
pub mod control;
pub mod conversation;
pub mod cost;
pub mod export;
pub mod intent;
pub mod maintenance;
pub mod memory_handler;
pub mod message_context;
pub mod pending;
pub mod persistence;
pub mod prompt_context;
pub mod provider_access;
pub mod search;
pub mod send_message;
pub mod send_message_execution;
pub mod send_message_setup;
pub mod share;
pub mod state;
pub mod stream_runtime;
pub mod tool_config;
pub mod tool_events;
pub mod tool_execution;
pub mod tool_timeouts;
pub mod tools;
pub mod types;
#[cfg(test)]
pub use crate::sys::commands::chat::state::should_stop_generation;
pub use crate::sys::commands::chat::state::{
    reset_stop_flag, should_stop_for_conversation, AppDatabase,
};
pub use branching::*;
pub use compaction::*;
pub use control::*;
pub use conversation::*;
pub use cost::*;
pub use export::*;
pub use intent::*;
pub use maintenance::*;
pub use search::*;
pub use send_message::*;
pub use types::*;

use crate::sys::commands::chat::agent_mode::{detect_agent_mode, is_explicit_model_selection};
use crate::sys::commands::chat::attachments::{
    process_document_attachments, process_multimodal_attachments,
};
use crate::sys::commands::chat::browser_context::inject_browser_page_context;
use crate::sys::commands::chat::message_context::{
    append_history_messages, emit_stream_failure, inject_memory_context,
};
use crate::sys::commands::chat::persistence::{
    compute_or_skip_stats, save_or_skip_assistant_message,
};
use crate::sys::commands::chat::prompt_context::{
    build_os_context, build_project_context_message, sanitize_multiline_for_prompt,
};
use crate::sys::commands::chat::provider_access::{
    check_billing_and_budget, ensure_managed_cloud_provider,
};
use crate::sys::commands::chat::stream_runtime::consume_llm_stream;
use crate::sys::commands::chat::tool_config::{build_tool_definitions, normalize_tool_calls};
use crate::sys::commands::chat::tool_execution::execute_tool_calls_batch;
use crate::sys::commands::chat::tool_timeouts::{
    build_fast_metadata_failure_message, did_fast_metadata_batch_fail, is_fast_metadata_batch,
    is_media_generation_tool, resolve_followup_invoke_timeout_secs,
    resolve_followup_total_timeout_secs, resolve_streaming_tool_loop_max_iterations,
    resolve_streaming_tool_loop_max_secs,
};
// All named constants live in state.rs as pub(crate) — import them here so
// mod.rs code can reference them without duplication.
pub use crate::sys::commands::chat::pending::{
    chat_add_pending_message, chat_clear_pending_messages, chat_get_pending_messages,
    chat_pop_pending_message, has_pending_messages, has_pending_messages_for_conversation,
    peek_pending_messages, peek_pending_messages_for_conversation, pending_messages_count,
    pop_pending_message_for_conversation, AddPendingMessageRequest, PendingUserMessage,
    PopPendingMessageRequest,
};
use crate::sys::commands::chat::state::{
    DEFAULT_MAX_TOKENS, DEFAULT_TEMPERATURE, PENDING_MESSAGES, STREAM_CHUNK_IDLE_TIMEOUT_SECS,
};

// Pending Messages API commands and helpers live in pending.rs (imported above).

#[cfg(test)]
mod tests {
    use super::*;
    use crate::sys::commands::chat::state::{
        mark_tool_cancelled, take_tool_cancelled, ACTIVE_STOP_CONVERSATION,
        DEFAULT_TOOL_TIMEOUT_SECS, FAST_METADATA_FOLLOWUP_INVOKE_TIMEOUT_SECS,
        FAST_METADATA_FOLLOWUP_TOTAL_TIMEOUT_SECS, FAST_METADATA_TOOL_LOOP_MAX_ITERATIONS,
        FAST_METADATA_TOOL_LOOP_MAX_SECS, FAST_TOOL_TIMEOUT_SECS, FOLLOWUP_INVOKE_TIMEOUT_SECS,
        FOLLOWUP_TOTAL_TIMEOUT_SECS, LONG_RUNNING_TOOL_TIMEOUT_SECS, STOP_GENERATION,
        STREAMING_TOOL_LOOP_MAX_ITERATIONS, STREAMING_TOOL_LOOP_MAX_SECS,
    };
    use crate::sys::commands::chat::tool_timeouts::resolve_tool_execution_timeout_secs;
    use once_cell::sync::Lazy;
    use std::sync::atomic::Ordering;
    use std::sync::Mutex;

    static STOP_FLAG_TEST_GUARD: Lazy<Mutex<()>> = Lazy::new(|| Mutex::new(()));

    #[test]
    fn stop_flag_can_be_reset_between_runs() {
        let _guard = STOP_FLAG_TEST_GUARD.lock().expect("test lock poisoned");
        reset_stop_flag();
        STOP_GENERATION.store(true, Ordering::SeqCst);
        assert!(should_stop_generation());

        reset_stop_flag();
        assert!(!should_stop_generation());
    }

    #[test]
    fn scoped_stop_only_applies_to_matching_conversation() {
        let _guard = STOP_FLAG_TEST_GUARD.lock().expect("test lock poisoned");
        reset_stop_flag();
        STOP_GENERATION.store(true, Ordering::SeqCst);
        if let Ok(mut active) = ACTIVE_STOP_CONVERSATION.lock() {
            *active = Some(42);
        }

        assert!(should_stop_for_conversation(42));
        assert!(!should_stop_for_conversation(7));

        reset_stop_flag();
    }

    #[test]
    fn global_stop_applies_when_no_conversation_is_scoped() {
        let _guard = STOP_FLAG_TEST_GUARD.lock().expect("test lock poisoned");
        reset_stop_flag();
        STOP_GENERATION.store(true, Ordering::SeqCst);
        if let Ok(mut active) = ACTIVE_STOP_CONVERSATION.lock() {
            *active = None;
        }

        assert!(should_stop_for_conversation(42));
        assert!(should_stop_for_conversation(7));

        reset_stop_flag();
    }

    #[test]
    fn tool_timeout_policy_matches_expected_classes() {
        assert_eq!(
            resolve_tool_execution_timeout_secs("file_read"),
            FAST_TOOL_TIMEOUT_SECS
        );
        assert_eq!(
            resolve_tool_execution_timeout_secs("file_list"),
            FAST_TOOL_TIMEOUT_SECS
        );
        assert_eq!(
            resolve_tool_execution_timeout_secs("mcp__filesystem__list_directory"),
            FAST_TOOL_TIMEOUT_SECS
        );
        assert_eq!(
            resolve_tool_execution_timeout_secs("mcp__filesystem__list_allowed_directories"),
            FAST_TOOL_TIMEOUT_SECS
        );
        assert_eq!(
            resolve_tool_execution_timeout_secs("mcp__filesystem__read_text_file"),
            FAST_TOOL_TIMEOUT_SECS
        );
        assert_eq!(
            resolve_tool_execution_timeout_secs("terminal_execute"),
            LONG_RUNNING_TOOL_TIMEOUT_SECS
        );
        assert_eq!(
            resolve_tool_execution_timeout_secs("document_create_pdf"),
            LONG_RUNNING_TOOL_TIMEOUT_SECS
        );
        assert_eq!(
            resolve_tool_execution_timeout_secs("video_generate"),
            LONG_RUNNING_TOOL_TIMEOUT_SECS
        );
        assert_eq!(
            resolve_tool_execution_timeout_secs("media_generate_video"),
            LONG_RUNNING_TOOL_TIMEOUT_SECS
        );
        assert_eq!(
            resolve_tool_execution_timeout_secs("image_generate"),
            LONG_RUNNING_TOOL_TIMEOUT_SECS
        );
        assert_eq!(
            resolve_tool_execution_timeout_secs("media_generate_image"),
            LONG_RUNNING_TOOL_TIMEOUT_SECS
        );
        assert_eq!(
            resolve_tool_execution_timeout_secs("browser_navigate"),
            DEFAULT_TOOL_TIMEOUT_SECS
        );
    }

    #[test]
    fn fast_metadata_followup_policy_uses_tighter_budgets() {
        assert_eq!(
            resolve_followup_invoke_timeout_secs(true, false),
            FAST_METADATA_FOLLOWUP_INVOKE_TIMEOUT_SECS
        );
        assert_eq!(
            resolve_followup_total_timeout_secs(true),
            FAST_METADATA_FOLLOWUP_TOTAL_TIMEOUT_SECS
        );
        assert_eq!(
            resolve_streaming_tool_loop_max_secs(true),
            FAST_METADATA_TOOL_LOOP_MAX_SECS
        );
        assert_eq!(
            resolve_streaming_tool_loop_max_iterations(true),
            FAST_METADATA_TOOL_LOOP_MAX_ITERATIONS
        );

        assert_eq!(
            resolve_followup_invoke_timeout_secs(false, false),
            FOLLOWUP_INVOKE_TIMEOUT_SECS
        );
        assert_eq!(
            resolve_followup_total_timeout_secs(false),
            FOLLOWUP_TOTAL_TIMEOUT_SECS
        );
        assert_eq!(
            resolve_streaming_tool_loop_max_secs(false),
            STREAMING_TOOL_LOOP_MAX_SECS
        );
        assert_eq!(
            resolve_streaming_tool_loop_max_iterations(false),
            STREAMING_TOOL_LOOP_MAX_ITERATIONS
        );
    }

    #[test]
    fn cancelled_tool_registry_is_one_shot() {
        let tool_id = "tool-test-cancel";
        mark_tool_cancelled(tool_id);
        assert!(take_tool_cancelled(tool_id));
        assert!(!take_tool_cancelled(tool_id));
    }

    #[test]
    fn fast_metadata_batch_failure_detection_matches_expected_behavior() {
        let failed_file_list = tools::ChatToolResult::new(
            "tool_1".to_string(),
            "file_list".to_string(),
            false,
            "Error: denied".to_string(),
        );
        let failed_mcp_list = tools::ChatToolResult::new(
            "tool_2".to_string(),
            "mcp__filesystem__list_allowed_directories".to_string(),
            false,
            "Error: no access".to_string(),
        );
        let failed_mcp_dir = tools::ChatToolResult::new(
            "tool_2b".to_string(),
            "mcp__filesystem__list_directory".to_string(),
            false,
            "Error: timeout".to_string(),
        );
        let succeeded_file_list = tools::ChatToolResult::new(
            "tool_3".to_string(),
            "file_list".to_string(),
            true,
            "{\"entries\":[]}".to_string(),
        );
        let failed_terminal = tools::ChatToolResult::new(
            "tool_4".to_string(),
            "terminal_execute".to_string(),
            false,
            "Error: timeout".to_string(),
        );

        assert!(did_fast_metadata_batch_fail(&[
            failed_file_list.clone(),
            failed_mcp_list.clone()
        ]));
        assert!(did_fast_metadata_batch_fail(&[
            failed_mcp_dir.clone(),
            failed_mcp_list.clone()
        ]));
        assert!(!did_fast_metadata_batch_fail(&[
            failed_file_list.clone(),
            succeeded_file_list
        ]));
        assert!(!did_fast_metadata_batch_fail(&[
            failed_file_list,
            failed_terminal
        ]));
        assert!(!did_fast_metadata_batch_fail(&[]));
    }

    #[test]
    fn fast_metadata_failure_message_is_actionable() {
        let with_summary =
            build_fast_metadata_failure_message(&["file_list: permission denied".to_string()]);
        assert!(with_summary.contains("Please select or allow a project folder and retry."));
        assert!(with_summary.contains("file_list: permission denied"));

        let without_summary = build_fast_metadata_failure_message(&[]);
        assert!(without_summary.contains("Please select or allow a project folder and retry."));
    }
}
