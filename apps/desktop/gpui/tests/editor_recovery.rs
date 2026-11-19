use agiworkforce_desktop_gpui::editor_recovery::EditorRecovery;
use agiworkforce_protocol::workspace_files::*;

fn file() -> WorkspaceFileResponse {
    WorkspaceFileResponse {
        root_key: "root".into(),
        path: "note.txt".into(),
        content: "on disk".into(),
        revision: "a".repeat(64),
    }
}
fn empty() -> WorkspaceFileRecoverySnapshot {
    WorkspaceFileRecoverySnapshot {
        root_key: "root".into(),
        path: "note.txt".into(),
        epoch: uuid::Uuid::new_v4().to_string(),
        revision: None,
        recovery: None,
    }
}
fn saved(content: &str) -> WorkspaceFileRecoverySnapshot {
    WorkspaceFileRecoverySnapshot {
        revision: Some(uuid::Uuid::new_v4().to_string()),
        recovery: Some(WorkspaceFileRecovery {
            base_revision: file().revision,
            content: content.into(),
        }),
        ..empty()
    }
}

#[test]
fn cold_recovery_requires_review_before_it_replaces_editor_text_or_saved_recovery() {
    let mut state = EditorRecovery::default();
    let saved = saved("recovered 🦀\r\n");
    state.observe(&file(), "on disk", saved.clone()).unwrap();
    assert_eq!(state.review, Some(saved));
    assert!(state.begin(&file(), "on disk").unwrap().is_none());
    state.review = None;
    assert!(state.retained(&file(), "recovered 🦀\r\n"));
}

#[test]
fn writes_capture_the_file_scope_base_revision_and_recovery_receipt() {
    let mut state = EditorRecovery::default();
    let current = empty();
    state.observe(&file(), "on disk", current.clone()).unwrap();
    let (_, params) = state.begin(&file(), "unsaved").unwrap().unwrap();
    assert_eq!(params.root_key, "root");
    assert_eq!(params.path, "note.txt");
    assert_eq!(params.epoch, current.epoch);
    assert_eq!(params.revision, None);
    assert_eq!(
        params.change,
        WorkspaceFileRecoveryChange::Set {
            value: WorkspaceFileRecovery {
                base_revision: file().revision,
                content: "unsaved".into()
            }
        }
    );
}

#[test]
fn an_acknowledgement_does_not_claim_that_newer_typing_was_retained() {
    let mut state = EditorRecovery::default();
    state.observe(&file(), "on disk", empty()).unwrap();
    let (id, params) = state.begin(&file(), "first").unwrap().unwrap();
    state
        .finish(
            &file(),
            id,
            &params,
            WorkspaceFileRecoveryWriteResponse {
                accepted: true,
                current: WorkspaceFileRecoverySnapshot {
                    epoch: params.epoch.clone(),
                    ..saved("first")
                },
            },
        )
        .unwrap();
    assert!(!state.retained(&file(), "typed later"));
    let (_, next) = state.begin(&file(), "typed later").unwrap().unwrap();
    assert!(
        matches!(next.change, WorkspaceFileRecoveryChange::Set { value } if value.content == "typed later")
    );
}

#[test]
fn a_conflicting_or_empty_foreign_revision_requires_review_without_replay() {
    let mut state = EditorRecovery::default();
    state.observe(&file(), "on disk", empty()).unwrap();
    let (id, params) = state.begin(&file(), "mine").unwrap().unwrap();
    let conflicting = saved("other window");
    state
        .finish(
            &file(),
            id,
            &params,
            WorkspaceFileRecoveryWriteResponse {
                accepted: false,
                current: conflicting.clone(),
            },
        )
        .unwrap();
    assert_eq!(state.review, Some(conflicting));
    assert!(state.begin(&file(), "mine").unwrap().is_none());
    state.review = None;
    let (id, params) = state.begin(&file(), "mine").unwrap().unwrap();
    state
        .finish(
            &file(),
            id,
            &params,
            WorkspaceFileRecoveryWriteResponse {
                accepted: false,
                current: empty(),
            },
        )
        .unwrap();
    assert!(state.review.as_ref().unwrap().recovery.is_none());
}

