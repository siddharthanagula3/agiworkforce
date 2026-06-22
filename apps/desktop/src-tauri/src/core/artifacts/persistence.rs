//! Artifact Persistence Layer
//!
//! SQLite-backed persistence for artifacts and their version history.
//! The in-memory ArtifactStore remains the primary cache; this module
//! provides durable storage so artifacts survive app restarts.
//!
//! CLOUD SYNC HOOK: `save_artifact_to_db` (1) derives `app_mode` from the
//! parent conversation immediately after INSERT/UPDATE so that cloud-conversation
//! artifacts carry `app_mode='cloud'`, then (2) calls `mark_artifact_for_push`
//! which sets `cloud_id`, `conversation_cloud_id`, and `needs_push=1` gated on
//! `WHERE app_mode='cloud'`. Local/BYOK artifacts are never touched.
//! Gate enforcement point: the `UPDATE artifacts SET app_mode = ...` SQL in
//! `save_artifact_to_db` (mechanism) + `cloud_sync::mark_artifact_for_push`
//! (backstop WHERE clause).

use super::types::*;
use crate::data::cloud_sync;
use rusqlite::{params, Connection};

/// Save (INSERT or UPDATE) an artifact to the database.
pub fn save_artifact_to_db(conn: &Connection, artifact: &Artifact) -> Result<(), String> {
    let artifact_type_str = artifact.artifact_type.to_string();
    let metadata_json =
        serde_json::to_string(&artifact.metadata).unwrap_or_else(|_| "{}".to_string());
    let conversation_id_str = artifact.conversation_id.map(|id| id.to_string());
    let content_hash = artifact
        .versions
        .last()
        .map(|v| v.content_hash.clone())
        .unwrap_or_default();
    let status_str = serde_json::to_string(&artifact.status)
        .unwrap_or_else(|_| "\"complete\"".to_string())
        .trim_matches('"')
        .to_string();
    let is_pinned: i32 = if artifact.pinned { 1 } else { 0 };
    let is_archived: i32 = if artifact.status == ArtifactStatus::Archived {
        1
    } else {
        0
    };
    let tags_json = serde_json::to_string(&artifact.tags).unwrap_or_else(|_| "[]".to_string());
    let created_at = artifact.created_at.to_rfc3339();
    let updated_at = artifact.updated_at.to_rfc3339();

    // Extract language from metadata if it's a Code artifact
    let language = match &artifact.metadata {
        ArtifactMetadata::Code(meta) => Some(meta.language.clone()),
        _ => None,
    };

    conn.execute(
        "INSERT INTO artifacts (id, artifact_type, title, content, language, metadata,
            conversation_id, version, content_hash, status, is_pinned, is_archived,
            tags, created_at, updated_at)
        VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12, ?13, ?14, ?15)
        ON CONFLICT(id) DO UPDATE SET
            title = excluded.title,
            content = excluded.content,
            language = excluded.language,
            metadata = excluded.metadata,
            conversation_id = excluded.conversation_id,
            version = excluded.version,
            content_hash = excluded.content_hash,
            status = excluded.status,
            is_pinned = excluded.is_pinned,
            is_archived = excluded.is_archived,
            tags = excluded.tags,
            updated_at = excluded.updated_at",
        params![
            artifact.id,
            artifact_type_str,
            artifact.title,
            artifact.content,
            language,
            metadata_json,
            conversation_id_str,
            artifact.current_version as i64,
            content_hash,
            status_str,
            is_pinned,
            is_archived,
            tags_json,
            created_at,
            updated_at,
        ],
    )
    .map_err(|e| format!("Failed to save artifact: {}", e))?;

    // Derive app_mode from the parent conversation so that cloud-conversation artifacts
    // are flagged 'cloud' immediately. This is the mechanism that makes mark_artifact_for_push
    // effective — the WHERE app_mode='cloud' guard there is the backstop, not the trigger.
    // Artifacts without a conversation_id (orphan) stay 'local' (the column default).
    conn.execute(
        "UPDATE artifacts \
         SET app_mode = COALESCE( \
             (SELECT c.app_mode FROM conversations c \
              WHERE c.id = CAST(artifacts.conversation_id AS INTEGER)), \
             'local' \
         ) \
         WHERE id = ?1",
        params![artifact.id],
    )
    .map_err(|e| format!("Failed to derive artifact app_mode from conversation: {}", e))?;

    // CLOUD SYNC HOOK: mark for push if this artifact belongs to a cloud conversation.
    // The gate is entirely inside mark_artifact_for_push (WHERE app_mode='cloud') so
    // local/BYOK artifacts are never touched — no mode state needed here.
    if let Err(e) = cloud_sync::mark_artifact_for_push(conn, &artifact.id) {
        // Non-fatal: log and continue. A missed mark will be retried on the next
        // save (or caught by the next sync's gather pass if cloud_id is already set).
        tracing::warn!(
            artifact_id = %artifact.id,
            error = %e,
            "Failed to mark artifact for cloud push — will retry on next sync"
        );
    }

    Ok(())
}

