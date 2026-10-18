pub mod app_mode;
pub mod clerk_native;

use crate::features::speech::wake::{RemoteSpeechGate, VoiceWake};
use crate::sys::api::{ApiClient, ApiRequest, ApiResponse, AuthType, HttpMethod};
use crate::sys::commands::voice::VoiceState;
use crate::sys::commands::{security::SecretManagerState, ApiState};
use crate::sys::security::SecretManager;
use serde::{de::DeserializeOwned, Deserialize, Serialize};
use tauri::{AppHandle, Manager, State};

/// Deserialize an optional API timestamp from the canonical `/api/me` wire shape.
///
/// The Web contract permits `null`, Unix seconds, or an ISO-8601 string for
/// `created_at`. Keep the wire value intact because the Desktop credits caller
/// does not perform timestamp arithmetic on this profile response.
fn deserialize_optional_timestamp<'de, D>(
    deserializer: D,
) -> Result<Option<serde_json::Value>, D::Error>
where
    D: serde::Deserializer<'de>,
{
    use serde::de::Error;
    let value: serde_json::Value = serde::Deserialize::deserialize(deserializer)?;
    match &value {
        serde_json::Value::Null => Ok(None),
        serde_json::Value::Number(_) => Ok(Some(value)),
        serde_json::Value::String(timestamp)
            if chrono::DateTime::parse_from_rfc3339(timestamp).is_ok() =>
        {
            Ok(Some(value))
        }
        serde_json::Value::String(_) => Err(D::Error::custom(
            "Expected an RFC 3339 string for timestamp",
        )),
        _ => Err(D::Error::custom(
            "Expected null, number, or RFC 3339 string for timestamp",
        )),
    }
}

/// Deserialize the required numeric `updated_at` timestamp from `/api/me`.
fn deserialize_timestamp<'de, D>(deserializer: D) -> Result<u64, D::Error>
where
    D: serde::Deserializer<'de>,
{
    use serde::de::Error;
    let value: serde_json::Value = serde::Deserialize::deserialize(deserializer)?;
    match value {
        serde_json::Value::Number(n) => {
            if let Some(i) = n.as_u64() {
                Ok(i)
            } else if let Some(f) = n.as_f64() {
                Ok(f as u64)
            } else {
                Err(D::Error::custom("Invalid timestamp number"))
            }
        }
        _ => Err(D::Error::custom("Expected number for timestamp")),
    }
}

/// Parse a JSON response with proper Content-Type validation.
/// Returns a helpful error message if the server returned HTML instead of JSON.
fn parse_json_response<T: DeserializeOwned>(response: &ApiResponse) -> Result<T, String> {
    // Check Content-Type header
    let content_type = response
        .headers
        .get("content-type")
        .map(|s| s.to_lowercase())
        .unwrap_or_default();

    // If we got HTML back, the server likely crashed or returned an error page
    if content_type.contains("text/html") {
        return Err(format!(
            "Server returned HTML instead of JSON (status {}). \
             This usually means the API server crashed or is misconfigured. \
             Check that your API base URL points at the expected AGI backend.",
            response.status
        ));
    }

    // Check if response body looks like HTML (fallback check)
    let body_trimmed = response.body.trim();
    if body_trimmed.starts_with("<!DOCTYPE") || body_trimmed.starts_with("<html") {
        return Err(format!(
            "Server returned an HTML error page (status {}). \
             The API may be down or misconfigured. Response: {}",
            response.status,
            &response.body[..response.body.len().min(200)]
        ));
    }

    // Try to parse as JSON with a helpful error message
    serde_json::from_str(&response.body).map_err(|e| {
        let preview = &response.body[..response.body.len().min(100)];
        format!(
            "Failed to parse API response as JSON: {}. Response preview: {}",
            e, preview
        )
    })
}

/// Minimal response returned to the Desktop device-authorization client.
///
/// Device authorization intentionally runs through the native HTTP client:
/// the Tauri webview is a different origin from agiworkforce.com, while the
/// native boundary can enforce the exact two allowed routes without weakening
/// the web application's CORS policy.
#[derive(Debug, Clone, Serialize)]
pub struct DeviceAuthorizationHttpResponse {
    pub status: u16,
    pub body: String,
}

fn build_device_authorization_request(api_base: &str, path: &str, body: String) -> ApiRequest {
    ApiRequest {
        method: HttpMethod::Post,
        url: format!("{}{}", api_base, path),
        body: Some(body),
        headers: std::collections::HashMap::from([
            ("Content-Type".to_string(), "application/json".to_string()),
            ("X-Requested-With".to_string(), "XMLHttpRequest".to_string()),
        ]),
        timeout_ms: Some(30_000),
        ..Default::default()
    }
}

async fn execute_device_authorization_request(
    path: &str,
    body: String,
    client: &ApiClient,
) -> Result<DeviceAuthorizationHttpResponse, String> {
    execute_device_authorization_request_with_bearer(path, body, None, client).await
}

async fn execute_device_authorization_request_with_bearer(
    path: &str,
    body: String,
    bearer: Option<String>,
    client: &ApiClient,
) -> Result<DeviceAuthorizationHttpResponse, String> {
    let api_base = get_api_base_url();
    validate_api_base_url(&api_base)?;

    let mut request = build_device_authorization_request(&api_base, path, body);
    if let Some(token) = bearer {
        request.auth = AuthType::Bearer { token };
    }

    let response = client
        .execute(request)
        .await
        .map_err(|e| format!("AGI Cloud device authorization request failed: {}", e))?;

    Ok(DeviceAuthorizationHttpResponse {
        status: response.status,
        body: response.body,
    })
}

/// Validate a device-authorization user code against the exact format the web
/// route accepts (`XXXX-XXXX`, uppercase alphanumeric).
fn normalize_device_user_code(raw: &str) -> Result<String, String> {
    let candidate = raw.trim().to_ascii_uppercase();
    let bytes = candidate.as_bytes();
    let shaped = bytes.len() == 9
        && bytes[4] == b'-'
        && bytes
            .iter()
            .enumerate()
            .all(|(index, byte)| index == 4 || byte.is_ascii_alphanumeric());
    if !shaped {
        return Err("Invalid AGI Cloud device user code.".to_string());
    }
    Ok(candidate)
}

/// Approve this app's own device authorization with a freshly minted Clerk
/// session token.
///
/// This is what makes native sign-in possible without a browser hop: the user
/// authenticates against Clerk in the app, the app proves that session to
/// `/api/auth/device/approve`, and the ordinary device-token poll then issues
/// the same durable first-party credential the browser approval path issues.
/// The web contract is untouched, and the CLI's device flow keeps working
/// exactly as before.
#[tauri::command]
#[allow(non_snake_case)]
pub async fn account_approve_device_authorization(
    userCode: String,
    sessionToken: String,
    state: State<'_, ApiState>,
) -> Result<DeviceAuthorizationHttpResponse, String> {
    let user_code = normalize_device_user_code(&userCode)?;
    let session_token = sessionToken.trim();
    validate_token_format(session_token, "AGI account session token")?;

    let body = serde_json::json!({ "user_code": user_code, "action": "approve" }).to_string();
    let client = state.get_single_attempt_client()?;
    execute_device_authorization_request_with_bearer(
        "/api/auth/device/approve",
        body,
        Some(session_token.to_string()),
        client,
    )
    .await
}

/// Start the OAuth-style device authorization flow for this Desktop app.
#[tauri::command]
pub async fn account_start_device_authorization(
    state: State<'_, ApiState>,
) -> Result<DeviceAuthorizationHttpResponse, String> {
    let client = state.get_single_attempt_client()?;
    execute_device_authorization_request(
        "/api/auth/device/code",
        serde_json::json!({ "surface": "desktop" }).to_string(),
        client,
    )
    .await
}

/// Poll the exact device authorization created by
/// `account_start_device_authorization`.
#[tauri::command]
#[allow(non_snake_case)]
pub async fn account_poll_device_authorization(
    deviceCode: String,
    state: State<'_, ApiState>,
) -> Result<DeviceAuthorizationHttpResponse, String> {
    let device_code = deviceCode.trim();
    if device_code.is_empty() || device_code.len() > 128 {
        return Err("Invalid AGI Cloud device authorization code.".to_string());
    }

    let body = serde_json::json!({ "device_code": device_code }).to_string();
    let client = state.get_client()?;
    let response =
        execute_device_authorization_request("/api/auth/device/token", body, client).await?;
    let (response, held) = withhold_refresh_token(response);
    if let Some(held) = held {
        *HELD_REFRESH_TOKEN
            .write()
            .unwrap_or_else(|poisoned| poisoned.into_inner()) = Some(held);
    }
    Ok(response)
}

/// A refresh token that arrived with a device authorization and is waiting
/// for the page to adopt the access token issued with it. Until then it is
/// not the saved session's: a sign-in the person abandons must not replace
/// the account that is signed in.
struct HeldRefreshToken {
    access_token_digest: String,
    refresh_token: String,
}

