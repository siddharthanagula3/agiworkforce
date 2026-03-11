use crate::data::config_hierarchy::{ConfigHierarchy, ProjectConfig};
use std::path::Path;

/// Get the fully resolved configuration by merging project > global > defaults.
///
/// If `projectRoot` is provided, the project-level config at
/// `{projectRoot}/.agiworkforce/config.json` is consulted first.
#[tauri::command]
pub async fn get_resolved_config(
    project_root: Option<String>,
) -> Result<ProjectConfig, String> {
    let hierarchy = ConfigHierarchy::load(
        project_root.as_deref().map(Path::new),
    );
    Ok(hierarchy.resolved())
}

/// Save configuration at the project level.
///
/// Writes to `{projectRoot}/.agiworkforce/config.json`.
#[tauri::command]
pub async fn save_project_config(
    config: ProjectConfig,
    project_root: String,
) -> Result<(), String> {
    ConfigHierarchy::save_project(&config, Path::new(&project_root))
        .map_err(|e| format!("Failed to save project config: {}", e))
}

/// Save configuration at the global level.
///
/// Writes to `~/.agiworkforce/config.json`.
#[tauri::command]
pub async fn save_global_config(config: ProjectConfig) -> Result<(), String> {
    ConfigHierarchy::save_global(&config)
        .map_err(|e| format!("Failed to save global config: {}", e))
}
