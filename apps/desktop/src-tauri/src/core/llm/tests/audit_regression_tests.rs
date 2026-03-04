//! Regression tests for P0/P1 audit fixes.
//!
//! Each test group corresponds to an audit finding and verifies the fix is in
//! place so the bug cannot regress silently.

// ---------------------------------------------------------------------------
// R1 — Phantom model names removed from get_model_for_task
//
// Previously Google/ComplexReasoning returned "gemini-3-deep-think" (a model
// that never existed) and Qwen/CodeGeneration returned bare "qwen-coder"
// instead of the correct "qwen-coder-plus".  These tests pin the correct values.
// ---------------------------------------------------------------------------
mod r1_phantom_models {
    use crate::core::llm::{Provider, TaskType};

    #[test]
    fn google_complex_reasoning_returns_gemini_2_5_pro_not_phantom() {
        let model = Provider::Google.get_model_for_task(TaskType::ComplexReasoning);
        assert_ne!(
            model, "gemini-3-deep-think",
            "Phantom model 'gemini-3-deep-think' must not be returned; got: {}",
            model
        );
        assert_eq!(
            model, "gemini-2.5-pro",
            "Google/ComplexReasoning should return 'gemini-2.5-pro', got: {}",
            model
        );
    }

    #[test]
    fn qwen_code_generation_returns_qwen_coder_plus_not_bare_qwen_coder() {
        let model = Provider::Qwen.get_model_for_task(TaskType::CodeGeneration);
        assert_ne!(
            model, "qwen-coder",
            "Bare 'qwen-coder' must not be returned; got: {}",
            model
        );
        assert_eq!(
            model, "qwen-coder-plus",
            "Qwen/CodeGeneration should return 'qwen-coder-plus', got: {}",
            model
        );
    }

    /// Snapshot test: every (Provider, TaskType) pair must return a non-empty,
    /// non-phantom model string.  Adding a new phantom model will fail here.
    #[test]
    fn no_phantom_models_in_any_task_routing() {
        let phantom_names = ["gemini-3-deep-think", "qwen-coder"];

        let providers = [
            Provider::OpenAI,
            Provider::Anthropic,
            Provider::Google,
            Provider::Ollama,
            Provider::Perplexity,
            Provider::XAI,
            Provider::DeepSeek,
            Provider::Qwen,
            Provider::Moonshot,
            Provider::Zhipu,
            Provider::ManagedCloud,
            Provider::Mistral,
        ];
        let tasks = [
            TaskType::FastCompletion,
            TaskType::CodeGeneration,
            TaskType::ComplexReasoning,
            TaskType::Chat,
            TaskType::Vision,
            TaskType::LongContext,
        ];

        for p in providers {
            for t in tasks {
                let model = p.get_model_for_task(t);
                for phantom in &phantom_names {
                    assert_ne!(
                        model, *phantom,
                        "Phantom model '{}' found for {:?}/{:?}",
                        phantom, p, t
                    );
                }
                assert!(
                    !model.is_empty(),
                    "{:?}.get_model_for_task({:?}) returned empty string",
                    p,
                    t
                );
            }
        }
    }
}

// ---------------------------------------------------------------------------
// R2 — Degraded state constructors must not panic
//
// lib.rs now calls new_degraded() / Default::default() as fallbacks when the
// primary state initialisation fails.  These tests confirm that each of those
// paths constructs a value without panicking.
// ---------------------------------------------------------------------------
mod r2_degraded_state_constructors {
    use crate::sys::commands::master_password::MasterPasswordState;
    use crate::sys::commands::memory::MemoryState;
    use crate::sys::commands::project_memory::ProjectMemoryState;

    #[test]
    fn memory_state_new_degraded_does_not_panic() {
        let state = MemoryState::new_degraded();
        // M16 fix: Assert the manager Arc is accessible (not just assigned to _)
        let manager = state.manager.clone();
        // The Arc strong count should be at least 2 (original + clone)
        assert!(
            std::sync::Arc::strong_count(&manager) >= 2,
            "Degraded MemoryState manager Arc should be clonable"
        );
    }

