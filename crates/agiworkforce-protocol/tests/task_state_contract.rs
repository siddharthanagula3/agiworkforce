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
        (AgentTaskState::Planning, "\"planning\""),
        (AgentTaskState::AwaitingApproval, "\"awaiting_approval\""),
        (AgentTaskState::Resuming, "\"resuming\""),
        (AgentTaskState::Partial, "\"partial\""),
        (AgentTaskState::TimedOut, "\"timed_out\""),
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

    assert!(AgentTaskState::AwaitingApproval.needs_input());
    assert!(AgentTaskState::Partial.is_terminal());
    assert!(AgentTaskState::TimedOut.is_terminal());
    assert!(!AgentTaskState::Planning.is_terminal());
    assert!(!AgentTaskState::Resuming.is_terminal());
}

#[test]
fn every_added_state_degrades_to_one_an_older_reader_already_parses() {
    let original = [
        AgentTaskState::Queued,
        AgentTaskState::Running,
        AgentTaskState::AwaitingInput,
        AgentTaskState::ReadyForReview,
        AgentTaskState::Completed,
        AgentTaskState::Failed,
        AgentTaskState::Cancelled,
        AgentTaskState::Paused,
        AgentTaskState::Archived,
    ];
    for state in original {
        assert_eq!(state.legacy_equivalent(), state);
    }
    let added = [
        (AgentTaskState::Planning, AgentTaskState::Running),
        (
            AgentTaskState::AwaitingApproval,
            AgentTaskState::AwaitingInput,
        ),
        (AgentTaskState::Resuming, AgentTaskState::Running),
        (AgentTaskState::Partial, AgentTaskState::Failed),
        (AgentTaskState::TimedOut, AgentTaskState::Failed),
    ];
    for (state, legacy) in added {
        assert_eq!(state.legacy_equivalent(), legacy);
        assert!(original.contains(&state.legacy_equivalent()));
    }
}
