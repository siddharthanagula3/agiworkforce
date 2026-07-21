use agiworkforce_model_registry::TrustMode;
use agiworkforce_protocol::developer_session::DeveloperRoutingTaskType;
use anyhow::{bail, Context, Result};
use chrono::{DateTime, Utc};
use serde::{Deserialize, Serialize};
use std::fs;
use std::io::{BufWriter, Write};
use std::path::{Path, PathBuf};

use crate::cli_options::PermissionMode;
use crate::features::plan::plan_mode::Plan;
use crate::models::Message;

/// Write `contents` to `target` via a tempfile-then-rename so partial writes
/// are never visible to readers.  Callers that need cross-process
/// serialization should acquire an external lock before calling this.
fn atomic_write_session(target: &Path, contents: &[u8]) -> Result<()> {
    let dir = target
        .parent()
        .ok_or_else(|| anyhow::anyhow!("path has no parent: {}", target.display()))?;
    fs::create_dir_all(dir)
        .with_context(|| format!("Failed to create directory {}", dir.display()))?;
    let tmp = tempfile::NamedTempFile::new_in(dir)
        .with_context(|| format!("Failed to create tempfile in {}", dir.display()))?;
    fs::write(tmp.path(), contents)
        .with_context(|| format!("Failed to write tempfile {}", tmp.path().display()))?;
    tmp.persist(target)
        .map_err(|e| anyhow::anyhow!("Failed to rename tempfile to {}: {}", target.display(), e))?;
    Ok(())
}

/// Current on-disk schema version for managed CLI sessions.
/// v1: messages + fork only.
/// v2: adds permission_mode, plan_mode, plan_approved, current_plan, fast_mode,
///     output_style, fallback_model_ids fields (all optional, serde(default)).
/// v3: adds title, model, workspace_root, and created_by metadata shared by
///     terminal and IDE clients (all optional for v1/v2 compatibility).
/// v4: adds persisted Auto-routing selection/model/task/trust continuity.
pub const MANAGED_SESSION_VERSION: u32 = 4;

/// Default JSONL extension for managed session files.
pub const MANAGED_SESSION_JSONL_EXTENSION: &str = "jsonl";

/// Optional fork metadata stored alongside a managed session.
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
pub struct ManagedSessionForkMetadata {
    pub source_session_id: String,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub source_session_path: Option<PathBuf>,
    pub source_updated_at: DateTime<Utc>,
    pub source_message_count: usize,
    pub forked_at: DateTime<Utc>,
}

/// Persisted Auto policy state. A resumed CLI/VS Code developer session must
/// retain both its user-selected profile and its immutable trust boundary;
/// the concrete provider route may change as the task changes.
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
pub struct ManagedSessionAutoRouting {
    pub selection: String,
    pub model_key: String,
    pub task_type: DeveloperRoutingTaskType,
    pub trust_mode: TrustMode,
}

/// Persisted managed session snapshot.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ManagedSession {
    pub version: u32,
    pub session_id: String,
    pub created_at: DateTime<Utc>,
    pub updated_at: DateTime<Utc>,
    #[serde(default, skip_serializing_if = "Vec::is_empty")]
    pub messages: Vec<Message>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub fork: Option<ManagedSessionForkMetadata>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub title: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub model: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub workspace_root: Option<PathBuf>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub created_by: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub archived_at: Option<DateTime<Utc>>,
    // --- v2 session-state fields (all optional for backward compat with v1 files) ---
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub permission_mode: Option<PermissionMode>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub plan_mode: Option<bool>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub plan_approved: Option<bool>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub current_plan: Option<Plan>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub fast_mode: Option<bool>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub output_style: Option<String>,
    /// Ordered model IDs for the fallback chain. Stored separately because
    /// FallbackChain does not implement Serialize.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub fallback_model_ids: Option<Vec<String>>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub auto_routing: Option<ManagedSessionAutoRouting>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(tag = "record_type", rename_all = "snake_case")]
