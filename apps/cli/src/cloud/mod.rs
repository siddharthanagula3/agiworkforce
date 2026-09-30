//! One account, one history: the hosted stores this CLI shares with the web
//! app, the desktop app, the browser extension and mobile.
//!
//! Everything here is gated on Managed privacy mode. A Local or BYOK session
//! never reaches these endpoints, and says so once instead of failing quietly.

pub mod api_keys;
pub mod artifacts;
pub mod attachments;
pub mod chat;
pub mod client;
pub mod code_handoff;
pub mod code_push;
pub mod code_sessions;
pub mod code_teleport;
pub mod connectors;
#[cfg(test)]
mod contract_fixtures;
pub mod data_export;
pub mod devices;
pub mod feedback;
pub mod handshake;
pub mod image;
pub mod image_provenance;
pub mod knowledge;
pub mod library;
pub mod marketplaces;
pub mod memory;
pub mod personalization;
pub mod product_analytics;
pub mod projects;
pub mod referrals;
pub mod shares;
pub mod state;
pub mod workspace_policy;

use std::path::{Path, PathBuf};
use std::sync::atomic::{AtomicBool, Ordering};

use serde::Deserialize;

use crate::config::CliConfig;
use crate::platform::runtime::session::PrivacyMode;

pub use client::{CloudClient, CloudError, Method, Route};
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

tokio::task_local! {
    static BOUND_CONVERSATION: String;
}

pub(crate) async fn bound_to<F: std::future::Future>(
    conversation_id: Option<String>,
    future: F,
) -> F::Output {
    match conversation_id {
        Some(conversation_id) => BOUND_CONVERSATION.scope(conversation_id, future).await,
        None => future.await,
    }
}

pub(crate) fn bound_conversation() -> Option<String> {
    BOUND_CONVERSATION.try_with(Clone::clone).ok()
}

pub async fn ensure_hosted_conversation(
    privacy: PrivacyMode,
    snapshot: &chat::SessionSnapshot,
) -> Result<String, CloudError> {
    let conversation_id = chat::conversation_id_for(&snapshot.session_id);
    let known = CloudSession::open(privacy)?
        .state
        .conversations
        .versions
        .contains_key(&conversation_id);
    if !known {
        sync_session(privacy, snapshot).await?;
    }
    Ok(conversation_id)
}

pub fn continue_elsewhere(session: &crate::agent::AgentSession, arg: &str) -> String {
    if session.privacy_mode != PrivacyMode::Managed {
        return format!(
            "This conversation runs in {} mode, so it stays on this device. Switch it to your account with /continue-with-cloud, then continue it on another device.",
            session.privacy_mode.label()
        );
    }
    let Some(snapshot) = session.cloud_snapshot() else {
        return "This conversation is not being saved, so it cannot continue on another device."
            .to_string();
    };
    let cloud = match CloudSession::open(session.privacy_mode) {
        Ok(cloud) => cloud,
        Err(error) => return format!("Could not reach your account: {error}"),
    };
    let conversation_id = chat::conversation_id_for(&snapshot.session_id);
    if !cloud
        .state
        .conversations
        .versions
        .contains_key(&conversation_id)
    {
        return "This conversation reaches your account after its next reply. Send a message, then run /continue-elsewhere again.".to_string();
    }
    let url = format!(
        "{}/chat/{}",
        cloud.client.base().trim_end_matches('/'),
        conversation_id
    );
    let opened = arg.trim() == "open"
        && crate::oauth::open_external_url(&url, crate::oauth::UserActionContext::user_initiated());
    format!(
        "This conversation is in your account's chat history. Continue it on the web{} at {url}, or open it from the chat list in the desktop or mobile app.{}",
        if opened { " (opened in your browser)" } else { "" },
        if opened { "" } else { " /continue-elsewhere open opens it in your browser." }
    )
}

