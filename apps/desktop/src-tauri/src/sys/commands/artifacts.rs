//! Artifact Tauri Commands
//!
//! Provides Tauri commands for creating, managing, and rendering artifacts.

use crate::core::artifacts::{
    create_shared_store, create_shared_store_with_db, Artifact, ArtifactFilter, ArtifactMetadata,
    ArtifactRenderer, ArtifactStatus, ArtifactStoreStats, ArtifactSummary, ArtifactType,
    ArtifactVersion, CreateArtifactRequest, RenderedArtifact, SharedArtifactStore,
    UpdateArtifactRequest, VersionDiff,
};
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

/// A single hunk in a diff-based artifact update.
///
/// Each hunk describes a contiguous range of lines to replace.
/// `start_line` is 0-indexed and `end_line` is exclusive.
#[derive(Debug, Deserialize)]
pub struct ArtifactDiffHunk {
    pub start_line: usize,
    pub end_line: usize,
    pub original_content: String,
    pub new_content: String,
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

/// Apply a diff (set of hunks) to an artifact, creating a new version.
///
/// Each hunk specifies a range of lines (`start_line..end_line`, 0-indexed,
/// end exclusive) together with the expected original content and the
/// replacement content.  Hunks are applied in reverse line-order so that
/// earlier hunks do not shift the offsets of later ones.
///
/// The command validates that the original content of each hunk matches the
/// current artifact content (using a trimmed comparison to tolerate trailing
/// whitespace differences).  If any hunk fails validation, the entire
/// operation is rejected and no changes are made.
#[tauri::command]
pub async fn artifact_apply_diff(
    id: String,
    hunks: Vec<ArtifactDiffHunk>,
    change_description: Option<String>,
    state: State<'_, ArtifactState>,
) -> Result<ArtifactResponse<Artifact>, String> {
    // 1. Load the current artifact
    let artifact = match state.0.get(&id) {
        Some(a) => a,
        None => return Ok(ArtifactResponse::err(format!("Artifact not found: {}", id))),
    };

    if hunks.is_empty() {
        return Ok(ArtifactResponse::err("No diff hunks provided".to_string()));
    }

    // 2. Split current content into lines
    let mut lines: Vec<String> = artifact.content.lines().map(String::from).collect();
    // If the content ends with a newline, lines() will NOT produce a trailing empty
    // element, but we need to preserve the trailing newline when we rejoin later.
    let trailing_newline = artifact.content.ends_with('\n');

    // 3. Sort hunks by start_line descending so we can apply from bottom to top
    let mut sorted_hunks: Vec<&ArtifactDiffHunk> = hunks.iter().collect();
    sorted_hunks.sort_by(|a, b| b.start_line.cmp(&a.start_line));

    // 4. Validate all hunks before applying any
    for hunk in &sorted_hunks {
        if hunk.start_line > hunk.end_line {
            return Ok(ArtifactResponse::err(format!(
                "Invalid hunk: start_line ({}) > end_line ({})",
                hunk.start_line, hunk.end_line
            )));
        }
        if hunk.end_line > lines.len() {
            return Ok(ArtifactResponse::err(format!(
                "Hunk end_line ({}) exceeds artifact line count ({})",
                hunk.end_line,
                lines.len()
            )));
        }

        // Validate that original_content matches the targeted lines (trimmed comparison)
        let actual_lines: Vec<&str> = lines[hunk.start_line..hunk.end_line]
            .iter()
            .map(|s| s.as_str())
            .collect();
        let actual_joined = actual_lines.join("\n");
        if actual_joined.trim() != hunk.original_content.trim() {
            return Ok(ArtifactResponse::err(format!(
                "Hunk content mismatch at lines {}-{}: expected '{}', found '{}'",
                hunk.start_line,
                hunk.end_line,
                hunk.original_content.chars().take(80).collect::<String>(),
                actual_joined.chars().take(80).collect::<String>(),
            )));
        }
    }

    // 5. Apply hunks in reverse order (highest line numbers first)
    for hunk in &sorted_hunks {
        let new_lines: Vec<String> = if hunk.new_content.is_empty() {
            Vec::new()
        } else {
            hunk.new_content.lines().map(String::from).collect()
        };

        // Replace the range with new lines
        lines.splice(hunk.start_line..hunk.end_line, new_lines);

        debug!(
            "[Artifact] Applied diff hunk at lines {}-{} for artifact {}",
            hunk.start_line, hunk.end_line, id
        );
    }

    // 6. Rejoin lines
    let mut new_content = lines.join("\n");
    if trailing_newline && !new_content.ends_with('\n') {
        new_content.push('\n');
    }

    // 7. Delegate to the existing update path to save as a new version
    let description =
        change_description.unwrap_or_else(|| format!("Applied {} diff hunk(s)", hunks.len()));

    let update_request = UpdateArtifactRequest {
        id,
        content: new_content,
        change_description: Some(description),
        title: None,
        metadata: None,
        tags: None,
    };

    match state.0.update(update_request) {
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

/// List persisted artifacts from the database.
/// Unlike `artifact_list` which queries in-memory cache, this queries SQLite directly.
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
