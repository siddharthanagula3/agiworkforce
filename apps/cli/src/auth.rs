use anyhow::{bail, Context, Result};
use colored::Colorize;
use serde::{Deserialize, Serialize};
use sha2::{Digest, Sha256};
use std::collections::{BTreeSet, HashMap};
use std::fmt;
use std::path::{Path, PathBuf};

use crate::terminal_style as ts;

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
    },
    #[serde(rename = "api")]
    ApiKey { key: String },
}

#[derive(Debug, Clone, Serialize, Deserialize, Default)]
pub struct AuthStore {
    #[serde(flatten)]
    pub entries: HashMap<String, AuthEntry>,
    /// Transient copilot API token cache: (token, expires_at_unix_seconds).
    /// Not persisted to disk, refreshed on demand.
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
    /// When this credential was last read out of the credential store and used,
    /// from the local credential-use trail. `None` means it has not been used
    /// since the trail began.
    pub last_used: Option<String>,
}

// ──────────────────────────────────────────────────────────────────────────────
// RefreshError, typed error classification for token refresh failures
// ──────────────────────────────────────────────────────────────────────────────

#[derive(Debug)]
pub enum RefreshError {
    /// Refresh token expired or revoked, user must re-authenticate.
    InvalidGrant(String),
    /// Network connectivity failure (DNS, timeout, connection refused).
    NetworkError(String),
    /// Server returned 5xx, transient, may succeed on retry.
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
            } => {
                write!(
                    f,
                    "OAuth(access={}, refresh={}, expires={})",
                    redact_token(access),
                    redact_token(refresh),
                    expires,
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

const AUTH_KEYRING_SERVICE: &str = "com.agiworkforce.cli.auth";
const AUTH_INDEX_VERSION: u8 = 1;
const AUTH_INDEX_STORAGE: &str = "os-keyring";

/// Non-secret discovery metadata. Keyring APIs do not provide a portable way
/// to enumerate accounts, so auth.json retains provider names only; credential
/// material lives in one OS-keyring entry per provider.
#[derive(Debug, Serialize, Deserialize)]
struct AuthKeyringIndex {
    version: u8,
    storage: String,
    providers: Vec<String>,
}

fn keyring_disabled() -> bool {
    std::env::var("AGIWORKFORCE_NO_KEYRING")
        .map(|value| !value.is_empty() && value != "0")
        .unwrap_or(false)
}

pub fn credential_storage_label() -> &'static str {
    if keyring_disabled() {
        "owner-only credential file (OS keyring explicitly disabled)"
    } else {
        "OS credential store"
    }
}

fn auth_keyring_account(provider: &str) -> String {
    let digest = Sha256::digest(provider.as_bytes());
    format!("provider:{}", crate::hex::encode(&digest))
}

/// The OS credential store, behind a seam so the persistence rules can be
/// tested without a real keychain.
///
/// Every method returns a `Result`. A store that denies access, which is what
/// an unsigned or unattended binary sees on macOS, has to surface as an error
/// the caller reports; degrading to a plaintext file would quietly undo the
/// reason these credentials moved off disk in the first place.
trait CredentialStore {
    fn get(&self, account: &str) -> Result<Option<String>>;
    fn set(&self, account: &str, secret: &str) -> Result<()>;
    fn delete(&self, account: &str) -> Result<()>;
}

struct OsKeyring;

impl OsKeyring {
    fn entry(&self, account: &str) -> Result<keyring::Entry> {
        keyring::Entry::new(AUTH_KEYRING_SERVICE, account)
            .context("Could not open the OS credential store")
    }
}

impl CredentialStore for OsKeyring {
    fn get(&self, account: &str) -> Result<Option<String>> {
        match self.entry(account)?.get_password() {
            Ok(secret) => Ok(Some(secret)),
            Err(keyring::Error::NoEntry) => Ok(None),
            Err(error) => Err(error).context(
                "The OS credential store denied access; approve the keychain prompt, or sign in again with `agi login`",
            ),
        }
    }

    fn set(&self, account: &str, secret: &str) -> Result<()> {
        self.entry(account)?
            .set_password(secret)
            .context("The OS credential store refused to save the credential")
    }

    fn delete(&self, account: &str) -> Result<()> {
        match self.entry(account)?.delete_credential() {
            Ok(()) | Err(keyring::Error::NoEntry) => Ok(()),
            Err(error) => {
                Err(error).context("The OS credential store refused to remove the credential")
            }
        }
    }
}

fn parse_auth_keyring_index(data: &str) -> Option<AuthKeyringIndex> {
    let index = serde_json::from_str::<AuthKeyringIndex>(data).ok()?;
    (index.version == AUTH_INDEX_VERSION && index.storage == AUTH_INDEX_STORAGE).then_some(index)
}

fn write_owner_only_file(path: &Path, data: &str) -> Result<()> {
    std::fs::write(path, data).with_context(|| format!("Failed to write {}", path.display()))?;
    set_file_permissions(path)
        .with_context(|| format!("Failed to restrict permissions on {}", path.display()))
}

fn load_keyring_auth(
    credentials: &dyn CredentialStore,
    index: AuthKeyringIndex,
) -> Result<AuthStore> {
    let mut entries = HashMap::with_capacity(index.providers.len());
    for provider in index.providers {
        let secret = credentials
            .get(&auth_keyring_account(&provider))
            .with_context(|| format!("Could not read the saved {provider} credential"))?
            .with_context(|| {
                format!(
                    "The saved {provider} credential is missing from the OS credential store; sign in again with `agi login`"
                )
            })?;
        let entry = serde_json::from_str::<AuthEntry>(&secret)
            .with_context(|| format!("Saved {provider} credential is invalid"))?;
        entries.insert(provider, entry);
    }
    Ok(AuthStore {
        entries,
        copilot_cache: None,
    })
}

fn save_keyring_auth(
    credentials: &dyn CredentialStore,
    path: &Path,
    store: &AuthStore,
) -> Result<()> {
    let previous_providers = std::fs::read_to_string(path)
        .ok()
        .and_then(|data| parse_auth_keyring_index(&data))
        .map(|index| index.providers.into_iter().collect::<BTreeSet<_>>())
        .unwrap_or_default();
    let current_providers = store.entries.keys().cloned().collect::<BTreeSet<_>>();

    // Credentials are committed to the store before the index names them, so a
    // failure anywhere leaves the previous index in place rather than a file
    // that promises credentials the store does not hold.
    for provider in &current_providers {
        let entry = store
            .entries
            .get(provider)
            .context("Credential index changed during save")?;
        let secret = serde_json::to_string(entry).context("Failed to serialize credential")?;
        credentials
            .set(&auth_keyring_account(provider), &secret)
            .with_context(|| {
                format!("Could not save the {provider} credential in the OS credential store")
            })?;
    }

    for provider in previous_providers.difference(&current_providers) {
        credentials
            .delete(&auth_keyring_account(provider))
            .with_context(|| format!("Could not remove the saved {provider} credential"))?;
    }

    let index = AuthKeyringIndex {
        version: AUTH_INDEX_VERSION,
        storage: AUTH_INDEX_STORAGE.to_string(),
        providers: current_providers.into_iter().collect(),
    };
    let data = serde_json::to_string_pretty(&index).context("Failed to serialize auth index")?;
    write_owner_only_file(path, &data)
}

impl AuthStore {
    pub fn load() -> Result<Self> {
        let path = auth_path()?;
        if !path.exists() {
            return Ok(Self::default());
        }
        let data = std::fs::read_to_string(&path).context("Failed to read auth.json")?;
        if let Some(index) = parse_auth_keyring_index(&data) {
            return load_keyring_auth(&OsKeyring, index);
        }

        // One-time migration from the legacy owner-readable JSON file. We do
        // not silently fall back to plaintext when the OS keyring fails; an
        // explicit headless opt-out is required for that compatibility mode.
        let store: AuthStore = serde_json::from_str(&data).context("Failed to parse auth.json")?;
        if !keyring_disabled() {
            save_keyring_auth(&OsKeyring, &path, &store).context(
                "Could not migrate auth.json into the OS keyring; set AGIWORKFORCE_NO_KEYRING=1 only in a trusted headless environment to retain the owner-only file store",
            )?;
        }
        Ok(store)
    }

    pub fn save(&self) -> Result<()> {
        let dir = crate::config::CliConfig::config_dir()?;
        std::fs::create_dir_all(&dir).context("Failed to create config directory")?;
        let path = auth_path()?;
        if keyring_disabled() {
            let data =
                serde_json::to_string_pretty(self).context("Failed to serialize auth store")?;
            return write_owner_only_file(&path, &data);
        }
        save_keyring_auth(&OsKeyring, &path, self).context(
            "Could not persist credentials in the OS keyring; set AGIWORKFORCE_NO_KEYRING=1 only in a trusted headless environment to use an owner-only file",
        )
    }
}

// ──────────────────────────────────────────────────────────────────────────────
// Credential-use trail
// ──────────────────────────────────────────────────────────────────────────────

const CREDENTIAL_USE_LOG: &str = "credential-use.jsonl";
const CREDENTIAL_USE_LOG_MAX_ENTRIES: usize = 500;

/// One occasion a stored credential was read out of the credential store and
/// turned into an outbound token, or written into it.
///
/// "This account is only used when you say so" is a claim, and a claim with no
/// record behind it cannot be checked. Nothing here is a secret: the provider
/// name, what it was used for, and when.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CredentialUse {
    pub at_ms: i64,
    pub provider: String,
    pub purpose: String,
}

