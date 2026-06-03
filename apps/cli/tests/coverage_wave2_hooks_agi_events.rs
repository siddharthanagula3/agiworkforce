/// Coverage wave 2 — AGI-exclusive hook event round-trip.
///
/// Exercises the deserialize → matcher → run path for every AGI-exclusive
/// event variant that has zero test coverage:
///   CronTriggered, WebhookReceived, FileChanged, DaemonStarted, DaemonStopped,
///   PostToolBatch, TeammateIdle, Setup, WorktreeCreate, WorktreeRemove,
///   Elicitation, ElicitationResult.
///
/// Strategy: for each event, build a HooksConfig with a no-op `echo ok` hook
/// keyed to the event's string name, call run_hooks(), and assert that at
/// least one HookResult came back — proving the event-name string maps to the
/// right HookEvent variant, the hook matcher accepts the input, and the
/// executor fires the command.
use std::collections::HashMap;

use agiworkforce_cli::hooks::{run_hooks, Hook, HookEvent, HookInput, HooksConfig};

// ---------------------------------------------------------------------------
// Helper — build a HooksConfig wired to a single no-op echo hook.
// The command is `true` (POSIX no-op, zero exit) so the test works on all
// platforms and the result will have success=true.
// ---------------------------------------------------------------------------
fn config_for_event(event_name: &str) -> HooksConfig {
    let hook = Hook {
        command: "true".to_string(),
        args: vec![],
        timeout: 5,
        blocking: false,
        matcher: None,
        if_condition: None,
    };
    let mut hooks = HashMap::new();
    hooks.insert(event_name.to_string(), vec![hook]);
    HooksConfig { hooks }
}

fn minimal_input(event_name: &str) -> HookInput {
    HookInput {
        event: event_name.to_string(),
        session_id: None,
        model: None,
        tool_name: None,
        tool_args: None,
        tool_output: None,
        message: None,
        tool_execution: None,
    }
}

// Macro to generate a tokio test per AGI-exclusive event, reducing boilerplate
// while keeping each test independently named in the output.
macro_rules! agi_event_fires {
    ($test_name:ident, $variant:expr, $name_str:literal) => {
        #[tokio::test]
        async fn $test_name() {
            let config = config_for_event($name_str);
            let input = minimal_input($name_str);
            let results = run_hooks(&config, $variant, &input).await;
            assert!(
                !results.is_empty(),
                "run_hooks() returned no results for {} — the event name failed to \
                 match any hook entry (deserialize→match→run round-trip broken)",
                $name_str
            );
            // The `true` command must succeed.
            assert!(
                results[0].success,
                "hook for {} ran but exited with failure — expected `true` to succeed",
                $name_str
            );
        }
    };
}

agi_event_fires!(
    cron_triggered_fires,
    HookEvent::CronTriggered,
    "CronTriggered"
);
agi_event_fires!(
    webhook_received_fires,
    HookEvent::WebhookReceived,
    "WebhookReceived"
);
agi_event_fires!(file_changed_fires, HookEvent::FileChanged, "FileChanged");
agi_event_fires!(
    daemon_started_fires,
    HookEvent::DaemonStarted,
    "DaemonStarted"
);
agi_event_fires!(
    daemon_stopped_fires,
    HookEvent::DaemonStopped,
    "DaemonStopped"
);
agi_event_fires!(
    post_tool_batch_fires,
    HookEvent::PostToolBatch,
    "PostToolBatch"
);
agi_event_fires!(teammate_idle_fires, HookEvent::TeammateIdle, "TeammateIdle");
agi_event_fires!(setup_fires, HookEvent::Setup, "Setup");
agi_event_fires!(
    worktree_create_fires,
    HookEvent::WorktreeCreate,
    "WorktreeCreate"
);
agi_event_fires!(
    worktree_remove_fires,
    HookEvent::WorktreeRemove,
    "WorktreeRemove"
);
agi_event_fires!(elicitation_fires, HookEvent::Elicitation, "Elicitation");
agi_event_fires!(
    elicitation_result_fires,
    HookEvent::ElicitationResult,
    "ElicitationResult"
);
