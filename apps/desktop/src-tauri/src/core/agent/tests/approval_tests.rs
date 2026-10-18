// H17, Approval module tests.
//
// Tests that CAN run without AppHandle (sync):
//  • `ApprovalScopeType` enum, serialisation
//  • `ApprovalScope` construction
//  • `ApprovalResolution` enum, construction
//  • `ApprovalController`, resolve() race detection, the workflow hash label
//
// Tests that need a Tauri AppHandle (request_approval emits events):
//  • `test_approval_race_condition_prevention` (uses mock_app)
//  • `test_approval_toctou_prevention` (uses mock_app)
//  These are kept below, they already call real production code.
#[cfg(test)]
mod tests {
    use crate::core::agent::approval::*;
    use std::sync::Arc;
    use std::time::{Duration, Instant};
    use tokio::task;

    // ------------------------------------------------------------------
    // ApprovalScopeType, serialisation
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
    // ApprovalScope, construction and field access
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
    // ApprovalResolution, construction
    // ------------------------------------------------------------------

    #[test]
    fn an_approval_from_the_window_cannot_carry_a_standing_grant() {
        assert_eq!(ApprovalResolution::Approved, ApprovalResolution::Approved);

        let controller = include_str!("../approval.rs");
        assert!(!controller.contains("TrustedWorkflowStore"));
        assert!(!controller.contains("record_trust"));
        assert!(!controller.contains("Auto-approved"));

        let command = include_str!("../../../sys/commands/agent.rs");
        let resolve = command
            .split("pub async fn agent_resolve_approval")
            .nth(1)
            .and_then(|rest| rest.split("pub async fn").next())
            .expect("the approval command");
        assert!(!resolve.contains("trust"));
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
    // ApprovalController, the workflow hash label
    // ------------------------------------------------------------------

    #[tokio::test]
    async fn test_approval_controller_set_and_get_current_hash() {
        let controller = ApprovalController::default();

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

    // ------------------------------------------------------------------
    // Async tests that use mock_app, kept from original because they DO
    // call real production code.
    // ------------------------------------------------------------------

    #[tokio::test]
    async fn test_approval_race_condition_prevention() {
        let controller = Arc::new(ApprovalController::default());

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

        let resolution1 = ApprovalResolution::Approved;
        let resolution2 = ApprovalResolution::Rejected { reason: None };

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
        let controller = Arc::new(ApprovalController::default());

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
            .resolve("test_toctou", ApprovalResolution::Approved)
            .await;
        assert!(result.is_ok(), "First resolution should succeed");

        let approval_result = approval_task.await.unwrap();
        assert!(
            approval_result.is_ok(),
            "Approval should complete successfully"
        );

        let app_handle_again = app_handle.clone();
        let controller_again = controller.clone();
        let asked_again = task::spawn(async move {
            controller_again
                .request_approval_with_timeout(
                    &app_handle_again,
                    payload,
                    Duration::from_millis(100),
                )
                .await
        });
        let second = asked_again.await.unwrap().unwrap();
        assert!(
            matches!(second, ApprovalResolution::Rejected { .. }),
            "the same action in the same workflow is asked again, and unanswered it is denied"
        );
    }

    // ------------------------------------------------------------------
    // The approval lifecycle the renderer depends on.
    //
    // Every test below drives `ApprovalController` exactly the way
    // `core/llm/tool_executor/mod.rs` drives it in production:
    // request -> emit -> wait -> terminal state.
    // ------------------------------------------------------------------

    fn approval_payload(action_id: &str) -> ApprovalRequestPayload {
        ApprovalRequestPayload {
            action_id: action_id.to_string(),
            tool_name: "terminal_execute".to_string(),
            title: "Run a shell command".to_string(),
            description: "Runs `git status` in the project root".to_string(),
            reason: "Waiting for approval to execute: terminal_execute".to_string(),
            risk_level: "high".to_string(),
            scope: ApprovalScope {
                scope_type: ApprovalScopeType::Terminal,
                command: Some("git status".to_string()),
                cwd: Some("/tmp".to_string()),
                path: None,
                domain: None,
                description: Some("Shell command".to_string()),
                risk: "high".to_string(),
            },
            workflow_hash: None,
            action_signature: "sig-crit-004".to_string(),
        }
    }

    /// The emitted envelope must tell the renderer when the card dies.
    /// Without `expiresAtMs` a surface can only show a card that never stops
    /// being current.
    #[tokio::test]
    async fn test_permission_required_envelope_carries_a_deadline() {
        use tauri::Listener;

        let controller = Arc::new(ApprovalController::default());

        let app = tauri::test::mock_app();
        let app_handle = app.handle().clone();

        let captured: Arc<std::sync::Mutex<Option<serde_json::Value>>> =
            Arc::new(std::sync::Mutex::new(None));
        let sink = captured.clone();
        app_handle.listen("agent:permission_required", move |event| {
            let parsed: serde_json::Value = serde_json::from_str(event.payload())
                .expect("agent:permission_required payload must be JSON");
            *sink.lock().unwrap() = Some(parsed);
        });

        let controller_clone = controller.clone();
        let app_handle_clone = app_handle.clone();
        let request = task::spawn(async move {
            controller_clone
                .request_approval_with_timeout(
                    &app_handle_clone,
                    approval_payload("envelope-1"),
                    Duration::from_secs(30),
                )
                .await
        });

        tokio::time::sleep(Duration::from_millis(50)).await;
        controller
            .resolve("envelope-1", ApprovalResolution::Approved)
            .await
            .expect("the request must be pending and answerable");

        let resolution = request.await.unwrap().unwrap();
        assert_eq!(resolution, ApprovalResolution::Approved);

        let payload = captured
            .lock()
            .unwrap()
            .clone()
            .expect("agent:permission_required must be emitted");

        assert_eq!(
            payload["actionId"].as_str(),
            Some("envelope-1"),
            "existing consumers key off actionId; payload was {}",
            payload
        );
        let requested = payload["requestedAtMs"]
            .as_u64()
            .unwrap_or_else(|| panic!("envelope must carry requestedAtMs; got {}", payload));
        let expires = payload["expiresAtMs"]
            .as_u64()
            .unwrap_or_else(|| panic!("envelope must carry expiresAtMs; got {}", payload));
        assert!(
            expires > requested,
            "expiresAtMs ({}) must be after requestedAtMs ({})",
            expires,
            requested
        );
        assert_eq!(
            payload["timeoutSeconds"].as_u64(),
            Some(30),
            "timeoutSeconds must reflect the bound actually applied; payload was {}",
            payload
        );
    }

    /// An unanswered approval must reach a terminal denial on its own instead
    /// of parking the suspended step on a `oneshot` receiver forever.
    #[tokio::test]
    async fn test_unanswered_approval_expires_to_a_terminal_denial() {
        let controller = Arc::new(ApprovalController::default());

        let app = tauri::test::mock_app();
        let app_handle = app.handle().clone();

        // The outer guard is only a safety net so a regression cannot hang the
        // suite: the controller's own 150ms deadline is what must fire.
        let started = Instant::now();
        let resolution = tokio::time::timeout(
            Duration::from_secs(5),
            controller.request_approval_with_timeout(
                &app_handle,
                approval_payload("expiry-1"),
                Duration::from_millis(150),
            ),
        )
        .await
        .expect("request_approval must return on its own deadline, not wait forever")
        .expect("expiry is a resolution, not a transport failure");

        assert!(
            started.elapsed() < Duration::from_secs(5),
            "request_approval must return on its own deadline"
        );
        match &resolution {
            ApprovalResolution::Rejected { reason } => {
                let reason = reason.as_deref().unwrap_or_default();
                assert!(
                    reason.contains("expired"),
                    "expiry must say so; got {:?}",
                    reason
                );
            }
            other => panic!("expected a rejection, got {:?}", other),
        }

        // The slot is gone, and the outcome is remembered as terminal.
        let late = controller
            .resolve("expiry-1", ApprovalResolution::Approved)
            .await;
        let error = late.expect_err("an expired approval must not be approvable afterwards");
        assert!(
            error.to_string().contains("already resolved"),
            "a late approve must be refused as already-resolved, got: {}",
            error
        );
    }

    /// A caller that wraps `request_approval` in its own timeout drops the
    /// future. That must release the pending slot, not leak it.
    #[tokio::test]
    async fn test_cancelled_request_releases_the_pending_slot() {
        let controller = Arc::new(ApprovalController::default());

        let app = tauri::test::mock_app();
        let app_handle = app.handle().clone();

        let outer = tokio::time::timeout(
            Duration::from_millis(80),
            controller.request_approval_with_timeout(
                &app_handle,
                approval_payload("cancelled-1"),
                Duration::from_secs(30),
            ),
        )
        .await;
        assert!(outer.is_err(), "the outer timeout should win here");

        let late = controller
            .resolve("cancelled-1", ApprovalResolution::Approved)
            .await;
        let error = late.expect_err("a cancelled request has no live waiter");
        assert!(
            error.to_string().contains("not pending"),
            "a cancelled request must free its slot and report 'not pending', got: {}",
            error
        );
    }

    /// Double-clicking Approve, or a retried IPC call, must not surface an
    /// error on a card the user already answered successfully.
    #[tokio::test]
    async fn test_duplicate_identical_decision_is_idempotent() {
        let controller = Arc::new(ApprovalController::default());

        let app = tauri::test::mock_app();
        let app_handle = app.handle().clone();

        let controller_clone = controller.clone();
        let app_handle_clone = app_handle.clone();
        let request = task::spawn(async move {
            controller_clone
                .request_approval_with_timeout(
                    &app_handle_clone,
                    approval_payload("dup-1"),
                    Duration::from_secs(30),
                )
                .await
        });

        tokio::time::sleep(Duration::from_millis(50)).await;

        controller
            .resolve("dup-1", ApprovalResolution::Approved)
            .await
            .expect("first click must be accepted");

        let second = controller
            .resolve("dup-1", ApprovalResolution::Approved)
            .await;
        assert!(
            second.is_ok(),
            "replaying the identical decision must be a no-op, got: {:?}",
            second.err()
        );

        let resolution = request.await.unwrap().unwrap();
        assert_eq!(resolution, ApprovalResolution::Approved);
    }

    /// Idempotency must not become "last writer wins": a decision that
    /// contradicts the one already applied has to be refused.
    #[tokio::test]
    async fn test_conflicting_decision_after_resolution_is_refused() {
        let controller = Arc::new(ApprovalController::default());

        let app = tauri::test::mock_app();
        let app_handle = app.handle().clone();

        let controller_clone = controller.clone();
        let app_handle_clone = app_handle.clone();
        let request = task::spawn(async move {
            controller_clone
                .request_approval_with_timeout(
                    &app_handle_clone,
                    approval_payload("conflict-1"),
                    Duration::from_secs(30),
                )
                .await
        });

        tokio::time::sleep(Duration::from_millis(50)).await;

        controller
            .resolve(
                "conflict-1",
                ApprovalResolution::Rejected {
                    reason: Some("Denied by user in the execution panel".to_string()),
                },
            )
            .await
            .expect("first decision must be accepted");

        let flipped = controller
            .resolve("conflict-1", ApprovalResolution::Approved)
            .await;
        let error = flipped.expect_err("a denial must not be upgradable to an approval");
        assert!(
            error.to_string().contains("already resolved as rejected"),
            "the refusal must name the standing decision, got: {}",
            error
        );

        let resolution = request.await.unwrap().unwrap();
        assert!(matches!(resolution, ApprovalResolution::Rejected { .. }));
    }
}
