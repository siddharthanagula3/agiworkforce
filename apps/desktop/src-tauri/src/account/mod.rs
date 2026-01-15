// Account Module
//
// This module contains Tauri commands for:
// - User authentication (device linking, OAuth)
// - User profile management
// - Subscription/plan management
// - Billing information
//
// See: docs/ACCOUNT_INTEGRATION.md for implementation details

use crate::api::{ApiRequest, AuthType, HttpMethod};
use crate::commands::ApiState;
use serde::{Deserialize, Serialize};
use tauri::State;

// ============================================================================
// Types (matching TypeScript interfaces)
// ============================================================================

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct DeviceLinkRequest {
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
    pub status: String, // "pending" | "approved" | "denied" | "expired"
    pub access_token: Option<String>,
    pub refresh_token: Option<String>,
    pub user: Option<UserProfile>,
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
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct PlanInfo {
    pub tier: String, // "free" | "pro" | "enterprise"
    pub display_name: String,
    pub status: String, // "active" | "trialing" | "past_due" | "canceled" | "none"
    pub current_period_end: Option<u64>,
}

// ============================================================================
// Tauri Commands
// ============================================================================

/// Initiate device linking flow
#[tauri::command]
pub async fn device_link_initiate(
    request: DeviceLinkRequest,
    state: State<'_, ApiState>,
) -> Result<DeviceLinkResponse, String> {
    let api_base =
        std::env::var("AGI_API_URL").unwrap_or_else(|_| "https://www.agiworkforce.com".to_string());
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
        .map_err(|e| format!("Device link request failed: {}", e))?; // ApiClient::execute already returns string error description in some way, but here it returns crate::error::Result. I need to map it.

    // Correct error mapping
    // But wait, ApiClient returns crate::error::Result<ApiResponse>.
    // Result::map_err(|e| format!("Device link request failed: {}", e)) should work as Error implements Display.

    if !response.success {
        return Err(format!("API error {}: {}", response.status, response.body));
    }

    serde_json::from_str(&response.body).map_err(|e| format!("Failed to parse response: {}", e))
}

/// Poll for device link completion
#[tauri::command]
pub async fn device_link_poll(
    request: DevicePollRequest,
    state: State<'_, ApiState>,
) -> Result<DevicePollResponse, String> {
    let api_base =
        std::env::var("AGI_API_URL").unwrap_or_else(|_| "https://www.agiworkforce.com".to_string());
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

    // Auto-save token if present
    if let Some(token) = &resp.access_token {
        if let Err(e) = store_access_token(token) {
            eprintln!("Failed to securely store token: {}", e);
        }
    }

    // Also save refresh token if present
    if let Some(refresh_token) = &resp.refresh_token {
        if let Err(e) = store_refresh_token(refresh_token) {
            eprintln!("Failed to securely store refresh token: {}", e);
        }
    }

    Ok(resp)
}

/// Fetch user profile from backend
#[tauri::command]
pub async fn fetch_user_profile(
    access_token: String,
    state: State<'_, ApiState>,
) -> Result<UserProfile, String> {
    let api_base =
        std::env::var("AGI_API_URL").unwrap_or_else(|_| "https://www.agiworkforce.com".to_string());
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

/// Refresh OAuth access token
#[tauri::command]
pub async fn oauth_refresh(
    refresh_token: String,
    state: State<'_, ApiState>,
) -> Result<serde_json::Value, String> {
    let api_base =
        std::env::var("AGI_API_URL").unwrap_or_else(|_| "https://www.agiworkforce.com".to_string());
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

    // Update stored token if new one provided
    if let Some(new_token) = result.get("access_token").and_then(|t| t.as_str()) {
        if let Err(e) = store_access_token(new_token) {
            eprintln!("Failed to update stored token: {}", e);
        }
    }

    // Update stored refresh token if new one provided
    if let Some(new_refresh_token) = result.get("refresh_token").and_then(|t| t.as_str()) {
        if let Err(e) = store_refresh_token(new_refresh_token) {
            eprintln!("Failed to update stored refresh token: {}", e);
        }
    }

    Ok(result)
}

// ============================================================================
// Token Storage Implementation (In-Memory)
// ============================================================================

use std::sync::RwLock;

// In-memory token storage for the Rust backend
// This avoids keyring permission prompts while still allowing Rust to make API calls
static ACCESS_TOKEN: RwLock<Option<String>> = RwLock::new(None);
static REFRESH_TOKEN: RwLock<Option<String>> = RwLock::new(None);

/// Store access token in memory
pub fn store_access_token(token: &str) -> Result<(), String> {
    let mut access = ACCESS_TOKEN.write().map_err(|e| e.to_string())?;
    *access = Some(token.to_string());
    Ok(())
}

/// Retrieve access token from memory
pub fn get_access_token() -> Result<String, String> {
    let access = ACCESS_TOKEN.read().map_err(|e| e.to_string())?;
    access
        .clone()
        .ok_or_else(|| "No access token stored. Please sign in.".to_string())
}

/// Delete access token from memory
pub fn delete_access_token() -> Result<(), String> {
    let mut access = ACCESS_TOKEN.write().map_err(|e| e.to_string())?;
    *access = None;
    Ok(())
}

/// Store refresh token in memory
pub fn store_refresh_token(token: &str) -> Result<(), String> {
    let mut refresh = REFRESH_TOKEN.write().map_err(|e| e.to_string())?;
    *refresh = Some(token.to_string());
    Ok(())
}

/// Retrieve refresh token from memory
pub fn get_refresh_token() -> Result<String, String> {
    let refresh = REFRESH_TOKEN.read().map_err(|e| e.to_string())?;
    refresh
        .clone()
        .ok_or_else(|| "No refresh token stored. Please sign in.".to_string())
}

/// Delete refresh token from memory
pub fn delete_refresh_token() -> Result<(), String> {
    let mut refresh = REFRESH_TOKEN.write().map_err(|e| e.to_string())?;
    *refresh = None;
    Ok(())
}

/// Clear all stored tokens (called on logout)
pub fn clear_tokens() -> Result<(), String> {
    delete_access_token()?;
    delete_refresh_token()?;
    Ok(())
}
