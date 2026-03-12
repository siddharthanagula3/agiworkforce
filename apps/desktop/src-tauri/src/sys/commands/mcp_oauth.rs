//! MCP OAuth Commands
//!
//! This module provides Tauri commands for handling OAuth flows for MCP servers
//! that require OAuth authentication (GitHub, Google Drive, Slack).
//!
//! # Security
//! - Uses PKCE for all OAuth flows
//! - Tokens are encrypted with AES-256-GCM using machine-derived keys
//! - Tokens are stored in the settings_v2 database table
//! - State parameter is used to prevent CSRF attacks

use crate::core::mcp::config::{
    encrypt_oauth_token, open_mcp_settings_db, upsert_settings_v2_value,
};
use crate::core::mcp::{emit_mcp_event, McpEvent, McpServerConfig};
use crate::sys::commands::mcp::McpState;
use crate::sys::security::machine_key::{derive_key, KeyPurpose};
use aes_gcm::{
    aead::{Aead, OsRng},
    Aes256Gcm, KeyInit, Nonce,
};
use base64::{engine::general_purpose, Engine as _};
use rand::RngCore;
use serde::{Deserialize, Serialize};
use sha2::{Digest, Sha256};
use std::collections::HashMap;
use std::sync::Arc;
use std::time::{SystemTime, UNIX_EPOCH};
use tauri::{Emitter, Manager};
use tokio::sync::RwLock;

// ============================================================================
// Connector → MCP Server Registry
// ============================================================================

/// How a connector authenticates for its MCP server
#[derive(Debug, Clone)]
enum ConnectorCredentialSource {
    /// Uses OAuth token stored via mcp_oauth_tokens_{provider}
    OAuth { provider: &'static str },
    /// Uses API key stored via api_key_{connector_id}
    ApiKey,
    /// No credentials needed
    // Used by: public MCP servers that require no authentication
    #[allow(dead_code)]
    None,
}

/// Maps a connector ID to its MCP server configuration
#[derive(Debug, Clone)]
struct ConnectorMcpMapping {
    /// MCP server name (e.g., "connector-github")
    server_name: &'static str,
    /// Command to run (e.g., "npx")
    command: &'static str,
    /// Command arguments
    args: &'static [&'static str],
    /// Environment variable name(s) for credentials
    env_keys: &'static [(&'static str, &'static str)], // (env_var_name, description)
    /// How to get the credentials
    credential_source: ConnectorCredentialSource,
}

/// Get the MCP mapping for a connector, if one exists
fn get_connector_mcp_mapping(connector_id: &str) -> Option<ConnectorMcpMapping> {
    match connector_id {
        "github" => Some(ConnectorMcpMapping {
            server_name: "connector-github",
            command: "npx",
            args: &["-y", "@modelcontextprotocol/server-github"],
            env_keys: &[("GITHUB_PERSONAL_ACCESS_TOKEN", "GitHub token")],
            credential_source: ConnectorCredentialSource::OAuth { provider: "github" },
        }),
        "slack" => Some(ConnectorMcpMapping {
            server_name: "connector-slack",
            command: "npx",
            args: &["-y", "@modelcontextprotocol/server-slack"],
            env_keys: &[("SLACK_BOT_TOKEN", "Slack bot token")],
            credential_source: ConnectorCredentialSource::OAuth { provider: "slack" },
        }),
        "google_drive" => Some(ConnectorMcpMapping {
            server_name: "connector-google-drive",
            command: "npx",
            args: &["-y", "@modelcontextprotocol/server-gdrive"],
            env_keys: &[("GDRIVE_OAUTH_TOKEN", "Google Drive OAuth token")],
            credential_source: ConnectorCredentialSource::OAuth { provider: "google" },
        }),
        "figma" => Some(ConnectorMcpMapping {
            server_name: "connector-figma",
            command: "npx",
            args: &["-y", "@figma/mcp-server-figma"],
            env_keys: &[("FIGMA_ACCESS_TOKEN", "Figma access token")],
            credential_source: ConnectorCredentialSource::OAuth { provider: "figma" },
        }),
        "stripe" => Some(ConnectorMcpMapping {
            server_name: "connector-stripe",
            command: "npx",
            args: &["-y", "@stripe/mcp", "--tools=all"],
            env_keys: &[("STRIPE_SECRET_KEY", "Stripe secret key")],
            credential_source: ConnectorCredentialSource::ApiKey,
        }),
        "vercel" => Some(ConnectorMcpMapping {
            server_name: "connector-vercel",
            command: "npx",
            args: &["-y", "@vercel/mcp"],
            env_keys: &[("VERCEL_TOKEN", "Vercel token")],
            credential_source: ConnectorCredentialSource::ApiKey,
        }),
        "supabase" => Some(ConnectorMcpMapping {
            server_name: "connector-supabase",
            command: "npx",
            args: &["-y", "supabase-mcp-server"],
            env_keys: &[("SUPABASE_ACCESS_TOKEN", "Supabase access token")],
            credential_source: ConnectorCredentialSource::ApiKey,
        }),
        "sentry" => Some(ConnectorMcpMapping {
            server_name: "connector-sentry",
            command: "npx",
            args: &["-y", "@sentry/mcp-server"],
            env_keys: &[("SENTRY_AUTH_TOKEN", "Sentry auth token")],
            credential_source: ConnectorCredentialSource::ApiKey,
        }),
        "linear" => Some(ConnectorMcpMapping {
            server_name: "connector-linear",
            command: "npx",
            args: &["-y", "mcp-linear"],
            env_keys: &[("LINEAR_API_KEY", "Linear API key")],
            credential_source: ConnectorCredentialSource::ApiKey,
        }),
        "notion" => Some(ConnectorMcpMapping {
            server_name: "connector-notion",
            command: "npx",
            args: &["-y", "@notionhq/notion-mcp-server"],
            env_keys: &[("OPENAPI_MCP_HEADERS", "Notion auth headers")],
            credential_source: ConnectorCredentialSource::OAuth { provider: "notion" },
        }),
        "cloudflare" => Some(ConnectorMcpMapping {
            server_name: "connector-cloudflare",
            command: "npx",
            args: &["-y", "@cloudflare/mcp-server-cloudflare"],
            env_keys: &[("CLOUDFLARE_API_TOKEN", "Cloudflare API token")],
            credential_source: ConnectorCredentialSource::ApiKey,
        }),
        "gmail" => Some(ConnectorMcpMapping {
            server_name: "connector-gmail",
            command: "npx",
            args: &["-y", "@anthropic/mcp-server-gmail"],
            env_keys: &[("GMAIL_OAUTH_TOKEN", "Gmail OAuth token")],
            credential_source: ConnectorCredentialSource::OAuth { provider: "google" },
        }),
        "google_calendar" => Some(ConnectorMcpMapping {
            server_name: "connector-google-calendar",
            command: "npx",
            args: &["-y", "@anthropic/mcp-server-google-calendar"],
            env_keys: &[("GOOGLE_CALENDAR_OAUTH_TOKEN", "Google Calendar OAuth token")],
            credential_source: ConnectorCredentialSource::OAuth { provider: "google" },
        }),
        "outlook" => Some(ConnectorMcpMapping {
            server_name: "connector-outlook",
            command: "npx",
            args: &["-y", "@anthropic/mcp-server-outlook"],
            env_keys: &[("OUTLOOK_OAUTH_TOKEN", "Outlook OAuth token")],
            credential_source: ConnectorCredentialSource::OAuth {
                provider: "microsoft",
            },
        }),
        "jira" => Some(ConnectorMcpMapping {
            server_name: "connector-jira",
            command: "npx",
            args: &["-y", "@anthropic/mcp-server-jira"],
            env_keys: &[("JIRA_OAUTH_TOKEN", "Jira OAuth token")],
            credential_source: ConnectorCredentialSource::OAuth {
                provider: "atlassian",
            },
        }),
        _ => None,
    }
}

// ============================================================================
// Types
// ============================================================================

