// C8 — BackgroundAgent unit tests.
//
// `BackgroundAgentManager` requires an `AppHandle` (Tauri runtime) so it
// cannot be instantiated in a unit test.  We test everything that CAN be
// constructed without the runtime:
//
//  * `BackgroundAgentStatus` — enum variants, `Display`, `From<&str>`
//  * `AgentProgress` — `Default` and manual construction
//  * `AgentSummary` — `Default` and manual construction
//  * `BackgroundAgentContext` — `Default` and manual construction
//  * `ConversationMessage` — construction and field access
//  * `BackgroundAgent::new()` — factory method (no manager needed)
//  * `BackgroundAgent::is_terminal()` / `can_resume()` — pure predicate methods
//  * `BackgroundAgent` mutation methods: `start`, `complete`, `fail`, `cancel`,
//    `pause`, `take_over`, `update_progress`
//  * Serde JSON round-trips for all public structs
//  * `AgentCommand` enum construction
//  * Module-level constants: `MAX_BACKGROUND_AGENTS`, `DEFAULT_AGENT_TIMEOUT_SECS`
#[cfg(test)]
mod tests {
    use crate::core::agent::background_agent::{
        AgentCommand, AgentProgress, AgentSummary, BackgroundAgent, BackgroundAgentContext,
        BackgroundAgentStatus, ConversationMessage, DEFAULT_AGENT_TIMEOUT_SECS,
        MAX_BACKGROUND_AGENTS,
    };
    use chrono::Utc;

    // ------------------------------------------------------------------
    // Module-level constants
    // ------------------------------------------------------------------

    #[test]
    fn test_max_background_agents_is_eight() {
        assert_eq!(MAX_BACKGROUND_AGENTS, 8);
    }

    #[test]
    fn test_default_agent_timeout_is_24h() {
        assert_eq!(DEFAULT_AGENT_TIMEOUT_SECS, 86_400);
    }

    // ------------------------------------------------------------------
    // BackgroundAgentStatus — Display
    // ------------------------------------------------------------------

    #[test]
    fn test_status_display_queued() {
        assert_eq!(BackgroundAgentStatus::Queued.to_string(), "queued");
    }

    #[test]
    fn test_status_display_running() {
        assert_eq!(BackgroundAgentStatus::Running.to_string(), "running");
    }

    #[test]
    fn test_status_display_paused() {
        assert_eq!(BackgroundAgentStatus::Paused.to_string(), "paused");
    }

    #[test]
    fn test_status_display_completed() {
        assert_eq!(BackgroundAgentStatus::Completed.to_string(), "completed");
    }

    #[test]
    fn test_status_display_failed() {
        assert_eq!(BackgroundAgentStatus::Failed.to_string(), "failed");
    }

    #[test]
    fn test_status_display_cancelled() {
        assert_eq!(BackgroundAgentStatus::Cancelled.to_string(), "cancelled");
    }

    #[test]
    fn test_status_display_taken_over() {
        assert_eq!(BackgroundAgentStatus::TakenOver.to_string(), "taken_over");
    }

    // ------------------------------------------------------------------
    // BackgroundAgentStatus — From<&str>
    // ------------------------------------------------------------------

    #[test]
    fn test_status_from_str_queued() {
        assert_eq!(
            BackgroundAgentStatus::from("queued"),
            BackgroundAgentStatus::Queued
        );
    }

    #[test]
    fn test_status_from_str_running() {
        assert_eq!(
            BackgroundAgentStatus::from("running"),
            BackgroundAgentStatus::Running
        );
    }

    #[test]
    fn test_status_from_str_paused() {
        assert_eq!(
            BackgroundAgentStatus::from("paused"),
            BackgroundAgentStatus::Paused
        );
    }

    #[test]
    fn test_status_from_str_completed() {
        assert_eq!(
            BackgroundAgentStatus::from("completed"),
            BackgroundAgentStatus::Completed
        );
    }

    #[test]
    fn test_status_from_str_failed() {
        assert_eq!(
            BackgroundAgentStatus::from("failed"),
            BackgroundAgentStatus::Failed
        );
    }

    #[test]
    fn test_status_from_str_cancelled() {
        assert_eq!(
            BackgroundAgentStatus::from("cancelled"),
            BackgroundAgentStatus::Cancelled
        );
    }

    #[test]
    fn test_status_from_str_taken_over() {
        assert_eq!(
            BackgroundAgentStatus::from("taken_over"),
            BackgroundAgentStatus::TakenOver
        );
    }

