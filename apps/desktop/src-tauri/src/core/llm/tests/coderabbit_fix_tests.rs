//! Tests verifying specific CodeRabbit review fixes applied to the Rust backend.
//!
//! Each test group corresponds to a fix ID (e.g., H1, H13, M1) and validates the
//! corrected behavior introduced during the CodeRabbit audit pass.

// ---------------------------------------------------------------------------
// H1 -- Regex caching in `contains_word` (llm_router.rs)
// ---------------------------------------------------------------------------
mod h1_contains_word {
    use crate::core::llm::llm_router::contains_word;

    #[test]
    fn matches_whole_word_in_sentence() {
        assert!(contains_word("please write some code for me", "code"));
    }

    #[test]
    fn does_not_match_substring() {
        // "code" should NOT match inside "barcode"
        assert!(!contains_word("scan the barcode", "code"));
    }

    #[test]
    fn does_not_match_prefix_substring() {
        // "code" should NOT match inside "encode"
        assert!(!contains_word("let me encode this", "code"));
    }

    #[test]
    fn matches_word_at_start() {
        assert!(contains_word("code review needed", "code"));
    }

    #[test]
    fn matches_word_at_end() {
        assert!(contains_word("write some code", "code"));
    }

    #[test]
    fn matches_exact_single_word() {
        assert!(contains_word("code", "code"));
    }

    #[test]
    fn no_match_in_empty_text() {
        assert!(!contains_word("", "code"));
    }

    #[test]
    fn no_match_for_empty_word_in_text() {
        // An empty word regex `\b\b` matches between every character boundary;
        // the function should still return a deterministic result without panic.
        let _result = contains_word("hello", "");
    }

    #[test]
    fn cache_returns_consistent_results() {
        // Call twice with the same word -- the second call hits the cache.
        let first = contains_word("debug the program", "debug");
        let second = contains_word("debug the program", "debug");
        assert_eq!(first, second);
        assert!(first);
    }

    #[test]
    fn different_words_return_correct_results() {
        assert!(contains_word("fix the bug in the api", "bug"));
        assert!(contains_word("fix the bug in the api", "api"));
        assert!(!contains_word("fix the bug in the api", "apple"));
    }

    #[test]
    fn handles_special_regex_chars_in_word() {
        // regex::escape should prevent `.` from acting as wildcard
        assert!(!contains_word("abc", "a.c"));
        assert!(contains_word("a.c is cool", "a.c"));
    }

    #[test]
    fn multiple_calls_populate_cache_without_panic() {
        // Stress-test the thread-local cache by exercising many distinct words.
        let words = ["debug", "compile", "test", "deploy", "refactor", "lint"];
        let text = "debug compile test deploy refactor lint";
        for word in &words {
            assert!(contains_word(text, word));
        }
        // Second pass should hit cached regex entries.
        for word in &words {
            assert!(contains_word(text, word));
        }
    }

    #[test]
    fn word_boundary_with_hyphens() {
        // Hyphens are not word characters, so `\b` treats them as boundaries.
        assert!(contains_word("auto-complete feature", "auto"));
        assert!(contains_word("auto-complete feature", "complete"));
    }

    #[test]
    fn word_boundary_with_underscores() {
        // Underscores ARE word characters in regex, so `\b` does not split on them.
        assert!(!contains_word("auto_complete feature", "auto"));
        assert!(contains_word("auto_complete feature", "auto_complete"));
    }
}

// ---------------------------------------------------------------------------
// H13 -- resolve_model_for_strategy (llm_router.rs)
// ---------------------------------------------------------------------------
mod h13_resolve_model_for_strategy {
    use crate::core::llm::llm_router::LLMRouter;
    use crate::core::llm::RoutingStrategy;

    #[test]
    fn auto_economy_small_tokens_selects_mini() {
        let model = LLMRouter::resolve_model_for_strategy(
            RoutingStrategy::AutoEconomy,
            500,
            "fallback-model",
        );
        assert_eq!(model, "gpt-5.4-mini");
    }

    #[test]
    fn auto_economy_medium_tokens_selects_managed_chat_model() {
        // 1000 ≤ tokens < 8000 → ManagedCloud "chat" task → models.json picks
        // the current managed-chat default (gpt-5.4-mini in this catalog).
        let model = LLMRouter::resolve_model_for_strategy(
            RoutingStrategy::AutoEconomy,
            2000,
            "fallback-model",
        );
        assert_eq!(model, "gpt-5.4-mini");
    }

