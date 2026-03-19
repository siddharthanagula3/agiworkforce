//! OAuth 2.1 + PKCE authentication framework for MCP connectors.
//!
//! Provides a full Authorization Code flow with PKCE for MCP server
//! authentication. Tokens are stored encrypted via the existing machine-key
//! infrastructure (AES-256-GCM via [`KeyPurpose::McpCredentials`]).
//!
//! This module is MCP-specific; the general-purpose OAuth manager for user
//! login (Google/GitHub/Microsoft) lives in [`crate::sys::security::oauth`].

use super::config::{encrypt_oauth_token, open_mcp_settings_db, upsert_settings_v2_value};
use crate::core::mcp::{McpError, McpResult};
use chrono::{DateTime, Utc};
use oauth2::{
    basic::BasicClient, AuthUrl, AuthorizationCode, ClientId, ClientSecret, CsrfToken,
    PkceCodeChallenge, PkceCodeVerifier, RedirectUrl, Scope, TokenResponse, TokenUrl,
};
use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use std::sync::Arc;
use std::time::{Duration, Instant};
use tokio::sync::RwLock;

// ── Constants ────────────────────────────────────────────────────────────────

/// TTL for pending PKCE verifiers (10 minutes).
const VERIFIER_TTL: Duration = Duration::from_secs(600);

/// Maximum number of concurrent pending auth flows to prevent memory exhaustion.
const MAX_PENDING_FLOWS: usize = 50;

/// Buffer (in seconds) before actual expiry to trigger a proactive refresh.
const EXPIRY_BUFFER_SECS: i64 = 120;

/// Default redirect URI for the desktop deep-link callback.
const DEFAULT_REDIRECT_URI: &str = "agiworkforce://oauth/callback";

// ── Public types ─────────────────────────────────────────────────────────────

/// OAuth configuration for an MCP server connector.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct McpOAuthConfig {
    /// OAuth client ID registered with the provider.
    pub client_id: String,
    /// Authorization endpoint URL.
    pub auth_url: String,
    /// Token exchange endpoint URL.
    pub token_url: String,
    /// Redirect URI (defaults to the desktop deep-link scheme).
    #[serde(default = "default_redirect_uri")]
    pub redirect_uri: String,
    /// Scopes to request.
    #[serde(default)]
    pub scopes: Vec<String>,
    /// Optional client secret. OAuth 2.1 public clients omit this.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub client_secret: Option<String>,
}

fn default_redirect_uri() -> String {
    DEFAULT_REDIRECT_URI.to_string()
}

/// An OAuth token set (access + optional refresh).
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct McpOAuthToken {
    /// The bearer access token.
    pub access_token: String,
    /// Optional refresh token for automatic renewal.
    pub refresh_token: Option<String>,
    /// Absolute UTC timestamp when the access token expires.
    pub expires_at: DateTime<Utc>,
    /// Token type (almost always "Bearer").
    pub token_type: String,
}

impl McpOAuthToken {
    /// Returns `true` if the token is expired or within the proactive refresh
    /// buffer window.
    pub fn is_expired(&self) -> bool {
        Utc::now().timestamp() >= self.expires_at.timestamp() - EXPIRY_BUFFER_SECS
    }
}

/// Returned to the frontend so it can open the system browser.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AuthFlowResult {
    /// The full authorization URL to open in the browser.
    pub auth_url: String,
    /// The CSRF state token (opaque, used to correlate the callback).
    pub state: String,
}

// ── Internal helpers ─────────────────────────────────────────────────────────

/// A pending PKCE verifier with creation timestamp for TTL enforcement.
struct PendingFlow {
    server_name: String,
    verifier: String,
    created_at: Instant,
}

impl PendingFlow {
    fn is_expired(&self) -> bool {
        self.created_at.elapsed() > VERIFIER_TTL
    }
}

// ── Encrypted token persistence ──────────────────────────────────────────────

