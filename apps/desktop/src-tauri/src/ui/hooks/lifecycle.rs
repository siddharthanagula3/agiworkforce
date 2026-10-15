//! The session, prompt, approval and goal events. Each one is raised here so
//! the chat, confirmation and agent code make a single call and cannot
//! disagree about when a session or a goal starts and ends.

use super::{emit_event, emit_event_sync, gating_registry, HookEvent, HookRegistry};
use crate::sys::security::tool_guard::ToolConfirmationRequest;
use serde_json::Value;
use std::collections::btree_map::Entry;
use std::collections::{BTreeMap, BTreeSet, HashMap};
use std::sync::{Mutex, MutexGuard};

const TEMPORARY_CHAT: &str = "temporary";

static ACTIVE_SESSIONS: Mutex<BTreeSet<String>> = Mutex::new(BTreeSet::new());
static ACTIVE_GOALS: Mutex<BTreeMap<String, GoalSummary>> = Mutex::new(BTreeMap::new());

struct GoalSummary {
    description: String,
    priority: String,
}

fn locked<T>(mutex: &Mutex<T>) -> MutexGuard<'_, T> {
    mutex
        .lock()
        .unwrap_or_else(|poisoned| poisoned.into_inner())
}

fn begin_session(session_id: &str) -> bool {
    locked(&ACTIVE_SESSIONS).insert(session_id.to_string())
}

fn finish_session(session_id: &str) -> bool {
    locked(&ACTIVE_SESSIONS).remove(session_id)
}

fn take_sessions() -> BTreeSet<String> {
    std::mem::take(&mut *locked(&ACTIVE_SESSIONS))
}

fn session_metadata(key: &str, value: &str) -> HashMap<String, Value> {
    HashMap::from([(key.to_string(), Value::String(value.to_string()))])
}

/// Runs the `UserPromptSubmit` hooks before the prompt is recorded or sent
/// and returns why they refuse it, or `None` to send.
///
/// A conversation becomes a session at its first prompt in this run of the
/// app, never when it is only opened to read. That first prompt waits for
/// the `SessionStart` hooks to finish, so a prompt hook always runs in a
/// session that has started and is told which one.
pub async fn user_prompt_submitted(conversation_id: i64, prompt: &str) -> Option<String> {
    match gating_registry().await {
        Ok(Some(registry)) => submit_prompt(&registry, conversation_id, prompt).await,
        Ok(None) => None,
        Err(refusal) => Some(refusal),
    }
}

async fn submit_prompt(
    registry: &HookRegistry,
    conversation_id: i64,
    prompt: &str,
) -> Option<String> {
    if let Some(refusal) = registry.gate_refusal().await {
        return Some(refusal);
    }
    let session_id = conversation_id.to_string();
    if begin_session(&session_id) {
        registry
            .emit_event_sync(HookEvent::session_start(
                session_id.clone(),
                session_metadata("source", "prompt"),
            ))
            .await;
    }
    registry
        .gate(HookEvent::user_prompt_submit(
            session_id.clone(),
            prompt.to_string(),
            Some(session_id),
        ))
        .await
}

/// The same gate for a Temporary chat, which keeps no conversation.
pub async fn temporary_prompt_submitted(prompt: &str) -> Option<String> {
    standalone_prompt_submitted(TEMPORARY_CHAT, prompt).await
}

/// The same gate for text a person wrote that reaches a model outside a
/// saved conversation: a Temporary chat, a goal, a research question, a
/// scheduled or triggered task. Its prompt hooks get a session id made for
/// this one prompt, prefixed with `source`, and no conversation id, and no
/// session is started or tracked for it.
pub async fn standalone_prompt_submitted(source: &str, prompt: &str) -> Option<String> {
    match gating_registry().await {
        Ok(Some(registry)) => submit_standalone_prompt(&registry, source, prompt).await,
        Ok(None) => None,
        Err(refusal) => Some(refusal),
    }
}

async fn submit_standalone_prompt(
    registry: &HookRegistry,
    source: &str,
    prompt: &str,
) -> Option<String> {
    registry
        .gate(HookEvent::user_prompt_submit(
            format!("{source}-{}", uuid::Uuid::new_v4()),
            prompt.to_string(),
            None,
        ))
        .await
}

/// The gate for a message steered into a running turn. A saved conversation
/// is judged in its own session; anything else has none to name.
pub async fn steered_prompt_submitted(
    conversation_id: Option<i64>,
    prompt: &str,
) -> Option<String> {
    match saved_conversation(conversation_id) {
        Some(id) => user_prompt_submitted(id, prompt).await,
        None => temporary_prompt_submitted(prompt).await,
    }
}

/// A Temporary chat runs under a reserved id that is not a conversation, so
/// it must never be given a session.
fn saved_conversation(conversation_id: Option<i64>) -> Option<i64> {
    conversation_id.filter(|id| *id > 0)
}

