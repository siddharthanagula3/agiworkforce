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
use crate::sys::security::encryption::{decrypt_secret, encrypt_secret, EncryptedSecret};
use crate::sys::security::machine_key::{self, KeyPurpose};
use parking_lot::RwLock;
use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use std::path::PathBuf;
use std::sync::Arc;

/// Prefix added to encrypted config values to distinguish them from plaintext.
const ENCRYPTED_VALUE_PREFIX: &str = "enc:v1:";

/// The variable an extension's launch carries a hash of its code in: the
/// package it was installed from and the files in its install folder that
/// the launch runs, as they are on disk. The approval of a launch covers its
/// environment, so replacing the package or one of those files makes it a
/// launch nobody has approved yet.
const CODE_DIGEST_VARIABLE: &str = "AGI_EXTENSION_FILES_SHA256";

/// One hash over the package an extension came from and the launch files in
/// its install folder. A file that cannot be read is hashed as absent, so
/// one that disappears or appears changes the result.
fn code_digest(package_hash: &str, launch_files: &[PathBuf]) -> String {
    use sha2::{Digest, Sha256};

    let mut hasher = Sha256::new();
    hasher.update(package_hash.as_bytes());
    for file in launch_files {
        hasher.update([0]);
        hasher.update(file.to_string_lossy().as_bytes());
        match std::fs::read(file) {
            Ok(content) => {
                hasher.update([1]);
                hasher.update((content.len() as u64).to_le_bytes());
                hasher.update(&content);
            }
            Err(_) => hasher.update([2]),
        }
    }
    hex::encode(hasher.finalize())
}

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

    /// The names of the configuration values kept as secrets. Their values
    /// are never sent to the page.
    pub stored_secrets: Vec<String>,

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
    /// MCP server name (used for MCP client)
    server_name: String,
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
        if self.is_running(id) {
            return Ok(());
        }
        self.start_extension(id, None).await
    }

    /// Enable an extension the user has just approved in the native dialog.
    /// The approval is handed in because one that holds for a single start
    /// leaves nothing on record to find.
    pub async fn enable_approved_extension(
        &self,
        id: &str,
        approved: crate::core::mcp::ApprovedLaunch,
    ) -> ExtensionResult<()> {
        if self.is_running(id) {
            return Ok(());
        }
        self.start_extension(id, Some(approved)).await
    }

    /// The server an extension would start, by name and launch, for the
    /// caller that asks the user to approve it before enabling it.
    pub fn launch_of(&self, id: &str) -> ExtensionResult<(String, McpServerConfig)> {
        let record = self
            .repository
            .get(id)?
            .ok_or_else(|| ExtensionError::NotFound(id.to_string()))?;
        let manifest: ExtensionManifest = serde_json::from_str(&record.manifest_json)?;
        Ok((
            format!("ext-{}", id),
            self.build_server_config(&manifest, &record)?,
        ))
    }

    /// Whether this process has the extension's server connected. The stored
    /// status alone cannot say: it still reads `Running` after a restart.
    fn is_running(&self, id: &str) -> bool {
        self.running_servers.read().contains_key(id)
    }

    /// The MCP server names of the extensions this process started. A reload
    /// of the configured servers must leave these connected: they are not in
    /// the configuration it reloads.
    pub fn running_server_names(&self) -> Vec<String> {
        self.running_servers
            .read()
            .values()
            .map(|info| info.server_name.clone())
            .collect()
    }

    async fn start_extension(
        &self,
        id: &str,
        approved: Option<crate::core::mcp::ApprovedLaunch>,
    ) -> ExtensionResult<()> {
        let record = self
            .repository
            .get(id)?
            .ok_or_else(|| ExtensionError::NotFound(id.to_string()))?;

        // Parse manifest
        let manifest: ExtensionManifest = serde_json::from_str(&record.manifest_json)?;

        // Check configuration (uses decrypted values for completeness check)
        if manifest.config_schema.is_some() {
            let config = self.get_config(id)?;
            if !self.is_config_complete(&manifest, &config) {
                return Err(ExtensionError::InvalidConfiguration(
                    "Required configuration values are missing".to_string(),
                ));
            }
        }

        // Build MCP server configuration
        let server_config = self.build_server_config(&manifest, &record)?;

        // An extension's server starts only as the launch the user approved:
        // at app start nobody is there to ask, and enabling one asks first.
        let server_name = format!("ext-{}", id);
        let approved = match approved {
            Some(approved) => approved,
            None => crate::core::mcp::ApprovedLaunch::require(&server_name, &server_config)
                .map_err(ExtensionError::StartFailed)?,
        };
        self.mcp_client
            .connect_server(server_name.clone(), server_config, approved)
            .await
            .map_err(|e| ExtensionError::StartFailed(e.to_string()))?;

        // Update status
        self.repository
            .update_status(id, ExtensionStatus::Running, None)?;
        self.repository.record_start(id)?;

        // Track running server
        {
            let mut running = self.running_servers.write();
            running.insert(id.to_string(), ExtensionServerInfo { server_name });
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

        // The page is never given a stored secret, so it has none to send
        // back: one it left out is kept as it is, and one it sent replaces
        // what was stored.
        let mut config = config;
        let sensitive_keys = Self::sensitive_keys(&manifest);
        for (key, value) in self.get_config(id)? {
            if !config.contains_key(&key) && Self::holds_secret(&sensitive_keys, &key, &value) {
                config.insert(key, value);
            }
        }

        // Validate configuration against schema
        if manifest.config_schema.is_some() {
            self.validate_config(&manifest, &config)?;
        }

        // SECURITY: Encrypt sensitive config values before storing.
        // Values marked as `sensitive: true` in the manifest config schema (API keys,
        // tokens, passwords) are encrypted using AES-256-GCM with a machine-derived key
        // before being persisted to the SQLite `config_json` column, and never fall
        // back to plaintext if encryption fails.
        let config_to_store = Self::encrypt_sensitive_values(&manifest, config)?;

        // Store configuration
        self.repository.update_config(id, &config_to_store)?;

        tracing::info!("Configuration updated for extension {}", id);

        Ok(())
    }

    /// Get extension configuration
    ///
    /// Sensitive values are decrypted transparently before being returned.
    /// Legacy plaintext sensitive values are automatically migrated to encrypted
    /// storage on first access.
    pub fn get_config(&self, id: &str) -> ExtensionResult<HashMap<String, serde_json::Value>> {
        let record = self
            .repository
            .get(id)?
            .ok_or_else(|| ExtensionError::NotFound(id.to_string()))?;

        let raw_config = match record.config_json {
            Some(json) => {
                let config: HashMap<String, serde_json::Value> = serde_json::from_str(&json)?;
                config
            }
            None => return Ok(HashMap::new()),
        };

        // Parse manifest to identify sensitive fields
        let manifest: ExtensionManifest = serde_json::from_str(&record.manifest_json)?;

        // Detect legacy plaintext sensitive values and
        // re-encrypt them transparently on read.
        if Self::has_plaintext_sensitive_values(&manifest, &raw_config) {
            tracing::warn!(
                "Extension '{}' has plaintext sensitive config values \
                 - migrating to encrypted storage",
                id
            );
            match Self::encrypt_sensitive_values(&manifest, raw_config.clone()) {
                Ok(encrypted_config) => {
                    if let Err(e) = self.repository.update_config(id, &encrypted_config) {
                        tracing::error!(
                            "Failed to migrate plaintext config for extension '{}': {}",
                            id,
                            e
                        );
                    }
                    return Ok(Self::decrypt_sensitive_values(&manifest, encrypted_config));
                }
                Err(e) => {
                    tracing::error!(
                        "Failed to encrypt plaintext config for extension '{}': {}",
                        id,
                        e
                    );
                }
            }
        }

        Ok(Self::decrypt_sensitive_values(&manifest, raw_config))
    }

    /// Whether a configuration entry is kept as a secret: the same rule
    /// [`Self::encrypt_sensitive_values`] encrypts by, and a value that is
    /// still encrypted because it could not be decrypted.
    fn holds_secret(
        sensitive_keys: &std::collections::HashSet<String>,
        key: &str,
        value: &serde_json::Value,
    ) -> bool {
        sensitive_keys.contains(key)
            || value.as_str().is_some_and(|text| {
                text.starts_with(ENCRYPTED_VALUE_PREFIX) || Self::looks_like_api_key(text)
            })
    }

    /// A configuration split into what the page may be given and the names,
    /// in order, of the secrets held back.
    fn apart_from_secrets(
        manifest: &ExtensionManifest,
        config: HashMap<String, serde_json::Value>,
    ) -> (HashMap<String, serde_json::Value>, Vec<String>) {
        let sensitive_keys = Self::sensitive_keys(manifest);
        let mut shown = HashMap::new();
        let mut secrets = Vec::new();
        for (key, value) in config {
            if Self::holds_secret(&sensitive_keys, &key, &value) {
                secrets.push(key);
            } else {
                shown.insert(key, value);
            }
        }
        secrets.sort();
        (shown, secrets)
    }

    /// The configuration as the page is given it: every value but the
    /// secrets. The page renders model output, so a secret it held would be
    /// one a script in it could read; [`ExtensionInfo::stored_secrets`]
    /// names the ones that exist.
    pub fn shown_config(&self, id: &str) -> ExtensionResult<HashMap<String, serde_json::Value>> {
        let record = self
            .repository
            .get(id)?
            .ok_or_else(|| ExtensionError::NotFound(id.to_string()))?;
        let manifest: ExtensionManifest = serde_json::from_str(&record.manifest_json)?;
        let (shown, _) = Self::apart_from_secrets(&manifest, self.get_config(id)?);
        Ok(shown)
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

    /// Convert a database record to extension info
    fn record_to_info(&self, record: ExtensionRecord) -> ExtensionResult<ExtensionInfo> {
        let manifest: ExtensionManifest = serde_json::from_str(&record.manifest_json)?;
        let config = self.get_config(&record.id).unwrap_or_default();

        let requires_config = manifest.config_schema.is_some();
        let config_complete = self.is_config_complete(&manifest, &config);
        let (_, stored_secrets) = Self::apart_from_secrets(&manifest, config);

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
            stored_secrets,
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
        // Use self.get_config() instead of repository.get_config() so that
        // encrypted sensitive values are decrypted before being injected into
        // environment variables for the extension process.
        let config = self.get_config(&record.id)?;

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
                let mut launch_files = Vec::new();
                let mut args: Vec<String> = manifest
                    .args
                    .iter()
                    .map(|arg| {
                        if arg.starts_with("server/")
                            || arg.ends_with(".js")
                            || arg.ends_with(".py")
                        {
                            let file = record.install_path.join(arg);
                            let arg = file.to_string_lossy().to_string();
                            launch_files.push(file);
                            arg
                        } else {
                            arg.clone()
                        }
                    })
                    .collect();

                // If no args and it's a node project, add server/index.js
                if args.is_empty() && command == "node" {
                    let file = record.install_path.join("server/index.js");
                    args.push(file.to_string_lossy().to_string());
                    launch_files.push(file);
                }

                env.insert(
                    CODE_DIGEST_VARIABLE.to_string(),
                    code_digest(&record.package_hash, &launch_files),
                );

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

                    Some(crate::core::mcp::TransportConfig::Http(Box::new(
                        crate::core::mcp::HttpSseConfig {
                            url: http_config.url.clone(),
                            api_key: None,
                            bearer_token,
                            headers: std::collections::HashMap::new(),
                            timeout_secs: http_config.timeout_secs as u64,
                            verify_ssl: true,
                            ..Default::default()
                        },
                    )))
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
            allow_local_network: false,
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

    /// Derive the encryption key used for extension config secrets.
    fn config_encryption_key() -> Vec<u8> {
        machine_key::derive_key(KeyPurpose::ApiKeys)
    }

    /// Returns the set of config keys marked as `sensitive` in the manifest.
    fn sensitive_keys(manifest: &ExtensionManifest) -> std::collections::HashSet<String> {
        let mut keys = std::collections::HashSet::new();
        if let Some(ref schema) = manifest.config_schema {
            for (key, property) in &schema.properties {
                if property.sensitive {
                    keys.insert(key.clone());
                }
            }
        }
        keys
    }

    /// Returns true if any sensitive config values are stored in plaintext
    /// (not prefixed with `ENCRYPTED_VALUE_PREFIX`). Used to trigger the
    /// re-encryption on read.
    fn has_plaintext_sensitive_values(
        manifest: &ExtensionManifest,
        config: &HashMap<String, serde_json::Value>,
    ) -> bool {
        let sensitive_keys = Self::sensitive_keys(manifest);
        for (key, value) in config {
            if let Some(s) = value.as_str() {
                if s.starts_with(ENCRYPTED_VALUE_PREFIX) {
                    continue;
                }
                if sensitive_keys.contains(key) || Self::looks_like_api_key(s) {
                    return true;
                }
            }
        }
        false
    }

    /// Returns true if a plaintext string value looks like an API key.
    fn looks_like_api_key(value: &str) -> bool {
        let prefixes = [
            "sk-", "pk-", "sk_", "pk_", "api-", "api_", "token-", "token_", "secret-", "secret_",
            "key-", "key_", "bearer ", "ghp_", "gho_", "ghs_", "ghr_", "glpat-", "xoxb-", "xoxp-",
            "xapp-", "sl.", "eyj",
        ];
        let lower = value.to_lowercase();
        prefixes.iter().any(|p| lower.starts_with(p))
    }

    /// Encrypt sensitive config values before persistence.
    ///
    /// Values for keys marked `sensitive: true` in the manifest schema (or whose
    /// plaintext value matches common API-key prefixes) are encrypted with
    /// AES-256-GCM and stored as `"enc:v1:<base64-json>"`.
    ///
    /// # Errors
    ///
    /// Returns an error if any sensitive value fails to encrypt. We refuse to
    /// persist sensitive values in plaintext.
    fn encrypt_sensitive_values(
        manifest: &ExtensionManifest,
        config: HashMap<String, serde_json::Value>,
    ) -> ExtensionResult<HashMap<String, serde_json::Value>> {
        let sensitive_keys = Self::sensitive_keys(manifest);
        let enc_key = Self::config_encryption_key();
        let mut result = HashMap::with_capacity(config.len());

        for (key, value) in config {
            let should_encrypt = sensitive_keys.contains(&key)
                || value
                    .as_str()
                    .map(Self::looks_like_api_key)
                    .unwrap_or(false);

            if should_encrypt {
                if let Some(plaintext) = value.as_str() {
                    // Skip if already encrypted
                    if plaintext.starts_with(ENCRYPTED_VALUE_PREFIX) {
                        result.insert(key, value);
                        continue;
                    }

                    let encrypted = encrypt_secret(&enc_key, plaintext).map_err(|e| {
                        tracing::error!("Failed to encrypt config field '{}': {}", key, e);
                        ExtensionError::InvalidConfiguration(format!(
                            "Failed to encrypt sensitive field '{}': \
                             encryption error. Refusing to store in plaintext.",
                            key
                        ))
                    })?;

                    let enc_json = serde_json::to_string(&encrypted).map_err(|e| {
                        ExtensionError::InvalidConfiguration(format!(
                            "Failed to serialize encrypted field '{}': {}",
                            key, e
                        ))
                    })?;

                    let stored = format!("{}{}", ENCRYPTED_VALUE_PREFIX, enc_json);
                    tracing::debug!("Encrypted sensitive config field '{}' for extension", key);
                    result.insert(key, serde_json::Value::String(stored));
                    continue;
                }
            }

            result.insert(key, value);
        }

        Ok(result)
    }

    /// Decrypt sensitive config values after retrieval.
    ///
    /// Values prefixed with `"enc:v1:"` are decrypted transparently.
    fn decrypt_sensitive_values(
        _manifest: &ExtensionManifest,
        config: HashMap<String, serde_json::Value>,
    ) -> HashMap<String, serde_json::Value> {
        let enc_key = Self::config_encryption_key();

        config
            .into_iter()
            .map(|(key, value)| {
                if let Some(s) = value.as_str() {
                    if let Some(enc_json) = s.strip_prefix(ENCRYPTED_VALUE_PREFIX) {
                        match serde_json::from_str::<EncryptedSecret>(enc_json) {
                            Ok(encrypted) => match decrypt_secret(&enc_key, &encrypted) {
                                Ok(plaintext) => {
                                    return (key, serde_json::Value::String(plaintext));
                                }
                                Err(e) => {
                                    tracing::error!(
                                        "Failed to decrypt config field '{}': {}. \
                                         Returning encrypted value.",
                                        key,
                                        e
                                    );
                                }
                            },
                            Err(e) => {
                                tracing::error!(
                                    "Failed to parse encrypted config field '{}': {}",
                                    key,
                                    e
                                );
                            }
                        }
                    }
                }
                (key, value)
            })
            .collect()
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

    /// The extensions the user left on: stored as `Running` by the last
    /// successful start, or as `Enabled`.
    pub fn get_auto_start_extensions(&self) -> ExtensionResult<Vec<String>> {
        let mut ids = Vec::new();
        for status in [ExtensionStatus::Enabled, ExtensionStatus::Running] {
            ids.extend(
                self.repository
                    .list_by_status(status)?
                    .into_iter()
                    .map(|record| record.id),
            );
        }
        Ok(ids)
    }

    /// Starts every extension the user left on. One that fails is marked
    /// `Error` with its reason and returned; the rest still start.
    pub async fn start_enabled_extensions(&self) -> ExtensionResult<Vec<(String, String)>> {
        let mut failures = Vec::new();

        for id in self.get_auto_start_extensions()? {
            if self.is_running(&id) {
                continue;
            }
            if let Err(error) = self.start_extension(&id, None).await {
                let reason = error.to_string();
                tracing::error!("Failed to start extension {}: {}", id, reason);
                let _ = self
                    .repository
                    .update_status(&id, ExtensionStatus::Error, Some(&reason));
                failures.push((id, reason));
            }
        }

        Ok(failures)
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::core::mcp::extensions::manifest::{ConfigProperty, ConfigSchema};
    use rusqlite::Connection;
    use std::sync::Mutex;

    fn create_test_manager() -> ExtensionManager {
        let conn = Connection::open_in_memory().unwrap();
        let repository = Arc::new(ExtensionRepository::new(Arc::new(Mutex::new(conn))).unwrap());
        let installer = Arc::new(ExtensionInstaller::default());
        let mcp_client = Arc::new(McpClient::new());

        ExtensionManager::new(repository, installer, mcp_client)
    }

    /// Build a minimal ExtensionManifest with a config schema containing the
    /// given properties. Useful for encryption/decryption tests.
    fn manifest_with_properties(properties: HashMap<String, ConfigProperty>) -> ExtensionManifest {
        ExtensionManifest {
            id: "test-ext".to_string(),
            name: "Test Extension".to_string(),
            version: "1.0.0".to_string(),
            description: "test".to_string(),
            author: "test".to_string(),
            homepage: None,
            license: None,
            manifest_version: "1.0.0".to_string(),
            transport: TransportType::Stdio,
            command: Some("node".to_string()),
            args: vec![],
            env: HashMap::new(),
            config_schema: Some(ConfigSchema {
                r#type: "object".to_string(),
                properties,
                required: vec![],
            }),
            tools: vec![],
            capabilities: vec![],
            icon: None,
            min_app_version: None,
            category: None,
            tags: vec![],
            has_node_dependencies: false,
            http_config: None,
        }
    }

    /// Helper: build a ConfigProperty marked as sensitive.
    fn sensitive_string_property() -> ConfigProperty {
        ConfigProperty {
            r#type: "string".to_string(),
            title: Some("API Key".to_string()),
            description: Some("An API key".to_string()),
            default: None,
            sensitive: true,
            required: true,
            enum_values: None,
            minimum: None,
            maximum: None,
            pattern: None,
            help_url: None,
            placeholder: None,
        }
    }

    /// Helper: build a ConfigProperty that is NOT sensitive.
    fn non_sensitive_string_property() -> ConfigProperty {
        ConfigProperty {
            r#type: "string".to_string(),
            title: Some("Display Name".to_string()),
            description: None,
            default: None,
            sensitive: false,
            required: false,
            enum_values: None,
            minimum: None,
            maximum: None,
            pattern: None,
            help_url: None,
            placeholder: None,
        }
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

    // ==========================================================================
    // Security tests: API key encryption
    // ==========================================================================

    #[test]
    fn test_sensitive_values_are_encrypted_not_plaintext() {
        let mut props = HashMap::new();
        props.insert("api_key".to_string(), sensitive_string_property());
        let manifest = manifest_with_properties(props);

        let mut config = HashMap::new();
        config.insert(
            "api_key".to_string(),
            serde_json::Value::String("sk-secret-12345".to_string()),
        );

        let encrypted = ExtensionManager::encrypt_sensitive_values(&manifest, config).unwrap();

        let stored = encrypted.get("api_key").unwrap().as_str().unwrap();
        // Must be encrypted, not plaintext
        assert!(
            stored.starts_with(ENCRYPTED_VALUE_PREFIX),
            "Sensitive value must be stored with encrypted prefix, got: {}",
            &stored[..stored.len().min(30)]
        );
        assert!(
            !stored.contains("sk-secret-12345"),
            "Plaintext API key must not appear in stored value"
        );
    }

    #[test]
    fn test_non_sensitive_values_are_not_encrypted() {
        let mut props = HashMap::new();
        props.insert("display_name".to_string(), non_sensitive_string_property());
        let manifest = manifest_with_properties(props);

        let mut config = HashMap::new();
        config.insert(
            "display_name".to_string(),
            serde_json::Value::String("My Extension".to_string()),
        );

        let encrypted = ExtensionManager::encrypt_sensitive_values(&manifest, config).unwrap();

        let stored = encrypted.get("display_name").unwrap().as_str().unwrap();
        assert_eq!(
            stored, "My Extension",
            "Non-sensitive value should remain plaintext"
        );
    }

    #[test]
    fn test_encrypt_then_decrypt_roundtrip() {
        let mut props = HashMap::new();
        props.insert("api_key".to_string(), sensitive_string_property());
        props.insert("display_name".to_string(), non_sensitive_string_property());
        let manifest = manifest_with_properties(props);

        let mut config = HashMap::new();
        config.insert(
            "api_key".to_string(),
            serde_json::Value::String("sk-roundtrip-test-key".to_string()),
        );
        config.insert(
            "display_name".to_string(),
            serde_json::Value::String("Test".to_string()),
        );

        let encrypted = ExtensionManager::encrypt_sensitive_values(&manifest, config).unwrap();
        let decrypted = ExtensionManager::decrypt_sensitive_values(&manifest, encrypted);

        assert_eq!(
            decrypted.get("api_key").unwrap().as_str().unwrap(),
            "sk-roundtrip-test-key",
            "Decrypted value must match original plaintext"
        );
        assert_eq!(
            decrypted.get("display_name").unwrap().as_str().unwrap(),
            "Test"
        );
    }

    #[test]
    fn test_already_encrypted_values_are_not_double_encrypted() {
        let mut props = HashMap::new();
        props.insert("api_key".to_string(), sensitive_string_property());
        let manifest = manifest_with_properties(props);

        // First encryption pass
        let mut config = HashMap::new();
        config.insert(
            "api_key".to_string(),
            serde_json::Value::String("sk-no-double".to_string()),
        );
        let first_pass = ExtensionManager::encrypt_sensitive_values(&manifest, config).unwrap();

        // Second encryption pass on already-encrypted data
        let second_pass =
            ExtensionManager::encrypt_sensitive_values(&manifest, first_pass.clone()).unwrap();

        // The stored value should be identical (no double-encryption)
        assert_eq!(
            first_pass.get("api_key").unwrap().as_str().unwrap(),
            second_pass.get("api_key").unwrap().as_str().unwrap(),
            "Already-encrypted values must not be double-encrypted"
        );
    }

    #[test]
    fn test_api_key_prefix_heuristic_triggers_encryption() {
        // Even without sensitive: true, values that look like API keys should be encrypted
        let mut props = HashMap::new();
        props.insert("token".to_string(), non_sensitive_string_property());
        let manifest = manifest_with_properties(props);

        let test_keys = vec![
            "sk-1234567890abcdef",
            "ghp_xxxxxxxxxxxxxxxxxxxx",
            "xoxb-slack-token",
            "glpat-gitlab-token",
            "eyJhbGciOiJIUzI1NiJ9",
        ];

        for key_value in test_keys {
            let mut config = HashMap::new();
            config.insert(
                "token".to_string(),
                serde_json::Value::String(key_value.to_string()),
            );

            let encrypted = ExtensionManager::encrypt_sensitive_values(&manifest, config).unwrap();
            let stored = encrypted.get("token").unwrap().as_str().unwrap();
            assert!(
                stored.starts_with(ENCRYPTED_VALUE_PREFIX),
                "API key with prefix '{}' must be encrypted but was stored as plaintext",
                &key_value[..key_value.len().min(10)]
            );
        }
    }

    #[test]
    fn test_has_plaintext_sensitive_values_detects_unencrypted() {
        let mut props = HashMap::new();
        props.insert("api_key".to_string(), sensitive_string_property());
        let manifest = manifest_with_properties(props);

        // Plaintext sensitive value should be detected
        let mut config = HashMap::new();
        config.insert(
            "api_key".to_string(),
            serde_json::Value::String("my-secret-key".to_string()),
        );
        assert!(
            ExtensionManager::has_plaintext_sensitive_values(&manifest, &config),
            "Must detect plaintext sensitive value"
        );

        // Encrypted value should NOT be detected
        let encrypted = ExtensionManager::encrypt_sensitive_values(&manifest, config).unwrap();
        assert!(
            !ExtensionManager::has_plaintext_sensitive_values(&manifest, &encrypted),
            "Must not flag already-encrypted values"
        );
    }

    #[test]
    fn test_has_plaintext_sensitive_values_detects_api_key_heuristic() {
        let mut props = HashMap::new();
        props.insert("token".to_string(), non_sensitive_string_property());
        let manifest = manifest_with_properties(props);

        let mut config = HashMap::new();
        config.insert(
            "token".to_string(),
            serde_json::Value::String("sk-looks-like-api-key".to_string()),
        );
        assert!(
            ExtensionManager::has_plaintext_sensitive_values(&manifest, &config),
            "Must detect plaintext value matching API key heuristic"
        );
    }

    #[test]
    fn test_encrypt_sensitive_values_returns_result_not_plaintext_fallback() {
        // Verify the function signature returns Result -- this is a compile-time
        // guarantee that callers must handle the error case. The test ensures
        // the return type is ExtensionResult and that successful encryption works.
        let mut props = HashMap::new();
        props.insert("api_key".to_string(), sensitive_string_property());
        let manifest = manifest_with_properties(props);

        let mut config = HashMap::new();
        config.insert(
            "api_key".to_string(),
            serde_json::Value::String("sk-test-error-path".to_string()),
        );

        // Normal path should succeed
        let result = ExtensionManager::encrypt_sensitive_values(&manifest, config);
        assert!(
            result.is_ok(),
            "encrypt_sensitive_values should succeed for valid input"
        );

        // Verify the stored value is encrypted, not plaintext
        let encrypted = result.unwrap();
        let stored = encrypted.get("api_key").unwrap().as_str().unwrap();
        assert!(
            stored.starts_with(ENCRYPTED_VALUE_PREFIX),
            "Must be encrypted"
        );
        assert!(
            !stored.contains("sk-test-error-path"),
            "Plaintext must never appear in encrypted output"
        );
    }

    #[test]
    fn test_set_config_encrypts_api_keys_in_database() {
        // End-to-end test: set_config -> repository -> get_config roundtrip
        // verifying that sensitive values are stored encrypted in the DB.
        let conn = Connection::open_in_memory().unwrap();
        let repository = Arc::new(ExtensionRepository::new(Arc::new(Mutex::new(conn))).unwrap());
        let installer = Arc::new(ExtensionInstaller::default());
        let mcp_client = Arc::new(McpClient::new());
        let manager = ExtensionManager::new(repository.clone(), installer, mcp_client);

        // Insert a test extension record with a manifest containing a sensitive field
        let manifest_json = serde_json::json!({
            "id": "test-ext",
            "name": "Test",
            "version": "1.0.0",
            "description": "test",
            "command": "node",
            "configSchema": {
                "type": "object",
                "properties": {
                    "apiKey": {
                        "type": "string",
                        "sensitive": true,
                        "required": true
                    },
                    "workspace": {
                        "type": "string",
                        "sensitive": false
                    }
                }
            }
        });
        let record = super::super::repository::ExtensionRecord {
            id: "test-ext".to_string(),
            name: "Test".to_string(),
            version: "1.0.0".to_string(),
            description: "test".to_string(),
            author: "test".to_string(),
            install_path: std::path::PathBuf::from("/tmp/test-ext"),
            manifest_json: manifest_json.to_string(),
            status: super::super::repository::ExtensionStatus::Disabled,
            last_error: None,
            config_json: None,
            package_hash: "hash123".to_string(),
            installed_at: chrono::Utc::now(),
            updated_at: chrono::Utc::now(),
            last_started_at: None,
            use_count: 0,
        };
        repository.insert(&record).unwrap();

        // Set config with a sensitive API key
        let mut config = HashMap::new();
        config.insert(
            "apiKey".to_string(),
            serde_json::Value::String("sk-my-secret-key-12345".to_string()),
        );
        config.insert(
            "workspace".to_string(),
            serde_json::Value::String("my-workspace".to_string()),
        );
        manager.set_config("test-ext", config).unwrap();

        // Read raw config from repository (bypassing manager decryption)
        let raw_config = repository.get_config("test-ext").unwrap();
        let raw_api_key = raw_config.get("apiKey").unwrap().as_str().unwrap();

        // The raw DB value must be encrypted, not plaintext
        assert!(
            raw_api_key.starts_with(ENCRYPTED_VALUE_PREFIX),
            "API key in database must be encrypted (starts_with '{}'), got len={}",
            ENCRYPTED_VALUE_PREFIX,
            raw_api_key.len()
        );
        assert!(
            !raw_api_key.contains("sk-my-secret-key-12345"),
            "Plaintext API key must not appear in database"
        );

        // Non-sensitive value should be plaintext
        let raw_workspace = raw_config.get("workspace").unwrap().as_str().unwrap();
        assert_eq!(raw_workspace, "my-workspace");

        // get_config through manager should decrypt transparently
        let decrypted = manager.get_config("test-ext").unwrap();
        assert_eq!(
            decrypted.get("apiKey").unwrap().as_str().unwrap(),
            "sk-my-secret-key-12345",
            "get_config must return decrypted API key"
        );
        assert_eq!(
            decrypted.get("workspace").unwrap().as_str().unwrap(),
            "my-workspace"
        );
    }

    #[test]
    fn test_plaintext_migration_on_read() {
        // Simulate a legacy scenario: config was stored with plaintext API keys
        // before encryption was enforced. Verify that get_config migrates them.
        let conn = Connection::open_in_memory().unwrap();
        let repository = Arc::new(ExtensionRepository::new(Arc::new(Mutex::new(conn))).unwrap());
        let installer = Arc::new(ExtensionInstaller::default());
        let mcp_client = Arc::new(McpClient::new());
        let manager = ExtensionManager::new(repository.clone(), installer, mcp_client);

        let manifest_json = serde_json::json!({
            "id": "legacy-ext",
            "name": "Legacy",
            "version": "1.0.0",
            "description": "legacy test",
            "command": "node",
            "configSchema": {
                "type": "object",
                "properties": {
                    "apiToken": {
                        "type": "string",
                        "sensitive": true
                    }
                }
            }
        });
        let record = super::super::repository::ExtensionRecord {
            id: "legacy-ext".to_string(),
            name: "Legacy".to_string(),
            version: "1.0.0".to_string(),
            description: "legacy test".to_string(),
            author: "test".to_string(),
            install_path: std::path::PathBuf::from("/tmp/legacy-ext"),
            manifest_json: manifest_json.to_string(),
            status: super::super::repository::ExtensionStatus::Disabled,
            last_error: None,
            config_json: Some(
                serde_json::json!({"apiToken": "sk-legacy-plaintext-key"}).to_string(),
            ),
            package_hash: "hash456".to_string(),
            installed_at: chrono::Utc::now(),
            updated_at: chrono::Utc::now(),
            last_started_at: None,
            use_count: 0,
        };
        repository.insert(&record).unwrap();

        // Reading config should trigger migration
        let config = manager.get_config("legacy-ext").unwrap();
        assert_eq!(
            config.get("apiToken").unwrap().as_str().unwrap(),
            "sk-legacy-plaintext-key",
            "get_config must return correct decrypted value after migration"
        );

        // Verify the raw DB value is now encrypted after the migration
        let raw_config = repository.get_config("legacy-ext").unwrap();
        let raw_token = raw_config.get("apiToken").unwrap().as_str().unwrap();
        assert!(
            raw_token.starts_with(ENCRYPTED_VALUE_PREFIX),
            "After migration, DB must contain encrypted value, got: {}",
            &raw_token[..raw_token.len().min(30)]
        );
        assert!(
            !raw_token.contains("sk-legacy-plaintext-key"),
            "After migration, plaintext must not remain in database"
        );
    }

    fn manager_with_configurable_extension() -> ExtensionManager {
        let manager = create_test_manager();
        let manifest_json = serde_json::json!({
            "id": "test-ext",
            "name": "Test",
            "version": "1.0.0",
            "description": "test",
            "command": "node",
            "configSchema": {
                "type": "object",
                "properties": {
                    "apiKey": { "type": "string", "sensitive": true, "required": true },
                    "workspace": { "type": "string", "sensitive": false }
                },
                "required": ["apiKey"]
            }
        });
        let mut record = stored_extension("test-ext", ExtensionStatus::Disabled);
        record.manifest_json = manifest_json.to_string();
        manager.repository.insert(&record).unwrap();
        manager
    }

    fn text(value: &str) -> serde_json::Value {
        serde_json::Value::String(value.to_string())
    }

    #[test]
    fn the_page_is_given_every_value_but_the_secrets_and_only_their_names() {
        let manager = manager_with_configurable_extension();
        manager
            .set_config(
                "test-ext",
                HashMap::from([
                    ("apiKey".to_string(), text("plain-words-not-a-key-shape")),
                    ("workspace".to_string(), text("my-workspace")),
                ]),
            )
            .unwrap();

        let shown = manager.shown_config("test-ext").unwrap();
        assert_eq!(shown.get("workspace"), Some(&text("my-workspace")));
        assert!(!shown.contains_key("apiKey"));

        let info = manager.get_extension("test-ext").unwrap();
        assert_eq!(info.stored_secrets, vec!["apiKey".to_string()]);
        let sent = serde_json::to_string(&info).unwrap();
        assert!(sent.contains("\"storedSecrets\":[\"apiKey\"]"), "{sent}");
        assert!(!sent.contains("plain-words-not-a-key-shape"), "{sent}");
    }

    #[test]
    fn a_stored_secret_the_page_did_not_send_is_kept_and_one_it_sent_replaces_it() {
        let manager = manager_with_configurable_extension();
        manager
            .set_config(
                "test-ext",
                HashMap::from([
                    ("apiKey".to_string(), text("first-secret")),
                    ("workspace".to_string(), text("one")),
                ]),
            )
            .unwrap();

        manager
            .set_config(
                "test-ext",
                HashMap::from([("workspace".to_string(), text("two"))]),
            )
            .expect("the required secret is already stored");
        let kept = manager.get_config("test-ext").unwrap();
        assert_eq!(kept.get("apiKey"), Some(&text("first-secret")));
        assert_eq!(kept.get("workspace"), Some(&text("two")));

        manager
            .set_config(
                "test-ext",
                HashMap::from([("apiKey".to_string(), text("second-secret"))]),
            )
            .unwrap();
        let replaced = manager.get_config("test-ext").unwrap();
        assert_eq!(replaced.get("apiKey"), Some(&text("second-secret")));
        assert!(
            !replaced.contains_key("workspace"),
            "a value that is not a secret is saved as sent"
        );
        let raw = manager.repository.get_config("test-ext").unwrap();
        assert!(raw["apiKey"]
            .as_str()
            .unwrap()
            .starts_with(ENCRYPTED_VALUE_PREFIX));
    }

    #[test]
    fn the_launch_carries_a_hash_that_changes_with_the_package_and_with_the_entry_file() {
        let folder = tempfile::tempdir().unwrap();
        let manager = create_test_manager();
        let manifest_json = serde_json::json!({
            "id": "coded",
            "name": "Coded",
            "version": "1.0.0",
            "description": "test",
            "command": "node",
            "args": ["server/index.js"]
        });
        let mut record = stored_extension("coded", ExtensionStatus::Disabled);
        record.manifest_json = manifest_json.to_string();
        record.install_path = folder.path().to_path_buf();
        manager.repository.insert(&record).unwrap();
        std::fs::create_dir_all(folder.path().join("server")).unwrap();
        std::fs::write(folder.path().join("server/index.js"), "first").unwrap();

        let digest = |manager: &ExtensionManager| {
            let (name, launch) = manager.launch_of("coded").unwrap();
            assert_eq!(name, "ext-coded");
            launch.env[CODE_DIGEST_VARIABLE].clone()
        };
        let first = digest(&manager);
        assert_eq!(first.len(), 64);
        assert_eq!(
            digest(&manager),
            first,
            "an unchanged launch hashes the same"
        );

        std::fs::write(folder.path().join("server/index.js"), "second").unwrap();
        let edited = digest(&manager);
        assert_ne!(edited, first, "an edited entry file is a different launch");

        record.package_hash = "another package".to_string();
        manager.repository.update(&record).unwrap();
        assert_ne!(digest(&manager), edited, "so is another package");

        std::fs::remove_file(folder.path().join("server/index.js")).unwrap();
        assert_ne!(
            code_digest("p", &[folder.path().join("server/index.js")]),
            code_digest("p", &[])
        );
    }

    fn stored_extension(id: &str, status: ExtensionStatus) -> ExtensionRecord {
        ExtensionRecord {
            id: id.to_string(),
            name: id.to_string(),
            version: "1.0.0".to_string(),
            description: "test".to_string(),
            author: "test".to_string(),
            install_path: std::path::PathBuf::from("/tmp").join(id),
            manifest_json: "not a manifest".to_string(),
            status,
            last_error: None,
            config_json: None,
            package_hash: "hash".to_string(),
            installed_at: chrono::Utc::now(),
            updated_at: chrono::Utc::now(),
            last_started_at: None,
            use_count: 0,
        }
    }

    #[tokio::test]
    async fn an_extension_left_on_is_started_at_launch_and_its_failure_is_recorded() {
        let manager = create_test_manager();
        manager
            .repository
            .insert(&stored_extension("left-on", ExtensionStatus::Running))
            .unwrap();
        manager
            .repository
            .insert(&stored_extension("switched-off", ExtensionStatus::Disabled))
            .unwrap();

        let failures = manager.start_enabled_extensions().await.unwrap();

        assert_eq!(failures.len(), 1);
        assert_eq!(failures[0].0, "left-on");
        let left_on = manager.repository.get("left-on").unwrap().unwrap();
        assert_eq!(left_on.status, ExtensionStatus::Error);
        assert_eq!(left_on.last_error.as_deref(), Some(failures[0].1.as_str()));
        let switched_off = manager.repository.get("switched-off").unwrap().unwrap();
        assert_eq!(switched_off.status, ExtensionStatus::Disabled);
    }

    #[tokio::test]
    async fn a_stored_running_status_does_not_stop_the_user_from_enabling_after_a_restart() {
        let manager = create_test_manager();
        manager
            .repository
            .insert(&stored_extension("left-on", ExtensionStatus::Running))
            .unwrap();

        assert!(!manager.is_running("left-on"));
        assert!(
            manager.enable_extension("left-on").await.is_err(),
            "enabling must try to start it, not report success from the stored status"
        );
    }
}
