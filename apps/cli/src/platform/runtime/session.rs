use agiworkforce_model_registry::TrustMode;
use agiworkforce_protocol::developer_session::DeveloperRoutingTaskType;
use anyhow::{bail, Context, Result};
use chrono::{DateTime, Utc};
use serde::{Deserialize, Serialize};
use std::fs;
use std::io::{BufWriter, Read, Write};
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
/// v5: adds canonical provider + privacy routing authority. Older sessions
///     remain listable, but callers must not resume them without an explicit
///     authority migration.
pub const MANAGED_SESSION_VERSION: u32 = 5;

pub const MANAGED_SESSION_ID_MAX_ENCODED_UNITS: usize = 200;
pub const MANAGED_SESSION_TITLE_MAX_UTF16: usize = 500;
pub const MANAGED_SESSION_MODEL_MAX_UTF16: usize = 200;
pub const MANAGED_SESSION_CWD_MAX_UTF16: usize = 16_384;
pub const MANAGED_SESSION_MAX_MESSAGES: usize = 10_000;
pub const MANAGED_SESSION_MESSAGE_ROLE_MAX_UTF16: usize = 40;
pub const MANAGED_SESSION_MESSAGE_TEXT_MAX_UTF16: usize = 1_000_000;
pub const MANAGED_SESSION_FILE_MAX_BYTES: usize = 64 * 1024 * 1024;

/// Default JSONL extension for managed session files.
pub const MANAGED_SESSION_JSONL_EXTENSION: &str = "jsonl";

/// Durable privacy boundary for a CLI developer session.
#[derive(Debug, Clone, Copy, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "snake_case")]
pub enum PrivacyMode {
    Local,
    Byok,
    Managed,
}

impl PrivacyMode {
    pub fn label(self) -> &'static str {
        match self {
            Self::Local => "local",
            Self::Byok => "byok",
            Self::Managed => "managed",
        }
    }

    pub fn description(self) -> &'static str {
        match self {
            Self::Local => "no prompt, chat, or file context should leave this device",
            Self::Byok => {
                "selected context may be sent directly to the user's configured provider key"
            }
            Self::Managed => "selected context may be sent through AGI managed cloud",
        }
    }

    pub fn from_arg(arg: &str) -> Option<Self> {
        match arg.trim().to_ascii_lowercase().as_str() {
            "local" | "offline" | "device" => Some(Self::Local),
            "byok" | "cloud-byok" | "provider" => Some(Self::Byok),
            "managed" | "agi" | "agi-cloud" | "cloud" => Some(Self::Managed),
            _ => None,
        }
    }
}

/// Persisted routing authority. Keeping the provider and privacy boundary in
/// one record prevents a partial legacy record from being treated as safe.
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
pub struct ManagedSessionRoutingAuthority {
    pub privacy_mode: PrivacyMode,
    pub provider: String,
}

impl ManagedSessionRoutingAuthority {
    /// Return a provider value that is safe to use as routing authority or to
    /// expose through the developer-session protocol. Persisted files are
    /// user-editable, so their strings cannot be trusted merely because serde
    /// accepted them.
    pub fn validated_provider(&self) -> Result<&str> {
        if self.provider.trim().is_empty() {
            bail!("persisted provider authority must be non-empty");
        }
        if self.provider.encode_utf16().count() > 200 {
            bail!("persisted provider authority exceeds 200 UTF-16 code units");
        }
        if contains_protocol_control(&self.provider) {
            bail!("persisted provider authority contains a prohibited control character");
        }
        Ok(&self.provider)
    }
}

fn contains_protocol_control(value: &str) -> bool {
    value
        .chars()
        .any(|character| matches!(character, '\u{0000}'..='\u{001f}' | '\u{007f}'..='\u{009f}'))
}

pub(crate) fn validate_summary_text(value: &str, field: &str, max_utf16: usize) -> Result<()> {
    if value.trim().is_empty() {
        bail!("Managed session {field} must be non-empty when present");
    }
    if value.encode_utf16().count() > max_utf16 {
        bail!("Managed session {field} exceeds {max_utf16} UTF-16 code units");
    }
    if contains_protocol_control(value) {
        bail!("Managed session {field} contains a prohibited control character");
    }
    Ok(())
}

