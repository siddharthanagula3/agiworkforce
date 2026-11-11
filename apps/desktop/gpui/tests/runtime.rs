use std::path::PathBuf;

use agiworkforce_app_server::{DeveloperSessionClientError, DeveloperSessionHostError};
use agiworkforce_desktop_gpui::config::{NativeContracts, Settings};
use agiworkforce_desktop_gpui::runtime::{consent_timestamp_ms, RuntimeSession};
use agiworkforce_protocol::developer_session::{
    method, AccountLoginWaitParams, AccountStatusParams, AccountStatusResponse,
};

#[cfg(feature = "cloud-fixture-test")]
#[tokio::test]
#[ignore = "run through the isolated workspace fixture"]
async fn real_cloud_workspaces_pin_creation_send_history_and_recovered_work() {
    assert_eq!(
        std::env::var("AGI_GPUI_WORKSPACES_FIXTURE").as_deref(),
        Ok("1")
    );
    let endpoint = url::Url::parse(&std::env::var("AGIWORKFORCE_API_BASE").unwrap()).unwrap();
    assert_eq!(endpoint.scheme(), "http");
    assert_eq!(endpoint.host_str(), Some("127.0.0.1"));

    use agiworkforce_desktop_gpui::workspaces::Workspaces;
    use agiworkforce_protocol::account_cloud::*;
    async fn connect() -> RuntimeSession {
        RuntimeSession::connect_account(
            &PathBuf::from(std::env::var_os("AGI_GPUI_TEST_RUNTIME").unwrap()),
            &NativeContracts::load().unwrap(),
            Settings::load().unwrap(),
        )
        .await
        .unwrap()
    }
    let session = connect().await;
    let client = session.client();
    assert!(session.capabilities().cloud_workspaces);
    let initial: CloudWorkspacesListResponse = client
        .request(
            method::CLOUD_WORKSPACES_LIST,
            CloudWorkspacesListParams { scope: None },
        )
        .await
        .unwrap();
    let scope = initial.scope.clone();
    let organizations = initial
        .workspaces
        .iter()
        .filter(|workspace| {
            matches!(
                workspace.selector,
                CloudConversationWorkspace::Organization { .. }
            )
        })
        .cloned()
        .collect::<Vec<_>>();
    assert_eq!(organizations.len(), 2);
    assert_ne!(organizations[0].id, organizations[1].id);
    assert_ne!(organizations[0].selector, organizations[1].selector);
    let mut native = Workspaces::default();
    native.accept_list(initial.clone()).unwrap();
    let list = |workspace| CloudHistoryListParams {
        project_id: None,
        workspace: Some(workspace),
        scope: Some(scope.clone()),
        limit: 10,
        offset: 0,
        cursor: None,
        query: None,
        archive_filter: None,
    };
    let personal: CloudConversationCreateResponse = client
        .request(
            method::CLOUD_CONVERSATION_CREATE,
            CloudConversationCreateParams {
                project_id: None,
                scope: scope.clone(),
                id: uuid::Uuid::new_v4().to_string(),
                workspace: Some(CloudConversationWorkspace::Personal),
            },
        )
        .await
        .unwrap();
    assert!(personal.conversation.organization_id.is_none());
    assert!(client
        .request::<CloudWorkspaceSelectResponse>(
            method::CLOUD_WORKSPACE_SELECT,
            CloudWorkspaceSelectParams {
                scope: "different-account".into(),
                id: organizations[0].id.clone()
            }
        )
        .await
        .is_err());
    assert!(client
        .request::<CloudWorkspaceSelectResponse>(
            method::CLOUD_WORKSPACE_SELECT,
            CloudWorkspaceSelectParams {
                scope: scope.clone(),
                id: "not-a-membership".into()
            }
        )
        .await
        .is_err());
    native.requested = Some(organizations[0].id.clone());
    let confirmed: CloudWorkspaceSelectResponse = client
        .request(
            method::CLOUD_WORKSPACE_SELECT,
            CloudWorkspaceSelectParams {
                scope: scope.clone(),
                id: organizations[0].id.clone(),
            },
        )
        .await
        .unwrap();
    native.accept_selection(confirmed).unwrap();
    let workspace_a = native.selector().unwrap().clone();
    let external = connect().await;
    assert!(external
        .client()
        .request::<CloudWorkspaceSelectResponse>(
            method::CLOUD_WORKSPACE_SELECT,
            CloudWorkspaceSelectParams {
                scope: scope.clone(),
                id: organizations[1].id.clone()
            }
        )
        .await
        .is_err());
    let changed_default: CloudWorkspacesListResponse = client
        .request(
            method::CLOUD_WORKSPACES_LIST,
            CloudWorkspacesListParams {
                scope: Some(scope.clone()),
            },
        )
        .await
        .unwrap();
    assert_eq!(changed_default.selected.id, organizations[1].id);
    assert!(!native.accept_list(changed_default.clone()).unwrap());
    assert_eq!(native.selector(), Some(&workspace_a));
    let mut recovering = Workspaces::default();
    recovering.accept_list(initial).unwrap();
    recovering.requested = Some(organizations[1].id.clone());
    recovering.uncertain = true;
    recovering.accept_list(changed_default).unwrap();
    assert_eq!(
        recovering.selected.as_ref().unwrap().id,
        organizations[1].id
    );
    let created: CloudConversationCreateResponse = client
        .request(
            method::CLOUD_CONVERSATION_CREATE,
            CloudConversationCreateParams {
                project_id: None,
                scope: scope.clone(),
                id: uuid::Uuid::new_v4().to_string(),
                workspace: Some(workspace_a.clone()),
            },
        )
        .await
        .unwrap();
    assert_eq!(
        CloudConversationWorkspace::from_organization(
            created.conversation.organization_id.as_deref()
        ),
        workspace_a
    );
    let page: CloudHistoryListResponse = client
        .request(method::CLOUD_HISTORY_LIST, list(workspace_a.clone()))
        .await
        .unwrap();
    assert_eq!(page.conversations.len(), 1);
    assert_eq!(page.workspace.as_ref(), Some(&workspace_a));
    let other: CloudHistoryListResponse = client
        .request(
            method::CLOUD_HISTORY_LIST,
            list(organizations[1].selector.clone()),
        )
        .await
        .unwrap();
    assert!(other.conversations.is_empty());
    let start = CloudTurnStartParams {
        attachments: Vec::new(),
        workspace: Some(workspace_a.clone()),
        scope: scope.clone(),
        conversation_id: created.conversation.id.clone(),
        request_id: uuid::Uuid::new_v4().to_string(),
        user_message_id: uuid::Uuid::new_v4().to_string(),
        text: "Stay in the selected workspace".into(),
        page_size: 10,
        model: None,
        work: None,
    };
    let _: CloudTurnSnapshot = client
        .request(method::CLOUD_TURN_START, start.clone())
        .await
        .unwrap();
    let identity = CloudTurnIdParams {
        workspace: Some(workspace_a.clone()),
        scope: scope.clone(),
        request_id: start.request_id.clone(),
        run_id: None,
    };
    let finished = tokio::time::timeout(std::time::Duration::from_secs(10), async {
        loop {
            let snapshot: CloudTurnSnapshot = client
                .request(method::CLOUD_TURN_READ, identity.clone())
                .await
                .unwrap();
            assert!(snapshot.error.is_none(), "{:?}", snapshot.error);
            if snapshot.accepted && !snapshot.needs_attention() {
                break snapshot;
            }
            tokio::time::sleep(std::time::Duration::from_millis(10)).await;
        }
    })
    .await
    .unwrap();
    assert_eq!(finished.output, "Workspace-bound reply");
    assert_eq!(finished.workspace.as_ref(), Some(&workspace_a));
    let mut wrong = identity;
    wrong.workspace = Some(organizations[1].selector.clone());
    assert!(client
        .request::<CloudTurnSnapshot>(method::CLOUD_TURN_READ, wrong)
        .await
        .is_err());
    let runs: CloudRunListResponse = client
        .request(
            method::CLOUD_RUN_LIST,
            CloudRunListParams {
                workspace: Some(workspace_a.clone()),
                scope: Some(scope.clone()),
                limit: 10,
                cursor: None,
                states: Vec::new(),
            },
        )
        .await
        .unwrap();
    assert_eq!(runs.runs.len(), 1);
    assert_eq!(runs.workspace.as_ref(), Some(&workspace_a));
    let run = runs.runs[0].clone();
    session.shutdown().await.unwrap();
    let cold = connect().await;
    let attached: CloudRunAttachResponse = cold
        .client()
        .request(
            method::CLOUD_RUN_ATTACH,
            CloudRunAttachParams {
                workspace: Some(workspace_a.clone()),
                scope: scope.clone(),
                run_id: run.id.clone(),
                page_size: 10,
            },
        )
        .await
        .unwrap();
    assert_eq!(attached.turn.workspace.as_ref(), Some(&workspace_a));
    assert_eq!(attached.turn.output, "Workspace-bound reply");
    assert!(cold
        .client()
        .request::<CloudRunAttachResponse>(
            method::CLOUD_RUN_ATTACH,
            CloudRunAttachParams {
                workspace: Some(organizations[1].selector.clone()),
                scope: scope.clone(),
                run_id: run.id.clone(),
                page_size: 10
            }
        )
        .await
        .is_err());
    let mut revoke = list(organizations[1].selector.clone());
    revoke.query = Some("revoke-first".into());
    let _: CloudHistoryListResponse = cold
        .client()
        .request(method::CLOUD_HISTORY_LIST, revoke)
        .await
        .unwrap();
    let memberships: CloudWorkspacesListResponse = cold
        .client()
        .request(
            method::CLOUD_WORKSPACES_LIST,
            CloudWorkspacesListParams {
                scope: Some(scope.clone()),
            },
        )
        .await
        .unwrap();
    assert!(native.accept_list(memberships).unwrap());
    assert!(native.selector().is_none());
    assert!(cold
        .client()
        .request::<CloudHistoryListResponse>(method::CLOUD_HISTORY_LIST, list(workspace_a))
        .await
        .is_err());
    assert!(cold
        .client()
        .request::<CloudWorkspaceSelectResponse>(
            method::CLOUD_WORKSPACE_SELECT,
            CloudWorkspaceSelectParams {
                scope,
                id: organizations[0].id.clone()
            }
        )
        .await
        .is_err());
    cold.shutdown().await.unwrap();
    external.shutdown().await.unwrap();
}

