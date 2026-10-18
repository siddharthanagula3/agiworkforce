//! Project management commands for the AGI Workforce desktop app.
//!
//! This module provides Tauri commands for creating, reading, updating, and deleting
//! projects. Projects group conversations, files, and custom instructions together.

use rusqlite::{params, Connection, OptionalExtension};
use serde::{Deserialize, Serialize};
use tauri::State;

use crate::sys::commands::AppDatabase;

/// Represents a file associated with a project
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ProjectFile {
    pub id: String,
    pub name: String,
    pub path: String,
    #[serde(rename = "type")]
    pub file_type: String,
    pub size: Option<u64>,
    pub mime_type: Option<String>,
    pub added_at: String,
}

/// Represents a project with all its metadata
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Project {
    pub id: String,
    pub name: String,
    pub description: String,
    pub custom_instructions: String,
    pub files: Vec<ProjectFile>,
    pub conversation_ids: Vec<String>,
    pub color: Option<String>,
    pub icon: Option<String>,
    pub is_archived: bool,
    #[serde(default)]
    pub is_starred: bool,
    pub created_at: String,
    pub updated_at: String,
    pub icon_emoji: Option<String>,
    pub accent_color: Option<String>,
    /// JSON-serialized knowledge base file metadata with extracted content.
    /// Added in v65 migration, None means no knowledge files stored.
    #[serde(default)]
    pub knowledge_base_files: Option<serde_json::Value>,
}

/// Partial update for a project
#[derive(Debug, Clone, Serialize, Deserialize, Default)]
#[serde(rename_all = "camelCase")]
pub struct ProjectUpdate {
    pub name: Option<String>,
    pub description: Option<String>,
    pub custom_instructions: Option<String>,
    pub files: Option<Vec<ProjectFile>>,
    pub conversation_ids: Option<Vec<String>>,
    pub color: Option<String>,
    pub icon: Option<String>,
    pub is_archived: Option<bool>,
    pub is_starred: Option<bool>,
    pub updated_at: Option<String>,
    pub icon_emoji: Option<String>,
    pub accent_color: Option<String>,
    /// JSON knowledge base files update (added in v65)
    #[serde(default)]
    pub knowledge_base_files: Option<serde_json::Value>,
}

/// The key a star is kept under in the project's `metadata` JSON, the same
/// key the managed-cloud project record uses.
const STARRED_METADATA_KEY: &str = "starred";

fn starred_in_metadata(metadata: Option<&str>) -> bool {
    metadata
        .and_then(|stored| serde_json::from_str::<serde_json::Value>(stored).ok())
        .and_then(|stored| stored.get(STARRED_METADATA_KEY).and_then(|v| v.as_bool()))
        .unwrap_or(false)
}

fn metadata_with_star(metadata: Option<&str>, is_starred: bool) -> String {
    let mut fields = metadata
        .and_then(|stored| serde_json::from_str::<serde_json::Value>(stored).ok())
        .and_then(|stored| match stored {
            serde_json::Value::Object(fields) => Some(fields),
            _ => None,
        })
        .unwrap_or_default();
    fields.insert(
        STARRED_METADATA_KEY.to_string(),
        serde_json::Value::Bool(is_starred),
    );
    serde_json::Value::Object(fields).to_string()
}

/// Create a new project
#[tauri::command]
pub async fn project_create(
    project: Project,
    db: State<'_, AppDatabase>,
) -> Result<Project, String> {
    let conn = db.conn.lock().map_err(|e| e.to_string())?;
    create_project(&conn, &project)?;
    Ok(project)
}

fn create_project(conn: &Connection, project: &Project) -> Result<(), String> {
    // Serialize files and conversation_ids as JSON
    let files_json = serde_json::to_string(&project.files).map_err(|e| e.to_string())?;
    let conversation_ids_json =
        serde_json::to_string(&project.conversation_ids).map_err(|e| e.to_string())?;

    let kb_files_json = project
        .knowledge_base_files
        .as_ref()
        .map(|v| serde_json::to_string(v).unwrap_or_default());

    let metadata = project.is_starred.then(|| metadata_with_star(None, true));

    conn.execute(
        "INSERT INTO projects (
            id, name, description, custom_instructions, files, conversation_ids,
            color, icon, is_archived, created_at, updated_at,
            icon_emoji, accent_color, knowledge_base_files, metadata
        ) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12, ?13, ?14, ?15)",
        params![
            project.id,
            project.name,
            project.description,
            project.custom_instructions,
            files_json,
            conversation_ids_json,
            project.color,
            project.icon,
            project.is_archived,
            project.created_at,
            project.updated_at,
            project.icon_emoji,
            project.accent_color,
            kb_files_json,
            metadata,
        ],
    )
    .map_err(|e| format!("Failed to create project: {}", e))?;

    Ok(())
}

