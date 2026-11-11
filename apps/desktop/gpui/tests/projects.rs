use agiworkforce_desktop_gpui::{cloud_history::CloudHistory, projects::*};
use agiworkforce_protocol::account_cloud::*;

fn project(id: &str) -> CloudProject {
    CloudProject {
        id: id.into(),
        name: "Project 東京 🦀".into(),
        description: None,
        instructions: Some("Keep this context separate.".into()),
        organization_id: None,
        version: Some("\"1\"".into()),
        archived: false,
        can_edit: true,
        can_archive: true,
        default_model_id: None,
        conversation_count: None,
        knowledge_file_count: None,
        can_start_chat: true,
    }
}
fn page(ids: &[&str], cursor: Option<&str>) -> CloudProjectListResponse {
    CloudProjectListResponse {
        scope: "account".into(),
        workspace: CloudConversationWorkspace::Personal,
        projects: ids.iter().map(|id| project(id)).collect(),
        has_more: cursor.is_some(),
        next_cursor: cursor.map(Into::into),
    }
}
fn state() -> Projects {
    let mut state = Projects::default();
    state.bind("account", &CloudConversationWorkspace::Personal);
    state
}
#[test]
fn project_pages_cannot_replace_a_different_account_or_mix_workspaces() {
    let mut state = state();
    state
        .accept_list(page(&["one"], Some("next")), false, 4096)
        .unwrap();
    for wrong in ["account", "workspace", "duplicate"] {
        let mut reply = page(&["two"], None);
        if wrong == "account" {
            reply.scope = "other-account".into();
        }
        if wrong == "workspace" {
            reply.projects[0].organization_id = Some("other-workspace".into());
        }
        if wrong == "duplicate" {
            reply.projects.push(reply.projects[0].clone());
        }
        assert!(state.accept_list(reply, true, 4096).is_err());
        assert_eq!(state.rows[0].id, "one");
    }
}
#[test]
fn paging_rejects_repeated_cursors_and_bounds_the_retained_rows() {
    let mut state = state();
    state
        .accept_list(page(&["one"], Some("next")), false, 4096)
        .unwrap();
    assert!(state
        .accept_list(page(&["two"], Some("next")), true, 4096)
        .is_err());
    assert_eq!(state.rows.len(), 1);
    let row_budget = serde_json::to_vec(&vec![project("three")]).unwrap().len() + 1;
    state
        .accept_list(page(&["two", "three"], None), true, row_budget)
        .unwrap();
    assert!(state.windowed);
    assert_eq!(state.rows.last().unwrap().id, "three");
    assert!(serde_json::to_vec(&state.rows).unwrap().len() <= row_budget);
}
#[test]
fn project_metadata_preserves_unknown_counts_and_never_adopts_a_different_identity() {
    let mut state = state();
    let target = CloudProjectTarget {
        scope: "account".into(),
        workspace: CloudConversationWorkspace::Personal,
        project_id: "one".into(),
    };
    let mut response = CloudProjectResponse {
        scope: "account".into(),
        workspace: CloudConversationWorkspace::Personal,
        project: project("two"),
    };
    assert!(state.accept_project(&target, response.clone()).is_err());
    assert!(state.selected.is_none());
    response.project.id = "one".into();
    state.accept_project(&target, response).unwrap();
    let selected = state.selected.as_ref().unwrap();
    assert!(selected.conversation_count.is_none());
    assert!(selected.knowledge_file_count.is_none());
    assert_eq!(details(selected).description, "");
}
#[test]
fn resetting_a_view_keeps_proposed_details_bound_to_their_original_owner() {
    let mut state = state();
    state.edit = Some(ProjectEdit {
        id: uuid::Uuid::new_v4(),
        scope: "account".into(),
        workspace: CloudConversationWorkspace::Personal,
        original: Some(project("one")),
    });
    let edit_id = state.edit.as_ref().unwrap().id;
    state.operation = Some(uuid::Uuid::new_v4());
    state.saving = true;
    state.bind("another-account", &CloudConversationWorkspace::Personal);
    assert_eq!(state.edit.as_ref().unwrap().id, edit_id);
    assert_eq!(state.edit.as_ref().unwrap().scope, "account");
    assert!(state.needs_review);
    assert!(!state.saving);
    assert!(state.operation.is_none());
    assert!(state.rows.is_empty());
}
#[test]
fn a_conversation_moved_out_of_the_selected_project_is_not_rendered_in_its_old_context() {
    let mut history = CloudHistory::new(4096);
    history.scope = Some("account".into());
    history.projects.active_id = Some("one".into());
    let mut conversation = CloudHistoryConversation {
        temporary: Some(false),
        archived: false,
        version: None,
        id: "conversation".into(),
        title: None,
        model: None,
        project_id: Some("two".into()),
        organization_id: None,
        updated_at: "2026-11-09T00:00:00Z".into(),
        work_mode: None,
        pinned: false,
    };
    let mut response = CloudHistoryReadResponse {
        scope: "account".into(),
        draft: None,
        conversation: conversation.clone(),
        messages: vec![],
        has_more: false,
        next_offset: 0,
        start_offset: 0,
        previous_before: None,
    };
    assert!(history.accept_detail(response.clone(), false).is_err());
    assert!(history.detail.is_none());
    conversation.project_id = Some("one".into());
    response.conversation = conversation;
    history.accept_detail(response, false).unwrap();
    assert_eq!(
        history.detail.unwrap().conversation.project_id.as_deref(),
        Some("one")
    );
}
#[test]
fn saving_a_draft_does_not_turn_an_unconfirmed_send_into_a_new_conversation() {
    let mut history = CloudHistory::new(4096);
    history.pending_turn = Some(CloudTurnStartParams {
        attachments: Vec::new(),
        workspace: Some(CloudConversationWorkspace::Personal),
        scope: "account".into(),
        conversation_id: "conversation".into(),
        request_id: "request".into(),
        user_message_id: "message".into(),
        text: "Retain this request".into(),
        page_size: 2,
        model: None,
        work: None,
    });
    history
        .draft
        .observe(
            agiworkforce_desktop_gpui::drafts::DraftTarget {
                scope: "account".into(),
                workspace: CloudConversationWorkspace::Personal,
                conversation_id: "conversation".into(),
            },
            Some(CloudConversationDraft {
                text: "Retain this request".into(),
                revision: Some("2026-11-09T00:00:00Z".into()),
            }),
        )
        .unwrap();
    assert!(!history.draft.dirty());
    assert!(history.has_unconfirmed_turn());
    history.clear_turn();
    assert!(!history.has_unconfirmed_turn());
}