#[cfg(feature = "cloud-fixture-test")]
fn scoped_work_fixture_workspace(
) -> Option<agiworkforce_protocol::account_cloud::CloudConversationWorkspace> {
    assert_eq!(
        std::env::var("AGI_GPUI_WORKSCOPED_FIXTURE").as_deref(),
        Ok("1")
    );
    let id = std::env::var("AGI_GPUI_WORKSPACE_ORGANIZATION").unwrap();
    uuid::Uuid::parse_str(&id).unwrap();
    Some(agiworkforce_protocol::account_cloud::CloudConversationWorkspace::Organization { id })
}

#[cfg(feature = "cloud-fixture-test")]
#[tokio::test]
#[ignore = "run through the isolated Work creation fixture"]
async fn real_cloud_work_start_reviews_and_recovers_plans_without_duplicate_execution() {
    use agiworkforce_protocol::account_cloud::*;
    use agiworkforce_protocol::task_state::AgentTaskState;
    async fn connect() -> RuntimeSession {
        RuntimeSession::connect_account(
            &PathBuf::from(std::env::var_os("AGI_GPUI_TEST_RUNTIME").unwrap()),
            &NativeContracts::load().unwrap(),
            Settings::load().unwrap(),
        )
        .await
        .unwrap()
    }
    async fn scope(client: &agiworkforce_app_server::BackgroundDeveloperSessionClient) -> String {
        client
            .request::<CloudHistoryListResponse>(
                method::CLOUD_HISTORY_LIST,
                CloudHistoryListParams {
                    project_id: None,
                    workspace: scoped_work_fixture_workspace(),
                    archive_filter: None,
                    scope: None,
                    limit: 2,
                    offset: 0,
                    cursor: None,
                    query: None,
                },
            )
            .await
            .unwrap()
            .scope
    }
    async fn wait(
        client: &agiworkforce_app_server::BackgroundDeveloperSessionClient,
        params: &CloudTurnStartParams,
        ready: impl Fn(&CloudTurnSnapshot) -> bool,
    ) -> CloudTurnSnapshot {
        tokio::time::timeout(std::time::Duration::from_secs(10), async {
            loop {
                let snapshot: CloudTurnSnapshot = client
                    .request(
                        method::CLOUD_TURN_READ,
                        CloudTurnIdParams {
                            workspace: scoped_work_fixture_workspace(),
                            scope: params.scope.clone(),
                            request_id: params.request_id.clone(),
                            run_id: None,
                        },
                    )
                    .await
                    .unwrap();
                if ready(&snapshot) {
                    return snapshot;
                }
                tokio::time::sleep(std::time::Duration::from_millis(20)).await;
            }
        })
        .await
        .unwrap()
    }
    fn continued(scope: &str, review: &CloudWorkPlanReview) -> CloudTurnStartParams {
        let id = uuid::Uuid::parse_str(&review.review_id).unwrap();
        CloudTurnStartParams {
            attachments: Vec::new(),
            workspace: scoped_work_fixture_workspace(),
            model: None,
            scope: scope.into(),
            conversation_id: review.conversation_id.clone(),
            request_id: id.to_string(),
            user_message_id: uuid::Uuid::new_v5(&id, b"user-message").to_string(),
            text: review.goal.goal.clone(),
            page_size: 2,
            work: Some(CloudWorkRequest {
                mode: review.mode.clone(),
                goal: review.goal.clone(),
                plan: Some(review.clone()),
            }),
        }
    }
    assert_eq!(
        std::env::var("AGI_GPUI_WORK_START_FIXTURE").as_deref(),
        Ok("1")
    );
    assert_eq!(
        url::Url::parse(&std::env::var("AGIWORKFORCE_API_BASE").unwrap())
            .unwrap()
            .host_str(),
        Some("127.0.0.1")
    );
    let session = connect().await;
    let client = session.client();
    let owner = scope(&client).await;
    assert!(session.capabilities().cloud_work_start);
    let created: CloudConversationCreateResponse = client
        .request(
            method::CLOUD_CONVERSATION_CREATE,
            CloudConversationCreateParams {
                project_id: None,
                workspace: scoped_work_fixture_workspace(),
                scope: owner.clone(),
                id: uuid::Uuid::new_v4().to_string(),
            },
        )
        .await
        .unwrap();
    let make = |goal: &str| CloudTurnStartParams {
        attachments: Vec::new(),
        workspace: scoped_work_fixture_workspace(),
        model: None,
        scope: owner.clone(),
        conversation_id: created.conversation.id.clone(),
        request_id: uuid::Uuid::new_v4().to_string(),
        user_message_id: uuid::Uuid::new_v4().to_string(),
        text: goal.into(),
        page_size: 2,
        work: Some(CloudWorkRequest {
            mode: NativeContracts::load().unwrap().work_mode,
            goal: CloudWorkGoal {
                goal: goal.into(),
                constraints: None,
                deliverable: None,
                excluded_tools: None,
            },
            plan: None,
        }),
    };
    let denied = make("Denied goal");
    let _: CloudTurnSnapshot = client
        .request(method::CLOUD_TURN_START, denied.clone())
        .await
        .unwrap();
    let refusal = wait(&client, &denied, |snapshot| {
        snapshot.state == AgentTaskState::Failed
    })
    .await;
    assert!(refusal.rejected);
    assert!(!refusal.accepted);
    assert!(refusal.error.unwrap().contains("entitlement"));
    let first = make("First goal");
    let _: CloudTurnSnapshot = client
        .request(method::CLOUD_TURN_START, first.clone())
        .await
        .unwrap();
    let unsaved = wait(&client, &first, |snapshot| {
        snapshot.work_plan_error.is_some()
    })
    .await;
    assert!(!unsaved.work_plan_saved);
    assert!(unsaved.needs_attention());
    let plan_a = unsaved.work_plan.unwrap();
    assert_eq!(plan_a.steps.len(), 3);
    assert!(plan_a.awaiting_approval);
    assert!(client
        .request::<CloudTurnSnapshot>(method::CLOUD_TURN_START, continued(&owner, &plan_a))
        .await
        .is_err());
    assert!(client
        .request::<CloudWorkPlanReview>(
            method::CLOUD_WORK_PLAN_UPDATE,
            CloudWorkPlanUpdateParams {
                workspace: scoped_work_fixture_workspace(),
                scope: "another-account".into(),
                reviewed: plan_a.clone(),
                decline: false
            }
        )
        .await
        .is_err());
    let saved: CloudWorkPlanReview = client
        .request(
            method::CLOUD_WORK_PLAN_UPDATE,
            CloudWorkPlanUpdateParams {
                workspace: scoped_work_fixture_workspace(),
                scope: owner,
                reviewed: plan_a.clone(),
                decline: false,
            },
        )
        .await
        .unwrap();
    assert_eq!(saved, plan_a);
    session.shutdown().await.unwrap();

    let session = connect().await;
    let client = session.client();
    let owner = scope(&client).await;
    let attached: CloudRunAttachResponse = client
        .request(
            method::CLOUD_RUN_ATTACH,
            CloudRunAttachParams {
                workspace: scoped_work_fixture_workspace(),
                scope: owner.clone(),
                run_id: plan_a.run_id.clone(),
                page_size: 2,
            },
        )
        .await
        .unwrap();
    assert_eq!(attached.turn.work_plan.as_ref(), Some(&plan_a));
    assert!(attached.turn.work_plan_saved);
    let dismissed: CloudWorkPlanReview = client
        .request(
            method::CLOUD_WORK_PLAN_UPDATE,
            CloudWorkPlanUpdateParams {
                workspace: scoped_work_fixture_workspace(),
                scope: owner.clone(),
                reviewed: plan_a.clone(),
                decline: true,
            },
        )
        .await
        .unwrap();
    assert!(dismissed.declined);
    assert!(!dismissed.awaiting_approval);
    let rejected = continued(&owner, &plan_a);
    let _: CloudTurnSnapshot = client
        .request(method::CLOUD_TURN_START, rejected.clone())
        .await
        .unwrap();
    assert!(wait(&client, &rejected, |snapshot| snapshot.state
        == AgentTaskState::Failed)
    .await
    .error
    .unwrap()
    .contains("declined"));
    let second = CloudTurnStartParams {
        attachments: Vec::new(),
        workspace: scoped_work_fixture_workspace(),
        model: None,
        scope: owner.clone(),
        conversation_id: plan_a.conversation_id.clone(),
        request_id: uuid::Uuid::new_v4().to_string(),
        user_message_id: uuid::Uuid::new_v4().to_string(),
        text: "Second goal".into(),
        page_size: 2,
        work: Some(CloudWorkRequest {
            mode: plan_a.mode.clone(),
            goal: CloudWorkGoal {
                goal: "Second goal".into(),
                constraints: None,
                deliverable: None,
                excluded_tools: None,
            },
            plan: None,
        }),
    };
    let _: CloudTurnSnapshot = client
        .request(method::CLOUD_TURN_START, second.clone())
        .await
        .unwrap();
    let reviewed = wait(&client, &second, |snapshot| snapshot.work_plan_saved).await;
    let plan_b = reviewed.work_plan.unwrap();
    let mut changed = continued(&owner, &plan_b);
    changed.work.as_mut().unwrap().plan.as_mut().unwrap().steps[0].description =
        "A different action".into();
    assert!(client
        .request::<CloudTurnSnapshot>(method::CLOUD_TURN_START, changed)
        .await
        .is_err());
    let mut changed_model = continued(&owner, &plan_b);
    changed_model.model = Some("fixture-unreviewed-model".into());
    assert!(client
        .request::<CloudTurnSnapshot>(method::CLOUD_TURN_START, changed_model)
        .await
        .is_err());
    let execution = continued(&owner, &plan_b);
    let _: CloudTurnSnapshot = client
        .request(method::CLOUD_TURN_START, execution.clone())
        .await
        .unwrap();
    let duplicate: CloudTurnSnapshot = client
        .request(method::CLOUD_TURN_START, execution.clone())
        .await
        .unwrap();
    assert_eq!(duplicate.request_id, execution.request_id);
    let finished = wait(&client, &execution, |snapshot| !snapshot.needs_attention()).await;
    assert_eq!(finished.output, "Finished the reviewed work.");
    assert!(finished.error.is_none());
    let history: CloudHistoryReadResponse = client
        .request(
            method::CLOUD_HISTORY_READ,
            CloudHistoryReadParams {
                workspace: scoped_work_fixture_workspace(),
                scope: owner,
                conversation_id: plan_b.conversation_id.clone(),
                limit: 50,
                offset: 0,
                latest: true,
                before: None,
            },
        )
        .await
        .unwrap();
    let stored = history
        .messages
        .iter()
        .find(|message| message.id == plan_b.planning_message_id)
        .unwrap()
        .work_plan
        .as_ref()
        .unwrap();
    assert!(!stored.awaiting_approval);
    assert!(!stored.declined);
    session.shutdown().await.unwrap();

    let session = connect().await;
    let client = session.client();
    let owner = scope(&client).await;
    let replay = continued(&owner, &plan_b);
    let _: CloudTurnSnapshot = client
        .request(method::CLOUD_TURN_START, replay.clone())
        .await
        .unwrap();
    let replayed = wait(&client, &replay, |snapshot| !snapshot.needs_attention()).await;
    assert!(!replayed.accepted);
    assert_eq!(replayed.state, AgentTaskState::Failed);
    assert!(replayed.output.is_empty());
    assert!(replayed
        .error
        .as_deref()
        .is_some_and(|error| error.contains("terminal state")));
    session.shutdown().await.unwrap();
}

