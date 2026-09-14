//! One account, one history: the hosted stores this CLI shares with the web
//! app, the desktop app, the browser extension and mobile.
//!
//! Everything here is gated on Managed privacy mode. A Local or BYOK session
//! never reaches these endpoints, and says so once instead of failing quietly.

pub mod chat;
pub mod client;
pub mod image;
pub mod memory;
pub mod projects;
pub mod state;

use std::path::{Path, PathBuf};
use std::sync::atomic::{AtomicBool, Ordering};

use crate::config::CliConfig;
use crate::platform::runtime::session::PrivacyMode;

pub use client::{CloudClient, CloudError};
pub use state::SyncState;

static BOUNDARY_NOTICE_SHOWN: AtomicBool = AtomicBool::new(false);

/// Say once per process why nothing is reaching the account. Repeating it after
/// every turn would be noise; never saying it would be a silent failure.
pub fn report_boundary_once(error: &CloudError) {
    if !error.is_boundary() {
        return;
    }
    if BOUNDARY_NOTICE_SHOWN.swap(true, Ordering::SeqCst) {
        return;
    }
    crate::output::print_info(&error.to_string());
}

pub fn cloud_dir(config_dir: &Path) -> PathBuf {
    config_dir.join("cloud")
}

fn read_cache<T: serde::de::DeserializeOwned + Default>(path: &Path) -> T {
    std::fs::read_to_string(path)
        .ok()
        .and_then(|raw| serde_json::from_str(&raw).ok())
        .unwrap_or_default()
}

fn write_cache<T: serde::Serialize>(path: &Path, value: &T) -> std::io::Result<()> {
    if let Some(parent) = path.parent() {
        std::fs::create_dir_all(parent)?;
    }
    let serialized = serde_json::to_string_pretty(value)
        .map_err(|error| std::io::Error::other(error.to_string()))?;
    let temp = path.with_extension("json.tmp");
    std::fs::write(&temp, serialized)?;
    std::fs::rename(&temp, path)
}

pub fn project_cache_path(config_dir: &Path) -> PathBuf {
    cloud_dir(config_dir).join("projects.json")
}

pub fn memory_cache_path(config_dir: &Path) -> PathBuf {
    cloud_dir(config_dir).join("memory.json")
}

pub fn load_project_cache(config_dir: &Path) -> projects::ProjectCache {
    read_cache(&project_cache_path(config_dir))
}

pub fn save_project_cache(
    config_dir: &Path,
    cache: &projects::ProjectCache,
) -> std::io::Result<()> {
    write_cache(&project_cache_path(config_dir), cache)
}

pub fn load_memory_cache(config_dir: &Path) -> memory::MemoryCache {
    read_cache(&memory_cache_path(config_dir))
}

pub fn save_memory_cache(config_dir: &Path, cache: &memory::MemoryCache) -> std::io::Result<()> {
    write_cache(&memory_cache_path(config_dir), cache)
}

/// Connect and load this account's sync state together, so a caller can never
/// use one account's cursors with another account's credential.
pub struct CloudSession {
    pub client: CloudClient,
    pub state: SyncState,
    pub config_dir: PathBuf,
}

impl CloudSession {
    pub fn open(privacy: PrivacyMode) -> Result<Self, CloudError> {
        let client = CloudClient::connect(privacy)?;
        Self::from_client(client)
    }

    pub fn open_managed() -> Result<Self, CloudError> {
        Self::from_client(CloudClient::connect_managed()?)
    }

    fn from_client(client: CloudClient) -> Result<Self, CloudError> {
        let config_dir =
            CliConfig::config_dir().map_err(|error| CloudError::Transport(error.to_string()))?;
        let state = SyncState::load(&config_dir, client.owner());
        Ok(Self {
            client,
            state,
            config_dir,
        })
    }

    pub fn persist(&self) {
        if let Err(error) = self.state.save(&self.config_dir) {
            crate::output::print_warn(&format!(
                "could not record the account sync position: {error}"
            ));
        }
    }
}

