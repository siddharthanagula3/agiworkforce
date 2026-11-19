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
async fn control(body: serde_json::Value) -> serde_json::Value {
    let origin = std::env::var("AGIWORKFORCE_API_BASE").unwrap();
    let output = std::process::Command::new("curl")
        .args(["--fail", "--silent", "--show-error", "--header"])
        .arg(format!(
            "Authorization: Bearer {}",
            std::env::var("AGIWORKFORCE_JWT").unwrap()
        ))
        .args([
            "--header",
            "Content-Type: application/json",
            "--data-binary",
        ])
        .arg(body.to_string())
        .arg(format!("{origin}/fixture/control"))
        .output()
        .unwrap();
    assert!(output.status.success());
    serde_json::from_slice(&output.stdout).unwrap()
}
async fn ledger() -> serde_json::Value {
    let origin = std::env::var("AGIWORKFORCE_API_BASE").unwrap();
    let output = std::process::Command::new("curl")
        .args(["--fail", "--silent", "--show-error", "--header"])
        .arg(format!(
            "Authorization: Bearer {}",
            std::env::var("AGIWORKFORCE_JWT").unwrap()
        ))
        .arg(format!("{origin}/fixture/state"))
        .output()
        .unwrap();
    assert!(output.status.success());
    serde_json::from_slice(&output.stdout).unwrap()
}
fn counter(state: &serde_json::Value, key: &str) -> u64 {
    state["counts"][key].as_u64().unwrap_or_default()
}
fn prepare(file: &CloudProjectFileVersion, path: &Path) -> CloudProjectDownloadPrepareParams {
    CloudProjectDownloadPrepareParams {
        file: file.clone(),
        destination: path.to_str().unwrap().into(),
        selected_at_ms: chrono::Utc::now().timestamp_millis(),
    }
}
async fn wait(
    client: &BackgroundDeveloperSessionClient,
    id: &CloudProjectDownloadId,
) -> CloudProjectDownloadSnapshot {
    tokio::time::timeout(std::time::Duration::from_secs(20), async {
        loop {
            let snapshot: CloudProjectDownloadSnapshot = client
                .request(method::CLOUD_PROJECT_DOWNLOAD_READ, id.clone())
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
async fn release(client: &BackgroundDeveloperSessionClient, id: &CloudProjectDownloadId) {
    let ack: AcknowledgedResponse = client
        .request(method::CLOUD_PROJECT_DOWNLOAD_RELEASE, id.clone())
        .await
        .unwrap();
    assert!(ack.acknowledged);
}
async fn received(client: &BackgroundDeveloperSessionClient, id: &CloudProjectDownloadId) {
    tokio::time::timeout(std::time::Duration::from_secs(10), async {
        loop {
            let snapshot: CloudProjectDownloadSnapshot = client
                .request(method::CLOUD_PROJECT_DOWNLOAD_READ, id.clone())
                .await
                .unwrap();
            if snapshot.received_bytes > 0 {
                return;
            }
            assert!(snapshot.phase.running(), "{:?}", snapshot.error);
            tokio::time::sleep(std::time::Duration::from_millis(20)).await;
        }
    })
    .await
    .unwrap();
}
#[tokio::test]
#[ignore = "run through the isolated packaged project download fixture runner"]
async fn native_project_downloads_verify_source_bytes_and_preserve_reviewed_destination_authority()
{
    assert_eq!(
        std::env::var("AGI_GPUI_DOWNLOADS_FIXTURE").as_deref(),
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
    let client = session.client();
    assert!(
        session.capabilities().cloud_project_downloads
            && session.capabilities().cloud_project_file_reindex
    );
    assert!(!session.capabilities().workspace_files);
    let spaces: CloudWorkspacesListResponse = client
        .request(
            method::CLOUD_WORKSPACES_LIST,
            CloudWorkspacesListParams { scope: None },
        )
        .await
        .unwrap();
    let personal = CloudConversationWorkspace::Personal;
    let projects: CloudProjectListResponse = client
        .request(
            method::CLOUD_PROJECT_LIST,
            CloudProjectListParams {
                scope: spaces.scope.clone(),
                workspace: personal.clone(),
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
        scope: spaces.scope.clone(),
        workspace: personal.clone(),
        project_id: project.id.clone(),
    };
    let files: CloudProjectFilesResponse = client
        .request(method::CLOUD_PROJECT_FILES_LIST, target.clone())
        .await
        .unwrap();
    let pdf = files
        .files
        .iter()
        .find(|file| file.preview_kind.is_none())
        .unwrap();
    let version = CloudProjectFileVersion {
        target: CloudProjectFileTarget {
            project: target.clone(),
            file_id: pdf.id.clone(),
        },
        checksum_sha256: pdf.checksum_sha256.clone(),
    };
    let root = tempfile::tempdir().unwrap();
    let path = root.path().join("saved 東京.pdf");
    for invalid in [root.path().join(".env"), PathBuf::from("relative.pdf")] {
        assert!(client
            .request::<CloudProjectDownloadSnapshot>(
                method::CLOUD_PROJECT_DOWNLOAD_PREPARE,
                prepare(&version, &invalid)
            )
            .await
            .is_err());
    }
    let mut wrong = version.clone();
    wrong.checksum_sha256 = "b".repeat(64);
    assert!(client
        .request::<CloudProjectDownloadSnapshot>(
            method::CLOUD_PROJECT_DOWNLOAD_PREPARE,
            prepare(&wrong, &path)
        )
        .await
        .is_err());
    let baseline = ledger().await;
    let ready: CloudProjectDownloadSnapshot = client
        .request(
            method::CLOUD_PROJECT_DOWNLOAD_PREPARE,
            prepare(&version, &path),
        )
        .await
        .unwrap();
    assert!(!ready.review.replaces && !path.exists());
    assert_eq!(
        counter(&ledger().await, "downloadRequests"),
        counter(&baseline, "downloadRequests")
    );
    let id = ready.review.download.clone();
    let mut other = id.clone();
    other.file.project.scope = "another-account".into();
    assert!(client
        .request::<CloudProjectDownloadSnapshot>(method::CLOUD_PROJECT_DOWNLOAD_START, other)
        .await
        .is_err());
    let mut other = id.clone();
    other.id = uuid::Uuid::new_v4().to_string();
    assert!(client
        .request::<CloudProjectDownloadSnapshot>(method::CLOUD_PROJECT_DOWNLOAD_START, other)
        .await
        .is_err());
    assert!(client
        .request::<CloudProjectDownloadSnapshot>(
            method::CLOUD_PROJECT_DOWNLOAD_PREPARE,
            prepare(&version, &path)
        )
        .await
        .is_err());
    let (first, second) = tokio::join!(
        client.request::<CloudProjectDownloadSnapshot>(
            method::CLOUD_PROJECT_DOWNLOAD_START,
            id.clone()
        ),
        client.request::<CloudProjectDownloadSnapshot>(
            method::CLOUD_PROJECT_DOWNLOAD_START,
            id.clone()
        )
    );
    first.unwrap();
    second.unwrap();
    let saved = wait(&client, &id).await;
    assert_eq!(
        saved.phase,
        ProjectDownloadPhase::Succeeded,
        "{:?}",
        saved.error
    );
    assert_eq!(std::fs::read(&path).unwrap(), b"%PDF-synthetic");
    let again: CloudProjectDownloadSnapshot = client
        .request(method::CLOUD_PROJECT_DOWNLOAD_START, id.clone())
        .await
        .unwrap();
    assert_eq!(again, saved);
    assert_eq!(
        counter(&ledger().await, "downloadRequests") - counter(&baseline, "downloadRequests"),
        1
    );
    release(&client, &id).await;
    std::fs::write(&path, "original local data").unwrap();
    let ready: CloudProjectDownloadSnapshot = client
        .request(
            method::CLOUD_PROJECT_DOWNLOAD_PREPARE,
            prepare(&version, &path),
        )
        .await
        .unwrap();
    assert!(ready.review.replaces);
    let id = ready.review.download;
    let _: CloudProjectDownloadSnapshot = client
        .request(method::CLOUD_PROJECT_DOWNLOAD_START, id.clone())
        .await
        .unwrap();
    assert_eq!(
        wait(&client, &id).await.phase,
        ProjectDownloadPhase::Succeeded
    );
    assert_eq!(std::fs::read(&path).unwrap(), b"%PDF-synthetic");
    release(&client, &id).await;
    for existing in [true, false] {
        let selected = root.path().join(if existing {
            "conflict.pdf"
        } else {
            "appeared.pdf"
        });
        if existing {
            std::fs::write(&selected, "before").unwrap();
        }
        let ready: CloudProjectDownloadSnapshot = client
            .request(
                method::CLOUD_PROJECT_DOWNLOAD_PREPARE,
                prepare(&version, &selected),
            )
            .await
            .unwrap();
        let id = ready.review.download;
        control(serde_json::json!({"downloadMode":"hold"})).await;
        let _: CloudProjectDownloadSnapshot = client
            .request(method::CLOUD_PROJECT_DOWNLOAD_START, id.clone())
            .await
            .unwrap();
        received(&client, &id).await;
        std::fs::write(&selected, "later user data").unwrap();
        control(serde_json::json!({"downloadMode":"normal"})).await;
        let failed = wait(&client, &id).await;
        assert_eq!(failed.phase, ProjectDownloadPhase::Failed);
        assert!(!failed.uncertain);
        assert_eq!(
            std::fs::read_to_string(&selected).unwrap(),
            "later user data"
        );
        release(&client, &id).await;
    }
    for mode in ["bad-bytes", "oversize", "stream-oversize", "short-body"] {
        let selected = root.path().join(format!("{mode}.pdf"));
        control(serde_json::json!({"downloadMode":mode})).await;
        let ready: CloudProjectDownloadSnapshot = client
            .request(
                method::CLOUD_PROJECT_DOWNLOAD_PREPARE,
                prepare(&version, &selected),
            )
            .await
            .unwrap();
        let id = ready.review.download;
        let _: CloudProjectDownloadSnapshot = client
            .request(method::CLOUD_PROJECT_DOWNLOAD_START, id.clone())
            .await
            .unwrap();
        let failed = wait(&client, &id).await;
        assert_eq!(failed.phase, ProjectDownloadPhase::Failed, "{mode}");
        assert!(!failed.uncertain && !selected.exists());
        release(&client, &id).await;
    }
    control(serde_json::json!({"downloadMode":"lost-body"})).await;
    let selected = root.path().join("retried.pdf");
    let ready: CloudProjectDownloadSnapshot = client
        .request(
            method::CLOUD_PROJECT_DOWNLOAD_PREPARE,
            prepare(&version, &selected),
        )
        .await
        .unwrap();
    let id = ready.review.download;
    let _: CloudProjectDownloadSnapshot = client
        .request(method::CLOUD_PROJECT_DOWNLOAD_START, id.clone())
        .await
        .unwrap();
    let failed = wait(&client, &id).await;
    assert_eq!(failed.phase, ProjectDownloadPhase::Failed);
    assert!(failed.retryable && !selected.exists());
    let _: CloudProjectDownloadSnapshot = client
        .request(method::CLOUD_PROJECT_DOWNLOAD_START, id.clone())
        .await
        .unwrap();
    assert_eq!(
        wait(&client, &id).await.phase,
        ProjectDownloadPhase::Succeeded
    );
    release(&client, &id).await;
    control(serde_json::json!({"downloadMode":"hold"})).await;
    let selected = root.path().join("cancelled.pdf");
    let ready: CloudProjectDownloadSnapshot = client
        .request(
            method::CLOUD_PROJECT_DOWNLOAD_PREPARE,
            prepare(&version, &selected),
        )
        .await
        .unwrap();
    let id = ready.review.download;
    let _: CloudProjectDownloadSnapshot = client
        .request(method::CLOUD_PROJECT_DOWNLOAD_START, id.clone())
        .await
        .unwrap();
    received(&client, &id).await;
    let _: CloudProjectDownloadSnapshot = client
        .request(method::CLOUD_PROJECT_DOWNLOAD_CANCEL, id.clone())
        .await
        .unwrap();
    assert_eq!(
        wait(&client, &id).await.phase,
        ProjectDownloadPhase::Cancelled
    );
    assert!(!selected.exists());
    release(&client, &id).await;
    control(serde_json::json!({"downloadMode":"normal"})).await;
    let notes = files
        .files
        .iter()
        .find(|file| file.preview_kind == Some(ProjectFilePreviewKind::Text))
        .unwrap();
    let note = CloudProjectFileVersion {
        target: CloudProjectFileTarget {
            project: target.clone(),
            file_id: notes.id.clone(),
        },
        checksum_sha256: notes.checksum_sha256.clone(),
    };
    let indexed: CloudProjectFileReindexResponse = client
        .request(method::CLOUD_PROJECT_FILE_REINDEX, note.clone())
        .await
        .unwrap();
    assert!(indexed.new_request && indexed.dispatched);
    let before = ledger().await;
    let queued: CloudProjectFileReindexResponse = client
        .request(method::CLOUD_PROJECT_FILE_REINDEX, note)
        .await
        .unwrap();
    assert!(!queued.new_request);
    assert_eq!(
        counter(&ledger().await, "reindexWrites"),
        counter(&before, "reindexWrites")
    );
    control(serde_json::json!({"reindexMode":"lost"})).await;
    assert!(client
        .request::<CloudProjectFileReindexResponse>(
            method::CLOUD_PROJECT_FILE_REINDEX,
            version.clone()
        )
        .await
        .is_err());
    let queued: CloudProjectFileReindexResponse = client
        .request(method::CLOUD_PROJECT_FILE_REINDEX, version.clone())
        .await
        .unwrap();
    assert!(!queued.new_request);
    let org = spaces
        .workspaces
        .iter()
        .find(|space| {
            matches!(
                space.selector,
                CloudConversationWorkspace::Organization { .. }
            )
        })
        .unwrap();
    let shared: CloudProjectListResponse = client
        .request(
            method::CLOUD_PROJECT_LIST,
            CloudProjectListParams {
                scope: spaces.scope.clone(),
                workspace: org.selector.clone(),
                limit: 50,
                cursor: None,
            },
        )
        .await
        .unwrap();
    let shared = shared
        .projects
        .iter()
        .find(|project| !project.can_edit)
        .unwrap();
    let shared_target = CloudProjectTarget {
        scope: spaces.scope.clone(),
        workspace: org.selector.clone(),
        project_id: shared.id.clone(),
    };
    let shared_files: CloudProjectFilesResponse = client
        .request(method::CLOUD_PROJECT_FILES_LIST, shared_target.clone())
        .await
        .unwrap();
    let source = &shared_files.files[0];
    let shared_version = CloudProjectFileVersion {
        target: CloudProjectFileTarget {
            project: shared_target,
            file_id: source.id.clone(),
        },
        checksum_sha256: source.checksum_sha256.clone(),
    };
    assert!(client
        .request::<CloudProjectFileReindexResponse>(
            method::CLOUD_PROJECT_FILE_REINDEX,
            shared_version.clone()
        )
        .await
        .is_err());
    let selected = root.path().join("revoked.txt");
    let ready: CloudProjectDownloadSnapshot = client
        .request(
            method::CLOUD_PROJECT_DOWNLOAD_PREPARE,
            prepare(&shared_version, &selected),
        )
        .await
        .unwrap();
    let id = ready.review.download;
    control(serde_json::json!({"downloadMode":"hold"})).await;
    let _: CloudProjectDownloadSnapshot = client
        .request(method::CLOUD_PROJECT_DOWNLOAD_START, id.clone())
        .await
        .unwrap();
    received(&client, &id).await;
    control(
        serde_json::json!({"projectAccess":{"id":shared.id,"access":null},"downloadMode":"normal"}),
    )
    .await;
    assert_eq!(wait(&client, &id).await.phase, ProjectDownloadPhase::Failed);
    assert!(!selected.exists());
    release(&client, &id).await;
    control(serde_json::json!({"downloadMode":"changed-source"})).await;
    let selected = root.path().join("changed.pdf");
    let ready: CloudProjectDownloadSnapshot = client
        .request(
            method::CLOUD_PROJECT_DOWNLOAD_PREPARE,
            prepare(&version, &selected),
        )
        .await
        .unwrap();
    let id = ready.review.download;
    let _: CloudProjectDownloadSnapshot = client
        .request(method::CLOUD_PROJECT_DOWNLOAD_START, id.clone())
        .await
        .unwrap();
    assert_eq!(wait(&client, &id).await.phase, ProjectDownloadPhase::Failed);
    assert!(!selected.exists());
    release(&client, &id).await;
    assert!(ledger().await["failures"].as_array().unwrap().is_empty());
    session.shutdown().await.unwrap();
}
