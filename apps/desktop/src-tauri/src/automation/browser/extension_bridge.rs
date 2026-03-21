use crate::integrations::realtime::RealtimeEvent;
use crate::sys::error::{Error, Result};
use base64::Engine;
use futures::{SinkExt, StreamExt};
use serde::{Deserialize, Serialize};
use serde_json::{json, Value};
use std::path::PathBuf;
use std::sync::Arc;
use tokio::sync::Mutex;
use tokio_tungstenite::{connect_async, tungstenite::Message};
use url::Url;

const REALTIME_URL: &str = "ws://127.0.0.1:8787";
const REALTIME_RESPONSE_TIMEOUT_MS: u64 = 15_000;
const REALTIME_AUTH_TIMEOUT_MS: u64 = 4_000;
const REALTIME_MAX_RETRIES: u32 = 3;
const REALTIME_RETRY_BASE_DELAY_MS: u64 = 250;
const EXT_BRIDGE_CONFIG_ERROR_PREFIX: &str = "extension_bridge_config_error:";
const EXT_BRIDGE_AUTH_ERROR_PREFIX: &str = "extension_bridge_auth_error:";
const EXT_BRIDGE_NATIVE_ERROR_PREFIX: &str = "native_response_error:";

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
    Navigate {
        url: String,
    },
    Hover {
        selector: String,
    },
    WaitForSelector {
        selector: String,
        timeout_ms: u64,
    },
    GetDomSnapshot,
    GetUrl,
    GetTitle,
    GetAttribute {
        selector: String,
        attribute: String,
    },
    SelectOption {
        selector: String,
        value: String,
    },
    SetChecked {
        selector: String,
        checked: bool,
    },
    Focus {
        selector: String,
    },
    ScrollIntoView {
        selector: String,
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
    DiscoverWebMCPTools,
    CallWebMCPTool {
        tool_name: String,
        arguments: Option<serde_json::Value>,
    },
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(tag = "status", rename_all = "snake_case")]
pub enum ExtensionResponse {
    Success { data: Value },
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
        *self.connected.lock().await
    }

    pub async fn connect(&self) -> Result<()> {
        tracing::info!("Connecting extension bridge");
        let mut connected = self.connected.lock().await;
        *connected = true;
        Ok(())
    }

    pub async fn disconnect(&self) -> Result<()> {
        tracing::info!("Disconnecting extension bridge");
        let mut connected = self.connected.lock().await;
        *connected = false;
        Ok(())
    }

    pub async fn send_message(&self, message: ExtensionMessage) -> Result<ExtensionResponse> {
        if !self.is_connected().await {
            self.connect().await?;
        }

        let payload = extension_message_to_native_payload(message)?;
        let response_data = send_native_message_via_realtime(payload).await?;
        Ok(ExtensionResponse::Success {
            data: response_data,
        })
    }

    pub async fn execute_script(&self, script: &str) -> Result<Value> {
        let response = self
            .send_message(ExtensionMessage::ExecuteScript {
                script: script.to_string(),
            })
            .await?;

        match response {
            ExtensionResponse::Success { data } => Ok(data.get("result").cloned().unwrap_or(data)),
            ExtensionResponse::Error { message } => Err(Error::Generic(message)),
        }
    }

    pub async fn get_cookies(&self) -> Result<Vec<Cookie>> {
        let response = self.send_message(ExtensionMessage::GetCookies).await?;

        match response {
            ExtensionResponse::Success { data } => {
                let cookie_value = data.get("cookies").cloned().unwrap_or(data);
                let cookies: Vec<Cookie> =
                    serde_json::from_value(cookie_value).map_err(Error::from)?;
                Ok(cookies)
            }
            ExtensionResponse::Error { message } => Err(Error::Generic(message)),
        }
    }

    pub async fn set_cookie(&self, name: &str, value: &str, domain: &str) -> Result<()> {
        let response = self
            .send_message(ExtensionMessage::SetCookie {
                name: name.to_string(),
                value: value.to_string(),
                domain: domain.to_string(),
            })
            .await?;

        match response {
            ExtensionResponse::Success { .. } => Ok(()),
            ExtensionResponse::Error { message } => Err(Error::Generic(message)),
        }
    }

    pub async fn clear_cookies(&self) -> Result<()> {
        let response = self.send_message(ExtensionMessage::ClearCookies).await?;

        match response {
            ExtensionResponse::Success { .. } => Ok(()),
            ExtensionResponse::Error { message } => Err(Error::Generic(message)),
        }
    }

    pub async fn get_local_storage(&self, key: Option<&str>) -> Result<Value> {
        let response = self
            .send_message(ExtensionMessage::GetLocalStorage {
                key: key.map(|value| value.to_string()),
            })
            .await?;

        match response {
            ExtensionResponse::Success { data } => Ok(data.get("result").cloned().unwrap_or(data)),
            ExtensionResponse::Error { message } => Err(Error::Generic(message)),
        }
    }

    pub async fn set_local_storage(&self, key: &str, value: &str) -> Result<()> {
        let response = self
            .send_message(ExtensionMessage::SetLocalStorage {
                key: key.to_string(),
                value: value.to_string(),
            })
            .await?;

        match response {
            ExtensionResponse::Success { .. } => Ok(()),
            ExtensionResponse::Error { message } => Err(Error::Generic(message)),
        }
    }

    pub async fn clear_local_storage(&self) -> Result<()> {
        let response = self
            .send_message(ExtensionMessage::ClearLocalStorage)
            .await?;

        match response {
            ExtensionResponse::Success { .. } => Ok(()),
            ExtensionResponse::Error { message } => Err(Error::Generic(message)),
        }
    }

    /// Navigate the active browser tab to a URL via the extension bridge.
    pub async fn navigate(&self, url: &str) -> Result<()> {
        let response = self
            .send_message(ExtensionMessage::Navigate {
                url: url.to_string(),
            })
            .await?;

        match response {
            ExtensionResponse::Success { .. } => Ok(()),
            ExtensionResponse::Error { message } => Err(Error::Generic(message)),
        }
    }

    /// Click an element identified by a CSS selector via the extension bridge.
    pub async fn click(&self, selector: &str) -> Result<()> {
        let response = self
            .send_message(ExtensionMessage::Click {
                selector: selector.to_string(),
            })
            .await?;

        match response {
            ExtensionResponse::Success { .. } => Ok(()),
            ExtensionResponse::Error { message } => Err(Error::Generic(message)),
        }
    }

    /// Type text into an element identified by a CSS selector via the extension bridge.
    pub async fn type_text(&self, selector: &str, text: &str) -> Result<()> {
        let response = self
            .send_message(ExtensionMessage::Type {
                selector: selector.to_string(),
                text: text.to_string(),
            })
            .await?;

        match response {
            ExtensionResponse::Success { .. } => Ok(()),
            ExtensionResponse::Error { message } => Err(Error::Generic(message)),
        }
    }

    /// Hover over an element via the extension bridge.
    pub async fn hover(&self, selector: &str) -> Result<()> {
        let response = self
            .send_message(ExtensionMessage::Hover {
                selector: selector.to_string(),
            })
            .await?;

        match response {
            ExtensionResponse::Success { .. } => Ok(()),
            ExtensionResponse::Error { message } => Err(Error::Generic(message)),
        }
    }

    /// Wait for a CSS selector to appear in the DOM via the extension bridge.
    pub async fn wait_for_selector(&self, selector: &str, timeout_ms: u64) -> Result<()> {
        let response = self
            .send_message(ExtensionMessage::WaitForSelector {
                selector: selector.to_string(),
                timeout_ms,
            })
            .await?;

        match response {
            ExtensionResponse::Success { .. } => Ok(()),
            ExtensionResponse::Error { message } => Err(Error::Generic(message)),
        }
    }

    /// Get the outer HTML of the entire page via the extension bridge.
    pub async fn get_dom_snapshot(&self) -> Result<String> {
        let response = self.send_message(ExtensionMessage::GetDomSnapshot).await?;

        match response {
            ExtensionResponse::Success { data } => Ok(data
                .get("html")
                .and_then(|v| v.as_str())
                .unwrap_or("")
                .to_string()),
            ExtensionResponse::Error { message } => Err(Error::Generic(message)),
        }
    }

    /// Get the current URL of the active browser tab via the extension bridge.
    pub async fn get_url(&self) -> Result<String> {
        let response = self.send_message(ExtensionMessage::GetUrl).await?;

        match response {
            ExtensionResponse::Success { data } => Ok(data
                .get("url")
                .and_then(|v| v.as_str())
                .unwrap_or("")
                .to_string()),
            ExtensionResponse::Error { message } => Err(Error::Generic(message)),
        }
    }

    /// Get the title of the active browser tab via the extension bridge.
    pub async fn get_title(&self) -> Result<String> {
        let response = self.send_message(ExtensionMessage::GetTitle).await?;

        match response {
            ExtensionResponse::Success { data } => Ok(data
                .get("title")
                .and_then(|v| v.as_str())
                .unwrap_or("")
                .to_string()),
            ExtensionResponse::Error { message } => Err(Error::Generic(message)),
        }
    }

    /// Get an attribute value from an element via the extension bridge.
    pub async fn get_attribute(&self, selector: &str, attribute: &str) -> Result<String> {
        let response = self
            .send_message(ExtensionMessage::GetAttribute {
                selector: selector.to_string(),
                attribute: attribute.to_string(),
            })
            .await?;

        match response {
            ExtensionResponse::Success { data } => Ok(data
                .get("value")
                .and_then(|v| v.as_str())
                .unwrap_or("")
                .to_string()),
            ExtensionResponse::Error { message } => Err(Error::Generic(message)),
        }
    }

    /// Select an option in a select element via the extension bridge.
    pub async fn select_option(&self, selector: &str, value: &str) -> Result<()> {
        let response = self
            .send_message(ExtensionMessage::SelectOption {
                selector: selector.to_string(),
                value: value.to_string(),
            })
            .await?;

        match response {
            ExtensionResponse::Success { .. } => Ok(()),
            ExtensionResponse::Error { message } => Err(Error::Generic(message)),
        }
    }

    /// Set the checked state of a checkbox or radio element via the extension bridge.
    pub async fn set_checked(&self, selector: &str, checked: bool) -> Result<()> {
        let response = self
            .send_message(ExtensionMessage::SetChecked {
                selector: selector.to_string(),
                checked,
            })
            .await?;

        match response {
            ExtensionResponse::Success { .. } => Ok(()),
            ExtensionResponse::Error { message } => Err(Error::Generic(message)),
        }
    }

    /// Focus an element via the extension bridge.
    pub async fn focus(&self, selector: &str) -> Result<()> {
        let response = self
            .send_message(ExtensionMessage::Focus {
                selector: selector.to_string(),
            })
            .await?;

        match response {
            ExtensionResponse::Success { .. } => Ok(()),
            ExtensionResponse::Error { message } => Err(Error::Generic(message)),
        }
    }

    /// Scroll an element into view via the extension bridge.
    pub async fn scroll_into_view(&self, selector: &str) -> Result<()> {
        let response = self
            .send_message(ExtensionMessage::ScrollIntoView {
                selector: selector.to_string(),
            })
            .await?;

        match response {
            ExtensionResponse::Success { .. } => Ok(()),
            ExtensionResponse::Error { message } => Err(Error::Generic(message)),
        }
    }

    /// Extract text from an element via the extension bridge.
    pub async fn get_text(&self, selector: &str) -> Result<String> {
        let response = self
            .send_message(ExtensionMessage::GetElement {
                selector: selector.to_string(),
            })
            .await?;

        match response {
            ExtensionResponse::Success { data } => Ok(data
                .get("text")
                .or_else(|| data.get("text_content"))
                .and_then(|v| v.as_str())
                .unwrap_or("")
                .to_string()),
            ExtensionResponse::Error { message } => Err(Error::Generic(message)),
        }
    }

    pub async fn capture_screenshot(&self, format: &str, quality: u8) -> Result<Vec<u8>> {
        let response = self
            .send_message(ExtensionMessage::CaptureScreenshot {
                format: format.to_string(),
                quality,
            })
            .await?;

        match response {
            ExtensionResponse::Success { data } => {
                let encoded = data
                    .get("data")
                    .and_then(|value| value.as_str())
                    .ok_or_else(|| Error::Generic("Screenshot payload missing data".to_string()))?;
                base64::engine::general_purpose::STANDARD
                    .decode(encoded)
                    .map_err(|e| Error::Generic(format!("Failed to decode screenshot: {}", e)))
            }
            ExtensionResponse::Error { message } => Err(Error::Other(message)),
        }
    }

    /// Discover available WebMCP tools from the browser extension.
    pub async fn discover_webmcp_tools(&self) -> Result<Vec<serde_json::Value>> {
        let response = self
            .send_message(ExtensionMessage::DiscoverWebMCPTools)
            .await?;

        match response {
            ExtensionResponse::Success { data } => {
                let tools = data
                    .get("tools")
                    .and_then(|v| v.as_array())
                    .cloned()
                    .unwrap_or_default();
                Ok(tools)
            }
            ExtensionResponse::Error { message } => Err(Error::Generic(message)),
        }
    }

    /// Invoke a WebMCP tool by name with optional arguments.
    pub async fn call_webmcp_tool(
        &self,
        tool_name: &str,
        arguments: Option<serde_json::Value>,
    ) -> Result<serde_json::Value> {
        let response = self
            .send_message(ExtensionMessage::CallWebMCPTool {
                tool_name: tool_name.to_string(),
                arguments,
            })
            .await?;

        match response {
            ExtensionResponse::Success { data } => Ok(data),
            ExtensionResponse::Error { message } => Err(Error::Generic(message)),
        }
    }
}