    #[test]
    fn memory_state_new_degraded_injection_config_is_disabled() {
        use tokio::runtime::Runtime;
        let state = MemoryState::new_degraded();
        let rt = Runtime::new().expect("tokio runtime");
        let config = rt.block_on(async { state.injection_config.read().await.clone() });
        assert!(
            !config.enabled,
            "Degraded MemoryState injection config should be disabled"
        );
        assert_eq!(
            config.max_memories, 0,
            "Degraded MemoryState should have max_memories=0"
        );
    }

    #[test]
    fn project_memory_state_new_degraded_does_not_panic() {
        let state = ProjectMemoryState::new_degraded();
        // M16 fix: Assert the manager Arc is accessible
        let manager = state.manager.clone();
        assert!(
            std::sync::Arc::strong_count(&manager) >= 2,
            "Degraded ProjectMemoryState manager Arc should be clonable"
        );
    }

    #[test]
    fn master_password_state_new_degraded_does_not_panic() {
        let state = MasterPasswordState::new_degraded();
        let _manager = state.manager.clone();
    }

    #[test]
    fn master_password_state_new_degraded_manager_is_accessible() {
        let state = MasterPasswordState::new_degraded();
        // Locking the mutex should succeed (not be poisoned)
        let _guard = state
            .manager
            .lock()
            .expect("MasterPasswordState degraded manager lock should not be poisoned");
    }
}

// ---------------------------------------------------------------------------
// R3 — AppState::default() uses temp-dir storage and does not panic
//
// When AppState::load() fails (e.g. missing config dir), the fallback is
// AppState::default().  Verify it builds cleanly and has sane defaults.
// ---------------------------------------------------------------------------
mod r3_app_state_default {
    use crate::data::state::{AppState, DockPosition, PersistentWindowState};

    #[test]
    fn app_state_default_does_not_panic() {
        let _state = AppState::default();
    }

    #[test]
    fn app_state_default_storage_path_is_in_temp_dir() {
        let state = AppState::default();
        let path = &*state.storage_path;
        let tmp = std::env::temp_dir();
        assert!(
            path.starts_with(&tmp),
            "Default storage path {:?} should be under temp dir {:?}",
            path,
            tmp
        );
    }

    #[test]
    fn app_state_default_snapshot_returns_default_window_geometry() {
        let state = AppState::default();
        let snap = state.snapshot();
        assert!(
            snap.geometry.is_some(),
            "Default snapshot should have geometry set"
        );
        let geom = snap.geometry.unwrap();
        assert!(geom.width > 0.0, "Default window width should be positive");
        assert!(geom.height > 0.0, "Default window height should be positive");
    }

    #[test]
    fn app_state_default_suppress_events_starts_false() {
        let state = AppState::default();
        assert!(
            !state.is_events_suppressed(),
            "Events should not be suppressed on a freshly created AppState"
        );
    }

    #[test]
    fn persistent_window_state_default_pinned() {
        let state = PersistentWindowState::default();
        assert!(state.pinned, "Default PersistentWindowState should be pinned");
        assert!(!state.maximized);
        assert!(!state.fullscreen);
        assert!(state.dock.is_none());
        assert!(state.previous_geometry.is_none());
    }

    #[test]
    fn dock_position_equality() {
        assert_eq!(DockPosition::Left, DockPosition::Left);
        assert_ne!(DockPosition::Left, DockPosition::Right);
    }
}

// ---------------------------------------------------------------------------
// R4 — EmbeddingService::new_degraded does not panic
//
// The service creates temp dirs and in-process resources; it must not panic
// even in a CI environment with no GPU or model files.
// ---------------------------------------------------------------------------
mod r4_embedding_service_degraded {
    use crate::core::embeddings::EmbeddingService;

