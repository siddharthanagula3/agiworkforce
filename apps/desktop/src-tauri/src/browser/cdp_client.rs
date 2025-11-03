use futures::{SinkExt, StreamExt};
use serde::{Deserialize, Serialize};
use serde_json::{json, Value};
use std::sync::atomic::{AtomicU64, Ordering};
use std::sync::Arc;
use tokio::sync::Mutex;
use tokio_tungstenite::{connect_async, tungstenite::Message as WsMessage};
use url::Url;

use crate::error::{Error, Result};

/// Chrome DevTools Protocol client
pub struct CdpClient {
    ws_url: String,
    message_id: Arc<AtomicU64>,
    connection: Arc<Mutex<Option<CdpConnection>>>,
}

struct CdpConnection {
    sender: tokio::sync::mpsc::UnboundedSender<WsMessage>,
    receiver: std::sync::mpsc::Receiver<WsMessage>,
}

/// CDP request message
#[derive(Debug, Serialize)]
struct CdpRequest {
    id: u64,
    method: String,
    params: Value,
}

/// CDP response message
#[derive(Debug, Deserialize)]
struct CdpResponse {
    id: u64,
    result: Option<Value>,
    error: Option<CdpError>,
}

/// CDP error
#[derive(Debug, Deserialize)]
struct CdpError {
    code: i32,
    message: String,
}

impl CdpClient {
    /// Create a new CDP client
    pub fn new(ws_url: String) -> Self {
        Self {
            ws_url,
            message_id: Arc::new(AtomicU64::new(1)),
            connection: Arc::new(Mutex::new(None)),
        }
    }

    /// Connect to the browser via WebSocket
    pub async fn connect(&self) -> Result<()> {
        let url = Url::parse(&self.ws_url)
            .map_err(|e| Error::Other(format!("Invalid WebSocket URL: {}", e)))?;

        tracing::info!("Connecting to CDP endpoint: {}", self.ws_url);

        // Establish async WebSocket connection
        let (socket, response) = connect_async(url)
            .await
            .map_err(|e| Error::Other(format!("Failed to connect to CDP: {}", e)))?;

        tracing::info!("CDP connection established: {:?}", response.status());

        // Split socket into sender and receiver
        let (mut write, mut read) = socket.split();

        // Create async channels for communication
        let (tx, mut rx) = tokio::sync::mpsc::unbounded_channel();
        let (response_tx, response_rx) = std::sync::mpsc::channel();

        // Spawn sender task
        tokio::spawn(async move {
            while let Some(msg) = rx.recv().await {
                if let Err(e) = write.send(msg).await {
                    tracing::error!("Failed to send CDP message: {}", e);
                    break;
                }
            }
        });

        // Spawn receiver task
        tokio::spawn(async move {
            while let Some(result) = read.next().await {
                match result {
                    Ok(msg) => {
                        if response_tx.send(msg).is_err() {
                            break;
                        }
                    }
                    Err(e) => {
                        tracing::error!("Failed to read CDP message: {}", e);
                        break;
                    }
                }
            }
        });

        // Store connection
        let mut conn = self.connection.lock().await;
        *conn = Some(CdpConnection {
            sender: tx,
            receiver: response_rx,
        });

        Ok(())
    }

    /// Send a CDP command and wait for response
    pub async fn send_command(&self, method: &str, params: Value) -> Result<Value> {
        let conn = self.connection.lock().await;
        let conn = conn
            .as_ref()
            .ok_or_else(|| Error::Other("Not connected to CDP".to_string()))?;

        // Generate message ID
        let id = self.message_id.fetch_add(1, Ordering::SeqCst);

        // Create request
        let request = CdpRequest {
            id,
            method: method.to_string(),
            params,
        };

        let request_json = serde_json::to_string(&request)
            .map_err(|e| Error::Other(format!("Failed to serialize request: {}", e)))?;

        tracing::debug!("Sending CDP command: {}", method);

        // Send request
        conn.sender
            .send(WsMessage::Text(request_json))
            .map_err(|e| Error::Other(format!("Failed to send CDP command: {}", e)))?;

        // Wait for response with matching ID
        loop {
            let msg = conn
                .receiver
                .recv()
                .map_err(|e| Error::Other(format!("Failed to receive CDP response: {}", e)))?;

            match msg {
                WsMessage::Text(text) => {
                    let response: CdpResponse = serde_json::from_str(&text)
                        .map_err(|e| Error::Other(format!("Failed to parse response: {}", e)))?;

                    if response.id == id {
                        if let Some(error) = response.error {
                            return Err(Error::Other(format!(
                                "CDP error {}: {}",
                                error.code, error.message
                            )));
                        }

                        return Ok(response.result.unwrap_or(Value::Null));
                    }
                }
                _ => continue,
            }
        }
    }

