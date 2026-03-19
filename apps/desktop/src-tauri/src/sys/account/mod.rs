use crate::sys::api::{ApiRequest, ApiResponse, AuthType, HttpMethod};
use crate::sys::commands::ApiState;
use serde::{de::DeserializeOwned, Deserialize, Serialize};
use tauri::State;

/// Deserialize a timestamp that may come as either an integer or floating point from the API.
/// Converts floating point timestamps to u64 by truncating the decimal portion.
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
             Check that your VITE_AGI_API_URL matches your Supabase project.",
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
    pub email: String,
    pub name: String,
    pub avatar_url: Option<String>,
    /// Timestamp - accepts both integer and floating point from API
    #[serde(deserialize_with = "deserialize_timestamp")]
    pub created_at: u64,
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

#[tauri::command]
pub async fn device_link_initiate(
    mut request: DeviceLinkRequest,
    state: State<'_, ApiState>,
) -> Result<DeviceLinkResponse, String> {
    request.device_fingerprint = Some(generate_device_fingerprint(&request.device_id));
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

#[tauri::command]
pub async fn device_link_poll(
    mut request: DevicePollRequest,
    state: State<'_, ApiState>,
) -> Result<DevicePollResponse, String> {
    request.device_fingerprint = Some(generate_device_fingerprint(&request.device_id));
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
    // and should update the Supabase session, which triggers auth_store_session.
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
            401 => " (Token may be expired or from a different Supabase project)",
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

#[tauri::command]
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

/// Get the API base URL for desktop -> backend calls.
///
/// Priority:
/// 1) In-memory override set by the frontend (best for local dev, where Vite reads `.env` but Rust does not)
/// 2) `AGI_API_URL` environment variable
/// 3) Production default
pub fn get_api_base_url() -> String {
    {
        let url = API_BASE_URL_OVERRIDE.read().unwrap_or_else(|poisoned| poisoned.into_inner());
        if let Some(value) = url.clone() {
            return value;
        }
    }

    let raw =
        std::env::var("AGI_API_URL").unwrap_or_else(|_| "https://www.agiworkforce.com".to_string());
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

    let is_localhost = matches!(host, "localhost" | "127.0.0.1" | "::1" | "[::1]" | "0.0.0.0");

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
    let allowed = is_localhost
        || host == "agiworkforce.com"
        || host.ends_with(".agiworkforce.com");

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

    let mut url = API_BASE_URL_OVERRIDE.write().unwrap_or_else(|poisoned| poisoned.into_inner());
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

/// Store access token from frontend (called when Supabase auth state changes)
#[tauri::command]
#[allow(non_snake_case)]
pub fn account_store_access_token(accessToken: String) -> Result<(), String> {
    validate_token_format(&accessToken, "Access token")?;
    let mut token = ACCESS_TOKEN.write().unwrap_or_else(|poisoned| poisoned.into_inner());
    *token = Some(accessToken);
    Ok(())
}

/// Store refresh token from frontend (called when Supabase auth state changes)
#[tauri::command]
#[allow(non_snake_case)]
pub fn account_store_refresh_token(refreshToken: String) -> Result<(), String> {
    validate_token_format(&refreshToken, "Refresh token")?;
    let mut token = REFRESH_TOKEN.write().unwrap_or_else(|poisoned| poisoned.into_inner());
    *token = Some(refreshToken);
    Ok(())
}

/// Clear stored tokens (called on logout)
#[tauri::command]
pub fn account_clear_tokens() -> Result<(), String> {
    {
        let mut token = ACCESS_TOKEN.write().unwrap_or_else(|poisoned| poisoned.into_inner());
        *token = None;
    }
    {
        let mut token = REFRESH_TOKEN.write().unwrap_or_else(|poisoned| poisoned.into_inner());
        *token = None;
    }
    Ok(())
}

// Helpers to get tokens from in-memory storage
pub fn get_access_token() -> Result<String, String> {
    let token = ACCESS_TOKEN.read().unwrap_or_else(|poisoned| poisoned.into_inner());
    token
        .clone()
        .ok_or_else(|| "No access token stored. Please sign in.".to_string())
}

pub fn get_refresh_token() -> Result<String, String> {
    let token = REFRESH_TOKEN.read().unwrap_or_else(|poisoned| poisoned.into_inner());
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
    pub monthly_allocated_cents: i32,
    pub monthly_remaining_cents: i32,
    pub monthly_used_cents: i32,
    pub monthly_reset_at: String,
    pub seconds_until_monthly_reset: i32,
    pub daily_limit_cents: i32,
    pub daily_used_cents: i32,
    pub daily_remaining_cents: i32,
    pub daily_reset_at: String,
    pub seconds_until_daily_reset: i32,
}

/// Formatted credits for display
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct FormattedCredits {
    pub monthly_remaining: String,
    pub monthly_allocated: String,
    pub daily_remaining: String,
    pub daily_limit: String,
}

/// Credit balance response from the API
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CreditBalanceResponse {
    pub object: String,
    pub subscription: SubscriptionInfo,
    pub credits: CreditsInfo,
    pub formatted: FormattedCredits,
}

impl CreditBalanceResponse {
    /// Helper method to check if user has credits available
    pub fn has_credits(&self) -> bool {
        self.credits.monthly_remaining_cents > 0 && self.credits.daily_remaining_cents > 0
    }
}

/// Fetch current credit balance from the API
#[tauri::command]
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
            401 => " (Token may be expired or from a different Supabase project)",
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

/// Deduct credits request
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct DeductCreditsRequest {
    pub amount_cents: i32,
    pub description: Option<String>,
    pub metadata: Option<serde_json::Value>,
}

/// Deduct credits response
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct DeductCreditsResponse {
    pub success: bool,
    pub remaining_cents: Option<i32>,
    pub error: Option<String>,
    pub code: Option<String>,
    pub daily_limit: Option<i32>,
    pub daily_used: Option<i32>,
    pub daily_remaining: Option<i32>,
    pub reset_in_hours: Option<f64>,
}

/// Report usage to the API (for manual credit deduction if needed)
#[tauri::command]
pub async fn report_llm_usage(
    amount_cents: i32,
    model: String,
    provider: String,
    input_tokens: Option<i32>,
    output_tokens: Option<i32>,
    state: State<'_, ApiState>,
) -> Result<DeductCreditsResponse, String> {
    // Validate amount_cents bounds
    if amount_cents <= 0 {
        return Err(format!(
            "amount_cents must be positive, got {}",
            amount_cents
        ));
    }
    if amount_cents > 100_000 {
        return Err(format!(
            "amount_cents exceeds maximum single deduction of $1000 (100000 cents), got {}",
            amount_cents
        ));
    }

    let token = get_access_token()?;
    let api_base = get_api_base_url();

    let url = format!("{}/api/llm/v1/credits/deduct", api_base);

    let request_body = serde_json::json!({
        "amount_cents": amount_cents,
        "description": format!("LLM usage: {}/{}", provider, model),
        "metadata": {
            "model": model,
            "provider": provider,
            "input_tokens": input_tokens,
            "output_tokens": output_tokens,
        }
    });

    let api_request = ApiRequest {
        method: HttpMethod::Post,
        url,
        body: Some(request_body.to_string()),
        auth: AuthType::Bearer { token },
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
        .map_err(|e| format!("Failed to report usage: {}", e))?;

    // 402 is expected when credits are exhausted
    if response.status == 402 {
        return parse_json_response(&response);
    }

    if !response.success {
        // Provide more context for common error codes
        let hint = match response.status {
            401 => " (Token may be expired or from a different Supabase project)",
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
/// Validates the `device_id` format (must be a 64-character hex SHA-256
/// digest) and returns `Ok(())`.  Once the backend API exposes a revocation
/// endpoint this will forward the call.
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

    // TODO: Forward to backend API when /api/devices/:id/revoke is available.
    Ok(())
}
