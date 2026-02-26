// C9 — Autonomous agent tests.
//
// `AutonomousAgent` requires an LLMRouter + AutomationService, both of which
// need runtime resources (network, DB, screen capture).  We test what is
// available without those dependencies:
//
//  • `TaskStatus` enum: all variants, Serialize/Deserialize, PartialEq
//  • `Task` struct: construction and field access
//  • `AgentConfig`: Default values and custom construction
//  • `ScreenshotQuality` / `VisionModel` enums
//  • `Action` enum: construction of each variant
//  • `ClickTarget` enum: construction of each variant
//  • `ScrollDirection` enum: serialisation
//  • `TaskStep` construction
//  • `PENDING_TASK_APPROVALS` static (accessible without runtime)
#[cfg(test)]
mod tests {
    use crate::core::agent::{
        Action, AgentConfig, ClickTarget, ScreenRegion, ScreenshotQuality, ScrollDirection,
        StepResult, Task, TaskStatus, TaskStep, VisionModel,
    };
    use crate::core::agent::autonomous::PENDING_TASK_APPROVALS;
    use std::time::{Duration, Instant};

    // ------------------------------------------------------------------
    // TaskStatus — enum variants and PartialEq
    // ------------------------------------------------------------------

    #[test]
    fn test_task_status_pending_eq() {
        assert_eq!(TaskStatus::Pending, TaskStatus::Pending);
        assert_ne!(TaskStatus::Pending, TaskStatus::Planning);
    }

    #[test]
    fn test_task_status_failed_carries_message() {
        let s = TaskStatus::Failed("out of credits".to_string());
        if let TaskStatus::Failed(msg) = &s {
            assert_eq!(msg, "out of credits");
        } else {
            panic!("Expected Failed variant");
        }
    }

    #[test]
    fn test_task_status_failed_neq_different_message() {
        let a = TaskStatus::Failed("err A".to_string());
        let b = TaskStatus::Failed("err B".to_string());
        assert_ne!(a, b);
    }

    #[test]
    fn test_task_status_all_non_failed_variants() {
        let variants = vec![
            TaskStatus::Pending,
            TaskStatus::Planning,
            TaskStatus::Executing,
            TaskStatus::WaitingApproval,
            TaskStatus::Paused,
            TaskStatus::Completed,
            TaskStatus::Cancelled,
        ];
        // Each variant must compare equal to itself
        for v in &variants {
            // Compare using match so we don't need Clone
            assert!(matches_same(v));
        }
    }

    fn matches_same(s: &TaskStatus) -> bool {
        match s {
            TaskStatus::Pending => matches!(s, TaskStatus::Pending),
            TaskStatus::Planning => matches!(s, TaskStatus::Planning),
            TaskStatus::Executing => matches!(s, TaskStatus::Executing),
            TaskStatus::WaitingApproval => matches!(s, TaskStatus::WaitingApproval),
            TaskStatus::Paused => matches!(s, TaskStatus::Paused),
            TaskStatus::Completed => matches!(s, TaskStatus::Completed),
            TaskStatus::Failed(_) => matches!(s, TaskStatus::Failed(_)),
            TaskStatus::Cancelled => matches!(s, TaskStatus::Cancelled),
        }
    }

    #[test]
    fn test_task_status_serde_round_trip() {
        let statuses = vec![
            TaskStatus::Pending,
            TaskStatus::Completed,
            TaskStatus::Failed("network error".to_string()),
            TaskStatus::Cancelled,
        ];
        for original in statuses {
            let json = serde_json::to_string(&original).unwrap();
            let decoded: TaskStatus = serde_json::from_str(&json).unwrap();
            // Re-encode and compare JSON strings for equality
            assert_eq!(json, serde_json::to_string(&decoded).unwrap());
        }
    }

    // ------------------------------------------------------------------
    // AgentConfig — Default
    // ------------------------------------------------------------------

    #[test]
    fn test_agent_config_default_values() {
        let cfg = AgentConfig::default();
        assert!(!cfg.auto_approve);
        assert_eq!(cfg.max_concurrent_tasks, 1);
        assert_eq!(cfg.default_timeout, Duration::from_secs(30));
        assert_eq!(cfg.max_retries, 3);
        assert!(cfg.use_local_llm_fallback);
        assert_eq!(cfg.local_llm_threshold_tokens, 1000);
        assert_eq!(cfg.cpu_limit_percent, 50.0);
        assert_eq!(cfg.memory_limit_mb, 512);
        assert_eq!(cfg.max_cost_per_task, 5.0);
        assert_eq!(cfg.max_session_cost, 50.0);
    }