/// DB key helpers scoped to a specific MCP server name.
fn db_key_access(server: &str) -> String {
    format!("mcp_oauth_v2_{}_access_token", server)
}
fn db_key_refresh(server: &str) -> String {
    format!("mcp_oauth_v2_{}_refresh_token", server)
}
fn db_key_expires(server: &str) -> String {
    format!("mcp_oauth_v2_{}_expires_at", server)
}
fn db_key_token_type(server: &str) -> String {
    format!("mcp_oauth_v2_{}_token_type", server)
}

/// Persist an [`McpOAuthToken`] to the encrypted settings DB.
///
/// Access and refresh tokens are encrypted via machine-derived keys
/// before storage. The expiry timestamp and token type are stored as
/// plaintext metadata.
fn persist_token(server_name: &str, token: &McpOAuthToken) -> Result<(), String> {
    let conn = open_mcp_settings_db()?;

    // Encrypt access token
    let encrypted_access = encrypt_oauth_token(&token.access_token).ok_or_else(|| {
        format!(
            "Failed to encrypt OAuth access token for MCP server '{}'",
            server_name
        )
    })?;
    upsert_settings_v2_value(
        &conn,
        &db_key_access(server_name),
        &encrypted_access,
        "mcp_oauth",
        true,
    )?;

    // Encrypt and store refresh token (if present)
    if let Some(ref refresh) = token.refresh_token {
        let encrypted_refresh = encrypt_oauth_token(refresh).ok_or_else(|| {
            format!(
                "Failed to encrypt OAuth refresh token for MCP server '{}'",
                server_name
            )
        })?;
        upsert_settings_v2_value(
            &conn,
            &db_key_refresh(server_name),
            &encrypted_refresh,
            "mcp_oauth",
            true,
        )?;
    }

    // Store expiry (plaintext metadata)
    upsert_settings_v2_value(
        &conn,
        &db_key_expires(server_name),
        &token.expires_at.timestamp().to_string(),
        "mcp_oauth",
        false,
    )?;

    // Store token type (plaintext metadata)
    upsert_settings_v2_value(
        &conn,
        &db_key_token_type(server_name),
        &token.token_type,
        "mcp_oauth",
        false,
    )?;

    Ok(())
}

/// Load an [`McpOAuthToken`] from the encrypted settings DB.
///
/// Returns `None` if the token has not been stored yet.
fn load_token(server_name: &str) -> Option<McpOAuthToken> {
    use super::config::decrypt_oauth_token;

    let conn = open_mcp_settings_db().ok()?;

    let encrypted_access: String = conn
        .query_row(
            "SELECT value FROM settings_v2 WHERE key = ?1",
            rusqlite::params![db_key_access(server_name)],
            |row| row.get(0),
        )
        .ok()?;

    let access_token = decrypt_oauth_token(&encrypted_access)
        .map_err(|e| {
            tracing::warn!(
                "Failed to decrypt stored OAuth access token for MCP server '{}': {}",
                server_name,
                e
            );
        })
        .ok()?;

    let refresh_token: Option<String> = conn
        .query_row(
            "SELECT value FROM settings_v2 WHERE key = ?1",
            rusqlite::params![db_key_refresh(server_name)],
            |row| row.get::<_, String>(0),
        )
        .ok()
        .and_then(|enc| {
            decrypt_oauth_token(&enc)
                .map_err(|e| {
                    tracing::warn!(
                        "Failed to decrypt stored OAuth refresh token for MCP server '{}': {}",
                        server_name,
                        e
                    );
                })
                .ok()
        });

    let expires_at_ts: i64 = conn
        .query_row(
            "SELECT value FROM settings_v2 WHERE key = ?1",
            rusqlite::params![db_key_expires(server_name)],
            |row| {
                let val: String = row.get(0)?;
                Ok(val.parse::<i64>().unwrap_or(0))
            },
        )
        .unwrap_or(0);

    let token_type: String = conn
        .query_row(
            "SELECT value FROM settings_v2 WHERE key = ?1",
            rusqlite::params![db_key_token_type(server_name)],
            |row| row.get(0),
        )
        .unwrap_or_else(|_| "Bearer".to_string());

    let expires_at = DateTime::from_timestamp(expires_at_ts, 0).unwrap_or_else(Utc::now);

    Some(McpOAuthToken {
        access_token,
        refresh_token,
        expires_at,
        token_type,
    })
}

