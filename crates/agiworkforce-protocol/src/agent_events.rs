//! One versioned agent event envelope (W5 discipline-wave item 4;
//! `docs/plans/restructure-execution-program-2026-07-15.md` §W5,
//! `docs/plans/target-structure-finalization-2026-07-15.md` §4.1 item 2).
//!
//! Web SSE chat streaming, the local developer-session app-server's
//! `turn/*` JSON-RPC notifications, and Desktop's Tauri stream events are
//! three independently-evolved dialects for the same underlying thing: a
//! model response streaming to a UI. [`AgentEventEnvelope`] is the one
//! shape all three can express; adapters translate at the edges (an
//! `agiworkforce-llm`/`packages/ai/provider-protocol`/desktop `sse_parser`
//! concern), not by inventing a fourth dialect.
//!
//! This module is deliberately separate from [`crate::protocol::EventMsg`],
//! which is the CLI agent-loop's much larger internal event taxonomy (MCP
//! startup, hooks, patch-apply, undo, collab agents, exec approval, ...).
//! `AgentEvent` only covers the narrower model-response-streaming slice the
//! three dialects actually share; every payload struct is prefixed
//! `AgentEvent*` so it never collides with (or gets mistaken for one of)
//! `protocol.rs`'s ~80 similarly-named `*Event` types.
//!
//! Naming/casing: `AgentEvent`'s wire tag is `kebab-case` (`"text-delta"`,
//! `"tool-use-start"`, ...) to match `packages/contracts/types/src/provider-adapter.ts`
//! `StreamChunk['type']` byte-for-byte — that's the richest and most
//! authoritative of the three dialects, so adapter code between it and this
//! envelope is close to mechanical. Struct fields are `camelCase` on the
//! wire to match both the web dialect (`toolUseId`, `deltaJson`,
//! `inputTokens`, ...) and the app-server dialect
//! (`developer_session.rs`'s `AppServerRequest`/`AppServerNotification`
//! family, all `#[serde(rename_all = "camelCase")]`) — unlike `EventMsg`,
//! neither real dialect this envelope targets uses `snake_case` wire
//! fields.
//!
//! Deliberately NOT modeled (adapters keep translating these at the edges,
//! per the goal statement): `StreamChunkCitation`, `StreamChunkVendorRaw`,
//! and `StreamChunkResponseMeta` are all documented in
//! `packages/contracts/types/src/provider-adapter.ts` as legacy-wire-reconstruction
//! concerns for one specific consumer (`OpenAIWireAssembler`'s
//! `wireMode: 'legacy-web'` / `'openai-passthrough'`), with no equivalent
//! in the app-server or desktop dialects — including them here would grow
//! the envelope to serve one wire format's reconstruction needs instead of
//! the three dialects' actual shared semantics. Desktop's `CreditsInfo`
//! (`apps/desktop/src-tauri/src/core/llm/mod.rs`) is similarly excluded:
//! real, but a desktop-local budget concept with no web or app-server
//! equivalent to converge with.

use schemars::JsonSchema;
use serde::Deserialize;
use serde::Serialize;
use ts_rs::TS;