/// Validate an ID before it can become either protocol metadata or a filename.
/// Explicit CLI path references use `ManagedSessionReference::Path` and do not
/// pass through this identifier validator.
pub fn validate_managed_session_id(session_id: &str) -> Result<&str> {
    if session_id.trim().is_empty() {
        bail!("Managed session is missing a session_id");
    }
    if session_id.as_bytes().len() > MANAGED_SESSION_ID_MAX_ENCODED_UNITS
        || session_id.encode_utf16().count() > MANAGED_SESSION_ID_MAX_ENCODED_UNITS
    {
        bail!(
            "Managed session_id exceeds {} encoded units",
            MANAGED_SESSION_ID_MAX_ENCODED_UNITS
        );
    }
    if matches!(session_id, "." | "..") {
        bail!("Managed session_id cannot be a dot segment");
    }
    if contains_protocol_control(session_id) {
        bail!("Managed session_id contains a prohibited control character");
    }
    if session_id
        .chars()
        .any(|character| !(character.is_alphanumeric() || matches!(character, '-' | '_' | '.')))
    {
        bail!("Managed session_id may contain only letters, numbers, '.', '-', and '_'");
    }
    Ok(session_id)
}

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
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub routing_authority: Option<ManagedSessionRoutingAuthority>,
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
        #[serde(default, skip_serializing_if = "Option::is_none")]
        routing_authority: Option<Box<ManagedSessionRoutingAuthority>>,
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
            routing_authority: None,
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
        Self::fork_with_messages(
            source,
            session_id,
            forked_at,
            source_session_path,
            source.messages.clone(),
        )
    }

    /// Create a fork that retains ancestry metadata but inherits no source
    /// messages. Local→cloud continuation uses this constructor so unselected
    /// Local context is never written into the destination file, even briefly.
    pub fn redacted_continuation_from(
        source: &ManagedSession,
        session_id: impl Into<String>,
        forked_at: DateTime<Utc>,
        source_session_path: Option<PathBuf>,
    ) -> Self {
        Self::fork_with_messages(
            source,
            session_id,
            forked_at,
            source_session_path,
            Vec::new(),
        )
    }

    fn fork_with_messages(
        source: &ManagedSession,
        session_id: impl Into<String>,
        forked_at: DateTime<Utc>,
        source_session_path: Option<PathBuf>,
        messages: Vec<Message>,
    ) -> Self {
        Self {
            version: MANAGED_SESSION_VERSION,
            session_id: session_id.into(),
            created_at: forked_at,
            updated_at: forked_at,
            messages,
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
            routing_authority: source.routing_authority.clone(),
        }
    }

    /// Return the routing authority required to resume or run this session.
    /// Absence is expected for legacy v1-v4 files, which remain listable but
    /// must be explicitly migrated before execution.
    pub fn require_routing_authority(&self) -> Result<&ManagedSessionRoutingAuthority> {
        let authority = self.routing_authority.as_ref().ok_or_else(|| {
            anyhow::anyhow!(
                "Managed session '{}' has unknown routing authority; choose an explicit privacy mode and provider before resuming",
                self.session_id
            )
        })?;
        authority.validated_provider().with_context(|| {
            format!(
                "Managed session '{}' has invalid routing authority",
                self.session_id
            )
        })?;
        Ok(authority)
    }

    pub fn require_model(&self) -> Result<&str> {
        let model = self
            .model
            .as_deref()
            .filter(|model| !model.trim().is_empty())
            .ok_or_else(|| {
                anyhow::anyhow!(
                    "Managed session '{}' has no persisted model and cannot be resumed safely",
                    self.session_id
                )
            })?;
        validate_summary_text(model, "model", MANAGED_SESSION_MODEL_MAX_UTF16)
            .with_context(|| format!("Managed session '{}' has invalid model", self.session_id))?;
        Ok(model)
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
        self.validate_for_write()?;
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

        if buf.len() > MANAGED_SESSION_FILE_MAX_BYTES {
            bail!(
                "Managed session file {} would exceed the {} byte limit",
                path.display(),
                MANAGED_SESSION_FILE_MAX_BYTES
            );
        }

        atomic_write_session(path, &buf)
            .with_context(|| format!("Failed to write session file {}", path.display()))
    }

    /// Load a managed session from a JSONL or JSON file.
    pub fn load_from_path(path: impl AsRef<Path>) -> Result<Self> {
        let path = path.as_ref();
        let metadata = fs::metadata(path).with_context(|| {
            format!("Failed to inspect managed session file {}", path.display())
        })?;
        if metadata.len() > MANAGED_SESSION_FILE_MAX_BYTES as u64 {
            bail!(
                "Managed session file {} exceeds the {} byte limit",
                path.display(),
                MANAGED_SESSION_FILE_MAX_BYTES
            );
        }
        let file = fs::File::open(path)
            .with_context(|| format!("Failed to open managed session file {}", path.display()))?;
        let mut contents = String::new();
        file.take((MANAGED_SESSION_FILE_MAX_BYTES + 1) as u64)
            .read_to_string(&mut contents)
            .with_context(|| format!("Failed to read managed session file {}", path.display()))?;
        if contents.len() > MANAGED_SESSION_FILE_MAX_BYTES {
            bail!(
                "Managed session file {} exceeds the {} byte limit",
                path.display(),
                MANAGED_SESSION_FILE_MAX_BYTES
            );
        }
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
                    routing_authority,
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
                        routing_authority: routing_authority.map(|authority| *authority),
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

        validate_managed_session_id(&self.session_id)?;

        if let Some(title) = self.title.as_deref() {
            validate_summary_text(title, "title", MANAGED_SESSION_TITLE_MAX_UTF16)?;
        }
        if let Some(model) = self.model.as_deref() {
            validate_summary_text(model, "model", MANAGED_SESSION_MODEL_MAX_UTF16)?;
        }
        if let Some(workspace_root) = self.workspace_root.as_ref() {
            validate_summary_text(
                &workspace_root.to_string_lossy(),
                "workspace_root",
                MANAGED_SESSION_CWD_MAX_UTF16,
            )?;
        }

        if self.messages.len() > MANAGED_SESSION_MAX_MESSAGES {
            bail!("Managed session contains more than {MANAGED_SESSION_MAX_MESSAGES} messages");
        }
        for message in &self.messages {
            validate_summary_text(
                &message.role,
                "message role",
                MANAGED_SESSION_MESSAGE_ROLE_MAX_UTF16,
            )?;
            let text = message.text_content();
            if text.encode_utf16().count() > MANAGED_SESSION_MESSAGE_TEXT_MAX_UTF16 {
                bail!(
                    "Managed session message text exceeds {MANAGED_SESSION_MESSAGE_TEXT_MAX_UTF16} UTF-16 code units"
                );
            }
        }

        if self.updated_at < self.created_at {
            bail!("Managed session updated_at is earlier than created_at");
        }

        Ok(())
    }

    fn validate_for_write(&self) -> Result<()> {
        self.validate()?;
        if let Some(authority) = self.routing_authority.as_ref() {
            authority.validated_provider().with_context(|| {
                format!(
                    "Managed session '{}' has invalid routing authority",
                    self.session_id
                )
            })?;
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
            routing_authority: self.routing_authority.clone().map(Box::new),
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
    use super::{
        ManagedSession, ManagedSessionAutoRouting, ManagedSessionRoutingAuthority, PrivacyMode,
    };
    use crate::models::{ContentBlock, Message};
    use chrono::{TimeZone, Utc};
    use std::path::PathBuf;
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
        session.model = Some("claude-sonnet-5".to_string());
        session.routing_authority = Some(ManagedSessionRoutingAuthority {
            privacy_mode: PrivacyMode::Byok,
            provider: "anthropic".to_string(),
        });

        session.save_to_path(&path).expect("save Auto session");
        let restored = ManagedSession::load_from_path(&path).expect("load Auto session");

        assert_eq!(restored.auto_routing, session.auto_routing);
        assert_eq!(restored.routing_authority, session.routing_authority);
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
            routing_authority: None,
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
            routing_authority: None,
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
        assert!(session.require_routing_authority().is_err());
    }

    #[test]
    fn redacted_continuation_keeps_ancestry_without_inheriting_messages() {
        let source = ManagedSession::with_messages(
            "source",
            Utc::now(),
            vec![Message::text("user", "local-only secret")],
        );
        let continuation =
            ManagedSession::redacted_continuation_from(&source, "destination", Utc::now(), None);

        assert!(continuation.messages.is_empty());
        let fork = continuation.fork.expect("fork ancestry");
        assert_eq!(fork.source_session_id, "source");
        assert_eq!(fork.source_message_count, 1);
    }

    #[test]
    fn persisted_provider_authority_enforces_protocol_string_bounds() {
        let valid = ManagedSessionRoutingAuthority {
            privacy_mode: PrivacyMode::Byok,
            provider: "p".repeat(200),
        };
        assert_eq!(valid.validated_provider().unwrap().len(), 200);

        for invalid in [
            String::new(),
            "   ".to_string(),
            "p".repeat(201),
            "bad\u{0000}provider".to_string(),
            "bad\u{001f}provider".to_string(),
            "bad\u{007f}provider".to_string(),
            "bad\u{009f}provider".to_string(),
        ] {
            let authority = ManagedSessionRoutingAuthority {
                privacy_mode: PrivacyMode::Byok,
                provider: invalid,
            };
            assert!(authority.validated_provider().is_err());
        }
    }

    #[test]
    fn malformed_provider_authority_is_rejected_before_persistence() {
        let temp_dir = tempdir().unwrap();
        let mut session = ManagedSession::new("invalid-provider", Utc::now());
        session.routing_authority = Some(ManagedSessionRoutingAuthority {
            privacy_mode: PrivacyMode::Byok,
            provider: "bad\u{0085}provider".to_string(),
        });

        let error = session
            .save_to_path(temp_dir.path().join("invalid-provider.jsonl"))
            .unwrap_err();

        assert!(error.to_string().contains("invalid routing authority"));
    }

    #[test]
    fn durable_session_ids_reject_traversal_separators_controls_and_oversize_values() {
        for valid in ["session-123", "fork_name", "release.2026"] {
            assert_eq!(super::validate_managed_session_id(valid).unwrap(), valid);
        }
        for invalid in [
            "",
            ".",
            "..",
            "../../escape",
            "folder\\escape",
            "bad\nidentifier",
            "bad identifier",
        ] {
            assert!(
                super::validate_managed_session_id(invalid).is_err(),
                "unsafe id accepted: {invalid:?}"
            );
        }
        assert!(super::validate_managed_session_id(&"x".repeat(201)).is_err());
    }

    #[test]
    fn tampered_protocol_summary_fields_are_rejected_on_load() {
        let assert_rejected = |session: ManagedSession, field: &str| {
            let serialized = serde_json::to_string(&session).expect("serialize tampered session");
            let error = ManagedSession::from_serialized_str(&serialized)
                .expect_err("tampered summary field must be rejected");
            assert!(error.to_string().contains(field), "{error:#}");
        };

        let mut bad_id = ManagedSession::new("valid-id", Utc::now());
        bad_id.session_id = "../../escape".to_string();
        assert_rejected(bad_id, "session_id");

        let mut bad_title = ManagedSession::new("bad-title", Utc::now());
        bad_title.title = Some("t".repeat(super::MANAGED_SESSION_TITLE_MAX_UTF16 + 1));
        assert_rejected(bad_title, "title");

        let mut bad_model = ManagedSession::new("bad-model", Utc::now());
        bad_model.model = Some("model\u{0085}injection".to_string());
        assert_rejected(bad_model, "model");

        let mut bad_cwd = ManagedSession::new("bad-cwd", Utc::now());
        bad_cwd.workspace_root = Some(PathBuf::from(format!(
            "/{}",
            "w".repeat(super::MANAGED_SESSION_CWD_MAX_UTF16 + 1)
        )));
        assert_rejected(bad_cwd, "workspace_root");
    }

    #[test]
    fn tampered_message_projection_bounds_are_rejected() {
        let mut too_many = ManagedSession::new("too-many-messages", Utc::now());
        too_many.messages =
            vec![Message::text("user", "x"); super::MANAGED_SESSION_MAX_MESSAGES + 1];
        assert!(too_many
            .validate()
            .expect_err("message count must be bounded")
            .to_string()
            .contains("messages"));

        let mut bad_role = ManagedSession::new("bad-message-role", Utc::now());
        bad_role
            .messages
            .push(Message::text("assistant\u{0085}injected", "x"));
        assert!(bad_role
            .validate()
            .expect_err("message role controls must be rejected")
            .to_string()
            .contains("message role"));

        let mut long_text = ManagedSession::new("long-message-text", Utc::now());
        long_text.messages.push(Message::text(
            "user",
            "x".repeat(super::MANAGED_SESSION_MESSAGE_TEXT_MAX_UTF16 + 1),
        ));
        assert!(long_text
            .validate()
            .expect_err("message text must be bounded")
            .to_string()
            .contains("message text"));
    }

    #[test]
    fn oversized_session_file_is_rejected_before_parsing() {
        let temp_dir = tempdir().unwrap();
        let path = temp_dir.path().join("oversized.jsonl");
        let file = std::fs::File::create(&path).expect("create sparse session file");
        file.set_len((super::MANAGED_SESSION_FILE_MAX_BYTES + 1) as u64)
            .expect("extend sparse session file");

        let error = ManagedSession::load_from_path(&path)
            .expect_err("oversized session must be rejected before parsing");
        assert!(error.to_string().contains("exceeds"), "{error:#}");
    }
}