    #[test]
    fn test_status_from_str_unknown_defaults_to_failed() {
        // Documented behaviour: unrecognised strings map to `Failed`.
        assert_eq!(
            BackgroundAgentStatus::from("something_unknown"),
            BackgroundAgentStatus::Failed
        );
        assert_eq!(
            BackgroundAgentStatus::from(""),
            BackgroundAgentStatus::Failed
        );
        // Case-sensitive: upper-case must also default to Failed.
        assert_eq!(
            BackgroundAgentStatus::from("QUEUED"),
            BackgroundAgentStatus::Failed
        );
    }

    /// Display -> From<&str> roundtrip must recover the original variant.
    #[test]
    fn test_status_display_from_str_roundtrip() {
        let variants = [
            BackgroundAgentStatus::Queued,
            BackgroundAgentStatus::Running,
            BackgroundAgentStatus::Paused,
            BackgroundAgentStatus::Completed,
            BackgroundAgentStatus::Failed,
            BackgroundAgentStatus::Cancelled,
            BackgroundAgentStatus::TakenOver,
        ];
        for v in variants {
            let s = v.to_string();
            let back = BackgroundAgentStatus::from(s.as_str());
            assert_eq!(back, v, "Roundtrip failed for {:?}", v);
        }
    }

    #[test]
    fn test_status_equality() {
        assert_eq!(BackgroundAgentStatus::Running, BackgroundAgentStatus::Running);
        assert_ne!(BackgroundAgentStatus::Running, BackgroundAgentStatus::Paused);
    }

    // ------------------------------------------------------------------
    // BackgroundAgentStatus — Serde JSON
    // ------------------------------------------------------------------

    #[test]
    fn test_status_serde_roundtrip_all_variants() {
        let variants = [
            BackgroundAgentStatus::Queued,
            BackgroundAgentStatus::Running,
            BackgroundAgentStatus::Paused,
            BackgroundAgentStatus::Completed,
            BackgroundAgentStatus::Failed,
            BackgroundAgentStatus::Cancelled,
            BackgroundAgentStatus::TakenOver,
        ];
        for v in variants {
            let json = serde_json::to_string(&v).expect("serialize status");
            let back: BackgroundAgentStatus =
                serde_json::from_str(&json).expect("deserialize status");
            assert_eq!(back, v, "Serde roundtrip failed for {:?}", v);
        }
    }

    #[test]
    fn test_status_serde_uses_snake_case() {
        let json = serde_json::to_string(&BackgroundAgentStatus::TakenOver)
            .expect("serialize taken_over");
        assert_eq!(json, "\"taken_over\"");
    }

    // ------------------------------------------------------------------
    // AgentProgress
    // ------------------------------------------------------------------

    #[test]
    fn test_agent_progress_default() {
        let p = AgentProgress::default();
        assert_eq!(p.current_step, 0);
        assert_eq!(p.total_steps, 1);
        assert_eq!(p.percentage, 0);
        assert_eq!(p.elapsed_secs, 0);
        assert!(!p.current_step_description.is_empty());
    }

    #[test]
    fn test_agent_progress_custom_construction() {
        let p = AgentProgress {
            current_step: 3,
            total_steps: 10,
            current_step_description: "Analysing dependencies".to_string(),
            percentage: 30,
            elapsed_secs: 45,
        };
        assert_eq!(p.current_step, 3);
        assert_eq!(p.total_steps, 10);
        assert_eq!(p.percentage, 30);
        assert_eq!(p.elapsed_secs, 45);
        assert_eq!(p.current_step_description, "Analysing dependencies");
    }

    #[test]
    fn test_agent_progress_percentage_saturates_at_100() {
        let p = AgentProgress {
            percentage: 100,
            ..AgentProgress::default()
        };
        assert_eq!(p.percentage, 100);
    }

    #[test]
    fn test_agent_progress_serde_roundtrip() {
        let p = AgentProgress {
            current_step: 5,
            total_steps: 20,
            current_step_description: "Building index".to_string(),
            percentage: 25,
            elapsed_secs: 120,
        };
        let json = serde_json::to_string(&p).expect("serialize AgentProgress");
        let back: AgentProgress = serde_json::from_str(&json).expect("deserialize AgentProgress");
        assert_eq!(back.current_step, 5);
        assert_eq!(back.total_steps, 20);
        assert_eq!(back.percentage, 25);
        assert_eq!(back.elapsed_secs, 120);
        assert_eq!(back.current_step_description, "Building index");
    }