/// Current wire version for [`AgentEventEnvelope`]. Bump on any
/// backward-incompatible change to the envelope or [`AgentEvent`] shape,
/// mirroring `developer_session::DEVELOPER_SESSION_PROTOCOL_VERSION`'s
/// precedent for a crate-level protocol version constant.
pub const AGENT_EVENT_SCHEMA_VERSION: u32 = 1;

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
    /// Session/conversation identity. Plain `String`, not the CLI's
    /// UUID-backed `ThreadId`: the app-server dialect's real wire `threadId`
    /// is already a JSON string (`developer_host.rs` takes `thread_id:
    /// String`), and web/desktop session identity is not guaranteed
    /// UUID-shaped (e.g. a Neon-assigned id) — forcing UUID validation here
    /// would reject real values from two of the three target dialects.
    pub session_id: String,
    /// Turn identity, same `String` rationale as `session_id` (app-server's
    /// real wire `turnId` is a JSON string; `developer_host.rs` formats a
    /// `Uuid` to `String` before ever putting it on the wire).
    pub turn_id: String,
    /// Monotonically increasing per-envelope counter, scoped to one
    /// `turn_id`, starting at 0. New in this envelope — none of the three
    /// source dialects has one today (app-server's `turn/output_delta`
    /// notifications carry no ordering signal at all), which is a real gap
    /// this envelope closes: without it, a client cannot detect a dropped
    /// or reordered event on any transport that doesn't itself guarantee
    /// ordering.
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
    /// Model reasoning/thinking text, incremental. Analog of
    /// `StreamChunkThinking` (`type: 'thinking-delta'`, includes an
    /// Anthropic extended-thinking `signature` for verification) and
    /// desktop's `StreamChunk.reasoning: Option<String>` ("Anthropic
    /// extended thinking or OpenAI reasoning summaries"). App-server does
    /// not emit this today (its turn loop only forwards plain-text
    /// deltas) — that emitter gap is real but out of this envelope's
    /// scope (goal statement: "converging the three surfaces' emitters is
    /// follow-on work").
    ReasoningDelta(AgentEventReasoningDelta),
    /// A caller-executed tool call started. Analog of
    /// `StreamChunkToolUseStart` (`toolUseId`, `name`; `vendorIndex` and
    /// `logprobs` are wire-reconstruction-only fields per that type's own
    /// docstring, not carried here) and desktop's `StreamingToolCall`
    /// (`id`, `name`, accumulated across chunks in `sse_parser.rs`).
    ToolUseStart(AgentEventToolUseStart),
    /// Incremental JSON fragment of a tool call's arguments. Analog of
    /// `StreamChunkToolUseDelta.deltaJson`. Modeled as an incremental
    /// delta (matching the web dialect and how providers actually stream
    /// tool-call arguments), not desktop's locally re-accumulated
    /// `StreamingToolCall.arguments` string — that accumulation is
    /// `sse_parser.rs`'s own client-side reassembly of the same
    /// provider-native incremental deltas, an implementation detail of
    /// one consumer, not a wire semantic to converge on.
    ToolUseDelta(AgentEventToolUseDelta),
    /// A caller-executed tool call's arguments are complete. Analog of
    /// `StreamChunkToolUseEnd`. App-server does not emit a dedicated
    /// end-of-tool-call notification today, but the CLI's own internal
    /// `EventMsg::McpToolCallEnd` (`protocol.rs`) proves the same
    /// begin/end pairing concept already exists in this crate for its MCP
    /// tool-call dialect.
    ToolUseEnd(AgentEventToolUseEnd),
    /// A provider-managed ("server-side") tool invocation started —
    /// executes on the vendor's infrastructure (Anthropic
    /// web_search/web_fetch/code_execution, Google grounding/
    /// code-execution), not the caller's tool loop. Analog of
    /// `StreamChunkServerToolUse`.
    ServerToolUse(AgentEventServerToolUse),
    /// A provider-managed tool invocation's result. Analog of
    /// `StreamChunkServerToolResult` — `payload` stays untyped JSON
    /// verbatim from the vendor, same rationale as the source type's own
    /// docstring: "there is no shared cross-vendor result schema today."
    ServerToolResult(AgentEventServerToolResult),
    /// Token usage. Analog of `StreamChunkUsage` (all six fields carried
    /// through unchanged) and compatible with desktop's `TokenUsage`
    /// (`prompt_tokens`/`completion_tokens`/`cache_read_input_tokens`/
    /// `cache_creation_input_tokens`) and app-server's `turn/completed`
    /// `inputTokens`/`outputTokens` (both `u32` there too).
    Usage(AgentEventUsage),
    /// A non-terminal, diagnosable stream failure. Analog of
    /// `StreamChunkError` (`code`, `message`, `retryable`,
    /// `retryAfterSeconds`) and `openai-wire-compat.ts`'s `x_stream_error`
    /// side-channel payload shape. Distinct from `Stop { reason: Error }`:
    /// the web dialect emits both, in that order (an `error` chunk
    /// carrying diagnostic detail, then a terminal `stop` chunk) — see
    /// `openai-wire-compat.ts`'s `case 'error':` / `case 'stop':` handling
    /// in `OpenAIWireAssembler.ingest()`, which is exactly this two-step
    /// shape.
    Error(AgentEventError),
    /// The stream ended. Analog of `StreamChunkStop`, but with an HONEST
    /// stop vocabulary — see [`AgentEventStopReason`]'s own docs for the
    /// gap this closes.
    Stop(AgentEventStop),
    /// A stream-lifecycle signal that is neither content nor a terminal
    /// stop. See [`AgentEventLifecyclePhase`].
    Lifecycle(AgentEventLifecycle),
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
    /// Vendor result payload, verbatim and untranslated — see
    /// `StreamChunkServerToolResult.payload`'s docstring.
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

