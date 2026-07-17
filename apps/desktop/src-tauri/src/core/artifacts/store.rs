//! Artifact Store
//!
//! Provides persistent storage and retrieval of artifacts with version history.

use super::persistence;
use super::types::*;
use chrono::Utc;
use parking_lot::RwLock;
use rusqlite::Connection;
use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use std::sync::{Arc, Mutex};

/// Artifact store manages artifacts in memory with optional persistence
pub struct ArtifactStore {
    /// In-memory artifact storage
    artifacts: RwLock<HashMap<String, Artifact>>,
    /// Index by conversation ID for fast lookup
    by_conversation: RwLock<HashMap<i64, Vec<String>>>,
    /// Index by artifact type
    by_type: RwLock<HashMap<ArtifactType, Vec<String>>>,
    /// Maximum versions to keep per artifact
    max_versions: usize,
    /// Optional database connection for persistence
    db_conn: Option<Arc<Mutex<Connection>>>,
}

impl Default for ArtifactStore {
    fn default() -> Self {
        Self::new(50) // Keep up to 50 versions by default
    }
}

impl ArtifactStore {
    /// Create a new artifact store
    pub fn new(max_versions: usize) -> Self {
        Self {
            artifacts: RwLock::new(HashMap::new()),
            by_conversation: RwLock::new(HashMap::new()),
            by_type: RwLock::new(HashMap::new()),
            max_versions,
            db_conn: None,
        }
    }

    /// Create a new artifact store with database persistence
    pub fn with_db(max_versions: usize, conn: Arc<Mutex<Connection>>) -> Self {
        Self {
            artifacts: RwLock::new(HashMap::new()),
            by_conversation: RwLock::new(HashMap::new()),
            by_type: RwLock::new(HashMap::new()),
            max_versions,
            db_conn: Some(conn),
        }
    }

    /// Persist an artifact and its latest version to DB (best-effort, logs errors)
    fn persist_artifact(&self, artifact: &Artifact) {
        if let Some(ref db) = self.db_conn {
            let conn = match db.lock() {
                Ok(c) => c,
                Err(e) => {
                    tracing::warn!(
                        "Failed to acquire DB lock for artifact {}: {}",
                        artifact.id,
                        e
                    );
                    return;
                }
            };
            if let Err(e) = persistence::save_artifact_to_db(&conn, artifact) {
                tracing::warn!("Failed to persist artifact {}: {}", artifact.id, e);
            }
            // Persist the latest version
            if let Some(latest_version) = artifact.versions.last() {
                if let Err(e) =
                    persistence::save_artifact_version_to_db(&conn, &artifact.id, latest_version)
                {
                    tracing::warn!(
                        "Failed to persist artifact version {}_v{}: {}",
                        artifact.id,
                        latest_version.version,
                        e
                    );
                }
            }
        }
    }

    /// Persist deletion to DB (best-effort)
    fn persist_delete(&self, id: &str) {
        if let Some(ref db) = self.db_conn {
            let conn = match db.lock() {
                Ok(c) => c,
                Err(e) => {
                    tracing::warn!(
                        "Failed to acquire DB lock for deleting artifact {}: {}",
                        id,
                        e
                    );
                    return;
                }
            };
            if let Err(e) = persistence::delete_artifact_from_db(&conn, id) {
                tracing::warn!("Failed to delete artifact {} from DB: {}", id, e);
            }
        }
    }

    /// Load all artifacts from DB into memory cache.
    /// Called on startup or when the in-memory cache is empty.
    pub fn load_from_db(&self) -> Result<usize, String> {
        let db = match &self.db_conn {
            Some(db) => db,
            None => return Ok(0),
        };
        let artifacts = {
            let conn = db.lock().map_err(|e| e.to_string())?;
            persistence::list_artifacts_from_db(&conn, None, None)?
        }; // db lock released here
        let count = artifacts.len();
        for artifact in artifacts {
            self.insert_artifact(artifact);
        }
        Ok(count)
    }

    /// Load artifacts for a specific conversation from DB into memory cache.
    pub fn load_conversation_from_db(&self, conversation_id: &str) -> Result<usize, String> {
        let db = match &self.db_conn {
            Some(db) => db,
            None => return Ok(0),
        };
        let artifacts = {
            let conn = db.lock().map_err(|e| e.to_string())?;
            persistence::list_artifacts_from_db(&conn, Some(conversation_id), None)?
        }; // db lock released here
        let numeric_conversation_id = conversation_id
            .parse::<i64>()
            .map_err(|_| format!("Invalid conversation ID: {conversation_id}"))?;
        let persisted_ids: std::collections::HashSet<_> = artifacts
            .iter()
            .map(|artifact| artifact.id.as_str())
            .collect();
        let stale_ids: Vec<String> = self
            .artifacts
            .read()
            .values()
            .filter(|artifact| {
                artifact.conversation_id == Some(numeric_conversation_id)
                    && !persisted_ids.contains(artifact.id.as_str())
            })
            .map(|artifact| artifact.id.clone())
            .collect();
        for stale_id in stale_ids {
            self.remove_cached_artifact(&stale_id);
        }
        let count = artifacts.len();
        for artifact in artifacts {
            self.insert_artifact(artifact);
        }
        Ok(count)
    }

