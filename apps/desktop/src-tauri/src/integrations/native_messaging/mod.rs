//! Chrome Native Messaging Host
//!
//! Implements the Chrome Native Messaging protocol to enable
//! bidirectional communication between the desktop app and browser extension.
//!
//! Protocol: https://developer.chrome.com/docs/extensions/develop/concepts/native-messaging

use anyhow::{anyhow, Result};
use serde::{Deserialize, Serialize};
use std::io::{Read, Write};
use std::sync::Arc;
use tokio::sync::RwLock;

pub mod host;
pub mod manifest;
pub mod messages;

/// Native messaging message types
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(tag = "type", rename_all = "snake_case")]
pub enum NativeMessage {
    // Connection management
    Connect {
        extension_id: String,
    },
    Disconnect {
        reason: Option<String>,
    },
    Ping,
    Pong,

    // Browser automation commands
    Click {
        selector: String,
        tab_id: Option<i32>,
    },
    Type {
        selector: String,
        text: String,
        tab_id: Option<i32>,
    },
    Navigate {
        url: String,
        tab_id: Option<i32>,
    },
    Screenshot {
        tab_id: Option<i32>,
        format: Option<String>,
    },

    // DOM operations
    GetElement {
        selector: String,
        tab_id: Option<i32>,
    },
    GetElements {
        selector: String,
        tab_id: Option<i32>,
    },
    GetText {
        selector: String,
        tab_id: Option<i32>,
    },
    GetAttribute {
        selector: String,
        attribute: String,
        tab_id: Option<i32>,
    },
    SetAttribute {
        selector: String,
        attribute: String,
        value: String,
        tab_id: Option<i32>,
    },

    // Accessibility tree
    GetAccessibilityTree {
        tab_id: Option<i32>,
    },
    GetFocusableElements {
        tab_id: Option<i32>,
    },

    // Tab management
    GetTabs,
    GetActiveTab,
    CreateTab {
        url: String,
    },
    CloseTab {
        tab_id: i32,
    },
    SwitchTab {
        tab_id: i32,
    },

    // Cookies and storage
    GetCookies {
        url: Option<String>,
    },
    SetCookie {
        cookie: CookieData,
    },
    GetLocalStorage {
        key: Option<String>,
        tab_id: Option<i32>,
    },
    SetLocalStorage {
        key: String,
        value: String,
        tab_id: Option<i32>,
    },

    // Page info
    GetPageInfo {
        tab_id: Option<i32>,
    },
    GetPageContent {
        tab_id: Option<i32>,
    },
    PageContext {
        url: String,
        title: String,
        html: String,
        selected_text: Option<String>,
        tab_id: i32,
        timestamp: u64,
    },
    TaskResult {
        task_id: String,
        success: bool,
        screenshot: Option<String>,
        result: Option<serde_json::Value>,
        error: Option<String>,
        actions_performed: u32,
        duration: u64,
    },

    // Script execution (controlled)
    ExecuteScript {
        script: String,
        tab_id: Option<i32>,
    },

    // Response messages
    Response {
        id: String,
        success: bool,
        data: Option<serde_json::Value>,
        error: Option<String>,
    },
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CookieData {
    pub name: String,
    pub value: String,
    pub domain: Option<String>,
    pub path: Option<String>,
    pub secure: Option<bool>,
    pub http_only: Option<bool>,
    pub expires: Option<i64>,
}

/// Native messaging request wrapper
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct NativeRequest {
    pub id: String,
    pub message: NativeMessage,
}

/// Native messaging response wrapper
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct NativeResponse {
    pub id: String,
    pub success: bool,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub data: Option<serde_json::Value>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub error: Option<String>,
}

impl NativeResponse {
    pub fn success(id: String, data: impl Serialize) -> Self {
        Self {
            id,
            success: true,
            data: serde_json::to_value(data).ok(),
            error: None,
        }
    }