enum ManagedSessionJsonlRecord {
    Header {
        version: u32,
        session_id: String,
        created_at: DateTime<Utc>,
        updated_at: DateTime<Utc>,
        #[serde(default, skip_serializing_if = "Option::is_none")]
        fork: Option<Box<ManagedSessionForkMetadata>>,
        #[serde(default, skip_serializing_if = "Option::is_none")]
        title: Option<String>,
        #[serde(default, skip_serializing_if = "Option::is_none")]
        model: Option<String>,
        #[serde(default, skip_serializing_if = "Option::is_none")]
        workspace_root: Option<PathBuf>,
        #[serde(default, skip_serializing_if = "Option::is_none")]
        created_by: Option<String>,
        #[serde(default, skip_serializing_if = "Option::is_none")]
        archived_at: Option<DateTime<Utc>>,
        #[serde(default, skip_serializing_if = "Option::is_none")]
        permission_mode: Option<PermissionMode>,
        #[serde(default, skip_serializing_if = "Option::is_none")]
        plan_mode: Option<bool>,
        #[serde(default, skip_serializing_if = "Option::is_none")]
        plan_approved: Option<bool>,
        #[serde(default, skip_serializing_if = "Option::is_none")]
        current_plan: Option<Plan>,
        #[serde(default, skip_serializing_if = "Option::is_none")]
        fast_mode: Option<bool>,
        #[serde(default, skip_serializing_if = "Option::is_none")]
        output_style: Option<String>,
        #[serde(default, skip_serializing_if = "Option::is_none")]
        fallback_model_ids: Option<Vec<String>>,
        #[serde(default, skip_serializing_if = "Option::is_none")]
        auto_routing: Option<Box<ManagedSessionAutoRouting>>,
    },
    Message {
        message: Message,
    },
}

impl ManagedSession {
    /// Create a new empty managed session.
    pub fn new(session_id: impl Into<String>, created_at: DateTime<Utc>) -> Self {
        Self {
            version: MANAGED_SESSION_VERSION,
            session_id: session_id.into(),
            created_at,
            updated_at: created_at,
            messages: Vec::new(),
            fork: None,
            title: None,
            model: None,
            workspace_root: None,
            created_by: None,
            archived_at: None,
            permission_mode: None,
            plan_mode: None,
            plan_approved: None,
            current_plan: None,
            fast_mode: None,
            output_style: None,
            fallback_model_ids: None,
            auto_routing: None,
        }
    }

    /// Create a session seeded with messages.
    pub fn with_messages(
        session_id: impl Into<String>,
        created_at: DateTime<Utc>,
        messages: Vec<Message>,
    ) -> Self {
        Self {
            messages,
            ..Self::new(session_id, created_at)
        }
    }

    /// Create a forked session from an existing source session snapshot.
    pub fn forked_from(
        source: &ManagedSession,
        session_id: impl Into<String>,
        forked_at: DateTime<Utc>,
        source_session_path: Option<PathBuf>,
    ) -> Self {
        Self {
            version: MANAGED_SESSION_VERSION,
            session_id: session_id.into(),
            created_at: forked_at,
            updated_at: forked_at,
            messages: source.messages.clone(),
            fork: Some(ManagedSessionForkMetadata {
                source_session_id: source.session_id.clone(),
                source_session_path,
                source_updated_at: source.updated_at,
                source_message_count: source.messages.len(),
                forked_at,
            }),
            title: source.title.clone(),
            model: source.model.clone(),
            workspace_root: source.workspace_root.clone(),
            created_by: source.created_by.clone(),
            archived_at: None,
            permission_mode: None,
            plan_mode: None,
            plan_approved: None,
            current_plan: None,
            fast_mode: None,
            output_style: None,
            fallback_model_ids: None,
            auto_routing: source.auto_routing.clone(),
        }
    }

    /// Add a message and refresh the session timestamp.
    #[allow(dead_code)]
    pub fn push_message(&mut self, message: Message) {
        self.messages.push(message);
        self.touch();
    }

