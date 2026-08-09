//! Support-bundle assembly for desktop logs.
//!
//! Three registered IPC commands copy application logs out of the app:
//! `get_filtered_logs` (whose result `FeedbackDialog` uploads to
//! `/api/feedback`), and `error_get_logs` / `error_export_logs`, which hand log
//! text to the webview. All three build their output through
//! [`collect_bundle_lines`] so one set of rules applies to every copy that
//! leaves the log directory.
//!
//! What this module actually does, stated exactly:
//!
//! * It reads the files the rolling appender writes. `RollingFileAppender` with
//!   a daily rotation names them `agiworkforce.log.<date>`, not
//!   `agiworkforce.log`, so the prefix is matched rather than the extension.
//! * A line that does not parse as a JSON object emitted by the tracing JSON
//!   layer is dropped. Its shape is unknown, so what it might carry is unknown.
//! * Structured event fields are an allowlist ([`ALLOWED_EVENT_FIELDS`]). A log
//!   site that attaches `prompt`, `content`, `transcript`, or any other field
//!   not named there does not reach a bundle, and a field added to a log site
//!   later stays out until someone adds it here deliberately.
//! * The free-form `message` string and the `error` field are kept, because a
//!   bundle without them is not diagnostic. Both are scrubbed with
//!   [`crate::sys::logging::filter_sensitive_data`], and the rendered record is
//!   truncated to [`MAX_LINE_BYTES`]. These two are the parts that are NOT
//!   allowlisted, and that is the limit of the guarantee here: a log site that
//!   formats user text into its own message string would still reach a bundle.
//!   Log sites must therefore not do that — see the `prompt_chars` /
//!   `text_chars` fields in `sys::commands::scheduler` and
//!   `features::messaging::teams` for the shape to use instead.
//! * A record whose rendered text mentions account or billing terms is dropped
//!   whole rather than redacted.

use std::fs;
use std::path::{Path, PathBuf};

use crate::sys::telemetry::{active_log_dir, LogConfig, LOG_FILE_PREFIX};

/// The directory a bundle is read from: the one the appender opened, falling
/// back to the configured default when telemetry failed to initialize.
pub fn bundle_log_dir() -> PathBuf {
    active_log_dir().unwrap_or_else(|| LogConfig::default().log_dir)
}

/// Maximum number of redacted records a bundle carries.
pub const MAX_BUNDLE_LINES: usize = 500;

/// Maximum bytes of any single redacted record.
pub const MAX_LINE_BYTES: usize = 512;

/// Byte ceiling for a whole bundle (~200 KB).
pub const MAX_BUNDLE_BYTES: usize = 200_000;

/// Structured event fields carried into a support bundle. Every other field on
/// a log record is dropped, including fields that do not exist yet.
pub const ALLOWED_EVENT_FIELDS: &[&str] = &[
    "attempt",
    "conversation_id",
    "correlation_id",
    "duration_ms",
    "error_code",
    "error_type",
    "execution_mode",
    "message_id",
    "model",
    "operation",
    "provider",
    "request_id",
    "run_id",
    "session_id",
    "status",
    "status_code",
    "surface",
];

/// Fields kept for diagnosis but treated as free-form text: scrubbed of
/// credentials and truncated rather than passed through.
const SCRUBBED_TEXT_FIELDS: &[&str] = &["error", "message"];

/// Terms that mark a record as carrying account or billing data. Matching
/// records are dropped rather than redacted — a support bundle has no reason
/// to carry any of it.
const ACCOUNT_TERMS: &[&str] = &[
    "account_id",
    "balance",
    "bank_",
    "billing",
    "card_",
    "credits",
    "customer_id",
    "invoice",
    "payment",
    "price_id",
    "stripe",
    "subscription",
];

/// Which severities a bundle should carry.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum LevelFilter {
    /// Every record the log file holds.
    All,
    /// Only `WARN` and `ERROR` records.
    WarnAndError,
}