fn credential_use_log_path() -> Result<PathBuf> {
    Ok(crate::config::CliConfig::config_dir()?.join(CREDENTIAL_USE_LOG))
}

/// Append one credential use to the local trail. Best effort: a CLI run must
/// not fail because its audit file is unwritable, and the caller has already
/// decided the use is legitimate.
pub fn record_credential_use(provider: &str, purpose: &str) {
    let Ok(path) = credential_use_log_path() else {
        return;
    };
    let mut entries = read_credential_uses(&path);
    entries.push(CredentialUse {
        at_ms: chrono::Utc::now().timestamp_millis(),
        provider: provider.to_string(),
        purpose: purpose.to_string(),
    });
    if entries.len() > CREDENTIAL_USE_LOG_MAX_ENTRIES {
        entries.drain(..entries.len() - CREDENTIAL_USE_LOG_MAX_ENTRIES);
    }
    let serialized = entries
        .iter()
        .filter_map(|entry| serde_json::to_string(entry).ok())
        .collect::<Vec<_>>()
        .join("\n");
    let _ = write_owner_only_file(&path, &format!("{serialized}\n"));
}

fn read_credential_uses(path: &Path) -> Vec<CredentialUse> {
    let Ok(data) = std::fs::read_to_string(path) else {
        return Vec::new();
    };
    data.lines()
        .filter_map(|line| serde_json::from_str::<CredentialUse>(line).ok())
        .collect()
}

