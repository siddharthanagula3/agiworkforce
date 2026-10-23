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
use crate::models::{ContentBlock, Message, MessageContent};
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

fn reads_the_same(one: &Message, other: &Message) -> bool {
    matches!(
        (serde_json::to_value(one), serde_json::to_value(other)),
        (Ok(one), Ok(other)) if one == other
    )
}

pub(crate) type SessionFingerprint = (u64, std::time::SystemTime);

fn fingerprint_of(path: &Path) -> Option<SessionFingerprint> {
    let meta = fs::metadata(path).ok()?;
    Some((meta.len(), meta.modified().ok()?))
}

pub(crate) fn session_fingerprint(path: &Path) -> Option<SessionFingerprint> {
    fingerprint_of(path)
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

/// v7: a compacted session keeps its transcript in `TranscriptMessage`
///     records. Only a file that has them is written as v7, so a build that
///     predates them refuses it rather than loading the session without its
///     history and saving it back that way.
pub const MANAGED_SESSION_TRANSCRIPT_VERSION: u32 = 7;

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
    #[serde(default, skip_serializing_if = "std::ops::Not::not")]
    pub speed_first: bool,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub policy_version: Option<u64>,
}

pub fn current_routing_policy_version() -> Option<u64> {
    agiworkforce_model_registry::routing_policy_version()
        .ok()
        .flatten()
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
    Deleted,
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
    /// The conversation in its original wording, kept when compaction
    /// replaces part of `messages`. Absent until the first compaction, and on
    /// every file written before it existed; [`ManagedSession::shown_messages`]
    /// reads both the same way.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub transcript: Option<ManagedSessionTranscript>,
    /// Sync updates these rows; new ids would duplicate the account's history.
    #[serde(default, skip_serializing_if = "Vec::is_empty")]
    pub hosted_message_ids: Vec<String>,
    /// The nonce this session's memory origin tags carry in its stored system
    /// prompt, so a resumed session still recognizes them. Absent on files
    /// written before tags carried one.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub memory_nonce: Option<String>,
}

/// Every message shown up to the latest compaction, in its original wording.
/// The messages after the first `context_base` entries of `messages` were
/// added since, and continue it. The first `kept` entries of `messages` are
/// the ones that compaction left exactly as they were, `context` fingerprints
/// those first `context_base` entries as it left them, and `earlier` holds
/// the same for each compaction before it, oldest first.
///
/// It describes one context. A context cut shorter than an entry was cleared
/// or rewound, and what the entry held goes with it, as the user asked: the
/// newest entry the context is still long enough for is the one that counts,
/// and with none left there is no transcript.
///
/// A conversation that is replaced by another on purpose says so
/// ([`ManagedSession::conversation_replaced`]) and starts with no transcript,
/// so another conversation's history is never shown as this one's.
///
/// A context as long as an entry that reads differently, with nothing having
/// said why, is an edit this was never told of. The transcript is the only
/// copy of what was said, so every message of it is kept and goes on being
/// shown, and only the entry's fingerprint is brought up to date, once, with
/// a warning that names the session.
///
/// Change it only through [`ManagedSession`]'s `record_compaction*`,
/// `context_*`, `reconcile_transcript`, `restore_transcript` and
/// `conversation_replaced`.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ManagedSessionTranscript {
    #[serde(default, skip_serializing_if = "Vec::is_empty")]
    messages: Vec<Message>,
    context_base: usize,
    #[serde(default)]
    kept: usize,
    #[serde(default)]
    context: String,
    #[serde(default, skip_serializing_if = "Vec::is_empty")]
    earlier: Vec<ManagedSessionTranscriptMark>,
}

/// What a [`ManagedSessionTranscript`] held after one compaction.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct ManagedSessionTranscriptMark {
    shown: usize,
    context_base: usize,
    #[serde(default)]
    kept: usize,
    #[serde(default)]
    context: String,
}

impl ManagedSessionTranscript {
    fn mark(&self) -> ManagedSessionTranscriptMark {
        ManagedSessionTranscriptMark {
            shown: self.messages.len(),
            context_base: self.context_base,
            kept: self.kept,
            context: self.context.clone(),
        }
    }

    fn adopt(&mut self, mark: ManagedSessionTranscriptMark) {
        self.messages.truncate(mark.shown);
        self.context_base = mark.context_base;
        self.kept = mark.kept;
        self.context = mark.context;
    }

    /// Whether `context` still begins with what the latest compaction left.
    fn matches(&self, context: &[Message]) -> bool {
        context.len() >= self.context_base
            && context_fingerprint(&context[..self.context_base]) == self.context
    }

    /// This transcript as it stands for `context`, and whether an entry had
    /// to be brought up to date to get there. `None` when nothing of it is
    /// left: `context` is shorter than every entry, so it was cut back past
    /// them all.
    fn reconciled(&self, context: &[Message]) -> (Option<Self>, bool) {
        let mut next = self.clone();
        loop {
            if next.matches(context) {
                return (Some(next), false);
            }
            if context.len() >= next.context_base {
                next.context = prefix_fingerprint(context, next.context_base);
                return (Some(next), true);
            }
            match next.earlier.pop() {
                Some(earlier) => next.adopt(earlier),
                None => return (None, false),
            }
        }
    }

    /// `self` with tool input and output cut to `tool_text_max`.
    fn shortened(&self, tool_text_max: usize) -> Self {
        Self {
            messages: self
                .messages
                .iter()
                .map(|message| transcript_form(message, tool_text_max))
                .collect(),
            context_base: self.context_base,
            kept: self.kept,
            context: self.context.clone(),
            earlier: self.earlier.clone(),
        }
    }