/// Save a single artifact version to the database.
pub fn save_artifact_version_to_db(
    conn: &Connection,
    artifact_id: &str,
    version: &ArtifactVersion,
) -> Result<(), String> {
    let version_id = format!("{}_{}", artifact_id, version.version);
    let created_at = version.created_at.to_rfc3339();

    conn.execute(
        "INSERT INTO artifact_versions (id, artifact_id, version, content, content_hash,
            change_description, created_at)
        VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7)
        ON CONFLICT(id) DO NOTHING",
        params![
            version_id,
            artifact_id,
            version.version as i64,
            version.content,
            version.content_hash,
            version.change_description,
            created_at,
        ],
    )
    .map_err(|e| format!("Failed to save artifact version: {}", e))?;

    Ok(())
}

/// Load a single artifact from the database by ID.
pub fn load_artifact_from_db(conn: &Connection, id: &str) -> Result<Option<Artifact>, String> {
    let mut stmt = conn
        .prepare(
            "SELECT id, artifact_type, title, content, language, metadata,
                conversation_id, version, content_hash, status, is_pinned, is_archived,
                tags, created_at, updated_at
            FROM artifacts WHERE id = ?1",
        )
        .map_err(|e| format!("Failed to prepare artifact query: {}", e))?;

    let artifact_opt = stmt
        .query_row(params![id], |row| {
            Ok(RawArtifactRow {
                id: row.get(0)?,
                artifact_type: row.get(1)?,
                title: row.get(2)?,
                content: row.get(3)?,
                _language: row.get(4)?,
                metadata: row.get(5)?,
                conversation_id: row.get::<_, Option<String>>(6)?,
                version: row.get(7)?,
                _content_hash: row.get(8)?,
                status: row.get(9)?,
                is_pinned: row.get(10)?,
                is_archived: row.get(11)?,
                tags: row.get(12)?,
                created_at: row.get(13)?,
                updated_at: row.get(14)?,
            })
        })
        .optional()
        .map_err(|e| format!("Failed to load artifact: {}", e))?;

    let raw = match artifact_opt {
        Some(r) => r,
        None => return Ok(None),
    };

    // Load versions
    let versions = load_versions_for_artifact(conn, &raw.id)?;

    let artifact = row_to_artifact(raw, versions)?;
    Ok(Some(artifact))
}