#[cfg(feature = "cloud-fixture-test")]
#[tokio::test]
#[ignore = "run through the isolated loopback work fixture runner"]
async fn real_cloud_work_reviews_exact_actions_and_resumes_durable_output() {
    use agiworkforce_protocol::account_cloud::*;
    use agiworkforce_protocol::task_state::AgentTaskState;
    async fn boundary(
        client: &agiworkforce_app_server::BackgroundDeveloperSessionClient,
        id: &CloudTurnIdParams,
        state: AgentTaskState,
    ) -> CloudTurnSnapshot {
        tokio::time::timeout(std::time::Duration::from_secs(10), async {
            loop {
                let snapshot: CloudTurnSnapshot = client
                    .request(method::CLOUD_TURN_READ, id.clone())
                    .await
                    .unwrap();
                assert!(snapshot.error.is_none(), "{:?}", snapshot.error);
                if snapshot.state == state
                    && !snapshot.catching_up
                    && (state != AgentTaskState::ReadyForReview || !snapshot.needs_attention())
                {
                    return snapshot;
                }
                tokio::time::sleep(std::time::Duration::from_millis(20)).await;
            }
        })
        .await
        .unwrap()
    }
    assert_eq!(std::env::var("AGI_GPUI_WORK_FIXTURE").as_deref(), Ok("1"));
    assert_eq!(
        url::Url::parse(&std::env::var("AGIWORKFORCE_API_BASE").unwrap())
            .unwrap()
            .host_str(),
        Some("127.0.0.1")
    );
    let session = RuntimeSession::connect_account(
        &PathBuf::from(std::env::var_os("AGI_GPUI_TEST_RUNTIME").unwrap()),
        &NativeContracts::load().unwrap(),
        Settings::load().unwrap(),
    )
    .await
    .unwrap();
    assert!(session.capabilities().cloud_turn_resume);
    let client = session.client();
    let page: CloudHistoryListResponse = client
        .request(
            method::CLOUD_HISTORY_LIST,
            CloudHistoryListParams {
                project_id: None,
                workspace: scoped_work_fixture_workspace(),
                archive_filter: None,
                limit: 2,
                offset: 0,
                cursor: None,
                query: None,
                scope: None,
            },
        )
        .await
        .unwrap();
    let created: CloudConversationCreateResponse = client
        .request(
            method::CLOUD_CONVERSATION_CREATE,
            CloudConversationCreateParams {
                project_id: None,
                workspace: scoped_work_fixture_workspace(),
                scope: page.scope.clone(),
                id: uuid::Uuid::new_v4().to_string(),
            },
        )
        .await
        .unwrap();
    for (index, state, expected) in [
        (0, AgentTaskState::AwaitingApproval, "Before. Approved."),
        (1, AgentTaskState::Paused, "Before. Resumed."),
        (2, AgentTaskState::AwaitingApproval, "Before. Denied."),
    ] {
        let params = CloudTurnStartParams {
            attachments: Vec::new(),
            workspace: scoped_work_fixture_workspace(),
            model: None,
            work: None,
            scope: page.scope.clone(),
            conversation_id: created.conversation.id.clone(),
            request_id: uuid::Uuid::new_v4().to_string(),
            user_message_id: uuid::Uuid::new_v4().to_string(),
            text: "Review this work".into(),
            page_size: 1,
        };
        let _: CloudTurnSnapshot = client
            .request(method::CLOUD_TURN_START, params.clone())
            .await
            .unwrap();
        let id = CloudTurnIdParams {
            workspace: scoped_work_fixture_workspace(),
            run_id: None,
            scope: page.scope.clone(),
            request_id: params.request_id.clone(),
        };
        let snapshot = boundary(&client, &id, state).await;
        let action = if state == AgentTaskState::Paused {
            CloudTurnResumeAction::Paused
        } else {
            assert_eq!(snapshot.approvals.len(), 1);
            assert_eq!(
                snapshot.approvals[0].input["content"]
                    .as_str()
                    .unwrap()
                    .len(),
                600
            );
            let correct = CloudTurnResumeAction::Approval {
                checkpoint: snapshot.approval_checkpoint.clone().unwrap(),
                approved: index == 0,
                reviewed: snapshot.approvals.clone(),
            };
            let mut altered = snapshot.approvals.clone();
            altered[0].input = serde_json::json!({ "path": "a different file" });
            for action in [
                CloudTurnResumeAction::Approval {
                    checkpoint: "expired".into(),
                    approved: true,
                    reviewed: snapshot.approvals.clone(),
                },
                CloudTurnResumeAction::Approval {
                    checkpoint: snapshot.approval_checkpoint.clone().unwrap(),
                    approved: true,
                    reviewed: altered,
                },
            ] {
                assert!(client
                    .request::<CloudTurnSnapshot>(
                        method::CLOUD_TURN_RESUME,
                        CloudTurnResumeParams {
                            workspace: scoped_work_fixture_workspace(),
                            run_id: None,
                            scope: id.scope.clone(),
                            request_id: id.request_id.clone(),
                            action
                        }
                    )
                    .await
                    .is_err());
            }
            correct
        };
        assert!(client
            .request::<CloudTurnSnapshot>(
                method::CLOUD_TURN_RESUME,
                CloudTurnResumeParams {
                    workspace: scoped_work_fixture_workspace(),
                    run_id: None,
                    scope: "another-account".into(),
                    request_id: id.request_id.clone(),
                    action: action.clone()
                }
            )
            .await
            .is_err());
        let resumed: CloudTurnSnapshot = client
            .request(
                method::CLOUD_TURN_RESUME,
                CloudTurnResumeParams {
                    workspace: scoped_work_fixture_workspace(),
                    run_id: None,
                    scope: id.scope.clone(),
                    request_id: id.request_id.clone(),
                    action: action.clone(),
                },
            )
            .await
            .unwrap();
        assert_eq!(resumed.state, AgentTaskState::Resuming);
        if state == AgentTaskState::Paused {
            assert!(resumed.stream_attached);
            assert!(!resumed.detachable);
            tokio::time::sleep(std::time::Duration::from_millis(100)).await;
        }
        let completed = boundary(&client, &id, AgentTaskState::ReadyForReview).await;
        assert_eq!(completed.output, expected);
        assert!(completed.approvals.is_empty());
        assert!(client
            .request::<CloudTurnSnapshot>(
                method::CLOUD_TURN_RESUME,
                CloudTurnResumeParams {
                    workspace: scoped_work_fixture_workspace(),
                    run_id: None,
                    scope: id.scope.clone(),
                    request_id: id.request_id.clone(),
                    action
                }
            )
            .await
            .is_err());
        let mut offset = 0;
        let mut found = false;
        loop {
            let saved: CloudHistoryReadResponse = client
                .request(
                    method::CLOUD_HISTORY_READ,
                    CloudHistoryReadParams {
                        workspace: scoped_work_fixture_workspace(),
                        latest: false,
                        before: None,
                        scope: id.scope.clone(),
                        conversation_id: created.conversation.id.clone(),
                        limit: 2,
                        offset,
                    },
                )
                .await
                .unwrap();
            found |= saved
                .messages
                .iter()
                .any(|message| message.id == params.request_id && message.content == expected);
            if !saved.has_more {
                break;
            }
            offset = saved.next_offset;
        }
        assert!(found, "The resumed reply was not saved");
    }
    let params = CloudTurnStartParams {
        attachments: Vec::new(),
        workspace: scoped_work_fixture_workspace(),
        model: None,
        work: None,
        scope: page.scope.clone(),
        conversation_id: created.conversation.id.clone(),
        request_id: uuid::Uuid::new_v4().to_string(),
        user_message_id: uuid::Uuid::new_v4().to_string(),
        text: "Wait for complete review details".into(),
        page_size: 1,
    };
    let _: CloudTurnSnapshot = client
        .request(method::CLOUD_TURN_START, params.clone())
        .await
        .unwrap();
    let id = CloudTurnIdParams {
        workspace: scoped_work_fixture_workspace(),
        run_id: None,
        scope: page.scope.clone(),
        request_id: params.request_id,
    };
    tokio::time::timeout(std::time::Duration::from_secs(10), async {
        loop {
            if client
                .request::<CloudTurnSnapshot>(method::CLOUD_TURN_READ, id.clone())
                .await
                .is_err()
            {
                break;
            }
            tokio::time::sleep(std::time::Duration::from_millis(20)).await;
        }
    })
    .await
    .unwrap();
    assert!(client.is_connected());
    let _: CloudHistoryListResponse = client
        .request(
            method::CLOUD_HISTORY_LIST,
            CloudHistoryListParams {
                project_id: None,
                workspace: scoped_work_fixture_workspace(),
                archive_filter: None,
                limit: 2,
                offset: 0,
                cursor: None,
                scope: Some(page.scope.clone()),
                query: Some("release-pending".into()),
            },
        )
        .await
        .unwrap();
    let ready = boundary(&client, &id, AgentTaskState::AwaitingApproval).await;
    let _: CloudTurnSnapshot = client
        .request(
            method::CLOUD_TURN_RESUME,
            CloudTurnResumeParams {
                workspace: scoped_work_fixture_workspace(),
                run_id: None,
                scope: id.scope.clone(),
                request_id: id.request_id.clone(),
                action: CloudTurnResumeAction::Approval {
                    checkpoint: ready.approval_checkpoint.unwrap(),
                    approved: true,
                    reviewed: ready.approvals,
                },
            },
        )
        .await
        .unwrap();
    assert_eq!(
        boundary(&client, &id, AgentTaskState::ReadyForReview)
            .await
            .output,
        "Before. Approved."
    );
    let pending = CloudTurnStartParams {
        attachments: Vec::new(),
        workspace: scoped_work_fixture_workspace(),
        model: None,
        work: None,
        scope: page.scope.clone(),
        conversation_id: created.conversation.id.clone(),
        request_id: uuid::Uuid::new_v4().to_string(),
        user_message_id: uuid::Uuid::new_v4().to_string(),
        text: "Continue this durable work if the stream disconnects".into(),
        page_size: 1,
    };
    let _: CloudTurnSnapshot = client
        .request(method::CLOUD_TURN_START, pending.clone())
        .await
        .unwrap();
    tokio::time::sleep(std::time::Duration::from_millis(200)).await;
    let handle = CloudTurnIdParams {
        workspace: scoped_work_fixture_workspace(),
        scope: page.scope.clone(),
        request_id: pending.request_id,
        run_id: None,
    };
    let running = boundary(&client, &handle, AgentTaskState::Running).await;
    assert_eq!(running.output, "Before.");
    assert!(running.detachable);
    let _: serde_json::Value = client
        .request(
            method::CLOUD_TURN_DETACH,
            CloudTurnIdParams {
                workspace: scoped_work_fixture_workspace(),
                run_id: running.run_id,
                ..handle
            },
        )
        .await
        .unwrap();
    session.shutdown().await.unwrap();

    let session = RuntimeSession::connect_account(
        &PathBuf::from(std::env::var_os("AGI_GPUI_TEST_RUNTIME").unwrap()),
        &NativeContracts::load().unwrap(),
        Settings::load().unwrap(),
    )
    .await
    .unwrap();
    let client = session.client();
    let first: CloudRunListResponse = client
        .request(
            method::CLOUD_RUN_LIST,
            CloudRunListParams {
                workspace: scoped_work_fixture_workspace(),
                scope: None,
                limit: 1,
                cursor: None,
                states: Vec::new(),
            },
        )
        .await
        .unwrap();
    assert_eq!(first.runs.len(), 1);
    assert_eq!(first.runs[0].origin_surface, "web");
    assert!(client
        .request::<CloudRunListResponse>(
            method::CLOUD_RUN_LIST,
            CloudRunListParams {
                workspace: scoped_work_fixture_workspace(),
                scope: Some("another-account".into()),
                limit: 1,
                cursor: None,
                states: Vec::new()
            }
        )
        .await
        .is_err());
    let second: CloudRunListResponse = client
        .request(
            method::CLOUD_RUN_LIST,
            CloudRunListParams {
                workspace: scoped_work_fixture_workspace(),
                scope: Some(first.scope.clone()),
                limit: 1,
                cursor: first.next_cursor.clone(),
                states: Vec::new(),
            },
        )
        .await
        .unwrap();
    assert_eq!(second.runs.len(), 1);
    assert!(second.next_cursor.is_none());
    assert_eq!(first.runs[0].request_id, second.runs[0].request_id);
    assert_ne!(first.runs[0].id, second.runs[0].id);
    let completed: CloudRunListResponse = client
        .request(
            method::CLOUD_RUN_LIST,
            CloudRunListParams {
                workspace: scoped_work_fixture_workspace(),
                scope: Some(first.scope.clone()),
                limit: 1,
                cursor: None,
                states: vec![AgentTaskState::Completed],
            },
        )
        .await
        .unwrap();
    assert_eq!(
        completed.runs[0].effective_state(),
        AgentTaskState::Completed
    );
    let attached: CloudRunAttachResponse = client
        .request(
            method::CLOUD_RUN_ATTACH,
            CloudRunAttachParams {
                workspace: scoped_work_fixture_workspace(),
                scope: first.scope.clone(),
                run_id: first.runs[0].id.clone(),
                page_size: 1,
            },
        )
        .await
        .unwrap();
    let handle = CloudTurnIdParams {
        workspace: scoped_work_fixture_workspace(),
        scope: first.scope.clone(),
        request_id: attached.turn.request_id.clone(),
        run_id: attached.turn.run_id.clone(),
    };
    let ready = boundary(&client, &handle, AgentTaskState::AwaitingApproval).await;
    assert_eq!(ready.output, "Recovered.");
    let wrong_run = CloudTurnIdParams {
        workspace: scoped_work_fixture_workspace(),
        run_id: Some(second.runs[0].id.clone()),
        ..handle.clone()
    };
    assert!(client
        .request::<CloudTurnSnapshot>(method::CLOUD_TURN_READ, wrong_run.clone())
        .await
        .is_err());
    assert!(client
        .request::<CloudTurnSnapshot>(method::CLOUD_TURN_STOP, wrong_run.clone())
        .await
        .is_err());
    assert!(client
        .request::<serde_json::Value>(method::CLOUD_TURN_DETACH, wrong_run)
        .await
        .is_err());
    let _: serde_json::Value = client
        .request(method::CLOUD_TURN_DETACH, handle)
        .await
        .unwrap();
    let unlinked: CloudRunAttachResponse = client
        .request(
            method::CLOUD_RUN_ATTACH,
            CloudRunAttachParams {
                workspace: scoped_work_fixture_workspace(),
                scope: first.scope.clone(),
                run_id: second.runs[0].id.clone(),
                page_size: 1,
            },
        )
        .await
        .unwrap();
    assert!(unlinked.turn.conversation_id.is_none());
    let handle = CloudTurnIdParams {
        workspace: scoped_work_fixture_workspace(),
        scope: first.scope.clone(),
        request_id: unlinked.turn.request_id,
        run_id: unlinked.turn.run_id,
    };
    let ready = boundary(&client, &handle, AgentTaskState::Paused).await;
    assert_eq!(ready.output, "Unlinked.");
    let resumed: CloudTurnSnapshot = client
        .request(
            method::CLOUD_TURN_RESUME,
            CloudTurnResumeParams {
                workspace: scoped_work_fixture_workspace(),
                scope: handle.scope.clone(),
                request_id: handle.request_id.clone(),
                run_id: handle.run_id.clone(),
                action: CloudTurnResumeAction::Paused,
            },
        )
        .await
        .unwrap();
    assert!(resumed.stream_attached);
    assert!(client
        .request::<serde_json::Value>(method::CLOUD_TURN_DETACH, handle.clone())
        .await
        .is_err());
    assert_eq!(
        boundary(&client, &handle, AgentTaskState::ReadyForReview)
            .await
            .output,
        "Unlinked. Resumed."
    );
    let _: serde_json::Value = client
        .request(method::CLOUD_TURN_DETACH, handle)
        .await
        .unwrap();
    let attached: CloudRunAttachResponse = client
        .request(
            method::CLOUD_RUN_ATTACH,
            CloudRunAttachParams {
                workspace: scoped_work_fixture_workspace(),
                scope: first.scope.clone(),
                run_id: first.runs[0].id.clone(),
                page_size: 1,
            },
        )
        .await
        .unwrap();
    let handle = CloudTurnIdParams {
        workspace: scoped_work_fixture_workspace(),
        scope: first.scope,
        request_id: attached.turn.request_id,
        run_id: attached.turn.run_id,
    };
    let ready = boundary(&client, &handle, AgentTaskState::AwaitingApproval).await;
    let _: CloudTurnSnapshot = client
        .request(
            method::CLOUD_TURN_RESUME,
            CloudTurnResumeParams {
                workspace: scoped_work_fixture_workspace(),
                scope: handle.scope.clone(),
                request_id: handle.request_id.clone(),
                run_id: handle.run_id.clone(),
                action: CloudTurnResumeAction::Approval {
                    checkpoint: ready.approval_checkpoint.unwrap(),
                    approved: true,
                    reviewed: ready.approvals,
                },
            },
        )
        .await
        .unwrap();
    assert_eq!(
        boundary(&client, &handle, AgentTaskState::ReadyForReview)
            .await
            .output,
        "Recovered. Approved."
    );
    session.shutdown().await.unwrap();
}

