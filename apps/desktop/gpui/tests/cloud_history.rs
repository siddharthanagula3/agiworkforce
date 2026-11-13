use agiworkforce_desktop_gpui::cloud_history::CloudHistory;
use agiworkforce_protocol::account_cloud::*;

fn run(id: &str) -> CloudRunSummary {
    CloudRunSummary {
        id: id.into(),
        request_id: "shared-request".into(),
        conversation_id: None,
        conversation_title: Some(id.into()),
        conversation_preview: None,
        state: agiworkforce_protocol::task_state::AgentTaskState::Paused,
        work_state: None,
        origin_surface: "web".into(),
        provider: "fixture".into(),
        model: "fixture-model".into(),
        updated_at: "2026-11-09T00:00:00Z".into(),
    }
}

#[test]
fn work_pages_are_scoped_and_repeated_cursors_cannot_replace_the_visible_data() {
    let mut state = CloudHistory::new(4096);
    state
        .accept_runs(
            CloudRunListResponse {
                workspace: None,
                scope: "owner".into(),
                runs: vec![run("one")],
                next_cursor: Some("next".into()),
            },
            false,
        )
        .unwrap();
    assert!(state
        .accept_runs(
            CloudRunListResponse {
                workspace: None,
                scope: "other".into(),
                runs: vec![run("foreign")],
                next_cursor: None
            },
            true
        )
        .is_err());
    assert!(state
        .accept_runs(
            CloudRunListResponse {
                workspace: None,
                scope: "owner".into(),
                runs: vec![run("loop")],
                next_cursor: Some("next".into())
            },
            true
        )
        .is_err());
    assert_eq!(state.work_runs[0].id, "one");
    state
        .accept_runs(
            CloudRunListResponse {
                workspace: None,
                scope: "owner".into(),
                runs: vec![run("one"), run("two")],
                next_cursor: None,
            },
            true,
        )
        .unwrap();
    assert_eq!(state.work_runs.len(), 2);
    state.work_selected = Some(run("two"));
    state.reset();
    assert!(state.work_runs.is_empty());
    assert!(state.work_selected.is_none());
    assert!(!state.work_loaded);
}

#[test]
fn recovered_run_identity_is_not_just_its_shared_request_key() {
    let mut state = CloudHistory::new(4096);
    state.scope = Some("owner".into());
    state.work_selected = Some(run("one"));
    let mut snapshot: CloudTurnSnapshot = serde_json::from_value(serde_json::json!({ "revision": 0, "scope": "owner", "conversationId": null, "requestId": "shared-request", "runId": "another-run", "state": "paused", "accepted": true, "output": "", "progress": null, "error": null, "detachable": false })).unwrap();
    assert!(state.accept_turn(snapshot.clone()).is_err());
    assert!(state.turn.is_none());
    snapshot.run_id = Some("one".into());
    assert!(!state.accept_turn(snapshot).unwrap());
    assert_eq!(state.turn_id().unwrap().run_id.as_deref(), Some("one"));
    let other = CloudTurnIdParams {
        workspace: None,
        run_id: Some("another-run".into()),
        ..state.turn_id().unwrap()
    };
    assert!(!state.matches_turn(&other));
}

#[test]
fn a_saved_finished_reply_releases_the_native_send_guard() {
    let mut state = CloudHistory::new(8192);
    state.scope = Some("owner".into());
    state.pending_turn = Some(CloudTurnStartParams {
        attachments: Vec::new(),
        workspace: None,
        model: None,
        work: None,
        scope: "owner".into(),
        conversation_id: "first".into(),
        request_id: "reply".into(),
        user_message_id: "question".into(),
        text: "A question".into(),
        page_size: 2,
    });
    state.accept_turn(serde_json::from_value(serde_json::json!({ "revision": 5, "scope": "owner", "conversationId": "first", "requestId": "reply", "state": "ready_for_review", "accepted": true, "output": "An answer", "progress": null, "error": null, "runId": null, "detachable": false })).unwrap()).unwrap();
    state
        .accept_detail(detail("owner", "first", "reply", 1), false)
        .unwrap();
    assert!(state.pending_turn.is_none());
    assert!(state.turn.is_none());
    assert_eq!(state.detail.as_ref().unwrap().messages[0].id, "reply");
}

