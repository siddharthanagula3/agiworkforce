use super::transport::TransportConfig;
use crate::data::db::encryption::open_encrypted_connection;
use crate::sys::security::machine_key::{derive_key, KeyPurpose};
use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use std::fmt;
use std::path::PathBuf;
use std::time::{SystemTime, UNIX_EPOCH};
use tokio::io::AsyncWriteExt;

/// Error type for config decryption failures.
///
/// Provides detailed, actionable error messages so callers can distinguish
/// between corruption, key mismatch, encoding issues, and validation failures
/// instead of receiving garbage credentials.
#[derive(Debug)]
pub enum ConfigDecryptionError {
    /// The AES-256-GCM cipher could not be initialized from the derived key.
    CipherInit,
    /// The stored value is not valid base64.
    InvalidBase64(base64::DecodeError),
    /// The decoded ciphertext is too short to contain a 12-byte nonce.
    CiphertextTooShort { len: usize },
    /// AES-GCM decryption failed (wrong key, tampered ciphertext, or corrupt nonce).
    DecryptionFailed,
    /// The decrypted bytes are not valid UTF-8.
    InvalidUtf8(std::string::FromUtf8Error),
    /// The decrypted plaintext failed post-decryption validation.
    ValidationFailed(String),
}

impl fmt::Display for ConfigDecryptionError {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        match self {
            ConfigDecryptionError::CipherInit => {
                write!(f, "cipher initialization failed from derived key")
            }
            ConfigDecryptionError::InvalidBase64(e) => {
                write!(f, "stored value is not valid base64: {}", e)
            }
            ConfigDecryptionError::CiphertextTooShort { len } => {
                write!(
                    f,
                    "ciphertext too short ({} bytes, need at least 12 for nonce)",
                    len
                )
            }
            ConfigDecryptionError::DecryptionFailed => {
                write!(
                    f,
                    "AES-GCM decryption failed (wrong key or tampered ciphertext)"
                )
            }
            ConfigDecryptionError::InvalidUtf8(e) => {
                write!(f, "decrypted bytes are not valid UTF-8: {}", e)
            }
            ConfigDecryptionError::ValidationFailed(reason) => {
                write!(f, "decrypted credential validation failed: {}", reason)
            }
        }
    }
}

impl std::error::Error for ConfigDecryptionError {}