/// Supported MCP OAuth providers
#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum McpOAuthProvider {
    GitHub,
    Google,
    Slack,
    Notion,
    Figma,
    Microsoft,
    Atlassian,
}

impl McpOAuthProvider {
    pub fn as_str(&self) -> &'static str {
        match self {
            McpOAuthProvider::GitHub => "github",
            McpOAuthProvider::Google => "google",
            McpOAuthProvider::Slack => "slack",
            McpOAuthProvider::Notion => "notion",
            McpOAuthProvider::Figma => "figma",
            McpOAuthProvider::Microsoft => "microsoft",
            McpOAuthProvider::Atlassian => "atlassian",
        }
    }

    pub fn from_str(s: &str) -> Option<Self> {
        match s.to_lowercase().as_str() {
            "github" => Some(McpOAuthProvider::GitHub),
            "google" | "google_drive" | "googledrive" | "google-drive" | "gmail"
            | "google_calendar" | "google_sheets" | "google_docs" | "bigquery"
            | "google_analytics" => Some(McpOAuthProvider::Google),
            "slack" => Some(McpOAuthProvider::Slack),
            "notion" => Some(McpOAuthProvider::Notion),
            "figma" => Some(McpOAuthProvider::Figma),
            "outlook" | "onedrive" | "microsoft_teams" | "microsoft" | "sharepoint"
            | "dynamics_365" => Some(McpOAuthProvider::Microsoft),
            "jira" | "confluence" | "atlassian" | "bitbucket" | "trello" => {
                Some(McpOAuthProvider::Atlassian)
            }
            _ => None,
        }
    }

    /// Get the OAuth authorization URL for this provider
    pub fn auth_url(&self) -> &'static str {
        match self {
            McpOAuthProvider::GitHub => "https://github.com/login/oauth/authorize",
            McpOAuthProvider::Google => "https://accounts.google.com/o/oauth2/v2/auth",
            McpOAuthProvider::Slack => "https://slack.com/oauth/v2/authorize",
            McpOAuthProvider::Notion => "https://api.notion.com/v1/oauth/authorize",
            McpOAuthProvider::Figma => "https://www.figma.com/oauth",
            McpOAuthProvider::Microsoft => {
                "https://login.microsoftonline.com/common/oauth2/v2.0/authorize"
            }
            McpOAuthProvider::Atlassian => "https://auth.atlassian.com/authorize",
        }
    }

    /// Get the OAuth token exchange URL for this provider
    pub fn token_url(&self) -> &'static str {
        match self {
            McpOAuthProvider::GitHub => "https://github.com/login/oauth/access_token",
            McpOAuthProvider::Google => "https://oauth2.googleapis.com/token",
            McpOAuthProvider::Slack => "https://slack.com/api/oauth.v2.access",
            McpOAuthProvider::Notion => "https://api.notion.com/v1/oauth/token",
            McpOAuthProvider::Figma => "https://api.figma.com/v1/oauth/token",
            McpOAuthProvider::Microsoft => {
                "https://login.microsoftonline.com/common/oauth2/v2.0/token"
            }
            McpOAuthProvider::Atlassian => "https://auth.atlassian.com/oauth/token",
        }
    }

    /// Get the default scopes for MCP server usage
    pub fn default_scopes(&self) -> Vec<&'static str> {
        match self {
            McpOAuthProvider::GitHub => vec!["repo", "read:user", "read:org"],
            McpOAuthProvider::Google => vec![
                "https://www.googleapis.com/auth/gmail.readonly",
                "https://www.googleapis.com/auth/gmail.send",
                "https://www.googleapis.com/auth/calendar.readonly",
                "https://www.googleapis.com/auth/calendar.events",
                "https://www.googleapis.com/auth/drive.readonly",
                "https://www.googleapis.com/auth/drive.file",
                "https://www.googleapis.com/auth/spreadsheets",
                "openid",
                "email",
                "profile",
            ],
            McpOAuthProvider::Slack => {
                vec!["channels:read", "chat:write", "users:read", "files:read"]
            }
            McpOAuthProvider::Notion => vec![],
            McpOAuthProvider::Figma => vec!["files:read"],
            McpOAuthProvider::Microsoft => vec![
                "openid",
                "profile",
                "email",
                "offline_access",
                "Mail.Read",
                "Mail.Send",
                "Calendars.Read",
                "Calendars.ReadWrite",
                "Files.Read.All",
            ],
            McpOAuthProvider::Atlassian => vec![
                "read:jira-work",
                "write:jira-work",
                "read:confluence-content.all",
                "offline_access",
            ],
        }
    }

    /// Get the user info URL for fetching user details
    pub fn user_info_url(&self) -> &'static str {
        match self {
            McpOAuthProvider::GitHub => "https://api.github.com/user",
            McpOAuthProvider::Google => "https://www.googleapis.com/oauth2/v3/userinfo",
            McpOAuthProvider::Slack => "https://slack.com/api/users.identity",
            McpOAuthProvider::Notion => "https://api.notion.com/v1/users/me",
            McpOAuthProvider::Figma => "https://api.figma.com/v1/me",
            McpOAuthProvider::Microsoft => "https://graph.microsoft.com/v1.0/me",
            McpOAuthProvider::Atlassian => "https://api.atlassian.com/me",
        }
    }

    /// Get the environment variable name for client ID
    pub fn client_id_env(&self) -> &'static str {
        match self {
            McpOAuthProvider::GitHub => "GITHUB_CLIENT_ID",
            McpOAuthProvider::Google => "GOOGLE_CLIENT_ID",
            McpOAuthProvider::Slack => "SLACK_CLIENT_ID",
            McpOAuthProvider::Notion => "NOTION_CLIENT_ID",
            McpOAuthProvider::Figma => "FIGMA_CLIENT_ID",
            McpOAuthProvider::Microsoft => "MICROSOFT_CLIENT_ID",
            McpOAuthProvider::Atlassian => "ATLASSIAN_CLIENT_ID",
        }
    }

    /// Get the environment variable name for client secret
    pub fn client_secret_env(&self) -> &'static str {
        match self {
            McpOAuthProvider::GitHub => "GITHUB_CLIENT_SECRET",
            McpOAuthProvider::Google => "GOOGLE_CLIENT_SECRET",
            McpOAuthProvider::Slack => "SLACK_CLIENT_SECRET",
            McpOAuthProvider::Notion => "NOTION_CLIENT_SECRET",
            McpOAuthProvider::Figma => "FIGMA_CLIENT_SECRET",
            McpOAuthProvider::Microsoft => "MICROSOFT_CLIENT_SECRET",
            McpOAuthProvider::Atlassian => "ATLASSIAN_CLIENT_SECRET",
        }
    }

    /// Get the deep link redirect URI for this provider
    pub fn redirect_uri(&self) -> String {
        format!("agiworkforce://oauth/mcp/{}", self.as_str())
    }
}

/// Response from starting an OAuth flow
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct OAuthStartResponse {
    /// The URL to open in the browser
    pub auth_url: String,
    /// The state parameter for CSRF protection
    pub state: String,
}

/// Response from completing an OAuth flow
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct OAuthTokenResponse {
    /// The provider that was authenticated
    pub provider: String,
    /// Whether the connection was successful
    pub connected: bool,
    /// When the access token expires (Unix timestamp)
    pub expires_at: Option<i64>,
}

/// User information from the OAuth provider
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct UserInfo {
    /// The user's ID on the provider
    pub id: String,
    /// The user's display name
    pub name: Option<String>,
    /// The user's email address
    pub email: Option<String>,
    /// URL to the user's avatar
    pub avatar_url: Option<String>,
}

/// Status of an OAuth connection
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct OAuthConnectionStatus {
    /// Whether the provider is connected
    pub connected: bool,
    /// User information if connected
    pub user_info: Option<UserInfo>,
    /// When the access token expires (Unix timestamp)
    pub expires_at: Option<i64>,
}