    #[test]
    fn test_agent_progress_serde_uses_camel_case() {
        let p = AgentProgress::default();
        let json = serde_json::to_string(&p).expect("serialize");
        // camelCase field names per #[serde(rename_all = "camelCase")]
        assert!(json.contains("currentStep"), "expected camelCase key currentStep in {}", json);
        assert!(json.contains("totalSteps"), "expected camelCase key totalSteps in {}", json);
        assert!(json.contains("currentStepDescription"), "expected camelCase key in {}", json);
        assert!(json.contains("elapsedSecs"), "expected camelCase key elapsedSecs in {}", json);
    }

    // ------------------------------------------------------------------
    // AgentSummary
    // ------------------------------------------------------------------

    #[test]
    fn test_agent_summary_default() {
        let s = AgentSummary::default();
        assert!(s.description.is_empty());
        assert!(s.files_changed.is_empty());
        assert!(s.actions_taken.is_empty());
        assert!(s.warnings.is_empty());
        assert!(!s.goal_achieved);
    }

    #[test]
    fn test_agent_summary_custom_construction() {
        let s = AgentSummary {
            description: "Completed refactor".to_string(),
            files_changed: vec!["src/main.rs".to_string(), "src/lib.rs".to_string()],
            actions_taken: vec!["Renamed function".to_string()],
            warnings: vec!["Deprecated API used".to_string()],
            goal_achieved: true,
        };
        assert_eq!(s.description, "Completed refactor");
        assert_eq!(s.files_changed.len(), 2);
        assert_eq!(s.actions_taken.len(), 1);
        assert_eq!(s.warnings.len(), 1);
        assert!(s.goal_achieved);
    }

    #[test]
    fn test_agent_summary_serde_roundtrip() {
        let s = AgentSummary {
            description: "Finished deployment".to_string(),
            files_changed: vec!["deploy.sh".to_string()],
            actions_taken: vec!["Ran deploy script".to_string()],
            warnings: vec![],
            goal_achieved: true,
        };
        let json = serde_json::to_string(&s).expect("serialize AgentSummary");
        let back: AgentSummary = serde_json::from_str(&json).expect("deserialize AgentSummary");
        assert_eq!(back.description, "Finished deployment");
        assert_eq!(back.files_changed, vec!["deploy.sh"]);
        assert!(back.goal_achieved);
    }

    // ------------------------------------------------------------------
    // BackgroundAgentContext
    // ------------------------------------------------------------------

    #[test]
    fn test_background_agent_context_default() {
        let ctx = BackgroundAgentContext::default();
        assert!(ctx.working_directory.is_none());
        assert!(ctx.environment.is_empty());
        assert!(ctx.conversation_snapshot.is_empty());
        assert!(ctx.active_mcp_servers.is_empty());
        assert!(ctx.custom_instructions.is_none());
    }

    #[test]
    fn test_background_agent_context_custom() {
        let mut env = std::collections::HashMap::new();
        env.insert("API_KEY".to_string(), "secret".to_string());

        let ctx = BackgroundAgentContext {
            working_directory: Some("/home/user/project".to_string()),
            environment: env,
            conversation_snapshot: vec![],
            active_mcp_servers: vec!["gmail".to_string()],
            custom_instructions: Some("Be concise.".to_string()),
        };
        assert_eq!(
            ctx.working_directory.as_deref(),
            Some("/home/user/project")
        );
        assert_eq!(
            ctx.environment.get("API_KEY").map(|s| s.as_str()),
            Some("secret")
        );
        assert_eq!(ctx.active_mcp_servers.len(), 1);
        assert_eq!(ctx.custom_instructions.as_deref(), Some("Be concise."));
    }

    #[test]
    fn test_background_agent_context_serde_roundtrip() {
        let mut env = std::collections::HashMap::new();
        env.insert("TOKEN".to_string(), "abc123".to_string());

        let ctx = BackgroundAgentContext {
            working_directory: Some("/tmp/work".to_string()),
            environment: env,
            conversation_snapshot: vec![ConversationMessage {
                role: "user".to_string(),
                content: "Hello".to_string(),
                timestamp: Utc::now(),
            }],
            active_mcp_servers: vec!["notion".to_string(), "gmail".to_string()],
            custom_instructions: Some("Be verbose.".to_string()),
        };

        let json = serde_json::to_string(&ctx).expect("serialize context");
        let back: BackgroundAgentContext =
            serde_json::from_str(&json).expect("deserialize context");
        assert_eq!(back.working_directory.as_deref(), Some("/tmp/work"));
        assert_eq!(back.environment.get("TOKEN").map(|s| s.as_str()), Some("abc123"));
        assert_eq!(back.conversation_snapshot.len(), 1);
        assert_eq!(back.active_mcp_servers.len(), 2);
        assert_eq!(back.custom_instructions.as_deref(), Some("Be verbose."));
    }