fn extension_message_to_native_payload(message: ExtensionMessage) -> Result<Value> {
    let payload = match message {
        ExtensionMessage::ExecuteScript { script } => {
            json!({ "type": "EXECUTE_SCRIPT", "script": script, "tab_id": null })
        }
        ExtensionMessage::GetElement { selector } => {
            json!({ "type": "GET_TEXT", "selector": selector, "tab_id": null })
        }
        ExtensionMessage::Click { selector } => {
            json!({ "type": "CLICK", "selector": selector, "tab_id": null })
        }
        ExtensionMessage::Type { selector, text } => {
            json!({ "type": "TYPE", "selector": selector, "text": text, "tab_id": null })
        }
        ExtensionMessage::Navigate { url } => json!({
            "type": "EXECUTE_SCRIPT",
            "script": "navigateTo",
            "args": [url],
            "tab_id": null
        }),
        ExtensionMessage::Hover { selector } => {
            json!({ "type": "HOVER", "selector": selector, "tab_id": null })
        }
        ExtensionMessage::WaitForSelector {
            selector,
            timeout_ms,
        } => {
            json!({ "type": "WAIT_FOR_SELECTOR", "selector": selector, "timeout": timeout_ms, "tab_id": null })
        }
        ExtensionMessage::GetDomSnapshot => json!({ "type": "GET_PAGE_INFO", "tab_id": null }),
        ExtensionMessage::GetUrl => json!({ "type": "GET_PAGE_INFO", "tab_id": null }),
        ExtensionMessage::GetTitle => json!({ "type": "GET_PAGE_INFO", "tab_id": null }),
        ExtensionMessage::GetAttribute {
            selector,
            attribute,
        } => {
            json!({ "type": "GET_ATTRIBUTE", "selector": selector, "attribute": attribute, "tab_id": null })
        }
        ExtensionMessage::SelectOption { selector, value } => {
            json!({ "type": "SELECT_OPTION", "selector": selector, "value": value, "tab_id": null })
        }
        ExtensionMessage::SetChecked { selector, checked } => json!({
            "type": if checked { "CHECK" } else { "UNCHECK" },
            "selector": selector,
            "tab_id": null
        }),
        ExtensionMessage::Focus { selector } => {
            json!({ "type": "FOCUS", "selector": selector, "tab_id": null })
        }
        ExtensionMessage::ScrollIntoView { selector } => json!({
            "type": "EXECUTE_SCRIPT",
            "script": "scrollIntoView",
            "args": [selector, { "behavior": "auto", "block": "center" }],
            "tab_id": null
        }),
        ExtensionMessage::GetCookies => json!({ "type": "GET_COOKIES", "url": null }),
        ExtensionMessage::SetCookie {
            name,
            value,
            domain,
        } => json!({
            "type": "SET_COOKIE",
            "cookie": {
                "name": name,
                "value": value,
                "domain": domain,
                "path": "/",
                "secure": false,
                "http_only": false,
                "expires": null
            }
        }),
        ExtensionMessage::ClearCookies => json!({ "type": "CLEAR_COOKIES", "url": null }),
        ExtensionMessage::GetLocalStorage { key } => json!({
            "type": "EXECUTE_SCRIPT",
            "script": "getLocalStorage",
            "args": [key],
            "tab_id": null
        }),
        ExtensionMessage::SetLocalStorage { key, value } => json!({
            "type": "EXECUTE_SCRIPT",
            "script": "setLocalStorage",
            "args": [key, value],
            "tab_id": null
        }),
        ExtensionMessage::ClearLocalStorage => json!({
            "type": "EXECUTE_SCRIPT",
            "script": "clearLocalStorage",
            "tab_id": null
        }),
        ExtensionMessage::CaptureScreenshot { format, quality } => {
            json!({ "type": "CAPTURE_SCREENSHOT", "tab_id": null, "format": format, "quality": quality })
        }
        ExtensionMessage::DiscoverWebMCPTools => {
            json!({ "type": "WEBMCP_DISCOVER_TOOLS", "tab_id": null })
        }
        ExtensionMessage::CallWebMCPTool {
            tool_name,
            arguments,
        } => {
            json!({ "type": "WEBMCP_CALL_TOOL", "toolName": tool_name, "arguments": arguments, "tab_id": null })
        }
    };

    Ok(payload)
}