/// Stored OAuth tokens (encrypted)
#[derive(Debug, Clone, Serialize, Deserialize)]
struct StoredTokens {
    access_token: String,
    refresh_token: Option<String>,
    expires_at: Option<i64>,
    scope: Option<String>,
    user_info: Option<UserInfo>,
}

/// PKCE challenge data
#[derive(Debug, Clone)]
struct PkceChallenge {
    code_verifier: String,
    code_challenge: String,
}

impl PkceChallenge {
    fn generate() -> Self {
        // Generate a random 64-character code verifier
        let code_verifier: String = (0..64)
            .map(|_| {
                let idx = rand::random::<usize>() % 62;
                b"ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789"[idx] as char
            })
            .collect();

        // Generate code challenge using SHA-256
        let mut hasher = Sha256::new();
        hasher.update(code_verifier.as_bytes());
        let hash = hasher.finalize();
        let code_challenge = general_purpose::URL_SAFE_NO_PAD.encode(hash);

        Self {
            code_verifier,
            code_challenge,
        }
    }
}

/// Pending OAuth flow data
#[derive(Debug, Clone)]
struct PendingOAuthFlow {
    provider: McpOAuthProvider,
    code_verifier: String,
    created_at: u64,
}

// ============================================================================
// State
// ============================================================================

/// State for managing MCP OAuth flows
pub struct McpOAuthState {
    /// Pending OAuth flows keyed by state parameter
    pending_flows: Arc<RwLock<HashMap<String, PendingOAuthFlow>>>,
    /// HTTP client for token exchange
    http_client: reqwest::Client,
}

impl Default for McpOAuthState {
    fn default() -> Self {
        Self::new().unwrap_or_else(|e| {
            tracing::warn!(
                "Failed to create configured HTTP client, using default: {}",
                e
            );
            // Fallback to a default client with timeout configuration.
            let http_client = reqwest::Client::builder()
                .timeout(std::time::Duration::from_secs(30))
                .build()
                .unwrap_or_else(|_| reqwest::Client::new());
            Self {
                pending_flows: Arc::new(RwLock::new(HashMap::new())),
                http_client,
            }
        })
    }
}

impl McpOAuthState {
    pub fn new() -> Result<Self, String> {
        Ok(Self {
            pending_flows: Arc::new(RwLock::new(HashMap::new())),
            http_client: reqwest::Client::builder()
                .timeout(std::time::Duration::from_secs(30))
                .build()
                .map_err(|e| format!("Failed to create HTTP client: {}", e))?,
        })
    }

    /// Generate a random state parameter
    fn generate_state() -> String {
        let mut bytes = [0u8; 32];
        OsRng.fill_bytes(&mut bytes);
        general_purpose::URL_SAFE_NO_PAD.encode(bytes)
    }

    /// Get the current Unix timestamp
    fn now() -> u64 {
        SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .unwrap_or_default()
            .as_secs()
    }

    /// Clean up expired pending flows (older than 10 minutes)
    async fn cleanup_expired_flows(&self) {
        let now = Self::now();
        let mut flows = self.pending_flows.write().await;
        flows.retain(|_, flow| now - flow.created_at < 600);
    }
}

// ============================================================================
// Encryption/Decryption
// ============================================================================

/// Encrypt OAuth tokens for storage
fn encrypt_tokens(tokens: &StoredTokens) -> Result<String, String> {
    let key = derive_key(KeyPurpose::McpCredentials);
    let cipher =
        Aes256Gcm::new_from_slice(&key).map_err(|e| format!("Failed to create cipher: {}", e))?;

    // Serialize tokens to JSON
    let plaintext =
        serde_json::to_string(tokens).map_err(|e| format!("Failed to serialize tokens: {}", e))?;

    // Generate random nonce
    let mut nonce_bytes = [0u8; 12];
    OsRng.fill_bytes(&mut nonce_bytes);
    let nonce = Nonce::from_slice(&nonce_bytes);

    // Encrypt
    let ciphertext = cipher
        .encrypt(nonce, plaintext.as_bytes())
        .map_err(|e| format!("Encryption failed: {}", e))?;

    // Combine nonce + ciphertext and encode as base64
    let mut combined = nonce_bytes.to_vec();
    combined.extend_from_slice(&ciphertext);

    Ok(general_purpose::STANDARD.encode(combined))
}

/// Decrypt OAuth tokens from storage
fn decrypt_tokens(encrypted: &str) -> Result<StoredTokens, String> {
    let key = derive_key(KeyPurpose::McpCredentials);
    let cipher =
        Aes256Gcm::new_from_slice(&key).map_err(|e| format!("Failed to create cipher: {}", e))?;

    // Decode base64
    let combined = general_purpose::STANDARD
        .decode(encrypted)
        .map_err(|e| format!("Failed to decode base64: {}", e))?;

    if combined.len() < 12 {
        return Err("Invalid encrypted data: too short".to_string());
    }

    // Split nonce and ciphertext
    let (nonce_bytes, ciphertext) = combined.split_at(12);
    let nonce = Nonce::from_slice(nonce_bytes);

    // Decrypt
    let plaintext = cipher
        .decrypt(nonce, ciphertext)
        .map_err(|e| format!("Decryption failed: {}", e))?;

    // Deserialize JSON
    serde_json::from_slice(&plaintext).map_err(|e| format!("Failed to deserialize tokens: {}", e))
}

// ============================================================================
// Database Operations
// ============================================================================

/// Store encrypted tokens in the database
fn store_tokens(provider: McpOAuthProvider, tokens: &StoredTokens) -> Result<(), String> {
    let encrypted = encrypt_tokens(tokens)?;
    let conn = open_mcp_settings_db()?;

    let key = format!("mcp_oauth_tokens_{}", provider.as_str());
    upsert_settings_v2_value(&conn, &key, &encrypted, "security", true)
        .map_err(|e| format!("Failed to store tokens: {}", e))?;

    let access_token_key = format!("mcp_oauth_{}_access_token", provider.as_str());
    let refresh_token_key = format!("mcp_oauth_{}_refresh_token", provider.as_str());
    let expires_at_key = format!("mcp_oauth_{}_expires_at", provider.as_str());
    let encrypted_access_token = encrypt_oauth_token(&tokens.access_token)
        .ok_or_else(|| "Failed to encrypt OAuth access token".to_string())?;

    upsert_settings_v2_value(
        &conn,
        &access_token_key,
        &encrypted_access_token,
        "security",
        true,
    )
    .map_err(|e| format!("Failed to store OAuth access token: {}", e))?;

    if let Some(refresh_token) = &tokens.refresh_token {
        let encrypted_refresh_token = encrypt_oauth_token(refresh_token)
            .ok_or_else(|| "Failed to encrypt OAuth refresh token".to_string())?;
        upsert_settings_v2_value(
            &conn,
            &refresh_token_key,
            &encrypted_refresh_token,
            "security",
            true,
        )
        .map_err(|e| format!("Failed to store OAuth refresh token: {}", e))?;
    } else {
        let _ = conn.execute(
            "DELETE FROM settings_v2 WHERE key = ?1",
            rusqlite::params![refresh_token_key],
        );
    }

    if let Some(expires_at) = tokens.expires_at {
        upsert_settings_v2_value(
            &conn,
            &expires_at_key,
            &expires_at.to_string(),
            "security",
            false,
        )
        .map_err(|e| format!("Failed to store OAuth expiry: {}", e))?;
    } else {
        let _ = conn.execute(
            "DELETE FROM settings_v2 WHERE key = ?1",
            rusqlite::params![expires_at_key],
        );
    }

    tracing::info!("OAuth tokens stored for provider: {}", provider.as_str());
    Ok(())
}