pub(crate) fn forget_hosted_conversation(conversation_id: &str) {
    if let Ok(mut session) = CloudSession::open(PrivacyMode::Managed) {
        if session
            .state
            .conversations
            .versions
            .remove(conversation_id)
            .is_some()
        {
            session.persist();
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

pub async fn send_feedback(kind: feedback::FeedbackKind, message: &str) -> String {
    let client = match CloudClient::connect_managed() {
        Ok(client) => client,
        Err(error) => {
            return format!(
                "Feedback needs a signed-in AGI Workforce account ({error}). Sign in with `agi login`, then send it again."
            )
        }
    };
    match feedback::submit(&client, kind, message).await {
        Ok(confirmation) => confirmation,
        Err(error) => format!("Feedback was not sent: {error}"),
    }
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
        instructions: None,
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

pub const PROJECTS_PATH: &str = "/api/projects";

pub(crate) fn project_path(project_id: &str) -> String {
    format!("{PROJECTS_PATH}/{}", urlencoding::encode(project_id))
}

/// `agi projects delete` tombstones one project.
pub fn delete_project_route(project_id: &str) -> Route {
    Route::delete(project_path(project_id))
}

/// `agi projects archive` moves one project in or out of the archive.
pub fn archive_project_route(project_id: &str) -> Route {
    Route::put(project_path(project_id))
}

/// `agi history delete` removes one conversation from the account.
pub fn delete_conversation_route(conversation_id: &str) -> Route {
    Route::delete(format!(
        "{}/{}",
        artifacts::CONVERSATIONS_PATH,
        urlencoding::encode(conversation_id)
    ))
}

/// Delete a project in the account. The hosted route tombstones the project and
/// unfiles its conversations rather than deleting them, so this removes the
/// workspace and the knowledge files filed under it, never the chats.
pub async fn delete_project(privacy: PrivacyMode, project_id: &str) -> Result<(), CloudError> {
    let session = CloudSession::open(privacy)?;
    let _: serde_json::Value = session
        .client
        .call(&delete_project_route(project_id), &[], None)
        .await?;
    let mut cache = load_project_cache(&session.config_dir);
    cache.projects.retain(|project| project.id != project_id);
    if let Err(error) = save_project_cache(&session.config_dir, &cache) {
        crate::output::print_warn(&format!("could not cache the project list: {error}"));
    }
    Ok(())
}

pub async fn project_detail(
    privacy: PrivacyMode,
    project_id: &str,
) -> Result<(serde_json::Value, Vec<serde_json::Value>), CloudError> {
    let session = CloudSession::open(privacy)?;
    let project: serde_json::Value = session.client.get(&project_path(project_id), &[]).await?;
    let files: serde_json::Value = session
        .client
        .get(
            &format!("{}/knowledge-files", project_path(project_id)),
            &[],
        )
        .await?;
    Ok((
        project.get("project").cloned().unwrap_or(project),
        files
            .get("files")
            .and_then(serde_json::Value::as_array)
            .cloned()
            .unwrap_or_default(),
    ))
}

pub async fn update_project(
    privacy: PrivacyMode,
    project_id: &str,
    patch: &serde_json::Value,
) -> Result<(), CloudError> {
    let session = CloudSession::open(privacy)?;
    let _: serde_json::Value = session
        .client
        .call(&Route::put(project_path(project_id)), &[], Some(patch))
        .await?;
    Ok(())
}

/// Archive or unarchive a project in the account.
pub async fn set_project_archived(
    privacy: PrivacyMode,
    project_id: &str,
    archived: bool,
) -> Result<(), CloudError> {
    let session = CloudSession::open(privacy)?;
    let body = serde_json::json!({ "isArchived": archived });
    let _: serde_json::Value = session
        .client
        .call(&archive_project_route(project_id), &[], Some(&body))
        .await?;
    let mut cache = load_project_cache(&session.config_dir);
    for project in cache.projects.iter_mut() {
        if project.id == project_id {
            project.is_archived = archived;
        }
    }
    if let Err(error) = save_project_cache(&session.config_dir, &cache) {
        crate::output::print_warn(&format!("could not cache the project list: {error}"));
    }
    Ok(())
}

/// Delete a conversation from the account. Every signed-in client loses it, and
/// the hosted route revokes any artifact published out of it.
pub async fn delete_conversation(
    privacy: PrivacyMode,
    conversation_id: &str,
) -> Result<(), CloudError> {
    let session = CloudSession::open(privacy)?;
    let _: serde_json::Value = session
        .client
        .call(&delete_conversation_route(conversation_id), &[], None)
        .await?;
    Ok(())
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct WorkspaceListing {
    #[serde(default)]
    active_organization_id: Option<String>,
    #[serde(default)]
    workspaces: Vec<WorkspaceEntry>,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct WorkspaceEntry {
    #[serde(default)]
    organization_id: Option<String>,
    #[serde(default)]
    name: String,
}

pub async fn active_workspace_label(privacy: PrivacyMode) -> Result<String, CloudError> {
    let client = CloudClient::connect(privacy)?;
    let listing: WorkspaceListing = client.get("/api/settings/organization", &[]).await?;
    let Some(active) = listing.active_organization_id else {
        return Ok("your personal workspace".to_string());
    };
    Ok(listing
        .workspaces
        .into_iter()
        .find(|workspace| workspace.organization_id.as_deref() == Some(active.as_str()))
        .map(|workspace| workspace.name.trim().to_string())
        .filter(|name| !name.is_empty())
        .map(|name| format!("the {name} workspace"))
        .unwrap_or_else(|| "your active workspace".to_string()))
}

/// Refresh the local memory cache from the account and return it.
pub async fn refresh_memory(privacy: PrivacyMode) -> Result<memory::MemoryCache, CloudError> {
    let mut session = CloudSession::open(privacy)?;
    let sync = memory::MemorySync::new(&session.client);
    let response = sync.pull_all(&session.state.memories.cursor).await?;
    let mut cache = load_memory_cache(&session.config_dir);
    cache.apply(&response.memories);
    if let Some(enabled) = response.memory_enabled {
        cache.account_memory_off = !enabled;
    }
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
                source_conversation_id: None,
                source_conversation_title: None,
                project_id: None,
            },
        );
        if let Err(error) = save_memory_cache(&session.config_dir, &cache) {
            crate::output::print_warn(&format!("could not cache the account memory: {error}"));
        }
    }
    Ok(refusals)
}

pub async fn revise_memory(
    privacy: PrivacyMode,
    id_or_content: &str,
    content: Option<&str>,
    pinned: Option<bool>,
) -> Result<Option<Vec<String>>, CloudError> {
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
        return Ok(None);
    };
    let request = memory::MemoryPushRequest {
        protocol_version: memory::SYNC_PROTOCOL_VERSION,
        memories: vec![memory::revise_memory(
            &entry,
            &session.state,
            MEMORY_SOURCE,
            content,
            pinned,
        )],
    };
    let sync = memory::MemorySync::new(&session.client);
    let response = sync.push(&request).await?;
    memory::apply_push_response(&response, &mut session.state);
    session.persist();
    let refusals = memory::refusals(&request, &response);
    if refusals.is_empty() {
        if let Some(cached) = cache
            .entries
            .iter_mut()
            .find(|cached| cached.id == entry.id)
        {
            cached.content = request.memories[0].content.clone();
            if let Some(pinned) = pinned {
                cached.pinned = pinned;
            }
            cached.updated_at = chrono::Utc::now().to_rfc3339();
        }
        if let Err(error) = save_memory_cache(&session.config_dir, &cache) {
            crate::output::print_warn(&format!("could not cache the account memory: {error}"));
        }
    }
    Ok(Some(refusals))
}

#[derive(Debug, serde::Deserialize)]
struct ImportPreview {
    #[serde(default)]
    items: Vec<ImportPreviewItem>,
}

#[derive(Debug, serde::Deserialize)]
struct ImportPreviewItem {
    content: String,
    #[serde(default)]
    duplicate: bool,
}

#[derive(Debug, Default, serde::Deserialize, serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ImportResult {
    #[serde(default)]
    pub inserted_count: u64,
    #[serde(default)]
    pub skipped_duplicate_count: u64,
    #[serde(default)]
    pub blocked_count: u64,
    #[serde(default)]
    pub excluded_count: u64,
}

pub const MEMORY_IMPORT_PATH: &str = "/api/memory/import";

pub async fn import_memories(
    privacy: PrivacyMode,
    text: &str,
    source_name: &str,
) -> Result<Option<ImportResult>, CloudError> {
    let session = CloudSession::open(privacy)?;
    let preview: ImportPreview = session
        .client
        .post(
            MEMORY_IMPORT_PATH,
            &serde_json::json!({ "mode": "dry-run", "text": text, "sourceName": source_name }),
        )
        .await?;
    let items: Vec<String> = preview
        .items
        .into_iter()
        .filter(|item| !item.duplicate)
        .map(|item| item.content)
        .collect();
    if items.is_empty() {
        return Ok(None);
    }
    let mut total = ImportResult::default();
    for chunk in items.chunks(MEMORY_IMPORT_BATCH) {
        let result: ImportResult = session
            .client
            .post(
                MEMORY_IMPORT_PATH,
                &serde_json::json!({ "mode": "commit", "items": chunk, "sourceName": source_name }),
            )
            .await?;
        total.inserted_count += result.inserted_count;
        total.skipped_duplicate_count += result.skipped_duplicate_count;
        total.blocked_count += result.blocked_count;
        total.excluded_count += result.excluded_count;
    }
    Ok(Some(total))
}

const MEMORY_IMPORT_BATCH: usize = 500;

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

/// Whether the account has memory turned off, as last read from the account.
pub fn account_memory_off(config_dir: &Path) -> bool {
    load_memory_cache(config_dir).account_memory_off
}

/// The account memory block for the system prompt, read from the cache so a
/// turn never blocks on the network. `refresh_memory` is what makes it current.
pub fn account_memory_context(privacy: PrivacyMode, config_dir: &Path) -> String {
    if privacy != PrivacyMode::Managed {
        return String::new();
    }
    let cache = load_memory_cache(config_dir);
    if cache.account_memory_off {
        return String::new();
    }
    cache.context_prompt()
}

pub fn account_memory_context_for(
    privacy: PrivacyMode,
    config_dir: &Path,
    project: Option<&str>,
) -> String {
    if privacy != PrivacyMode::Managed {
        return String::new();
    }
    let cache = load_memory_cache(config_dir);
    if cache.account_memory_off {
        return String::new();
    }
    cache.context_prompt_for(project)
}

pub async fn add_project_memory(
    privacy: PrivacyMode,
    project_id: &str,
    content: &str,
    category: Option<&str>,
) -> Result<bool, CloudError> {
    #[derive(serde::Serialize)]
    #[serde(rename_all = "camelCase")]
    struct CreateMemory<'a> {
        content: &'a str,
        #[serde(skip_serializing_if = "Option::is_none")]
        category: Option<&'a str>,
        source: &'a str,
        project_id: &'a str,
    }
    #[derive(serde::Deserialize)]
    struct Created {
        #[serde(default)]
        merged: bool,
    }
    let session = CloudSession::open(privacy)?;
    let created: Created = session
        .client
        .post(
            "/api/memory",
            &CreateMemory {
                content,
                category,
                source: MEMORY_SOURCE,
                project_id,
            },
        )
        .await?;
    Ok(created.merged)
}