#[test]
fn reload_reconciles_an_unknown_write_only_when_the_saved_text_matches() {
    let mut state = EditorRecovery {
        error: Some("unknown acknowledgement".into()),
        ..Default::default()
    };
    state.observe(&file(), "mine", saved("mine")).unwrap();
    assert!(state.retained(&file(), "mine"));
    assert!(state.begin(&file(), "mine").unwrap().is_none());
    state
        .observe(&file(), "mine", saved("another window"))
        .unwrap();
    assert!(state.review.is_some());
}

#[test]
fn recovery_responses_cannot_cross_files_folders_or_omit_their_receipt() {
    let mut state = EditorRecovery::default();
    for field in ["root", "path", "revision", "epoch", "content"] {
        let mut invalid = saved("retained");
        match field {
            "root" => invalid.root_key = "foreign-root".into(),
            "path" => invalid.path = "foreign.txt".into(),
            "revision" => invalid.revision = None,
            "epoch" => invalid.epoch = "not-a-receipt".into(),
            _ => invalid.recovery.as_mut().unwrap().content = "bad\0data".into(),
        }
        assert!(
            state.observe(&file(), "on disk", invalid).is_err(),
            "{field}"
        );
        assert!(state.current.is_none());
    }
}

#[test]
fn confirmed_file_saving_clears_recovery_through_its_current_receipt() {
    let mut state = EditorRecovery::default();
    let retained = saved("new disk contents");
    let mut updated = file();
    updated.content = "new disk contents".into();
    updated.revision = "b".repeat(64);
    state
        .observe(&updated, &updated.content, retained.clone())
        .unwrap();
    assert!(state.review.is_none());
    let (_, params) = state.begin(&updated, &updated.content).unwrap().unwrap();
    assert_eq!(params.change, WorkspaceFileRecoveryChange::Clear);
    assert_eq!(params.revision, retained.revision);
}

#[test]
fn unrelated_operations_text_and_epochs_cannot_acknowledge_a_pending_recovery_write() {
    let mut state = EditorRecovery::default();
    let initial = empty();
    state.observe(&file(), "on disk", initial.clone()).unwrap();
    let (id, params) = state.begin(&file(), "mine").unwrap().unwrap();
    let response = WorkspaceFileRecoveryWriteResponse {
        accepted: true,
        current: WorkspaceFileRecoverySnapshot {
            epoch: params.epoch.clone(),
            ..saved("mine")
        },
    };
    assert!(state
        .finish(&file(), uuid::Uuid::new_v4(), &params, response.clone())
        .is_err());
    let mut bad_epoch = response.clone();
    bad_epoch.current.epoch = uuid::Uuid::new_v4().to_string();
    assert!(state.finish(&file(), id, &params, bad_epoch).is_err());
    let mut bad_text = response.clone();
    bad_text.current.recovery.as_mut().unwrap().content = "foreign text".into();
    assert!(state.finish(&file(), id, &params, bad_text).is_err());
    assert_eq!(state.current, Some(initial));
    state.finish(&file(), id, &params, response).unwrap();
    assert!(state.retained(&file(), "mine"));
}

#[test]
fn resolving_review_checks_the_receipt_even_when_restored_text_matches_the_old_snapshot() {
    let mut state = EditorRecovery::default();
    state
        .observe(&file(), "on disk", saved("restore this"))
        .unwrap();
    state.review = None;
    state.verification_required = true;
    assert!(!state.retained(&file(), "restore this"));
    let (id, params) = state.begin(&file(), "restore this").unwrap().unwrap();
    let newer = saved("another window changed recovery during review");
    state
        .finish(
            &file(),
            id,
            &params,
            WorkspaceFileRecoveryWriteResponse {
                accepted: false,
                current: newer.clone(),
            },
        )
        .unwrap();
    assert_eq!(state.review, Some(newer));
    assert!(!state.retained(&file(), "restore this"));
}