fn access_token_digest(access_token: &str) -> String {
    use sha2::{Digest, Sha256};

    hex::encode(Sha256::digest(access_token.as_bytes()))
}

/// Takes the refresh token out of a device-token reply before the reply is
/// handed to the webview. The refresh token is the long-lived credential, and
/// any script in the page could read it there, so it never crosses IPC: the
/// page gets the short-lived access token and asks
/// [`account_refresh_session`] for the next one.
fn withhold_refresh_token(
    mut response: DeviceAuthorizationHttpResponse,
) -> (DeviceAuthorizationHttpResponse, Option<HeldRefreshToken>) {
    let Ok(serde_json::Value::Object(mut fields)) =
        serde_json::from_str::<serde_json::Value>(&response.body)
    else {
        return (response, None);
    };
    let Some(refresh_token) = fields.remove("refresh_token") else {
        return (response, None);
    };
    let access_token = fields
        .get("access_token")
        .and_then(serde_json::Value::as_str);
    let held = match (refresh_token.as_str(), access_token) {
        (Some(refresh_token), Some(access_token))
            if validate_refresh_token_format(refresh_token).is_ok() =>
        {
            Some(HeldRefreshToken {
                access_token_digest: access_token_digest(access_token),
                refresh_token: refresh_token.to_string(),
            })
        }
        _ => None,
    };
    response.body = serde_json::Value::Object(fields).to_string();
    (response, held)
}