    /// Generate a unique artifact ID
    pub fn generate_id() -> String {
        uuid::Uuid::new_v4().to_string()
    }

    /// Create a new artifact
    pub fn create(&self, request: CreateArtifactRequest) -> Result<Artifact, String> {
        self.create_internal(request, true)
    }

    /// Create an artifact that is available to the active UI turn but is never
    /// persisted. Temporary/incognito conversations use this path so artifact
    /// content honors the same no-disk contract as their messages.
    pub fn create_ephemeral(&self, request: CreateArtifactRequest) -> Result<Artifact, String> {
        self.create_internal(request, false)
    }

    fn create_internal(
        &self,
        request: CreateArtifactRequest,
        persist: bool,
    ) -> Result<Artifact, String> {
        let id = Self::generate_id();

        let metadata = request
            .metadata
            .unwrap_or_else(|| match request.artifact_type {
                ArtifactType::Code => ArtifactMetadata::Code(CodeMetadata::default()),
                ArtifactType::Document => ArtifactMetadata::Document(DocumentMetadata::default()),
                ArtifactType::Spreadsheet => {
                    ArtifactMetadata::Spreadsheet(SpreadsheetMetadata::default())
                }
                ArtifactType::Diagram => ArtifactMetadata::Diagram(DiagramMetadata::default()),
                ArtifactType::Web => ArtifactMetadata::Web(WebMetadata::default()),
                ArtifactType::Chart => ArtifactMetadata::Chart(ChartMetadata::default()),
                _ => ArtifactMetadata::default(),
            });

        let mut artifact = Artifact::new(
            id,
            request.title,
            request.artifact_type,
            request.content,
            metadata,
        );

        if let Some(render_type) = request.render_type {
            artifact.render_type = render_type;
        }

        artifact.conversation_id = request.conversation_id;
        artifact.message_id = request.message_id;

        if let Some(tags) = request.tags {
            artifact.tags = tags;
        }

        // Store the artifact
        self.insert_artifact(artifact.clone());

        if persist {
            self.persist_artifact(&artifact);
        }

        Ok(artifact)
    }

    /// Create a streaming artifact (content will be appended incrementally)
    pub fn create_streaming(
        &self,
        title: String,
        artifact_type: ArtifactType,
        metadata: Option<ArtifactMetadata>,
        conversation_id: Option<i64>,
        message_id: Option<i64>,
    ) -> Result<Artifact, String> {
        let id = Self::generate_id();

        let metadata = metadata.unwrap_or_else(|| match artifact_type {
            ArtifactType::Code => ArtifactMetadata::Code(CodeMetadata::default()),
            ArtifactType::Document => ArtifactMetadata::Document(DocumentMetadata::default()),
            _ => ArtifactMetadata::default(),
        });

        let mut artifact = Artifact::new_streaming(id, title, artifact_type, metadata);
        artifact.conversation_id = conversation_id;
        artifact.message_id = message_id;

        self.insert_artifact(artifact.clone());

        Ok(artifact)
    }

    /// Append content to a streaming artifact
    pub fn append_streaming(&self, id: &str, delta: &str) -> Result<(), String> {
        let mut artifacts = self.artifacts.write();
        let artifact = artifacts
            .get_mut(id)
            .ok_or_else(|| format!("Artifact not found: {}", id))?;

        if artifact.status != ArtifactStatus::Streaming {
            return Err("Artifact is not in streaming state".to_string());
        }

        artifact.append_content(delta);
        Ok(())
    }

    /// Finalize a streaming artifact
    pub fn finalize_streaming(
        &self,
        id: &str,
        change_description: Option<String>,
    ) -> Result<Artifact, String> {
        let mut artifacts = self.artifacts.write();
        let artifact = artifacts
            .get_mut(id)
            .ok_or_else(|| format!("Artifact not found: {}", id))?;

        if artifact.status != ArtifactStatus::Streaming {
            return Err("Artifact is not in streaming state".to_string());
        }

        artifact.finalize_streaming(change_description);
        let result = artifact.clone();

        // Persist finalized artifact to DB
        self.persist_artifact(&result);

        Ok(result)
    }

