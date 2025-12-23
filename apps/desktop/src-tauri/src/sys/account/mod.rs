use crate::sys::api::{ApiRequest, AuthType, HttpMethod};
use crate::sys::commands::ApiState;
use serde::{Deserialize, Serialize};
use tauri::State;

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
    pub status: String,
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
    let api_base =
        std::env::var("AGI_API_URL").unwrap_or_else(|_| "https://api.agiworkforce.com".to_string());

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
    let api_base =
        std::env::var("AGI_API_URL").unwrap_or_else(|_| "https://api.agiworkforce.com".to_string());

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

    if let Some(token) = &resp.access_token {
        if let Err(e) = store_access_token(token) {
            eprintln!("Failed to securely store token: {}", e);
        }
    }

    if let Some(refresh_token) = &resp.refresh_token {
        if let Err(e) = store_refresh_token(refresh_token) {
            eprintln!("Failed to securely store refresh token: {}", e);
        }
    }

    Ok(resp)
}

#[tauri::command]
pub async fn fetch_user_profile(
    access_token: String,
    state: State<'_, ApiState>,
) -> Result<UserProfile, String> {
    let api_base =
        std::env::var("AGI_API_URL").unwrap_or_else(|_| "https://api.agiworkforce.com".to_string());

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
    let api_base =
        std::env::var("AGI_API_URL").unwrap_or_else(|_| "https://api.agiworkforce.com".to_string());

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

    if let Some(new_token) = result.get("access_token").and_then(|t| t.as_str()) {
        if let Err(e) = store_access_token(new_token) {
            eprintln!("Failed to update stored token: {}", e);
        }
    }

    if let Some(new_refresh_token) = result.get("refresh_token").and_then(|t| t.as_str()) {
        if let Err(e) = store_refresh_token(new_refresh_token) {
            eprintln!("Failed to update stored refresh token: {}", e);
        }
    }

    Ok(result)
}

use keyring::Entry;

fn get_service() -> String {
    "AGI Workforce".to_string()
}

pub fn store_access_token(token: &str) -> Result<(), String> {
    let entry = Entry::new(&get_service(), "access_token").map_err(|e| e.to_string())?;
    entry.set_password(token).map_err(|e| e.to_string())
}

pub fn get_access_token() -> Result<String, String> {
    let entry = Entry::new(&get_service(), "access_token").map_err(|e| e.to_string())?;
    entry.get_password().map_err(|e| e.to_string())
}

pub fn delete_access_token() -> Result<(), String> {
    let entry = Entry::new(&get_service(), "access_token").map_err(|e| e.to_string())?;
    entry.delete_password().map_err(|e| e.to_string())
}

pub fn store_refresh_token(token: &str) -> Result<(), String> {
    let entry = Entry::new(&get_service(), "refresh_token").map_err(|e| e.to_string())?;
    entry.set_password(token).map_err(|e| e.to_string())
}

pub fn get_refresh_token() -> Result<String, String> {
    let entry = Entry::new(&get_service(), "refresh_token").map_err(|e| e.to_string())?;
    entry.get_password().map_err(|e| e.to_string())
}

pub fn delete_refresh_token() -> Result<(), String> {
    let entry = Entry::new(&get_service(), "refresh_token").map_err(|e| e.to_string())?;
    entry.delete_password().map_err(|e| e.to_string())
}
