use super::transport::TransportConfig;
use crate::data::db::encryption::open_encrypted_connection;
use crate::sys::security::machine_key::{derive_key, KeyPurpose};
use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use std::path::PathBuf;
use std::time::{SystemTime, UNIX_EPOCH};
use tokio::io::AsyncWriteExt;

const DEFAULT_CONFIG_JSON: &str = include_str!(concat!(
    env!("CARGO_MANIFEST_DIR"),
    "/mcp/default_servers.json"
));

/// Prefix for OAuth placeholder values (e.g., "<from_oauth:github>")
const OAUTH_PLACEHOLDER_PREFIX: &str = "<from_oauth:";
/// Prefix for API key placeholder values (e.g., "<from_api_key:vercel>")
const API_KEY_PLACEHOLDER_PREFIX: &str = "<from_api_key:";
/// Legacy credential manager placeholder
const CREDENTIAL_PLACEHOLDER: &str = "<from_credential_manager>";
/// Environment variable used to resolve project-scoped MCP config.
pub const PROJECT_FOLDER_ENV_VAR: &str = "AGIWORKFORCE_PROJECT_FOLDER";
/// Project-level MCP config filename (compatible with Cursor/Claude workflows).
pub const PROJECT_MCP_CONFIG_FILENAME: &str = ".mcp.json";
/// Alternate project-level MCP config filename (used by Cursor/VS Code).
pub const PROJECT_MCP_ALT_CONFIG_FILENAME: &str = "mcp.json";
/// VS Code workspace MCP config path.
pub const PROJECT_VSCODE_MCP_RELATIVE_PATH: &str = ".vscode/mcp.json";
/// App-level fallback MCP config filename.
const GLOBAL_MCP_CONFIG_FILENAME: &str = "mcp-servers-config.json";

/// Configuration for an MCP server
///
/// Supports two transport modes:
/// - STDIO (default): Local process spawned with command/args
/// - HTTP/SSE: Remote server accessed via HTTP with Server-Sent Events
///
/// # Examples
///
/// ## STDIO transport (local process)
/// ```json
/// {
///   "command": "npx",
///   "args": ["-y", "@modelcontextprotocol/server-filesystem", "."],
///   "enabled": true
/// }
/// ```
///
/// ## HTTP/SSE transport (remote server)
/// ```json
/// {
///   "transport": {
///     "type": "http",
///     "url": "https://mcp.example.com",
///     "bearer_token": "your-api-token",
///     "timeout_secs": 30
///   },
///   "enabled": true
/// }
/// ```
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct McpServerConfig {
    /// Command to execute (required for STDIO transport)
    #[serde(default)]
    pub command: String,

    /// Arguments for the command (required for STDIO transport)
    #[serde(default)]
    pub args: Vec<String>,

    /// Environment variables for the process (STDIO transport only)
    #[serde(default)]
    pub env: HashMap<String, String>,

    /// Whether the server is enabled
    #[serde(default = "default_true")]
    pub enabled: bool,

    /// Transport configuration (defaults to STDIO if not specified)
    ///
    /// When set to HTTP, the command/args/env fields are ignored and
    /// the server is accessed via HTTP/SSE instead.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub transport: Option<TransportConfig>,
}

