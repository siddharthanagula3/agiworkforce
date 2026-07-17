use agiworkforce_protocol::task_state::{AgentTaskState, AgentTaskStateChanged};

#[test]
fn canonical_task_states_have_stable_snake_case_wire_values() {
    let cases = [
        (AgentTaskState::Queued, "\"queued\""),
        (AgentTaskState::Running, "\"running\""),
        (AgentTaskState::AwaitingInput, "\"awaiting_input\""),
        (AgentTaskState::ReadyForReview, "\"ready_for_review\""),
        (AgentTaskState::Completed, "\"completed\""),
        (AgentTaskState::Failed, "\"failed\""),
        (AgentTaskState::Cancelled, "\"cancelled\""),
        (AgentTaskState::Paused, "\"paused\""),
        (AgentTaskState::Archived, "\"archived\""),
    ];

    for (state, expected) in cases {
        assert_eq!(serde_json::to_string(&state).unwrap(), expected);
    }
}

#[test]
fn state_change_payload_is_cross_surface_camel_case() {
    let payload = AgentTaskStateChanged {
        task_id: "task-123".to_string(),
        state: AgentTaskState::ReadyForReview,
        previous_state: Some(AgentTaskState::Running),
        summary: Some("Implementation finished; review requested".to_string()),
    };

    assert_eq!(
        serde_json::to_value(payload).unwrap(),
        serde_json::json!({
            "taskId": "task-123",
            "state": "ready_for_review",
            "previousState": "running",
            "summary": "Implementation finished; review requested",
        })
    );
}

#[test]
fn semantic_groups_drive_task_filters_without_surface_specific_inference() {
    assert!(AgentTaskState::AwaitingInput.needs_input());
    assert!(AgentTaskState::ReadyForReview.needs_review());
    assert!(AgentTaskState::Completed.is_terminal());
    assert!(AgentTaskState::Failed.is_terminal());
    assert!(AgentTaskState::Cancelled.is_terminal());
    assert!(AgentTaskState::Archived.is_terminal());

    assert!(!AgentTaskState::Running.needs_input());
    assert!(!AgentTaskState::ReadyForReview.is_terminal());
    assert!(!AgentTaskState::Paused.is_terminal());
}
