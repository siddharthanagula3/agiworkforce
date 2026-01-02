use crate::sys::api::{ApiRequest, AuthType, HttpMethod};
use crate::sys::commands::ApiState;
use serde::{Deserialize, Serialize};
use tauri::State;

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct DeviceLinkRequest {
    pub device_id: String,
    pub device_name: Option<String>,
    pub device_type: Option<String>,
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
    #[serde(skip_serializing_if = "Option::is_none")]
    pub allocated_cents: Option<i32>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub used_cents: Option<i32>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub remaining_cents: Option<i32>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub percentage_used: Option<f64>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct UserProfile {
    pub id: String,
    pub email: String,
    pub name: String,
    pub avatar_url: Option<String>,
    pub created_at: u64,
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
pub async fn device_link_initiate(
    request: DeviceLinkRequest,
    state: State<'_, ApiState>,
) -> Result<DeviceLinkResponse, String> {
    let api_base = std::env::var("AGI_API_URL").unwrap_or_else(|_| "https://api.agiworkforce.com".to_string());
    
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
        .client
        .execute(api_request)
        .await
        .map_err(|e| format!("Device link request failed: {}", e))?;

    if !response.success {
        return Err(format!("API error {}: {}", response.status, response.body));
    }

    serde_json::from_str(&response.body).map_err(|e| format!("Failed to parse response: {}", e))
}

#[tauri::command]
pub async fn device_link_poll(
    request: DevicePollRequest,
    state: State<'_, ApiState>,
) -> Result<DevicePollResponse, String> {
    let api_base = std::env::var("AGI_API_URL").unwrap_or_else(|_| "https://api.agiworkforce.com".to_string());

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
        .client
        .execute(api_request)
        .await
        .map_err(|e| format!("Device poll request failed: {}", e))?;

    if !response.success {
        return Err(format!("API error {}: {}", response.status, response.body));
    }

    let resp: DevicePollResponse = serde_json::from_str(&response.body)
        .map_err(|e| format!("Failed to parse response: {}", e))?;

    // Note: We no longer store tokens here. The frontend receives the response 
    // and should update the Supabase session, which triggers auth_store_session.

    Ok(resp)
}

#[tauri::command]
pub async fn fetch_user_profile(
    access_token: String,
    state: State<'_, ApiState>,
) -> Result<UserProfile, String> {
    let api_base = std::env::var("AGI_API_URL").unwrap_or_else(|_| "https://api.agiworkforce.com".to_string());

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
        .client
        .execute(api_request)
        .await
        .map_err(|e| format!("Profile fetch failed: {}", e))?;

    if !response.success {
        return Err(format!("API error {}: {}", response.status, response.body));
    }

    serde_json::from_str(&response.body).map_err(|e| format!("Failed to parse response: {}", e))
}

#[tauri::command]
pub async fn oauth_refresh(
    refresh_token: String,
    state: State<'_, ApiState>,
) -> Result<serde_json::Value, String> {
    let api_base = std::env::var("AGI_API_URL").unwrap_or_else(|_| "https://api.agiworkforce.com".to_string());

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
        .client
        .execute(api_request)
        .await
        .map_err(|e| format!("Token refresh failed: {}", e))?;

    if !response.success {
        return Err(format!("API error {}: {}", response.status, response.body));
    }

    let result: serde_json::Value = serde_json::from_str(&response.body)
        .map_err(|e| format!("Failed to parse response: {}", e))?;

    // Note: We no longer manually store tokens. Frontend should handle the result.

    Ok(result)
}

use keyring::Entry;

const SERVICE_NAME: &str = "AGI Workforce";
const SESSION_KEY: &str = "supabase_session";

// Helpers to get tokens from the main session storage
// This unifies storage with sys::commands::auth

pub fn get_access_token() -> Result<String, String> {
    let entry = Entry::new(SERVICE_NAME, SESSION_KEY).map_err(|e| e.to_string())?;
    let session_json = entry.get_password().map_err(|e| e.to_string())?;
    let session: serde_json::Value = serde_json::from_str(&session_json).map_err(|e| e.to_string())?;
    
    session["access_token"]
        .as_str()
        .map(|s| s.to_string())
        .ok_or_else(|| "No access_token found in session".to_string())
}

pub fn get_refresh_token() -> Result<String, String> {
    let entry = Entry::new(SERVICE_NAME, SESSION_KEY).map_err(|e| e.to_string())?;
    let session_json = entry.get_password().map_err(|e| e.to_string())?;
    let session: serde_json::Value = serde_json::from_str(&session_json).map_err(|e| e.to_string())?;

    session["refresh_token"]
        .as_str()
        .map(|s| s.to_string())
        .ok_or_else(|| "No refresh_token found in session".to_string())
}

/// Credit balance response from the API
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CreditBalanceResponse {
    pub has_credits: bool,
    pub account_id: Option<String>,
    pub credits_allocated_cents: i32,
    pub credits_used_cents: i32,
    pub credits_remaining_cents: i32,
    pub daily_limit_cents: i32,
    pub daily_used_cents: i32,
    pub daily_remaining_cents: i32,
    pub period_start: Option<String>,
    pub period_end: Option<String>,
    pub last_daily_reset_at: Option<String>,
}

/// Fetch current credit balance from the API
#[tauri::command]
pub async fn fetch_credit_balance(
    state: State<'_, ApiState>,
) -> Result<CreditBalanceResponse, String> {
    let token = get_access_token()?;
    let api_base = std::env::var("AGI_API_URL").unwrap_or_else(|_| "https://api.agiworkforce.com".to_string());

    let url = format!("{}/api/credits/balance", api_base);

    let api_request = ApiRequest {
        method: HttpMethod::Get,
        url,
        auth: AuthType::Bearer { token },
        ..Default::default()
    };

    let response = state
        .client
        .execute(api_request)
        .await
        .map_err(|e| format!("Failed to fetch credit balance: {}", e))?;

    if !response.success {
        return Err(format!("API error {}: {}", response.status, response.body));
    }

    serde_json::from_str(&response.body)
        .map_err(|e| format!("Failed to parse credit balance response: {}", e))
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
    let token = get_access_token()?;
    let api_base = std::env::var("AGI_API_URL").unwrap_or_else(|_| "https://api.agiworkforce.com".to_string());

    let url = format!("{}/api/credits/deduct", api_base);

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
        .client
        .execute(api_request)
        .await
        .map_err(|e| format!("Failed to report usage: {}", e))?;

    // 402 is expected when credits are exhausted
    if response.status == 402 {
        return serde_json::from_str(&response.body)
            .map_err(|e| format!("Failed to parse credit error response: {}", e));
    }

    if !response.success {
        return Err(format!("API error {}: {}", response.status, response.body));
    }

    serde_json::from_str(&response.body)
        .map_err(|e| format!("Failed to parse deduct credits response: {}", e))
}