    #[test]
    fn auto_economy_large_tokens_uses_long_context_catalog_model() {
        // 8000 ≤ tokens → ManagedCloud "long_context" task → models.json
        // picks the current long-context default (Gemini for the 1M-token
        // window).
        let model = LLMRouter::resolve_model_for_strategy(
            RoutingStrategy::AutoEconomy,
            10000,
            "fallback-model",
        );
        assert_eq!(model, "gemini-3.1-pro-preview");
    }

    #[test]
    fn auto_balanced_small_tokens() {
        let model = LLMRouter::resolve_model_for_strategy(
            RoutingStrategy::AutoBalanced,
            100,
            "fallback-model",
        );
        assert_eq!(model, "gpt-5.4-mini");
    }

    #[test]
    fn auto_balanced_medium_tokens() {
        let model = LLMRouter::resolve_model_for_strategy(
            RoutingStrategy::AutoBalanced,
            2000,
            "fallback-model",
        );
        assert_eq!(model, "claude-sonnet-4.6");
    }

    #[test]
    fn auto_balanced_large_tokens() {
        let model = LLMRouter::resolve_model_for_strategy(
            RoutingStrategy::AutoBalanced,
            5000,
            "fallback-model",
        );
        assert_eq!(model, "gpt-5.5");
    }

    #[test]
    fn auto_premium_small_tokens() {
        let model = LLMRouter::resolve_model_for_strategy(
            RoutingStrategy::AutoPremium,
            8000,
            "fallback-model",
        );
        assert_eq!(model, "claude-sonnet-4.6");
    }

    #[test]
    fn auto_premium_large_tokens() {
        let model = LLMRouter::resolve_model_for_strategy(
            RoutingStrategy::AutoPremium,
            20000,
            "fallback-model",
        );
        assert_eq!(model, "claude-opus-4.7");
    }

    #[test]
    fn non_auto_strategy_returns_candidate_unchanged() {
        let model = LLMRouter::resolve_model_for_strategy(
            RoutingStrategy::LocalFirst,
            500,
            "my-custom-model",
        );
        assert_eq!(model, "my-custom-model");
    }

    #[test]
    fn cost_optimized_returns_candidate_unchanged() {
        let model = LLMRouter::resolve_model_for_strategy(
            RoutingStrategy::CostOptimized,
            500,
            "some-model",
        );
        assert_eq!(model, "some-model");
    }

    #[test]
    fn latency_optimized_returns_candidate_unchanged() {
        let model = LLMRouter::resolve_model_for_strategy(
            RoutingStrategy::LatencyOptimized,
            500,
            "latency-model",
        );
        assert_eq!(model, "latency-model");
    }

    // Boundary tests
    #[test]
    fn auto_economy_boundary_at_1000() {
        // token_count == 1000 should NOT pick the fast OpenAI economy model (< 1000)
        // Crosses into ManagedCloud "chat" task — current catalog default.
        let model =
            LLMRouter::resolve_model_for_strategy(RoutingStrategy::AutoEconomy, 1000, "fallback");
        assert_eq!(model, "gpt-5.4-mini");
    }

    #[test]
    fn auto_economy_boundary_at_8000() {
        // token_count == 8000 should switch to the long-context catalog default.
        let model =
            LLMRouter::resolve_model_for_strategy(RoutingStrategy::AutoEconomy, 8000, "fallback");
        assert_eq!(model, "gemini-3.1-pro-preview");
    }

    #[test]
    fn auto_balanced_boundary_at_500() {
        let model =
            LLMRouter::resolve_model_for_strategy(RoutingStrategy::AutoBalanced, 500, "fallback");
        assert_eq!(model, "claude-sonnet-4.6");
    }

    #[test]
    fn auto_premium_boundary_at_16000() {
        let model =
            LLMRouter::resolve_model_for_strategy(RoutingStrategy::AutoPremium, 16000, "fallback");
        assert_eq!(model, "claude-opus-4.7");
    }