/// The honest stop vocabulary this envelope exists partly to introduce.
/// Today's `StreamChunkStop['reason']`
/// (`packages/contracts/types/src/provider-adapter.ts`) is `'end_turn' | 'max_tokens'
/// | 'tool_use' | 'stop_sequence' | 'error' | 'cancel'` — no dedicated
/// refusal member. `packages/ai/providers/anthropic/src/stream.ts`'s
/// `mapStopReason` documents the resulting gap directly: Anthropic's real
/// `stop_reason: 'refusal'` (streaming safety classifiers intervening
/// mid-generation) has nowhere honest to go today and is mapped to
/// `'error'` as the least-wrong existing option. `Refusal` here is that
/// missing member — the canonical target for BOTH Anthropic's `refusal`
/// stop_reason and OpenAI's wire `finish_reason: 'content_filter'`
/// (`packages/ai/provider-protocol/src/openai-wire-compat.ts`'s
/// `OpenAIWireFinishReason`; also desktop's `StreamChunk.finish_reason`
/// string, `sse_parser.rs`): both mean "the provider's safety layer
/// stopped this response," which is the one honest concept, not two
/// vendor-specific ones. Wiring the Anthropic/OpenAI adapters to actually
/// emit it is separate work (execution program §W6 item 1); this envelope
/// only needs a real place for that fix to land.
///
/// The other six variants are the union of `StreamChunkStop.reason`,
/// desktop's `finish_reason` (`"stop" | "length" | "tool_calls" |
/// "content_filter"`), and app-server's `TurnStatus` (`Running | Completed
/// | Interrupted | Failed`, `developer_session.rs`) — `Running` has no
/// stop-reason analog (it is not a terminal state) and is intentionally
/// not a variant here.
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
        assert_round_trips(&sample_envelope(AgentEvent::TextDelta(AgentEventTextDelta {
            delta: "partial response".to_string(),
        })));
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
        assert_round_trips(&sample_envelope(AgentEvent::ToolUseEnd(AgentEventToolUseEnd {
            tool_use_id: "tool-1".to_string(),
        })));
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
            assert_round_trips(&sample_envelope(AgentEvent::Stop(AgentEventStop { reason })));
        }
    }

    #[test]
    fn lifecycle_started_and_heartbeat_round_trip() {
        assert_round_trips(&sample_envelope(AgentEvent::Lifecycle(AgentEventLifecycle {
            phase: AgentEventLifecyclePhase::Started,
        })));
        assert_round_trips(&sample_envelope(AgentEvent::Lifecycle(AgentEventLifecycle {
            phase: AgentEventLifecyclePhase::Heartbeat,
        })));
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
