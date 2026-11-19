use agiworkforce_desktop_gpui::recovery_browser::{
    copy_error_message, recovery_error_message, RecoveryBrowser,
};
use agiworkforce_protocol::workspace_files::*;

fn snapshot() -> WorkspaceFileRecoverySnapshot {
    WorkspaceFileRecoverySnapshot {
        root_key: "root".into(),
        path: "missing/note.txt".into(),
        epoch: uuid::Uuid::new_v4().to_string(),
        revision: Some(uuid::Uuid::new_v4().to_string()),
        recovery: Some(WorkspaceFileRecovery {
            base_revision: "base".into(),
            content: "retained 東京 🦀".into(),
        }),
    }
}
fn page(snapshot: &WorkspaceFileRecoverySnapshot) -> WorkspaceFileRecoveryListResponse {
    WorkspaceFileRecoveryListResponse {
        root_key: snapshot.root_key.clone(),
        epoch: snapshot.epoch.clone(),
        entries: vec![WorkspaceFileRecoverySummary {
            path: snapshot.path.clone(),
            revision: snapshot.revision.clone().unwrap(),
            byte_count: snapshot.recovery.as_ref().unwrap().content.len(),
            source_available: false,
        }],
        unavailable: 0,
    }
}
fn browser() -> RecoveryBrowser {
    let snapshot = snapshot();
    let mut state = RecoveryBrowser::default();
    state.accept_list("root", page(&snapshot)).unwrap();
    state
        .accept_snapshot("root", &snapshot.path.clone(), snapshot)
        .unwrap();
    state
}

#[test]
fn missing_files_can_be_reviewed_and_copied_without_an_existing_file_response() {
    let state = browser();
    assert!(!state.list.as_ref().unwrap().entries[0].source_available);
    let params = state.copy_params("rescued.txt".into()).unwrap();
    assert_eq!(params.root_key, "root");
    assert_eq!(params.path, "missing/note.txt");
    assert_eq!(params.destination, "rescued.txt");
    assert_eq!(
        Some(params.revision),
        state.selected.as_ref().unwrap().revision
    );
}

#[test]
fn invalid_lists_do_not_replace_the_last_confirmed_list_or_preview() {
    let mut state = browser();
    let previous = state.list.clone();
    let selected = state.selected.clone();
    for change in ["root", "epoch", "duplicate", "escape", "bytes", "overflow"] {
        let mut invalid = previous.clone().unwrap();
        match change {
            "root" => invalid.root_key = "other-root".into(),
            "epoch" => invalid.epoch = "invalid".into(),
            "duplicate" => invalid.entries.push(invalid.entries[0].clone()),
            "escape" => invalid.entries[0].path = "../escape".into(),
            "bytes" => invalid.entries[0].byte_count = MAX_EDITOR_TEXT_BYTES + 1,
            _ => invalid.unavailable = usize::MAX,
        }
        assert!(state.accept_list("root", invalid).is_err(), "{change}");
        assert_eq!(state.list, previous);
        assert_eq!(state.selected, selected);
    }
}

#[test]
fn a_detail_reply_must_belong_to_a_listed_file_in_the_granted_folder() {
    let mut state = browser();
    let selected = state.selected.clone().unwrap();
    let mut foreign = selected.clone();
    foreign.root_key = "other-root".into();
    assert!(state
        .accept_snapshot("root", &selected.path, foreign)
        .is_err());
    assert!(state
        .accept_snapshot("root", "unlisted.txt", selected.clone())
        .is_err());
    let mut removed = selected.clone();
    removed.recovery = None;
    removed.revision = None;
    assert!(state
        .accept_snapshot("root", &selected.path, removed)
        .is_err());
    assert_eq!(state.selected, Some(selected));
}

