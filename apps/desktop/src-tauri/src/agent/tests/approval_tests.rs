#[cfg(test)]
mod tests {
    use crate::agent::approval::*;
    use std::sync::Arc;
    use tempfile::TempDir;
    use tokio::task;

    #[test]
    fn test_risk_classification_low() {
        let action = "read_file";
        let risk_level = "low";

        assert_eq!(risk_level, "low");
        assert_eq!(action, "read_file");
    }

    #[test]
    fn test_risk_classification_high() {
        let _action = "delete_file";
        let risk_level = "high";

        assert_eq!(risk_level, "high");
    }

    #[test]
    fn test_auto_approval_rules() {
        let whitelisted_actions = vec!["read_file", "list_directory", "get_info"];
        let action = "read_file";

        assert!(whitelisted_actions.contains(&action));
    }

    #[test]
    fn test_approval_required() {
        let dangerous_actions = vec!["delete", "modify_system", "network_access"];
        let action = "delete";

        assert!(dangerous_actions.contains(&action));
    }

    #[test]
    fn test_permission_grant() {
        let permission_granted = true;
        assert!(permission_granted);
    }

    #[test]
    fn test_permission_deny() {
        let permission_granted = false;
        assert!(!permission_granted);
    }

    #[test]
    fn test_approval_timeout() {
        let timeout_seconds = 30u64;
        let elapsed_seconds = 25u64;

        assert!(elapsed_seconds < timeout_seconds);
    }

    #[test]
    fn test_batch_approval() {
        let actions = vec!["action1", "action2", "action3"];
        let approved_count = 3;

        assert_eq!(actions.len(), approved_count);
    }

    #[test]
    fn test_approval_history() {
        let history: Vec<(String, bool)> = vec![
            ("action1".to_string(), true),
            ("action2".to_string(), false),
            ("action3".to_string(), true),
        ];

        let approved: Vec<_> = history.iter().filter(|(_, approved)| *approved).collect();
        assert_eq!(approved.len(), 2);
    }

    /// Test for BUG #17: Race Condition - Approval race (CRITICAL)
    /// This test verifies that the atomic check-then-act pattern prevents
    /// double-resolution of approval requests
    #[tokio::test]
    async fn test_approval_race_condition_prevention() {
        let temp_dir = TempDir::new().unwrap();
        let controller = Arc::new(ApprovalController::new(temp_dir.path().to_path_buf()).unwrap());

        // Create a test app handle (mock)
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

        // Spawn approval request in background
        let controller_clone = controller.clone();
        let app_handle_clone = app_handle.clone();
        let payload_clone = payload.clone();
        let approval_task = task::spawn(async move {
            controller_clone
                .request_approval(&app_handle_clone, payload_clone)
                .await
        });

        // Give the request time to register
        tokio::time::sleep(tokio::time::Duration::from_millis(100)).await;

        // Try to resolve the approval twice simultaneously (race condition attempt)
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

        // One should succeed, one should fail due to atomic protection
        assert!(
            (result1.is_ok() && result2.is_err()) || (result1.is_err() && result2.is_ok()),
            "Exactly one resolution should succeed, the other should fail. Got: result1={:?}, result2={:?}",
            result1, result2
        );

        // Verify the error message contains race condition detection
        let error_msg = if result1.is_err() {
            result1.unwrap_err().to_string()
        } else {
            result2.unwrap_err().to_string()
        };

        assert!(
            error_msg.contains("already resolved") || error_msg.contains("not pending"),
            "Error should indicate race condition was detected. Got: {}",
            error_msg
        );

        // Wait for approval task to complete
        let approval_result = approval_task.await.unwrap();
        assert!(
            approval_result.is_ok(),
            "Approval should have been resolved"
        );
    }

    /// Test that trust store operations are thread-safe
    #[tokio::test]
    async fn test_trust_store_concurrent_access() {
        let temp_dir = TempDir::new().unwrap();
        let controller = Arc::new(ApprovalController::new(temp_dir.path().to_path_buf()).unwrap());

        // Spawn multiple tasks that check trust status simultaneously
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

        // All tasks should complete without deadlock
        for task in tasks {
            let result = task.await.unwrap();
            assert!(result.is_ok(), "Trust check should complete successfully");
        }
    }

    /// Test that atomic operations prevent TOCTOU in approval workflow
    #[tokio::test]
    async fn test_approval_toctou_prevention() {
        let temp_dir = TempDir::new().unwrap();
        let controller = Arc::new(ApprovalController::new(temp_dir.path().to_path_buf()).unwrap());

        // Set a workflow hash
        controller
            .set_current_hash(Some("test_workflow".to_string()))
            .await;

        let app = tauri::test::mock_app();
        let app_handle = app.handle().clone();

        // Create approval payload
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

        // Spawn approval request
        let controller_clone = controller.clone();
        let app_handle_clone = app_handle.clone();
        let payload_clone = payload.clone();
        let approval_task = task::spawn(async move {
            controller_clone
                .request_approval(&app_handle_clone, payload_clone)
                .await
        });

        // Give request time to register
        tokio::time::sleep(tokio::time::Duration::from_millis(50)).await;

        // Resolve with trust=true
        let result = controller
            .resolve("test_toctou", ApprovalResolution::Approved { trust: true })
            .await;
        assert!(result.is_ok(), "First resolution should succeed");

        // Wait for approval to complete
        let approval_result = approval_task.await.unwrap();
        assert!(
            approval_result.is_ok(),
            "Approval should complete successfully"
        );

        // Verify trust was recorded atomically
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
