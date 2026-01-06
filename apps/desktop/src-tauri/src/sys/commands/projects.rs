//! Project management commands for the AGI Workforce desktop app.
//!
//! This module provides Tauri commands for creating, reading, updating, and deleting
//! projects. Projects group conversations, files, and custom instructions together.

use rusqlite::{params, OptionalExtension};
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
    pub created_at: String,
    pub updated_at: String,
}

/// Project settings that can be customized per project
#[derive(Debug, Clone, Serialize, Deserialize, Default)]
#[serde(rename_all = "camelCase")]
pub struct ProjectSettings {
    pub default_model: Option<String>,
    pub default_provider: Option<String>,
    pub context_window_size: Option<u32>,
    pub auto_archive_after_days: Option<u32>,
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
    pub updated_at: Option<String>,
}

/// Create a new project
#[tauri::command]
pub async fn project_create(
    project: Project,
    db: State<'_, AppDatabase>,
) -> Result<Project, String> {
    let conn = db.conn.lock().map_err(|e| e.to_string())?;

    // Serialize files and conversation_ids as JSON
    let files_json = serde_json::to_string(&project.files).map_err(|e| e.to_string())?;
    let conversation_ids_json =
        serde_json::to_string(&project.conversation_ids).map_err(|e| e.to_string())?;

    conn.execute(
        "INSERT INTO projects (
            id, name, description, custom_instructions, files, conversation_ids,
            color, icon, is_archived, created_at, updated_at
        ) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11)",
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
        ],
    )
    .map_err(|e| format!("Failed to create project: {}", e))?;

    Ok(project)
}

/// List all projects
#[tauri::command]
pub async fn project_list(db: State<'_, AppDatabase>) -> Result<Vec<Project>, String> {
    let conn = db.conn.lock().map_err(|e| e.to_string())?;

    let mut stmt = conn
        .prepare(
            "SELECT id, name, description, custom_instructions, files, conversation_ids,
                    color, icon, is_archived, created_at, updated_at
             FROM projects
             ORDER BY updated_at DESC",
        )
        .map_err(|e| format!("Failed to prepare query: {}", e))?;

    let projects = stmt
        .query_map([], |row| {
            let files_json: String = row.get(4)?;
            let conversation_ids_json: String = row.get(5)?;

            let files: Vec<ProjectFile> = serde_json::from_str(&files_json).unwrap_or_default();
            let conversation_ids: Vec<String> =
                serde_json::from_str(&conversation_ids_json).unwrap_or_default();

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
                created_at: row.get(9)?,
                updated_at: row.get(10)?,
            })
        })
        .map_err(|e| format!("Failed to query projects: {}", e))?
        .collect::<Result<Vec<_>, _>>()
        .map_err(|e| format!("Failed to collect projects: {}", e))?;

    Ok(projects)
}

/// Get a single project by ID
#[tauri::command]
pub async fn project_get(
    id: String,
    db: State<'_, AppDatabase>,
) -> Result<Option<Project>, String> {
    let conn = db.conn.lock().map_err(|e| e.to_string())?;

    let mut stmt = conn
        .prepare(
            "SELECT id, name, description, custom_instructions, files, conversation_ids,
                    color, icon, is_archived, created_at, updated_at
             FROM projects
             WHERE id = ?1",
        )
        .map_err(|e| format!("Failed to prepare query: {}", e))?;

    let project = stmt
        .query_row([&id], |row| {
            let files_json: String = row.get(4)?;
            let conversation_ids_json: String = row.get(5)?;

            let files: Vec<ProjectFile> = serde_json::from_str(&files_json).unwrap_or_default();
            let conversation_ids: Vec<String> =
                serde_json::from_str(&conversation_ids_json).unwrap_or_default();

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
                created_at: row.get(9)?,
                updated_at: row.get(10)?,
            })
        })
        .optional()
        .map_err(|e| format!("Failed to get project: {}", e))?;

    Ok(project)
}

/// Update a project
#[tauri::command]
pub async fn project_update(
    id: String,
    updates: ProjectUpdate,
    db: State<'_, AppDatabase>,
) -> Result<(), String> {
    let conn = db.conn.lock().map_err(|e| e.to_string())?;

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
    if let Some(updated_at) = &updates.updated_at {
        set_clauses.push("updated_at = ?");
        values.push(Box::new(updated_at.clone()));
    }

    if set_clauses.is_empty() {
        return Ok(());
    }

    let query = format!(
        "UPDATE projects SET {} WHERE id = ?",
        set_clauses.join(", ")
    );

    // Add id as the last parameter
    values.push(Box::new(id));

    // Convert values to params_from_iter compatible format
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

/// Get project settings
#[tauri::command]
pub async fn project_get_settings(
    project_id: String,
    db: State<'_, AppDatabase>,
) -> Result<ProjectSettings, String> {
    let conn = db.conn.lock().map_err(|e| e.to_string())?;

    let mut stmt = conn
        .prepare(
            "SELECT default_model, default_provider, context_window_size, auto_archive_after_days
             FROM project_settings
             WHERE project_id = ?1",
        )
        .map_err(|e| format!("Failed to prepare query: {}", e))?;

    let settings = stmt
        .query_row([&project_id], |row| {
            Ok(ProjectSettings {
                default_model: row.get(0)?,
                default_provider: row.get(1)?,
                context_window_size: row.get(2)?,
                auto_archive_after_days: row.get(3)?,
            })
        })
        .optional()
        .map_err(|e| format!("Failed to get project settings: {}", e))?
        .unwrap_or_default();

    Ok(settings)
}

/// Update project settings
#[tauri::command]
pub async fn project_update_settings(
    project_id: String,
    settings: ProjectSettings,
    db: State<'_, AppDatabase>,
) -> Result<(), String> {
    let conn = db.conn.lock().map_err(|e| e.to_string())?;

    conn.execute(
        "INSERT INTO project_settings (
            project_id, default_model, default_provider, context_window_size, auto_archive_after_days
        ) VALUES (?1, ?2, ?3, ?4, ?5)
        ON CONFLICT(project_id) DO UPDATE SET
            default_model = excluded.default_model,
            default_provider = excluded.default_provider,
            context_window_size = excluded.context_window_size,
            auto_archive_after_days = excluded.auto_archive_after_days",
        params![
            project_id,
            settings.default_model,
            settings.default_provider,
            settings.context_window_size,
            settings.auto_archive_after_days,
        ],
    )
    .map_err(|e| format!("Failed to update project settings: {}", e))?;

    Ok(())
}