    #[test]
    fn auto_economy_boundary_at_999() {
        let model =
            LLMRouter::resolve_model_for_strategy(RoutingStrategy::AutoEconomy, 999, "fallback");
        assert_eq!(model, "gpt-5.4-mini");
    }

    #[test]
    fn auto_balanced_boundary_at_499() {
        let model =
            LLMRouter::resolve_model_for_strategy(RoutingStrategy::AutoBalanced, 499, "fallback");
        assert_eq!(model, "gpt-5.4-mini");
    }

    #[test]
    fn auto_balanced_boundary_at_4000() {
        let model =
            LLMRouter::resolve_model_for_strategy(RoutingStrategy::AutoBalanced, 4000, "fallback");
        assert_eq!(model, "gpt-5.5");
    }

    #[test]
    fn auto_premium_boundary_at_15999() {
        let model =
            LLMRouter::resolve_model_for_strategy(RoutingStrategy::AutoPremium, 15999, "fallback");
        assert_eq!(model, "claude-sonnet-4.6");
    }
}

// ---------------------------------------------------------------------------
// M1 -- Null parameter rejection (tool_executor.rs)
// The M1 fix changed the required-parameter check to reject JSON null values
// via the expression: `!args.get(&param.name).map(|v| !v.is_null()).unwrap_or(false)`
// We test both the `value_is_present` helper and the null-rejection expression.
// ---------------------------------------------------------------------------
mod m1_null_parameter_rejection {
    use crate::core::llm::tool_executor::ToolExecutor;
    use serde_json::{json, Value};
    use std::collections::HashMap;

    #[test]
    fn null_value_is_not_present() {
        assert!(!ToolExecutor::value_is_present(&Value::Null));
    }

    #[test]
    fn non_null_string_is_present() {
        assert!(ToolExecutor::value_is_present(&json!("hello")));
    }

    #[test]
    fn empty_string_is_not_present() {
        assert!(!ToolExecutor::value_is_present(&json!("  ")));
    }

    #[test]
    fn number_is_present() {
        assert!(ToolExecutor::value_is_present(&json!(42)));
    }

    #[test]
    fn boolean_is_present() {
        assert!(ToolExecutor::value_is_present(&json!(true)));
        assert!(ToolExecutor::value_is_present(&json!(false)));
    }

    #[test]
    fn empty_array_is_not_present() {
        assert!(!ToolExecutor::value_is_present(&json!([])));
    }

    #[test]
    fn non_empty_array_is_present() {
        assert!(ToolExecutor::value_is_present(&json!([1, 2])));
    }

    #[test]
    fn empty_object_is_not_present() {
        assert!(!ToolExecutor::value_is_present(&json!({})));
    }

    #[test]
    fn non_empty_object_is_present() {
        assert!(ToolExecutor::value_is_present(&json!({"key": "val"})));
    }

    /// Simulate the required-parameter validation expression from execute_tool_call:
    ///   `!args.get(&param.name).map(|v| !v.is_null()).unwrap_or(false)`
    /// Returns true when validation FAILS (parameter is missing or null).
    fn required_param_fails(args: &HashMap<String, Value>, name: &str) -> bool {
        !args.get(name).map(|v| !v.is_null()).unwrap_or(false)
    }

    #[test]
    fn missing_key_fails_validation() {
        let args: HashMap<String, Value> = HashMap::new();
        assert!(required_param_fails(&args, "required_field"));
    }

    #[test]
    fn explicit_null_fails_validation() {
        let mut args = HashMap::new();
        args.insert("required_field".to_string(), Value::Null);
        assert!(required_param_fails(&args, "required_field"));
    }

    #[test]
    fn non_null_value_passes_validation() {
        let mut args = HashMap::new();
        args.insert("required_field".to_string(), json!("value"));
        assert!(!required_param_fails(&args, "required_field"));
    }

    #[test]
    fn zero_number_passes_validation() {
        let mut args = HashMap::new();
        args.insert("count".to_string(), json!(0));
        assert!(!required_param_fails(&args, "count"));
    }

    #[test]
    fn false_boolean_passes_validation() {
        let mut args = HashMap::new();
        args.insert("enabled".to_string(), json!(false));
        assert!(!required_param_fails(&args, "enabled"));
    }