/// List all projects
#[tauri::command]
pub async fn project_list(db: State<'_, AppDatabase>) -> Result<Vec<Project>, String> {
    let conn = db.conn.lock().map_err(|e| e.to_string())?;
    list_projects(&conn)
}

fn list_projects(conn: &Connection) -> Result<Vec<Project>, String> {
    let mut stmt = conn
        .prepare(
            "SELECT id, name, description, custom_instructions, files, conversation_ids,
                    color, icon, is_archived, created_at, updated_at,
                    icon_emoji, accent_color, knowledge_base_files, metadata
             FROM projects
             ORDER BY updated_at DESC",
        )
        .map_err(|e| format!("Failed to prepare query: {}", e))?;

    let projects = stmt
        .query_map([], |row| {
            let files_json: String = row.get(4)?;
            let conversation_ids_json: String = row.get(5)?;
            let kb_files_json: Option<String> = row.get(13)?;
            let metadata: Option<String> = row.get(14)?;

            let files: Vec<ProjectFile> = serde_json::from_str(&files_json).unwrap_or_default();
            let conversation_ids: Vec<String> =
                serde_json::from_str(&conversation_ids_json).unwrap_or_default();
            let knowledge_base_files: Option<serde_json::Value> = kb_files_json
                .as_deref()
                .and_then(|s| serde_json::from_str(s).ok());

            Ok(Project {
                id: row.get(0)?,
                name: row.get(1)?,
                description: row.get(2)?,
                custom_instructions: row.get(3)?,
                files,
                conversation_ids,
                color: row.get(6)?,
                icon: row.get(7)?,
                is_archived: row.get(8)?,
                is_starred: starred_in_metadata(metadata.as_deref()),
                created_at: row.get(9)?,
                updated_at: row.get(10)?,
                icon_emoji: row.get(11)?,
                accent_color: row.get(12)?,
                knowledge_base_files,
            })
        })
        .map_err(|e| format!("Failed to query projects: {}", e))?
        .collect::<Result<Vec<_>, _>>()
        .map_err(|e| format!("Failed to collect projects: {}", e))?;

    Ok(projects)
}

/// Update a project
#[tauri::command]
pub async fn project_update(
    id: String,
    updates: ProjectUpdate,
    db: State<'_, AppDatabase>,
) -> Result<(), String> {
    let conn = db.conn.lock().map_err(|e| e.to_string())?;
    update_project(&conn, id, &updates)
}

fn update_project(conn: &Connection, id: String, updates: &ProjectUpdate) -> Result<(), String> {
    // Build dynamic UPDATE query based on provided fields
    let mut set_clauses = Vec::new();
    let mut values: Vec<Box<dyn rusqlite::ToSql>> = Vec::new();

    if let Some(name) = &updates.name {
        set_clauses.push("name = ?");
        values.push(Box::new(name.clone()));
    }
    if let Some(description) = &updates.description {
        set_clauses.push("description = ?");
        values.push(Box::new(description.clone()));
    }
    if let Some(custom_instructions) = &updates.custom_instructions {
        set_clauses.push("custom_instructions = ?");
        values.push(Box::new(custom_instructions.clone()));
    }
    if let Some(files) = &updates.files {
        let files_json = serde_json::to_string(files).map_err(|e| e.to_string())?;
        set_clauses.push("files = ?");
        values.push(Box::new(files_json));
    }
    if let Some(conversation_ids) = &updates.conversation_ids {
        let conversation_ids_json =
            serde_json::to_string(conversation_ids).map_err(|e| e.to_string())?;
        set_clauses.push("conversation_ids = ?");
        values.push(Box::new(conversation_ids_json));
    }
    if let Some(color) = &updates.color {
        set_clauses.push("color = ?");
        values.push(Box::new(color.clone()));
    }
    if let Some(icon) = &updates.icon {
        set_clauses.push("icon = ?");
        values.push(Box::new(icon.clone()));
    }
    if let Some(is_archived) = updates.is_archived {
        set_clauses.push("is_archived = ?");
        values.push(Box::new(is_archived));
    }
    if let Some(is_starred) = updates.is_starred {
        let stored: Option<String> = conn
            .query_row(
                "SELECT metadata FROM projects WHERE id = ?1",
                [&id],
                |row| row.get::<_, Option<String>>(0),
            )
            .optional()
            .map_err(|e| format!("Failed to read project: {}", e))?
            .flatten();
        set_clauses.push("metadata = ?");
        values.push(Box::new(metadata_with_star(stored.as_deref(), is_starred)));
    }
    if let Some(updated_at) = &updates.updated_at {
        set_clauses.push("updated_at = ?");
        values.push(Box::new(updated_at.clone()));
    }
    if let Some(icon_emoji) = &updates.icon_emoji {
        set_clauses.push("icon_emoji = ?");
        values.push(Box::new(icon_emoji.clone()));
    }
    if let Some(accent_color) = &updates.accent_color {
        set_clauses.push("accent_color = ?");
        values.push(Box::new(accent_color.clone()));
    }
    if let Some(knowledge_base_files) = &updates.knowledge_base_files {
        let kb_json = serde_json::to_string(knowledge_base_files).map_err(|e| e.to_string())?;
        set_clauses.push("knowledge_base_files = ?");
        values.push(Box::new(kb_json));
    }

    if set_clauses.is_empty() {
        return Ok(());
    }

    let query = format!(
        "UPDATE projects SET {} WHERE id = ?",
        set_clauses.join(", ")
    );

    values.push(Box::new(id));
    let params: Vec<&dyn rusqlite::ToSql> = values.iter().map(|v| v.as_ref()).collect();

    conn.execute(&query, params.as_slice())
        .map_err(|e| format!("Failed to update project: {}", e))?;

    Ok(())
}