    /// Refresh the `updated_at` timestamp.
    pub fn touch(&mut self) {
        self.updated_at = Utc::now();
    }

    /// Persist the session to a file atomically (tempfile + rename).
    /// JSONL is used for `.jsonl` paths; `.json` paths use pretty JSON.
    pub fn save_to_path(&self, path: impl AsRef<Path>) -> Result<()> {
        let path = path.as_ref();
        if let Some(parent) = path.parent() {
            fs::create_dir_all(parent)
                .with_context(|| format!("Failed to create {}", parent.display()))?;
        }

        let mut buf = Vec::new();
        {
            let mut writer = BufWriter::new(&mut buf);
            if path
                .extension()
                .and_then(|extension| extension.to_str())
                .is_some_and(|extension| extension.eq_ignore_ascii_case("json"))
            {
                serde_json::to_writer_pretty(&mut writer, self).with_context(|| {
                    format!("Failed to serialize JSON session {}", path.display())
                })?;
                writer.write_all(b"\n").with_context(|| {
                    format!("Failed to finalize JSON session {}", path.display())
                })?;
            } else {
                self.write_jsonl(&mut writer).with_context(|| {
                    format!("Failed to serialize JSONL session {}", path.display())
                })?;
            }
            writer
                .flush()
                .with_context(|| format!("Failed to flush session buffer {}", path.display()))?;
        }

        atomic_write_session(path, &buf)
            .with_context(|| format!("Failed to write session file {}", path.display()))
    }

    /// Load a managed session from a JSONL or JSON file.
    pub fn load_from_path(path: impl AsRef<Path>) -> Result<Self> {
        let path = path.as_ref();
        let contents = fs::read_to_string(path)
            .with_context(|| format!("Failed to read managed session file {}", path.display()))?;
        Self::from_serialized_str(&contents)
            .with_context(|| format!("Failed to parse managed session file {}", path.display()))
    }

    fn from_serialized_str(contents: &str) -> Result<Self> {
        if let Ok(session) = serde_json::from_str::<ManagedSession>(contents) {
            session.validate()?;
            return Ok(session);
        }

        let session = Self::from_jsonl(contents)?;
        session.validate()?;
        Ok(session)
    }

    fn from_jsonl(contents: &str) -> Result<Self> {
        let mut header: Option<ManagedSession> = None;
        let mut messages = Vec::new();

        for (line_number, line) in contents.lines().enumerate() {
            let trimmed = line.trim();
            if trimmed.is_empty() {
                continue;
            }

            let record: ManagedSessionJsonlRecord =
                serde_json::from_str(trimmed).with_context(|| {
                    format!(
                        "Invalid managed session JSONL record at line {}",
                        line_number + 1
                    )
                })?;

            match record {
                ManagedSessionJsonlRecord::Header {
                    version,
                    session_id,
                    created_at,
                    updated_at,
                    fork,
                    title,
                    model,
                    workspace_root,
                    created_by,
                    archived_at,
                    permission_mode,
                    plan_mode,
                    plan_approved,
                    current_plan,
                    fast_mode,
                    output_style,
                    fallback_model_ids,
                    auto_routing,
                } => {
                    if header.is_some() {
                        bail!("Managed session JSONL file contains more than one header record");
                    }
                    header = Some(ManagedSession {
                        version,
                        session_id,
                        created_at,
                        updated_at,
                        messages: Vec::new(),
                        fork: fork.map(|fork| *fork),
                        title,
                        model,
                        workspace_root,
                        created_by,
                        archived_at,
                        permission_mode,
                        plan_mode,
                        plan_approved,
                        current_plan,
                        fast_mode,
                        output_style,
                        fallback_model_ids,
                        auto_routing: auto_routing.map(|routing| *routing),
                    });
                }
                ManagedSessionJsonlRecord::Message { message } => {
                    if header.is_none() {
                        bail!("Managed session JSONL file is missing the header record");
                    }
                    messages.push(message);
                }
            }
        }

        let mut session =
            header.ok_or_else(|| anyhow::anyhow!("Managed session JSONL file is empty"))?;
        session.messages = messages;
        Ok(session)
    }

