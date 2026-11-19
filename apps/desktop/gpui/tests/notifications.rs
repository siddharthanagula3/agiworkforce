use agiworkforce_desktop_gpui::notifications::{
    hold_plan, HoldPlan, KeepAwake, Kind, Platform, Policy, Tracker,
};
use agiworkforce_desktop_gpui::preferences::Preferences;
use agiworkforce_protocol::developer_session::{method, AppServerNotification};
use agiworkforce_protocol::task_state::AgentTaskState;
use serde_json::json;

const PRODUCT: &str = "Test Desktop";

const AWAY: Policy = Policy {
    notify_finished: true,
    notify_approval: true,
    window_active: false,
};

fn notification(name: &str, params: serde_json::Value) -> AppServerNotification {
    AppServerNotification {
        method: name.into(),
        params,
    }
}

fn started(thread: &str, turn: &str) -> AppServerNotification {
    notification(
        method::TURN_STARTED,
        json!({ "threadId": thread, "turnId": turn }),
    )
}

fn ended(
    thread: &str,
    turn: &str,
    status: &str,
    failure: serde_json::Value,
    response: &str,
) -> AppServerNotification {
    notification(
        if status == "failed" {
            method::TURN_FAILED
        } else {
            method::TURN_COMPLETED
        },
        json!({
            "threadId": thread,
            "turnId": turn,
            "status": status,
            "response": response,
            "inputTokens": 1,
            "outputTokens": 1,
            "error": null,
            "failure": failure,
        }),
    )
}

fn approval(
    thread: &str,
    turn: &str,
    request: &str,
    risk: serde_json::Value,
    reversible: serde_json::Value,
) -> AppServerNotification {
    notification(
        method::APPROVAL_REQUESTED,
        json!({
            "threadId": thread,
            "turnId": turn,
            "requestId": request,
            "kind": "command",
            "summary": "Run curl -H 'Authorization: Bearer sk-secret-token'",
            "detail": "secret detail text",
            "riskLevel": risk,
            "reversible": reversible,
            "proposedContent": null,
            "alwaysAllowSaved": false,
            "proposedExecpolicyAmendment": null,
            "editable": false,
            "question": null,
        }),
    )
}

fn failure(code: &str) -> serde_json::Value {
    json!({
        "code": code,
        "message": "token sk-secret-token was rejected",
        "retryable": false,
        "action": "none",
    })
}

#[test]
fn a_finished_turn_notifies_once_without_the_response_text() {
    let mut tracker = Tracker::default();
    assert_eq!(tracker.observe(&started("t", "1"), PRODUCT, AWAY), None);
    assert!(tracker.working());
    let finished = ended(
        "t",
        "1",
        "completed",
        json!(null),
        "the private answer sk-secret-token",
    );
    let notice = tracker.observe(&finished, PRODUCT, AWAY).unwrap();
    assert_eq!(notice.kind, Kind::Finished);
    assert!(!tracker.working());
    assert!(notice.body.contains(PRODUCT));
    for text in [&notice.title, &notice.body] {
        assert!(!text.contains("private") && !text.contains("sk-secret"));
    }
    assert_eq!(tracker.observe(&finished, PRODUCT, AWAY), None);
}

#[test]
fn a_failed_turn_names_the_failure_class_not_the_provider_message() {
    let mut tracker = Tracker::default();
    tracker.observe(&started("t", "1"), PRODUCT, AWAY);
    let notice = tracker
        .observe(
            &ended("t", "1", "failed", failure("usage_limit_reached"), ""),
            PRODUCT,
            AWAY,
        )
        .unwrap();
    assert_eq!(notice.kind, Kind::Failed);
    assert!(notice.body.contains("usage limit"));
    assert!(!notice.body.contains("sk-secret") && !notice.title.contains("sk-secret"));
    assert!(!tracker.working());

    let notice = tracker
        .observe(&ended("t", "2", "failed", json!(null), ""), PRODUCT, AWAY)
        .unwrap();
    assert!(notice.body.contains("did not finish"));
}