/// Every recorded credential use, oldest first.
pub fn credential_uses() -> Vec<CredentialUse> {
    credential_use_log_path()
        .map(|path| read_credential_uses(&path))
        .unwrap_or_default()
}

fn last_credential_use(uses: &[CredentialUse], provider: &str) -> Option<i64> {
    uses.iter()
        .filter(|use_| use_.provider == provider)
        .map(|use_| use_.at_ms)
        .max()
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
        .map(|path| {
            std::fs::read_to_string(&path)
                .ok()
                .and_then(|data| parse_auth_keyring_index(&data))
                .is_some()
                || check_file_permissions_secure(&path)
        })
        .unwrap_or(false);
    let results = auth_status_from_store(&store, now_ms, perms_secure, &credential_uses());
    Ok(results)
}

/// Core status logic, separated from disk I/O for testability.
fn auth_status_from_store(
    store: &AuthStore,
    now_ms: i64,
    permissions_secure: bool,
    uses: &[CredentialUse],
) -> Vec<AuthStatusEntry> {
    let mut results = Vec::new();

    for (provider, entry) in &store.entries {
        let last_used = last_credential_use(uses, provider)
            .map(|at_ms| format_duration_ms(at_ms - now_ms).replace("expired", "used"));
        let status_entry = match entry {
            AuthEntry::OAuth {
                expires, refresh, ..
            } => {
                // Determine token type label from provider name
                let auth_type = match provider.as_str() {
                    "agiworkforce" => "AGI Workforce OAuth".to_string(),
                    "managed_cloud" => "AGI Workforce OAuth".to_string(),
                    "copilot" => "Copilot OAuth".to_string(),
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
                        (
                            "unknown".to_string(),
                            Some("expiry too far in future".to_string()),
                        )
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
                    last_used,
                }
            }
            AuthEntry::ApiKey { .. } => AuthStatusEntry {
                provider: provider.clone(),
                auth_type: "api_key".to_string(),
                status: "active".to_string(),
                expires_in: None,
                has_refresh_token: false,
                permissions_secure,
                last_used,
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
const AGIWORKFORCE_AUTH_KEY: &str = "agiworkforce";
// HOST FOOTGUN NOTE: There are three different hosts in the AGI Workforce surface:
//   - https://api.agiworkforce.com, device code login endpoints (oauth.rs device_code_login),
//                                      used by this const
//   - https://agiworkforce.com, /api/me tier lookup (tier_cache::DEFAULT_API_BASE),
//                                      used by resolve_user_tier()
//   - the configured managed inference host, selected by models/provider_dispatch.rs only
//     after an explicit Managed privacy handoff; there is no separate cloud-task command
//
// These MUST NOT be conflated. The unauthenticated device-grant endpoints now
// live on the web origin (apps/web: POST /api/auth/device/code + /token), so the
// base targets `agiworkforce.com/api`. The base MUST include `/api` because
// `device_code_login` appends `/auth/device/code` (→ `/api/auth/device/code`).
// Override with AGI_AUTH_BASE (e.g. `http://localhost:3000/api`) to test against
// a local `next dev` web server.
const AGIWORKFORCE_API_BASE: &str = "https://agiworkforce.com/api";

/// Device-grant endpoint base, so every surface that starts a login targets
/// the one host this file documents.
pub fn agiworkforce_api_base() -> &'static str {
    AGIWORKFORCE_API_BASE
}
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
        ts::link(device.verification_uri),
        "Enter code:".bold(),
        ts::success_header(device.user_code),
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
                 Your GitHub credentials may have expired, try running /login again \
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

            // Check the transient cache first, avoid fetching a new token on every request
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

            record_credential_use("copilot", "exchanged the stored token for an API token");
            let (copilot_token, expires_at) = get_copilot_api_token(&github_token).await?;

            // Cache the token for subsequent calls
            store.copilot_cache = Some((copilot_token.clone(), expires_at));

            Ok(Some((
                copilot_token,
                Some("https://api.githubcopilot.com/chat/completions".to_string()),
            )))
        }
        // INTENTIONAL SEAM, managed AGI Workforce cloud auth is NOT wired here.
        // A future "agiworkforce" / "managed_cloud" arm is BLOCKED on:
        //   (a) a proven headless token-grant endpoint (device code or browser-link/poll),
        //   (b) managed-cloud beta exit with ledger, abuse, refund, and retention controls,
        //   (c) explicit user consent + visible provider label at every inference call.
        // When that arm is added it MUST preserve the Local/BYOK trust boundary:
        // Local and BYOK sessions must never be silently routed through managed cloud.
        // See the HOST FOOTGUN NOTE near AGIWORKFORCE_API_BASE for the three-host context.
        _ => Ok(None),
    }
}