#[test]
fn only_the_reviewed_source_receipt_and_destination_can_acknowledge_a_created_file() {
    let mut state = browser();
    let params = state.copy_params("rescued.txt".into()).unwrap();
    let correct = WorkspaceFileRecoveryRestoreResponse {
        root_key: params.root_key.clone(),
        path: params.path.clone(),
        source_revision: params.revision.clone(),
        destination: params.destination.clone(),
        revision: "saved-file-revision".into(),
    };
    for field in ["root", "path", "source_revision", "destination", "revision"] {
        let mut wrong = correct.clone();
        match field {
            "root" => wrong.root_key = "other-root".into(),
            "path" => wrong.path = "other.txt".into(),
            "source_revision" => wrong.source_revision = uuid::Uuid::new_v4().to_string(),
            "destination" => wrong.destination = "other-destination.txt".into(),
            _ => wrong.revision.clear(),
        }
        assert!(state.accept_copy(&params, wrong).is_err(), "{field}");
        assert!(state.saved.is_none());
    }
    state.accept_copy(&params, correct.clone()).unwrap();
    assert_eq!(state.saved, Some(correct));
    assert!(state.selected.as_ref().unwrap().recovery.is_some());
}

#[test]
fn copy_paths_are_relative_and_discard_uses_the_selected_receipt() {
    let state = browser();
    for path in [
        "",
        "../outside",
        "/absolute.txt",
        "two//names",
        "./alias",
        "back\\slash",
    ] {
        assert!(state.copy_params(path.into()).is_err(), "{path}");
    }
    let selected = state.selected.as_ref().unwrap();
    let discard = state.clear_params().unwrap();
    assert_eq!(discard.root_key, selected.root_key);
    assert_eq!(discard.path, selected.path);
    assert_eq!(discard.epoch, selected.epoch);
    assert_eq!(discard.revision, selected.revision);
    assert_eq!(discard.change, WorkspaceFileRecoveryChange::Clear);
}

#[test]
fn refreshing_the_list_removes_stale_preview_and_copy_receipts() {
    let mut state = browser();
    let selected = state.selected.clone().unwrap();
    state
        .accept_list(
            "root",
            WorkspaceFileRecoveryListResponse {
                entries: vec![],
                ..page(&selected)
            },
        )
        .unwrap();
    assert!(state.selected.is_none());
    assert!(state.saved.is_none());
    assert!(state.copy_params("new.txt".into()).is_err());
}

#[test]
fn a_scoped_prepublication_refusal_has_one_actionable_message_without_rpc_codes() {
    let params = browser().copy_params("rescued.txt".into()).unwrap();
    let data = WorkspaceFileRecoveryRestoreFailure {
        root_key: params.root_key.clone(),
        path: params.path.clone(),
        destination: params.destination.clone(),
        uncertain: false,
    };
    let error = anyhow::Error::new(
        agiworkforce_app_server::DeveloperSessionClientError::Remote {
            code: -32009,
            message: "A file already exists. Choose an unused name.".into(),
            data: Some(serde_json::to_value(data).unwrap()),
        },
    );
    assert_eq!(
        copy_error_message(&params, &error),
        "File creation was refused. A file already exists. Choose an unused name."
    );
    assert_eq!(
        recovery_error_message(&error),
        "A file already exists. Choose an unused name."
    );
}

#[test]
fn uncertain_missing_or_mismatched_failure_receipts_never_claim_a_safe_refusal() {
    let params = browser().copy_params("rescued.txt".into()).unwrap();
    for case in ["uncertain", "root", "path", "destination", "missing"] {
        let mut data = WorkspaceFileRecoveryRestoreFailure {
            root_key: params.root_key.clone(),
            path: params.path.clone(),
            destination: params.destination.clone(),
            uncertain: false,
        };
        match case {
            "uncertain" => data.uncertain = true,
            "root" => data.root_key = "other-root".into(),
            "path" => data.path = "other.txt".into(),
            "destination" => data.destination = "other-destination.txt".into(),
            _ => {}
        }
        let error = anyhow::Error::new(
            agiworkforce_app_server::DeveloperSessionClientError::Remote {
                code: -32009,
                message: "Internal detail".into(),
                data: if case == "missing" {
                    None
                } else {
                    Some(serde_json::to_value(data).unwrap())
                },
            },
        );
        let message = copy_error_message(&params, &error);
        assert!(message.contains("could not be confirmed"), "{case}");
        assert!(message.contains("rescued.txt"));
        assert!(!message.contains("Internal detail"));
        assert!(!message.contains("-32009"));
    }
    let timeout = anyhow::Error::new(agiworkforce_app_server::DeveloperSessionClientError::Timeout);
    assert!(copy_error_message(&params, &timeout).contains("could not be confirmed"));
}