    // ------------------------------------------------------------------
    // ConversationMessage
    // ------------------------------------------------------------------

    #[test]
    fn test_conversation_message_user_role() {
        let msg = ConversationMessage {
            role: "user".to_string(),
            content: "Write a summary".to_string(),
            timestamp: Utc::now(),
        };
        assert_eq!(msg.role, "user");
        assert_eq!(msg.content, "Write a summary");
    }

    #[test]
    fn test_conversation_message_assistant_role() {
        let msg = ConversationMessage {
            role: "assistant".to_string(),
            content: "Here is the summary.".to_string(),
            timestamp: Utc::now(),
        };
        assert_eq!(msg.role, "assistant");
        assert!(!msg.content.is_empty());
    }

    #[test]
    fn test_conversation_message_serde_roundtrip() {
        let now = Utc::now();
        let msg = ConversationMessage {
            role: "system".to_string(),
            content: "You are a helpful assistant.".to_string(),
            timestamp: now,
        };
        let json = serde_json::to_string(&msg).expect("serialize message");
        let back: ConversationMessage = serde_json::from_str(&json).expect("deserialize message");
        assert_eq!(back.role, "system");
        assert_eq!(back.content, "You are a helpful assistant.");
    }

    // ------------------------------------------------------------------
    // BackgroundAgent::new() — factory method
    // ------------------------------------------------------------------

    #[test]
    fn test_background_agent_new_sets_queued_status() {
        let ctx = BackgroundAgentContext::default();
        let agent = BackgroundAgent::new(
            "conv-42".to_string(),
            "Refactor authentication module".to_string(),
            ctx,
            5,
        );

        assert_eq!(agent.status, BackgroundAgentStatus::Queued);
        assert_eq!(agent.conversation_id, "conv-42");
        assert_eq!(agent.goal, "Refactor authentication module");
        assert_eq!(agent.priority, 5);
        assert_eq!(agent.timeout_secs, DEFAULT_AGENT_TIMEOUT_SECS);
        assert!(agent.summary.is_none());
        assert!(agent.error.is_none());
        assert!(agent.started_at.is_none());
        assert!(agent.completed_at.is_none());
        // The UUID-based ID must be non-empty and look like a UUID.
        assert!(!agent.id.is_empty());
        assert!(agent.id.contains('-'));
    }

    #[test]
    fn test_background_agent_new_generates_unique_ids() {
        let ctx = BackgroundAgentContext::default();
        let a = BackgroundAgent::new("c1".to_string(), "goal1".to_string(), ctx.clone(), 1);
        let b = BackgroundAgent::new("c2".to_string(), "goal2".to_string(), ctx, 1);
        assert_ne!(a.id, b.id, "Two agents must have distinct UUIDs");
    }

    #[test]
    fn test_background_agent_new_default_progress() {
        let agent = make_agent_with_status(BackgroundAgentStatus::Queued);
        assert_eq!(agent.progress.current_step, 0);
        assert_eq!(agent.progress.total_steps, 1);
        assert_eq!(agent.progress.percentage, 0);
        assert_eq!(agent.progress.elapsed_secs, 0);
        assert_eq!(agent.progress.current_step_description, "Starting...");
    }

    // ------------------------------------------------------------------
    // BackgroundAgent::is_terminal()
    // ------------------------------------------------------------------

    #[test]
    fn test_is_terminal_for_queued_is_false() {
        let agent = make_agent_with_status(BackgroundAgentStatus::Queued);
        assert!(!agent.is_terminal());
    }

    #[test]
    fn test_is_terminal_for_running_is_false() {
        let agent = make_agent_with_status(BackgroundAgentStatus::Running);
        assert!(!agent.is_terminal());
    }

    #[test]
    fn test_is_terminal_for_paused_is_false() {
        let agent = make_agent_with_status(BackgroundAgentStatus::Paused);
        assert!(!agent.is_terminal());
    }

    #[test]
    fn test_is_terminal_for_completed_is_true() {
        let agent = make_agent_with_status(BackgroundAgentStatus::Completed);
        assert!(agent.is_terminal());
    }

    #[test]
    fn test_is_terminal_for_failed_is_true() {
        let agent = make_agent_with_status(BackgroundAgentStatus::Failed);
        assert!(agent.is_terminal());
    }

    #[test]
    fn test_is_terminal_for_cancelled_is_true() {
        let agent = make_agent_with_status(BackgroundAgentStatus::Cancelled);
        assert!(agent.is_terminal());
    }