fn default_true() -> bool {
    true
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct McpServersConfig {
    #[serde(rename = "mcpServers")]
    pub mcp_servers: HashMap<String, McpServerConfig>,
}

impl McpServersConfig {
    pub fn project_config_candidates(project_root: &str) -> Vec<PathBuf> {
        let project_path = PathBuf::from(project_root);
        vec![
            project_path.join(PROJECT_MCP_CONFIG_FILENAME),
            project_path.join(PROJECT_MCP_ALT_CONFIG_FILENAME),
            project_path.join(PROJECT_VSCODE_MCP_RELATIVE_PATH),
        ]
    }

    pub fn resolve_project_config_path(project_root: &str) -> PathBuf {
        let candidates = Self::project_config_candidates(project_root);
        for candidate in &candidates {
            if candidate.exists() {
                return candidate.clone();
            }
        }

        // Canonical write target when no project config file exists yet.
        candidates
            .first()
            .cloned()
            .unwrap_or_else(|| PathBuf::from(project_root).join(PROJECT_MCP_CONFIG_FILENAME))
    }

    pub async fn from_file(path: &PathBuf) -> crate::core::mcp::McpResult<Self> {
        let contents = tokio::fs::read_to_string(path).await?;
        let config: Self = serde_json::from_str(&contents)?;
        Ok(config)
    }

    pub fn from_json(json: &str) -> crate::core::mcp::McpResult<Self> {
        let config: Self = serde_json::from_str(json)?;
        Ok(config)
    }

    pub async fn save_to_file(&self, path: &PathBuf) -> crate::core::mcp::McpResult<()> {
        let json = serde_json::to_string_pretty(self)?;
        let parent = path
            .parent()
            .ok_or_else(|| std::io::Error::other("Invalid config path"))?;
        tokio::fs::create_dir_all(parent).await?;

        // Write atomically via temp file + rename to avoid partial writes.
        let base_name = path
            .file_name()
            .and_then(|name| name.to_str())
            .unwrap_or("mcp-config");
        let temp_path = parent.join(format!(
            ".{}.{}.{}.tmp",
            base_name,
            std::process::id(),
            SystemTime::now()
                .duration_since(UNIX_EPOCH)
                .unwrap_or_default()
                .as_nanos()
        ));

        let mut temp_file = tokio::fs::File::create(&temp_path).await?;
        temp_file.write_all(json.as_bytes()).await?;
        temp_file.sync_all().await?;
        drop(temp_file);

        if let Err(rename_err) = tokio::fs::rename(&temp_path, path).await {
            // Windows doesn't always replace existing destination on rename.
            if path.exists() {
                let _ = tokio::fs::remove_file(path).await;
                tokio::fs::rename(&temp_path, path).await?;
            } else {
                return Err(rename_err.into());
            }
        }
        Ok(())
    }

    pub fn project_config_path(project_root: &str) -> PathBuf {
        Self::resolve_project_config_path(project_root)
    }

    pub fn active_project_folder_from_env() -> Option<String> {
        let raw = std::env::var(PROJECT_FOLDER_ENV_VAR).ok()?;
        let normalized = raw.trim();
        if normalized.is_empty() {
            None
        } else {
            Some(normalized.to_string())
        }
    }

    pub fn default_config_path() -> crate::core::mcp::McpResult<PathBuf> {
        if let Some(project_root) = Self::active_project_folder_from_env() {
            return Ok(Self::project_config_path(&project_root));
        }

        let app_data = crate::sys::utils::app_data_dir()
            .map_err(|e| std::io::Error::other(e.to_string()))?;
        Ok(app_data.join(GLOBAL_MCP_CONFIG_FILENAME))
    }

    pub fn default() -> Self {
        serde_json::from_str(DEFAULT_CONFIG_JSON).unwrap_or_else(|error| {
            tracing::error!(
                "Failed to parse packaged MCP defaults ({}). Falling back to legacy config.",
                error
            );
            Self::fallback_config()
        })
    }

    fn fallback_config() -> Self {
        let mut mcp_servers = HashMap::new();

        mcp_servers.insert(
            "filesystem".to_string(),
            McpServerConfig {
                command: "npx".to_string(),
                args: vec![
                    "-y".to_string(),
                    "@modelcontextprotocol/server-filesystem".to_string(),
                    ".".to_string(),
                ],
                env: HashMap::new(),
                enabled: true,
                transport: None,
            },
        );

        mcp_servers.insert(
            "github".to_string(),
            McpServerConfig {
                command: "npx".to_string(),
                args: vec![
                    "-y".to_string(),
                    "@modelcontextprotocol/server-github".to_string(),
                ],
                env: {
                    let mut env = HashMap::new();
                    // Use OAuth token first, fall back to legacy credential manager
                    env.insert(
                        "GITHUB_PERSONAL_ACCESS_TOKEN".to_string(),
                        "<from_oauth:github>".to_string(),
                    );
                    env
                },
                enabled: false,
                transport: None,
            },
        );

        mcp_servers.insert(
            "google-drive".to_string(),
            McpServerConfig {
                command: "npx".to_string(),
                args: vec![
                    "-y".to_string(),
                    "@modelcontextprotocol/server-gdrive".to_string(),
                ],
                env: {
                    let mut env = HashMap::new();
                    // Google Drive uses OAuth for authentication
                    env.insert(
                        "GOOGLE_ACCESS_TOKEN".to_string(),
                        "<from_oauth:google>".to_string(),
                    );
                    env
                },
                enabled: false,
                transport: None,
            },
        );

        mcp_servers.insert(
            "slack".to_string(),
            McpServerConfig {
                command: "npx".to_string(),
                args: vec![
                    "-y".to_string(),
                    "@modelcontextprotocol/server-slack".to_string(),
                ],
                env: {
                    let mut env = HashMap::new();
                    // Use OAuth token first, fall back to legacy credential manager
                    env.insert(
                        "SLACK_BOT_TOKEN".to_string(),
                        "<from_oauth:slack>".to_string(),
                    );
                    env
                },
                enabled: false,
                transport: None,
            },
        );

        mcp_servers.insert(
            "stripe".to_string(),
            McpServerConfig {
                command: "npx".to_string(),
                args: vec![
                    "-y".to_string(),
                    "@modelcontextprotocol/server-stripe".to_string(),
                ],
                env: {
                    let mut env = HashMap::new();
                    env.insert(
                        "STRIPE_SECRET_KEY".to_string(),
                        "<from_credential_manager>".to_string(),
                    );
                    env
                },
                enabled: false,
                transport: None,
            },
        );

        McpServersConfig { mcp_servers }
    }

    /// Inject credentials from encrypted database storage
    ///
    /// Supports two types of credential placeholders:
    /// - `<from_oauth:{provider}>` - OAuth tokens (preferred, auto-refreshed)
    /// - `<from_credential_manager>` - Legacy manual credentials (fallback)
    ///
    /// OAuth tokens are checked first, with automatic fallback to legacy credentials
    /// if OAuth is not configured. Expired OAuth tokens are auto-refreshed.
    pub fn inject_credentials(&mut self) -> crate::core::mcp::McpResult<()> {
        let db_path = crate::sys::utils::database_path()
            .map_err(|e| std::io::Error::other(e.to_string()))?;

        // Try to open database if it exists
        if db_path.exists() {
            let conn = open_mcp_settings_db()
                .map_err(std::io::Error::other)?;
            for (server_name, config) in &mut self.mcp_servers {
                for (key, value) in &mut config.env {
                    // Check for OAuth placeholder first (e.g., "<from_oauth:github>")
                    if value.starts_with(OAUTH_PLACEHOLDER_PREFIX) && value.ends_with(">") {
                        // Extract provider name before mutating value
                        let provider =
                            value[OAUTH_PLACEHOLDER_PREFIX.len()..value.len() - 1].to_string();

                        // Try to get OAuth token
                        match get_oauth_token(&conn, &provider) {
                            Ok(token) => {
                                if key == "OPENAPI_MCP_HEADERS" && provider == "notion" {
                                    *value = format!(
                                        r#"{{"Authorization": "Bearer {}","Notion-Version": "2022-06-28"}}"#,
                                        token
                                    );
                                } else {
                                    *value = token;
                                }
                                tracing::debug!("Injected OAuth token for provider: {}", provider);
                            }
                            Err(e) => {
                                tracing::warn!(
                                    "OAuth token not available for {} ({}), trying legacy credential",
                                    provider,
                                    e
                                );
                                // Fall back to legacy credential manager
                                let cred_key = format!("mcp_credential_{}_{}", server_name, key);
                                if let Ok(stored_value) = conn.query_row(
                                    "SELECT value FROM settings_v2 WHERE key = ?1",
                                    rusqlite::params![cred_key],
                                    |row| row.get::<_, String>(0),
                                ) {
                                    if let Some(decrypted) = decrypt_mcp_credential(&stored_value) {
                                        *value = decrypted;
                                        tracing::debug!(
                                            "Injected legacy credential for {} / {}",
                                            server_name,
                                            key
                                        );
                                    }
                                }
                            }
                        }
                    }
                    // Check for API key placeholders (e.g., "<from_api_key:vercel>")
                    else if value.starts_with(API_KEY_PLACEHOLDER_PREFIX) && value.ends_with(">")
                    {
                        let provider =
                            value[API_KEY_PLACEHOLDER_PREFIX.len()..value.len() - 1].to_string();
                        let api_key_storage_key = format!("api_key_{}", provider);

                        match conn.query_row(
                            "SELECT value FROM settings_v2 WHERE key = ?1",
                            rusqlite::params![api_key_storage_key],
                            |row| row.get::<_, String>(0),
                        ) {
                            Ok(stored_value) => {
                                if let Some(decrypted) = decrypt_oauth_token(&stored_value) {
                                    *value = decrypted;
                                    tracing::debug!(
                                        "Injected API key placeholder value for provider: {}",
                                        provider
                                    );
                                } else {
                                    tracing::warn!(
                                        "Failed to decrypt API key for provider: {}",
                                        provider
                                    );
                                }
                            }
                            Err(_) => {
                                tracing::warn!("API key not found for provider: {}", provider);
                            }
                        }
                    }
                    // Check for legacy credential manager placeholder
                    else if value == CREDENTIAL_PLACEHOLDER {
                        let cred_key = format!("mcp_credential_{}_{}", server_name, key);
                        // Try to get credential from database
                        match conn.query_row(
                            "SELECT value FROM settings_v2 WHERE key = ?1",
                            rusqlite::params![cred_key],
                            |row| row.get::<_, String>(0),
                        ) {
                            Ok(stored_value) => {
                                // Value is stored encrypted - decrypt using machine key
                                if let Some(decrypted) = decrypt_mcp_credential(&stored_value) {
                                    *value = decrypted;
                                } else {
                                    tracing::warn!(
                                        "Failed to decrypt credential for {} / {}",
                                        server_name,
                                        key
                                    );
                                }
                            }
                            Err(_) => {
                                tracing::warn!(
                                    "Credential not found for {} / {}",
                                    server_name,
                                    key
                                );
                            }
                        }
                    }
                }
            }
        }
        Ok(())
    }
}

pub fn open_mcp_settings_db() -> Result<rusqlite::Connection, String> {
    let db_path = crate::sys::utils::database_path()
        .map_err(|e| format!("Failed to resolve database path: {}", e))?;
    let encryption_key = derive_key(KeyPurpose::DatabaseEncryption);
    open_encrypted_connection(db_path.to_string_lossy().as_ref(), &encryption_key)
}

pub fn upsert_settings_v2_value(
    conn: &rusqlite::Connection,
    key: &str,
    value: &str,
    category: &str,
    encrypted: bool,
) -> Result<(), String> {
    let now = chrono::Utc::now().to_rfc3339();
    conn.execute(
        "INSERT INTO settings_v2 (key, value, category, encrypted, created_at, updated_at)
         VALUES (?1, ?2, ?3, ?4, ?5, ?5)
         ON CONFLICT(key) DO UPDATE SET
           value = excluded.value,
           category = excluded.category,
           encrypted = excluded.encrypted,
           updated_at = excluded.updated_at",
        rusqlite::params![key, value, category, encrypted as i32, now],
    )
    .map_err(|e| format!("Failed to upsert settings_v2 key '{}': {}", key, e))?;

    Ok(())
}

/// Get an OAuth token for a provider, auto-refreshing if expired
///
/// OAuth tokens are stored with keys:
/// - `mcp_oauth_{provider}_access_token` - The encrypted access token
/// - `mcp_oauth_{provider}_refresh_token` - The encrypted refresh token
/// - `mcp_oauth_{provider}_expires_at` - Token expiry timestamp (Unix seconds)
fn get_oauth_token(conn: &rusqlite::Connection, provider: &str) -> Result<String, String> {
    let access_token_key = format!("mcp_oauth_{}_access_token", provider);
    let expires_at_key = format!("mcp_oauth_{}_expires_at", provider);
    let refresh_token_key = format!("mcp_oauth_{}_refresh_token", provider);

    // Get encrypted access token
    let encrypted_token: String = conn
        .query_row(
            "SELECT value FROM settings_v2 WHERE key = ?1",
            rusqlite::params![access_token_key],
            |row| row.get(0),
        )
        .map_err(|_| format!("OAuth access token not found for provider: {}", provider))?;

    // Check expiry
    let expires_at: Option<i64> = conn
        .query_row(
            "SELECT value FROM settings_v2 WHERE key = ?1",
            rusqlite::params![expires_at_key],
            |row| {
                let val: String = row.get(0)?;
                Ok(val.parse::<i64>().ok())
            },
        )
        .ok()
        .flatten();

    let current_time = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|d| d.as_secs() as i64)
        .unwrap_or(0);

    // Check if token is expired (with 60 second buffer)
    if let Some(exp) = expires_at {
        if current_time >= exp - 60 {
            tracing::info!(
                "OAuth token for {} is expired, attempting refresh",
                provider
            );

            // Get refresh token
            if let Ok(encrypted_refresh) = conn.query_row(
                "SELECT value FROM settings_v2 WHERE key = ?1",
                rusqlite::params![refresh_token_key],
                |row| row.get::<_, String>(0),
            ) {
                if let Some(refresh_token) = decrypt_oauth_token(&encrypted_refresh) {
                    // Attempt to refresh the token
                    match refresh_oauth_token(provider, &refresh_token) {
                        Ok((new_access, new_expires)) => {
                            // Store the new token
                            if let Some(encrypted_new) = encrypt_oauth_token(&new_access) {
                                let _ = upsert_settings_v2_value(
                                    conn,
                                    &access_token_key,
                                    &encrypted_new,
                                    "security",
                                    true,
                                );
                                let _ = upsert_settings_v2_value(
                                    conn,
                                    &expires_at_key,
                                    &new_expires.to_string(),
                                    "security",
                                    false,
                                );
                                tracing::info!(
                                    "Successfully refreshed OAuth token for {}",
                                    provider
                                );
                                return Ok(new_access);
                            }
                        }
                        Err(e) => {
                            tracing::warn!("Failed to refresh OAuth token for {}: {}", provider, e);
                            // Fall through to use possibly stale token
                        }
                    }
                }
            }
        }
    }

    // Decrypt and return the access token
    decrypt_oauth_token(&encrypted_token)
        .ok_or_else(|| format!("Failed to decrypt OAuth token for provider: {}", provider))
}