    /// `(shown, context_base, kept)` after each compaction, newest first.
    fn states(&self) -> impl Iterator<Item = (usize, usize, usize)> + '_ {
        std::iter::once((self.messages.len(), self.context_base, self.kept)).chain(
            self.earlier
                .iter()
                .rev()
                .map(|earlier| (earlier.shown, earlier.context_base, earlier.kept)),
        )
    }

    /// Where `messages[context_index]` sits in the transcript, or `None` for
    /// a message that is a summary or was moved by one.
    fn shown_index_of(&self, context_index: usize) -> Option<usize> {
        for (shown, context_base, kept) in self.states() {
            if context_index >= context_base {
                return Some(shown + context_index - context_base);
            }
            if context_index >= kept {
                return None;
            }
        }
        Some(context_index)
    }

    /// [`Self::shown_index_of`], counting a message a compaction moved: what
    /// it kept after its summary is the end of what it had been shown, so
    /// those line up from the end.
    fn position_of(&self, context_index: usize) -> Option<usize> {
        for (shown, context_base, kept) in self.states() {
            if context_index >= context_base {
                return Some(shown + context_index - context_base);
            }
            if context_index >= kept {
                return shown.checked_sub(context_base - context_index);
            }
        }
        Some(context_index)
    }

    /// The stretch of a `context_len` long context that `context_index`
    /// shares with nothing a compaction rewrote: from the compaction it was
    /// added after, up to where the next one stopped leaving things as they
    /// were. `None` for a place a summary now stands in for.
    fn span_of(&self, context_index: usize, context_len: usize) -> Option<(usize, usize)> {
        let mut ceiling = context_len;
        for (_, context_base, kept) in self.states() {
            if context_index >= context_base {
                return Some((context_base, ceiling));
            }
            if context_index >= kept {
                return None;
            }
            ceiling = kept;
        }
        Some((0, ceiling))
    }
}

/// The longest tool output, and the longest tool input, a message keeps once
/// it is in the transcript: what compaction itself leaves of a tool result.
pub const MANAGED_SESSION_TRANSCRIPT_TOOL_TEXT_MAX_CHARS: usize = 4_000;

/// Shorter limits tried in turn when the file would not otherwise fit.
const TRANSCRIPT_TOOL_TEXT_FALLBACKS: [usize; 2] = [400, 0];

const TRANSCRIPT_OUTPUT_TRUNCATED: &str = "[output truncated in transcript]";
const TRANSCRIPT_INPUT_TRUNCATED: &str = "[input truncated in transcript]";

/// A message as the transcript keeps it. What was said is kept whole. An
/// image becomes a line saying one was attached, and tool input and output
/// longer than `tool_text_max` are cut there and marked, so a history of any
/// length stays a file that can be written.
fn transcript_form(message: &Message, tool_text_max: usize) -> Message {
    let MessageContent::Blocks(blocks) = &message.content else {
        return message.clone();
    };
    let blocks = blocks
        .iter()
        .map(|block| match block {
            ContentBlock::Image { mime, .. } => ContentBlock::Text {
                text: format!("[image attachment ({mime}), not kept in transcript]"),
            },
            ContentBlock::ToolResult {
                tool_use_id,
                content,
                is_error,
            } if content.chars().count() > tool_text_max => {
                let kept: String = content.chars().take(tool_text_max).collect();
                ContentBlock::ToolResult {
                    tool_use_id: tool_use_id.clone(),
                    content: if kept.is_empty() {
                        TRANSCRIPT_OUTPUT_TRUNCATED.to_string()
                    } else {
                        format!("{kept}\n{TRANSCRIPT_OUTPUT_TRUNCATED}")
                    },
                    is_error: *is_error,
                }
            }
            ContentBlock::ToolUse { id, name, input }
                if input.to_string().chars().count() > tool_text_max =>
            {
                ContentBlock::ToolUse {
                    id: id.clone(),
                    name: name.clone(),
                    input: serde_json::json!({ "truncated": TRANSCRIPT_INPUT_TRUNCATED }),
                }
            }
            other => other.clone(),
        })
        .collect();
    Message {
        role: message.role.clone(),
        content: MessageContent::Blocks(blocks),
    }
}

fn prefix_fingerprint(context: &[Message], count: usize) -> String {
    context_fingerprint(context.get(..count).unwrap_or(context))
}

/// What identifies the conversation in `messages`. The system prompt at its
/// head is left out: it is rewritten where it stands when the output style
/// changes, and it is never part of what a reader is shown, so a new prompt
/// must not read as a different conversation.
fn context_fingerprint(messages: &[Message]) -> String {
    use sha2::{Digest, Sha256};

    let spoken = messages
        .iter()
        .position(|message| message.role != "system")
        .unwrap_or(messages.len());
    let encoded = serde_json::to_vec(&messages[spoken..]).unwrap_or_default();
    crate::hex::encode(&Sha256::digest(encoded))
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
    /// Everything of the transcript but its messages, which follow as
    /// `TranscriptMessage` records.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    transcript: Option<ManagedSessionTranscript>,
    #[serde(default, skip_serializing_if = "Vec::is_empty")]
    hosted_message_ids: Vec<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    memory_nonce: Option<String>,
}