#[test]
fn a_turn_the_user_stopped_does_not_notify() {
    let mut tracker = Tracker::default();
    tracker.observe(&started("t", "1"), PRODUCT, AWAY);
    let interrupted = notification(
        method::TURN_INTERRUPTED,
        json!({ "threadId": "t", "turnId": "1" }),
    );
    assert_eq!(tracker.observe(&interrupted, PRODUCT, AWAY), None);
    assert!(!tracker.working());

    tracker.observe(&started("t", "2"), PRODUCT, AWAY);
    assert_eq!(
        tracker.observe(
            &ended("t", "2", "failed", failure("interrupted"), ""),
            PRODUCT,
            AWAY
        ),
        None
    );
    assert_eq!(
        tracker.observe(
            &ended("t", "3", "interrupted", json!(null), ""),
            PRODUCT,
            AWAY
        ),
        None
    );
}

#[test]
fn an_approval_request_shows_risk_facts_and_never_the_command() {
    let mut tracker = Tracker::default();
    let request = approval("t", "1", "r1", json!("high"), json!(false));
    let notice = tracker.observe(&request, PRODUCT, AWAY).unwrap();
    assert_eq!(notice.kind, Kind::Approval);
    assert!(notice.body.contains("High risk"));
    assert!(notice.body.contains("Cannot be undone"));
    assert!(notice.body.contains(PRODUCT));
    for text in [&notice.title, &notice.body] {
        assert!(
            !text.contains("curl")
                && !text.contains("sk-secret")
                && !text.contains("secret detail")
        );
    }
    assert!(tracker.working());
    assert_eq!(tracker.observe(&request, PRODUCT, AWAY), None);

    let plain = tracker
        .observe(
            &approval("t", "1", "r2", json!(null), json!(null)),
            PRODUCT,
            AWAY,
        )
        .unwrap();
    assert_eq!(plain.body, format!("Open {PRODUCT} to review it."));
}

#[test]
fn a_question_notifies_under_the_approval_preference() {
    let mut tracker = Tracker::default();
    let question = notification(
        method::USER_INPUT_REQUESTED,
        json!({ "threadId": "t", "turnId": "1", "requestId": "q1", "question": "Which private repo?" }),
    );
    let muted = Policy {
        notify_approval: false,
        ..AWAY
    };
    let mut other = Tracker::default();
    assert_eq!(other.observe(&question, PRODUCT, muted), None);

    let notice = tracker.observe(&question, PRODUCT, AWAY).unwrap();
    assert_eq!(notice.kind, Kind::Question);
    assert!(!notice.body.contains("private repo"));
}

#[test]
fn a_focused_window_or_a_disabled_preference_suppresses_the_notice_and_it_is_not_replayed() {
    let mut tracker = Tracker::default();
    let focused = Policy {
        window_active: true,
        ..AWAY
    };
    tracker.observe(&started("t", "1"), PRODUCT, focused);
    let finished = ended("t", "1", "completed", json!(null), "");
    assert_eq!(tracker.observe(&finished, PRODUCT, focused), None);
    assert_eq!(tracker.observe(&finished, PRODUCT, AWAY), None);

    let off = Policy {
        notify_finished: false,
        ..AWAY
    };
    tracker.observe(&started("t", "2"), PRODUCT, off);
    assert_eq!(
        tracker.observe(&ended("t", "2", "completed", json!(null), ""), PRODUCT, off),
        None
    );
    assert!(!tracker.working());
}

#[test]
fn the_approval_preference_does_not_gate_finished_work_and_the_reverse() {
    let mut tracker = Tracker::default();
    let approvals_only = Policy {
        notify_finished: false,
        ..AWAY
    };
    assert!(tracker
        .observe(
            &approval("t", "1", "r", json!("low"), json!(true)),
            PRODUCT,
            approvals_only
        )
        .is_some());
    assert_eq!(
        tracker.observe(
            &ended("t", "1", "completed", json!(null), ""),
            PRODUCT,
            approvals_only
        ),
        None
    );
    let finished_only = Policy {
        notify_approval: false,
        ..AWAY
    };
    assert_eq!(
        tracker.observe(
            &approval("t", "2", "r", json!("low"), json!(true)),
            PRODUCT,
            finished_only
        ),
        None
    );
    assert!(tracker
        .observe(
            &ended("t", "2", "completed", json!(null), ""),
            PRODUCT,
            finished_only
        )
        .is_some());
}