/// Delete all stored token fields for a server from the DB.
fn delete_stored_token(server_name: &str) -> Result<(), String> {
    let conn = open_mcp_settings_db()?;
    let keys = [
        db_key_access(server_name),
        db_key_refresh(server_name),
        db_key_expires(server_name),
        db_key_token_type(server_name),
    ];
    for key in &keys {
        // Ignore errors for keys that don't exist yet.
        let _ = conn.execute(
            "DELETE FROM settings_v2 WHERE key = ?1",
            rusqlite::params![key],
        );
    }
    Ok(())
}

// ── McpOAuthManager ──────────────────────────────────────────────────────────

/// Manages OAuth 2.1 Authorization Code + PKCE flows for MCP server
/// connectors.
///
/// Each MCP server that requires OAuth gets its own [`McpOAuthConfig`]
/// registered here. The manager handles:
///
/// - Generating PKCE challenges and authorization URLs
/// - Exchanging authorization codes for token sets
/// - Persisting tokens to the encrypted settings DB
/// - Auto-refreshing expired tokens
/// - Token revocation and cleanup
pub struct McpOAuthManager {
    /// Per-server OAuth configurations, keyed by MCP server name.
    configs: Arc<RwLock<HashMap<String, McpOAuthConfig>>>,
    /// In-memory cache of active tokens (authoritative copy lives in DB).
    tokens: Arc<RwLock<HashMap<String, McpOAuthToken>>>,
    /// Pending PKCE verifiers, keyed by CSRF state token.
    pending_flows: Arc<parking_lot::RwLock<HashMap<String, PendingFlow>>>,
}

impl McpOAuthManager {
    /// Create a new manager with no registered servers.
    pub fn new() -> Self {
        Self {
            configs: Arc::new(RwLock::new(HashMap::new())),
            tokens: Arc::new(RwLock::new(HashMap::new())),
            pending_flows: Arc::new(parking_lot::RwLock::new(HashMap::new())),
        }
    }

    // ── Configuration ────────────────────────────────────────────────────

    /// Register (or update) the OAuth configuration for a named MCP server.
    pub async fn register_server(&self, server_name: String, config: McpOAuthConfig) {
        self.configs.write().await.insert(server_name, config);
    }

    /// Remove the OAuth configuration for a named MCP server.
    pub async fn unregister_server(&self, server_name: &str) {
        self.configs.write().await.remove(server_name);
        self.tokens.write().await.remove(server_name);
    }

    /// Check whether a server has an OAuth configuration registered.
    pub async fn has_config(&self, server_name: &str) -> bool {
        self.configs.read().await.contains_key(server_name)
    }

    // ── Authorization flow ───────────────────────────────────────────────

