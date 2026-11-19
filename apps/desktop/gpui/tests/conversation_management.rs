use agiworkforce_desktop_gpui::{cloud_history::CloudHistory, conversation_management::*};
use agiworkforce_protocol::account_cloud::*;

fn conversation(id: &str) -> CloudHistoryConversation {
    CloudHistoryConversation {
        temporary: Some(false),
        id: id.into(),
        title: Some("Original title".into()),
        model: None,
        project_id: None,
        organization_id: None,
        updated_at: "2026-11-09T00:00:00Z".into(),
        work_mode: None,
        pinned: true,
        archived: false,
        version: Some("\"1\"".into()),
    }
}

fn history() -> CloudHistory {
    let original = conversation("selected");
    let mut history = CloudHistory::new(1024 * 1024);
    history.scope = Some("account".into());
    history.conversations.push(original.clone());
    history.detail = Some(CloudHistoryReadResponse {
        draft: None,
        scope: "account".into(),
        conversation: original,
        messages: vec![CloudHistoryMessage {
            id: "saved-message".into(),
            role: "user".into(),
            content: "Keep the transcript".into(),
            content_truncated: false,
            attachments: Vec::new(),
            attachments_incomplete: false,
            work_plan: None,
            work_plan_incomplete: false,
        }],
        has_more: false,
        next_offset: 1,
        start_offset: 0,
        previous_before: None,
    });
    history
}

#[test]
fn actions_freeze_the_visible_account_organization_and_revision() {
    let original = conversation("selected");
    let request = update_request(
        "account",
        &original,
        CloudConversationChange::Rename {
            title: "New title".into(),
        },
    )
    .unwrap();
    assert!(require_unchanged("account", &original, &request).is_ok());
    assert!(require_unchanged("other-account", &original, &request).is_err());
    let mut changed = original.clone();
    changed.version = Some("\"2\"".into());
    assert!(require_unchanged("account", &changed, &request).is_err());
    changed = original.clone();
    changed.organization_id = Some("other-organization".into());
    assert!(require_unchanged("account", &changed, &request).is_err());
    changed = original;
    changed.version = None;
    assert!(update_request(
        "account",
        &changed,
        CloudConversationChange::Pin { pinned: false }
    )
    .is_err());
}

#[test]
fn metadata_updates_preserve_transcripts_and_remove_archived_rows_from_active_history() {
    let mut state = history();
    let original = state.detail.as_ref().unwrap().conversation.clone();
    let messages = state.detail.as_ref().unwrap().messages.clone();
    let mut archived = original.clone();
    archived.archived = true;
    archived.pinned = false;
    archived.version = Some("\"2\"".into());
    state
        .accept_metadata("account", &original, archived.clone())
        .unwrap();
    assert!(state.conversations.is_empty());
    assert_eq!(state.detail.as_ref().unwrap().messages, messages);
    assert!(state.detail.as_ref().unwrap().conversation.archived);
    state.archived_only = true;
    state.conversations.push(archived.clone());
    let mut restored = archived.clone();
    restored.archived = false;
    state
        .accept_metadata("account", &archived, restored)
        .unwrap();
    assert!(state.conversations.is_empty());
    assert_eq!(state.detail.as_ref().unwrap().messages, messages);
}

#[test]
fn metadata_from_another_scope_never_partially_updates_the_view() {
    for wrong in ["account", "conversation", "organization"] {
        let mut state = history();
        let original = state.detail.as_ref().unwrap().conversation.clone();
        let mut reply = original.clone();
        reply.title = Some("Wrong data".into());
        if wrong == "conversation" {
            reply.id = "different".into();
        }
        if wrong == "organization" {
            reply.organization_id = Some("other".into());
        }
        let scope = if wrong == "account" {
            "other-account"
        } else {
            "account"
        };
        assert!(state.accept_metadata(scope, &original, reply).is_err());
        assert_eq!(state.detail.as_ref().unwrap().conversation, original);
        assert_eq!(state.conversations, vec![original]);
    }
}
