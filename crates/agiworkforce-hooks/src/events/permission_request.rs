//! Stub implementation for the `PermissionRequest` hook event.
//!
//! This event fires when Agiworkforce requests user approval for a tool action.
//! The hook can respond with `Allow` or `Deny` to override the default behaviour.

use std::path::PathBuf;

use agiworkforce_protocol::ThreadId;
use agiworkforce_protocol::protocol::HookCompletedEvent;
use agiworkforce_protocol::protocol::HookEventName;
use agiworkforce_protocol::protocol::HookRunSummary;
use serde_json::Value;

use crate::engine::ConfiguredHandler;
use crate::engine::CommandShell;
use crate::engine::dispatcher;

/// The decision returned by a `PermissionRequest` hook handler.
#[derive(Debug, Clone, PartialEq)]
pub enum PermissionRequestDecision {
    /// Allow the tool call to proceed without user confirmation.
    Allow,
    /// Deny the tool call with an optional explanatory message.
    Deny { message: Option<String> },
}

/// Input payload passed to `PermissionRequest` hook handlers.
#[derive(Debug, Clone)]
pub struct PermissionRequestRequest {
    pub session_id: ThreadId,
    pub turn_id: String,
    pub cwd: PathBuf,
    pub transcript_path: Option<PathBuf>,
    pub model: String,
    pub permission_mode: String,
    pub tool_name: String,
    pub matcher_aliases: Vec<String>,
    pub run_id_suffix: String,
    pub tool_input: Value,
}

/// Outcome of running `PermissionRequest` hook handlers.
#[derive(Debug)]
pub struct PermissionRequestOutcome {
    pub hook_events: Vec<HookCompletedEvent>,
    pub decision: Option<PermissionRequestDecision>,
}

pub(crate) fn preview(
    handlers: &[ConfiguredHandler],
    request: &PermissionRequestRequest,
) -> Vec<HookRunSummary> {
    dispatcher::select_handlers(
        handlers,
        HookEventName::PermissionRequest,
        Some(&request.tool_name),
    )
    .into_iter()
    .map(|handler| dispatcher::running_summary(&handler))
    .collect()
}

pub(crate) async fn run(
    handlers: &[ConfiguredHandler],
    _shell: &CommandShell,
    request: PermissionRequestRequest,
) -> PermissionRequestOutcome {
    let matched = dispatcher::select_handlers(
        handlers,
        HookEventName::PermissionRequest,
        Some(&request.tool_name),
    );

    if matched.is_empty() {
        return PermissionRequestOutcome {
            hook_events: Vec::new(),
            decision: None,
        };
    }

    // Stub: no actual execution yet. Return no decision so the default flow applies.
    let _ = request;
    PermissionRequestOutcome {
        hook_events: Vec::new(),
        decision: None,
    }
}
