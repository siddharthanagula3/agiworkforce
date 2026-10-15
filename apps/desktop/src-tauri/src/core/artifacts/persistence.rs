//! Artifact Persistence Layer
//!
//! SQLite-backed persistence for artifacts and their version history.
//! The in-memory ArtifactStore remains the primary cache; this module
//! provides durable storage so artifacts survive app restarts.

use super::types::*;
use rusqlite::{params, Connection};
use std::collections::HashSet;

/// Save (INSERT or UPDATE) an artifact to the database.
pub fn save_artifact_to_db(conn: &Connection, artifact: &Artifact) -> Result<(), String> {
    // Persist the exact cross-surface renderer type. The Rust `artifact_type`
    // field is intentionally coarser and cannot distinguish react/code,
    // svg/image, or markdown/document after a restart.
    let artifact_type_str = if artifact.render_type.trim().is_empty() {
        artifact.artifact_type.to_string()
    } else {
        artifact.render_type.clone()
    };
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
            conversation_id, message_id, version, content_hash, status, is_pinned, is_archived,
            tags, created_at, updated_at)
        VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12, ?13, ?14, ?15, ?16)
        ON CONFLICT(id) DO UPDATE SET
            artifact_type = excluded.artifact_type,
            title = excluded.title,
            content = excluded.content,
            language = excluded.language,
            metadata = excluded.metadata,
            conversation_id = excluded.conversation_id,
            message_id = excluded.message_id,
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
            artifact.message_id,
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
                conversation_id, message_id, version, content_hash, status, is_pinned, is_archived,
                tags, created_at, updated_at
            FROM artifacts WHERE id = ?1 AND deleted_at_utc IS NULL",
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
                message_id: row.get(7)?,
                version: row.get(8)?,
                _content_hash: row.get(9)?,
                status: row.get(10)?,
                is_pinned: row.get(11)?,
                is_archived: row.get(12)?,
                tags: row.get(13)?,
                created_at: row.get(14)?,
                updated_at: row.get(15)?,
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
        // A conversation reopen is a correctness path, not a browse/list path:
        // omitting `limit` must load every artifact owned by the conversation.
        // The global startup cache remains capped in the branch below.
        let limit_clause = limit
            .map(|value| format!(" LIMIT {}", value.max(0)))
            .unwrap_or_default();
        sql = format!(
            "SELECT id, artifact_type, title, content, language, metadata,
                conversation_id, message_id, version, content_hash, status, is_pinned, is_archived,
                tags, created_at, updated_at
            FROM artifacts WHERE conversation_id = ?1 AND deleted_at_utc IS NULL
            ORDER BY updated_at DESC{}",
            limit_clause
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
                    message_id: row.get(7)?,
                    version: row.get(8)?,
                    _content_hash: row.get(9)?,
                    status: row.get(10)?,
                    is_pinned: row.get(11)?,
                    is_archived: row.get(12)?,
                    tags: row.get(13)?,
                    created_at: row.get(14)?,
                    updated_at: row.get(15)?,
                })
            })
            .map_err(|e| format!("Failed to list artifacts: {}", e))?;

        collect_artifact_rows(conn, rows)
    } else {
        sql = format!(
            "SELECT id, artifact_type, title, content, language, metadata,
                conversation_id, message_id, version, content_hash, status, is_pinned, is_archived,
                tags, created_at, updated_at
            FROM artifacts WHERE deleted_at_utc IS NULL ORDER BY updated_at DESC LIMIT {}",
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
                    message_id: row.get(7)?,
                    version: row.get(8)?,
                    _content_hash: row.get(9)?,
                    status: row.get(10)?,
                    is_pinned: row.get(11)?,
                    is_archived: row.get(12)?,
                    tags: row.get(13)?,
                    created_at: row.get(14)?,
                    updated_at: row.get(15)?,
                })
            })
            .map_err(|e| format!("Failed to list artifacts: {}", e))?;

        collect_artifact_rows(conn, rows)
    }
}