fn take_held_refresh_token_for(access_token: &str) -> Option<String> {
    let mut held = HELD_REFRESH_TOKEN
        .write()
        .unwrap_or_else(|poisoned| poisoned.into_inner());
    let adopted = held
        .as_ref()
        .is_some_and(|held| held.access_token_digest == access_token_digest(access_token));
    if !adopted {
        return None;
    }
    held.take().map(|held| held.refresh_token)
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CreditBalance {
    #[serde(skip_serializing_if = "Option::is_none")]
    pub account_id: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub period_start: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub period_end: Option<String>,
    /// Monthly credits allocated (API returns `credits_allocated_cents`)
    #[serde(
        alias = "credits_allocated_cents",
        skip_serializing_if = "Option::is_none"
    )]
    pub allocated_cents: Option<i32>,
    /// Monthly credits used (API returns `credits_used_cents`)
    #[serde(alias = "credits_used_cents", skip_serializing_if = "Option::is_none")]
    pub used_cents: Option<i32>,
    /// Monthly credits remaining (API returns `credits_remaining_cents`)
    #[serde(
        alias = "credits_remaining_cents",
        skip_serializing_if = "Option::is_none"
    )]
    pub remaining_cents: Option<i32>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub percentage_used: Option<f64>,
    /// Daily credit limit in cents
    #[serde(skip_serializing_if = "Option::is_none")]
    pub daily_limit_cents: Option<i32>,
    /// Daily credits used
    #[serde(skip_serializing_if = "Option::is_none")]
    pub daily_used_cents: Option<i32>,
    /// Daily credits remaining
    #[serde(skip_serializing_if = "Option::is_none")]
    pub daily_remaining_cents: Option<i32>,
    /// Last daily reset timestamp
    #[serde(skip_serializing_if = "Option::is_none")]
    pub last_daily_reset_at: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct UserProfile {
    pub id: String,
    pub email: Option<String>,
    pub name: String,
    pub avatar_url: Option<String>,
    /// Canonical `/api/me` permits null, Unix seconds, or an ISO-8601 string.
    #[serde(deserialize_with = "deserialize_optional_timestamp")]
    pub created_at: Option<serde_json::Value>,
    /// Timestamp - accepts both integer and floating point from API
    #[serde(deserialize_with = "deserialize_timestamp")]
    pub updated_at: u64,
    pub plan: PlanInfo,
    pub feature_flags: std::collections::HashMap<String, bool>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub credits: Option<CreditBalance>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct PlanInfo {
    pub tier: String,
    pub display_name: String,
    pub status: String,
    pub current_period_end: Option<u64>,
}

#[tauri::command]
pub async fn fetch_user_profile(
    access_token: String,
    app: AppHandle,
    state: State<'_, ApiState>,
) -> Result<UserProfile, String> {
    let api_base = get_api_base_url();

    let url = format!("{}/api/me", api_base);

    let api_request = ApiRequest {
        method: HttpMethod::Get,
        url,
        auth: AuthType::Bearer {
            token: access_token,
        },
        headers: std::collections::HashMap::from([(
            CLIENT_VERSION_HEADER.to_string(),
            env!("CARGO_PKG_VERSION").to_string(),
        )]),
        ..Default::default()
    };

    let response = state
        .get_client()?
        .execute(api_request)
        .await
        .map_err(|e| format!("Profile fetch failed: {}", e))?;

    if !response.success {
        // Provide more context for common error codes
        let hint = match response.status {
            401 => " (Token may be expired or from a different auth environment)",
            500 => " (Server crashed - check API logs)",
            502 | 503 => " (API server is down or restarting)",
            _ => "",
        };
        return Err(format!(
            "API error {}{}: {}",
            response.status, hint, response.body
        ));
    }

    let profile: UserProfile = parse_json_response(&response)?;
    if let Some(voice) = app.try_state::<std::sync::Arc<tokio::sync::Mutex<VoiceState>>>() {
        let voice = voice.lock().await;
        let wake = voice.wake.read().await;
        apply_server_speech_gate(&wake, &profile.feature_flags);
    }
    Ok(profile)
}

/// Mirrors `CLIENT_VERSION_HEADER` in packages/contracts/cloud-contracts, so a
/// switch the server closes for one build range reaches this build.
const CLIENT_VERSION_HEADER: &str = "x-agi-client-version";

pub(crate) fn apply_server_speech_gate(
    wake: &VoiceWake,
    feature_flags: &std::collections::HashMap<String, bool>,
) {
    wake.apply_remote_gate(RemoteSpeechGate::from_feature_flags(
        feature_flags,
        env!("CARGO_PKG_VERSION"),
    ));
}

use std::future::Future;
use std::sync::RwLock;

// In-memory token cache for Rust API calls. Durable copies live in the OS
// credential store and are repopulated only after structural validation.
#[derive(Clone, PartialEq, Eq)]
struct ManagedAuthSessionIdentity {
    subject: String,
    session_id: Option<String>,
}

struct ManagedAccessTokenState {
    token: Option<String>,
    identity: Option<ManagedAuthSessionIdentity>,
    generation: u64,
}

impl ManagedAccessTokenState {
    const fn empty() -> Self {
        Self {
            token: None,
            identity: None,
            generation: 0,
        }
    }
}

/// Native ownership proof captured when a Managed Cloud goal starts.
///
/// The subject identifies the account, while the optional JWT `sid` plus the
/// monotonic generation distinguish sign-out/sign-in boundaries. Rotating an
/// access token inside the same account session deliberately keeps the same
/// boundary so a long-running goal is not interrupted by an ordinary refresh.
#[derive(Clone, PartialEq, Eq)]
pub(crate) struct ManagedAuthBoundary {
    identity: ManagedAuthSessionIdentity,
    generation: u64,
}

static ACCESS_TOKEN: RwLock<ManagedAccessTokenState> =
    RwLock::new(ManagedAccessTokenState::empty());
static REFRESH_TOKEN: RwLock<Option<String>> = RwLock::new(None);
static HELD_REFRESH_TOKEN: RwLock<Option<HeldRefreshToken>> = RwLock::new(None);
/// The server rotates the refresh token on every exchange and treats a second
/// use of one as a stolen credential, so exchanges never overlap.
static REFRESH_EXCHANGE: tokio::sync::Mutex<()> = tokio::sync::Mutex::const_new(());
static API_BASE_URL_OVERRIDE: RwLock<Option<String>> = RwLock::new(None);
const CLOUD_ACCESS_TOKEN_SECRET_KEY: &str = "cloud_account_access_token";
const CLOUD_REFRESH_TOKEN_SECRET_KEY: &str = "cloud_account_refresh_token";
const CLOUD_ACCESS_TOKEN_KEYRING_ACCOUNT: &str = "access-token";
const CLOUD_REFRESH_TOKEN_KEYRING_ACCOUNT: &str = "refresh-token";

tokio::task_local! {
    static ACTIVE_MANAGED_AUTH_BOUNDARY: Option<ManagedAuthBoundary>;
}

fn managed_auth_session_identity(token: &str) -> Result<ManagedAuthSessionIdentity, String> {
    use base64::Engine;

    let payload = token
        .split('.')
        .nth(1)
        .ok_or_else(|| "Access token is missing its JWT payload".to_string())?;
    let decoded = base64::engine::general_purpose::URL_SAFE_NO_PAD
        .decode(payload)
        .or_else(|_| base64::engine::general_purpose::URL_SAFE.decode(payload))
        .map_err(|_| "Access token has an invalid JWT payload".to_string())?;
    let claims: serde_json::Value = serde_json::from_slice(&decoded)
        .map_err(|_| "Access token has an invalid JWT claims object".to_string())?;
    let subject = claims
        .get("sub")
        .and_then(serde_json::Value::as_str)
        .map(str::trim)
        .filter(|subject| !subject.is_empty() && subject.len() <= 512)
        .ok_or_else(|| "Access token is missing a bounded subject claim".to_string())?;
    let session_id = claims
        .get("sid")
        .and_then(serde_json::Value::as_str)
        .map(str::trim)
        .filter(|session_id| !session_id.is_empty() && session_id.len() <= 512)
        .map(str::to_string);

    Ok(ManagedAuthSessionIdentity {
        subject: subject.to_string(),
        session_id,
    })
}

fn install_access_token_in_memory(access_token: String) -> Result<(), String> {
    let identity = managed_auth_session_identity(&access_token)?;
    let mut state = ACCESS_TOKEN
        .write()
        .unwrap_or_else(|poisoned| poisoned.into_inner());
    if state.identity.as_ref() != Some(&identity) {
        state.generation = state.generation.saturating_add(1);
    }
    state.token = Some(access_token);
    state.identity = Some(identity);
    Ok(())
}

fn clear_access_token_in_memory() {
    let mut state = ACCESS_TOKEN
        .write()
        .unwrap_or_else(|poisoned| poisoned.into_inner());
    if state.token.is_some() || state.identity.is_some() {
        state.generation = state.generation.saturating_add(1);
    }
    state.token = None;
    state.identity = None;
}

/// Capture the current native Managed Cloud account/session boundary.
pub(crate) fn capture_managed_auth_boundary() -> Result<ManagedAuthBoundary, String> {
    let state = ACCESS_TOKEN
        .read()
        .unwrap_or_else(|poisoned| poisoned.into_inner());
    if state.token.is_none() {
        return Err("No access token stored. Please sign in.".to_string());
    }
    let identity = state
        .identity
        .clone()
        .ok_or_else(|| "The stored access token has no account ownership metadata".to_string())?;
    Ok(ManagedAuthBoundary {
        identity,
        generation: state.generation,
    })
}

/// The id the desktop chat lists conversations under for the signed-in
/// account: the access token's subject, the same claim the renderer reads.
/// `None` when nobody is signed in.
pub(crate) fn signed_in_account_id() -> Option<String> {
    ACCESS_TOKEN
        .read()
        .unwrap_or_else(|poisoned| poisoned.into_inner())
        .identity
        .as_ref()
        .map(|identity| identity.subject.clone())
}

/// Return the boundary inherited by the currently executing native goal.
pub(crate) fn current_managed_auth_boundary() -> Option<ManagedAuthBoundary> {
    ACTIVE_MANAGED_AUTH_BOUNDARY
        .try_with(Clone::clone)
        .ok()
        .flatten()
}

/// Scope all managed-provider calls made by a native goal to its captured
/// account/session. Tokio task locals are explicit here because spawned tasks
/// do not inherit them automatically.
pub(crate) async fn scope_managed_auth_boundary<F>(
    boundary: Option<ManagedAuthBoundary>,
    future: F,
) -> F::Output
where
    F: Future,
{
    ACTIVE_MANAGED_AUTH_BOUNDARY.scope(boundary, future).await
}

trait CloudCredentialVault {
    fn load(&self, account: &str) -> Result<Option<String>, String>;
    fn store(&self, account: &str, secret: &str) -> Result<(), String>;
    fn delete(&self, account: &str) -> Result<(), String>;
}

struct OsCloudCredentialVault {
    service: String,
}

impl OsCloudCredentialVault {
    fn for_app(app: &AppHandle) -> Self {
        Self::for_bundle_identifier(&app.config().identifier)
    }

    fn for_bundle_identifier(identifier: &str) -> Self {
        Self {
            service: format!("{identifier}.cloud-account"),
        }
    }

    fn entry(&self, account: &str) -> Result<keyring::Entry, String> {
        keyring::Entry::new(&self.service, account)
            .map_err(|_| "Could not open the operating-system credential store".to_string())
    }
}

impl CloudCredentialVault for OsCloudCredentialVault {
    fn load(&self, account: &str) -> Result<Option<String>, String> {
        match self.entry(account)?.get_password() {
            Ok(secret) => Ok(Some(secret)),
            Err(keyring::Error::NoEntry) => Ok(None),
            Err(_) => Err("Could not read the Cloud credential from the OS keyring".to_string()),
        }
    }

    fn store(&self, account: &str, secret: &str) -> Result<(), String> {
        self.entry(account)?
            .set_password(secret)
            .map_err(|_| "Could not save the Cloud credential in the OS keyring".to_string())
    }

    fn delete(&self, account: &str) -> Result<(), String> {
        match self.entry(account)?.delete_credential() {
            Ok(()) | Err(keyring::Error::NoEntry) => Ok(()),
            Err(_) => Err("Could not delete the Cloud credential from the OS keyring".to_string()),
        }
    }
}

fn store_cloud_credential(
    vault: &dyn CloudCredentialVault,
    secret_manager: &SecretManager,
    keyring_account: &str,
    legacy_database_key: &str,
    secret: &str,
) -> Result<(), String> {
    vault.store(keyring_account, secret)?;
    secret_manager
        .delete_secret(legacy_database_key)
        .map_err(|_| "Cloud credential was saved but legacy cleanup failed".to_string())
}

fn load_cloud_credential(
    vault: &dyn CloudCredentialVault,
    secret_manager: &SecretManager,
    keyring_account: &str,
    legacy_database_key: &str,
    validate: impl Fn(&str) -> Result<(), String>,
) -> Result<Option<String>, String> {
    if let Some(secret) = vault.load(keyring_account)? {
        validate(&secret)?;
        return Ok(Some(secret));
    }

    let legacy_exists = secret_manager
        .has_secret(legacy_database_key)
        .map_err(|_| "Could not inspect the legacy Cloud credential".to_string())?;
    if !legacy_exists {
        return Ok(None);
    }

    let secret = secret_manager
        .get_secret(legacy_database_key)
        .map_err(|_| "Could not read the legacy Cloud credential".to_string())?;
    validate(&secret)?;
    vault.store(keyring_account, &secret)?;
    secret_manager
        .delete_secret(legacy_database_key)
        .map_err(|_| "Cloud credential migrated but legacy cleanup failed".to_string())?;
    Ok(Some(secret))
}

fn delete_cloud_credential(
    vault: &dyn CloudCredentialVault,
    secret_manager: &SecretManager,
    keyring_account: &str,
    legacy_database_key: &str,
) -> Result<(), String> {
    vault.delete(keyring_account)?;
    secret_manager
        .delete_secret(legacy_database_key)
        .map_err(|_| "Could not clear the legacy Cloud credential".to_string())
}

const PRODUCTION_API_BASE_URL: &str = "https://agiworkforce.com";

/// Get the API base URL for desktop -> backend calls.
///
/// Priority:
/// 1) In-memory override set by the frontend (best for local dev, where Vite reads `.env` but Rust does not)
/// 2) `AGI_API_URL` environment variable, when it passes the same allowlist
/// 3) Production default
pub fn get_api_base_url() -> String {
    {
        let url = API_BASE_URL_OVERRIDE
            .read()
            .unwrap_or_else(|poisoned| poisoned.into_inner());
        if let Some(value) = url.clone() {
            return value;
        }
    }

    api_base_url_from_environment(std::env::var("AGI_API_URL").ok())
}

fn api_base_url_from_environment(raw: Option<String>) -> String {
    raw.map(|value| value.trim().trim_end_matches('/').to_string())
        .filter(|value| validate_api_base_url(value).is_ok())
        .unwrap_or_else(|| PRODUCTION_API_BASE_URL.to_string())
}

/// Validate that an API base URL is safe to use (prevents SSRF).
///
/// SECURITY: every bearer-carrying Rust call is sent to this base, so a
/// loopback host is accepted in debug builds only. A release build that
/// accepted one would hand the account token to any local listener.
fn validate_api_base_url(url: &str) -> Result<(), String> {
    validate_api_base_url_for_build(url, cfg!(debug_assertions))
}

fn validate_api_base_url_for_build(url: &str, allow_loopback: bool) -> Result<(), String> {
    let parsed = url::Url::parse(url).map_err(|e| format!("Invalid URL: {}", e))?;

    let scheme = parsed.scheme();
    let host = parsed
        .host_str()
        .ok_or_else(|| "URL must contain a host".to_string())?;

    // C6: Reject URLs containing credentials (userinfo) to prevent SSRF bypass
    if !parsed.username().is_empty() || parsed.password().is_some() {
        return Err("API base URL must not contain credentials (userinfo)".to_string());
    }

    let is_localhost = allow_loopback
        && matches!(
            host,
            "localhost" | "127.0.0.1" | "::1" | "[::1]" | "0.0.0.0"
        );

    if scheme == "http" && !is_localhost {
        return Err("API base URL must use https://".to_string());
    }
    if scheme != "http" && scheme != "https" {
        return Err(format!(
            "API base URL must use http or https scheme, got: {}",
            scheme
        ));
    }

    let allowed = is_localhost || host == "agiworkforce.com" || host.ends_with(".agiworkforce.com");

    if !allowed {
        return Err(format!(
            "API base URL host '{}' is not in the allowlist. Allowed: *.agiworkforce.com",
            host
        ));
    }

    Ok(())
}

/// Store API base URL from frontend (called on startup so Rust and the UI share the same backend base).
#[tauri::command]
#[allow(non_snake_case)]
pub fn account_store_api_base_url(apiBaseUrl: String) -> Result<(), String> {
    let sanitized = apiBaseUrl.trim().trim_end_matches('/').to_string();

    if sanitized.is_empty() {
        return Err("API base URL cannot be empty".to_string());
    }
    if !(sanitized.starts_with("http://") || sanitized.starts_with("https://")) {
        return Err("API base URL must start with http:// or https://".to_string());
    }

    // SSRF protection: validate against scheme and domain allowlist
    validate_api_base_url(&sanitized)?;

    let mut url = API_BASE_URL_OVERRIDE
        .write()
        .unwrap_or_else(|poisoned| poisoned.into_inner());
    *url = Some(sanitized);
    Ok(())
}

/// Validate that a token is JWT-shaped: 3 dot-separated base64url segments,
/// length between 20 and 8192 characters, and non-empty.
fn validate_token_format(token: &str, label: &str) -> Result<(), String> {
    if token.is_empty() {
        return Err(format!("{} cannot be empty", label));
    }
    if token.len() < 20 {
        return Err(format!(
            "{} is too short ({} chars, minimum 20)",
            label,
            token.len()
        ));
    }
    if token.len() > 8192 {
        return Err(format!(
            "{} is too long ({} chars, maximum 8192)",
            label,
            token.len()
        ));
    }

    // JWT must have exactly 3 dot-separated base64url segments
    let parts: Vec<&str> = token.split('.').collect();
    if parts.len() != 3 {
        return Err(format!(
            "{} must be a valid JWT (expected 3 dot-separated segments, got {})",
            label,
            parts.len()
        ));
    }

    // Each segment must be non-empty and contain only base64url characters
    for (i, part) in parts.iter().enumerate() {
        if part.is_empty() {
            return Err(format!("{} has empty JWT segment at position {}", label, i));
        }
        if !part
            .chars()
            .all(|c| c.is_ascii_alphanumeric() || c == '-' || c == '_' || c == '=')
        {
            return Err(format!(
                "{} contains invalid base64url characters in segment {}",
                label, i
            ));
        }
    }

    Ok(())
}

/// Store access token from frontend (called when the app auth state changes).
#[tauri::command]
#[allow(non_snake_case)]
pub fn account_store_access_token(
    accessToken: String,
    app: AppHandle,
    secret_state: State<'_, SecretManagerState>,
) -> Result<(), String> {
    validate_token_format(&accessToken, "Access token")?;
    // Decode the ownership claims before persisting anything. Native managed
    // goal execution depends on `sub`/`sid` to distinguish an ordinary token
    // refresh from an account or session replacement.
    let identity = managed_auth_session_identity(&accessToken)?;
    let previous = current_session_identity();
    let vault = OsCloudCredentialVault::for_app(&app);
    store_cloud_access_token(&vault, secret_state.manager(), &accessToken)?;
    match refresh_token_change(
        take_held_refresh_token_for(&accessToken),
        previous.as_ref(),
        &identity,
    ) {
        RefreshTokenChange::Adopt(refresh_token) => {
            keep_cloud_refresh_token(&vault, secret_state.manager(), refresh_token)?;
        }
        RefreshTokenChange::Forget => {
            forget_cloud_refresh_token(&vault, secret_state.manager())?;
        }
        RefreshTokenChange::Keep => {}
    }
    install_access_token_in_memory(accessToken)
}

#[derive(Debug, PartialEq, Eq)]
enum RefreshTokenChange {
    Adopt(String),
    Forget,
    Keep,
}

/// What adopting an access token does to the saved refresh token. One that
/// arrived with this access token replaces it. An access token for another
/// account or sign-in that brought none leaves the saved one belonging to a
/// session that is gone, so it is forgotten rather than left to renew the
/// wrong account later.
fn refresh_token_change(
    held: Option<String>,
    previous: Option<&ManagedAuthSessionIdentity>,
    adopted: &ManagedAuthSessionIdentity,
) -> RefreshTokenChange {
    match held {
        Some(refresh_token) => RefreshTokenChange::Adopt(refresh_token),
        None if previous.is_some_and(|previous| previous != adopted) => RefreshTokenChange::Forget,
        None => RefreshTokenChange::Keep,
    }
}

fn current_session_identity() -> Option<ManagedAuthSessionIdentity> {
    ACCESS_TOKEN
        .read()
        .unwrap_or_else(|poisoned| poisoned.into_inner())
        .identity
        .clone()
}

fn keep_cloud_refresh_token(
    vault: &dyn CloudCredentialVault,
    secret_manager: &SecretManager,
    refresh_token: String,
) -> Result<(), String> {
    store_cloud_refresh_token(vault, secret_manager, &refresh_token)?;
    *REFRESH_TOKEN
        .write()
        .unwrap_or_else(|poisoned| poisoned.into_inner()) = Some(refresh_token);
    Ok(())
}

fn forget_cloud_refresh_token(
    vault: &dyn CloudCredentialVault,
    secret_manager: &SecretManager,
) -> Result<(), String> {
    delete_cloud_credential(
        vault,
        secret_manager,
        CLOUD_REFRESH_TOKEN_KEYRING_ACCOUNT,
        CLOUD_REFRESH_TOKEN_SECRET_KEY,
    )?;
    *REFRESH_TOKEN
        .write()
        .unwrap_or_else(|poisoned| poisoned.into_inner()) = None;
    Ok(())
}

fn store_cloud_access_token(
    vault: &dyn CloudCredentialVault,
    secret_manager: &SecretManager,
    access_token: &str,
) -> Result<(), String> {
    store_cloud_credential(
        vault,
        secret_manager,
        CLOUD_ACCESS_TOKEN_KEYRING_ACCOUNT,
        CLOUD_ACCESS_TOKEN_SECRET_KEY,
        access_token,
    )
}

/// Validate that a refresh token is non-empty and within size bounds.
/// Refresh tokens are opaque strings, so we only check for non-empty and
/// reasonable length.
fn validate_refresh_token_format(token: &str) -> Result<(), String> {
    if token.is_empty() {
        return Err("Refresh token cannot be empty".to_string());
    }
    if token.len() > 8192 {
        return Err(format!(
            "Refresh token is too long ({} chars, maximum 8192)",
            token.len()
        ));
    }
    Ok(())
}

fn store_cloud_refresh_token(
    vault: &dyn CloudCredentialVault,
    secret_manager: &SecretManager,
    refresh_token: &str,
) -> Result<(), String> {
    store_cloud_credential(
        vault,
        secret_manager,
        CLOUD_REFRESH_TOKEN_KEYRING_ACCOUNT,
        CLOUD_REFRESH_TOKEN_SECRET_KEY,
        refresh_token,
    )
}

/// Clear stored tokens (called on logout)
#[tauri::command]
pub fn account_clear_tokens(
    app: AppHandle,
    secret_state: State<'_, SecretManagerState>,
) -> Result<(), String> {
    clear_cloud_session(&app, secret_state.manager())
}

/// Removes the Cloud sign-in from the OS keyring, from the legacy database
/// rows and from memory.
pub(crate) fn clear_cloud_session(
    app: &AppHandle,
    secret_manager: &SecretManager,
) -> Result<(), String> {
    clear_cloud_tokens(&OsCloudCredentialVault::for_app(app), secret_manager)?;
    clear_access_token_in_memory();
    {
        let mut token = REFRESH_TOKEN
            .write()
            .unwrap_or_else(|poisoned| poisoned.into_inner());
        *token = None;
    }
    *HELD_REFRESH_TOKEN
        .write()
        .unwrap_or_else(|poisoned| poisoned.into_inner()) = None;
    Ok(())
}

fn clear_cloud_tokens(
    vault: &dyn CloudCredentialVault,
    secret_manager: &SecretManager,
) -> Result<(), String> {
    delete_cloud_credential(
        vault,
        secret_manager,
        CLOUD_ACCESS_TOKEN_KEYRING_ACCOUNT,
        CLOUD_ACCESS_TOKEN_SECRET_KEY,
    )?;
    delete_cloud_credential(
        vault,
        secret_manager,
        CLOUD_REFRESH_TOKEN_KEYRING_ACCOUNT,
        CLOUD_REFRESH_TOKEN_SECRET_KEY,
    )
}

/// Restore the OS-keyring Cloud access token after a Desktop process restart.
///
/// Returning `None` is the normal signed-out state. The token is validated
/// structurally before it is copied back into Rust memory; the frontend then
/// validates it against `/api/me` before exposing the Cloud workspace.
#[tauri::command]
pub fn account_restore_access_token(
    app: AppHandle,
    secret_state: State<'_, SecretManagerState>,
) -> Result<Option<String>, String> {
    restore_cloud_access_token(
        &OsCloudCredentialVault::for_app(&app),
        secret_state.manager(),
    )
}

/// What became of an attempt to renew the Cloud session. The page signs out
/// only on `Rejected`: when the server could not be reached the saved session
/// is kept, because a laptop that is offline has not been signed out, and a
/// `Refused` renewal keeps it too, carrying the server's sentence, because a
/// terms revision or an account notice does not revoke the device.
#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
#[serde(tag = "status", rename_all = "snake_case")]
pub enum SessionRenewal {
    Renewed {
        #[serde(rename = "accessToken")]
        access_token: String,
    },
    SignedOut,
    Rejected,
    Refused {
        reason: String,
        code: String,
    },
    Unreachable {
        reason: String,
    },
}

/// Renews the Cloud session.
///
/// The exchange happens here, against the registered Cloud origin, so the
/// refresh token stays in the OS keyring and this process: the webview is
/// handed only the short-lived access token. The rotated refresh token is
/// saved before the access token is returned. The request is sent once and
/// no redirect is followed, since either would hand the refresh token to
/// the server a second time or to another origin.
#[tauri::command]
pub async fn account_refresh_session(
    app: AppHandle,
    secret_state: State<'_, SecretManagerState>,
) -> Result<SessionRenewal, String> {
    let _one_exchange_at_a_time = REFRESH_EXCHANGE.lock().await;
    let vault = OsCloudCredentialVault::for_app(&app);
    let Some(refresh_token) = saved_cloud_refresh_token(&vault, secret_state.manager())? else {
        return Ok(SessionRenewal::SignedOut);
    };
    let signed_in_as = current_session_identity();

    let api_base = get_api_base_url();
    validate_api_base_url(&api_base)?;
    let mut request = build_device_authorization_request(
        &api_base,
        DEVICE_REFRESH_PATH,
        serde_json::json!({ "refresh_token": refresh_token }).to_string(),
    );
    request.headers.insert(
        CLIENT_VERSION_HEADER.to_string(),
        env!("CARGO_PKG_VERSION").to_string(),
    );
    let response = match session_renewal_client()?.execute(request).await {
        Ok(response) => response,
        Err(error) => {
            return Ok(SessionRenewal::Unreachable {
                reason: format!("AGI Cloud could not be reached: {}", error),
            })
        }
    };

    let renewed = match renewed_cloud_session(response.status, &response.body) {
        Ok(renewed) => renewed,
        Err(RenewalRefusal::Rejected) => {
            clear_cloud_session(&app, secret_state.manager())?;
            return Ok(SessionRenewal::Rejected);
        }
        Err(RenewalRefusal::Refused { reason, code }) => {
            return Ok(SessionRenewal::Refused { reason, code })
        }
        Err(RenewalRefusal::Unreachable(reason)) => {
            return Ok(SessionRenewal::Unreachable { reason })
        }
    };
    let Ok(identity) = managed_auth_session_identity(&renewed.access_token) else {
        return Ok(SessionRenewal::Unreachable {
            reason: INVALID_RENEWAL_REPLY.to_string(),
        });
    };
    if signed_in_as.is_some_and(|signed_in_as| signed_in_as.subject != identity.subject) {
        clear_cloud_session(&app, secret_state.manager())?;
        return Ok(SessionRenewal::Rejected);
    }

    // A sign-out or another sign-in during the exchange changed which refresh
    // token is the saved one. Saving this one now would bring back the
    // session the person just left.
    let still_the_saved_session = REFRESH_TOKEN
        .read()
        .unwrap_or_else(|poisoned| poisoned.into_inner())
        .as_deref()
        == Some(refresh_token.as_str());
    if !still_the_saved_session {
        return Ok(SessionRenewal::Unreachable {
            reason: "The session changed while it was being renewed.".to_string(),
        });
    }

    keep_cloud_refresh_token(&vault, secret_state.manager(), renewed.refresh_token)?;
    store_cloud_access_token(&vault, secret_state.manager(), &renewed.access_token)?;
    install_access_token_in_memory(renewed.access_token.clone())?;
    Ok(SessionRenewal::Renewed {
        access_token: renewed.access_token,
    })
}

const DEVICE_REFRESH_PATH: &str = "/api/auth/device/refresh";

const INVALID_RENEWAL_REPLY: &str =
    "AGI Cloud returned an invalid reply when renewing the session.";

static SESSION_RENEWAL_CLIENT: std::sync::OnceLock<ApiClient> = std::sync::OnceLock::new();

fn session_renewal_client() -> Result<&'static ApiClient, String> {
    if let Some(client) = SESSION_RENEWAL_CLIENT.get() {
        return Ok(client);
    }
    let client = ApiClient::single_attempt_without_redirects()
        .map_err(|e| format!("Failed to initialize the session renewal client: {}", e))?;
    Ok(SESSION_RENEWAL_CLIENT.get_or_init(|| client))
}