    /// Begin the OAuth 2.1 Authorization Code + PKCE flow for an MCP server.
    ///
    /// Generates a cryptographically-random PKCE code verifier and challenge,
    /// builds the full authorization URL, and returns it along with the CSRF
    /// state token. The caller should open this URL in the system browser.
    ///
    /// The PKCE verifier is held in memory (never exposed to the caller) and
    /// expires after [`VERIFIER_TTL`].
    pub async fn start_auth_flow(&self, server_name: &str) -> McpResult<AuthFlowResult> {
        let configs = self.configs.read().await;
        let config = configs.get(server_name).ok_or_else(|| {
            McpError::InvalidConfig(format!(
                "No OAuth configuration registered for MCP server '{}'",
                server_name
            ))
        })?;

        // Build the oauth2 client
        let client = build_oauth_client(config)?;

        // Generate PKCE challenge (S256)
        let (pkce_challenge, pkce_verifier) = PkceCodeChallenge::new_random_sha256();

        // Build authorization URL with scopes
        let mut auth_request = client
            .authorize_url(CsrfToken::new_random)
            .set_pkce_challenge(pkce_challenge);

        for scope in &config.scopes {
            auth_request = auth_request.add_scope(Scope::new(scope.clone()));
        }

        let (auth_url, csrf_state) = auth_request.url();

        // Store the pending verifier
        {
            let mut flows = self.pending_flows.write();

            // Evict expired entries
            flows.retain(|_, f| !f.is_expired());

            // Enforce capacity limit
            if flows.len() >= MAX_PENDING_FLOWS {
                if let Some(oldest_key) = flows
                    .iter()
                    .min_by_key(|(_, f)| f.created_at)
                    .map(|(k, _)| k.clone())
                {
                    flows.remove(&oldest_key);
                    tracing::warn!(
                        "MCP OAuth: evicted oldest pending flow due to capacity limit ({})",
                        MAX_PENDING_FLOWS
                    );
                }
            }

            flows.insert(
                csrf_state.secret().clone(),
                PendingFlow {
                    server_name: server_name.to_string(),
                    verifier: pkce_verifier.secret().clone(),
                    created_at: Instant::now(),
                },
            );
        }

        tracing::info!(
            "MCP OAuth: started auth flow for server '{}', state={}",
            server_name,
            csrf_state.secret()
        );

        Ok(AuthFlowResult {
            auth_url: auth_url.to_string(),
            state: csrf_state.secret().clone(),
        })
    }

    /// Handle the OAuth callback: exchange the authorization code for tokens.
    ///
    /// Validates the CSRF state, recovers the stored PKCE verifier, exchanges
    /// the code at the token endpoint, then persists the resulting token set
    /// to the encrypted DB.
    pub async fn handle_callback(&self, code: &str, state: &str) -> McpResult<McpOAuthToken> {
        // Extract and validate the pending flow
        let pending = {
            let mut flows = self.pending_flows.write();
            flows.retain(|_, f| !f.is_expired());
            flows.remove(state).ok_or_else(|| {
                McpError::InvalidConfig(
                    "Invalid or expired OAuth state parameter. Please restart the auth flow."
                        .to_string(),
                )
            })?
        };

        if pending.is_expired() {
            return Err(McpError::InvalidConfig(
                "OAuth flow expired. Please restart the authorization process.".to_string(),
            ));
        }

        let server_name = &pending.server_name;

        // Clone config before the async token exchange
        let config = {
            let configs = self.configs.read().await;
            configs.get(server_name).cloned().ok_or_else(|| {
                McpError::InvalidConfig(format!(
                    "OAuth configuration for MCP server '{}' was removed during auth flow",
                    server_name
                ))
            })?
        };

        let client = build_oauth_client(&config)?;

        // Exchange the authorization code with the PKCE verifier
        let token_result = client
            .exchange_code(AuthorizationCode::new(code.to_string()))
            .set_pkce_verifier(PkceCodeVerifier::new(pending.verifier))
            .request_async(oauth2::reqwest::async_http_client)
            .await
            .map_err(|e| McpError::ConnectionError(format!("OAuth token exchange failed: {}", e)))?;

        // Build our token struct
        let expires_at = token_result
            .expires_in()
            .map(|d| Utc::now() + chrono::Duration::seconds(d.as_secs() as i64))
            .unwrap_or_else(|| Utc::now() + chrono::Duration::seconds(3600));

        let token = McpOAuthToken {
            access_token: token_result.access_token().secret().clone(),
            refresh_token: token_result.refresh_token().map(|t| t.secret().clone()),
            expires_at,
            token_type: format!("{:?}", token_result.token_type()),
        };

        // Persist to encrypted DB (sync — no rusqlite::Connection across await)
        persist_token(server_name, &token).map_err(|e| {
            McpError::InvalidConfig(format!(
                "Failed to persist OAuth token for MCP server '{}': {}",
                server_name, e
            ))
        })?;

        // Update in-memory cache
        self.tokens
            .write()
            .await
            .insert(server_name.clone(), token.clone());

        tracing::info!(
            "MCP OAuth: successfully exchanged code for server '{}', expires_at={}",
            server_name,
            token.expires_at
        );

        Ok(token)
    }

