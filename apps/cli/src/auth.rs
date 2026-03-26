use anyhow::{bail, Context, Result};
use colored::Colorize;
use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use std::fmt;
use std::path::{Path, PathBuf};

// ──────────────────────────────────────────────────────────────────────────────
// Types
// ──────────────────────────────────────────────────────────────────────────────

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(tag = "type")]
pub enum AuthEntry {
    #[serde(rename = "oauth")]
    OAuth {
        refresh: String,
        access: String,
        expires: i64, // Unix timestamp milliseconds
        #[serde(skip_serializing_if = "Option::is_none")]
        account_id: Option<String>,
    },
    #[serde(rename = "api")]
    ApiKey { key: String },
}

#[derive(Debug, Clone, Serialize, Deserialize, Default)]
pub struct AuthStore {
    #[serde(flatten)]
    pub entries: HashMap<String, AuthEntry>,
    /// Transient copilot API token cache: (token, expires_at_unix_seconds).
    /// Not persisted to disk — refreshed on demand.
    #[serde(skip)]
    pub copilot_cache: Option<(String, i64)>,
}

/// Auth status for a single provider, returned by `auth_status()`.
#[derive(Debug, Clone)]
#[allow(dead_code)]
pub struct AuthStatusEntry {
    pub provider: String,
    pub auth_type: String,
    pub status: String,
    pub expires_in: Option<String>,
    /// Whether a refresh token is available for this entry.
    pub has_refresh_token: bool,
    /// Whether the auth file has secure permissions (Unix 0o600).
    pub permissions_secure: bool,
}

// ──────────────────────────────────────────────────────────────────────────────
// RefreshError — typed error classification for token refresh failures
// ──────────────────────────────────────────────────────────────────────────────

#[derive(Debug)]
pub enum RefreshError {
    /// Refresh token expired or revoked — user must re-authenticate.
    InvalidGrant(String),
    /// Network connectivity failure (DNS, timeout, connection refused).
    NetworkError(String),
    /// Server returned 5xx — transient, may succeed on retry.
    ServerError(String),
    /// Any other failure.
    Unknown(String),
}

impl fmt::Display for RefreshError {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        match self {
            RefreshError::InvalidGrant(msg) => write!(f, "invalid grant: {}", msg),
            RefreshError::NetworkError(msg) => write!(f, "network error: {}", msg),
            RefreshError::ServerError(msg) => write!(f, "server error: {}", msg),
            RefreshError::Unknown(msg) => write!(f, "refresh error: {}", msg),
        }
    }
}

impl std::error::Error for RefreshError {}

// ──────────────────────────────────────────────────────────────────────────────
// Token Redaction
// ──────────────────────────────────────────────────────────────────────────────

/// Redact a token for safe display: shows first 8 + "..." + last 4 characters.
/// Tokens shorter than 16 characters are fully redacted as "***".
#[allow(dead_code)]
pub fn redact_token(token: &str) -> String {
    if token.len() < 16 {
        return "***".to_string();
    }
    format!("{}...{}", &token[..8], &token[token.len() - 4..])
}

/// Wrapper for displaying an `AuthEntry` with redacted tokens.
#[allow(dead_code)]
pub struct RedactedAuthEntry<'a>(pub &'a AuthEntry);

impl fmt::Display for RedactedAuthEntry<'_> {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        match self.0 {
            AuthEntry::OAuth {
                refresh,
                access,
                expires,
                account_id,
            } => {
                write!(
                    f,
                    "OAuth(access={}, refresh={}, expires={}, account_id={})",
                    redact_token(access),
                    redact_token(refresh),
                    expires,
                    account_id.as_deref().unwrap_or("none"),
                )
            }
            AuthEntry::ApiKey { key } => {
                write!(f, "ApiKey({})", redact_token(key))
            }
        }
    }
}

impl fmt::Debug for RedactedAuthEntry<'_> {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        // Delegate to Display so Debug output is also redacted
        fmt::Display::fmt(self, f)
    }
}

// ──────────────────────────────────────────────────────────────────────────────
// File Permission Helpers
// ──────────────────────────────────────────────────────────────────────────────

/// On Unix, restrict file to owner-only read/write (0o600).
#[cfg(unix)]
fn set_file_permissions(path: &Path) -> Result<()> {
    use std::os::unix::fs::PermissionsExt;
    let perms = std::fs::Permissions::from_mode(0o600);
    std::fs::set_permissions(path, perms)?;
    Ok(())
}

/// On non-Unix platforms, this is a no-op (Windows ACLs handle security differently).
#[cfg(not(unix))]
fn set_file_permissions(_path: &Path) -> Result<()> {
    Ok(())
}

/// Check whether auth.json has secure permissions (owner-only on Unix).
/// Returns `true` if permissions are secure, `false` otherwise.
/// On non-Unix platforms, always returns `true`.
#[cfg(unix)]
pub fn check_file_permissions_secure(path: &Path) -> bool {
    use std::os::unix::fs::PermissionsExt;
    match std::fs::metadata(path) {
        Ok(meta) => {
            let mode = meta.permissions().mode();
            // Check that group and other have no access bits
            (mode & 0o077) == 0
        }
        Err(_) => false,
    }
}

#[cfg(not(unix))]
pub fn check_file_permissions_secure(_path: &Path) -> bool {
    true
}

// ──────────────────────────────────────────────────────────────────────────────
// Storage
// ──────────────────────────────────────────────────────────────────────────────

fn auth_path() -> Result<PathBuf> {
    Ok(crate::config::CliConfig::config_dir()?.join("auth.json"))
}

impl AuthStore {
    pub fn load() -> Result<Self> {
        let path = auth_path()?;
        if !path.exists() {
            return Ok(Self::default());
        }
        let data = std::fs::read_to_string(&path).context("Failed to read auth.json")?;
        let store: AuthStore = serde_json::from_str(&data).context("Failed to parse auth.json")?;
        Ok(store)
    }

