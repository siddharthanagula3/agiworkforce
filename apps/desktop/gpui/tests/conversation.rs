use agiworkforce_desktop_gpui::conversation::Conversation;
use agiworkforce_protocol::agent_events::AGENT_EVENT_SCHEMA_VERSION;
use agiworkforce_protocol::developer_session::{
    method, AppServerNotification, ThreadReadResponse, ThreadReconnectResponse, TurnStartResponse,
    TurnStatus,
};
use serde_json::{json, Value};

fn conversation(active: Option<Value>) -> Conversation {
    let thread = json!({
        "id": "session", "title": "A conversation", "model": "fixture", "provider": "fixture",
        "trustMode": "local", "createdAt": "2026-11-08T00:00:00Z", "updatedAt": "2026-11-08T00:00:00Z",
        "createdBy": "desktop", "status": "idle"
    });
    let transcript: ThreadReadResponse = serde_json::from_value(
        json!({ "thread": thread, "messages": [], "transcriptTruncated": false }),
    )
    .unwrap();
    let reconnect: ThreadReconnectResponse =
        serde_json::from_value(json!({ "thread": thread, "activeTurn": active })).unwrap();
    Conversation::attach(transcript, reconnect, 1024).unwrap()
}

fn event(method: &str, mut params: Value) -> AppServerNotification {
    params["threadId"] = json!("session");
    params["turnId"] = json!("turn");
    AppServerNotification::new(method, params).unwrap()
}

fn delta(index: u64, text: &str) -> AppServerNotification {
    event(
        method::TURN_OUTPUT_DELTA,
        json!({ "index": index, "delta": text }),
    )
}

fn ended(status: &str, response: &str) -> AppServerNotification {
    event(
        if status == "completed" {
            method::TURN_COMPLETED
        } else {
            method::TURN_FAILED
        },
        json!({
            "status": status, "response": response, "inputTokens": 0, "outputTokens": 0,
            "error": null, "failure": null
        }),
    )
}

fn accepted() -> TurnStartResponse {
    serde_json::from_value(
        json!({ "turn": { "threadId": "session", "id": "turn", "status": "running" } }),
    )
    .unwrap()
}

#[test]
fn output_and_completion_before_acknowledgement_are_preserved() {
    let mut view = conversation(None);
    view.apply(delta(0, "First 🦀")).unwrap();
    view.apply(ended("completed", "First 🦀 response")).unwrap();
    view.accepted(accepted(), "A question".into()).unwrap();
    let turn = view.turn.as_ref().unwrap();
    assert_eq!(turn.output, "First 🦀 response");
    assert_eq!(turn.status, TurnStatus::Completed);
    assert_eq!(turn.submitted_text.as_deref(), Some("A question"));
    assert!(!view.is_running());
}

#[test]
fn reconnect_drops_duplicate_deltas_and_appends_only_after_its_cursor() {
    let mut view = conversation(Some(json!({
        "turnId": "turn", "partialResponse": "Hello ", "nextDeltaIndex": 2,
        "nextEventSequence": 0, "pendingApprovals": []
    })));
    view.apply(delta(0, "Hello")).unwrap();
    view.apply(delta(1, " ")).unwrap();
    view.apply(delta(2, "世界")).unwrap();
    view.apply(delta(2, "世界")).unwrap();
    assert_eq!(view.turn.unwrap().output, "Hello 世界");
}

#[test]
fn a_gap_is_reported_without_appending_corrupt_output() {
    let mut view = conversation(None);
    view.apply(delta(0, "first")).unwrap();
    assert!(view.apply(delta(2, "third")).is_err());
    assert_eq!(view.turn.unwrap().output, "first");
}

#[test]
fn other_sessions_and_overlapping_turns_cannot_mix_output() {
    let mut view = conversation(None);
    view.apply(delta(0, "one")).unwrap();
    let mut other_session = delta(1, "two");
    other_session.params["threadId"] = json!("another session");
    view.apply(other_session).unwrap();
    let mut other_turn = delta(1, "three");
    other_turn.params["turnId"] = json!("another turn");
    assert!(view.apply(other_turn).is_err());
    assert_eq!(view.turn.unwrap().output, "one");
}

#[test]
fn crossing_a_boundary_fails_before_changing_route_metadata() {
    let mut view = conversation(None);
    assert!(view
        .apply(event(
            method::TURN_MODEL,
            json!({
                "model": "another fixture", "provider": "remote", "trustMode": "byok"
            })
        ))
        .is_err());
    assert_eq!(view.transcript.thread.provider.as_deref(), Some("fixture"));
    assert!(view.turn.is_none());
}