/// A reader that predates `TranscriptMessage` skips it as unreadable and
/// still loads the session it belongs to.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(tag = "record_type", rename_all = "snake_case")]
enum ManagedSessionJsonlRecord {
    Header(Box<ManagedSessionJsonlHeader>),
    Message { message: Message },
    TranscriptMessage { message: Message },
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
            transcript: None,
            hosted_message_ids: Vec::new(),
            memory_nonce: None,
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
            transcript: source.transcript.clone(),
            ..Self::fork_with_messages(
                source,
                session_id,
                forked_at,
                source_session_path,
                source.messages.clone(),
            )
        }
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
            transcript: None,
            hosted_message_ids: Vec::new(),
            memory_nonce: None,
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

    /// The conversation as a reader sees it: every message in its original
    /// wording, including what compaction summarized out of `messages`.
    pub fn shown_messages(&self) -> Vec<Message> {
        self.shown_with_context(&self.messages)
    }

    /// [`Self::shown_messages`] for a context newer than the one last saved
    /// here, which is what a running session holds between saves.
    pub fn shown_with_context(&self, context: &[Message]) -> Vec<Message> {
        match self.transcript_for(context) {
            None => context.to_vec(),
            Some(transcript) => transcript
                .messages
                .iter()
                .chain(context.get(transcript.context_base..).unwrap_or_default())
                .cloned()
                .collect(),
        }
    }

    /// The transcript as far as it still describes `context`.
    fn transcript_for(
        &self,
        context: &[Message],
    ) -> Option<std::borrow::Cow<'_, ManagedSessionTranscript>> {
        let transcript = self.transcript.as_ref()?;
        if transcript.matches(context) {
            return Some(std::borrow::Cow::Borrowed(transcript));
        }
        transcript
            .reconciled(context)
            .0
            .map(std::borrow::Cow::Owned)
    }

    /// Bring the transcript in line with a context that is no longer the one
    /// it recorded. What a cut or a clear leaves behind is dropped. A change
    /// nothing recorded keeps every message and is warned of once; see
    /// [`ManagedSessionTranscript`].
    pub fn reconcile_transcript(&mut self, context: &[Message]) {
        let Some(transcript) = self.transcript.as_ref() else {
            return;
        };
        if transcript.matches(context) {
            return;
        }
        let (next, changed_untold) = transcript.reconciled(context);
        if changed_untold {
            tracing::warn!(
                session_id = %self.session_id,
                "the conversation no longer reads the way its transcript recorded and nothing said why; the transcript is kept as it was and goes on being shown"
            );
        }
        self.transcript = next;
    }

    /// The conversation was replaced by another one on purpose, as when a
    /// saved or hosted conversation is loaded over this session. The
    /// transcript described the one that is gone and must never be shown as
    /// the new one's history, so the new one starts without it.
    pub fn conversation_replaced(&mut self) {
        self.transcript = None;
    }

    /// Where the transcript stands now, for a caller that may later put this
    /// moment's context back.
    pub fn transcript_mark(&self) -> Option<ManagedSessionTranscriptMark> {
        self.transcript.as_ref().map(ManagedSessionTranscript::mark)
    }

    /// Cut the transcript back to `mark`, taken when the context now being
    /// restored was current. The transcript only ever grows at its end, so
    /// what a later compaction added is exactly what falls off.
    pub fn restore_transcript(&mut self, mark: Option<ManagedSessionTranscriptMark>) {
        let Some(mark) = mark else {
            self.transcript = None;
            return;
        };
        let Some(transcript) = self.transcript.as_mut() else {
            return;
        };
        if let Some(position) = transcript
            .earlier
            .iter()
            .position(|earlier| *earlier == mark)
        {
            transcript.earlier.truncate(position);
        }
        transcript.adopt(mark);
    }

    /// For each of `shown_messages()`, where it sits in `messages`, or `None`
    /// for a message the model now reads only as part of a summary.
    pub fn context_indices_of_shown(&self) -> Vec<Option<usize>> {
        let Some(transcript) = self.transcript_for(&self.messages) else {
            return (0..self.messages.len()).map(Some).collect();
        };
        let added = self.messages.len().saturating_sub(transcript.context_base);
        let mut indices = vec![None; transcript.messages.len() + added];
        for context_index in 0..self.messages.len() {
            if let Some(shown_index) = transcript.shown_index_of(context_index) {
                if let Some(slot) = indices.get_mut(shown_index) {
                    *slot = Some(context_index);
                }
            }
        }
        indices
    }

    /// The stretch of `messages` a turn that starts at `context_index` shares
    /// with nothing a compaction rewrote, as `(from, to)`: a turn's label, the
    /// turn it is cut from and the turn after it all come from inside it.
    /// `None` when a summary now stands in for that turn.
    pub fn addressable_span(&self, context_index: usize) -> Option<(usize, usize)> {
        self.addressable_span_in(&self.messages, context_index)
    }

    /// [`Self::addressable_span`] of every message in `messages`.
    pub fn addressable_spans(&self) -> Vec<Option<(usize, usize)>> {
        let context_len = self.messages.len();
        match self.transcript_for(&self.messages) {
            None => vec![Some((0, context_len)); context_len],
            Some(transcript) => (0..context_len)
                .map(|context_index| transcript.span_of(context_index, context_len))
                .collect(),
        }
    }

    /// [`Self::addressable_span`] for a context newer than the one last saved.
    pub fn addressable_span_in(
        &self,
        context: &[Message],
        context_index: usize,
    ) -> Option<(usize, usize)> {
        match self.transcript_for(context) {
            None => Some((0, context.len())),
            Some(transcript) => transcript.span_of(context_index, context.len()),
        }
    }

    /// Keep the conversation as shown while compaction replaces
    /// `context_before`, the model's context, with `context_after`. Only the
    /// context changes; nothing leaves the transcript.
    pub fn record_compaction(&mut self, context_before: &[Message], context_after: &[Message]) {
        self.record_compaction_keeping(context_before, context_after, 0);
    }

    /// [`Self::record_compaction`] for a compaction that left the first
    /// `kept` messages of the context exactly as they were.
    pub fn record_compaction_keeping(
        &mut self,
        context_before: &[Message],
        context_after: &[Message],
        kept: usize,
    ) {
        self.reconcile_transcript(context_before);
        let messages = self
            .shown_with_context(context_before)
            .iter()
            .map(|message| transcript_form(message, MANAGED_SESSION_TRANSCRIPT_TOOL_TEXT_MAX_CHARS))
            .collect();
        let earlier = match self.transcript.take() {
            Some(previous) => {
                let mark = previous.mark();
                let mut earlier = previous.earlier;
                earlier.push(mark);
                earlier
            }
            None => Vec::new(),
        };
        self.transcript = Some(ManagedSessionTranscript {
            messages,
            context_base: context_after.len(),
            kept: kept.min(context_after.len()),
            context: context_fingerprint(context_after),
            earlier,
        });
    }

    /// Compaction shortened tool output in `context_before` and summarized
    /// nothing, leaving `context_after` with every message where it was.
    /// Nothing is recorded as a compaction, so every turn stays addressable;
    /// the entries that described the context are only brought up to date.
    ///
    /// When messages came or went as well, no entry can be brought up to
    /// date, since what each counts from may have moved. That is recorded as
    /// the compaction it amounts to, keeping what both contexts begin with,
    /// so the transcript goes on showing every message instead of failing
    /// its next check.
    pub fn record_pruning(&mut self, context_before: &[Message], context_after: &[Message]) {
        if context_before.len() != context_after.len() {
            let untouched = context_before
                .iter()
                .zip(context_after)
                .take_while(|(before, after)| reads_the_same(before, after))
                .count();
            self.record_compaction_keeping(context_before, context_after, untouched);
            return;
        }
        let Some(transcript) = self.transcript.as_mut() else {
            return;
        };
        if prefix_fingerprint(context_before, transcript.context_base) == transcript.context {
            transcript.context = prefix_fingerprint(context_after, transcript.context_base);
        }
        for earlier in &mut transcript.earlier {
            if prefix_fingerprint(context_before, earlier.context_base) == earlier.context {
                earlier.context = prefix_fingerprint(context_after, earlier.context_base);
            }
        }
    }

    /// The context was cut back to its first `count` messages, as a rewind
    /// or a fork through a turn does. A cut that lands in the part a
    /// compaction left untouched undoes that compaction's entry, so the
    /// transcript stops showing turns that are no longer in the conversation.
    pub fn context_truncated_to(&mut self, count: usize) {
        loop {
            let cut_past_every_entry = match self.transcript.as_mut() {
                None => return,
                Some(transcript) if transcript.context_base <= count => return,
                Some(transcript) => match transcript.earlier.pop() {
                    Some(earlier) => {
                        transcript.adopt(earlier);
                        false
                    }
                    None => true,
                },
            };
            if cut_past_every_entry {
                self.transcript = None;
                return;
            }
        }
    }

    /// A message was inserted into `context` at `index`. One added since the
    /// latest compaction is shown as any new message is. One placed inside
    /// what a compaction already accounted for joins the transcript straight
    /// after the message it follows, moves where the rest of the context
    /// begins, and ends what that compaction had left untouched.
    pub fn context_inserted_at(&mut self, index: usize, context: &[Message]) {
        let Some(transcript) = self.transcript.as_mut() else {
            return;
        };
        let Some(message) = context.get(index) else {
            return;
        };
        if index >= transcript.context_base {
            return;
        }
        let position = index
            .checked_sub(1)
            .and_then(|before| transcript.position_of(before))
            .map_or(0, |before| before + 1)
            .min(transcript.messages.len());
        transcript.messages.insert(
            position,
            transcript_form(message, MANAGED_SESSION_TRANSCRIPT_TOOL_TEXT_MAX_CHARS),
        );
        transcript.context_base += 1;
        transcript.context = prefix_fingerprint(context, transcript.context_base);
        let mut untouched = index < transcript.kept;
        if untouched {
            transcript.kept = index;
        }
        for earlier in transcript.earlier.iter_mut().rev() {
            if position < earlier.shown {
                earlier.shown += 1;
            }
            if !untouched || index >= earlier.context_base {
                untouched = false;
                continue;
            }
            earlier.context_base += 1;
            earlier.context = prefix_fingerprint(context, earlier.context_base);
            untouched = index < earlier.kept;
            if untouched {
                earlier.kept = index;
            }
        }
    }

    /// The message at `index` of `context` was changed where it stands, as
    /// when a late tool result joins the ones already there. Inside what a
    /// compaction accounted for, the transcript takes the new wording and the
    /// entries that cover it are brought up to date, so the change is not
    /// mistaken for a different conversation.
    pub fn context_edited_at(&mut self, index: usize, context: &[Message]) {
        let Some(transcript) = self.transcript.as_mut() else {
            return;
        };
        let Some(message) = context.get(index) else {
            return;
        };
        if index >= transcript.context_base {
            return;
        }
        if let Some(position) = transcript.position_of(index) {
            if let Some(shown) = transcript.messages.get_mut(position) {
                *shown = transcript_form(message, MANAGED_SESSION_TRANSCRIPT_TOOL_TEXT_MAX_CHARS);
            }
        }
        transcript.context = prefix_fingerprint(context, transcript.context_base);
        if index >= transcript.kept {
            return;
        }
        for earlier in transcript.earlier.iter_mut().rev() {
            if index >= earlier.context_base {
                return;
            }
            earlier.context = prefix_fingerprint(context, earlier.context_base);
            if index >= earlier.kept {
                return;
            }
        }
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

        let buf = self.serialized_within(path, MANAGED_SESSION_FILE_MAX_BYTES)?;

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

    /// The bytes to write at `path`, no more than `limit` of them. The
    /// transcript is what gives way when they would not fit: its tool input
    /// and output are cut shorter, then left out, and as a last resort the
    /// file is written without it, so a long history never makes a session
    /// impossible to save. Only a context too large by itself still fails.
    fn serialized_within(&self, path: &Path, limit: usize) -> Result<Vec<u8>> {
        let as_json = path
            .extension()
            .and_then(|extension| extension.to_str())
            .is_some_and(|extension| extension.eq_ignore_ascii_case("json"));
        let transcript = self.transcript_for(&self.messages);
        let buf = self.serialized(path, as_json, transcript.as_deref())?;
        if buf.len() <= limit {
            return Ok(buf);
        }
        if let Some(transcript) = transcript.as_deref() {
            for tool_text_max in TRANSCRIPT_TOOL_TEXT_FALLBACKS {
                let shorter = transcript.shortened(tool_text_max);
                let buf = self.serialized(path, as_json, Some(&shorter))?;
                if buf.len() <= limit {
                    return Ok(buf);
                }
            }
            let buf = self.serialized(path, as_json, None)?;
            if buf.len() <= limit {
                tracing::warn!(
                    session_id = %self.session_id,
                    "the session was saved without its transcript, which no longer fits in the file"
                );
                return Ok(buf);
            }
        }
        bail!(
            "Managed session file {} would exceed the {} byte limit",
            path.display(),
            limit
        );
    }

    fn serialized(
        &self,
        path: &Path,
        as_json: bool,
        transcript: Option<&ManagedSessionTranscript>,
    ) -> Result<Vec<u8>> {
        let mut buf = Vec::new();
        {
            let mut writer = BufWriter::new(&mut buf);
            if as_json {
                let written = ManagedSession {
                    version: self.written_version(transcript.is_some()),
                    transcript: transcript.cloned(),
                    ..self.clone()
                };
                serde_json::to_writer_pretty(&mut writer, &written).with_context(|| {
                    format!("Failed to serialize JSON session {}", path.display())
                })?;
                writer.write_all(b"\n").with_context(|| {
                    format!("Failed to finalize JSON session {}", path.display())
                })?;
            } else {
                self.write_jsonl(&mut writer, transcript).with_context(|| {
                    format!("Failed to serialize JSONL session {}", path.display())
                })?;
            }
            writer
                .flush()
                .with_context(|| format!("Failed to flush session buffer {}", path.display()))?;
        }
        Ok(buf)
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
        let mut shown = Vec::new();
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
                        transcript: record.transcript,
                        hosted_message_ids: record.hosted_message_ids,
                        memory_nonce: record.memory_nonce,
                    });
                }
                ManagedSessionJsonlRecord::Message { message } => {
                    if header.is_none() {
                        bail!("Managed session JSONL file is missing the header record");
                    }
                    messages.push(message);
                }
                ManagedSessionJsonlRecord::TranscriptMessage { message } => {
                    if header.is_none() {
                        bail!("Managed session JSONL file is missing the header record");
                    }
                    shown.push(message);
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
        if let Some(transcript) = session.transcript.as_mut() {
            transcript.messages = shown;
        }
        Ok(session)
    }

    fn validate(&self) -> Result<()> {
        if self.version == 0 || self.version > MANAGED_SESSION_TRANSCRIPT_VERSION {
            bail!(
                "Unsupported managed session version {} (max supported: {})",
                self.version,
                MANAGED_SESSION_TRANSCRIPT_VERSION
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
        let shown_only = self
            .transcript
            .iter()
            .flat_map(|transcript| &transcript.messages);
        for message in self.messages.iter().chain(shown_only) {
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

    fn written_version(&self, with_transcript: bool) -> u32 {
        if with_transcript {
            MANAGED_SESSION_TRANSCRIPT_VERSION
        } else {
            self.version.min(MANAGED_SESSION_VERSION)
        }
    }

    /// `transcript` is the one that still describes `messages`, so a caller
    /// that replaced or cut the conversation without saying so cannot put
    /// another one's history in the file. A file with a transcript is v7; one
    /// without is never written as v7, so builds that predate the transcript
    /// keep reading it.
    fn write_jsonl(
        &self,
        writer: &mut impl Write,
        transcript: Option<&ManagedSessionTranscript>,
    ) -> Result<()> {
        let version = self.written_version(transcript.is_some());
        let header = ManagedSessionJsonlRecord::Header(Box::new(ManagedSessionJsonlHeader {
            version,
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
            transcript: transcript.map(|transcript| ManagedSessionTranscript {
                messages: Vec::new(),
                context_base: transcript.context_base,
                kept: transcript.kept,
                context: transcript.context.clone(),
                earlier: transcript.earlier.clone(),
            }),
            hosted_message_ids: self.hosted_message_ids.clone(),
            memory_nonce: self.memory_nonce.clone(),
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

        for message in transcript
            .iter()
            .flat_map(|transcript| &transcript.messages)
        {
            let record = ManagedSessionJsonlRecord::TranscriptMessage {
                message: message.clone(),
            };
            serde_json::to_writer(&mut *writer, &record)
                .context("Failed to serialize managed session transcript message")?;
            writer
                .write_all(b"\n")
                .context("Failed to write session transcript newline")?;
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
            speed_first: false,
            policy_version: crate::runtime::session::current_routing_policy_version(),
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
            transcript: None,
            hosted_message_ids: Vec::new(),
            memory_nonce: None,
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
            transcript: None,
            hosted_message_ids: Vec::new(),
            memory_nonce: None,
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

    fn said(words: &[&str]) -> Vec<Message> {
        words
            .iter()
            .map(|word| Message::text("user", *word))
            .collect()
    }

    fn spoken(session: &ManagedSession, context: &[Message]) -> Vec<String> {
        session
            .shown_with_context(context)
            .iter()
            .map(Message::text_content)
            .collect()
    }

    fn routed(session_id: &str) -> ManagedSession {
        let mut session = ManagedSession::new(session_id, Utc::now());
        session.model = Some("fixture-route-model".to_string());
        session.routing_authority = Some(ManagedSessionRoutingAuthority {
            privacy_mode: PrivacyMode::Local,
            provider: "ollama".to_string(),
        });
        session
    }

    #[test]
    fn a_session_written_before_the_transcript_shows_its_messages() {
        let v1_jsonl = r#"{"record_type":"header","version":1,"session_id":"v1-session","created_at":"2025-03-01T00:00:00Z","updated_at":"2025-03-01T00:05:00Z"}
{"record_type":"message","message":{"role":"user","content":"hello"}}"#;
        let session = ManagedSession::from_serialized_str(v1_jsonl).unwrap();

        assert!(session.transcript.is_none());
        assert_eq!(spoken(&session, &session.messages), ["hello"]);
        assert_eq!(session.context_indices_of_shown(), [Some(0)]);
        assert_eq!(session.addressable_span(0), Some((0, 1)));
    }

    #[test]
    fn compaction_replaces_the_context_but_never_the_transcript() {
        let temp_dir = tempdir().unwrap();
        let path = temp_dir.path().join("compacted.jsonl");
        let mut session = routed("compacted");
        let before = said(&["first ask", "first answer", "second ask", "second answer"]);
        let after = said(&["summary of the first turn", "second ask", "second answer"]);
        session.record_compaction(&before, &after);
        session.messages = after;
        session.messages.push(Message::text("user", "third ask"));

        session.save_to_path(&path).expect("save compacted session");
        let restored = ManagedSession::load_from_path(&path).expect("load compacted session");

        assert_eq!(
            spoken(&restored, &restored.messages),
            [
                "first ask",
                "first answer",
                "second ask",
                "second answer",
                "third ask"
            ]
        );
        assert_eq!(restored.messages.len(), 4);
        assert_eq!(
            restored.context_indices_of_shown(),
            [None, None, None, None, Some(3)]
        );

        let mut again = restored.clone();
        let context = again.messages.clone();
        let summary = said(&["summary of everything"]);
        again.record_compaction(&context, &summary);
        again.messages = summary;
        assert_eq!(again.shown_messages().len(), 5);
    }

    #[test]
    fn only_a_file_with_a_transcript_is_written_as_the_version_older_builds_refuse() {
        let temp_dir = tempdir().unwrap();
        let path = temp_dir.path().join("versioned.jsonl");
        let mut session = routed("versioned");
        session.messages = said(&["first ask", "first answer"]);
        session.save_to_path(&path).expect("save");
        assert_eq!(
            ManagedSession::load_from_path(&path).expect("load").version,
            super::MANAGED_SESSION_VERSION
        );

        let before = session.messages.clone();
        let after = said(&["summary", "first answer"]);
        session.record_compaction(&before, &after);
        session.messages = after;
        session.save_to_path(&path).expect("save compacted");
        let compacted = ManagedSession::load_from_path(&path).expect("load compacted");
        assert_eq!(compacted.version, super::MANAGED_SESSION_TRANSCRIPT_VERSION);
        assert!(
            compacted.version > super::MANAGED_SESSION_VERSION,
            "a build that predates the transcript must refuse this file, not rewrite it without its history"
        );

        let mut cleared = compacted;
        cleared.messages = said(&["a fresh start"]);
        let context = cleared.messages.clone();
        cleared.reconcile_transcript(&context);
        cleared.save_to_path(&path).expect("save cleared");
        assert_eq!(
            ManagedSession::load_from_path(&path).expect("load").version,
            super::MANAGED_SESSION_VERSION
        );

        let newer = std::fs::read_to_string(&path).expect("read").replacen(
            "\"version\":6",
            "\"version\":8",
            1,
        );
        assert!(ManagedSession::from_serialized_str(&newer).is_err());
    }

    #[test]
    fn the_transcript_keeps_what_was_said_and_bounds_what_tools_carried() {
        let long = "z".repeat(super::MANAGED_SESSION_TRANSCRIPT_TOOL_TEXT_MAX_CHARS + 500);
        let original = vec![
            Message::blocks(
                "user",
                vec![
                    ContentBlock::Text {
                        text: "what is in this picture".to_string(),
                    },
                    ContentBlock::Image {
                        mime: "image/png".to_string(),
                        data_b64: "A".repeat(10_000),
                    },
                ],
            ),
            Message::blocks(
                "user",
                vec![ContentBlock::ToolResult {
                    tool_use_id: "call-1".to_string(),
                    content: long.clone(),
                    is_error: false,
                }],
            ),
            Message::text("assistant", long.clone()),
        ];
        let mut session = routed("bounded");
        let after = said(&["summary"]);
        session.record_compaction(&original, &after);
        session.messages = after;

        let shown = session.shown_messages();
        let MessageContent::Blocks(picture) = &shown[0].content else {
            panic!("the message with the picture kept its blocks");
        };
        assert!(
            matches!(&picture[1], ContentBlock::Text { text } if text.contains("image/png")),
            "an image was kept in the transcript byte for byte"
        );
        let MessageContent::Blocks(result) = &shown[1].content else {
            panic!("the tool result kept its block");
        };
        let ContentBlock::ToolResult { content, .. } = &result[0] else {
            panic!("the tool result kept its block");
        };
        assert!(content.ends_with("[output truncated in transcript]"));
        assert!(content.chars().count() < long.chars().count());
        assert_eq!(
            shown[2].text_content(),
            long,
            "what the assistant said is kept whole"
        );
    }

    #[test]
    fn a_transcript_too_long_for_the_file_gives_way_before_the_save_fails() {
        let path = Path::new("bounded.jsonl");
        let output = "z".repeat(3_000);
        let original: Vec<Message> = (0..20)
            .map(|index| {
                Message::blocks(
                    "user",
                    vec![ContentBlock::ToolResult {
                        tool_use_id: format!("call-{index}"),
                        content: output.clone(),
                        is_error: false,
                    }],
                )
            })
            .collect();
        let mut session = routed("too-long");
        let after = said(&["summary"]);
        session.record_compaction(&original, &after);
        session.messages = after;
        let whole = session
            .serialized_within(path, usize::MAX)
            .expect("fits when nothing bounds it")
            .len();

        let tighter = session
            .serialized_within(path, whole / 2)
            .expect("a long transcript is cut shorter, not a reason to fail the save");
        let restored =
            ManagedSession::from_serialized_str(std::str::from_utf8(&tighter).expect("utf8"))
                .expect("the shorter file still loads");
        assert_eq!(restored.shown_messages().len(), original.len());

        let without = session
            .serialized_within(path, 1_500)
            .expect("the last resort is a file without the transcript");
        let restored =
            ManagedSession::from_serialized_str(std::str::from_utf8(&without).expect("utf8"))
                .expect("it loads");
        assert!(restored.transcript.is_none());
        assert_eq!(restored.messages.len(), 1);

        assert!(session.serialized_within(path, 10).is_err());
    }

    #[test]
    fn a_rewritten_system_prompt_is_not_another_conversation() {
        let before = said(&["first ask", "first answer", "second ask"]);
        let mut original = vec![Message::text("system", "prompt in the default style")];
        original.extend(before);
        let mut context = vec![
            Message::text("system", "prompt in the default style"),
            Message::text("assistant", "summary of the first turn"),
            Message::text("user", "second ask"),
        ];
        let mut session = routed("restyled");
        session.record_compaction(&original, &context);

        context[0] = Message::text("system", "prompt in the terse style");
        context.push(Message::text("assistant", "second answer"));
        session.reconcile_transcript(&context);

        assert!(
            session.transcript.is_some(),
            "changing the output style after a summary deleted the saved transcript"
        );
        assert_eq!(
            spoken(&session, &context)[1..],
            ["first ask", "first answer", "second ask", "second answer"]
        );
    }

    #[test]
    fn a_json_session_file_carries_the_transcript_under_the_version_that_has_one() {
        let temp_dir = tempdir().unwrap();
        let path = temp_dir.path().join("compacted.json");
        let mut session = routed("json-compacted");
        let before = said(&["first ask", "first answer", "second ask"]);
        let after = said(&["summary of the first turn", "second ask"]);
        session.record_compaction(&before, &after);
        session.messages = after;

        session.save_to_path(&path).expect("save json");
        let restored = ManagedSession::load_from_path(&path).expect("load json");
        assert_eq!(restored.version, super::MANAGED_SESSION_TRANSCRIPT_VERSION);
        assert_eq!(restored.shown_messages().len(), 3);

        let mut replaced = restored;
        replaced.messages = said(&["another conversation"]);
        replaced.save_to_path(&path).expect("save replaced");
        let restored = ManagedSession::load_from_path(&path).expect("load replaced");
        assert_eq!(restored.version, super::MANAGED_SESSION_VERSION);
        assert!(restored.transcript.is_none());
    }

    #[test]
    fn output_shortened_without_a_summary_records_no_compaction() {
        let original = said(&["a1", "a2", "b1 with long output", "b2"]);
        let mut session = routed("pruned");
        let after = said(&["summary of a", "b1 with long output", "b2"]);
        session.record_compaction(&original, &after);
        let mut context = after;
        context.extend(said(&["c1", "c2 with long output"]));
        session.messages = context.clone();
        let spans = session.addressable_spans();

        let mut pruned = context.clone();
        pruned[1] = Message::text("user", "b1 with output cut short");
        pruned[4] = Message::text("user", "c2 with output cut short");
        session.record_pruning(&context, &pruned);
        session.messages = pruned;

        assert_eq!(
            session.addressable_spans(),
            spans,
            "shortening tool output took every turn's id away though nothing was summarized"
        );
        assert_eq!(session.shown_messages().len(), 6);
        assert_eq!(
            session.shown_messages()[2].text_content(),
            "b1 with long output"
        );
    }

    #[test]
    fn a_cleared_or_replaced_conversation_never_shows_the_one_before_it() {
        let before = said(&["system", "first ask", "first answer", "second ask"]);
        let after = said(&["system", "summary of the first turn", "second ask"]);
        let mut session = routed("cleared");
        session.record_compaction(&before, &after);

        let cleared = &after[..1];
        assert_eq!(
            spoken(&session, cleared),
            ["system"],
            "/clear left the cleared conversation in the transcript"
        );
        let other = said(&[
            "system",
            "another conversation",
            "entirely",
            "with more in it",
        ]);
        let mut replaced = session.clone();
        replaced.conversation_replaced();
        assert_eq!(spoken(&replaced, &other).len(), other.len());
        assert_eq!(
            replaced.addressable_span_in(&other, 2),
            Some((0, other.len()))
        );

        assert_eq!(spoken(&session, &after).len(), 4);
        session.reconcile_transcript(cleared);
        assert!(session.transcript.is_none());
        assert_eq!(spoken(&session, &after).len(), 3);
    }

    #[test]
    fn an_edit_the_transcript_was_never_told_of_keeps_the_history_shown() {
        let temp_dir = tempdir().unwrap();
        let path = temp_dir.path().join("edited.jsonl");
        let original = said(&["first ask", "first answer", "second ask"]);
        let mut context = said(&["summary of the first turn", "second ask"]);
        let mut session = routed("edited-untold");
        session.record_compaction(&original, &context);

        context[0] = Message::text("user", "a summary rewritten where it stood");
        assert!(
            session
                .transcript
                .as_ref()
                .expect("transcript")
                .reconciled(&context)
                .1,
            "a change nothing recorded went unnoticed"
        );
        session.reconcile_transcript(&context);
        session.messages = context.clone();

        assert_eq!(
            spoken(&session, &context),
            ["first ask", "first answer", "second ask"],
            "the only copy of what was said went with a fingerprint"
        );
        assert!(
            !session
                .transcript
                .as_ref()
                .expect("transcript")
                .reconciled(&context)
                .1,
            "the same change is warned of on every save"
        );

        session.save_to_path(&path).expect("save");
        let loaded = ManagedSession::load_from_path(&path).expect("load");
        assert_eq!(loaded.version, super::MANAGED_SESSION_TRANSCRIPT_VERSION);
        assert_eq!(spoken(&loaded, &loaded.messages).len(), 3);

        context.push(Message::text("user", "third ask"));
        let after = said(&["summary of everything"]);
        session.record_compaction(&context, &after);
        assert_eq!(
            spoken(&session, &after),
            ["first ask", "first answer", "second ask", "third ask"],
            "the transcript stopped taking what later summaries replace"
        );
    }

    #[test]
    fn a_mismatch_found_only_while_saving_keeps_the_transcript_in_the_file() {
        let temp_dir = tempdir().unwrap();
        let path = temp_dir.path().join("changed.jsonl");
        let mut session = routed("changed-unreconciled");
        session.record_compaction(&said(&["first ask", "first answer"]), &said(&["summary"]));
        session.messages = said(&["a summary rewritten where it stood", "second ask"]);

        session.save_to_path(&path).expect("save");

        let loaded = ManagedSession::load_from_path(&path).expect("load");
        assert_eq!(
            spoken(&loaded, &loaded.messages),
            ["first ask", "first answer", "second ask"]
        );
        assert!(
            loaded
                .transcript
                .as_ref()
                .expect("transcript")
                .matches(&loaded.messages),
            "the file was written with a fingerprint its own context fails"
        );
    }

    #[test]
    fn a_conversation_replaced_on_purpose_starts_without_the_one_before_it() {
        let mut session = routed("replaced-on-purpose");
        session.record_compaction(&said(&["first ask", "first answer"]), &said(&["summary"]));

        let other = said(&["another conversation", "entirely"]);
        session.conversation_replaced();
        session.messages = other.clone();
        session.reconcile_transcript(&other);

        assert!(session.transcript.is_none());
        assert_eq!(
            spoken(&session, &other),
            ["another conversation", "entirely"],
            "another conversation's history was shown as this one's"
        );
    }

    #[test]
    fn a_transcript_message_is_held_to_what_a_conversation_message_is() {
        let unsendable = Message::text(
            &"r".repeat(super::MANAGED_SESSION_MESSAGE_ROLE_MAX_UTF16 + 1),
            "said",
        );
        let after = said(&["summary", "tail"]);

        let mut shown = routed("unsendable-shown");
        shown.record_compaction(&[unsendable], &after);
        shown.messages = after;
        assert!(
            shown.validate().is_err(),
            "a transcript role no client could be sent passed validation"
        );
    }

    #[test]
    fn pruning_that_drops_a_message_keeps_every_message_shown() {
        let original = said(&["a1", "a2", "b1", "b2"]);
        let after = said(&["summary of a", "b1", "b2"]);
        let mut session = routed("pruned-shorter");
        session.record_compaction(&original, &after);
        let mut context = after;
        context.extend(said(&["c1"]));

        let mut pruned = context.clone();
        pruned.remove(1);
        session.record_pruning(&context, &pruned);
        session.messages = pruned.clone();

        assert_eq!(
            spoken(&session, &pruned),
            ["a1", "a2", "b1", "b2", "c1"],
            "a message pruned out of the context left the transcript with it"
        );
        session.reconcile_transcript(&pruned);
        assert!(
            session.transcript.is_some(),
            "the entries were left describing a context that is gone"
        );

        let mut unsummarized = routed("pruned-unsummarized");
        let whole = said(&["a1", "a2", "a3"]);
        unsummarized.record_pruning(&whole, &whole[..2]);
        assert_eq!(spoken(&unsummarized, &whole[..2]), ["a1", "a2", "a3"]);
    }

    #[test]
    fn a_fork_cut_back_without_a_word_is_saved_without_the_turns_it_dropped() {
        let temp_dir = tempdir().unwrap();
        let path = temp_dir.path().join("fork.jsonl");
        let original = said(&["a1", "a2", "b1", "b2", "c1", "c2"]);
        let mut source = routed("fork-source");
        let after = said(&["a1", "a2", "summary of b", "c1", "c2"]);
        source.record_compaction_keeping(&original, &after, 2);
        source.messages = after;

        let mut forked = ManagedSession::forked_from(&source, "fork-copy", Utc::now(), None);
        forked.messages.truncate(2);
        forked.save_to_path(&path).expect("save fork");

        let restored = ManagedSession::load_from_path(&path).expect("load fork");
        assert_eq!(spoken(&restored, &restored.messages), ["a1", "a2"]);
        assert_eq!(restored.version, super::MANAGED_SESSION_VERSION);
    }

    #[test]
    fn a_turn_is_addressed_only_inside_what_no_summary_rewrote() {
        let original = said(&["system", "a1", "a2", "b1", "b2"]);
        let whole = said(&["system", "summary of a", "b1", "b2"]);
        let mut session = routed("spans");
        session.record_compaction(&original, &whole);
        session.messages = whole.clone();
        session.messages.extend(said(&["c1", "c2", "d1", "d2"]));

        assert_eq!(
            session.addressable_span(1),
            None,
            "a first turn's start sits right after the system prompt, which every summary keeps, and must not address what came after one"
        );
        assert_eq!(session.addressable_span(2), None);
        assert_eq!(session.addressable_span(4), Some((4, 8)));
        assert_eq!(session.addressable_span(6), Some((4, 8)));

        let context = session.messages.clone();
        let mut from_d = context[..6].to_vec();
        from_d.extend(said(&["summary of d", "e1", "e2"]));
        session.record_compaction_keeping(&context, &from_d, 6);
        session.messages = from_d;
        session.messages.push(Message::text("user", "f1"));

        assert_eq!(session.addressable_span(4), Some((4, 6)));
        assert_eq!(
            session.addressable_span(6),
            None,
            "the turn a summary was taken from is no longer one to cut at"
        );
        assert_eq!(session.addressable_span(9), Some((9, 10)));
        assert_eq!(session.addressable_span(1), None);
    }

    #[test]
    fn a_rewind_into_what_a_summary_left_untouched_stops_showing_the_summarized_turns() {
        let original = said(&["a1", "a2", "b1", "b2"]);
        let mut session = routed("rewound");
        let mut context = said(&["summary of a", "b1", "b2"]);
        session.record_compaction(&original, &context);
        context.extend(said(&["c1", "c2", "d1", "d2"]));
        session.messages = context.clone();
        assert_eq!(
            session.context_indices_of_shown(),
            [None, None, None, None, Some(3), Some(4), Some(5), Some(6)]
        );

        let from_c = said(&["summary of a", "b1", "b2", "summary of c", "d1", "d2"]);
        session.record_compaction_keeping(&context, &from_c, 3);
        context = from_c;
        assert_eq!(
            spoken(&session, &context),
            ["a1", "a2", "b1", "b2", "c1", "c2", "d1", "d2"]
        );

        context.truncate(3);
        session.context_truncated_to(3);
        assert_eq!(spoken(&session, &context), ["a1", "a2", "b1", "b2"]);

        context.push(Message::text("user", "e1"));
        assert_eq!(spoken(&session, &context), ["a1", "a2", "b1", "b2", "e1"]);
    }

    #[test]
    fn a_cut_nobody_reported_still_falls_back_to_the_entry_it_landed_in() {
        let original = said(&["a1", "a2", "b1", "b2"]);
        let mut session = routed("unreported");
        let mut context = said(&["summary of a", "b1", "b2"]);
        session.record_compaction(&original, &context);
        context.extend(said(&["c1", "c2", "d1", "d2"]));
        let from_c = said(&["summary of a", "b1", "b2", "summary of c", "d1", "d2"]);
        session.record_compaction_keeping(&context, &from_c, 3);

        assert_eq!(
            spoken(&session, &from_c[..3]),
            ["a1", "a2", "b1", "b2"],
            "a context cut back without a word showed turns that are gone"
        );
    }

    #[test]
    fn a_first_summary_from_a_turn_keeps_the_turns_before_it_addressable() {
        let original = said(&["a1", "a2", "b1", "b2", "c1", "c2"]);
        let mut session = routed("kept-prefix");
        let after = said(&["a1", "a2", "summary of b", "c1", "c2"]);
        session.record_compaction_keeping(&original, &after, 2);
        session.messages = after;
        session.messages.push(Message::text("user", "d1"));

        assert_eq!(
            session.context_indices_of_shown(),
            [Some(0), Some(1), None, None, None, None, Some(5)]
        );

        session
            .messages
            .insert(1, Message::text("user", "a1 result"));
        let context = session.messages.clone();
        session.context_inserted_at(1, &context);
        assert_eq!(
            session.context_indices_of_shown()[..3],
            [Some(0), None, None],
            "a message placed inside the untouched part ends it there"
        );
        assert_eq!(
            spoken(&session, &session.messages),
            ["a1", "a1 result", "a2", "b1", "b2", "c1", "c2", "d1"],
            "and it joins the transcript after the message it follows"
        );

        session.context_truncated_to(1);
        assert!(session.transcript.is_none());
    }

    #[test]
    fn a_result_added_to_a_tool_call_a_summary_kept_shows_after_that_call() {
        let original = said(&["a1", "a2", "b1 call", "b2"]);
        let mut session = routed("answered-late");
        let after = said(&["summary of a", "b1 call", "b2"]);
        session.record_compaction(&original, &after);
        session.messages = after;

        session
            .messages
            .insert(2, Message::text("user", "b1 result"));
        let context = session.messages.clone();
        session.context_inserted_at(2, &context);
        session.messages.push(Message::text("user", "c1"));
        assert_eq!(
            spoken(&session, &session.messages),
            ["a1", "a2", "b1 call", "b1 result", "b2", "c1"]
        );

        session.messages[2] = Message::text("user", "b1 result and a late one");
        let context = session.messages.clone();
        session.context_edited_at(2, &context);
        assert_eq!(
            spoken(&session, &session.messages),
            [
                "a1",
                "a2",
                "b1 call",
                "b1 result and a late one",
                "b2",
                "c1"
            ],
            "a message changed where it stands was taken for another conversation"
        );
    }

    #[test]
    fn restoring_an_earlier_context_cuts_the_transcript_back_to_it() {
        let first = said(&["first ask", "first answer"]);
        let mut session = routed("restored");
        let before_any_compaction = session.transcript_mark();
        assert_eq!(before_any_compaction, None);

        let mut second = said(&["summary of the first turn"]);
        session.record_compaction(&first, &second);
        second.push(Message::text("user", "second ask"));
        let after_first = session.transcript_mark();
        let third = said(&["summary of both"]);
        session.record_compaction(&second, &third);
        assert_eq!(spoken(&session, &third).len(), 3);

        session.restore_transcript(after_first);
        assert_eq!(
            spoken(&session, &second),
            ["first ask", "first answer", "second ask"]
        );

        session.restore_transcript(before_any_compaction);
        assert!(session.transcript.is_none());
        assert_eq!(spoken(&session, &first).len(), 2);
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
