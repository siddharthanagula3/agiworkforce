//! Extension manager
//!
//! Provides high-level management of installed extensions including:
//! - Enabling/disabling extensions
//! - Starting/stopping extension servers
//! - Configuration management
//! - Update checking

use super::repository::{ExtensionRecord, ExtensionStatus};
use super::{
    ExtensionError, ExtensionInstaller, ExtensionManifest, ExtensionRepository, ExtensionResult,
    TransportType,
};
use crate::core::mcp::{McpClient, McpServerConfig};
use chrono::Utc;
use parking_lot::RwLock;
use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use std::path::PathBuf;
use std::sync::Arc;

/// Information about an installed extension
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ExtensionInfo {
    /// Extension ID
    pub id: String,

    /// Extension name
    pub name: String,

    /// Installed version
    pub version: String,

    /// Description
    pub description: String,

    /// Author
    pub author: String,

    /// Current status
    pub status: ExtensionStatus,

    /// Last error message
    pub last_error: Option<String>,

    /// Installation path
    pub install_path: PathBuf,

    /// Number of tools provided
    pub tool_count: usize,

    /// Tool names
    pub tools: Vec<String>,

    /// Whether configuration is required
    pub requires_config: bool,

    /// Whether configuration is complete
    pub config_complete: bool,

    /// Configuration schema (if any)
    pub config_schema: Option<serde_json::Value>,

    /// Category
    pub category: Option<String>,

    /// Icon path (if available)
    pub icon_path: Option<PathBuf>,

    /// Installation timestamp
    pub installed_at: String,

    /// Last updated timestamp
    pub updated_at: String,

    /// Use count
    pub use_count: u64,
}

/// Extension manager for lifecycle management
pub struct ExtensionManager {
    /// Extension repository for persistence
    repository: Arc<ExtensionRepository>,

    /// Extension installer
    installer: Arc<ExtensionInstaller>,

    /// MCP client for server management
    mcp_client: Arc<McpClient>,

    /// Currently running extension servers
    running_servers: Arc<RwLock<HashMap<String, ExtensionServerInfo>>>,
}

/// Information about a running extension server
#[derive(Debug, Clone)]
struct ExtensionServerInfo {
    /// Extension ID
    #[allow(dead_code)]
    extension_id: String,

    /// MCP server name (used for MCP client)
    server_name: String,

    /// Start time
    #[allow(dead_code)]
    started_at: chrono::DateTime<Utc>,
}

impl ExtensionManager {
    /// Create a new extension manager
    pub fn new(
        repository: Arc<ExtensionRepository>,
        installer: Arc<ExtensionInstaller>,
        mcp_client: Arc<McpClient>,
    ) -> Self {
        Self {
            repository,
            installer,
            mcp_client,
            running_servers: Arc::new(RwLock::new(HashMap::new())),
        }
    }

    /// List all installed extensions
    pub fn list_extensions(&self) -> ExtensionResult<Vec<ExtensionInfo>> {
        let records = self.repository.list_all()?;

        let mut extensions = Vec::with_capacity(records.len());
        for record in records {
            let info = self.record_to_info(record)?;
            extensions.push(info);
        }

        Ok(extensions)
    }

    /// Get information about a specific extension
    pub fn get_extension(&self, id: &str) -> ExtensionResult<ExtensionInfo> {
        let record = self
            .repository
            .get(id)?
            .ok_or_else(|| ExtensionError::NotFound(id.to_string()))?;

        self.record_to_info(record)
    }

