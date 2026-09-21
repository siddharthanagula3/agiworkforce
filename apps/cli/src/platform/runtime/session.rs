use agiworkforce_model_registry::TrustMode;
use agiworkforce_protocol::code_domain::{
    CodeSession, CodeSessionId, PermissionProfileId, RepositoryId, RepositorySnapshot,
    SessionClient,
};
use agiworkforce_protocol::developer_session::{
    DeveloperRoutingTaskType, DeveloperSessionSource, DeveloperSessionTrustMode,
    HandoffArchitecture,
};
use anyhow::{bail, Context, Result};
use chrono::{DateTime, Utc};
use serde::{Deserialize, Serialize};
use std::fs;
use std::io::{BufWriter, Read, Write};
use std::path::{Path, PathBuf};

use crate::cli_options::PermissionMode;
use crate::features::plan::plan_mode::Plan;
use crate::models::Message;
use crate::platform::runtime::change_reason::ChangeReason;
use crate::platform::runtime::validation_run::ValidationKind;

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

/// What this process last saw on disk for a session path: byte length and
/// modification time.
///
/// Two processes on one session id (two terminals, or a terminal and the
/// app-server) each load, each append, and each rewrite the whole file, so the
/// second rename erases the first writer's turns with no trace. Messages carry
/// no identifier, only a role and content, so the two files cannot be merged
/// without inventing an order the user never had. Detect the collision instead
/// and keep the copy that would have been destroyed.
static SESSION_FINGERPRINTS: std::sync::Mutex<
    Option<std::collections::HashMap<PathBuf, (u64, std::time::SystemTime)>>,
> = std::sync::Mutex::new(None);

fn fingerprint_of(path: &Path) -> Option<(u64, std::time::SystemTime)> {
    let meta = fs::metadata(path).ok()?;
    Some((meta.len(), meta.modified().ok()?))
}

fn remember_fingerprint(path: &Path) {
    let Some(current) = fingerprint_of(path) else {
        return;
    };
    if let Ok(mut held) = SESSION_FINGERPRINTS.lock() {
        held.get_or_insert_with(std::collections::HashMap::new)
            .insert(path.to_path_buf(), current);
    }
}

/// Drop what this process remembers about `path`, so a test can act as a
/// second process without spawning one.
#[cfg(test)]
pub(crate) fn forget_fingerprint(path: &Path) {
    if let Ok(mut held) = SESSION_FINGERPRINTS.lock() {
        if let Some(map) = held.as_mut() {
            map.remove(path);
        }
    }
}

fn seen_fingerprint(path: &Path) -> Option<(u64, std::time::SystemTime)> {
    let held = SESSION_FINGERPRINTS.lock().ok()?;
    held.as_ref()?.get(path).copied()
}