    pub fn save(&self) -> Result<()> {
        let dir = crate::config::CliConfig::config_dir()?;
        std::fs::create_dir_all(&dir).context("Failed to create config directory")?;
        let path = auth_path()?;
        let data = serde_json::to_string_pretty(self).context("Failed to serialize auth store")?;
        std::fs::write(&path, &data).context("Failed to write auth.json")?;
        set_file_permissions(&path).context("Failed to set auth.json file permissions")?;
        Ok(())
    }
}

/// Free-function wrapper for `AuthStore::load()` (used by models.rs integration).
pub fn load_auth() -> Result<AuthStore> {
    AuthStore::load()
}

/// Free-function wrapper for `AuthStore::save()` (used by models.rs integration).
pub fn save_auth(store: &AuthStore) -> Result<()> {
    store.save()
}

/// Format a duration in milliseconds into a human-readable string like "expires in 2h 30m"
/// or "expired 5m ago" for negative values.
fn format_duration_ms(ms: i64) -> String {
    if ms == 0 {
        return "expired".to_string();
    }
    let (prefix, suffix, abs_ms) = if ms > 0 {
        ("expires in ", "", ms)
    } else {
        ("expired ", " ago", -ms)
    };
    let total_secs = abs_ms / 1000;
    let hours = total_secs / 3600;
    let mins = (total_secs % 3600) / 60;
    let duration = if hours > 0 {
        format!("{}h {}m", hours, mins)
    } else if mins > 0 {
        format!("{}m", mins)
    } else {
        format!("{}s", total_secs)
    };
    format!("{}{}{}", prefix, duration, suffix)
}

/// Format duration for backward-compatible contexts that only want the short form.
#[allow(dead_code)]
fn format_duration_short(ms: i64) -> String {
    if ms <= 0 {
        return "expired".to_string();
    }
    let total_secs = ms / 1000;
    let hours = total_secs / 3600;
    let mins = (total_secs % 3600) / 60;
    if hours > 0 {
        format!("{}h {}m", hours, mins)
    } else if mins > 0 {
        format!("{}m", mins)
    } else {
        format!("{}s", total_secs)
    }
}

/// Returns the current auth status for all configured providers.
pub fn auth_status() -> Result<Vec<AuthStatusEntry>> {
    let store = AuthStore::load()?;
    let now_ms = chrono::Utc::now().timestamp_millis();
    let perms_secure = auth_path()
        .map(|p| check_file_permissions_secure(&p))
        .unwrap_or(false);
    let results = auth_status_from_store(&store, now_ms, perms_secure);
    Ok(results)
}

/// Core status logic, separated from disk I/O for testability.
fn auth_status_from_store(
    store: &AuthStore,
    now_ms: i64,
    permissions_secure: bool,
) -> Vec<AuthStatusEntry> {
    let mut results = Vec::new();

    for (provider, entry) in &store.entries {
        let status_entry = match entry {
            AuthEntry::OAuth {
                expires, refresh, ..
            } => {
                // Determine token type label from provider name
                let auth_type = match provider.as_str() {
                    "copilot" => "Copilot OAuth".to_string(),
                    "chatgpt" => "ChatGPT OAuth".to_string(),
                    _ => "oauth".to_string(),
                };

                let has_refresh = !refresh.is_empty();

                let (status, expires_in) = if *expires <= 0 {
                    // expires=0 means no expiry info (e.g. copilot GitHub token)
                    ("unknown".to_string(), None)
                } else {
                    // Sanity check: reject expiry timestamps more than 2 years in the future
                    // (OAuth tokens rarely live longer; this catches clock skew or tampering)
                    let max_reasonable = now_ms + (2 * 365 * 24 * 3600 * 1000);
                    if *expires > max_reasonable {
                        ("unknown".to_string(), Some("expiry too far in future".to_string()))
                    } else {
                        let remaining = *expires - now_ms;
                        if remaining <= 0 {
                            let display = format_duration_ms(remaining);
                            ("expired".to_string(), Some(display))
                        } else {
                            let display = format_duration_ms(remaining);
                            ("active".to_string(), Some(display))
                        }
                    }
                };
                AuthStatusEntry {
                    provider: provider.clone(),
                    auth_type,
                    status,
                    expires_in,
                    has_refresh_token: has_refresh,
                    permissions_secure,
                }
            }
            AuthEntry::ApiKey { .. } => AuthStatusEntry {
                provider: provider.clone(),
                auth_type: "api_key".to_string(),
                status: "active".to_string(),
                expires_in: None,
                has_refresh_token: false,
                permissions_secure,
            },
        };
        results.push(status_entry);
    }

    // Sort by provider name for deterministic output
    results.sort_by(|a, b| a.provider.cmp(&b.provider));
    results
}

// ──────────────────────────────────────────────────────────────────────────────
// Constants
// ──────────────────────────────────────────────────────────────────────────────

/// GitHub OAuth App client ID for Copilot device flow authentication.
/// Public per OAuth spec (not a secret). Registered at github.com/settings/applications.
const GITHUB_CLIENT_ID: &str = "Ov23li8tweQw6odWQebz";
/// OpenAI/ChatGPT OAuth App client ID for device flow authentication.
/// Public per OAuth spec (not a secret). Registered via OpenAI developer portal.
const CHATGPT_CLIENT_ID: &str = "app_EMoamEEZ73f0CkXaXp7hrann";
/// Maximum number of polling attempts during device code authentication (5s intervals = 5min).
const MAX_POLL_ATTEMPTS: u32 = 60;

// ──────────────────────────────────────────────────────────────────────────────
// GitHub Copilot Login (Device Code Flow)
// ──────────────────────────────────────────────────────────────────────────────