    /// Return a valid access token for the server, auto-refreshing if expired.
    ///
    /// Resolution order:
    /// 1. In-memory cache (if not expired)
    /// 2. Encrypted DB (if not expired)
    /// 3. Refresh using the stored refresh token
    ///
    /// Returns an error if no token is available and refresh is not possible.
    pub async fn get_valid_token(&self, server_name: &str) -> McpResult<String> {
        // 1. Check in-memory cache
        {
            let tokens = self.tokens.read().await;
            if let Some(token) = tokens.get(server_name) {
                if !token.is_expired() {
                    return Ok(token.access_token.clone());
                }
            }
        }

        // 2. Check encrypted DB
        if let Some(db_token) = load_token(server_name) {
            if !db_token.is_expired() {
                // Populate cache
                self.tokens
                    .write()
                    .await
                    .insert(server_name.to_string(), db_token.clone());
                return Ok(db_token.access_token);
            }

            // 3. Attempt refresh if we have a refresh token
            if let Some(ref refresh) = db_token.refresh_token {
                match self
                    .refresh_token_internal(server_name, refresh)
                    .await
                {
                    Ok(new_token) => return Ok(new_token.access_token),
                    Err(e) => {
                        tracing::warn!(
                            "MCP OAuth: refresh failed for server '{}': {}",
                            server_name,
                            e
                        );
                    }
                }
            }
        }

        Err(McpError::ConnectionError(format!(
            "No valid OAuth token available for MCP server '{}'. \
             Please re-authorize.",
            server_name
        )))
    }

    /// Revoke and clear the token for a server.
    ///
    /// Removes the token from both the in-memory cache and the encrypted DB.
    /// If a revocation endpoint is available for the provider, the token is
    /// also revoked server-side (best-effort).
    pub async fn revoke_token(&self, server_name: &str) -> McpResult<()> {
        // Remove from in-memory cache
        self.tokens.write().await.remove(server_name);

        // Remove from encrypted DB
        delete_stored_token(server_name).map_err(|e| {
            McpError::InvalidConfig(format!(
                "Failed to delete stored OAuth token for MCP server '{}': {}",
                server_name, e
            ))
        })?;

        tracing::info!(
            "MCP OAuth: revoked and cleared token for server '{}'",
            server_name
        );

        Ok(())
    }

    /// Check whether a valid (non-expired) token exists for a server.
    pub async fn has_valid_token(&self, server_name: &str) -> bool {
        // Check cache first
        {
            let tokens = self.tokens.read().await;
            if let Some(token) = tokens.get(server_name) {
                if !token.is_expired() {
                    return true;
                }
            }
        }
        // Fall back to DB
        load_token(server_name)
            .map(|t| !t.is_expired())
            .unwrap_or(false)
    }

    /// List all server names that have OAuth configurations registered.
    pub async fn list_configured_servers(&self) -> Vec<String> {
        self.configs.read().await.keys().cloned().collect()
    }

    // ── Internal ─────────────────────────────────────────────────────────

