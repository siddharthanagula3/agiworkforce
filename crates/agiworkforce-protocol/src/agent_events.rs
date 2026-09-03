
use schemars::JsonSchema;
use serde::Deserialize;
use serde::Serialize;
use ts_rs::TS;

use crate::task_state::AgentTaskStateChanged;

/// Current wire version for [`AgentEventEnvelope`]. Bump on any
/// backward-incompatible change to the envelope or [`AgentEvent`] shape,
/// mirroring `developer_session::DEVELOPER_SESSION_PROTOCOL_VERSION`'s
/// precedent for a crate-level protocol version constant.
pub const AGENT_EVENT_SCHEMA_VERSION: u32 = 4;

/// The one envelope web SSE chunks, app-server `turn/*` notifications, and
/// desktop stream events all translate into. Mirrors this crate's existing
/// `protocol::Event { id, msg: EventMsg }` shape (metadata fields alongside
/// one nested discriminated payload) rather than flattening the payload
/// into the envelope, so envelope metadata and event-payload field names
/// can never collide.
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, JsonSchema, TS)]
#[serde(rename_all = "camelCase")]
#[ts(rename_all = "camelCase")]
pub struct AgentEventEnvelope {
    /// See [`AGENT_EVENT_SCHEMA_VERSION`].
    pub schema_version: u32,
    pub session_id: String,
    /// Turn identity, same `String` rationale as `session_id` (app-server's
    /// real wire `turnId` is a JSON string; `developer_host.rs` formats a
    /// `Uuid` to `String` before ever putting it on the wire).
    pub turn_id: String,
    #[ts(type = "number")]
    pub sequence: u64,
    /// Wall-clock emission time, Unix epoch milliseconds. Millisecond (not
    /// second) resolution deliberately, unlike `protocol.rs`'s existing
    /// turn-level timestamps (`TurnCompleteEvent.completed_at`, etc.):
    /// those mark one event per turn, but a turn can emit hundreds of
    /// `AgentEventEnvelope`s per second while streaming, where
    /// second-granularity timestamps would collapse most of them together.
    #[ts(type = "number")]
    pub emitted_at_ms: i64,
    pub event: AgentEvent,
}