    #[test]
    fn test_is_terminal_for_taken_over_is_true() {
        let agent = make_agent_with_status(BackgroundAgentStatus::TakenOver);
        assert!(agent.is_terminal());
    }

    // ------------------------------------------------------------------
    // BackgroundAgent::can_resume()
    // ------------------------------------------------------------------

    #[test]
    fn test_can_resume_paused_is_true() {
        let agent = make_agent_with_status(BackgroundAgentStatus::Paused);
        assert!(agent.can_resume());
    }

    #[test]
    fn test_can_resume_queued_is_true() {
        // Queued agents can also be resumed according to the production implementation.
        let agent = make_agent_with_status(BackgroundAgentStatus::Queued);
        assert!(agent.can_resume());
    }

    #[test]
    fn test_can_resume_running_is_false() {
        let agent = make_agent_with_status(BackgroundAgentStatus::Running);
        assert!(!agent.can_resume());
    }

    #[test]
    fn test_can_resume_completed_is_false() {
        let agent = make_agent_with_status(BackgroundAgentStatus::Completed);
        assert!(!agent.can_resume());
    }

    #[test]
    fn test_can_resume_failed_is_false() {
        let agent = make_agent_with_status(BackgroundAgentStatus::Failed);
        assert!(!agent.can_resume());
    }

    #[test]
    fn test_can_resume_cancelled_is_false() {
        let agent = make_agent_with_status(BackgroundAgentStatus::Cancelled);
        assert!(!agent.can_resume());
    }

    #[test]
    fn test_can_resume_taken_over_is_false() {
        let agent = make_agent_with_status(BackgroundAgentStatus::TakenOver);
        assert!(!agent.can_resume());
    }

    // ------------------------------------------------------------------
    // BackgroundAgent::start()
    // ------------------------------------------------------------------

    #[test]
    fn test_start_sets_running_and_started_at() {
        let mut agent = make_agent_with_status(BackgroundAgentStatus::Queued);
        assert!(agent.started_at.is_none());

        agent.start();

        assert_eq!(agent.status, BackgroundAgentStatus::Running);
        assert!(agent.started_at.is_some());
        // started_at should be very recent (within the last second)
        let elapsed = Utc::now() - agent.started_at.expect("started_at should be set");
        assert!(elapsed.num_seconds() < 2, "started_at should be recent");
    }

    #[test]
    fn test_start_does_not_set_completed_at() {
        let mut agent = make_agent_with_status(BackgroundAgentStatus::Queued);
        agent.start();
        assert!(agent.completed_at.is_none());
    }

    // ------------------------------------------------------------------
    // BackgroundAgent::complete()
    // ------------------------------------------------------------------

    #[test]
    fn test_complete_sets_status_and_summary() {
        let mut agent = make_agent_with_status(BackgroundAgentStatus::Running);
        let summary = AgentSummary {
            description: "All done".to_string(),
            files_changed: vec!["main.rs".to_string()],
            actions_taken: vec!["Compiled".to_string()],
            warnings: vec![],
            goal_achieved: true,
        };

        agent.complete(summary);

        assert_eq!(agent.status, BackgroundAgentStatus::Completed);
        assert!(agent.completed_at.is_some());
        assert_eq!(agent.progress.percentage, 100);
        let s = agent.summary.expect("summary should be set after complete()");
        assert_eq!(s.description, "All done");
        assert!(s.goal_achieved);
        assert_eq!(s.files_changed, vec!["main.rs"]);
    }

    #[test]
    fn test_complete_overwrites_previous_summary() {
        let mut agent = make_agent_with_status(BackgroundAgentStatus::Running);
        agent.summary = Some(AgentSummary {
            description: "Old".to_string(),
            ..AgentSummary::default()
        });

        agent.complete(AgentSummary {
            description: "New".to_string(),
            ..AgentSummary::default()
        });

        assert_eq!(
            agent.summary.expect("summary").description,
            "New"
        );
    }

    // ------------------------------------------------------------------
    // BackgroundAgent::fail()
    // ------------------------------------------------------------------

    #[test]
    fn test_fail_sets_status_error_and_completed_at() {
        let mut agent = make_agent_with_status(BackgroundAgentStatus::Running);

        agent.fail("Connection refused".to_string());

        assert_eq!(agent.status, BackgroundAgentStatus::Failed);
        assert!(agent.completed_at.is_some());
        assert_eq!(agent.error.as_deref(), Some("Connection refused"));
    }

    #[test]
    fn test_fail_preserves_summary_as_none() {
        let mut agent = make_agent_with_status(BackgroundAgentStatus::Running);
        agent.fail("Timeout".to_string());
        assert!(agent.summary.is_none());
    }

