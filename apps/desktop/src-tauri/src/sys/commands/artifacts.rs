//! Artifact Tauri Commands
//!
//! Provides Tauri commands for creating, managing, and rendering artifacts.

use crate::core::artifacts::{
    create_shared_store, Artifact, ArtifactFilter, ArtifactMetadata, ArtifactRenderer,
    ArtifactStatus, ArtifactStoreStats, ArtifactSummary, ArtifactType, ArtifactVersion,
    CreateArtifactRequest, RenderedArtifact, SharedArtifactStore, UpdateArtifactRequest,
    VersionDiff,
};
use serde::{Deserialize, Serialize};
use tauri::State;

/// State wrapper for artifact store
pub struct ArtifactState(pub SharedArtifactStore);

impl ArtifactState {
    pub fn new() -> Self {
        Self(create_shared_store(50))
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

/// Create a streaming artifact (content will be appended incrementally)
#[tauri::command]
pub async fn artifact_create_streaming(
    state: State<'_, ArtifactState>,
    title: String,
    artifact_type: ArtifactType,
    metadata: Option<ArtifactMetadata>,
    conversation_id: Option<i64>,
    message_id: Option<i64>,
) -> Result<ArtifactResponse<Artifact>, String> {
    match state
        .0
        .create_streaming(title, artifact_type, metadata, conversation_id, message_id)
    {
        Ok(artifact) => Ok(ArtifactResponse::ok(artifact)),
        Err(e) => Ok(ArtifactResponse::err(e)),
    }
}

/// Append content to a streaming artifact
#[tauri::command]
pub async fn artifact_append_streaming(
    state: State<'_, ArtifactState>,
    id: String,
    delta: String,
) -> Result<ArtifactResponse<()>, String> {
    match state.0.append_streaming(&id, &delta) {
        Ok(()) => Ok(ArtifactResponse::ok(())),
        Err(e) => Ok(ArtifactResponse::err(e)),
    }
}

/// Finalize a streaming artifact
#[tauri::command]
pub async fn artifact_finalize_streaming(
    state: State<'_, ArtifactState>,
    id: String,
    change_description: Option<String>,
) -> Result<ArtifactResponse<Artifact>, String> {
    match state.0.finalize_streaming(&id, change_description) {
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

/// Get an artifact rendered for display
#[tauri::command]
pub async fn artifact_get_rendered(
    state: State<'_, ArtifactState>,
    id: String,
) -> Result<ArtifactResponse<RenderedArtifact>, String> {
    match state.0.get(&id) {
        Some(artifact) => {
            let rendered = ArtifactRenderer::render(&artifact);
            Ok(ArtifactResponse::ok(rendered))
        }
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

/// Add tags to an artifact
#[tauri::command]
pub async fn artifact_add_tags(
    state: State<'_, ArtifactState>,
    id: String,
    tags: Vec<String>,
) -> Result<ArtifactResponse<()>, String> {
    match state.0.add_tags(&id, tags) {
        Ok(()) => Ok(ArtifactResponse::ok(())),
        Err(e) => Ok(ArtifactResponse::err(e)),
    }
}

/// Remove tags from an artifact
#[tauri::command]
pub async fn artifact_remove_tags(
    state: State<'_, ArtifactState>,
    id: String,
    tags: Vec<String>,
) -> Result<ArtifactResponse<()>, String> {
    match state.0.remove_tags(&id, tags) {
        Ok(()) => Ok(ArtifactResponse::ok(())),
        Err(e) => Ok(ArtifactResponse::err(e)),
    }
}

/// List artifacts with optional filtering
#[tauri::command]
pub async fn artifact_list(
    state: State<'_, ArtifactState>,
    artifact_types: Option<Vec<ArtifactType>>,
    statuses: Option<Vec<ArtifactStatus>>,
    tags: Option<Vec<String>>,
    conversation_id: Option<i64>,
    search_query: Option<String>,
    pinned_only: Option<bool>,
    limit: Option<usize>,
    offset: Option<usize>,
) -> Result<ArtifactResponse<Vec<ArtifactSummary>>, String> {
    let filter = ArtifactFilter {
        artifact_types,
        statuses,
        tags,
        conversation_id,
        search_query,
        pinned_only: pinned_only.unwrap_or(false),
        limit,
        offset,
    };

    let summaries = state.0.list(filter);
    Ok(ArtifactResponse::ok(summaries))
}

/// Get artifacts for a specific conversation
#[tauri::command]
pub async fn artifact_get_by_conversation(
    state: State<'_, ArtifactState>,
    conversation_id: i64,
) -> Result<ArtifactResponse<Vec<ArtifactSummary>>, String> {
    let summaries = state.0.get_by_conversation(conversation_id);
    Ok(ArtifactResponse::ok(summaries))
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

/// Get diff between two artifact versions
#[tauri::command]
pub async fn artifact_get_diff(
    state: State<'_, ArtifactState>,
    id: String,
    from_version: u32,
    to_version: u32,
) -> Result<ArtifactResponse<VersionDiff>, String> {
    match state.0.get_diff(&id, from_version, to_version) {
        Some(diff) => Ok(ArtifactResponse::ok(diff)),
        None => Ok(ArtifactResponse::err(
            "Could not generate diff. Artifact or versions not found.".to_string(),
        )),
    }
}

/// Get artifact store statistics
#[tauri::command]
pub async fn artifact_get_stats(
    state: State<'_, ArtifactState>,
) -> Result<ArtifactResponse<ArtifactStoreStats>, String> {
    let stats = state.0.get_stats();
    Ok(ArtifactResponse::ok(stats))
}

/// Export all artifacts (for backup)
#[tauri::command]
pub async fn artifact_export_all(
    state: State<'_, ArtifactState>,
) -> Result<ArtifactResponse<Vec<Artifact>>, String> {
    let artifacts = state.0.export_all();
    Ok(ArtifactResponse::ok(artifacts))
}

/// Import artifacts (from backup)
#[tauri::command]
pub async fn artifact_import_all(
    state: State<'_, ArtifactState>,
    artifacts: Vec<Artifact>,
) -> Result<ArtifactResponse<usize>, String> {
    let count = artifacts.len();
    state.0.import_all(artifacts);
    Ok(ArtifactResponse::ok(count))
}

/// Clear all artifacts (use with caution)
#[tauri::command]
pub async fn artifact_clear_all(
    state: State<'_, ArtifactState>,
) -> Result<ArtifactResponse<()>, String> {
    state.0.clear();
    Ok(ArtifactResponse::ok(()))
}