struct RenewedCloudSession {
    access_token: String,
    refresh_token: String,
}

#[derive(Debug, PartialEq, Eq)]
enum RenewalRefusal {
    Rejected,
    Refused { reason: String, code: String },
    Unreachable(String),
}

const REFUSED_RENEWAL_REASON: &str = "AGI Cloud did not renew your session.";
const REFUSED_RENEWAL_CODE: &str = "refresh_unavailable";

/// Reads the reply to a refresh exchange. Only 400 is the server saying the
/// refresh token is no longer good: invalid, expired, revoked, or from a
/// family it has marked compromised. 401 and 403 refuse this renewal, such as
/// for terms that need accepting or an account notice, without revoking the
/// token, so the saved session is kept and the server's sentence is shown.
/// Every other failure says nothing about the token. No message repeats the
/// body, which on success carries both tokens.
fn renewed_cloud_session(status: u16, body: &str) -> Result<RenewedCloudSession, RenewalRefusal> {
    match status {
        200..=299 => {}
        400 => return Err(RenewalRefusal::Rejected),
        401 | 403 => return Err(refused_renewal(body)),
        _ => {
            return Err(RenewalRefusal::Unreachable(format!(
                "AGI Cloud did not renew the session (status {}).",
                status
            )))
        }
    }
    let invalid = || RenewalRefusal::Unreachable(INVALID_RENEWAL_REPLY.to_string());
    let fields: serde_json::Value = serde_json::from_str(body).map_err(|_| invalid())?;
    let field = |name: &str| {
        fields
            .get(name)
            .and_then(serde_json::Value::as_str)
            .map(str::to_string)
            .ok_or_else(invalid)
    };
    let access_token = field("access_token")?;
    let refresh_token = field("refresh_token")?;
    validate_token_format(&access_token, "Renewed access token").map_err(|_| invalid())?;
    validate_refresh_token_format(&refresh_token).map_err(|_| invalid())?;
    Ok(RenewedCloudSession {
        access_token,
        refresh_token,
    })
}

