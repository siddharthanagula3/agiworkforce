//! Typed agent lifecycle events emitted on `--json-events`.
//!
//! This is the machine-readable counterpart to the human-friendly TUI/REPL
//! output. Every event is one JSON object, terminated by a newline, written to
//! stdout. No interleaved prose, no ANSI, no timestamps in the payload —
//! callers (CI, dashboards, claws) own time-keeping.
//!
//! Two strict guarantees:
//!   1. Variant names are stable. Add fields, never rename them.
//!   2. `kind` strings on errors come from [`crate::errors::CliError::kind`],
//!      so a runbook can pattern-match without parsing prose.
//!
//! See plan: `~/.claude/plans/even-if-it-is-bubbly-octopus.md`, Day-3 Feature 2.

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
    /// Error path — paired with [`CliError::kind`] and a runbook hint.
    Error {
        session_id: String,
        kind: &'static str,
        message: String,
        hint: String,
    },
}

impl AgentEvent {
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
    /// to stderr — never panic on a user-driver bug.
    pub fn emit<W: Write>(&self, out: &mut W) {
        match serde_json::to_string(self) {
            Ok(json) => {
                let _ = writeln!(out, "{}", json);
            }
            Err(err) => {
                eprintln!("[agent_events] failed to serialize {self:?}: {err}");
            }
        }
    }

    /// Convenience: emit to stdout.
    pub fn emit_stdout(&self) {
        self.emit(&mut std::io::stdout());
    }
}

/// Crude secret-redaction for tool arguments. Replaces values longer than 12
/// chars whose key matches /key|token|secret|password/i with `<redacted>`. Not
/// a security boundary; just a UX nicety for the JSON event stream.
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
            model: "claude-sonnet-4-6".into(),
            provider: "anthropic".into(),
        };
        let json = serde_json::to_string(&ev).unwrap();
        assert!(json.contains(r#""event":"spawning""#));
        assert!(json.contains(r#""model":"claude-sonnet-4-6""#));
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
}