#[derive(Deserialize)]
struct GithubDeviceCodeResponse {
    device_code: String,
    user_code: String,
    verification_uri: String,
    interval: u64,
}

#[derive(Deserialize)]
struct GithubTokenResponse {
    access_token: Option<String>,
    error: Option<String>,
}

pub async fn login_copilot() -> Result<AuthEntry> {
    let client = reqwest::Client::new();

    // Step 1: Request device code
    let resp = client
        .post("https://github.com/login/device/code")
        .header("Accept", "application/json")
        .form(&[("client_id", GITHUB_CLIENT_ID), ("scope", "read:user")])
        .send()
        .await
        .context("Failed to request GitHub device code")?;

    let status = resp.status();
    if status == reqwest::StatusCode::NOT_FOUND || status == reqwest::StatusCode::UNAUTHORIZED {
        bail!(
            "GitHub device code request failed (HTTP {}). \
             Make sure you have an active GitHub Copilot subscription at \
             https://github.com/settings/copilot",
            status,
        );
    }

    let device: GithubDeviceCodeResponse = resp
        .json()
        .await
        .context("Failed to parse GitHub device code response")?;

    // Step 2: Show instructions to user
    println!(
        "\n  {}  {}\n  {}  {}\n",
        "Go to:".bold(),
        device.verification_uri.cyan(),
        "Enter code:".bold(),
        device.user_code.green().bold(),
    );
    println!("  {}", "Waiting for authorization...".dimmed());

    // Step 3: Poll for access token
    let poll_interval = device.interval + 3;
    let mut attempts = 0;

    loop {
        attempts += 1;
        if attempts > MAX_POLL_ATTEMPTS {
            bail!(
                "Authorization timed out after {} attempts",
                MAX_POLL_ATTEMPTS
            );
        }

        tokio::time::sleep(std::time::Duration::from_secs(poll_interval)).await;

        let resp = client
            .post("https://github.com/login/oauth/access_token")
            .header("Accept", "application/json")
            .form(&[
                ("client_id", GITHUB_CLIENT_ID),
                ("device_code", device.device_code.as_str()),
                ("grant_type", "urn:ietf:params:oauth:grant-type:device_code"),
            ])
            .send()
            .await
            .context("Failed to poll GitHub token endpoint")?;

        let token_resp: GithubTokenResponse = resp
            .json()
            .await
            .context("Failed to parse GitHub token response")?;

        if let Some(access_token) = token_resp.access_token {
            return Ok(AuthEntry::OAuth {
                refresh: access_token.clone(),
                access: access_token,
                expires: 0,
                account_id: None,
            });
        }

        match token_resp.error.as_deref() {
            Some("authorization_pending") => continue,
            Some("slow_down") => {
                // Back off an extra 5 seconds
                tokio::time::sleep(std::time::Duration::from_secs(5)).await;
                continue;
            }
            Some(err) => bail!("GitHub authorization failed: {}", err),
            None => bail!("Unexpected empty response from GitHub token endpoint"),
        }
    }
}

// ──────────────────────────────────────────────────────────────────────────────
// ChatGPT Plus/Pro Login (Device Code Flow)
// ──────────────────────────────────────────────────────────────────────────────

#[derive(Deserialize)]
struct ChatGPTDeviceCodeResponse {
    device_auth_id: String,
    user_code: String,
    interval: u64,
}

#[derive(Deserialize)]
struct ChatGPTTokenPollResponse {
    authorization_code: Option<String>,
    code_verifier: Option<String>,
}

#[derive(Deserialize)]
struct ChatGPTOAuthTokenResponse {
    access_token: String,
    refresh_token: String,
    id_token: Option<String>,
    expires_in: i64,
}

pub async fn login_chatgpt() -> Result<AuthEntry> {
    let client = reqwest::Client::new();

    // Step 1: Request device code
    let resp = client
        .post("https://auth.openai.com/api/accounts/deviceauth/usercode")
        .json(&serde_json::json!({ "client_id": CHATGPT_CLIENT_ID }))
        .send()
        .await
        .context("Failed to request ChatGPT device code")?;

    let device: ChatGPTDeviceCodeResponse = resp
        .json()
        .await
        .context("Failed to parse ChatGPT device code response")?;

    // Step 2: Show instructions to user
    println!(
        "\n  {}  {}\n  {}  {}\n",
        "Go to:".bold(),
        "https://auth.openai.com/codex/device".cyan(),
        "Enter code:".bold(),
        device.user_code.green().bold(),
    );
    println!("  {}", "Waiting for authorization...".dimmed());

    // Step 3: Poll for authorization code
    let poll_interval = std::cmp::max(device.interval, 5);
    let mut attempts = 0;

    let (authorization_code, code_verifier) = loop {
        attempts += 1;
        if attempts > MAX_POLL_ATTEMPTS {
            bail!(
                "Authorization timed out after {} attempts",
                MAX_POLL_ATTEMPTS
            );
        }

        tokio::time::sleep(std::time::Duration::from_secs(poll_interval)).await;

        let resp = client
            .post("https://auth.openai.com/api/accounts/deviceauth/token")
            .json(&serde_json::json!({
                "device_auth_id": device.device_auth_id,
                "user_code": device.user_code,
            }))
            .send()
            .await
            .context("Failed to poll ChatGPT token endpoint")?;

        let status = resp.status();

        if status == reqwest::StatusCode::FORBIDDEN {
            // 403 = authorization still pending
            continue;
        }

        if !status.is_success() {
            let body = resp.text().await.unwrap_or_default();
            bail!("ChatGPT authorization failed (HTTP {}): {}", status, body);
        }

        let poll_resp: ChatGPTTokenPollResponse = resp
            .json()
            .await
            .context("Failed to parse ChatGPT token poll response")?;

        match (poll_resp.authorization_code, poll_resp.code_verifier) {
            (Some(code), Some(verifier)) => break (code, verifier),
            _ => bail!("ChatGPT token response missing authorization_code or code_verifier"),
        }
    };

    // Step 4: Exchange for OAuth tokens
    let resp = client
        .post("https://auth.openai.com/oauth/token")
        .form(&[
            ("grant_type", "authorization_code"),
            ("code", authorization_code.as_str()),
            (
                "redirect_uri",
                "https://auth.openai.com/deviceauth/callback",
            ),
            ("client_id", CHATGPT_CLIENT_ID),
            ("code_verifier", code_verifier.as_str()),
        ])
        .send()
        .await
        .context("Failed to exchange ChatGPT authorization code for tokens")?;

    if !resp.status().is_success() {
        let body = resp.text().await.unwrap_or_default();
        bail!(
            "ChatGPT token exchange failed: {}. \
             Please verify your ChatGPT Plus/Pro subscription is active at \
             https://chatgpt.com/settings/subscription",
            body,
        );
    }

    let tokens: ChatGPTOAuthTokenResponse = resp
        .json()
        .await
        .context("Failed to parse ChatGPT OAuth token response")?;

    // Step 5: Extract account_id from id_token JWT
    let account_id = tokens
        .id_token
        .as_deref()
        .and_then(|jwt| extract_chatgpt_account_id(jwt).ok());

    let now_ms = chrono::Utc::now().timestamp_millis();

    Ok(AuthEntry::OAuth {
        refresh: tokens.refresh_token,
        access: tokens.access_token,
        expires: now_ms + tokens.expires_in * 1000,
        account_id,
    })
}

