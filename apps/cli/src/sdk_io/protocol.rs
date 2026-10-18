//! Stream-JSON event schema. Re-implemented from the public shape of
//! `@anthropic-ai/claude-agent-sdk`'s wire protocol so an embedder built
//! against that SDK can swap in `@agiworkforce/agent-sdk` and keep working
//! against this CLI.
//!
//! All envelopes carry a `type` discriminator (serde `tag = "type"`) so a
//! consumer can switch on the string without first deserializing the payload.

use serde::{Deserialize, Serialize};
use serde_json::Value;

/// Outbound: an event the CLI emits on stdout, one per line.
#[derive(Debug, Clone, Serialize)]
#[serde(tag = "type", rename_all = "snake_case")]
pub(crate) enum SdkEvent {
    /// Echo of an inbound user message after the CLI has accepted it. Useful
    /// for embedders that drive multiple sessions and want a single source of
    /// truth for what got into the transcript.
    UserMessage {
        session_id: String,
        message: UserMessageBody,
    },
    /// A finalized assistant turn: the model's text + any tool_use blocks.
    AssistantMessage(AssistantMessageEvent),
    /// Result of executing a tool the model requested.
    ToolResult(ToolResultEvent),
    /// Incremental assistant text and tool-use lifecycle output.
    StreamEvent(StreamEvent),
    /// Non-fatal status: budget exhausted, max turns reached, manual interrupt.
    StatusUpdate(StatusUpdateEvent),
    /// Fatal error that terminated the turn or session.
    Error(ErrorEvent),
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub(crate) struct UserMessageBody {
    pub(crate) role: String,
    pub(crate) content: Value,
}

#[derive(Debug, Clone, Serialize)]
pub(crate) struct AssistantMessageEvent {
    pub(crate) session_id: String,
    pub(crate) message_id: String,
    pub(crate) model: String,
    /// `text`, `tool_use`, `thinking` blocks in the order the model produced them.
    pub(crate) content: Value,
    pub(crate) stop_reason: Option<String>,
    pub(crate) input_tokens: u32,
    pub(crate) output_tokens: u32,
}

#[derive(Debug, Clone, Serialize)]
pub(crate) struct ToolResultEvent {
    pub(crate) session_id: String,
    pub(crate) tool_use_id: String,
    pub(crate) tool_name: String,
    pub(crate) is_error: bool,
    pub(crate) content: Value,
}

#[derive(Debug, Clone, Serialize)]
#[serde(tag = "subtype", rename_all = "snake_case")]
pub(crate) enum StreamEvent {
    /// A text delta from the assistant. Concatenate to build progressive UI.
    TextDelta {
        session_id: String,
        message_id: String,
        delta: String,
    },
    /// A tool-use block has begun. Embedders rendering an "Agent is calling X…"
    /// affordance flip on here and off on the matching `ToolResult`.
    ToolUseStart {
        session_id: String,
        tool_use_id: String,
        tool_name: String,
    },
    /// Thinking-block delta, when extended-thinking betas are enabled.
    ThinkingDelta { session_id: String, delta: String },
}

#[derive(Debug, Clone, Serialize)]
pub(crate) struct StatusUpdateEvent {
    pub(crate) session_id: String,
    pub(crate) reason: StatusUpdateReason,
    pub(crate) detail: Option<String>,
}

#[derive(Debug, Clone, Copy, Serialize)]
#[serde(rename_all = "snake_case")]
pub(crate) enum StatusUpdateReason {
    SessionStart,
    SessionEnd,
    BudgetExhausted,
    MaxTurnsReached,
    Interrupted,
    Compacted,
}

#[derive(Debug, Clone, Serialize)]
pub(crate) struct ErrorEvent {
    pub(crate) session_id: Option<String>,
    pub(crate) code: String,
    pub(crate) message: String,
}
