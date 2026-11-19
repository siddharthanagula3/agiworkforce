use agiworkforce_app_server::BackgroundDeveloperSessionClient;
use agiworkforce_desktop_gpui::{
    config::{NativeContracts, Settings},
    runtime::RuntimeSession,
};
use agiworkforce_protocol::{
    account_cloud::*,
    attachment_recovery::*,
    cloud_uploads::*,
    developer_session::{method, AcknowledgedResponse},
};
use std::path::PathBuf;
#[path = "support/upload_fixture.rs"]
mod upload_fixture;
use upload_fixture::{control, state};

async fn connect() -> RuntimeSession {
    RuntimeSession::connect_account(
        &PathBuf::from(std::env::var_os("AGI_GPUI_TEST_RUNTIME").unwrap()),
        &NativeContracts::load().unwrap(),
        Settings::load().unwrap(),
    )
    .await
    .unwrap()
}
async fn new_target(client: &BackgroundDeveloperSessionClient, scope: &str) -> CloudChatTarget {
    let created: CloudConversationCreateResponse = client
        .request(
            method::CLOUD_CONVERSATION_CREATE,
            CloudConversationCreateParams {
                scope: scope.into(),
                workspace: Some(CloudConversationWorkspace::Personal),
                project_id: None,
                id: uuid::Uuid::new_v4().to_string(),
            },
        )
        .await
        .unwrap();
    CloudChatTarget {
        scope: scope.into(),
        workspace: CloudConversationWorkspace::Personal,
        conversation_id: created.conversation.id,
    }
}
async fn read(
    client: &BackgroundDeveloperSessionClient,
    target: &CloudChatTarget,
) -> AttachmentRecoveryReadResponse {
    client
        .request(method::CLOUD_ATTACHMENT_RECOVERY_READ, target.clone())
        .await
        .unwrap()
}
async fn upload(
    client: &BackgroundDeveloperSessionClient,
    target: &CloudChatTarget,
    name: &str,
) -> CloudHistoryAttachment {
    let directory = tempfile::tempdir().unwrap();
    let path = directory.path().join(name);
    std::fs::write(&path, "private fixture upload 東京\n").unwrap();
    let ready: CloudUploadSnapshot = client
        .request(
            method::CLOUD_UPLOAD_PREPARE,
            CloudUploadPrepareParams {
                target: CloudUploadTarget::Chat {
                    chat: target.clone(),
                },
                path: path.to_str().unwrap().into(),
                selected_at_ms: chrono::Utc::now().timestamp_millis(),
            },
        )
        .await
        .unwrap();
    let id = ready.review.upload;
    let _: CloudUploadSnapshot = client
        .request(method::CLOUD_UPLOAD_START, id.clone())
        .await
        .unwrap();
    let file = tokio::time::timeout(std::time::Duration::from_secs(15), async {
        loop {
            let snapshot: CloudUploadSnapshot = client
                .request(method::CLOUD_UPLOAD_READ, id.clone())
                .await
                .unwrap();
            assert!(snapshot.phase != CloudUploadPhase::Failed, "{snapshot:?}");
            if let Some(CloudUploadedFile::Chat { attachment }) = snapshot.file {
                break attachment;
            }
            tokio::time::sleep(std::time::Duration::from_millis(10)).await;
        }
    })
    .await
    .unwrap();
    let _: AcknowledgedResponse = client
        .request(method::CLOUD_UPLOAD_RELEASE, id)
        .await
        .unwrap();
    file
}
async fn change(
    client: &BackgroundDeveloperSessionClient,
    snapshot: &AttachmentRecoverySnapshot,
    change: AttachmentRecoveryChange,
) -> AttachmentRecoveryChangeResponse {
    client
        .request(
            method::CLOUD_ATTACHMENT_RECOVERY_CHANGE,
            AttachmentRecoveryChangeParams {
                target: snapshot.target.clone(),
                epoch: snapshot.epoch.clone(),
                revision: snapshot.revision.clone(),
                change,
            },
        )
        .await
        .unwrap()
}
async fn send(
    client: &BackgroundDeveloperSessionClient,
    target: &CloudChatTarget,
    files: Vec<CloudHistoryAttachment>,
    expect_accepted: bool,
) -> CloudTurnStartParams {
    let params = CloudTurnStartParams {
        workspace: Some(target.workspace.clone()),
        scope: target.scope.clone(),
        conversation_id: target.conversation_id.clone(),
        request_id: uuid::Uuid::new_v4().to_string(),
        user_message_id: uuid::Uuid::new_v4().to_string(),
        text: "Use these recovered references".into(),
        attachments: files,
        page_size: 10,
        model: None,
        work: None,
    };
    let _: CloudTurnSnapshot = client
        .request(method::CLOUD_TURN_START, params.clone())
        .await
        .unwrap();
    tokio::time::timeout(std::time::Duration::from_secs(15), async {
        loop {
            let snapshot: CloudTurnSnapshot = client
                .request(
                    method::CLOUD_TURN_READ,
                    CloudTurnIdParams {
                        workspace: params.workspace.clone(),
                        scope: params.scope.clone(),
                        request_id: params.request_id.clone(),
                        run_id: None,
                    },
                )
                .await
                .unwrap();
            if !snapshot.stream_attached
                && (snapshot.state.is_terminal()
                    || snapshot.state
                        == agiworkforce_protocol::task_state::AgentTaskState::ReadyForReview)
            {
                assert_eq!(snapshot.accepted, expect_accepted, "{snapshot:?}");
                if expect_accepted {
                    assert!(snapshot.error.is_none(), "{snapshot:?}");
                } else {
                    assert!(snapshot.error.is_some());
                }
                break;
            }
            tokio::time::sleep(std::time::Duration::from_millis(10)).await;
        }
    })
    .await
    .unwrap();
    params
}

