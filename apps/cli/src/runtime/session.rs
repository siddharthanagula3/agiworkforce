use anyhow::{bail, Context, Result};
use chrono::{DateTime, Utc};
use serde::{Deserialize, Serialize};
use std::fs;
use std::io::{BufWriter, Write};
use std::path::{Path, PathBuf};

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
    tmp.persist(target).map_err(|e| {
        anyhow::anyhow!(
            "Failed to rename tempfile to {}: {}",
            target.display(),
            e
        )
    })?;
    Ok(())
}

/// Current on-disk schema version for managed CLI sessions.
pub const MANAGED_SESSION_VERSION: u32 = 1;

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
        fork: Option<ManagedSessionForkMetadata>,
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
            writer.flush().with_context(|| {
                format!("Failed to flush session buffer {}", path.display())
            })?;
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
        let mut header: Option<(
            u32,
            String,
            DateTime<Utc>,
            DateTime<Utc>,
            Option<ManagedSessionForkMetadata>,
        )> = None;
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
                } => {
                    if header.is_some() {
                        bail!("Managed session JSONL file contains more than one header record");
                    }
                    header = Some((version, session_id, created_at, updated_at, fork));
                }
                ManagedSessionJsonlRecord::Message { message } => {
                    if header.is_none() {
                        bail!("Managed session JSONL file is missing the header record");
                    }
                    messages.push(message);
                }
            }
        }

        let (version, session_id, created_at, updated_at, fork) =
            header.ok_or_else(|| anyhow::anyhow!("Managed session JSONL file is empty"))?;

        Ok(Self {
            version,
            session_id,
            created_at,
            updated_at,
            messages,
            fork,
        })
    }

    fn validate(&self) -> Result<()> {
        if self.version != MANAGED_SESSION_VERSION {
            bail!(
                "Unsupported managed session version {} (expected {})",
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
            fork: self.fork.clone(),
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
    use super::ManagedSession;
    use super::ManagedSessionForkMetadata;
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
    fn jsonl_round_trip_preserves_session_snapshot() {
        let temp_dir = tempdir().unwrap();
        let path = temp_dir.path().join("session.jsonl");
        let source_path = temp_dir.path().join("source.jsonl");
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
        let session = ManagedSession {
            version: super::MANAGED_SESSION_VERSION,
            session_id: "session-456".to_string(),
            created_at: Utc.with_ymd_and_hms(2025, 2, 1, 10, 0, 0).unwrap(),
            updated_at: Utc.with_ymd_and_hms(2025, 2, 1, 10, 5, 0).unwrap(),
            messages: sample_messages(),
            fork: None,
        };

        session.save_to_path(&path).unwrap();
        let loaded = ManagedSession::load_from_path(&path).unwrap();

        assert_eq!(
            serde_json::to_value(&loaded).unwrap(),
            serde_json::to_value(&session).unwrap()
        );
    }
}
