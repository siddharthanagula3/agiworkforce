//! Managed-session-backed conversation storage compatibility layer.
//!
//! The CLI now persists live sessions as JSON/JSONL files under
//! `~/.agiworkforce/managed_sessions/`, following the same session-first
//! architecture used by the reference runtimes in `~/Desktop/src` and
//! `~/Desktop/claw-code`.
//!
//! This module preserves the older `sessions::*` surface so existing CLI
//! commands keep compiling, but it no longer depends on SQLite.
//!
//! # Sync-rule isolation
//!
//! Per the locked product rule: **Consumer chat sync is only Web, Desktop, and
//! Mobile.  CLI, VS Code, and Chrome must not sync consumer chat history.**
//!
//! The CLI satisfies this rule by design:
//! - All session data is written to the local filesystem under
//!   `~/.agiworkforce/managed_sessions/` and
//!   `~/.agiworkforce/conversations/`.
//! - No code in `apps/cli/` reads or writes the synced app `chat_messages`,
//!   `conversations`, or `user_projects` cloud tables.
//! - No code in `apps/cli/` constructs `ProjectSourceSurface::Web`,
//!   `::Desktop`, or `::Mobile`.
//! - `tier_cache.rs` calls `/api/me` over HTTPS for subscription-tier
//!   resolution only, it does not touch consumer-chat tables.
//!
//! `ProjectSourceSurface::Cli.is_developer_session_surface()` returns `true`
//! and `is_synced_app_surface()` returns `false`; a unit test below enforces
//! this at build time.  See `crates/agiworkforce-protocol/src/projects.rs` for
//! the canonical rule implementation.

use anyhow::{bail, Context, Result};
use chrono::{DateTime, Utc};
use regex::Regex;
use serde::{Deserialize, Serialize};
use std::collections::{HashMap, HashSet};
use std::fs;
use std::path::{Path, PathBuf};
use std::sync::LazyLock;
use uuid::Uuid;

use crate::models::{ContentBlock, Message, MessageContent};
use crate::runtime::session::{
    validate_managed_session_id, validate_summary_text, ManagedSession,
    MANAGED_SESSION_CWD_MAX_UTF16, MANAGED_SESSION_JSONL_EXTENSION,
    MANAGED_SESSION_MODEL_MAX_UTF16, MANAGED_SESSION_TITLE_MAX_UTF16,
};
use crate::runtime::session_control::{ManagedSessionReference, MANAGED_SESSION_DIR_NAME};

const SESSION_METADATA_DIR_NAME: &str = "managed_session_metadata";
const SESSION_METADATA_MAX_BYTES: u64 = 64 * 1024;

static GITHUB_PR_URL_RE: LazyLock<Regex> = LazyLock::new(|| {
    Regex::new(
        r"(?i)(?:https?://)?(?:www\.)?github\.com/(?P<owner>[a-z0-9_.-]+)/(?P<repo>[a-z0-9_.-]+)/pull/(?P<number>[1-9][0-9]*)",
    )
    .expect("GitHub pull-request URL regex is valid")
});

static GITHUB_PR_SHORTHAND_RE: LazyLock<Regex> = LazyLock::new(|| {
    Regex::new(r"(?i)(?P<owner>[a-z0-9_.-]+)/(?P<repo>[a-z0-9_.-]+)#(?P<number>[1-9][0-9]*)")
        .expect("GitHub pull-request shorthand regex is valid")
});

// ---------------------------------------------------------------------------
// Atomic write helpers (P1-7: concurrent CLI session safety)
// ---------------------------------------------------------------------------

/// Write `contents` to `target` atomically: write to a tempfile in the same
/// directory, then rename into place.  An exclusive flock on a per-directory
/// `.write.lock` file serializes concurrent CLI processes on Unix.
fn atomic_write(target: &Path, contents: &[u8]) -> Result<()> {
    let dir = target
        .parent()
        .ok_or_else(|| anyhow::anyhow!("target path has no parent: {}", target.display()))?;
    fs::create_dir_all(dir)
        .with_context(|| format!("Failed to create directory {}", dir.display()))?;
    let _lock = DirLock::acquire(dir)?;
    let tmp = tempfile::NamedTempFile::new_in(dir)
        .with_context(|| format!("Failed to create tempfile in {}", dir.display()))?;
    fs::write(tmp.path(), contents)
        .with_context(|| format!("Failed to write tempfile {}", tmp.path().display()))?;
    tmp.persist(target)
        .map_err(|e| anyhow::anyhow!("Failed to rename tempfile to {}: {}", target.display(), e))?;
    Ok(())
}