#[tokio::test]
#[ignore = "requires a built CLI and an isolated AGIWORKFORCE_HOME"]
async fn real_cli_lists_an_empty_consented_workspace_and_shuts_down() {
    let binary = PathBuf::from(std::env::var_os("AGI_GPUI_TEST_RUNTIME").expect("built CLI path"));
    assert!(
        std::env::var_os("AGIWORKFORCE_HOME").is_some(),
        "use an isolated CLI config root"
    );
    let workspace = tempfile::tempdir().unwrap();
    let contracts = NativeContracts::load().unwrap();
    let mut session = RuntimeSession::connect(
        &binary,
        workspace.path(),
        consent_timestamp_ms().unwrap(),
        &contracts,
        Settings::load().unwrap(),
    )
    .await
    .unwrap();
    let listed = session.list_sessions(None).await.unwrap();
    assert!(listed.threads.is_empty());
    assert!(listed.next_cursor.is_none());
    assert!(session.capabilities().account);
    assert!(session.capabilities().account_login_cancel);
    assert!(
        std::env::var_os("AGIWORKFORCE_JWT").is_none(),
        "unset account JWTs in the isolated test process"
    );
    let client = session.client();
    let status: AccountStatusResponse = client
        .request(method::ACCOUNT_STATUS, AccountStatusParams::default())
        .await
        .unwrap();
    assert!(!status.signed_in);
    assert!(matches!(
        client
            .request::<serde_json::Value>(
                method::ACCOUNT_LOGIN_CANCEL,
                AccountLoginWaitParams {
                    login_id: "nonexistent-isolated-login".into()
                }
            )
            .await,
        Err(DeveloperSessionClientError::Remote { code, message, .. })
            if code == DeveloperSessionHostError::not_found("").code()
                && message.contains("The sign-in already finished or was cancelled")
    ));
    assert!(client.is_connected());
    session.shutdown().await.unwrap();
}