/// Retrieve encrypted tokens from the database
fn retrieve_tokens(provider: McpOAuthProvider) -> Result<Option<StoredTokens>, String> {
    let conn = open_mcp_settings_db()?;

    let key = format!("mcp_oauth_tokens_{}", provider.as_str());

    let result: Result<String, rusqlite::Error> = conn.query_row(
        "SELECT value FROM settings_v2 WHERE key = ?1",
        rusqlite::params![key],
        |row| row.get(0),
    );

    match result {
        Ok(encrypted) => {
            let tokens = decrypt_tokens(&encrypted)?;
            Ok(Some(tokens))
        }
        Err(rusqlite::Error::QueryReturnedNoRows) => {
            // Legacy key fallback: google_drive -> google migration
            if provider == McpOAuthProvider::Google {
                let legacy_key = "mcp_oauth_tokens_google_drive";
                let legacy_result: Result<String, rusqlite::Error> = conn.query_row(
                    "SELECT value FROM settings_v2 WHERE key = ?1",
                    rusqlite::params![legacy_key],
                    |row| row.get(0),
                );
                match legacy_result {
                    Ok(encrypted) => {
                        let tokens = decrypt_tokens(&encrypted)?;
                        return Ok(Some(tokens));
                    }
                    Err(_) => return Ok(None),
                }
            }
            Ok(None)
        }
        Err(e) => Err(format!("Failed to retrieve tokens: {}", e)),
    }
}

/// Delete tokens from the database
fn delete_tokens(provider: McpOAuthProvider) -> Result<(), String> {
    let conn = open_mcp_settings_db()?;

    let key = format!("mcp_oauth_tokens_{}", provider.as_str());
    let access_token_key = format!("mcp_oauth_{}_access_token", provider.as_str());
    let refresh_token_key = format!("mcp_oauth_{}_refresh_token", provider.as_str());
    let expires_at_key = format!("mcp_oauth_{}_expires_at", provider.as_str());

    conn.execute(
        "DELETE FROM settings_v2 WHERE key = ?1",
        rusqlite::params![key],
    )
    .map_err(|e| format!("Failed to delete tokens: {}", e))?;
    let _ = conn.execute(
        "DELETE FROM settings_v2 WHERE key IN (?1, ?2, ?3)",
        rusqlite::params![access_token_key, refresh_token_key, expires_at_key],
    );
    if provider == McpOAuthProvider::Google {
        let _ = conn.execute(
            "DELETE FROM settings_v2 WHERE key = ?1",
            rusqlite::params!["mcp_oauth_tokens_google_drive"],
        );
    }

    tracing::info!("OAuth tokens deleted for provider: {}", provider.as_str());
    Ok(())
}

// ============================================================================
// OAuth Client Credentials
// ============================================================================

/// Get client credentials from environment or stored settings
fn get_client_credentials(provider: McpOAuthProvider) -> Result<(String, String), String> {
    // Try environment variables first
    let client_id = std::env::var(provider.client_id_env())
        .or_else(|_| get_stored_credential(provider, "client_id"))
        .map_err(|_| {
            format!(
                "Missing {} for {}. Set it as an environment variable or store it in settings.",
                provider.client_id_env(),
                provider.as_str()
            )
        })?;

    let client_secret = std::env::var(provider.client_secret_env())
        .or_else(|_| get_stored_credential(provider, "client_secret"))
        .map_err(|_| {
            format!(
                "Missing {} for {}. Set it as an environment variable or store it in settings.",
                provider.client_secret_env(),
                provider.as_str()
            )
        })?;

    Ok((client_id, client_secret))
}

/// Get a stored credential for a provider
fn get_stored_credential(provider: McpOAuthProvider, key: &str) -> Result<String, String> {
    let conn = open_mcp_settings_db()?;

    let setting_key = format!("mcp_oauth_config_{}_{}", provider.as_str(), key);

    let encrypted: String = conn
        .query_row(
            "SELECT value FROM settings_v2 WHERE key = ?1",
            rusqlite::params![setting_key],
            |row| row.get(0),
        )
        .map_err(|_| format!("Credential {} not found", key))?;

    // Decrypt using the same mechanism as tokens
    let key_bytes = derive_key(KeyPurpose::McpCredentials);
    let cipher = Aes256Gcm::new_from_slice(&key_bytes)
        .map_err(|e| format!("Failed to create cipher: {}", e))?;

    let combined = general_purpose::STANDARD
        .decode(&encrypted)
        .map_err(|e| format!("Failed to decode: {}", e))?;

    if combined.len() < 12 {
        return Err("Invalid encrypted data".to_string());
    }

    let (nonce_bytes, ciphertext) = combined.split_at(12);
    let nonce = Nonce::from_slice(nonce_bytes);

    let plaintext = cipher
        .decrypt(nonce, ciphertext)
        .map_err(|e| format!("Decryption failed: {}", e))?;

    String::from_utf8(plaintext).map_err(|e| format!("Invalid UTF-8: {}", e))
}

// ============================================================================
// Tauri Commands
// ============================================================================

/// Start an OAuth flow for a provider
///
/// Opens the browser with the OAuth authorization URL and returns
/// the state parameter for verification in the callback.
#[tauri::command]
pub async fn mcp_oauth_start(
    provider: String,
    state: tauri::State<'_, McpOAuthState>,
    _app: tauri::AppHandle,
) -> Result<OAuthStartResponse, String> {
    let oauth_provider = McpOAuthProvider::from_str(&provider)
        .ok_or_else(|| format!("Unknown provider: {}", provider))?;

    // Clean up expired flows
    state.cleanup_expired_flows().await;

    // Get client credentials
    let (client_id, _) = get_client_credentials(oauth_provider)?;

    // Generate PKCE challenge
    let pkce = PkceChallenge::generate();

    // Generate state parameter
    let oauth_state = McpOAuthState::generate_state();

    // Build authorization URL
    let scopes = oauth_provider.default_scopes().join(" ");
    let redirect_uri = oauth_provider.redirect_uri();

    let mut auth_url = format!(
        "{}?client_id={}&redirect_uri={}&response_type=code&state={}&scope={}",
        oauth_provider.auth_url(),
        urlencoding::encode(&client_id),
        urlencoding::encode(&redirect_uri),
        urlencoding::encode(&oauth_state),
        urlencoding::encode(&scopes),
    );

    // Add PKCE parameters
    auth_url.push_str(&format!(
        "&code_challenge={}&code_challenge_method=S256",
        urlencoding::encode(&pkce.code_challenge)
    ));

    // Add provider-specific parameters
    match oauth_provider {
        McpOAuthProvider::Google => {
            auth_url.push_str("&access_type=offline&prompt=consent");
        }
        McpOAuthProvider::Slack => {
            // Slack uses user_scope for user tokens
            auth_url = format!(
                "{}?client_id={}&redirect_uri={}&response_type=code&state={}&user_scope={}",
                oauth_provider.auth_url(),
                urlencoding::encode(&client_id),
                urlencoding::encode(&redirect_uri),
                urlencoding::encode(&oauth_state),
                urlencoding::encode(&scopes),
            );
            auth_url.push_str(&format!(
                "&code_challenge={}&code_challenge_method=S256",
                urlencoding::encode(&pkce.code_challenge)
            ));
        }
        _ => {}
    }

    // Store pending flow
    {
        let mut flows = state.pending_flows.write().await;
        flows.insert(
            oauth_state.clone(),
            PendingOAuthFlow {
                provider: oauth_provider,
                code_verifier: pkce.code_verifier,
                created_at: McpOAuthState::now(),
            },
        );
    }

    // Open browser using platform-specific commands
    let auth_url_clone = auth_url.clone();
    if let Err(e) =
        tauri::async_runtime::spawn_blocking(move || open_url_in_browser(&auth_url_clone))
            .await
            .map_err(|e| format!("Failed to spawn browser task: {}", e))?
    {
        tracing::warn!("Failed to open browser: {}. URL: {}", e, auth_url);
    }

    tracing::info!(
        "OAuth flow started for provider: {}",
        oauth_provider.as_str()
    );

    Ok(OAuthStartResponse {
        auth_url,
        state: oauth_state,
    })
}

