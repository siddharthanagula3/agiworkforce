use std::path::PathBuf;

use agiworkforce_desktop_gpui::{
    config::{NativeContracts, Settings},
    runtime::RuntimeSession,
};
use agiworkforce_protocol::{
    account_cloud::*, developer_session::method, task_state::AgentTaskState,
};

async fn connect() -> RuntimeSession {
    RuntimeSession::connect_account(
        &PathBuf::from(std::env::var_os("AGI_GPUI_TEST_RUNTIME").unwrap()),
        &NativeContracts::load().unwrap(),
        Settings::load().unwrap(),
    )
    .await
    .unwrap()
}

async fn settle(
    session: &RuntimeSession,
    params: &CloudTurnStartParams,
    planning: bool,
) -> CloudTurnSnapshot {
    tokio::time::timeout(std::time::Duration::from_secs(10), async {
        loop {
            let value: CloudTurnSnapshot = session
                .client()
                .request(
                    method::CLOUD_TURN_READ,
                    CloudTurnIdParams {
                        scope: params.scope.clone(),
                        workspace: params.workspace.clone(),
                        request_id: params.request_id.clone(),
                        run_id: None,
                    },
                )
                .await
                .unwrap();
            assert!(value.error.is_none(), "{:?}", value.error);
            if value.state == AgentTaskState::ReadyForReview
                && !value.stream_attached
                && !value.catching_up
                && (!planning || value.work_plan_saved)
            {
                return value;
            }
            tokio::time::sleep(std::time::Duration::from_millis(20)).await;
        }
    })
    .await
    .unwrap()
}

#[tokio::test]
#[ignore = "run through the isolated native Cloud fixture runner"]
async fn native_cloud_fixture_seals_recovers_and_continues_a_reviewed_plan() {
    assert_eq!(
        std::env::var("AGI_GPUI_NATIVE_CLOUD_FIXTURE").as_deref(),
        Ok("1")
    );
    let origin = url::Url::parse(&std::env::var("AGIWORKFORCE_API_BASE").unwrap()).unwrap();
    assert_eq!(origin.scheme(), "http");
    assert_eq!(origin.host_str(), Some("127.0.0.1"));
    assert!(std::env::var("AGIWORKFORCE_JWT")
        .unwrap()
        .starts_with("fixture."));
    let session = connect().await;
    let memberships: CloudWorkspacesListResponse = session
        .client()
        .request(
            method::CLOUD_WORKSPACES_LIST,
            CloudWorkspacesListParams { scope: None },
        )
        .await
        .unwrap();
    let scope = memberships.scope;
    let workspace = Some(CloudConversationWorkspace::Personal);
    let created: CloudConversationCreateResponse = session
        .client()
        .request(
            method::CLOUD_CONVERSATION_CREATE,
            CloudConversationCreateParams {
                project_id: None,
                scope: scope.clone(),
                workspace: workspace.clone(),
                id: uuid::Uuid::new_v4().to_string(),
            },
        )
        .await
        .unwrap();
    let params = CloudTurnStartParams {
        attachments: Vec::new(),
        scope: scope.clone(),
        workspace: workspace.clone(),
        conversation_id: created.conversation.id.clone(),
        request_id: uuid::Uuid::new_v4().to_string(),
        user_message_id: uuid::Uuid::new_v4().to_string(),
        text: "Prepare a synthetic native fixture report".into(),
        model: None,
        page_size: 2,
        work: Some(CloudWorkRequest {
            mode: NativeContracts::load().unwrap().work_mode,
            goal: CloudWorkGoal {
                goal: "Prepare a synthetic native fixture report".into(),
                constraints: None,
                deliverable: None,
                excluded_tools: None,
            },
            plan: None,
        }),
    };
    let _: CloudTurnSnapshot = session
        .client()
        .request(method::CLOUD_TURN_START, params.clone())
        .await
        .unwrap();
    let planning = settle(&session, &params, true).await;
    let review = planning.work_plan.unwrap();
    assert_eq!(review.steps.len(), 3);
    assert!(review.awaiting_approval);
    session.shutdown().await.unwrap();

    let session = connect().await;
    let history: CloudHistoryReadResponse = session
        .client()
        .request(
            method::CLOUD_HISTORY_READ,
            CloudHistoryReadParams {
                scope: scope.clone(),
                workspace: workspace.clone(),
                conversation_id: created.conversation.id.clone(),
                limit: 50,
                offset: 0,
                latest: true,
                before: None,
            },
        )
        .await
        .unwrap();
    let saved = history
        .messages
        .iter()
        .find_map(|message| message.work_plan.as_ref())
        .unwrap();
    assert_eq!(saved, &review);
    let request = uuid::Uuid::parse_str(&review.review_id).unwrap();
    let continued = CloudTurnStartParams {
        attachments: Vec::new(),
        request_id: request.to_string(),
        user_message_id: uuid::Uuid::new_v5(&request, b"user-message").to_string(),
        work: Some(CloudWorkRequest {
            mode: review.mode.clone(),
            goal: review.goal.clone(),
            plan: Some(review),
        }),
        ..params
    };
    let _: CloudTurnSnapshot = session
        .client()
        .request(method::CLOUD_TURN_START, continued.clone())
        .await
        .unwrap();
    let finished = settle(&session, &continued, false).await;
    assert!(finished.accepted);
    assert!(!finished.output.is_empty());
    let persisted: CloudHistoryReadResponse = session
        .client()
        .request(
            method::CLOUD_HISTORY_READ,
            CloudHistoryReadParams {
                scope,
                workspace,
                conversation_id: created.conversation.id,
                limit: 50,
                offset: 0,
                latest: true,
                before: None,
            },
        )
        .await
        .unwrap();
    let completed = persisted
        .messages
        .iter()
        .find_map(|message| message.work_plan.as_ref())
        .unwrap();
    assert!(completed.same_content(saved));
    assert!(!completed.awaiting_approval);
    assert!(!completed.declined);
    session.shutdown().await.unwrap();
}