    /// Enable an extension
    ///
    /// This starts the extension's MCP server and registers it with the MCP client.
    pub async fn enable_extension(&self, id: &str) -> ExtensionResult<()> {
        let record = self
            .repository
            .get(id)?
            .ok_or_else(|| ExtensionError::NotFound(id.to_string()))?;

        // Check if already enabled/running
        if record.status == ExtensionStatus::Enabled || record.status == ExtensionStatus::Running {
            return Ok(());
        }

        // Parse manifest
        let manifest: ExtensionManifest = serde_json::from_str(&record.manifest_json)?;

        // Check configuration
        if manifest.config_schema.is_some() {
            let config = self.repository.get_config(id)?;
            if !self.is_config_complete(&manifest, &config) {
                return Err(ExtensionError::InvalidConfiguration(
                    "Required configuration values are missing".to_string(),
                ));
            }
        }

        // Build MCP server configuration
        let server_config = self.build_server_config(&manifest, &record)?;

        // Connect to MCP
        let server_name = format!("ext-{}", id);
        self.mcp_client
            .connect_server(server_name.clone(), server_config)
            .await
            .map_err(|e| ExtensionError::StartFailed(e.to_string()))?;

        // Update status
        self.repository
            .update_status(id, ExtensionStatus::Running, None)?;
        self.repository.record_start(id)?;

        // Track running server
        {
            let mut running = self.running_servers.write();
            running.insert(
                id.to_string(),
                ExtensionServerInfo {
                    extension_id: id.to_string(),
                    server_name,
                    started_at: Utc::now(),
                },
            );
        }

        tracing::info!("Extension {} enabled and running", id);

        Ok(())
    }

    /// Disable an extension
    ///
    /// This stops the extension's MCP server.
    pub async fn disable_extension(&self, id: &str) -> ExtensionResult<()> {
        let record = self
            .repository
            .get(id)?
            .ok_or_else(|| ExtensionError::NotFound(id.to_string()))?;

        // Check if already disabled
        if record.status == ExtensionStatus::Disabled {
            return Ok(());
        }

        // Get server info
        let server_info = {
            let running = self.running_servers.read();
            running.get(id).cloned()
        };

        // Disconnect from MCP if running
        if let Some(info) = server_info {
            self.mcp_client
                .disconnect_server(&info.server_name)
                .await
                .map_err(|e| ExtensionError::StopFailed(e.to_string()))?;

            // Remove from running servers
            let mut running = self.running_servers.write();
            running.remove(id);
        }

        // Update status
        self.repository
            .update_status(id, ExtensionStatus::Disabled, None)?;

        tracing::info!("Extension {} disabled", id);

        Ok(())
    }

    /// Update extension configuration
    pub fn set_config(
        &self,
        id: &str,
        config: HashMap<String, serde_json::Value>,
    ) -> ExtensionResult<()> {
        // Validate extension exists
        let record = self
            .repository
            .get(id)?
            .ok_or_else(|| ExtensionError::NotFound(id.to_string()))?;

        // Parse manifest for validation
        let manifest: ExtensionManifest = serde_json::from_str(&record.manifest_json)?;

        // Validate configuration against schema
        if manifest.config_schema.is_some() {
            self.validate_config(&manifest, &config)?;
        }

        // Store configuration (sensitive values are encrypted by the repository)
        self.repository.update_config(id, &config)?;

        tracing::info!("Configuration updated for extension {}", id);

        Ok(())
    }

    /// Get extension configuration
    pub fn get_config(&self, id: &str) -> ExtensionResult<HashMap<String, serde_json::Value>> {
        self.repository.get_config(id)
    }

    /// Uninstall an extension
    pub async fn uninstall_extension(&self, id: &str) -> ExtensionResult<()> {
        // Disable first if running
        let record = self.repository.get(id)?;
        if let Some(ref record) = record {
            if record.status == ExtensionStatus::Running {
                self.disable_extension(id).await?;
            }
        }

        // Uninstall via installer
        self.installer.uninstall(id, &self.repository).await?;

        tracing::info!("Extension {} uninstalled", id);

        Ok(())
    }

    /// Install an extension from a file
    pub async fn install_from_file(&self, path: &str) -> ExtensionResult<ExtensionInfo> {
        let result = self
            .installer
            .install_from_file(path, &self.repository)
            .await?;

        self.get_extension(&result.extension_id)
    }

    /// Check for available updates
    pub fn check_updates(&self) -> ExtensionResult<Vec<UpdateInfo>> {
        // For now, we don't have a remote registry to check against
        // This would connect to a registry API to check versions
        Ok(Vec::new())
    }