    #[test]
    fn test_agent_config_auto_approve_override() {
        let cfg = AgentConfig {
            auto_approve: true,
            max_concurrent_tasks: 4,
            ..AgentConfig::default()
        };
        assert!(cfg.auto_approve);
        assert_eq!(cfg.max_concurrent_tasks, 4);
        // Other fields must still have default values
        assert_eq!(cfg.max_retries, 3);
    }

    #[test]
    fn test_agent_config_cost_caps_are_positive() {
        let cfg = AgentConfig::default();
        assert!(cfg.max_cost_per_task > 0.0);
        assert!(cfg.max_session_cost > 0.0);
        assert!(cfg.max_session_cost > cfg.max_cost_per_task);
    }

    // ------------------------------------------------------------------
    // ScreenshotQuality / VisionModel — enum serialisation
    // ------------------------------------------------------------------

    #[test]
    fn test_screenshot_quality_serde() {
        let qualities = vec![
            ScreenshotQuality::Low,
            ScreenshotQuality::Medium,
            ScreenshotQuality::High,
        ];
        for q in qualities {
            let json = serde_json::to_string(&q).unwrap();
            let _decoded: ScreenshotQuality = serde_json::from_str(&json).unwrap();
        }
    }

    #[test]
    fn test_vision_model_serde() {
        let models = vec![VisionModel::LocalOCR, VisionModel::CloudVision, VisionModel::Hybrid];
        for m in models {
            let json = serde_json::to_string(&m).unwrap();
            let _decoded: VisionModel = serde_json::from_str(&json).unwrap();
        }
    }

    // ------------------------------------------------------------------
    // Action enum — construction of each variant
    // ------------------------------------------------------------------

    #[test]
    fn test_action_screenshot_no_region() {
        let a = Action::Screenshot { region: None };
        assert!(matches!(a, Action::Screenshot { region: None }));
    }

    #[test]
    fn test_action_screenshot_with_region() {
        let a = Action::Screenshot {
            region: Some(ScreenRegion {
                x: 10,
                y: 20,
                width: 800,
                height: 600,
            }),
        };
        if let Action::Screenshot { region: Some(r) } = &a {
            assert_eq!(r.x, 10);
            assert_eq!(r.width, 800);
        } else {
            panic!("Expected Screenshot with region");
        }
    }

    #[test]
    fn test_action_navigate() {
        let a = Action::Navigate {
            url: "https://example.com".to_string(),
        };
        if let Action::Navigate { url } = &a {
            assert!(url.starts_with("https://"));
        } else {
            panic!("Expected Navigate");
        }
    }

    #[test]
    fn test_action_read_file() {
        let a = Action::ReadFile {
            path: "/tmp/test.txt".to_string(),
        };
        if let Action::ReadFile { path } = &a {
            assert_eq!(path, "/tmp/test.txt");
        } else {
            panic!("Expected ReadFile");
        }
    }

    #[test]
    fn test_action_write_file() {
        let a = Action::WriteFile {
            path: "/tmp/out.txt".to_string(),
            content: "hello".to_string(),
        };
        if let Action::WriteFile { path, content } = &a {
            assert_eq!(content, "hello");
            assert!(path.ends_with(".txt"));
        } else {
            panic!("Expected WriteFile");
        }
    }

    #[test]
    fn test_action_execute_command() {
        let a = Action::ExecuteCommand {
            command: "echo".to_string(),
            args: vec!["hello".to_string()],
        };
        if let Action::ExecuteCommand { command, args } = &a {
            assert_eq!(command, "echo");
            assert_eq!(args.len(), 1);
        } else {
            panic!("Expected ExecuteCommand");
        }
    }

    #[test]
    fn test_action_search_text() {
        let a = Action::SearchText {
            query: "Submit".to_string(),
        };
        if let Action::SearchText { query } = &a {
            assert_eq!(query, "Submit");
        } else {
            panic!("Expected SearchText");
        }
    }

    #[test]
    fn test_action_press_key() {
        let a = Action::PressKey {
            keys: vec!["Ctrl".to_string(), "C".to_string()],
        };
        if let Action::PressKey { keys } = &a {
            assert_eq!(keys.len(), 2);
        } else {
            panic!("Expected PressKey");
        }
    }

    #[test]
    fn test_action_scroll() {
        let a = Action::Scroll {
            direction: ScrollDirection::Down,
            amount: 3,
        };
        if let Action::Scroll { direction, amount } = &a {
            assert!(matches!(direction, ScrollDirection::Down));
            assert_eq!(*amount, 3);
        } else {
            panic!("Expected Scroll");
        }
    }

    // ------------------------------------------------------------------
    // ClickTarget enum
    // ------------------------------------------------------------------

