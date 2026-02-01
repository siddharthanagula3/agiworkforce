//! Project folder context management for the AGI Workforce desktop app.
//!
//! This module provides Tauri commands for managing the active project folder context.
//! The project folder is used to:
//! - Provide context to the LLM about the user's current working directory
//! - Scope file operations and terminal commands to the project directory
//! - Enable folder-aware tool execution

use serde::{Deserialize, Serialize};
use std::path::PathBuf;
use std::sync::Arc;
use tauri::State;
use tokio::sync::RwLock;
use tracing::{debug, info, warn};

/// Represents the active project folder context
#[derive(Debug, Clone, Serialize, Deserialize, Default)]
#[serde(rename_all = "camelCase")]
pub struct ProjectContext {
    /// The absolute path to the project folder
    pub folder: Option<String>,
    /// The display name of the project (derived from folder name)
    pub name: Option<String>,
    /// Whether the folder exists and is accessible
    pub is_valid: bool,
}

/// State wrapper for project context management
pub struct ProjectContextState {
    pub context: Arc<RwLock<ProjectContext>>,
}

impl ProjectContextState {
    pub fn new() -> Self {
        Self {
            context: Arc::new(RwLock::new(ProjectContext {
                folder: None,
                name: None,
                is_valid: false,
            })),
        }
    }

    /// Get a clone of the current project context
    pub async fn get_context(&self) -> ProjectContext {
        self.context.read().await.clone()
    }

    /// Get the project folder path if set and valid
    pub async fn get_folder(&self) -> Option<String> {
        let ctx = self.context.read().await;
        if ctx.is_valid {
            ctx.folder.clone()
        } else {
            None
        }
    }
}

impl Default for ProjectContextState {
    fn default() -> Self {
        Self::new()
    }
}

/// Set the active project folder
///
/// This command validates the provided path and updates the project context.
/// If the path is None, the project folder is cleared.
///
/// # Arguments
/// * `path` - Optional path to the project folder. If None, clears the current folder.
///
/// # Returns
/// * `Ok(ProjectContext)` - The updated project context
/// * `Err(String)` - Error message if the path is invalid
#[tauri::command]
pub async fn project_context_set_folder(
    path: Option<String>,
    state: State<'_, ProjectContextState>,
) -> Result<ProjectContext, String> {
    let mut ctx = state.context.write().await;

    if let Some(ref p) = path {
        // Validate path exists and is a directory
        let path_buf = PathBuf::from(p);

        if !path_buf.exists() {
            warn!("[ProjectContext] Directory does not exist: {}", p);
            return Err(format!(
                "The folder '{}' does not exist. Please select a valid folder.",
                p
            ));
        }

        if !path_buf.is_dir() {
            warn!("[ProjectContext] Path is not a directory: {}", p);
            return Err(format!(
                "The path '{}' is not a folder. Please select a folder, not a file.",
                p
            ));
        }

        // Check if we can read the directory (basic access check)
        if let Err(e) = std::fs::read_dir(&path_buf) {
            warn!("[ProjectContext] Cannot access directory {}: {}", p, e);
            return Err(format!(
                "Cannot access the folder '{}'. Please check permissions.",
                p
            ));
        }

        // Extract folder name for display
        let name = path_buf
            .file_name()
            .and_then(|n| n.to_str())
            .map(|s| s.to_string());

        info!(
            "[ProjectContext] Set project folder: {} (name: {:?})",
            p, name
        );

        ctx.folder = Some(p.clone());
        ctx.name = name;
        ctx.is_valid = true;
    } else {
        // Clear the project folder
        info!("[ProjectContext] Cleared project folder");
        ctx.folder = None;
        ctx.name = None;
        ctx.is_valid = false;
    }

    Ok(ctx.clone())
}

/// Get the current project folder context
///
/// # Returns
/// * `ProjectContext` - The current project context (may be empty if no folder is set)
#[tauri::command]
pub async fn project_context_get_folder(
    state: State<'_, ProjectContextState>,
) -> Result<ProjectContext, String> {
    let ctx = state.context.read().await;
    debug!("[ProjectContext] Get folder: {:?}", ctx.folder);
    Ok(ctx.clone())
}

/// Validate if a given path is within the current project folder
///
/// This is used to ensure file operations are scoped to the project directory
/// when a project folder is set.
///
/// # Arguments
/// * `path` - The path to validate
///
/// # Returns
/// * `Ok(bool)` - True if the path is within the project folder (or no folder is set)
/// * `Err(String)` - Error message if validation fails
#[tauri::command]
pub async fn project_context_validate_path(
    path: String,
    state: State<'_, ProjectContextState>,
) -> Result<bool, String> {
    let ctx = state.context.read().await;

    // If no project folder is set, allow all paths
    if !ctx.is_valid || ctx.folder.is_none() {
        return Ok(true);
    }

    let project_folder = ctx.folder.as_ref().unwrap();
    let project_path = PathBuf::from(project_folder);
    let target_path = PathBuf::from(&path);

    // Canonicalize paths for comparison (resolves symlinks and normalizes)
    let canonical_project = match project_path.canonicalize() {
        Ok(p) => p,
        Err(_) => return Ok(false), // Project folder no longer accessible
    };

    let canonical_target = match target_path.canonicalize() {
        Ok(p) => p,
        Err(_) => {
            // For new files, check if parent is within project
            if let Some(parent) = target_path.parent() {
                match parent.canonicalize() {
                    Ok(p) => p,
                    Err(_) => return Ok(false),
                }
            } else {
                return Ok(false);
            }
        }
    };

    // Check if target is within project folder
    let is_within = canonical_target.starts_with(&canonical_project);

    debug!(
        "[ProjectContext] Path validation: {} is {} project folder",
        path,
        if is_within { "within" } else { "outside" }
    );

    Ok(is_within)
}