pub fn project_instructions_context(
    privacy: PrivacyMode,
    config_dir: &Path,
    project_id: Option<&str>,
) -> String {
    if privacy != PrivacyMode::Managed {
        return String::new();
    }
    let Some(project_id) = project_id else {
        return String::new();
    };
    let cache = load_project_cache(config_dir);
    let Some(project) = cache
        .projects
        .iter()
        .find(|project| project.id == project_id)
    else {
        return String::new();
    };
    match project.instructions.as_deref().map(str::trim) {
        Some(instructions) if !instructions.is_empty() => format!(
            "\n<project_instructions project=\"{}\">\nInstructions the user set for this account project:\n{}\n</project_instructions>\n",
            project.name.replace(['"', '<', '>'], ""),
            instructions
        ),
        _ => String::new(),
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn memory_off_on_the_account_is_read_from_the_cache_in_any_mode() {
        let dir = tempfile::tempdir().expect("temp dir");
        assert!(!account_memory_off(dir.path()));
        let cache = memory::MemoryCache {
            account_memory_off: true,
            ..memory::MemoryCache::default()
        };
        save_memory_cache(dir.path(), &cache).expect("cache written");
        assert!(account_memory_off(dir.path()));
    }

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
            source_conversation_id: None,
            source_conversation_title: None,
            project_id: None,
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
    fn each_account_deletion_routes_to_the_hosted_endpoint_it_names() {
        let project = delete_project_route("a b");
        assert_eq!(project.method, Method::Delete);
        assert_eq!(project.path, "/api/projects/a%20b");

        let archive = archive_project_route("a b");
        assert_eq!(archive.method, Method::Put);
        assert_eq!(archive.path, "/api/projects/a%20b");

        let conversation = delete_conversation_route("a b");
        assert_eq!(conversation.method, Method::Delete);
        assert_eq!(conversation.path, "/api/chat/conversations/a%20b");
    }

    #[test]
    fn a_cache_round_trips_through_disk() {
        let dir = tempfile::tempdir().expect("temp dir");
        let mut cache = projects::ProjectCache::default();
        cache.projects.push(projects::CachedProject {
            id: "p1".to_string(),
            name: "Launch".to_string(),
            description: None,
            instructions: None,
            is_archived: false,
            updated_at: "2026-09-13T00:00:00Z".to_string(),
        });
        save_project_cache(dir.path(), &cache).expect("save");
        assert_eq!(load_project_cache(dir.path()), cache);
    }
}