#[test]
fn approval_snapshot_is_restored_and_resolution_removes_the_request() {
    let mut view = conversation(Some(json!({
        "turnId": "turn", "partialResponse": "", "nextDeltaIndex": 0, "nextEventSequence": 4,
        "pendingApprovals": [{ "requestId": "approval", "kind": "command", "summary": "Run command",
            "detail": "A command needing consent", "reversible": false, "riskLevel": "high", "alwaysAllowSaved": false }]
    })));
    assert_eq!(view.turn.as_ref().unwrap().approvals.len(), 1);
    let resolved = AppServerNotification::new(method::TURN_AGENT_EVENT, json!({
        "schemaVersion": AGENT_EVENT_SCHEMA_VERSION, "sessionId": "session", "turnId": "turn",
        "sequence": 4, "emittedAtMs": 0, "event": { "type": "approval-resolved", "approvalId": "approval", "decision": "approved" }
    })).unwrap();
    view.apply(resolved).unwrap();
    assert!(view.turn.unwrap().approvals.is_empty());
}

#[test]
fn interruption_preserves_partial_output_and_clears_pending_approvals() {
    let mut view = conversation(None);
    view.apply(delta(0, "Partial")).unwrap();
    view.apply(event(
        method::TURN_INTERRUPTED,
        json!({ "status": "interrupted", "unsentSteers": 0 }),
    ))
    .unwrap();
    view.apply(delta(1, "Late")).unwrap();
    let turn = view.turn.unwrap();
    assert_eq!(turn.status, TurnStatus::Interrupted);
    assert_eq!(turn.output, "Partial");
    assert!(turn.approvals.is_empty());
}

#[test]
fn a_finished_turn_remains_visible_when_the_next_turn_starts() {
    let mut view = conversation(None);
    view.accepted(accepted(), "Question".into()).unwrap();
    view.apply(ended("completed", "Answer")).unwrap();
    view.retain_finished_turn();
    view.retain_finished_turn();
    assert_eq!(view.transcript.messages.len(), 2);
    assert_eq!(view.transcript.messages[0].text, "Question");
    assert_eq!(view.transcript.messages[1].text, "Answer");
    assert!(view.can_send());
}

#[test]
fn oversized_output_is_refused_without_growing_the_buffer() {
    let mut view = conversation(None);
    view.apply(delta(0, "Small")).unwrap();
    assert!(view.apply(delta(1, &"x".repeat(1024))).is_err());
    assert_eq!(view.turn.unwrap().output, "Small");
}

#[test]
fn unknown_boundaries_remain_read_only() {
    let mut view = conversation(None);
    view.transcript.thread.trust_mode =
        agiworkforce_protocol::developer_session::DeveloperSessionTrustMode::Unknown;
    assert!(!view.can_send());
}

#[test]
fn replay_keeps_a_turn_that_started_after_an_empty_snapshot() {
    let mut view = conversation(None);
    view.replay([
        event(method::TURN_STARTED, json!({})),
        delta(0, "After snapshot"),
    ])
    .unwrap();
    assert!(view.is_running());
    assert_eq!(view.turn.unwrap().output, "After snapshot");
}

#[test]
fn replay_does_not_repeat_a_turn_already_in_saved_history() {
    let mut view = conversation(None);
    view.accepted(accepted(), "Question".into()).unwrap();
    view.apply(ended("completed", "Answer")).unwrap();
    view.retain_finished_turn();
    view.replay([delta(0, "Answer"), ended("completed", "Answer")])
        .unwrap();
    assert!(view.turn.is_none());
    assert_eq!(view.transcript.messages.len(), 2);
}

#[test]
fn reconnect_uses_the_latest_same_boundary_route_metadata() {
    let view = conversation(None);
    let mut latest = view.transcript.thread.clone();
    latest.provider = Some("new route".into());
    let attached = Conversation::attach(
        view.transcript,
        ThreadReconnectResponse {
            thread: latest,
            active_turn: None,
        },
        1024,
    )
    .unwrap();
    assert_eq!(
        attached.transcript.thread.provider.as_deref(),
        Some("new route")
    );
}

#[test]
fn consecutive_turns_bound_the_visible_history_without_erasing_runtime_history() {
    let mut view = conversation(None);
    for index in 0..10 {
        let mut response = accepted();
        response.turn.id = format!("turn-{index}");
        view.accepted(response, "Question".into()).unwrap();
        let mut notification = ended("completed", &"answer".repeat(80));
        notification.params["turnId"] = json!(format!("turn-{index}"));
        view.apply(notification).unwrap();
        view.retain_finished_turn();
    }
    assert!(view.transcript.transcript_truncated);
    assert!(view.transcript.messages.len() < 20);
    assert_eq!(
        view.transcript.messages.last().unwrap().turn_id.as_deref(),
        Some("turn-9")
    );
}
