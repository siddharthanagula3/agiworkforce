use anyhow::{bail, Context, Result};
use chrono::{DateTime, Utc};
use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use std::fs;
use std::path::{Path, PathBuf};
use uuid::Uuid;

use crate::config::CliConfig;
use crate::models::Message;

use super::session::{
    validate_managed_session_id, ManagedSession, ManagedSessionAutoRouting,
    ManagedSessionForkMetadata, ManagedSessionRoutingAuthority,
};

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
    pub title: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub model: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub workspace_root: Option<PathBuf>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub created_by: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub archived_at: Option<DateTime<Utc>>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub fork: Option<ManagedSessionForkMetadata>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub routing_authority: Option<ManagedSessionRoutingAuthority>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub auto_routing: Option<ManagedSessionAutoRouting>,
}

/// Resolved session reference that includes both the original reference and the located session.
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
pub struct ResolvedManagedSessionReference {
    pub reference: ManagedSessionReference,
    pub path: PathBuf,
    pub summary: ManagedSessionSummary,
}

/// One owner for managed developer-session persistence.
///
/// CLI commands and the local IDE app-server use the same store API so file
/// naming, JSON/JSONL compatibility, sorting, deduplication, forking, and
/// archival cannot drift between surfaces.
#[derive(Debug, Clone)]
pub struct ManagedSessionStore {
    base_dir: PathBuf,
}

impl ManagedSessionStore {
    pub fn new(base_dir: PathBuf) -> Self {
        Self { base_dir }
    }

    pub fn user_config() -> Result<Self> {
        Ok(Self::new(CliConfig::config_dir()?))
    }

    pub fn create(&self, messages: Vec<Message>) -> Result<ResolvedManagedSessionReference> {
        create_managed_session_in(&self.base_dir, messages)
    }

    pub fn create_with_id(
        &self,
        session_id: impl Into<String>,
        messages: Vec<Message>,
    ) -> Result<ResolvedManagedSessionReference> {
        create_managed_session_with_id_in(&self.base_dir, session_id.into(), messages)
    }

    pub fn list(&self) -> Result<Vec<ManagedSessionSummary>> {
        list_managed_sessions_in(&self.base_dir)
    }

    pub fn resolve(
        &self,
        reference: ManagedSessionReference,
    ) -> Result<ResolvedManagedSessionReference> {
        resolve_managed_session_reference_in(&self.base_dir, reference)
    }

    pub fn load(&self, reference: ManagedSessionReference) -> Result<ManagedSession> {
        load_managed_session_in(&self.base_dir, reference)
    }

    pub fn fork(
        &self,
        reference: ManagedSessionReference,
    ) -> Result<ResolvedManagedSessionReference> {
        fork_managed_session_in(&self.base_dir, reference)
    }

    pub fn fork_redacted_continuation(
        &self,
        reference: ManagedSessionReference,
    ) -> Result<ResolvedManagedSessionReference> {
        fork_redacted_managed_session_in(&self.base_dir, reference)
    }

    pub fn save(&self, session: &ManagedSession) -> Result<PathBuf> {
        save_session_in(&self.base_dir, session)
    }

    pub fn archive(&self, reference: ManagedSessionReference) -> Result<()> {
        let resolved = self.resolve(reference)?;
        let mut session = load_session_from_path(&resolved.path)?;
        if session.archived_at.is_none() {
            session.archived_at = Some(Utc::now());
            session.touch();
            self.save(&session)?;
        }
        Ok(())
    }

    pub fn unarchive(&self, reference: ManagedSessionReference) -> Result<()> {
        let resolved = self.resolve(reference)?;
        let mut session = load_session_from_path(&resolved.path)?;
        if session.archived_at.is_some() {
            session.archived_at = None;
            session.touch();
            self.save(&session)?;
        }
        Ok(())
    }

    pub fn delete(&self, reference: ManagedSessionReference) -> Result<()> {
        delete_managed_session_in(&self.base_dir, reference)
    }
}