pub fn session_ended(conversation_id: i64, reason: &str) {
    let session_id = conversation_id.to_string();
    if finish_session(&session_id) {
        tauri::async_runtime::spawn(emit_event(HookEvent::session_end(
            session_id,
            session_metadata("reason", reason),
        )));
    }
}

/// Waits for each hook, unlike every other event: the process is about to
/// exit and a detached hook would be killed with it.
pub async fn end_all_sessions(reason: &str) {
    for session_id in take_sessions() {
        emit_event_sync(HookEvent::session_end(
            session_id,
            session_metadata("reason", reason),
        ))
        .await;
    }
}

/// One confirmation the user is being asked for, from the question to the
/// answer.
pub struct PendingApproval {
    approval_id: String,
    action: String,
    details: HashMap<String, Value>,
}

impl PendingApproval {
    pub async fn announce(request: &ToolConfirmationRequest) -> Self {
        let pending = Self {
            approval_id: request.request_id.clone(),
            action: request.tool_name.clone(),
            details: HashMap::from([
                (
                    "description".to_string(),
                    Value::String(request.tool_description.clone()),
                ),
                ("reason".to_string(), Value::String(request.reason.clone())),
                ("parameters".to_string(), request.parameters.clone()),
            ]),
        };
        emit_event(HookEvent::approval_required(
            pending.approval_id.clone(),
            pending.approval_id.clone(),
            pending.action.clone(),
            pending.details.clone(),
        ))
        .await;
        pending
    }

    /// An unanswered or failed confirmation runs nothing, so it is reported
    /// as denied.
    pub async fn resolve(self, approved: bool) {
        let session_id = self.approval_id.clone();
        let event = if approved {
            HookEvent::approval_granted(session_id, self.approval_id, self.action, self.details)
        } else {
            HookEvent::approval_denied(session_id, self.approval_id, self.action, self.details)
        };
        emit_event(event).await;
    }
}

fn begin_goal(goal_id: &str, payload: &Value) -> Option<HookEvent> {
    let description = payload
        .get("description")
        .and_then(Value::as_str)
        .unwrap_or_default()
        .to_string();
    let priority = match payload.get("priority") {
        Some(Value::String(priority)) => priority.clone(),
        Some(Value::Null) | None => "unspecified".to_string(),
        Some(other) => other.to_string(),
    };

    match locked(&ACTIVE_GOALS).entry(goal_id.to_string()) {
        Entry::Occupied(_) => None,
        Entry::Vacant(slot) => {
            slot.insert(GoalSummary {
                description: description.clone(),
                priority: priority.clone(),
            });
            Some(HookEvent::goal_start(
                goal_id.to_string(),
                goal_id.to_string(),
                description,
                priority,
            ))
        }
    }
}

fn finish_goal(goal_id: &str, outcome: Result<Value, String>) -> Option<HookEvent> {
    let goal = locked(&ACTIVE_GOALS).remove(goal_id)?;
    Some(match outcome {
        Ok(result) => HookEvent::goal_completed(
            goal_id.to_string(),
            goal_id.to_string(),
            goal.description,
            goal.priority,
            result,
        ),
        Err(error) => HookEvent::goal_error(
            goal_id.to_string(),
            goal_id.to_string(),
            goal.description,
            goal.priority,
            error,
        ),
    })
}

fn payload_text(payload: &Value, key: &str, fallback: &str) -> String {
    payload
        .get(key)
        .and_then(Value::as_str)
        .unwrap_or(fallback)
        .to_string()
}

/// Translates the agent engine's own goal events. A goal that started gets
/// exactly one `GoalCompleted` or `GoalError`: the first ending wins, and a
/// goal that is cleaned up without one ran its plan to the end.
fn goal_hook_event(event: &str, payload: &Value) -> Option<HookEvent> {
    let goal_id = payload.get("goal_id").and_then(Value::as_str)?;
    match event {
        "agi:goal:submitted" | "agi:goal:parallel_submitted" | "agi:goal:swarm_submitted" => {
            begin_goal(goal_id, payload)
        }
        "agi:goal:achieved" | "agi:goal:cleanup" => finish_goal(goal_id, Ok(payload.clone())),
        "agi:goal:parallel_best_result" | "agi:goal:swarm_completed" => {
            if payload.get("success").and_then(Value::as_bool) == Some(true) {
                finish_goal(goal_id, Ok(payload.clone()))
            } else {
                finish_goal(
                    goal_id,
                    Err(payload_text(payload, "error", "The agents did not succeed")),
                )
            }
        }
        "agi:goal:error" => finish_goal(
            goal_id,
            Err(payload_text(payload, "error", "The goal failed")),
        ),
        "agi:goal:timeout" => finish_goal(goal_id, Err("The goal timed out".to_string())),
        "agi:goal:max_iterations" => finish_goal(
            goal_id,
            Err("The goal reached its iteration limit".to_string()),
        ),
        "agi:goal:unachievable" => finish_goal(
            goal_id,
            Err(payload_text(
                payload,
                "final_insight",
                "The goal was judged unachievable",
            )),
        ),
        "agi:goal:cancelled" => finish_goal(goal_id, Err("The goal was cancelled".to_string())),
        _ => None,
    }
}