struct DirLock {
    #[cfg(unix)]
    _guard: nix::fcntl::Flock<fs::File>,
}

impl DirLock {
    #[cfg(unix)]
    fn acquire(dir: &Path) -> Result<Self> {
        use nix::fcntl::{Flock, FlockArg};
        let lock_path = dir.join(".write.lock");
        let file = fs::OpenOptions::new()
            .create(true)
            .truncate(false)
            .write(true)
            .open(&lock_path)
            .with_context(|| format!("Failed to open lock file {}", lock_path.display()))?;
        let guard = Flock::lock(file, FlockArg::LockExclusive)
            .map_err(|(_, e)| anyhow::anyhow!("flock on {} failed: {}", lock_path.display(), e))?;
        Ok(Self { _guard: guard })
    }

    #[cfg(not(unix))]
    fn acquire(_dir: &Path) -> Result<Self> {
        Ok(Self {})
    }
}

#[derive(Debug, Clone)]
pub struct Connection {
    base_dir: PathBuf,
}

#[derive(Debug, Clone, Serialize, Deserialize, Default)]
struct SessionMetadata {
    #[serde(default, skip_serializing_if = "Option::is_none")]
    title: Option<String>,
    #[serde(default)]
    custom_title: bool,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    model: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    cwd: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    git_branch: Option<String>,
}

fn validate_metadata(metadata: &SessionMetadata) -> Result<()> {
    if let Some(title) = metadata.title.as_deref() {
        validate_summary_text(title, "metadata title", MANAGED_SESSION_TITLE_MAX_UTF16)?;
    }
    if let Some(model) = metadata.model.as_deref() {
        validate_summary_text(model, "metadata model", MANAGED_SESSION_MODEL_MAX_UTF16)?;
    }
    if let Some(cwd) = metadata.cwd.as_deref() {
        validate_summary_text(cwd, "metadata cwd", MANAGED_SESSION_CWD_MAX_UTF16)?;
    }
    if let Some(git_branch) = metadata.git_branch.as_deref() {
        validate_summary_text(
            git_branch,
            "metadata git_branch",
            MANAGED_SESSION_TITLE_MAX_UTF16,
        )?;
    }
    Ok(())
}

/// Lightweight view of a session returned by list/search queries.
#[derive(Debug, Clone)]
pub struct SessionSummary {
    pub id: String,
    pub title: String,
    pub model: String,
    pub cwd: String,
    pub git_branch: String,
    #[allow(dead_code)]
    pub created_at: i64,
    pub updated_at: i64,
    pub total_tokens: i64,
    pub message_count: i64,
}

/// High-level session store statistics.
#[derive(Debug, Clone)]
pub struct DbStats {
    pub session_count: i64,
    pub message_count: i64,
    pub tool_call_count: i64,
    pub total_tokens: i64,
}

fn open_db_in(base_dir: impl AsRef<Path>) -> Result<Connection> {
    let base_dir = base_dir.as_ref().to_path_buf();
    fs::create_dir_all(base_dir.join(MANAGED_SESSION_DIR_NAME)).with_context(|| {
        format!(
            "Failed to create managed session directory {}",
            base_dir.join(MANAGED_SESSION_DIR_NAME).display()
        )
    })?;
    fs::create_dir_all(base_dir.join(SESSION_METADATA_DIR_NAME)).with_context(|| {
        format!(
            "Failed to create managed session metadata directory {}",
            base_dir.join(SESSION_METADATA_DIR_NAME).display()
        )
    })?;
    Ok(Connection { base_dir })
}

/// Open the managed session store rooted in the CLI config directory.
pub fn open_db() -> Result<Connection> {
    let base_dir =
        crate::config::CliConfig::config_dir().context("Failed to locate config directory")?;
    open_db_in(base_dir)
}

fn metadata_dir(base_dir: &Path) -> PathBuf {
    base_dir.join(SESSION_METADATA_DIR_NAME)
}

fn metadata_path(base_dir: &Path, session_id: &str) -> PathBuf {
    metadata_dir(base_dir).join(format!("{session_id}.json"))
}

fn managed_sessions_dir(base_dir: &Path) -> PathBuf {
    base_dir.join(MANAGED_SESSION_DIR_NAME)
}

fn session_file_candidates(base_dir: &Path, session_id: &str) -> [PathBuf; 2] {
    [
        managed_sessions_dir(base_dir)
            .join(format!("{session_id}.{}", MANAGED_SESSION_JSONL_EXTENSION)),
        managed_sessions_dir(base_dir).join(format!("{session_id}.json")),
    ]
}

