//! Stream-JSON protocol surface for embedder-driven CLI turns (desktop,
//! mobile, IDE extension, or a third-party Node/Python host) instead of a
//! human at a terminal.
//!
//! Wire shape: line-delimited JSON in both directions over stdio.
//! Each outbound event is one of [`SdkEvent`]; each inbound message is one of
//! [`SdkInputMessage`]. The control-channel variants ([`SdkEvent::ControlRequest`]
//! / [`SdkInputMessage::ControlResponse`]) carry permission decisions, hook
//! callbacks, and MCP elicitations between the embedder and this process.
//!
//! `--output-format stream-json` emits this canonical one-way event schema,
//! including live text and tool lifecycle records. The older `--json-events`
//! flag retains its separate automation schema. Bidirectional stdin/control
//! input is not active until the session loop consumes it.

pub(crate) mod ndjson;
pub(crate) mod protocol;
pub(crate) mod stdin_reader;

pub(crate) use ndjson::{write_event_stdout, NdjsonWriter};
pub(crate) use protocol::{
    AssistantMessageEvent, ErrorEvent, SdkEvent, StatusUpdateEvent, StatusUpdateReason,
    UserMessageBody,
};

#[allow(unused_imports)]
pub(crate) use protocol::{
    ControlRequest, ControlResponse, SdkInputMessage, StreamEvent, ToolResultEvent,
    UserInputMessage,
};

#[allow(unused_imports)]
pub(crate) use stdin_reader::StdinReader;
