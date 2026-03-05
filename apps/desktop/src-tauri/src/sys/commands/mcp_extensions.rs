//! MCP Extensions Tauri Commands
//!
//! Provides Tauri commands for managing MCP desktop extensions.
//! Enables one-click installation, configuration, and lifecycle management.

use crate::core::mcp::extensions::{
    ExtensionInfo, ExtensionInstaller, ExtensionManager, ExtensionPackage, ExtensionRepository,
    ExtensionStatus,
};
use crate::core::mcp::McpClient;
use rusqlite::Connection;
use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use std::sync::Arc;
use tauri::{AppHandle, Emitter, State};

/// State for the MCP Extensions system
pub struct McpExtensionsState {
    /// Extension manager for lifecycle operations
    pub manager: Arc<ExtensionManager>,

    /// Extension repository for persistence
    pub repository: Arc<ExtensionRepository>,

    /// Extension installer
    pub installer: Arc<ExtensionInstaller>,
}

impl McpExtensionsState {
    /// Create a new extensions state
    pub fn new(
        db_conn: Arc<std::sync::Mutex<Connection>>,
        mcp_client: Arc<McpClient>,
    ) -> Result<Self, String> {
        let repository = Arc::new(
            ExtensionRepository::new(db_conn)
                .map_err(|e| format!("Failed to create repository: {}", e))?,
        );

        let installer = Arc::new(
            ExtensionInstaller::new().map_err(|e| format!("Failed to create installer: {}", e))?,
        );

        let manager = Arc::new(ExtensionManager::new(
            repository.clone(),
            installer.clone(),
            mcp_client,
        ));

        Ok(Self {
            manager,
            repository,
            installer,
        })
    }

    /// Create a degraded extensions state backed by in-memory database and temp directory.
    /// Extension commands will return meaningful errors instead of panicking on missing state.
    pub fn new_degraded(mcp_client: Arc<McpClient>) -> Self {
        let conn =
            Connection::open_in_memory().expect("in-memory SQLite connection should never fail");
        let db = Arc::new(std::sync::Mutex::new(conn));
        // Repository with in-memory db — table creation may fail but that's acceptable in degraded mode
        let repository = Arc::new(ExtensionRepository::new(db).unwrap_or_else(|_| {
            // Fallback: create repo with a fresh in-memory connection that has the tables
            let conn2 = Connection::open_in_memory()
                .expect("in-memory SQLite connection should never fail");
            let db2 = Arc::new(std::sync::Mutex::new(conn2));
            ExtensionRepository::new(db2).expect("in-memory ExtensionRepository should never fail")
        }));
        let installer = Arc::new(ExtensionInstaller::with_dir(
            std::env::temp_dir().join("agiworkforce_extensions_degraded"),
        ));
        let manager = Arc::new(ExtensionManager::new(
            repository.clone(),
            installer.clone(),
            mcp_client,
        ));
        Self {
            manager,
            repository,
            installer,
        }
    }
}

/// Response type for extension operations
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ExtensionResponse<T> {
    pub success: bool,
    pub data: Option<T>,
    pub error: Option<String>,
}

impl<T> ExtensionResponse<T> {
    pub fn success(data: T) -> Self {
        Self {
            success: true,
            data: Some(data),
            error: None,
        }
    }

    pub fn error(message: impl Into<String>) -> Self {
        Self {
            success: false,
            data: None,
            error: Some(message.into()),
        }
    }
}

// ============================================================================
// Helper Functions
// ============================================================================

fn emit_extension_event(app: &AppHandle, event: &str, payload: impl Serialize + Clone) {
    let _ = app.emit(&format!("extension:{}", event), payload);
}

// ============================================================================
// Tauri Commands
// ============================================================================

/// List all installed extensions
#[tauri::command]
pub async fn extension_list(
    state: State<'_, McpExtensionsState>,
) -> Result<Vec<ExtensionInfo>, String> {
    tracing::info!("Listing installed extensions");

    state
        .manager
        .list_extensions()
        .map_err(|e| format!("Failed to list extensions: {}", e))
}

/// Get details for a specific extension
#[tauri::command]
pub async fn extension_get(
    state: State<'_, McpExtensionsState>,
    extension_id: String,
) -> Result<ExtensionInfo, String> {
    tracing::info!("Getting extension: {}", extension_id);

    state
        .manager
        .get_extension(&extension_id)
        .map_err(|e| format!("Failed to get extension: {}", e))
}