impl LevelFilter {
    fn admits(self, level: &str) -> bool {
        match self {
            LevelFilter::All => true,
            LevelFilter::WarnAndError => {
                level.eq_ignore_ascii_case("WARN") || level.eq_ignore_ascii_case("ERROR")
            }
        }
    }
}

/// Rolling-appender log files in `log_dir`, newest first.
///
/// The appender writes `agiworkforce.log.<date>`, so the file extension is the
/// date, not `log`. Matching on the extension finds nothing.
pub fn log_files_newest_first(log_dir: &Path) -> Vec<PathBuf> {
    let Ok(entries) = fs::read_dir(log_dir) else {
        return Vec::new();
    };

    let mut files: Vec<(PathBuf, Option<std::time::SystemTime>)> = entries
        .filter_map(Result::ok)
        .filter(|entry| {
            entry
                .file_name()
                .to_str()
                .is_some_and(|name| name.starts_with(LOG_FILE_PREFIX))
        })
        .filter(|entry| entry.path().is_file())
        .map(|entry| {
            let modified = entry.metadata().ok().and_then(|meta| meta.modified().ok());
            (entry.path(), modified)
        })
        .collect();

    files.sort_by(|a, b| b.1.cmp(&a.1).then_with(|| b.0.cmp(&a.0)));
    files.into_iter().map(|(path, _)| path).collect()
}

/// Redact one log record for inclusion in a support bundle.
///
/// Returns `None` when the record cannot be included: it is not a tracing JSON
/// object, its level is filtered out, or it mentions account/billing data.
pub fn redact_log_record(line: &str, filter: LevelFilter) -> Option<String> {
    let value: serde_json::Value = serde_json::from_str(line.trim()).ok()?;
    let record = value.as_object()?;

    let level = record.get("level").and_then(serde_json::Value::as_str)?;
    if !filter.admits(level) {
        return None;
    }

    let timestamp = record
        .get("timestamp")
        .and_then(serde_json::Value::as_str)
        .unwrap_or("unknown-time");
    let target = record
        .get("target")
        .and_then(serde_json::Value::as_str)
        .unwrap_or("unknown-target");

    let fields = record.get("fields").and_then(serde_json::Value::as_object);

    let message = fields
        .and_then(|f| f.get("message"))
        .map(render_scalar)
        .unwrap_or_default();

    let mut kept: Vec<String> = Vec::new();
    if let Some(fields) = fields {
        for name in SCRUBBED_TEXT_FIELDS {
            if *name == "message" {
                continue;
            }
            if let Some(value) = fields.get(*name) {
                kept.push(format!("{name}={}", scrub(&render_scalar(value))));
            }
        }
        for (name, value) in fields {
            if ALLOWED_EVENT_FIELDS.contains(&name.as_str()) {
                kept.push(format!("{name}={}", render_scalar(value)));
            }
        }
    }

    // `file`/`line` locate the log site and carry no user data.
    if let (Some(file), Some(line_number)) = (
        record.get("filename").and_then(serde_json::Value::as_str),
        record.get("line_number").and_then(serde_json::Value::as_u64),
    ) {
        kept.push(format!("at={file}:{line_number}"));
    }

    kept.sort();

    let mut rendered = format!("{timestamp} {level} {target}: {}", scrub(&message));
    if !kept.is_empty() {
        rendered.push_str(" | ");
        rendered.push_str(&kept.join(" "));
    }

    if mentions_account_data(&rendered) {
        return None;
    }

    Some(truncate_on_char_boundary(rendered, MAX_LINE_BYTES))
}