/// List artifacts from the database with optional filters.
pub fn list_artifacts_from_db(
    conn: &Connection,
    conversation_id: Option<&str>,
    limit: Option<i64>,
) -> Result<Vec<Artifact>, String> {
    let (sql, bound_conv_id);

    if let Some(cid) = conversation_id {
        bound_conv_id = cid.to_string();
        sql = format!(
            "SELECT id, artifact_type, title, content, language, metadata,
                conversation_id, version, content_hash, status, is_pinned, is_archived,
                tags, created_at, updated_at
            FROM artifacts WHERE conversation_id = ?1
            ORDER BY updated_at DESC LIMIT {}",
            limit.unwrap_or(500)
        );
        let mut stmt = conn
            .prepare(&sql)
            .map_err(|e| format!("Failed to prepare list query: {}", e))?;

        let rows = stmt
            .query_map(params![bound_conv_id], |row| {
                Ok(RawArtifactRow {
                    id: row.get(0)?,
                    artifact_type: row.get(1)?,
                    title: row.get(2)?,
                    content: row.get(3)?,
                    _language: row.get(4)?,
                    metadata: row.get(5)?,
                    conversation_id: row.get::<_, Option<String>>(6)?,
                    version: row.get(7)?,
                    _content_hash: row.get(8)?,
                    status: row.get(9)?,
                    is_pinned: row.get(10)?,
                    is_archived: row.get(11)?,
                    tags: row.get(12)?,
                    created_at: row.get(13)?,
                    updated_at: row.get(14)?,
                })
            })
            .map_err(|e| format!("Failed to list artifacts: {}", e))?;

        collect_artifact_rows(conn, rows)
    } else {
        sql = format!(
            "SELECT id, artifact_type, title, content, language, metadata,
                conversation_id, version, content_hash, status, is_pinned, is_archived,
                tags, created_at, updated_at
            FROM artifacts ORDER BY updated_at DESC LIMIT {}",
            limit.unwrap_or(500)
        );
        let mut stmt = conn
            .prepare(&sql)
            .map_err(|e| format!("Failed to prepare list query: {}", e))?;

        let rows = stmt
            .query_map([], |row| {
                Ok(RawArtifactRow {
                    id: row.get(0)?,
                    artifact_type: row.get(1)?,
                    title: row.get(2)?,
                    content: row.get(3)?,
                    _language: row.get(4)?,
                    metadata: row.get(5)?,
                    conversation_id: row.get::<_, Option<String>>(6)?,
                    version: row.get(7)?,
                    _content_hash: row.get(8)?,
                    status: row.get(9)?,
                    is_pinned: row.get(10)?,
                    is_archived: row.get(11)?,
                    tags: row.get(12)?,
                    created_at: row.get(13)?,
                    updated_at: row.get(14)?,
                })
            })
            .map_err(|e| format!("Failed to list artifacts: {}", e))?;

        collect_artifact_rows(conn, rows)
    }
}

/// Delete an artifact and its versions from the database.
pub fn delete_artifact_from_db(conn: &Connection, id: &str) -> Result<(), String> {
    // Versions are cascade-deleted via foreign key, but be explicit
    conn.execute(
        "DELETE FROM artifact_versions WHERE artifact_id = ?1",
        params![id],
    )
    .map_err(|e| format!("Failed to delete artifact versions: {}", e))?;

    conn.execute("DELETE FROM artifacts WHERE id = ?1", params![id])
        .map_err(|e| format!("Failed to delete artifact: {}", e))?;

    Ok(())
}

// ---- Internal helpers ----

/// Raw row data before conversion
struct RawArtifactRow {
    id: String,
    artifact_type: String,
    title: String,
    content: String,
    _language: Option<String>,
    metadata: Option<String>,
    conversation_id: Option<String>,
    version: i64,
    _content_hash: Option<String>,
    status: String,
    is_pinned: i32,
    is_archived: i32,
    tags: Option<String>,
    created_at: String,
    updated_at: String,
}

fn load_versions_for_artifact(
    conn: &Connection,
    artifact_id: &str,
) -> Result<Vec<ArtifactVersion>, String> {
    let mut stmt = conn
        .prepare(
            "SELECT version, content, content_hash, change_description, created_at
            FROM artifact_versions WHERE artifact_id = ?1 ORDER BY version ASC",
        )
        .map_err(|e| format!("Failed to prepare versions query: {}", e))?;

    let rows = stmt
        .query_map(params![artifact_id], |row| {
            let version: i64 = row.get(0)?;
            let content: String = row.get(1)?;
            let content_hash: Option<String> = row.get(2)?;
            let change_description: Option<String> = row.get(3)?;
            let created_at_str: String = row.get(4)?;

            Ok((
                version,
                content,
                content_hash,
                change_description,
                created_at_str,
            ))
        })
        .map_err(|e| format!("Failed to query versions: {}", e))?;

    let mut versions = Vec::new();
    for row_result in rows {
        let (version, content, content_hash, change_description, created_at_str) =
            row_result.map_err(|e| format!("Failed to read version row: {}", e))?;

        let created_at = chrono::DateTime::parse_from_rfc3339(&created_at_str)
            .map(|dt| dt.with_timezone(&chrono::Utc))
            .unwrap_or_else(|_| chrono::Utc::now());

        let size_bytes = content.len();

        versions.push(ArtifactVersion {
            version: version as u32,
            content,
            created_at,
            change_description,
            size_bytes,
            content_hash: content_hash.unwrap_or_default(),
        });
    }

    Ok(versions)
}