/// OAuth provider configuration for token refresh
struct OAuthProviderConfig {
    token_url: &'static str,
    client_id_keys: &'static [&'static str],
    client_secret_keys: &'static [&'static str],
}

/// Get OAuth provider configuration
fn get_oauth_provider_config(provider: &str) -> Option<OAuthProviderConfig> {
    match provider {
        "github" => Some(OAuthProviderConfig {
            token_url: "https://github.com/login/oauth/access_token",
            client_id_keys: &[
                "mcp_oauth_config_github_client_id",
                "mcp_oauth_github_client_id",
            ],
            client_secret_keys: &[
                "mcp_oauth_config_github_client_secret",
                "mcp_oauth_github_client_secret",
            ],
        }),
        "google" => Some(OAuthProviderConfig {
            token_url: "https://oauth2.googleapis.com/token",
            client_id_keys: &[
                "mcp_oauth_config_google_client_id",
                "mcp_oauth_google_client_id",
            ],
            client_secret_keys: &[
                "mcp_oauth_config_google_client_secret",
                "mcp_oauth_google_client_secret",
            ],
        }),
        "slack" => Some(OAuthProviderConfig {
            token_url: "https://slack.com/api/oauth.v2.access",
            client_id_keys: &[
                "mcp_oauth_config_slack_client_id",
                "mcp_oauth_slack_client_id",
            ],
            client_secret_keys: &[
                "mcp_oauth_config_slack_client_secret",
                "mcp_oauth_slack_client_secret",
            ],
        }),
        "microsoft" => Some(OAuthProviderConfig {
            token_url: "https://login.microsoftonline.com/common/oauth2/v2.0/token",
            client_id_keys: &[
                "mcp_oauth_config_microsoft_client_id",
                "mcp_oauth_microsoft_client_id",
            ],
            client_secret_keys: &[
                "mcp_oauth_config_microsoft_client_secret",
                "mcp_oauth_microsoft_client_secret",
            ],
        }),
        "dropbox" => Some(OAuthProviderConfig {
            token_url: "https://api.dropboxapi.com/oauth2/token",
            client_id_keys: &[
                "mcp_oauth_config_dropbox_client_id",
                "mcp_oauth_dropbox_client_id",
            ],
            client_secret_keys: &[
                "mcp_oauth_config_dropbox_client_secret",
                "mcp_oauth_dropbox_client_secret",
            ],
        }),
        _ => None,
    }
}