fn find_session_path(base_dir: &Path, session_id: &str) -> Option<PathBuf> {
    if validate_managed_session_id(session_id).is_err() {
        return None;
    }
    session_file_candidates(base_dir, session_id)
        .into_iter()
        .find(|path| path.exists())
}

fn save_session_to_default_path(base_dir: &Path, session: &ManagedSession) -> Result<PathBuf> {
    validate_managed_session_id(&session.session_id)?;
    let path = managed_sessions_dir(base_dir).join(format!(
        "{}.{}",
        session.session_id, MANAGED_SESSION_JSONL_EXTENSION
    ));
    // Acquire an exclusive flock on the managed_sessions directory so
    // concurrent CLI processes (e.g. session fork + parent) serialise writes.
    let dir = managed_sessions_dir(base_dir);
    let _lock = DirLock::acquire(&dir)?;
    session.save_to_path(&path)?;
    Ok(path)
}

fn read_metadata(base_dir: &Path, session_id: &str) -> Result<Option<SessionMetadata>> {
    validate_managed_session_id(session_id)?;
    let path = metadata_path(base_dir, session_id);
    if !path.exists() {
        return Ok(None);
    }

    let metadata_size = fs::metadata(&path)
        .with_context(|| format!("Failed to inspect session metadata {}", path.display()))?
        .len();
    if metadata_size > SESSION_METADATA_MAX_BYTES {
        bail!(
            "Session metadata {} exceeds the {} byte limit",
            path.display(),
            SESSION_METADATA_MAX_BYTES
        );
    }

    let contents = fs::read_to_string(&path)
        .with_context(|| format!("Failed to read session metadata {}", path.display()))?;
    let metadata: SessionMetadata = serde_json::from_str(&contents)
        .with_context(|| format!("Failed to parse session metadata {}", path.display()))?;
    validate_metadata(&metadata)
        .with_context(|| format!("Invalid session metadata {}", path.display()))?;
    Ok(Some(metadata))
}

fn write_metadata(base_dir: &Path, session_id: &str, metadata: &SessionMetadata) -> Result<()> {
    validate_managed_session_id(session_id)?;
    validate_metadata(metadata)?;
    let path = metadata_path(base_dir, session_id);
    let contents =
        serde_json::to_string_pretty(metadata).context("Failed to serialize session metadata")?;
    if contents.len() as u64 > SESSION_METADATA_MAX_BYTES {
        bail!(
            "Session metadata {} exceeds the {} byte limit",
            path.display(),
            SESSION_METADATA_MAX_BYTES
        );
    }
    atomic_write(&path, contents.as_bytes())
        .with_context(|| format!("Failed to write session metadata {}", path.display()))?;
    Ok(())
}

fn infer_title(messages: &[Message]) -> String {
    messages
        .iter()
        .find(|message| message.role == "user")
        .map(|message| {
            let text = message.text_content();
            let normalized = text.split_whitespace().collect::<Vec<_>>().join(" ");
            let truncated: String = normalized.chars().take(50).collect();
            if normalized.chars().count() > 50 {
                format!("{truncated}...")
            } else {
                truncated
            }
        })
        .filter(|title| !title.trim().is_empty())
        .unwrap_or_else(|| "Untitled".to_string())
}

fn total_tokens(messages: &[Message]) -> i64 {
    messages
        .iter()
        .map(|message| crate::compaction::message_tokens(message) as i64)
        .sum()
}

fn tool_call_count(messages: &[Message]) -> i64 {
    messages
        .iter()
        .map(|message| match &message.content {
            MessageContent::Text(_) => 0,
            MessageContent::Blocks(blocks) => blocks
                .iter()
                .filter(|block| matches!(block, ContentBlock::ToolUse { .. }))
                .count() as i64,
        })
        .sum()
}

fn load_managed_session_from_path(path: &Path) -> Result<ManagedSession> {
    ManagedSession::load_from_path(path)
}

fn resolve_reference_path(base_dir: &Path, reference: &str) -> Result<PathBuf> {
    let parsed = ManagedSessionReference::parse(reference)?;
    match parsed {
        ManagedSessionReference::Latest => list_sessions_in(base_dir, usize::MAX)?
            .into_iter()
            .next()
            .map(|summary| {
                find_session_path(base_dir, &summary.id)
                    .ok_or_else(|| anyhow::anyhow!("Managed session '{}' is missing", summary.id))
            })
            .transpose()?
            .ok_or_else(|| anyhow::anyhow!("No managed sessions are available")),
        ManagedSessionReference::SessionId(session_id) => find_session_path(base_dir, &session_id)
            .ok_or_else(|| anyhow::anyhow!("Session '{}' not found", session_id)),
        ManagedSessionReference::Path(path) => {
            let path = if path.is_absolute() {
                path
            } else {
                base_dir.join(path)
            };
            if !path.exists() {
                bail!("Session file {} does not exist", path.display());
            }
            Ok(path)
        }
    }
}

