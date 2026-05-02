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
    /// Streaming delta — emitted only when `--include-partial-messages` is set.
    StreamEvent(StreamEvent),
    /// Server-initiated request the embedder must respond to via
    /// `SdkInputMessage::ControlResponse`. Permission decisions, hook
    /// callbacks, MCP elicitations, MCP RPC forwards.
    ControlRequest(ControlRequest),
    /// Embedder-acknowledged cancellation of a still-pending control request.
    ControlCancelRequest { request_id: u64 },
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
    ThinkingDelta {
        session_id: String,
        delta: String,
    },
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

// ---------------------------------------------------------------------------
// Control channel — server-initiated requests the embedder must answer
// ---------------------------------------------------------------------------

#[derive(Debug, Clone, Serialize)]
#[serde(tag = "method", rename_all = "snake_case")]
pub(crate) enum ControlRequest {
    /// "May I run this tool?" — the embedder replies allow/deny + optional
    /// updated_input. Mirrors Claude Code's `can_use_tool` control request.
    CanUseTool {
        request_id: u64,
        tool_name: String,
        input: Value,
        tool_use_id: String,
        agent_id: Option<String>,
    },
    /// Hook event the embedder registered for. Reply with HookResult.
    HookCallback {
        request_id: u64,
        callback_id: String,
        hook_event: String,
        payload: Value,
    },
    /// An MCP server is asking the embedder for credentials, OAuth, a form fill, etc.
    Elicitation {
        request_id: u64,
        server: String,
        schema: Value,
    },
    /// Forward an MCP RPC message between the in-process MCP host and an
    /// out-of-process embedder-owned MCP server.
    McpMessage {
        request_id: u64,
        server: String,
        payload: Value,
    },
}

#[derive(Debug, Clone, Deserialize)]
#[serde(tag = "method", rename_all = "snake_case")]
pub(crate) enum ControlResponse {
    CanUseTool {
        request_id: u64,
        decision: PermissionDecision,
    },
    HookCallback {
        request_id: u64,
        result: HookResult,
    },
    Elicitation {
        request_id: u64,
        response: Value,
    },
    McpMessage {
        request_id: u64,
        payload: Value,
    },
}

#[derive(Debug, Clone, Deserialize)]
#[serde(tag = "behavior", rename_all = "snake_case")]
pub(crate) enum PermissionDecision {
    Allow {
        updated_input: Option<Value>,
        message: Option<String>,
    },
    Deny {
        reason: Option<String>,
    },
}

#[derive(Debug, Clone, Deserialize)]
#[serde(tag = "decision", rename_all = "snake_case")]
pub(crate) enum HookResult {
    Continue { modified_input: Option<Value> },
    Block { reason: Option<String> },
}

// ---------------------------------------------------------------------------
// Inbound messages — what an embedder writes to our stdin
// ---------------------------------------------------------------------------

#[derive(Debug, Clone, Deserialize)]
#[serde(tag = "type", rename_all = "snake_case")]
pub(crate) enum SdkInputMessage {
    /// New user turn for an existing or new session.
    User(UserInputMessage),
    /// Embedder reply to a previously-emitted `ControlRequest`.
    ControlResponse(ControlResponse),
    /// Embedder cancels a control request before we get the answer.
    ControlCancelRequest { request_id: u64 },
    /// Switch the active model mid-session. Subsequent turns use the new id.
    SetModel { model: String },
    /// Switch permission mode mid-session.
    SetPermissionMode {
        mode: crate::cli_options::PermissionMode,
    },
    /// Abort the current turn. Equivalent to ESC in the TUI.
    Interrupt { session_id: Option<String> },
    /// One-time setup sent right after the CLI starts. Registers hook
    /// callbacks, MCP servers, agents, system prompt overrides.
    Initialize(InitializePayload),
    /// Heartbeat from the embedder. We don't reply; we just keep stdin alive.
    KeepAlive,
}

#[derive(Debug, Clone, Deserialize)]
pub(crate) struct UserInputMessage {
    pub(crate) session_id: String,
    pub(crate) message: UserMessageBody,
    /// When this user message is itself the result of a tool-use chain
    /// initiated by another agent, this links it back to the parent.
    pub(crate) parent_tool_use_id: Option<String>,
}

#[derive(Debug, Clone, Deserialize)]
pub(crate) struct InitializePayload {
    pub(crate) hooks: Option<Value>,
    pub(crate) agents: Option<Value>,
    pub(crate) mcp_servers: Option<Value>,
    pub(crate) system_prompt: Option<String>,
    pub(crate) append_system_prompt: Option<String>,
}
