//! Artifact Tauri Commands
//!
//! Provides Tauri commands for creating, managing, and rendering artifacts.

use crate::core::artifacts::{
    create_shared_store, create_shared_store_with_db, Artifact, ArtifactFilter, ArtifactMetadata,
    ArtifactSummary, ArtifactType, ArtifactVersion, CreateArtifactRequest, SharedArtifactStore,
    UpdateArtifactRequest,
};
use crate::data::db::repository;
use crate::sys::commands::chat::AppDatabase;
use rusqlite::Connection;
use serde::{Deserialize, Serialize};
use std::sync::{Arc, Mutex};
use tauri::State;
use tracing::debug;

/// State wrapper for artifact store
pub struct ArtifactState(pub SharedArtifactStore);

impl ArtifactState {
    pub fn new() -> Self {
        Self(create_shared_store(50))
    }

    /// Create artifact state with database persistence
    pub fn with_db(conn: Arc<Mutex<Connection>>) -> Self {
        let store = create_shared_store_with_db(50, conn);
        // Load any persisted artifacts into memory cache
        if let Err(e) = store.load_from_db() {
            tracing::warn!("Failed to load artifacts from DB on startup: {}", e);
        } else {
            tracing::info!("Artifact store initialized with DB persistence");
        }
        Self(store)
    }
}

impl Default for ArtifactState {
    fn default() -> Self {
        Self::new()
    }
}

/// Response wrapper for artifact operations
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ArtifactResponse<T> {
    pub success: bool,
    pub data: Option<T>,
    pub error: Option<String>,
}

impl<T> ArtifactResponse<T> {
    pub fn ok(data: T) -> Self {
        Self {
            success: true,
            data: Some(data),
            error: None,
        }
    }

    pub fn err(error: String) -> Self {
        Self {
            success: false,
            data: None,
            error: Some(error),
        }
    }
}

/// Create a new artifact
#[tauri::command]
pub async fn artifact_create(
    state: State<'_, ArtifactState>,
    title: String,
    artifact_type: ArtifactType,
    content: String,
    metadata: Option<ArtifactMetadata>,
    conversation_id: Option<i64>,
    message_id: Option<i64>,
    tags: Option<Vec<String>>,
) -> Result<ArtifactResponse<Artifact>, String> {
    let request = CreateArtifactRequest {
        title,
        artifact_type,
        render_type: Some(artifact_type.to_string()),
        content,
        metadata,
        conversation_id,
        message_id,
        tags,
    };

    match state.0.create(request) {
        Ok(artifact) => Ok(ArtifactResponse::ok(artifact)),
        Err(e) => Ok(ArtifactResponse::err(e)),
    }
}

/// Get an artifact by ID
#[tauri::command]
pub async fn artifact_get(
    state: State<'_, ArtifactState>,
    id: String,
) -> Result<ArtifactResponse<Artifact>, String> {
    match state.0.get(&id) {
        Some(artifact) => Ok(ArtifactResponse::ok(artifact)),
        None => Ok(ArtifactResponse::err(format!("Artifact not found: {}", id))),
    }
}

/// Update an artifact's content (creates a new version)
#[tauri::command]
pub async fn artifact_update(
    state: State<'_, ArtifactState>,
    id: String,
    content: String,
    change_description: Option<String>,
    title: Option<String>,
    metadata: Option<ArtifactMetadata>,
    tags: Option<Vec<String>>,
) -> Result<ArtifactResponse<Artifact>, String> {
    let request = UpdateArtifactRequest {
        id,
        content,
        change_description,
        title,
        metadata,
        tags,
    };

    match state.0.update(request) {
        Ok(artifact) => Ok(ArtifactResponse::ok(artifact)),
        Err(e) => Ok(ArtifactResponse::err(e)),
    }
}

/// Rollback an artifact to a specific version
#[tauri::command]
pub async fn artifact_rollback(
    state: State<'_, ArtifactState>,
    id: String,
    version: u32,
) -> Result<ArtifactResponse<Artifact>, String> {
    match state.0.rollback(&id, version) {
        Ok(artifact) => Ok(ArtifactResponse::ok(artifact)),
        Err(e) => Ok(ArtifactResponse::err(e)),
    }
}

/// Delete an artifact
#[tauri::command]
pub async fn artifact_delete(
    state: State<'_, ArtifactState>,
    id: String,
) -> Result<ArtifactResponse<()>, String> {
    match state.0.delete(&id) {
        Ok(()) => Ok(ArtifactResponse::ok(())),
        Err(e) => Ok(ArtifactResponse::err(e)),
    }
}

/// Archive an artifact (soft delete)
#[tauri::command]
pub async fn artifact_archive(
    state: State<'_, ArtifactState>,
    id: String,
) -> Result<ArtifactResponse<()>, String> {
    match state.0.archive(&id) {
        Ok(()) => Ok(ArtifactResponse::ok(())),
        Err(e) => Ok(ArtifactResponse::err(e)),
    }
}