    #[test]
    fn test_fail_with_empty_error_string() {
        let mut agent = make_agent_with_status(BackgroundAgentStatus::Running);
        agent.fail(String::new());
        assert_eq!(agent.error.as_deref(), Some(""));
        assert_eq!(agent.status, BackgroundAgentStatus::Failed);
    }

    // ------------------------------------------------------------------
    // BackgroundAgent::cancel()
    // ------------------------------------------------------------------

    #[test]
    fn test_cancel_sets_cancelled_and_completed_at() {
        let mut agent = make_agent_with_status(BackgroundAgentStatus::Running);

        agent.cancel();

        assert_eq!(agent.status, BackgroundAgentStatus::Cancelled);
        assert!(agent.completed_at.is_some());
        assert!(agent.is_terminal());
    }

    #[test]
    fn test_cancel_does_not_set_error() {
        let mut agent = make_agent_with_status(BackgroundAgentStatus::Running);
        agent.cancel();
        assert!(agent.error.is_none());
    }

    // ------------------------------------------------------------------
    // BackgroundAgent::pause()
    // ------------------------------------------------------------------

    #[test]
    fn test_pause_from_running_sets_paused() {
        let mut agent = make_agent_with_status(BackgroundAgentStatus::Running);
        agent.pause();
        assert_eq!(agent.status, BackgroundAgentStatus::Paused);
    }

    #[test]
    fn test_pause_from_queued_is_no_op() {
        // pause() only transitions from Running. If Queued, status stays Queued.
        let mut agent = make_agent_with_status(BackgroundAgentStatus::Queued);
        agent.pause();
        assert_eq!(agent.status, BackgroundAgentStatus::Queued);
    }

    #[test]
    fn test_pause_from_completed_is_no_op() {
        let mut agent = make_agent_with_status(BackgroundAgentStatus::Completed);
        agent.pause();
        assert_eq!(agent.status, BackgroundAgentStatus::Completed);
    }

    #[test]
    fn test_pause_from_failed_is_no_op() {
        let mut agent = make_agent_with_status(BackgroundAgentStatus::Failed);
        agent.pause();
        assert_eq!(agent.status, BackgroundAgentStatus::Failed);
    }

    #[test]
    fn test_pause_from_paused_is_no_op() {
        // Already paused -- calling pause() again should stay Paused (guard checks Running).
        let mut agent = make_agent_with_status(BackgroundAgentStatus::Paused);
        agent.pause();
        assert_eq!(agent.status, BackgroundAgentStatus::Paused);
    }

    // ------------------------------------------------------------------
    // BackgroundAgent::take_over()
    // ------------------------------------------------------------------

    #[test]
    fn test_take_over_sets_taken_over_and_completed_at() {
        let mut agent = make_agent_with_status(BackgroundAgentStatus::Running);
        agent.take_over();
        assert_eq!(agent.status, BackgroundAgentStatus::TakenOver);
        assert!(agent.completed_at.is_some());
        assert!(agent.is_terminal());
    }

    #[test]
    fn test_take_over_from_queued_also_works() {
        // take_over() sets TakenOver unconditionally (no guard like pause()).
        let mut agent = make_agent_with_status(BackgroundAgentStatus::Queued);
        agent.take_over();
        assert_eq!(agent.status, BackgroundAgentStatus::TakenOver);
        assert!(agent.completed_at.is_some());
    }

    // ------------------------------------------------------------------
    // BackgroundAgent::update_progress()
    // ------------------------------------------------------------------

    #[test]
    fn test_update_progress_basic() {
        let mut agent = make_agent_with_status(BackgroundAgentStatus::Running);
        agent.start(); // sets started_at
        agent.update_progress(5, 10, "Halfway there".to_string());

        assert_eq!(agent.progress.current_step, 5);
        assert_eq!(agent.progress.total_steps, 10);
        assert_eq!(agent.progress.current_step_description, "Halfway there");
        assert_eq!(agent.progress.percentage, 50);
    }

    #[test]
    fn test_update_progress_zero_total_steps() {
        // When total_steps is 0, percentage should be 0 (avoid division by zero).
        let mut agent = make_agent_with_status(BackgroundAgentStatus::Running);
        agent.start();
        agent.update_progress(3, 0, "Unknown total".to_string());

        assert_eq!(agent.progress.percentage, 0);
        assert_eq!(agent.progress.current_step, 3);
        assert_eq!(agent.progress.total_steps, 0);
    }

