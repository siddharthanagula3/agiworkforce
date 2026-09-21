//! Typed agent lifecycle events emitted on `--json-events`.
//!
//! This is the machine-readable counterpart to the human-friendly TUI/REPL
//! output. Every event is one JSON object, terminated by a newline, written to
//! stdout. No interleaved prose, no ANSI, no timestamps in the payload.
//! callers (CI, dashboards, automation scripts) own time-keeping.
//!
//! Two strict guarantees:
//!   1. Variant names are stable. Add fields, never rename them.
//!   2. `kind` strings on errors come from [`crate::errors::CliError::kind`],
//!      so a runbook can pattern-match without parsing prose.

use std::io::Write;

use serde::Deserialize;
use serde::Serialize;

use crate::errors::CliError;

/// One event in the agent lifecycle. JSONL on stdout when `--json-events` is set.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(tag = "event", rename_all = "snake_case")]
pub enum AgentEvent {
    /// Session is starting; no model call has fired yet.
    Spawning {
        session_id: String,
        model: String,
        provider: String,
    },
    /// First prompt accepted; the agent is now waiting on user / driver input.
    ReadyForPrompt { session_id: String },
    /// A tool call is about to execute. `args_redacted` strips obvious secret-shaped values.
    RunningTool {
        session_id: String,
        name: String,
        args_redacted: String,
    },
    /// Tool finished. `ok=false` means the tool itself returned an error.
    ToolResult {
        session_id: String,
        name: String,
        duration_ms: u64,
        ok: bool,
    },
    /// Streaming content chunk from the assistant. Text only (no audio / image).
    MessageDelta { session_id: String, text: String },
    /// Token-accounting tick at the end of a turn.
    TurnUsage {
        session_id: String,
        in_tokens: u32,
        out_tokens: u32,
        cache_read: u32,
        cache_creation: u32,
        cumulative_dollars: f64,
    },
    /// Multi-model fallback fired (see Feature 3).
    FallbackTriggered {
        session_id: String,
        from: String,
        to: String,
        reason: &'static str,
    },
    /// Session finished cleanly. `reason` is one of: "user_quit", "exit_request",
    /// "completed", "interrupted".
    Finished {
        session_id: String,
        reason: &'static str,
    },
    /// Budget cap reached: cumulative spend exceeded `--max-budget-usd`.
    /// The agent loop is stopped; no further model calls will be made.
    BudgetExhausted {
        session_id: String,
        /// Cumulative spend in USD at the point the cap was hit.
        cumulative_dollars: f64,
        /// The configured cap.
        limit_dollars: f64,
    },
    /// Error path, paired with [`CliError::kind`] and a runbook hint.
    Error {
        session_id: String,
        kind: &'static str,
        message: String,
        hint: String,
    },
    /// The turn produced a real answer that the provider cut short. The text
    /// already streamed above is valid and kept; this states what is missing
    /// and the one next move, so a reader is not left believing the answer
    /// ended where the model meant it to.
    TurnIncomplete {
        session_id: String,
        kind: &'static str,
        message: String,
        hint: String,
    },
}

/// The session id for the machine event stream, when one is running.
///
/// A denial or an abort deep in the tool layer has no handle on the flag the
/// top level uses to decide whether to emit events, and a process that exits
/// without a terminal event leaves a script reading a stream that simply stops.
/// Registering the id once lets any path close the stream before it exits.
static MACHINE_STREAM_SESSION: std::sync::Mutex<Option<String>> = std::sync::Mutex::new(None);

/// Claim the machine event stream for `session_id`.
pub fn claim_machine_stream(session_id: impl Into<String>) {
    if let Ok(mut held) = MACHINE_STREAM_SESSION.lock() {
        *held = Some(session_id.into());
    }
}

/// Release the claim. Tests share one process, so they must not decide the
/// answer for every test that runs after them.
pub fn release_machine_stream() {
    if let Ok(mut held) = MACHINE_STREAM_SESSION.lock() {
        *held = None;
    }
}

/// Emit a terminal [`AgentEvent::Error`] when a machine stream is running.
/// Does nothing otherwise, so a human-facing run stays unchanged.
pub fn emit_terminal_error(
    kind: &'static str,
    message: impl Into<String>,
    hint: impl Into<String>,
) {
    let session_id = match MACHINE_STREAM_SESSION.lock() {
        Ok(held) => match held.as_ref() {
            Some(id) => id.clone(),
            None => return,
        },
        Err(_) => return,
    };
    AgentEvent::Error {
        session_id,
        kind,
        message: message.into(),
        hint: hint.into(),
    }
    .emit_stdout();
}

impl AgentEvent {
    /// Build an [`AgentEvent::TurnIncomplete`] for a delivered answer the
    /// provider cut short. Reads its three strings from the cause, so the
    /// event and the terminal notice cannot drift apart.
    pub fn turn_incomplete(
        session_id: impl Into<String>,
        cause: crate::errors::IncompleteTurnCause,
    ) -> Self {
        Self::TurnIncomplete {
            session_id: session_id.into(),
            kind: cause.kind(),
            message: cause.summary().to_string(),
            hint: cause.next_move().to_string(),
        }
    }

    /// Build an [`AgentEvent::Error`] from a [`CliError`]. Keeps `kind` and
    /// `hint` consistent with the human-facing error text.
    pub fn from_error(session_id: impl Into<String>, err: &CliError) -> Self {
        Self::Error {
            session_id: session_id.into(),
            kind: err.kind(),
            message: err.to_string(),
            hint: err.hint(),
        }
    }

    /// Serialize the event to JSON and append a newline. Errors are written
    /// to stderr, never panic on a user-driver bug.
    pub fn emit<W: Write>(&self, out: &mut W) {
        if let Err(err) = crate::sdk_io::ndjson::write_event_sync(out, self) {
            eprintln!("[agent_events] failed to write {self:?}: {err}");
        }
    }