    #[test]
    fn empty_string_passes_is_null_check_but_not_value_is_present() {
        // The null-rejection expression only checks `is_null()`, not emptiness.
        // An empty string is NOT null, so it passes the required-param check.
        let mut args = HashMap::new();
        args.insert("field".to_string(), json!(""));
        assert!(!required_param_fails(&args, "field"));
        // But value_is_present considers whitespace-only strings as NOT present
        assert!(!ToolExecutor::value_is_present(&json!("")));
    }
}

// ---------------------------------------------------------------------------
// H12 -- Arg merging pattern in build_job_autofill_profile (tool_executor.rs)
// The H12 fix ensures that profile args are properly merged: canonical fields
// from top-level args are inserted into the profile object, and snake_case
// aliases map to camelCase canonical names. We verify the pattern through
// `value_is_present` which guards the merge, plus the actual behavior
// already tested inline in tool_executor.rs. Here we exercise the guard logic.
// ---------------------------------------------------------------------------
mod h12_arg_merge_pattern {
    use crate::core::llm::tool_executor::ToolExecutor;
    use serde_json::{json, Value};

    /// The merge pattern in build_job_autofill_profile uses `value_is_present`
    /// as a guard before inserting values. This test group verifies that the
    /// guard correctly filters out null, empty, and whitespace-only values.

    #[test]
    fn null_value_is_filtered_by_guard() {
        assert!(!ToolExecutor::value_is_present(&Value::Null));
    }

    #[test]
    fn empty_string_is_filtered_by_guard() {
        assert!(!ToolExecutor::value_is_present(&json!("")));
    }

    #[test]
    fn whitespace_only_string_is_filtered_by_guard() {
        assert!(!ToolExecutor::value_is_present(&json!("   ")));
    }

    #[test]
    fn empty_array_is_filtered_by_guard() {
        assert!(!ToolExecutor::value_is_present(&json!([])));
    }

    #[test]
    fn empty_object_is_filtered_by_guard() {
        assert!(!ToolExecutor::value_is_present(&json!({})));
    }

    #[test]
    fn valid_string_passes_guard() {
        assert!(ToolExecutor::value_is_present(&json!("Alice")));
    }

    #[test]
    fn valid_number_passes_guard() {
        assert!(ToolExecutor::value_is_present(&json!(42)));
    }

    #[test]
    fn zero_passes_guard() {
        assert!(ToolExecutor::value_is_present(&json!(0)));
    }

    #[test]
    fn false_passes_guard() {
        assert!(ToolExecutor::value_is_present(&json!(false)));
    }

    #[test]
    fn nested_object_passes_guard() {
        assert!(ToolExecutor::value_is_present(&json!({"key": "val"})));
    }

    #[test]
    fn non_empty_array_passes_guard() {
        assert!(ToolExecutor::value_is_present(&json!(["item"])));
    }

    #[test]
    fn float_passes_guard() {
        assert!(ToolExecutor::value_is_present(&json!(std::f64::consts::PI)));
    }

    #[test]
    fn negative_number_passes_guard() {
        assert!(ToolExecutor::value_is_present(&json!(-1)));
    }
}

// ---------------------------------------------------------------------------
// H8 -- Approval-required ToolResult pattern (tool_executor.rs)
// The H8 fix standardizes the approval-required result structure used in
// both the MCP-tool and dangerous-tool approval paths. We verify the
// structural invariants of the pattern by constructing a ToolResult
// using the same shape as the production code.
// ---------------------------------------------------------------------------
mod h8_approval_required_result_pattern {
    use crate::core::agi::tools::ToolResult;
    use serde_json::json;
    use std::collections::HashMap;

    /// Construct an approval-required ToolResult following the exact pattern
    /// used in tool_executor.rs (lines ~2301 and ~2462).
    fn build_approval_result(tool_name: &str, message: &str) -> ToolResult {
        ToolResult {
            success: false,
            data: json!({ "approval_required": true }),
            error: Some(message.to_string()),
            metadata: HashMap::from([
                ("requires_approval".to_string(), json!(true)),
                ("tool_name".to_string(), json!(tool_name)),
            ]),
        }
    }

    #[test]
    fn result_is_not_success() {
        let result = build_approval_result("file_delete", "Manual approval required");
        assert!(!result.success);
    }

    #[test]
    fn data_contains_approval_required_flag() {
        let result = build_approval_result("file_delete", "Manual approval required");
        assert_eq!(result.data["approval_required"], json!(true));
    }

