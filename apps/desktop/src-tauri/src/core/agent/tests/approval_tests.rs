// H17 — Approval module tests.
//
// Tests that CAN run without AppHandle (sync):
//  • `ApprovalRule` enum — construction and matching
//  • `ApprovalScopeType` enum — serialisation
//  • `ApprovalScope` construction
//  • `ApprovalResolution` enum — construction
//  • `ApprovalManager` — new(), should_approve() for auto-approve and manual paths
//  • `ApprovalController` — new() (requires only a filesystem path), resolve() race detection,
//    is_action_trusted()
//
// Tests that need a Tauri AppHandle (request_approval emits events):
//  • `test_approval_race_condition_prevention` (uses mock_app)
//  • `test_approval_toctou_prevention` (uses mock_app)
//  These are kept below, they already call real production code.
#[cfg(test)]
mod tests {
    use crate::core::agent::approval::*;
    use crate::core::agent::{Action, AgentConfig, Task, TaskStatus, TaskStep};
    use std::sync::Arc;
    use std::time::{Duration, Instant};
    use tempfile::TempDir;
    use tokio::task;

    // ------------------------------------------------------------------
    // ApprovalRule — construction and Debug
    // ------------------------------------------------------------------

    #[test]
    fn test_approval_rule_variants_are_constructable() {
        let _pattern = ApprovalRule::PatternMatch {
            pattern: "delete".to_string(),
        };
        let _no_fs = ApprovalRule::NoFileSystemOps;
        let _no_net = ApprovalRule::NoNetworkOps;
        let _ro = ApprovalRule::ReadOnly;
        let _always = ApprovalRule::AlwaysRequire;
    }

    #[test]
    fn test_approval_rule_pattern_match_stores_pattern() {
        let rule = ApprovalRule::PatternMatch {
            pattern: "rm -rf".to_string(),
        };
        if let ApprovalRule::PatternMatch { pattern } = &rule {
            assert_eq!(pattern, "rm -rf");
        } else {
            panic!("Expected PatternMatch variant");
        }
    }

    // ------------------------------------------------------------------
    // ApprovalScopeType — serialisation
    // ------------------------------------------------------------------

    #[test]
    fn test_approval_scope_type_serde_terminal() {
        let t = ApprovalScopeType::Terminal;
        let json = serde_json::to_string(&t).unwrap();
        assert_eq!(json, "\"terminal\"");
        let decoded: ApprovalScopeType = serde_json::from_str(&json).unwrap();
        assert!(matches!(decoded, ApprovalScopeType::Terminal));
    }

    #[test]
    fn test_approval_scope_type_serde_all_variants() {
        let variants = vec![
            ApprovalScopeType::Terminal,
            ApprovalScopeType::Filesystem,
            ApprovalScopeType::Browser,
            ApprovalScopeType::Ui,
            ApprovalScopeType::Mcp,
            ApprovalScopeType::Unknown,
        ];
        for v in variants {
            let json = serde_json::to_string(&v).unwrap();
            let _decoded: ApprovalScopeType = serde_json::from_str(&json).unwrap();
        }
    }

    // ------------------------------------------------------------------
    // ApprovalScope — construction and field access
    // ------------------------------------------------------------------

    #[test]
    fn test_approval_scope_construction_terminal() {
        let scope = ApprovalScope {
            scope_type: ApprovalScopeType::Terminal,
            command: Some("rm -rf /".to_string()),
            cwd: Some("/".to_string()),
            path: None,
            domain: None,
            description: Some("Dangerous command".to_string()),
            risk: "critical".to_string(),
        };
        assert!(matches!(scope.scope_type, ApprovalScopeType::Terminal));
        assert_eq!(scope.risk, "critical");
        assert!(scope.command.is_some());
    }

    #[test]
    fn test_approval_scope_construction_filesystem() {
        let scope = ApprovalScope {
            scope_type: ApprovalScopeType::Filesystem,
            command: None,
            cwd: None,
            path: Some("/etc/hosts".to_string()),
            domain: None,
            description: None,
            risk: "high".to_string(),
        };
        assert_eq!(scope.path.as_deref(), Some("/etc/hosts"));
        assert!(scope.command.is_none());
    }