    /// Get an artifact by ID
    pub fn get(&self, id: &str) -> Option<Artifact> {
        self.artifacts.read().get(id).cloned()
    }

    /// Get an artifact's summary by ID
    pub fn get_summary(&self, id: &str) -> Option<ArtifactSummary> {
        self.artifacts.read().get(id).map(ArtifactSummary::from)
    }

    /// Update an artifact's content (creates a new version)
    pub fn update(&self, request: UpdateArtifactRequest) -> Result<Artifact, String> {
        let mut artifacts = self.artifacts.write();
        let artifact = artifacts
            .get_mut(&request.id)
            .ok_or_else(|| format!("Artifact not found: {}", request.id))?;

        // Update content and create new version
        artifact.update_content(request.content, request.change_description);

        // Update optional fields
        if let Some(title) = request.title {
            artifact.title = title;
        }

        if let Some(metadata) = request.metadata {
            artifact.metadata = metadata;
        }

        if let Some(tags) = request.tags {
            artifact.tags = tags;
        }

        // Prune old versions if necessary
        self.prune_versions(artifact);

        let result = artifact.clone();

        // Persist updated artifact to DB
        self.persist_artifact(&result);

        Ok(result)
    }

    /// Rollback an artifact to a specific version
    pub fn rollback(&self, id: &str, version: u32) -> Result<Artifact, String> {
        let mut artifacts = self.artifacts.write();
        let artifact = artifacts
            .get_mut(id)
            .ok_or_else(|| format!("Artifact not found: {}", id))?;

        artifact.rollback_to_version(version)?;
        let result = artifact.clone();

        // Persist rollback to DB
        self.persist_artifact(&result);

        Ok(result)
    }

    /// Delete an artifact
    pub fn delete(&self, id: &str) -> Result<(), String> {
        self.remove_cached_artifact(id)
            .ok_or_else(|| format!("Artifact not found: {}", id))?;

        // Persist deletion to DB
        self.persist_delete(id);

        Ok(())
    }

    /// Archive an artifact (soft delete)
    pub fn archive(&self, id: &str) -> Result<(), String> {
        let mut artifacts = self.artifacts.write();
        let artifact = artifacts
            .get_mut(id)
            .ok_or_else(|| format!("Artifact not found: {}", id))?;

        artifact.archive();

        // Persist status change to DB
        self.persist_artifact(artifact);
        Ok(())
    }

    /// Unarchive an artifact
    pub fn unarchive(&self, id: &str) -> Result<(), String> {
        let mut artifacts = self.artifacts.write();
        let artifact = artifacts
            .get_mut(id)
            .ok_or_else(|| format!("Artifact not found: {}", id))?;

        artifact.unarchive();

        // Persist status change to DB
        self.persist_artifact(artifact);
        Ok(())
    }

    /// Pin an artifact
    pub fn pin(&self, id: &str, pinned: bool) -> Result<(), String> {
        let mut artifacts = self.artifacts.write();
        let artifact = artifacts
            .get_mut(id)
            .ok_or_else(|| format!("Artifact not found: {}", id))?;

        artifact.pinned = pinned;
        artifact.updated_at = Utc::now();

        // Persist pin change to DB
        self.persist_artifact(artifact);
        Ok(())
    }

    /// Add tags to an artifact
    pub fn add_tags(&self, id: &str, tags: Vec<String>) -> Result<(), String> {
        let mut artifacts = self.artifacts.write();
        let artifact = artifacts
            .get_mut(id)
            .ok_or_else(|| format!("Artifact not found: {}", id))?;

        for tag in tags {
            if !artifact.tags.contains(&tag) {
                artifact.tags.push(tag);
            }
        }
        artifact.updated_at = Utc::now();

        // Persist tag changes to DB
        self.persist_artifact(artifact);
        Ok(())
    }

    /// Remove tags from an artifact
    pub fn remove_tags(&self, id: &str, tags: Vec<String>) -> Result<(), String> {
        let mut artifacts = self.artifacts.write();
        let artifact = artifacts
            .get_mut(id)
            .ok_or_else(|| format!("Artifact not found: {}", id))?;

        artifact.tags.retain(|t| !tags.contains(t));
        artifact.updated_at = Utc::now();

        // Persist tag changes to DB
        self.persist_artifact(artifact);
        Ok(())
    }

