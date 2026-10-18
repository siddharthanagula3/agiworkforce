//! A turn of the chat loop that nobody is watching, such as a scheduled task
//! or a background run. It runs in a conversation of the run's own, and every
//! tool it calls clears the unattended approval gate instead of asking.

use std::future::Future;
use std::time::Duration;

use agiworkforce_model_registry::TrustMode;
use tauri::{AppHandle, Manager};

use crate::sys::commands::chat::state::{
    begin_unattended_turn, end_unattended_turn, request_stop, UnattendedProgress,
};
use crate::sys::commands::chat::{ChatExecutionMode, ChatSendMessageRequest};

const BYOK_REFUSED: &str =
    "A run nobody is watching works in Local or AGI Cloud mode, never on your own provider key.";

/// How an unattended turn ended.
#[derive(Debug, PartialEq, Eq)]
pub(crate) enum UnattendedTurnEnd {
    Answered(String),
    Failed(String),
    Stopped,
    TimedOut,
}

/// One unattended turn to run.
pub(crate) struct UnattendedTurn<'a> {
    pub(crate) prompt: &'a str,
    pub(crate) trust_mode: TrustMode,
    /// The folder file and terminal tools work in, when one is given.
    pub(crate) project_folder: Option<String>,
    pub(crate) time_limit: Option<Duration>,
    /// The run's conversation to continue in, or `None` to start a new one.
    pub(crate) conversation_id: Option<i64>,
    /// Updated before each tool call the turn makes, when given.
    pub(crate) progress: Option<tokio::sync::watch::Sender<UnattendedProgress>>,
}

/// How an unattended turn went.
pub(crate) struct UnattendedTurnOutcome {
    pub(crate) end: UnattendedTurnEnd,
    /// Every tool call the gate refused, in order.
    pub(crate) refusals: Vec<String>,
}

/// Runs one chat turn with nobody to ask. `stop` ends the turn early; so does
/// the turn's time limit when one is set.
pub(crate) async fn run_unattended_turn(
    app: &AppHandle,
    turn: UnattendedTurn<'_>,
    stop: impl Future<Output = ()>,
) -> UnattendedTurnOutcome {
    let time_limit = turn.time_limit;
    let progress = turn
        .progress
        .clone()
        .unwrap_or_else(|| tokio::sync::watch::channel(UnattendedProgress::default()).0);
    let request = match open_conversation(app, turn).await {
        Ok(request) => request,
        Err(reason) => return failed_to_start(reason),
    };
    let Some(conversation_id) = request.conversation_id else {
        return failed_to_start(NO_CONVERSATION.to_string());
    };
    begin_unattended_turn(conversation_id, progress);
    let end = run_in_conversation(app, conversation_id, request, time_limit, stop).await;
    UnattendedTurnOutcome {
        end,
        refusals: end_unattended_turn(conversation_id),
    }
}

fn failed_to_start(reason: String) -> UnattendedTurnOutcome {
    UnattendedTurnOutcome {
        end: UnattendedTurnEnd::Failed(reason),
        refusals: Vec::new(),
    }
}

/// Creates a run's conversation inside `trust_mode`, owned as the chat lists
/// it, so the run can record it before its first turn starts.
pub(crate) async fn open_run_conversation(
    app: &AppHandle,
    title: &str,
    trust_mode: TrustMode,
) -> Result<i64, String> {
    let execution_mode = execution_mode_for(trust_mode)?;
    let user_id = conversation_owner().await?;
    create_conversation(app, title, &user_id, execution_mode)
}

const NO_CONVERSATION: &str = "The task could not start its conversation.";

/// How much of an answer a run's record keeps.
const MAX_ANSWER_CHARS: usize = 16_000;

/// The answer as a run's record keeps it: trimmed, `None` when empty, and cut
/// at [`MAX_ANSWER_CHARS`].
pub(crate) fn bounded_answer(answer: &str) -> Option<String> {
    let answer = answer.trim();
    if answer.is_empty() {
        return None;
    }
    let mut chars = answer.chars();
    let bounded: String = chars.by_ref().take(MAX_ANSWER_CHARS).collect();
    if chars.next().is_some() {
        Some(format!("{bounded}\n\n… [output truncated]"))
    } else {
        Some(bounded)
    }
}

/// The task time limit set in Settings, or `None` when it is off.
pub(crate) async fn configured_task_time_limit(app: &AppHandle) -> Option<Duration> {
    let settings = app.try_state::<crate::sys::commands::settings::SettingsState>()?;
    let minutes = settings
        .settings
        .lock()
        .await
        .execution_preferences
        .as_ref()
        .map(|preferences| preferences.max_timeout_minutes)?;
    (minutes > 0).then(|| Duration::from_secs(u64::from(minutes) * 60))
}

fn execution_mode_for(trust_mode: TrustMode) -> Result<ChatExecutionMode, String> {
    match trust_mode {
        TrustMode::Local | TrustMode::OnDevice => Ok(ChatExecutionMode::LocalOnly),
        TrustMode::ManagedCloud => Ok(ChatExecutionMode::CloudManaged),
        TrustMode::Byok => Err(BYOK_REFUSED.to_string()),
    }
}

fn app_mode_for(execution_mode: ChatExecutionMode) -> &'static str {
    if execution_mode == ChatExecutionMode::CloudManaged {
        "cloud"
    } else {
        "local"
    }
}

/// The owner the chat sidebar lists the current session's conversations
/// under: the signed-in account, or this install's local account.
async fn conversation_owner() -> Result<String, String> {
    match crate::sys::account::signed_in_account_id() {
        Some(account_id) => Ok(account_id),
        None => crate::sys::commands::get_local_user_id().await,
    }
}