/// Unarchive an artifact
#[tauri::command]
pub async fn artifact_unarchive(
    state: State<'_, ArtifactState>,
    id: String,
) -> Result<ArtifactResponse<()>, String> {
    match state.0.unarchive(&id) {
        Ok(()) => Ok(ArtifactResponse::ok(())),
        Err(e) => Ok(ArtifactResponse::err(e)),
    }
}

/// Pin/unpin an artifact
#[tauri::command]
pub async fn artifact_pin(
    state: State<'_, ArtifactState>,
    id: String,
    pinned: bool,
) -> Result<ArtifactResponse<()>, String> {
    match state.0.pin(&id, pinned) {
        Ok(()) => Ok(ArtifactResponse::ok(())),
        Err(e) => Ok(ArtifactResponse::err(e)),
    }
}

/// Load the full persisted artifact records required to reconstruct
/// `message.artifacts` when a Desktop conversation is reopened.
///
/// The conversation ownership check is performed at the privileged native
/// boundary. Local/BYOK/Managed storage selection remains governed by the
/// conversation row; this command never syncs or changes execution planes.
#[tauri::command]
pub async fn artifact_get_conversation_snapshot(
    state: State<'_, ArtifactState>,
    db: State<'_, AppDatabase>,
    conversation_id: i64,
    user_id: String,
) -> Result<ArtifactResponse<Vec<Artifact>>, String> {
    if conversation_id <= 0 {
        return Err("Conversation ID must be positive".to_string());
    }
    if user_id.trim().is_empty() {
        return Err("User ID cannot be empty".to_string());
    }

    {
        let conn = db.connection()?;
        repository::get_conversation(&conn, conversation_id, &user_id)
            .map_err(|error| format!("Access denied or conversation not found: {error}"))?;
    }

    state
        .0
        .load_conversation_from_db(&conversation_id.to_string())?;
    Ok(ArtifactResponse::ok(
        state.0.get_conversation_snapshot(conversation_id),
    ))
}

/// Link artifacts emitted during a live tool loop to the assistant message
/// persisted at stream completion. Repeating the same request is idempotent;
/// cross-conversation and conflicting-message associations are rejected.
#[tauri::command]
pub async fn artifact_link_to_message(
    state: State<'_, ArtifactState>,
    db: State<'_, AppDatabase>,
    conversation_id: i64,
    message_id: i64,
    artifact_ids: Vec<String>,
    user_id: String,
) -> Result<ArtifactResponse<usize>, String> {
    if conversation_id <= 0 || message_id <= 0 {
        return Err("Conversation and message IDs must be positive".to_string());
    }
    if user_id.trim().is_empty() {
        return Err("User ID cannot be empty".to_string());
    }

    {
        let conn = db.connection()?;
        repository::get_conversation(&conn, conversation_id, &user_id)
            .map_err(|error| format!("Access denied or conversation not found: {error}"))?;
        let message = repository::get_message(&conn, message_id)
            .map_err(|error| format!("Message not found: {error}"))?;
        if message.conversation_id != conversation_id || message.user_id != user_id {
            return Err("Message does not belong to the requested conversation".to_string());
        }
    }

    let linked = state
        .0
        .link_to_message(conversation_id, message_id, &artifact_ids)?;
    Ok(ArtifactResponse::ok(linked))
}

/// Get artifact version history
#[tauri::command]
pub async fn artifact_get_versions(
    state: State<'_, ArtifactState>,
    id: String,
) -> Result<ArtifactResponse<Vec<ArtifactVersion>>, String> {
    match state.0.get_version_history(&id) {
        Some(versions) => Ok(ArtifactResponse::ok(versions)),
        None => Ok(ArtifactResponse::err(format!("Artifact not found: {}", id))),
    }
}

/// List artifacts, loading a requested conversation's rows from the database first.
#[tauri::command]
pub async fn artifact_list_persisted(
    state: State<'_, ArtifactState>,
    conversation_id: Option<String>,
    limit: Option<u32>,
) -> Result<ArtifactResponse<Vec<ArtifactSummary>>, String> {
    // Parse and validate conversation_id up front
    let parsed_cid = match conversation_id {
        Some(ref s) => Some(
            s.parse::<i64>()
                .map_err(|_| format!("Invalid conversation_id: {}", s))?,
        ),
        None => None,
    };

    // Load from DB if a conversation is requested and might not be in cache
    if let Some(ref cid) = conversation_id {
        if let Err(e) = state.0.load_conversation_from_db(cid) {
            debug!("Could not load conversation {} from DB: {}", cid, e);
        }
    }

    // After loading, use the in-memory filter to return results
    let filter = ArtifactFilter {
        conversation_id: parsed_cid,
        limit: limit.map(|l| l as usize),
        ..Default::default()
    };

    let summaries = state.0.list(filter);
    Ok(ArtifactResponse::ok(summaries))
}