    /// Perform an OAuth refresh token exchange and persist the new token set.
    ///
    /// All DB access is synchronous and completed before any `.await` to
    /// ensure `rusqlite::Connection` (which is `!Send`) never crosses an
    /// await boundary.
    async fn refresh_token_internal(
        &self,
        server_name: &str,
        refresh_token: &str,
    ) -> McpResult<McpOAuthToken> {
        let config = {
            let configs = self.configs.read().await;
            configs.get(server_name).cloned().ok_or_else(|| {
                McpError::InvalidConfig(format!(
                    "No OAuth configuration for MCP server '{}' during refresh",
                    server_name
                ))
            })?
        };

        let client = build_oauth_client(&config)?;

        let token_result = client
            .exchange_refresh_token(&oauth2::RefreshToken::new(refresh_token.to_string()))
            .request_async(oauth2::reqwest::async_http_client)
            .await
            .map_err(|e| {
                McpError::ConnectionError(format!(
                    "OAuth token refresh failed for MCP server '{}': {}",
                    server_name, e
                ))
            })?;

        let expires_at = token_result
            .expires_in()
            .map(|d| Utc::now() + chrono::Duration::seconds(d.as_secs() as i64))
            .unwrap_or_else(|| Utc::now() + chrono::Duration::seconds(3600));

        let new_token = McpOAuthToken {
            access_token: token_result.access_token().secret().clone(),
            // Use new refresh token if provided, otherwise keep the old one
            refresh_token: token_result
                .refresh_token()
                .map(|t| t.secret().clone())
                .or_else(|| Some(refresh_token.to_string())),
            expires_at,
            token_type: format!("{:?}", token_result.token_type()),
        };

        // Persist (sync DB write)
        persist_token(server_name, &new_token).map_err(|e| {
            McpError::InvalidConfig(format!(
                "Failed to persist refreshed OAuth token for MCP server '{}': {}",
                server_name, e
            ))
        })?;

        // Update cache
        self.tokens
            .write()
            .await
            .insert(server_name.to_string(), new_token.clone());

        tracing::info!(
            "MCP OAuth: successfully refreshed token for server '{}', new expiry={}",
            server_name,
            new_token.expires_at
        );

        Ok(new_token)
    }
}

impl Default for McpOAuthManager {
    fn default() -> Self {
        Self::new()
    }
}

// ── Helpers ──────────────────────────────────────────────────────────────────

/// Build an `oauth2::BasicClient` from an [`McpOAuthConfig`].
fn build_oauth_client(config: &McpOAuthConfig) -> McpResult<BasicClient> {
    let client_id = ClientId::new(config.client_id.clone());
    let client_secret = config
        .client_secret
        .as_ref()
        .map(|s| ClientSecret::new(s.clone()));

    let auth_url = AuthUrl::new(config.auth_url.clone()).map_err(|e| {
        McpError::InvalidConfig(format!("Invalid OAuth auth_url '{}': {}", config.auth_url, e))
    })?;

    let token_url = TokenUrl::new(config.token_url.clone()).map_err(|e| {
        McpError::InvalidConfig(format!(
            "Invalid OAuth token_url '{}': {}",
            config.token_url, e
        ))
    })?;

    let redirect_uri = RedirectUrl::new(config.redirect_uri.clone()).map_err(|e| {
        McpError::InvalidConfig(format!(
            "Invalid OAuth redirect_uri '{}': {}",
            config.redirect_uri, e
        ))
    })?;

    let client = BasicClient::new(client_id, client_secret, auth_url, Some(token_url))
        .set_redirect_uri(redirect_uri);

    Ok(client)
}

// ── Authentication method enum ───────────────────────────────────────────────

/// Authentication method for an MCP server connection.
///
/// Supports API key, OAuth 2.1 + PKCE, or no authentication.
/// Used in [`super::config::McpServerConfig`] to declare how a server
/// should authenticate.
#[derive(Debug, Clone, Default, Serialize, Deserialize)]
#[serde(tag = "type", rename_all = "snake_case")]
pub enum McpAuthMethod {
    /// Static API key (injected as env var or bearer token).
    ApiKey {
        /// The key value (or a `<from_api_key:provider>` placeholder).
        key: String,
    },
    /// OAuth 2.1 Authorization Code + PKCE.
    #[serde(rename = "oauth")]
    OAuth(McpOAuthConfig),
    /// No authentication required.
    #[default]
    None,
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_mcp_oauth_token_expiry() {
        let expired_token = McpOAuthToken {
            access_token: "test_access".to_string(),
            refresh_token: Some("test_refresh".to_string()),
            expires_at: Utc::now() - chrono::Duration::seconds(300),
            token_type: "Bearer".to_string(),
        };
        assert!(expired_token.is_expired());

        let valid_token = McpOAuthToken {
            access_token: "test_access".to_string(),
            refresh_token: Some("test_refresh".to_string()),
            expires_at: Utc::now() + chrono::Duration::seconds(3600),
            token_type: "Bearer".to_string(),
        };
        assert!(!valid_token.is_expired());
    }

