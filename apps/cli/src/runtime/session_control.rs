use anyhow::{bail, Context, Result};
use chrono::{DateTime, Utc};
use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use std::fs;
use std::path::{Path, PathBuf};
use uuid::Uuid;

use crate::config::CliConfig;
use crate::models::Message;

use super::session::ManagedSession;
use super::session::ManagedSessionForkMetadata;

/// Subdirectory under the CLI config directory where managed sessions live.
pub const MANAGED_SESSION_DIR_NAME: &str = "managed_sessions";

/// User-facing references accepted by the managed session control helpers.
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
pub enum ManagedSessionReference {
    Latest,
    SessionId(String),
    Path(PathBuf),
}

/// Lightweight metadata returned by session listing and reference resolution.
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
pub struct ManagedSessionSummary {
    pub version: u32,
    pub session_id: String,
    pub path: PathBuf,
    pub created_at: DateTime<Utc>,
    pub updated_at: DateTime<Utc>,
    pub message_count: usize,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub fork: Option<ManagedSessionForkMetadata>,
}

/// Resolved session reference that includes both the original reference and the located session.
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
pub struct ResolvedManagedSessionReference {
    pub reference: ManagedSessionReference,
    pub path: PathBuf,
    pub summary: ManagedSessionSummary,
}

impl ManagedSessionReference {
    /// Parse a user-facing session reference string.
    pub fn parse(input: impl AsRef<str>) -> Result<Self> {
        let input = input.as_ref().trim();
        if input.is_empty() {
            bail!("Managed session reference cannot be empty");
        }

        if matches!(input, "latest" | "@latest" | "last") {
            return Ok(Self::Latest);
        }

        let path = Path::new(input);
        if path.exists()
            || path.is_absolute()
            || input.contains(std::path::MAIN_SEPARATOR)
            || input.contains('/')
            || input.contains('\\')
            || path.extension().is_some()
        {
            return Ok(Self::Path(PathBuf::from(input)));
        }

        Ok(Self::SessionId(input.to_string()))
    }
}

impl ManagedSessionSummary {
    fn from_session(session: &ManagedSession, path: PathBuf) -> Self {
        Self {
            version: session.version,
            session_id: session.session_id.clone(),
            path,
            created_at: session.created_at,
            updated_at: session.updated_at,
            message_count: session.messages.len(),
            fork: session.fork.clone(),
        }
    }
}

fn managed_session_dir_in(base_dir: &Path) -> PathBuf {
    base_dir.join(MANAGED_SESSION_DIR_NAME)
}

fn managed_session_root_dir() -> Result<PathBuf> {
    Ok(managed_session_dir_in(&CliConfig::config_dir()?))
}

fn ensure_managed_session_dir(base_dir: &Path) -> Result<PathBuf> {
    let dir = managed_session_dir_in(base_dir);
    fs::create_dir_all(&dir).with_context(|| {
        format!(
            "Failed to create managed session directory {}",
            dir.display()
        )
    })?;
    Ok(dir)
}

fn managed_session_path_in(base_dir: &Path, session_id: &str, extension: &str) -> PathBuf {
    managed_session_dir_in(base_dir).join(format!("{session_id}.{extension}"))
}

fn candidate_session_paths_in(base_dir: &Path, session_id: &str) -> [PathBuf; 2] {
    [
        managed_session_path_in(
            base_dir,
            session_id,
            super::session::MANAGED_SESSION_JSONL_EXTENSION,
        ),
        managed_session_path_in(base_dir, session_id, "json"),
    ]
}

fn find_session_path_in(base_dir: &Path, session_id: &str) -> Option<PathBuf> {
    candidate_session_paths_in(base_dir, session_id)
        .into_iter()
        .find(|path| path.exists())
}

fn load_session_from_path(path: &Path) -> Result<ManagedSession> {
    ManagedSession::load_from_path(path)
}

fn summary_from_path(path: PathBuf) -> Result<ManagedSessionSummary> {
    let session = load_session_from_path(&path)?;
    Ok(ManagedSessionSummary::from_session(&session, path))
}

fn save_session_in(base_dir: &Path, session: &ManagedSession) -> Result<PathBuf> {
    let dir = ensure_managed_session_dir(base_dir)?;
    let path = dir.join(format!(
        "{}.{}",
        session.session_id,
        super::session::MANAGED_SESSION_JSONL_EXTENSION
    ));
    session.save_to_path(&path)?;
    Ok(path)
}

fn reference_from_summary(summary: ManagedSessionSummary) -> ResolvedManagedSessionReference {
    ResolvedManagedSessionReference {
        reference: ManagedSessionReference::Path(summary.path.clone()),
        path: summary.path.clone(),
        summary,
    }
}

