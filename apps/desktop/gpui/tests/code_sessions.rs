use agiworkforce_desktop_gpui::code_sessions::{
    accept_delete, accept_rename, delete_params, discard_params, remove_thread, rename_params,
    replace_thread, row_label, KeptArchives,
};
use agiworkforce_protocol::developer_session::{
    AcknowledgedResponse, DeveloperSessionSource, DeveloperSessionTrustMode, ThreadDeleteResponse,
    ThreadRenameResponse, ThreadStatus, ThreadSummary, THREAD_TITLE_MAX_CHARS,
};

fn thread(id: &str, title: &str) -> ThreadSummary {
    ThreadSummary {
        id: id.into(),
        title: title.into(),
        model: None,
        cwd: None,
        provider: None,
        trust_mode: DeveloperSessionTrustMode::Local,
        created_at: "2026-11-14T00:00:00Z".into(),
        updated_at: "2026-11-14T00:00:00Z".into(),
        created_by: DeveloperSessionSource::Desktop,
        status: ThreadStatus::Idle,
        git_branch: None,
        worktree_root: None,
        client: None,
        repository: None,
        writer: None,
        location: None,
    }
}

#[test]
fn archived_sessions_are_labelled_in_the_list_and_in_search_results() {
    let mut archived = thread("session", "Tokyo");
    archived.status = ThreadStatus::Archived;
    assert_eq!(row_label(&archived, "Tokyo".into()), "Archived: Tokyo");
    assert_eq!(
        row_label(&thread("session", "Tokyo"), "Tokyo · plan".into()),
        "Tokyo · plan"
    );
}

#[test]
fn rename_sends_the_trimmed_title_and_requires_the_same_session_back() {
    assert!(rename_params("session", "   ").is_err());
    assert!(rename_params("session", &"x".repeat(THREAD_TITLE_MAX_CHARS + 1)).is_err());
    let request = rename_params("session", "  Better name  ").unwrap();
    assert_eq!(request.title, "Better name");
    let mut response = ThreadRenameResponse {
        thread: thread("session", "Better name"),
    };
    accept_rename(&request, &response).unwrap();
    response.thread.id = "other".into();
    assert!(accept_rename(&request, &response).is_err());
    let mut threads = vec![thread("session", "First name")];
    assert!(replace_thread(
        &mut threads,
        thread("session", "Better name")
    ));
    assert_eq!(threads[0].title, "Better name");
    assert!(!replace_thread(
        &mut threads,
        thread("missing", "Better name")
    ));
}

#[test]
fn delete_keeps_archives_until_a_separate_reviewed_discard() {
    let request = delete_params("session").unwrap();
    assert!(!request.discard_worktree_archives);
    let kept = accept_delete(
        &request,
        &ThreadDeleteResponse {
            acknowledged: true,
            kept_worktree_archives: vec!["refs/archives/session".into()],
            removed_worktree_archives: Vec::new(),
            released_worktrees: Vec::new(),
        },
    )
    .unwrap()
    .unwrap();
    assert_eq!(kept.thread_id, "session");
    let discard = discard_params(&kept).unwrap();
    assert!(discard.discard_worktree_archives);
    assert!(accept_delete(
        &discard,
        &ThreadDeleteResponse {
            acknowledged: true,
            kept_worktree_archives: Vec::new(),
            removed_worktree_archives: kept.refs,
            released_worktrees: Vec::new(),
        },
    )
    .unwrap()
    .is_none());
    assert!(accept_delete(
        &request,
        &ThreadDeleteResponse {
            acknowledged: true,
            kept_worktree_archives: Vec::new(),
            removed_worktree_archives: vec!["refs/archives/session".into()],
            released_worktrees: Vec::new(),
        },
    )
    .is_err());
    assert!(discard_params(&KeptArchives {
        thread_id: "session".into(),
        refs: Vec::new(),
    })
    .is_err());
    let mut threads = vec![thread("session", "Name"), thread("other", "Other")];
    assert!(remove_thread(&mut threads, "session"));
    assert_eq!(threads.len(), 1);
}

#[test]
fn archive_requires_acknowledgement() {
    assert!(
        agiworkforce_desktop_gpui::code_sessions::accept_archive(&AcknowledgedResponse {
            acknowledged: false,
        })
        .is_err()
    );
    agiworkforce_desktop_gpui::code_sessions::accept_archive(&AcknowledgedResponse {
        acknowledged: true,
    })
    .unwrap();
}