/// The discriminated event union. See the module doc for which three real
/// dialects justify this variant set and which StreamChunk variants were
/// deliberately left out.
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, JsonSchema, TS)]
#[serde(tag = "type", rename_all = "kebab-case")]
#[ts(tag = "type")]
pub enum AgentEvent {
    /// Visible model output text, incremental. Direct analog of
    /// `StreamChunkText` (`type: 'text-delta'`), app-server's
    /// `turn/output_delta` notification (`{ delta: chunk }`,
    /// `developer_host.rs:1071`), and desktop's `StreamChunk.content`
    /// (`sse_parser.rs`: "The text content of this SSE chunk").
    TextDelta(AgentEventTextDelta),
    ReasoningDelta(AgentEventReasoningDelta),
    /// A caller-executed tool call started. Analog of
    /// `StreamChunkToolUseStart` (`toolUseId`, `name`; `vendorIndex` and
    /// `logprobs` are wire-reconstruction-only fields per that type's own
    /// docstring, not carried here) and desktop's `StreamingToolCall`
    /// (`id`, `name`, accumulated across chunks in `sse_parser.rs`).
    ToolUseStart(AgentEventToolUseStart),
    ToolUseDelta(AgentEventToolUseDelta),
    /// A caller-executed tool call's arguments are complete. Analog of
    /// `StreamChunkToolUseEnd`. App-server does not emit a dedicated
    /// end-of-tool-call notification today, but the CLI's own internal
    /// `EventMsg::McpToolCallEnd` (`protocol.rs`) proves the same
    /// begin/end pairing concept already exists in this crate for its MCP
    /// tool-call dialect.
    ToolUseEnd(AgentEventToolUseEnd),
    ServerToolUse(AgentEventServerToolUse),
    ServerToolResult(AgentEventServerToolResult),
    /// Token usage. Analog of `StreamChunkUsage` (all six fields carried
    /// through unchanged) and compatible with desktop's `TokenUsage`
    /// (`prompt_tokens`/`completion_tokens`/`cache_read_input_tokens`/
    /// `cache_creation_input_tokens`) and app-server's `turn/completed`
    /// `inputTokens`/`outputTokens` (both `u32` there too).
    Usage(AgentEventUsage),
    Error(AgentEventError),
    Stop(AgentEventStop),
    /// A stream-lifecycle signal that is neither content nor a terminal
    /// stop. See [`AgentEventLifecyclePhase`].
    Lifecycle(AgentEventLifecycle),
    /// A concise, user-displayable description of what the agent is doing.
    /// This is NOT private model chain-of-thought: emitters must provide a
    /// deliberately authored progress summary suitable for an inline,
    /// expandable activity timeline.
    ProgressUpdate(AgentEventProgressUpdate),
    /// Caller-managed tool execution began after the model's arguments were
    /// assembled (and, when required, approved). Unlike `ToolUseStart`, which
    /// describes the model constructing a tool call, this event represents
    /// the real execution lifecycle shown to the user.
    ToolExecutionStart(AgentEventToolExecutionStart),
    /// Caller-managed tool execution ended with its structured result.
    ToolExecutionEnd(AgentEventToolExecutionEnd),
    /// Web or document sources discovered by a tool invocation.
    SourceList(AgentEventSourceList),
    /// A privileged, destructive, external, or expensive action is suspended
    /// awaiting an explicit user decision.
    ApprovalRequested(AgentEventApprovalRequested),
    /// The explicit decision for a prior approval request.
    ApprovalResolved(AgentEventApprovalResolved),
    /// A model-driven connector/MCP tool call paused with `input_required`
    /// (MCP 2026-07-28): the remote server needs additional, bounded input
    /// before the same call can continue. The run stays resumable; the host
    /// collects the requested input and resumes the identical call.
    InputRequested(AgentEventInputRequested),
    /// The outcome of a prior [`AgentEventInputRequested`]: the caller either
    /// supplied the requested input or cancelled the paused call.
    InputResolved(AgentEventInputResolved),
    /// A durable file or rich artifact was produced and is ready to preview or
    /// download.
    ArtifactProduced(AgentEventArtifactProduced),
    /// Long-running context was summarized and compacted without ending the
    /// run.
    ContextCompacted(AgentEventContextCompacted),
    /// The engine moved a durable task to a canonical lifecycle state. This
    /// drives Cowork/Dispatch cards and semantic task filters without clients
    /// reverse-engineering state from prose, tool rows, or transport status.
    TaskStateChanged(AgentTaskStateChanged),
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, JsonSchema, TS)]
#[serde(rename_all = "camelCase")]
#[ts(rename_all = "camelCase")]
pub struct AgentEventTextDelta {
    pub delta: String,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, JsonSchema, TS)]
#[serde(rename_all = "camelCase")]
#[ts(rename_all = "camelCase")]
pub struct AgentEventReasoningDelta {
    pub delta: String,
    /// Anthropic extended-thinking signature for verifying the reasoning
    /// block, when the provider supplies one. See
    /// `StreamChunkThinking.signature`.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    #[ts(optional)]
    pub signature: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, JsonSchema, TS)]
#[serde(rename_all = "camelCase")]
#[ts(rename_all = "camelCase")]
pub struct AgentEventToolUseStart {
    pub tool_use_id: String,
    pub name: String,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, JsonSchema, TS)]
#[serde(rename_all = "camelCase")]
#[ts(rename_all = "camelCase")]
pub struct AgentEventToolUseDelta {
    pub tool_use_id: String,
    pub delta_json: String,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, JsonSchema, TS)]
#[serde(rename_all = "camelCase")]
#[ts(rename_all = "camelCase")]
pub struct AgentEventToolUseEnd {
    pub tool_use_id: String,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, JsonSchema, TS)]
#[serde(rename_all = "camelCase")]
#[ts(rename_all = "camelCase")]
pub struct AgentEventServerToolUse {
    pub tool_use_id: String,
    pub name: String,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, JsonSchema, TS)]
#[serde(rename_all = "camelCase")]
#[ts(rename_all = "camelCase")]
pub struct AgentEventServerToolResult {
    pub tool_use_id: String,
    pub payload: serde_json::Value,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    #[ts(optional)]
    pub is_error: Option<bool>,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, JsonSchema, TS)]
