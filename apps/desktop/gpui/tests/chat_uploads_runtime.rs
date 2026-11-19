use agiworkforce_app_server::BackgroundDeveloperSessionClient;
use agiworkforce_desktop_gpui::{
    config::{NativeContracts, Settings},
    runtime::RuntimeSession,
};
use agiworkforce_protocol::{
    account_cloud::*,
    cloud_uploads::*,
    developer_session::{method, AcknowledgedResponse},
    task_state::AgentTaskState,
};
use std::path::{Path, PathBuf};
#[path = "support/upload_fixture.rs"]
mod upload_fixture;
use upload_fixture::{control, mode, state};

fn prepare(target: &CloudChatTarget, path: &Path) -> CloudUploadPrepareParams {
    CloudUploadPrepareParams {
        target: CloudUploadTarget::Chat {
            chat: target.clone(),
        },
        path: path.to_str().unwrap().into(),
        selected_at_ms: chrono::Utc::now().timestamp_millis(),
    }
}
async fn settle(
    client: &BackgroundDeveloperSessionClient,
    id: &CloudUploadId,
) -> CloudUploadSnapshot {
    tokio::time::timeout(std::time::Duration::from_secs(15), async {
        loop {
            let snapshot: CloudUploadSnapshot = client
                .request(method::CLOUD_UPLOAD_READ, id.clone())
                .await
                .unwrap();
            if snapshot.phase != CloudUploadPhase::Ready && !snapshot.phase.running() {
                return snapshot;
            }
            tokio::time::sleep(std::time::Duration::from_millis(10)).await;
        }
    })
    .await
    .unwrap()
}
async fn release(client: &BackgroundDeveloperSessionClient, id: &CloudUploadId) {
    for _ in 0..2 {
        let result: AcknowledgedResponse = client
            .request(method::CLOUD_UPLOAD_RELEASE, id.clone())
            .await
            .unwrap();
        assert!(result.acknowledged);
    }
}
fn attachment(snapshot: &CloudUploadSnapshot) -> CloudHistoryAttachment {
    assert_eq!(snapshot.phase, CloudUploadPhase::Succeeded, "{snapshot:?}");
    let Some(CloudUploadedFile::Chat { attachment }) = &snapshot.file else {
        panic!("Missing chat attachment")
    };
    attachment.clone()
}
async fn turn(client: &BackgroundDeveloperSessionClient, params: &CloudTurnStartParams) {
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
                        scope: params.scope.clone(),
                        workspace: params.workspace.clone(),
                        request_id: params.request_id.clone(),
                        run_id: None,
                    },
                )
                .await
                .unwrap();
            assert!(snapshot.error.is_none(), "{snapshot:?}");
            if snapshot.accepted
                && snapshot.state == AgentTaskState::ReadyForReview
                && !snapshot.stream_attached
                && !snapshot.catching_up
            {
                break;
            }
            tokio::time::sleep(std::time::Duration::from_millis(10)).await;
        }
    })
    .await
    .unwrap();
}
fn count(value: &serde_json::Value, key: &str) -> u64 {
    value["counts"][key].as_u64().unwrap_or_default()
}

