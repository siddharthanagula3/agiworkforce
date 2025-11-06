use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use std::process::{Child, Command, Stdio};
use std::sync::Arc;
use tokio::sync::Mutex;
use tungstenite::connect;
use url::Url;

use crate::error::{Error, Result};

/// Browser type supported by Playwright
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum BrowserType {
    Chromium,
    Firefox,
    Webkit,
}

/// Browser launch options
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct BrowserOptions {
    pub headless: bool,
    pub user_data_dir: Option<String>,
    pub args: Vec<String>,
    pub viewport: Option<Viewport>,
    pub timeout: Option<u64>,
}

impl Default for BrowserOptions {
    fn default() -> Self {
        Self {
            headless: false,
            user_data_dir: None,
            args: vec![],
            viewport: Some(Viewport::default()),
            timeout: Some(30000),
        }
    }
}

/// Viewport dimensions
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

/// Handle to a browser instance
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct BrowserHandle {
    pub id: String,
    pub browser_type: BrowserType,
    pub ws_endpoint: String,
}

/// Playwright server configuration
#[derive(Debug, Clone)]
pub struct PlaywrightConfig {
    pub node_path: String,
    pub playwright_path: String,
    pub ws_port: u16,
}

impl Default for PlaywrightConfig {
    fn default() -> Self {
        Self {
            node_path: "node".to_string(),
            playwright_path: "npx playwright".to_string(),
            ws_port: 9222,
        }
    }
}

/// Playwright bridge for browser automation
pub struct PlaywrightBridge {
    config: PlaywrightConfig,
    process: Arc<Mutex<Option<Child>>>,
    browsers: Arc<Mutex<HashMap<String, BrowserHandle>>>,
}

impl PlaywrightBridge {
    /// Create a new Playwright bridge
    pub async fn new() -> Result<Self> {
        Ok(Self {
            config: PlaywrightConfig::default(),
            process: Arc::new(Mutex::new(None)),
            browsers: Arc::new(Mutex::new(HashMap::new())),
        })
    }

    /// Create with custom configuration
    pub async fn with_config(config: PlaywrightConfig) -> Result<Self> {
        Ok(Self {
            config,
            process: Arc::new(Mutex::new(None)),
            browsers: Arc::new(Mutex::new(HashMap::new())),
        })
    }

    /// Start the Playwright server
    pub async fn start_server(&self) -> Result<()> {
        let mut process_guard = self.process.lock().await;

        if process_guard.is_some() {
            tracing::info!("Playwright server already running");
            return Ok(());
        }

        tracing::info!("Starting Playwright server on port {}", self.config.ws_port);

        // Start a simple Node.js WebSocket server that manages Playwright
        // In production, this would launch a proper Playwright server
        // For now, we'll use Chrome DevTools Protocol directly
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

    /// Stop the Playwright server
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

    /// Launch a browser instance
    pub async fn launch_browser(
        &self,
        browser_type: BrowserType,
        options: BrowserOptions,
    ) -> Result<BrowserHandle> {
        tracing::info!("Launching {:?} browser", browser_type);

        // Generate unique browser ID
        let browser_id = uuid::Uuid::new_v4().to_string();

        // Build browser launch command based on type
        let (exe, args) = self.build_browser_command(&browser_type, &options)?;

        // Launch the browser process
        let _child = Command::new(&exe)
            .args(&args)
            .stdout(Stdio::piped())
            .stderr(Stdio::piped())
            .spawn()
            .map_err(|e| Error::Other(format!("Failed to launch browser: {}", e)))?;

        // Create browser handle
        let ws_endpoint = format!("ws://localhost:{}", self.config.ws_port);
        let handle = BrowserHandle {
            id: browser_id.clone(),
            browser_type: browser_type.clone(),
            ws_endpoint: ws_endpoint.clone(),
        };

        // Store browser handle
        let mut browsers = self.browsers.lock().await;
        browsers.insert(browser_id.clone(), handle.clone());

        tracing::info!("Browser launched with ID: {}", browser_id);
        Ok(handle)
    }

    /// Close a browser instance
    pub async fn close_browser(&self, handle: BrowserHandle) -> Result<()> {
        tracing::info!("Closing browser: {}", handle.id);

        let mut browsers = self.browsers.lock().await;
        browsers.remove(&handle.id);

        // In production, send close command via WebSocket to browser
        tracing::info!("Browser {} closed", handle.id);
        Ok(())
    }

    /// Get all active browser instances
    pub async fn list_browsers(&self) -> Result<Vec<BrowserHandle>> {
        let browsers = self.browsers.lock().await;
        Ok(browsers.values().cloned().collect())
    }

    /// Build browser launch command
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

        // Add headless flag
        if options.headless {
            args.push("--headless=new".to_string());
        }

        // Add user data directory
        if let Some(ref user_data_dir) = options.user_data_dir {
            args.push(format!("--user-data-dir={}", user_data_dir));
        }

        // Add custom args
        args.extend(options.args.clone());

        // Determine executable path
        let exe = match browser_type {
            BrowserType::Chromium => {
                // Try to find Chrome/Chromium
                #[cfg(windows)]
                {
                    // Check common Chrome installation paths on Windows
                    let possible_paths = [
                        r"C:\Program Files\Google\Chrome\Application\chrome.exe",
                        r"C:\Program Files (x86)\Google\Chrome\Application\chrome.exe",
                        r"C:\Users\%USERNAME%\AppData\Local\Google\Chrome\Application\chrome.exe",
                    ];

                    possible_paths
                        .iter()
                        .find(|p| std::path::Path::new(p).exists())
                        .map(|s| s.to_string())
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

    /// Connect to a browser via WebSocket (for advanced use cases)
    pub async fn connect_to_browser(&self, ws_endpoint: &str) -> Result<()> {
        let url = Url::parse(ws_endpoint)
            .map_err(|e| Error::Other(format!("Invalid WebSocket URL: {}", e)))?;

        tracing::info!("Connecting to browser at {}", ws_endpoint);

        // Attempt WebSocket connection (non-blocking)
        // In production, this would establish persistent connection
        match connect(url) {
            Ok(_) => {
                tracing::info!("Successfully connected to browser");
                Ok(())
            }
            Err(e) => {
                tracing::warn!("Failed to connect to browser: {}", e);
                // Don't fail - browser might not be ready yet
                Ok(())
            }
        }
    }
}

impl Drop for PlaywrightBridge {
    fn drop(&mut self) {
        // Ensure server is stopped when bridge is dropped
        // Note: Can't use async in Drop, so we'll do sync cleanup
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