#[serde(rename_all = "camelCase")]
#[ts(rename_all = "camelCase")]
pub struct AgentEventUsage {
    #[serde(default, skip_serializing_if = "Option::is_none")]
    #[ts(optional)]
    pub input_tokens: Option<u32>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    #[ts(optional)]
    pub output_tokens: Option<u32>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    #[ts(optional)]
    pub cache_read_tokens: Option<u32>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    #[ts(optional)]
    pub cache_write_tokens: Option<u32>,
    /// Subset of `cache_write_tokens` billed at Anthropic's 1-hour cache
    /// rate. See `StreamChunkUsage.cacheWrite1hTokens`'s docstring for why
    /// this is a separate field rather than a flag on `cache_write_tokens`.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    #[ts(optional)]
    pub cache_write_1h_tokens: Option<u32>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    #[ts(optional)]
    pub reasoning_tokens: Option<u32>,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, JsonSchema, TS)]
#[serde(rename_all = "camelCase")]
#[ts(rename_all = "camelCase")]
pub struct AgentEventError {
    pub message: String,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    #[ts(optional)]
    pub code: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    #[ts(optional)]
    pub retryable: Option<bool>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    #[ts(optional)]
    pub retry_after_seconds: Option<u32>,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, JsonSchema, TS)]
#[serde(rename_all = "camelCase")]
#[ts(rename_all = "camelCase")]
pub struct AgentEventStop {
    pub reason: AgentEventStopReason,
}

#[derive(Debug, Clone, Copy, Serialize, Deserialize, PartialEq, Eq, JsonSchema, TS)]
#[serde(rename_all = "kebab-case")]
#[ts(rename_all = "kebab-case")]
pub enum AgentEventStopReason {
    /// Natural completion. Web: `end_turn`. Wire: `stop`. App-server:
    /// `Completed`.
    EndTurn,
    /// Hit the output-length limit. Web: `max_tokens`. Wire: `length`.
    MaxTokens,
    /// The model is invoking a caller-executed tool; the turn continues
    /// after tool results are supplied. Web: `tool_use`. Wire:
    /// `tool_calls`.
    ToolUse,
    /// Hit a caller-configured stop sequence. Web: `stop_sequence`.
    StopSequence,
    /// The provider's safety layer stopped the response. See this enum's
    /// own doc comment.
    Refusal,
    /// User- or system-initiated interruption. Web: `cancel`. App-server:
    /// `Interrupted`.
    Cancelled,
    /// Abnormal/transport failure. Web: `error`. App-server: `Failed`.
    Error,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, JsonSchema, TS)]
#[serde(rename_all = "camelCase")]
#[ts(rename_all = "camelCase")]
pub struct AgentEventLifecycle {
    pub phase: AgentEventLifecyclePhase,
}

/// Stream-lifecycle moments that are neither content nor a terminal
/// [`AgentEventStopReason`].
#[derive(Debug, Clone, Copy, Serialize, Deserialize, PartialEq, Eq, JsonSchema, TS)]
#[serde(rename_all = "kebab-case")]
#[ts(rename_all = "kebab-case")]
pub enum AgentEventLifecyclePhase {
    /// A turn began. Analog of app-server's explicit `turn/started`
    /// notification (`developer_host.rs`: `self.emit("turn/started", ...)`
    /// before any output). Web/desktop imply this at the first chunk of a
    /// response rather than emitting a dedicated event; app-server's real,
    /// explicit notification is this variant's justification.
    Started,
    /// A transport-level keepalive with no content, to prevent idle-timeout
    /// watchdogs from firing during a long pause (e.g. extended thinking,
    /// image generation). Analog of desktop's `StreamChunk.keepalive: bool`
    /// (`sse_parser.rs`), which documents exactly this purpose.
    Heartbeat,
    /// Execution is intentionally suspended, normally for user input or an
    /// approval decision. The run remains resumable.
    Paused,
    /// A previously paused run resumed without replaying completed work.
    Resumed,
}

/// A safe progress entry rendered on the inline run spine. `detail` may use
/// Markdown, but it must be a user-facing work summary rather than hidden
/// model reasoning or an unfiltered provider scratchpad.
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, JsonSchema, TS)]
#[serde(rename_all = "camelCase")]
#[ts(rename_all = "camelCase")]
pub struct AgentEventProgressUpdate {
    /// Stable within one turn so a running entry can be updated in place.
    pub progress_id: String,
    pub summary: String,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    #[ts(optional)]
    pub detail: Option<String>,
    pub status: AgentEventProgressStatus,
}

