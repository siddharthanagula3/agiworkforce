//! Stub implementation for the `PostToolUse` hook event.
//!
//! This event fires after a tool has produced output so that hooks can
//! observe or log the result.

use std::path::PathBuf;

use agiworkforce_protocol::ThreadId;
use agiworkforce_protocol::protocol::HookCompletedEvent;
use agiworkforce_protocol::protocol::HookEventName;
use agiworkforce_protocol::protocol::HookRunSummary;
use agiworkforce_utils_absolute_path::AbsolutePathBuf;
use serde_json::Value;

use crate::engine::ConfiguredHandler;
use crate::engine::CommandShell;
use crate::engine::dispatcher;

/// Input payload passed to `PostToolUse` hook handlers.
#[derive(Debug, Clone)]
pub struct PostToolUseRequest {
    pub session_id: ThreadId,
    pub turn_id: String,
    pub cwd: AbsolutePathBuf,
    pub transcript_path: Option<PathBuf>,
    pub model: String,
    pub permission_mode: String,
    pub tool_name: String,
    pub matcher_aliases: Vec<String>,
    pub tool_use_id: String,
    pub tool_input: Value,
    pub tool_response: Value,
}

/// Outcome of running `PostToolUse` hook handlers.
#[derive(Debug, Clone)]
pub struct PostToolUseOutcome {
    pub hook_events: Vec<HookCompletedEvent>,
    /// Additional context strings to inject into the model's conversation.
    pub additional_contexts: Vec<String>,
    /// Whether execution should be stopped after this tool call.
    pub should_stop: bool,
    /// Feedback message to show when stopping or overriding the tool output.
    pub feedback_message: Option<String>,
    /// Reason for stopping, if different from the feedback message.
    pub stop_reason: Option<String>,
}

pub(crate) fn preview(
    handlers: &[ConfiguredHandler],
    request: &PostToolUseRequest,
) -> Vec<HookRunSummary> {
    dispatcher::select_handlers(
        handlers,
        HookEventName::PostToolUse,
        Some(&request.tool_name),
    )
    .into_iter()
    .map(|handler| dispatcher::running_summary(&handler))
    .collect()
}

pub(crate) async fn run(
    handlers: &[ConfiguredHandler],
    _shell: &CommandShell,
    request: PostToolUseRequest,
) -> PostToolUseOutcome {
    let matched = dispatcher::select_handlers(
        handlers,
        HookEventName::PostToolUse,
        Some(&request.tool_name),
    );

    if matched.is_empty() {
        return PostToolUseOutcome {
            hook_events: Vec::new(),
            additional_contexts: Vec::new(),
            should_stop: false,
            feedback_message: None,
            stop_reason: None,
        };
    }

    // Stub: no actual execution yet.
    let _ = request;
    PostToolUseOutcome {
        hook_events: Vec::new(),
        additional_contexts: Vec::new(),
        should_stop: false,
        feedback_message: None,
        stop_reason: None,
    }
}