    /// Convert a database record to extension info
    fn record_to_info(&self, record: ExtensionRecord) -> ExtensionResult<ExtensionInfo> {
        let manifest: ExtensionManifest = serde_json::from_str(&record.manifest_json)?;
        let config = self.repository.get_config(&record.id).unwrap_or_default();

        let requires_config = manifest.config_schema.is_some();
        let config_complete = self.is_config_complete(&manifest, &config);

        let icon_path = if record.install_path.join("icon.png").exists() {
            Some(record.install_path.join("icon.png"))
        } else {
            None
        };

        Ok(ExtensionInfo {
            id: record.id,
            name: record.name,
            version: record.version,
            description: record.description,
            author: record.author,
            status: record.status,
            last_error: record.last_error,
            install_path: record.install_path,
            tool_count: manifest.tools.len(),
            tools: manifest.tools.iter().map(|t| t.name.clone()).collect(),
            requires_config,
            config_complete,
            config_schema: manifest
                .config_schema
                .as_ref()
                .and_then(|s| serde_json::to_value(s).ok()),
            category: manifest.category,
            icon_path,
            installed_at: record.installed_at.to_rfc3339(),
            updated_at: record.updated_at.to_rfc3339(),
            use_count: record.use_count,
        })
    }

    /// Build MCP server configuration from manifest
    fn build_server_config(
        &self,
        manifest: &ExtensionManifest,
        record: &ExtensionRecord,
    ) -> ExtensionResult<McpServerConfig> {
        let config = self.repository.get_config(&record.id)?;

        // Build environment variables from configuration
        let mut env = manifest.env.clone();
        for (key, value) in &manifest.env {
            // Check if value is a config placeholder
            if value.starts_with("${") && value.ends_with("}") {
                let config_key = &value[2..value.len() - 1];
                if let Some(config_value) = config.get(config_key) {
                    if let Some(s) = config_value.as_str() {
                        env.insert(key.clone(), s.to_string());
                    }
                }
            }
        }

        // Add config values that map to environment variables
        if let Some(ref schema) = manifest.config_schema {
            for key in schema.properties.keys() {
                if let Some(config_value) = config.get(key) {
                    // Convert config key to env var format (uppercase with underscores)
                    let env_key = key.to_uppercase().replace('-', "_");
                    if let Some(s) = config_value.as_str() {
                        env.insert(env_key, s.to_string());
                    }
                }
            }
        }

        // Build command and args
        let (command, args) = match manifest.transport {
            TransportType::Stdio => {
                let command = manifest
                    .command
                    .clone()
                    .unwrap_or_else(|| "node".to_string());

                // Adjust paths to be relative to install directory
                let mut args: Vec<String> = manifest
                    .args
                    .iter()
                    .map(|arg| {
                        if arg.starts_with("server/")
                            || arg.ends_with(".js")
                            || arg.ends_with(".py")
                        {
                            record.install_path.join(arg).to_string_lossy().to_string()
                        } else {
                            arg.clone()
                        }
                    })
                    .collect();

                // If no args and it's a node project, add server/index.js
                if args.is_empty() && command == "node" {
                    args.push(
                        record
                            .install_path
                            .join("server/index.js")
                            .to_string_lossy()
                            .to_string(),
                    );
                }

                (command, args)
            }
            TransportType::Http => {
                // For HTTP transport, we don't need command/args
                // The server URL comes from http_config
                ("".to_string(), vec![])
            }
        };

        // Build transport config for HTTP
        let transport = match manifest.transport {
            TransportType::Http => {
                if let Some(ref http_config) = manifest.http_config {
                    let bearer_token = http_config
                        .bearer_token_config_key
                        .as_ref()
                        .and_then(|key| config.get(key))
                        .and_then(|v| v.as_str())
                        .map(|s| s.to_string());

                    Some(crate::core::mcp::TransportConfig::Http(
                        crate::core::mcp::HttpSseConfig {
                            url: http_config.url.clone(),
                            api_key: None,
                            bearer_token,
                            headers: std::collections::HashMap::new(),
                            timeout_secs: http_config.timeout_secs as u64,
                            verify_ssl: true,
                        },
                    ))
                } else {
                    None
                }
            }
            TransportType::Stdio => None,
        };

        Ok(McpServerConfig {
            command,
            args,
            env,
            enabled: true,
            transport,
        })
    }