fn parse_artifact_type(s: &str) -> ArtifactType {
    match s {
        "code" => ArtifactType::Code,
        "document" => ArtifactType::Document,
        "spreadsheet" => ArtifactType::Spreadsheet,
        "diagram" => ArtifactType::Diagram,
        "web" => ArtifactType::Web,
        "chart" => ArtifactType::Chart,
        "presentation" => ArtifactType::Presentation,
        "image" => ArtifactType::Image,
        _ => ArtifactType::Document,
    }
}

fn parse_artifact_status(s: &str, is_archived: i32) -> ArtifactStatus {
    if is_archived != 0 {
        return ArtifactStatus::Archived;
    }
    match s {
        "streaming" => ArtifactStatus::Streaming,
        "complete" => ArtifactStatus::Complete,
        "failed" => ArtifactStatus::Failed,
        "archived" => ArtifactStatus::Archived,
        _ => ArtifactStatus::Complete,
    }
}

fn row_to_artifact(
    raw: RawArtifactRow,
    versions: Vec<ArtifactVersion>,
) -> Result<Artifact, String> {
    let artifact_type = parse_artifact_type(&raw.artifact_type);
    let status = parse_artifact_status(&raw.status, raw.is_archived);

    let metadata: ArtifactMetadata = raw
        .metadata
        .as_deref()
        .and_then(|s| serde_json::from_str(s).ok())
        .unwrap_or_default();

    let conversation_id: Option<i64> = raw.conversation_id.as_deref().and_then(|s| s.parse().ok());

    let tags: Vec<String> = raw
        .tags
        .as_deref()
        .and_then(|s| serde_json::from_str(s).ok())
        .unwrap_or_default();

    let created_at = chrono::DateTime::parse_from_rfc3339(&raw.created_at)
        .map(|dt| dt.with_timezone(&chrono::Utc))
        .unwrap_or_else(|_| chrono::Utc::now());

    let updated_at = chrono::DateTime::parse_from_rfc3339(&raw.updated_at)
        .map(|dt| dt.with_timezone(&chrono::Utc))
        .unwrap_or_else(|_| chrono::Utc::now());

    Ok(Artifact {
        id: raw.id,
        title: raw.title,
        artifact_type,
        content: raw.content,
        metadata,
        conversation_id,
        message_id: None,
        status,
        versions,
        current_version: raw.version as u32,
        created_at,
        updated_at,
        tags,
        pinned: raw.is_pinned != 0,
    })
}