/// Read `log_dir` and return redacted records, newest file first, bounded by
/// [`MAX_BUNDLE_LINES`], `max_lines`, and [`MAX_BUNDLE_BYTES`].
pub fn collect_bundle_lines(log_dir: &Path, filter: LevelFilter, max_lines: usize) -> Vec<String> {
    let cap = max_lines.min(MAX_BUNDLE_LINES);
    let mut collected: Vec<String> = Vec::new();
    let mut total_bytes = 0usize;

    for path in log_files_newest_first(log_dir) {
        if collected.len() >= cap || total_bytes >= MAX_BUNDLE_BYTES {
            break;
        }

        let Ok(content) = fs::read_to_string(&path) else {
            continue;
        };

        for line in content.lines() {
            if collected.len() >= cap || total_bytes >= MAX_BUNDLE_BYTES {
                break;
            }
            if let Some(redacted) = redact_log_record(line, filter) {
                total_bytes += redacted.len();
                collected.push(redacted);
            }
        }
    }

    collected
}

fn render_scalar(value: &serde_json::Value) -> String {
    match value {
        serde_json::Value::String(text) => text.clone(),
        other => other.to_string(),
    }
}

fn scrub(text: &str) -> String {
    crate::sys::logging::filter_sensitive_data(text)
}

fn mentions_account_data(text: &str) -> bool {
    let lowered = text.to_lowercase();
    ACCOUNT_TERMS.iter().any(|term| lowered.contains(term))
}