fn load_all_sessions(
    base_dir: &Path,
) -> Result<Vec<(PathBuf, ManagedSession, Option<SessionMetadata>)>> {
    let dir = managed_sessions_dir(base_dir);
    if !dir.exists() {
        return Ok(Vec::new());
    }

    let mut by_session_id: HashMap<String, (PathBuf, ManagedSession, Option<SessionMetadata>)> =
        HashMap::new();

    for entry in fs::read_dir(&dir)
        .with_context(|| format!("Failed to read managed session directory {}", dir.display()))?
    {
        let path = match entry {
            Ok(entry) => entry.path(),
            Err(error) => {
                eprintln!(
                    "warning: skipped unreadable managed-session directory entry in {}: {error}",
                    dir.display()
                );
                continue;
            }
        };
        let extension = path.extension().and_then(|value| value.to_str());
        if !matches!(extension, Some("jsonl") | Some("json")) {
            continue;
        }

        let session = match load_managed_session_from_path(&path) {
            Ok(session) => session,
            Err(error) => {
                eprintln!(
                    "warning: skipped invalid managed session {}: {error:#}",
                    path.display()
                );
                continue;
            }
        };
        let metadata = match read_metadata(base_dir, &session.session_id) {
            Ok(metadata) => metadata,
            Err(error) => {
                eprintln!(
                    "warning: ignored invalid metadata for managed session '{}': {error:#}",
                    session.session_id
                );
                None
            }
        };

        match by_session_id.get(&session.session_id) {
            Some((existing_path, existing_session, _))
                if existing_session.updated_at > session.updated_at
                    || (existing_session.updated_at == session.updated_at
                        && existing_path.extension().and_then(|value| value.to_str())
                            == Some("jsonl")
                        && path.extension().and_then(|value| value.to_str()) == Some("json")) => {}
            _ => {
                by_session_id.insert(session.session_id.clone(), (path, session, metadata));
            }
        }
    }

    let mut sessions: Vec<_> = by_session_id.into_values().collect();
    sessions.sort_by(|left, right| {
        right
            .1
            .updated_at
            .cmp(&left.1.updated_at)
            .then_with(|| right.1.created_at.cmp(&left.1.created_at))
            .then_with(|| left.1.session_id.cmp(&right.1.session_id))
    });
    Ok(sessions)
}

fn summary_from_session(
    path: &Path,
    session: &ManagedSession,
    metadata: Option<&SessionMetadata>,
) -> SessionSummary {
    let title = metadata
        .and_then(|value| value.title.clone())
        .unwrap_or_else(|| infer_title(&session.messages));
    let model = metadata
        .and_then(|value| value.model.clone())
        .unwrap_or_default();
    let cwd = metadata
        .and_then(|value| value.cwd.clone())
        .unwrap_or_default();
    let git_branch = metadata
        .and_then(|value| value.git_branch.clone())
        .unwrap_or_default();

    let _ = path;

    SessionSummary {
        id: session.session_id.clone(),
        title,
        model,
        cwd,
        git_branch,
        created_at: session.created_at.timestamp_millis(),
        updated_at: session.updated_at.timestamp_millis(),
        total_tokens: total_tokens(&session.messages),
        message_count: session.messages.len() as i64,
    }
}

fn list_sessions_in(base_dir: &Path, limit: usize) -> Result<Vec<SessionSummary>> {
    let sessions = load_all_sessions(base_dir)?;
    Ok(sessions
        .into_iter()
        .take(limit)
        .map(|(path, session, metadata)| summary_from_session(&path, &session, metadata.as_ref()))
        .collect())
}

/// Sync metadata for a managed session so list/search output keeps useful
/// information like title and model.
pub fn sync_session_metadata(
    conn: &Connection,
    session_id: &str,
    model: &str,
    cwd: &str,
    git_branch: &str,
    messages: &[Message],
) -> Result<()> {
    let mut metadata = read_metadata(&conn.base_dir, session_id)?.unwrap_or_default();
    if !metadata.custom_title {
        metadata.title = Some(infer_title(messages));
    }
    if !model.trim().is_empty() {
        metadata.model = Some(model.to_string());
    }
    if !cwd.trim().is_empty() {
        metadata.cwd = Some(cwd.to_string());
    }
    if !git_branch.trim().is_empty() {
        metadata.git_branch = Some(git_branch.to_string());
    }
    write_metadata(&conn.base_dir, session_id, &metadata)
}