    fn validate(&self) -> Result<()> {
        if self.version == 0 || self.version > MANAGED_SESSION_VERSION {
            bail!(
                "Unsupported managed session version {} (max supported: {})",
                self.version,
                MANAGED_SESSION_VERSION
            );
        }

        if self.session_id.trim().is_empty() {
            bail!("Managed session is missing a session_id");
        }

        if self.updated_at < self.created_at {
            bail!("Managed session updated_at is earlier than created_at");
        }

        Ok(())
    }

    fn write_jsonl(&self, writer: &mut impl Write) -> Result<()> {
        let header = ManagedSessionJsonlRecord::Header {
            version: self.version,
            session_id: self.session_id.clone(),
            created_at: self.created_at,
            updated_at: self.updated_at,
            fork: self.fork.clone().map(Box::new),
            title: self.title.clone(),
            model: self.model.clone(),
            workspace_root: self.workspace_root.clone(),
            created_by: self.created_by.clone(),
            archived_at: self.archived_at,
            permission_mode: self.permission_mode,
            plan_mode: self.plan_mode,
            plan_approved: self.plan_approved,
            current_plan: self.current_plan.clone(),
            fast_mode: self.fast_mode,
            output_style: self.output_style.clone(),
            fallback_model_ids: self.fallback_model_ids.clone(),
            auto_routing: self.auto_routing.clone().map(Box::new),
        };
        serde_json::to_writer(&mut *writer, &header)
            .context("Failed to serialize managed session header")?;
        writer
            .write_all(b"\n")
            .context("Failed to write session header newline")?;

        for message in &self.messages {
            let record = ManagedSessionJsonlRecord::Message {
                message: message.clone(),
            };
            serde_json::to_writer(&mut *writer, &record)
                .context("Failed to serialize managed session message")?;
            writer
                .write_all(b"\n")
                .context("Failed to write session message newline")?;
        }

        Ok(())
    }
}

#[cfg(test)]
mod tests {
    use super::ManagedSessionForkMetadata;
    use super::{ManagedSession, ManagedSessionAutoRouting};
    use crate::models::{ContentBlock, Message};
    use chrono::{TimeZone, Utc};
    use tempfile::tempdir;

    fn sample_messages() -> Vec<Message> {
        vec![
            Message::text("user", "hello"),
            Message::blocks(
                "assistant",
                vec![ContentBlock::Text {
                    text: "world".to_string(),
                }],
            ),
        ]
    }

    #[test]
    fn jsonl_round_trip_preserves_auto_routing_continuity() {
        let temp_dir = tempdir().unwrap();
        let path = temp_dir.path().join("auto-session.jsonl");
        let mut session = ManagedSession::new("auto-session", Utc::now());
        session.auto_routing = Some(ManagedSessionAutoRouting {
            selection: "auto-balanced".to_string(),
            model_key: "claude-sonnet-5".to_string(),
            task_type: agiworkforce_protocol::developer_session::DeveloperRoutingTaskType::Coding,
            trust_mode: agiworkforce_model_registry::TrustMode::Byok,
        });

        session.save_to_path(&path).expect("save Auto session");
        let restored = ManagedSession::load_from_path(&path).expect("load Auto session");

        assert_eq!(restored.auto_routing, session.auto_routing);
    }

    fn null_state_fields() -> (
        Option<crate::cli_options::PermissionMode>,
        Option<bool>,
        Option<bool>,
        Option<crate::features::plan::plan_mode::Plan>,
        Option<bool>,
        Option<String>,
        Option<Vec<String>>,
    ) {
        (None, None, None, None, None, None, None)
    }