#[derive(Debug, Clone, Copy, Serialize, Deserialize, PartialEq, Eq, JsonSchema, TS)]
#[serde(rename_all = "kebab-case")]
#[ts(rename_all = "kebab-case")]
pub enum AgentEventProgressStatus {
    Running,
    Completed,
    Failed,
}

/// Cross-surface semantic tool category. Clients use this for stable icons,
/// labels, and disclosure behavior instead of guessing from vendor-specific
/// tool names.
#[derive(Debug, Clone, Copy, Serialize, Deserialize, PartialEq, Eq, JsonSchema, TS)]
#[serde(rename_all = "kebab-case")]
#[ts(rename_all = "kebab-case")]
pub enum AgentEventToolCategory {
    WebSearch,
    WebFetch,
    CodeExecution,
    Filesystem,
    Shell,
    Skill,
    Memory,
    Connector,
    Mcp,
    ComputerUse,
    Artifact,
    Other,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, JsonSchema, TS)]
#[serde(rename_all = "camelCase")]
#[ts(rename_all = "camelCase")]
pub struct AgentEventToolExecutionStart {
    pub tool_call_id: String,
    pub name: String,
    pub category: AgentEventToolCategory,
    /// A concise user-facing action label, such as "Searching official
    /// sources". Raw command/request detail belongs in `input`.
    pub summary: String,
    pub input: serde_json::Value,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, JsonSchema, TS)]
#[serde(rename_all = "camelCase")]
#[ts(rename_all = "camelCase")]
pub struct AgentEventToolExecutionEnd {
    pub tool_call_id: String,
    pub name: String,
    pub output: serde_json::Value,
    pub is_error: bool,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    #[ts(type = "number", optional)]
    pub elapsed_ms: Option<u64>,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, JsonSchema, TS)]
#[serde(rename_all = "camelCase")]
#[ts(rename_all = "camelCase")]
pub struct AgentEventSourceList {
    #[serde(default, skip_serializing_if = "Option::is_none")]
    #[ts(optional)]
    pub tool_call_id: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    #[ts(optional)]
    pub query: Option<String>,
    pub sources: Vec<AgentEventSource>,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, JsonSchema, TS)]
#[serde(rename_all = "camelCase")]
#[ts(rename_all = "camelCase")]
pub struct AgentEventSource {
    pub url: String,
    pub title: String,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    #[ts(optional)]
    pub snippet: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, JsonSchema, TS)]
#[serde(rename_all = "camelCase")]
#[ts(rename_all = "camelCase")]
pub struct AgentEventApprovalRequested {
    pub approval_id: String,
    pub tool_call_id: String,
    pub name: String,
    pub category: AgentEventToolCategory,
    pub summary: String,
    pub input: serde_json::Value,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    #[ts(optional)]
    pub risk_level: Option<AgentEventApprovalRiskLevel>,
}

#[derive(Debug, Clone, Copy, Serialize, Deserialize, PartialEq, Eq, JsonSchema, TS)]
#[serde(rename_all = "kebab-case")]
#[ts(rename_all = "kebab-case")]
pub enum AgentEventApprovalRiskLevel {
    Low,
    Medium,
    High,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, JsonSchema, TS)]
#[serde(rename_all = "camelCase")]
#[ts(rename_all = "camelCase")]
pub struct AgentEventApprovalResolved {
    pub approval_id: String,
    pub decision: AgentEventApprovalDecision,
}

#[derive(Debug, Clone, Copy, Serialize, Deserialize, PartialEq, Eq, JsonSchema, TS)]
#[serde(rename_all = "kebab-case")]
#[ts(rename_all = "kebab-case")]
pub enum AgentEventApprovalDecision {
    Approved,
    ApprovedForSession,
    Denied,
    Cancelled,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, JsonSchema, TS)]