/// Atomically link persisted artifacts to the assistant message that owns
/// them. This is the durable bridge between the live `chat:artifact` event and
/// conversation reload. The operation is idempotent for the same
/// conversation/message pair and rejects cross-conversation or conflicting
/// ownership.
pub fn link_artifacts_to_message_in_db(
    conn: &Connection,
    conversation_id: i64,
    message_id: i64,
    artifact_ids: &[String],
) -> Result<usize, String> {
    if conversation_id <= 0 || message_id <= 0 {
        return Err("Conversation and message IDs must be positive".to_string());
    }

    let unique_ids: Vec<&str> = artifact_ids
        .iter()
        .map(String::as_str)
        .filter(|id| !id.trim().is_empty())
        .collect::<HashSet<_>>()
        .into_iter()
        .collect();
    if unique_ids.is_empty() {
        return Ok(0);
    }
    let conversation_id_text = conversation_id.to_string();

    let tx = conn
        .unchecked_transaction()
        .map_err(|error| format!("Failed to begin artifact link transaction: {error}"))?;

    tx.query_row(
        "SELECT 1 FROM messages WHERE id = ?1 AND conversation_id = ?2",
        params![message_id, conversation_id],
        |row| row.get::<_, i64>(0),
    )
    .optional()
    .map_err(|error| format!("Failed to validate artifact message owner: {error}"))?
    .ok_or_else(|| {
        format!("Message {message_id} does not belong to conversation {conversation_id}")
    })?;

    for artifact_id in &unique_ids {
        let row = tx
            .query_row(
                "SELECT conversation_id, message_id FROM artifacts WHERE id = ?1",
                params![artifact_id],
                |row| {
                    Ok((
                        row.get::<_, Option<String>>(0)?,
                        row.get::<_, Option<i64>>(1)?,
                    ))
                },
            )
            .optional()
            .map_err(|error| format!("Failed to validate artifact {artifact_id}: {error}"))?
            .ok_or_else(|| format!("Artifact not found: {artifact_id}"))?;

        if row.0.as_deref() != Some(conversation_id_text.as_str()) {
            return Err(format!(
                "Artifact {artifact_id} does not belong to conversation {conversation_id}"
            ));
        }
        if let Some(existing_message_id) = row.1 {
            if existing_message_id != message_id {
                return Err(format!(
                    "Artifact {artifact_id} is already linked to message {existing_message_id}"
                ));
            }
        }
    }

    for artifact_id in &unique_ids {
        tx.execute(
            "UPDATE artifacts SET message_id = ?1 WHERE id = ?2",
            params![message_id, artifact_id],
        )
        .map_err(|error| format!("Failed to link artifact {artifact_id}: {error}"))?;
    }

    tx.commit()
        .map_err(|error| format!("Failed to commit artifact links: {error}"))?;
    Ok(unique_ids.len())
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
    language: Option<String>,
    metadata: Option<String>,
    conversation_id: Option<String>,
    message_id: Option<i64>,
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
        "code" | "react" | "component" => ArtifactType::Code,
        "document" | "markdown" | "email" | "research" => ArtifactType::Document,
        "spreadsheet" | "table" | "csv" => ArtifactType::Spreadsheet,
        "diagram" | "mermaid" => ArtifactType::Diagram,
        "web" | "html" => ArtifactType::Web,
        "chart" => ArtifactType::Chart,
        "presentation" => ArtifactType::Presentation,
        "image" | "svg" => ArtifactType::Image,
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

    let mut metadata: ArtifactMetadata = raw
        .metadata
        .as_deref()
        .and_then(|s| serde_json::from_str(s).ok())
        .unwrap_or_default();

    // Older rows may have a valid language column but missing/invalid metadata.
    // Preserve that language when reconstructing code/react artifacts.
    if matches!(raw.artifact_type.as_str(), "code" | "react" | "component") {
        if let Some(language) = raw.language.as_deref() {
            if !matches!(metadata, ArtifactMetadata::Code(_)) {
                metadata = ArtifactMetadata::Code(CodeMetadata {
                    language: language.to_string(),
                    ..Default::default()
                });
            }
        }
    }

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
        render_type: raw.artifact_type,
        content: raw.content,
        metadata,
        conversation_id,
        message_id: raw.message_id,
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
            render_type: "code".to_string(),
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

    #[test]
    fn persistence_round_trip_preserves_render_type_message_owner_and_version() {
        let conn = fresh_db();
        conn.execute(
            "INSERT INTO conversations (title, user_id, created_at, updated_at) \
             VALUES ('Artifacts', 'u1', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)",
            [],
        )
        .unwrap();
        let conversation_id = conn.last_insert_rowid();
        conn.execute(
            "INSERT INTO messages (conversation_id, user_id, role, content) \
             VALUES (?1, 'u1', 'assistant', 'Created a component')",
            params![conversation_id],
        )
        .unwrap();
        let message_id = conn.last_insert_rowid();

        let mut artifact = make_artifact("persist-rich-artifact", Some(conversation_id));
        artifact.render_type = "react".to_string();
        artifact.message_id = Some(message_id);
        artifact.current_version = 3;
        artifact.metadata = ArtifactMetadata::Code(crate::core::artifacts::CodeMetadata {
            language: "tsx".to_string(),
            ..Default::default()
        });
        artifact.versions = (1..=3)
            .map(|version| ArtifactVersion {
                version,
                content: format!("component-v{version}"),
                created_at: Utc::now(),
                change_description: None,
                size_bytes: 12,
                content_hash: format!("hash-{version}"),
            })
            .collect();

        save_artifact_to_db(&conn, &artifact).expect("save rich artifact");
        for version in &artifact.versions {
            save_artifact_version_to_db(&conn, &artifact.id, version).expect("save version");
        }

        let loaded = load_artifact_from_db(&conn, &artifact.id)
            .expect("load query")
            .expect("persisted artifact");
        assert_eq!(loaded.render_type, "react");
        assert_eq!(loaded.message_id, Some(message_id));
        assert_eq!(loaded.current_version, 3);
        assert_eq!(loaded.versions.len(), 3);
        match loaded.metadata {
            ArtifactMetadata::Code(metadata) => assert_eq!(metadata.language, "tsx"),
            other => panic!("expected code metadata, got {other:?}"),
        }
    }

    #[test]
    fn message_link_is_idempotent_and_rejects_conflicting_ownership() {
        let conn = fresh_db();
        conn.execute(
            "INSERT INTO conversations (title, user_id, created_at, updated_at) \
             VALUES ('Artifacts', 'u1', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)",
            [],
        )
        .unwrap();
        let conversation_id = conn.last_insert_rowid();
        for content in ["first", "second"] {
            conn.execute(
                "INSERT INTO messages (conversation_id, user_id, role, content) \
                 VALUES (?1, 'u1', 'assistant', ?2)",
                params![conversation_id, content],
            )
            .unwrap();
        }
        let second_message_id = conn.last_insert_rowid();
        let first_message_id = second_message_id - 1;

        let artifact = make_artifact("link-artifact", Some(conversation_id));
        save_artifact_to_db(&conn, &artifact).unwrap();
        let failed_batch = vec![artifact.id.clone(), "missing-artifact".to_string()];
        let missing_error = link_artifacts_to_message_in_db(
            &conn,
            conversation_id,
            first_message_id,
            &failed_batch,
        )
        .expect_err("a partially invalid link batch must fail atomically");
        assert!(missing_error.contains("Artifact not found"));
        let owner_after_failed_batch: Option<i64> = conn
            .query_row(
                "SELECT message_id FROM artifacts WHERE id = ?1",
                params![artifact.id],
                |row| row.get(0),
            )
            .unwrap();
        assert_eq!(
            owner_after_failed_batch, None,
            "validation failure must not leave a partial message link"
        );

        let ids = vec![artifact.id.clone(), artifact.id.clone()];

        assert_eq!(
            link_artifacts_to_message_in_db(&conn, conversation_id, first_message_id, &ids,)
                .unwrap(),
            1
        );
        assert_eq!(
            link_artifacts_to_message_in_db(&conn, conversation_id, first_message_id, &ids,)
                .unwrap(),
            1,
            "repeating the same association must be idempotent"
        );

        let conflict =
            link_artifacts_to_message_in_db(&conn, conversation_id, second_message_id, &ids)
                .expect_err("an artifact cannot be reassigned to a different message");
        assert!(conflict.contains("already linked"));

        let persisted_owner: i64 = conn
            .query_row(
                "SELECT message_id FROM artifacts WHERE id = ?1",
                params![artifact.id],
                |row| row.get(0),
            )
            .unwrap();
        assert_eq!(persisted_owner, first_message_id);
    }

    #[test]
    fn conversation_reload_is_not_truncated_at_the_startup_cache_limit() {
        let conn = fresh_db();
        conn.execute(
            "INSERT INTO conversations (title, user_id, created_at, updated_at) \
             VALUES ('Large artifact thread', 'u1', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)",
            [],
        )
        .unwrap();
        let conversation_id = conn.last_insert_rowid();

        let empty = list_artifacts_from_db(&conn, Some(&conversation_id.to_string()), None)
            .expect("load empty conversation snapshot");
        assert!(empty.is_empty());

        let first = make_artifact("large-conversation-artifact-0", Some(conversation_id));
        save_artifact_to_db(&conn, &first).expect("persist first conversation artifact");
        let single = list_artifacts_from_db(&conn, Some(&conversation_id.to_string()), None)
            .expect("load one-artifact conversation snapshot");
        assert_eq!(single.len(), 1);

        for index in 1..500 {
            let artifact = make_artifact(
                &format!("large-conversation-artifact-{index}"),
                Some(conversation_id),
            );
            save_artifact_to_db(&conn, &artifact).expect("persist conversation artifact");
        }

        let at_old_limit = list_artifacts_from_db(&conn, Some(&conversation_id.to_string()), None)
            .expect("load 500-artifact conversation snapshot");
        assert_eq!(at_old_limit.len(), 500);

        let beyond_old_limit =
            make_artifact("large-conversation-artifact-500", Some(conversation_id));
        save_artifact_to_db(&conn, &beyond_old_limit)
            .expect("persist artifact beyond old cache limit");

        let loaded = list_artifacts_from_db(&conn, Some(&conversation_id.to_string()), None)
            .expect("load complete conversation snapshot");
        assert_eq!(
            loaded.len(),
            501,
            "conversation reload must not silently drop artifacts"
        );
    }

    #[test]
    fn malformed_legacy_metadata_and_empty_render_type_have_safe_fidelity_fallbacks() {
        let conn = fresh_db();

        let mut empty_render_type = make_artifact("empty-render-type", None);
        empty_render_type.render_type.clear();
        save_artifact_to_db(&conn, &empty_render_type).expect("save legacy empty type");
        let reloaded_empty = load_artifact_from_db(&conn, &empty_render_type.id)
            .expect("load legacy empty type")
            .expect("legacy artifact exists");
        assert_eq!(reloaded_empty.render_type, "code");
        assert_eq!(reloaded_empty.artifact_type, ArtifactType::Code);

        let legacy = make_artifact("legacy-malformed-metadata", None);
        save_artifact_to_db(&conn, &legacy).expect("save legacy artifact");
        conn.execute(
            "UPDATE artifacts
             SET artifact_type = 'react', metadata = '{not-json', language = 'tsx'
             WHERE id = ?1",
            params![legacy.id],
        )
        .expect("corrupt legacy metadata fixture");

        let reloaded = load_artifact_from_db(&conn, &legacy.id)
            .expect("load malformed legacy artifact")
            .expect("legacy artifact exists");
        assert_eq!(reloaded.render_type, "react");
        assert_eq!(reloaded.artifact_type, ArtifactType::Code);
        match reloaded.metadata {
            ArtifactMetadata::Code(metadata) => assert_eq!(metadata.language, "tsx"),
            other => panic!("expected recovered code metadata, got {other:?}"),
        }
    }
}