/// Refresh an OAuth token using the refresh token
///
/// Makes HTTP requests to the provider's token endpoint to exchange
/// the refresh token for a new access token.
fn refresh_oauth_token(provider: &str, refresh_token: &str) -> Result<(String, i64), String> {
    // Get provider configuration
    let provider_config = get_oauth_provider_config(provider)
        .ok_or_else(|| format!("Unknown OAuth provider: {}", provider))?;

    // Get client credentials from database
    let conn = open_mcp_settings_db()?;

    let load_credential = |keys: &[&str], label: &str| -> Result<String, String> {
        for key in keys {
            let result: Result<String, rusqlite::Error> = conn.query_row(
                "SELECT value FROM settings_v2 WHERE key = ?1",
                rusqlite::params![key],
                |row| row.get(0),
            );

            if let Ok(stored_value) = result {
                // Newer credentials are encrypted; legacy values may be plaintext.
                return Ok(decrypt_oauth_token(&stored_value).unwrap_or(stored_value));
            }
        }

        Err(format!(
            "OAuth {} not found for provider: {}",
            label, provider
        ))
    };

    let client_id = load_credential(provider_config.client_id_keys, "client_id")?;
    let client_secret = load_credential(provider_config.client_secret_keys, "client_secret")?;

    // Use blocking HTTP client since we're in a sync context
    let client = reqwest::blocking::Client::new();

    let response = client
        .post(provider_config.token_url)
        .header("Accept", "application/json")
        .form(&[
            ("grant_type", "refresh_token"),
            ("refresh_token", refresh_token),
            ("client_id", &client_id),
            ("client_secret", &client_secret),
        ])
        .send()
        .map_err(|e| format!("HTTP request failed: {}", e))?;

    if !response.status().is_success() {
        let status = response.status();
        let body = response.text().unwrap_or_default();
        return Err(format!(
            "Token refresh failed with status {}: {}",
            status, body
        ));
    }

    let token_response: serde_json::Value = response
        .json()
        .map_err(|e| format!("Failed to parse token response: {}", e))?;

    // Extract access token
    let access_token = token_response
        .get("access_token")
        .and_then(|v| v.as_str())
        .ok_or_else(|| "access_token not found in response".to_string())?
        .to_string();

    // Calculate expiry time
    let expires_in = token_response
        .get("expires_in")
        .and_then(|v| v.as_i64())
        .unwrap_or(3600); // Default to 1 hour if not provided

    let current_time = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|d| d.as_secs() as i64)
        .unwrap_or(0);

    let expires_at = current_time + expires_in;

    // If a new refresh token is provided, store it
    if let Some(new_refresh_token) = token_response.get("refresh_token").and_then(|v| v.as_str()) {
        let refresh_token_key = format!("mcp_oauth_{}_refresh_token", provider);
        if let Some(encrypted_refresh) = encrypt_oauth_token(new_refresh_token) {
            let _ = upsert_settings_v2_value(
                &conn,
                &refresh_token_key,
                &encrypted_refresh,
                "security",
                true,
            );
            tracing::debug!("Stored new refresh token for provider: {}", provider);
        }
    }

    tracing::info!(
        "Successfully refreshed OAuth token for {}, expires in {} seconds",
        provider,
        expires_in
    );

    Ok((access_token, expires_at))
}

