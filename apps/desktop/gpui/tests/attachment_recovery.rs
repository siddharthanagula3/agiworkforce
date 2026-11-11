use agiworkforce_desktop_gpui::{attachment_recovery::AttachmentRecovery, chat_upload::ChatUpload};
use agiworkforce_protocol::{
    account_cloud::*, attachment_recovery::*, cloud_uploads::CloudChatTarget,
};
fn snapshot() -> AttachmentRecoverySnapshot {
    let id = uuid::Uuid::new_v4().to_string();
    AttachmentRecoverySnapshot {
        target: CloudChatTarget {
            scope: "account".into(),
            workspace: CloudConversationWorkspace::Personal,
            conversation_id: uuid::Uuid::new_v4().to_string(),
        },
        epoch: uuid::Uuid::new_v4().to_string(),
        revision: Some(uuid::Uuid::new_v4().to_string()),
        files: vec![CloudHistoryAttachment {
            id: id.clone(),
            asset_id: id,
            kind: CloudHistoryAttachmentKind::File,
            name: "retained 東京.txt".into(),
            size: Some(5),
            mime_type: Some("text/plain".into()),
        }],
        pending_send: None,
    }
}
fn read(snapshot: AttachmentRecoverySnapshot) -> AttachmentRecoveryReadResponse {
    AttachmentRecoveryReadResponse {
        target: snapshot.target.clone(),
        available: true,
        snapshot: Some(snapshot),
    }
}

#[test]
fn retained_files_cannot_be_restored_into_a_different_account_or_conversation() {
    let snapshot = snapshot();
    let mut state = AttachmentRecovery::default();
    let mut foreign = snapshot.target.clone();
    foreign.scope = "other-account".into();
    assert!(state.accept(&foreign, read(snapshot.clone())).is_err());
    foreign = snapshot.target.clone();
    foreign.conversation_id = uuid::Uuid::new_v4().to_string();
    assert!(state.accept(&foreign, read(snapshot.clone())).is_err());
    state
        .accept(&snapshot.target, read(snapshot.clone()))
        .unwrap();
    let queue = ChatUpload {
        target: Some(snapshot.target.clone()),
        files: snapshot.files.clone(),
        ..Default::default()
    };
    assert!(state.retained(&queue));
    state.verification_required = true;
    assert!(!state.retained(&queue));
}

#[test]
fn conflicting_recovery_changes_preserve_the_existing_selection_and_require_reload() {
    let before = snapshot();
    let queue = ChatUpload {
        target: Some(before.target.clone()),
        files: before.files.clone(),
        ..Default::default()
    };
    let mut state = AttachmentRecovery::default();
    state.accept(&before.target, read(before.clone())).unwrap();
    let mut changed = before.clone();
    changed.revision = Some(uuid::Uuid::new_v4().to_string());
    assert!(!state
        .accept_change(
            &before.target,
            AttachmentRecoveryChangeResponse {
                accepted: false,
                target: before.target.clone(),
                snapshot: Some(changed)
            }
        )
        .unwrap());
    assert!(state.verification_required && !state.retained(&queue));
    assert_eq!(queue.files, before.files);
}

#[test]
fn unconfirmed_sends_never_qualify_as_retained_unsent_files_until_explicit_resolution() {
    let mut snapshot = snapshot();
    snapshot.pending_send = Some(AttachmentPendingSend {
        request_id: uuid::Uuid::new_v4().to_string(),
        user_message_id: uuid::Uuid::new_v4().to_string(),
        asset_ids: vec![snapshot.files[0].asset_id.clone()],
    });
    let queue = ChatUpload {
        target: Some(snapshot.target.clone()),
        files: snapshot.files.clone(),
        ..Default::default()
    };
    let mut state = AttachmentRecovery::default();
    state
        .accept(&snapshot.target, read(snapshot.clone()))
        .unwrap();
    assert!(!state.retained(&queue));
    snapshot.pending_send = None;
    assert!(state
        .accept_change(
            &snapshot.target,
            AttachmentRecoveryChangeResponse {
                target: snapshot.target.clone(),
                accepted: true,
                snapshot: Some(snapshot.clone())
            }
        )
        .unwrap());
    assert!(state.retained(&queue));
}

#[test]
fn inaccessible_recovery_rows_do_not_expose_cached_titles() {
    let snapshot = snapshot();
    let row = AttachmentRecoverySummary {
        target: snapshot.target.clone(),
        revision: snapshot.revision.unwrap(),
        title: Some("Private cached title".into()),
        file_count: 1,
        pending_send: false,
        readable: false,
    };
    let response = AttachmentRecoveryListResponse {
        scope: snapshot.target.scope.clone(),
        workspace: None,
        epoch: snapshot.epoch,
        selections: vec![row],
    };
    let mut state = AttachmentRecovery::default();
    assert!(state.accept_list("account", response.clone()).is_err());
    let mut redacted = response;
    redacted.selections[0].title = None;
    state.accept_list("account", redacted).unwrap();
}