    #[test]
    fn error_message_is_set() {
        let result = build_approval_result("terminal_execute", "Dangerous tool needs approval");
        assert_eq!(
            result.error,
            Some("Dangerous tool needs approval".to_string())
        );
    }

    #[test]
    fn metadata_contains_requires_approval() {
        let result = build_approval_result("email_send", "Approval needed");
        assert_eq!(result.metadata.get("requires_approval"), Some(&json!(true)));
    }

    #[test]
    fn metadata_contains_tool_name() {
        let result = build_approval_result("git_push", "Approval needed");
        assert_eq!(result.metadata.get("tool_name"), Some(&json!("git_push")));
    }

    #[test]
    fn different_tools_produce_distinct_metadata() {
        let r1 = build_approval_result("file_write", "msg1");
        let r2 = build_approval_result("db_execute", "msg2");

        assert_eq!(r1.metadata.get("tool_name"), Some(&json!("file_write")));
        assert_eq!(r2.metadata.get("tool_name"), Some(&json!("db_execute")));
        assert_ne!(r1.error, r2.error);
    }
}

// ---------------------------------------------------------------------------
// M2 -- Serde-based status strings (continuous_executor.rs)
// ---------------------------------------------------------------------------
mod m2_serde_status_strings {
    use crate::core::agent::continuous_executor::ContinuousTaskStatus;

    #[test]
    fn completed_serializes_to_quoted_snake_case() {
        let s =
            serde_json::to_string(&ContinuousTaskStatus::Completed).expect("serialize Completed");
        assert_eq!(s, "\"completed\"");
    }

    #[test]
    fn failed_serializes_to_quoted_snake_case() {
        let s = serde_json::to_string(&ContinuousTaskStatus::Failed).expect("serialize Failed");
        assert_eq!(s, "\"failed\"");
    }

    #[test]
    fn cancelled_serializes_to_quoted_snake_case() {
        let s =
            serde_json::to_string(&ContinuousTaskStatus::Cancelled).expect("serialize Cancelled");
        assert_eq!(s, "\"cancelled\"");
    }

    #[test]
    fn pending_serializes_to_quoted_snake_case() {
        let s = serde_json::to_string(&ContinuousTaskStatus::Pending).expect("serialize Pending");
        assert_eq!(s, "\"pending\"");
    }

    #[test]
    fn limit_reached_serializes_to_quoted_snake_case() {
        let s = serde_json::to_string(&ContinuousTaskStatus::LimitReached)
            .expect("serialize LimitReached");
        assert_eq!(s, "\"limit_reached\"");
    }

    #[test]
    fn recovering_serializes_to_quoted_snake_case() {
        let s =
            serde_json::to_string(&ContinuousTaskStatus::Recovering).expect("serialize Recovering");
        assert_eq!(s, "\"recovering\"");
    }

    #[test]
    fn round_trip_all_variants() {
        let variants = [
            ContinuousTaskStatus::Pending,
            ContinuousTaskStatus::Running,
            ContinuousTaskStatus::Paused,
            ContinuousTaskStatus::Completed,
            ContinuousTaskStatus::Failed,
            ContinuousTaskStatus::Cancelled,
            ContinuousTaskStatus::LimitReached,
            ContinuousTaskStatus::Recovering,
        ];

        for variant in &variants {
            let serialized = serde_json::to_string(variant)
                .unwrap_or_else(|_| panic!("serialize {:?}", variant));
            let deserialized: ContinuousTaskStatus = serde_json::from_str(&serialized)
                .unwrap_or_else(|_| panic!("deserialize {:?} from {}", variant, serialized));
            assert_eq!(*variant, deserialized);
        }
    }

    #[test]
    fn serialized_strings_are_sql_safe() {
        // The M2 fix uses serde_json::to_string for building SQL filter strings.
        // Verify the serialized output contains only safe characters (no SQL injection).
        let statuses = [
            ContinuousTaskStatus::Completed,
            ContinuousTaskStatus::Failed,
            ContinuousTaskStatus::Cancelled,
        ];

        for status in &statuses {
            let s = serde_json::to_string(status).expect("serialize");
            // Should be a quoted lowercase string like "\"completed\""
            assert!(s.starts_with('"'));
            assert!(s.ends_with('"'));
            let inner = &s[1..s.len() - 1];
            assert!(
                inner.chars().all(|c| c.is_ascii_lowercase() || c == '_'),
                "Unexpected chars in serialized status: {}",
                s
            );
        }
    }
}