/// Install an extension from a .agiext file
#[tauri::command]
pub async fn extension_install(
    state: State<'_, McpExtensionsState>,
    app: AppHandle,
    file_path: String,
) -> Result<ExtensionInfo, String> {
    tracing::info!("Installing extension from: {}", file_path);

    // Emit start event
    emit_extension_event(
        &app,
        "install_started",
        serde_json::json!({
            "filePath": file_path,
            "timestamp": chrono::Utc::now().timestamp()
        }),
    );

    // Create installer with progress callback
    let app_clone = app.clone();
    let installer_with_progress = ExtensionInstaller::new()
        .map_err(|e| format!("Failed to create installer: {}", e))?
        .with_progress_callback(Box::new(move |progress| {
            emit_extension_event(&app_clone, "install_progress", &progress);
        }));

    // Install the extension
    let result = installer_with_progress
        .install_from_file(&file_path, &state.repository)
        .await;

    match result {
        Ok(install_result) => {
            // Get full extension info
            let info = state
                .manager
                .get_extension(&install_result.extension_id)
                .map_err(|e| format!("Failed to get installed extension: {}", e))?;

            emit_extension_event(
                &app,
                "install_completed",
                serde_json::json!({
                    "extensionId": info.id,
                    "name": info.name,
                    "version": info.version,
                    "timestamp": chrono::Utc::now().timestamp()
                }),
            );

            tracing::info!("Extension {} installed successfully", info.id);
            Ok(info)
        }
        Err(e) => {
            emit_extension_event(
                &app,
                "install_failed",
                serde_json::json!({
                    "filePath": file_path,
                    "error": e.to_string(),
                    "timestamp": chrono::Utc::now().timestamp()
                }),
            );

            tracing::error!("Extension installation failed: {}", e);
            Err(format!("Installation failed: {}", e))
        }
    }
}

/// Uninstall an extension
#[tauri::command]
pub async fn extension_uninstall(
    state: State<'_, McpExtensionsState>,
    app: AppHandle,
    extension_id: String,
) -> Result<String, String> {
    tracing::info!("Uninstalling extension: {}", extension_id);

    state
        .manager
        .uninstall_extension(&extension_id)
        .await
        .map_err(|e| format!("Failed to uninstall extension: {}", e))?;

    emit_extension_event(
        &app,
        "uninstalled",
        serde_json::json!({
            "extensionId": extension_id,
            "timestamp": chrono::Utc::now().timestamp()
        }),
    );

    Ok(format!(
        "Extension {} uninstalled successfully",
        extension_id
    ))
}

/// Enable an extension (start its MCP server)
#[tauri::command]
pub async fn extension_enable(
    state: State<'_, McpExtensionsState>,
    app: AppHandle,
    extension_id: String,
) -> Result<String, String> {
    tracing::info!("Enabling extension: {}", extension_id);

    state
        .manager
        .enable_extension(&extension_id)
        .await
        .map_err(|e| format!("Failed to enable extension: {}", e))?;

    emit_extension_event(
        &app,
        "enabled",
        serde_json::json!({
            "extensionId": extension_id,
            "timestamp": chrono::Utc::now().timestamp()
        }),
    );

    Ok(format!("Extension {} enabled", extension_id))
}

/// Disable an extension (stop its MCP server)
#[tauri::command]
pub async fn extension_disable(
    state: State<'_, McpExtensionsState>,
    app: AppHandle,
    extension_id: String,
) -> Result<String, String> {
    tracing::info!("Disabling extension: {}", extension_id);

    state
        .manager
        .disable_extension(&extension_id)
        .await
        .map_err(|e| format!("Failed to disable extension: {}", e))?;

    emit_extension_event(
        &app,
        "disabled",
        serde_json::json!({
            "extensionId": extension_id,
            "timestamp": chrono::Utc::now().timestamp()
        }),
    );

    Ok(format!("Extension {} disabled", extension_id))
}

/// Get extension configuration
#[tauri::command]
pub async fn extension_get_config(
    state: State<'_, McpExtensionsState>,
    extension_id: String,
) -> Result<HashMap<String, serde_json::Value>, String> {
    tracing::info!("Getting config for extension: {}", extension_id);

    state
        .manager
        .get_config(&extension_id)
        .map_err(|e| format!("Failed to get config: {}", e))
}

/// Set extension configuration
#[tauri::command]
pub async fn extension_set_config(
    state: State<'_, McpExtensionsState>,
    app: AppHandle,
    extension_id: String,
    config: HashMap<String, serde_json::Value>,
) -> Result<String, String> {
    tracing::info!("Setting config for extension: {}", extension_id);

    state
        .manager
        .set_config(&extension_id, config)
        .map_err(|e| format!("Failed to set config: {}", e))?;

    emit_extension_event(
        &app,
        "config_updated",
        serde_json::json!({
            "extensionId": extension_id,
            "timestamp": chrono::Utc::now().timestamp()
        }),
    );

    Ok(format!("Configuration updated for {}", extension_id))
}