/// Decrypt an OAuth token using machine-derived keys
///
/// Uses the same encryption scheme as MCP credentials (AES-256-GCM with
/// machine-derived keys via KeyPurpose::McpCredentials).
fn decrypt_oauth_token(encrypted: &str) -> Option<String> {
    use crate::sys::security::machine_key::{derive_key, KeyPurpose};
    use aes_gcm::{aead::Aead, Aes256Gcm, KeyInit, Nonce};
    use base64::{engine::general_purpose, Engine as _};

    let key = derive_key(KeyPurpose::McpCredentials);
    let cipher = Aes256Gcm::new_from_slice(&key).ok()?;

    // Decode from base64
    let combined = general_purpose::STANDARD.decode(encrypted).ok()?;

    if combined.len() < 12 {
        return None;
    }

    // Split nonce and ciphertext
    let (nonce_bytes, ciphertext) = combined.split_at(12);
    let nonce = Nonce::from_slice(nonce_bytes);

    // Decrypt
    let plaintext = cipher.decrypt(nonce, ciphertext).ok()?;
    String::from_utf8(plaintext).ok()
}

/// Encrypt an OAuth token using machine-derived keys
///
/// Uses the same encryption scheme as MCP credentials (AES-256-GCM with
/// machine-derived keys via KeyPurpose::McpCredentials).
pub fn encrypt_oauth_token(plaintext: &str) -> Option<String> {
    use crate::sys::security::machine_key::{derive_key, KeyPurpose};
    use aes_gcm::{
        aead::{Aead, OsRng},
        Aes256Gcm, KeyInit, Nonce,
    };
    use base64::{engine::general_purpose, Engine as _};
    use rand::RngCore;

    let key = derive_key(KeyPurpose::McpCredentials);
    let cipher = Aes256Gcm::new_from_slice(&key).ok()?;

    // Generate random nonce
    let mut nonce_bytes = [0u8; 12];
    OsRng.fill_bytes(&mut nonce_bytes);
    let nonce = Nonce::from_slice(&nonce_bytes);

    // Encrypt
    let ciphertext = cipher.encrypt(nonce, plaintext.as_bytes()).ok()?;

    // Combine nonce + ciphertext and encode as base64
    let mut combined = nonce_bytes.to_vec();
    combined.extend_from_slice(&ciphertext);

    Some(general_purpose::STANDARD.encode(combined))
}