/// Move a session file that changed underneath us out of the way, so the write
/// about to happen cannot destroy it. Returns the path it was kept at.
fn quarantine_conflicting_session(path: &Path) -> Option<PathBuf> {
    let stamp = chrono::Utc::now().format("%Y%m%dT%H%M%S%.3f");
    let mut kept = path.as_os_str().to_os_string();
    kept.push(format!(".conflict-{stamp}"));
    let kept = PathBuf::from(kept);
    match fs::rename(path, &kept) {
        Ok(()) => Some(kept),
        Err(_) => None,
    }
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
/// v6: embeds the canonical `CodeSession`. A file written before v6 has none,
///     and [`ManagedSession::code_session`] derives one from the legacy
///     fields, so every persisted session reads as one domain record whether
///     or not it was written as one.
pub const MANAGED_SESSION_VERSION: u32 = 6;

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

    /// The trust-boundary word shown to a person: "Local" / "Your key" /
    /// "Managed", the same vocabulary the VS Code extension and the TUI's
    /// `AccessMode::trust_word` use. `label` stays the lowercase config value
    /// (persisted project settings, `--privacy` arg parsing) and must not
    /// change to match.
    pub fn trust_word(self) -> &'static str {
        match self {
            Self::Local => "Local",
            Self::Byok => "Your key",
            Self::Managed => "Managed",
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
    if session_id.len() > MANAGED_SESSION_ID_MAX_ENCODED_UNITS
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

pub const MANAGED_SESSION_MAX_APPROVALS: usize = 1_000;
pub const MANAGED_SESSION_MAX_FILE_CHANGES: usize = 5_000;
pub const MANAGED_SESSION_MAX_VALIDATIONS: usize = 1_000;
const MANAGED_SESSION_ACTIVITY_TEXT_MAX_CHARS: usize = 500;

#[derive(Debug, Clone, Copy, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "snake_case")]
pub enum ManagedSessionApprovalOutcome {
    AllowOnce,
    AllowSession,
    AlwaysAllow,
    Deny,
    Cancel,
    Timeout,
}

/// One approval decided on this session, whichever surface asked for it.
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
pub struct ManagedSessionApproval {
    pub request_id: String,
    pub kind: String,
    pub summary: String,
    pub outcome: ManagedSessionApprovalOutcome,
    pub requested_at: DateTime<Utc>,
    pub decided_at: DateTime<Utc>,
}

#[derive(Debug, Clone, Copy, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "snake_case")]
pub enum ManagedSessionFileChangeKind {
    Created,
    Modified,
}

/// One file a tool on this session wrote. `Created` marks a generated file.
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
pub struct ManagedSessionFileChange {
    pub path: PathBuf,
    pub kind: ManagedSessionFileChangeKind,
    pub tool: String,
    pub tool_call_id: String,
    pub changed_at: DateTime<Utc>,
    /// Why the file changed, read from the text the write replaced. Absent on
    /// sessions written before the recorder classified its own writes.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub reason: Option<ChangeReason>,
}

/// How a check the session ran came out. `Interrupted` is a run that started
/// and never reported, so nothing about the work was proved by it.
#[derive(Debug, Clone, Copy, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "snake_case")]
pub enum ManagedSessionValidationOutcome {
    Passed,
    Failed,
    Interrupted,
}

/// One check the session ran against the work: the command, what kind of check
/// it is, how it came out, and the commit it ran against.
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
pub struct ManagedSessionValidation {
    pub command: String,
    pub kind: ValidationKind,
    pub outcome: ManagedSessionValidationOutcome,
    pub ran_at: DateTime<Utc>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub commit: Option<String>,
}

/// What a coding session holds that its transcript does not: the work it was
/// asked to do and what it has established about it.
#[derive(Debug, Clone)]
pub struct SessionWorkingState<'a> {
    pub objective: Option<&'a str>,
    pub decisions: &'a [ManagedSessionApproval],
    pub architecture: Option<&'a HandoffArchitecture>,
    pub plan: Option<&'a Plan>,
    pub modified_files: &'a [ManagedSessionFileChange],
    pub validations: &'a [ManagedSessionValidation],
    pub branch: Option<&'a str>,
    pub worktree_root: Option<&'a Path>,
}

/// Make recorded activity text safe to persist and to hand to a protocol
/// client: one line, bounded.
pub fn activity_text(value: &str) -> String {
    value
        .chars()
        .map(|character| {
            if matches!(character, '\u{0000}'..='\u{001f}' | '\u{007f}'..='\u{009f}') {
                ' '
            } else {
                character
            }
        })
        .take(MANAGED_SESSION_ACTIVITY_TEXT_MAX_CHARS)
        .collect()
}

/// Append to a bounded activity log, dropping the oldest entries.
pub fn push_bounded<T>(log: &mut Vec<T>, entry: T, max: usize) {
    log.push(entry);
    if log.len() > max {
        let excess = log.len() - max;
        log.drain(..excess);
    }
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
    /// `clientInfo.name` of the app-server connection that created this
    /// session. `created_by` is the coarse surface; this is the exact client.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub client: Option<String>,
    /// Workspace branch and worktree root as of the last turn.
    ///
    /// Persisted rather than probed: listing a hundred threads must not shell
    /// out to git a hundred times, and a thread whose checkout has since moved
    /// still reports where its work actually happened.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub git_branch: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub worktree_root: Option<PathBuf>,
    /// The workspace's `origin` remote with any credential removed.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub repository: Option<String>,
    #[serde(default, skip_serializing_if = "Vec::is_empty")]
    pub approvals: Vec<ManagedSessionApproval>,
    #[serde(default, skip_serializing_if = "Vec::is_empty")]
    pub file_changes: Vec<ManagedSessionFileChange>,
    /// Checks this session ran against the work, oldest first.
    #[serde(default, skip_serializing_if = "Vec::is_empty")]
    pub validations: Vec<ManagedSessionValidation>,
    /// What the session was asked to do, kept when it arrives. The transcript
    /// it came in on is compacted away; this is not.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub objective: Option<String>,
    /// What the session established about the repository it works in. Read
    /// once from the workspace rather than re-derived from the transcript, so
    /// compaction cannot take it either.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub architecture: Option<HandoffArchitecture>,
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
    /// The canonical domain record this file is a persistence of. Absent on
    /// files written before v6; [`ManagedSession::code_session`] derives one
    /// for those rather than making callers branch on the file's age.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub code: Option<Box<CodeSession>>,
}

/// The header record's payload, boxed by the record enum below.
///
/// Its own struct so the enum stays small: the header carries every persisted
/// session field and the message record carries one message, and an enum is as
/// large as its largest variant, so every message record would otherwise pay
/// the header's size. A field added here costs the enum nothing.
#[derive(Debug, Clone, Serialize, Deserialize)]
struct ManagedSessionJsonlHeader {
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
    client: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    git_branch: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    worktree_root: Option<PathBuf>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    repository: Option<String>,
    #[serde(default, skip_serializing_if = "Vec::is_empty")]
    approvals: Vec<ManagedSessionApproval>,
    #[serde(default, skip_serializing_if = "Vec::is_empty")]
    file_changes: Vec<ManagedSessionFileChange>,
    #[serde(default, skip_serializing_if = "Vec::is_empty")]
    validations: Vec<ManagedSessionValidation>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    objective: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    architecture: Option<HandoffArchitecture>,
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
    fallback_model_ids: Box<Option<Vec<String>>>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    auto_routing: Option<Box<ManagedSessionAutoRouting>>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    routing_authority: Option<Box<ManagedSessionRoutingAuthority>>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    code: Option<Box<CodeSession>>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(tag = "record_type", rename_all = "snake_case")]
enum ManagedSessionJsonlRecord {
    Header(Box<ManagedSessionJsonlHeader>),
    Message { message: Message },
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
            client: None,
            git_branch: None,
            worktree_root: None,
            repository: None,
            approvals: Vec::new(),
            file_changes: Vec::new(),
            validations: Vec::new(),
            objective: None,
            architecture: None,
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
            code: None,
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
            client: source.client.clone(),
            git_branch: source.git_branch.clone(),
            worktree_root: source.worktree_root.clone(),
            repository: source.repository.clone(),
            approvals: Vec::new(),
            file_changes: Vec::new(),
            validations: Vec::new(),
            objective: None,
            architecture: None,
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
            code: None,
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
        if self.objective.is_none() && message.role == "user" {
            let text = activity_text(&message.text_content());
            if !text.trim().is_empty() {
                self.objective = Some(text);
            }
        }
        self.messages.push(message);
        self.touch();
    }

    /// What the session is working on and what it has established, as it
    /// stands after any amount of the transcript has been compacted away.
    pub fn working_state(&self) -> SessionWorkingState<'_> {
        SessionWorkingState {
            objective: self.objective.as_deref().or(self.title.as_deref()),
            decisions: &self.approvals,
            architecture: self.architecture.as_ref(),
            plan: self.current_plan.as_ref(),
            modified_files: &self.file_changes,
            validations: &self.validations,
            branch: self.git_branch.as_deref(),
            worktree_root: self.worktree_root.as_deref(),
        }
    }

    /// Refresh the `updated_at` timestamp.
    pub fn touch(&mut self) {
        self.updated_at = Utc::now();
    }

    fn developer_source(&self) -> DeveloperSessionSource {
        match self
            .created_by
            .as_deref()
            .unwrap_or_default()
            .to_ascii_lowercase()
            .as_str()
        {
            "cli" | "terminal" => DeveloperSessionSource::Cli,
            "vscode" | "vs-code" | "vs_code" => DeveloperSessionSource::Vscode,
            "desktop" => DeveloperSessionSource::Desktop,
            _ => DeveloperSessionSource::Unknown,
        }
    }

    fn developer_trust_mode(&self) -> DeveloperSessionTrustMode {
        match self
            .routing_authority
            .as_ref()
            .map(|authority| authority.privacy_mode)
        {
            Some(PrivacyMode::Local) => DeveloperSessionTrustMode::Local,
            Some(PrivacyMode::Byok) => DeveloperSessionTrustMode::Byok,
            Some(PrivacyMode::Managed) => DeveloperSessionTrustMode::Managed,
            None => DeveloperSessionTrustMode::Unknown,
        }
    }

    fn repository_id(&self) -> Option<RepositoryId> {
        if let Some(remote) = self
            .repository
            .as_deref()
            .filter(|url| !url.trim().is_empty())
        {
            return Some(crate::context::repository_identity_from_remote(remote));
        }
        self.worktree_root
            .as_ref()
            .or(self.workspace_root.as_ref())
            .map(|root| RepositoryId::new(root.display().to_string()))
    }

    /// The canonical [`CodeSession`] this file persists.
    ///
    /// A file written at v6 or later carries the record; one written earlier
    /// has its record derived from the legacy fields here, so a caller reads
    /// one domain type either way and never branches on a file's age.
    pub fn code_session(&self) -> CodeSession {
        if let Some(code) = self.code.as_deref() {
            return code.clone();
        }

        let repository_id = self.repository_id();
        let mut session = CodeSession::new(
            self.session_id.as_str(),
            self.developer_source(),
            self.developer_trust_mode(),
            self.created_at,
        );
        session.updated_at = self.updated_at;
        session.title = self.title.clone();
        session.model = self.model.clone();
        session.provider = self
            .routing_authority
            .as_ref()
            .map(|authority| authority.provider.clone());
        session.archived_at = self.archived_at;
        session.permission_profile_id =
            crate::permissions::permission_profile_id(self.permission_mode);
        session.environment.working_directory = self
            .workspace_root
            .clone()
            .or_else(|| self.worktree_root.clone());
        session.primary_repository_id = repository_id.clone();
        session.client = self.client.as_ref().map(|name| SessionClient {
            name: name.clone(),
            source: session.source,
            attached_at: self.updated_at,
        });
        if let (Some(branch), Some(repository_id)) = (self.git_branch.clone(), repository_id) {
            session.git =
                Some(RepositorySnapshot::new(repository_id, self.updated_at).on_branch(branch));
        }
        session
    }

    pub fn session_identity(&self) -> CodeSessionId {
        CodeSessionId::new(self.session_id.as_str())
    }

    pub fn permission_profile(&self) -> PermissionProfileId {
        self.code_session().permission_profile_id
    }

    /// Store the canonical record, keeping the legacy fields the rest of the
    /// CLI still reads in step with it.
    pub fn set_code_session(&mut self, session: CodeSession) {
        self.title = session.title.clone();
        self.model = session.model.clone();
        self.git_branch = session
            .git
            .as_ref()
            .and_then(|snapshot| snapshot.branch.clone());
        self.archived_at = session.archived_at;
        if let Some(directory) = session.environment.working_directory.clone() {
            self.workspace_root = Some(directory);
        }
        self.client = session.client.as_ref().map(|client| client.name.clone());
        self.code = Some(Box::new(session));
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

        if path.exists() && fingerprint_of(path) != seen_fingerprint(path) {
            match quarantine_conflicting_session(path) {
                Some(_) => eprintln!(
                    "[session] The saved session changed outside this process; its previous contents were preserved in the session directory"
                ),
                None => bail!(
                    "Managed session file {} changed outside this process and could not be set \
                     aside; refusing to overwrite it",
                    path.display()
                ),
            }
        }

        atomic_write_session(path, &buf)
            .with_context(|| format!("Failed to write session file {}", path.display()))?;
        remember_fingerprint(path);
        Ok(())
    }

    /// Load a managed session from a JSONL or JSON file.
    pub fn load_from_path(path: impl AsRef<Path>) -> Result<Self> {
        let path = path.as_ref();
        remember_fingerprint(path);
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
        let mut unreadable_lines: Vec<usize> = Vec::new();

        for (line_number, line) in contents.lines().enumerate() {
            let trimmed = line.trim();
            if trimmed.is_empty() {
                continue;
            }

            // A JSONL log exists so that damage stays on one line. Failing the
            // whole load on the first unreadable record threw away every good
            // message before it, which is the outcome an append-only format is
            // meant to rule out. The header is the exception below: without it
            // there is no session to return.
            let record: ManagedSessionJsonlRecord = match serde_json::from_str(trimmed) {
                Ok(record) => record,
                Err(error) => {
                    unreadable_lines.push(line_number + 1);
                    tracing::warn!(
                        line = line_number + 1,
                        %error,
                        "skipping an unreadable managed session record"
                    );
                    continue;
                }
            };

            match record {
                ManagedSessionJsonlRecord::Header(record) => {
                    if header.is_some() {
                        bail!("Managed session JSONL file contains more than one header record");
                    }
                    let record = *record;
                    header = Some(ManagedSession {
                        version: record.version,
                        session_id: record.session_id,
                        created_at: record.created_at,
                        updated_at: record.updated_at,
                        messages: Vec::new(),
                        fork: record.fork.map(|fork| *fork),
                        title: record.title,
                        model: record.model,
                        workspace_root: record.workspace_root,
                        created_by: record.created_by,
                        client: record.client,
                        git_branch: record.git_branch,
                        worktree_root: record.worktree_root,
                        repository: record.repository,
                        approvals: record.approvals,
                        file_changes: record.file_changes,
                        validations: record.validations,
                        objective: record.objective,
                        architecture: record.architecture,
                        archived_at: record.archived_at,
                        permission_mode: record.permission_mode,
                        plan_mode: record.plan_mode,
                        plan_approved: record.plan_approved,
                        current_plan: record.current_plan,
                        fast_mode: record.fast_mode,
                        output_style: record.output_style,
                        fallback_model_ids: *record.fallback_model_ids,
                        auto_routing: record.auto_routing.map(|routing| *routing),
                        routing_authority: record.routing_authority.map(|authority| *authority),
                        code: record.code,
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

        let mut session = header.ok_or_else(|| {
            if unreadable_lines.is_empty() {
                anyhow::anyhow!("Managed session JSONL file is empty")
            } else {
                // Every line was unreadable, so there is genuinely nothing to
                // open, and saying it is empty would be the wrong diagnosis.
                anyhow::anyhow!(
                    "Managed session JSONL file has no readable header record ({} unreadable line(s))",
                    unreadable_lines.len()
                )
            }
        })?;
        if !unreadable_lines.is_empty() {
            tracing::warn!(
                session_id = %session.session_id,
                skipped = unreadable_lines.len(),
                "managed session loaded with unreadable records skipped"
            );
        }
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

        if let Some(repository) = self.repository.as_deref() {
            validate_summary_text(repository, "repository", MANAGED_SESSION_CWD_MAX_UTF16)?;
        }
        if self.approvals.len() > MANAGED_SESSION_MAX_APPROVALS {
            bail!("Managed session records more than {MANAGED_SESSION_MAX_APPROVALS} approvals");
        }
        for approval in &self.approvals {
            validate_summary_text(
                &approval.request_id,
                "approval id",
                MANAGED_SESSION_MODEL_MAX_UTF16,
            )?;
            validate_summary_text(
                &approval.kind,
                "approval kind",
                MANAGED_SESSION_TITLE_MAX_UTF16,
            )?;
            if contains_protocol_control(&approval.summary)
                || approval.summary.encode_utf16().count() > MANAGED_SESSION_TITLE_MAX_UTF16
            {
                bail!("Managed session approval summary is not a bounded single line");
            }
        }
        if self.file_changes.len() > MANAGED_SESSION_MAX_FILE_CHANGES {
            bail!(
                "Managed session records more than {MANAGED_SESSION_MAX_FILE_CHANGES} file changes"
            );
        }
        for change in &self.file_changes {
            validate_summary_text(
                &change.path.to_string_lossy(),
                "file change path",
                MANAGED_SESSION_CWD_MAX_UTF16,
            )?;
            validate_summary_text(
                &change.tool,
                "file change tool",
                MANAGED_SESSION_MODEL_MAX_UTF16,
            )?;
            validate_summary_text(
                &change.tool_call_id,
                "file change tool call",
                MANAGED_SESSION_TITLE_MAX_UTF16,
            )?;
        }
        if self.validations.len() > MANAGED_SESSION_MAX_VALIDATIONS {
            bail!(
                "Managed session records more than {MANAGED_SESSION_MAX_VALIDATIONS} validations"
            );
        }
        for validation in &self.validations {
            validate_summary_text(
                &validation.command,
                "validation command",
                MANAGED_SESSION_TITLE_MAX_UTF16,
            )?;
            if let Some(commit) = &validation.commit {
                validate_summary_text(
                    commit,
                    "validation commit",
                    MANAGED_SESSION_MODEL_MAX_UTF16,
                )?;
            }
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
        let header = ManagedSessionJsonlRecord::Header(Box::new(ManagedSessionJsonlHeader {
            version: self.version,
            session_id: self.session_id.clone(),
            created_at: self.created_at,
            updated_at: self.updated_at,
            fork: self.fork.clone().map(Box::new),
            title: self.title.clone(),
            model: self.model.clone(),
            workspace_root: self.workspace_root.clone(),
            created_by: self.created_by.clone(),
            client: self.client.clone(),
            git_branch: self.git_branch.clone(),
            worktree_root: self.worktree_root.clone(),
            repository: self.repository.clone(),
            approvals: self.approvals.clone(),
            file_changes: self.file_changes.clone(),
            validations: self.validations.clone(),
            objective: self.objective.clone(),
            architecture: self.architecture.clone(),
            archived_at: self.archived_at,
            permission_mode: self.permission_mode,
            plan_mode: self.plan_mode,
            plan_approved: self.plan_approved,
            current_plan: self.current_plan.clone(),
            fast_mode: self.fast_mode,
            output_style: self.output_style.clone(),
            fallback_model_ids: Box::new(self.fallback_model_ids.clone()),
            auto_routing: self.auto_routing.clone().map(Box::new),
            routing_authority: self.routing_authority.clone().map(Box::new),
            code: self.code.clone(),
        }));
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
    use crate::models::{ContentBlock, Message, MessageContent};
    use agiworkforce_protocol::developer_session::{
        DeveloperSessionSource, DeveloperSessionTrustMode,
    };
    use chrono::{TimeZone, Utc};
    use std::path::{Path, PathBuf};
    use tempfile::tempdir;

    /// The config value (`label`) and the person-facing word (`trust_word`)
    /// must never collapse into the same string: the boundary notice in
    /// `cloud::client::CloudError` reads `trust_word`, while persisted project
    /// settings and `--privacy` parsing read `label`.
    #[test]
    fn label_stays_the_config_value_trust_word_reads_for_a_person() {
        assert_eq!(PrivacyMode::Local.label(), "local");
        assert_eq!(PrivacyMode::Byok.label(), "byok");
        assert_eq!(PrivacyMode::Managed.label(), "managed");
        assert_eq!(PrivacyMode::Local.trust_word(), "Local");
        assert_eq!(PrivacyMode::Byok.trust_word(), "Your key");
        assert_eq!(PrivacyMode::Managed.trust_word(), "Managed");
    }

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
            model_key: "fixture-route-model".to_string(),
            task_type: agiworkforce_protocol::developer_session::DeveloperRoutingTaskType::Coding,
            trust_mode: agiworkforce_model_registry::TrustMode::Byok,
        });
        session.model = Some("fixture-route-model".to_string());
        session.routing_authority = Some(ManagedSessionRoutingAuthority {
            privacy_mode: PrivacyMode::Byok,
            provider: "fixture-provider".to_string(),
        });

        session.save_to_path(&path).expect("save Auto session");
        let restored = ManagedSession::load_from_path(&path).expect("load Auto session");

        assert_eq!(restored.auto_routing, session.auto_routing);
        assert_eq!(restored.routing_authority, session.routing_authority);
    }

    #[test]
    fn a_session_written_before_v6_still_reads_as_one_code_session() {
        let mut session = ManagedSession::new("session-legacy", Utc::now());
        session.version = 5;
        session.code = None;
        session.title = Some("Fix the parser".to_string());
        session.model = Some("registry/model-key".to_string());
        session.created_by = Some("vscode".to_string());
        session.client = Some("agi-vscode".to_string());
        session.git_branch = Some("main".to_string());
        session.workspace_root = Some(PathBuf::from("/work/repo"));
        session.repository = Some("https://github.com/acme/widgets.git".to_string());
        session.routing_authority = Some(ManagedSessionRoutingAuthority {
            privacy_mode: PrivacyMode::Byok,
            provider: "fixture-provider".to_string(),
        });

        let code = session.code_session();

        assert_eq!(code.id.as_str(), "session-legacy");
        assert_eq!(code.title.as_deref(), Some("Fix the parser"));
        assert_eq!(code.source, DeveloperSessionSource::Vscode);
        assert_eq!(code.trust_mode, DeveloperSessionTrustMode::Byok);
        assert_eq!(code.provider.as_deref(), Some("fixture-provider"));
        assert_eq!(
            code.primary_repository_id.as_ref().map(|id| id.as_str()),
            Some("github.com/acme/widgets")
        );
        assert_eq!(
            code.environment.working_directory.as_deref(),
            Some(Path::new("/work/repo"))
        );
        assert_eq!(code.git.as_ref().unwrap().branch.as_deref(), Some("main"));
        assert_eq!(code.client.as_ref().unwrap().name, "agi-vscode");
        assert_eq!(code.permission_profile_id.as_str(), "standard");
    }

    #[test]
    fn an_embedded_code_session_survives_a_save_and_load() {
        let temp_dir = tempdir().unwrap();
        let path = temp_dir.path().join("session.jsonl");
        let mut session = ManagedSession::new("session-embedded", Utc::now());
        let mut code = session.code_session();
        code.title = Some("Named by the domain record".to_string());
        code.push_task(agiworkforce_protocol::code_domain::CodeTask::new(
            "t-1",
            "session-embedded",
            "Build",
            agiworkforce_protocol::code_domain::ExecutionLocation::Cloud,
            session.created_at,
        ));
        session.set_code_session(code.clone());

        session.save_to_path(&path).unwrap();
        let loaded = ManagedSession::load_from_path(&path).unwrap();

        assert_eq!(loaded.code_session(), code);
        assert_eq!(loaded.code_session().tasks.len(), 1);
        assert_eq!(loaded.title.as_deref(), Some("Named by the domain record"));
        assert_eq!(loaded.session_identity().as_str(), "session-embedded");
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
            client: None,
            git_branch: None,
            worktree_root: None,
            repository: None,
            approvals: Vec::new(),
            file_changes: Vec::new(),
            validations: Vec::new(),
            objective: None,
            architecture: None,
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
            code: None,
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
            client: None,
            git_branch: None,
            worktree_root: None,
            repository: None,
            approvals: Vec::new(),
            file_changes: Vec::new(),
            validations: Vec::new(),
            objective: None,
            architecture: None,
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
            code: None,
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
    fn one_unreadable_line_does_not_cost_the_whole_session() {
        // The point of an append-only log is that damage stays on the line it
        // landed on. This used to fail the load outright, so a single truncated
        // write lost every message written before it.
        let damaged = concat!(
            r#"{"record_type":"header","version":1,"session_id":"damaged","created_at":"2025-03-01T00:00:00Z","updated_at":"2025-03-01T00:05:00Z"}"#,
            "\n",
            r#"{"record_type":"message","message":{"role":"user","content":"before"}}"#,
            "\n",
            r#"{"record_type":"message","message":{"role":"user","conte"#,
            "\n",
            r#"{"record_type":"message","message":{"role":"assistant","content":"after"}}"#,
        );

        let session = ManagedSession::from_serialized_str(damaged).expect("session still loads");

        assert_eq!(session.session_id, "damaged");
        let texts: Vec<String> = session
            .messages
            .iter()
            .map(|message| match &message.content {
                MessageContent::Text(text) => text.clone(),
                other => format!("{other:?}"),
            })
            .collect();
        assert_eq!(texts, vec!["before".to_string(), "after".to_string()]);
    }

    #[test]
    fn a_file_with_nothing_readable_says_so_rather_than_calling_itself_empty() {
        let rubbish = "not json at all\n{\"record_type\":\"mess";

        let error = ManagedSession::from_serialized_str(rubbish)
            .expect_err("a file with no header cannot open");

        let message = format!("{error:#}");
        assert!(message.contains("unreadable"), "{message}");
        assert!(!message.contains("empty"), "{message}");
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

    #[test]
    fn a_second_writer_never_erases_the_first_writers_turns() {
        let dir = tempdir().expect("tempdir");
        let path = dir.path().join("s1.jsonl");
        let created = Utc.with_ymd_and_hms(2026, 9, 16, 4, 0, 0).unwrap();

        let mut mine = ManagedSession::new("s1", created);
        mine.messages.push(Message::text("user", "mine"));
        mine.save_to_path(&path).expect("first save");

        let mut theirs = ManagedSession::new("s1", created);
        theirs.messages.push(Message::text("user", "theirs"));
        std::thread::sleep(std::time::Duration::from_millis(15));
        theirs.save_to_path(&path).expect("foreign save");
        super::forget_fingerprint(&path);

        mine.messages
            .push(Message::text("assistant", "more of mine"));
        mine.save_to_path(&path).expect("second save");

        let kept: Vec<String> = std::fs::read_dir(dir.path())
            .expect("read dir")
            .filter_map(|entry| entry.ok())
            .map(|entry| entry.file_name().to_string_lossy().into_owned())
            .filter(|name| name.contains(".conflict-"))
            .collect();
        assert_eq!(
            kept.len(),
            1,
            "the other writer's file must survive: {kept:?}"
        );

        let rescued =
            ManagedSession::load_from_path(dir.path().join(&kept[0])).expect("load kept copy");
        assert!(
            rescued
                .messages
                .iter()
                .any(|message| format!("{:?}", message.content).contains("theirs")),
            "the quarantined copy must hold the other writer's turn"
        );

        let current = ManagedSession::load_from_path(&path).expect("load current");
        assert!(
            current
                .messages
                .iter()
                .any(|message| format!("{:?}", message.content).contains("more of mine")),
            "the writer that won must still have written its turn"
        );
    }
}