/// List files in the current project folder
///
/// Returns a list of files and directories in the project folder root.
/// This is useful for providing context to the LLM about what's in the project.
///
/// # Arguments
/// * `max_depth` - Maximum depth to traverse (default: 1)
/// * `include_hidden` - Whether to include hidden files (default: false)
///
/// # Returns
/// * `Ok(Vec<ProjectFileInfo>)` - List of files and directories
/// * `Err(String)` - Error message if no project folder is set or listing fails
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ProjectFileInfo {
    pub path: String,
    pub name: String,
    pub is_directory: bool,
    pub size: Option<u64>,
    pub extension: Option<String>,
}

#[tauri::command]
pub async fn project_context_list_files(
    state: State<'_, ProjectContextState>,
    max_depth: Option<u32>,
    include_hidden: Option<bool>,
) -> Result<Vec<ProjectFileInfo>, String> {
    let ctx = state.context.read().await;

    if !ctx.is_valid || ctx.folder.is_none() {
        return Err("No project folder is set. Please select a folder first.".to_string());
    }

    let folder = ctx.folder.as_ref().unwrap();
    let max_depth = max_depth.unwrap_or(1);
    let include_hidden = include_hidden.unwrap_or(false);

    let mut files = Vec::new();
    list_files_recursive(folder, folder, 0, max_depth, include_hidden, &mut files)?;

    debug!(
        "[ProjectContext] Listed {} files in project folder",
        files.len()
    );

    Ok(files)
}

fn list_files_recursive(
    base_path: &str,
    current_path: &str,
    current_depth: u32,
    max_depth: u32,
    include_hidden: bool,
    files: &mut Vec<ProjectFileInfo>,
) -> Result<(), String> {
    if current_depth > max_depth {
        return Ok(());
    }

    let entries =
        std::fs::read_dir(current_path).map_err(|e| format!("Failed to read directory: {}", e))?;

    for entry in entries.flatten() {
        let path = entry.path();
        let name = entry.file_name().to_string_lossy().to_string();

        // Skip hidden files unless requested
        if !include_hidden && name.starts_with('.') {
            continue;
        }

        // Skip common directories that shouldn't be indexed
        if path.is_dir() {
            let skip_dirs = [
                "node_modules",
                ".git",
                "target",
                "dist",
                "build",
                "__pycache__",
                ".venv",
                "venv",
            ];
            if skip_dirs.contains(&name.as_str()) {
                continue;
            }
        }

        let is_directory = path.is_dir();
        let metadata = entry.metadata().ok();

        let relative_path = path
            .strip_prefix(base_path)
            .map(|p| p.to_string_lossy().to_string())
            .unwrap_or_else(|_| path.to_string_lossy().to_string());

        let extension = if is_directory {
            None
        } else {
            path.extension()
                .and_then(|e| e.to_str())
                .map(|s| s.to_string())
        };

        files.push(ProjectFileInfo {
            path: relative_path,
            name,
            is_directory,
            size: metadata.as_ref().map(|m| m.len()),
            extension,
        });

        // Recurse into directories
        if is_directory && current_depth < max_depth {
            list_files_recursive(
                base_path,
                path.to_str().unwrap_or(""),
                current_depth + 1,
                max_depth,
                include_hidden,
                files,
            )?;
        }
    }

    Ok(())
}