async fn send_native_message_via_realtime(payload: Value) -> Result<Value> {
    let mut last_error: Option<Error> = None;

    for attempt in 1..=REALTIME_MAX_RETRIES {
        match send_native_message_once(payload.clone()).await {
            Ok(result) => return Ok(result),
            Err(error) => {
                let is_non_retryable = is_non_retryable_realtime_error(&error);
                if is_non_retryable || attempt == REALTIME_MAX_RETRIES {
                    return Err(sanitize_realtime_bridge_error(error));
                }

                last_error = Some(error);
                let shift = (attempt - 1).min(30);
                let delay_ms = REALTIME_RETRY_BASE_DELAY_MS * (1_u64 << shift);
                tracing::warn!(
                    "Extension bridge realtime attempt {}/{} failed; retrying in {}ms",
                    attempt,
                    REALTIME_MAX_RETRIES,
                    delay_ms
                );
                tokio::time::sleep(std::time::Duration::from_millis(delay_ms)).await;
            }
        }
    }

    Err(sanitize_realtime_bridge_error(last_error.unwrap_or_else(
        || Error::Generic("Realtime request failed without specific error".to_string()),
    )))
}

async fn send_native_message_once(payload: Value) -> Result<Value> {
    let token = read_realtime_token()?;
    let request_id = uuid::Uuid::new_v4().to_string();
    let url = Url::parse(REALTIME_URL).map_err(|e| {
        Error::Generic(format!(
            "{} Invalid realtime websocket URL '{}': {}",
            EXT_BRIDGE_CONFIG_ERROR_PREFIX, REALTIME_URL, e
        ))
    })?;

    let (mut ws_stream, _) = connect_async(url)
        .await
        .map_err(|e| {
            let err_text = e.to_string();
            let err_lower = err_text.to_lowercase();
            if err_lower.contains("connection refused")
                || err_lower.contains("os error 61")
                || err_lower.contains("os error 111")
            {
                Error::Generic(format!(
                    "Could not reach desktop realtime bridge at {}. Ensure the desktop app is running, then retry.",
                    REALTIME_URL
                ))
            } else {
                Error::Generic(format!("Failed to connect to realtime websocket: {}", err_text))
            }
        })?;

    let auth_event = RealtimeEvent::Authenticate {
        user_id: "extension_bridge".to_string(),
        team_id: None,
        token: Some(token),
    };
    let auth_message = serde_json::to_string(&auth_event)
        .map_err(|e| Error::Generic(format!("Failed to serialize auth event: {}", e)))?;
    ws_stream
        .send(Message::Text(auth_message))
        .await
        .map_err(|e| Error::Generic(format!("Failed to send auth event: {}", e)))?;

    let auth_wait = async {
        while let Some(message) = ws_stream.next().await {
            match message {
                Ok(Message::Text(text)) => {
                    if let Ok(event) = serde_json::from_str::<RealtimeEvent>(&text) {
                        match event {
                            RealtimeEvent::Authenticated { .. } => return Ok(()),
                            RealtimeEvent::AuthenticationFailed { reason } => {
                                return Err(Error::Generic(format!(
                                    "{} {}",
                                    EXT_BRIDGE_AUTH_ERROR_PREFIX, reason
                                )));
                            }
                            _ => {
                                // Ignore non-auth events until auth is acknowledged.
                            }
                        }
                    }
                }
                Ok(Message::Close(_)) => {
                    return Err(Error::Generic(format!(
                        "{} Realtime websocket closed during authentication. Restart desktop app and browser extension, then retry.",
                        EXT_BRIDGE_AUTH_ERROR_PREFIX
                    )));
                }
                Ok(_) => {}
                Err(e) => {
                    return Err(Error::Generic(format!(
                        "Realtime websocket error while waiting for auth acknowledgement: {}",
                        e
                    )));
                }
            }
        }

        Err(Error::Generic(format!(
            "{} Realtime websocket closed before authentication completed",
            EXT_BRIDGE_AUTH_ERROR_PREFIX
        )))
    };

    tokio::time::timeout(
        std::time::Duration::from_millis(REALTIME_AUTH_TIMEOUT_MS),
        auth_wait,
    )
    .await
    .map_err(|_| {
        Error::Generic(format!(
            "{} Timed out waiting for realtime authentication acknowledgement after {}ms",
            EXT_BRIDGE_AUTH_ERROR_PREFIX, REALTIME_AUTH_TIMEOUT_MS
        ))
    })??;

    let native_event = RealtimeEvent::NativeMessage {
        id: request_id.clone(),
        payload,
    };
    let native_message = serde_json::to_string(&native_event)
        .map_err(|e| Error::Generic(format!("Failed to serialize native event: {}", e)))?;
    ws_stream
        .send(Message::Text(native_message))
        .await
        .map_err(|e| Error::Generic(format!("Failed to send native event: {}", e)))?;

    let response_future = async {
        while let Some(message) = ws_stream.next().await {
            match message {
                Ok(Message::Text(text)) => {
                    if let Ok(RealtimeEvent::NativeResponse {
                        id,
                        success,
                        data,
                        error,
                    }) = serde_json::from_str::<RealtimeEvent>(&text)
                    {
                        if id != request_id {
                            continue;
                        }

                        if success {
                            return Ok(data.unwrap_or_else(|| json!({})));
                        }

                        return Err(Error::Generic(format!(
                            "{} {}",
                            EXT_BRIDGE_NATIVE_ERROR_PREFIX,
                            error.unwrap_or_else(|| {
                                "Native request failed without error details".to_string()
                            })
                        )));
                    }

                    if let Ok(RealtimeEvent::AuthenticationFailed { reason }) =
                        serde_json::from_str::<RealtimeEvent>(&text)
                    {
                        return Err(Error::Generic(format!(
                            "{} {}",
                            EXT_BRIDGE_AUTH_ERROR_PREFIX, reason
                        )));
                    }
                }
                Ok(Message::Close(_)) => {
                    return Err(Error::Generic(
                        "Realtime websocket closed before native response".to_string(),
                    ));
                }
                Ok(_) => {}
                Err(e) => {
                    return Err(Error::Generic(format!(
                        "Realtime websocket error while waiting for response: {}",
                        e
                    )));
                }
            }
        }

        Err(Error::Generic(
            "Realtime websocket closed without native response".to_string(),
        ))
    };

    tokio::time::timeout(
        std::time::Duration::from_millis(REALTIME_RESPONSE_TIMEOUT_MS),
        response_future,
    )
    .await
    .map_err(|_| {
        Error::Generic(format!(
            "Timed out waiting for realtime native response after {}ms",
            REALTIME_RESPONSE_TIMEOUT_MS
        ))
    })?
}