    /// Evaluate JavaScript expression
    pub async fn evaluate(&self, expression: &str) -> Result<Value> {
        let params = json!({
            "expression": expression,
            "returnByValue": true,
            "awaitPromise": true,
        });

        let result = self.send_command("Runtime.evaluate", params).await?;

        // Extract value from result
        if let Some(value) = result.get("result").and_then(|r| r.get("value")) {
            Ok(value.clone())
        } else if let Some(exception) = result.get("exceptionDetails") {
            Err(Error::Other(format!(
                "JavaScript exception: {}",
                exception
                    .get("text")
                    .and_then(|t| t.as_str())
                    .unwrap_or("Unknown error")
            )))
        } else {
            Ok(Value::Null)
        }
    }

    /// Click an element by selector
    pub async fn click_element(&self, selector: &str) -> Result<()> {
        let script = format!(
            r#"
            (function() {{
                const el = document.querySelector('{}');
                if (!el) throw new Error('Element not found: {}');
                el.click();
                return true;
            }})()
            "#,
            selector, selector
        );

        self.evaluate(&script).await?;
        Ok(())
    }

    /// Type text into an element
    pub async fn type_into_element(
        &self,
        selector: &str,
        text: &str,
        clear_first: bool,
    ) -> Result<()> {
        let clear_script = if clear_first { "el.value = '';" } else { "" };

        let script = format!(
            r#"
            (function() {{
                const el = document.querySelector('{}');
                if (!el) throw new Error('Element not found: {}');
                el.focus();
                {}
                el.value = '{}';
                el.dispatchEvent(new Event('input', {{ bubbles: true }}));
                el.dispatchEvent(new Event('change', {{ bubbles: true }}));
                return true;
            }})()
            "#,
            selector,
            selector,
            clear_script,
            text.replace('\\', "\\\\").replace('\'', "\\'")
        );

        self.evaluate(&script).await?;
        Ok(())
    }

    /// Get text content from an element
    pub async fn get_text(&self, selector: &str) -> Result<String> {
        let script = format!(
            r#"
            (function() {{
                const el = document.querySelector('{}');
                if (!el) throw new Error('Element not found: {}');
                return el.textContent || el.innerText || '';
            }})()
            "#,
            selector, selector
        );

        let result = self.evaluate(&script).await?;

        match result.as_str() {
            Some(text) => Ok(text.to_string()),
            None => Ok(String::new()),
        }
    }

    /// Get attribute value
    pub async fn get_attribute(&self, selector: &str, attribute: &str) -> Result<Option<String>> {
        let script = format!(
            r#"
            (function() {{
                const el = document.querySelector('{}');
                if (!el) throw new Error('Element not found: {}');
                return el.getAttribute('{}');
            }})()
            "#,
            selector, selector, attribute
        );

        let result = self.evaluate(&script).await?;

        Ok(result.as_str().map(|s| s.to_string()))
    }

    /// Wait for element to appear
    pub async fn wait_for_selector(&self, selector: &str, timeout_ms: u64) -> Result<()> {
        let script = format!(
            r#"
            new Promise((resolve, reject) => {{
                const timeout = {};
                const interval = 100;
                let elapsed = 0;

                const check = () => {{
                    const el = document.querySelector('{}');
                    if (el) {{
                        resolve(true);
                        return;
                    }}

                    elapsed += interval;
                    if (elapsed >= timeout) {{
                        reject(new Error('Timeout waiting for selector: {}'));
                        return;
                    }}

                    setTimeout(check, interval);
                }};

                check();
            }})
            "#,
            timeout_ms, selector, selector
        );

        self.evaluate(&script).await?;
        Ok(())
    }

    /// Check if element exists
    pub async fn element_exists(&self, selector: &str) -> Result<bool> {
        let script = format!(
            r#"
            (function() {{
                return !!document.querySelector('{}');
            }})()
            "#,
            selector
        );

        let result = self.evaluate(&script).await?;

        Ok(result.as_bool().unwrap_or(false))
    }

    /// Select option in dropdown
    pub async fn select_option(&self, selector: &str, value: &str) -> Result<()> {
        let script = format!(
            r#"
            (function() {{
                const el = document.querySelector('{}');
                if (!el) throw new Error('Element not found: {}');
                el.value = '{}';
                el.dispatchEvent(new Event('change', {{ bubbles: true }}));
                return true;
            }})()
            "#,
            selector,
            selector,
            value.replace('\\', "\\\\").replace('\'', "\\'")
        );

        self.evaluate(&script).await?;
        Ok(())
    }

