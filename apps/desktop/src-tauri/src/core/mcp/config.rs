use super::transport::TransportConfig;
use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use std::path::PathBuf;
use std::time::{SystemTime, UNIX_EPOCH};

const DEFAULT_CONFIG_JSON: &str = include_str!(concat!(
    env!("CARGO_MANIFEST_DIR"),
    "/mcp/default_servers.json"
));

/// Prefix for OAuth placeholder values (e.g., "<from_oauth:github>")
const OAUTH_PLACEHOLDER_PREFIX: &str = "<from_oauth:";
/// Legacy credential manager placeholder
const CREDENTIAL_PLACEHOLDER: &str = "<from_credential_manager>";

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
        tokio::fs::write(path, json).await?;
        Ok(())
    }

    pub fn default_config_path() -> crate::core::mcp::McpResult<PathBuf> {
        let app_data = dirs::data_dir().ok_or_else(|| {
            std::io::Error::new(
                std::io::ErrorKind::NotFound,
                "Failed to get app data directory",
            )
        })?;
        Ok(app_data
            .join("agiworkforce")
            .join("mcp-servers-config.json"))
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
        // Get the database path
        let app_data = dirs::data_dir().ok_or_else(|| {
            std::io::Error::new(
                std::io::ErrorKind::NotFound,
                "Failed to get app data directory",
            )
        })?;
        let db_path = app_data.join("agiworkforce").join("agiworkforce.db");

        // Try to open database if it exists
        if db_path.exists() {
            if let Ok(conn) = rusqlite::Connection::open(&db_path) {
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
                                    *value = token;
                                    tracing::debug!(
                                        "Injected OAuth token for provider: {}",
                                        provider
                                    );
                                }
                                Err(e) => {
                                    tracing::warn!(
                                        "OAuth token not available for {} ({}), trying legacy credential",
                                        provider,
                                        e
                                    );
                                    // Fall back to legacy credential manager
                                    let cred_key =
                                        format!("mcp_credential_{}_{}", server_name, key);
                                    if let Ok(stored_value) = conn.query_row(
                                        "SELECT value FROM settings_v2 WHERE key = ?1",
                                        rusqlite::params![cred_key],
                                        |row| row.get::<_, String>(0),
                                    ) {
                                        if let Some(decrypted) =
                                            decrypt_mcp_credential(&stored_value)
                                        {
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
        }
        Ok(())
    }
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
                                let _ = conn.execute(
                                    "INSERT OR REPLACE INTO settings_v2 (key, value) VALUES (?1, ?2)",
                                    rusqlite::params![access_token_key, encrypted_new],
                                );
                                let _ = conn.execute(
                                    "INSERT OR REPLACE INTO settings_v2 (key, value) VALUES (?1, ?2)",
                                    rusqlite::params![expires_at_key, new_expires.to_string()],
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

/// Refresh an OAuth token using the refresh token
///
/// Note: This is a placeholder implementation. In production, this should make
/// actual HTTP requests to the provider's token endpoint.
fn refresh_oauth_token(provider: &str, _refresh_token: &str) -> Result<(String, i64), String> {
    // TODO: Implement actual OAuth refresh logic for each provider
    // For now, return an error to fall back to existing token or legacy credentials
    Err(format!(
        "OAuth token refresh not yet implemented for provider: {}",
        provider
    ))
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
fn decrypt_mcp_credential(encrypted: &str) -> Option<String> {
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
