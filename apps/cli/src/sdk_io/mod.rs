//! Reserved stream-JSON protocol surface for future embedder-driven sessions
//! (desktop, mobile, IDE extension, or third-party Node/Python host) instead
//! of a human at a terminal.
//!
//! Wire shape: line-delimited JSON in both directions over stdio.
//! Each outbound event is one of [`SdkEvent`]; each inbound message is one of
//! [`SdkInputMessage`]. The control-channel variants ([`SdkEvent::ControlRequest`]
//! / [`SdkInputMessage::ControlResponse`]) carry permission decisions, hook
//! callbacks, and MCP elicitations between the embedder and this process.
//!
//! The current CLI exposes one-way JSONL events through `--json-events` and
//! `--output-format stream-json`. Bidirectional stdin/control-channel input is
//! not an active command-line surface until the session loop consumes it.

pub(crate) mod ndjson;
pub(crate) mod protocol;
pub(crate) mod stdin_reader;

// Re-exports for callers under `crate::sdk_io::*`. The names that aren't yet
// referenced from main.rs / agent.rs are gated with `allow(unused_imports)` —
// they're the public surface the next session will wire through.
pub(crate) use ndjson::NdjsonWriter;
pub(crate) use protocol::{
    AssistantMessageEvent, ErrorEvent, SdkEvent, StatusUpdateEvent, StatusUpdateReason,
};

#[allow(unused_imports)]
pub(crate) use protocol::{
    ControlRequest, ControlResponse, SdkInputMessage, StreamEvent, ToolResultEvent,
    UserInputMessage,
};

#[allow(unused_imports)]
pub(crate) use stdin_reader::StdinReader;