fn read_realtime_token() -> Result<String> {
    let app_dir = resolve_app_data_dir().ok_or_else(|| {
        Error::Generic(format!(
            "{} Unable to resolve app data directory for realtime token lookup",
            EXT_BRIDGE_CONFIG_ERROR_PREFIX
        ))
    })?;
    let token_path = app_dir.join(".ipc_token");
    if !token_path.exists() {
        return Err(Error::Generic(format!(
            "{} Missing realtime auth token at {}. Start or restart the desktop app to regenerate .ipc_token.",
            EXT_BRIDGE_CONFIG_ERROR_PREFIX,
            token_path.display()
        )));
    }

    let token = std::fs::read_to_string(&token_path).map_err(|e| {
        Error::Generic(format!(
            "{} Failed to read realtime auth token at {}: {}",
            EXT_BRIDGE_CONFIG_ERROR_PREFIX,
            token_path.display(),
            e
        ))
    })?;
    let token = token.trim().to_string();
    if token.is_empty() {
        return Err(Error::Generic(format!(
            "{} Realtime auth token file is empty at {}. Restart desktop app to regenerate .ipc_token.",
            EXT_BRIDGE_CONFIG_ERROR_PREFIX,
            token_path.display()
        )));
    }

    Ok(token)
}

fn is_non_retryable_realtime_error(error: &Error) -> bool {
    let Some(message) = extract_internal_error_message(error) else {
        return false;
    };

    message.starts_with(EXT_BRIDGE_CONFIG_ERROR_PREFIX)
        || message.starts_with(EXT_BRIDGE_AUTH_ERROR_PREFIX)
        || message.starts_with(EXT_BRIDGE_NATIVE_ERROR_PREFIX)
}

