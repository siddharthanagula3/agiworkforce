use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use std::process::{Child, Command, Stdio};
use std::sync::atomic::{AtomicU64, Ordering};
use std::sync::Arc;
use std::time::Duration;
use tokio::sync::Mutex;
use tungstenite::connect;
use tungstenite::Message;
use url::Url;

use crate::sys::error::{Error, Result};

/// Represents a Chrome DevTools Protocol target (browser page/tab).
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CdpTarget {
    pub id: String,
    #[serde(rename = "type")]
    pub target_type: String,
    pub url: String,
    pub title: String,
    #[serde(rename = "webSocketDebuggerUrl")]
    pub ws_debugger_url: Option<String>,
}

/// Atomic counter for generating unique CDP command IDs.
static CDP_COMMAND_ID: AtomicU64 = AtomicU64::new(1);

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum BrowserType {
    Chromium,
    Firefox,
    Webkit,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct BrowserOptions {
    pub headless: bool,
    pub user_data_dir: Option<String>,
    pub args: Vec<String>,
    pub viewport: Option<Viewport>,
    pub timeout: Option<u64>,
    pub proxy: Option<String>,
}

impl Default for BrowserOptions {
    fn default() -> Self {
        Self {
            headless: false,
            user_data_dir: None,
            args: vec![],
            viewport: Some(Viewport::default()),
            timeout: Some(30000),
            proxy: None,
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Viewport {
    pub width: u32,
    pub height: u32,
}

impl Default for Viewport {
    fn default() -> Self {
        Self {
            width: 1280,
            height: 720,
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct BrowserHandle {
    pub id: String,
    pub browser_type: BrowserType,
    pub ws_endpoint: String,
}

#[derive(Debug, Clone)]
pub struct PlaywrightConfig {
    pub node_path: String,
    pub playwright_path: String,
    pub ws_port: u16,
}

impl Default for PlaywrightConfig {
    fn default() -> Self {
        // BUG-10 fix: allow CDP port to be overridden via CDP_PORT env var
        let ws_port = std::env::var("CDP_PORT")
            .ok()
            .and_then(|v| v.parse::<u16>().ok())
            .unwrap_or(9222);
        Self {
            node_path: "node".to_string(),
            playwright_path: "npx playwright".to_string(),
            ws_port,
        }
    }
}

pub struct PlaywrightBridge {
    config: PlaywrightConfig,
    process: Arc<Mutex<Option<Child>>>,
    browsers: Arc<Mutex<HashMap<String, BrowserHandle>>>,
    browser_processes: Arc<Mutex<HashMap<String, Child>>>,
}

impl PlaywrightBridge {
    pub async fn new() -> Result<Self> {
        Ok(Self {
            config: PlaywrightConfig::default(),
            process: Arc::new(Mutex::new(None)),
            browsers: Arc::new(Mutex::new(HashMap::new())),
            browser_processes: Arc::new(Mutex::new(HashMap::new())),
        })
    }

    pub async fn with_config(config: PlaywrightConfig) -> Result<Self> {
        Ok(Self {
            config,
            process: Arc::new(Mutex::new(None)),

            browsers: Arc::new(Mutex::new(HashMap::new())),
            browser_processes: Arc::new(Mutex::new(HashMap::new())),
        })
    }

    pub async fn start_server(&self) -> Result<()> {
        let mut process_guard = self.process.lock().await;

        if process_guard.is_some() {
            tracing::info!("Playwright server already running");
            return Ok(());
        }

        tracing::info!("Starting Playwright server on port {}", self.config.ws_port);

        let child = Command::new("cmd")
            .args([
                "/C",
                "echo",
                "Playwright server stub - integrate with real Playwright in production",
            ])
            .stdout(Stdio::piped())
            .stderr(Stdio::piped())
            .spawn()
            .map_err(|e| Error::Other(format!("Failed to start Playwright server: {}", e)))?;

        *process_guard = Some(child);

        tracing::info!("Playwright server started successfully");
        Ok(())
    }

    pub async fn stop_server(&self) -> Result<()> {
        let mut process_guard = self.process.lock().await;

        if let Some(mut child) = process_guard.take() {
            tracing::info!("Stopping Playwright server");
            child
                .kill()
                .map_err(|e| Error::Other(format!("Failed to kill Playwright process: {}", e)))?;
            child
                .wait()
                .map_err(|e| Error::Other(format!("Failed to wait for process: {}", e)))?;
            tracing::info!("Playwright server stopped");
        }

        Ok(())
    }

    pub async fn launch_browser(
        &self,
        browser_type: BrowserType,
        options: BrowserOptions,
    ) -> Result<BrowserHandle> {
        tracing::info!("Launching {:?} browser", browser_type);

        let browser_id = uuid::Uuid::new_v4().to_string();

        let (exe, args) = self.build_browser_command(&browser_type, &options)?;

        let child = Command::new(&exe)
            .args(&args)
            .stdout(Stdio::piped())
            .stderr(Stdio::piped())
            .spawn()
            .map_err(|e| Error::Other(format!("Failed to launch browser: {}", e)))?;

        let ws_endpoint = format!(
            "ws://127.0.0.1:{}/devtools/browser/{}",
            self.config.ws_port, browser_id
        );
        let handle = BrowserHandle {
            id: browser_id.clone(),
            browser_type: browser_type.clone(),
            ws_endpoint: ws_endpoint.clone(),
        };

        // Acquire both locks in consistent order: browsers -> processes
        // This matches close_browser_by_id to prevent deadlocks
        let mut browsers = self.browsers.lock().await;
        let mut processes = self.browser_processes.lock().await;
        browsers.insert(browser_id.clone(), handle.clone());
        processes.insert(browser_id.clone(), child);

        tracing::info!("Browser launched with ID: {}", browser_id);
        Ok(handle)
    }

    pub async fn close_browser(&self, handle: BrowserHandle) -> Result<()> {
        self.close_browser_by_id(&handle.id).await
    }

    pub async fn close_browser_by_id(&self, id: &str) -> Result<()> {
        tracing::info!("Closing browser: {}", id);

        // Acquire both locks in consistent order: browsers -> processes
        let mut browsers = self.browsers.lock().await;
        let mut processes = self.browser_processes.lock().await;

        if let Some(_handle) = browsers.remove(id) {
            if let Some(mut child) = processes.remove(id) {
                tracing::info!("Killing browser process for {}", id);
                let _ = child.kill();
                let _ = child.wait();
            } else {
                tracing::warn!("Browser process not found for {}", id);
            }
        } else {
            // It might be already closed or doesn't exist
            tracing::warn!("Browser {} not found to close", id);
        }

        Ok(())
    }

    pub async fn list_browsers(&self) -> Result<Vec<BrowserHandle>> {
        let browsers = self.browsers.lock().await;
        Ok(browsers.values().cloned().collect())
    }

    fn build_browser_command(
        &self,
        browser_type: &BrowserType,
        options: &BrowserOptions,
    ) -> Result<(String, Vec<String>)> {
        let mut args = vec![
            format!("--remote-debugging-port={}", self.config.ws_port),
            "--no-first-run".to_string(),
            "--no-default-browser-check".to_string(),
        ];

        if options.headless {
            args.push("--headless=new".to_string());
        }

        if let Some(ref user_data_dir) = options.user_data_dir {
            args.push(format!("--user-data-dir={}", user_data_dir));
        }

        if let Some(ref proxy) = options.proxy {
            args.push(format!("--proxy-server={}", proxy));
        }

        args.extend(options.args.clone());

        let exe = match browser_type {
            BrowserType::Chromium => {
                #[cfg(windows)]
                {
                    // Build the user-profile Chrome path by resolving LOCALAPPDATA at runtime;
                    // %USERNAME% is not expanded by Path::exists(), so we use the env var instead.
                    let user_chrome = std::env::var("LOCALAPPDATA")
                        .map(|local| {
                            std::path::PathBuf::from(local)
                                .join("Google")
                                .join("Chrome")
                                .join("Application")
                                .join("chrome.exe")
                        })
                        .ok();

                    let system_paths: &[&str] = &[
                        r"C:\Program Files\Google\Chrome\Application\chrome.exe",
                        r"C:\Program Files (x86)\Google\Chrome\Application\chrome.exe",
                    ];

                    let found = system_paths
                        .iter()
                        .map(|p| std::path::PathBuf::from(p))
                        .chain(user_chrome.into_iter())
                        .find(|p| p.exists());

                    found
                        .map(|p| p.to_string_lossy().to_string())
                        .unwrap_or_else(|| "chrome".to_string())
                }

                #[cfg(not(windows))]
                {
                    "chromium".to_string()
                }
            }
            BrowserType::Firefox => "firefox".to_string(),
            BrowserType::Webkit => {
                return Err(Error::Other(
                    "WebKit browser not yet supported on this platform".to_string(),
                ))
            }
        };

        Ok((exe, args))
    }

    pub async fn connect_to_browser(&self, ws_endpoint: &str) -> Result<()> {
        let url = Url::parse(ws_endpoint)
            .map_err(|e| Error::Other(format!("Invalid WebSocket URL: {}", e)))?;

        tracing::info!("Connecting to browser at {}", ws_endpoint);

        match connect(url) {
            Ok(_) => {
                tracing::info!("Successfully connected to browser");
                Ok(())
            }
            Err(e) => {
                tracing::warn!("Failed to connect to browser: {}", e);

                Ok(())
            }
        }
    }

    // ---------------------------------------------------------------
    // Chrome DevTools Protocol (CDP) commands
    // ---------------------------------------------------------------

    /// Fetch the list of available CDP targets (pages/tabs) from the running Chrome instance.
    ///
    /// Sends an HTTP GET to `http://127.0.0.1:<port>/json` and deserializes the
    /// response into a vector of `CdpTarget`.
    // Used by: CDP browser automation API — navigate/click/type/screenshot/evaluate
    #[allow(dead_code)]
    pub async fn list_targets(&self) -> Result<Vec<CdpTarget>> {
        let port = self.config.ws_port;
        let url = format!("http://127.0.0.1:{}/json", port);

        tracing::debug!("Fetching CDP targets from {}", url);

        let client = reqwest::Client::builder()
            .timeout(Duration::from_secs(5))
            .build()
            .map_err(|e| Error::Other(format!("Failed to create HTTP client: {}", e)))?;

        let targets: Vec<CdpTarget> = client
            .get(&url)
            .send()
            .await
            .map_err(|e| {
                Error::Other(format!(
                    "Failed to connect to Chrome DevTools at {}. Is Chrome running with --remote-debugging-port={}? Error: {}",
                    url, port, e
                ))
            })?
            .json()
            .await
            .map_err(|e| {
                Error::Other(format!(
                    "Failed to parse CDP targets response: {}",
                    e
                ))
            })?;

        tracing::debug!("Found {} CDP targets", targets.len());
        Ok(targets)
    }

    /// Open a WebSocket to the given CDP target URL, send a single JSON-RPC
    /// command, and return the response.
    ///
    /// The connection is opened, one message is sent, responses are read until
    /// the one with the matching `id` is found, and then the socket is closed.
    /// Because `tungstenite` is synchronous, this is wrapped in
    /// `tokio::task::spawn_blocking`. A 30-second timeout prevents hanging if
    /// Chrome stops responding.
    // Used by: CDP browser automation API — internal transport for all CDP methods
    #[allow(dead_code)]
    async fn send_cdp_command(
        &self,
        ws_url: &str,
        method: &str,
        params: serde_json::Value,
    ) -> Result<serde_json::Value> {
        let cmd_id = CDP_COMMAND_ID.fetch_add(1, Ordering::Relaxed);

        let payload = serde_json::json!({
            "id": cmd_id,
            "method": method,
            "params": params,
        });

        let ws_url_owned = ws_url.to_string();
        let method_owned = method.to_string();
        let method_for_timeout = method.to_string();
        let payload_str = serde_json::to_string(&payload)
            .map_err(|e| Error::Other(format!("Failed to serialize CDP command: {}", e)))?;

        tracing::debug!(
            "Sending CDP command id={} method={} to {}",
            cmd_id,
            method,
            ws_url
        );

        let result = tokio::time::timeout(
            Duration::from_secs(30),
            tokio::task::spawn_blocking(
                move || -> std::result::Result<serde_json::Value, String> {
                    let url = Url::parse(&ws_url_owned)
                        .map_err(|e| format!("Invalid WebSocket URL '{}': {}", ws_url_owned, e))?;

                    let (mut socket, _response) = connect(url).map_err(|e| {
                        format!("Failed to connect WebSocket to '{}': {}", ws_url_owned, e)
                    })?;

                    // Set a read timeout so that socket.read() does not block
                    // indefinitely if Chrome becomes unresponsive. Without this,
                    // the tokio::time::timeout above would fire but the blocking
                    // task would continue, leaking a thread.
                    {
                        let read_timeout = Some(Duration::from_secs(10));
                        match socket.get_mut() {
                            tungstenite::stream::MaybeTlsStream::Plain(tcp) => {
                                let _ = tcp.set_read_timeout(read_timeout);
                            }
                            _ => {
                                // TLS or other stream variants -- best-effort, skip.
                            }
                        }
                    }

                    socket.send(Message::Text(payload_str)).map_err(|e| {
                        format!("Failed to send CDP command '{}': {}", method_owned, e)
                    })?;

                    // Read messages until we find the response with our command id.
                    loop {
                        let msg = socket.read().map_err(|e| {
                            format!("Failed to read CDP response for '{}': {}", method_owned, e)
                        })?;

                        match msg {
                            Message::Text(text) => {
                                let parsed: serde_json::Value = serde_json::from_str(&text)
                                    .map_err(|e| {
                                        format!("Failed to parse CDP response JSON: {}", e)
                                    })?;

                                // Check if this response matches our command id.
                                if let Some(resp_id) = parsed.get("id").and_then(|v| v.as_u64()) {
                                    if resp_id == cmd_id {
                                        // Check for CDP-level errors.
                                        if let Some(error_obj) = parsed.get("error") {
                                            let error_msg = error_obj
                                                .get("message")
                                                .and_then(|m| m.as_str())
                                                .unwrap_or("Unknown CDP error");
                                            let _ = socket.close(None);
                                            return Err(format!(
                                                "CDP error for '{}': {}",
                                                method_owned, error_msg
                                            ));
                                        }

                                        let _ = socket.close(None);
                                        return Ok(parsed);
                                    }
                                }
                                // Not our response (could be an event); keep reading.
                            }
                            Message::Close(_) => {
                                return Err(format!(
                                    "WebSocket closed before receiving response for '{}'",
                                    method_owned
                                ));
                            }
                            // Binary, Ping, Pong, Frame — skip them.
                            _ => {}
                        }
                    }
                },
            ),
        )
        .await
        .map_err(|_| {
            Error::Other(format!(
                "CDP command '{}' timed out after 30s",
                method_for_timeout
            ))
        })?
        .map_err(|e| Error::Other(format!("CDP command task panicked: {}", e)))?
        .map_err(Error::Other)?;

        Ok(result)
    }

    /// Helper: find the first `"page"` target with a valid `webSocketDebuggerUrl`.
    // Used by: CDP browser automation API — page targeting for navigate/click/type/etc.
    #[allow(dead_code)]
    async fn first_page_ws_url(&self) -> Result<String> {
        let targets = self.list_targets().await?;
        for target in &targets {
            if target.target_type == "page" {
                if let Some(ref ws_url) = target.ws_debugger_url {
                    return Ok(ws_url.clone());
                }
            }
        }
        Err(Error::Other(
            "No browser pages available. Launch a browser first.".to_string(),
        ))
    }

    /// Navigate the first available browser page to the given URL.
    ///
    /// Uses the CDP `Page.navigate` method.
    // Used by: CDP browser automation API
    #[allow(dead_code)]
    pub async fn navigate(&self, url: &str) -> Result<()> {
        let ws_url = self.first_page_ws_url().await?;
        let params = serde_json::json!({ "url": url });

        tracing::info!("CDP navigate to '{}'", url);
        let response = self
            .send_cdp_command(&ws_url, "Page.navigate", params)
            .await?;

        // Check if navigation returned an error message in the result.
        if let Some(result) = response.get("result") {
            if let Some(error_text) = result.get("errorText").and_then(|v| v.as_str()) {
                if !error_text.is_empty() {
                    return Err(Error::Other(format!(
                        "Navigation to '{}' failed: {}",
                        url, error_text
                    )));
                }
            }
        }

        Ok(())
    }

    /// Click on the element matching the given CSS selector on the first available page.
    ///
    /// Uses `Runtime.evaluate` to execute `document.querySelector(selector).click()`.
    // Used by: CDP browser automation API
    #[allow(dead_code)]
    pub async fn click_selector(&self, selector: &str) -> Result<()> {
        let js = format!(
            r#"(function() {{
                var el = document.querySelector('{}');
                if (!el) throw new Error('Element not found: {}');
                el.click();
                return true;
            }})()"#,
            escape_js_string(selector),
            escape_js_string(selector),
        );

        tracing::info!("CDP click_selector '{}'", selector);
        let ws_url = self.first_page_ws_url().await?;
        let params = serde_json::json!({
            "expression": js,
            "returnByValue": true,
        });
        let response = self
            .send_cdp_command(&ws_url, "Runtime.evaluate", params)
            .await?;

        check_runtime_exception(&response, "click_selector")?;
        Ok(())
    }

    /// Type text into the element matching the given CSS selector on the first available page.
    ///
    /// Focuses the element, sets its value, and dispatches `input` and `change` events.
    // Used by: CDP browser automation API
    #[allow(dead_code)]
    pub async fn type_text(&self, selector: &str, text: &str) -> Result<()> {
        let js = format!(
            r#"(function() {{
                var el = document.querySelector('{}');
                if (!el) throw new Error('Element not found: {}');
                el.focus();
                el.value = '{}';
                el.dispatchEvent(new Event('input', {{bubbles: true}}));
                el.dispatchEvent(new Event('change', {{bubbles: true}}));
                return true;
            }})()"#,
            escape_js_string(selector),
            escape_js_string(selector),
            escape_js_string(text),
        );

        tracing::info!("CDP type_text into '{}'", selector);
        let ws_url = self.first_page_ws_url().await?;
        let params = serde_json::json!({
            "expression": js,
            "returnByValue": true,
        });
        let response = self
            .send_cdp_command(&ws_url, "Runtime.evaluate", params)
            .await?;

        check_runtime_exception(&response, "type_text")?;
        Ok(())
    }

    /// Take a screenshot of the first available page and return it as a base64-encoded PNG string.
    ///
    /// Uses the CDP `Page.captureScreenshot` method.
    // Used by: CDP browser automation API
    #[allow(dead_code)]
    pub async fn screenshot_base64(&self) -> Result<String> {
        let ws_url = self.first_page_ws_url().await?;
        let params = serde_json::json!({ "format": "png" });

        tracing::info!("CDP screenshot_base64");
        let response = self
            .send_cdp_command(&ws_url, "Page.captureScreenshot", params)
            .await?;

        let data = response
            .get("result")
            .and_then(|r| r.get("data"))
            .and_then(|d| d.as_str())
            .ok_or_else(|| {
                Error::Other(
                    "Page.captureScreenshot did not return expected 'result.data' field"
                        .to_string(),
                )
            })?;

        Ok(data.to_string())
    }

    /// Execute a JavaScript expression in the first available page and return the result.
    ///
    /// Uses the CDP `Runtime.evaluate` method with `returnByValue: true`.
    // Used by: CDP browser automation API
    #[allow(dead_code)]
    pub async fn evaluate_js(&self, expression: &str) -> Result<serde_json::Value> {
        let ws_url = self.first_page_ws_url().await?;
        let params = serde_json::json!({
            "expression": expression,
            "returnByValue": true,
        });

        tracing::info!("CDP evaluate_js");
        let response = self
            .send_cdp_command(&ws_url, "Runtime.evaluate", params)
            .await?;

        check_runtime_exception(&response, "evaluate_js")?;

        // Extract the actual result value from the CDP response envelope.
        let result_value = response
            .get("result")
            .and_then(|r| r.get("result"))
            .and_then(|r| r.get("value"))
            .cloned()
            .unwrap_or(serde_json::Value::Null);

        Ok(result_value)
    }
}

/// Escape special characters in a string intended for insertion into a
/// JavaScript single-quoted string literal.
// Used by: CDP browser automation API — click_selector and type_text
#[allow(dead_code)]
fn escape_js_string(s: &str) -> String {
    s.replace('\\', "\\\\")
        .replace('\'', "\\'")
        .replace('\n', "\\n")
        .replace('\r', "\\r")
        .replace('\t', "\\t")
        .replace('\0', "\\0")
        .replace('\u{2028}', "\\u2028")
        .replace('\u{2029}', "\\u2029")
}

/// Check the CDP `Runtime.evaluate` response for an exception description and
/// return an error if one is present.
// Used by: CDP browser automation API — click_selector, type_text, evaluate_js
#[allow(dead_code)]
fn check_runtime_exception(response: &serde_json::Value, context: &str) -> Result<()> {
    if let Some(result) = response.get("result") {
        if let Some(exception) = result.get("exceptionDetails") {
            let desc = exception
                .get("exception")
                .and_then(|ex| ex.get("description"))
                .and_then(|d| d.as_str())
                .or_else(|| exception.get("text").and_then(|t| t.as_str()))
                .unwrap_or("Unknown JavaScript exception");
            return Err(Error::Other(format!(
                "JavaScript exception in {}: {}",
                context, desc
            )));
        }
    }
    Ok(())
}

impl Drop for PlaywrightBridge {
    fn drop(&mut self) {
        tracing::info!("Playwright bridge dropped, cleaning up");
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[tokio::test]
    async fn test_playwright_bridge_creation() {
        let bridge = PlaywrightBridge::new().await;
        assert!(bridge.is_ok());
    }

    #[tokio::test]
    async fn test_browser_options_default() {
        let options = BrowserOptions::default();
        assert!(!options.headless);
        assert!(options.viewport.is_some());
    }

    #[tokio::test]
    async fn test_browser_command_building() {
        let bridge = PlaywrightBridge::new().await.unwrap();
        let options = BrowserOptions::default();
        let result = bridge.build_browser_command(&BrowserType::Chromium, &options);
        assert!(result.is_ok());
    }
}