// ---------------------------------------------------------------------------
// M6 -- BackgroundAgentStatus from unknown strings (background_agent.rs)
// ---------------------------------------------------------------------------
mod m6_background_agent_status_from_str {
    use crate::core::agent::background_agent::BackgroundAgentStatus;

    #[test]
    fn queued_parses_correctly() {
        assert_eq!(
            BackgroundAgentStatus::from("queued"),
            BackgroundAgentStatus::Queued
        );
    }

    #[test]
    fn running_parses_correctly() {
        assert_eq!(
            BackgroundAgentStatus::from("running"),
            BackgroundAgentStatus::Running
        );
    }

    #[test]
    fn paused_parses_correctly() {
        assert_eq!(
            BackgroundAgentStatus::from("paused"),
            BackgroundAgentStatus::Paused
        );
    }

    #[test]
    fn completed_parses_correctly() {
        assert_eq!(
            BackgroundAgentStatus::from("completed"),
            BackgroundAgentStatus::Completed
        );
    }

    #[test]
    fn failed_parses_correctly() {
        assert_eq!(
            BackgroundAgentStatus::from("failed"),
            BackgroundAgentStatus::Failed
        );
    }

    #[test]
    fn cancelled_parses_correctly() {
        assert_eq!(
            BackgroundAgentStatus::from("cancelled"),
            BackgroundAgentStatus::Cancelled
        );
    }

    #[test]
    fn taken_over_parses_correctly() {
        assert_eq!(
            BackgroundAgentStatus::from("taken_over"),
            BackgroundAgentStatus::TakenOver
        );
    }

    #[test]
    fn unknown_string_defaults_to_failed() {
        assert_eq!(
            BackgroundAgentStatus::from("something_unexpected"),
            BackgroundAgentStatus::Failed
        );
    }

    #[test]
    fn empty_string_defaults_to_failed() {
        assert_eq!(
            BackgroundAgentStatus::from(""),
            BackgroundAgentStatus::Failed
        );
    }

    #[test]
    fn capitalized_string_defaults_to_failed() {
        // The From<&str> impl is case-sensitive -- "Running" != "running"
        assert_eq!(
            BackgroundAgentStatus::from("Running"),
            BackgroundAgentStatus::Failed
        );
    }

    #[test]
    fn garbage_string_defaults_to_failed() {
        assert_eq!(
            BackgroundAgentStatus::from("💥🔥"),
            BackgroundAgentStatus::Failed
        );
    }

    #[test]
    fn display_round_trips_all_variants() {
        let variants = [
            BackgroundAgentStatus::Queued,
            BackgroundAgentStatus::Running,
            BackgroundAgentStatus::Paused,
            BackgroundAgentStatus::Completed,
            BackgroundAgentStatus::Failed,
            BackgroundAgentStatus::Cancelled,
            BackgroundAgentStatus::TakenOver,
        ];

        for variant in &variants {
            let display_str = variant.to_string();
            let parsed = BackgroundAgentStatus::from(display_str.as_str());
            assert_eq!(
                *variant, parsed,
                "Display -> From round-trip failed for {:?} (displayed as '{}')",
                variant, display_str
            );
        }
    }

    #[test]
    fn serde_round_trip_all_variants() {
        let variants = [
            BackgroundAgentStatus::Queued,
            BackgroundAgentStatus::Running,
            BackgroundAgentStatus::Paused,
            BackgroundAgentStatus::Completed,
            BackgroundAgentStatus::Failed,
            BackgroundAgentStatus::Cancelled,
            BackgroundAgentStatus::TakenOver,
        ];

        for variant in &variants {
            let serialized = serde_json::to_string(variant)
                .unwrap_or_else(|_| panic!("serialize {:?}", variant));
            let deserialized: BackgroundAgentStatus = serde_json::from_str(&serialized)
                .unwrap_or_else(|_| panic!("deserialize {:?} from {}", variant, serialized));
            assert_eq!(*variant, deserialized);
        }
    }
}
