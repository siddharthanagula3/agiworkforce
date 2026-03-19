//! Artifact Persistence Layer
//!
//! SQLite-backed persistence for artifacts and their version history.
//! The in-memory ArtifactStore remains the primary cache; this module
//! provides durable storage so artifacts survive app restarts.

use super::types::*;
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
                language: row.get(4)?,
                metadata: row.get(5)?,
                conversation_id: row.get::<_, Option<String>>(6)?,
                version: row.get(7)?,
                content_hash: row.get(8)?,
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
                    language: row.get(4)?,
                    metadata: row.get(5)?,
                    conversation_id: row.get::<_, Option<String>>(6)?,
                    version: row.get(7)?,
                    content_hash: row.get(8)?,
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
                    language: row.get(4)?,
                    metadata: row.get(5)?,
                    conversation_id: row.get::<_, Option<String>>(6)?,
                    version: row.get(7)?,
                    content_hash: row.get(8)?,
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
    conn.execute("DELETE FROM artifact_versions WHERE artifact_id = ?1", params![id])
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
    #[allow(dead_code)]
    language: Option<String>,
    metadata: Option<String>,
    conversation_id: Option<String>,
    version: i64,
    #[allow(dead_code)]
    content_hash: Option<String>,
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

            Ok((version, content, content_hash, change_description, created_at_str))
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

fn row_to_artifact(raw: RawArtifactRow, versions: Vec<ArtifactVersion>) -> Result<Artifact, String> {
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
    rows: rusqlite::MappedRows<'_, impl FnMut(&rusqlite::Row<'_>) -> rusqlite::Result<RawArtifactRow>>,
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