/// Validate that a decrypted credential is well-formed.
///
/// Rejects empty strings and strings that contain non-printable control
/// characters (excluding common whitespace), which would indicate
/// partial decryption or data corruption.
fn validate_decrypted_credential(plaintext: &str) -> Result<(), ConfigDecryptionError> {
    if plaintext.is_empty() {
        return Err(ConfigDecryptionError::ValidationFailed(
            "decrypted value is empty".to_string(),
        ));
    }
    // Check for non-printable control characters (allow \t, \n, \r for
    // multiline tokens like PEM keys)
    if plaintext
        .chars()
        .any(|c| c.is_control() && c != '\t' && c != '\n' && c != '\r')
    {
        return Err(ConfigDecryptionError::ValidationFailed(
            "decrypted value contains non-printable control characters, \
             likely corrupted"
                .to_string(),
        ));
    }
    Ok(())
}

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

        let app_data =
            crate::sys::utils::app_data_dir().map_err(|e| std::io::Error::other(e.to_string()))?;
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
    pub async fn inject_credentials(&mut self) -> crate::core::mcp::McpResult<()> {
        let db_path =
            crate::sys::utils::database_path().map_err(|e| std::io::Error::other(e.to_string()))?;

        if !db_path.exists() {
            return Ok(());
        }

        // ── Sync phase ─────────────────────────────────────────────────────────
        // Collect which servers/keys need OAuth refresh vs. can be resolved now.
        // The DB connection is opened, queried, and dropped before any .await.
        //
        // HIGH-008: rusqlite::Connection is !Send — it must NOT be held across an
        // await point. All synchronous DB access happens here; OAuth HTTP refresh
        // (async) is performed below after the connection is gone.

        enum Resolved {
            /// Value was resolved synchronously from DB.
            Done(String),
            /// OAuth provider token — needs async HTTP refresh check.
            NeedsOAuth(String),
        }

        // Collect (server_name, env_key, resolution) triples
        let mut plan: Vec<(String, String, Resolved)> = Vec::new();

        {
            // Scope: conn is dropped at the end of this block
            let conn = open_mcp_settings_db().map_err(std::io::Error::other)?;

            for (server_name, config) in &self.mcp_servers {
                for (key, value) in &config.env {
                    if value.starts_with(OAUTH_PLACEHOLDER_PREFIX) && value.ends_with('>') {
                        let provider =
                            value[OAUTH_PLACEHOLDER_PREFIX.len()..value.len() - 1].to_string();
                        plan.push((
                            server_name.clone(),
                            key.clone(),
                            Resolved::NeedsOAuth(provider),
                        ));
                    } else if value.starts_with(API_KEY_PLACEHOLDER_PREFIX) && value.ends_with('>')
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
                                match decrypt_oauth_token(&stored_value) {
                                    Ok(decrypted) => {
                                        plan.push((
                                            server_name.clone(),
                                            key.clone(),
                                            Resolved::Done(decrypted),
                                        ));
                                    }
                                    Err(e) => {
                                        tracing::warn!(
                                            "Config decryption failed for API key provider '{}': {}, \
                                             consider re-entering credentials",
                                            provider,
                                            e
                                        );
                                    }
                                }
                            }
                            Err(_) => {
                                tracing::warn!("API key not found for provider: {}", provider);
                            }
                        }
                    } else if value == CREDENTIAL_PLACEHOLDER {
                        let cred_key = format!("mcp_credential_{}_{}", server_name, key);
                        match conn.query_row(
                            "SELECT value FROM settings_v2 WHERE key = ?1",
                            rusqlite::params![cred_key],
                            |row| row.get::<_, String>(0),
                        ) {
                            Ok(stored_value) => {
                                match decrypt_mcp_credential(&stored_value) {
                                    Ok(decrypted) => {
                                        plan.push((
                                            server_name.clone(),
                                            key.clone(),
                                            Resolved::Done(decrypted),
                                        ));
                                    }
                                    Err(e) => {
                                        tracing::warn!(
                                            "Config decryption failed for credential {} / {}: {}, \
                                             consider re-entering credentials",
                                            server_name,
                                            key,
                                            e
                                        );
                                    }
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
        } // conn dropped here — no !Send value crosses the await below

        // ── Async phase ────────────────────────────────────────────────────────
        // For each NeedsOAuth entry, call the async get_oauth_token (which may
        // make an HTTP request). All DB connections within get_oauth_token are
        // also opened and dropped before their own await points.
        for (server_name, key, resolution) in plan {
            match resolution {
                Resolved::Done(val) => {
                    if let Some(config) = self.mcp_servers.get_mut(&server_name) {
                        if let Some(entry) = config.env.get_mut(&key) {
                            *entry = val;
                        }
                    }
                }
                Resolved::NeedsOAuth(provider) => {
                    match get_oauth_token(&provider).await {
                        Ok(token) => {
                            if let Some(config) = self.mcp_servers.get_mut(&server_name) {
                                if let Some(entry) = config.env.get_mut(&key) {
                                    *entry = if key == "OPENAPI_MCP_HEADERS" && provider == "notion"
                                    {
                                        format!(
                                            r#"{{"Authorization": "Bearer {}","Notion-Version": "2022-06-28"}}"#,
                                            token
                                        )
                                    } else {
                                        token
                                    };
                                    tracing::debug!(
                                        "Injected OAuth token for provider: {}",
                                        provider
                                    );
                                }
                            }
                        }
                        Err(e) => {
                            tracing::warn!(
                                "OAuth token not available for {} ({}), trying legacy credential",
                                provider,
                                e
                            );
                            // Fall back to legacy credential synchronously
                            let cred_key = format!("mcp_credential_{}_{}", server_name, key);
                            if let Ok(conn) = open_mcp_settings_db() {
                                if let Ok(stored_value) = conn.query_row(
                                    "SELECT value FROM settings_v2 WHERE key = ?1",
                                    rusqlite::params![cred_key],
                                    |row| row.get::<_, String>(0),
                                ) {
                                    match decrypt_mcp_credential(&stored_value) {
                                        Ok(decrypted) => {
                                            if let Some(config) =
                                                self.mcp_servers.get_mut(&server_name)
                                            {
                                                if let Some(entry) = config.env.get_mut(&key) {
                                                    *entry = decrypted;
                                                    tracing::debug!(
                                                        "Injected legacy credential for {} / {}",
                                                        server_name,
                                                        key
                                                    );
                                                }
                                            }
                                        }
                                        Err(decrypt_err) => {
                                            tracing::warn!(
                                                "Config decryption failed for legacy credential \
                                                 {} / {}: {}, consider re-entering credentials",
                                                server_name,
                                                key,
                                                decrypt_err
                                            );
                                        }
                                    }
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

/// Synchronous helper: read all OAuth token fields from the DB and return owned values.
/// The connection is opened and closed within this fn — no `conn` is held across await points.
struct OAuthTokenData {
    encrypted_access: String,
    expires_at: Option<i64>,
    refresh_token: Option<String>, // already decrypted
    access_token_key: String,
    expires_at_key: String,
}

fn read_oauth_token_data(provider: &str) -> Result<OAuthTokenData, String> {
    let conn = open_mcp_settings_db()?;
    let access_token_key = format!("mcp_oauth_{}_access_token", provider);
    let expires_at_key = format!("mcp_oauth_{}_expires_at", provider);
    let refresh_token_key = format!("mcp_oauth_{}_refresh_token", provider);

    let encrypted_access: String = conn
        .query_row(
            "SELECT value FROM settings_v2 WHERE key = ?1",
            rusqlite::params![access_token_key],
            |row| row.get(0),
        )
        .map_err(|_| format!("OAuth access token not found for provider: {}", provider))?;

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

    let refresh_token: Option<String> = conn
        .query_row(
            "SELECT value FROM settings_v2 WHERE key = ?1",
            rusqlite::params![refresh_token_key],
            |row| row.get::<_, String>(0),
        )
        .ok()
        .and_then(|enc| match decrypt_oauth_token(&enc) {
            Ok(token) => Some(token),
            Err(e) => {
                tracing::warn!(
                    "Config decryption failed for refresh token (provider: {}): {}, \
                     consider re-entering credentials",
                    provider,
                    e
                );
                None
            }
        });

    // conn is dropped here — no !Send value crosses an await point
    Ok(OAuthTokenData {
        encrypted_access,
        expires_at,
        refresh_token,
        access_token_key,
        expires_at_key,
    })
}

/// Write refreshed OAuth token data back to the DB (sync, no async).
fn store_refreshed_oauth_token(
    access_token_key: &str,
    expires_at_key: &str,
    new_access: &str,
    new_expires: i64,
) {
    let conn = match open_mcp_settings_db() {
        Ok(c) => c,
        Err(e) => {
            tracing::error!(
                "Failed to open MCP settings DB for storing refreshed OAuth token: {}",
                e
            );
            return;
        }
    };
    let encrypted_new = match encrypt_oauth_token(new_access) {
        Some(enc) => enc,
        None => {
            tracing::error!(
                "Failed to encrypt refreshed OAuth access token for key '{}'",
                access_token_key
            );
            return;
        }
    };
    if let Err(e) =
        upsert_settings_v2_value(&conn, access_token_key, &encrypted_new, "security", true)
    {
        tracing::error!(
            "Failed to persist refreshed OAuth access token for key '{}': {}",
            access_token_key,
            e
        );
    }
    if let Err(e) = upsert_settings_v2_value(
        &conn,
        expires_at_key,
        &new_expires.to_string(),
        "security",
        false,
    ) {
        tracing::error!(
            "Failed to persist refreshed OAuth expiry for key '{}': {}",
            expires_at_key,
            e
        );
    }
}

/// Get an OAuth token for a provider, auto-refreshing if expired.
///
/// All DB access is completed synchronously before any `.await`, ensuring
/// `rusqlite::Connection` (which is `!Send`) never crosses an await point.
async fn get_oauth_token(provider: &str) -> Result<String, String> {
    // Sync phase: read all DB data — no !Send values held past this point
    let data = read_oauth_token_data(provider)?;

    let current_time = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|d| d.as_secs() as i64)
        .unwrap_or(0);

    // Check if token is expired (with 60 second buffer)
    if let Some(exp) = data.expires_at {
        if current_time >= exp - 60 {
            tracing::info!(
                "OAuth token for {} is expired, attempting refresh",
                provider
            );

            if let Some(refresh_token) = data.refresh_token {
                // Async phase: HTTP token refresh — no DB connection in scope here
                match refresh_oauth_token(provider, &refresh_token).await {
                    Ok((new_access, new_expires)) => {
                        store_refreshed_oauth_token(
                            &data.access_token_key,
                            &data.expires_at_key,
                            &new_access,
                            new_expires,
                        );
                        tracing::info!("Successfully refreshed OAuth token for {}", provider);
                        return Ok(new_access);
                    }
                    Err(e) => {
                        tracing::warn!("Failed to refresh OAuth token for {}: {}", provider, e);
                        // Fall through to use possibly stale token
                    }
                }
            }
        }
    }

    // Decrypt and return the access token
    decrypt_oauth_token(&data.encrypted_access).map_err(|e| {
        format!(
            "Config decryption failed for OAuth token (provider: {}): {}, \
             consider re-entering credentials",
            provider, e
        )
    })
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

/// Synchronous helper: read OAuth client credentials from DB for a provider.
/// Returns (client_id, client_secret). Connection is opened and dropped here.
fn read_oauth_client_credentials(
    provider: &str,
    client_id_keys: &[&str],
    client_secret_keys: &[&str],
) -> Result<(String, String), String> {
    let conn = open_mcp_settings_db()?;

    let load_credential = |keys: &[&str], label: &str| -> Result<String, String> {
        for key in keys {
            let result: Result<String, rusqlite::Error> = conn.query_row(
                "SELECT value FROM settings_v2 WHERE key = ?1",
                rusqlite::params![key],
                |row| row.get(0),
            );
            if let Ok(stored_value) = result {
                match decrypt_oauth_token(&stored_value) {
                    Ok(decrypted) => return Ok(decrypted),
                    Err(e) => {
                        tracing::warn!(
                            "Config decryption failed for OAuth {} (provider: '{}', key: {}): {}, \
                             consider re-entering credentials",
                            label, provider, key, e
                        );
                    }
                }
            }
        }
        Err(format!(
            "OAuth {} not found or could not be decrypted for provider: {}",
            label, provider
        ))
    };

    let client_id = load_credential(client_id_keys, "client_id")?;
    let client_secret = load_credential(client_secret_keys, "client_secret")?;
    // conn dropped here
    Ok((client_id, client_secret))
}

/// Store a newly-issued refresh token back to the DB (sync).
fn store_new_refresh_token(provider: &str, new_refresh_token: &str) {
    let refresh_token_key = format!("mcp_oauth_{}_refresh_token", provider);
    let encrypted_refresh = match encrypt_oauth_token(new_refresh_token) {
        Some(enc) => enc,
        None => {
            tracing::error!(
                "Failed to encrypt new refresh token for provider: {}",
                provider
            );
            return;
        }
    };
    let conn = match open_mcp_settings_db() {
        Ok(c) => c,
        Err(e) => {
            tracing::error!(
                "Failed to open MCP settings DB for storing refresh token for provider '{}': {}",
                provider,
                e
            );
            return;
        }
    };
    if let Err(e) = upsert_settings_v2_value(
        &conn,
        &refresh_token_key,
        &encrypted_refresh,
        "security",
        true,
    ) {
        tracing::error!(
            "Failed to persist refresh token for provider '{}': {}",
            provider,
            e
        );
    } else {
        tracing::debug!("Stored new refresh token for provider: {}", provider);
    }
}

/// Refresh an OAuth token using the refresh token.
///
/// All DB access is completed before any `.await` to ensure `rusqlite::Connection`
/// (which is `!Send`) never crosses an await point.
async fn refresh_oauth_token(provider: &str, refresh_token: &str) -> Result<(String, i64), String> {
    // Sync phase: resolve provider config and read DB credentials — no !Send across await
    let provider_config = get_oauth_provider_config(provider)
        .ok_or_else(|| format!("Unknown OAuth provider: {}", provider))?;

    let (client_id, client_secret) = read_oauth_client_credentials(
        provider,
        provider_config.client_id_keys,
        provider_config.client_secret_keys,
    )?;

    // Async phase: HTTP request — no DB connection in scope
    let client = reqwest::Client::new();

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
        .await
        .map_err(|e| format!("HTTP request failed: {}", e))?;

    if !response.status().is_success() {
        let status = response.status();
        let body = response.text().await.unwrap_or_default();
        return Err(format!(
            "Token refresh failed with status {}: {}",
            status, body
        ));
    }

    let token_response: serde_json::Value = response
        .json()
        .await
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

    // If a new refresh token is provided, store it (sync DB write, no conn held across await)
    if let Some(new_refresh_token) = token_response.get("refresh_token").and_then(|v| v.as_str()) {
        store_new_refresh_token(provider, new_refresh_token);
    }

    tracing::info!(
        "Successfully refreshed OAuth token for {}, expires in {} seconds",
        provider,
        expires_in
    );

    Ok((access_token, expires_at))
}

/// Decrypt an OAuth token using machine-derived keys.
///
/// Uses the same encryption scheme as MCP credentials (AES-256-GCM with
/// machine-derived keys via KeyPurpose::McpCredentials).
///
/// Returns a detailed [`ConfigDecryptionError`] on failure so callers can
/// log actionable diagnostics instead of silently returning garbage data.
fn decrypt_oauth_token(encrypted: &str) -> Result<String, ConfigDecryptionError> {
    use crate::sys::security::machine_key::{derive_key, KeyPurpose};
    use aes_gcm::{aead::Aead, Aes256Gcm, KeyInit, Nonce};
    use base64::{engine::general_purpose, Engine as _};

    let key = derive_key(KeyPurpose::McpCredentials);
    let cipher = Aes256Gcm::new_from_slice(&key).map_err(|_| ConfigDecryptionError::CipherInit)?;

    // Decode from base64
    let combined = general_purpose::STANDARD
        .decode(encrypted)
        .map_err(ConfigDecryptionError::InvalidBase64)?;

    if combined.len() < 12 {
        return Err(ConfigDecryptionError::CiphertextTooShort { len: combined.len() });
    }

    // Split nonce and ciphertext
    let (nonce_bytes, ciphertext) = combined.split_at(12);
    let nonce = Nonce::from_slice(nonce_bytes);

    // Decrypt
    let plaintext_bytes = cipher
        .decrypt(nonce, ciphertext)
        .map_err(|_| ConfigDecryptionError::DecryptionFailed)?;
    let plaintext =
        String::from_utf8(plaintext_bytes).map_err(ConfigDecryptionError::InvalidUtf8)?;

    // Post-decryption validation: reject empty or corrupt-looking output
    validate_decrypted_credential(&plaintext)?;

    Ok(plaintext)
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

/// Decrypt an MCP credential using machine-derived keys.
///
/// Returns a detailed [`ConfigDecryptionError`] on failure so callers can
/// log actionable diagnostics instead of silently returning garbage data.
pub fn decrypt_mcp_credential(encrypted: &str) -> Result<String, ConfigDecryptionError> {
    use crate::sys::security::machine_key::{derive_key, KeyPurpose};
    use aes_gcm::{aead::Aead, Aes256Gcm, KeyInit, Nonce};
    use base64::{engine::general_purpose, Engine as _};

    let key = derive_key(KeyPurpose::McpCredentials);
    let cipher = Aes256Gcm::new_from_slice(&key).map_err(|_| ConfigDecryptionError::CipherInit)?;

    // Decode from base64
    let combined = general_purpose::STANDARD
        .decode(encrypted)
        .map_err(ConfigDecryptionError::InvalidBase64)?;

    if combined.len() < 12 {
        return Err(ConfigDecryptionError::CiphertextTooShort { len: combined.len() });
    }

    // Split nonce and ciphertext
    let (nonce_bytes, ciphertext) = combined.split_at(12);
    let nonce = Nonce::from_slice(nonce_bytes);

    // Decrypt
    let plaintext_bytes = cipher
        .decrypt(nonce, ciphertext)
        .map_err(|_| ConfigDecryptionError::DecryptionFailed)?;
    let plaintext =
        String::from_utf8(plaintext_bytes).map_err(ConfigDecryptionError::InvalidUtf8)?;

    // Post-decryption validation: reject empty or corrupt-looking output
    validate_decrypted_credential(&plaintext)?;

    Ok(plaintext)
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

    // ── Bug #18: Config decryption tests ─────────────────────────────────

    #[test]
    fn test_encrypt_decrypt_oauth_token_roundtrip() {
        let original = "ghp_abc123DEF456_test_token";
        let encrypted = encrypt_oauth_token(original)
            .expect("encryption should succeed for a valid plaintext");
        let decrypted = decrypt_oauth_token(&encrypted)
            .expect("decryption should succeed for validly-encrypted data");
        assert_eq!(decrypted, original);
    }

    #[test]
    fn test_encrypt_decrypt_mcp_credential_roundtrip() {
        let original = "sk-test-credential-value-123";
        let encrypted = encrypt_mcp_credential(original)
            .expect("encryption should succeed for a valid plaintext");
        let decrypted = decrypt_mcp_credential(&encrypted)
            .expect("decryption should succeed for validly-encrypted data");
        assert_eq!(decrypted, original);
    }

    #[test]
    fn test_decrypt_oauth_token_invalid_base64() {
        let result = decrypt_oauth_token("not!valid!base64!@#$%");
        assert!(result.is_err());
        let err = result.unwrap_err();
        let msg = err.to_string();
        assert!(
            msg.contains("not valid base64"),
            "error should mention base64, got: {}",
            msg
        );
    }

    #[test]
    fn test_decrypt_mcp_credential_invalid_base64() {
        let result = decrypt_mcp_credential("~~~invalid~~~");
        assert!(result.is_err());
        let err = result.unwrap_err();
        let msg = err.to_string();
        assert!(
            msg.contains("not valid base64"),
            "error should mention base64, got: {}",
            msg
        );
    }

    #[test]
    fn test_decrypt_oauth_token_ciphertext_too_short() {
        use base64::{engine::general_purpose, Engine as _};
        // Encode only 5 bytes -- well below the 12-byte nonce requirement
        let short_payload = general_purpose::STANDARD.encode([0u8; 5]);
        let result = decrypt_oauth_token(&short_payload);
        assert!(result.is_err());
        let err = result.unwrap_err();
        let msg = err.to_string();
        assert!(
            msg.contains("too short"),
            "error should mention 'too short', got: {}",
            msg
        );
    }

    #[test]
    fn test_decrypt_mcp_credential_ciphertext_too_short() {
        use base64::{engine::general_purpose, Engine as _};
        let short_payload = general_purpose::STANDARD.encode([0u8; 8]);
        let result = decrypt_mcp_credential(&short_payload);
        assert!(result.is_err());
        let err = result.unwrap_err();
        let msg = err.to_string();
        assert!(
            msg.contains("too short"),
            "error should mention 'too short', got: {}",
            msg
        );
    }

    #[test]
    fn test_decrypt_oauth_token_tampered_ciphertext() {
        let original = "valid_token_value";
        let encrypted = encrypt_oauth_token(original)
            .expect("encryption should succeed");

        // Tamper with the encrypted payload by flipping bits in the ciphertext portion
        use base64::{engine::general_purpose, Engine as _};
        let mut raw = general_purpose::STANDARD
            .decode(&encrypted)
            .expect("should be valid base64");
        // Flip a byte in the ciphertext (past the 12-byte nonce)
        if raw.len() > 14 {
            raw[14] ^= 0xFF;
        }
        let tampered = general_purpose::STANDARD.encode(&raw);

        let result = decrypt_oauth_token(&tampered);
        assert!(result.is_err());
        let err = result.unwrap_err();
        let msg = err.to_string();
        assert!(
            msg.contains("decryption failed") || msg.contains("tampered"),
            "error should mention decryption failure, got: {}",
            msg
        );
    }

    #[test]
    fn test_decrypt_mcp_credential_tampered_ciphertext() {
        let original = "my-secret-credential";
        let encrypted = encrypt_mcp_credential(original)
            .expect("encryption should succeed");

        use base64::{engine::general_purpose, Engine as _};
        let mut raw = general_purpose::STANDARD
            .decode(&encrypted)
            .expect("should be valid base64");
        if raw.len() > 14 {
            raw[14] ^= 0xFF;
        }
        let tampered = general_purpose::STANDARD.encode(&raw);

        let result = decrypt_mcp_credential(&tampered);
        assert!(result.is_err());
        let err = result.unwrap_err();
        let msg = err.to_string();
        assert!(
            msg.contains("decryption failed") || msg.contains("tampered"),
            "error should mention decryption failure, got: {}",
            msg
        );
    }

    #[test]
    fn test_validate_decrypted_credential_empty_string() {
        let result = validate_decrypted_credential("");
        assert!(result.is_err());
        let msg = result.unwrap_err().to_string();
        assert!(
            msg.contains("empty"),
            "error should mention empty, got: {}",
            msg
        );
    }

    #[test]
    fn test_validate_decrypted_credential_control_characters() {
        // NUL byte indicates corrupted output
        let result = validate_decrypted_credential("token\x00value");
        assert!(result.is_err());
        let msg = result.unwrap_err().to_string();
        assert!(
            msg.contains("control characters"),
            "error should mention control characters, got: {}",
            msg
        );
    }

    #[test]
    fn test_validate_decrypted_credential_allows_whitespace() {
        // Tabs and newlines are allowed (e.g., for PEM keys)
        assert!(validate_decrypted_credential("line1\nline2\ttab").is_ok());
        assert!(validate_decrypted_credential("value\r\n").is_ok());
    }

    #[test]
    fn test_validate_decrypted_credential_normal_token() {
        assert!(validate_decrypted_credential("ghp_abcDEF123456789").is_ok());
        assert!(validate_decrypted_credential("sk-proj-abc123").is_ok());
        assert!(validate_decrypted_credential("Bearer eyJhbGciOi...").is_ok());
    }

    #[test]
    fn test_config_decryption_error_display() {
        // Ensure all variants produce non-empty, distinct messages
        let errors = vec![
            ConfigDecryptionError::CipherInit,
            ConfigDecryptionError::CiphertextTooShort { len: 3 },
            ConfigDecryptionError::DecryptionFailed,
            ConfigDecryptionError::ValidationFailed("test reason".to_string()),
        ];
        let messages: Vec<String> = errors.iter().map(|e| e.to_string()).collect();
        for msg in &messages {
            assert!(!msg.is_empty(), "error display should not be empty");
        }
        // All messages should be distinct
        for i in 0..messages.len() {
            for j in (i + 1)..messages.len() {
                assert_ne!(
                    messages[i], messages[j],
                    "error messages should be distinct"
                );
            }
        }
    }
}