    #[test]
    fn test_click_target_coordinates() {
        let t = ClickTarget::Coordinates { x: 100, y: 200 };
        if let ClickTarget::Coordinates { x, y } = &t {
            assert_eq!(*x, 100);
            assert_eq!(*y, 200);
        } else {
            panic!("Expected Coordinates");
        }
    }

    #[test]
    fn test_click_target_text_match_fuzzy() {
        let t = ClickTarget::TextMatch {
            text: "Submit".to_string(),
            fuzzy: true,
        };
        if let ClickTarget::TextMatch { text, fuzzy } = &t {
            assert_eq!(text, "Submit");
            assert!(*fuzzy);
        } else {
            panic!("Expected TextMatch");
        }
    }

    #[test]
    fn test_click_target_image_match() {
        let t = ClickTarget::ImageMatch {
            image_path: "/tmp/btn.png".to_string(),
            threshold: 0.9,
        };
        if let ClickTarget::ImageMatch {
            image_path,
            threshold,
        } = &t
        {
            assert!(image_path.ends_with(".png"));
            assert!(*threshold > 0.0 && *threshold <= 1.0);
        } else {
            panic!("Expected ImageMatch");
        }
    }

    #[test]
    fn test_click_target_uia_element() {
        let t = ClickTarget::UIAElement {
            element_id: "btn-submit".to_string(),
        };
        if let ClickTarget::UIAElement { element_id } = &t {
            assert_eq!(element_id, "btn-submit");
        } else {
            panic!("Expected UIAElement");
        }
    }

    // ------------------------------------------------------------------
    // ScrollDirection serialisation
    // ------------------------------------------------------------------

    #[test]
    fn test_scroll_direction_all_variants_serde() {
        let dirs = vec![
            ScrollDirection::Up,
            ScrollDirection::Down,
            ScrollDirection::Left,
            ScrollDirection::Right,
        ];
        for d in dirs {
            let json = serde_json::to_string(&d).unwrap();
            let _decoded: ScrollDirection = serde_json::from_str(&json).unwrap();
        }
    }

    // ------------------------------------------------------------------
    // TaskStep construction
    // ------------------------------------------------------------------

    #[test]
    fn test_task_step_construction() {
        let step = TaskStep {
            id: "step_1".to_string(),
            action: Action::Screenshot { region: None },
            description: "Take a screenshot".to_string(),
            expected_result: Some("Screenshot captured".to_string()),
            timeout: Duration::from_secs(10),
            retry_on_failure: true,
        };
        assert_eq!(step.id, "step_1");
        assert!(step.retry_on_failure);
        assert_eq!(step.timeout, Duration::from_secs(10));
        assert!(step.expected_result.is_some());
    }

    // ------------------------------------------------------------------
    // Task struct construction
    // ------------------------------------------------------------------

    #[test]
    fn test_task_construction() {
        let now = Instant::now();
        let task = Task {
            id: "task_001".to_string(),
            description: "Open browser and search".to_string(),
            status: TaskStatus::Pending,
            created_at: now,
            updated_at: now,
            steps: vec![],
            current_step: 0,
            max_retries: 3,
            retry_count: 0,
            replan_count: 0,
            requires_approval: false,
            auto_approve: true,
        };

        assert_eq!(task.id, "task_001");
        assert_eq!(task.status, TaskStatus::Pending);
        assert!(task.auto_approve);
        assert!(!task.requires_approval);
        assert_eq!(task.max_retries, 3);
    }

    // ------------------------------------------------------------------
    // PENDING_TASK_APPROVALS static
    // ------------------------------------------------------------------

    #[test]
    fn test_pending_task_approvals_starts_empty() {
        // The DashMap should start empty at test time (no active agents).
        // Previously this was `let _ = …` which silently discarded the result,
        // making the test always pass regardless of actual state.
        assert_eq!(
            PENDING_TASK_APPROVALS.len(),
            0,
            "PENDING_TASK_APPROVALS should be empty when no agents are running"
        );
    }

    // ------------------------------------------------------------------
    // StepResult construction
    // ------------------------------------------------------------------

    #[test]
    fn test_step_result_success() {
        let r = StepResult {
            step_id: "step_1".to_string(),
            success: true,
            result: Some("Done".to_string()),
            error: None,
            screenshot_path: None,
            duration: Duration::from_millis(250),
        };
        assert!(r.success);
        assert!(r.error.is_none());
    }

    #[test]
    fn test_step_result_failure() {
        let r = StepResult {
            step_id: "step_2".to_string(),
            success: false,
            result: None,
            error: Some("Element not found".to_string()),
            screenshot_path: Some("/tmp/err.png".to_string()),
            duration: Duration::from_millis(5000),
        };
        assert!(!r.success);
        assert!(r.error.is_some());
        assert!(r.screenshot_path.is_some());
    }
}