pub fn agent_event(event: &str, payload: &Value) {
    if let Some(hook_event) = goal_hook_event(event, payload) {
        tauri::async_runtime::spawn(emit_event(hook_event));
    }
}

#[cfg(test)]
mod tests {
    use super::super::types::{EventContext, HookEventType};
    use super::*;
    use serde_json::json;

    fn goal_event(event: &str, payload: Value) -> Option<HookEvent> {
        goal_hook_event(event, &payload)
    }

    #[test]
    fn a_session_starts_once_and_ends_once() {
        assert!(begin_session("lifecycle-session-a"));
        assert!(!begin_session("lifecycle-session-a"));
        assert!(finish_session("lifecycle-session-a"));
        assert!(!finish_session("lifecycle-session-a"));
    }

    #[test]
    fn a_submitted_goal_starts_once_and_carries_its_description() {
        let payload = json!({
            "goal_id": "lifecycle-goal-start",
            "description": "Tidy the downloads folder",
            "priority": "High",
        });

        let started = goal_event("agi:goal:submitted", payload.clone()).expect("goal start");
        assert_eq!(started.event_type, HookEventType::GoalStart);
        match started.context {
            EventContext::Goal {
                goal_id,
                description,
                priority,
                ..
            } => {
                assert_eq!(goal_id, "lifecycle-goal-start");
                assert_eq!(description, "Tidy the downloads folder");
                assert_eq!(priority, "High");
            }
            other => panic!("expected a goal context, got {other:?}"),
        }
        assert!(goal_event("agi:goal:submitted", payload).is_none());
        assert!(goal_event(
            "agi:goal:cleanup",
            json!({ "goal_id": "lifecycle-goal-start" })
        )
        .is_some());
    }

    #[test]
    fn the_first_ending_wins_and_cleanup_adds_nothing() {
        let id = "lifecycle-goal-error";
        goal_event("agi:goal:submitted", json!({ "goal_id": id })).expect("goal start");

        let failed = goal_event(
            "agi:goal:error",
            json!({ "goal_id": id, "error": "disk full" }),
        )
        .expect("goal error");
        assert_eq!(failed.event_type, HookEventType::GoalError);
        match failed.context {
            EventContext::Goal { error, .. } => assert_eq!(error.as_deref(), Some("disk full")),
            other => panic!("expected a goal context, got {other:?}"),
        }
        assert!(goal_event("agi:goal:cleanup", json!({ "goal_id": id })).is_none());
    }

    #[test]
    fn a_goal_that_runs_its_plan_out_completes_at_cleanup() {
        let id = "lifecycle-goal-cleanup";
        goal_event("agi:goal:submitted", json!({ "goal_id": id })).expect("goal start");

        let completed = goal_event("agi:goal:cleanup", json!({ "goal_id": id })).expect("ending");
        assert_eq!(completed.event_type, HookEventType::GoalCompleted);
    }

    #[test]
    fn a_cancelled_or_unsuccessful_goal_is_an_error() {
        let cancelled = "lifecycle-goal-cancelled";
        goal_event("agi:goal:submitted", json!({ "goal_id": cancelled })).expect("goal start");
        let event = goal_event("agi:goal:cancelled", json!({ "goal_id": cancelled })).expect("end");
        assert_eq!(event.event_type, HookEventType::GoalError);

        let swarm = "lifecycle-goal-swarm";
        goal_event("agi:goal:swarm_submitted", json!({ "goal_id": swarm })).expect("goal start");
        let event = goal_event(
            "agi:goal:swarm_completed",
            json!({ "goal_id": swarm, "success": false }),
        )
        .expect("end");
        assert_eq!(event.event_type, HookEventType::GoalError);
    }

    #[test]
    fn an_ending_for_a_goal_that_never_started_fires_nothing() {
        assert!(goal_event(
            "agi:goal:achieved",
            json!({ "goal_id": "lifecycle-goal-unknown" })
        )
        .is_none());
        assert!(goal_event(
            "agi:goal:progress",
            json!({ "goal_id": "lifecycle-goal-unknown" })
        )
        .is_none());
        assert!(goal_event("agi:goal:submitted", json!({})).is_none());
    }