#[test]
fn malformed_and_unrelated_notifications_are_ignored() {
    let mut tracker = Tracker::default();
    assert_eq!(
        tracker.observe(
            &notification(method::TURN_COMPLETED, json!({ "nope": 1 })),
            PRODUCT,
            AWAY
        ),
        None
    );
    assert_eq!(
        tracker.observe(
            &notification(method::TURN_OUTPUT_DELTA, json!({})),
            PRODUCT,
            AWAY
        ),
        None
    );
    assert!(!tracker.working());
}

#[test]
fn running_turns_are_tracked_per_thread_and_reset_on_demand() {
    let mut tracker = Tracker::default();
    tracker.observe(&started("a", "1"), PRODUCT, AWAY);
    tracker.observe(&started("b", "1"), PRODUCT, AWAY);
    tracker.observe(
        &ended("a", "1", "completed", json!(null), ""),
        PRODUCT,
        AWAY,
    );
    assert!(tracker.working());
    tracker.reset_local();
    assert!(!tracker.working());
}

#[test]
fn the_dedupe_window_is_bounded() {
    let mut tracker = Tracker::default();
    for index in 0..600 {
        let id = index.to_string();
        let request = approval("t", "1", &id, json!(null), json!(null));
        assert!(tracker.observe(&request, PRODUCT, AWAY).is_some());
    }
    let evicted = approval("t", "1", "0", json!(null), json!(null));
    assert!(tracker.observe(&evicted, PRODUCT, AWAY).is_some());
    let recent = approval("t", "1", "599", json!(null), json!(null));
    assert_eq!(tracker.observe(&recent, PRODUCT, AWAY), None);
}

#[test]
fn cloud_runs_notify_only_on_a_transition_seen_after_the_first_observation() {
    let mut tracker = Tracker::default();
    assert_eq!(
        tracker.observe_cloud("r1", AgentTaskState::Completed, PRODUCT, AWAY),
        None
    );
    assert_eq!(
        tracker.observe_cloud("r1", AgentTaskState::Completed, PRODUCT, AWAY),
        None
    );

    assert_eq!(
        tracker.observe_cloud("r2", AgentTaskState::Queued, PRODUCT, AWAY),
        None
    );
    assert_eq!(
        tracker.observe_cloud("r2", AgentTaskState::Running, PRODUCT, AWAY),
        None
    );
    let waiting = tracker
        .observe_cloud("r2", AgentTaskState::AwaitingApproval, PRODUCT, AWAY)
        .unwrap();
    assert_eq!(waiting.kind, Kind::Approval);
    assert_eq!(
        tracker.observe_cloud("r2", AgentTaskState::Running, PRODUCT, AWAY),
        None
    );
    assert!(tracker
        .observe_cloud("r2", AgentTaskState::AwaitingApproval, PRODUCT, AWAY)
        .is_some());
    let input = tracker
        .observe_cloud("r2", AgentTaskState::AwaitingInput, PRODUCT, AWAY)
        .unwrap();
    assert_eq!(input.kind, Kind::Question);
    let done = tracker
        .observe_cloud("r2", AgentTaskState::Completed, PRODUCT, AWAY)
        .unwrap();
    assert_eq!(done.kind, Kind::Finished);

    tracker.observe_cloud("r3", AgentTaskState::Running, PRODUCT, AWAY);
    let review = tracker
        .observe_cloud("r3", AgentTaskState::ReadyForReview, PRODUCT, AWAY)
        .unwrap();
    assert!(review.body.contains("review"));

    tracker.observe_cloud("r4", AgentTaskState::Running, PRODUCT, AWAY);
    for state in [
        AgentTaskState::Failed,
        AgentTaskState::TimedOut,
        AgentTaskState::Partial,
    ] {
        let notice = tracker.observe_cloud("r4", state, PRODUCT, AWAY).unwrap();
        assert_eq!(notice.kind, Kind::Failed);
    }

    tracker.observe_cloud("r5", AgentTaskState::Running, PRODUCT, AWAY);
    assert_eq!(
        tracker.observe_cloud("r5", AgentTaskState::Cancelled, PRODUCT, AWAY),
        None
    );
}

