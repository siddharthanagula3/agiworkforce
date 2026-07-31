use crate::sys::api::{ApiClient, ApiRequest, ApiResponse, AuthType, HttpMethod};
use crate::sys::commands::{security::SecretManagerState, ApiState};
use crate::sys::security::SecretManager;
use serde::{de::DeserializeOwned, Deserialize, Serialize};
use tauri::State;

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

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct DeviceLinkRequest {
    pub device_id: String,
    pub device_name: Option<String>,
    pub device_type: Option<String>,
    pub device_fingerprint: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct DeviceLinkResponse {
    pub link_code: String,
    pub device_id: String,
    pub expires_at: u64,
    pub qr_code_url: Option<String>,
    pub verify_url: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct DevicePollRequest {
    pub device_id: String,
    pub device_fingerprint: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct DevicePollResponse {
    pub status: String,
    pub access_token: Option<String>,
    pub refresh_token: Option<String>,
    pub user: Option<UserProfile>,
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
    let api_base = get_api_base_url();
    validate_api_base_url(&api_base)?;

    let response = client
        .execute(build_device_authorization_request(&api_base, path, body))
        .await
        .map_err(|e| format!("AGI Cloud device authorization request failed: {}", e))?;

    Ok(DeviceAuthorizationHttpResponse {
        status: response.status,
        body: response.body,
    })
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
    execute_device_authorization_request("/api/auth/device/token", body, client).await
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

/// Generate a stable device fingerprint by hashing the device_id together with
/// machine-stable environment signals.  The result is a lowercase hex SHA-256 digest
/// (64 characters) that is deterministic for the same machine + device_id combination.
fn generate_device_fingerprint(device_id: &str) -> String {
    use sha2::{Digest, Sha256};
    let mut hasher = Sha256::new();
    hasher.update(device_id.as_bytes());
    let hostname = std::env::var("HOSTNAME")
        .or_else(|_| std::env::var("COMPUTERNAME"))
        .unwrap_or_else(|_| "unknown-host".to_string());
    let username = std::env::var("USER")
        .or_else(|_| std::env::var("USERNAME"))
        .unwrap_or_else(|_| "unknown-user".to_string());
    hasher.update(hostname.as_bytes());
    hasher.update(username.as_bytes());
    hasher.update(b"agi-workforce-device-v1");
    hex::encode(hasher.finalize())
}

pub async fn device_link_initiate(
    state: State<'_, ApiState>,
) -> Result<DeviceLinkResponse, String> {
    let hostname = std::env::var("HOSTNAME")
        .or_else(|_| std::env::var("COMPUTERNAME"))
        .unwrap_or_else(|_| "Desktop".to_string());
    let device_id = generate_device_fingerprint(&hostname);
    let request = DeviceLinkRequest {
        device_id: device_id.clone(),
        device_name: Some(hostname),
        device_type: Some("desktop".to_string()),
        device_fingerprint: Some(generate_device_fingerprint(&device_id)),
    };
    let api_base = get_api_base_url();

    let url = format!("{}/api/device/link", api_base);

    let body =
        serde_json::to_string(&request).map_err(|e| format!("Serialization error: {}", e))?;

    let api_request = ApiRequest {
        method: HttpMethod::Post,
        url,
        body: Some(body),
        headers: std::collections::HashMap::from([(
            "Content-Type".to_string(),
            "application/json".to_string(),
        )]),
        ..Default::default()
    };

    let response = state
        .get_client()?
        .execute(api_request)
        .await
        .map_err(|e| format!("Device link request failed: {}", e))?;

    if !response.success {
        return Err(format!("API error {}: {}", response.status, response.body));
    }

    parse_json_response(&response)
}

pub async fn device_link_poll(
    device_id: String,
    state: State<'_, ApiState>,
) -> Result<DevicePollResponse, String> {
    let request = DevicePollRequest {
        device_id: device_id.clone(),
        device_fingerprint: Some(generate_device_fingerprint(&device_id)),
    };
    let api_base = get_api_base_url();

    let url = format!("{}/api/device/poll", api_base);

    let body =
        serde_json::to_string(&request).map_err(|e| format!("Serialization error: {}", e))?;

    let api_request = ApiRequest {
        method: HttpMethod::Post,
        url,
        body: Some(body),
        headers: std::collections::HashMap::from([(
            "Content-Type".to_string(),
            "application/json".to_string(),
        )]),
        ..Default::default()
    };

    let response = state
        .get_client()?
        .execute(api_request)
        .await
        .map_err(|e| format!("Device poll request failed: {}", e))?;

    if !response.success {
        return Err(format!("API error {}: {}", response.status, response.body));
    }

    // Note: We no longer store tokens here. The frontend receives the response
    // and should update the app auth session.
    parse_json_response(&response)
}

#[tauri::command]
pub async fn fetch_user_profile(
    access_token: String,
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

    parse_json_response(&response)
}

pub async fn oauth_refresh(
    refresh_token: String,
    state: State<'_, ApiState>,
) -> Result<serde_json::Value, String> {
    let api_base = get_api_base_url();

    let url = format!("{}/oauth/refresh", api_base);

    let body = serde_json::json!({ "refresh_token": refresh_token }).to_string();

    let api_request = ApiRequest {
        method: HttpMethod::Post,
        url,
        body: Some(body),
        headers: std::collections::HashMap::from([(
            "Content-Type".to_string(),
            "application/json".to_string(),
        )]),
        ..Default::default()
    };

    let response = state
        .get_client()?
        .execute(api_request)
        .await
        .map_err(|e| format!("Token refresh failed: {}", e))?;

    if !response.success {
        return Err(format!("API error {}: {}", response.status, response.body));
    }

    // Note: We no longer manually store tokens. Frontend should handle the result.
    parse_json_response(&response)
}

use std::sync::RwLock;

// In-memory token storage for the Rust backend
// This avoids keyring permission prompts while still allowing Rust to make API calls
static ACCESS_TOKEN: RwLock<Option<String>> = RwLock::new(None);
static REFRESH_TOKEN: RwLock<Option<String>> = RwLock::new(None);
static API_BASE_URL_OVERRIDE: RwLock<Option<String>> = RwLock::new(None);
const CLOUD_ACCESS_TOKEN_SECRET_KEY: &str = "cloud_account_access_token";
const CLOUD_REFRESH_TOKEN_SECRET_KEY: &str = "cloud_account_refresh_token";

/// Get the API base URL for desktop -> backend calls.
///
/// Priority:
/// 1) In-memory override set by the frontend (best for local dev, where Vite reads `.env` but Rust does not)
/// 2) `AGI_API_URL` environment variable
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

    let raw =
        std::env::var("AGI_API_URL").unwrap_or_else(|_| "https://agiworkforce.com".to_string());
    raw.trim_end_matches('/').to_string()
}

/// Validate that an API base URL is safe to use (prevents SSRF).
///
/// Rules:
/// - `https://` scheme is required, except for `http://localhost` and `http://127.0.0.1`
/// - Domain must match the allowlist: `*.agiworkforce.com`, `localhost`, or `127.0.0.1`
fn validate_api_base_url(url: &str) -> Result<(), String> {
    // Parse the URL to extract scheme and host
    let parsed = url::Url::parse(url).map_err(|e| format!("Invalid URL: {}", e))?;

    let scheme = parsed.scheme();
    let host = parsed
        .host_str()
        .ok_or_else(|| "URL must contain a host".to_string())?;

    // C6: Reject URLs containing credentials (userinfo) to prevent SSRF bypass
    if !parsed.username().is_empty() || parsed.password().is_some() {
        return Err("API base URL must not contain credentials (userinfo)".to_string());
    }

    let is_localhost = matches!(
        host,
        "localhost" | "127.0.0.1" | "::1" | "[::1]" | "0.0.0.0"
    );

    // Enforce https:// except for localhost / 127.0.0.1 / ::1 / 0.0.0.0
    if scheme == "http" && !is_localhost {
        return Err(
            "API base URL must use https:// (http:// is only allowed for localhost, 127.0.0.1, ::1, and 0.0.0.0)"
                .to_string(),
        );
    }
    if scheme != "http" && scheme != "https" {
        return Err(format!(
            "API base URL must use http or https scheme, got: {}",
            scheme
        ));
    }

    // Domain allowlist: *.agiworkforce.com, localhost, 127.0.0.1
    let allowed = is_localhost || host == "agiworkforce.com" || host.ends_with(".agiworkforce.com");

    if !allowed {
        return Err(format!(
            "API base URL host '{}' is not in the allowlist. \
             Allowed: *.agiworkforce.com, localhost, 127.0.0.1, ::1, 0.0.0.0",
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
    secret_state: State<'_, SecretManagerState>,
) -> Result<(), String> {
    validate_token_format(&accessToken, "Access token")?;
    store_cloud_access_token(secret_state.manager(), &accessToken)?;
    let mut token = ACCESS_TOKEN
        .write()
        .unwrap_or_else(|poisoned| poisoned.into_inner());
    *token = Some(accessToken);
    Ok(())
}

fn store_cloud_access_token(
    secret_manager: &SecretManager,
    access_token: &str,
) -> Result<(), String> {
    secret_manager
        .set_secret(CLOUD_ACCESS_TOKEN_SECRET_KEY, access_token)
        .map_err(|_| "Failed to securely store the Cloud access token".to_string())
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

/// Store refresh token from frontend (called when the app auth state changes).
#[tauri::command]
#[allow(non_snake_case)]
pub fn account_store_refresh_token(
    refreshToken: String,
    secret_state: State<'_, SecretManagerState>,
) -> Result<(), String> {
    validate_refresh_token_format(&refreshToken)?;
    store_cloud_refresh_token(secret_state.manager(), &refreshToken)?;
    let mut token = REFRESH_TOKEN
        .write()
        .unwrap_or_else(|poisoned| poisoned.into_inner());
    *token = Some(refreshToken);
    Ok(())
}

fn store_cloud_refresh_token(
    secret_manager: &SecretManager,
    refresh_token: &str,
) -> Result<(), String> {
    secret_manager
        .set_secret(CLOUD_REFRESH_TOKEN_SECRET_KEY, refresh_token)
        .map_err(|_| "Failed to securely store the Cloud refresh token".to_string())
}

/// Clear stored tokens (called on logout)
#[tauri::command]
pub fn account_clear_tokens(secret_state: State<'_, SecretManagerState>) -> Result<(), String> {
    clear_cloud_tokens(secret_state.manager())?;
    {
        let mut token = ACCESS_TOKEN
            .write()
            .unwrap_or_else(|poisoned| poisoned.into_inner());
        *token = None;
    }
    {
        let mut token = REFRESH_TOKEN
            .write()
            .unwrap_or_else(|poisoned| poisoned.into_inner());
        *token = None;
    }
    Ok(())
}

fn clear_cloud_tokens(secret_manager: &SecretManager) -> Result<(), String> {
    secret_manager
        .delete_secret(CLOUD_ACCESS_TOKEN_SECRET_KEY)
        .map_err(|_| "Failed to clear the stored Cloud access token".to_string())?;
    secret_manager
        .delete_secret(CLOUD_REFRESH_TOKEN_SECRET_KEY)
        .map_err(|_| "Failed to clear the stored Cloud refresh token".to_string())
}

/// Restore the encrypted Cloud access token after a Desktop process restart.
///
/// Returning `None` is the normal signed-out state. The token is validated
/// structurally before it is copied back into Rust memory; the frontend then
/// validates it against `/api/me` before exposing the Cloud workspace.
#[tauri::command]
pub fn account_restore_access_token(
    secret_state: State<'_, SecretManagerState>,
) -> Result<Option<String>, String> {
    restore_cloud_access_token(secret_state.manager())
}

/// Restore the encrypted Cloud refresh token after a Desktop process restart.
///
/// The raw value crosses IPC only into the authenticated Desktop webview, which
/// immediately exchanges it over the allowlisted AGI Cloud origin when the
/// access token is near expiry. It is never logged or persisted in plaintext.
#[tauri::command]
pub fn account_restore_refresh_token(
    secret_state: State<'_, SecretManagerState>,
) -> Result<Option<String>, String> {
    restore_cloud_refresh_token(secret_state.manager())
}

fn restore_cloud_access_token(secret_manager: &SecretManager) -> Result<Option<String>, String> {
    let exists = secret_manager
        .has_secret(CLOUD_ACCESS_TOKEN_SECRET_KEY)
        .map_err(|_| "Failed to inspect the stored Cloud session".to_string())?;
    if !exists {
        return Ok(None);
    }

    let access_token = secret_manager
        .get_secret(CLOUD_ACCESS_TOKEN_SECRET_KEY)
        .map_err(|_| "Failed to restore the stored Cloud session".to_string())?;
    validate_token_format(&access_token, "Stored access token")?;

    let mut token = ACCESS_TOKEN
        .write()
        .unwrap_or_else(|poisoned| poisoned.into_inner());
    *token = Some(access_token.clone());
    Ok(Some(access_token))
}

fn restore_cloud_refresh_token(secret_manager: &SecretManager) -> Result<Option<String>, String> {
    let exists = secret_manager
        .has_secret(CLOUD_REFRESH_TOKEN_SECRET_KEY)
        .map_err(|_| "Failed to inspect the stored Cloud refresh credential".to_string())?;
    if !exists {
        return Ok(None);
    }

    let refresh_token = secret_manager
        .get_secret(CLOUD_REFRESH_TOKEN_SECRET_KEY)
        .map_err(|_| "Failed to restore the stored Cloud refresh credential".to_string())?;
    validate_refresh_token_format(&refresh_token)?;

    let mut token = REFRESH_TOKEN
        .write()
        .unwrap_or_else(|poisoned| poisoned.into_inner());
    *token = Some(refresh_token.clone());
    Ok(Some(refresh_token))
}

// Helpers to get tokens from in-memory storage
pub fn get_access_token() -> Result<String, String> {
    let token = ACCESS_TOKEN
        .read()
        .unwrap_or_else(|poisoned| poisoned.into_inner());
    token
        .clone()
        .ok_or_else(|| "No access token stored. Please sign in.".to_string())
}

pub fn get_refresh_token() -> Result<String, String> {
    let token = REFRESH_TOKEN
        .read()
        .unwrap_or_else(|poisoned| poisoned.into_inner());
    token
        .clone()
        .ok_or_else(|| "No refresh token stored. Please sign in.".to_string())
}

/// Subscription information from credits API
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SubscriptionInfo {
    pub plan_tier: String,
    pub status: String,
    pub current_period_end: Option<String>,
}

/// Credits information from credits API
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CreditsInfo {
    pub usage_percentage: f64,
    pub reset_at: Option<String>,
    pub seconds_until_reset: u64,
    pub has_usage_remaining: bool,
}

/// Credit balance response from the API
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CreditBalanceResponse {
    pub object: String,
    pub subscription: SubscriptionInfo,
    pub credits: CreditsInfo,
}

impl CreditBalanceResponse {
    /// Helper method to check if user has credits available
    pub fn has_credits(&self) -> bool {
        self.credits.has_usage_remaining
    }
}

/// Fetch current credit balance from the API
pub async fn fetch_credit_balance(
    state: State<'_, ApiState>,
) -> Result<CreditBalanceResponse, String> {
    let token = get_access_token()?;
    let api_base = get_api_base_url();

    let url = format!("{}/api/llm/v1/credits/balance", api_base);

    let api_request = ApiRequest {
        method: HttpMethod::Get,
        url,
        auth: AuthType::Bearer { token },
        ..Default::default()
    };

    let response = state
        .get_client()?
        .execute(api_request)
        .await
        .map_err(|e| format!("Failed to fetch credit balance: {}", e))?;

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

    parse_json_response(&response)
}

// ---------------------------------------------------------------------------
// Device Management
// ---------------------------------------------------------------------------

/// A connected device session visible in account settings.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ConnectedDevice {
    /// Unique device identifier.
    pub id: String,
    /// Human-readable device name (e.g. "Siddhartha's MacBook Pro").
    pub name: String,
    /// Device category: "desktop", "mobile", or "browser".
    pub device_type: String,
    /// Operating system: "macos", "windows", "linux", "ios", "android".
    pub platform: String,
    /// ISO 8601 timestamp of the last heartbeat / activity.
    pub last_seen: String,
    /// `true` when this entry represents the device making the request.
    pub current: bool,
}

/// Return the list of devices connected to the current account.
///
/// For now this returns at minimum the current device derived from
/// environment signals.  When the backend API gains a `/api/devices`
/// endpoint this will proxy through to it.
#[tauri::command]
pub async fn account_list_devices() -> Result<Vec<ConnectedDevice>, String> {
    let hostname = std::env::var("HOSTNAME")
        .or_else(|_| std::env::var("COMPUTERNAME"))
        .unwrap_or_else(|_| "Desktop".to_string());

    let platform = if cfg!(target_os = "macos") {
        "macos"
    } else if cfg!(target_os = "windows") {
        "windows"
    } else {
        "linux"
    };

    let now = chrono::Utc::now().to_rfc3339();

    let current_device = ConnectedDevice {
        id: generate_device_fingerprint(&hostname),
        name: hostname,
        device_type: "desktop".to_string(),
        platform: platform.to_string(),
        last_seen: now,
        current: true,
    };

    Ok(vec![current_device])
}

/// Disconnect / revoke a device session by its identifier.
///
/// FIX-029 (Sprint 5): the previous body validated input then returned
/// `Ok(())` while doing nothing — callers got a green checkmark in the
/// UI even though the device session was still live. Now we surface an
/// explicit `not_implemented` error so the UI can render "Pending — full
/// revocation lands with the device-management API". Once the backend
/// exposes `/api/devices/:id/revoke`, this will forward the call.
#[tauri::command]
pub async fn account_disconnect_device(device_id: String) -> Result<(), String> {
    // Validate device_id looks like a hex SHA-256 digest (64 hex chars).
    if device_id.len() != 64 || !device_id.chars().all(|c| c.is_ascii_hexdigit()) {
        return Err(format!(
            "Invalid device_id format: expected 64 hex characters, got {} characters",
            device_id.len()
        ));
    }

    // Check that the caller is not trying to disconnect the current device.
    let hostname = std::env::var("HOSTNAME")
        .or_else(|_| std::env::var("COMPUTERNAME"))
        .unwrap_or_else(|_| "Desktop".to_string());
    let current_fingerprint = generate_device_fingerprint(&hostname);

    if device_id == current_fingerprint {
        return Err("Cannot disconnect the current device. Sign out instead.".to_string());
    }

    Err("[ERR_NOT_IMPLEMENTED] Remote device revocation requires the device-management API. It is pending; sign out on the target device for now.".to_string())
}

#[cfg(test)]
mod tests {
    use super::{
        build_device_authorization_request, clear_cloud_tokens, restore_cloud_access_token,
        restore_cloud_refresh_token, store_cloud_access_token, store_cloud_refresh_token,
        validate_api_base_url, CreditBalanceResponse, UserProfile,
    };
    use crate::sys::api::HttpMethod;
    use crate::sys::security::SecretManager;
    use rusqlite::Connection;
    use std::sync::{Arc, Mutex};

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
    fn cloud_access_token_survives_memory_boundary_in_encrypted_storage() {
        let manager = secret_manager();
        let token = "eyJhbGciOiJub25lIn0.eyJzdWIiOiJ1c2VyXzEyMyJ9.signature";

        assert_eq!(restore_cloud_access_token(&manager).unwrap(), None);
        store_cloud_access_token(&manager, token).unwrap();
        assert_eq!(
            restore_cloud_access_token(&manager).unwrap().as_deref(),
            Some(token)
        );

        clear_cloud_tokens(&manager).unwrap();
        assert_eq!(restore_cloud_access_token(&manager).unwrap(), None);
    }

    #[test]
    fn cloud_refresh_token_survives_memory_boundary_in_encrypted_storage() {
        let manager = secret_manager();
        let token = "opaque-refresh-token-with-sufficient-randomness";

        assert_eq!(restore_cloud_refresh_token(&manager).unwrap(), None);
        store_cloud_refresh_token(&manager, token).unwrap();
        assert_eq!(
            restore_cloud_refresh_token(&manager).unwrap().as_deref(),
            Some(token)
        );

        clear_cloud_tokens(&manager).unwrap();
        assert_eq!(restore_cloud_refresh_token(&manager).unwrap(), None);
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
    fn allows_agiworkforce_apex_subdomains_and_loopback() {
        assert!(validate_api_base_url("https://agiworkforce.com").is_ok());
        assert!(validate_api_base_url("https://www.agiworkforce.com").is_ok());
        assert!(validate_api_base_url("https://api.agiworkforce.com").is_ok());
        assert!(validate_api_base_url("http://localhost").is_ok());
        assert!(validate_api_base_url("http://127.0.0.1").is_ok());
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
    fn parses_percentage_only_managed_usage_balance() {
        let response: CreditBalanceResponse = serde_json::from_str(
            r#"{
                "object":"credit_balance",
                "subscription":{"plan_tier":"pro","status":"active","current_period_end":null},
                "credits":{
                    "usage_percentage":42.5,
                    "reset_at":"2026-08-01T00:00:00.000Z",
                    "seconds_until_reset":86400,
                    "has_usage_remaining":true
                }
            }"#,
        )
        .expect("public balance contract should deserialize");

        assert!(response.has_credits());
        assert_eq!(response.credits.usage_percentage, 42.5);
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
}