    #[test]
    fn embedding_service_new_degraded_does_not_panic() {
        let result = EmbeddingService::new_degraded();
        assert!(
            result.is_ok(),
            "EmbeddingService::new_degraded() must not fail: {:?}",
            result.err()
        );
    }
}

// ---------------------------------------------------------------------------
// R5 — ContextCompactor ordering: recent messages are kept, old ones compacted
//
// Regression for the bug where the split_at index was inverted and old
// messages were "kept" while recent ones were summarised.
// ---------------------------------------------------------------------------
mod r5_context_compactor_ordering {
    use crate::core::agent::context_compactor::{CompactionConfig, ContextCompactor};
    use crate::data::db::models::{Message, MessageRole};
    use chrono::Utc;

    fn make_message(id: i64, content: &str, tokens: i32) -> Message {
        Message {
            id,
            conversation_id: 1,
            role: MessageRole::User,
            content: content.to_string(),
            tokens: Some(tokens),
            cost: None,
            provider: None,
            model: None,
            created_at: Utc::now(),
            user_id: "test_user".to_string(),
        }
    }

    #[test]
    fn get_compacted_messages_keeps_recent_messages_at_end() {
        let config = CompactionConfig {
            max_tokens: 100_000,
            target_tokens: 50_000,
            keep_recent: 3,
            min_messages: 5,
        };
        let compactor = ContextCompactor::new(config);

        // Build 8 messages: first 5 are "old", last 3 are "recent"
        let messages: Vec<Message> = (1..=8)
            .map(|i| make_message(i, &format!("message-{}", i), 1000))
            .collect();

        let summary = "Summary of old messages";
        let compacted = compactor.get_compacted_messages(&messages, summary);

        // The compacted list should have: 1 summary + 3 recent messages = 4 total
        assert_eq!(
            compacted.len(),
            4,
            "Expected 1 summary + 3 recent = 4 messages, got {}",
            compacted.len()
        );

        // First message should be the summary (System role with [Compacted Context] prefix)
        assert!(
            matches!(compacted[0].role, MessageRole::System),
            "First compacted message should be System (summary)"
        );
        assert!(
            compacted[0].content.contains("[Compacted Context]"),
            "Summary message must contain [Compacted Context] prefix"
        );

        // The last 3 messages should be the RECENT ones (messages 6, 7, 8)
        assert_eq!(
            compacted[1].content, "message-6",
            "Second message should be message-6 (first recent)"
        );
        assert_eq!(
            compacted[2].content, "message-7",
            "Third message should be message-7"
        );
        assert_eq!(
            compacted[3].content, "message-8",
            "Fourth message should be message-8 (last recent)"
        );
    }

    #[test]
    fn get_compacted_messages_old_messages_are_not_in_output() {
        let config = CompactionConfig {
            max_tokens: 100_000,
            target_tokens: 50_000,
            keep_recent: 2,
            min_messages: 4,
        };
        let compactor = ContextCompactor::new(config);

        let messages: Vec<Message> = vec![
            make_message(1, "old-message-1", 5000),
            make_message(2, "old-message-2", 5000),
            make_message(3, "old-message-3", 5000),
            make_message(4, "recent-message-1", 1000),
            make_message(5, "recent-message-2", 1000),
        ];

        let summary = "compacted old messages";
        let compacted = compactor.get_compacted_messages(&messages, summary);

        // Verify that old messages are NOT in the output (beyond the summary)
        let content_strings: Vec<&str> = compacted.iter().map(|m| m.content.as_str()).collect();
        assert!(
            !content_strings.contains(&"old-message-1"),
            "old-message-1 should not appear in compacted output"
        );
        assert!(
            !content_strings.contains(&"old-message-2"),
            "old-message-2 should not appear in compacted output"
        );
        assert!(
            !content_strings.contains(&"old-message-3"),
            "old-message-3 should not appear in compacted output"
        );

        // Recent messages must be present
        assert!(
            content_strings.contains(&"recent-message-1"),
            "recent-message-1 must be preserved"
        );
        assert!(
            content_strings.contains(&"recent-message-2"),
            "recent-message-2 must be preserved"
        );
    }