// ──────────────────────────────────────────────────────────────────────────────
// Interactive Login
// ──────────────────────────────────────────────────────────────────────────────

pub async fn interactive_login() -> Result<()> {
    let choices = &["GitHub Copilot (free with Copilot subscription)", "Cancel"];

    let selection = dialoguer::Select::new()
        .with_prompt("Choose a subscription to authenticate")
        .items(choices)
        .default(0)
        .interact()
        .context("Failed to display login menu")?;

    let (key, entry) = match selection {
        0 => {
            println!("\n{}", ts::accent("Connecting to GitHub Copilot..."));
            let entry = login_copilot().await?;
            ("copilot".to_string(), entry)
        }
        _ => {
            println!("Cancelled.");
            return Ok(());
        }
    };

    let mut store = AuthStore::load()?;
    store.entries.insert(key.clone(), entry);
    store.save()?;
    record_credential_use(&key, "signed in and saved a credential");

    println!(
        "\n  {} {} authentication saved to {}",
        ts::success_header("Done!"),
        key,
        auth_path()?.display()
    );

    Ok(())
}

fn save_auth_entry(key: &str, entry: AuthEntry) -> Result<()> {
    let mut store = AuthStore::load()?;
    store.entries.insert(key.to_string(), entry);
    store.save()?;
    record_credential_use(key, "signed in and saved a credential");
    Ok(())
}

pub(crate) fn is_agiworkforce_login_provider(provider: Option<&str>) -> bool {
    matches!(provider, None | Some("agi") | Some("agiworkforce"))
}

pub async fn login_agiworkforce() -> Result<()> {
    // Allow pointing the device-auth flow at a local `next dev` web server
    // (AGI_AUTH_BASE=http://localhost:3000/api); defaults to the production web
    // origin's API. The base must include `/api` (see AGIWORKFORCE_API_BASE).
    let base = std::env::var("AGI_AUTH_BASE")
        .ok()
        .filter(|s| !s.trim().is_empty())
        .unwrap_or_else(|| AGIWORKFORCE_API_BASE.to_string());
    let entry = crate::oauth::device_code_login(&base).await?;
    save_auth_entry(AGIWORKFORCE_AUTH_KEY, entry)?;
    crate::device_registry::send_heartbeat().await;
    Ok(())
}

#[derive(Debug, Clone, Copy)]
struct ApiKeyProvider {
    id: &'static str,
    label: &'static str,
    env_var: &'static str,
}