/// Delete a project
#[tauri::command]
pub async fn project_delete(id: String, db: State<'_, AppDatabase>) -> Result<(), String> {
    let conn = db.conn.lock().map_err(|e| e.to_string())?;

    conn.execute("DELETE FROM projects WHERE id = ?1", [&id])
        .map_err(|e| format!("Failed to delete project: {}", e))?;

    // Also delete associated settings
    conn.execute("DELETE FROM project_settings WHERE project_id = ?1", [&id])
        .ok(); // Ignore if table doesn't exist

    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    fn migrated_database() -> Connection {
        let conn = Connection::open_in_memory().expect("in-memory database");
        crate::data::db::migrations::run_migrations(&conn).expect("migrate test database");
        conn
    }

    /// What `src/stores/projectStore.ts` sends as `project` when it creates one.
    fn project_from_the_ui(id: &str) -> Project {
        serde_json::from_value(serde_json::json!({
            "id": id,
            "name": "Launch",
            "description": "",
            "customInstructions": "",
            "files": [],
            "conversationIds": [],
            "isArchived": false,
            "createdAt": "2026-10-11T00:00:00.000Z",
            "updatedAt": "2026-10-11T00:00:00.000Z",
        }))
        .expect("project as the store sends it")
    }

    fn starred(conn: &Connection, id: &str) -> bool {
        list_projects(conn)
            .expect("list projects")
            .into_iter()
            .find(|project| project.id == id)
            .expect("project is listed")
            .is_starred
    }

    #[test]
    fn a_star_set_from_the_project_list_is_still_there_when_projects_load_again() {
        let conn = migrated_database();
        create_project(&conn, &project_from_the_ui("p-1")).expect("create project");
        assert!(!starred(&conn, "p-1"));

        let star: ProjectUpdate = serde_json::from_value(serde_json::json!({
            "isStarred": true,
            "updatedAt": "2026-10-11T00:01:00.000Z",
        }))
        .expect("update as the store sends it");
        update_project(&conn, "p-1".to_string(), &star).expect("star project");
        assert!(starred(&conn, "p-1"));

        let listed = serde_json::to_value(list_projects(&conn).expect("list projects"))
            .expect("projects as the store reads them");
        assert_eq!(listed[0]["isStarred"], true);

        let unstar = ProjectUpdate {
            is_starred: Some(false),
            ..ProjectUpdate::default()
        };
        update_project(&conn, "p-1".to_string(), &unstar).expect("unstar project");
        assert!(!starred(&conn, "p-1"));
    }

    #[test]
    fn starring_keeps_whatever_else_the_project_metadata_holds() {
        let kept = metadata_with_star(Some(r#"{"origin":"import","starred":false}"#), true);
        let kept: serde_json::Value = serde_json::from_str(&kept).expect("metadata is json");
        assert_eq!(kept["origin"], "import");
        assert_eq!(kept["starred"], true);

        assert!(starred_in_metadata(Some(&metadata_with_star(None, true))));
        assert!(!starred_in_metadata(Some("not json")));
        assert!(!starred_in_metadata(None));
    }

    #[test]
    fn an_update_without_a_star_leaves_it_as_it_was() {
        let conn = migrated_database();
        let mut project = project_from_the_ui("p-2");
        project.is_starred = true;
        create_project(&conn, &project).expect("create starred project");

        let rename = ProjectUpdate {
            name: Some("Launch week".to_string()),
            ..ProjectUpdate::default()
        };
        update_project(&conn, "p-2".to_string(), &rename).expect("rename project");
        assert!(starred(&conn, "p-2"));
    }
}
