use agiworkforce_desktop_gpui::project_upload::ProjectUpload;
use agiworkforce_protocol::{account_cloud::*, project_files::*};
fn target() -> CloudProjectTarget {
    CloudProjectTarget {
        scope: "account".into(),
        workspace: CloudConversationWorkspace::Personal,
        project_id: "project".into(),
    }
}
fn snapshot() -> CloudProjectUploadSnapshot {
    CloudProjectUploadSnapshot {
        review: CloudProjectUploadReview {
            upload: CloudProjectUploadId {
                target: target(),
                id: uuid::Uuid::new_v4().to_string(),
            },
            project_name: "Notes 東京".into(),
            file_name: "notes.md".into(),
            mime_type: "text/markdown".into(),
            byte_count: 100,
            checksum_sha256: "a".repeat(64),
        },
        phase: ProjectUploadPhase::Ready,
        uploaded_bytes: 0,
        file: None,
        error: None,
        uncertain: false,
        retryable: true,
        cancelable: true,
    }
}
fn state() -> ProjectUpload {
    ProjectUpload {
        target: Some(target()),
        ..Default::default()
    }
}
#[test]
fn upload_reviews_reject_other_accounts_workspaces_and_review_handles() {
    for field in ["account", "workspace", "project", "id"] {
        let mut state = state();
        let mut reply = snapshot();
        let expected = reply.review.upload.id.clone();
        match field {
            "account" => reply.review.upload.target.scope = "other".into(),
            "workspace" => {
                reply.review.upload.target.workspace =
                    CloudConversationWorkspace::Organization { id: "other".into() }
            }
            "project" => reply.review.upload.target.project_id = "other".into(),
            _ => reply.review.upload.id = uuid::Uuid::new_v4().to_string(),
        }
        assert!(state.accept(&target(), Some(&expected), reply).is_err());
        assert!(state.snapshot.is_none());
    }
}
#[test]
fn upload_retries_cannot_replace_the_original_reviewed_source() {
    let mut state = state();
    let mut original = snapshot();
    original.phase = ProjectUploadPhase::Failed;
    state.accept(&target(), None, original.clone()).unwrap();
    for field in ["hash", "name", "size", "mime", "project-name"] {
        let mut reply = original.clone();
        reply.phase = ProjectUploadPhase::Uploading;
        match field {
            "hash" => reply.review.checksum_sha256 = "b".repeat(64),
            "name" => reply.review.file_name = "other.md".into(),
            "size" => reply.review.byte_count += 1,
            "mime" => reply.review.mime_type = "text/plain".into(),
            _ => reply.review.project_name = "other".into(),
        }
        assert!(state
            .accept(&target(), Some(&original.review.upload.id), reply)
            .is_err());
        assert_eq!(state.snapshot, Some(original.clone()));
    }
}
#[test]
fn upload_progress_and_completion_require_the_reviewed_bytes() {
    let mut state = state();
    let original = snapshot();
    state.accept(&target(), None, original.clone()).unwrap();
    let mut oversized = original.clone();
    oversized.uploaded_bytes = 101;
    assert!(state.accept(&target(), None, oversized).is_err());
    let mut completed = original.clone();
    completed.phase = ProjectUploadPhase::Succeeded;
    completed.uploaded_bytes = 100;
    assert!(state.accept(&target(), None, completed.clone()).is_err());
    completed.file = Some(CloudProjectFile {
        id: uuid::Uuid::new_v4().to_string(),
        project_id: target().project_id,
        file_name: original.review.file_name.clone(),
        mime_type: original.review.mime_type.clone(),
        byte_count: 100,
        checksum_sha256: original.review.checksum_sha256.clone(),
        added_at: "today".into(),
        added_by_user_id: None,
        preview_kind: Some(ProjectFilePreviewKind::Text),
        indexing: None,
    });
    let mut mismatched = completed.clone();
    mismatched.file.as_mut().unwrap().checksum_sha256 = "b".repeat(64);
    assert!(state.accept(&target(), None, mismatched).is_err());
    state.accept(&target(), None, completed.clone()).unwrap();
    assert!(state.accept(&target(), None, original).is_err());
    assert_eq!(state.snapshot, Some(completed));
}
#[test]
fn unknown_or_cancelled_uploads_do_not_become_fake_successes() {
    let mut state = state();
    let mut unknown = snapshot();
    unknown.phase = ProjectUploadPhase::Failed;
    unknown.uncertain = true;
    unknown.retryable = false;
    state.accept(&target(), None, unknown.clone()).unwrap();
    assert!(state.snapshot.as_ref().unwrap().uncertain);
    let mut unexpected = unknown.clone();
    unexpected.phase = ProjectUploadPhase::Succeeded;
    assert!(state.accept(&target(), None, unexpected).is_err());
    unknown.phase = ProjectUploadPhase::Cancelled;
    unknown.cancelable = false;
    state.accept(&target(), None, unknown).unwrap();
    assert!(!state.snapshot.as_ref().unwrap().phase.running());
}

#[test]
fn only_confirmed_cloud_storage_releases_the_local_source_close_warning() {
    let mut state = state();
    assert!(state.retains_unsaved_source());
    let mut reply = snapshot();
    for phase in [
        ProjectUploadPhase::Ready,
        ProjectUploadPhase::Uploading,
        ProjectUploadPhase::Completing,
        ProjectUploadPhase::Cancelling,
        ProjectUploadPhase::Failed,
        ProjectUploadPhase::Cancelled,
    ] {
        reply.phase = phase;
        state.snapshot = Some(reply.clone());
        assert!(state.retains_unsaved_source());
    }
    reply.phase = ProjectUploadPhase::Succeeded;
    state.snapshot = Some(reply);
    assert!(!state.retains_unsaved_source());
    assert!(!ProjectUpload::default().retains_unsaved_source());
}