#[serde(rename_all = "camelCase")]
#[ts(rename_all = "camelCase")]
pub struct AgentEventInputRequested {
    pub tool_call_id: String,
    pub connector_id: String,
    pub tool_name: String,
    /// Remote-authored input-request definitions, verbatim JSON. UNTRUSTED and
    /// host-bounded (count/size capped) before this event is emitted; the host
    /// treats them as data to render a form, never as instructions to execute.
    pub input_requests: serde_json::Value,
    /// Opaque continuation token echoed back to the server on resume.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    #[ts(optional)]
    pub request_state: Option<String>,
    /// 0-based MRTR round; increments each time the same call re-pauses.
    #[ts(type = "number")]
    pub round: u32,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, JsonSchema, TS)]
#[serde(rename_all = "camelCase")]
#[ts(rename_all = "camelCase")]
pub struct AgentEventInputResolved {
    pub tool_call_id: String,
    pub outcome: AgentEventInputOutcome,
}

#[derive(Debug, Clone, Copy, Serialize, Deserialize, PartialEq, Eq, JsonSchema, TS)]
#[serde(rename_all = "kebab-case")]
#[ts(rename_all = "kebab-case")]
pub enum AgentEventInputOutcome {
    Resolved,
    Cancelled,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, JsonSchema, TS)]
#[serde(rename_all = "camelCase")]
#[ts(rename_all = "camelCase")]
pub struct AgentEventArtifactProduced {
    pub artifact_id: String,
    pub name: String,
    pub mime_type: String,
    pub uri: String,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    #[ts(type = "number", optional)]
    pub size_bytes: Option<u64>,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, JsonSchema, TS)]
#[serde(rename_all = "camelCase")]
#[ts(rename_all = "camelCase")]
pub struct AgentEventContextCompacted {
    #[serde(default, skip_serializing_if = "Option::is_none")]
    #[ts(optional)]
    pub before_tokens: Option<u32>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    #[ts(optional)]
    pub after_tokens: Option<u32>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    #[ts(optional)]
    pub summary: Option<String>,
}

#[cfg(test)]
mod tests {
    use super::*;

    fn sample_envelope(event: AgentEvent) -> AgentEventEnvelope {
        AgentEventEnvelope {
            schema_version: AGENT_EVENT_SCHEMA_VERSION,
            session_id: "session-abc".to_string(),
            turn_id: "turn-123".to_string(),
            sequence: 7,
            emitted_at_ms: 1_752_000_000_123,
            event,
        }
    }

    fn assert_round_trips(envelope: &AgentEventEnvelope) {
        let json = serde_json::to_string(envelope).expect("serialize");
        let parsed: AgentEventEnvelope = serde_json::from_str(&json).expect("deserialize");
        assert_eq!(&parsed, envelope, "round-trip mismatch for JSON: {json}");
    }

    #[test]
    fn envelope_carries_schema_version_on_the_wire() {
        let envelope = sample_envelope(AgentEvent::TextDelta(AgentEventTextDelta {
            delta: "hello".to_string(),
        }));
        let value = serde_json::to_value(&envelope).expect("serialize");
        assert_eq!(
            value.get("schemaVersion"),
            Some(&serde_json::json!(AGENT_EVENT_SCHEMA_VERSION))
        );
        assert_eq!(value.get("sequence"), Some(&serde_json::json!(7)));
    }

    #[test]
    fn text_delta_round_trips() {
        assert_round_trips(&sample_envelope(AgentEvent::TextDelta(
            AgentEventTextDelta {
                delta: "partial response".to_string(),
            },
        )));
    }

    #[test]
    fn reasoning_delta_round_trips_with_and_without_signature() {
        assert_round_trips(&sample_envelope(AgentEvent::ReasoningDelta(
            AgentEventReasoningDelta {
                delta: "thinking...".to_string(),
                signature: Some("sig-xyz".to_string()),
            },
        )));
        assert_round_trips(&sample_envelope(AgentEvent::ReasoningDelta(
            AgentEventReasoningDelta {
                delta: "thinking...".to_string(),
                signature: None,
            },
        )));
    }

    #[test]
    fn tool_use_start_delta_end_round_trip() {
        assert_round_trips(&sample_envelope(AgentEvent::ToolUseStart(
            AgentEventToolUseStart {
                tool_use_id: "tool-1".to_string(),
                name: "search".to_string(),
            },
        )));
        assert_round_trips(&sample_envelope(AgentEvent::ToolUseDelta(
            AgentEventToolUseDelta {
                tool_use_id: "tool-1".to_string(),
                delta_json: "{\"query\":".to_string(),
            },
        )));
        assert_round_trips(&sample_envelope(AgentEvent::ToolUseEnd(
            AgentEventToolUseEnd {
                tool_use_id: "tool-1".to_string(),
            },
        )));
    }