#[test]
fn older_history_cannot_repeat_a_window_or_leave_a_gap() {
    let mut state = CloudHistory::new(8192);
    state.scope = Some("owner".into());
    let mut latest = detail("owner", "first", "recent", 3);
    latest.has_more = false;
    latest.previous_before = Some(2);
    state.accept_detail(latest.clone(), false).unwrap();
    assert!(state.accept_detail(latest, true).is_err());
    let mut older = detail("owner", "first", "older", 2);
    older.has_more = false;
    older.previous_before = Some(1);
    let mut gap = older.clone();
    gap.next_offset = 1;
    assert!(state.accept_detail(gap, true).is_err());
    assert_eq!(state.detail.as_ref().unwrap().messages[0].id, "recent");
    state.accept_detail(older, true).unwrap();
    assert_eq!(state.detail.as_ref().unwrap().messages[0].id, "older");
    assert_eq!(state.detail.as_ref().unwrap().next_offset, 3);
}

fn conversation(id: &str) -> CloudHistoryConversation {
    CloudHistoryConversation {
        temporary: Some(false),
        archived: false,
        version: None,
        id: id.into(),
        title: Some(id.into()),
        model: None,
        project_id: None,
        organization_id: None,
        updated_at: "2026-11-08T00:00:00Z".into(),
        work_mode: None,
        pinned: false,
    }
}
fn list(scope: &str, ids: &[&str]) -> CloudHistoryListResponse {
    CloudHistoryListResponse {
        workspace: None,
        scope: scope.into(),
        conversations: ids.iter().map(|id| conversation(id)).collect(),
        has_more: true,
        next_offset: ids.len() as u32,
        next_cursor: Some("next".into()),
    }
}
fn detail(scope: &str, id: &str, message: &str, next: u32) -> CloudHistoryReadResponse {
    CloudHistoryReadResponse {
        draft: None,
        start_offset: next.saturating_sub(1),
        previous_before: None,
        scope: scope.into(),
        conversation: conversation(id),
        messages: vec![CloudHistoryMessage {
            id: message.into(),
            role: "assistant".into(),
            content: "A real stored response".into(),
            content_truncated: false,
            attachments: Vec::new(),
            attachments_incomplete: false,
            work_plan: None,
            work_plan_incomplete: false,
        }],
        has_more: true,
        next_offset: next,
    }
}

#[test]
fn a_page_from_another_account_cannot_mix_with_loaded_history() {
    let mut state = CloudHistory::new(8192);
    state
        .accept_list(list("account-a", &["first"]), false)
        .unwrap();
    assert!(state
        .accept_list(list("account-b", &["private"]), true)
        .is_err());
    assert_eq!(state.conversations.len(), 1);
    assert_eq!(state.conversations[0].id, "first");
    assert!(state
        .accept_detail(detail("account-b", "first", "secret", 1), false)
        .is_err());
    assert!(state.detail.is_none());
}

#[test]
fn pagination_deduplicates_ids_and_preserves_message_order() {
    let mut state = CloudHistory::new(8192);
    state.accept_list(list("owner", &["first"]), false).unwrap();
    state
        .accept_list(list("owner", &["first", "second"]), true)
        .unwrap();
    assert_eq!(state.conversations.len(), 2);
    state
        .accept_detail(detail("owner", "first", "one", 1), false)
        .unwrap();
    let mut page = detail("owner", "first", "one", 2);
    page.messages.push(CloudHistoryMessage {
        id: "two".into(),
        role: "user".into(),
        content: "Follow up".into(),
        content_truncated: false,
        attachments: Vec::new(),
        attachments_incomplete: false,
        work_plan: None,
        work_plan_incomplete: false,
    });
    state.accept_detail(page, true).unwrap();
    assert_eq!(
        state
            .detail
            .unwrap()
            .messages
            .iter()
            .map(|message| message.id.as_str())
            .collect::<Vec<_>>(),
        vec!["one", "two"]
    );
}