    /// List all artifacts with optional filtering
    pub fn list(&self, filter: ArtifactFilter) -> Vec<ArtifactSummary> {
        let artifacts = self.artifacts.read();

        let mut results: Vec<_> = artifacts
            .values()
            .filter(|a| {
                // Filter by type
                if let Some(ref types) = filter.artifact_types {
                    if !types.contains(&a.artifact_type) {
                        return false;
                    }
                }

                // Filter by status
                if let Some(ref statuses) = filter.statuses {
                    if !statuses.contains(&a.status) {
                        return false;
                    }
                }

                // Filter by tags
                if let Some(ref tags) = filter.tags {
                    if !tags.iter().any(|t| a.tags.contains(t)) {
                        return false;
                    }
                }

                // Filter by conversation
                if let Some(conv_id) = filter.conversation_id {
                    if a.conversation_id != Some(conv_id) {
                        return false;
                    }
                }

                // Filter pinned only
                if filter.pinned_only && !a.pinned {
                    return false;
                }

                // Search query
                if let Some(ref query) = filter.search_query {
                    let query_lower = query.to_lowercase();
                    let matches = a.title.to_lowercase().contains(&query_lower)
                        || a.content.to_lowercase().contains(&query_lower)
                        || a.tags
                            .iter()
                            .any(|t| t.to_lowercase().contains(&query_lower));
                    if !matches {
                        return false;
                    }
                }

                true
            })
            .map(ArtifactSummary::from)
            .collect();

        // Sort by updated_at descending (most recent first)
        results.sort_by(|a, b| b.updated_at.cmp(&a.updated_at));

        // Apply pagination
        let start = filter.offset.unwrap_or(0);
        let end = filter
            .limit
            .map(|l| (start + l).min(results.len()))
            .unwrap_or(results.len());

        results[start..end].to_vec()
    }

    /// Get artifacts for a specific conversation
    pub fn get_by_conversation(&self, conversation_id: i64) -> Vec<ArtifactSummary> {
        self.list(ArtifactFilter {
            conversation_id: Some(conversation_id),
            statuses: Some(vec![ArtifactStatus::Complete, ArtifactStatus::Streaming]),
            ..Default::default()
        })
    }

    /// Return the full durable artifact records needed to reconstruct chat
    /// message attachments after a conversation is reopened.
    pub fn get_conversation_snapshot(&self, conversation_id: i64) -> Vec<Artifact> {
        let artifacts = self.artifacts.read();
        let mut snapshot: Vec<_> = artifacts
            .values()
            .filter(|artifact| {
                artifact.conversation_id == Some(conversation_id)
                    && matches!(
                        artifact.status,
                        ArtifactStatus::Complete | ArtifactStatus::Streaming
                    )
            })
            .cloned()
            .collect();
        snapshot.sort_by(|left, right| {
            left.created_at
                .cmp(&right.created_at)
                .then_with(|| left.id.cmp(&right.id))
        });
        snapshot
    }

    /// Associate artifacts emitted during a live turn with the assistant
    /// message persisted at stream completion. The database validates that the
    /// message and every artifact belong to the same conversation; repeated
    /// calls with the same association are idempotent.
    pub fn link_to_message(
        &self,
        conversation_id: i64,
        message_id: i64,
        artifact_ids: &[String],
    ) -> Result<usize, String> {
        {
            let artifacts = self.artifacts.read();
            for artifact_id in artifact_ids {
                let artifact = artifacts
                    .get(artifact_id)
                    .ok_or_else(|| format!("Artifact not found: {artifact_id}"))?;
                if artifact.conversation_id != Some(conversation_id) {
                    return Err(format!(
                        "Artifact {artifact_id} does not belong to conversation {conversation_id}"
                    ));
                }
                if let Some(existing_message_id) = artifact.message_id {
                    if existing_message_id != message_id {
                        return Err(format!(
                            "Artifact {artifact_id} is already linked to message {existing_message_id}"
                        ));
                    }
                }
            }
        }

        let linked = if let Some(ref db) = self.db_conn {
            let conn = db
                .lock()
                .map_err(|error| format!("Failed to acquire artifact DB lock: {error}"))?;
            persistence::link_artifacts_to_message_in_db(
                &conn,
                conversation_id,
                message_id,
                artifact_ids,
            )?
        } else {
            artifact_ids.len()
        };

        let mut artifacts = self.artifacts.write();
        for artifact_id in artifact_ids {
            if let Some(artifact) = artifacts.get_mut(artifact_id) {
                artifact.message_id = Some(message_id);
            }
        }

        Ok(linked)
    }

    /// Get artifact version history
    pub fn get_version_history(&self, id: &str) -> Option<Vec<ArtifactVersion>> {
        self.artifacts.read().get(id).map(|a| a.versions.clone())
    }

    /// Get diff between two versions
    pub fn get_diff(&self, id: &str, from_version: u32, to_version: u32) -> Option<VersionDiff> {
        self.artifacts
            .read()
            .get(id)
            .and_then(|a| a.get_version_diff(from_version, to_version))
    }

