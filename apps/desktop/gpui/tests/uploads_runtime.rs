use agiworkforce_app_server::BackgroundDeveloperSessionClient;
use agiworkforce_desktop_gpui::{
    config::{NativeContracts, Settings},
    runtime::RuntimeSession,
};
use agiworkforce_protocol::{
    account_cloud::*,
    developer_session::{method, AcknowledgedResponse},
    project_files::*,
};
use std::path::{Path, PathBuf};
#[path = "support/upload_fixture.rs"]
mod upload_fixture;
use upload_fixture::{control, mode, state};
fn prepare(target: &CloudProjectTarget, path: &Path) -> CloudProjectUploadPrepareParams {
    CloudProjectUploadPrepareParams {
        target: target.clone(),
        path: path.to_str().unwrap().into(),
        selected_at_ms: chrono::Utc::now().timestamp_millis(),
    }
}
async fn wait(
    client: &BackgroundDeveloperSessionClient,
    id: &CloudProjectUploadId,
) -> CloudProjectUploadSnapshot {
    tokio::time::timeout(std::time::Duration::from_secs(20), async {
        loop {
            let snapshot: CloudProjectUploadSnapshot = client
                .request(method::CLOUD_PROJECT_UPLOAD_READ, id.clone())
                .await
                .unwrap();
            if !snapshot.phase.running() {
                return snapshot;
            }
            tokio::time::sleep(std::time::Duration::from_millis(20)).await;
        }
    })
    .await
    .unwrap()
}
async fn release(client: &BackgroundDeveloperSessionClient, id: &CloudProjectUploadId) {
    let acknowledged: AcknowledgedResponse = client
        .request(method::CLOUD_PROJECT_UPLOAD_RELEASE, id.clone())
        .await
        .unwrap();
    assert!(acknowledged.acknowledged);
}
fn count(state: &serde_json::Value, field: &str) -> u64 {
    state["counts"][field].as_u64().unwrap_or_default()
}
#[tokio::test]
#[ignore = "run through the isolated packaged project upload fixture runner"]
async fn native_project_uploads_freeze_selected_bytes_and_recover_without_replaying_setup_or_publication(
) {
    assert_eq!(
        std::env::var("AGI_GPUI_UPLOADS_FIXTURE").as_deref(),
        Ok("1")
    );
    let origin = url::Url::parse(&std::env::var("AGIWORKFORCE_API_BASE").unwrap()).unwrap();
    assert_eq!(origin.scheme(), "http");
    assert_eq!(origin.host_str(), Some("127.0.0.1"));
    assert!(std::env::var("AGIWORKFORCE_JWT")
        .unwrap()
        .starts_with("fixture."));
    let session = RuntimeSession::connect_account(
        &PathBuf::from(std::env::var_os("AGI_GPUI_TEST_RUNTIME").unwrap()),
        &NativeContracts::load().unwrap(),
        Settings::load().unwrap(),
    )
    .await
    .unwrap();
    assert!(session.capabilities().cloud_project_uploads);
    assert!(!session.capabilities().workspace_files);
    let client = session.client();
    let workspaces: CloudWorkspacesListResponse = client
        .request(
            method::CLOUD_WORKSPACES_LIST,
            CloudWorkspacesListParams { scope: None },
        )
        .await
        .unwrap();
    let projects: CloudProjectListResponse = client
        .request(
            method::CLOUD_PROJECT_LIST,
            CloudProjectListParams {
                scope: workspaces.scope.clone(),
                workspace: CloudConversationWorkspace::Personal,
                limit: 50,
                cursor: None,
            },
        )
        .await
        .unwrap();
    let project = projects
        .projects
        .iter()
        .find(|project| !project.archived)
        .unwrap();
    let target = CloudProjectTarget {
        scope: workspaces.scope.clone(),
        workspace: CloudConversationWorkspace::Personal,
        project_id: project.id.clone(),
    };
    let temporary = tempfile::tempdir().unwrap();
    let path = temporary.path().join("selected 東京.md");
    for (name, bytes) in [
        ("empty.txt", b"".as_slice()),
        ("image.svg", b"<svg/>".as_slice()),
        (".env", b"SECRET=never sent".as_slice()),
    ] {
        let file = temporary.path().join(name);
        std::fs::write(&file, bytes).unwrap();
        assert!(client
            .request::<CloudProjectUploadSnapshot>(
                method::CLOUD_PROJECT_UPLOAD_PREPARE,
                prepare(&target, &file)
            )
            .await
            .is_err());
    }
    let oversized = temporary.path().join("oversized.txt");
    let policy: serde_json::Value = serde_json::from_str(include_str!(
        "../../../../packages/contracts/types/src/attachment-policy.json"
    ))
    .unwrap();
    std::fs::File::create(&oversized)
        .unwrap()
        .set_len(policy["maxBytes"].as_u64().unwrap() + 1)
        .unwrap();
    assert!(client
        .request::<CloudProjectUploadSnapshot>(
            method::CLOUD_PROJECT_UPLOAD_PREPARE,
            prepare(&target, &oversized)
        )
        .await
        .is_err());
    #[cfg(unix)]
    {
        use std::os::unix::fs::symlink;
        let source = temporary.path().join("source.txt");
        std::fs::write(&source, "source").unwrap();
        let linked = temporary.path().join("linked.txt");
        symlink(&source, &linked).unwrap();
        assert!(client
            .request::<CloudProjectUploadSnapshot>(
                method::CLOUD_PROJECT_UPLOAD_PREPARE,
                prepare(&target, &linked)
            )
            .await
            .is_err());
        let hard = temporary.path().join("hard.txt");
        std::fs::hard_link(&source, &hard).unwrap();
        assert!(client
            .request::<CloudProjectUploadSnapshot>(
                method::CLOUD_PROJECT_UPLOAD_PREPARE,
                prepare(&target, &hard)
            )
            .await
            .is_err());
    }
    let original = "Original 東京 🦀\r\n".repeat(400_000);
    std::fs::write(&path, original.as_bytes()).unwrap();
    let baseline = state().await;
    let review: CloudProjectUploadSnapshot = client
        .request(
            method::CLOUD_PROJECT_UPLOAD_PREPARE,
            prepare(&target, &path),
        )
        .await
        .unwrap();
    assert_eq!(review.phase, ProjectUploadPhase::Ready);
    assert_eq!(review.review.byte_count, original.len() as u64);
    assert!(!serde_json::to_string(&review)
        .unwrap()
        .contains("fixture.upload."));
    assert!(!serde_json::to_string(&review)
        .unwrap()
        .contains(path.to_str().unwrap()));
    assert_eq!(
        count(&state().await, "uploadCreates"),
        count(&baseline, "uploadCreates")
    );
    assert_eq!(count(&state().await, "uploadPartWrites"), 0);
    assert!(client
        .request::<CloudProjectUploadSnapshot>(
            method::CLOUD_PROJECT_UPLOAD_PREPARE,
            prepare(&target, &path)
        )
        .await
        .is_err());
    let id = review.review.upload.clone();
    let mut foreign = id.clone();
    foreign.target.scope = "other".into();
    assert!(client
        .request::<CloudProjectUploadSnapshot>(method::CLOUD_PROJECT_UPLOAD_START, foreign)
        .await
        .is_err());
    let mut wrong = id.clone();
    wrong.id = uuid::Uuid::new_v4().to_string();
    assert!(client
        .request::<CloudProjectUploadSnapshot>(method::CLOUD_PROJECT_UPLOAD_START, wrong)
        .await
        .is_err());
    std::fs::write(&path, "Later local edit must not leave this machine").unwrap();
    let (first, second) = tokio::join!(
        client
            .request::<CloudProjectUploadSnapshot>(method::CLOUD_PROJECT_UPLOAD_START, id.clone()),
        client
            .request::<CloudProjectUploadSnapshot>(method::CLOUD_PROJECT_UPLOAD_START, id.clone())
    );
    first.unwrap();
    second.unwrap();
    let complete = wait(&client, &id).await;
    assert_eq!(
        complete.phase,
        ProjectUploadPhase::Succeeded,
        "{:?}",
        complete.error
    );
    assert_eq!(complete.review, review.review);
    assert_eq!(
        complete.file.as_ref().unwrap().checksum_sha256,
        review.review.checksum_sha256
    );
    let again: CloudProjectUploadSnapshot = client
        .request(method::CLOUD_PROJECT_UPLOAD_START, id.clone())
        .await
        .unwrap();
    assert_eq!(again, complete);
    assert_eq!(count(&state().await, "uploadCreates"), 1);
    assert_eq!(count(&state().await, "uploadCompletedFiles"), 1);
    release(&client, &id).await;
    for scenario in ["lost-part", "lost-complete", "bad-complete"] {
        let bytes = format!(
            "{scenario}\n{}🦀",
            "reviewed original source ".repeat(260_000)
        );
        std::fs::write(&path, &bytes).unwrap();
        let before = state().await;
        let prepared: CloudProjectUploadSnapshot = client
            .request(
                method::CLOUD_PROJECT_UPLOAD_PREPARE,
                prepare(&target, &path),
            )
            .await
            .unwrap();
        let id = prepared.review.upload;
        mode(scenario).await;
        let _: CloudProjectUploadSnapshot = client
            .request(method::CLOUD_PROJECT_UPLOAD_START, id.clone())
            .await
            .unwrap();
        let failed = wait(&client, &id).await;
        assert_eq!(
            failed.phase,
            ProjectUploadPhase::Failed,
            "{scenario}: {:?}",
            failed.error
        );
        assert!(failed.retryable);
        assert_eq!(failed.uncertain, scenario != "lost-part");
        let _: CloudProjectUploadSnapshot = client
            .request(method::CLOUD_PROJECT_UPLOAD_START, id.clone())
            .await
            .unwrap();
        let complete = wait(&client, &id).await;
        assert_eq!(
            complete.phase,
            ProjectUploadPhase::Succeeded,
            "{scenario}: {:?}",
            complete.error
        );
        let after = state().await;
        assert_eq!(
            count(&after, "uploadCreates") - count(&before, "uploadCreates"),
            1
        );
        assert_eq!(
            count(&after, "uploadCompletedFiles") - count(&before, "uploadCompletedFiles"),
            1
        );
        assert_eq!(
            count(&after, "uploadPartWrites") - count(&before, "uploadPartWrites"),
            2,
            "{scenario} replayed an already stored part"
        );
        release(&client, &id).await;
    }
    for scenario in ["bad-progress", "wrong-signed-part", "lost-create"] {
        std::fs::write(&path, format!("Rejected {scenario}")).unwrap();
        let before = state().await;
        let prepared: CloudProjectUploadSnapshot = client
            .request(
                method::CLOUD_PROJECT_UPLOAD_PREPARE,
                prepare(&target, &path),
            )
            .await
            .unwrap();
        let id = prepared.review.upload;
        mode(scenario).await;
        let _: CloudProjectUploadSnapshot = client
            .request(method::CLOUD_PROJECT_UPLOAD_START, id.clone())
            .await
            .unwrap();
        let failed = wait(&client, &id).await;
        assert_eq!(failed.phase, ProjectUploadPhase::Failed);
        assert_eq!(
            count(&state().await, "uploadPartWrites"),
            count(&before, "uploadPartWrites")
        );
        if scenario == "lost-create" {
            assert!(!failed.retryable && failed.uncertain);
            assert!(client
                .request::<CloudProjectUploadSnapshot>(
                    method::CLOUD_PROJECT_UPLOAD_START,
                    id.clone()
                )
                .await
                .is_err());
        }
        let stopped: CloudProjectUploadSnapshot = client
            .request(method::CLOUD_PROJECT_UPLOAD_CANCEL, id.clone())
            .await
            .unwrap();
        assert!(matches!(
            stopped.phase,
            ProjectUploadPhase::Cancelling | ProjectUploadPhase::Cancelled
        ));
        let stopped = wait(&client, &id).await;
        assert_eq!(stopped.phase, ProjectUploadPhase::Cancelled);
        release(&client, &id).await;
        mode("normal").await;
    }
    std::fs::write(&path, "A held upload body").unwrap();
    let prepared: CloudProjectUploadSnapshot = client
        .request(
            method::CLOUD_PROJECT_UPLOAD_PREPARE,
            prepare(&target, &path),
        )
        .await
        .unwrap();
    let id = prepared.review.upload;
    mode("hold-part").await;
    let before = state().await;
    let _: CloudProjectUploadSnapshot = client
        .request(method::CLOUD_PROJECT_UPLOAD_START, id.clone())
        .await
        .unwrap();
    tokio::time::timeout(std::time::Duration::from_secs(10), async {
        while count(&state().await, "uploadPartWrites") == count(&before, "uploadPartWrites") {
            tokio::time::sleep(std::time::Duration::from_millis(20)).await;
        }
    })
    .await
    .unwrap();
    let stopped: CloudProjectUploadSnapshot = client
        .request(method::CLOUD_PROJECT_UPLOAD_CANCEL, id.clone())
        .await
        .unwrap();
    assert!(matches!(
        stopped.phase,
        ProjectUploadPhase::Cancelling | ProjectUploadPhase::Cancelled
    ));
    let stopped = wait(&client, &id).await;
    assert_eq!(stopped.phase, ProjectUploadPhase::Cancelled);
    assert_eq!(
        count(&state().await, "uploadCompletedFiles"),
        count(&before, "uploadCompletedFiles")
    );
    release(&client, &id).await;
    mode("normal").await;
    let memberships: CloudWorkspacesListResponse = client
        .request(
            method::CLOUD_WORKSPACES_LIST,
            CloudWorkspacesListParams {
                scope: Some(workspaces.scope.clone()),
            },
        )
        .await
        .unwrap();
    let organization = memberships
        .workspaces
        .iter()
        .find(|workspace| {
            matches!(
                workspace.selector,
                CloudConversationWorkspace::Organization { .. }
            )
        })
        .unwrap();
    let shared: CloudProjectListResponse = client
        .request(
            method::CLOUD_PROJECT_LIST,
            CloudProjectListParams {
                scope: workspaces.scope.clone(),
                workspace: organization.selector.clone(),
                limit: 50,
                cursor: None,
            },
        )
        .await
        .unwrap();
    for project in shared.projects {
        let shared_target = CloudProjectTarget {
            scope: workspaces.scope.clone(),
            workspace: organization.selector.clone(),
            project_id: project.id.clone(),
        };
        if !project.can_edit {
            assert!(client
                .request::<CloudProjectUploadSnapshot>(
                    method::CLOUD_PROJECT_UPLOAD_PREPARE,
                    prepare(&shared_target, &path)
                )
                .await
                .is_err());
        } else {
            let prepared: CloudProjectUploadSnapshot = client
                .request(
                    method::CLOUD_PROJECT_UPLOAD_PREPARE,
                    prepare(&shared_target, &path),
                )
                .await
                .unwrap();
            control(serde_json::json!({ "projectAccess": { "id": project.id, "access": "read" } }))
                .await;
            let before = state().await;
            let id = prepared.review.upload;
            let _: CloudProjectUploadSnapshot = client
                .request(method::CLOUD_PROJECT_UPLOAD_START, id.clone())
                .await
                .unwrap();
            let failed = wait(&client, &id).await;
            assert_eq!(failed.phase, ProjectUploadPhase::Failed);
            assert_eq!(
                count(&state().await, "uploadCreates"),
                count(&before, "uploadCreates")
            );
            let stopped: CloudProjectUploadSnapshot = client
                .request(method::CLOUD_PROJECT_UPLOAD_CANCEL, id.clone())
                .await
                .unwrap();
            assert!(matches!(
                stopped.phase,
                ProjectUploadPhase::Cancelling | ProjectUploadPhase::Cancelled
            ));
            let stopped = wait(&client, &id).await;
            assert_eq!(stopped.phase, ProjectUploadPhase::Cancelled);
            release(&client, &id).await;
            control(
                serde_json::json!({ "projectAccess": { "id": project.id, "access": "write" } }),
            )
            .await;
            let prepared: CloudProjectUploadSnapshot = client
                .request(
                    method::CLOUD_PROJECT_UPLOAD_PREPARE,
                    prepare(&shared_target, &path),
                )
                .await
                .unwrap();
            let id = prepared.review.upload;
            let before = state().await;
            mode("revoke-at-last-part").await;
            let _: CloudProjectUploadSnapshot = client
                .request(method::CLOUD_PROJECT_UPLOAD_START, id.clone())
                .await
                .unwrap();
            let blocked = wait(&client, &id).await;
            assert_eq!(blocked.phase, ProjectUploadPhase::Failed);
            assert!(
                !blocked.uncertain && blocked.cancelable,
                "A pre-publication refusal became a fake uncertain completion"
            );
            assert_eq!(blocked.uploaded_bytes, blocked.review.byte_count);
            assert_eq!(
                count(&state().await, "uploadCompletionCalls"),
                count(&before, "uploadCompletionCalls")
            );
            let _: CloudProjectUploadSnapshot = client
                .request(method::CLOUD_PROJECT_UPLOAD_CANCEL, id.clone())
                .await
                .unwrap();
            assert_eq!(
                wait(&client, &id).await.phase,
                ProjectUploadPhase::Cancelled
            );
            release(&client, &id).await;
        }
    }
    assert!(state().await["failures"].as_array().unwrap().is_empty());
    session.shutdown().await.unwrap();
}