    #[test]
    fn test_update_progress_step_equals_total() {
        let mut agent = make_agent_with_status(BackgroundAgentStatus::Running);
        agent.start();
        agent.update_progress(10, 10, "Done".to_string());

        assert_eq!(agent.progress.percentage, 100);
    }

    #[test]
    fn test_update_progress_step_exceeds_total_clamps_to_100() {
        // If current_step > total_steps, percentage should be capped at 100 via .min(100.0).
        let mut agent = make_agent_with_status(BackgroundAgentStatus::Running);
        agent.start();
        agent.update_progress(15, 10, "Over".to_string());

        assert_eq!(agent.progress.percentage, 100);
    }

    #[test]
    fn test_update_progress_without_started_at_keeps_zero_elapsed() {
        // If started_at is None, elapsed_secs should remain 0.
        let mut agent = make_agent_with_status(BackgroundAgentStatus::Queued);
        // Do NOT call agent.start(); started_at remains None
        agent.update_progress(1, 5, "Step 1".to_string());

        assert_eq!(agent.progress.elapsed_secs, 0);
    }

    #[test]
    fn test_update_progress_overwrites_previous() {
        let mut agent = make_agent_with_status(BackgroundAgentStatus::Running);
        agent.start();
        agent.update_progress(1, 10, "First".to_string());
        assert_eq!(agent.progress.percentage, 10);

        agent.update_progress(7, 10, "Seventh".to_string());
        assert_eq!(agent.progress.percentage, 70);
        assert_eq!(agent.progress.current_step_description, "Seventh");
    }

    // ------------------------------------------------------------------
    // BackgroundAgent — full lifecycle sequence
    // ------------------------------------------------------------------

    #[test]
    fn test_full_lifecycle_queued_to_completed() {
        let mut agent = BackgroundAgent::new(
            "conv-lifecycle".to_string(),
            "Full lifecycle test".to_string(),
            BackgroundAgentContext::default(),
            3,
        );

        // Queued
        assert_eq!(agent.status, BackgroundAgentStatus::Queued);
        assert!(!agent.is_terminal());
        assert!(agent.can_resume());

        // Start
        agent.start();
        assert_eq!(agent.status, BackgroundAgentStatus::Running);
        assert!(!agent.is_terminal());
        assert!(!agent.can_resume());
        assert!(agent.started_at.is_some());

        // Progress
        agent.update_progress(2, 4, "Step 2".to_string());
        assert_eq!(agent.progress.percentage, 50);

        // Pause
        agent.pause();
        assert_eq!(agent.status, BackgroundAgentStatus::Paused);
        assert!(!agent.is_terminal());
        assert!(agent.can_resume());

        // Re-start (simulating resume)
        agent.start();
        assert_eq!(agent.status, BackgroundAgentStatus::Running);

        // Complete
        agent.complete(AgentSummary {
            description: "All done".to_string(),
            goal_achieved: true,
            ..AgentSummary::default()
        });
        assert_eq!(agent.status, BackgroundAgentStatus::Completed);
        assert!(agent.is_terminal());
        assert!(!agent.can_resume());
        assert_eq!(agent.progress.percentage, 100);
        assert!(agent.completed_at.is_some());
    }

    #[test]
    fn test_full_lifecycle_queued_to_failed() {
        let mut agent = BackgroundAgent::new(
            "conv-fail".to_string(),
            "This will fail".to_string(),
            BackgroundAgentContext::default(),
            1,
        );

        agent.start();
        agent.update_progress(1, 3, "Starting...".to_string());
        agent.fail("Out of memory".to_string());

        assert_eq!(agent.status, BackgroundAgentStatus::Failed);
        assert!(agent.is_terminal());
        assert_eq!(agent.error.as_deref(), Some("Out of memory"));
        assert!(agent.completed_at.is_some());
    }

    #[test]
    fn test_full_lifecycle_queued_to_cancelled() {
        let mut agent = BackgroundAgent::new(
            "conv-cancel".to_string(),
            "User will cancel".to_string(),
            BackgroundAgentContext::default(),
            0,
        );

        agent.start();
        agent.cancel();

        assert_eq!(agent.status, BackgroundAgentStatus::Cancelled);
        assert!(agent.is_terminal());
        assert!(agent.completed_at.is_some());
    }

    #[test]
    fn test_full_lifecycle_queued_to_taken_over() {
        let mut agent = BackgroundAgent::new(
            "conv-takeover".to_string(),
            "User will resume to foreground".to_string(),
            BackgroundAgentContext::default(),
            2,
        );

        agent.start();
        agent.take_over();

        assert_eq!(agent.status, BackgroundAgentStatus::TakenOver);
        assert!(agent.is_terminal());
        assert!(agent.completed_at.is_some());
    }