    #[cfg(unix)]
    fn unsandboxed_registry() -> HookRegistry {
        HookRegistry {
            executor: std::sync::Arc::new(super::super::HookExecutor::unsandboxed()),
            config_path: std::env::temp_dir().join("lifecycle-test-hooks.yaml"),
            gate_refusal: tokio::sync::RwLock::new(None),
        }
    }

    #[cfg(unix)]
    fn hook(name: &str, event: HookEventType, command: &str) -> super::super::Hook {
        super::super::Hook {
            name: name.to_string(),
            events: vec![event],
            priority: 50,
            command: command.to_string(),
            enabled: true,
            timeout_secs: 10,
            env: HashMap::new(),
            working_dir: None,
            continue_on_error: true,
        }
    }

    #[cfg(unix)]
    #[tokio::test]
    async fn a_temporary_chat_prompt_is_gated_with_a_session_id_of_its_own() {
        let registry = unsandboxed_registry();
        registry
            .executor()
            .add_hook(hook(
                "prompt",
                HookEventType::UserPromptSubmit,
                "echo \"session $HOOK_SESSION_ID\" >&2; exit 2",
            ))
            .await
            .unwrap();

        let first = submit_standalone_prompt(&registry, TEMPORARY_CHAT, "hello")
            .await
            .expect("a Temporary chat must not bypass a blocking prompt hook");
        let second = submit_standalone_prompt(&registry, TEMPORARY_CHAT, "hello")
            .await
            .expect("blocked again");

        assert!(first.starts_with("session temporary-"), "{first}");
        assert_ne!(first, second, "each prompt gets its own transient id");
    }

    #[test]
    fn a_steer_in_a_temporary_chat_is_not_given_a_conversation_session() {
        assert_eq!(saved_conversation(Some(42)), Some(42));
        assert_eq!(saved_conversation(Some(-1)), None);
        assert_eq!(saved_conversation(Some(0)), None);
        assert_eq!(saved_conversation(None), None);
    }

    #[cfg(unix)]
    #[tokio::test]
    async fn a_goal_or_a_scheduled_task_is_gated_under_the_name_of_where_it_came_from() {
        let registry = unsandboxed_registry();
        registry
            .executor()
            .add_hook(hook(
                "prompt",
                HookEventType::UserPromptSubmit,
                "echo \"session $HOOK_SESSION_ID\" >&2; exit 2",
            ))
            .await
            .unwrap();

        for source in ["goal", "scheduled", "trigger", "research"] {
            let refusal = submit_standalone_prompt(&registry, source, "ship it")
                .await
                .expect("text a person wrote must not reach a model past a blocking prompt hook");
            assert!(
                refusal.starts_with(&format!("session {source}-")),
                "{refusal}"
            );
        }
    }

    #[cfg(unix)]
    #[tokio::test]
    async fn waiting_guards_refuse_a_prompt_before_any_session_starts() {
        let registry = unsandboxed_registry();
        registry
            .executor()
            .add_hook(hook("start", HookEventType::SessionStart, "true"))
            .await
            .unwrap();
        registry
            .set_gate_refusal(Some("Hooks are waiting for your approval".to_string()))
            .await;

        let refusal = submit_prompt(&registry, 987_654_322, "hello").await;

        assert_eq!(
            refusal.as_deref(),
            Some("Hooks are waiting for your approval")
        );
        assert!(registry.executor().get_stats("start").await.is_none());
        assert!(!finish_session("987654322"), "no session may have started");
        assert_eq!(
            submit_standalone_prompt(&registry, TEMPORARY_CHAT, "hello")
                .await
                .as_deref(),
            Some("Hooks are waiting for your approval")
        );
    }

    #[cfg(unix)]
    #[tokio::test]
    async fn a_first_prompt_runs_after_session_start_and_is_told_its_session() {
        let registry = unsandboxed_registry();
        let executor = registry.executor();
        executor
            .add_hook(hook("start", HookEventType::SessionStart, "sleep 0.3"))
            .await
            .unwrap();
        executor
            .add_hook(hook(
                "prompt",
                HookEventType::UserPromptSubmit,
                "echo \"session $HOOK_SESSION_ID\" >&2; exit 2",
            ))
            .await
            .unwrap();

        let refusal = submit_prompt(&registry, 987_654_321, "hello").await;

        assert_eq!(refusal.as_deref(), Some("session 987654321"));
        let started = executor.get_stats("start").await.expect("SessionStart ran");
        let prompted = executor
            .get_stats("prompt")
            .await
            .expect("UserPromptSubmit ran");
        assert!(
            started.last_execution <= prompted.last_execution,
            "the session must have started before the prompt hook ran"
        );

        submit_prompt(&registry, 987_654_321, "again").await;
        let started = executor.get_stats("start").await.expect("SessionStart ran");
        assert_eq!(started.total_executions, 1, "a session starts once");
        assert!(finish_session("987654321"));
    }
}