/// Handle OAuth callback with authorization code
///
/// Exchanges the authorization code for access tokens and stores them
/// encrypted in the database.
#[tauri::command]
pub async fn mcp_oauth_callback(
    provider: String,
    code: String,
    callback_state: String,
    state: tauri::State<'_, McpOAuthState>,
) -> Result<OAuthTokenResponse, String> {
    let oauth_provider = McpOAuthProvider::from_str(&provider)
        .ok_or_else(|| format!("Unknown provider: {}", provider))?;

    // Validate and consume pending flow under one write lock to avoid replay races.
    let pending_flow = {
        let mut flows = state.pending_flows.write().await;
        let flow = flows
            .get(&callback_state)
            .cloned()
            .ok_or_else(|| "Invalid or expired OAuth state".to_string())?;

        if flow.provider != oauth_provider {
            return Err("Provider mismatch".to_string());
        }

        if McpOAuthState::now().saturating_sub(flow.created_at) >= 600 {
            flows.remove(&callback_state);
            return Err("OAuth state expired. Please start again.".to_string());
        }

        flows
            .remove(&callback_state)
            .ok_or_else(|| "Invalid or expired OAuth state".to_string())?
    };

    // Get client credentials
    let (client_id, client_secret) = get_client_credentials(oauth_provider)?;

    // Exchange code for tokens
    let redirect_uri = oauth_provider.redirect_uri();

    let mut params = HashMap::new();
    params.insert("grant_type", "authorization_code");
    params.insert("code", &code);
    params.insert("redirect_uri", &redirect_uri);
    params.insert("client_id", &client_id);
    params.insert("client_secret", &client_secret);
    params.insert("code_verifier", &pending_flow.code_verifier);

    let response = state
        .http_client
        .post(oauth_provider.token_url())
        .header("Accept", "application/json")
        .form(&params)
        .send()
        .await
        .map_err(|e| format!("Token exchange request failed: {}", e))?;

    if !response.status().is_success() {
        let status = response.status();
        let error_text = response
            .text()
            .await
            .unwrap_or_else(|_| "Unknown error".to_string());
        return Err(format!(
            "Token exchange failed: {} - {}",
            status, error_text
        ));
    }

    let token_data: serde_json::Value = response
        .json()
        .await
        .map_err(|e| format!("Failed to parse token response: {}", e))?;

    // Extract tokens based on provider
    let (access_token, refresh_token, expires_in) = match oauth_provider {
        McpOAuthProvider::Slack => {
            // Slack has a different response format
            let authed_user = token_data
                .get("authed_user")
                .ok_or_else(|| "Missing authed_user in Slack response".to_string())?;
            (
                authed_user["access_token"]
                    .as_str()
                    .ok_or_else(|| "Missing access_token".to_string())?
                    .to_string(),
                authed_user["refresh_token"].as_str().map(|s| s.to_string()),
                authed_user["expires_in"].as_u64(),
            )
        }
        _ => (
            token_data["access_token"]
                .as_str()
                .ok_or_else(|| "Missing access_token".to_string())?
                .to_string(),
            token_data["refresh_token"].as_str().map(|s| s.to_string()),
            token_data["expires_in"].as_u64(),
        ),
    };

    // Calculate expiration timestamp
    let expires_at = expires_in.map(|secs| McpOAuthState::now() as i64 + secs as i64);

    // Fetch user info
    let user_info = fetch_user_info(oauth_provider, &access_token, &state.http_client)
        .await
        .ok();

    // Store tokens
    let stored_tokens = StoredTokens {
        access_token,
        refresh_token,
        expires_at,
        scope: token_data["scope"].as_str().map(|s| s.to_string()),
        user_info,
    };

    store_tokens(oauth_provider, &stored_tokens)?;

    tracing::info!(
        "OAuth callback completed for provider: {}",
        oauth_provider.as_str()
    );

    Ok(OAuthTokenResponse {
        provider: oauth_provider.as_str().to_string(),
        connected: true,
        expires_at,
    })
}

/// Check the connection status for a provider
#[tauri::command]
pub async fn mcp_oauth_status(provider: String) -> Result<OAuthConnectionStatus, String> {
    let oauth_provider = McpOAuthProvider::from_str(&provider)
        .ok_or_else(|| format!("Unknown provider: {}", provider))?;

    match retrieve_tokens(oauth_provider)? {
        Some(tokens) => {
            // Check if token is expired
            let now = McpOAuthState::now() as i64;
            let is_expired = tokens.expires_at.map(|exp| exp <= now).unwrap_or(false);

            if is_expired && tokens.refresh_token.is_none() {
                // Token expired and no refresh token available
                return Ok(OAuthConnectionStatus {
                    connected: false,
                    user_info: None,
                    expires_at: None,
                });
            }

            Ok(OAuthConnectionStatus {
                connected: true,
                user_info: tokens.user_info,
                expires_at: tokens.expires_at,
            })
        }
        None => Ok(OAuthConnectionStatus {
            connected: false,
            user_info: None,
            expires_at: None,
        }),
    }
}

/// Disconnect a provider by removing stored tokens and MCP server
#[tauri::command]
pub async fn mcp_oauth_disconnect(
    provider: String,
    app_handle: tauri::AppHandle,
) -> Result<(), String> {
    tracing::info!("Disconnecting connector: {}", provider);

    // Disconnect and remove MCP server first so failures do not silently report success.
    if let Some(mapping) = get_connector_mcp_mapping(&provider) {
        let server_name = mapping.server_name.to_string();
        if let Some(mcp_state) = app_handle.try_state::<McpState>() {
            // Disconnect only when currently connected.
            if mcp_state
                .client
                .get_connected_servers()
                .contains(&server_name)
            {
                if let Err(err) = mcp_state.client.disconnect_server(&server_name).await {
                    let err_message = format!(
                        "Connector '{}' MCP server '{}' disconnect failed: {}",
                        provider, server_name, err
                    );
                    emit_mcp_event(
                        &app_handle,
                        McpEvent::ServerConnectionChanged {
                            server_name: server_name.clone(),
                            connected: false,
                            error: Some(err_message.clone()),
                        },
                    );
                    return Err(err_message);
                }
            }

            // Remove from persistent config
            let config_snapshot = {
                let mut config = mcp_state.config.lock();
                config.mcp_servers.remove(&server_name);
                config.clone()
            };
            mcp_state
                .persist_config_snapshot(&config_snapshot)
                .await
                .map_err(|e| format!("Failed to save MCP config after disconnect: {}", e))?;

            emit_mcp_event(
                &app_handle,
                McpEvent::ServerConnectionChanged {
                    server_name: server_name.clone(),
                    connected: false,
                    error: None,
                },
            );
            emit_mcp_event(
                &app_handle,
                McpEvent::ToolsUpdated {
                    server_name: server_name.clone(),
                    tool_count: 0,
                },
            );
        }
    }

    // Remove OAuth tokens if this is an OAuth provider.
    if let Some(oauth_provider) = McpOAuthProvider::from_str(&provider) {
        delete_tokens(oauth_provider)?;
    }

    // Also delete any stored API key.
    if let Ok(conn) = open_mcp_settings_db() {
        let api_key_key = format!("api_key_{}", provider);
        let _ = conn.execute(
            "DELETE FROM settings_v2 WHERE key = ?1",
            rusqlite::params![api_key_key],
        );
    }

    let _ = app_handle.emit("connector:disconnected", &provider);
    tracing::info!("Disconnected connector: {}", provider);
    Ok(())
}