#[tokio::test]
#[ignore = "requires a built CLI and an isolated AGIWORKFORCE_HOME without an account JWT"]
async fn real_account_connection_starts_without_workspace_consent_and_refuses_code_requests() {
    let binary = PathBuf::from(std::env::var_os("AGI_GPUI_TEST_RUNTIME").expect("built CLI path"));
    assert!(std::env::var_os("AGIWORKFORCE_HOME").is_some());
    assert!(std::env::var_os("AGIWORKFORCE_JWT").is_none());
    let contracts = NativeContracts::load().unwrap();
    let mut session =
        RuntimeSession::connect_account(&binary, &contracts, Settings::load().unwrap())
            .await
            .unwrap();
    assert!(!session.capabilities().threads);
    assert!(!session.capabilities().tools);
    assert!(session
        .list_sessions(None)
        .await
        .unwrap_err()
        .to_string()
        .contains("no coding workspace"));
    let client = session.client();
    let request = client
        .request::<serde_json::Value>(
            method::THREAD_LIST,
            agiworkforce_protocol::developer_session::ThreadListParams::default(),
        )
        .await;
    assert!(
        matches!(request, Err(DeveloperSessionClientError::Remote { code, message, .. })
        if code == DeveloperSessionHostError::unavailable("").code() && message.contains("no coding workspace"))
    );
    let status: AccountStatusResponse = client
        .request(method::ACCOUNT_STATUS, AccountStatusParams::default())
        .await
        .unwrap();
    assert!(!status.signed_in);
    session.shutdown().await.unwrap();
}

#[cfg(feature = "cloud-fixture-test")]
#[tokio::test]
#[ignore = "run through the isolated loopback fixture runner"]
async fn real_cloud_history_reads_the_fixture_and_refuses_a_different_scope() {
    use agiworkforce_protocol::account_cloud::{
        CloudHistoryListParams, CloudHistoryListResponse, CloudHistoryReadParams,
        CloudHistoryReadResponse,
    };
    assert_eq!(std::env::var("AGI_GPUI_HISTORY_FIXTURE").unwrap(), "1");
    let base = url::Url::parse(&std::env::var("AGIWORKFORCE_API_BASE").unwrap()).unwrap();
    assert_eq!(base.host_str(), Some("127.0.0.1"));
    assert!(std::env::var_os("AGIWORKFORCE_HOME").is_some());
    let binary = PathBuf::from(std::env::var_os("AGI_GPUI_TEST_RUNTIME").unwrap());
    let contracts = NativeContracts::load().unwrap();
    let session = RuntimeSession::connect_account(&binary, &contracts, Settings::load().unwrap())
        .await
        .unwrap();
    let client = session.client();
    let page: CloudHistoryListResponse = client
        .request(
            method::CLOUD_HISTORY_LIST,
            CloudHistoryListParams {
                project_id: None,
                workspace: None,
                archive_filter: None,
                limit: 2,
                offset: 0,
                cursor: None,
                query: Some("fixture".into()),
                scope: None,
            },
        )
        .await
        .unwrap();
    assert_eq!(page.conversations.len(), 1);
    assert!(!page.scope.is_empty());
    assert!(page.conversations[0].title.is_none());
    let read: CloudHistoryReadResponse = client
        .request(
            method::CLOUD_HISTORY_READ,
            CloudHistoryReadParams {
                workspace: None,
                latest: false,
                before: None,
                conversation_id: page.conversations[0].id.clone(),
                scope: page.scope.clone(),
                limit: 2,
                offset: 0,
            },
        )
        .await
        .unwrap();
    assert_eq!(read.messages[0].content, "你好 🦀");
    assert_eq!(read.scope, page.scope);
    let rejected = client
        .request::<CloudHistoryReadResponse>(
            method::CLOUD_HISTORY_READ,
            CloudHistoryReadParams {
                workspace: None,
                latest: false,
                before: None,
                conversation_id: page.conversations[0].id.clone(),
                scope: "different-account".into(),
                limit: 2,
                offset: 0,
            },
        )
        .await;
    assert!(
        matches!(rejected, Err(DeveloperSessionClientError::Remote { code, .. }) if code == DeveloperSessionHostError::conflict("").code())
    );
    let next: CloudHistoryListResponse = client
        .request(
            method::CLOUD_HISTORY_LIST,
            CloudHistoryListParams {
                project_id: None,
                workspace: None,
                archive_filter: None,
                limit: 2,
                offset: page.next_offset,
                cursor: page.next_cursor,
                query: Some("fixture".into()),
                scope: Some(page.scope.clone()),
            },
        )
        .await
        .unwrap();
    assert!(next.conversations.is_empty());
    assert!(!next.has_more);
    assert_eq!(next.scope, page.scope);
    let long = CloudHistoryReadParams {
        workspace: None,
        conversation_id: std::env::var("AGI_GPUI_HISTORY_LONG_ID").unwrap(),
        scope: page.scope.clone(),
        limit: 50,
        offset: 0,
        latest: true,
        before: None,
    };
    let latest: CloudHistoryReadResponse = client
        .request(method::CLOUD_HISTORY_READ, long.clone())
        .await
        .unwrap();
    assert_eq!(latest.messages.len(), 50);
    assert_eq!(latest.messages.first().unwrap().content, "Message 73 🦀");
    assert_eq!(latest.messages.last().unwrap().content, "Message 122 🦀");
    assert_eq!(latest.start_offset, 73);
    assert_eq!(latest.previous_before, Some(73));
    assert!(!latest.has_more);
    let mut state = agiworkforce_desktop_gpui::cloud_history::CloudHistory::new(
        contracts.max_frame_bytes.get(),
    );
    state.scope = Some(page.scope.clone());
    state.pending_turn = Some(agiworkforce_protocol::account_cloud::CloudTurnStartParams {
        attachments: Vec::new(),
        workspace: None,
        model: None,
        work: None,
        scope: page.scope.clone(),
        conversation_id: long.conversation_id.clone(),
        request_id: latest.messages.last().unwrap().id.clone(),
        user_message_id: latest.messages[48].id.clone(),
        text: latest.messages[48].content.clone(),
        page_size: 50,
    });
    state.accept_turn(serde_json::from_value(serde_json::json!({ "revision": 5, "scope": page.scope, "conversationId": long.conversation_id, "requestId": latest.messages.last().unwrap().id, "state": "ready_for_review", "accepted": true, "output": latest.messages.last().unwrap().content, "progress": null, "error": null, "runId": null, "detachable": false })).unwrap()).unwrap();
    state.accept_detail(latest.clone(), false).unwrap();
    assert!(state.pending_turn.is_none());
    let older: CloudHistoryReadResponse = client
        .request(
            method::CLOUD_HISTORY_READ,
            CloudHistoryReadParams {
                workspace: None,
                latest: false,
                before: latest.previous_before,
                ..long.clone()
            },
        )
        .await
        .unwrap();
    assert_eq!(older.start_offset, 23);
    assert_eq!(older.next_offset, 73);
    state.accept_detail(older.clone(), true).unwrap();
    let oldest: CloudHistoryReadResponse = client
        .request(
            method::CLOUD_HISTORY_READ,
            CloudHistoryReadParams {
                workspace: None,
                latest: false,
                before: older.previous_before,
                ..long.clone()
            },
        )
        .await
        .unwrap();
    assert_eq!(oldest.start_offset, 0);
    assert!(oldest.previous_before.is_none());
    state.accept_detail(oldest, true).unwrap();
    assert_eq!(state.detail.as_ref().unwrap().messages.len(), 123);
    for (index, message) in state.detail.as_ref().unwrap().messages.iter().enumerate() {
        assert_eq!(message.content, format!("Message {index} 🦀"));
    }
    let moving: CloudHistoryReadResponse = client
        .request(
            method::CLOUD_HISTORY_READ,
            CloudHistoryReadParams {
                workspace: None,
                conversation_id: std::env::var("AGI_GPUI_HISTORY_MOVING_ID").unwrap(),
                ..long.clone()
            },
        )
        .await
        .unwrap();
    assert_eq!(moving.start_offset, 74);
    assert_eq!(moving.messages.last().unwrap().content, "Message 123 🦀");
    let empty: CloudHistoryReadResponse = client
        .request(
            method::CLOUD_HISTORY_READ,
            CloudHistoryReadParams {
                workspace: None,
                conversation_id: std::env::var("AGI_GPUI_HISTORY_EMPTY_ID").unwrap(),
                ..long.clone()
            },
        )
        .await
        .unwrap();
    assert!(empty.messages.is_empty());
    assert!(empty.previous_before.is_none());
    for name in ["MISSING", "UNSTABLE"] {
        assert!(client
            .request::<CloudHistoryReadResponse>(
                method::CLOUD_HISTORY_READ,
                CloudHistoryReadParams {
                    workspace: None,
                    conversation_id: std::env::var(format!("AGI_GPUI_HISTORY_{name}_ID")).unwrap(),
                    ..long.clone()
                }
            )
            .await
            .is_err());
    }
    assert!(client
        .request::<CloudHistoryReadResponse>(
            method::CLOUD_HISTORY_READ,
            CloudHistoryReadParams {
                workspace: None,
                before: Some(1),
                ..long
            }
        )
        .await
        .is_err());
    session.shutdown().await.unwrap();
}