#[test]
fn resetting_an_account_invalidates_pending_results_and_clears_search_and_content() {
    let mut state = CloudHistory::new(8192);
    state.accept_list(list("owner", &["first"]), false).unwrap();
    state.query = "private search".into();
    let old_generation = state.generation;
    state.reset();
    assert_ne!(state.generation, old_generation);
    assert!(state.scope.is_none());
    assert!(state.conversations.is_empty());
    assert!(state.query.is_empty());
    assert!(state.reset_query);
}

#[test]
fn an_unchanged_cursor_or_a_different_conversation_is_rejected_before_append() {
    let mut state = CloudHistory::new(8192);
    state.accept_list(list("owner", &["first"]), false).unwrap();
    state
        .accept_detail(detail("owner", "first", "one", 1), false)
        .unwrap();
    assert!(state
        .accept_detail(detail("owner", "first", "two", 1), true)
        .is_err());
    assert!(state
        .accept_detail(detail("owner", "different", "two", 2), true)
        .is_err());
    assert_eq!(state.detail.unwrap().messages.len(), 1);
}

#[test]
fn the_loaded_message_window_has_a_budget_and_can_reload_the_first_page() {
    let mut state = CloudHistory::new(512);
    state.accept_list(list("owner", &["first"]), false).unwrap();
    state
        .accept_detail(detail("owner", "first", "one", 1), false)
        .unwrap();
    for index in 2..20 {
        state
            .accept_detail(detail("owner", "first", &index.to_string(), index), true)
            .unwrap();
    }
    assert!(state.windowed);
    assert!(state.detail.as_ref().unwrap().messages.len() < 19);
    state
        .accept_detail(detail("owner", "first", "one", 1), false)
        .unwrap();
    assert!(!state.windowed);
    assert_eq!(state.detail.unwrap().messages[0].id, "one");
}

#[test]
fn cloud_draft_acceptance_is_scoped_and_is_cleared_only_once() {
    use agiworkforce_protocol::task_state::AgentTaskState;
    let mut state = CloudHistory::new(8192);
    state.pending_turn = Some(CloudTurnStartParams {
        attachments: Vec::new(),
        workspace: None,
        model: None,
        work: None,
        scope: "owner".into(),
        conversation_id: "conversation".into(),
        request_id: "request".into(),
        user_message_id: "user".into(),
        text: "Draft".into(),
        page_size: 2,
    });
    let mut snapshot = CloudTurnSnapshot {
        attachment_recovery_error: None,
        workspace: None,
        revision: 0,
        scope: "owner".into(),
        conversation_id: Some("conversation".into()),
        request_id: "request".into(),
        state: AgentTaskState::Queued,
        accepted: false,
        output: String::new(),
        progress: None,
        error: None,
        run_id: None,
        detachable: false,
        stream_attached: false,
        catching_up: false,
        approval_checkpoint: None,
        approvals: Vec::new(),
        work_plan: None,
        rejected: false,
        work_plan_saved: false,
        work_plan_error: None,
    };
    assert!(!state.accept_turn(snapshot.clone()).unwrap());
    snapshot.scope = "another-owner".into();
    assert!(state.accept_turn(snapshot.clone()).is_err());
    snapshot.scope = "owner".into();
    snapshot.revision = 1;
    snapshot.accepted = true;
    assert!(state.accept_turn(snapshot.clone()).unwrap());
    snapshot.revision = 2;
    assert!(!state.accept_turn(snapshot.clone()).unwrap());
    snapshot.revision = 3;
    snapshot.state = AgentTaskState::Cancelled;
    state.accept_turn(snapshot.clone()).unwrap();
    snapshot.revision = 2;
    snapshot.state = AgentTaskState::Running;
    state.accept_turn(snapshot).unwrap();
    assert_eq!(state.turn.unwrap().state, AgentTaskState::Cancelled);
}
