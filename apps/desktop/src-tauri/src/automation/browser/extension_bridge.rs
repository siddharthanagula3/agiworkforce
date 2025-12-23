use serde::{Deserialize, Serialize};
use std::sync::Arc;
use tokio::sync::Mutex;

use crate::sys::error::{Error, Result};

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(tag = "type", rename_all = "snake_case")]
pub enum ExtensionMessage {
    ExecuteScript {
        script: String,
    },

    GetElement {
        selector: String,
    },

    Click {
        selector: String,
    },

    Type {
        selector: String,
        text: String,
    },

    GetCookies,

    SetCookie {
        name: String,
        value: String,
        domain: String,
    },

    ClearCookies,

    GetLocalStorage {
        key: Option<String>,
    },

    SetLocalStorage {
        key: String,
        value: String,
    },

    ClearLocalStorage,

    CaptureScreenshot {
        format: String,
        quality: u8,
    },
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(tag = "status", rename_all = "snake_case")]
pub enum ExtensionResponse {
    Success { data: serde_json::Value },
    Error { message: String },
}

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

pub struct ExtensionBridge {
    connected: Arc<Mutex<bool>>,
}

impl ExtensionBridge {
    pub fn new() -> Self {
        Self {
            connected: Arc::new(Mutex::new(false)),
        }
    }

    pub async fn is_connected(&self) -> bool {
        *self.connected.lock().awai
    }

    pub async fn connect(&self) -> Result<()> {
        tracing::info!("Connecting to browser extension");

        let mut connected = self.connected.lock().await;
        *connected = true;

        tracing::info!("Connected to browser extension");
        Ok(())
    }

    pub async fn disconnect(&self) -> Result<()> {
        tracing::info!("Disconnecting from browser extension");

        let mut connected = self.connected.lock().await;
        *connected = false;

        tracing::info!("Disconnected from browser extension");
        Ok(())
    }

    pub async fn send_message(&self, message: ExtensionMessage) -> Result<ExtensionResponse> {
        if !self.is_connected().await {
            return Err(Error::Generic("Extension not connected".to_string()));
        }

        tracing::debug!("Sending message to extension: {:?}", message);

        let response = ExtensionResponse::Success {
            data: serde_json::json!({"result": "ok"}),
        };

        tracing::debug!("Received response from extension: {:?}", response);
        Ok(response)
    }

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

    pub async fn clear_cookies(&self) -> Result<()> {
        let message = ExtensionMessage::ClearCookies;
        let response = self.send_message(message).await?;

        match response {
            ExtensionResponse::Success { .. } => Ok(()),
            ExtensionResponse::Error { message } => Err(Error::Generic(message)),
        }
    }

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

    pub async fn clear_local_storage(&self) -> Result<()> {
        let message = ExtensionMessage::ClearLocalStorage;
        let response = self.send_message(message).await?;

        match response {
            ExtensionResponse::Success { .. } => Ok(()),
            ExtensionResponse::Error { message } => Err(Error::Generic(message)),
        }
    }

    pub async fn capture_screenshot(&self, format: &str, quality: u8) -> Result<Vec<u8>> {
        let message = ExtensionMessage::CaptureScreenshot {
            format: format.to_string(),
            quality,
        };

        let response = self.send_message(message).await?;

        match response {
            ExtensionResponse::Success { data: _ } => Ok(vec![]),
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