fn list_managed_sessions_in(base_dir: &Path) -> Result<Vec<ManagedSessionSummary>> {
    let dir = managed_session_dir_in(base_dir);
    if !dir.exists() {
        return Ok(Vec::new());
    }

    let mut by_session_id: HashMap<String, ManagedSessionSummary> = HashMap::new();
    for entry in fs::read_dir(&dir)
        .with_context(|| format!("Failed to read managed session directory {}", dir.display()))?
    {
        let path = entry?.path();
        let extension = path.extension().and_then(|extension| extension.to_str());
        if !matches!(extension, Some("jsonl") | Some("json")) {
            continue;
        }

        let summary = summary_from_path(path)?;
        match by_session_id.get(&summary.session_id) {
            Some(existing)
                if existing.updated_at > summary.updated_at
                    || (existing.updated_at == summary.updated_at
                        && existing.path.extension().and_then(|ext| ext.to_str())
                            == Some("jsonl")
                        && summary.path.extension().and_then(|ext| ext.to_str())
                            == Some("json")) => {}
            _ => {
                by_session_id.insert(summary.session_id.clone(), summary);
            }
        }
    }

    let mut sessions: Vec<_> = by_session_id.into_values().collect();
    sessions.sort_by(|left, right| {
        right
            .updated_at
            .cmp(&left.updated_at)
            .then_with(|| right.created_at.cmp(&left.created_at))
            .then_with(|| left.session_id.cmp(&right.session_id))
    });
    Ok(sessions)
}

fn latest_managed_session_in(base_dir: &Path) -> Result<Option<ResolvedManagedSessionReference>> {
    Ok(list_managed_sessions_in(base_dir)?
        .into_iter()
        .next()
        .map(reference_from_summary))
}

fn resolve_managed_session_reference_in(
    base_dir: &Path,
    reference: ManagedSessionReference,
) -> Result<ResolvedManagedSessionReference> {
    match reference {
        ManagedSessionReference::Latest => latest_managed_session_in(base_dir)?
            .ok_or_else(|| anyhow::anyhow!("No managed sessions are available"))
            .map(|resolved| resolved),
        ManagedSessionReference::SessionId(session_id) => {
            let path = find_session_path_in(base_dir, &session_id).ok_or_else(|| {
                anyhow::anyhow!(
                    "Managed session '{}' was not found in {}",
                    session_id,
                    managed_session_dir_in(base_dir).display()
                )
            })?;
            let summary = summary_from_path(path.clone())?;
            Ok(ResolvedManagedSessionReference {
                reference: ManagedSessionReference::SessionId(session_id),
                path,
                summary,
            })
        }
        ManagedSessionReference::Path(path) => {
            if !path.exists() {
                bail!("Managed session file {} does not exist", path.display());
            }
            let summary = summary_from_path(path.clone())?;
            Ok(ResolvedManagedSessionReference {
                reference: ManagedSessionReference::Path(path.clone()),
                path,
                summary,
            })
        }
    }
}

fn create_managed_session_in(
    base_dir: &Path,
    messages: Vec<Message>,
) -> Result<ResolvedManagedSessionReference> {
    let now = Utc::now();
    let session = ManagedSession::with_messages(Uuid::new_v4().to_string(), now, messages);
    let path = save_session_in(base_dir, &session)?;
    Ok(reference_from_summary(ManagedSessionSummary::from_session(
        &session, path,
    )))
}

fn load_managed_session_in(
    base_dir: &Path,
    reference: ManagedSessionReference,
) -> Result<ManagedSession> {
    let resolved = resolve_managed_session_reference_in(base_dir, reference)?;
    load_session_from_path(&resolved.path)
}

fn fork_managed_session_in(
    base_dir: &Path,
    reference: ManagedSessionReference,
) -> Result<ResolvedManagedSessionReference> {
    let resolved = resolve_managed_session_reference_in(base_dir, reference)?;
    let source_session = load_session_from_path(&resolved.path)?;
    let forked_at = Utc::now();
    let forked = ManagedSession::forked_from(
        &source_session,
        Uuid::new_v4().to_string(),
        forked_at,
        Some(resolved.path.clone()),
    );
    let path = save_session_in(base_dir, &forked)?;
    Ok(reference_from_summary(ManagedSessionSummary::from_session(
        &forked, path,
    )))
}

fn delete_managed_session_in(base_dir: &Path, reference: ManagedSessionReference) -> Result<()> {
    let resolved = resolve_managed_session_reference_in(base_dir, reference)?;
    fs::remove_file(&resolved.path).with_context(|| {
        format!(
            "Failed to delete managed session {}",
            resolved.path.display()
        )
    })
}

/// Return the managed session store directory.
pub fn managed_session_dir() -> Result<PathBuf> {
    managed_session_root_dir()
}

/// Create a new managed session under the CLI config directory.
pub fn create_managed_session(messages: Vec<Message>) -> Result<ResolvedManagedSessionReference> {
    create_managed_session_in(&CliConfig::config_dir()?, messages)
}

/// List managed sessions stored under the CLI config directory.
pub fn list_managed_sessions() -> Result<Vec<ManagedSessionSummary>> {
    list_managed_sessions_in(&CliConfig::config_dir()?)
}

/// Return the newest managed session, if one exists.
pub fn latest_managed_session() -> Result<Option<ResolvedManagedSessionReference>> {
    latest_managed_session_in(&CliConfig::config_dir()?)
}