fn refused_renewal(body: &str) -> RenewalRefusal {
    let fields: serde_json::Value = serde_json::from_str(body).unwrap_or_default();
    let text = |name: &str, fallback: &str| {
        fields
            .get(name)
            .and_then(serde_json::Value::as_str)
            .map(str::trim)
            .filter(|value| !value.is_empty())
            .unwrap_or(fallback)
            .to_string()
    };
    RenewalRefusal::Refused {
        reason: text("error_description", REFUSED_RENEWAL_REASON),
        code: text("error", REFUSED_RENEWAL_CODE),
    }
}

/// The refresh token from memory, or from the OS keyring after a restart.
fn saved_cloud_refresh_token(
    vault: &dyn CloudCredentialVault,
    secret_manager: &SecretManager,
) -> Result<Option<String>, String> {
    let in_memory = REFRESH_TOKEN
        .read()
        .unwrap_or_else(|poisoned| poisoned.into_inner())
        .clone();
    match in_memory {
        Some(refresh_token) => Ok(Some(refresh_token)),
        None => restore_cloud_refresh_token(vault, secret_manager),
    }
}

fn restore_cloud_access_token(
    vault: &dyn CloudCredentialVault,
    secret_manager: &SecretManager,
) -> Result<Option<String>, String> {
    let Some(access_token) = load_cloud_credential(
        vault,
        secret_manager,
        CLOUD_ACCESS_TOKEN_KEYRING_ACCOUNT,
        CLOUD_ACCESS_TOKEN_SECRET_KEY,
        |token| validate_token_format(token, "Stored access token"),
    )?
    else {
        return Ok(None);
    };
    install_access_token_in_memory(access_token.clone())?;
    Ok(Some(access_token))
}

