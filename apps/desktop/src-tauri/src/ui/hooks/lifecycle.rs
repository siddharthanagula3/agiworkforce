//! The session, prompt and approval events. Each one is raised here so the
//! chat and confirmation code make a single call and cannot disagree about
//! when a session starts and ends.

use super::{emit_event, emit_event_sync, gating_registry, HookEvent, HookRegistry};
use crate::sys::security::tool_guard::ToolConfirmationRequest;
use serde_json::Value;
use std::collections::{BTreeSet, HashMap};
use std::sync::{Mutex, MutexGuard};

const TEMPORARY_CHAT: &str = "temporary";

static ACTIVE_SESSIONS: Mutex<BTreeSet<String>> = Mutex::new(BTreeSet::new());

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

#[cfg(test)]
mod tests {
    #[cfg(unix)]
    use super::super::types::HookEventType;
    use super::*;

    #[test]
    fn a_session_starts_once_and_ends_once() {
        assert!(begin_session("lifecycle-session-a"));
        assert!(!begin_session("lifecycle-session-a"));
        assert!(finish_session("lifecycle-session-a"));
        assert!(!finish_session("lifecycle-session-a"));
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
