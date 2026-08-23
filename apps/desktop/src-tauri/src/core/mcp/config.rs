use super::transport::TransportConfig;
use crate::core::mcp::manifest::AllowlistState;
use crate::core::mcp::McpResult;
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
    /// No encryption key could be derived, so the value was never opened.
    KeyUnavailable(String),
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
            ConfigDecryptionError::KeyUnavailable(reason) => {
                write!(f, "encryption key unavailable: {}", reason)
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

/// A credential recovered from an MCP config file or the settings database.
struct DecryptedCredential {
    value: String,
    /// The ciphertext opened only under a key older builds derived from machine
    /// identifiers alone. Any local process can recompute that key, so the
    /// value stays exposed until it is written back under the per-install key.
    from_legacy_key: bool,
}

/// Decrypt one MCP payload under the per-install key, falling back to the keys
/// a shipped build derived from machine identifiers alone.
///
/// `label` is how the payload appears in `machine_key::machine_only_payloads`;
/// the re-wrap entry points clear the same label once the value is rewritten.
fn decrypt_mcp_payload(
    encrypted: &str,
    label: &str,
) -> Result<DecryptedCredential, ConfigDecryptionError> {
    use crate::sys::security::machine_key::{self, KeyPurpose};
    use crate::sys::security::machine_key_rewrap;
    use base64::{engine::general_purpose, Engine as _};

    let combined = general_purpose::STANDARD
        .decode(encrypted)
        .map_err(ConfigDecryptionError::InvalidBase64)?;
    if combined.len() < 12 {
        return Err(ConfigDecryptionError::CiphertextTooShort {
            len: combined.len(),
        });
    }

    let opened = machine_key::open_with_key_rotation(KeyPurpose::McpCredentials, label, |key| {
        machine_key_rewrap::decrypt_combined(key, encrypted)
    })
    .map_err(|error| ConfigDecryptionError::KeyUnavailable(error.to_string()))?
    .ok_or(ConfigDecryptionError::DecryptionFailed)?;

    validate_decrypted_credential(&opened.value)?;

    Ok(DecryptedCredential {
        value: opened.value,
        from_legacy_key: opened.rewrap_required,
    })
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
/// Marker prefix for an HTTP transport credential that is encrypted AT REST in the
/// config file (e.g. "<enc:BASE64_CIPHERTEXT>"). Distinguishes encrypted values from
/// plaintext and from the resolve-on-load placeholders above.
const ENCRYPTED_AT_REST_PREFIX: &str = "<enc:";
/// Environment variable used to resolve project-scoped MCP config.
pub const PROJECT_FOLDER_ENV_VAR: &str = "AGIWORKFORCE_PROJECT_FOLDER";

/// Returns the encrypted-at-rest form of a raw credential value, or `None` if the
/// value is empty, already encrypted, or a resolve-on-load placeholder (`<from_…>`).
fn maybe_encrypt_at_rest(value: &str) -> Option<String> {
    if value.is_empty()
        || value.starts_with(ENCRYPTED_AT_REST_PREFIX)
        || value.starts_with("<from_")
    {
        return None;
    }
    encrypt_mcp_credential(value).map(|ct| format!("{ENCRYPTED_AT_REST_PREFIX}{ct}>"))
}

/// Returns the decrypted credential for an `<enc:…>` value, or `None` if the value is
/// not encrypted-at-rest (plaintext or a `<from_…>` placeholder are left untouched).
fn maybe_decrypt_at_rest(value: &str, label: &str) -> Option<DecryptedCredential> {
    let inner = value
        .strip_prefix(ENCRYPTED_AT_REST_PREFIX)?
        .strip_suffix('>')?;
    decrypt_mcp_payload(inner, label).ok()
}

fn map_http_transport_credentials<F: Fn(&str) -> Option<String>>(
    config: &mut McpServersConfig,
    transform: F,
) {
    use crate::core::mcp::transport::TransportConfig;
    // Compute the replacement BEFORE assigning so the read-borrow is released first.
    let apply = |field: &mut Option<String>| {
        let next = field.as_deref().and_then(&transform);
        if let Some(next) = next {
            *field = Some(next);
        }
    };
    for server in config.mcp_servers.values_mut() {
        if let Some(TransportConfig::Http(http)) = server.transport.as_mut() {
            apply(&mut http.api_key);
            apply(&mut http.bearer_token);
            for value in http.headers.values_mut() {
                let next = transform(value);
                if let Some(next) = next {
                    *value = next;
                }
            }
        }
    }
}

/// Encrypt raw HTTP transport credentials in place (for writing to disk).
fn encrypt_transport_credentials(config: &mut McpServersConfig) {
    map_http_transport_credentials(config, maybe_encrypt_at_rest);
}

/// Decrypt at-rest-encrypted HTTP transport credentials in place (after loading).
///
/// Reports whether any credential opened only under a legacy machine-only key,
/// so the caller can re-wrap the file those bytes came from.
fn decrypt_transport_credentials(config: &mut McpServersConfig, label: &str) -> bool {
    let from_legacy_key = std::cell::Cell::new(false);
    map_http_transport_credentials(config, |value| {
        let decrypted = maybe_decrypt_at_rest(value, label)?;
        if decrypted.from_legacy_key {
            from_legacy_key.set(true);
        }
        Some(decrypted.value)
    });
    from_legacy_key.get()
}

/// How a config file identifies itself while it still holds credentials wrapped
/// under a legacy machine-only key. Must match the label
/// `machine_key_rewrap::rewrap_encrypted_at_rest_file` clears.
fn machine_only_label(path: &std::path::Path) -> String {
    format!("file:{}", path.display())
}

/// Rewrite a config file whose credentials still open under a legacy
/// machine-only key.
///
/// The startup sweep reaches only the app-level config and the project already
/// open, so a config under any other project root is re-wrapped only here. It
/// re-reads and replaces the file, so it must not run on the loading task.
fn spawn_legacy_credential_rewrap(path: PathBuf) {
    tokio::task::spawn_blocking(move || {
        if let Err(error) =
            crate::sys::security::machine_key_rewrap::rewrap_encrypted_at_rest_file(&path)
        {
            tracing::warn!(
                "Could not re-wrap MCP credentials in {}: {error}",
                path.display()
            );
        }
    });
}
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
        let mut config: Self = serde_json::from_str(&contents)?;
        // Decrypt any at-rest-encrypted HTTP transport credentials (<enc:…>).
        if decrypt_transport_credentials(&mut config, &machine_only_label(path)) {
            spawn_legacy_credential_rewrap(path.clone());
        }
        Ok(config)
    }

    pub fn from_json(json: &str) -> crate::core::mcp::McpResult<Self> {
        let config: Self = serde_json::from_str(json)?;
        Ok(config)
    }

    pub async fn save_to_file(&self, path: &PathBuf) -> crate::core::mcp::McpResult<()> {
        // SECURITY: never write raw HTTP transport credentials (api_key / bearer_token
        // / header values) to disk in plaintext. Encrypt them at rest (<enc:…>) on a
        // clone before serializing; from_file decrypts them back on load. Placeholders
        // (<from_…>) are left untouched for the inject_credentials flow.
        let mut to_save = self.clone();
        encrypt_transport_credentials(&mut to_save);
        let json = serde_json::to_string_pretty(&to_save)?;
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

    /// Returns the path to the shared CLI dotfile MCP config,
    /// `~/.agiworkforce/mcp.json`, or `None` if the home directory can't be
    /// resolved.
    ///
    /// This is a genuinely separate, intentional cross-surface config file —
    /// not a duplicate of [`Self::default_config_path`]. `apps/cli` reads it
    /// directly as one of its default global MCP config locations
    /// (`apps/cli/src/mcp/mod.rs::load_default_mcp_configs`), `agi init`
    /// creates it by default (`apps/cli/src/init.rs`), and
    /// `apps/cli/src/sync.rs` treats it as one of the files synced across
    /// surfaces. See [`Self::merge_dotfile_servers`] for why the desktop MCP
    /// client also needs to honor it.
    pub fn dotfile_config_path() -> Option<PathBuf> {
        let home = dirs::home_dir()?;
        Some(home.join(".agiworkforce").join("mcp.json"))
    }

    /// Merge any servers declared in the shared CLI dotfile
    /// (`~/.agiworkforce/mcp.json`, see [`Self::dotfile_config_path`]) into
    /// `self`, without overwriting a server name already defined in the
    /// primary desktop config (primary config wins on name collisions).
    ///
    /// Fixes DESKTOP-MCP-DOTFILE-CONFIG-FAKE-SUCCESS-01: Settings → Developer
    /// (`DotfileSettings.tsx`) writes servers to this dotfile via the
    /// `dotfile_add_mcp_server` Tauri command, which used to show a success
    /// toast even though the live MCP client (this struct, loaded from
    /// [`Self::default_config_path`]) never read the file — the server was
    /// persisted but never actually connected or exposed tools. Call this on
    /// every config (re)load so dotfile-declared servers behave the same as
    /// servers added through the "Advanced MCP configuration" UI
    /// (`ConnectorGallery.tsx` → `mcp_update_config`).
    ///
    /// Best-effort: any I/O or parse failure is logged and treated as "no
    /// dotfile servers to merge" rather than propagated, since this file is
    /// optional and mainly written by other surfaces (CLI, this app's own
    /// Settings → Developer panel).
    pub fn merge_dotfile_servers(&mut self) {
        let Some(path) = Self::dotfile_config_path() else {
            return;
        };
        if !path.exists() {
            return;
        }

        let content = match std::fs::read_to_string(&path) {
            Ok(content) => content,
            Err(error) => {
                tracing::warn!(
                    "[MCP] Failed to read dotfile MCP config '{}': {}",
                    path.display(),
                    error
                );
                return;
            }
        };

        let parsed: serde_json::Value = match serde_json::from_str(&content) {
            Ok(value) => value,
            Err(error) => {
                tracing::warn!(
                    "[MCP] Failed to parse dotfile MCP config '{}': {}",
                    path.display(),
                    error
                );
                return;
            }
        };

        let Some(servers) = parsed.get("mcpServers").and_then(|v| v.as_object()) else {
            return;
        };

        let mut merged_count = 0usize;
        for (name, value) in servers {
            if self.mcp_servers.contains_key(name) {
                // Primary config wins on name collisions.
                continue;
            }

            match serde_json::from_value::<McpServerConfig>(value.clone()) {
                Ok(mut server_config) => {
                    if server_config.command.is_empty() && server_config.transport.is_none() {
                        tracing::warn!(
                            "[MCP] Skipping dotfile MCP server '{}': no command or transport configured",
                            name
                        );
                        continue;
                    }
                    // A shared config entry is discovery, not Desktop consent.
                    // Starting it could open a remote connection or execute an
                    // imported package-manager command during a Local launch.
                    server_config.enabled = false;
                    self.mcp_servers.insert(name.clone(), server_config);
                    merged_count += 1;
                }
                Err(error) => {
                    tracing::warn!(
                        "[MCP] Skipping invalid dotfile MCP server '{}': {}",
                        name,
                        error
                    );
                }
            }
        }

        if merged_count > 0 {
            tracing::info!(
                "[MCP] Merged {} server(s) from ~/.agiworkforce/mcp.json",
                merged_count
            );
        }
    }

    /// Write additional server entries into the shared CLI dotfile
    /// (`~/.agiworkforce/mcp.json`), creating the file (and its parent
    /// directory) if necessary and preserving any existing content.
    /// Entries whose name collides with an existing dotfile entry are
    /// overwritten (last write wins).
    ///
    /// This is the persistence half of the fix for the
    /// `import_ecosystem_mcp_servers` sibling of
    /// DESKTOP-MCP-DOTFILE-CONFIG-FAKE-SUCCESS-01: that command used to scan
    /// other AI tools' MCP configs and return the results with a success
    /// toast, but never wrote anything anywhere, so "Imported N MCP
    /// server(s)" was true only of the in-memory scan result, never of any
    /// durable state. Callers should follow this with
    /// `McpState::reload_active_config` so the live client picks up the
    /// newly-written entries immediately (mirrors `dotfile_add_mcp_server`).
    pub fn write_dotfile_servers(entries: &[(String, McpServerConfig)]) -> Result<usize, String> {
        if entries.is_empty() {
            return Ok(0);
        }

        let path = Self::dotfile_config_path().ok_or_else(|| {
            "Could not resolve home directory for ~/.agiworkforce/mcp.json".to_string()
        })?;

        if let Some(parent) = path.parent() {
            std::fs::create_dir_all(parent)
                .map_err(|e| format!("Failed to create dotfile directory: {}", e))?;
        }

        let mut root: serde_json::Value = if path.exists() {
            let content = std::fs::read_to_string(&path)
                .map_err(|e| format!("Failed to read mcp.json: {}", e))?;
            serde_json::from_str(&content)
                .map_err(|e| format!("Failed to parse mcp.json: {}", e))?
        } else {
            serde_json::json!({ "mcpServers": {} })
        };

        let servers = root
            .as_object_mut()
            .ok_or_else(|| "mcp.json root is not an object".to_string())?
            .entry("mcpServers")
            .or_insert_with(|| serde_json::json!({}));

        let servers_map = servers
            .as_object_mut()
            .ok_or_else(|| "mcpServers is not an object".to_string())?;

        let mut written = 0usize;
        for (name, config) in entries {
            let value = serde_json::to_value(config)
                .map_err(|e| format!("Failed to serialize server '{}': {}", name, e))?;
            servers_map.insert(name.clone(), value);
            written += 1;
        }

        let output = serde_json::to_string_pretty(&root)
            .map_err(|e| format!("Failed to serialize mcp.json: {}", e))?;
        std::fs::write(&path, output).map_err(|e| format!("Failed to write mcp.json: {}", e))?;

        Ok(written)
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
                enabled: false,
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

        enum CredentialTarget {
            Env(String),
            HttpBearerToken,
        }

        // Collect (server_name, target, resolution) triples.
        let mut plan: Vec<(String, CredentialTarget, Resolved)> = Vec::new();

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
                            CredentialTarget::Env(key.clone()),
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
                            Ok(stored_value) => match decrypt_oauth_token(&stored_value) {
                                Ok(decrypted) => {
                                    plan.push((
                                        server_name.clone(),
                                        CredentialTarget::Env(key.clone()),
                                        Resolved::Done(decrypted),
                                    ));
                                }
                                Err(e) => {
                                    tracing::warn!(
                                            "Skipping MCP server '{}': failed to decrypt credential '{}': {}",
                                            server_name,
                                            key,
                                            e
                                        );
                                    continue;
                                }
                            },
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
                            Ok(stored_value) => match decrypt_mcp_credential(&stored_value) {
                                Ok(decrypted) => {
                                    plan.push((
                                        server_name.clone(),
                                        CredentialTarget::Env(key.clone()),
                                        Resolved::Done(decrypted),
                                    ));
                                }
                                Err(e) => {
                                    tracing::warn!(
                                            "Skipping MCP server '{}': failed to decrypt credential '{}': {}",
                                            server_name,
                                            key,
                                            e
                                        );
                                    continue;
                                }
                            },
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

                if let Some(TransportConfig::Http(http_config)) = &config.transport {
                    if let Some(value) = &http_config.bearer_token {
                        if value.starts_with(OAUTH_PLACEHOLDER_PREFIX) && value.ends_with('>') {
                            let provider =
                                value[OAUTH_PLACEHOLDER_PREFIX.len()..value.len() - 1].to_string();
                            plan.push((
                                server_name.clone(),
                                CredentialTarget::HttpBearerToken,
                                Resolved::NeedsOAuth(provider),
                            ));
                        } else if value.starts_with(API_KEY_PLACEHOLDER_PREFIX)
                            && value.ends_with('>')
                        {
                            let provider = value[API_KEY_PLACEHOLDER_PREFIX.len()..value.len() - 1]
                                .to_string();
                            let api_key_storage_key = format!("api_key_{}", provider);
                            match conn.query_row(
                                "SELECT value FROM settings_v2 WHERE key = ?1",
                                rusqlite::params![api_key_storage_key],
                                |row| row.get::<_, String>(0),
                            ) {
                                Ok(stored_value) => match decrypt_oauth_token(&stored_value) {
                                    Ok(decrypted) => {
                                        plan.push((
                                            server_name.clone(),
                                            CredentialTarget::HttpBearerToken,
                                            Resolved::Done(decrypted),
                                        ));
                                    }
                                    Err(e) => {
                                        tracing::warn!(
                                            "Skipping MCP server '{}': failed to decrypt transport bearer token: {}",
                                            server_name,
                                            e
                                        );
                                    }
                                },
                                Err(_) => {
                                    tracing::warn!(
                                        "API key not found for remote MCP server: {}",
                                        provider
                                    );
                                }
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
        for (server_name, target, resolution) in plan {
            match resolution {
                Resolved::Done(val) => {
                    if let Some(config) = self.mcp_servers.get_mut(&server_name) {
                        match target {
                            CredentialTarget::Env(key) => {
                                if let Some(entry) = config.env.get_mut(&key) {
                                    *entry = val;
                                }
                            }
                            CredentialTarget::HttpBearerToken => {
                                if let Some(TransportConfig::Http(http_config)) =
                                    &mut config.transport
                                {
                                    http_config.bearer_token = Some(val);
                                }
                            }
                        }
                    }
                }
                Resolved::NeedsOAuth(provider) => {
                    match get_oauth_token(&provider).await {
                        Ok(token) => {
                            if let Some(config) = self.mcp_servers.get_mut(&server_name) {
                                match &target {
                                    CredentialTarget::Env(key) => {
                                        if let Some(entry) = config.env.get_mut(key) {
                                            *entry = if key == "OPENAPI_MCP_HEADERS"
                                                && provider == "notion"
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
                                    CredentialTarget::HttpBearerToken => {
                                        if let Some(TransportConfig::Http(http_config)) =
                                            &mut config.transport
                                        {
                                            http_config.bearer_token = Some(token);
                                            tracing::debug!(
                                                "Injected OAuth bearer token for remote MCP provider: {}",
                                                provider
                                            );
                                        }
                                    }
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
                            let key = match &target {
                                CredentialTarget::Env(key) => key.as_str(),
                                CredentialTarget::HttpBearerToken => "bearer_token",
                            };
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
                                                match &target {
                                                    CredentialTarget::Env(key) => {
                                                        if let Some(entry) = config.env.get_mut(key)
                                                        {
                                                            *entry = decrypted;
                                                            tracing::debug!(
                                                                "Injected legacy credential for {} / {}",
                                                                server_name,
                                                                key
                                                            );
                                                        }
                                                    }
                                                    CredentialTarget::HttpBearerToken => {
                                                        if let Some(TransportConfig::Http(
                                                            http_config,
                                                        )) = &mut config.transport
                                                        {
                                                            http_config.bearer_token =
                                                                Some(decrypted);
                                                            tracing::debug!(
                                                                "Injected legacy transport bearer credential for {}",
                                                                server_name
                                                            );
                                                        }
                                                    }
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
    crate::data::db::key_management::open_registered_main_database_connection()
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

    let load_credential =
        |keys: &[&str], label: &str| -> Result<String, String> {
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
/// KeyPurpose::McpCredentials), including the read-back of tokens a shipped
/// build wrapped under the legacy machine-only key.
///
/// Returns a detailed [`ConfigDecryptionError`] on failure so callers can
/// log actionable diagnostics instead of silently returning garbage data.
///
/// Visible to the sibling `oauth` module which uses the same decryption logic
/// for loading persisted token sets.
pub(super) fn decrypt_oauth_token(encrypted: &str) -> Result<String, ConfigDecryptionError> {
    decrypt_mcp_payload(encrypted, "mcp:oauth-token").map(|decrypted| decrypted.value)
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

/// Decrypt an MCP credential under the per-install key, or the legacy
/// machine-only key an older build used to write it.
///
/// Returns a detailed [`ConfigDecryptionError`] on failure so callers can
/// log actionable diagnostics instead of silently returning garbage data.
pub fn decrypt_mcp_credential(encrypted: &str) -> Result<String, ConfigDecryptionError> {
    decrypt_mcp_payload(encrypted, "mcp:credential").map(|decrypted| decrypted.value)
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

// ── MCP Bundle support (spec 2025-11-25) ─────────────────────────────────────

/// Magic string embedded in every `.mcpb` bundle file to detect the format.
const BUNDLE_MAGIC: &str = "mcpb/1";

/// MCP Bundle — packages multiple server configurations into a single portable file.
///
/// Bundles (`.mcpb`) allow sharing a curated set of MCP server configurations
/// with a team or publishing them to a marketplace. They are JSON documents
/// containing a `magic` field for format detection, plus the server list and
/// arbitrary metadata.
///
/// # File format (`.mcpb`)
/// ```json
/// {
///   "magic": "mcpb/1",
///   "name": "My Workspace Bundle",
///   "version": "1.0.0",
///   "description": "Filesystem + GitHub for the backend team",
///   "servers": { ... },
///   "metadata": { ... }
/// }
/// ```
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct McpBundle {
    /// Format discriminator — must be `"mcpb/1"` for the current bundle version.
    #[serde(default = "bundle_magic_default")]
    pub magic: String,

    /// Human-readable bundle name displayed in the UI.
    pub name: String,

    /// Semantic version string (e.g. `"1.2.0"`).
    pub version: String,

    /// Optional description shown when browsing bundles.
    #[serde(skip_serializing_if = "Option::is_none")]
    pub description: Option<String>,

    /// The server configurations packaged in this bundle.
    ///
    /// Stored as a flat map (server-name → config) matching the layout of
    /// [`McpServersConfig::mcp_servers`] so bundles can be merged directly.
    pub servers: HashMap<String, McpServerConfig>,

    /// Arbitrary key-value metadata (author, homepage, tags, etc.).
    #[serde(default)]
    pub metadata: HashMap<String, serde_json::Value>,
}

fn bundle_magic_default() -> String {
    BUNDLE_MAGIC.to_string()
}

impl McpBundle {
    /// Validate that the bundle is internally consistent.
    ///
    /// Returns `Err` if:
    /// - The `magic` field does not match `"mcpb/1"` (wrong format or version)
    /// - `name` or `version` is empty
    fn validate(&self) -> McpResult<()> {
        if self.magic != BUNDLE_MAGIC {
            return Err(crate::core::mcp::McpError::InvalidConfig(format!(
                "Unsupported bundle format '{}', expected '{}'",
                self.magic, BUNDLE_MAGIC
            )));
        }
        if self.name.trim().is_empty() {
            return Err(crate::core::mcp::McpError::InvalidConfig(
                "Bundle name must not be empty".to_string(),
            ));
        }
        if self.version.trim().is_empty() {
            return Err(crate::core::mcp::McpError::InvalidConfig(
                "Bundle version must not be empty".to_string(),
            ));
        }
        Ok(())
    }
}

/// Load an [`McpBundle`] from a `.mcpb` file on disk.
///
/// Reads the file, parses the JSON, and validates the bundle magic before
/// returning. Returns an error if the file is missing, malformed, or the
/// bundle format version does not match.
pub fn load_bundle(path: &std::path::Path) -> McpResult<McpBundle> {
    let content = std::fs::read_to_string(path).map_err(|e| {
        crate::core::mcp::McpError::InvalidConfig(format!(
            "Failed to read bundle file '{}': {}",
            path.display(),
            e
        ))
    })?;

    let bundle: McpBundle = serde_json::from_str(&content).map_err(|e| {
        crate::core::mcp::McpError::InvalidConfig(format!(
            "Failed to parse bundle file '{}': {}",
            path.display(),
            e
        ))
    })?;

    bundle.validate()?;

    tracing::info!(
        "[MCP Bundle] Loaded bundle '{}' v{} with {} server(s) from '{}'",
        bundle.name,
        bundle.version,
        bundle.servers.len(),
        path.display()
    );

    Ok(bundle)
}

fn launched_npm_package(server: &McpServerConfig) -> Option<&str> {
    let runner = std::path::Path::new(&server.command)
        .file_stem()
        .and_then(|stem| stem.to_str())?;
    if !matches!(runner, "npx" | "bunx" | "pnpx") {
        return None;
    }
    let spec = server
        .args
        .iter()
        .find(|arg| !arg.starts_with('-'))
        .map(String::as_str)?;
    Some(match spec.rfind('@') {
        Some(0) | None => spec,
        Some(version_at) => &spec[..version_at],
    })
}

/// Install an [`McpBundle`] into an existing [`McpServersConfig`].
///
/// Merges the bundle's server configurations into `config`. Existing entries
/// with the same name are overwritten so the bundle acts as a canonical
/// source of truth for the servers it declares.
///
/// This function is purely in-memory; callers are responsible for persisting
/// the updated config via [`McpServersConfig::save_to_file`].
///
/// `allowlist` must be resolved from the packaged resource by the caller; a
/// missing list denies every package in a release build.
pub fn install_bundle(
    bundle: &McpBundle,
    config: &mut McpServersConfig,
    allowlist: &AllowlistState,
) -> McpResult<()> {
    bundle.validate()?;

    let mut installed = 0usize;
    for (server_name, server_config) in &bundle.servers {
        if let Some(package) = launched_npm_package(server_config) {
            if !allowlist.permits(package) {
                return Err(crate::core::mcp::McpError::InvalidConfig(format!(
                    "MCP package '{}' (server '{}') is not on the allow-list",
                    package, server_name
                )));
            }
        }
        let prev = config
            .mcp_servers
            .insert(server_name.clone(), server_config.clone());
        if prev.is_some() {
            tracing::debug!(
                "[MCP Bundle] Overwrote existing server config '{}' from bundle '{}'",
                server_name,
                bundle.name
            );
        }
        installed += 1;
    }

    tracing::info!(
        "[MCP Bundle] Installed {} server(s) from bundle '{}' v{}",
        installed,
        bundle.name,
        bundle.version
    );

    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn transport_credential_at_rest_roundtrip() {
        let secret = "sk-super-secret-bearer-token";
        let encrypted = maybe_encrypt_at_rest(secret).expect("raw value should encrypt");
        assert!(encrypted.starts_with(ENCRYPTED_AT_REST_PREFIX));
        assert!(
            !encrypted.contains(secret),
            "encrypted-at-rest value must not contain the plaintext secret"
        );
        let decrypted = maybe_decrypt_at_rest(&encrypted, "test:mcp").expect("should decrypt");
        assert_eq!(decrypted.value, secret);
        assert!(
            !decrypted.from_legacy_key,
            "a value this build encrypted must not be reported as legacy"
        );

        // Placeholders / already-encrypted / empty are NOT re-encrypted.
        assert!(maybe_encrypt_at_rest("<from_api_key:vercel>").is_none());
        assert!(maybe_encrypt_at_rest(&encrypted).is_none());
        assert!(maybe_encrypt_at_rest("").is_none());
        // Plaintext / placeholders are NOT treated as encrypted on load.
        assert!(maybe_decrypt_at_rest("plaintext-token", "test:mcp").is_none());
        assert!(maybe_decrypt_at_rest("<from_api_key:vercel>", "test:mcp").is_none());
    }

    fn legacy_mcp_key() -> [u8; 32] {
        crate::sys::security::machine_key::legacy_machine_only_keys(
            crate::sys::security::machine_key::KeyPurpose::McpCredentials,
        )
        .first()
        .copied()
        .expect("a legacy candidate always exists")
    }

    /// The re-wrap runs off the loading task, so the file changes shortly after
    /// `from_file` returns.
    async fn config_after_rewrap(path: &std::path::Path, legacy_ciphertext: &str) -> String {
        for _ in 0..200 {
            let current = std::fs::read_to_string(path).expect("read the project config");
            if !current.contains(legacy_ciphertext) {
                return current;
            }
            tokio::time::sleep(std::time::Duration::from_millis(25)).await;
        }
        panic!("the legacy credential was never re-wrapped");
    }

    /// A shipped build encrypted this credential under a key derived from
    /// machine identifiers alone, which any local process can recompute from a
    /// stolen copy of the file. Loading it must still return the credential,
    /// and must leave the file unreadable under that key.
    ///
    /// The startup sweep enumerates only the app-level config and the project
    /// that is already open, so a project config under any other root is
    /// re-wrapped only through this path.
    #[tokio::test]
    async fn a_project_config_written_by_an_older_build_is_read_and_rewrapped() {
        use crate::sys::security::machine_key::{self, KeyPurpose};
        use crate::sys::security::machine_key_rewrap;

        let token = "sk-legacy-project-token";
        let legacy_ciphertext =
            machine_key_rewrap::encrypt_combined(&legacy_mcp_key(), token).expect("legacy encrypt");

        let dir = tempfile::tempdir().expect("temp dir");
        let path = dir.path().join(PROJECT_MCP_CONFIG_FILENAME);
        std::fs::write(
            &path,
            format!(
                "{{\"mcpServers\":{{\"vercel\":{{\"transport\":{{\"type\":\"http\",\
                 \"url\":\"https://mcp.example.com\",\
                 \"bearer_token\":\"{ENCRYPTED_AT_REST_PREFIX}{legacy_ciphertext}>\"}}}}}}}}"
            ),
        )
        .expect("seed a legacy project config");

        let config = McpServersConfig::from_file(&path)
            .await
            .expect("a config an older build wrote must still load");
        let Some(TransportConfig::Http(http)) = config.mcp_servers["vercel"].transport.clone()
        else {
            panic!("the seeded server must keep its http transport");
        };
        assert_eq!(
            http.bearer_token.as_deref(),
            Some(token),
            "a credential an older build encrypted must still decrypt"
        );

        let rewritten = config_after_rewrap(&path, &legacy_ciphertext).await;
        let start = rewritten.find(ENCRYPTED_AT_REST_PREFIX).expect("marker")
            + ENCRYPTED_AT_REST_PREFIX.len();
        let end = rewritten[start..].find('>').expect("terminator") + start;
        let rotated = &rewritten[start..end];

        let current = machine_key::try_derive_key(KeyPurpose::McpCredentials)
            .expect("install secret in tests");
        assert_eq!(
            machine_key_rewrap::decrypt_combined(&current, rotated).as_deref(),
            Some(token),
            "the re-wrapped credential must open under the per-install key"
        );
        assert_eq!(
            machine_key_rewrap::decrypt_combined(&legacy_mcp_key(), rotated),
            None,
            "the re-wrapped credential must not open under the recomputable machine-only key"
        );
    }

    // BASE-008: this was `#[ignore]`d with the note "pre-existing reasoned skip",
    // which states that it was skipped, not why. There is no why: the body
    // constructs a default struct in memory and asserts four fields — no
    // network, no filesystem, no external binary, nothing that could make it
    // opt-in. The six genuinely-ignored tests in tests/mcp_integration_test.rs
    // need a network-installable MCP server binary; this one needs nothing.
    // Un-ignored and running.
    #[test]
    fn test_default_config() {
        let config = McpServersConfig::default();
        assert!(config.mcp_servers.contains_key("filesystem"));
        assert!(config.mcp_servers.contains_key("github"));
        assert!(
            !config.mcp_servers["filesystem"].enabled,
            "packaged filesystem MCP must be opt-in because starting npx can install code and egress"
        );
        assert!(
            !config.mcp_servers["git"].enabled,
            "packaged git MCP must be opt-in"
        );
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
        let encrypted =
            encrypt_oauth_token(original).expect("encryption should succeed for a valid plaintext");
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
        let encrypted = encrypt_oauth_token(original).expect("encryption should succeed");

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
        let encrypted = encrypt_mcp_credential(original).expect("encryption should succeed");

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
        let errors = [
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

    // ── McpBundle tests ──────────────────────────────────────────────────────

    fn sample_bundle() -> McpBundle {
        let mut servers = HashMap::new();
        servers.insert(
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
        McpBundle {
            magic: "mcpb/1".to_string(),
            name: "Test Bundle".to_string(),
            version: "1.0.0".to_string(),
            description: Some("A test bundle".to_string()),
            servers,
            metadata: HashMap::new(),
        }
    }

    #[test]
    fn test_bundle_serde_roundtrip() {
        let bundle = sample_bundle();
        let json = serde_json::to_string(&bundle).unwrap();
        assert!(json.contains("mcpb/1"));
        assert!(json.contains("Test Bundle"));
        assert!(json.contains("filesystem"));

        let deserialized: McpBundle = serde_json::from_str(&json).unwrap();
        assert_eq!(deserialized.name, bundle.name);
        assert_eq!(deserialized.version, bundle.version);
        assert_eq!(deserialized.servers.len(), 1);
    }

    #[test]
    fn test_bundle_validate_ok() {
        let bundle = sample_bundle();
        assert!(bundle.validate().is_ok());
    }

    #[test]
    fn test_bundle_validate_wrong_magic() {
        let mut bundle = sample_bundle();
        bundle.magic = "mcpb/99".to_string();
        let result = bundle.validate();
        assert!(result.is_err());
        let msg = result.unwrap_err().to_string();
        assert!(msg.contains("Unsupported bundle format"), "got: {}", msg);
    }

    #[test]
    fn test_bundle_validate_empty_name() {
        let mut bundle = sample_bundle();
        bundle.name = "  ".to_string();
        let result = bundle.validate();
        assert!(result.is_err());
        let msg = result.unwrap_err().to_string();
        assert!(msg.contains("name"), "got: {}", msg);
    }

    #[test]
    fn test_bundle_validate_empty_version() {
        let mut bundle = sample_bundle();
        bundle.version = String::new();
        let result = bundle.validate();
        assert!(result.is_err());
        let msg = result.unwrap_err().to_string();
        assert!(msg.contains("version"), "got: {}", msg);
    }

    #[test]
    fn test_install_bundle_merges_servers() {
        let bundle = sample_bundle();
        let mut config = McpServersConfig {
            mcp_servers: HashMap::new(),
        };

        install_bundle(&bundle, &mut config, &permitting_allowlist()).unwrap();
        assert_eq!(config.mcp_servers.len(), 1);
        assert!(config.mcp_servers.contains_key("filesystem"));
    }

    fn permitting_allowlist() -> AllowlistState {
        AllowlistState::Loaded(crate::core::mcp::manifest::Manifest {
            version: 1,
            allowed_packages: vec!["@modelcontextprotocol/server-filesystem".to_string()],
        })
    }

    fn bundle_launching(package: &str) -> McpBundle {
        let mut bundle = sample_bundle();
        let server = bundle.servers.get_mut("filesystem").unwrap();
        server.args = vec!["-y".to_string(), package.to_string(), ".".to_string()];
        bundle
    }

    #[test]
    fn install_bundle_refuses_a_package_the_allowlist_does_not_name() {
        let bundle = bundle_launching("@modelcontextprotocol/server-filesystemm");
        let mut config = McpServersConfig {
            mcp_servers: HashMap::new(),
        };

        let err = install_bundle(&bundle, &mut config, &permitting_allowlist()).unwrap_err();

        assert!(
            err.to_string().contains("not on the allow-list"),
            "got: {err}"
        );
        assert!(config.mcp_servers.is_empty());
    }

    #[test]
    fn install_bundle_refuses_a_versioned_typosquat() {
        let bundle = bundle_launching("@modelcontextprotocol/server-filesysten@1.4.2");
        let mut config = McpServersConfig {
            mcp_servers: HashMap::new(),
        };

        assert!(install_bundle(&bundle, &mut config, &permitting_allowlist()).is_err());
        assert!(config.mcp_servers.is_empty());
    }

    #[test]
    fn install_bundle_accepts_a_listed_package_carrying_a_version() {
        let bundle = bundle_launching("@modelcontextprotocol/server-filesystem@1.4.2");
        let mut config = McpServersConfig {
            mcp_servers: HashMap::new(),
        };

        install_bundle(&bundle, &mut config, &permitting_allowlist()).unwrap();
        assert!(config.mcp_servers.contains_key("filesystem"));
    }

    #[test]
    fn install_bundle_without_a_packaged_allowlist_denies_in_release() {
        let bundle = sample_bundle();
        let mut config = McpServersConfig {
            mcp_servers: HashMap::new(),
        };

        let outcome = install_bundle(&bundle, &mut config, &AllowlistState::Absent);

        assert_eq!(outcome.is_ok(), cfg!(debug_assertions));
        assert_eq!(config.mcp_servers.is_empty(), !cfg!(debug_assertions));
    }

    #[test]
    fn test_install_bundle_overwrites_existing() {
        let bundle = sample_bundle();
        let mut config = McpServersConfig {
            mcp_servers: {
                let mut m = HashMap::new();
                // Pre-existing entry with different command
                m.insert(
                    "filesystem".to_string(),
                    McpServerConfig {
                        command: "old-npx".to_string(),
                        args: vec![],
                        env: HashMap::new(),
                        enabled: false,
                        transport: None,
                    },
                );
                m
            },
        };

        install_bundle(&bundle, &mut config, &permitting_allowlist()).unwrap();
        let fs = config.mcp_servers.get("filesystem").unwrap();
        // Should now have the bundle's version
        assert_eq!(fs.command, "npx", "existing entry should be overwritten");
        assert!(fs.enabled, "enabled should match bundle server config");
    }

    #[test]
    fn test_load_bundle_from_tempfile() {
        let bundle = sample_bundle();
        let json = serde_json::to_string(&bundle).unwrap();

        let dir = std::env::temp_dir();
        let path = dir.join("test_bundle_load.mcpb");
        std::fs::write(&path, &json).unwrap();

        let loaded = load_bundle(&path).unwrap();
        assert_eq!(loaded.name, "Test Bundle");
        assert_eq!(loaded.version, "1.0.0");
        assert_eq!(loaded.servers.len(), 1);

        let _ = std::fs::remove_file(&path);
    }

    #[test]
    fn test_load_bundle_missing_file() {
        let result = load_bundle(std::path::Path::new("/nonexistent/path/bundle.mcpb"));
        assert!(result.is_err());
        let msg = result.unwrap_err().to_string();
        assert!(msg.contains("Failed to read bundle file"), "got: {}", msg);
    }

    #[test]
    fn test_load_bundle_invalid_json() {
        let dir = std::env::temp_dir();
        let path = dir.join("test_bundle_invalid.mcpb");
        std::fs::write(&path, "{ not valid json }").unwrap();

        let result = load_bundle(&path);
        assert!(result.is_err());
        let msg = result.unwrap_err().to_string();
        assert!(msg.contains("Failed to parse bundle file"), "got: {}", msg);
        let _ = std::fs::remove_file(&path);
    }

    #[test]
    fn test_bundle_magic_default() {
        // JSON without "magic" field should deserialise to the default value
        let json = r#"{"name":"No-Magic Bundle","version":"0.1.0","servers":{}}"#;
        let bundle: McpBundle = serde_json::from_str(json).unwrap();
        assert_eq!(bundle.magic, "mcpb/1");
    }

    // ── merge_dotfile_servers (DESKTOP-MCP-DOTFILE-CONFIG-FAKE-SUCCESS-01) ──

    /// Guards tests that mutate the process-global `HOME` env var so they
    /// don't race each other when `cargo test` runs this module's tests in
    /// parallel (same pattern as
    /// `integrations::native_messaging::manifest::tests::ENV_LOCK`).
    static DOTFILE_ENV_LOCK: std::sync::Mutex<()> = std::sync::Mutex::new(());

    /// Runs `body` with `HOME` pointed at a fresh tempdir, restoring the
    /// original `HOME` afterwards.
    fn with_temp_home<F: FnOnce(&std::path::Path)>(body: F) {
        let _guard = DOTFILE_ENV_LOCK.lock().unwrap();
        let original = std::env::var("HOME").ok();
        let temp = tempfile::tempdir().expect("failed to create tempdir");
        std::env::set_var("HOME", temp.path());

        body(temp.path());

        match original {
            Some(val) => std::env::set_var("HOME", val),
            None => std::env::remove_var("HOME"),
        }
    }

    fn write_dotfile_mcp_json(home: &std::path::Path, json: &str) {
        let dir = home.join(".agiworkforce");
        std::fs::create_dir_all(&dir).unwrap();
        std::fs::write(dir.join("mcp.json"), json).unwrap();
    }

    #[test]
    fn merge_dotfile_servers_adds_new_server() {
        with_temp_home(|home| {
            write_dotfile_mcp_json(
                home,
                r#"{"mcpServers":{"my-tool":{"command":"npx","args":["-y","some-pkg"]}}}"#,
            );

            let mut config = McpServersConfig {
                mcp_servers: HashMap::new(),
            };
            config.merge_dotfile_servers();

            let server = config
                .mcp_servers
                .get("my-tool")
                .expect("dotfile server should be merged in");
            assert_eq!(server.command, "npx");
            assert_eq!(server.args, vec!["-y".to_string(), "some-pkg".to_string()]);
            assert!(
                !server.enabled,
                "shared dotfile discovery must not grant Desktop startup approval"
            );
        });
    }

    #[test]
    fn merge_dotfile_servers_primary_config_wins_on_name_collision() {
        with_temp_home(|home| {
            write_dotfile_mcp_json(
                home,
                r#"{"mcpServers":{"shared":{"command":"dotfile-cmd","args":[]}}}"#,
            );

            let mut mcp_servers = HashMap::new();
            mcp_servers.insert(
                "shared".to_string(),
                McpServerConfig {
                    command: "primary-cmd".to_string(),
                    args: vec![],
                    env: HashMap::new(),
                    enabled: true,
                    transport: None,
                },
            );
            let mut config = McpServersConfig { mcp_servers };
            config.merge_dotfile_servers();

            assert_eq!(
                config.mcp_servers.get("shared").unwrap().command,
                "primary-cmd",
                "primary config must win on name collisions"
            );
        });
    }

    #[test]
    fn merge_dotfile_servers_skips_entry_without_command_or_transport() {
        with_temp_home(|home| {
            write_dotfile_mcp_json(home, r#"{"mcpServers":{"broken":{"env":{}}}}"#);

            let mut config = McpServersConfig {
                mcp_servers: HashMap::new(),
            };
            config.merge_dotfile_servers();

            assert!(
                !config.mcp_servers.contains_key("broken"),
                "entries with no command or transport must not be merged in"
            );
        });
    }

    #[test]
    fn merge_dotfile_servers_noop_when_file_missing() {
        with_temp_home(|_home| {
            let mut config = McpServersConfig {
                mcp_servers: HashMap::new(),
            };
            config.merge_dotfile_servers();
            assert!(config.mcp_servers.is_empty());
        });
    }

    // ── write_dotfile_servers (import_ecosystem_mcp_servers persistence fix) ──

    #[test]
    fn write_dotfile_servers_creates_file_when_missing() {
        with_temp_home(|home| {
            let entries = vec![(
                "claude:filesystem".to_string(),
                McpServerConfig {
                    command: "npx".to_string(),
                    args: vec!["-y".to_string(), "some-pkg".to_string()],
                    env: HashMap::new(),
                    enabled: true,
                    transport: None,
                },
            )];

            let written = McpServersConfig::write_dotfile_servers(&entries)
                .expect("write_dotfile_servers should succeed");
            assert_eq!(written, 1);

            let dotfile_path = home.join(".agiworkforce").join("mcp.json");
            let content = std::fs::read_to_string(&dotfile_path).expect("dotfile should exist");
            let parsed: serde_json::Value =
                serde_json::from_str(&content).expect("dotfile should be valid JSON");
            let servers = parsed
                .get("mcpServers")
                .and_then(|v| v.as_object())
                .expect("mcpServers object");
            assert!(servers.contains_key("claude:filesystem"));
            assert_eq!(servers["claude:filesystem"]["command"], "npx");

            // And the newly-written entry actually merges back in for the
            // live client — the exact mechanism `reload_active_config` relies
            // on, proving this is the same durable persistence path as
            // `dotfile_add_mcp_server`.
            let mut config = McpServersConfig {
                mcp_servers: HashMap::new(),
            };
            config.merge_dotfile_servers();
            assert!(config.mcp_servers.contains_key("claude:filesystem"));
        });
    }

    #[test]
    fn write_dotfile_servers_preserves_existing_entries_and_overwrites_collisions() {
        with_temp_home(|home| {
            write_dotfile_mcp_json(
                home,
                r#"{"mcpServers":{"existing":{"command":"npx","args":["-y","old-pkg"]}}}"#,
            );

            let entries = vec![(
                "existing".to_string(),
                McpServerConfig {
                    command: "npx".to_string(),
                    args: vec!["-y".to_string(), "new-pkg".to_string()],
                    env: HashMap::new(),
                    enabled: true,
                    transport: None,
                },
            )];
            McpServersConfig::write_dotfile_servers(&entries).expect("write should succeed");

            let dotfile_path = home.join(".agiworkforce").join("mcp.json");
            let content = std::fs::read_to_string(&dotfile_path).unwrap();
            let parsed: serde_json::Value = serde_json::from_str(&content).unwrap();
            assert_eq!(
                parsed["mcpServers"]["existing"]["args"][1],
                serde_json::json!("new-pkg"),
                "same-name entries should be overwritten, last write wins"
            );
        });
    }

    #[test]
    fn write_dotfile_servers_is_a_noop_for_empty_entries() {
        with_temp_home(|home| {
            let written =
                McpServersConfig::write_dotfile_servers(&[]).expect("empty write should succeed");
            assert_eq!(written, 0);
            let dotfile_path = home.join(".agiworkforce").join("mcp.json");
            assert!(
                !dotfile_path.exists(),
                "an empty entry list must not create the dotfile"
            );
        });
    }
}