fn restore_cloud_refresh_token(
    vault: &dyn CloudCredentialVault,
    secret_manager: &SecretManager,
) -> Result<Option<String>, String> {
    let Some(refresh_token) = load_cloud_credential(
        vault,
        secret_manager,
        CLOUD_REFRESH_TOKEN_KEYRING_ACCOUNT,
        CLOUD_REFRESH_TOKEN_SECRET_KEY,
        validate_refresh_token_format,
    )?
    else {
        return Ok(None);
    };
    let mut token = REFRESH_TOKEN
        .write()
        .unwrap_or_else(|poisoned| poisoned.into_inner());
    *token = Some(refresh_token.clone());
    Ok(Some(refresh_token))
}

// Helpers to get tokens from in-memory storage
pub fn get_access_token() -> Result<String, String> {
    // Native goal workers carry a task-scoped boundary. Delegating every
    // access-token read through the same guard covers managed media and other
    // account-backed tools as well as the primary LLM provider.
    get_access_token_for_active_managed_boundary()
}

/// Return the current token only when it still belongs to the native goal's
/// captured account/session. The comparison and token clone happen under one
/// read lock, so a credential replacement cannot slip between validation and
/// the provider attaching its bearer header.
pub(crate) fn get_access_token_for_active_managed_boundary() -> Result<String, String> {
    app_mode::require_cloud_app_mode()?;
    let expected = current_managed_auth_boundary();
    let state = ACCESS_TOKEN
        .read()
        .unwrap_or_else(|poisoned| poisoned.into_inner());
    let token = state
        .token
        .as_ref()
        .ok_or_else(|| "No access token stored. Please sign in.".to_string())?;

    if let Some(expected) = expected {
        let is_current = state.generation == expected.generation
            && state.identity.as_ref() == Some(&expected.identity);
        if !is_current {
            return Err(
                "Managed Cloud account session changed while this goal was running; the old goal was stopped before using the replacement account credential."
                    .to_string(),
            );
        }
    }

    Ok(token.clone())
}

#[cfg(test)]
pub(crate) fn replace_access_token_for_managed_boundary_test(access_token: Option<String>) {
    match access_token {
        Some(access_token) => {
            install_access_token_in_memory(access_token)
                .expect("managed-boundary test token must contain valid ownership claims");
        }
        None => clear_access_token_in_memory(),
    }
}

#[cfg(test)]
mod tests {
    use super::{
        access_token_digest, api_base_url_from_environment, build_device_authorization_request,
        delete_cloud_credential, forget_cloud_refresh_token, keep_cloud_refresh_token,
        load_cloud_credential, normalize_device_user_code, refresh_token_change,
        renewed_cloud_session, saved_cloud_refresh_token, store_cloud_credential,
        validate_api_base_url, validate_api_base_url_for_build, withhold_refresh_token,
        CloudCredentialVault, DeviceAuthorizationHttpResponse,
        ManagedAuthSessionIdentity, OsCloudCredentialVault, RefreshTokenChange, RenewalRefusal,
        SessionRenewal, UserProfile, CLOUD_ACCESS_TOKEN_KEYRING_ACCOUNT,
        CLOUD_ACCESS_TOKEN_SECRET_KEY, CLOUD_REFRESH_TOKEN_KEYRING_ACCOUNT,
        CLOUD_REFRESH_TOKEN_SECRET_KEY, PRODUCTION_API_BASE_URL,
    };
    use crate::sys::api::HttpMethod;
    use crate::sys::security::SecretManager;
    use rusqlite::Connection;
    use std::collections::HashMap;
    use std::sync::{Arc, Mutex};

    #[test]
    fn normalizes_only_well_formed_device_user_codes() {
        assert_eq!(
            normalize_device_user_code(" abcd-1234 ").unwrap(),
            "ABCD-1234"
        );
        assert_eq!(
            normalize_device_user_code("WXYZ-7890").unwrap(),
            "WXYZ-7890"
        );

        // Anything the web route would reject must be refused before it leaves
        // the device, so a malformed code can never be blamed on the server.
        assert!(normalize_device_user_code("ABCD1234").is_err());
        assert!(normalize_device_user_code("ABC-1234").is_err());
        assert!(normalize_device_user_code("ABCD-123").is_err());
        assert!(normalize_device_user_code("ABCD-12_4").is_err());
        assert!(normalize_device_user_code("").is_err());
    }

    #[derive(Default)]
    struct MemoryCredentialVault {
        entries: Mutex<HashMap<String, String>>,
    }

    impl CloudCredentialVault for MemoryCredentialVault {
        fn load(&self, account: &str) -> Result<Option<String>, String> {
            Ok(self.entries.lock().unwrap().get(account).cloned())
        }

        fn store(&self, account: &str, secret: &str) -> Result<(), String> {
            self.entries
                .lock()
                .unwrap()
                .insert(account.to_string(), secret.to_string());
            Ok(())
        }

        fn delete(&self, account: &str) -> Result<(), String> {
            self.entries.lock().unwrap().remove(account);
            Ok(())
        }
    }

