// Account Module - Placeholder for future web backend integration
//
// This module will contain Tauri commands for:
// - User authentication (device linking, OAuth)
// - User profile management
// - Subscription/plan management
// - Billing information
//
// See: docs/ACCOUNT_INTEGRATION.md for implementation details
//
// TODO: Implement actual HTTP client for AGI Workforce API
// TODO: Implement device linking flow
// TODO: Implement token storage with Windows Credential Manager
// TODO: Implement automatic token refresh

use serde::{Deserialize, Serialize};

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
// Placeholder Tauri Commands
// ============================================================================

/// Initiate device linking flow
#[tauri::command]
pub async fn device_link_initiate(
    request: DeviceLinkRequest,
) -> Result<DeviceLinkResponse, String> {
    let api_base =
        std::env::var("AGI_API_URL").unwrap_or_else(|_| "https://api.agiworkforce.com".to_string());

    let client = reqwest::Client::builder()
        .timeout(std::time::Duration::from_secs(30))
        .build()
        .map_err(|e| format!("Failed to create HTTP client: {}", e))?;

    let response = client
        .post(format!("{}/api/device/link", api_base))
        .header("Content-Type", "application/json")
        .json(&request)
        .send()
        .await
        .map_err(|e| format!("Device link request failed: {}", e))?;

    if !response.status().is_success() {
        let status = response.status();
        let error_text = response.text().await.unwrap_or_default();
        return Err(format!("API error {}: {}", status, error_text));
    }

    response
        .json::<DeviceLinkResponse>()
        .await
        .map_err(|e| format!("Failed to parse response: {}", e))
}

/// Poll for device link completion
#[tauri::command]
pub async fn device_link_poll(request: DevicePollRequest) -> Result<DevicePollResponse, String> {
    let api_base =
        std::env::var("AGI_API_URL").unwrap_or_else(|_| "https://api.agiworkforce.com".to_string());

    let client = reqwest::Client::builder()
        .timeout(std::time::Duration::from_secs(30))
        .build()
        .map_err(|e| format!("Failed to create HTTP client: {}", e))?;

    let response = client
        .post(format!("{}/api/device/poll", api_base))
        .header("Content-Type", "application/json")
        .json(&request)
        .send()
        .await
        .map_err(|e| format!("Device poll request failed: {}", e))?;

    if !response.status().is_success() {
        let status = response.status();
        let error_text = response.text().await.unwrap_or_default();
        return Err(format!("API error {}: {}", status, error_text));
    }

    response
        .json::<DevicePollResponse>()
        .await
        .map_err(|e| format!("Failed to parse response: {}", e))
}

/// Fetch user profile from backend
#[tauri::command]
pub async fn fetch_user_profile(access_token: String) -> Result<UserProfile, String> {
    let api_base =
        std::env::var("AGI_API_URL").unwrap_or_else(|_| "https://api.agiworkforce.com".to_string());

    let client = reqwest::Client::builder()
        .timeout(std::time::Duration::from_secs(30))
        .build()
        .map_err(|e| format!("Failed to create HTTP client: {}", e))?;

    let response = client
        .get(format!("{}/api/me", api_base))
        .header("Authorization", format!("Bearer {}", access_token))
        .send()
        .await
        .map_err(|e| format!("Profile fetch failed: {}", e))?;

    if !response.status().is_success() {
        let status = response.status();
        let error_text = response.text().await.unwrap_or_default();
        return Err(format!("API error {}: {}", status, error_text));
    }

    response
        .json::<UserProfile>()
        .await
        .map_err(|e| format!("Failed to parse response: {}", e))
}

/// Refresh OAuth access token
#[tauri::command]
pub async fn oauth_refresh(refresh_token: String) -> Result<serde_json::Value, String> {
    let api_base =
        std::env::var("AGI_API_URL").unwrap_or_else(|_| "https://api.agiworkforce.com".to_string());

    let client = reqwest::Client::builder()
        .timeout(std::time::Duration::from_secs(30))
        .build()
        .map_err(|e| format!("Failed to create HTTP client: {}", e))?;

    let response = client
        .post(format!("{}/oauth/refresh", api_base))
        .header("Content-Type", "application/json")
        .json(&serde_json::json!({ "refresh_token": refresh_token }))
        .send()
        .await
        .map_err(|e| format!("Token refresh failed: {}", e))?;

    if !response.status().is_success() {
        let status = response.status();
        let error_text = response.text().await.unwrap_or_default();
        return Err(format!("API error {}: {}", status, error_text));
    }

    response
        .json::<serde_json::Value>()
        .await
        .map_err(|e| format!("Failed to parse response: {}", e))
}

// ============================================================================
// Token Storage (to be implemented)
// ============================================================================

// TODO: Implement secure token storage using Windows Credential Manager
// Example:
//
// use keyring::Entry;
//
// pub fn store_access_token(token: &str) -> Result<(), String> {
//     let entry = Entry::new("AGI Workforce", "access_token")
//         .map_err(|e| e.to_string())?;
//     entry.set_password(token).map_err(|e| e.to_string())
// }
//
// pub fn get_access_token() -> Result<String, String> {
//     let entry = Entry::new("AGI Workforce", "access_token")
//         .map_err(|e| e.to_string())?;
//     entry.get_password().map_err(|e| e.to_string())
// }
//
// pub fn delete_access_token() -> Result<(), String> {
//     let entry = Entry::new("AGI Workforce", "access_token")
//         .map_err(|e| e.to_string())?;
//     entry.delete_password().map_err(|e| e.to_string())
// }
