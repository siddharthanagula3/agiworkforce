use agiworkforce_desktop_gpui::project_files::ProjectFiles;
use agiworkforce_protocol::{account_cloud::*, project_files::*};
fn target() -> CloudProjectTarget {
    CloudProjectTarget {
        scope: "account".into(),
        workspace: CloudConversationWorkspace::Personal,
        project_id: "project".into(),
    }
}
fn file() -> CloudProjectFile {
    CloudProjectFile {
        id: "file".into(),
        project_id: "project".into(),
        file_name: "notes 東京.md".into(),
        mime_type: "text/markdown".into(),
        byte_count: 30,
        checksum_sha256: "a".repeat(64),
        added_at: "today".into(),
        added_by_user_id: None,
        preview_kind: Some(ProjectFilePreviewKind::Text),
        indexing: None,
    }
}
fn list() -> CloudProjectFilesResponse {
    CloudProjectFilesResponse {
        target: target(),
        files: vec![file()],
    }
}
fn preview() -> CloudProjectFilePreview {
    CloudProjectFilePreview {
        target: CloudProjectFileTarget {
            project: target(),
            file_id: file().id,
        },
        checksum_sha256: file().checksum_sha256,
        kind: ProjectFilePreviewKind::Text,
        text: "東京 🦀\n<script>literal content</script>".into(),
        truncated: true,
    }
}
#[test]
fn rejects_foreign_file_pages_without_replacing_current_data() {
    let mut state = ProjectFiles::default();
    state.accept_list(&target(), list()).unwrap();
    for field in [
        "account",
        "workspace",
        "project",
        "file-project",
        "duplicate",
    ] {
        let mut page = list();
        match field {
            "account" => page.target.scope = "other".into(),
            "workspace" => {
                page.target.workspace =
                    CloudConversationWorkspace::Organization { id: "other".into() }
            }
            "project" => page.target.project_id = "other".into(),
            "file-project" => page.files[0].project_id = "other".into(),
            _ => page.files.push(file()),
        }
        assert!(state.accept_list(&target(), page).is_err());
        assert_eq!(state.rows, vec![file()]);
    }
}
#[test]
fn previews_keep_exact_unicode_truncation_and_literal_text() {
    let mut state = ProjectFiles::default();
    state.accept_list(&target(), list()).unwrap();
    let response = preview();
    state
        .accept_preview(&response.target, response.clone())
        .unwrap();
    assert_eq!(state.preview, Some(response));
    state.accept_list(&target(), list()).unwrap();
    assert!(state.preview.is_none());
}
#[test]
fn rejects_unrequested_or_replaced_preview_sources() {
    let mut state = ProjectFiles::default();
    state.accept_list(&target(), list()).unwrap();
    for field in [
        "account",
        "workspace",
        "file",
        "checksum",
        "kind",
        "wrong-kind",
    ] {
        let mut response = preview();
        let expected = response.target.clone();
        match field {
            "account" => response.target.project.scope = "other".into(),
            "workspace" => {
                response.target.project.workspace =
                    CloudConversationWorkspace::Organization { id: "other".into() }
            }
            "file" => response.target.file_id = "other".into(),
            "checksum" => response.checksum_sha256 = "b".repeat(64),
            "wrong-kind" => response.kind = ProjectFilePreviewKind::Table,
            _ => response.kind = ProjectFilePreviewKind::Office,
        }
        assert!(state.accept_preview(&expected, response).is_err());
        assert!(state.preview.is_none());
    }
}
#[test]
fn revoked_or_unlisted_file_previews_are_rejected() {
    let mut state = ProjectFiles::default();
    let response = preview();
    assert!(state
        .accept_preview(&response.target, response.clone())
        .is_err());
    let mut page = list();
    page.files[0].preview_kind = None;
    state.accept_list(&target(), page).unwrap();
    assert!(state
        .accept_preview(&response.target, response.clone())
        .is_err());
}

#[test]
fn reindex_results_keep_the_original_file_scope_and_expose_pending_status() {
    let mut state = ProjectFiles::default();
    state.accept_list(&target(), list()).unwrap();
    let expected = preview().target;
    let mut response = CloudProjectFileReindexResponse {
        target: expected.clone(),
        indexing: Some(ProjectFileIndexState {
            status: "pending".into(),
            chunk_count: 0,
            semantic: false,
            attempts: 0,
            error: None,
            indexed_at: None,
        }),
        dispatched: true,
        new_request: true,
    };
    response.target.file_id = "other".into();
    assert!(state.accept_reindex(&expected, response.clone()).is_err());
    assert!(state.rows[0].indexing.is_none());
    response.target = expected.clone();
    state.accept_reindex(&expected, response.clone()).unwrap();
    assert_eq!(state.rows[0].indexing.as_ref().unwrap().status, "pending");
    assert!(state.notice.is_some());
    response.new_request = false;
    response.dispatched = false;
    state.accept_reindex(&expected, response).unwrap();
    assert!(state.notice.as_deref().unwrap().contains("already"));
}