fn collect_artifact_rows(
    conn: &Connection,
    rows: rusqlite::MappedRows<
        '_,
        impl FnMut(&rusqlite::Row<'_>) -> rusqlite::Result<RawArtifactRow>,
    >,
) -> Result<Vec<Artifact>, String> {
    let mut artifacts = Vec::new();
    for row_result in rows {
        let raw = row_result.map_err(|e| format!("Failed to read artifact row: {}", e))?;
        let artifact_id = raw.id.clone();
        let versions = load_versions_for_artifact(conn, &artifact_id)?;
        let artifact = row_to_artifact(raw, versions)?;
        artifacts.push(artifact);
    }
    Ok(artifacts)
}

/// Trait extension so rusqlite::OptionalExtension can be used inline.
trait OptionalExt<T> {
    fn optional(self) -> Result<Option<T>, rusqlite::Error>;
}

impl<T> OptionalExt<T> for rusqlite::Result<T> {
    fn optional(self) -> Result<Option<T>, rusqlite::Error> {
        match self {
            Ok(v) => Ok(Some(v)),
            Err(rusqlite::Error::QueryReturnedNoRows) => Ok(None),
            Err(e) => Err(e),
        }
    }
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

#[cfg(test)]
mod tests {
    use super::*;
    use crate::core::artifacts::types::{
        Artifact, ArtifactMetadata, ArtifactStatus, ArtifactType, ArtifactVersion,
    };
    use crate::data::db::migrations::run_migrations;
    use chrono::Utc;
    use rusqlite::{params, Connection};

    fn fresh_db() -> Connection {
        let conn = Connection::open_in_memory().expect("in-memory db");
        run_migrations(&conn).expect("migrations");
        conn
    }

    fn make_artifact(id: &str, conv_id: Option<i64>) -> Artifact {
        let now = Utc::now();
        Artifact {
            id: id.to_string(),
            title: "Test Artifact".to_string(),
            artifact_type: ArtifactType::Code,
            content: "fn main() {}".to_string(),
            metadata: ArtifactMetadata::default(),
            conversation_id: conv_id,
            message_id: None,
            status: ArtifactStatus::Complete,
            versions: vec![ArtifactVersion {
                version: 1,
                content: "fn main() {}".to_string(),
                created_at: now,
                change_description: None,
                size_bytes: 14,
                content_hash: "abc".to_string(),
            }],
            current_version: 1,
            created_at: now,
            updated_at: now,
            tags: vec![],
            pinned: false,
        }
    }

    /// save_artifact_to_db under a CLOUD conversation: app_mode must be 'cloud',
    /// needs_push=1, cloud_id set, conversation_cloud_id set — exercising the
    /// real code path (not a raw INSERT) so the derive-from-conversation UPDATE
    /// and mark_artifact_for_push hook are both verified.
    #[test]
    fn save_artifact_under_cloud_conversation_marks_for_push() {
        let conn = fresh_db();

        // Create a cloud conversation with a cloud_id.
        conn.execute(
            "INSERT INTO conversations (title, user_id, app_mode, created_at, updated_at) \
             VALUES ('CloudConv', 'u1', 'cloud', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)",
            [],
        )
        .unwrap();
        let conv_id: i64 = conn.last_insert_rowid();
        // Give it a cloud_id (simulates mark_conversation_for_push having run).
        let conv_cloud_id = "conv-cloud-persist-test-1";
        conn.execute(
            "UPDATE conversations SET cloud_id = ?1 WHERE id = ?2",
            params![conv_cloud_id, conv_id],
        )
        .unwrap();

        // Use the real save_artifact_to_db path (not a raw INSERT).
        let artifact = make_artifact("persist-test-art-1", Some(conv_id));
        save_artifact_to_db(&conn, &artifact).expect("save_artifact_to_db must not fail");

        let (app_mode, needs_push, cloud_id, conv_cid): (
            String,
            i64,
            Option<String>,
            Option<String>,
        ) = conn
            .query_row(
                "SELECT app_mode, needs_push, cloud_id, conversation_cloud_id \
                 FROM artifacts WHERE id = 'persist-test-art-1'",
                [],
                |r| Ok((r.get(0)?, r.get(1)?, r.get(2)?, r.get(3)?)),
            )
            .unwrap();

        assert_eq!(
            app_mode, "cloud",
            "artifact under a cloud conversation must inherit app_mode='cloud'"
        );
        assert_eq!(needs_push, 1, "cloud artifact must have needs_push=1 after save");
        assert!(
            cloud_id.is_some(),
            "cloud artifact must have cloud_id set after save"
        );
        assert_eq!(
            conv_cid.as_deref(),
            Some(conv_cloud_id),
            "conversation_cloud_id must be populated from parent conversation"
        );
    }

    /// save_artifact_to_db under a LOCAL conversation: app_mode must stay 'local',
    /// needs_push=0, cloud_id NULL — the real path must never sync local artifacts.
    #[test]
    fn save_artifact_under_local_conversation_stays_local() {
        let conn = fresh_db();

        // Create a local conversation (default app_mode).
        conn.execute(
            "INSERT INTO conversations (title, user_id, created_at, updated_at) \
             VALUES ('LocalConv', 'u1', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)",
            [],
        )
        .unwrap();
        let conv_id: i64 = conn.last_insert_rowid();

        // Use the real save_artifact_to_db path.
        let artifact = make_artifact("persist-test-art-2", Some(conv_id));
        save_artifact_to_db(&conn, &artifact).expect("save_artifact_to_db must not fail");

        let (app_mode, needs_push, cloud_id): (String, i64, Option<String>) = conn
            .query_row(
                "SELECT app_mode, needs_push, cloud_id FROM artifacts WHERE id = 'persist-test-art-2'",
                [],
                |r| Ok((r.get(0)?, r.get(1)?, r.get(2)?)),
            )
            .unwrap();

        assert_eq!(
            app_mode, "local",
            "artifact under a local conversation must stay app_mode='local'"
        );
        assert_eq!(needs_push, 0, "local artifact must NOT have needs_push=1");
        assert!(cloud_id.is_none(), "local artifact must NOT get a cloud_id");
    }
}