#[test]
fn cloud_notices_respect_focus_and_preferences() {
    let mut tracker = Tracker::default();
    tracker.observe_cloud("r", AgentTaskState::Running, PRODUCT, AWAY);
    let focused = Policy {
        window_active: true,
        ..AWAY
    };
    assert_eq!(
        tracker.observe_cloud("r", AgentTaskState::Completed, PRODUCT, focused),
        None
    );
    tracker.forget_cloud();
    tracker.observe_cloud("r", AgentTaskState::Running, PRODUCT, AWAY);
    let off = Policy {
        notify_finished: false,
        ..AWAY
    };
    assert_eq!(
        tracker.observe_cloud("r", AgentTaskState::Failed, PRODUCT, off),
        None
    );
}

#[test]
fn the_policy_reads_the_notification_preferences() {
    let mut preferences = Preferences::default();
    assert_eq!(
        Policy::new(&preferences, false),
        Policy {
            notify_finished: true,
            notify_approval: true,
            window_active: false,
        }
    );
    preferences.notify_when_work_finishes = false;
    preferences.notify_when_approval_needed = false;
    assert_eq!(
        Policy::new(&preferences, true),
        Policy {
            notify_finished: false,
            notify_approval: false,
            window_active: true,
        }
    );
}

#[test]
fn each_platform_holds_the_system_awake_through_its_own_tool() {
    let mac = hold_plan(Platform::MacOs, 4242, PRODUCT).unwrap();
    assert_eq!(mac.program, "caffeinate");
    assert_eq!(mac.args, ["-s", "-w", "4242"]);
    assert!(!mac.holds_stdin);

    let linux = hold_plan(Platform::Linux, 4242, PRODUCT).unwrap();
    assert_eq!(linux.program, "systemd-inhibit");
    assert!(linux.args.contains(&"--what=sleep".to_owned()));
    assert!(linux.args.contains(&format!("--who={PRODUCT}")));
    assert_eq!(linux.args.last().map(String::as_str), Some("cat"));
    assert!(linux.holds_stdin);

    let windows = hold_plan(Platform::Windows, 4242, PRODUCT).unwrap();
    assert_eq!(windows.program, "powershell.exe");
    assert!(windows
        .args
        .last()
        .unwrap()
        .contains("SetThreadExecutionState(2147483713)"));
    assert_eq!(2_147_483_713_u64, 0x8000_0000 | 0x1 | 0x40);
    assert!(windows.holds_stdin);

    assert_eq!(hold_plan(Platform::Other, 1, PRODUCT), None);
}

#[cfg(unix)]
fn process_exists(pid: u32) -> bool {
    std::process::Command::new("kill")
        .args(["-0", &pid.to_string()])
        .stderr(std::process::Stdio::null())
        .status()
        .unwrap()
        .success()
}

#[cfg(unix)]
#[test]
fn dropping_the_hold_ends_its_helper_process() {
    let plan = HoldPlan {
        program: "sleep".into(),
        args: vec!["60".into()],
        holds_stdin: false,
    };
    let mut hold = KeepAwake::start(&plan).unwrap();
    let pid = hold.id();
    assert!(hold.alive());
    assert!(process_exists(pid));
    drop(hold);
    assert!(!process_exists(pid));
}

#[cfg(unix)]
#[test]
fn a_stdin_hold_ends_when_the_hold_is_dropped() {
    let plan = HoldPlan {
        program: "cat".into(),
        args: Vec::new(),
        holds_stdin: true,
    };
    let mut hold = KeepAwake::start(&plan).unwrap();
    let pid = hold.id();
    assert!(hold.alive());
    drop(hold);
    assert!(!process_exists(pid));
}

#[cfg(unix)]
#[test]
fn a_helper_that_cannot_start_is_an_error_and_a_helper_that_exits_is_not_alive() {
    let missing = HoldPlan {
        program: "agiworkforce-no-such-helper".into(),
        args: Vec::new(),
        holds_stdin: false,
    };
    assert!(KeepAwake::start(&missing).is_err());

    let brief = HoldPlan {
        program: "true".into(),
        args: Vec::new(),
        holds_stdin: false,
    };
    let mut hold = KeepAwake::start(&brief).unwrap();
    let started = std::time::Instant::now();
    while hold.alive() {
        assert!(started.elapsed() < std::time::Duration::from_secs(5));
        std::thread::sleep(std::time::Duration::from_millis(10));
    }
}