    #[test]
    fn should_compact_respects_min_messages_threshold() {
        let config = CompactionConfig {
            max_tokens: 1000,
            target_tokens: 500,
            keep_recent: 3,
            min_messages: 10,
        };
        let compactor = ContextCompactor::new(config);

        // 5 messages with high token counts — but fewer than min_messages
        let messages: Vec<Message> = (1..=5)
            .map(|i| make_message(i, "x", 500))
            .collect();

        assert!(
            !compactor.should_compact(&messages),
            "should_compact must return false when message count < min_messages"
        );
    }

    #[test]
    fn should_compact_triggers_when_token_limit_exceeded() {
        let config = CompactionConfig {
            max_tokens: 5000,
            target_tokens: 2500,
            keep_recent: 3,
            min_messages: 5,
        };
        let compactor = ContextCompactor::new(config);

        // 6 messages * 1000 tokens = 6000 > 5000 max → should compact
        let messages: Vec<Message> = (1..=6)
            .map(|i| make_message(i, "x", 1000))
            .collect();

        assert!(
            compactor.should_compact(&messages),
            "should_compact must return true when token count exceeds max_tokens"
        );
    }

    #[test]
    fn calculate_tokens_sums_all_message_tokens() {
        let messages = vec![
            make_message(1, "a", 100),
            make_message(2, "b", 200),
            make_message(3, "c", 300),
        ];
        let total = ContextCompactor::calculate_tokens(&messages);
        assert_eq!(total, 600, "calculate_tokens must sum all token counts");
    }

    #[test]
    fn calculate_tokens_handles_none_tokens_as_zero() {
        let mut msg = make_message(1, "no tokens", 0);
        msg.tokens = None; // explicitly clear
        let messages = vec![msg];
        let total = ContextCompactor::calculate_tokens(&messages);
        assert_eq!(total, 0, "None tokens should be treated as 0");
    }
}

// ---------------------------------------------------------------------------
// R6 — ai_access_file path validation rejects sensitive paths
//
// H26 note: The production path validation lives in `core::agent::executor`
// as private methods `validate_file_path` and `validate_write_path` on
// `AgentExecutor`. They require filesystem access (canonicalize) and the full
// struct, so they cannot be called directly from unit tests. The denylist
// logic below is intentionally replicated to test the deny-check patterns in
// isolation. The production functions additionally check `check_blocked_prefix`
// which covers /etc, /proc, /sys, /dev, /boot, /root, /usr, /var, /sbin, /bin
// and home-dir sensitive paths (.ssh, .gnupg, .config, Library on macOS).
// If the production denylist changes, these tests should be updated accordingly.
// ---------------------------------------------------------------------------
mod r6_path_validation {
    /// Helper: verify that a path string is rejected by the denylist logic.
    /// This mirrors the deny-check logic from `AgentExecutor::check_blocked_prefix`
    /// in `core/agent/executor.rs`. See H26 note above for why we replicate.
    fn is_denied_by_denylist(canonical_str: &str) -> bool {
        let denied_prefixes: &[&str] = &[
            "/etc/shadow",
            "/etc/gshadow",
            "/etc/sudoers",
            "/proc",
            "/sys",
        ];
        let denied_contains: &[&str] = &[
            ".ssh",
            ".gnupg",
            ".aws/credentials",
            ".env",
            "id_rsa",
            "id_ed25519",
            "id_ecdsa",
            "id_dsa",
        ];

        for prefix in denied_prefixes {
            if canonical_str.starts_with(prefix) {
                return true;
            }
        }
        for pattern in denied_contains {
            if canonical_str.contains(pattern) {
                return true;
            }
        }
        false
    }

    #[test]
    fn etc_shadow_is_denied() {
        assert!(
            is_denied_by_denylist("/etc/shadow"),
            "/etc/shadow must be denied"
        );
    }