/// Upsert session metadata and ensure the backing managed session file exists.
pub fn save_session(
    conn: &Connection,
    session_id: &str,
    title: &str,
    model: &str,
    cwd: &str,
    git_branch: &str,
) -> Result<()> {
    let path = find_session_path(&conn.base_dir, session_id);
    let session = if let Some(path) = path {
        let mut session = load_managed_session_from_path(&path)?;
        session.touch();
        session
    } else {
        ManagedSession::new(session_id.to_string(), Utc::now())
    };
    save_session_to_default_path(&conn.base_dir, &session)?;

    let mut metadata = read_metadata(&conn.base_dir, session_id)?.unwrap_or_default();
    if !title.trim().is_empty() {
        metadata.title = Some(title.to_string());
        metadata.custom_title = true;
    } else if !metadata.custom_title {
        metadata.title = Some("Untitled".to_string());
    }
    if !model.trim().is_empty() {
        metadata.model = Some(model.to_string());
    }
    if !cwd.trim().is_empty() {
        metadata.cwd = Some(cwd.to_string());
    }
    if !git_branch.trim().is_empty() {
        metadata.git_branch = Some(git_branch.to_string());
    }
    write_metadata(&conn.base_dir, session_id, &metadata)
}

/// Append a message to a managed session and return a synthetic message id.
pub fn save_message(
    conn: &Connection,
    session_id: &str,
    msg: &Message,
    _tokens: usize,
) -> Result<i64> {
    let path = find_session_path(&conn.base_dir, session_id)
        .ok_or_else(|| anyhow::anyhow!("Session '{}' not found", session_id))?;
    let mut session = load_managed_session_from_path(&path)?;
    session.push_message(msg.clone());
    save_session_to_default_path(&conn.base_dir, &session)?;

    let mut metadata = read_metadata(&conn.base_dir, session_id)?.unwrap_or_default();
    if !metadata.custom_title {
        metadata.title = Some(infer_title(&session.messages));
    }
    write_metadata(&conn.base_dir, session_id, &metadata)?;

    Ok(session.messages.len() as i64)
}

/// List sessions ordered by most-recently-updated, up to `limit` rows.
pub fn list_sessions(conn: &Connection, limit: usize) -> Result<Vec<SessionSummary>> {
    list_sessions_in(&conn.base_dir, limit)
}

/// Load all messages for a managed session in chronological order.
pub fn load_session(conn: &Connection, session_id: &str) -> Result<Vec<Message>> {
    let path = resolve_reference_path(&conn.base_dir, session_id)?;
    let session = load_managed_session_from_path(&path)?;
    Ok(session.messages)
}

/// Delete a managed session and its metadata.
#[allow(dead_code)]
pub fn delete_session(conn: &Connection, session_id: &str) -> Result<()> {
    let path = resolve_reference_path(&conn.base_dir, session_id)?;
    let session = load_managed_session_from_path(&path)?;
    fs::remove_file(&path)
        .with_context(|| format!("Failed to delete session file {}", path.display()))?;
    let metadata = metadata_path(&conn.base_dir, &session.session_id);
    if metadata.exists() {
        fs::remove_file(&metadata)
            .with_context(|| format!("Failed to delete session metadata {}", metadata.display()))?;
    }
    Ok(())
}

/// Rename a session title by updating its metadata sidecar.
pub fn rename_session(conn: &Connection, session_id: &str, new_title: &str) -> Result<()> {
    let path = resolve_reference_path(&conn.base_dir, session_id)?;
    let session = load_managed_session_from_path(&path)?;
    let mut metadata = read_metadata(&conn.base_dir, &session.session_id)?.unwrap_or_default();
    metadata.title = Some(new_title.to_string());
    metadata.custom_title = true;
    write_metadata(&conn.base_dir, &session.session_id, &metadata)
}

fn normalize_for_search(input: &str) -> String {
    input.to_lowercase()
}

fn github_pr_search_keys(input: &str) -> HashSet<String> {
    GITHUB_PR_URL_RE
        .captures_iter(input)
        .chain(GITHUB_PR_SHORTHAND_RE.captures_iter(input))
        .filter_map(|captures| {
            let owner = captures.name("owner")?.as_str().to_ascii_lowercase();
            let repo = captures
                .name("repo")?
                .as_str()
                .trim_end_matches(".git")
                .to_ascii_lowercase();
            let number = captures.name("number")?.as_str();
            Some(format!("{owner}/{repo}#{number}"))
        })
        .collect()
}