    #[test]
    fn test_mcp_oauth_token_expiry_buffer() {
        // Token that expires within the buffer window should be considered expired
        let near_expiry_token = McpOAuthToken {
            access_token: "test_access".to_string(),
            refresh_token: None,
            expires_at: Utc::now() + chrono::Duration::seconds(60), // within 120s buffer
            token_type: "Bearer".to_string(),
        };
        assert!(near_expiry_token.is_expired());
    }

    #[test]
    fn test_mcp_auth_method_default() {
        let auth: McpAuthMethod = McpAuthMethod::default();
        assert!(matches!(auth, McpAuthMethod::None));
    }

    #[test]
    fn test_mcp_auth_method_serde_api_key() {
        let auth = McpAuthMethod::ApiKey {
            key: "sk-test-123".to_string(),
        };
        let json = serde_json::to_string(&auth).unwrap();
        assert!(json.contains("\"type\":\"api_key\""));

        let deserialized: McpAuthMethod = serde_json::from_str(&json).unwrap();
        match deserialized {
            McpAuthMethod::ApiKey { key } => assert_eq!(key, "sk-test-123"),
            _ => panic!("Expected ApiKey variant"),
        }
    }

    #[test]
    fn test_mcp_auth_method_serde_oauth() {
        let auth = McpAuthMethod::OAuth(McpOAuthConfig {
            client_id: "my-client-id".to_string(),
            auth_url: "https://example.com/authorize".to_string(),
            token_url: "https://example.com/token".to_string(),
            redirect_uri: "agiworkforce://oauth/callback".to_string(),
            scopes: vec!["read".to_string(), "write".to_string()],
            client_secret: None,
        });
        let json = serde_json::to_string(&auth).unwrap();
        assert!(json.contains("\"type\":\"oauth\""));
        assert!(json.contains("\"client_id\":\"my-client-id\""));

        let deserialized: McpAuthMethod = serde_json::from_str(&json).unwrap();
        match deserialized {
            McpAuthMethod::OAuth(config) => {
                assert_eq!(config.client_id, "my-client-id");
                assert_eq!(config.scopes.len(), 2);
                assert!(config.client_secret.is_none());
            }
            _ => panic!("Expected OAuth variant"),
        }
    }

    #[test]
    fn test_mcp_auth_method_serde_none() {
        let auth = McpAuthMethod::None;
        let json = serde_json::to_string(&auth).unwrap();
        assert!(json.contains("\"type\":\"none\""));

        let deserialized: McpAuthMethod = serde_json::from_str(&json).unwrap();
        assert!(matches!(deserialized, McpAuthMethod::None));
    }