/// Opens the turn's conversation inside its trust boundary, creating one when
/// the turn does not continue an earlier one, and returns the request that
/// sends the prompt into it.
async fn open_conversation(
    app: &AppHandle,
    turn: UnattendedTurn<'_>,
) -> Result<ChatSendMessageRequest, String> {
    let UnattendedTurn {
        prompt,
        trust_mode,
        project_folder,
        conversation_id,
        ..
    } = turn;
    let execution_mode = execution_mode_for(trust_mode)?;
    let user_id = conversation_owner().await?;
    let conversation_id = match conversation_id {
        Some(conversation_id) => conversation_id,
        None => create_conversation(app, prompt, &user_id, execution_mode)?,
    };
    Ok(ChatSendMessageRequest {
        conversation_id: Some(conversation_id),
        user_id,
        content: prompt.to_string(),
        provider: None,
        model: Some("auto".to_string()),
        provider_override: None,
        model_override: None,
        stream: Some(false),
        enable_tools: Some(true),
        tool_scope: None,
        conversation_mode: None,
        focus_mode: None,
        research_task_id: None,
        attachments: None,
        thinking_mode: None,
        thinking_budget: None,
        reasoning_effort: None,
        output_config: None,
        temperature: None,
        max_output_tokens: None,
        prefer_cloud_credits: false,
        active_mode: Some(app_mode_for(execution_mode).to_string()),
        execution_mode: Some(execution_mode),
        frontend_message_id: None,
        custom_instructions: None,
        project_folder,
        model_capabilities: None,
        incognito: Some(false),
        temporary_history: None,
        auto_inject_skills: None,
    })
}

fn create_conversation(
    app: &AppHandle,
    prompt: &str,
    user_id: &str,
    execution_mode: ChatExecutionMode,
) -> Result<i64, String> {
    let db = app
        .try_state::<crate::sys::commands::AppDatabase>()
        .ok_or_else(|| NO_CONVERSATION.to_string())?;
    let conn = db.connection()?;
    crate::data::db::repository::create_conversation_with_execution_mode(
        &conn,
        prompt.chars().take(50).collect(),
        user_id.to_string(),
        app_mode_for(execution_mode),
        execution_mode.as_str(),
        None,
    )
    .map_err(|error| format!("{NO_CONVERSATION} {error}"))
}

async fn run_in_conversation(
    app: &AppHandle,
    conversation_id: i64,
    request: ChatSendMessageRequest,
    time_limit: Option<Duration>,
    stop: impl Future<Output = ()>,
) -> UnattendedTurnEnd {
    let turn = send(app, request);
    let deadline = async {
        match time_limit {
            Some(limit) => tokio::time::sleep(limit).await,
            None => std::future::pending().await,
        }
    };
    tokio::pin!(turn, stop, deadline);

    let end = tokio::select! {
        response = &mut turn => {
            return match response {
                Ok(content) => UnattendedTurnEnd::Answered(content),
                Err(reason) => UnattendedTurnEnd::Failed(reason),
            };
        }
        () = &mut stop => UnattendedTurnEnd::Stopped,
        () = &mut deadline => UnattendedTurnEnd::TimedOut,
    };
    // The gate is lifted only once the turn has ended, so no tool of this
    // turn runs after nobody is checking it.
    request_stop(Some(conversation_id));
    let _ = turn.await;
    end
}

fn managed<'a, T: Send + Sync + 'static>(
    app: &'a AppHandle,
    name: &str,
) -> Result<tauri::State<'a, T>, String> {
    app.try_state::<T>()
        .ok_or_else(|| format!("{name} is not ready, so the task could not run."))
}

async fn send(app: &AppHandle, request: ChatSendMessageRequest) -> Result<String, String> {
    let response = crate::sys::commands::chat_send_message(
        managed(app, "The history store")?,
        managed(app, "The model router")?,
        managed(app, "Settings")?,
        managed(app, "Billing")?,
        managed(app, "The connector service")?,
        managed(app, "The project context")?,
        managed(app, "Memory")?,
        managed(app, "Project memory")?,
        managed(app, "Research")?,
        app.clone(),
        request,
    )
    .await?;
    Ok(response.assistant_message.content)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn a_run_keeps_the_boundary_it_was_given_and_never_takes_a_provider_key() {
        assert_eq!(
            execution_mode_for(TrustMode::Local),
            Ok(ChatExecutionMode::LocalOnly)
        );
        assert_eq!(
            execution_mode_for(TrustMode::OnDevice),
            Ok(ChatExecutionMode::LocalOnly)
        );
        assert_eq!(
            execution_mode_for(TrustMode::ManagedCloud),
            Ok(ChatExecutionMode::CloudManaged)
        );
        assert_eq!(
            execution_mode_for(TrustMode::Byok),
            Err(BYOK_REFUSED.to_string())
        );
        assert_eq!(app_mode_for(ChatExecutionMode::CloudManaged), "cloud");
        assert_eq!(app_mode_for(ChatExecutionMode::LocalOnly), "local");
    }

    #[test]
    fn an_answer_is_kept_trimmed_and_bounded() {
        assert_eq!(bounded_answer("  \n "), None);
        assert_eq!(bounded_answer(" Done. "), Some("Done.".to_string()));

        let oversized = "x".repeat(MAX_ANSWER_CHARS + 1);
        let kept = bounded_answer(&oversized).expect("a long answer is kept");
        assert!(kept.ends_with("… [output truncated]"));
        assert!(kept.chars().count() < MAX_ANSWER_CHARS + 32);
    }
}
