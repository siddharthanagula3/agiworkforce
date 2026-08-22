use anyhow::{Context, Result};
use chrono::{SecondsFormat, Utc};
use serde::{Deserialize, Serialize};
use std::fs::OpenOptions;
use std::io::Write;
use std::path::{Path, PathBuf};

use crate::terminal_text::sanitize_terminal_text;

const MAX_FIELD_CHARS: usize = 1_000;

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum ApprovalDecision {
    Approved,
    Denied,
    BlockedByRule,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct ApprovalAuditEntry {
    pub timestamp: String,
    pub tool_name: String,
    pub target: String,
    pub decision: ApprovalDecision,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub risk: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub reason: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub cwd: Option<String>,
}

impl ApprovalAuditEntry {
    pub fn new(
        tool_name: impl AsRef<str>,
        target: impl AsRef<str>,
        decision: ApprovalDecision,
        risk: Option<&str>,
        reason: Option<&str>,
    ) -> Self {
        let cwd = std::env::current_dir()
            .ok()
            .map(|path| sanitize_field(&path.display().to_string()));
        Self {
            timestamp: Utc::now().to_rfc3339_opts(SecondsFormat::Secs, true),
            tool_name: sanitize_field(tool_name.as_ref()),
            target: sanitize_field(target.as_ref()),
            decision,
            risk: risk.map(sanitize_field),
            reason: reason.map(sanitize_field),
            cwd,
        }
    }
}

pub fn record_approval(
    tool_name: impl AsRef<str>,
    target: impl AsRef<str>,
    decision: ApprovalDecision,
    risk: Option<&str>,
    reason: Option<&str>,
) {
    let entry = ApprovalAuditEntry::new(tool_name, target, decision, risk, reason);
    if let Err(error) = append_entry(&entry) {
        tracing::warn!(%error, "failed to append CLI approval audit entry");
    }
}

fn approval_log_path() -> Result<PathBuf> {
    Ok(crate::config::CliConfig::config_dir()?.join("approvals.jsonl"))
}

fn append_entry(entry: &ApprovalAuditEntry) -> Result<()> {
    append_entry_at(&approval_log_path()?, entry)
}

fn append_entry_at(path: &Path, entry: &ApprovalAuditEntry) -> Result<()> {
    if let Some(parent) = path.parent() {
        std::fs::create_dir_all(parent)
            .with_context(|| format!("failed to create approval audit dir {}", parent.display()))?;
    }

    let mut file = OpenOptions::new()
        .create(true)
        .append(true)
        .open(path)
        .with_context(|| format!("failed to open approval audit log {}", path.display()))?;
    #[cfg(unix)]
    {
        use std::os::unix::fs::PermissionsExt;
        let _ = file.set_permissions(std::fs::Permissions::from_mode(0o600));
    }

    let line = serde_json::to_string(entry).context("failed to serialize approval audit entry")?;
    writeln!(file, "{line}").context("failed to write approval audit entry")?;
    Ok(())
}

fn sanitize_field(raw: &str) -> String {
    let stripped = sanitize_terminal_text(raw);
    let mut out: String = stripped
        .chars()
        .take(MAX_FIELD_CHARS)
        .map(|ch| if ch.is_control() { ' ' } else { ch })
        .collect();
    if stripped.chars().count() > MAX_FIELD_CHARS {
        out.push_str(" [truncated]");
    }
    out
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn sanitize_field_removes_control_characters_and_caps_length() {
        let input = format!("hello\n{}\tworld", "x".repeat(MAX_FIELD_CHARS + 10));
        let sanitized = sanitize_field(&input);

        assert!(!sanitized.contains('\n'));
        assert!(!sanitized.contains('\t'));
        assert!(sanitized.ends_with(" [truncated]"));
    }

    #[test]
    fn sanitize_field_drops_whole_escape_sequences() {
        let sanitized = sanitize_field("rm -rf /\u{1b}]52;c;cm0gLXJmIC8=\u{7} --safe");

        assert!(!sanitized.contains('\u{1b}'));
        assert!(!sanitized.contains("]52;c;"));
        assert!(!sanitized.contains("cm0gLXJmIC8="));
        assert_eq!(sanitized, "rm -rf / --safe");
    }

    #[test]
    fn append_entry_at_writes_jsonl_with_restrictive_permissions() {
        let temp = tempfile::tempdir().expect("tempdir");
        let path = temp.path().join("approvals.jsonl");
        let entry = ApprovalAuditEntry {
            timestamp: "2026-05-19T00:00:00Z".to_string(),
            tool_name: "run_command".to_string(),
            target: "rm -rf tmp".to_string(),
            decision: ApprovalDecision::Denied,
            risk: Some("dangerous".to_string()),
            reason: Some("user denied".to_string()),
            cwd: Some("/repo".to_string()),
        };

        append_entry_at(&path, &entry).expect("append entry");

        let contents = std::fs::read_to_string(&path).expect("read log");
        let parsed: ApprovalAuditEntry =
            serde_json::from_str(contents.trim()).expect("parse jsonl row");
        assert_eq!(parsed, entry);

        #[cfg(unix)]
        {
            use std::os::unix::fs::PermissionsExt;
            let mode = std::fs::metadata(&path)
                .expect("metadata")
                .permissions()
                .mode()
                & 0o777;
            assert_eq!(mode, 0o600);
        }
    }
}