/// Refresh expired tokens for a provider
#[tauri::command]
pub async fn mcp_oauth_refresh(
    provider: String,
    state: tauri::State<'_, McpOAuthState>,
) -> Result<OAuthTokenResponse, String> {
    let oauth_provider = McpOAuthProvider::from_str(&provider)
        .ok_or_else(|| format!("Unknown provider: {}", provider))?;

    // Retrieve existing tokens
    let tokens = retrieve_tokens(oauth_provider)?
        .ok_or_else(|| format!("No tokens found for provider: {}", provider))?;

    let refresh_token = tokens
        .refresh_token
        .ok_or_else(|| "No refresh token available".to_string())?;

    // Get client credentials
    let (client_id, client_secret) = get_client_credentials(oauth_provider)?;

    // Build refresh request
    let mut params = HashMap::new();
    params.insert("grant_type", "refresh_token");
    params.insert("refresh_token", &refresh_token);
    params.insert("client_id", &client_id);
    params.insert("client_secret", &client_secret);

    let response = state
        .http_client
        .post(oauth_provider.token_url())
        .header("Accept", "application/json")
        .form(&params)
        .send()
        .await
        .map_err(|e| format!("Token refresh request failed: {}", e))?;

    if !response.status().is_success() {
        let status = response.status();
        let error_text = response
            .text()
            .await
            .unwrap_or_else(|_| "Unknown error".to_string());
        return Err(format!("Token refresh failed: {} - {}", status, error_text));
    }

    let token_data: serde_json::Value = response
        .json()
        .await
        .map_err(|e| format!("Failed to parse token response: {}", e))?;

    // Extract new tokens
    let access_token = token_data["access_token"]
        .as_str()
        .ok_or_else(|| "Missing access_token in refresh response".to_string())?
        .to_string();

    // Some providers may return a new refresh token
    let new_refresh_token = token_data["refresh_token"]
        .as_str()
        .map(|s| s.to_string())
        .or(Some(refresh_token));

    let expires_in = token_data["expires_in"].as_u64();
    let expires_at = expires_in.map(|secs| McpOAuthState::now() as i64 + secs as i64);

    // Fetch updated user info
    let user_info = fetch_user_info(oauth_provider, &access_token, &state.http_client)
        .await
        .ok();

    // Store updated tokens
    let stored_tokens = StoredTokens {
        access_token,
        refresh_token: new_refresh_token,
        expires_at,
        scope: token_data["scope"].as_str().map(|s| s.to_string()),
        user_info,
    };

    store_tokens(oauth_provider, &stored_tokens)?;

    tracing::info!(
        "OAuth tokens refreshed for provider: {}",
        oauth_provider.as_str()
    );

    Ok(OAuthTokenResponse {
        provider: oauth_provider.as_str().to_string(),
        connected: true,
        expires_at,
    })
}

/// Get the access token for a provider (for MCP server use)
/// This is an internal function, not exposed as a Tauri command
pub fn get_access_token(provider: McpOAuthProvider) -> Result<String, String> {
    let tokens = retrieve_tokens(provider)?
        .ok_or_else(|| format!("No tokens found for provider: {}", provider.as_str()))?;

    // Check if token is expired
    let now = McpOAuthState::now() as i64;
    if let Some(expires_at) = tokens.expires_at {
        if expires_at <= now {
            return Err(format!(
                "Access token for {} has expired. Please re-authenticate.",
                provider.as_str()
            ));
        }
    }

    Ok(tokens.access_token)
}

/// Store client credentials for a provider
#[tauri::command]
pub async fn mcp_oauth_set_credentials(
    provider: String,
    client_id: String,
    client_secret: String,
) -> Result<(), String> {
    let oauth_provider = McpOAuthProvider::from_str(&provider)
        .ok_or_else(|| format!("Unknown provider: {}", provider))?;

    let conn = open_mcp_settings_db()?;

    // Encrypt and store client_id
    let encrypted_id = encrypt_credential(&client_id)?;
    let id_key = format!("mcp_oauth_config_{}_client_id", oauth_provider.as_str());
    upsert_settings_v2_value(&conn, &id_key, &encrypted_id, "security", true)
        .map_err(|e| format!("Failed to store client_id: {}", e))?;

    // Encrypt and store client_secret
    let encrypted_secret = encrypt_credential(&client_secret)?;
    let secret_key = format!("mcp_oauth_config_{}_client_secret", oauth_provider.as_str());
    upsert_settings_v2_value(&conn, &secret_key, &encrypted_secret, "security", true)
        .map_err(|e| format!("Failed to store client_secret: {}", e))?;

    tracing::info!(
        "OAuth credentials stored for provider: {}",
        oauth_provider.as_str()
    );

    Ok(())
}

/// Encrypt a single credential value
fn encrypt_credential(value: &str) -> Result<String, String> {
    let key = derive_key(KeyPurpose::McpCredentials);
    let cipher =
        Aes256Gcm::new_from_slice(&key).map_err(|e| format!("Failed to create cipher: {}", e))?;

    let mut nonce_bytes = [0u8; 12];
    OsRng.fill_bytes(&mut nonce_bytes);
    let nonce = Nonce::from_slice(&nonce_bytes);

    let ciphertext = cipher
        .encrypt(nonce, value.as_bytes())
        .map_err(|e| format!("Encryption failed: {}", e))?;

    let mut combined = nonce_bytes.to_vec();
    combined.extend_from_slice(&ciphertext);

    Ok(general_purpose::STANDARD.encode(combined))
}

// ============================================================================
// Helper Functions
// ============================================================================

/// Open a URL in the default browser using platform-specific commands
fn open_url_in_browser(url: &str) -> Result<(), std::io::Error> {
    #[cfg(target_os = "macos")]
    {
        std::process::Command::new("open").arg(url).spawn()?;
    }

    #[cfg(target_os = "windows")]
    {
        std::process::Command::new("cmd")
            .args(["/C", "start", "", url])
            .spawn()?;
    }

    #[cfg(target_os = "linux")]
    {
        std::process::Command::new("xdg-open").arg(url).spawn()?;
    }

    Ok(())
}

/// Fetch user info from the provider
async fn fetch_user_info(
    provider: McpOAuthProvider,
    access_token: &str,
    client: &reqwest::Client,
) -> Result<UserInfo, String> {
    let response = client
        .get(provider.user_info_url())
        .bearer_auth(access_token)
        .header("Accept", "application/json")
        .header("User-Agent", "AGI-Workforce/1.0")
        .send()
        .await
        .map_err(|e| format!("Failed to fetch user info: {}", e))?;

    if !response.status().is_success() {
        return Err(format!("Failed to fetch user info: {}", response.status()));
    }

    let data: serde_json::Value = response
        .json()
        .await
        .map_err(|e| format!("Failed to parse user info: {}", e))?;

    match provider {
        McpOAuthProvider::GitHub => Ok(UserInfo {
            id: data["id"]
                .as_i64()
                .map(|i| i.to_string())
                .unwrap_or_default(),
            name: data["name"]
                .as_str()
                .or(data["login"].as_str())
                .map(|s| s.to_string()),
            email: data["email"].as_str().map(|s| s.to_string()),
            avatar_url: data["avatar_url"].as_str().map(|s| s.to_string()),
        }),
        McpOAuthProvider::Google | McpOAuthProvider::Microsoft => Ok(UserInfo {
            id: data["sub"].as_str().unwrap_or_default().to_string(),
            name: data["name"].as_str().map(|s| s.to_string()),
            email: data["email"].as_str().map(|s| s.to_string()),
            avatar_url: data["picture"].as_str().map(|s| s.to_string()),
        }),
        McpOAuthProvider::Slack => {
            let user = data.get("user").unwrap_or(&data);
            Ok(UserInfo {
                id: user["id"].as_str().unwrap_or_default().to_string(),
                name: user["name"].as_str().map(|s| s.to_string()),
                email: user["email"].as_str().map(|s| s.to_string()),
                avatar_url: user["image_72"].as_str().map(|s| s.to_string()),
            })
        }
        _ => Ok(UserInfo {
            id: data["id"]
                .as_str()
                .or(data["account_id"].as_str())
                .unwrap_or_default()
                .to_string(),
            name: data["name"]
                .as_str()
                .or(data["display_name"].as_str())
                .map(|s| s.to_string()),
            email: data["email"].as_str().map(|s| s.to_string()),
            avatar_url: data["avatar_url"]
                .as_str()
                .or(data["img"].as_str())
                .or(data["picture"].as_str())
                .map(|s| s.to_string()),
        }),
    }
}