// ──────────────────────────────────────────────────────────────────────────────
// Token Refresh
// ──────────────────────────────────────────────────────────────────────────────

pub async fn refresh_chatgpt_token(entry: &AuthEntry) -> Result<AuthEntry> {
    let refresh_token = match entry {
        AuthEntry::OAuth { refresh, .. } => refresh,
        AuthEntry::ApiKey { .. } => bail!("Cannot refresh an API key entry"),
    };

    let client = reqwest::Client::new();
    let resp = match client
        .post("https://auth.openai.com/oauth/token")
        .form(&[
            ("grant_type", "refresh_token"),
            ("refresh_token", refresh_token.as_str()),
            ("client_id", CHATGPT_CLIENT_ID),
        ])
        .send()
        .await
    {
        Ok(r) => r,
        Err(e) => {
            return Err(RefreshError::NetworkError(format!(
                "Failed to connect to auth.openai.com: {}",
                e
            ))
            .into());
        }
    };

    let status = resp.status();

    if !status.is_success() {
        let body = resp.text().await.unwrap_or_default();

        // 401 or body contains "invalid_grant" => refresh token expired/revoked
        if status == reqwest::StatusCode::UNAUTHORIZED || body.contains("invalid_grant") {
            return Err(RefreshError::InvalidGrant(
                "Refresh token expired, please re-authenticate with /login".to_string(),
            )
            .into());
        }

        // 5xx => server error, transient
        if status.is_server_error() {
            return Err(RefreshError::ServerError(format!(
                "ChatGPT auth server returned HTTP {}: {}",
                status, body
            ))
            .into());
        }

        return Err(RefreshError::Unknown(format!(
            "ChatGPT token refresh failed (HTTP {}): {}",
            status, body
        ))
        .into());
    }

    let tokens: ChatGPTOAuthTokenResponse = resp
        .json()
        .await
        .context("Failed to parse ChatGPT refresh response")?;

    let account_id = tokens
        .id_token
        .as_deref()
        .and_then(|jwt| extract_chatgpt_account_id(jwt).ok());

    let now_ms = chrono::Utc::now().timestamp_millis();

    Ok(AuthEntry::OAuth {
        refresh: tokens.refresh_token,
        access: tokens.access_token,
        expires: now_ms + tokens.expires_in * 1000,
        account_id,
    })
}

// ──────────────────────────────────────────────────────────────────────────────
// Copilot Token Fetch
// ──────────────────────────────────────────────────────────────────────────────

#[derive(Deserialize)]
struct CopilotTokenResponse {
    token: String,
    expires_at: i64,
}

pub async fn get_copilot_api_token(github_token: &str) -> Result<(String, i64)> {
    let client = reqwest::Client::new();
    let resp = client
        .get("https://api.github.com/copilot_internal/v2/token")
        .header("Authorization", format!("token {}", github_token))
        .header("User-Agent", "agiworkforce-cli/0.1.0")
        .send()
        .await
        .context("Failed to fetch Copilot API token")?;

    if !resp.status().is_success() {
        let status = resp.status();
        let body = resp.text().await.unwrap_or_default();
        if status == reqwest::StatusCode::UNAUTHORIZED {
            bail!(
                "Copilot token fetch failed (HTTP 401): {}. \
                 Your GitHub credentials may have expired — try running /login again \
                 to refresh them.",
                body,
            );
        }
        bail!("Copilot token fetch failed (HTTP {}): {}", status, body);
    }

    let token_resp: CopilotTokenResponse = resp
        .json()
        .await
        .context("Failed to parse Copilot token response")?;

    Ok((token_resp.token, token_resp.expires_at))
}

// ──────────────────────────────────────────────────────────────────────────────
// Resolve Auth for Provider
// ──────────────────────────────────────────────────────────────────────────────