    // ------------------------------------------------------------------
    // ApprovalResolution — construction
    // ------------------------------------------------------------------

    #[test]
    fn test_approval_resolution_approved_trust_true() {
        let r = ApprovalResolution::Approved { trust: true };
        if let ApprovalResolution::Approved { trust } = &r {
            assert!(*trust);
        } else {
            panic!("Expected Approved");
        }
    }

    #[test]
    fn test_approval_resolution_rejected_with_reason() {
        let r = ApprovalResolution::Rejected {
            reason: Some("Too dangerous".to_string()),
        };
        if let ApprovalResolution::Rejected { reason } = &r {
            assert_eq!(reason.as_deref(), Some("Too dangerous"));
        } else {
            panic!("Expected Rejected");
        }
    }

    #[test]
    fn test_approval_resolution_rejected_no_reason() {
        let r = ApprovalResolution::Rejected { reason: None };
        if let ApprovalResolution::Rejected { reason } = r {
            assert!(reason.is_none());
        }
    }

    // ------------------------------------------------------------------
    // ApprovalManager — should_approve() with auto_approve config
    // ------------------------------------------------------------------

    fn make_read_only_task() -> Task {
        Task {
            id: "task_ro".to_string(),
            description: "Take a screenshot of the screen".to_string(),
            status: TaskStatus::Pending,
            created_at: Instant::now(),
            updated_at: Instant::now(),
            steps: vec![TaskStep {
                id: "s1".to_string(),
                action: Action::Screenshot { region: None },
                description: "Screenshot".to_string(),
                expected_result: None,
                timeout: Duration::from_secs(5),
                retry_on_failure: false,
            }],
            current_step: 0,
            max_retries: 3,
            retry_count: 0,
            replan_count: 0,
            requires_approval: false,
            auto_approve: true,
        }
    }

    fn make_destructive_task() -> Task {
        Task {
            id: "task_del".to_string(),
            description: "delete all temporary files".to_string(),
            status: TaskStatus::Pending,
            created_at: Instant::now(),
            updated_at: Instant::now(),
            steps: vec![TaskStep {
                id: "s1".to_string(),
                action: Action::ExecuteCommand {
                    command: "rm".to_string(),
                    args: vec!["-rf".to_string(), "/tmp/*".to_string()],
                },
                description: "Delete temp files".to_string(),
                expected_result: None,
                timeout: Duration::from_secs(30),
                retry_on_failure: false,
            }],
            current_step: 0,
            max_retries: 3,
            retry_count: 0,
            replan_count: 0,
            requires_approval: true,
            auto_approve: false,
        }
    }

    #[tokio::test]
    async fn test_approval_manager_auto_approve_task() {
        let cfg = AgentConfig {
            auto_approve: true,
            ..AgentConfig::default()
        };
        let manager = ApprovalManager::new(cfg);
        let task = make_read_only_task();
        // task.auto_approve = true → should_approve returns true immediately
        let result = manager.should_approve(&task).await.unwrap();
        assert!(result, "Auto-approve task should be approved");
    }

    #[tokio::test]
    async fn test_approval_manager_always_require_denies() {
        // auto_approve=false on the config → AlwaysRequire rule is added
        let cfg = AgentConfig {
            auto_approve: false,
            ..AgentConfig::default()
        };
        let manager = ApprovalManager::new(cfg);
        // Task with auto_approve=false and requires_approval=true
        let mut task = make_destructive_task();
        task.auto_approve = false;
        let result = manager.should_approve(&task).await.unwrap();
        assert!(
            !result,
            "AlwaysRequire should deny tasks that are not auto-approved"
        );
    }