/// Lists all connector provider IDs that have stored OAuth tokens or API keys
#[tauri::command]
pub async fn mcp_list_connected_providers() -> Result<Vec<String>, String> {
    let conn = open_mcp_settings_db()?;

    let mut providers = Vec::new();

    let known_providers = [
        "gmail",
        "google_calendar",
        "google_drive",
        "google_sheets",
        "notion",
        "figma",
        "slack",
        "canva",
        "atlassian",
        "hubspot",
        "linear",
        "github",
        "vercel",
        "stripe",
        "supabase",
        "context7",
        "outlook",
        "intercom",
        "teams",
        "discord",
        "asana",
        "monday",
        "clickup",
        "jira",
        "airtable",
        "sentry",
        "cloudflare",
        "netlify",
        "onedrive",
        "dropbox",
        "box",
        "confluence",
        "trello",
        "salesforce",
        "zendesk",
        "twilio",
        "sendgrid",
        "mailchimp",
        "openai",
        "anthropic",
        "youtube",
        "twitter",
        "linkedin",
        "facebook",
        "instagram",
        "pinterest",
        "reddit",
        "spotify",
        "zoom",
        "webex",
    ];

    for provider in &known_providers {
        // Check OAuth token
        let token_key = format!("mcp_oauth_tokens_{}", provider);
        let has_token: bool = conn
            .query_row(
                "SELECT COUNT(*) FROM settings_v2 WHERE key = ?1",
                rusqlite::params![token_key],
                |row| row.get::<_, i64>(0),
            )
            .unwrap_or(0)
            > 0;

        if has_token {
            providers.push(provider.to_string());
            continue;
        }

        // Check API key
        let api_key = format!("api_key_{}", provider);
        let has_api_key: bool = conn
            .query_row(
                "SELECT COUNT(*) FROM settings_v2 WHERE key = ?1",
                rusqlite::params![api_key],
                |row| row.get::<_, i64>(0),
            )
            .unwrap_or(0)
            > 0;

        if has_api_key {
            providers.push(provider.to_string());
        }
    }

    Ok(providers)
}

/// Connects a connector by spawning its MCP server with stored credentials
#[tauri::command]
pub async fn mcp_connect_connector(
    connector_id: String,
    app_handle: tauri::AppHandle,
) -> Result<(), String> {
    tracing::info!("Connecting connector MCP server: {}", connector_id);

    let mapping = match get_connector_mcp_mapping(&connector_id) {
        Some(m) => m,
        None => {
            // No MCP mapping for this connector — mark connected without MCP
            tracing::info!(
                "No MCP server mapping for connector '{}', skipping MCP setup",
                connector_id
            );
            let _ = app_handle.emit("connector:connected", &connector_id);
            return Ok(());
        }
    };

    // Build both runtime env (with decrypted secrets) and persisted env (placeholders only).
    let mut runtime_env = HashMap::new();
    let mut persisted_env = HashMap::new();
    match &mapping.credential_source {
        ConnectorCredentialSource::OAuth { provider } => {
            // Try to get OAuth token from stored tokens
            let oauth_provider_str = *provider;
            match retrieve_tokens_by_id(oauth_provider_str) {
                Ok(Some(tokens)) => {
                    let placeholder = format!("<from_oauth:{}>", oauth_provider_str);
                    persisted_env.insert(mapping.env_keys[0].0.to_string(), placeholder);

                    // For Notion, the MCP server expects headers in JSON format
                    if connector_id == "notion" {
                        let headers = format!(
                            r#"{{"Authorization": "Bearer {}","Notion-Version": "2022-06-28"}}"#,
                            tokens.access_token
                        );
                        runtime_env.insert(mapping.env_keys[0].0.to_string(), headers);
                    } else {
                        runtime_env.insert(mapping.env_keys[0].0.to_string(), tokens.access_token);
                    }
                }
                Ok(None) => {
                    return Err(format!(
                        "No OAuth tokens found for '{}'. Please authenticate first.",
                        oauth_provider_str
                    ));
                }
                Err(e) => {
                    return Err(format!(
                        "Failed to retrieve OAuth tokens for '{}': {}",
                        oauth_provider_str, e
                    ));
                }
            }
        }
        ConnectorCredentialSource::ApiKey => {
            // Retrieve API key from settings_v2
            let api_key = retrieve_api_key(&connector_id)?;
            for (env_var, _desc) in mapping.env_keys {
                runtime_env.insert(env_var.to_string(), api_key.clone());
                persisted_env.insert(
                    env_var.to_string(),
                    format!("<from_api_key:{}>", connector_id),
                );
            }
        }
        ConnectorCredentialSource::None => {
            // No credentials needed
        }
    }

    // Build the MCP server config
    let server_config = McpServerConfig {
        command: mapping.command.to_string(),
        args: mapping.args.iter().map(|s| s.to_string()).collect(),
        env: runtime_env,
        enabled: true,
        transport: None,
    };
    let persisted_config = McpServerConfig {
        command: mapping.command.to_string(),
        args: mapping.args.iter().map(|s| s.to_string()).collect(),
        env: persisted_env,
        enabled: true,
        transport: None,
    };

    // Get MCP state and connect
    let mcp_state = app_handle
        .try_state::<McpState>()
        .ok_or_else(|| "MCP state not initialized".to_string())?;

    let server_name = mapping.server_name.to_string();
    let was_connected = mcp_state
        .client
        .get_connected_servers()
        .contains(&server_name);

    if was_connected {
        mcp_state
            .client
            .disconnect_server(&server_name)
            .await
            .map_err(|e| {
                format!(
                    "Failed to reset existing MCP server '{}': {}",
                    server_name, e
                )
            })?;
        emit_mcp_event(
            &app_handle,
            McpEvent::ServerConnectionChanged {
                server_name: server_name.clone(),
                connected: false,
                error: None,
            },
        );
        emit_mcp_event(
            &app_handle,
            McpEvent::ToolsUpdated {
                server_name: server_name.clone(),
                tool_count: 0,
            },
        );
    }

    // Add to persistent config so it auto-reconnects on restart.
    let (previous_config, config_snapshot) = {
        let mut config = mcp_state.config.lock();
        let previous = config
            .mcp_servers
            .insert(server_name.clone(), persisted_config);
        (previous, config.clone())
    };
    if let Err(err) = mcp_state.persist_config_snapshot(&config_snapshot).await {
        let mut config = mcp_state.config.lock();
        match previous_config {
            Some(previous) => {
                config.mcp_servers.insert(server_name.clone(), previous);
            }
            None => {
                config.mcp_servers.remove(&server_name);
            }
        }
        return Err(format!("Failed to save MCP config: {}", err));
    }

    // Connect the MCP server
    if let Err(err) = mcp_state
        .client
        .connect_server(server_name.clone(), server_config)
        .await
    {
        // Roll back persisted config to previous value.
        let rollback_snapshot = {
            let mut config = mcp_state.config.lock();
            match previous_config {
                Some(previous) => {
                    config.mcp_servers.insert(server_name.clone(), previous);
                }
                None => {
                    config.mcp_servers.remove(&server_name);
                }
            }
            config.clone()
        };
        if let Err(save_err) = mcp_state.persist_config_snapshot(&rollback_snapshot).await {
            tracing::warn!(
                "Failed to rollback connector MCP config for '{}': {}",
                server_name,
                save_err
            );
        }
        let err_message = format!("Failed to connect MCP server '{}': {}", server_name, err);
        emit_mcp_event(
            &app_handle,
            McpEvent::ServerConnectionChanged {
                server_name: server_name.clone(),
                connected: false,
                error: Some(err_message.clone()),
            },
        );
        return Err(err_message);
    }

    let tool_count = mcp_state
        .client
        .list_server_tools(&server_name)
        .map(|tools| tools.len())
        .unwrap_or(0);
    emit_mcp_event(
        &app_handle,
        McpEvent::ServerConnectionChanged {
            server_name: server_name.clone(),
            connected: true,
            error: None,
        },
    );
    emit_mcp_event(
        &app_handle,
        McpEvent::ToolsUpdated {
            server_name: server_name.clone(),
            tool_count,
        },
    );

    tracing::info!(
        "Successfully connected connector '{}' as MCP server '{}'",
        connector_id,
        server_name
    );

    // Emit events
    let _ = app_handle.emit("connector:connected", &connector_id);

    Ok(())
}