    /// Get artifact statistics
    pub fn get_stats(&self) -> ArtifactStoreStats {
        let artifacts = self.artifacts.read();

        let mut stats = ArtifactStoreStats {
            total_artifacts: artifacts.len(),
            total_versions: 0,
            total_size_bytes: 0,
            by_type: HashMap::new(),
            by_status: HashMap::new(),
        };

        for artifact in artifacts.values() {
            stats.total_versions += artifact.versions.len();
            stats.total_size_bytes += artifact.content.len();

            *stats.by_type.entry(artifact.artifact_type).or_insert(0) += 1;
            *stats.by_status.entry(artifact.status).or_insert(0) += 1;
        }

        stats
    }

    /// Clear all artifacts (use with caution)
    pub fn clear(&self) {
        self.artifacts.write().clear();
        self.by_conversation.write().clear();
        self.by_type.write().clear();
    }

    /// Export all artifacts for backup
    pub fn export_all(&self) -> Vec<Artifact> {
        self.artifacts.read().values().cloned().collect()
    }

    /// Import artifacts from backup
    pub fn import_all(&self, artifacts: Vec<Artifact>) {
        for artifact in artifacts {
            self.persist_artifact(&artifact);
            self.insert_artifact(artifact);
        }
    }

    // Private helper methods

    fn insert_artifact(&self, artifact: Artifact) {
        let id = artifact.id.clone();
        let artifact_type = artifact.artifact_type;
        let conversation_id = artifact.conversation_id;

        // Replacing a persisted row must not duplicate its index entries or
        // leave it indexed under an older conversation/type.
        self.remove_cached_artifact(&id);
        self.artifacts.write().insert(id.clone(), artifact);

        // Update conversation index
        if let Some(conv_id) = conversation_id {
            self.by_conversation
                .write()
                .entry(conv_id)
                .or_default()
                .push(id.clone());
        }

        // Update type index
        self.by_type
            .write()
            .entry(artifact_type)
            .or_default()
            .push(id);
    }

    fn remove_cached_artifact(&self, id: &str) -> Option<Artifact> {
        let artifact = self.artifacts.write().remove(id)?;
        if let Some(conversation_id) = artifact.conversation_id {
            let mut by_conversation = self.by_conversation.write();
            if let Some(ids) = by_conversation.get_mut(&conversation_id) {
                ids.retain(|candidate| candidate != id);
                if ids.is_empty() {
                    by_conversation.remove(&conversation_id);
                }
            }
        }
        let mut by_type = self.by_type.write();
        if let Some(ids) = by_type.get_mut(&artifact.artifact_type) {
            ids.retain(|candidate| candidate != id);
            if ids.is_empty() {
                by_type.remove(&artifact.artifact_type);
            }
        }
        Some(artifact)
    }

    fn prune_versions(&self, artifact: &mut Artifact) {
        if artifact.versions.len() > self.max_versions {
            // Keep the first version and the most recent ones
            let keep_count = self.max_versions - 1;
            let versions_to_keep = artifact.versions.len() - keep_count;

            // Keep first version
            let first = artifact.versions.first().cloned();

            // Keep most recent versions
            let recent: Vec<_> = artifact
                .versions
                .iter()
                .skip(versions_to_keep)
                .cloned()
                .collect();

            artifact.versions.clear();
            if let Some(first) = first {
                artifact.versions.push(first);
            }
            artifact.versions.extend(recent);
        }
    }
}

/// Statistics about the artifact store
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ArtifactStoreStats {
    pub total_artifacts: usize,
    pub total_versions: usize,
    pub total_size_bytes: usize,
    pub by_type: HashMap<ArtifactType, usize>,
    pub by_status: HashMap<ArtifactStatus, usize>,
}

/// Thread-safe artifact store wrapper
pub type SharedArtifactStore = Arc<ArtifactStore>;

/// Create a new shared artifact store
pub fn create_shared_store(max_versions: usize) -> SharedArtifactStore {
    Arc::new(ArtifactStore::new(max_versions))
}