const API_KEY_PROVIDERS: &[ApiKeyProvider] = &[
    ApiKeyProvider {
        id: "anthropic",
        label: "Anthropic",
        env_var: "ANTHROPIC_API_KEY",
    },
    ApiKeyProvider {
        id: "openai",
        label: "OpenAI",
        env_var: "OPENAI_API_KEY",
    },
    ApiKeyProvider {
        id: "google",
        label: "Google",
        env_var: "GOOGLE_API_KEY",
    },
    ApiKeyProvider {
        id: "xai",
        label: "xAI",
        env_var: "XAI_API_KEY",
    },
    ApiKeyProvider {
        id: "deepseek",
        label: "DeepSeek",
        env_var: "DEEPSEEK_API_KEY",
    },
    ApiKeyProvider {
        id: "minimax",
        label: "MiniMax",
        env_var: "MINIMAX_API_KEY",
    },
    ApiKeyProvider {
        id: "perplexity",
        label: "Perplexity",
        env_var: "PERPLEXITY_API_KEY",
    },
    ApiKeyProvider {
        id: "qwen",
        label: "Qwen / DashScope",
        env_var: "QWEN_API_KEY",
    },
    ApiKeyProvider {
        id: "moonshot",
        label: "Moonshot / Kimi",
        env_var: "MOONSHOT_API_KEY",
    },
    ApiKeyProvider {
        id: "zhipu",
        label: "Zhipu / GLM",
        env_var: "ZHIPU_API_KEY",
    },
    ApiKeyProvider {
        id: "ollama-cloud",
        label: "Ollama Cloud",
        env_var: "OLLAMA_API_KEY",
    },
    ApiKeyProvider {
        id: "openrouter",
        label: "OpenRouter",
        env_var: "OPENROUTER_API_KEY",
    },
    ApiKeyProvider {
        id: "nvidia",
        label: "NVIDIA NIM",
        env_var: "NVIDIA_API_KEY",
    },
];

fn normalize_api_key_provider_id(provider: &str) -> Option<&'static str> {
    match provider.to_ascii_lowercase().as_str() {
        "anthropic" => Some("anthropic"),
        "openai" => Some("openai"),
        "google" => Some("google"),
        "xai" | "grok" => Some("xai"),
        "deepseek" => Some("deepseek"),
        "minimax" | "minimax-ai" | "minimaxai" => Some("minimax"),
        "perplexity" => Some("perplexity"),
        "qwen" | "dashscope" => Some("qwen"),
        "moonshot" | "kimi" => Some("moonshot"),
        "zhipu" | "glm" => Some("zhipu"),
        "ollama-cloud" | "ollama_cloud" | "ollamacloud" => Some("ollama-cloud"),
        "openrouter" | "open-router" | "open_router" => Some("openrouter"),
        "nvidia" | "nvidia-nim" | "nvidia_nim" | "nim" => Some("nvidia"),
        _ => None,
    }
}

fn api_key_provider(provider: &str) -> Option<ApiKeyProvider> {
    let normalized = normalize_api_key_provider_id(provider)?;
    API_KEY_PROVIDERS
        .iter()
        .copied()
        .find(|candidate| candidate.id == normalized)
}

pub(crate) fn is_api_key_provider(provider: &str) -> bool {
    api_key_provider(provider).is_some()
}

pub async fn interactive_api_key_login_for_provider(provider: &str) -> Result<()> {
    let provider = api_key_provider(provider)
        .ok_or_else(|| anyhow::anyhow!("Unknown API-key provider '{}'", provider))?;

    let key = dialoguer::Password::new()
        .with_prompt(format!(
            "Enter {} API key ({})",
            provider.label, provider.env_var
        ))
        .interact()
        .context("Failed to read API key")?;

    if key.trim().is_empty() {
        bail!("Empty API key.");
    }

    save_auth_entry(provider.id, AuthEntry::ApiKey { key })?;
    println!(
        "  {} {} API key saved to the {}.",
        ts::success_header("Done!"),
        provider.label,
        credential_storage_label(),
    );
    Ok(())
}

/// Login for a specific provider by name (used by onboarding wizard).
///
/// `None` intentionally means AGI Workforce cloud login; subscription providers
/// are only selected when named explicitly.
pub async fn interactive_login_for_provider(provider: Option<&str>) -> Result<()> {
    if is_agiworkforce_login_provider(provider) {
        return login_agiworkforce().await;
    }

    match provider {
        Some("copilot") => {
            println!("\n{}", ts::accent("Connecting to GitHub Copilot..."));
            let entry = login_copilot().await?;
            save_auth_entry("copilot", entry)
        }
        Some(pid) => {
            if is_api_key_provider(pid) {
                interactive_api_key_login_for_provider(pid).await
            } else {
                bail!(
                    "Unknown provider '{}'. Available: agiworkforce, anthropic, openai, google, xai, deepseek, minimax, perplexity, qwen, moonshot, zhipu, ollama-cloud, openrouter, nvidia, copilot",
                    pid
                )
            }
        }
        None => unreachable!("handled by is_agiworkforce_login_provider"),
    }
}

