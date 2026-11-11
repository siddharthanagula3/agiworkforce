use agiworkforce_desktop_gpui::code_worktrees::{validate_archive, CodeWorktrees};
use agiworkforce_protocol::developer_session::*;

fn root() -> DeveloperWorkspaceIdentity {
    DeveloperWorkspaceIdentity {
        cwd: "/repo".into(),
        root_key: "root".into(),
    }
}
fn tree() -> ManagedWorktreeSummary {
    ManagedWorktreeSummary {
        id: "abc123ef".into(),
        path: "/host/worktrees/one/checkout".into(),
        repository_root: "/repo".into(),
        label: None,
        start: WorktreeStartPoint::WorkingTree,
        base_commit: "base".into(),
        head: Some("base".into()),
        created_at: "2026-11-10T00:00:00Z".into(),
        thread_id: None,
        thread: None,
        pinned: false,
        active: false,
        missing: false,
        setup_exit_code: None,
        setup_ran_at: None,
    }
}
fn list(trees: Vec<ManagedWorktreeSummary>) -> ManagedWorktreeListResponse {
    ManagedWorktreeListResponse {
        worktrees: trees,
        keep: 4,
        setup_script: None,
    }
}

#[test]
fn worktree_lists_stay_bound_to_the_original_or_managed_coding_folder() {
    let mut state = CodeWorktrees::default();
    state.accept_list(root(), list(vec![tree()])).unwrap();
    assert!(state.can_create());
    let mut child = CodeWorktrees::default();
    child
        .accept_list(
            DeveloperWorkspaceIdentity {
                cwd: tree().path,
                root_key: "child".into(),
            },
            list(vec![tree()]),
        )
        .unwrap();
    assert!(!child.can_create());
    assert!(state
        .accept_list(
            DeveloperWorkspaceIdentity {
                cwd: "/foreign".into(),
                root_key: "other".into()
            },
            list(vec![tree()])
        )
        .is_err());
    assert_eq!(state.root, Some(root()));
}

#[test]
fn malformed_or_repeated_lists_do_not_erase_the_confirmed_worktrees() {
    let mut state = CodeWorktrees::default();
    state.accept_list(root(), list(vec![tree()])).unwrap();
    let before = state.list.clone();
    assert!(CodeWorktrees::default()
        .accept_list(
            DeveloperWorkspaceIdentity {
                cwd: "/repo".into(),
                root_key: String::new()
            },
            list(vec![])
        )
        .is_err());
    assert!(state
        .accept_list(root(), list(vec![tree(), tree()]))
        .is_err());
    for field in ["path", "repository", "identity", "active"] {
        let mut bad = tree();
        match field {
            "path" => bad.path = "relative".into(),
            "repository" => bad.repository_root = "/foreign".into(),
            "identity" => bad.id.clear(),
            _ => {
                bad.active = true;
                bad.missing = true;
            }
        }
        assert!(
            state.accept_list(root(), list(vec![bad])).is_err(),
            "{field}"
        );
        assert_eq!(state.list, before);
    }
}

#[test]
fn unknown_mutations_remain_blocked_after_an_authoritative_list_refresh() {
    let mut state = CodeWorktrees {
        uncertain: true,
        ..Default::default()
    };
    assert!(state.begin(true).is_err());
    assert!(state.operation.is_none());
    assert!(state.begin(false).is_ok());
    state.operation = None;
    state.accept_list(root(), list(vec![])).unwrap();
    assert!(state.begin(true).is_err());
    assert!(state.uncertain);
}

#[test]
fn creation_checks_the_starting_point_and_keeps_cleanup_receipts() {
    let mut state = CodeWorktrees::default();
    state.accept_list(root(), list(vec![])).unwrap();
    let created = WorktreeCreateResponse {
        worktree: tree(),
        copied_files: vec!["fixture.txt".into()],
        refused_files: vec![],
        setup_script: None,
        archived: vec![],
        cleanup_failures: vec![WorktreeCleanupFailure {
            worktree_id: "older".into(),
            reason: "ignored files retained".into(),
        }],
    };
    assert!(state
        .accept_created(
            &WorktreeStartPoint::Ref {
                name: "HEAD".into()
            },
            created.clone()
        )
        .is_err());
    assert!(state.created.is_none());
    state
        .accept_created(&WorktreeStartPoint::WorkingTree, created.clone())
        .unwrap();
    assert_eq!(state.created, Some(created));
}

#[test]
fn pin_acknowledgements_cannot_replace_another_checkout() {
    let mut state = CodeWorktrees::default();
    state.accept_list(root(), list(vec![tree()])).unwrap();
    let mut pinned = tree();
    pinned.pinned = true;
    let mut foreign = pinned.clone();
    foreign.path = "/another-checkout".into();
    assert!(state.accept_pin(&tree(), true, foreign).is_err());
    assert!(!state.selected(&tree().id).unwrap().pinned);
    state.accept_pin(&tree(), true, pinned).unwrap();
    assert!(state.selected(&tree().id).unwrap().pinned);
}

#[test]
fn archive_receipts_identify_the_requested_checkout_and_a_recoverable_git_ref() {
    let mut receipt = WorktreeArchive {
        worktree_id: tree().id,
        snapshot_ref: "refs/agiworkforce/worktree-archive/fixture".into(),
        snapshot_commit: "commit".into(),
    };
    validate_archive(&receipt.worktree_id, &receipt).unwrap();
    assert!(validate_archive("foreign", &receipt).is_err());
    receipt.snapshot_ref = "--argument".into();
    assert!(validate_archive(&receipt.worktree_id, &receipt).is_err());
}