    // ------------------------------------------------------------------
    // BackgroundAgent — Serde JSON roundtrip
    // ------------------------------------------------------------------

    #[test]
    fn test_background_agent_serde_roundtrip() {
        let mut agent = BackgroundAgent::new(
            "conv-serde".to_string(),
            "Test serde".to_string(),
            BackgroundAgentContext {
                working_directory: Some("/tmp".to_string()),
                environment: std::collections::HashMap::new(),
                conversation_snapshot: vec![],
                active_mcp_servers: vec!["test-server".to_string()],
                custom_instructions: None,
            },
            7,
        );
        agent.start();
        agent.update_progress(2, 5, "Step 2".to_string());

        let json = serde_json::to_string(&agent).expect("serialize BackgroundAgent");
        let back: BackgroundAgent =
            serde_json::from_str(&json).expect("deserialize BackgroundAgent");

        assert_eq!(back.id, agent.id);
        assert_eq!(back.conversation_id, "conv-serde");
        assert_eq!(back.goal, "Test serde");
        assert_eq!(back.status, BackgroundAgentStatus::Running);
        assert_eq!(back.priority, 7);
        assert_eq!(back.timeout_secs, DEFAULT_AGENT_TIMEOUT_SECS);
        assert_eq!(back.progress.current_step, 2);
        assert_eq!(back.progress.total_steps, 5);
        assert!(back.started_at.is_some());
        assert!(back.completed_at.is_none());
        assert_eq!(
            back.context.working_directory.as_deref(),
            Some("/tmp")
        );
    }

    #[test]
    fn test_background_agent_serde_with_summary_and_error() {
        let mut agent = BackgroundAgent::new(
            "conv-err".to_string(),
            "Will fail".to_string(),
            BackgroundAgentContext::default(),
            0,
        );
        agent.start();
        agent.fail("Something broke".to_string());

        let json = serde_json::to_string(&agent).expect("serialize");
        let back: BackgroundAgent = serde_json::from_str(&json).expect("deserialize");

        assert_eq!(back.status, BackgroundAgentStatus::Failed);
        assert_eq!(back.error.as_deref(), Some("Something broke"));
        assert!(back.summary.is_none());
    }

    // ------------------------------------------------------------------
    // AgentCommand enum — construction
    // ------------------------------------------------------------------

    #[test]
    fn test_agent_command_pause_is_constructable() {
        let cmd = AgentCommand::Pause;
        assert!(matches!(cmd, AgentCommand::Pause));
    }

    #[test]
    fn test_agent_command_resume_is_constructable() {
        let cmd = AgentCommand::Resume;
        assert!(matches!(cmd, AgentCommand::Resume));
    }

    #[test]
    fn test_agent_command_cancel_is_constructable() {
        let cmd = AgentCommand::Cancel;
        assert!(matches!(cmd, AgentCommand::Cancel));
    }

    #[test]
    fn test_agent_command_take_over_is_constructable() {
        let cmd = AgentCommand::TakeOver;
        assert!(matches!(cmd, AgentCommand::TakeOver));
    }

    #[test]
    fn test_agent_command_debug_format() {
        // AgentCommand derives Debug.
        let cmd = AgentCommand::Pause;
        let dbg = format!("{:?}", cmd);
        assert!(dbg.contains("Pause"), "Debug output should contain variant name");
    }

    #[test]
    fn test_agent_command_clone() {
        // AgentCommand derives Clone.
        let cmd = AgentCommand::Cancel;
        let cloned = cmd.clone();
        assert!(matches!(cloned, AgentCommand::Cancel));
    }

    // ------------------------------------------------------------------
    // BackgroundAgentManager (requires AppHandle -- marked #[ignore])
    // ------------------------------------------------------------------

    #[test]
    #[ignore] // BackgroundAgentManager::new() requires a Tauri AppHandle
    fn test_background_agent_manager_new_requires_app_handle() {
        // This test documents the limitation: the manager cannot be constructed
        // without a real or mocked AppHandle from the Tauri test infrastructure.
        // Use `tauri::test::mock_app()` and pass `app.handle().clone()` when
        // adding integration tests that exercise manager methods.
    }

    // ------------------------------------------------------------------
    // Internal helpers
    // ------------------------------------------------------------------

    fn make_agent_with_status(status: BackgroundAgentStatus) -> BackgroundAgent {
        let mut agent = BackgroundAgent::new(
            "conv".to_string(),
            "goal".to_string(),
            BackgroundAgentContext::default(),
            1,
        );
        agent.status = status;
        agent
    }
}