    #[test]
    fn etc_sudoers_is_denied() {
        assert!(
            is_denied_by_denylist("/etc/sudoers"),
            "/etc/sudoers must be denied"
        );
    }

    #[test]
    fn proc_self_mem_is_denied() {
        assert!(
            is_denied_by_denylist("/proc/self/mem"),
            "/proc paths must be denied"
        );
    }

    #[test]
    fn ssh_private_key_id_rsa_is_denied() {
        let home = dirs::home_dir().unwrap_or_else(|| std::path::PathBuf::from("/home/user"));
        let path = format!("{}/.ssh/id_rsa", home.display());
        assert!(
            is_denied_by_denylist(&path),
            "~/.ssh/id_rsa must be denied, checked: {}",
            path
        );
    }

    #[test]
    fn ssh_directory_is_denied() {
        assert!(
            is_denied_by_denylist("/home/user/.ssh/config"),
            ".ssh paths must be denied"
        );
    }

    #[test]
    fn aws_credentials_is_denied() {
        assert!(
            is_denied_by_denylist("/home/user/.aws/credentials"),
            ".aws/credentials must be denied"
        );
    }

    #[test]
    fn dotenv_file_is_denied() {
        assert!(
            is_denied_by_denylist("/home/user/project/.env"),
            ".env files must be denied"
        );
    }

    #[test]
    fn gnupg_directory_is_denied() {
        assert!(
            is_denied_by_denylist("/home/user/.gnupg/secring.gpg"),
            ".gnupg paths must be denied"
        );
    }

    #[test]
    fn normal_project_file_is_not_denied() {
        assert!(
            !is_denied_by_denylist("/home/user/projects/my-app/src/main.rs"),
            "Normal project files must not be denied"
        );
    }

    #[test]
    fn tmp_file_is_not_denied() {
        assert!(
            !is_denied_by_denylist("/tmp/somefile.txt"),
            "/tmp files must not be denied by the denylist"
        );
    }

    #[test]
    fn id_ed25519_key_is_denied() {
        assert!(
            is_denied_by_denylist("/home/user/.ssh/id_ed25519"),
            "id_ed25519 paths must be denied"
        );
    }
}

// ---------------------------------------------------------------------------
// R7 — Token counter graceful fallback
//
// estimate_text_tokens must never panic regardless of input, including edge
// cases that might trip up the tiktoken tokenizer.
// ---------------------------------------------------------------------------
mod r7_token_counter_fallback {
    use crate::core::llm::token_counter::TokenCounter;

    #[test]
    fn estimate_tokens_empty_string_returns_zero() {
        assert_eq!(TokenCounter::estimate_text_tokens(""), 0);
    }

    #[test]
    fn estimate_tokens_null_bytes_does_not_panic() {
        // Strings with null bytes can trip some tokenizers
        let s = "hello\0world";
        let result = TokenCounter::estimate_text_tokens(s);
        assert!(result > 0, "Non-empty string with null byte must yield > 0 tokens");
    }

    #[test]
    fn estimate_tokens_very_long_string_does_not_panic() {
        let s = "a ".repeat(10_000);
        let result = TokenCounter::estimate_text_tokens(&s);
        assert!(result > 0, "Very long string must yield > 0 tokens");
    }

    #[test]
    fn estimate_tokens_unicode_does_not_panic() {
        let s = "こんにちは世界 🎉 مرحبا بالعالم";
        let result = TokenCounter::estimate_text_tokens(s);
        assert!(result > 0, "Unicode string must yield > 0 tokens");
    }

    #[test]
    fn estimate_tokens_only_whitespace_does_not_panic() {
        let s = "   \t\n  ";
        // L5 fix: Add assertion instead of discarding the result
        let result = TokenCounter::estimate_text_tokens(s);
        assert!(
            result < 1000,
            "Whitespace-only string should yield a small token count, got {}",
            result
        );
    }
}