    #[test]
    fn server_tool_use_and_result_round_trip() {
        assert_round_trips(&sample_envelope(AgentEvent::ServerToolUse(
            AgentEventServerToolUse {
                tool_use_id: "server-tool-1".to_string(),
                name: "web_search".to_string(),
            },
        )));
        assert_round_trips(&sample_envelope(AgentEvent::ServerToolResult(
            AgentEventServerToolResult {
                tool_use_id: "server-tool-1".to_string(),
                payload: serde_json::json!({ "results": [{ "url": "https://example.com" }] }),
                is_error: Some(false),
            },
        )));
    }

    #[test]
    fn usage_round_trips_with_all_fields_absent_and_present() {
        assert_round_trips(&sample_envelope(AgentEvent::Usage(AgentEventUsage {
            input_tokens: None,
            output_tokens: None,
            cache_read_tokens: None,
            cache_write_tokens: None,
            cache_write_1h_tokens: None,
            reasoning_tokens: None,
        })));
        assert_round_trips(&sample_envelope(AgentEvent::Usage(AgentEventUsage {
            input_tokens: Some(120),
            output_tokens: Some(48),
            cache_read_tokens: Some(90),
            cache_write_tokens: Some(30),
            cache_write_1h_tokens: Some(10),
            reasoning_tokens: Some(12),
        })));
    }

    #[test]
    fn error_then_stop_matches_web_dialects_two_step_shape() {
        assert_round_trips(&sample_envelope(AgentEvent::Error(AgentEventError {
            message: "upstream disconnected".to_string(),
            code: Some("stream_disconnected".to_string()),
            retryable: Some(true),
            retry_after_seconds: Some(2),
        })));
        assert_round_trips(&sample_envelope(AgentEvent::Stop(AgentEventStop {
            reason: AgentEventStopReason::Error,
        })));
    }

    #[test]
    fn stop_reason_covers_the_refusal_outcome() {
        assert_round_trips(&sample_envelope(AgentEvent::Stop(AgentEventStop {
            reason: AgentEventStopReason::Refusal,
        })));
    }

    #[test]
    fn all_stop_reasons_round_trip() {
        for reason in [
            AgentEventStopReason::EndTurn,
            AgentEventStopReason::MaxTokens,
            AgentEventStopReason::ToolUse,
            AgentEventStopReason::StopSequence,
            AgentEventStopReason::Refusal,
            AgentEventStopReason::Cancelled,
            AgentEventStopReason::Error,
        ] {
            assert_round_trips(&sample_envelope(AgentEvent::Stop(AgentEventStop {
                reason,
            })));
        }
    }

    #[test]
    fn lifecycle_started_and_heartbeat_round_trip() {
        assert_round_trips(&sample_envelope(AgentEvent::Lifecycle(
            AgentEventLifecycle {
                phase: AgentEventLifecyclePhase::Started,
            },
        )));
        assert_round_trips(&sample_envelope(AgentEvent::Lifecycle(
            AgentEventLifecycle {
                phase: AgentEventLifecyclePhase::Heartbeat,
            },
        )));
    }

    #[test]
    fn user_visible_progress_round_trips_without_private_reasoning_semantics() {
        assert_round_trips(&sample_envelope(AgentEvent::ProgressUpdate(
            AgentEventProgressUpdate {
                progress_id: "research-plan".to_string(),
                summary: "Planning an exhaustive report".to_string(),
                detail: Some(
                    "I’ll reconcile the official sources and flag unresolved evidence gaps."
                        .to_string(),
                ),
                status: AgentEventProgressStatus::Running,
            },
        )));
        assert_round_trips(&sample_envelope(AgentEvent::ProgressUpdate(
            AgentEventProgressUpdate {
                progress_id: "research-plan".to_string(),
                summary: "Planned an exhaustive report".to_string(),
                detail: None,
                status: AgentEventProgressStatus::Completed,
            },
        )));
    }