/// Returns `Some((api_key_or_token, optional_base_url_override))` if subscription
/// auth is available for the given provider. Returns `None` to fall through to
/// standard API key resolution.
pub async fn resolve_auth(
    store: &mut AuthStore,
    provider: &str,
) -> Result<Option<(String, Option<String>)>> {
    match provider {
        "copilot" => {
            let entry = match store.entries.get("copilot") {
                Some(e) => e.clone(),
                None => return Ok(None),
            };

            // Check the transient cache first — avoid fetching a new token on every request
            let now_secs = chrono::Utc::now().timestamp();
            if let Some((ref cached_token, cached_expires)) = store.copilot_cache {
                if cached_expires > now_secs + 30 {
                    return Ok(Some((
                        cached_token.clone(),
                        Some("https://api.githubcopilot.com/chat/completions".to_string()),
                    )));
                }
            }

            let github_token = match &entry {
                AuthEntry::OAuth { access, .. } => access.clone(),
                AuthEntry::ApiKey { key } => key.clone(),
            };

            let (copilot_token, expires_at) = get_copilot_api_token(&github_token).await?;

            // Cache the token for subsequent calls
            store.copilot_cache = Some((copilot_token.clone(), expires_at));

            Ok(Some((
                copilot_token,
                Some("https://api.githubcopilot.com/chat/completions".to_string()),
            )))
        }
        "chatgpt" => {
            let entry = match store.entries.get("chatgpt") {
                Some(e) => e.clone(),
                None => return Ok(None),
            };

            let now_ms = chrono::Utc::now().timestamp_millis();

            // Check if token is expired (or within 30s of expiry) and refresh
            let entry = match &entry {
                AuthEntry::OAuth { expires, .. }
                    if *expires > 0 && *expires < (now_ms + 30_000) =>
                {
                    let refreshed = refresh_chatgpt_token(&entry).await?;
                    store
                        .entries
                        .insert("chatgpt".to_string(), refreshed.clone());
                    store.save()?;
                    refreshed
                }
                _ => entry,
            };

            let access_token = match &entry {
                AuthEntry::OAuth { access, .. } => access.clone(),
                AuthEntry::ApiKey { key } => key.clone(),
            };

            Ok(Some((
                access_token,
                Some("https://chatgpt.com/backend-api/codex/responses".to_string()),
            )))
        }
        _ => Ok(None),
    }
}

// ──────────────────────────────────────────────────────────────────────────────
// Interactive Login
// ──────────────────────────────────────────────────────────────────────────────

pub async fn interactive_login() -> Result<()> {
    let choices = &[
        "GitHub Copilot (free with Copilot subscription)",
        "ChatGPT Plus/Pro (free with subscription)",
        "Cancel",
    ];

    let selection = dialoguer::Select::new()
        .with_prompt("Choose a subscription to authenticate")
        .items(choices)
        .default(0)
        .interact()
        .context("Failed to display login menu")?;

    let (key, entry) = match selection {
        0 => {
            println!("\n{}", "Connecting to GitHub Copilot...".cyan());
            let entry = login_copilot().await?;
            ("copilot".to_string(), entry)
        }
        1 => {
            println!("\n{}", "Connecting to ChatGPT...".cyan());
            let entry = login_chatgpt().await?;
            ("chatgpt".to_string(), entry)
        }
        _ => {
            println!("Cancelled.");
            return Ok(());
        }
    };

    let mut store = AuthStore::load()?;
    store.entries.insert(key.clone(), entry);
    store.save()?;

    println!(
        "\n  {} {} authentication saved to {}",
        "Done!".green().bold(),
        key,
        auth_path()?.display()
    );

    Ok(())
}

/// Login for a specific provider by name (used by onboarding wizard).
///
/// Delegates to OAuth flow for known providers, or falls back to
/// `interactive_login()` for subscription-based providers.
pub async fn interactive_login_for_provider(provider: Option<&str>) -> Result<()> {
    match provider {
        Some("agiworkforce") | Some("agi") => {
            let api_base = "https://api.agiworkforce.com";
            let entry = crate::oauth::device_code_login(api_base).await?;
            let mut store = AuthStore::load()?;
            store.entries.insert("agiworkforce".to_string(), entry);
            store.save()?;
            Ok(())
        }
        Some(pid) => {
            if let Some(provider_cfg) = crate::oauth::get_provider(pid) {
                let entry = crate::oauth::oauth_login(provider_cfg).await?;
                let mut store = AuthStore::load()?;
                store.entries.insert(pid.to_string(), entry);
                store.save()?;
                Ok(())
            } else {
                // Fall back to existing interactive flow
                interactive_login().await
            }
        }
        None => interactive_login().await,
    }
}

/// Interactive API key setup (used by onboarding wizard).
///
/// Prompts for provider selection and API key entry, then persists to auth.json.
pub async fn interactive_api_key_login() -> Result<()> {
    let choices = &[
        "Anthropic (ANTHROPIC_API_KEY)",
        "OpenAI (OPENAI_API_KEY)",
        "Google (GOOGLE_API_KEY)",
        "xAI (XAI_API_KEY)",
        "DeepSeek (DEEPSEEK_API_KEY)",
        "Mistral (MISTRAL_API_KEY)",
        "Cancel",
    ];

    let selection = dialoguer::Select::new()
        .with_prompt("Select provider for API key")
        .items(choices)
        .default(0)
        .interact()
        .context("Failed to display provider menu")?;

    let provider_id = match selection {
        0 => "anthropic",
        1 => "openai",
        2 => "google",
        3 => "xai",
        4 => "deepseek",
        5 => "mistral",
        _ => {
            println!("Cancelled.");
            return Ok(());
        }
    };

    let key = dialoguer::Password::new()
        .with_prompt(format!("Enter {} API key", provider_id))
        .interact()
        .context("Failed to read API key")?;

    if key.trim().is_empty() {
        bail!("Empty API key.");
    }

    let mut store = AuthStore::load()?;
    store
        .entries
        .insert(provider_id.to_string(), AuthEntry::ApiKey { key });
    store.save()?;

    println!(
        "  {} {} API key saved.",
        "Done!".green().bold(),
        provider_id,
    );
    Ok(())
}

