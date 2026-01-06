//! Native Messaging Tauri Commands
//!
//! Provides commands for managing Chrome Native Messaging host connection
//! and browser automation through the extension.

use crate::integrations::native_messaging::{
    manifest::{
        get_chrome_native_messaging_dir, get_edge_native_messaging_dir, install_manifests,
        is_native_messaging_installed, uninstall_manifests,
    },
    messages::TabInfo,
    ConnectionState, NativeMessagingState,
};
use serde::{Deserialize, Serialize};
use std::sync::Arc;
use tauri::State;
use tokio::sync::RwLock;

/// State wrapper for native messaging
pub struct NativeMessagingStateWrapper {
    pub state: Arc<RwLock<NativeMessagingState>>,
    pub extension_id: Arc<RwLock<Option<String>>>,
}

impl NativeMessagingStateWrapper {
    pub fn new() -> Self {
        Self {
            state: Arc::new(RwLock::new(NativeMessagingState::new())),
            extension_id: Arc::new(RwLock::new(None)),
        }
    }
}

impl Default for NativeMessagingStateWrapper {
    fn default() -> Self {
        Self::new()
    }
}

/// Native messaging installation status
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct NativeMessagingStatus {
    pub installed: bool,
    pub chrome_path: Option<String>,
    pub edge_path: Option<String>,
    pub extension_id: Option<String>,
    pub connection_state: String,
}

/// Browser tab information for frontend
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct BrowserTab {
    pub id: i32,
    pub url: String,
    pub title: String,
    pub active: bool,
    pub window_id: i32,
    pub favicon_url: Option<String>,
}

/// Browser action request
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct BrowserActionRequest {
    pub action: String,
    pub selector: Option<String>,
    pub text: Option<String>,
    pub url: Option<String>,
    pub tab_id: Option<i32>,
    pub x: Option<f64>,
    pub y: Option<f64>,
}

/// Browser action response
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct BrowserActionResponse {
    pub success: bool,
    pub data: Option<serde_json::Value>,
    pub error: Option<String>,
}

/// Check if native messaging is installed
#[tauri::command]
pub async fn native_messaging_check_status(
    state: State<'_, NativeMessagingStateWrapper>,
) -> Result<NativeMessagingStatus, String> {
    let installed = is_native_messaging_installed();

    let chrome_path = get_chrome_native_messaging_dir()
        .ok()
        .map(|p| p.to_string_lossy().to_string());

    let edge_path = get_edge_native_messaging_dir()
        .ok()
        .map(|p| p.to_string_lossy().to_string());

    let extension_id = state.extension_id.read().await.clone();

    let nm_state = state.state.read().await;
    let connection_state = match &nm_state.connection_state {
        ConnectionState::Disconnected => "disconnected".to_string(),
        ConnectionState::Connecting => "connecting".to_string(),
        ConnectionState::Connected => "connected".to_string(),
        ConnectionState::Error(e) => format!("error: {}", e),
    };

    Ok(NativeMessagingStatus {
        installed,
        chrome_path,
        edge_path,
        extension_id,
        connection_state,
    })
}

/// Install native messaging manifests
#[tauri::command]
pub async fn native_messaging_install(
    extension_id: Option<String>,
    state: State<'_, NativeMessagingStateWrapper>,
) -> Result<Vec<String>, String> {
    tracing::info!("Installing native messaging manifests");

    // Store extension ID if provided
    if let Some(ext_id) = &extension_id {
        *state.extension_id.write().await = Some(ext_id.clone());
    }

    let paths = install_manifests(extension_id.as_deref())
        .map_err(|e| format!("Failed to install manifests: {}", e))?;

    Ok(paths
        .into_iter()
        .map(|p| p.to_string_lossy().to_string())
        .collect())
}

/// Uninstall native messaging manifests
#[tauri::command]
pub async fn native_messaging_uninstall() -> Result<(), String> {
    tracing::info!("Uninstalling native messaging manifests");

    uninstall_manifests().map_err(|e| format!("Failed to uninstall manifests: {}", e))
}

/// Set extension ID for native messaging
#[tauri::command]
pub async fn native_messaging_set_extension_id(
    extension_id: String,
    state: State<'_, NativeMessagingStateWrapper>,
) -> Result<(), String> {
    tracing::info!("Setting extension ID: {}", extension_id);
    *state.extension_id.write().await = Some(extension_id);
    Ok(())
}

/// Get connection state
#[tauri::command]
pub async fn native_messaging_get_connection_state(
    state: State<'_, NativeMessagingStateWrapper>,
) -> Result<String, String> {
    let nm_state = state.state.read().await;
    let conn_state = match &nm_state.connection_state {
        ConnectionState::Disconnected => "disconnected",
        ConnectionState::Connecting => "connecting",
        ConnectionState::Connected => "connected",
        ConnectionState::Error(_) => "error",
    };
    Ok(conn_state.to_string())
}

/// Convert TabInfo to BrowserTab
#[allow(dead_code)]
fn convert_tab_info(tab: &TabInfo) -> BrowserTab {
    BrowserTab {
        id: tab.id,
        url: tab.url.clone(),
        title: tab.title.clone(),
        active: tab.active,
        window_id: tab.window_id,
        favicon_url: tab.favicon_url.clone(),
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_native_messaging_state_wrapper_creation() {
        let wrapper = NativeMessagingStateWrapper::new();
        // Basic instantiation test - verify extension_id is None by default
        assert!(wrapper.extension_id.try_read().unwrap().is_none());
    }

    #[test]
    fn test_browser_action_request_serialization() {
        let request = BrowserActionRequest {
            action: "click".to_string(),
            selector: Some("#button".to_string()),
            text: None,
            url: None,
            tab_id: Some(1),
            x: None,
            y: None,
        };

        let json = serde_json::to_string(&request).unwrap();
        assert!(json.contains("click"));
        assert!(json.contains("#button"));
    }
}