/// Create a new shared artifact store with database persistence
pub fn create_shared_store_with_db(
    max_versions: usize,
    conn: Arc<Mutex<Connection>>,
) -> SharedArtifactStore {
    Arc::new(ArtifactStore::with_db(max_versions, conn))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_create_artifact() {
        let store = ArtifactStore::default();

        let request = CreateArtifactRequest {
            title: "Test Code".to_string(),
            artifact_type: ArtifactType::Code,
            render_type: None,
            content: "fn main() {}".to_string(),
            metadata: Some(ArtifactMetadata::Code(CodeMetadata {
                language: "rust".to_string(),
                ..Default::default()
            })),
            conversation_id: Some(1),
            message_id: Some(1),
            tags: Some(vec!["test".to_string()]),
        };

        let artifact = store.create(request).unwrap();

        assert_eq!(artifact.title, "Test Code");
        assert_eq!(artifact.artifact_type, ArtifactType::Code);
        assert_eq!(artifact.current_version, 1);
        assert_eq!(artifact.versions.len(), 1);
    }

    #[test]
    fn ephemeral_create_never_writes_temporary_chat_content_to_disk() {
        let conn = Connection::open_in_memory().expect("open test database");
        crate::data::db::migrations::run_migrations(&conn).expect("migrate test database");
        conn.execute(
            "INSERT INTO conversations (title, user_id, created_at, updated_at) \
             VALUES ('Temporary', 'u1', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)",
            [],
        )
        .expect("insert conversation");
        let conversation_id = conn.last_insert_rowid();
        conn.execute(
            "INSERT INTO messages (conversation_id, user_id, role, content) \
             VALUES (?1, 'u1', 'assistant', 'Temporary response')",
            [conversation_id],
        )
        .expect("insert assistant message");
        let message_id = conn.last_insert_rowid();
        let db = Arc::new(Mutex::new(conn));
        let store = ArtifactStore::with_db(50, db.clone());

        let artifact = store
            .create_ephemeral(CreateArtifactRequest {
                title: "Temporary notes".to_string(),
                artifact_type: ArtifactType::Document,
                render_type: Some("markdown".to_string()),
                content: "This must remain memory-only".to_string(),
                metadata: None,
                conversation_id: Some(conversation_id),
                message_id: None,
                tags: None,
            })
            .expect("create temporary artifact");

        assert!(
            store.get(&artifact.id).is_some(),
            "live preview still needs the artifact"
        );
        let link_error = store
            .link_to_message(
                conversation_id,
                message_id,
                std::slice::from_ref(&artifact.id),
            )
            .expect_err("an ephemeral artifact must not acquire a durable message link");
        assert!(link_error.contains("Artifact not found"));
        {
            let conn = db.lock().expect("database lock");
            let persisted_artifacts: i64 = conn
                .query_row(
                    "SELECT COUNT(*) FROM artifacts WHERE id = ?1",
                    [&artifact.id],
                    |row| row.get(0),
                )
                .expect("count persisted artifacts");
            let persisted_versions: i64 = conn
                .query_row(
                    "SELECT COUNT(*) FROM artifact_versions WHERE artifact_id = ?1",
                    [&artifact.id],
                    |row| row.get(0),
                )
                .expect("count persisted versions");
            let persisted_links: i64 = conn
                .query_row(
                    "SELECT COUNT(*) FROM artifacts WHERE id = ?1 AND message_id IS NOT NULL",
                    [&artifact.id],
                    |row| row.get(0),
                )
                .expect("count persisted message links");
            assert_eq!(persisted_artifacts, 0, "temporary artifact reached SQLite");
            assert_eq!(persisted_versions, 0, "temporary version reached SQLite");
            assert_eq!(persisted_links, 0, "temporary message link reached SQLite");
        }

        let durable = store
            .create(CreateArtifactRequest {
                title: "Durable notes".to_string(),
                artifact_type: ArtifactType::Document,
                render_type: Some("markdown".to_string()),
                content: "Normal chats still persist".to_string(),
                metadata: None,
                conversation_id: Some(conversation_id),
                message_id: None,
                tags: None,
            })
            .expect("create durable artifact");
        let conn = db.lock().expect("database lock");
        let durable_rows: i64 = conn
            .query_row(
                "SELECT COUNT(*) FROM artifacts WHERE id = ?1",
                [&durable.id],
                |row| row.get(0),
            )
            .expect("count durable artifact");
        let durable_versions: i64 = conn
            .query_row(
                "SELECT COUNT(*) FROM artifact_versions WHERE artifact_id = ?1",
                [&durable.id],
                |row| row.get(0),
            )
            .expect("count durable versions");
        assert_eq!(durable_rows, 1, "normal artifact must remain durable");
        assert_eq!(
            durable_versions, 1,
            "normal artifact version must remain durable"
        );
    }

    #[test]
    fn persisted_artifact_reopens_from_a_fresh_store_with_owner_and_rich_type() {
        let conn = Connection::open_in_memory().expect("open test database");
        crate::data::db::migrations::run_migrations(&conn).expect("migrate test database");
        conn.execute(
            "INSERT INTO conversations (title, user_id, created_at, updated_at) \
             VALUES ('Reopen', 'u1', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)",
            [],
        )
        .expect("insert conversation");
        let conversation_id = conn.last_insert_rowid();
        conn.execute(
            "INSERT INTO messages (conversation_id, user_id, role, content) \
             VALUES (?1, 'u1', 'assistant', 'Created a component')",
            [conversation_id],
        )
        .expect("insert assistant message");
        let message_id = conn.last_insert_rowid();
        let db = Arc::new(Mutex::new(conn));

        let first_store = ArtifactStore::with_db(50, db.clone());
        let artifact = first_store
            .create(CreateArtifactRequest {
                title: "Counter".to_string(),
                artifact_type: ArtifactType::Code,
                render_type: Some("react".to_string()),
                content: "export default function Counter() { return <button />; }".to_string(),
                metadata: Some(ArtifactMetadata::Code(CodeMetadata {
                    language: "tsx".to_string(),
                    ..Default::default()
                })),
                conversation_id: Some(conversation_id),
                message_id: None,
                tags: None,
            })
            .expect("create durable component");
        first_store
            .link_to_message(
                conversation_id,
                message_id,
                std::slice::from_ref(&artifact.id),
            )
            .expect("link component to assistant message");
        drop(first_store);

        let reopened_store = ArtifactStore::with_db(50, db);
        reopened_store
            .load_conversation_from_db(&conversation_id.to_string())
            .expect("reload conversation artifacts after restart");
        let snapshot = reopened_store.get_conversation_snapshot(conversation_id);
        assert_eq!(snapshot.len(), 1);
        assert_eq!(snapshot[0].id, artifact.id);
        assert_eq!(snapshot[0].render_type, "react");
        assert_eq!(snapshot[0].message_id, Some(message_id));
        assert_eq!(snapshot[0].current_version, 1);
    }

    #[test]
    fn cloud_tombstone_removes_a_previously_cached_artifact_on_refresh() {
        let conn = Connection::open_in_memory().expect("open test database");
        crate::data::db::migrations::run_migrations(&conn).expect("migrate test database");
        conn.execute(
            "INSERT INTO conversations \
             (title, user_id, app_mode, created_at, updated_at) \
             VALUES ('Cloud refresh', 'u1', 'cloud', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)",
            [],
        )
        .expect("insert conversation");
        let conversation_id = conn.last_insert_rowid();
        let db = Arc::new(Mutex::new(conn));
        let store = ArtifactStore::with_db(50, db.clone());
        let artifact = store
            .create(CreateArtifactRequest {
                title: "Remote artifact".to_string(),
                artifact_type: ArtifactType::Document,
                render_type: Some("markdown".to_string()),
                content: "will be deleted remotely".to_string(),
                metadata: None,
                conversation_id: Some(conversation_id),
                message_id: None,
                tags: None,
            })
            .expect("create cloud artifact");
        assert_eq!(store.get_conversation_snapshot(conversation_id).len(), 1);

        db.lock()
            .expect("database lock")
            .execute(
                "UPDATE artifacts SET deleted_at_utc = CURRENT_TIMESTAMP WHERE id = ?1",
                [&artifact.id],
            )
            .expect("apply cloud tombstone");
        store
            .load_conversation_from_db(&conversation_id.to_string())
            .expect("refresh conversation cache");

        assert!(store.get(&artifact.id).is_none());
        assert!(store.get_conversation_snapshot(conversation_id).is_empty());
        assert!(store.get_by_conversation(conversation_id).is_empty());
    }

    #[test]
    fn concurrent_durable_creates_serialize_without_losing_artifacts_or_versions() {
        let conn = Connection::open_in_memory().expect("open test database");
        crate::data::db::migrations::run_migrations(&conn).expect("migrate test database");
        let db = Arc::new(Mutex::new(conn));
        let store = Arc::new(ArtifactStore::with_db(50, db.clone()));

        let handles: Vec<_> = (0..8)
            .map(|index| {
                let store = store.clone();
                std::thread::spawn(move || {
                    store
                        .create(CreateArtifactRequest {
                            title: format!("Concurrent {index}"),
                            artifact_type: ArtifactType::Document,
                            render_type: Some("markdown".to_string()),
                            content: format!("artifact {index}"),
                            metadata: None,
                            conversation_id: None,
                            message_id: None,
                            tags: None,
                        })
                        .expect("concurrent create")
                })
            })
            .collect();
        let created: Vec<_> = handles
            .into_iter()
            .map(|handle| handle.join().expect("artifact thread"))
            .collect();
        assert_eq!(created.len(), 8);

        let conn = db.lock().expect("database lock");
        let artifacts: i64 = conn
            .query_row("SELECT COUNT(*) FROM artifacts", [], |row| row.get(0))
            .expect("count concurrent artifacts");
        let versions: i64 = conn
            .query_row("SELECT COUNT(*) FROM artifact_versions", [], |row| {
                row.get(0)
            })
            .expect("count concurrent versions");
        assert_eq!(artifacts, 8);
        assert_eq!(versions, 8);
    }

    #[test]
    fn test_update_creates_version() {
        let store = ArtifactStore::default();

        let request = CreateArtifactRequest {
            title: "Test".to_string(),
            artifact_type: ArtifactType::Document,
            render_type: None,
            content: "Version 1".to_string(),
            metadata: None,
            conversation_id: None,
            message_id: None,
            tags: None,
        };

        let artifact = store.create(request).unwrap();
        let id = artifact.id.clone();

        let update = UpdateArtifactRequest {
            id: id.clone(),
            content: "Version 2".to_string(),
            change_description: Some("Updated content".to_string()),
            title: None,
            metadata: None,
            tags: None,
        };

        let updated = store.update(update).unwrap();

        assert_eq!(updated.current_version, 2);
        assert_eq!(updated.versions.len(), 2);
        assert_eq!(updated.content, "Version 2");
    }

    #[test]
    fn test_rollback() {
        let store = ArtifactStore::default();

        let request = CreateArtifactRequest {
            title: "Test".to_string(),
            artifact_type: ArtifactType::Document,
            render_type: None,
            content: "Version 1".to_string(),
            metadata: None,
            conversation_id: None,
            message_id: None,
            tags: None,
        };

        let artifact = store.create(request).unwrap();
        let id = artifact.id.clone();

        // Create version 2
        store
            .update(UpdateArtifactRequest {
                id: id.clone(),
                content: "Version 2".to_string(),
                change_description: None,
                title: None,
                metadata: None,
                tags: None,
            })
            .unwrap();

        // Rollback to version 1
        let rolled_back = store.rollback(&id, 1).unwrap();

        assert_eq!(rolled_back.content, "Version 1");
        assert_eq!(rolled_back.current_version, 3); // Rollback creates a new version
    }

    #[test]
    fn test_streaming_artifact() {
        let store = ArtifactStore::default();

        let artifact = store
            .create_streaming(
                "Streaming Code".to_string(),
                ArtifactType::Code,
                None,
                None,
                None,
            )
            .unwrap();

        let id = artifact.id.clone();
        assert_eq!(artifact.status, ArtifactStatus::Streaming);

        // Append content
        store.append_streaming(&id, "fn ").unwrap();
        store.append_streaming(&id, "main() {}").unwrap();

        // Finalize
        let finalized = store.finalize_streaming(&id, None).unwrap();

        assert_eq!(finalized.status, ArtifactStatus::Complete);
        assert_eq!(finalized.content, "fn main() {}");
        assert_eq!(finalized.current_version, 1);
    }

    #[test]
    fn test_list_with_filter() {
        let store = ArtifactStore::default();

        // Create various artifacts
        store
            .create(CreateArtifactRequest {
                title: "Code 1".to_string(),
                artifact_type: ArtifactType::Code,
                render_type: None,
                content: "code".to_string(),
                metadata: None,
                conversation_id: Some(1),
                message_id: None,
                tags: Some(vec!["rust".to_string()]),
            })
            .unwrap();

        store
            .create(CreateArtifactRequest {
                title: "Doc 1".to_string(),
                artifact_type: ArtifactType::Document,
                render_type: None,
                content: "document".to_string(),
                metadata: None,
                conversation_id: Some(1),
                message_id: None,
                tags: Some(vec!["readme".to_string()]),
            })
            .unwrap();

        store
            .create(CreateArtifactRequest {
                title: "Code 2".to_string(),
                artifact_type: ArtifactType::Code,
                render_type: None,
                content: "more code".to_string(),
                metadata: None,
                conversation_id: Some(2),
                message_id: None,
                tags: None,
            })
            .unwrap();

        // Filter by type
        let code_artifacts = store.list(ArtifactFilter {
            artifact_types: Some(vec![ArtifactType::Code]),
            ..Default::default()
        });
        assert_eq!(code_artifacts.len(), 2);

        // Filter by conversation
        let conv1_artifacts = store.list(ArtifactFilter {
            conversation_id: Some(1),
            ..Default::default()
        });
        assert_eq!(conv1_artifacts.len(), 2);

        // Filter by tag
        let rust_artifacts = store.list(ArtifactFilter {
            tags: Some(vec!["rust".to_string()]),
            ..Default::default()
        });
        assert_eq!(rust_artifacts.len(), 1);
    }
}