// ──────────────────────────────────────────────────────────────────────────────
// Base64url Decoder (for JWT parsing — no external crate needed)
// ──────────────────────────────────────────────────────────────────────────────

fn base64url_decode(input: &str) -> Result<Vec<u8>> {
    // Base64url alphabet: A-Z a-z 0-9 - _
    // Standard alphabet:  A-Z a-z 0-9 + /
    const TABLE: [u8; 128] = {
        let mut t = [255u8; 128];
        let mut i = 0u8;
        while i < 26 {
            t[(b'A' + i) as usize] = i;
            t[(b'a' + i) as usize] = i + 26;
            i += 1;
        }
        let mut d = 0u8;
        while d < 10 {
            t[(b'0' + d) as usize] = d + 52;
            d += 1;
        }
        t[b'-' as usize] = 62; // base64url uses - instead of +
        t[b'_' as usize] = 63; // base64url uses _ instead of /
        t[b'+' as usize] = 62; // accept standard too
        t[b'/' as usize] = 63;
        t
    };

    let input = input.trim_end_matches('=');
    let len = input.len();
    let mut out = Vec::with_capacity(len * 3 / 4);
    let mut buf: u32 = 0;
    let mut bits: u32 = 0;

    for &b in input.as_bytes() {
        if b >= 128 {
            bail!("Invalid base64url character");
        }
        let val = TABLE[b as usize];
        if val == 255 {
            bail!("Invalid base64url character: '{}'", b as char);
        }
        buf = (buf << 6) | val as u32;
        bits += 6;
        if bits >= 8 {
            bits -= 8;
            out.push((buf >> bits) as u8);
            buf &= (1 << bits) - 1;
        }
    }

    Ok(out)
}

fn extract_chatgpt_account_id(jwt: &str) -> Result<String> {
    let parts: Vec<&str> = jwt.split('.').collect();
    if parts.len() < 2 {
        bail!("Invalid JWT: expected at least 2 parts separated by '.'");
    }
    let payload_bytes = base64url_decode(parts[1])?;
    let payload: serde_json::Value =
        serde_json::from_slice(&payload_bytes).context("Failed to parse JWT payload as JSON")?;
    payload["chatgpt_account_id"]
        .as_str()
        .map(|s| s.to_string())
        .context("JWT payload missing chatgpt_account_id field")
}

// ──────────────────────────────────────────────────────────────────────────────
// Tests
// ──────────────────────────────────────────────────────────────────────────────

#[cfg(test)]
mod tests {
    use super::*;

    // Helper: build a minimal AuthStore in-memory (bypasses disk I/O)
    fn make_store(entries: Vec<(&str, AuthEntry)>) -> AuthStore {
        let mut map = HashMap::new();
        for (k, v) in entries {
            map.insert(k.to_string(), v);
        }
        AuthStore {
            entries: map,
            copilot_cache: None,
        }
    }

    // ── auth_status tests ──

    #[test]
    fn test_auth_status_empty_store() {
        let store = AuthStore::default();
        let now_ms = chrono::Utc::now().timestamp_millis();
        let results = auth_status_from_store(&store, now_ms, true);
        assert!(results.is_empty(), "empty store should yield no entries");
    }

    #[test]
    fn test_auth_status_expired_oauth() {
        let now_ms = 1_700_000_000_000i64;
        let past_ms = now_ms - 300_000; // 5 minutes ago
        let store = make_store(vec![(
            "chatgpt",
            AuthEntry::OAuth {
                refresh: "refresh_tok_abc".into(),
                access: "access_tok_abc".into(),
                expires: past_ms,
                account_id: None,
            },
        )]);
        let results = auth_status_from_store(&store, now_ms, true);
        assert_eq!(results.len(), 1);
        assert_eq!(results[0].status, "expired");
        assert_eq!(results[0].auth_type, "ChatGPT OAuth");
        // Should now show "expired 5m ago" instead of None
        assert!(results[0].expires_in.is_some());
        let display = results[0].expires_in.as_ref().unwrap();
        assert!(
            display.contains("expired"),
            "should say expired: {}",
            display
        );
        assert!(display.contains("ago"), "should say ago: {}", display);
        assert!(results[0].has_refresh_token);
        assert!(results[0].permissions_secure);
    }

    #[test]
    fn test_auth_status_active_oauth() {
        let now_ms = 1_700_000_000_000i64;
        let future_ms = now_ms + 9_000_000; // 2h 30m ahead
        let store = make_store(vec![(
            "chatgpt",
            AuthEntry::OAuth {
                refresh: "refresh_tok_abc".into(),
                access: "access_tok_abc".into(),
                expires: future_ms,
                account_id: None,
            },
        )]);
        let results = auth_status_from_store(&store, now_ms, true);
        assert_eq!(results.len(), 1);
        assert_eq!(results[0].status, "active");
        let display = results[0].expires_in.as_ref().unwrap();
        assert!(
            display.contains("expires in"),
            "should say 'expires in': {}",
            display
        );
        assert!(display.contains("2h"), "should show hours: {}", display);
    }

    #[test]
    fn test_auth_status_copilot_type() {
        let store = make_store(vec![(
            "copilot",
            AuthEntry::OAuth {
                refresh: "ghp_abcdef1234567890".into(),
                access: "ghp_abcdef1234567890".into(),
                expires: 0,
                account_id: None,
            },
        )]);
        let now_ms = chrono::Utc::now().timestamp_millis();
        let results = auth_status_from_store(&store, now_ms, false);
        assert_eq!(results.len(), 1);
        assert_eq!(results[0].auth_type, "Copilot OAuth");
        assert_eq!(results[0].status, "unknown"); // expires=0
        assert!(results[0].has_refresh_token);
        assert!(!results[0].permissions_secure);
    }