    /// Check if configuration is complete
    fn is_config_complete(
        &self,
        manifest: &ExtensionManifest,
        config: &HashMap<String, serde_json::Value>,
    ) -> bool {
        if let Some(ref schema) = manifest.config_schema {
            // Check all required properties
            for required_key in &schema.required {
                if !config.contains_key(required_key) {
                    return false;
                }
                // Also check for empty strings
                if let Some(value) = config.get(required_key) {
                    if let Some(s) = value.as_str() {
                        if s.is_empty() {
                            return false;
                        }
                    }
                }
            }

            // Check properties marked as required
            for (key, property_def) in &schema.properties {
                if property_def.required && !config.contains_key(key) {
                    return false;
                }
            }
        }

        true
    }

    /// Validate configuration against schema
    fn validate_config(
        &self,
        manifest: &ExtensionManifest,
        config: &HashMap<String, serde_json::Value>,
    ) -> ExtensionResult<()> {
        if let Some(ref schema) = manifest.config_schema {
            // Check required fields
            for required_key in &schema.required {
                if !config.contains_key(required_key) {
                    return Err(ExtensionError::InvalidConfiguration(format!(
                        "Missing required configuration: {}",
                        required_key
                    )));
                }
            }

            // Validate property types
            for (key, value) in config {
                if let Some(property) = schema.properties.get(key) {
                    let valid = match property.r#type.as_str() {
                        "string" => value.is_string(),
                        "number" => value.is_number(),
                        "boolean" => value.is_boolean(),
                        "array" => value.is_array(),
                        "object" => value.is_object(),
                        _ => true,
                    };

                    if !valid {
                        return Err(ExtensionError::InvalidConfiguration(format!(
                            "Invalid type for {}: expected {}",
                            key, property.r#type
                        )));
                    }
                }
            }
        }

        Ok(())
    }

    /// Get list of enabled extensions that should auto-start
    pub fn get_auto_start_extensions(&self) -> ExtensionResult<Vec<String>> {
        let records = self.repository.list_by_status(ExtensionStatus::Enabled)?;
        Ok(records.into_iter().map(|r| r.id).collect())
    }

    /// Start all enabled extensions
    pub async fn start_enabled_extensions(&self) -> ExtensionResult<()> {
        let extension_ids = self.get_auto_start_extensions()?;

        for id in extension_ids {
            if let Err(e) = self.enable_extension(&id).await {
                tracing::error!("Failed to start extension {}: {}", id, e);
                // Update status to error but continue with other extensions
                let _ = self.repository.update_status(
                    &id,
                    ExtensionStatus::Error,
                    Some(&e.to_string()),
                );
            }
        }

        Ok(())
    }

    /// Stop all running extensions
    pub async fn stop_all_extensions(&self) -> ExtensionResult<()> {
        let running_ids: Vec<String> = {
            let running = self.running_servers.read();
            running.keys().cloned().collect()
        };

        for id in running_ids {
            if let Err(e) = self.disable_extension(&id).await {
                tracing::error!("Failed to stop extension {}: {}", id, e);
            }
        }

        Ok(())
    }
}

/// Information about an available update
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct UpdateInfo {
    /// Extension ID
    pub extension_id: String,

    /// Current version
    pub current_version: String,

    /// Available version
    pub available_version: String,

    /// Changelog
    pub changelog: Option<String>,
}

#[cfg(test)]
mod tests {
    use super::*;
    use rusqlite::Connection;
    use std::sync::Mutex;

    fn create_test_manager() -> ExtensionManager {
        let conn = Connection::open_in_memory().unwrap();
        let repository = Arc::new(ExtensionRepository::new(Arc::new(Mutex::new(conn))).unwrap());
        let installer = Arc::new(ExtensionInstaller::default());
        let mcp_client = Arc::new(McpClient::new());

        ExtensionManager::new(repository, installer, mcp_client)
    }

    #[test]
    fn test_list_empty() {
        let manager = create_test_manager();
        let extensions = manager.list_extensions().unwrap();
        assert!(extensions.is_empty());
    }

    #[test]
    fn test_get_nonexistent() {
        let manager = create_test_manager();
        let result = manager.get_extension("nonexistent");
        assert!(matches!(result, Err(ExtensionError::NotFound(_))));
    }
}