/// Push one CLI session into the account's chat history and return how many
/// messages the hosted side stored.
pub async fn sync_session(
    privacy: PrivacyMode,
    snapshot: &chat::SessionSnapshot,
) -> Result<usize, CloudError> {
    let mut session = CloudSession::open(privacy)?;
    let sync = chat::ChatSync::new(&session.client);

    let request = chat::build_push(snapshot, &session.state);
    let response = match sync.push(&request).await {
        Ok(response) => response,
        // A project link that points at a project this account no longer has
        // makes the server refuse the whole batch. The history is what matters,
        // so the turn is retried unfiled rather than lost with the link.
        Err(CloudError::Api { status, message })
            if status == 400 && snapshot.project_id.is_some() =>
        {
            crate::output::print_warn(&format!(
                "this directory's account project is not available ({message}); saving the \
                 conversation to your account without it"
            ));
            let unfiled = chat::SessionSnapshot {
                project_id: None,
                ..snapshot.clone()
            };
            sync.push(&chat::build_push(&unfiled, &session.state))
                .await?
        }
        Err(error) => return Err(error),
    };

    chat::apply_push_response(&response, &mut session.state);
    session.persist();
    Ok(response.applied.messages.len())
}

/// The account's conversations, newest first, with the cached cursor advanced.
pub async fn hosted_conversations(
    privacy: PrivacyMode,
) -> Result<Vec<chat::HostedConversation>, CloudError> {
    let session = CloudSession::open(privacy)?;
    let sync = chat::ChatSync::new(&session.client);
    let response = sync.pull_all(state::INITIAL_CURSOR).await?;
    Ok(chat::assemble(&response))
}

/// One hosted conversation by id, or `None` when the account has no such
/// conversation.
pub async fn hosted_conversation(
    privacy: PrivacyMode,
    conversation_id: &str,
) -> Result<Option<chat::HostedConversation>, CloudError> {
    let wanted = chat::conversation_id_for(conversation_id);
    Ok(hosted_conversations(privacy)
        .await?
        .into_iter()
        .find(|conversation| conversation.id == wanted || conversation.id == conversation_id))
}

/// Refresh the local project cache from the account and return it.
pub async fn refresh_projects(privacy: PrivacyMode) -> Result<projects::ProjectCache, CloudError> {
    let mut session = CloudSession::open(privacy)?;
    let sync = projects::ProjectsSync::new(&session.client);
    let response = sync.pull_all(&session.state.projects.cursor).await?;
    let mut cache = load_project_cache(&session.config_dir);
    cache.apply(&response.projects);
    projects::apply_pull_response(&response, &mut session.state);
    if let Err(error) = save_project_cache(&session.config_dir, &cache) {
        crate::output::print_warn(&format!("could not cache the project list: {error}"));
    }
    session.persist();
    Ok(cache)
}

/// Create a project in the account and return it once the server has stored it.
pub async fn create_project(
    privacy: PrivacyMode,
    name: &str,
    description: Option<&str>,
) -> Result<projects::CachedProject, CloudError> {
    let mut session = CloudSession::open(privacy)?;
    let request = projects::ProjectsPushRequest {
        projects: vec![projects::new_project(name, description)],
    };
    let sync = projects::ProjectsSync::new(&session.client);
    let response = sync.push(&request).await?;
    projects::apply_push_response(&response, &mut session.state);
    session.persist();

    if !projects::rejected_ids(&request, &response).is_empty() {
        return Err(CloudError::Api {
            status: 409,
            message: format!(
                "your account already has a different project under id {}",
                request.projects[0].id
            ),
        });
    }

    let created = projects::CachedProject {
        id: request.projects[0].id.clone(),
        name: request.projects[0].name.clone(),
        description: request.projects[0].description.clone(),
        is_archived: false,
        updated_at: chrono::Utc::now().to_rfc3339(),
    };
    let mut cache = load_project_cache(&session.config_dir);
    cache.projects.retain(|project| project.id != created.id);
    cache.projects.insert(0, created.clone());
    if let Err(error) = save_project_cache(&session.config_dir, &cache) {
        crate::output::print_warn(&format!("could not cache the project list: {error}"));
    }
    Ok(created)
}

/// Refresh the local memory cache from the account and return it.
pub async fn refresh_memory(privacy: PrivacyMode) -> Result<memory::MemoryCache, CloudError> {
    let mut session = CloudSession::open(privacy)?;
    let sync = memory::MemorySync::new(&session.client);
    let response = sync.pull_all(&session.state.memories.cursor).await?;
    let mut cache = load_memory_cache(&session.config_dir);
    cache.apply(&response.memories);
    memory::apply_pull_response(&response, &mut session.state);
    if let Err(error) = save_memory_cache(&session.config_dir, &cache) {
        crate::output::print_warn(&format!("could not cache the account memory: {error}"));
    }
    session.persist();
    Ok(cache)
}