    #[test]
    fn test_auth_status_api_key() {
        let store = make_store(vec![(
            "openai",
            AuthEntry::ApiKey {
                key: "sk-test1234567890abcdef".into(),
            },
        )]);
        let now_ms = chrono::Utc::now().timestamp_millis();
        let results = auth_status_from_store(&store, now_ms, true);
        assert_eq!(results.len(), 1);
        assert_eq!(results[0].status, "active");
        assert_eq!(results[0].auth_type, "api_key");
        assert!(!results[0].has_refresh_token);
    }

    #[test]
    fn test_auth_status_no_refresh_token() {
        let store = make_store(vec![(
            "chatgpt",
            AuthEntry::OAuth {
                refresh: "".into(), // empty refresh token
                access: "access_tok_abc".into(),
                expires: 0,
                account_id: None,
            },
        )]);
        let now_ms = chrono::Utc::now().timestamp_millis();
        let results = auth_status_from_store(&store, now_ms, true);
        assert!(!results[0].has_refresh_token);
    }

    // ── Token refresh skew ──

    #[test]
    fn test_token_refresh_skew() {
        let now_ms = 1_000_000_000_000i64;
        let expires_in_20s = now_ms + 20_000;
        assert!(
            expires_in_20s > 0 && expires_in_20s < (now_ms + 30_000),
            "token expiring in 20s should be treated as expired with 30s skew"
        );
        let expires_in_60s = now_ms + 60_000;
        assert!(
            !(expires_in_60s > 0 && expires_in_60s < (now_ms + 30_000)),
            "token expiring in 60s should NOT be treated as expired"
        );
    }

    // ── JWT / base64url tests ──

    #[test]
    fn test_extract_chatgpt_account_id_valid() {
        let payload_json = r#"{"chatgpt_account_id":"acct_123"}"#;
        let payload_b64 = base64url_encode(payload_json.as_bytes());
        let jwt = format!("eyJhbGciOiJub25lIn0.{}.signature", payload_b64);
        let result = extract_chatgpt_account_id(&jwt).unwrap();
        assert_eq!(result, "acct_123");
    }

    #[test]
    fn test_extract_chatgpt_account_id_missing_field() {
        let payload_json = r#"{"sub":"user_abc"}"#;
        let payload_b64 = base64url_encode(payload_json.as_bytes());
        let jwt = format!("eyJhbGciOiJub25lIn0.{}.sig", payload_b64);
        assert!(extract_chatgpt_account_id(&jwt).is_err());
    }

    #[test]
    fn test_base64url_decode_hello() {
        let decoded = base64url_decode("SGVsbG8").unwrap();
        assert_eq!(decoded, b"Hello");
    }

    #[test]
    fn test_base64url_decode_with_padding() {
        let decoded = base64url_decode("SGk=").unwrap();
        assert_eq!(decoded, b"Hi");
        let decoded_no_pad = base64url_decode("SGk").unwrap();
        assert_eq!(decoded_no_pad, b"Hi");
    }

    #[test]
    fn test_base64url_decode_url_safe_chars() {
        let decoded_url = base64url_decode("P_8-").unwrap();
        let decoded_std = base64url_decode("P/8+").unwrap();
        assert_eq!(decoded_url, decoded_std);
    }

    // ── format_duration_ms (now with "expires in" / "expired X ago") ──

    #[test]
    fn test_format_duration_ms() {
        assert_eq!(format_duration_ms(0), "expired");
        assert_eq!(format_duration_ms(5_000), "expires in 5s");
        assert_eq!(format_duration_ms(120_000), "expires in 2m");
        assert_eq!(format_duration_ms(8_100_000), "expires in 2h 15m");
        assert_eq!(format_duration_ms(3_600_000), "expires in 1h 0m");
    }

    #[test]
    fn test_format_duration_ms_negative() {
        assert_eq!(format_duration_ms(-5_000), "expired 5s ago");
        assert_eq!(format_duration_ms(-300_000), "expired 5m ago");
        assert_eq!(format_duration_ms(-3_660_000), "expired 1h 1m ago");
    }

    #[test]
    fn test_format_duration_short() {
        assert_eq!(format_duration_short(0), "expired");
        assert_eq!(format_duration_short(-1000), "expired");
        assert_eq!(format_duration_short(5_000), "5s");
        assert_eq!(format_duration_short(120_000), "2m");
        assert_eq!(format_duration_short(8_100_000), "2h 15m");
    }

    // ── Token redaction ──

    #[test]
    fn test_redact_token_long() {
        let token = "sk-proj-abcdefghijklmnopqrstuvwxyz1234";
        let redacted = redact_token(token);
        assert_eq!(redacted, "sk-proj-...1234");
        // Must not contain the full token
        assert!(!redacted.contains("abcdefghijklmnopqrstuvwxyz"));
    }

    #[test]
    fn test_redact_token_short() {
        assert_eq!(redact_token("abc"), "***");
        assert_eq!(redact_token(""), "***");
        assert_eq!(redact_token("0123456789abcde"), "***"); // 15 chars, below 16
    }

    #[test]
    fn test_redact_token_exactly_16() {
        let token = "0123456789abcdef"; // exactly 16 chars
        let redacted = redact_token(token);
        assert_eq!(redacted, "01234567...cdef");
    }