    #[test]
    fn jsonl_round_trip_preserves_session_snapshot() {
        let temp_dir = tempdir().unwrap();
        let path = temp_dir.path().join("session.jsonl");
        let source_path = temp_dir.path().join("source.jsonl");
        let (
            permission_mode,
            plan_mode,
            plan_approved,
            current_plan,
            fast_mode,
            output_style,
            fallback_model_ids,
        ) = null_state_fields();
        let session = ManagedSession {
            version: super::MANAGED_SESSION_VERSION,
            session_id: "session-123".to_string(),
            created_at: Utc.with_ymd_and_hms(2025, 1, 1, 10, 0, 0).unwrap(),
            updated_at: Utc.with_ymd_and_hms(2025, 1, 1, 10, 30, 0).unwrap(),
            messages: sample_messages(),
            fork: Some(ManagedSessionForkMetadata {
                source_session_id: "source-abc".to_string(),
                source_session_path: Some(source_path),
                source_updated_at: Utc.with_ymd_and_hms(2025, 1, 1, 9, 45, 0).unwrap(),
                source_message_count: 2,
                forked_at: Utc.with_ymd_and_hms(2025, 1, 1, 10, 0, 0).unwrap(),
            }),
            title: Some("Fix the parser".to_string()),
            model: Some("registry/model-key".to_string()),
            workspace_root: Some(temp_dir.path().to_path_buf()),
            created_by: Some("vscode".to_string()),
            archived_at: None,
            permission_mode,
            plan_mode,
            plan_approved,
            current_plan,
            fast_mode,
            output_style,
            fallback_model_ids,
            auto_routing: None,
        };

        session.save_to_path(&path).unwrap();
        let loaded = ManagedSession::load_from_path(&path).unwrap();

        assert_eq!(
            serde_json::to_value(&loaded).unwrap(),
            serde_json::to_value(&session).unwrap()
        );
    }

    #[test]
    fn json_fallback_round_trip_preserves_session_snapshot() {
        let temp_dir = tempdir().unwrap();
        let path = temp_dir.path().join("session.json");
        let (
            permission_mode,
            plan_mode,
            plan_approved,
            current_plan,
            fast_mode,
            output_style,
            fallback_model_ids,
        ) = null_state_fields();
        let session = ManagedSession {
            version: super::MANAGED_SESSION_VERSION,
            session_id: "session-456".to_string(),
            created_at: Utc.with_ymd_and_hms(2025, 2, 1, 10, 0, 0).unwrap(),
            updated_at: Utc.with_ymd_and_hms(2025, 2, 1, 10, 5, 0).unwrap(),
            messages: sample_messages(),
            fork: None,
            title: None,
            model: None,
            workspace_root: None,
            created_by: None,
            archived_at: None,
            permission_mode,
            plan_mode,
            plan_approved,
            current_plan,
            fast_mode,
            output_style,
            fallback_model_ids,
            auto_routing: None,
        };

        session.save_to_path(&path).unwrap();
        let loaded = ManagedSession::load_from_path(&path).unwrap();

        assert_eq!(
            serde_json::to_value(&loaded).unwrap(),
            serde_json::to_value(&session).unwrap()
        );
    }

    #[test]
    fn v1_schema_jsonl_loads_without_state_fields() {
        let v1_jsonl = r#"{"record_type":"header","version":1,"session_id":"v1-session","created_at":"2025-03-01T00:00:00Z","updated_at":"2025-03-01T00:05:00Z"}
{"record_type":"message","message":{"role":"user","content":"hello"}}"#;
        let session = ManagedSession::from_serialized_str(v1_jsonl).unwrap();
        assert_eq!(session.session_id, "v1-session");
        assert_eq!(session.messages.len(), 1);
        assert!(session.permission_mode.is_none());
        assert!(session.plan_mode.is_none());
        assert!(session.fallback_model_ids.is_none());
        assert!(session.title.is_none());
        assert!(session.model.is_none());
        assert!(session.workspace_root.is_none());
        assert!(session.created_by.is_none());
        assert!(session.archived_at.is_none());
    }
}