/// Largest char boundary `<= index` (clamped to `s.len()`).
#[allow(dead_code)]
fn floor_char_boundary(s: &str, index: usize) -> usize {
    let mut idx = index.min(s.len());
    while idx > 0 && !s.is_char_boundary(idx) {
        idx -= 1;
    }
    idx
}

/// Smallest char boundary `>= index` (clamped to `s.len()`).
#[allow(dead_code)]
fn ceil_char_boundary(s: &str, index: usize) -> usize {
    let mut idx = index.min(s.len());
    while idx < s.len() && !s.is_char_boundary(idx) {
        idx += 1;
    }
    idx
}

/// Full-text search across managed session titles and message content.
pub fn search_sessions(conn: &Connection, query: &str) -> Result<Vec<SessionSummary>> {
    let needle = normalize_for_search(query);
    let query_pr_keys = github_pr_search_keys(query);
    let sessions = load_all_sessions(&conn.base_dir)?;
    Ok(sessions
        .into_iter()
        .filter_map(|(path, session, metadata)| {
            let summary = summary_from_session(&path, &session, metadata.as_ref());
            let title_matches = normalize_for_search(&summary.title).contains(&needle);
            let content_matches = session
                .messages
                .iter()
                .any(|message| normalize_for_search(&message.text_content()).contains(&needle));
            let pr_matches = !query_pr_keys.is_empty()
                && (!github_pr_search_keys(&summary.title).is_disjoint(&query_pr_keys)
                    || session.messages.iter().any(|message| {
                        !github_pr_search_keys(&message.text_content()).is_disjoint(&query_pr_keys)
                    }));
            (title_matches || content_matches || pr_matches).then_some(summary)
        })
        .take(50)
        .collect())
}

/// Fork an existing managed session into a new managed session id.
#[allow(dead_code)]
pub fn fork_session(conn: &Connection, source_id: &str) -> Result<String> {
    let source_path = resolve_reference_path(&conn.base_dir, source_id)?;
    let source_session = load_managed_session_from_path(&source_path)?;
    let new_id = Uuid::new_v4().to_string();
    let forked = ManagedSession::forked_from(&source_session, new_id.clone(), Utc::now(), None);
    save_session_to_default_path(&conn.base_dir, &forked)?;

    let source_summary = list_sessions(conn, usize::MAX)?
        .into_iter()
        .find(|summary| summary.id == source_session.session_id);
    let mut metadata = source_summary
        .map(|summary| SessionMetadata {
            title: Some(format!("(fork) {}", summary.title)),
            custom_title: true,
            model: Some(summary.model),
            cwd: Some(summary.cwd),
            git_branch: Some(summary.git_branch),
        })
        .unwrap_or_default();
    if metadata.title.is_none() {
        metadata.title = Some("(fork) Untitled".to_string());
        metadata.custom_title = true;
    }
    write_metadata(&conn.base_dir, &new_id, &metadata)?;

    Ok(new_id)
}

/// Aggregate session store statistics.
pub fn db_stats(conn: &Connection) -> Result<DbStats> {
    let sessions = load_all_sessions(&conn.base_dir)?;
    let mut session_count = 0i64;
    let mut message_count = 0i64;
    let mut total_tool_calls = 0i64;
    let mut total_tokens_count = 0i64;

    for (_path, session, _metadata) in sessions {
        session_count += 1;
        message_count += session.messages.len() as i64;
        total_tool_calls += tool_call_count(&session.messages);
        total_tokens_count += total_tokens(&session.messages);
    }

    Ok(DbStats {
        session_count,
        message_count,
        tool_call_count: total_tool_calls,
        total_tokens: total_tokens_count,
    })
}