fn extract_internal_error_message(error: &Error) -> Option<&str> {
    match error {
        Error::Generic(message) => Some(message.as_str()),
        Error::Other(message) => Some(message.as_str()),
        _ => None,
    }
}

fn sanitize_realtime_bridge_error(error: Error) -> Error {
    match error {
        Error::Generic(message) => {
            if let Some(details) = message.strip_prefix(EXT_BRIDGE_CONFIG_ERROR_PREFIX) {
                let details = details.trim();
                return Error::Generic(if details.is_empty() {
                    "Extension bridge configuration error".to_string()
                } else {
                    details.to_string()
                });
            }

            if let Some(details) = message.strip_prefix(EXT_BRIDGE_AUTH_ERROR_PREFIX) {
                let details = details.trim();
                return Error::Generic(if details.is_empty() {
                    "Realtime authentication failed".to_string()
                } else {
                    format!(
                        "Realtime authentication failed: {}. Verify desktop and extension are from the same running session.",
                        details
                    )
                });
            }

            if let Some(details) = message.strip_prefix(EXT_BRIDGE_NATIVE_ERROR_PREFIX) {
                let details = details.trim();
                return Error::Generic(if details.is_empty() {
                    "Extension-native request failed".to_string()
                } else {
                    format!("Extension-native request failed: {}", details)
                });
            }

            Error::Generic(message)
        }
        other => other,
    }
}

