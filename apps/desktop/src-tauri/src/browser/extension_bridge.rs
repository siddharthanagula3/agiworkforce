use serde::{Deserialize, Serialize};
use std::sync::Arc;
use tokio::sync::Mutex;

use crate::error::{Error, Result};

/// Extension message types
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(tag = "type", rename_all = "snake_case")]
pub enum ExtensionMessage {
    /// Execute script in page context
    ExecuteScript { script: String },

    /// Get DOM element
    GetElement { selector: String },

    /// Click element
    Click { selector: String },

    /// Type text
    Type { selector: String, text: String },

    /// Get cookies
    GetCookies,

    /// Set cookie
    SetCookie {
        name: String,
        value: String,
        domain: String,
    },

    /// Clear cookies
    ClearCookies,

    /// Get local storage
    GetLocalStorage { key: Option<String> },

    /// Set local storage
    SetLocalStorage { key: String, value: String },

    /// Clear local storage
    ClearLocalStorage,

    /// Capture screenshot
    CaptureScreenshot { format: String, quality: u8 },
}

/// Extension response
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(tag = "status", rename_all = "snake_case")]
pub enum ExtensionResponse {
    Success { data: serde_json::Value },
    Error { message: String },
}

/// Cookie data
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Cookie {
    pub name: String,
    pub value: String,
    pub domain: String,
    pub path: String,
    pub expires: Option<i64>,
    pub secure: bool,
    pub http_only: bool,
    pub same_site: Option<String>,
}

/// Extension bridge for communicating with browser extension
pub struct ExtensionBridge {
    connected: Arc<Mutex<bool>>,
}

impl ExtensionBridge {
    /// Create a new extension bridge
    pub fn new() -> Self {
        Self {
            connected: Arc::new(Mutex::new(false)),
        }
    }

    /// Check if extension is connected
    pub async fn is_connected(&self) -> bool {
        *self.connected.lock().await
    }

    /// Connect to extension
    pub async fn connect(&self) -> Result<()> {
        tracing::info!("Connecting to browser extension");

        // In production, establish WebSocket or native messaging connection
        let mut connected = self.connected.lock().await;
        *connected = true;

        tracing::info!("Connected to browser extension");
        Ok(())
    }

    /// Disconnect from extension
    pub async fn disconnect(&self) -> Result<()> {
        tracing::info!("Disconnecting from browser extension");

        let mut connected = self.connected.lock().await;
        *connected = false;

        tracing::info!("Disconnected from browser extension");
        Ok(())
    }

    /// Send message to extension
    pub async fn send_message(&self, message: ExtensionMessage) -> Result<ExtensionResponse> {
        if !self.is_connected().await {
            return Err(Error::Generic("Extension not connected".to_string()));
        }

        tracing::debug!("Sending message to extension: {:?}", message);

        // In production, serialize and send via WebSocket/native messaging
        let response = ExtensionResponse::Success {
            data: serde_json::json!({"result": "ok"}),
        };

        tracing::debug!("Received response from extension: {:?}", response);
        Ok(response)
    }

    /// Execute script in page context
    pub async fn execute_script(&self, script: &str) -> Result<serde_json::Value> {
        let message = ExtensionMessage::ExecuteScript {
            script: script.to_string(),
        };

        let response = self.send_message(message).await?;

        match response {
            ExtensionResponse::Success { data } => Ok(data),
            ExtensionResponse::Error { message } => Err(Error::Generic(message)),
        }
    }

    /// Get all cookies
    pub async fn get_cookies(&self) -> Result<Vec<Cookie>> {
        let message = ExtensionMessage::GetCookies;
        let response = self.send_message(message).await?;

        match response {
            ExtensionResponse::Success { data } => {
                let cookies: Vec<Cookie> = serde_json::from_value(data).map_err(Error::from)?;
                Ok(cookies)
            }
            ExtensionResponse::Error { message } => Err(Error::Generic(message)),
        }
    }

    /// Set a cookie
    pub async fn set_cookie(&self, name: &str, value: &str, domain: &str) -> Result<()> {
        let message = ExtensionMessage::SetCookie {
            name: name.to_string(),
            value: value.to_string(),
            domain: domain.to_string(),
        };

        let response = self.send_message(message).await?;

        match response {
            ExtensionResponse::Success { .. } => Ok(()),
            ExtensionResponse::Error { message } => Err(Error::Generic(message)),
        }
    }

    /// Clear all cookies
    pub async fn clear_cookies(&self) -> Result<()> {
        let message = ExtensionMessage::ClearCookies;
        let response = self.send_message(message).await?;

        match response {
            ExtensionResponse::Success { .. } => Ok(()),
            ExtensionResponse::Error { message } => Err(Error::Generic(message)),
        }
    }

    /// Get local storage value
    pub async fn get_local_storage(&self, key: Option<&str>) -> Result<serde_json::Value> {
        let message = ExtensionMessage::GetLocalStorage {
            key: key.map(|s| s.to_string()),
        };

        let response = self.send_message(message).await?;

        match response {
            ExtensionResponse::Success { data } => Ok(data),
            ExtensionResponse::Error { message } => Err(Error::Generic(message)),
        }
    }

    /// Set local storage value
    pub async fn set_local_storage(&self, key: &str, value: &str) -> Result<()> {
        let message = ExtensionMessage::SetLocalStorage {
            key: key.to_string(),
            value: value.to_string(),
        };

        let response = self.send_message(message).await?;

        match response {
            ExtensionResponse::Success { .. } => Ok(()),
            ExtensionResponse::Error { message } => Err(Error::Generic(message)),
        }
    }

    /// Clear local storage
    pub async fn clear_local_storage(&self) -> Result<()> {
        let message = ExtensionMessage::ClearLocalStorage;
        let response = self.send_message(message).await?;

        match response {
            ExtensionResponse::Success { .. } => Ok(()),
            ExtensionResponse::Error { message } => Err(Error::Generic(message)),
        }
    }

    /// Capture screenshot via extension
    pub async fn capture_screenshot(&self, format: &str, quality: u8) -> Result<Vec<u8>> {
        let message = ExtensionMessage::CaptureScreenshot {
            format: format.to_string(),
            quality,
        };

        let response = self.send_message(message).await?;

        match response {
            ExtensionResponse::Success { data: _ } => {
                // In production, decode base64 screenshot data
                Ok(vec![]) // Placeholder
            }
            ExtensionResponse::Error { message } => Err(Error::Other(message)),
        }
    }
}

impl Default for ExtensionBridge {
    fn default() -> Self {
        Self::new()
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[tokio::test]
    async fn test_extension_bridge_creation() {
        let bridge = ExtensionBridge::new();
        assert!(!bridge.is_connected().await);
    }

    #[tokio::test]
    async fn test_extension_connect() {
        let bridge = ExtensionBridge::new();
        let result = bridge.connect().await;
        assert!(result.is_ok());
        assert!(bridge.is_connected().await);
    }

    #[tokio::test]
    async fn test_extension_disconnect() {
        let bridge = ExtensionBridge::new();
        bridge.connect().await.unwrap();
        let result = bridge.disconnect().await;
        assert!(result.is_ok());
        assert!(!bridge.is_connected().await);
    }
}