/// Decrypt an MCP credential using machine-derived keys
pub fn decrypt_mcp_credential(encrypted: &str) -> Option<String> {
    use crate::sys::security::machine_key::{derive_key, KeyPurpose};
    use aes_gcm::{aead::Aead, Aes256Gcm, KeyInit, Nonce};
    use base64::{engine::general_purpose, Engine as _};

    let key = derive_key(KeyPurpose::McpCredentials);
    let cipher = Aes256Gcm::new_from_slice(&key).ok()?;

    // Decode from base64
    let combined = general_purpose::STANDARD.decode(encrypted).ok()?;

    if combined.len() < 12 {
        return None;
    }

    // Split nonce and ciphertext
    let (nonce_bytes, ciphertext) = combined.split_at(12);
    let nonce = Nonce::from_slice(nonce_bytes);

    // Decrypt
    let plaintext = cipher.decrypt(nonce, ciphertext).ok()?;
    String::from_utf8(plaintext).ok()
}

/// Encrypt an MCP credential using machine-derived keys
pub fn encrypt_mcp_credential(plaintext: &str) -> Option<String> {
    use crate::sys::security::machine_key::{derive_key, KeyPurpose};
    use aes_gcm::{
        aead::{Aead, OsRng},
        Aes256Gcm, KeyInit, Nonce,
    };
    use base64::{engine::general_purpose, Engine as _};
    use rand::RngCore;

    let key = derive_key(KeyPurpose::McpCredentials);
    let cipher = Aes256Gcm::new_from_slice(&key).ok()?;

    // Generate random nonce
    let mut nonce_bytes = [0u8; 12];
    OsRng.fill_bytes(&mut nonce_bytes);
    let nonce = Nonce::from_slice(&nonce_bytes);

    // Encrypt
    let ciphertext = cipher.encrypt(nonce, plaintext.as_bytes()).ok()?;

    // Combine nonce + ciphertext and encode as base64
    let mut combined = nonce_bytes.to_vec();
    combined.extend_from_slice(&ciphertext);

    Some(general_purpose::STANDARD.encode(combined))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    #[ignore]
    fn test_default_config() {
        let config = McpServersConfig::default();
        assert!(config.mcp_servers.contains_key("filesystem"));
        assert!(config.mcp_servers.contains_key("github"));
        assert!(config.mcp_servers["filesystem"].enabled);
        assert!(!config.mcp_servers["github"].enabled);
    }

    #[test]
    fn test_serialize_deserialize() {
        let config = McpServersConfig::default();
        let json = serde_json::to_string(&config).unwrap();
        let deserialized: McpServersConfig = serde_json::from_str(&json).unwrap();
        assert_eq!(config.mcp_servers.len(), deserialized.mcp_servers.len());
    }
}