    /// Convenience: emit to stdout.
    pub fn emit_stdout(&self) {
        self.emit(&mut std::io::stdout());
    }
}

/// Crude secret-redaction for tool arguments. When the input contains any of
/// `key|token|secret|password` (case-insensitive), the whole value is redacted
/// regardless of length: inputs longer than 64 chars become `<redacted-long>`,
/// shorter ones become `<redacted>`. Not a security boundary; just a UX nicety
/// for the JSON event stream.
#[allow(dead_code)]
pub fn redact_args(raw: &str) -> String {
    let lower = raw.to_lowercase();
    if lower.contains("key")
        || lower.contains("token")
        || lower.contains("secret")
        || lower.contains("password")
    {
        if raw.len() > 64 {
            return "<redacted-long>".to_string();
        }
        return "<redacted>".to_string();
    }
    raw.to_string()
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn spawning_serializes_with_event_tag() {
        let ev = AgentEvent::Spawning {
            session_id: "s1".into(),
            model: "fixture-event-model".into(),
            provider: "anthropic".into(),
        };
        let json = serde_json::to_string(&ev).unwrap();
        assert!(json.contains(r#""event":"spawning""#));
        assert!(json.contains(r#""model":"fixture-event-model""#));
    }

    #[test]
    fn error_event_picks_up_kind_and_hint() {
        let err = CliError::RateLimited {
            provider: "anthropic".into(),
            retry_after: Some(30),
        };
        let ev = AgentEvent::from_error("s1", &err);
        let AgentEvent::Error { kind, hint, .. } = &ev else {
            panic!("expected Error variant");
        };
        assert_eq!(*kind, "api_rate_limit");
        assert!(hint.contains("rate-limit"));
    }

    #[test]
    fn redact_strips_obvious_secrets() {
        assert_eq!(redact_args("api_key=sk-live-12345"), "<redacted>");
        assert_eq!(redact_args("plain text"), "plain text");
    }

    #[test]
    fn emit_writes_one_json_line() {
        let ev = AgentEvent::Finished {
            session_id: "s".into(),
            reason: "completed",
        };
        let mut buf: Vec<u8> = Vec::new();
        ev.emit(&mut buf);
        let text = String::from_utf8(buf).unwrap();
        assert_eq!(text.matches('\n').count(), 1);
        assert!(text.starts_with('{'));
    }

    #[test]
    fn budget_exhausted_serializes_with_event_tag_and_fields() {
        let ev = AgentEvent::BudgetExhausted {
            session_id: "s42".into(),
            cumulative_dollars: 0.05,
            limit_dollars: 0.04,
        };
        let json = serde_json::to_string(&ev).unwrap();
        assert!(
            json.contains(r#""event":"budget_exhausted""#),
            "missing event tag: {json}"
        );
        assert!(
            json.contains(r#""session_id":"s42""#),
            "missing session_id: {json}"
        );
        assert!(
            json.contains("cumulative_dollars"),
            "missing cumulative_dollars: {json}"
        );
        assert!(
            json.contains("limit_dollars"),
            "missing limit_dollars: {json}"
        );
    }

    #[test]
    fn a_delta_carrying_line_separators_stays_one_ndjson_record() {
        let event = AgentEvent::MessageDelta {
            session_id: "s1".to_string(),
            text: "before\u{2028}after\u{2029}end".to_string(),
        };
        let mut out: Vec<u8> = Vec::new();
        event.emit(&mut out);
        let written = String::from_utf8(out).expect("utf8");

        assert_eq!(
            written.lines().count(),
            1,
            "a model delta must not split the stream: {written}"
        );
        assert!(written.contains("\\u2028"), "U+2028 not escaped: {written}");
        assert!(written.contains("\\u2029"), "U+2029 not escaped: {written}");
        assert!(
            !written.contains('\u{2028}'),
            "raw U+2028 survived: {written}"
        );
    }

    #[test]
    fn a_terminal_error_is_silent_until_the_stream_is_claimed() {
        release_machine_stream();
        emit_terminal_error("approval_required", "denied", "pass a flag");
        claim_machine_stream("s-terminal");
        let held = MACHINE_STREAM_SESSION.lock().expect("lock");
        assert_eq!(held.as_deref(), Some("s-terminal"));
        drop(held);
        release_machine_stream();
        assert!(MACHINE_STREAM_SESSION.lock().expect("lock").is_none());
    }

    /// A delivered answer the provider cut short is its own event, not an
    /// error: the text above it is real. It still carries the kind a runbook
    /// matches on and the one next move.
    #[test]
    fn turn_incomplete_carries_the_kind_the_message_and_the_hint() {
        let event = AgentEvent::turn_incomplete(
            "s1",
            crate::errors::IncompleteTurnCause::OutputLimitReached,
        );
        let json: serde_json::Value =
            serde_json::from_str(&serde_json::to_string(&event).unwrap()).unwrap();
        assert_eq!(json["event"], "turn_incomplete");
        assert_eq!(json["session_id"], "s1");
        assert_eq!(json["kind"], "output_limit_reached");
        assert_eq!(
            json["message"],
            "The answer reached this model's maximum length and stopped there."
        );
        assert_eq!(
            json["hint"],
            "Ask for a shorter answer, or split the request."
        );
    }

    #[test]
    fn turn_incomplete_is_not_the_error_event() {
        let incomplete = serde_json::to_string(&AgentEvent::turn_incomplete(
            "s1",
            crate::errors::IncompleteTurnCause::OutputLimitReached,
        ))
        .unwrap();
        assert!(!incomplete.contains(r#""event":"error""#), "{incomplete}");
    }
}