/// Interactive API key setup (used by onboarding wizard).
///
/// Prompts for provider selection and API key entry, then persists to the OS keyring.
pub async fn interactive_api_key_login() -> Result<()> {
    let mut choices: Vec<String> = API_KEY_PROVIDERS
        .iter()
        .map(|provider| format!("{} ({})", provider.label, provider.env_var))
        .collect();
    choices.push("Cancel".to_string());

    let selection = dialoguer::Select::new()
        .with_prompt("Select provider for API key")
        .items(&choices)
        .default(0)
        .interact()
        .context("Failed to display provider menu")?;

    if selection >= API_KEY_PROVIDERS.len() {
        println!("Cancelled.");
        return Ok(());
    }

    interactive_api_key_login_for_provider(API_KEY_PROVIDERS[selection].id).await
}

// ──────────────────────────────────────────────────────────────────────────────
// Base64url Decoder (for JWT parsing, no external crate needed)
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

/// The `sub` claim of a JWT, used as the identity that locally cached account
/// data belongs to. The payload is read, never trusted: a wrong value costs a
/// re-sync, and no authorization decision is made from it.
pub(crate) fn jwt_subject(jwt: &str) -> Option<String> {
    let payload = jwt.split('.').nth(1)?;
    let decoded = base64url_decode(payload).ok()?;
    let claims: serde_json::Value = serde_json::from_slice(&decoded).ok()?;
    claims
        .get("sub")
        .and_then(serde_json::Value::as_str)
        .filter(|subject| !subject.trim().is_empty())
        .map(str::to_string)
}