#[tokio::test]
#[ignore = "run through the isolated packaged upload fixture runner"]
async fn native_chat_uploads_review_freeze_recover_and_send_durable_file_context() {
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
    let session = RuntimeSession::connect_account(
        &PathBuf::from(std::env::var_os("AGI_GPUI_TEST_RUNTIME").unwrap()),
        &NativeContracts::load().unwrap(),
        Settings::load().unwrap(),
    )
    .await
    .unwrap();
    assert!(session.capabilities().cloud_uploads);
    assert!(!session.capabilities().workspace_files);
    let client = session.client();
    let workspaces: CloudWorkspacesListResponse = client
        .request(
            method::CLOUD_WORKSPACES_LIST,
            CloudWorkspacesListParams { scope: None },
        )
        .await
        .unwrap();
    let created: CloudConversationCreateResponse = client
        .request(
            method::CLOUD_CONVERSATION_CREATE,
            CloudConversationCreateParams {
                scope: workspaces.scope.clone(),
                workspace: Some(CloudConversationWorkspace::Personal),
                project_id: None,
                id: uuid::Uuid::new_v4().to_string(),
            },
        )
        .await
        .unwrap();
    let target = CloudChatTarget {
        scope: workspaces.scope,
        workspace: CloudConversationWorkspace::Personal,
        conversation_id: created.conversation.id.clone(),
    };
    let directory = tempfile::tempdir().unwrap();
    let path = directory.path().join("reviewed 東京.txt");
    std::fs::write(&path, "reviewed bytes").unwrap();
    let before = state().await;
    let mut wrong = target.clone();
    wrong.scope = "another-account".into();
    assert!(client
        .request::<CloudUploadSnapshot>(method::CLOUD_UPLOAD_PREPARE, prepare(&wrong, &path))
        .await
        .is_err());
    wrong = target.clone();
    wrong.workspace = CloudConversationWorkspace::Organization {
        id: workspaces
            .workspaces
            .iter()
            .find_map(|workspace| match &workspace.selector {
                CloudConversationWorkspace::Organization { id } => Some(id.clone()),
                CloudConversationWorkspace::Personal => None,
            })
            .unwrap(),
    };
    assert!(client
        .request::<CloudUploadSnapshot>(method::CLOUD_UPLOAD_PREPARE, prepare(&wrong, &path))
        .await
        .is_err());
    let secret = directory.path().join(".env");
    std::fs::write(&secret, "SYNTHETIC_FIXTURE_ONLY=1").unwrap();
    assert!(client
        .request::<CloudUploadSnapshot>(method::CLOUD_UPLOAD_PREPARE, prepare(&target, &secret))
        .await
        .is_err());
    let unsupported = directory.path().join("archive.zip");
    std::fs::write(&unsupported, "not an admitted file").unwrap();
    assert!(client
        .request::<CloudUploadSnapshot>(
            method::CLOUD_UPLOAD_PREPARE,
            prepare(&target, &unsupported)
        )
        .await
        .is_err());
    let policy: serde_json::Value = serde_json::from_str(include_str!(
        "../../../../packages/contracts/cloud-contracts/src/chat-attachment-policy.json"
    ))
    .unwrap();
    let oversized = directory.path().join("too-large.txt");
    let file = std::fs::File::create(&oversized).unwrap();
    file.set_len(policy["maxBytes"].as_u64().unwrap() + 1)
        .unwrap();
    assert!(client
        .request::<CloudUploadSnapshot>(method::CLOUD_UPLOAD_PREPARE, prepare(&target, &oversized))
        .await
        .is_err());
    assert_eq!(
        count(&state().await, "chatUploadCreates"),
        count(&before, "chatUploadCreates")
    );

    let ready: CloudUploadSnapshot = client
        .request(method::CLOUD_UPLOAD_PREPARE, prepare(&target, &path))
        .await
        .unwrap();
    assert_eq!(ready.phase, CloudUploadPhase::Ready);
    assert_eq!(count(&state().await, "chatUploadCreates"), 0);
    let _: CloudUploadSnapshot = client
        .request(method::CLOUD_UPLOAD_CANCEL, ready.review.upload.clone())
        .await
        .unwrap();
    assert_eq!(
        settle(&client, &ready.review.upload).await.phase,
        CloudUploadPhase::Cancelled
    );
    release(&client, &ready.review.upload).await;

    let contract: serde_json::Value = serde_json::from_str(include_str!(
        "../../../../packages/contracts/cloud-contracts/src/upload-contract.json"
    ))
    .unwrap();
    let payload = "x".repeat(contract["partBytes"].as_u64().unwrap() as usize + 17);
    std::fs::write(&path, &payload).unwrap();
    let ready: CloudUploadSnapshot = client
        .request(method::CLOUD_UPLOAD_PREPARE, prepare(&target, &path))
        .await
        .unwrap();
    let id = ready.review.upload.clone();
    std::fs::write(&path, "changed after review").unwrap();
    mode("lost-part").await;
    let _: CloudUploadSnapshot = client
        .request(method::CLOUD_UPLOAD_START, id.clone())
        .await
        .unwrap();
    let failed = settle(&client, &id).await;
    assert_eq!(failed.phase, CloudUploadPhase::Failed);
    assert!(failed.retryable && !failed.uncertain, "{failed:?}");
    let _: CloudUploadSnapshot = client
        .request(method::CLOUD_UPLOAD_START, id.clone())
        .await
        .unwrap();
    let stored = settle(&client, &id).await;
    let selected = attachment(&stored);
    assert_eq!(selected.size, Some(payload.len() as u64));
    assert_eq!(count(&state().await, "chatUploadPartWrites"), 2);
    release(&client, &id).await;
    assert_eq!(
        state().await["requests"].as_array().unwrap().len(),
        before["requests"].as_array().unwrap().len()
    );
    let params = CloudTurnStartParams {
        attachments: vec![selected.clone()],
        scope: target.scope.clone(),
        workspace: Some(target.workspace.clone()),
        conversation_id: target.conversation_id.clone(),
        request_id: uuid::Uuid::new_v4().to_string(),
        user_message_id: uuid::Uuid::new_v4().to_string(),
        text: "Read the reviewed file".into(),
        page_size: 2,
        model: created.conversation.model,
        work: None,
    };
    turn(&client, &params).await;
    let read_params = CloudHistoryReadParams {
        scope: target.scope.clone(),
        workspace: Some(target.workspace.clone()),
        conversation_id: target.conversation_id.clone(),
        limit: 10,
        offset: 0,
        latest: false,
        before: None,
    };
    let history: CloudHistoryReadResponse = client
        .request(method::CLOUD_HISTORY_READ, read_params.clone())
        .await
        .unwrap();
    assert_eq!(history.messages[0].attachments, vec![selected]);
    let next = CloudTurnStartParams {
        attachments: Vec::new(),
        request_id: uuid::Uuid::new_v4().to_string(),
        user_message_id: uuid::Uuid::new_v4().to_string(),
        text: "Continue with the same saved file".into(),
        ..params
    };
    turn(&client, &next).await;

    let mut completion_files = Vec::new();
    for (index, fault) in ["lost-complete", "bad-complete"].into_iter().enumerate() {
        let source = directory.path().join(format!("{fault}.txt"));
        std::fs::write(&source, format!("completion {index}")).unwrap();
        let prepared: CloudUploadSnapshot = client
            .request(method::CLOUD_UPLOAD_PREPARE, prepare(&target, &source))
            .await
            .unwrap();
        let id = prepared.review.upload;
        mode(fault).await;
        let _: CloudUploadSnapshot = client
            .request(method::CLOUD_UPLOAD_START, id.clone())
            .await
            .unwrap();
        let failed = settle(&client, &id).await;
        assert_eq!(failed.phase, CloudUploadPhase::Failed);
        assert!(failed.uncertain && failed.retryable && !failed.cancelable);
        let before_retry = state().await;
        let _: CloudUploadSnapshot = client
            .request(method::CLOUD_UPLOAD_START, id.clone())
            .await
            .unwrap();
        completion_files.push(attachment(&settle(&client, &id).await));
        let after_retry = state().await;
        for key in [
            "chatUploadCreates",
            "chatUploadPartWrites",
            "chatUploadCompletedFiles",
        ] {
            assert_eq!(
                count(&after_retry, key),
                count(&before_retry, key),
                "{fault}: {key}"
            );
        }
        release(&client, &id).await;
    }
    let file_only = CloudTurnStartParams {
        attachments: completion_files,
        text: String::new(),
        request_id: uuid::Uuid::new_v4().to_string(),
        user_message_id: uuid::Uuid::new_v4().to_string(),
        ..next
    };
    turn(&client, &file_only).await;
    let file_only_history: CloudHistoryReadResponse = client
        .request(method::CLOUD_HISTORY_READ, read_params.clone())
        .await
        .unwrap();
    assert_eq!(file_only_history.messages[4].content, "");
    assert_eq!(
        file_only_history.messages[4].attachments,
        file_only.attachments
    );
    let source = directory.path().join("unknown-create.txt");
    std::fs::write(&source, "not sent").unwrap();
    let prepared: CloudUploadSnapshot = client
        .request(method::CLOUD_UPLOAD_PREPARE, prepare(&target, &source))
        .await
        .unwrap();
    let id = prepared.review.upload;
    mode("lost-create").await;
    let _: CloudUploadSnapshot = client
        .request(method::CLOUD_UPLOAD_START, id.clone())
        .await
        .unwrap();
    let failed = settle(&client, &id).await;
    assert!(failed.uncertain && !failed.retryable);
    let before_retry = state().await;
    assert!(client
        .request::<CloudUploadSnapshot>(method::CLOUD_UPLOAD_START, id.clone())
        .await
        .is_err());
    assert_eq!(
        count(&state().await, "chatUploadCreates"),
        count(&before_retry, "chatUploadCreates")
    );
    let _: CloudUploadSnapshot = client
        .request(method::CLOUD_UPLOAD_CANCEL, id.clone())
        .await
        .unwrap();
    settle(&client, &id).await;
    release(&client, &id).await;

    let source = directory.path().join("cancel.txt");
    std::fs::write(&source, "cancel these bytes").unwrap();
    let prepared: CloudUploadSnapshot = client
        .request(method::CLOUD_UPLOAD_PREPARE, prepare(&target, &source))
        .await
        .unwrap();
    let id = prepared.review.upload;
    mode("hold-part").await;
    let _: CloudUploadSnapshot = client
        .request(method::CLOUD_UPLOAD_START, id.clone())
        .await
        .unwrap();
    tokio::time::timeout(std::time::Duration::from_secs(15), async {
        loop {
            if count(&state().await, "chatUploadPartWrites") == 5 {
                break;
            }
            tokio::time::sleep(std::time::Duration::from_millis(10)).await;
        }
    })
    .await
    .unwrap();
    let _: CloudUploadSnapshot = client
        .request(method::CLOUD_UPLOAD_CANCEL, id.clone())
        .await
        .unwrap();
    assert_eq!(
        settle(&client, &id).await.phase,
        CloudUploadPhase::Cancelled
    );
    release(&client, &id).await;
    mode("normal").await;

    let source = directory.path().join("archive.txt");
    std::fs::write(&source, "not published to an archived conversation").unwrap();
    let prepared: CloudUploadSnapshot = client
        .request(method::CLOUD_UPLOAD_PREPARE, prepare(&target, &source))
        .await
        .unwrap();
    let id = prepared.review.upload;
    let current: CloudHistoryReadResponse = client
        .request(method::CLOUD_HISTORY_READ, read_params)
        .await
        .unwrap();
    let _: CloudConversationUpdateResponse = client
        .request(
            method::CLOUD_CONVERSATION_UPDATE,
            CloudConversationUpdateParams {
                scope: target.scope.clone(),
                conversation_id: target.conversation_id.clone(),
                organization_id: None,
                expected_version: current.conversation.version.unwrap(),
                change: CloudConversationChange::Archive { archived: true },
            },
        )
        .await
        .unwrap();
    let before_archive = state().await;
    let _: CloudUploadSnapshot = client
        .request(method::CLOUD_UPLOAD_START, id.clone())
        .await
        .unwrap();
    assert_eq!(settle(&client, &id).await.phase, CloudUploadPhase::Failed);
    assert_eq!(
        count(&state().await, "chatUploadCreates"),
        count(&before_archive, "chatUploadCreates")
    );
    let _: CloudUploadSnapshot = client
        .request(method::CLOUD_UPLOAD_CANCEL, id.clone())
        .await
        .unwrap();
    settle(&client, &id).await;
    release(&client, &id).await;
    let final_state = state().await;
    assert_eq!(count(&final_state, "chatUploadCreates"), 5);
    assert_eq!(count(&final_state, "chatUploadPartWrites"), 5);
    assert_eq!(count(&final_state, "chatUploadCompletionCalls"), 5);
    assert_eq!(count(&final_state, "chatUploadCompletedFiles"), 3);
    assert_eq!(count(&final_state, "chatUploadAborts"), 1);
    assert!(final_state["failures"].as_array().unwrap().is_empty());
    control(serde_json::json!({ "uploadMode": "normal" })).await;
    session.shutdown().await.unwrap();
}