/// Resolve a session reference string into a specific session file.
pub fn resolve_managed_session_reference(
    reference: impl AsRef<str>,
) -> Result<ResolvedManagedSessionReference> {
    let reference = ManagedSessionReference::parse(reference)?;
    resolve_managed_session_reference_in(&CliConfig::config_dir()?, reference)
}

/// Load a managed session from a session id, path, or the `latest` alias.
pub fn load_managed_session(reference: impl AsRef<str>) -> Result<ManagedSession> {
    let reference = ManagedSessionReference::parse(reference)?;
    load_managed_session_in(&CliConfig::config_dir()?, reference)
}

/// Fork a managed session and persist the copy as a new managed session.
pub fn fork_managed_session(reference: impl AsRef<str>) -> Result<ResolvedManagedSessionReference> {
    let reference = ManagedSessionReference::parse(reference)?;
    fork_managed_session_in(&CliConfig::config_dir()?, reference)
}

/// Delete a managed session by id, path, or the `latest` alias.
pub fn delete_managed_session(reference: impl AsRef<str>) -> Result<()> {
    let reference = ManagedSessionReference::parse(reference)?;
    delete_managed_session_in(&CliConfig::config_dir()?, reference)
}

#[cfg(test)]
mod tests {
    use super::fork_managed_session_in;
    use super::latest_managed_session_in;
    use super::list_managed_sessions_in;
    use super::load_managed_session_in;
    use super::managed_session_dir_in;
    use super::resolve_managed_session_reference_in;
    use super::ManagedSessionReference;
    use crate::models::Message;
    use chrono::{TimeZone, Utc};
    use tempfile::tempdir;

    fn message(text: &str) -> Message {
        Message::text("user", text)
    }

    #[test]
    fn parse_reference_handles_latest_paths_and_ids() {
        assert_eq!(
            ManagedSessionReference::parse("latest").unwrap(),
            ManagedSessionReference::Latest
        );
        assert_eq!(
            ManagedSessionReference::parse("@latest").unwrap(),
            ManagedSessionReference::Latest
        );
        assert_eq!(
            ManagedSessionReference::parse("session-123").unwrap(),
            ManagedSessionReference::SessionId("session-123".to_string())
        );
        assert!(matches!(
            ManagedSessionReference::parse("sessions/session-123.jsonl").unwrap(),
            ManagedSessionReference::Path(_)
        ));
    }

    #[test]
    fn create_list_latest_load_and_fork_sessions_in_temp_dir() {
        let temp_dir = tempdir().unwrap();
        let base = temp_dir.path();
        let store_dir = managed_session_dir_in(base);

        let first = super::ManagedSession {
            version: super::super::session::MANAGED_SESSION_VERSION,
            session_id: "session-a".to_string(),
            created_at: Utc.with_ymd_and_hms(2025, 1, 1, 10, 0, 0).unwrap(),
            updated_at: Utc.with_ymd_and_hms(2025, 1, 1, 10, 30, 0).unwrap(),
            messages: vec![message("first")],
            fork: None,
        };
        let first_path = super::save_session_in(base, &first).unwrap();
        assert!(first_path.starts_with(&store_dir));

        let second = super::ManagedSession {
            version: super::super::session::MANAGED_SESSION_VERSION,
            session_id: "session-b".to_string(),
            created_at: Utc.with_ymd_and_hms(2025, 1, 2, 10, 0, 0).unwrap(),
            updated_at: Utc.with_ymd_and_hms(2025, 1, 2, 11, 0, 0).unwrap(),
            messages: vec![message("second"), message("third")],
            fork: None,
        };
        let second_path = super::save_session_in(base, &second).unwrap();
        assert!(second_path.starts_with(&store_dir));

        let sessions = list_managed_sessions_in(base).unwrap();
        assert_eq!(sessions.len(), 2);
        assert_eq!(sessions[0].session_id, "session-b");
        assert_eq!(sessions[1].session_id, "session-a");

        let latest = latest_managed_session_in(base).unwrap().unwrap();
        assert_eq!(latest.summary.session_id, "session-b");

        let resolved = resolve_managed_session_reference_in(
            base,
            ManagedSessionReference::SessionId("session-a".to_string()),
        )
        .unwrap();
        assert_eq!(resolved.summary.session_id, "session-a");
        assert_eq!(resolved.path, first_path);

        let loaded = load_managed_session_in(
            base,
            ManagedSessionReference::SessionId("session-b".to_string()),
        )
        .unwrap();
        assert_eq!(
            serde_json::to_value(&loaded).unwrap(),
            serde_json::to_value(&second).unwrap()
        );

        let forked = fork_managed_session_in(
            base,
            ManagedSessionReference::SessionId("session-b".to_string()),
        )
        .unwrap();
        let forked_loaded = load_managed_session_in(base, forked.reference.clone()).unwrap();
        assert_eq!(forked_loaded.messages.len(), 2);
        assert_eq!(
            forked_loaded
                .fork
                .as_ref()
                .map(|fork| fork.source_session_id.as_str()),
            Some("session-b")
        );
        assert!(!forked.summary.session_id.is_empty());
    }
}