fn truncate_on_char_boundary(text: String, max_bytes: usize) -> String {
    if text.len() <= max_bytes {
        return text;
    }
    let mut end = max_bytes;
    while end > 0 && !text.is_char_boundary(end) {
        end -= 1;
    }
    format!("{}...[truncated]", &text[..end])
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::io::Write;

    fn record(extra_fields: &str) -> String {
        format!(
            r#"{{"timestamp":"2026-08-09T10:00:00Z","level":"WARN","fields":{{"message":"stream failed"{extra_fields}}},"target":"chat","filename":"src/chat.rs","line_number":42}}"#
        )
    }

    #[test]
    fn keeps_allowlisted_diagnostic_fields() {
        let line = record(r#","correlation_id":"corr-1","provider":"anthropic""#);
        let redacted = redact_log_record(&line, LevelFilter::All).expect("record is includable");

        assert!(redacted.contains("correlation_id=corr-1"), "{redacted}");
        assert!(redacted.contains("provider=anthropic"), "{redacted}");
        assert!(redacted.contains("stream failed"), "{redacted}");
        assert!(redacted.contains("at=src/chat.rs:42"), "{redacted}");
    }

    #[test]
    fn drops_conversation_content_fields() {
        let line = record(
            r#","prompt":"draft my resignation letter","content":"Dear Ada, the merger closes Friday","transcript":"i told my doctor about""#,
        );
        let redacted = redact_log_record(&line, LevelFilter::All).expect("record is includable");

        assert!(!redacted.contains("resignation"), "{redacted}");
        assert!(!redacted.contains("Dear Ada"), "{redacted}");
        assert!(!redacted.contains("my doctor"), "{redacted}");
        assert!(!redacted.contains("prompt"), "{redacted}");
    }

    #[test]
    fn drops_fields_no_one_has_added_yet() {
        let line = record(r#","some_future_payload":"the user's private notes""#);
        let redacted = redact_log_record(&line, LevelFilter::All).expect("record is includable");

        assert!(!redacted.contains("private notes"), "{redacted}");
        assert!(!redacted.contains("some_future_payload"), "{redacted}");
    }

    #[test]
    fn scrubs_credentials_from_message_and_error() {
        let line = record(r#","error":"api_key: sk-livekey1234567890 rejected""#);
        let redacted = redact_log_record(&line, LevelFilter::All).expect("record is includable");

        assert!(!redacted.contains("sk-livekey1234567890"), "{redacted}");
        assert!(redacted.contains("API_KEY=***"), "{redacted}");
    }

    #[test]
    fn drops_records_mentioning_account_or_billing_data() {
        let line = r#"{"timestamp":"2026-08-09T10:00:00Z","level":"ERROR","fields":{"message":"stripe subscription sync failed"},"target":"billing"}"#;
        assert!(redact_log_record(line, LevelFilter::All).is_none());
    }

    #[test]
    fn drops_lines_that_are_not_tracing_json_records() {
        assert!(redact_log_record("2026-08-09 WARN plain text log line", LevelFilter::All).is_none());
        assert!(redact_log_record("", LevelFilter::All).is_none());
        assert!(redact_log_record("[1,2,3]", LevelFilter::All).is_none());
    }

    #[test]
    fn warn_and_error_filter_excludes_info() {
        let info = r#"{"timestamp":"2026-08-09T10:00:00Z","level":"INFO","fields":{"message":"started"},"target":"boot"}"#;
        assert!(redact_log_record(info, LevelFilter::WarnAndError).is_none());
        assert!(redact_log_record(info, LevelFilter::All).is_some());
    }

    #[test]
    fn truncates_long_records_on_a_char_boundary() {
        let long_message = "\u{00e9}".repeat(2_000);
        let line = format!(
            r#"{{"timestamp":"2026-08-09T10:00:00Z","level":"ERROR","fields":{{"message":"{long_message}"}},"target":"chat"}}"#
        );
        let redacted = redact_log_record(&line, LevelFilter::All).expect("record is includable");

        assert!(redacted.ends_with("...[truncated]"), "{redacted}");
        assert!(redacted.len() <= MAX_LINE_BYTES + "...[truncated]".len());
    }

    #[test]
    fn finds_rotated_log_files_whose_extension_is_a_date() {
        let dir = tempfile::tempdir().expect("temp dir");
        for name in [
            "agiworkforce.log.2026-08-07",
            "agiworkforce.log.2026-08-09",
            "unrelated.txt",
        ] {
            let mut file = fs::File::create(dir.path().join(name)).expect("create log file");
            writeln!(file, "{}", record("")).expect("write log file");
        }

        let found = log_files_newest_first(dir.path());
        assert_eq!(found.len(), 2, "{found:?}");
        assert!(found.iter().all(|path| path
            .file_name()
            .and_then(|name| name.to_str())
            .is_some_and(|name| name.starts_with(LOG_FILE_PREFIX))));
    }

    #[test]
    fn collect_reads_rotated_files_and_redacts_them() {
        let dir = tempfile::tempdir().expect("temp dir");
        let mut file = fs::File::create(dir.path().join("agiworkforce.log.2026-08-09"))
            .expect("create log file");
        writeln!(
            file,
            "{}",
            record(r#","correlation_id":"corr-9","prompt":"my private prompt text""#)
        )
        .expect("write log file");
        writeln!(
            file,
            r#"{{"timestamp":"2026-08-09T10:00:01Z","level":"INFO","fields":{{"message":"noise"}},"target":"boot"}}"#
        )
        .expect("write log file");

        let lines = collect_bundle_lines(dir.path(), LevelFilter::WarnAndError, MAX_BUNDLE_LINES);

        assert_eq!(lines.len(), 1, "{lines:?}");
        assert!(lines[0].contains("correlation_id=corr-9"), "{lines:?}");
        assert!(!lines[0].contains("my private prompt text"), "{lines:?}");
    }

    #[test]
    fn collect_respects_the_requested_line_cap() {
        let dir = tempfile::tempdir().expect("temp dir");
        let mut file = fs::File::create(dir.path().join("agiworkforce.log.2026-08-09"))
            .expect("create log file");
        for _ in 0..10 {
            writeln!(file, "{}", record("")).expect("write log file");
        }

        let lines = collect_bundle_lines(dir.path(), LevelFilter::All, 3);
        assert_eq!(lines.len(), 3);
    }

    #[test]
    fn collect_on_a_missing_directory_is_empty_not_an_error() {
        let dir = tempfile::tempdir().expect("temp dir");
        let missing = dir.path().join("no-such-dir");
        assert!(collect_bundle_lines(&missing, LevelFilter::All, MAX_BUNDLE_LINES).is_empty());
    }
}
