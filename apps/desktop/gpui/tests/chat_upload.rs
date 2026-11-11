use agiworkforce_desktop_gpui::chat_upload::{limits, ChatUpload};
use agiworkforce_protocol::{account_cloud::*, cloud_uploads::*};

fn target() -> CloudChatTarget {
    CloudChatTarget {
        scope: "fixture-account".into(),
        workspace: CloudConversationWorkspace::Personal,
        conversation_id: uuid::Uuid::new_v4().to_string(),
    }
}
fn receipt(target: &CloudChatTarget) -> CloudUploadSnapshot {
    let asset = uuid::Uuid::new_v4().to_string();
    CloudUploadSnapshot {
        review: CloudUploadReview {
            upload: CloudUploadId {
                target: CloudUploadTarget::Chat {
                    chat: target.clone(),
                },
                id: uuid::Uuid::new_v4().to_string(),
            },
            destination_name: "Fixture conversation".into(),
            file_name: "notes 東京.txt".into(),
            mime_type: "text/plain".into(),
            byte_count: 3,
            checksum_sha256: "a".repeat(64),
        },
        phase: CloudUploadPhase::Succeeded,
        uploaded_bytes: 3,
        file: Some(CloudUploadedFile::Chat {
            attachment: CloudHistoryAttachment {
                id: asset.clone(),
                asset_id: asset,
                kind: CloudHistoryAttachmentKind::File,
                name: "notes 東京.txt".into(),
                size: Some(3),
                mime_type: Some("text/plain".into()),
            },
        }),
        error: None,
        uncertain: false,
        retryable: false,
        cancelable: false,
    }
}

#[test]
fn reviewed_attachments_cannot_follow_another_account_workspace_or_conversation() {
    let target = target();
    let initial_receipt = receipt(&target);
    let mut state = ChatUpload {
        target: Some(target.clone()),
        ..Default::default()
    };
    let mut foreign = target.clone();
    foreign.scope = "another-account".into();
    assert!(state
        .accept(&foreign, None, initial_receipt.clone())
        .is_err());
    foreign = target.clone();
    foreign.workspace = CloudConversationWorkspace::Organization {
        id: uuid::Uuid::new_v4().to_string(),
    };
    assert!(state
        .accept(&foreign, None, initial_receipt.clone())
        .is_err());
    foreign = target.clone();
    foreign.conversation_id = uuid::Uuid::new_v4().to_string();
    assert!(state
        .accept(&foreign, None, initial_receipt.clone())
        .is_err());
    state
        .accept(
            &target,
            Some(&initial_receipt.review.upload.id),
            initial_receipt.clone(),
        )
        .unwrap();
    assert!(state.files_for(&target).is_err());
    state.finish().unwrap();
    assert_eq!(state.files_for(&target).unwrap()[0].name, "notes 東京.txt");
    assert!(state.files_for(&foreign).is_err());
    state.accept(&target, None, receipt(&target)).unwrap();
    state.finish().unwrap();
    assert_eq!(state.files_for(&target).unwrap().len(), 2);
    let mut changed = initial_receipt.clone();
    changed.review.file_name = "replaced.txt".into();
    assert!(state.accept(&target, None, changed).is_err());
}

#[test]
fn only_verified_matching_uploads_enter_the_message_and_acceptance_clears_only_sent_files() {
    let target = target();
    let receipt = receipt(&target);
    let mut state = ChatUpload {
        target: Some(target.clone()),
        ..Default::default()
    };
    let mut mismatched = receipt.clone();
    mismatched.uploaded_bytes = 2;
    assert!(state.accept(&target, None, mismatched).is_err());
    state.accept(&target, None, receipt).unwrap();
    state.finish().unwrap();
    let sent = state.files_for(&target).unwrap();
    let mut another = sent[0].clone();
    another.asset_id = uuid::Uuid::new_v4().to_string();
    state.sent(&[another]);
    assert_eq!(state.files.len(), 1);
    state.sent(&sent);
    assert!(!state.retains_selection());
    assert!(state.target.is_none());
}

#[test]
fn combined_attachment_limits_come_from_the_shared_policy() {
    let target = target();
    let receipt = receipt(&target);
    let mut state = ChatUpload {
        target: Some(target.clone()),
        ..Default::default()
    };
    state.accept(&target, None, receipt).unwrap();
    state.finish().unwrap();
    let policy = limits().unwrap();
    assert!(state.can_add(policy.max_message_bytes).is_err());
    assert!(state.can_add(policy.max_bytes + 1).is_err());
    assert!(state.can_add(0).is_err());
    state.files.resize(policy.max_count, state.files[0].clone());
    assert!(state.can_add(1).is_err());
}