/// Import legacy JSON conversations into the managed session store.
pub fn migrate_json_conversations(conn: &Connection, json_dir: &Path) -> Result<usize> {
    if !json_dir.exists() {
        return Ok(0);
    }

    let mut imported = 0usize;

    for entry in fs::read_dir(json_dir)
        .with_context(|| format!("Cannot read {}", json_dir.display()))?
        .flatten()
    {
        let path = entry.path();
        if path.extension().and_then(|value| value.to_str()) != Some("json") {
            continue;
        }

        let text = match fs::read_to_string(&path) {
            Ok(contents) => contents,
            Err(_) => continue,
        };

        let json: serde_json::Value = match serde_json::from_str(&text) {
            Ok(value) => value,
            Err(_) => continue,
        };

        let session_id = match json.get("id").and_then(|value| value.as_str()) {
            Some(value) if !value.trim().is_empty() => value,
            _ => continue,
        };

        if find_session_path(&conn.base_dir, session_id).is_some() {
            continue;
        }

        let title = json
            .get("title")
            .and_then(|value| value.as_str())
            .unwrap_or("Imported session");
        let model = json
            .get("model")
            .and_then(|value| value.as_str())
            .unwrap_or("unknown");
        save_session(conn, session_id, title, model, "", "")?;

        if let Some(messages) = json.get("messages").and_then(|value| value.as_array()) {
            for message in messages {
                let role = message
                    .get("role")
                    .and_then(|value| value.as_str())
                    .unwrap_or("user");
                let content = message
                    .get("content")
                    .and_then(|value| value.as_str())
                    .unwrap_or("");
                save_message(conn, session_id, &Message::text(role, content), 0)?;
            }
        }

        imported += 1;
    }

    Ok(imported)
}

/// Group sessions by date bucket: "Today", "Yesterday", "This Week", or a date string.
pub fn date_group_sessions(sessions: &[SessionSummary]) -> Vec<(String, Vec<&SessionSummary>)> {
    let now = now_ms();
    let today_start = now - (now % 86_400_000);
    let yesterday_start = today_start - 86_400_000;
    let week_start = today_start - 7 * 86_400_000;

    let mut groups: Vec<(String, Vec<&SessionSummary>)> = Vec::new();

    for session in sessions {
        let label = if session.updated_at >= today_start {
            "Today".to_string()
        } else if session.updated_at >= yesterday_start {
            "Yesterday".to_string()
        } else if session.updated_at >= week_start {
            "This Week".to_string()
        } else {
            format_date_only(session.updated_at)
        };

        if let Some(group) = groups.iter_mut().find(|(existing, _)| *existing == label) {
            group.1.push(session);
        } else {
            groups.push((label, vec![session]));
        }
    }

    groups
}

/// Format a session list for terminal output, grouped by date.
pub fn format_session_list(sessions: &[SessionSummary]) -> String {
    if sessions.is_empty() {
        return "No sessions found.".to_string();
    }

    let groups = date_group_sessions(sessions);
    let mut out = String::new();

    for (label, group) in &groups {
        out.push_str(&format!("  {label}:\n"));
        for session in group {
            let title = if session.title.is_empty() {
                "(untitled)"
            } else {
                &session.title
            };
            let short_id = &session.id[..session.id.len().min(8)];
            out.push_str(&format!(
                "    {:<40} {:>4} msgs  {}\n",
                format!("{title} [{short_id}]"),
                session.message_count,
                if session.model.is_empty() {
                    "unknown"
                } else {
                    &session.model
                },
            ));
        }
    }

    out
}

fn now_ms() -> i64 {
    std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .unwrap_or_default()
        .as_millis() as i64
}

fn format_date_only(ms: i64) -> String {
    DateTime::<Utc>::from_timestamp_millis(ms)
        .map(|timestamp| timestamp.format("%Y-%m-%d").to_string())
        .unwrap_or_else(|| "1970-01-01".to_string())
}

#[cfg(test)]
mod tests {
    use super::*;
    use chrono::TimeZone;
    use tempfile::tempdir;

    fn temp_connection() -> (tempfile::TempDir, Connection) {
        let tempdir = tempdir().unwrap();
        let conn = open_db_in(tempdir.path()).unwrap();
        (tempdir, conn)
    }

    #[test]
    fn save_and_load_managed_session_messages() {
        let (_tempdir, conn) = temp_connection();
        save_session(&conn, "s1", "Hello", "claude", "/tmp", "main").unwrap();
        save_message(&conn, "s1", &Message::text("user", "Hello"), 5).unwrap();
        save_message(&conn, "s1", &Message::text("assistant", "Hi"), 3).unwrap();

        let list = list_sessions(&conn, 10).unwrap();
        assert_eq!(list.len(), 1);
        assert_eq!(list[0].id, "s1");
        assert_eq!(list[0].title, "Hello");
        assert_eq!(list[0].model, "claude");
        assert_eq!(list[0].message_count, 2);

        let messages = load_session(&conn, "s1").unwrap();
        assert_eq!(messages.len(), 2);
        assert_eq!(messages[0].role, "user");
        assert_eq!(messages[1].role, "assistant");
    }