// ──────────────────────────────────────────────────────────────────────────────
// Tests
// ──────────────────────────────────────────────────────────────────────────────

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn default_login_provider_targets_agiworkforce() {
        assert!(is_agiworkforce_login_provider(None));
        assert!(is_agiworkforce_login_provider(Some("agi")));
        assert!(is_agiworkforce_login_provider(Some("agiworkforce")));

        assert!(!is_agiworkforce_login_provider(Some("openai")));
        assert!(!is_agiworkforce_login_provider(Some("chatgpt")));
        assert!(!is_agiworkforce_login_provider(Some("copilot")));
        assert!(!is_agiworkforce_login_provider(Some("anthropic")));
    }

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
        let results = auth_status_from_store(&store, now_ms, true, &[]);
        assert!(results.is_empty(), "empty store should yield no entries");
    }

    #[test]
    fn test_auth_status_expired_oauth() {
        let now_ms = 1_700_000_000_000i64;
        let past_ms = now_ms - 300_000; // 5 minutes ago
        let store = make_store(vec![(
            "copilot",
            AuthEntry::OAuth {
                refresh: "refresh_tok_abc".into(),
                access: "access_tok_abc".into(),
                expires: past_ms,
            },
        )]);
        let results = auth_status_from_store(&store, now_ms, true, &[]);
        assert_eq!(results.len(), 1);
        assert_eq!(results[0].status, "expired");
        assert_eq!(results[0].auth_type, "Copilot OAuth");
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
            "copilot",
            AuthEntry::OAuth {
                refresh: "refresh_tok_abc".into(),
                access: "access_tok_abc".into(),
                expires: future_ms,
            },
        )]);
        let results = auth_status_from_store(&store, now_ms, true, &[]);
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
            },
        )]);
        let now_ms = chrono::Utc::now().timestamp_millis();
        let results = auth_status_from_store(&store, now_ms, false, &[]);
        assert_eq!(results.len(), 1);
        assert_eq!(results[0].auth_type, "Copilot OAuth");
        assert_eq!(results[0].status, "unknown"); // expires=0
        assert!(results[0].has_refresh_token);
        assert!(!results[0].permissions_secure);
    }

    #[test]
    fn test_auth_status_agiworkforce_type() {
        let store = make_store(vec![(
            "agiworkforce",
            AuthEntry::OAuth {
                refresh: "refresh".into(),
                access: "access".into(),
                expires: 0,
            },
        )]);
        let now_ms = chrono::Utc::now().timestamp_millis();
        let results = auth_status_from_store(&store, now_ms, true, &[]);
        assert_eq!(results.len(), 1);
        assert_eq!(results[0].auth_type, "AGI Workforce OAuth");
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
        let results = auth_status_from_store(&store, now_ms, true, &[]);
        assert_eq!(results.len(), 1);
        assert_eq!(results[0].status, "active");
        assert_eq!(results[0].auth_type, "api_key");
        assert!(!results[0].has_refresh_token);
    }

    #[test]
    fn test_auth_status_no_refresh_token() {
        let store = make_store(vec![(
            "copilot",
            AuthEntry::OAuth {
                refresh: "".into(), // empty refresh token
                access: "access_tok_abc".into(),
                expires: 0,
            },
        )]);
        let now_ms = chrono::Utc::now().timestamp_millis();
        let results = auth_status_from_store(&store, now_ms, true, &[]);
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
        };
        let display = format!("{}", RedactedAuthEntry(&entry));
        // Must show redacted tokens
        assert!(display.contains("access_t...7890"));
        assert!(display.contains("refresh_...7890"));
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

    #[test]
    fn keyring_accounts_do_not_disclose_provider_names() {
        let account = auth_keyring_account("private-enterprise-provider");
        assert!(account.starts_with("provider:"));
        assert_eq!(account.len(), "provider:".len() + 64);
        assert!(!account.contains("private-enterprise-provider"));
    }

    #[test]
    fn auth_index_contains_metadata_but_no_credentials() {
        let index = AuthKeyringIndex {
            version: AUTH_INDEX_VERSION,
            storage: AUTH_INDEX_STORAGE.to_string(),
            providers: vec!["openai".to_string(), "agiworkforce".to_string()],
        };
        let serialized = serde_json::to_string(&index).unwrap();

        assert!(parse_auth_keyring_index(&serialized).is_some());
        assert!(serialized.contains("openai"));
        assert!(!serialized.contains("sk-secret"));
        assert!(!serialized.contains("access_token"));
        assert!(!serialized.contains("refresh_token"));
    }

    /// An in-memory stand-in for the OS credential store, so the persistence
    /// rules are tested without a keychain prompt or a real keychain entry.
    #[derive(Default)]
    struct MemoryStore {
        secrets: std::sync::Mutex<HashMap<String, String>>,
    }

    impl MemoryStore {
        fn secrets(&self) -> Vec<String> {
            self.secrets
                .lock()
                .expect("store lock")
                .values()
                .cloned()
                .collect()
        }
    }

    impl CredentialStore for MemoryStore {
        fn get(&self, account: &str) -> Result<Option<String>> {
            Ok(self
                .secrets
                .lock()
                .expect("store lock")
                .get(account)
                .cloned())
        }
        fn set(&self, account: &str, secret: &str) -> Result<()> {
            self.secrets
                .lock()
                .expect("store lock")
                .insert(account.to_string(), secret.to_string());
            Ok(())
        }
        fn delete(&self, account: &str) -> Result<()> {
            self.secrets.lock().expect("store lock").remove(account);
            Ok(())
        }
    }

    /// What an unsigned binary sees on macOS when it runs unattended.
    struct DenyingStore;

    impl CredentialStore for DenyingStore {
        fn get(&self, _account: &str) -> Result<Option<String>> {
            bail!("the OS credential store denied access")
        }
        fn set(&self, _account: &str, _secret: &str) -> Result<()> {
            bail!("the OS credential store denied access")
        }
        fn delete(&self, _account: &str) -> Result<()> {
            bail!("the OS credential store denied access")
        }
    }

    fn store_with_secrets() -> AuthStore {
        make_store(vec![
            (
                "agiworkforce",
                AuthEntry::OAuth {
                    refresh: "refresh_tok_9f2c4ae81b3d5f60".into(),
                    access: "access_tok_7ad13be95c02f4d8".into(),
                    expires: 1_700_000_000_000,
                },
            ),
            (
                "openai",
                AuthEntry::ApiKey {
                    key: "sk-proj-0123456789abcdefghijklmnop".into(),
                },
            ),
        ])
    }

    fn every_secret(store: &AuthStore) -> Vec<String> {
        store
            .entries
            .values()
            .flat_map(|entry| match entry {
                AuthEntry::OAuth {
                    refresh, access, ..
                } => vec![refresh.clone(), access.clone()],
                AuthEntry::ApiKey { key } => vec![key.clone()],
            })
            .collect()
    }

    #[test]
    fn no_credential_reaches_disk_when_the_credential_store_holds_it() {
        let dir = tempfile::tempdir().unwrap();
        let path = dir.path().join("auth.json");
        let store = store_with_secrets();
        let keyring = MemoryStore::default();

        save_keyring_auth(&keyring, &path, &store).expect("save");

        let on_disk = std::fs::read_to_string(&path).expect("index file");
        for secret in every_secret(&store) {
            assert!(
                !on_disk.contains(&secret),
                "credential reached disk in plaintext: {on_disk}"
            );
        }
        // The credential material is in the store instead, one entry each.
        assert_eq!(keyring.secrets().len(), 2);
        for secret in every_secret(&store) {
            assert!(
                keyring.secrets().iter().any(|held| held.contains(&secret)),
                "credential is not in the credential store"
            );
        }

        let index = parse_auth_keyring_index(&on_disk).expect("index");
        let reloaded = load_keyring_auth(&keyring, index).expect("load");
        assert_eq!(reloaded.entries.len(), 2);
        let mut round_tripped = every_secret(&reloaded);
        let mut original = every_secret(&store);
        round_tripped.sort();
        original.sort();
        assert_eq!(round_tripped, original);
    }

    #[test]
    fn a_credential_store_denial_is_an_error_and_never_a_plaintext_fallback() {
        let dir = tempfile::tempdir().unwrap();
        let path = dir.path().join("auth.json");
        let store = store_with_secrets();

        let error = save_keyring_auth(&DenyingStore, &path, &store)
            .expect_err("a denied credential store must not report success");
        assert!(
            format!("{error:#}").contains("credential store"),
            "the error must name the credential store: {error:#}"
        );

        match std::fs::read_to_string(&path) {
            Err(_) => {}
            Ok(on_disk) => {
                for secret in every_secret(&store) {
                    assert!(
                        !on_disk.contains(&secret),
                        "a denied credential store fell back to plaintext: {on_disk}"
                    );
                }
            }
        }
    }

    #[test]
    fn a_credential_the_store_no_longer_holds_is_reported_not_skipped() {
        let dir = tempfile::tempdir().unwrap();
        let path = dir.path().join("auth.json");
        let keyring = MemoryStore::default();
        save_keyring_auth(&keyring, &path, &store_with_secrets()).expect("save");
        keyring
            .secrets
            .lock()
            .expect("store lock")
            .remove(&auth_keyring_account("openai"));

        let index = parse_auth_keyring_index(&std::fs::read_to_string(&path).expect("index"))
            .expect("parse");
        let error = load_keyring_auth(&keyring, index).expect_err("missing credential must error");
        assert!(format!("{error:#}").contains("openai"), "{error:#}");
    }

    #[test]
    fn dropping_a_provider_removes_its_credential_from_the_store() {
        let dir = tempfile::tempdir().unwrap();
        let path = dir.path().join("auth.json");
        let keyring = MemoryStore::default();
        save_keyring_auth(&keyring, &path, &store_with_secrets()).expect("save");

        let mut remaining = store_with_secrets();
        remaining.entries.remove("openai");
        save_keyring_auth(&keyring, &path, &remaining).expect("save");

        assert_eq!(keyring.secrets().len(), 1);
        assert!(keyring
            .get(&auth_keyring_account("openai"))
            .expect("get")
            .is_none());
    }

    #[test]
    fn status_reports_when_a_credential_was_last_used() {
        let now_ms = 1_700_000_000_000i64;
        let uses = vec![
            CredentialUse {
                at_ms: now_ms - 600_000,
                provider: "copilot".to_string(),
                purpose: "exchanged the stored token for an API token".to_string(),
            },
            CredentialUse {
                at_ms: now_ms - 60_000,
                provider: "copilot".to_string(),
                purpose: "exchanged the stored token for an API token".to_string(),
            },
        ];
        let store = make_store(vec![(
            "copilot",
            AuthEntry::OAuth {
                refresh: "refresh".into(),
                access: "access".into(),
                expires: 0,
            },
        )]);

        let results = auth_status_from_store(&store, now_ms, true, &uses);
        assert_eq!(results[0].last_used.as_deref(), Some("used 1m ago"));

        let unused = auth_status_from_store(&store, now_ms, true, &[]);
        assert_eq!(unused[0].last_used, None);
    }

    #[test]
    fn the_credential_use_trail_records_no_secret_material() {
        let record = CredentialUse {
            at_ms: 1_700_000_000_000,
            provider: "openai".to_string(),
            purpose: "exchanged the stored token for an API token".to_string(),
        };
        let line = serde_json::to_string(&record).unwrap();
        assert!(line.contains("openai"));
        assert!(!line.contains("sk-"));
        assert!(!line.contains("access"));
    }

    #[test]
    fn auth_index_rejects_unknown_versions_and_backends() {
        assert!(
            parse_auth_keyring_index(r#"{"version":2,"storage":"os-keyring","providers":[]}"#)
                .is_none()
        );
        assert!(
            parse_auth_keyring_index(r#"{"version":1,"storage":"plaintext","providers":[]}"#)
                .is_none()
        );
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
}