    fn secret_manager() -> SecretManager {
        let connection = Connection::open_in_memory().expect("open in-memory database");
        connection
            .execute(
                "CREATE TABLE settings (
                    key TEXT PRIMARY KEY,
                    value TEXT NOT NULL,
                    encrypted INTEGER NOT NULL DEFAULT 0
                )",
                [],
            )
            .expect("create settings table");
        SecretManager::new(Arc::new(Mutex::new(connection)))
    }

    #[test]
    fn cloud_access_token_roundtrips_through_credential_vault() {
        let manager = secret_manager();
        let vault = MemoryCredentialVault::default();
        let token = "eyJhbGciOiJub25lIn0.eyJzdWIiOiJ1c2VyXzEyMyJ9.signature";

        assert_eq!(
            load_cloud_credential(
                &vault,
                &manager,
                CLOUD_ACCESS_TOKEN_KEYRING_ACCOUNT,
                CLOUD_ACCESS_TOKEN_SECRET_KEY,
                |_| Ok(()),
            )
            .unwrap(),
            None
        );
        store_cloud_credential(
            &vault,
            &manager,
            CLOUD_ACCESS_TOKEN_KEYRING_ACCOUNT,
            CLOUD_ACCESS_TOKEN_SECRET_KEY,
            token,
        )
        .unwrap();
        assert_eq!(
            load_cloud_credential(
                &vault,
                &manager,
                CLOUD_ACCESS_TOKEN_KEYRING_ACCOUNT,
                CLOUD_ACCESS_TOKEN_SECRET_KEY,
                |_| Ok(()),
            )
            .unwrap()
            .as_deref(),
            Some(token)
        );

        delete_cloud_credential(
            &vault,
            &manager,
            CLOUD_ACCESS_TOKEN_KEYRING_ACCOUNT,
            CLOUD_ACCESS_TOKEN_SECRET_KEY,
        )
        .unwrap();
        assert!(vault
            .load(CLOUD_ACCESS_TOKEN_KEYRING_ACCOUNT)
            .unwrap()
            .is_none());
    }

    #[test]
    fn cloud_refresh_token_roundtrips_through_credential_vault() {
        let manager = secret_manager();
        let vault = MemoryCredentialVault::default();
        let token = "opaque-refresh-token-with-sufficient-randomness";

        store_cloud_credential(
            &vault,
            &manager,
            CLOUD_REFRESH_TOKEN_KEYRING_ACCOUNT,
            CLOUD_REFRESH_TOKEN_SECRET_KEY,
            token,
        )
        .unwrap();
        assert_eq!(
            load_cloud_credential(
                &vault,
                &manager,
                CLOUD_REFRESH_TOKEN_KEYRING_ACCOUNT,
                CLOUD_REFRESH_TOKEN_SECRET_KEY,
                |_| Ok(()),
            )
            .unwrap()
            .as_deref(),
            Some(token)
        );

        delete_cloud_credential(
            &vault,
            &manager,
            CLOUD_REFRESH_TOKEN_KEYRING_ACCOUNT,
            CLOUD_REFRESH_TOKEN_SECRET_KEY,
        )
        .unwrap();
        assert!(vault
            .load(CLOUD_REFRESH_TOKEN_KEYRING_ACCOUNT)
            .unwrap()
            .is_none());
    }

    #[test]
    fn legacy_encrypted_cloud_token_migrates_and_is_deleted() {
        let manager = secret_manager();
        let vault = MemoryCredentialVault::default();
        let token = "opaque-refresh-token-with-sufficient-randomness";
        manager
            .set_secret(CLOUD_REFRESH_TOKEN_SECRET_KEY, token)
            .unwrap();

        let restored = load_cloud_credential(
            &vault,
            &manager,
            CLOUD_REFRESH_TOKEN_KEYRING_ACCOUNT,
            CLOUD_REFRESH_TOKEN_SECRET_KEY,
            |_| Ok(()),
        )
        .unwrap();

        assert_eq!(restored.as_deref(), Some(token));
        assert_eq!(
            vault
                .load(CLOUD_REFRESH_TOKEN_KEYRING_ACCOUNT)
                .unwrap()
                .as_deref(),
            Some(token)
        );
        assert!(!manager.has_secret(CLOUD_REFRESH_TOKEN_SECRET_KEY).unwrap());
    }

    #[test]
    fn invalid_legacy_cloud_token_is_not_migrated() {
        let manager = secret_manager();
        let vault = MemoryCredentialVault::default();
        manager
            .set_secret(CLOUD_REFRESH_TOKEN_SECRET_KEY, "invalid")
            .unwrap();

        let error = load_cloud_credential(
            &vault,
            &manager,
            CLOUD_REFRESH_TOKEN_KEYRING_ACCOUNT,
            CLOUD_REFRESH_TOKEN_SECRET_KEY,
            |_| Err("invalid credential".to_string()),
        )
        .unwrap_err();

        assert_eq!(error, "invalid credential");
        assert!(vault
            .load(CLOUD_REFRESH_TOKEN_KEYRING_ACCOUNT)
            .unwrap()
            .is_none());
        assert!(manager.has_secret(CLOUD_REFRESH_TOKEN_SECRET_KEY).unwrap());
    }

    #[test]
    fn bundle_identifiers_isolate_cloud_keyring_namespaces() {
        let production = OsCloudCredentialVault::for_bundle_identifier("com.agiworkforce.desktop");
        let wdio = OsCloudCredentialVault::for_bundle_identifier("com.agiworkforce.desktop.wdio");

        assert_eq!(production.service, "com.agiworkforce.desktop.cloud-account");
        assert_eq!(wdio.service, "com.agiworkforce.desktop.wdio.cloud-account");
        assert_ne!(production.service, wdio.service);
    }

    #[test]
    fn device_code_request_uses_the_exact_native_contract() {
        let request = build_device_authorization_request(
            "https://agiworkforce.com",
            "/api/auth/device/code",
            r#"{"surface":"desktop"}"#.to_string(),
        );

        assert!(matches!(request.method, HttpMethod::Post));
        assert_eq!(request.url, "https://agiworkforce.com/api/auth/device/code");
        assert_eq!(request.body.as_deref(), Some(r#"{"surface":"desktop"}"#));
        assert_eq!(request.timeout_ms, Some(30_000));
        assert_eq!(
            request.headers.get("Content-Type").map(String::as_str),
            Some("application/json")
        );
        assert_eq!(
            request.headers.get("X-Requested-With").map(String::as_str),
            Some("XMLHttpRequest")
        );
    }

    // Regression guard for the SSRF allowlist that BYOK-RUST-EGRESS-01 relies on
    // as the trust boundary for the only non-dormant Rust egress path. The
    // function is currently correct but one edit (e.g. `ends_with(".agiworkforce.com")`
    // → `contains("agiworkforce.com")`, or dropping the userinfo check) away from a
    // silent SSRF/allowlist bypass. These lock the invariant.

    #[test]
    fn allows_agiworkforce_apex_and_subdomains() {
        assert!(validate_api_base_url("https://agiworkforce.com").is_ok());
        assert!(validate_api_base_url("https://www.agiworkforce.com").is_ok());
        assert!(validate_api_base_url("https://api.agiworkforce.com").is_ok());
    }

    const LOOPBACK_BASES: [&str; 8] = [
        "http://localhost",
        "http://localhost:3000",
        "https://localhost",
        "http://127.0.0.1",
        "http://127.0.0.1:8787",
        "http://[::1]",
        "http://0.0.0.0",
        "https://127.0.0.1",
    ];

    #[test]
    fn a_release_build_rejects_every_loopback_base() {
        for base in LOOPBACK_BASES {
            assert!(
                validate_api_base_url_for_build(base, false).is_err(),
                "a release build must not send the account token to {base}"
            );
        }
        assert!(validate_api_base_url_for_build("https://agiworkforce.com", false).is_ok());
    }

    #[test]
    fn a_debug_build_accepts_loopback_bases_for_local_development() {
        for base in LOOPBACK_BASES {
            assert!(
                validate_api_base_url_for_build(base, true).is_ok(),
                "a debug build should reach a local server at {base}"
            );
        }
    }

    #[test]
    fn the_build_gate_follows_debug_assertions() {
        assert_eq!(
            validate_api_base_url("http://localhost").is_ok(),
            cfg!(debug_assertions)
        );
    }

    #[test]
    fn an_environment_base_outside_the_allowlist_falls_back_to_production() {
        assert_eq!(
            api_base_url_from_environment(Some("https://evil.example".to_string())),
            PRODUCTION_API_BASE_URL
        );
        assert_eq!(
            api_base_url_from_environment(Some("not a url".to_string())),
            PRODUCTION_API_BASE_URL
        );
        assert_eq!(api_base_url_from_environment(None), PRODUCTION_API_BASE_URL);
        assert_eq!(
            api_base_url_from_environment(Some("https://staging.agiworkforce.com/".to_string())),
            "https://staging.agiworkforce.com"
        );
    }

    #[test]
    fn rejects_substring_lookalike_hosts_not_true_subdomains() {
        // The allowlist is a suffix/apex match, NOT a substring match.
        assert!(validate_api_base_url("https://api.agiworkforce.com.evil.com").is_err());
        assert!(validate_api_base_url("https://notagiworkforce.com").is_err());
        assert!(validate_api_base_url("https://evil-agiworkforce.com").is_err());
        assert!(validate_api_base_url("https://evil.com").is_err());
    }

    #[test]
    fn rejects_userinfo_non_loopback_http_and_bad_scheme() {
        // Userinfo (an SSRF-bypass vector) is rejected even on an allowlisted host.
        assert!(validate_api_base_url("https://user:pass@api.agiworkforce.com").is_err());
        // http:// is allowed ONLY for loopback hosts.
        assert!(validate_api_base_url("http://api.agiworkforce.com").is_err());
        // Non-http(s) schemes are rejected.
        assert!(validate_api_base_url("ftp://api.agiworkforce.com").is_err());
    }

    #[test]
    fn parses_canonical_me_profile_with_nullable_created_at() {
        let profile: UserProfile = serde_json::from_str(
            r#"{
                "id":"user_123",
                "email":null,
                "name":"Demo",
                "avatar_url":null,
                "created_at":null,
                "updated_at":1785361122.75,
                "plan":{
                    "tier":"free",
                    "display_name":"Free",
                    "status":"none",
                    "current_period_end":null
                },
                "feature_flags":{
                    "advanced_model_access":false
                }
            }"#,
        )
        .expect("canonical /api/me profile should deserialize");

        assert_eq!(profile.email, None);
        assert_eq!(profile.created_at, None);
        assert_eq!(profile.updated_at, 1_785_361_122);
    }

    #[test]
    fn parses_legacy_iso_created_at_without_weakening_validation() {
        let profile: UserProfile = serde_json::from_str(
            r#"{
                "id":"user_123",
                "email":"demo@example.com",
                "name":"Demo",
                "avatar_url":null,
                "created_at":"2026-07-29T12:00:00Z",
                "updated_at":1785361122,
                "plan":{
                    "tier":"free",
                    "display_name":"Free",
                    "status":"none",
                    "current_period_end":null
                },
                "feature_flags":{}
            }"#,
        )
        .expect("legacy ISO profile timestamp should deserialize");

        assert_eq!(
            profile.created_at,
            Some(serde_json::Value::String(
                "2026-07-29T12:00:00Z".to_string()
            ))
        );

        let invalid = serde_json::from_str::<UserProfile>(
            r#"{
                "id":"user_123",
                "email":"demo@example.com",
                "name":"Demo",
                "avatar_url":null,
                "created_at":"not-a-date",
                "updated_at":1785361122,
                "plan":{
                    "tier":"free",
                    "display_name":"Free",
                    "status":"none",
                    "current_period_end":null
                },
                "feature_flags":{}
            }"#,
        );
        assert!(invalid.is_err());
    }

    fn profile_with_flags(flags: &str) -> UserProfile {
        serde_json::from_str(&format!(
            r#"{{
                "id":"user_123",
                "email":null,
                "name":"Demo",
                "avatar_url":null,
                "created_at":null,
                "updated_at":1785361122,
                "plan":{{"tier":"free","display_name":"Free","status":"none","current_period_end":null}},
                "feature_flags":{flags}
            }}"#
        ))
        .expect("profile fixture should deserialize")
    }

    #[test]
    fn a_profile_refresh_carries_the_dictation_switch_to_the_detector() {
        let wake = crate::features::speech::wake::VoiceWake::default();

        super::apply_server_speech_gate(
            &wake,
            &profile_with_flags(r#"{"capability.dictation":false}"#).feature_flags,
        );
        assert!(
            wake.remote_block_reason().is_some(),
            "a closed switch in /api/me must stop dictation on this build"
        );

        super::apply_server_speech_gate(
            &wake,
            &profile_with_flags(r#"{"advanced_model_access":true}"#).feature_flags,
        );
        assert!(
            wake.remote_block_reason().is_none(),
            "a profile that no longer closes dictation must reopen it"
        );
    }

    const ACCESS_TOKEN_SHAPE: &str = "eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiJ1c2VyLTEifQ.c2lnbmF0dXJl";
    const REFRESH_TOKEN_SHAPE: &str = "opaque-refresh-token-with-sufficient-randomness";

    fn identity(subject: &str, session: Option<&str>) -> ManagedAuthSessionIdentity {
        ManagedAuthSessionIdentity {
            subject: subject.to_string(),
            session_id: session.map(str::to_string),
        }
    }

    #[test]
    fn the_refresh_token_is_taken_out_of_the_reply_the_page_receives() {
        let reply = DeviceAuthorizationHttpResponse {
            status: 200,
            body: serde_json::json!({
                "access_token": ACCESS_TOKEN_SHAPE,
                "refresh_token": REFRESH_TOKEN_SHAPE,
                "token_type": "Bearer",
                "expires_in": 900
            })
            .to_string(),
        };

        let (for_the_page, held) = withhold_refresh_token(reply);

        assert!(!for_the_page.body.contains(REFRESH_TOKEN_SHAPE));
        let fields: serde_json::Value = serde_json::from_str(&for_the_page.body).unwrap();
        assert!(fields.get("refresh_token").is_none());
        assert_eq!(fields["access_token"], ACCESS_TOKEN_SHAPE);
        assert_eq!(fields["expires_in"], 900);
        let held = held.expect("the refresh token is held for the adoption");
        assert_eq!(held.refresh_token, REFRESH_TOKEN_SHAPE);
        assert_eq!(
            held.access_token_digest,
            access_token_digest(ACCESS_TOKEN_SHAPE)
        );
    }

    #[test]
    fn a_reply_without_a_refresh_token_passes_through_unchanged() {
        for body in [
            r#"{"error":"authorization_pending"}"#,
            "<html>bad gateway</html>",
            "",
        ] {
            let reply = DeviceAuthorizationHttpResponse {
                status: 400,
                body: body.to_string(),
            };
            let (for_the_page, held) = withhold_refresh_token(reply);
            assert_eq!(for_the_page.body, body);
            assert!(held.is_none());
        }

        let orphan = DeviceAuthorizationHttpResponse {
            status: 200,
            body: serde_json::json!({ "refresh_token": REFRESH_TOKEN_SHAPE }).to_string(),
        };
        let (for_the_page, held) = withhold_refresh_token(orphan);
        assert!(!for_the_page.body.contains(REFRESH_TOKEN_SHAPE));
        assert!(
            held.is_none(),
            "a refresh token with no access token belongs to nothing the page can adopt"
        );
    }

    #[test]
    fn adopting_an_access_token_adopts_keeps_or_forgets_the_refresh_token() {
        let alice = identity("alice", Some("family-1"));
        let alice_again = identity("alice", Some("family-2"));
        let bob = identity("bob", Some("family-3"));

        assert_eq!(
            refresh_token_change(Some("next".to_string()), Some(&alice), &bob),
            RefreshTokenChange::Adopt("next".to_string()),
            "a sign-in that brought its own refresh token replaces the saved one"
        );
        assert_eq!(
            refresh_token_change(None, Some(&alice), &alice),
            RefreshTokenChange::Keep,
            "a renewed access token for the same session keeps it"
        );
        assert_eq!(
            refresh_token_change(None, None, &alice),
            RefreshTokenChange::Keep
        );
        for replaced_by in [&bob, &alice_again] {
            assert_eq!(
                refresh_token_change(None, Some(&alice), replaced_by),
                RefreshTokenChange::Forget,
                "another account or sign-in must not be renewed with the old token"
            );
        }
    }

    #[test]
    fn a_refresh_reply_is_renewed_rejected_or_unreachable() {
        let rotated = serde_json::json!({
            "access_token": ACCESS_TOKEN_SHAPE,
            "refresh_token": REFRESH_TOKEN_SHAPE,
            "expires_in": 900
        })
        .to_string();
        let renewed = renewed_cloud_session(200, &rotated)
            .ok()
            .expect("a rotated session");
        assert_eq!(renewed.access_token, ACCESS_TOKEN_SHAPE);
        assert_eq!(renewed.refresh_token, REFRESH_TOKEN_SHAPE);

        assert_eq!(
            renewed_cloud_session(400, r#"{"error":"invalid_grant"}"#).err(),
            Some(RenewalRefusal::Rejected),
            "400 is the server refusing the refresh token"
        );
        for status in [401, 403] {
            assert_eq!(
                renewed_cloud_session(
                    status,
                    r#"{"error":"terms_acceptance_required","error_description":"Accept the terms."}"#
                )
                .err(),
                Some(RenewalRefusal::Refused {
                    reason: "Accept the terms.".to_string(),
                    code: "terms_acceptance_required".to_string(),
                }),
                "{status} refuses this renewal and keeps the refresh token"
            );
            assert_eq!(
                renewed_cloud_session(status, "{}").err(),
                Some(RenewalRefusal::Refused {
                    reason: super::REFUSED_RENEWAL_REASON.to_string(),
                    code: super::REFUSED_RENEWAL_CODE.to_string(),
                })
            );
        }
        for status in [302, 307, 408, 429, 500, 502, 503] {
            let Err(RenewalRefusal::Unreachable(reason)) = renewed_cloud_session(status, &rotated)
            else {
                panic!("{status} says nothing about the refresh token");
            };
            assert!(reason.contains(&status.to_string()), "{reason}");
            assert!(!reason.contains(REFRESH_TOKEN_SHAPE));
        }
        for body in [
            r#"{"access_token":"not-a-jwt","refresh_token":"x"}"#.to_string(),
            serde_json::json!({ "access_token": ACCESS_TOKEN_SHAPE }).to_string(),
            "<html>".to_string(),
        ] {
            let Err(RenewalRefusal::Unreachable(reason)) = renewed_cloud_session(200, &body) else {
                panic!("a reply that cannot be read is not a refusal of the token");
            };
            assert!(reason.contains("invalid reply"), "{reason}");
            assert!(!reason.contains(ACCESS_TOKEN_SHAPE));
        }
    }

    #[test]
    fn the_page_is_told_which_of_the_outcomes_happened_and_never_the_refresh_token() {
        let renewed = serde_json::to_value(SessionRenewal::Renewed {
            access_token: ACCESS_TOKEN_SHAPE.to_string(),
        })
        .unwrap();
        assert_eq!(
            renewed,
            serde_json::json!({ "status": "renewed", "accessToken": ACCESS_TOKEN_SHAPE })
        );
        assert_eq!(
            serde_json::to_value(SessionRenewal::SignedOut).unwrap(),
            serde_json::json!({ "status": "signed_out" })
        );
        assert_eq!(
            serde_json::to_value(SessionRenewal::Rejected).unwrap(),
            serde_json::json!({ "status": "rejected" })
        );
        assert_eq!(
            serde_json::to_value(SessionRenewal::Refused {
                reason: "Accept the terms.".to_string(),
                code: "terms_acceptance_required".to_string(),
            })
            .unwrap(),
            serde_json::json!({
                "status": "refused",
                "reason": "Accept the terms.",
                "code": "terms_acceptance_required"
            })
        );
        assert_eq!(
            serde_json::to_value(SessionRenewal::Unreachable {
                reason: "offline".to_string()
            })
            .unwrap(),
            serde_json::json!({ "status": "unreachable", "reason": "offline" })
        );
    }

    #[test]
    fn the_saved_refresh_token_is_kept_and_forgotten_in_the_vault() {
        let vault = MemoryCredentialVault::default();
        let manager = secret_manager();

        keep_cloud_refresh_token(&vault, &manager, REFRESH_TOKEN_SHAPE.to_string()).unwrap();
        assert_eq!(
            vault
                .load(CLOUD_REFRESH_TOKEN_KEYRING_ACCOUNT)
                .unwrap()
                .as_deref(),
            Some(REFRESH_TOKEN_SHAPE)
        );
        assert_eq!(
            saved_cloud_refresh_token(&vault, &manager)
                .unwrap()
                .as_deref(),
            Some(REFRESH_TOKEN_SHAPE)
        );

        forget_cloud_refresh_token(&vault, &manager).unwrap();
        assert!(vault
            .load(CLOUD_REFRESH_TOKEN_KEYRING_ACCOUNT)
            .unwrap()
            .is_none());
        assert!(saved_cloud_refresh_token(&vault, &manager)
            .unwrap()
            .is_none());
    }

    #[test]
    fn no_command_hands_the_refresh_token_to_the_page() {
        let source = include_str!("mod.rs");
        let production = source
            .split("#[cfg(test)]\nmod tests")
            .next()
            .unwrap_or(source);
        for removed in [
            "pub fn account_restore_refresh_token",
            "pub fn account_store_refresh_token",
        ] {
            assert!(!production.contains(removed), "{removed} is back");
        }
        let setup = include_str!("../../lib.rs");
        assert!(setup.contains("crate::sys::account::account_refresh_session,"));
        assert!(!setup.contains("account_restore_refresh_token"));
        assert!(!setup.contains("account_store_refresh_token"));
    }
}