impl ManagedSessionReference {
    /// Parse a user-facing session reference string.
    pub fn parse(input: impl AsRef<str>) -> Result<Self> {
        let input = input.as_ref().trim();
        if input.is_empty() {
            bail!("Managed session reference cannot be empty");
        }

        if matches!(input, "latest" | "@latest" | "last" | "@last" | "newest") {
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

        validate_managed_session_id(input)?;
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
            title: session.title.clone(),
            model: session.model.clone(),
            workspace_root: session.workspace_root.clone(),
            created_by: session.created_by.clone(),
            archived_at: session.archived_at,
            fork: session.fork.clone(),
            routing_authority: session
                .routing_authority
                .as_ref()
                .filter(|authority| authority.validated_provider().is_ok())
                .cloned(),
            auto_routing: session.auto_routing.clone(),
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
    if validate_managed_session_id(session_id).is_err() {
        return None;
    }
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
    validate_managed_session_id(&session.session_id)?;
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
        let extension = path.extension().and_then(|extension| extension.to_str());
        if !matches!(extension, Some("jsonl") | Some("json")) {
            continue;
        }

        let summary = match summary_from_path(path.clone()) {
            Ok(summary) => summary,
            Err(error) => {
                eprintln!(
                    "warning: skipped invalid managed session {}: {error:#}",
                    path.display()
                );
                continue;
            }
        };
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
            .ok_or_else(|| anyhow::anyhow!("No managed sessions are available")),
        ManagedSessionReference::SessionId(session_id) => {
            validate_managed_session_id(&session_id)?;
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

fn fork_redacted_managed_session_in(
    base_dir: &Path,
    reference: ManagedSessionReference,
) -> Result<ResolvedManagedSessionReference> {
    let resolved = resolve_managed_session_reference_in(base_dir, reference)?;
    let source_session = load_session_from_path(&resolved.path)?;
    let forked_at = Utc::now();
    let forked = ManagedSession::redacted_continuation_from(
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

/// Create a new managed session under the CLI config directory (UUID session id).
pub fn create_managed_session(messages: Vec<Message>) -> Result<ResolvedManagedSessionReference> {
    ManagedSessionStore::user_config()?.create(messages)
}

/// Return true if a managed session with the given id already exists on disk
/// under the CLI config directory. Used to guard destructive overwrite paths
/// (e.g. `agi session fork --as <name>`) before writing.
pub fn managed_session_exists(session_id: impl AsRef<str>) -> Result<bool> {
    let base_dir = CliConfig::config_dir()?;
    let session_id = validate_managed_session_id(session_id.as_ref())?;
    Ok(find_session_path_in(&base_dir, session_id).is_some())
}

/// Create a new managed session with an explicit session id (e.g. a user-chosen slug
/// from `agi session fork --as <name>`). The id becomes the filename so
/// `agi --resume <id>` resolves immediately.
pub fn create_managed_session_with_id(
    session_id: impl Into<String>,
    messages: Vec<Message>,
) -> Result<ResolvedManagedSessionReference> {
    ManagedSessionStore::user_config()?.create_with_id(session_id, messages)
}

fn create_managed_session_with_id_in(
    base_dir: &Path,
    session_id: String,
    messages: Vec<Message>,
) -> Result<ResolvedManagedSessionReference> {
    let now = Utc::now();
    let session = ManagedSession::with_messages(session_id, now, messages);
    let path = save_session_in(base_dir, &session)?;
    Ok(reference_from_summary(ManagedSessionSummary::from_session(
        &session, path,
    )))
}

/// List managed sessions stored under the CLI config directory.
pub fn list_managed_sessions() -> Result<Vec<ManagedSessionSummary>> {
    ManagedSessionStore::user_config()?.list()
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
    ManagedSessionStore::user_config()?.resolve(reference)
}

/// Load a managed session from a session id, path, or the `latest` alias.
pub fn load_managed_session(reference: impl AsRef<str>) -> Result<ManagedSession> {
    let reference = ManagedSessionReference::parse(reference)?;
    ManagedSessionStore::user_config()?.load(reference)
}

/// Fork a managed session and persist the copy as a new managed session.
pub fn fork_managed_session(reference: impl AsRef<str>) -> Result<ResolvedManagedSessionReference> {
    let reference = ManagedSessionReference::parse(reference)?;
    ManagedSessionStore::user_config()?.fork(reference)
}

/// Delete a managed session by id, path, or the `latest` alias.
pub fn delete_managed_session(reference: impl AsRef<str>) -> Result<()> {
    let reference = ManagedSessionReference::parse(reference)?;
    ManagedSessionStore::user_config()?.delete(reference)
}

/// Archive a managed session by id, path, or the `latest` alias. Idempotent.
pub fn archive_managed_session(reference: impl AsRef<str>) -> Result<()> {
    let reference = ManagedSessionReference::parse(reference)?;
    ManagedSessionStore::user_config()?.archive(reference)
}

/// Unarchive a managed session by id, path, or the `latest` alias. Idempotent.
pub fn unarchive_managed_session(reference: impl AsRef<str>) -> Result<()> {
    let reference = ManagedSessionReference::parse(reference)?;
    ManagedSessionStore::user_config()?.unarchive(reference)
}

#[cfg(test)]
mod tests {
    use super::fork_managed_session_in;
    use super::latest_managed_session_in;
    use super::list_managed_sessions_in;
    use super::load_managed_session_in;
    use super::managed_session_dir_in;
    use super::resolve_managed_session_reference_in;
    use super::save_session_in;
    use super::ManagedSession;
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
            ManagedSessionReference::parse("@last").unwrap(),
            ManagedSessionReference::Latest
        );
        assert_eq!(
            ManagedSessionReference::parse("newest").unwrap(),
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
            title: Some("Second session".to_string()),
            model: Some("registry/model-key".to_string()),
            workspace_root: Some(base.to_path_buf()),
            created_by: Some("vscode".to_string()),
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
        };
        let second_path = super::save_session_in(base, &second).unwrap();
        assert!(second_path.starts_with(&store_dir));

        let sessions = list_managed_sessions_in(base).unwrap();
        assert_eq!(sessions.len(), 2);
        assert_eq!(sessions[0].session_id, "session-b");
        assert_eq!(sessions[0].title.as_deref(), Some("Second session"));
        assert_eq!(sessions[0].model.as_deref(), Some("registry/model-key"));
        assert_eq!(sessions[0].workspace_root.as_deref(), Some(base));
        assert_eq!(sessions[0].created_by.as_deref(), Some("vscode"));
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

    #[test]
    fn invalid_neighbors_do_not_hide_valid_session_history() {
        let temp_dir = tempdir().unwrap();
        let base = temp_dir.path();
        let mut valid = ManagedSession::new("valid-neighbor", Utc::now());
        valid.title = Some("Visible history".to_string());
        save_session_in(base, &valid).expect("save valid neighbor");

        let session_dir = managed_session_dir_in(base);
        std::fs::write(session_dir.join("corrupt.jsonl"), "not-json\n")
            .expect("write corrupt neighbor");

        for (filename, field, value) in [
            (
                "bad-title.json",
                "title",
                serde_json::Value::String(
                    "t".repeat(super::super::session::MANAGED_SESSION_TITLE_MAX_UTF16 + 1),
                ),
            ),
            (
                "bad-model.json",
                "model",
                serde_json::Value::String("model\u{0085}injection".to_string()),
            ),
            (
                "bad-id.json",
                "session_id",
                serde_json::Value::String("../../escape".to_string()),
            ),
            (
                "bad-cwd.json",
                "workspace_root",
                serde_json::Value::String(format!(
                    "/{}",
                    "w".repeat(super::super::session::MANAGED_SESSION_CWD_MAX_UTF16 + 1)
                )),
            ),
        ] {
            let mut tampered = serde_json::to_value(ManagedSession::new(
                filename.trim_end_matches(".json"),
                Utc::now(),
            ))
            .expect("serialize session");
            tampered[field] = value;
            std::fs::write(
                session_dir.join(filename),
                serde_json::to_vec(&tampered).expect("serialize tampered neighbor"),
            )
            .expect("write tampered neighbor");
        }

        let listed = list_managed_sessions_in(base).expect("list must isolate bad entries");
        assert_eq!(listed.len(), 1);
        assert_eq!(listed[0].session_id, "valid-neighbor");
        assert_eq!(listed[0].title.as_deref(), Some("Visible history"));
    }

    #[test]
    fn archive_and_unarchive_round_trip_via_store() {
        let temp_dir = tempdir().unwrap();
        let store = super::ManagedSessionStore::new(temp_dir.path().to_path_buf());
        let session = ManagedSession::new("archive-me", Utc::now());
        store.save(&session).expect("save session");

        let reference = || ManagedSessionReference::SessionId("archive-me".to_string());

        // Freshly saved sessions are not archived.
        let listed = store.list().expect("list");
        assert_eq!(listed.len(), 1);
        assert!(listed[0].archived_at.is_none());

        store.archive(reference()).expect("archive");
        let after_archive = store.resolve(reference()).expect("resolve after archive");
        assert!(
            after_archive.summary.archived_at.is_some(),
            "archive must stamp archived_at"
        );

        // Archive is idempotent — a second call keeps the original stamp.
        let first_stamp = after_archive.summary.archived_at;
        store.archive(reference()).expect("archive again");
        let re_resolved = store.resolve(reference()).expect("resolve");
        assert_eq!(re_resolved.summary.archived_at, first_stamp);

        store.unarchive(reference()).expect("unarchive");
        let after_unarchive = store.resolve(reference()).expect("resolve after unarchive");
        assert!(
            after_unarchive.summary.archived_at.is_none(),
            "unarchive must clear archived_at"
        );
    }

    #[test]
    fn session_id_traversal_is_rejected_before_path_resolution_or_save() {
        let temp_dir = tempdir().unwrap();
        let base = temp_dir.path().join("config");
        std::fs::create_dir_all(&base).expect("create config root");
        let traversal = "../../outside";
        let session = ManagedSession::new(traversal, Utc::now());

        assert!(save_session_in(&base, &session).is_err());
        assert!(resolve_managed_session_reference_in(
            &base,
            ManagedSessionReference::SessionId(traversal.to_string()),
        )
        .is_err());
        assert!(!temp_dir.path().join("outside.jsonl").exists());
    }
}