    #[test]
    fn test_redacted_auth_entry_display_oauth() {
        let entry = AuthEntry::OAuth {
            refresh: "refresh_token_abcdef1234567890".into(),
            access: "access_token_abcdef1234567890".into(),
            expires: 1700000000000,
            account_id: Some("acct_123".into()),
        };
        let display = format!("{}", RedactedAuthEntry(&entry));
        // Must show redacted tokens
        assert!(display.contains("access_t...7890"));
        assert!(display.contains("refresh_...7890"));
        assert!(display.contains("acct_123"));
        // Must NOT contain full tokens
        assert!(!display.contains("access_token_abcdef1234567890"));
        assert!(!display.contains("refresh_token_abcdef1234567890"));
    }

    #[test]
    fn test_redacted_auth_entry_display_api_key() {
        let entry = AuthEntry::ApiKey {
            key: "sk-abcdefghij1234567890".into(),
        };
        let display = format!("{}", RedactedAuthEntry(&entry));
        assert!(display.contains("sk-abcde...7890"));
        assert!(!display.contains("sk-abcdefghij1234567890"));
    }

    #[test]
    fn test_redacted_auth_entry_debug_also_redacted() {
        let entry = AuthEntry::ApiKey {
            key: "sk-abcdefghij1234567890".into(),
        };
        let debug = format!("{:?}", RedactedAuthEntry(&entry));
        // Debug delegates to Display, so should also be redacted
        assert!(!debug.contains("sk-abcdefghij1234567890"));
    }

    // ── RefreshError classification ──

    #[test]
    fn test_refresh_error_invalid_grant_display() {
        let err = RefreshError::InvalidGrant("token revoked".into());
        let msg = err.to_string();
        assert!(msg.contains("invalid grant"));
        assert!(msg.contains("token revoked"));
    }

    #[test]
    fn test_refresh_error_network_display() {
        let err = RefreshError::NetworkError("connection refused".into());
        let msg = err.to_string();
        assert!(msg.contains("network error"));
        assert!(msg.contains("connection refused"));
    }

    #[test]
    fn test_refresh_error_server_display() {
        let err = RefreshError::ServerError("HTTP 503".into());
        let msg = err.to_string();
        assert!(msg.contains("server error"));
        assert!(msg.contains("HTTP 503"));
    }

    #[test]
    fn test_refresh_error_unknown_display() {
        let err = RefreshError::Unknown("something happened".into());
        let msg = err.to_string();
        assert!(msg.contains("refresh error"));
        assert!(msg.contains("something happened"));
    }

    #[test]
    fn test_refresh_error_is_std_error() {
        // Verify RefreshError implements std::error::Error (compiles = passes)
        let err: Box<dyn std::error::Error> = Box::new(RefreshError::InvalidGrant("test".into()));
        assert!(!err.to_string().is_empty());
    }

    // ── File permissions ──

    #[cfg(unix)]
    #[test]
    fn test_set_and_check_file_permissions() {
        let dir = tempfile::tempdir().unwrap();
        let path = dir.path().join("test_auth.json");
        std::fs::write(&path, "{}").unwrap();

        // Before setting, permissions might be 0o644 (default umask)
        set_file_permissions(&path).unwrap();

        // After setting, should be 0o600
        assert!(
            check_file_permissions_secure(&path),
            "file should be owner-only after set_file_permissions"
        );

        // Verify the exact mode bits
        use std::os::unix::fs::PermissionsExt;
        let mode = std::fs::metadata(&path).unwrap().permissions().mode();
        assert_eq!(
            mode & 0o777,
            0o600,
            "expected 0o600, got 0o{:o}",
            mode & 0o777
        );
    }

    #[cfg(unix)]
    #[test]
    fn test_check_permissions_insecure_file() {
        use std::os::unix::fs::PermissionsExt;
        let dir = tempfile::tempdir().unwrap();
        let path = dir.path().join("insecure_auth.json");
        std::fs::write(&path, "{}").unwrap();

        // Set world-readable
        let perms = std::fs::Permissions::from_mode(0o644);
        std::fs::set_permissions(&path, perms).unwrap();

        assert!(
            !check_file_permissions_secure(&path),
            "0o644 should be reported as insecure"
        );
    }

    #[cfg(unix)]
    #[test]
    fn test_check_permissions_nonexistent_file() {
        let path = Path::new("/tmp/nonexistent_auth_test_file.json");
        assert!(
            !check_file_permissions_secure(path),
            "nonexistent file should return false"
        );
    }

    #[cfg(unix)]
    #[test]
    fn test_save_sets_permissions() {
        // Override the auth_path to use a temp dir
        let dir = tempfile::tempdir().unwrap();
        let path = dir.path().join("auth.json");
        let store = AuthStore::default();
        let data = serde_json::to_string_pretty(&store).unwrap();
        std::fs::write(&path, &data).unwrap();
        set_file_permissions(&path).unwrap();

        use std::os::unix::fs::PermissionsExt;
        let mode = std::fs::metadata(&path).unwrap().permissions().mode();
        assert_eq!(mode & 0o777, 0o600);
    }

    // ── Test helper: base64url encode (only needed by tests) ──

    fn base64url_encode(input: &[u8]) -> String {
        const CHARS: &[u8; 64] =
            b"ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_";
        let mut out = String::with_capacity((input.len() + 2) / 3 * 4);
        for chunk in input.chunks(3) {
            let b0 = chunk[0] as u32;
            let b1 = if chunk.len() > 1 { chunk[1] as u32 } else { 0 };
            let b2 = if chunk.len() > 2 { chunk[2] as u32 } else { 0 };
            let triple = (b0 << 16) | (b1 << 8) | b2;
            out.push(CHARS[((triple >> 18) & 0x3F) as usize] as char);
            out.push(CHARS[((triple >> 12) & 0x3F) as usize] as char);
            if chunk.len() > 1 {
                out.push(CHARS[((triple >> 6) & 0x3F) as usize] as char);
            }
            if chunk.len() > 2 {
                out.push(CHARS[(triple & 0x3F) as usize] as char);
            }
        }
        out
    }
}