/// Record a memory in the account. Returns the reasons the server gave for
/// anything it refused, so a caller never reports a memory as saved twice.
pub async fn add_memory(
    privacy: PrivacyMode,
    content: &str,
    category: Option<&str>,
) -> Result<Vec<String>, CloudError> {
    let mut session = CloudSession::open(privacy)?;
    let request = memory::MemoryPushRequest {
        protocol_version: memory::SYNC_PROTOCOL_VERSION,
        memories: vec![memory::new_memory(content, category, MEMORY_SOURCE)],
    };
    let sync = memory::MemorySync::new(&session.client);
    let response = sync.push(&request).await?;
    memory::apply_push_response(&response, &mut session.state);
    session.persist();

    let refusals = memory::refusals(&request, &response);
    if refusals.is_empty() {
        let mut cache = load_memory_cache(&session.config_dir);
        cache.entries.insert(
            0,
            memory::CachedMemory {
                id: request.memories[0].id.clone(),
                content: request.memories[0].content.clone(),
                category: request.memories[0].category.clone(),
                source: Some(MEMORY_SOURCE.to_string()),
                pinned: false,
                updated_at: chrono::Utc::now().to_rfc3339(),
            },
        );
        if let Err(error) = save_memory_cache(&session.config_dir, &cache) {
            crate::output::print_warn(&format!("could not cache the account memory: {error}"));
        }
    }
    Ok(refusals)
}

/// Remove a memory from the account.
pub async fn forget_memory(privacy: PrivacyMode, id_or_content: &str) -> Result<bool, CloudError> {
    let mut session = CloudSession::open(privacy)?;
    let mut cache = load_memory_cache(&session.config_dir);
    let Some(entry) = cache
        .entries
        .iter()
        .find(|entry| entry.id == id_or_content)
        .or_else(|| {
            cache
                .entries
                .iter()
                .find(|entry| entry.content.trim() == id_or_content.trim())
        })
        .cloned()
    else {
        return Ok(false);
    };

    let request = memory::MemoryPushRequest {
        protocol_version: memory::SYNC_PROTOCOL_VERSION,
        memories: vec![memory::delete_memory(&entry, &session.state, MEMORY_SOURCE)],
    };
    let sync = memory::MemorySync::new(&session.client);
    let response = sync.push(&request).await?;
    memory::apply_push_response(&response, &mut session.state);
    session.persist();

    if !memory::refusals(&request, &response).is_empty() {
        return Ok(false);
    }
    cache.entries.retain(|cached| cached.id != entry.id);
    if let Err(error) = save_memory_cache(&session.config_dir, &cache) {
        crate::output::print_warn(&format!("could not cache the account memory: {error}"));
    }
    Ok(true)
}

/// What the hosted store records as the origin of a memory this CLI wrote.
pub const MEMORY_SOURCE: &str = "cli";

/// The account memory block for the system prompt, read from the cache so a
/// turn never blocks on the network. `refresh_memory` is what makes it current.
pub fn account_memory_context(privacy: PrivacyMode, config_dir: &Path) -> String {
    if privacy != PrivacyMode::Managed {
        return String::new();
    }
    load_memory_cache(config_dir).context_prompt()
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn a_local_session_injects_no_account_memory() {
        let dir = tempfile::tempdir().expect("temp dir");
        let mut cache = memory::MemoryCache::default();
        cache.entries.push(memory::CachedMemory {
            id: "m1".to_string(),
            content: "prefers tabs".to_string(),
            category: None,
            source: None,
            pinned: false,
            updated_at: "2026-09-13T00:00:00Z".to_string(),
        });
        save_memory_cache(dir.path(), &cache).expect("save");

        assert_eq!(account_memory_context(PrivacyMode::Local, dir.path()), "");
        assert_eq!(account_memory_context(PrivacyMode::Byok, dir.path()), "");
        assert!(account_memory_context(PrivacyMode::Managed, dir.path()).contains("prefers tabs"));
    }

    #[test]
    fn a_missing_cache_reads_as_empty_rather_than_failing() {
        let dir = tempfile::tempdir().expect("temp dir");
        assert!(load_memory_cache(dir.path()).entries.is_empty());
        assert!(load_project_cache(dir.path()).projects.is_empty());
    }

    #[test]
    fn a_cache_round_trips_through_disk() {
        let dir = tempfile::tempdir().expect("temp dir");
        let mut cache = projects::ProjectCache::default();
        cache.projects.push(projects::CachedProject {
            id: "p1".to_string(),
            name: "Launch".to_string(),
            description: None,
            is_archived: false,
            updated_at: "2026-09-13T00:00:00Z".to_string(),
        });
        save_project_cache(dir.path(), &cache).expect("save");
        assert_eq!(load_project_cache(dir.path()), cache);
    }
}