    #[tokio::test]
    async fn test_approval_manager_task_auto_approve_overrides_config() {
        // Config says auto_approve=false, but the task itself has auto_approve=true
        let cfg = AgentConfig {
            auto_approve: false,
            ..AgentConfig::default()
        };
        let manager = ApprovalManager::new(cfg);
        let mut task = make_read_only_task();
        task.auto_approve = true;
        let result = manager.should_approve(&task).await.unwrap();
        // task.auto_approve=true → approved immediately (line 55 in approval.rs)
        assert!(result);
    }

    // ------------------------------------------------------------------
    // ApprovalController — construct from temp dir, is_action_trusted
    // ------------------------------------------------------------------

    #[tokio::test]
    async fn test_approval_controller_new_from_temp_dir() {
        let temp_dir = TempDir::new().unwrap();
        let controller = ApprovalController::new(temp_dir.path().to_path_buf());
        assert!(
            controller.is_ok(),
            "ApprovalController::new should succeed with a valid path"
        );
    }

    #[tokio::test]
    async fn test_approval_controller_is_action_trusted_initially_false() {
        let temp_dir = TempDir::new().unwrap();
        let controller = ApprovalController::new(temp_dir.path().to_path_buf()).unwrap();
        let trusted = controller
            .is_action_trusted(Some("workflow_hash_abc"), "sig_xyz")
            .await
            .unwrap();
        assert!(
            !trusted,
            "No actions should be trusted in a fresh controller"
        );
    }

    #[tokio::test]
    async fn test_approval_controller_no_hash_returns_false() {
        let temp_dir = TempDir::new().unwrap();
        let controller = ApprovalController::new(temp_dir.path().to_path_buf()).unwrap();
        let trusted = controller.is_action_trusted(None, "any_sig").await.unwrap();
        assert!(
            !trusted,
            "Without a workflow hash, action must not be trusted"
        );
    }

    #[tokio::test]
    async fn test_approval_controller_set_and_get_current_hash() {
        let temp_dir = TempDir::new().unwrap();
        let controller = ApprovalController::new(temp_dir.path().to_path_buf()).unwrap();

        assert!(controller.current_hash().await.is_none());

        controller
            .set_current_hash(Some("wf-hash-123".to_string()))
            .await;
        assert_eq!(
            controller.current_hash().await.as_deref(),
            Some("wf-hash-123")
        );

        controller.set_current_hash(None).await;
        assert!(controller.current_hash().await.is_none());
    }

    #[tokio::test]
    async fn test_approval_controller_list_trusted_workflows_empty() {
        let temp_dir = TempDir::new().unwrap();
        let controller = ApprovalController::new(temp_dir.path().to_path_buf()).unwrap();
        let workflows = controller.list_trusted_workflows().await.unwrap();
        assert!(
            workflows.is_empty(),
            "No trusted workflows in a fresh controller"
        );
    }

    #[tokio::test]
    async fn test_trust_store_concurrent_access() {
        let temp_dir = TempDir::new().unwrap();
        let controller = Arc::new(ApprovalController::new(temp_dir.path().to_path_buf()).unwrap());

        let mut tasks = vec![];
        for i in 0..10 {
            let controller_clone = controller.clone();
            let task = task::spawn(async move {
                controller_clone
                    .is_action_trusted(Some("workflow_hash"), &format!("signature_{}", i))
                    .await
            });
            tasks.push(task);
        }

        for t in tasks {
            let result = t.await.unwrap();
            assert!(result.is_ok(), "Trust check should complete successfully");
        }
    }

    // ------------------------------------------------------------------
    // Async tests that use mock_app — kept from original because they DO
    // call real production code.
    // ------------------------------------------------------------------