/// Get a summary of the project folder for LLM context
///
/// This provides a condensed view of the project structure suitable for
/// including in the system prompt.
///
/// # Returns
/// * `Ok(String)` - A formatted summary of the project
/// * `Err(String)` - Error if no project folder is set
#[tauri::command]
pub async fn project_context_get_summary(
    state: State<'_, ProjectContextState>,
) -> Result<String, String> {
    // Get folder and name first, then release the lock
    let (folder, name) = {
        let ctx = state.context.read().await;

        if !ctx.is_valid || ctx.folder.is_none() {
            return Err("No project folder is set.".to_string());
        }

        let folder = ctx.folder.clone().unwrap();
        let name = ctx.name.clone().unwrap_or_else(|| "Unknown".to_string());
        (folder, name)
    };

    // Get file listing for summary (lock is released)
    let files: Vec<ProjectFileInfo> =
        project_context_list_files_internal(&state, Some(2), Some(false))
            .await
            .unwrap_or_default();

    // Count file types
    let mut file_counts: std::collections::HashMap<String, u32> = std::collections::HashMap::new();
    let mut dir_count = 0;
    let mut file_count = 0;

    for file in &files {
        if file.is_directory {
            dir_count += 1;
        } else {
            file_count += 1;
            if let Some(ref ext) = file.extension {
                *file_counts.entry(ext.clone()).or_insert(0) += 1;
            }
        }
    }

    // Build summary
    let mut summary = format!(
        "## Project Context\n\nProject: {}\nPath: {}\n\nContents: {} files, {} directories\n",
        name, folder, file_count, dir_count
    );

    // Add file type breakdown
    if !file_counts.is_empty() {
        summary.push_str("\nFile types:\n");
        let mut sorted_types: Vec<_> = file_counts.iter().collect();
        sorted_types.sort_by(|a, b| b.1.cmp(a.1)); // Sort by count descending
        for (ext, count) in sorted_types.iter().take(10) {
            summary.push_str(&format!("- .{}: {} files\n", ext, count));
        }
    }

    // List top-level items
    let top_level: Vec<_> = files
        .iter()
        .filter(|f| !f.path.contains('/') && !f.path.contains('\\'))
        .collect();

    if !top_level.is_empty() {
        summary.push_str("\nTop-level items:\n");
        for item in top_level.iter().take(20) {
            let icon = if item.is_directory { "[DIR]" } else { "[FILE]" };
            summary.push_str(&format!("- {} {}\n", icon, item.name));
        }
        if top_level.len() > 20 {
            summary.push_str(&format!("- ... and {} more\n", top_level.len() - 20));
        }
    }

    Ok(summary)
}

// Internal helper function for listing files
async fn project_context_list_files_internal(
    state: &State<'_, ProjectContextState>,
    max_depth: Option<u32>,
    include_hidden: Option<bool>,
) -> Result<Vec<ProjectFileInfo>, String> {
    let ctx = state.context.read().await;

    if !ctx.is_valid || ctx.folder.is_none() {
        return Err("No project folder is set.".to_string());
    }

    let folder = ctx.folder.as_ref().unwrap().clone();
    let max_depth = max_depth.unwrap_or(1);
    let include_hidden = include_hidden.unwrap_or(false);

    drop(ctx); // Release the lock

    let mut files = Vec::new();
    list_files_recursive(&folder, &folder, 0, max_depth, include_hidden, &mut files)?;

    Ok(files)
}

/// Synchronous helper function for listing files in a project folder.
/// This is used by the chat module to include project structure in the system prompt.
/// It avoids async issues when called from within an async context.
pub fn project_context_list_files_internal_sync(
    folder: &str,
    max_depth: u32,
    include_hidden: bool,
) -> Result<Vec<ProjectFileInfo>, String> {
    let mut files = Vec::new();
    list_files_recursive(folder, folder, 0, max_depth, include_hidden, &mut files)?;
    Ok(files)
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::fs;
    use tempfile::tempdir;

    #[tokio::test]
    async fn test_project_context_state_new() {
        let state = ProjectContextState::new();
        let ctx = state.get_context().await;
        assert!(ctx.folder.is_none());
        assert!(ctx.name.is_none());
        assert!(!ctx.is_valid);
    }

    #[tokio::test]
    async fn test_set_valid_folder() {
        let temp_dir = tempdir().unwrap();
        let path = temp_dir.path().to_str().unwrap().to_string();

        let state = ProjectContextState::new();
        {
            let mut ctx = state.context.write().await;
            ctx.folder = Some(path.clone());
            ctx.name = temp_dir
                .path()
                .file_name()
                .and_then(|n| n.to_str())
                .map(|s| s.to_string());
            ctx.is_valid = true;
        }

        let ctx = state.get_context().await;
        assert!(ctx.folder.is_some());
        assert!(ctx.is_valid);
    }

    #[tokio::test]
    async fn test_get_folder() {
        let temp_dir = tempdir().unwrap();
        let path = temp_dir.path().to_str().unwrap().to_string();

        let state = ProjectContextState::new();
        {
            let mut ctx = state.context.write().await;
            ctx.folder = Some(path.clone());
            ctx.is_valid = true;
        }

        let folder = state.get_folder().await;
        assert_eq!(folder, Some(path));
    }

    #[tokio::test]
    async fn test_get_folder_when_invalid() {
        let state = ProjectContextState::new();
        let folder = state.get_folder().await;
        assert!(folder.is_none());
    }

    #[test]
    fn test_list_files_recursive() {
        let temp_dir = tempdir().unwrap();
        let base = temp_dir.path();

        // Create some test files
        fs::write(base.join("file1.txt"), "test").unwrap();
        fs::write(base.join("file2.rs"), "test").unwrap();
        fs::create_dir(base.join("subdir")).unwrap();
        fs::write(base.join("subdir/nested.txt"), "test").unwrap();

        let base_str = base.to_str().unwrap();
        let mut files = Vec::new();
        list_files_recursive(base_str, base_str, 0, 2, false, &mut files).unwrap();

        assert!(files.len() >= 3);
        assert!(files.iter().any(|f| f.name == "file1.txt"));
        assert!(files.iter().any(|f| f.name == "subdir" && f.is_directory));
    }
}
