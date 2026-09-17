use anyhow::Result;
use chrono::{SecondsFormat, Utc};
use serde::{Deserialize, Serialize};
use std::path::PathBuf;

use crate::approval_audit::{append_entry_at, sanitize_field};
use crate::subagent::{SubagentStatus, SubagentUsage};

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum SubagentAuditOutcome {
    Completed,
    Failed,
    Cancelled,
}

/// One finished subagent run: who spawned it, what it was asked, how it ended
/// and what it cost. The prompt is recorded by length only, because it can
/// carry file contents the parent read.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct SubagentAuditEntry {
    pub timestamp: String,
    pub subagent_id: String,
    pub description: String,
    pub depth: usize,
    pub prompt_chars: usize,
    pub outcome: SubagentAuditOutcome,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub error: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub usage: Option<SubagentUsage>,
    pub files_modified: usize,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub cwd: Option<String>,
}

pub struct SubagentAuditRecord<'a> {
    pub subagent_id: &'a str,
    pub description: &'a str,
    pub depth: usize,
    pub prompt_chars: usize,
    pub status: &'a SubagentStatus,
    pub usage: Option<&'a SubagentUsage>,
    pub files_modified: usize,
}

impl SubagentAuditEntry {
    pub fn new(record: &SubagentAuditRecord<'_>) -> Option<Self> {
        let (outcome, error) = match record.status {
            SubagentStatus::Running => return None,
            SubagentStatus::Completed => (SubagentAuditOutcome::Completed, None),
            SubagentStatus::Failed(message) => {
                (SubagentAuditOutcome::Failed, Some(sanitize_field(message)))
            }
            SubagentStatus::Cancelled => (SubagentAuditOutcome::Cancelled, None),
        };
        Some(Self {
            timestamp: Utc::now().to_rfc3339_opts(SecondsFormat::Secs, true),
            subagent_id: sanitize_field(record.subagent_id),
            description: sanitize_field(record.description),
            depth: record.depth,
            prompt_chars: record.prompt_chars,
            outcome,
            error,
            usage: record.usage.cloned(),
            files_modified: record.files_modified,
            cwd: std::env::current_dir()
                .ok()
                .map(|path| sanitize_field(&path.display().to_string())),
        })
    }
}

pub fn record_subagent(record: &SubagentAuditRecord<'_>) {
    let Some(entry) = SubagentAuditEntry::new(record) else {
        return;
    };
    let appended = subagent_log_path().and_then(|path| append_entry_at(&path, &entry));
    if let Err(error) = appended {
        tracing::warn!(%error, "failed to append CLI subagent audit entry");
    }
}

fn subagent_log_path() -> Result<PathBuf> {
    Ok(crate::config::CliConfig::config_dir()?.join("subagents.jsonl"))
}

#[cfg(test)]
mod tests {
    use super::*;

    fn usage() -> SubagentUsage {
        SubagentUsage {
            model: "catalog-model".to_string(),
            input_tokens: 1_200,
            output_tokens: 300,
            cache_read_tokens: 50,
            cache_creation_tokens: 0,
            cost_usd: 0.0125,
            via_subscription: false,
        }
    }

    #[test]
    fn a_running_subagent_is_not_an_audit_event() {
        let record = SubagentAuditRecord {
            subagent_id: "subagent_1",
            description: "survey",
            depth: 1,
            prompt_chars: 10,
            status: &SubagentStatus::Running,
            usage: None,
            files_modified: 0,
        };
        assert!(SubagentAuditEntry::new(&record).is_none());
    }

    #[test]
    fn a_finished_subagent_records_outcome_usage_and_prompt_length_only() {
        let usage = usage();
        let record = SubagentAuditRecord {
            subagent_id: "subagent_2",
            description: "refactor\u{1b}[31m parser",
            depth: 2,
            prompt_chars: 4_096,
            status: &SubagentStatus::Completed,
            usage: Some(&usage),
            files_modified: 3,
        };
        let entry = SubagentAuditEntry::new(&record).expect("finished run is audited");

        assert_eq!(entry.outcome, SubagentAuditOutcome::Completed);
        assert_eq!(entry.usage.as_ref(), Some(&usage));
        assert_eq!(entry.prompt_chars, 4_096);
        assert_eq!(entry.files_modified, 3);
        assert!(!entry.description.contains('\u{1b}'));
    }

    #[test]
    fn a_failed_subagent_keeps_its_sanitized_error() {
        let status = SubagentStatus::Failed("provider\nrefused".to_string());
        let record = SubagentAuditRecord {
            subagent_id: "subagent_3",
            description: "tests",
            depth: 1,
            prompt_chars: 12,
            status: &status,
            usage: None,
            files_modified: 0,
        };
        let entry = SubagentAuditEntry::new(&record).expect("failed run is audited");

        assert_eq!(entry.outcome, SubagentAuditOutcome::Failed);
        assert_eq!(entry.error.as_deref(), Some("provider refused"));
    }

    #[test]
    fn audit_rows_append_as_jsonl() {
        let temp = tempfile::tempdir().expect("tempdir");
        let path = temp.path().join("subagents.jsonl");
        let usage = usage();
        for (id, status) in [
            ("subagent_4", SubagentStatus::Completed),
            ("subagent_5", SubagentStatus::Cancelled),
        ] {
            let record = SubagentAuditRecord {
                subagent_id: id,
                description: "batch",
                depth: 1,
                prompt_chars: 8,
                status: &status,
                usage: Some(&usage),
                files_modified: 0,
            };
            let entry = SubagentAuditEntry::new(&record).expect("audited");
            append_entry_at(&path, &entry).expect("append");
        }

        let rows: Vec<SubagentAuditEntry> = std::fs::read_to_string(&path)
            .expect("read log")
            .lines()
            .map(|line| serde_json::from_str(line).expect("parse row"))
            .collect();
        assert_eq!(rows.len(), 2);
        assert_eq!(rows[1].outcome, SubagentAuditOutcome::Cancelled);
        assert_eq!(rows[0].usage.as_ref().map(|u| u.cost_usd), Some(0.0125));
    }
}