    #[tokio::test]
    async fn test_approval_race_condition_prevention() {
        let temp_dir = TempDir::new().unwrap();
        let controller = Arc::new(ApprovalController::new(temp_dir.path().to_path_buf()).unwrap());

        let app = tauri::test::mock_app();
        let app_handle = app.handle().clone();

        let payload = ApprovalRequestPayload {
            action_id: "test_action_1".to_string(),
            tool_name: "dangerous_tool".to_string(),
            title: "Test Approval".to_string(),
            description: "Testing race condition".to_string(),
            reason: "Security test".to_string(),
            risk_level: "high".to_string(),
            scope: ApprovalScope {
                scope_type: ApprovalScopeType::Terminal,
                command: Some("rm -rf /".to_string()),
                cwd: None,
                path: None,
                domain: None,
                description: Some("Dangerous command".to_string()),
                risk: "critical".to_string(),
            },
            workflow_hash: None,
            action_signature: "test_signature".to_string(),
        };

        let controller_clone = controller.clone();
        let app_handle_clone = app_handle.clone();
        let payload_clone = payload.clone();
        let approval_task = task::spawn(async move {
            controller_clone
                .request_approval(&app_handle_clone, payload_clone)
                .await
        });

        tokio::time::sleep(tokio::time::Duration::from_millis(100)).await;

        let controller_clone1 = controller.clone();
        let controller_clone2 = controller.clone();

        let resolution1 = ApprovalResolution::Approved { trust: false };
        let resolution2 = ApprovalResolution::Approved { trust: true };

        let resolve_task1 = task::spawn(async move {
            controller_clone1
                .resolve("test_action_1", resolution1)
                .await
        });

        let resolve_task2 = task::spawn(async move {
            controller_clone2
                .resolve("test_action_1", resolution2)
                .await
        });

        let result1 = resolve_task1.await.unwrap();
        let result2 = resolve_task2.await.unwrap();

        assert!(
            (result1.is_ok() && result2.is_err()) || (result1.is_err() && result2.is_ok()),
            "Exactly one resolution should succeed, the other should fail. Got: result1={:?}, result2={:?}",
            result1,
            result2
        );

        let error_msg = if let Err(e) = result1 {
            e.to_string()
        } else {
            result2.unwrap_err().to_string()
        };

        assert!(
            error_msg.contains("already resolved") || error_msg.contains("not pending"),
            "Error should indicate race condition was detected. Got: {}",
            error_msg
        );

        let approval_result = approval_task.await.unwrap();
        assert!(
            approval_result.is_ok(),
            "Approval should have been resolved"
        );
    }

    #[tokio::test]
    async fn test_approval_toctou_prevention() {
        let temp_dir = TempDir::new().unwrap();
        let controller = Arc::new(ApprovalController::new(temp_dir.path().to_path_buf()).unwrap());

        controller
            .set_current_hash(Some("test_workflow".to_string()))
            .await;

        let app = tauri::test::mock_app();
        let app_handle = app.handle().clone();

        let payload = ApprovalRequestPayload {
            action_id: "test_toctou".to_string(),
            tool_name: "file_delete".to_string(),
            title: "TOCTOU Test".to_string(),
            description: "Testing TOCTOU prevention".to_string(),
            reason: "Security test".to_string(),
            risk_level: "high".to_string(),
            scope: ApprovalScope {
                scope_type: ApprovalScopeType::Filesystem,
                command: None,
                cwd: None,
                path: Some("/important/file".to_string()),
                domain: None,
                description: Some("File deletion".to_string()),
                risk: "high".to_string(),
            },
            workflow_hash: Some("test_workflow".to_string()),
            action_signature: "delete_sig".to_string(),
        };

        let controller_clone = controller.clone();
        let app_handle_clone = app_handle.clone();
        let payload_clone = payload.clone();
        let approval_task = task::spawn(async move {
            controller_clone
                .request_approval(&app_handle_clone, payload_clone)
                .await
        });

        tokio::time::sleep(tokio::time::Duration::from_millis(50)).await;

        let result = controller
            .resolve("test_toctou", ApprovalResolution::Approved { trust: true })
            .await;
        assert!(result.is_ok(), "First resolution should succeed");

        let approval_result = approval_task.await.unwrap();
        assert!(
            approval_result.is_ok(),
            "Approval should complete successfully"
        );

        let is_trusted = controller
            .is_action_trusted(Some("test_workflow"), "delete_sig")
            .await
            .unwrap();
        assert!(
            is_trusted,
            "Action should be trusted after approval with trust=true"
        );
    }
}