    pub fn error(id: String, error: impl ToString) -> Self {
        Self {
            id,
            success: false,
            data: None,
            error: Some(error.to_string()),
        }
    }
}

/// Connection state for native messaging
#[derive(Debug, Clone, PartialEq, Eq)]
pub enum ConnectionState {
    Disconnected,
    Connecting,
    Connected,
    Error(String),
}

/// Native messaging service state
pub struct NativeMessagingState {
    pub connection_state: ConnectionState,
    pub extension_id: Option<String>,
    pub pending_requests:
        std::collections::HashMap<String, tokio::sync::oneshot::Sender<NativeResponse>>,
}

impl NativeMessagingState {
    pub fn new() -> Self {
        Self {
            connection_state: ConnectionState::Disconnected,
            extension_id: None,
            pending_requests: std::collections::HashMap::new(),
        }
    }
}

impl Default for NativeMessagingState {
    fn default() -> Self {
        Self::new()
    }
}

/// Read a native messaging message from stdin
/// Format: 4-byte little-endian length prefix + JSON message
pub fn read_message<R: Read>(reader: &mut R) -> Result<NativeRequest> {
    // Read 4-byte length prefix (little-endian)
    let mut len_bytes = [0u8; 4];
    reader
        .read_exact(&mut len_bytes)
        .map_err(|e| anyhow!("Failed to read message length: {}", e))?;

    let length = u32::from_le_bytes(len_bytes) as usize;

    if length > 1024 * 1024 {
        return Err(anyhow!("Message too large: {} bytes", length));
    }

    // Read the JSON message
    let mut buffer = vec![0u8; length];
    reader
        .read_exact(&mut buffer)
        .map_err(|e| anyhow!("Failed to read message body: {}", e))?;

    let message: NativeRequest =
        serde_json::from_slice(&buffer).map_err(|e| anyhow!("Failed to parse message: {}", e))?;

    Ok(message)
}

/// Write a native messaging message to stdout
/// Format: 4-byte little-endian length prefix + JSON message
pub fn write_message<W: Write>(writer: &mut W, response: &NativeResponse) -> Result<()> {
    let json =
        serde_json::to_vec(response).map_err(|e| anyhow!("Failed to serialize response: {}", e))?;

    let length = json.len() as u32;
    let len_bytes = length.to_le_bytes();

    writer
        .write_all(&len_bytes)
        .map_err(|e| anyhow!("Failed to write message length: {}", e))?;
    writer
        .write_all(&json)
        .map_err(|e| anyhow!("Failed to write message body: {}", e))?;
    writer
        .flush()
        .map_err(|e| anyhow!("Failed to flush: {}", e))?;

    Ok(())
}

/// Generate the native messaging host manifest for Chrome
pub fn generate_host_manifest(
    host_name: &str,
    description: &str,
    executable_path: &str,
    extension_ids: &[&str],
) -> serde_json::Value {
    serde_json::json!({
        "name": host_name,
        "description": description,
        "path": executable_path,
        "type": "stdio",
        "allowed_origins": extension_ids.iter()
            .map(|id| format!("chrome-extension://{}/", id))
            .collect::<Vec<_>>()
    })
}

/// Get the path where the native messaging host manifest should be installed
pub fn get_manifest_path(host_name: &str) -> Result<std::path::PathBuf> {
    #[cfg(target_os = "macos")]
    {
        let home =
            std::env::var("HOME").map_err(|_| anyhow!("HOME environment variable not set"))?;
        Ok(std::path::PathBuf::from(format!(
            "{}/Library/Application Support/Google/Chrome/NativeMessagingHosts/{}.json",
            home, host_name
        )))
    }

    #[cfg(target_os = "windows")]
    {
        Ok(std::path::PathBuf::from(format!(
            "HKEY_CURRENT_USER\\Software\\Google\\Chrome\\NativeMessagingHosts\\{}",
            host_name
        )))
    }

    #[cfg(target_os = "linux")]
    {
        let home =
            std::env::var("HOME").map_err(|_| anyhow!("HOME environment variable not set"))?;
        Ok(std::path::PathBuf::from(format!(
            "{}/.config/google-chrome/NativeMessagingHosts/{}.json",
            home, host_name
        )))
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_read_write_message() {
        let response =
            NativeResponse::success("test-123".to_string(), serde_json::json!({"result": "ok"}));

        let mut buffer = Vec::new();
        write_message(&mut buffer, &response).unwrap();

        // Verify we can read it back
        let json = serde_json::to_vec(&response).unwrap();
        let expected_len = json.len() as u32;
        let actual_len = u32::from_le_bytes([buffer[0], buffer[1], buffer[2], buffer[3]]);
        assert_eq!(expected_len, actual_len);
    }

    #[test]
    fn test_generate_manifest() {
        let manifest = generate_host_manifest(
            "com.agiworkforce.native",
            "AGI Workforce Native Host",
            "/usr/local/bin/agiworkforce-native",
            &["abcdefghijklmnopqrstuvwxyz123456"],
        );

        assert_eq!(manifest["name"], "com.agiworkforce.native");
        assert_eq!(manifest["type"], "stdio");
    }
}
