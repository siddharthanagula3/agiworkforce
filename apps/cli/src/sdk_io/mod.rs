//! Stream-JSON protocol surface for embedder-driven CLI turns (desktop,
//! mobile, IDE extension, or a third-party Node/Python host) instead of a
//! human at a terminal.
//!
//! Wire shape: line-delimited JSON on stdout, one [`SdkEvent`] per line.
//! `--output-format stream-json` emits this canonical one-way event schema,
//! including live text and tool lifecycle records. The older `--json-events`
//! flag retains its separate automation schema.

pub(crate) mod ndjson;
pub(crate) mod protocol;

pub(crate) use ndjson::{write_event_stdout, NdjsonWriter};
pub(crate) use protocol::{
    AssistantMessageEvent, ErrorEvent, SdkEvent, StatusUpdateEvent, StatusUpdateReason,
    StreamEvent, ToolResultEvent, UserMessageBody,
};
