use agiworkforce_desktop_gpui::project_download::ProjectDownload;
use agiworkforce_protocol::{account_cloud::*, project_files::*};
fn target() -> CloudProjectFileTarget {
    CloudProjectFileTarget {
        project: CloudProjectTarget {
            scope: "account".into(),
            workspace: CloudConversationWorkspace::Personal,
            project_id: "project".into(),
        },
        file_id: "file".into(),
    }
}
fn snapshot() -> CloudProjectDownloadSnapshot {
    CloudProjectDownloadSnapshot {
        review: CloudProjectDownloadReview {
            download: CloudProjectDownloadId {
                file: target(),
                id: uuid::Uuid::new_v4().to_string(),
            },
            file: CloudProjectFile {
                id: "file".into(),
                project_id: "project".into(),
                file_name: "source.pdf".into(),
                mime_type: "application/pdf".into(),
                byte_count: 100,
                checksum_sha256: "a".repeat(64),
                added_at: "now".into(),
                added_by_user_id: None,
                preview_kind: None,
                indexing: None,
            },
            project_name: "Project".into(),
            destination: std::env::temp_dir()
                .join("saved.pdf")
                .to_string_lossy()
                .into(),
            replaces: false,
        },
        phase: ProjectDownloadPhase::Ready,
        received_bytes: 0,
        error: None,
        uncertain: false,
        retryable: true,
        cancelable: true,
    }
}
fn state() -> ProjectDownload {
    ProjectDownload {
        target: Some(target()),
        ..Default::default()
    }
}
#[test]
fn download_reviews_reject_other_accounts_workspaces_files_and_nonces() {
    for field in ["account", "workspace", "project", "file", "id"] {
        let mut state = state();
        let mut reply = snapshot();
        let expected = reply.review.download.id.clone();
        match field {
            "account" => reply.review.download.file.project.scope = "other".into(),
            "workspace" => {
                reply.review.download.file.project.workspace =
                    CloudConversationWorkspace::Organization { id: "other".into() }
            }
            "project" => reply.review.download.file.project.project_id = "other".into(),
            "file" => reply.review.download.file.file_id = "other".into(),
            _ => reply.review.download.id = uuid::Uuid::new_v4().to_string(),
        }
        assert!(state.accept(&target(), Some(&expected), reply).is_err());
        assert!(state.snapshot.is_none());
    }
}
#[test]
fn download_retries_keep_the_reviewed_source_destination_and_replacement_consent() {
    let mut state = state();
    let original = snapshot();
    state.accept(&target(), None, original.clone()).unwrap();
    for field in ["checksum", "name", "destination", "replacement"] {
        let mut reply = original.clone();
        reply.phase = ProjectDownloadPhase::Downloading;
        match field {
            "checksum" => reply.review.file.checksum_sha256 = "b".repeat(64),
            "name" => reply.review.file.file_name = "other.pdf".into(),
            "destination" => {
                reply.review.destination = std::env::temp_dir()
                    .join("other.pdf")
                    .to_string_lossy()
                    .into()
            }
            _ => reply.review.replaces = true,
        }
        assert!(state.accept(&target(), None, reply).is_err());
        assert_eq!(state.snapshot, Some(original.clone()));
    }
}
#[test]
fn download_completion_requires_full_progress_and_cannot_regress() {
    let mut state = state();
    let original = snapshot();
    state.accept(&target(), None, original.clone()).unwrap();
    let mut reply = original.clone();
    reply.phase = ProjectDownloadPhase::Succeeded;
    reply.received_bytes = 99;
    assert!(state.accept(&target(), None, reply.clone()).is_err());
    reply.received_bytes = 101;
    assert!(state.accept(&target(), None, reply.clone()).is_err());
    reply.received_bytes = 100;
    state.accept(&target(), None, reply.clone()).unwrap();
    assert!(state.accept(&target(), None, original).is_err());
    assert_eq!(state.snapshot, Some(reply));
}
#[test]
fn active_saving_and_uncertain_results_require_a_consequence_check() {
    let mut state = state();
    let mut reply = snapshot();
    for phase in [
        ProjectDownloadPhase::Downloading,
        ProjectDownloadPhase::Saving,
        ProjectDownloadPhase::Cancelling,
    ] {
        reply.phase = phase;
        state.snapshot = Some(reply.clone());
        assert!(state.needs_close_confirmation());
    }
    reply.phase = ProjectDownloadPhase::Failed;
    reply.uncertain = true;
    state.snapshot = Some(reply.clone());
    assert!(state.needs_close_confirmation());
    reply.phase = ProjectDownloadPhase::Succeeded;
    reply.uncertain = false;
    state.snapshot = Some(reply);
    assert!(!state.needs_close_confirmation());
}