#[cfg(feature = "cloud-fixture-test")]
#[tokio::test]
#[ignore = "run through the isolated Cloud chat fixture runner"]
async fn real_cloud_chat_creates_streams_persists_multiple_turns_and_stops_upstream() {
    use agiworkforce_protocol::account_cloud::*;
    use agiworkforce_protocol::task_state::AgentTaskState;
    assert_eq!(std::env::var("AGI_GPUI_CHAT_FIXTURE").unwrap(), "1");
    assert_eq!(
        url::Url::parse(&std::env::var("AGIWORKFORCE_API_BASE").unwrap())
            .unwrap()
            .host_str(),
        Some("127.0.0.1")
    );
    let binary = PathBuf::from(std::env::var_os("AGI_GPUI_TEST_RUNTIME").unwrap());
    let session = RuntimeSession::connect_account(
        &binary,
        &NativeContracts::load().unwrap(),
        Settings::load().unwrap(),
    )
    .await
    .unwrap();
    let client = session.client();
    let list = |query: &str| CloudHistoryListParams {
        project_id: None,
        workspace: None,
        archive_filter: None,
        scope: None,
        query: Some(query.into()),
        limit: 2,
        cursor: None,
        offset: 0,
    };
    let page: CloudHistoryListResponse = client
        .request(method::CLOUD_HISTORY_LIST, list("scope"))
        .await
        .unwrap();
    assert!(session.capabilities().cloud_models);
    let model_params = CloudModelListParams {
        scope: page.scope.clone(),
    };
    assert!(client
        .request::<CloudModelListResponse>(
            method::CLOUD_MODEL_LIST,
            CloudModelListParams {
                scope: "other-account".into()
            }
        )
        .await
        .is_err());
    let catalogue: CloudModelListResponse = client
        .request(method::CLOUD_MODEL_LIST, model_params.clone())
        .await
        .unwrap();
    assert_eq!(catalogue.models.len(), 3);
    let _: CloudHistoryListResponse = client
        .request(method::CLOUD_HISTORY_LIST, list("malformed-catalogue"))
        .await
        .unwrap();
    assert!(client
        .request::<CloudModelListResponse>(method::CLOUD_MODEL_LIST, model_params.clone())
        .await
        .unwrap_err()
        .to_string()
        .contains("inconsistent"));
    let _: CloudHistoryListResponse = client
        .request(method::CLOUD_HISTORY_LIST, list("restore-catalogue"))
        .await
        .unwrap();
    let created: CloudConversationCreateResponse = client
        .request(
            method::CLOUD_CONVERSATION_CREATE,
            CloudConversationCreateParams {
                project_id: None,
                workspace: None,
                scope: page.scope.clone(),
                id: uuid::Uuid::new_v4().to_string(),
            },
        )
        .await
        .unwrap();
    let params = CloudTurnStartParams {
        attachments: Vec::new(),
        workspace: None,
        model: Some(catalogue.models[0].id.clone()),
        work: None,
        scope: page.scope.clone(),
        conversation_id: created.conversation.id.clone(),
        request_id: uuid::Uuid::new_v4().to_string(),
        user_message_id: uuid::Uuid::new_v4().to_string(),
        text: "First message".into(),
        page_size: 2,
    };
    for blocked in catalogue.models.iter().filter(|model| !model.selectable()) {
        let mut blocked_request = params.clone();
        blocked_request.request_id = uuid::Uuid::new_v4().to_string();
        blocked_request.user_message_id = uuid::Uuid::new_v4().to_string();
        blocked_request.model = Some(blocked.id.clone());
        let _: CloudTurnSnapshot = client
            .request(method::CLOUD_TURN_START, blocked_request.clone())
            .await
            .unwrap();
        let identity = CloudTurnIdParams {
            workspace: None,
            scope: page.scope.clone(),
            request_id: blocked_request.request_id,
            run_id: None,
        };
        tokio::time::timeout(std::time::Duration::from_secs(10), async {
            loop {
                let state: CloudTurnSnapshot = client
                    .request(method::CLOUD_TURN_READ, identity.clone())
                    .await
                    .unwrap();
                if state.state.is_terminal() {
                    assert!(state.rejected);
                    assert!(!state.accepted);
                    assert!(state.error.unwrap().contains("no longer available"));
                    break;
                }
                tokio::time::sleep(std::time::Duration::from_millis(10)).await;
            }
        })
        .await
        .unwrap();
    }
    let mut picker = agiworkforce_desktop_gpui::cloud_models::CloudModelPicker::default();
    let request = picker.begin(&page.scope, &created.conversation.id);
    picker.accept(request, catalogue.clone()).unwrap();
    let selected = &catalogue
        .models
        .iter()
        .find(|model| model.selectable())
        .unwrap()
        .id;
    picker
        .validate_choice(request, &page.scope, &created.conversation.id, selected)
        .unwrap();
    let mut params = params;
    params.model = Some(selected.clone());
    let model_target = CloudHistoryReadParams {
        scope: page.scope.clone(),
        workspace: Some(CloudConversationWorkspace::Personal),
        conversation_id: created.conversation.id.clone(),
        limit: 1,
        offset: 0,
        latest: false,
        before: None,
    };
    let before_choice: CloudHistoryReadResponse = client
        .request(method::CLOUD_HISTORY_READ, model_target.clone())
        .await
        .unwrap();
    let save_choice = |model: &str| {
        agiworkforce_desktop_gpui::conversation_management::update_request(
            &page.scope,
            &before_choice.conversation,
            CloudConversationChange::Model {
                model: model.into(),
            },
        )
        .unwrap()
    };
    for unavailable in catalogue
        .models
        .iter()
        .filter(|model| !model.selectable())
        .map(|model| model.id.as_str())
        .chain(["fixture-unknown", "", " model "])
    {
        assert!(
            client
                .request::<CloudConversationUpdateResponse>(
                    method::CLOUD_CONVERSATION_UPDATE,
                    save_choice(unavailable)
                )
                .await
                .is_err(),
            "{unavailable}"
        );
    }
    let saved_choice: CloudConversationUpdateResponse = client
        .request(method::CLOUD_CONVERSATION_UPDATE, save_choice(selected))
        .await
        .unwrap();
    assert_eq!(saved_choice.conversation.model.as_ref(), Some(selected));
    assert_ne!(
        saved_choice.conversation.version,
        before_choice.conversation.version
    );
    let stale_model = client
        .request::<CloudConversationUpdateResponse>(
            method::CLOUD_CONVERSATION_UPDATE,
            save_choice(selected),
        )
        .await
        .unwrap_err();
    assert!(stale_model.to_string().contains("changed"), "{stale_model}");
    let initial_draft = before_choice.draft.clone().unwrap();
    assert_eq!(initial_draft.text, "");
    let draft_request = |draft: CloudConversationDraft| CloudDraftSaveParams {
        scope: page.scope.clone(),
        workspace: CloudConversationWorkspace::Personal,
        conversation_id: created.conversation.id.clone(),
        draft,
    };
    let text = "Unsent 東京 🦀\nKeep the exact text";
    for text in [
        "Fixture missing draft revision",
        "Fixture invalid draft revision",
        "Fixture null draft revision",
    ] {
        assert!(client
            .request::<CloudDraftSaveResponse>(
                method::CLOUD_DRAFT_SAVE,
                draft_request(CloudConversationDraft {
                    text: text.into(),
                    revision: None
                })
            )
            .await
            .is_err());
    }

    let mut bad_scope = draft_request(initial_draft.clone());
    bad_scope.scope = "other-account".into();
    assert!(client
        .request::<CloudDraftSaveResponse>(method::CLOUD_DRAFT_SAVE, bad_scope)
        .await
        .is_err());
    for draft in [
        CloudConversationDraft {
            text: "🦀".repeat(NativeContracts::load().unwrap().draft_max_length),
            revision: None,
        },
        CloudConversationDraft {
            text: "Bad clock".into(),
            revision: Some("invalid".into()),
        },
    ] {
        assert!(client
            .request::<CloudDraftSaveResponse>(method::CLOUD_DRAFT_SAVE, draft_request(draft))
            .await
            .is_err());
    }
    let saved_draft: CloudDraftSaveResponse = client
        .request(
            method::CLOUD_DRAFT_SAVE,
            draft_request(CloudConversationDraft {
                text: text.into(),
                revision: initial_draft.revision,
            }),
        )
        .await
        .unwrap();
    let CloudDraftSaveOutcome::Saved { revision } = saved_draft.outcome else {
        panic!("draft not saved");
    };
    let another_process = RuntimeSession::connect_account(
        &binary,
        &NativeContracts::load().unwrap(),
        Settings::load().unwrap(),
    )
    .await
    .unwrap();
    let cold_draft: CloudHistoryReadResponse = another_process
        .client()
        .request(method::CLOUD_HISTORY_READ, model_target.clone())
        .await
        .unwrap();
    assert_eq!(cold_draft.draft.as_ref().unwrap().text, text);
    assert_eq!(
        cold_draft.conversation.version, saved_choice.conversation.version,
        "A draft save changed the metadata revision"
    );
    assert_eq!(
        cold_draft.conversation.updated_at, saved_choice.conversation.updated_at,
        "A draft save reordered history"
    );
    let other_save: CloudDraftSaveResponse = another_process
        .client()
        .request(
            method::CLOUD_DRAFT_SAVE,
            draft_request(CloudConversationDraft {
                text: "Other device's draft".into(),
                revision: revision.clone(),
            }),
        )
        .await
        .unwrap();
    another_process.shutdown().await.unwrap();
    let CloudDraftSaveOutcome::Saved {
        revision: other_clock,
    } = other_save.outcome
    else {
        panic!("other draft not saved");
    };
    let conflict: CloudDraftSaveResponse = client
        .request(
            method::CLOUD_DRAFT_SAVE,
            draft_request(CloudConversationDraft {
                text: text.into(),
                revision,
            }),
        )
        .await
        .unwrap();
    let CloudDraftSaveOutcome::Conflict { current } = conflict.outcome else {
        panic!("conflicting draft overwritten");
    };
    assert_eq!(current.text, "Other device's draft");
    assert_eq!(current.revision, other_clock);
    let mine: CloudDraftSaveResponse = client
        .request(
            method::CLOUD_DRAFT_SAVE,
            draft_request(CloudConversationDraft {
                text: text.into(),
                revision: current.revision,
            }),
        )
        .await
        .unwrap();
    let CloudDraftSaveOutcome::Saved { revision } = mine.outcome else {
        panic!("reviewed draft not saved");
    };
    let lost = draft_request(CloudConversationDraft {
        text: "Fixture draft response lost".into(),
        revision,
    });
    assert!(client
        .request::<CloudDraftSaveResponse>(method::CLOUD_DRAFT_SAVE, lost.clone())
        .await
        .is_err());
    let recovered: CloudDraftSaveResponse = client
        .request(method::CLOUD_DRAFT_SAVE, lost)
        .await
        .unwrap();
    let CloudDraftSaveOutcome::Saved { revision } = recovered.outcome else {
        panic!("same-text retry did not recover");
    };
    let cleared: CloudDraftSaveResponse = client
        .request(
            method::CLOUD_DRAFT_SAVE,
            draft_request(CloudConversationDraft {
                text: String::new(),
                revision,
            }),
        )
        .await
        .unwrap();
    assert!(matches!(
        cleared.outcome,
        CloudDraftSaveOutcome::Saved { .. }
    ));
    let queued: CloudTurnSnapshot = client
        .request(method::CLOUD_TURN_START, params.clone())
        .await
        .unwrap();
    assert_eq!(queued.request_id, params.request_id);
    let duplicate: CloudTurnSnapshot = client
        .request(method::CLOUD_TURN_START, params.clone())
        .await
        .unwrap();
    assert_eq!(duplicate.request_id, queued.request_id);
    let mut different_model = params.clone();
    different_model.model = Some(catalogue.models[1].id.clone());
    assert!(client
        .request::<CloudTurnSnapshot>(method::CLOUD_TURN_START, different_model)
        .await
        .is_err());

    let turn_id = CloudTurnIdParams {
        workspace: None,
        run_id: None,
        scope: page.scope.clone(),
        request_id: params.request_id.clone(),
    };
    tokio::time::timeout(std::time::Duration::from_secs(10), async {
        loop {
            let snapshot: CloudTurnSnapshot = client
                .request(method::CLOUD_TURN_READ, turn_id.clone())
                .await
                .unwrap();
            if snapshot.output == "Hello 🦀" {
                assert!(snapshot.accepted);
                assert!(snapshot.needs_attention());
                break;
            }
            assert!(snapshot.error.is_none(), "{:?}", snapshot.error);
            tokio::time::sleep(std::time::Duration::from_millis(20)).await;
        }
    })
    .await
    .unwrap();
    let _: CloudHistoryListResponse = client
        .request(method::CLOUD_HISTORY_LIST, list("release-first"))
        .await
        .unwrap();
    tokio::time::timeout(std::time::Duration::from_secs(10), async {
        loop {
            let snapshot: CloudTurnSnapshot = client
                .request(method::CLOUD_TURN_READ, turn_id.clone())
                .await
                .unwrap();
            if !snapshot.needs_attention() {
                assert!(snapshot.error.is_none(), "{:?}", snapshot.error);
                break;
            }
            tokio::time::sleep(std::time::Duration::from_millis(20)).await;
        }
    })
    .await
    .unwrap();
    let read: CloudHistoryReadResponse = client
        .request(
            method::CLOUD_HISTORY_READ,
            CloudHistoryReadParams {
                workspace: None,
                latest: false,
                before: None,
                scope: page.scope.clone(),
                conversation_id: created.conversation.id.clone(),
                limit: 2,
                offset: 0,
            },
        )
        .await
        .unwrap();
    assert_eq!(read.messages.len(), 2);
    assert_eq!(read.messages[0].id, params.user_message_id);
    assert_eq!(read.messages[1].id, params.request_id);
    assert_eq!(read.messages[0].attachments[0].name, "report 東京.txt");
    assert!(!read.messages[0].attachments_incomplete);
    let second = CloudTurnStartParams {
        attachments: Vec::new(),
        workspace: None,
        model: Some(catalogue.models[0].id.clone()),
        work: None,
        request_id: uuid::Uuid::new_v4().to_string(),
        user_message_id: uuid::Uuid::new_v4().to_string(),
        text: "Follow up".into(),
        ..params
    };
    let _: CloudTurnSnapshot = client
        .request(method::CLOUD_TURN_START, second.clone())
        .await
        .unwrap();
    let turn_id = CloudTurnIdParams {
        workspace: None,
        run_id: None,
        scope: page.scope.clone(),
        request_id: second.request_id.clone(),
    };
    tokio::time::timeout(std::time::Duration::from_secs(10), async {
        loop {
            let snapshot: CloudTurnSnapshot = client
                .request(method::CLOUD_TURN_READ, turn_id.clone())
                .await
                .unwrap();
            if snapshot.output == "Partial" {
                break;
            }
            assert!(snapshot.error.is_none(), "{:?}", snapshot.error);
            tokio::time::sleep(std::time::Duration::from_millis(20)).await;
        }
    })
    .await
    .unwrap();
    let stopped: CloudTurnSnapshot = client
        .request(method::CLOUD_TURN_STOP, turn_id)
        .await
        .unwrap();
    assert_eq!(stopped.state, AgentTaskState::Cancelled);
    assert_eq!(stopped.output, "Partial");
    let persisted: CloudHistoryReadResponse = client
        .request(
            method::CLOUD_HISTORY_READ,
            CloudHistoryReadParams {
                workspace: None,
                latest: false,
                before: None,
                scope: page.scope.clone(),
                conversation_id: created.conversation.id.clone(),
                limit: 2,
                offset: 2,
            },
        )
        .await
        .unwrap();
    assert_eq!(persisted.messages[1].id, second.request_id);
    assert_eq!(persisted.messages[1].content, "Partial");
    let _: CloudHistoryListResponse = client
        .request(method::CLOUD_HISTORY_LIST, list("broken-attachment"))
        .await
        .unwrap();
    let broken: CloudHistoryReadResponse = client
        .request(method::CLOUD_HISTORY_READ, model_target.clone())
        .await
        .unwrap();
    assert!(broken.messages[0].attachments_incomplete);
    let bad = CloudTurnStartParams {
        attachments: Vec::new(),
        request_id: uuid::Uuid::new_v4().to_string(),
        user_message_id: uuid::Uuid::new_v4().to_string(),
        text: "Keep all the file context".into(),
        ..second.clone()
    };
    let _: CloudTurnSnapshot = client
        .request(method::CLOUD_TURN_START, bad.clone())
        .await
        .unwrap();
    let bad_id = CloudTurnIdParams {
        workspace: None,
        run_id: None,
        scope: bad.scope.clone(),
        request_id: bad.request_id,
    };
    tokio::time::timeout(std::time::Duration::from_secs(10), async {
        loop {
            let state: CloudTurnSnapshot = client
                .request(method::CLOUD_TURN_READ, bad_id.clone())
                .await
                .unwrap();
            if state.state.is_terminal() {
                assert!(!state.accepted);
                assert!(state.rejected);
                assert!(state.error.unwrap().contains("saved file references"));
                break;
            }
            tokio::time::sleep(std::time::Duration::from_millis(20)).await;
        }
    })
    .await
    .unwrap();
    let _: CloudHistoryListResponse = client
        .request(method::CLOUD_HISTORY_LIST, list("restore-attachment"))
        .await
        .unwrap();
    for (mode, expected) in [
        ("oversized-context", "context compaction"),
        ("foreign-context", "different conversation workspace"),
    ] {
        let _: CloudHistoryListResponse = client
            .request(method::CLOUD_HISTORY_LIST, list(mode))
            .await
            .unwrap();
        let refused = CloudTurnStartParams {
            attachments: Vec::new(),
            workspace: Some(CloudConversationWorkspace::Personal),
            request_id: uuid::Uuid::new_v4().to_string(),
            user_message_id: uuid::Uuid::new_v4().to_string(),
            text: "Do not send unreviewed context".into(),
            ..second.clone()
        };
        let _: CloudTurnSnapshot = client
            .request(method::CLOUD_TURN_START, refused.clone())
            .await
            .unwrap();
        let identity = CloudTurnIdParams {
            workspace: refused.workspace,
            run_id: None,
            scope: refused.scope,
            request_id: refused.request_id,
        };
        tokio::time::timeout(std::time::Duration::from_secs(10), async {
            loop {
                let state: CloudTurnSnapshot = client
                    .request(method::CLOUD_TURN_READ, identity.clone())
                    .await
                    .unwrap();
                if state.state.is_terminal() {
                    assert!(state.rejected);
                    assert!(!state.accepted);
                    assert!(
                        state.error.as_deref().unwrap().contains(expected),
                        "{mode}: {:?}",
                        state.error
                    );
                    break;
                }
                tokio::time::sleep(std::time::Duration::from_millis(20)).await;
            }
        })
        .await
        .unwrap();
    }
    let _: CloudHistoryListResponse = client
        .request(method::CLOUD_HISTORY_LIST, list("restore-context"))
        .await
        .unwrap();
    let third = CloudTurnStartParams {
        attachments: Vec::new(),
        workspace: None,
        model: Some(catalogue.models[0].id.clone()),
        work: None,
        request_id: uuid::Uuid::new_v4().to_string(),
        user_message_id: uuid::Uuid::new_v4().to_string(),
        text: "Wrong run".into(),
        ..second
    };
    let _: CloudTurnSnapshot = client
        .request(method::CLOUD_TURN_START, third.clone())
        .await
        .unwrap();
    let turn_id = CloudTurnIdParams {
        workspace: None,
        run_id: None,
        scope: page.scope,
        request_id: third.request_id,
    };
    tokio::time::timeout(std::time::Duration::from_secs(10), async {
        loop {
            let snapshot: CloudTurnSnapshot = client
                .request(method::CLOUD_TURN_READ, turn_id.clone())
                .await
                .unwrap();
            if snapshot.output == "Unbound" {
                break;
            }
            assert!(snapshot.error.is_none(), "{:?}", snapshot.error);
            tokio::time::sleep(std::time::Duration::from_millis(20)).await;
        }
    })
    .await
    .unwrap();
    let rejected = client
        .request::<CloudTurnSnapshot>(method::CLOUD_TURN_STOP, turn_id)
        .await;
    assert!(
        matches!(rejected, Err(DeveloperSessionClientError::Remote { message, .. }) if message.contains("different run"))
    );
    let metadata_scope = created.scope.clone();
    let metadata_id = created.conversation.id.clone();
    let read_metadata = || CloudHistoryReadParams {
        workspace: Some(CloudConversationWorkspace::Personal),
        scope: metadata_scope.clone(),
        conversation_id: metadata_id.clone(),
        limit: 1,
        offset: 0,
        latest: false,
        before: None,
    };
    let initial: CloudHistoryReadResponse = client
        .request(method::CLOUD_HISTORY_READ, read_metadata())
        .await
        .unwrap();
    assert!(initial.conversation.version.is_some());
    assert_ne!(
        initial.conversation.version.as_deref(),
        Some("\"999\""),
        "A body field replaced the HTTP revision"
    );
    let make_update = |conversation: &CloudHistoryConversation, change| {
        agiworkforce_desktop_gpui::conversation_management::update_request(
            &metadata_scope,
            conversation,
            change,
        )
        .unwrap()
    };
    let rename = make_update(
        &initial.conversation,
        CloudConversationChange::Rename {
            title: "Renamed 🦀 日本語".into(),
        },
    );
    let mut wrong_scope = rename.clone();
    wrong_scope.scope = "other-account".into();
    assert!(client
        .request::<CloudConversationUpdateResponse>(method::CLOUD_CONVERSATION_UPDATE, wrong_scope)
        .await
        .is_err());
    let mut wildcard = rename.clone();
    wildcard.expected_version = "*".into();
    assert!(client
        .request::<CloudConversationUpdateResponse>(method::CLOUD_CONVERSATION_UPDATE, wildcard)
        .await
        .is_err());
    let mut wrong_organization = rename.clone();
    wrong_organization.organization_id = Some(uuid::Uuid::new_v4().to_string());
    assert!(client
        .request::<CloudConversationUpdateResponse>(
            method::CLOUD_CONVERSATION_UPDATE,
            wrong_organization
        )
        .await
        .is_err());
    let mut too_long = rename.clone();
    too_long.change = CloudConversationChange::Rename {
        title: "🦀".repeat(300),
    };
    assert!(client
        .request::<CloudConversationUpdateResponse>(method::CLOUD_CONVERSATION_UPDATE, too_long)
        .await
        .is_err());
    let renamed: CloudConversationUpdateResponse = client
        .request(method::CLOUD_CONVERSATION_UPDATE, rename.clone())
        .await
        .unwrap();
    assert_eq!(
        renamed.conversation.title.as_deref(),
        Some("Renamed 🦀 日本語")
    );
    assert_ne!(renamed.conversation.version, initial.conversation.version);
    let stale = client
        .request::<CloudConversationUpdateResponse>(method::CLOUD_CONVERSATION_UPDATE, rename)
        .await
        .unwrap_err();
    assert!(stale.to_string().contains("changed"), "{stale}");
    let mut current = renamed.conversation;
    for pinned in [true, false, true] {
        let response: CloudConversationUpdateResponse = client
            .request(
                method::CLOUD_CONVERSATION_UPDATE,
                make_update(&current, CloudConversationChange::Pin { pinned }),
            )
            .await
            .unwrap();
        assert_eq!(response.conversation.pinned, pinned);
        current = response.conversation;
    }
    let archived: CloudConversationUpdateResponse = client
        .request(
            method::CLOUD_CONVERSATION_UPDATE,
            make_update(
                &current,
                CloudConversationChange::Archive { archived: true },
            ),
        )
        .await
        .unwrap();
    assert!(archived.conversation.archived);
    assert!(!archived.conversation.pinned);
    let active: CloudHistoryListResponse = client
        .request(method::CLOUD_HISTORY_LIST, list("active"))
        .await
        .unwrap();
    assert!(active.conversations.is_empty());
    let archived_list: CloudHistoryListResponse = client
        .request(
            method::CLOUD_HISTORY_LIST,
            CloudHistoryListParams {
                project_id: None,
                workspace: None,
                archive_filter: Some(CloudHistoryArchiveFilter::Only),
                ..list("archived")
            },
        )
        .await
        .unwrap();
    assert_eq!(archived_list.conversations.len(), 1);
    assert!(archived_list.conversations[0].archived);
    let all_results: CloudHistoryListResponse = client
        .request(
            method::CLOUD_HISTORY_LIST,
            CloudHistoryListParams {
                project_id: None,
                workspace: None,
                archive_filter: Some(CloudHistoryArchiveFilter::Include),
                ..list("all-search")
            },
        )
        .await
        .unwrap();
    assert_eq!(all_results.conversations.len(), 1);
    assert!(all_results.conversations[0].archived);
    let restored: CloudConversationUpdateResponse = client
        .request(
            method::CLOUD_CONVERSATION_UPDATE,
            make_update(
                &archived.conversation,
                CloudConversationChange::Archive { archived: false },
            ),
        )
        .await
        .unwrap();
    assert!(!restored.conversation.archived);
    let mismatch = make_update(
        &restored.conversation,
        CloudConversationChange::Rename {
            title: "Fixture mismatched metadata".into(),
        },
    );
    assert!(client
        .request::<CloudConversationUpdateResponse>(method::CLOUD_CONVERSATION_UPDATE, mismatch)
        .await
        .unwrap_err()
        .to_string()
        .contains("different conversation"));
    let dropped = make_update(
        &restored.conversation,
        CloudConversationChange::Rename {
            title: "Fixture response lost".into(),
        },
    );
    assert!(client
        .request::<CloudConversationUpdateResponse>(method::CLOUD_CONVERSATION_UPDATE, dropped)
        .await
        .is_err());
    let recovered: CloudHistoryReadResponse = client
        .request(method::CLOUD_HISTORY_READ, read_metadata())
        .await
        .unwrap();
    assert_eq!(
        recovered.conversation.title.as_deref(),
        Some("Fixture response lost")
    );
    let _: CloudHistoryListResponse = client
        .request(method::CLOUD_HISTORY_LIST, list("switch-active-workspace"))
        .await
        .unwrap();
    let mut unpinned_workspace = read_metadata();
    unpinned_workspace.workspace = None;
    assert!(client
        .request::<CloudHistoryReadResponse>(method::CLOUD_HISTORY_READ, unpinned_workspace)
        .await
        .is_err());
    let scoped: CloudHistoryReadResponse = client
        .request(method::CLOUD_HISTORY_READ, read_metadata())
        .await
        .unwrap();
    let pinned_personal: CloudConversationUpdateResponse = client
        .request(
            method::CLOUD_CONVERSATION_UPDATE,
            make_update(
                &scoped.conversation,
                CloudConversationChange::Pin { pinned: true },
            ),
        )
        .await
        .unwrap();
    assert!(pinned_personal.conversation.pinned);
    let _: CloudHistoryListResponse = client
        .request(method::CLOUD_HISTORY_LIST, list("omit-revision"))
        .await
        .unwrap();
    let legacy: CloudHistoryReadResponse = client
        .request(method::CLOUD_HISTORY_READ, read_metadata())
        .await
        .unwrap();
    assert!(legacy.conversation.version.is_none());
    assert!(
        agiworkforce_desktop_gpui::conversation_management::update_request(
            &metadata_scope,
            &legacy.conversation,
            CloudConversationChange::Pin { pinned: true }
        )
        .is_err()
    );
    let _: CloudHistoryListResponse = client
        .request(method::CLOUD_HISTORY_LIST, list("restore-revision"))
        .await
        .unwrap();
    session.shutdown().await.unwrap();
    let reopened = RuntimeSession::connect_account(
        &binary,
        &NativeContracts::load().unwrap(),
        Settings::load().unwrap(),
    )
    .await
    .unwrap();
    let persisted_choice: CloudHistoryReadResponse = reopened
        .client()
        .request(method::CLOUD_HISTORY_READ, model_target)
        .await
        .unwrap();
    assert_eq!(persisted_choice.conversation.model.as_ref(), Some(selected));
    reopened.shutdown().await.unwrap();
}