/// Validate an extension package without installing
#[tauri::command]
pub async fn extension_validate(file_path: String) -> Result<ExtensionPackageInfo, String> {
    tracing::info!("Validating extension package: {}", file_path);

    let package = ExtensionPackage::from_file(&file_path)
        .map_err(|e| format!("Package validation failed: {}", e))?;

    Ok(ExtensionPackageInfo {
        id: package.manifest.id.clone(),
        name: package.manifest.name.clone(),
        version: package.manifest.version.clone(),
        description: package.manifest.description.clone(),
        author: package.manifest.author.clone(),
        tool_count: package.manifest.tools.len(),
        tools: package
            .manifest
            .tools
            .iter()
            .map(|t| t.name.clone())
            .collect(),
        requires_config: package.manifest.config_schema.is_some(),
        file_count: package.files.len(),
        total_size: package.total_size,
        has_dependencies: package.has_node_dependencies(),
    })
}

/// Information about a validated extension package
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ExtensionPackageInfo {
    pub id: String,
    pub name: String,
    pub version: String,
    pub description: String,
    pub author: String,
    pub tool_count: usize,
    pub tools: Vec<String>,
    pub requires_config: bool,
    pub file_count: usize,
    pub total_size: u64,
    pub has_dependencies: bool,
}

/// Get extensions by status
#[tauri::command]
pub async fn extension_list_by_status(
    state: State<'_, McpExtensionsState>,
    status: String,
) -> Result<Vec<ExtensionInfo>, String> {
    let status = match status.to_lowercase().as_str() {
        "disabled" => ExtensionStatus::Disabled,
        "enabled" => ExtensionStatus::Enabled,
        "running" => ExtensionStatus::Running,
        "error" => ExtensionStatus::Error,
        _ => return Err(format!("Unknown status: {}", status)),
    };

    let records = state
        .repository
        .list_by_status(status)
        .map_err(|e| format!("Failed to list extensions: {}", e))?;

    let mut extensions = Vec::with_capacity(records.len());
    for record in records {
        match state.manager.get_extension(&record.id) {
            Ok(info) => extensions.push(info),
            Err(e) => tracing::warn!("Failed to get extension {}: {}", record.id, e),
        }
    }

    Ok(extensions)
}

/// Start all enabled extensions
#[tauri::command]
pub async fn extension_start_all(state: State<'_, McpExtensionsState>) -> Result<String, String> {
    tracing::info!("Starting all enabled extensions");

    state
        .manager
        .start_enabled_extensions()
        .await
        .map_err(|e| format!("Failed to start extensions: {}", e))?;

    Ok("Started all enabled extensions".to_string())
}

/// Stop all running extensions
#[tauri::command]
pub async fn extension_stop_all(state: State<'_, McpExtensionsState>) -> Result<String, String> {
    tracing::info!("Stopping all running extensions");

    state
        .manager
        .stop_all_extensions()
        .await
        .map_err(|e| format!("Failed to stop extensions: {}", e))?;

    Ok("Stopped all running extensions".to_string())
}

/// Get the extensions directory path
#[tauri::command]
pub async fn extension_get_directory() -> Result<String, String> {
    ExtensionInstaller::default_extensions_dir()
        .map(|p| p.to_string_lossy().to_string())
        .map_err(|e| format!("Failed to get extensions directory: {}", e))
}

/// Open file dialog to select an extension package
#[tauri::command]
pub async fn extension_select_package(app: AppHandle) -> Result<Option<String>, String> {
    use tauri_plugin_dialog::DialogExt;

    let file_path = app
        .dialog()
        .file()
        .add_filter("AGI Workforce Extension", &["agiext"])
        .blocking_pick_file();

    // FilePath is an enum, convert to string
    Ok(file_path.map(|p| p.to_string()))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_extension_response_success() {
        let response: ExtensionResponse<String> = ExtensionResponse::success("test".to_string());
        assert!(response.success);
        assert_eq!(response.data, Some("test".to_string()));
        assert!(response.error.is_none());
    }

    #[test]
    fn test_extension_response_error() {
        let response: ExtensionResponse<String> = ExtensionResponse::error("failed");
        assert!(!response.success);
        assert!(response.data.is_none());
        assert_eq!(response.error, Some("failed".to_string()));
    }
}
