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
///
/// TODO: Implement actual HTTP request to AGI Workforce API
#[tauri::command]
pub async fn device_link_initiate(
    _request: DeviceLinkRequest,
) -> Result<DeviceLinkResponse, String> {
    // TODO: POST to https://api.agiworkforce.com/api/device/link
    // TODO: Return real link code and device ID

    Err("Device linking not yet implemented - requires web backend".to_string())

    // Example implementation:
    // let client = reqwest::Client::new();
    // let response = client
    //     .post("https://api.agiworkforce.com/api/device/link")
    //     .json(&request)
    //     .send()
    //     .await
    //     .map_err(|e| e.to_string())?;
    //
    // let link_response: DeviceLinkResponse = response
    //     .json()
    //     .await
    //     .map_err(|e| e.to_string())?;
    //
    // Ok(link_response)
}

/// Poll for device link completion
///
/// TODO: Implement actual HTTP request to AGI Workforce API
#[tauri::command]
pub async fn device_link_poll(_request: DevicePollRequest) -> Result<DevicePollResponse, String> {
    // TODO: POST to https://api.agiworkforce.com/api/device/poll
    // TODO: Return auth tokens if approved

    Err("Device link polling not yet implemented - requires web backend".to_string())
}

/// Fetch user profile from backend
///
/// TODO: Implement actual HTTP request to AGI Workforce API
#[tauri::command]
pub async fn fetch_user_profile(_access_token: String) -> Result<UserProfile, String> {
    // TODO: GET https://api.agiworkforce.com/api/me
    // TODO: Include Authorization: Bearer {access_token} header

    Err("User profile sync not yet implemented - requires web backend".to_string())
}

/// Refresh OAuth access token
///
/// TODO: Implement token refresh logic
#[tauri::command]
pub async fn oauth_refresh(_refresh_token: String) -> Result<serde_json::Value, String> {
    // TODO: POST to https://api.agiworkforce.com/oauth/refresh
    // TODO: Return new access_token and refresh_token

    Err("Token refresh not yet implemented - requires web backend".to_string())
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