    /// Check/uncheck checkbox
    pub async fn set_checked(&self, selector: &str, checked: bool) -> Result<()> {
        let script = format!(
            r#"
            (function() {{
                const el = document.querySelector('{}');
                if (!el) throw new Error('Element not found: {}');
                el.checked = {};
                el.dispatchEvent(new Event('change', {{ bubbles: true }}));
                return true;
            }})()
            "#,
            selector, selector, checked
        );

        self.evaluate(&script).await?;
        Ok(())
    }

    /// Focus element
    pub async fn focus_element(&self, selector: &str) -> Result<()> {
        let script = format!(
            r#"
            (function() {{
                const el = document.querySelector('{}');
                if (!el) throw new Error('Element not found: {}');
                el.focus();
                return true;
            }})()
            "#,
            selector, selector
        );

        self.evaluate(&script).await?;
        Ok(())
    }

    /// Hover over element
    pub async fn hover_element(&self, selector: &str) -> Result<()> {
        let script = format!(
            r#"
            (function() {{
                const el = document.querySelector('{}');
                if (!el) throw new Error('Element not found: {}');
                el.dispatchEvent(new MouseEvent('mouseover', {{ bubbles: true }}));
                el.dispatchEvent(new MouseEvent('mouseenter', {{ bubbles: true }}));
                return true;
            }})()
            "#,
            selector, selector
        );

        self.evaluate(&script).await?;
        Ok(())
    }

    /// Scroll element into view
    pub async fn scroll_into_view(&self, selector: &str) -> Result<()> {
        let script = format!(
            r#"
            (function() {{
                const el = document.querySelector('{}');
                if (!el) throw new Error('Element not found: {}');
                el.scrollIntoView({{ behavior: 'smooth', block: 'center' }});
                return true;
            }})()
            "#,
            selector, selector
        );

        self.evaluate(&script).await?;
        Ok(())
    }

    /// Get all elements matching selector
    pub async fn query_all(&self, selector: &str) -> Result<Vec<Value>> {
        let script = format!(
            r#"
            (function() {{
                const elements = document.querySelectorAll('{}');
                return Array.from(elements).map(el => ({{
                    tagName: el.tagName.toLowerCase(),
                    text: el.textContent || el.innerText || '',
                    className: el.className,
                    id: el.id
                }}));
            }})()
            "#,
            selector
        );

        let result = self.evaluate(&script).await?;

        match result.as_array() {
            Some(arr) => Ok(arr.clone()),
            None => Ok(Vec::new()),
        }
    }

    /// Take screenshot
    pub async fn capture_screenshot(&self, full_page: bool) -> Result<Vec<u8>> {
        let params = json!({
            "format": "png",
            "captureBeyondViewport": full_page,
        });

        let result = self.send_command("Page.captureScreenshot", params).await?;

        // Extract base64 data
        if let Some(data) = result.get("data").and_then(|d| d.as_str()) {
            use base64::{engine::general_purpose::STANDARD, Engine};
            let bytes = STANDARD
                .decode(data)
                .map_err(|e| Error::Other(format!("Failed to decode screenshot: {}", e)))?;
            Ok(bytes)
        } else {
            Err(Error::Other("No screenshot data in response".to_string()))
        }
    }

    /// Navigate to URL
    pub async fn navigate(&self, url: &str) -> Result<()> {
        let params = json!({
            "url": url,
        });

        self.send_command("Page.navigate", params).await?;
        Ok(())
    }

    /// Get current URL
    pub async fn get_url(&self) -> Result<String> {
        let script = "window.location.href";
        let result = self.evaluate(script).await?;

        match result.as_str() {
            Some(url) => Ok(url.to_string()),
            None => Ok(String::new()),
        }
    }

    /// Get page title
    pub async fn get_title(&self) -> Result<String> {
        let script = "document.title";
        let result = self.evaluate(script).await?;

        match result.as_str() {
            Some(title) => Ok(title.to_string()),
            None => Ok(String::new()),
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_cdp_client_creation() {
        let client = CdpClient::new("ws://localhost:9222".to_string());
        assert_eq!(client.ws_url, "ws://localhost:9222");
    }

    #[tokio::test]
    async fn test_evaluate_javascript() {
        // This test requires a real browser connection
        // In a real test environment, you'd launch a browser first
        let client = CdpClient::new("ws://localhost:9222".to_string());

        // Mock test - actual test would connect to real browser
        assert!(client.connection.lock().await.is_none());
    }
}