/// Save an API key for a provider (encrypted) and activate it in the LLM router
#[tauri::command]
pub async fn save_api_key(
    provider: String,
    key: String,
    llm_state: tauri::State<'_, crate::sys::commands::llm::LLMState>,
) -> Result<(), String> {
    let conn = open_mcp_settings_db()?;

    // Encrypt the API key before storing
    let encrypted = encrypt_credential(&key)?;
    let setting_key = format!("api_key_{}", provider);

    upsert_settings_v2_value(&conn, &setting_key, &encrypted, "security", true)
        .map_err(|e| format!("Failed to store API key: {}", e))?;

    tracing::info!("API key stored for provider: {}", provider);

    // Activate the key in the LLM router so the user doesn't need to restart
    if let Some(provider_enum) = crate::core::llm::Provider::from_string(&provider) {
        match provider_enum {
            crate::core::llm::Provider::Ollama => {
                // Ollama doesn't use API keys — skip activation
            }
            crate::core::llm::Provider::ManagedCloud => {
                // ManagedCloud uses access tokens, not API keys — skip activation
            }
            _ => {
                // BYOK: Create a DirectApiProvider for the provider
                let direct =
                    crate::core::llm::providers::direct_api_provider::DirectApiProvider::new(
                        provider_enum,
                        key,
                        None,
                    )
                    .map_err(|e| {
                        format!(
                            "Key stored but failed to activate {} provider: {}",
                            provider, e
                        )
                    })?;
                let mut router = llm_state.router.write().await;
                router.set_provider(provider_enum, Box::new(direct));
                tracing::info!(
                    "Activated BYOK DirectApiProvider for '{}'",
                    provider_enum.as_string()
                );
            }
        }
    }

    Ok(())
}

// ============================================================================
// Connector Credential Helpers
// ============================================================================

/// Retrieve stored tokens by connector/provider ID string
/// This wraps retrieve_tokens for connectors that don't map to McpOAuthProvider enum
fn retrieve_tokens_by_id(provider_id: &str) -> Result<Option<StoredTokens>, String> {
    // Try the enum-based path first
    if let Some(oauth_provider) = McpOAuthProvider::from_str(provider_id) {
        return retrieve_tokens(oauth_provider);
    }

    // Fallback: try direct DB lookup for providers not in the enum
    let conn = open_mcp_settings_db()?;

    let key = format!("mcp_oauth_tokens_{}", provider_id);
    let result: Result<String, rusqlite::Error> = conn.query_row(
        "SELECT value FROM settings_v2 WHERE key = ?1",
        rusqlite::params![key],
        |row| row.get(0),
    );

    match result {
        Ok(encrypted) => {
            let tokens = decrypt_tokens(&encrypted)?;
            Ok(Some(tokens))
        }
        Err(rusqlite::Error::QueryReturnedNoRows) => Ok(None),
        Err(e) => Err(format!("Failed to retrieve tokens: {}", e)),
    }
}

/// Retrieve an API key for a connector from the database.
///
/// Exposed as `pub(crate)` so that `llm.rs` can use it as a fallback when
/// the caller does not pass an explicit API key to `llm_configure_provider`.
pub(crate) fn retrieve_api_key(connector_id: &str) -> Result<String, String> {
    let conn = open_mcp_settings_db()?;

    let setting_key = format!("api_key_{}", connector_id);
    let encrypted: String = conn
        .query_row(
            "SELECT value FROM settings_v2 WHERE key = ?1",
            rusqlite::params![setting_key],
            |row| row.get(0),
        )
        .map_err(|_| {
            format!(
                "No API key found for connector '{}'. Please provide an API key first.",
                connector_id
            )
        })?;

    // Decrypt using the same mechanism
    decrypt_credential_value(&encrypted)
}

/// Decrypt a credential value stored in settings_v2
fn decrypt_credential_value(encrypted: &str) -> Result<String, String> {
    let key = derive_key(KeyPurpose::McpCredentials);
    let cipher =
        Aes256Gcm::new_from_slice(&key).map_err(|e| format!("Failed to create cipher: {}", e))?;

    let combined = general_purpose::STANDARD
        .decode(encrypted)
        .map_err(|e| format!("Failed to decode: {}", e))?;

    if combined.len() < 12 {
        return Err("Invalid encrypted data".to_string());
    }

    let (nonce_bytes, ciphertext) = combined.split_at(12);
    let nonce = Nonce::from_slice(nonce_bytes);

    let plaintext = cipher
        .decrypt(nonce, ciphertext)
        .map_err(|e| format!("Decryption failed: {}", e))?;

    String::from_utf8(plaintext).map_err(|e| format!("Invalid UTF-8: {}", e))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_provider_parsing() {
        assert_eq!(
            McpOAuthProvider::from_str("github"),
            Some(McpOAuthProvider::GitHub)
        );
        assert_eq!(
            McpOAuthProvider::from_str("google_drive"),
            Some(McpOAuthProvider::Google)
        );
        assert_eq!(
            McpOAuthProvider::from_str("googledrive"),
            Some(McpOAuthProvider::Google)
        );
        assert_eq!(
            McpOAuthProvider::from_str("gmail"),
            Some(McpOAuthProvider::Google)
        );
        assert_eq!(
            McpOAuthProvider::from_str("slack"),
            Some(McpOAuthProvider::Slack)
        );
        assert_eq!(McpOAuthProvider::from_str("unknown"), None);
    }

    #[test]
    fn test_provider_urls() {
        assert_eq!(
            McpOAuthProvider::GitHub.auth_url(),
            "https://github.com/login/oauth/authorize"
        );
        assert_eq!(
            McpOAuthProvider::Google.auth_url(),
            "https://accounts.google.com/o/oauth2/v2/auth"
        );
        assert_eq!(
            McpOAuthProvider::Slack.auth_url(),
            "https://slack.com/oauth/v2/authorize"
        );
    }

    #[test]
    fn test_provider_scopes() {
        assert!(McpOAuthProvider::GitHub.default_scopes().contains(&"repo"));
        assert!(McpOAuthProvider::Google
            .default_scopes()
            .iter()
            .any(|s| s.contains("google")));
        assert!(McpOAuthProvider::Slack
            .default_scopes()
            .contains(&"chat:write"));
    }

    #[test]
    fn test_pkce_generation() {
        let pkce = PkceChallenge::generate();
        assert_eq!(pkce.code_verifier.len(), 64);
        assert!(!pkce.code_challenge.is_empty());

        // Verify the challenge is a valid base64url-encoded SHA256 hash
        let decoded = general_purpose::URL_SAFE_NO_PAD.decode(&pkce.code_challenge);
        assert!(decoded.is_ok());
        assert_eq!(decoded.unwrap().len(), 32); // SHA256 produces 32 bytes
    }

    #[test]
    fn test_state_generation() {
        let state1 = McpOAuthState::generate_state();
        let state2 = McpOAuthState::generate_state();
        assert_ne!(state1, state2);
        assert!(!state1.is_empty());
    }

    #[test]
    fn test_redirect_uri() {
        assert_eq!(
            McpOAuthProvider::GitHub.redirect_uri(),
            "agiworkforce://oauth/mcp/github"
        );
        assert_eq!(
            McpOAuthProvider::Google.redirect_uri(),
            "agiworkforce://oauth/mcp/google"
        );
        assert_eq!(
            McpOAuthProvider::Slack.redirect_uri(),
            "agiworkforce://oauth/mcp/slack"
        );
    }
}