    #[test]
    fn rename_and_delete_session() {
        let (_tempdir, conn) = temp_connection();
        save_session(&conn, "s2", "Old", "claude", "/", "").unwrap();
        rename_session(&conn, "s2", "New").unwrap();
        assert_eq!(list_sessions(&conn, 10).unwrap()[0].title, "New");
        delete_session(&conn, "s2").unwrap();
        assert!(list_sessions(&conn, 10).unwrap().is_empty());
    }

    #[test]
    fn search_and_stats_use_managed_sessions() {
        let (_tempdir, conn) = temp_connection();
        save_session(&conn, "s3", "Rust debugging", "claude", "/", "").unwrap();
        save_message(
            &conn,
            "s3",
            &Message::text("user", "Investigate Rust search"),
            7,
        )
        .unwrap();
        save_session(
            &conn,
            "s4",
            "Python tutorial",
            "fixture-session-model",
            "/",
            "",
        )
        .unwrap();
        save_message(&conn, "s4", &Message::text("user", "Teach me Python"), 4).unwrap();

        let results = search_sessions(&conn, "rust").unwrap();
        assert_eq!(results.len(), 1);
        assert_eq!(results[0].id, "s3");

        let stats = db_stats(&conn).unwrap();
        assert_eq!(stats.session_count, 2);
        assert_eq!(stats.message_count, 2);
        assert!(stats.total_tokens >= 11);
    }

    #[test]
    fn search_normalizes_github_pull_request_urls_and_shorthand() {
        let (_tempdir, conn) = temp_connection();
        save_session(&conn, "pr-shorthand", "Review follow-up", "claude", "/", "").unwrap();
        save_message(
            &conn,
            "pr-shorthand",
            &Message::text("user", "Continue the acme/widgets#417 review"),
            8,
        )
        .unwrap();
        save_session(&conn, "other-repo", "Unrelated review", "claude", "/", "").unwrap();
        save_message(
            &conn,
            "other-repo",
            &Message::text("user", "Review other/widgets#417"),
            8,
        )
        .unwrap();
        save_session(&conn, "pr-url", "URL review", "claude", "/", "").unwrap();
        save_message(
            &conn,
            "pr-url",
            &Message::text(
                "assistant",
                "Opened https://github.com/Acme/Widgets/pull/418 for review.",
            ),
            8,
        )
        .unwrap();

        let from_url = search_sessions(
            &conn,
            "https://github.com/acme/widgets/pull/417/files?diff=split",
        )
        .unwrap();
        assert_eq!(
            from_url
                .iter()
                .map(|session| session.id.as_str())
                .collect::<Vec<_>>(),
            vec!["pr-shorthand"]
        );

        let from_shorthand = search_sessions(&conn, "acme/widgets#418").unwrap();
        assert_eq!(
            from_shorthand
                .iter()
                .map(|session| session.id.as_str())
                .collect::<Vec<_>>(),
            vec!["pr-url"]
        );
    }

    #[test]
    fn format_date_only_uses_real_calendar_dates() {
        let timestamp = chrono::Utc
            .with_ymd_and_hms(2024, 2, 29, 12, 0, 0)
            .unwrap()
            .timestamp_millis();

        assert_eq!(format_date_only(timestamp), "2024-02-29");
    }

    #[test]
    fn migrate_json_conversations_imports_managed_sessions() {
        let (tempdir, conn) = temp_connection();
        let conversations_dir = tempdir.path().join("conversations");
        fs::create_dir_all(&conversations_dir).unwrap();
        fs::write(
            conversations_dir.join("legacy.json"),
            serde_json::json!({
                "id": "legacy-session",
                "title": "Legacy",
                "model": "claude",
                "messages": [
                    { "role": "user", "content": "Hello" },
                    { "role": "assistant", "content": "Hi" }
                ]
            })
            .to_string(),
        )
        .unwrap();

        let imported = migrate_json_conversations(&conn, &conversations_dir).unwrap();
        assert_eq!(imported, 1);
        assert_eq!(list_sessions(&conn, 10).unwrap()[0].id, "legacy-session");
    }

    #[test]
    fn cli_surface_is_developer_session_not_synced_app() {
        use agiworkforce_protocol::projects::ProjectSourceSurface;
        // Locked rule: CLI must not sync consumer chat history.
        // ProjectSourceSurface::Cli must be a developer-session surface, never
        // a synced-app surface (Web/Desktop/Mobile).
        assert!(ProjectSourceSurface::Cli.is_developer_session_surface());
        assert!(!ProjectSourceSurface::Cli.is_synced_app_surface());
    }
}