    #[test]
    fn caller_tool_execution_round_trips_with_structured_request_and_response() {
        assert_round_trips(&sample_envelope(AgentEvent::ToolExecutionStart(
            AgentEventToolExecutionStart {
                tool_call_id: "call-search-1".to_string(),
                name: "web_search".to_string(),
                category: AgentEventToolCategory::WebSearch,
                summary: "Searching official release notes".to_string(),
                input: serde_json::json!({ "query": "official release notes" }),
            },
        )));
        assert_round_trips(&sample_envelope(AgentEvent::ToolExecutionEnd(
            AgentEventToolExecutionEnd {
                tool_call_id: "call-search-1".to_string(),
                name: "web_search".to_string(),
                output: serde_json::json!({ "resultCount": 8 }),
                is_error: false,
                elapsed_ms: Some(842),
            },
        )));
    }

    #[test]
    fn sources_approvals_artifacts_and_compaction_round_trip() {
        assert_round_trips(&sample_envelope(AgentEvent::SourceList(
            AgentEventSourceList {
                tool_call_id: Some("call-search-1".to_string()),
                query: Some("official release notes".to_string()),
                sources: vec![AgentEventSource {
                    url: "https://example.com/release-notes".to_string(),
                    title: "Release notes".to_string(),
                    snippet: Some("Current product changes".to_string()),
                }],
            },
        )));
        assert_round_trips(&sample_envelope(AgentEvent::ApprovalRequested(
            AgentEventApprovalRequested {
                approval_id: "approval-1".to_string(),
                tool_call_id: "call-shell-1".to_string(),
                name: "shell".to_string(),
                category: AgentEventToolCategory::Shell,
                summary: "Install the document generation library".to_string(),
                input: serde_json::json!({ "command": "install package" }),
                risk_level: Some(AgentEventApprovalRiskLevel::Medium),
            },
        )));
        assert_round_trips(&sample_envelope(AgentEvent::ApprovalResolved(
            AgentEventApprovalResolved {
                approval_id: "approval-1".to_string(),
                decision: AgentEventApprovalDecision::Approved,
            },
        )));
        assert_round_trips(&sample_envelope(AgentEvent::ArtifactProduced(
            AgentEventArtifactProduced {
                artifact_id: "artifact-1".to_string(),
                name: "report.pdf".to_string(),
                mime_type: "application/pdf".to_string(),
                uri: "/api/files/artifact-1".to_string(),
                size_bytes: Some(4096),
            },
        )));
        assert_round_trips(&sample_envelope(AgentEvent::ContextCompacted(
            AgentEventContextCompacted {
                before_tokens: Some(180_000),
                after_tokens: Some(42_000),
                summary: Some("Context automatically compacted".to_string()),
            },
        )));
    }

    #[test]
    fn input_required_pause_and_resolution_round_trip() {
        assert_round_trips(&sample_envelope(AgentEvent::InputRequested(
            AgentEventInputRequested {
                tool_call_id: "call-connector-1".to_string(),
                connector_id: "custom-abc123".to_string(),
                tool_name: "create_ticket".to_string(),
                input_requests: serde_json::json!({
                    "priority": { "type": "string", "enum": ["low", "high"] }
                }),
                request_state: Some("opaque-continuation".to_string()),
                round: 0,
            },
        )));
        assert_round_trips(&sample_envelope(AgentEvent::InputResolved(
            AgentEventInputResolved {
                tool_call_id: "call-connector-1".to_string(),
                outcome: AgentEventInputOutcome::Resolved,
            },
        )));
        assert_round_trips(&sample_envelope(AgentEvent::InputResolved(
            AgentEventInputResolved {
                tool_call_id: "call-connector-1".to_string(),
                outcome: AgentEventInputOutcome::Cancelled,
            },
        )));
    }

    #[test]
    fn event_tag_is_kebab_case_matching_stream_chunk_type() {
        let value = serde_json::to_value(sample_envelope(AgentEvent::ToolUseStart(
            AgentEventToolUseStart {
                tool_use_id: "t".to_string(),
                name: "n".to_string(),
            },
        )))
        .expect("serialize");
        assert_eq!(
            value["event"]["type"],
            serde_json::json!("tool-use-start"),
            "AgentEvent tag must match StreamChunk['type'] casing exactly"
        );
    }
}