fn resolve_app_data_dir() -> Option<PathBuf> {
    #[cfg(target_os = "macos")]
    {
        let home = dirs::home_dir()?;
        let container_dir = home.join(
            "Library/Containers/com.agiworkforce.desktop/Data/Library/Application Support/com.agiworkforce.desktop",
        );
        let legacy_dir = home.join("Library/Application Support/com.agiworkforce.desktop");

        if container_dir.join(".ipc_token").exists() {
            return Some(container_dir);
        }
        if legacy_dir.join(".ipc_token").exists() {
            return Some(legacy_dir);
        }
        if container_dir.exists() {
            return Some(container_dir);
        }

        Some(legacy_dir)
    }

    #[cfg(not(target_os = "macos"))]
    {
        dirs::data_local_dir().map(|dir| dir.join("com.agiworkforce.desktop"))
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

    #[test]
    fn test_extension_message_to_native_payload() {
        let payload = extension_message_to_native_payload(ExtensionMessage::Click {
            selector: "#submit".to_string(),
        })
        .expect("payload should be generated");

        assert_eq!(payload.get("type").and_then(Value::as_str), Some("CLICK"));
        assert_eq!(
            payload.get("selector").and_then(Value::as_str),
            Some("#submit")
        );
    }

    #[test]
    fn test_extension_message_to_page_info_payload() {
        let payload = extension_message_to_native_payload(ExtensionMessage::GetDomSnapshot)
            .expect("payload should be generated");

        assert_eq!(
            payload.get("type").and_then(Value::as_str),
            Some("GET_PAGE_INFO")
        );
    }

    #[test]
    fn test_set_checked_payload_uses_check_or_uncheck() {
        let checked = extension_message_to_native_payload(ExtensionMessage::SetChecked {
            selector: "#newsletter".to_string(),
            checked: true,
        })
        .expect("checked payload should be generated");
        let unchecked = extension_message_to_native_payload(ExtensionMessage::SetChecked {
            selector: "#newsletter".to_string(),
            checked: false,
        })
        .expect("unchecked payload should be generated");

        assert_eq!(checked.get("type").and_then(Value::as_str), Some("CHECK"));
        assert_eq!(
            unchecked.get("type").and_then(Value::as_str),
            Some("UNCHECK")
        );
    }

    #[test]
    fn test_non_retryable_detection_for_internal_error_prefixes() {
        let config_error =
            Error::Generic(format!("{} token missing", EXT_BRIDGE_CONFIG_ERROR_PREFIX));
        let auth_error = Error::Generic(format!("{} invalid token", EXT_BRIDGE_AUTH_ERROR_PREFIX));
        let native_error = Error::Generic(format!(
            "{} selector not found",
            EXT_BRIDGE_NATIVE_ERROR_PREFIX
        ));
        let transient_error = Error::Generic("network timeout".to_string());

        assert!(is_non_retryable_realtime_error(&config_error));
        assert!(is_non_retryable_realtime_error(&auth_error));
        assert!(is_non_retryable_realtime_error(&native_error));
        assert!(!is_non_retryable_realtime_error(&transient_error));
    }

    #[test]
    fn test_error_sanitization_strips_internal_prefixes() {
        let sanitized_config = sanitize_realtime_bridge_error(Error::Generic(format!(
            "{} Missing realtime token",
            EXT_BRIDGE_CONFIG_ERROR_PREFIX
        )));
        let sanitized_native = sanitize_realtime_bridge_error(Error::Generic(format!(
            "{} click failed",
            EXT_BRIDGE_NATIVE_ERROR_PREFIX
        )));

        let config_message = match sanitized_config {
            Error::Generic(message) => message,
            other => panic!("Expected generic config error, got {:?}", other),
        };
        let native_message = match sanitized_native {
            Error::Generic(message) => message,
            other => panic!("Expected generic native error, got {:?}", other),
        };

        assert_eq!(config_message, "Missing realtime token");
        assert_eq!(
            native_message,
            "Extension-native request failed: click failed"
        );
    }
}