#[tokio::test]
#[ignore = "run with the isolated attachment recovery fixture runner"]
async fn completed_selections_survive_restart_and_uncertain_sends_are_never_automatically_replayed()
{
    assert_eq!(
        std::env::var("AGI_GPUI_UPLOADS_FIXTURE").as_deref(),
        Ok("1")
    );
    assert_eq!(
        url::Url::parse(&std::env::var("AGIWORKFORCE_API_BASE").unwrap())
            .unwrap()
            .host_str(),
        Some("127.0.0.1")
    );
    upload_fixture::mode("normal").await;
    let first = connect().await;
    assert!(first.capabilities().cloud_attachment_recovery);
    let client = first.client();
    let workspaces: CloudWorkspacesListResponse = client
        .request(
            method::CLOUD_WORKSPACES_LIST,
            CloudWorkspacesListParams { scope: None },
        )
        .await
        .unwrap();
    let target = new_target(&client, &workspaces.scope).await;
    let original = upload(&client, &target, "first 東京.txt").await;
    let before_restart = read(&client, &target).await.snapshot.unwrap();
    assert_eq!(before_restart.files, vec![original.clone()]);
    first.shutdown().await.unwrap();

    let second = connect().await;
    let client = second.client();
    let recovered = read(&client, &target).await.snapshot.unwrap();
    assert_eq!(recovered, before_restart);
    let another = upload(&client, &target, "second.txt").await;
    assert!(
        !change(&client, &before_restart, AttachmentRecoveryChange::Clear)
            .await
            .accepted
    );
    let current = read(&client, &target).await.snapshot.unwrap();
    assert_eq!(current.files.len(), 2);
    let restored = change(&client, &current, AttachmentRecoveryChange::Restore).await;
    assert!(restored.accepted);
    send(&client, &target, restored.snapshot.unwrap().files, true).await;
    assert!(read(&client, &target)
        .await
        .snapshot
        .unwrap()
        .files
        .is_empty());
    assert_eq!(state().await["requests"].as_array().unwrap().len(), 1);

    let uncertain_file = upload(&client, &target, "uncertain.txt").await;
    control(serde_json::json!({ "nextStream": "lost-accept" })).await;
    let request = send(&client, &target, vec![uncertain_file.clone()], false).await;
    let unknown = read(&client, &target).await.snapshot.unwrap();
    assert_eq!(
        unknown.pending_send.as_ref().unwrap().request_id,
        request.request_id
    );
    second.shutdown().await.unwrap();
    let third = connect().await;
    let client = third.client();
    let before_read = state().await;
    let unknown = read(&client, &target).await.snapshot.unwrap();
    assert_eq!(unknown.files, vec![uncertain_file]);
    assert_eq!(
        state().await["counts"]["gatewayCalls"],
        before_read["counts"]["gatewayCalls"]
    );
    let history: CloudHistoryReadResponse = client
        .request(
            method::CLOUD_HISTORY_READ,
            CloudHistoryReadParams {
                workspace: Some(target.workspace.clone()),
                scope: target.scope.clone(),
                conversation_id: target.conversation_id.clone(),
                limit: 10,
                offset: 0,
                latest: false,
                before: None,
            },
        )
        .await
        .unwrap();
    assert!(history
        .messages
        .iter()
        .any(|message| message.id == request.user_message_id));
    let mut wrong = target.clone();
    wrong.scope = "another-account".into();
    assert!(client
        .request::<AttachmentRecoveryReadResponse>(method::CLOUD_ATTACHMENT_RECOVERY_READ, wrong)
        .await
        .is_err());
    control(serde_json::json!({ "conversationAccess": { "id": target.conversation_id, "available": false } })).await;
    assert!(client
        .request::<AttachmentRecoveryReadResponse>(
            method::CLOUD_ATTACHMENT_RECOVERY_READ,
            target.clone()
        )
        .await
        .is_err());
    let listed: AttachmentRecoveryListResponse = client
        .request(
            method::CLOUD_ATTACHMENT_RECOVERY_LIST,
            AttachmentRecoveryListParams {
                scope: target.scope.clone(),
                workspace: None,
            },
        )
        .await
        .unwrap();
    let unavailable = listed
        .selections
        .iter()
        .find(|entry| entry.target == target)
        .unwrap();
    assert!(!unavailable.readable && unavailable.title.is_none());
    let clear = AttachmentRecoveryChangeParams {
        target: target.clone(),
        epoch: listed.epoch,
        revision: Some(unavailable.revision.clone()),
        change: AttachmentRecoveryChange::Clear,
    };
    assert!(
        client
            .request::<AttachmentRecoveryChangeResponse>(
                method::CLOUD_ATTACHMENT_RECOVERY_CHANGE,
                clear
            )
            .await
            .unwrap()
            .accepted
    );
    control(serde_json::json!({ "conversationAccess": { "id": target.conversation_id, "available": true } })).await;
    assert!(read(&client, &target)
        .await
        .snapshot
        .unwrap()
        .files
        .is_empty());

    let temporary_target = new_target(&client, &workspaces.scope).await;
    let file = upload(&client, &temporary_target, "temporary-conversion.txt").await;
    assert_eq!(
        read(&client, &temporary_target)
            .await
            .snapshot
            .unwrap()
            .files,
        vec![file]
    );
    control(serde_json::json!({ "temporaryChange": { "id": temporary_target.conversation_id, "temporary": true } })).await;
    let temporary = read(&client, &temporary_target).await;
    assert!(!temporary.available && temporary.snapshot.is_none());
    let profile = PathBuf::from(std::env::var_os("AGIWORKFORCE_HOME").unwrap());
    let metadata = std::fs::read_to_string(
        profile
            .join("chat-attachment-recovery")
            .join("selections.json"),
    )
    .unwrap();
    assert!(!metadata.contains(&temporary_target.conversation_id));
    assert!(!metadata.contains(&original.asset_id) && !metadata.contains(&another.asset_id));
    assert_eq!(state().await["counts"]["gatewayCalls"], 2);
    third.shutdown().await.unwrap();
}