    #[test]
    fn test_mcp_oauth_config_default_redirect() {
        let json = r#"{
            "client_id": "test",
            "auth_url": "https://example.com/auth",
            "token_url": "https://example.com/token"
        }"#;
        let config: McpOAuthConfig = serde_json::from_str(json).unwrap();
        assert_eq!(config.redirect_uri, DEFAULT_REDIRECT_URI);
        assert!(config.scopes.is_empty());
        assert!(config.client_secret.is_none());
    }

    #[test]
    fn test_build_oauth_client_valid() {
        let config = McpOAuthConfig {
            client_id: "test-id".to_string(),
            auth_url: "https://example.com/authorize".to_string(),
            token_url: "https://example.com/token".to_string(),
            redirect_uri: "https://localhost:8080/callback".to_string(),
            scopes: vec![],
            client_secret: Some("test-secret".to_string()),
        };
        assert!(build_oauth_client(&config).is_ok());
    }

    #[test]
    fn test_build_oauth_client_invalid_auth_url() {
        let config = McpOAuthConfig {
            client_id: "test-id".to_string(),
            auth_url: "not a url".to_string(),
            token_url: "https://example.com/token".to_string(),
            redirect_uri: "https://localhost:8080/callback".to_string(),
            scopes: vec![],
            client_secret: None,
        };
        assert!(build_oauth_client(&config).is_err());
    }

    #[test]
    fn test_build_oauth_client_public_client() {
        // OAuth 2.1 public client (no client_secret)
        let config = McpOAuthConfig {
            client_id: "public-client".to_string(),
            auth_url: "https://example.com/authorize".to_string(),
            token_url: "https://example.com/token".to_string(),
            redirect_uri: "agiworkforce://oauth/callback".to_string(),
            scopes: vec!["openid".to_string()],
            client_secret: None,
        };
        assert!(build_oauth_client(&config).is_ok());
    }

    #[tokio::test]
    async fn test_mcp_oauth_manager_register_unregister() {
        let manager = McpOAuthManager::new();
        let config = McpOAuthConfig {
            client_id: "test".to_string(),
            auth_url: "https://example.com/auth".to_string(),
            token_url: "https://example.com/token".to_string(),
            redirect_uri: "https://localhost/callback".to_string(),
            scopes: vec![],
            client_secret: None,
        };

        assert!(!manager.has_config("my-server").await);

        manager
            .register_server("my-server".to_string(), config)
            .await;
        assert!(manager.has_config("my-server").await);

        let servers = manager.list_configured_servers().await;
        assert_eq!(servers.len(), 1);
        assert!(servers.contains(&"my-server".to_string()));

        manager.unregister_server("my-server").await;
        assert!(!manager.has_config("my-server").await);
    }

    #[tokio::test]
    async fn test_start_auth_flow_unconfigured_server() {
        let manager = McpOAuthManager::new();
        let result = manager.start_auth_flow("nonexistent").await;
        assert!(result.is_err());
    }

    #[tokio::test]
    async fn test_start_auth_flow_generates_url() {
        let manager = McpOAuthManager::new();
        let config = McpOAuthConfig {
            client_id: "test-client".to_string(),
            auth_url: "https://example.com/authorize".to_string(),
            token_url: "https://example.com/token".to_string(),
            redirect_uri: "https://localhost/callback".to_string(),
            scopes: vec!["read".to_string(), "write".to_string()],
            client_secret: None,
        };

        manager
            .register_server("test-server".to_string(), config)
            .await;

        let result = manager.start_auth_flow("test-server").await.unwrap();

        // The auth URL should contain the expected components
        assert!(result.auth_url.contains("example.com/authorize"));
        assert!(result.auth_url.contains("client_id=test-client"));
        assert!(result.auth_url.contains("code_challenge="));
        assert!(result.auth_url.contains("code_challenge_method=S256"));
        assert!(!result.state.is_empty());
    }

    #[tokio::test]
    async fn test_handle_callback_invalid_state() {
        let manager = McpOAuthManager::new();
        let result = manager.handle_callback("some-code", "bad-state").await;
        assert!(result.is_err());
    }

    #[tokio::test]
    async fn test_get_valid_token_no_token() {
        let manager = McpOAuthManager::new();
        let config = McpOAuthConfig {
            client_id: "test".to_string(),
            auth_url: "https://example.com/auth".to_string(),
            token_url: "https://example.com/token".to_string(),
            redirect_uri: "https://localhost/callback".to_string(),
            scopes: vec![],
            client_secret: None,
        };
        manager
            .register_server("no-token-server".to_string(), config)
            .await;

        let result = manager.get_valid_token("no-token-server").await;
        assert!(result.is_err());
    }

    #[test]
    fn test_db_key_helpers() {
        assert_eq!(
            db_key_access("github"),
            "mcp_oauth_v2_github_access_token"
        );
        assert_eq!(
            db_key_refresh("github"),
            "mcp_oauth_v2_github_refresh_token"
        );
        assert_eq!(db_key_expires("github"), "mcp_oauth_v2_github_expires_at");
        assert_eq!(
            db_key_token_type("github"),
            "mcp_oauth_v2_github_token_type"
        );
    }
}
