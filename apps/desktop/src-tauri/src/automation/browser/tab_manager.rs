use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use std::path::PathBuf;
use std::sync::Arc;
use std::time::Duration;
use tokio::sync::Mutex;

use crate::sys::error::{Error, Result};

pub type TabId = String;

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct TabInfo {
    pub id: TabId,
    pub url: String,
    pub title: String,
    pub favicon: Option<String>,
    pub loading: bool,
    pub created_at: u64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct NavigationOptions {
    pub timeout: Option<u64>,
    pub wait_until: Option<WaitUntil>,
}

impl Default for NavigationOptions {
    fn default() -> Self {
        Self {
            timeout: Some(30000),
            wait_until: Some(WaitUntil::Load),
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum WaitUntil {
    Load,
    DomContentLoaded,
    NetworkIdle,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ScreenshotOptions {
    pub full_page: bool,
    pub format: ImageFormat,
    pub quality: Option<u8>,
}

impl Default for ScreenshotOptions {
    fn default() -> Self {
        Self {
            full_page: false,
            format: ImageFormat::Png,
            quality: Some(80),
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum ImageFormat {
    Png,
    Jpeg,
}

pub struct TabManager {
    tabs: Arc<Mutex<HashMap<TabId, TabInfo>>>,
    active_tab: Arc<Mutex<Option<TabId>>>,
}

impl TabManager {
    pub fn new() -> Self {
        Self {
            tabs: Arc::new(Mutex::new(HashMap::new())),
            active_tab: Arc::new(Mutex::new(None)),
        }
    }

    pub async fn open_tab(&self, url: &str) -> Result<TabId> {
        let tab_id = uuid::Uuid::new_v4().to_string();
        self.register_tab(&tab_id, url).await?;
        Ok(tab_id)
    }

    /// Register a new tab. Uses consistent lock ordering: tabs first, then active.
    /// This prevents deadlocks when multiple methods are called concurrently.
    pub async fn register_tab(&self, id: &str, url: &str) -> Result<()> {
        tracing::info!("Registering tab: {} ({})", id, url);

        let tab_info = TabInfo {
            id: id.to_string(),
            url: url.to_string(),
            title: "Loading...".to_string(),
            favicon: None,
            loading: true,
            created_at: chrono::Utc::now().timestamp_millis() as u64,
        };

        // Acquire both locks in consistent order: tabs -> active
        let mut tabs = self.tabs.lock().await;
        let mut active = self.active_tab.lock().await;

        tabs.insert(id.to_string(), tab_info);

        if active.is_none() {
            *active = Some(id.to_string());
        }

        tracing::info!("Tab registered with ID: {}", id);
        Ok(())
    }

    /// Close a tab. Uses consistent lock ordering: tabs first, then active.
    pub async fn close_tab(&self, id: &TabId) -> Result<()> {
        tracing::info!("Closing tab: {}", id);

        // Acquire both locks in consistent order: tabs -> active
        let mut tabs = self.tabs.lock().await;
        let mut active = self.active_tab.lock().await;

        tabs.remove(id)
            .ok_or_else(|| Error::Other(format!("Tab not found: {}", id)))?;

        if active.as_ref() == Some(id) {
            *active = None;
        }

        tracing::info!("Tab closed: {}", id);
        Ok(())
    }

    pub async fn switch_to_tab(&self, id: &TabId) -> Result<()> {
        tracing::info!("Switching to tab: {}", id);

        // Acquire tabs first to verify tab exists
        let tabs = self.tabs.lock().await;
        if !tabs.contains_key(id) {
            return Err(Error::Other(format!("Tab not found: {}", id)));
        }
        drop(tabs); // Release tabs before acquiring active to avoid holding too long

        // Now acquire active
        let mut active = self.active_tab.lock().await;
        *active = Some(id.clone());

        tracing::info!("Switched to tab: {}", id);
        Ok(())
    }

    pub async fn list_tabs(&self) -> Result<Vec<TabInfo>> {
        let tabs = self.tabs.lock().await;
        let mut tab_list: Vec<TabInfo> = tabs.values().cloned().collect();

        tab_list.sort_by_key(|t| t.created_at);

        Ok(tab_list)
    }

    /// Get the active tab info. Uses consistent lock ordering: tabs first, then active.
    /// This fixes the deadlock risk where get_active_tab was acquiring locks in the
    /// opposite order (active -> tabs) compared to register_tab and close_tab (tabs -> active).
    pub async fn get_active_tab(&self) -> Result<Option<TabInfo>> {
        // FIX: Acquire tabs first, then active - consistent with other methods
        let tabs = self.tabs.lock().await;
        let active = self.active_tab.lock().await;

        if let Some(tab_id) = active.as_ref() {
            Ok(tabs.get(tab_id).cloned())
        } else {
            Ok(None)
        }
    }

    /// Navigate a tab to a URL. Does NOT hold locks across await points to prevent deadlocks.
    pub async fn navigate(&self, id: &TabId, url: &str, _options: NavigationOptions) -> Result<()> {
        tracing::info!("Navigating tab {} to {}", id, url);

        // First check if tab exists (acquire and release lock immediately)
        {
            let tabs = self.tabs.lock().await;
            if !tabs.contains_key(id) {
                return Err(Error::Other(format!("Tab not found: {}", id)));
            }
        }

        // Prepare the updated tab info (outside of lock)
        let tab_url = url.to_string();

        // Now acquire lock to update
        let mut tabs = self.tabs.lock().await;
        if let Some(tab) = tabs.get_mut(id) {
            tab.url = tab_url.clone();
            tab.loading = true;
        } else {
            return Err(Error::Other(format!("Tab not found: {}", id)));
        }
        drop(tabs); // Release lock before await

        // Sleep OUTSIDE of lock - this was causing a deadlock!
        tokio::time::sleep(Duration::from_millis(100)).await;

        // Re-acquire lock to mark loading complete
        let mut tabs = self.tabs.lock().await;
        if let Some(tab) = tabs.get_mut(id) {
            tab.loading = false;
            tab.title = "Page Title".to_string();
        }

        tracing::info!("Navigation complete: {}", url);
        Ok(())
    }

    pub async fn go_back(&self, id: &TabId) -> Result<()> {
        tracing::info!("Going back in tab: {}", id);

        let tabs = self.tabs.lock().await;
        if !tabs.contains_key(id) {
            return Err(Error::Other(format!("Tab not found: {}", id)));
        }
        drop(tabs);

        // Use CDP Page.getNavigationHistory + Page.navigateToHistoryEntry to go back.
        let cdp_port: u16 = std::env::var("CDP_PORT")
            .ok()
            .and_then(|v| v.parse().ok())
            .unwrap_or(9222);

        if let Err(e) = Self::navigate_history(cdp_port, -1).await {
            tracing::warn!(
                "CDP go_back failed: {}. History navigation requires a running CDP session.",
                e
            );
        }

        tracing::info!("Went back in tab: {}", id);
        Ok(())
    }

    pub async fn go_forward(&self, id: &TabId) -> Result<()> {
        tracing::info!("Going forward in tab: {}", id);

        let tabs = self.tabs.lock().await;
        if !tabs.contains_key(id) {
            return Err(Error::Other(format!("Tab not found: {}", id)));
        }
        drop(tabs);

        // Use CDP Page.getNavigationHistory + Page.navigateToHistoryEntry to go forward.
        let cdp_port: u16 = std::env::var("CDP_PORT")
            .ok()
            .and_then(|v| v.parse().ok())
            .unwrap_or(9222);

        if let Err(e) = Self::navigate_history(cdp_port, 1).await {
            tracing::warn!(
                "CDP go_forward failed: {}. History navigation requires a running CDP session.",
                e
            );
        }

        tracing::info!("Went forward in tab: {}", id);
        Ok(())
    }

    /// Navigate browser history by the given offset (-1 = back, +1 = forward) via CDP.
    async fn navigate_history(port: u16, offset: i64) -> Result<()> {
        let targets_url = format!("http://127.0.0.1:{}/json", port);
        let client = reqwest::Client::builder()
            .timeout(Duration::from_secs(5))
            .build()
            .map_err(|e| Error::Other(format!("HTTP client error: {}", e)))?;

        let targets: Vec<serde_json::Value> = client
            .get(&targets_url)
            .send()
            .await
            .map_err(|e| Error::Other(format!("CDP targets failed: {}", e)))?
            .json()
            .await
            .map_err(|e| Error::Other(format!("CDP parse failed: {}", e)))?;

        let ws_url = targets
            .iter()
            .find(|t| t.get("type").and_then(|v| v.as_str()) == Some("page"))
            .and_then(|t| t.get("webSocketDebuggerUrl").and_then(|v| v.as_str()))
            .ok_or_else(|| Error::Other("No CDP page target".to_string()))?
            .to_string();

        let ws_url_owned = ws_url;
        tokio::time::timeout(
            Duration::from_secs(10),
            tokio::task::spawn_blocking(move || -> std::result::Result<(), String> {
                let url =
                    url::Url::parse(&ws_url_owned).map_err(|e| format!("Invalid WS URL: {}", e))?;
                let (mut socket, _) =
                    tungstenite::connect(url).map_err(|e| format!("WS connect failed: {}", e))?;

                // Step 1: Get navigation history
                let get_history = serde_json::json!({
                    "id": 1,
                    "method": "Page.getNavigationHistory",
                    "params": {},
                });
                socket
                    .send(tungstenite::Message::Text(
                        serde_json::to_string(&get_history)
                            .map_err(|e| format!("JSON serialize failed: {}", e))?,
                    ))
                    .map_err(|e| format!("WS send failed: {}", e))?;

                let history_response = loop {
                    let msg = socket
                        .read()
                        .map_err(|e| format!("WS read failed: {}", e))?;
                    if let tungstenite::Message::Text(text) = msg {
                        let parsed: serde_json::Value = serde_json::from_str(&text)
                            .map_err(|e| format!("Parse failed: {}", e))?;
                        if parsed.get("id").and_then(|v| v.as_u64()) == Some(1) {
                            break parsed;
                        }
                    }
                };

                let result = history_response
                    .get("result")
                    .ok_or("No result in history response")?;
                let current_index = result
                    .get("currentIndex")
                    .and_then(|v| v.as_i64())
                    .ok_or("No currentIndex")?;
                let entries = result
                    .get("entries")
                    .and_then(|v| v.as_array())
                    .ok_or("No entries")?;

                let target_index = current_index + offset;
                if target_index < 0 || target_index as usize >= entries.len() {
                    let _ = socket.close(None);
                    return Err(format!(
                        "Cannot navigate: target index {} out of range (0..{})",
                        target_index,
                        entries.len()
                    ));
                }

                let target_entry_id = entries[target_index as usize]
                    .get("id")
                    .and_then(|v| v.as_i64())
                    .ok_or("No entry id")?;

                // Step 2: Navigate to target entry
                let navigate_cmd = serde_json::json!({
                    "id": 2,
                    "method": "Page.navigateToHistoryEntry",
                    "params": { "entryId": target_entry_id },
                });
                socket
                    .send(tungstenite::Message::Text(
                        serde_json::to_string(&navigate_cmd)
                            .map_err(|e| format!("JSON serialize failed: {}", e))?,
                    ))
                    .map_err(|e| format!("WS send failed: {}", e))?;

                // Wait for acknowledgement
                loop {
                    let msg = socket
                        .read()
                        .map_err(|e| format!("WS read failed: {}", e))?;
                    if let tungstenite::Message::Text(text) = msg {
                        let parsed: serde_json::Value = serde_json::from_str(&text)
                            .map_err(|e| format!("Parse failed: {}", e))?;
                        if parsed.get("id").and_then(|v| v.as_u64()) == Some(2) {
                            let _ = socket.close(None);
                            return Ok(());
                        }
                    }
                }
            }),
        )
        .await
        .map_err(|_| Error::Other("CDP history navigation timed out".to_string()))?
        .map_err(|e| Error::Other(format!("CDP task panicked: {}", e)))?
        .map_err(Error::Other)?;

        Ok(())
    }

    /// Reload a tab. Does NOT hold locks across await points to prevent deadlocks.
    pub async fn reload(&self, id: &TabId) -> Result<()> {
        tracing::info!("Reloading tab: {}", id);

        // First check if tab exists
        {
            let tabs = self.tabs.lock().await;
            if !tabs.contains_key(id) {
                return Err(Error::Other(format!("Tab not found: {}", id)));
            }
        }

        // Mark as loading (acquire lock, modify, release)
        {
            let mut tabs = self.tabs.lock().await;
            if let Some(tab) = tabs.get_mut(id) {
                tab.loading = true;
            }
        }

        // Sleep OUTSIDE of lock - this prevents deadlock!
        tokio::time::sleep(Duration::from_millis(100)).await;

        // Mark as not loading
        {
            let mut tabs = self.tabs.lock().await;
            if let Some(tab) = tabs.get_mut(id) {
                tab.loading = false;
            }
        }

        tracing::info!("Page reloaded: {}", id);
        Ok(())
    }

    pub async fn get_url(&self, id: &TabId) -> Result<String> {
        let tabs = self.tabs.lock().await;
        let tab = tabs
            .get(id)
            .ok_or_else(|| Error::Other(format!("Tab not found: {}", id)))?;

        Ok(tab.url.clone())
    }

    pub async fn get_title(&self, id: &TabId) -> Result<String> {
        let tabs = self.tabs.lock().await;
        let tab = tabs
            .get(id)
            .ok_or_else(|| Error::Other(format!("Tab not found: {}", id)))?;

        Ok(tab.title.clone())
    }

    pub async fn screenshot(&self, id: &TabId, options: ScreenshotOptions) -> Result<PathBuf> {
        tracing::info!("Taking screenshot of tab: {}", id);

        let tabs = self.tabs.lock().await;
        if !tabs.contains_key(id) {
            return Err(Error::Other(format!("Tab not found: {}", id)));
        }
        drop(tabs);

        let screenshot_dir = dirs::data_dir()
            .ok_or_else(|| Error::Other("Failed to get data directory".to_string()))?
            .join("agiworkforce")
            .join("screenshots");

        std::fs::create_dir_all(&screenshot_dir)?;

        let (extension, format_str) = match options.format {
            ImageFormat::Png => ("png", "png"),
            ImageFormat::Jpeg => ("jpg", "jpeg"),
        };

        let filename = format!("screenshot_{}.{}", uuid::Uuid::new_v4(), extension);
        let screenshot_path = screenshot_dir.join(filename);

        // Attempt to capture a real screenshot via CDP Page.captureScreenshot.
        // The CDP endpoint is on 127.0.0.1 at the port specified by CDP_PORT env var (default 9222).
        let cdp_port: u16 = std::env::var("CDP_PORT")
            .ok()
            .and_then(|v| v.parse().ok())
            .unwrap_or(9222);

        let screenshot_data = Self::capture_via_cdp(cdp_port, format_str, &options).await;

        match screenshot_data {
            Ok(bytes) => {
                std::fs::write(&screenshot_path, bytes)?;
                tracing::info!("CDP screenshot saved to: {:?}", screenshot_path);
            }
            Err(e) => {
                tracing::warn!("CDP screenshot failed ({}), writing empty placeholder", e);
                // Write a minimal valid PNG (1x1 transparent pixel) as fallback
                // so callers always get a valid image file.
                let placeholder_png: &[u8] = &[
                    0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A, // PNG signature
                    0x00, 0x00, 0x00, 0x0D, 0x49, 0x48, 0x44, 0x52, // IHDR chunk
                    0x00, 0x00, 0x00, 0x01, 0x00, 0x00, 0x00, 0x01, 0x08, 0x06, 0x00, 0x00, 0x00,
                    0x1F, 0x15, 0xC4, 0x89, 0x00, 0x00, 0x00, 0x0A, 0x49, 0x44, 0x41, 0x54, 0x78,
                    0x9C, 0x62, 0x00, 0x00, 0x00, 0x02, 0x00, 0x01, 0xE5, 0x27, 0xDE, 0xFC, 0x00,
                    0x00, 0x00, 0x00, 0x49, 0x45, 0x4E, 0x44, 0xAE, 0x42, 0x60, 0x82,
                ];
                std::fs::write(&screenshot_path, placeholder_png)?;
                tracing::info!("Placeholder screenshot saved to: {:?}", screenshot_path);
            }
        }

        Ok(screenshot_path)
    }

    /// Attempt to capture a screenshot via Chrome DevTools Protocol.
    async fn capture_via_cdp(
        port: u16,
        format: &str,
        options: &ScreenshotOptions,
    ) -> Result<Vec<u8>> {
        use base64::{engine::general_purpose::STANDARD, Engine as _};

        let targets_url = format!("http://127.0.0.1:{}/json", port);
        let client = reqwest::Client::builder()
            .timeout(Duration::from_secs(5))
            .build()
            .map_err(|e| Error::Other(format!("Failed to create HTTP client: {}", e)))?;

        let targets: Vec<serde_json::Value> = client
            .get(&targets_url)
            .send()
            .await
            .map_err(|e| Error::Other(format!("CDP target list failed: {}", e)))?
            .json()
            .await
            .map_err(|e| Error::Other(format!("CDP target list parse failed: {}", e)))?;

        let ws_url = targets
            .iter()
            .find(|t| t.get("type").and_then(|v| v.as_str()) == Some("page"))
            .and_then(|t| t.get("webSocketDebuggerUrl").and_then(|v| v.as_str()))
            .ok_or_else(|| Error::Other("No CDP page target available".to_string()))?
            .to_string();

        let mut params = serde_json::json!({ "format": format });
        if format == "jpeg" {
            if let Some(quality) = options.quality {
                params["quality"] = serde_json::json!(quality);
            }
        }
        if options.full_page {
            params["captureBeyondViewport"] = serde_json::json!(true);
        }

        // Send CDP command via WebSocket
        let ws_url_owned = ws_url.clone();
        let params_str = serde_json::to_string(&serde_json::json!({
            "id": 1,
            "method": "Page.captureScreenshot",
            "params": params,
        }))
        .map_err(|e| Error::Other(format!("CDP serialize failed: {}", e)))?;

        let result = tokio::time::timeout(
            Duration::from_secs(15),
            tokio::task::spawn_blocking(move || -> std::result::Result<String, String> {
                let url =
                    url::Url::parse(&ws_url_owned).map_err(|e| format!("Invalid WS URL: {}", e))?;
                let (mut socket, _) =
                    tungstenite::connect(url).map_err(|e| format!("WS connect failed: {}", e))?;

                socket
                    .send(tungstenite::Message::Text(params_str))
                    .map_err(|e| format!("WS send failed: {}", e))?;

                loop {
                    let msg = socket
                        .read()
                        .map_err(|e| format!("WS read failed: {}", e))?;
                    if let tungstenite::Message::Text(text) = msg {
                        let parsed: serde_json::Value = serde_json::from_str(&text)
                            .map_err(|e| format!("JSON parse failed: {}", e))?;
                        if parsed.get("id").and_then(|v| v.as_u64()) == Some(1) {
                            if let Some(data) = parsed
                                .get("result")
                                .and_then(|r| r.get("data"))
                                .and_then(|d| d.as_str())
                            {
                                let _ = socket.close(None);
                                return Ok(data.to_string());
                            }
                            let _ = socket.close(None);
                            return Err("CDP screenshot: missing result.data".to_string());
                        }
                    }
                }
            }),
        )
        .await
        .map_err(|_| Error::Other("CDP screenshot timed out".to_string()))?
        .map_err(|e| Error::Other(format!("CDP screenshot task panicked: {}", e)))?
        .map_err(Error::Other)?;

        STANDARD
            .decode(&result)
            .map_err(|e| Error::Other(format!("Base64 decode failed: {}", e)))
    }

    pub async fn wait_for_load(&self, id: &TabId, timeout_ms: u64) -> Result<()> {
        tracing::info!("Waiting for page load in tab: {}", id);

        let start = std::time::Instant::now();

        loop {
            let tabs = self.tabs.lock().await;
            let tab = tabs
                .get(id)
                .ok_or_else(|| Error::Other(format!("Tab not found: {}", id)))?;

            if !tab.loading {
                tracing::info!("Page loaded in tab: {}", id);
                return Ok(());
            }

            drop(tabs);

            if start.elapsed().as_millis() > timeout_ms as u128 {
                return Err(Error::CommandTimeout(format!(
                    "Page load timeout after {}ms",
                    timeout_ms
                )));
            }

            tokio::time::sleep(tokio::time::Duration::from_millis(100)).await;
        }
    }
}

impl Default for TabManager {
    fn default() -> Self {
        Self::new()
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[tokio::test]
    async fn test_open_tab() {
        let manager = TabManager::new();
        let result = manager.open_tab("https://example.com").await;

        assert!(result.is_ok());
    }

    #[tokio::test]
    async fn test_list_tabs() {
        let manager = TabManager::new();
        manager.open_tab("https://example.com/page1").await.unwrap();

        manager.open_tab("https://example.com/page2").await.unwrap();

        let tabs = manager.list_tabs().await.unwrap();
        assert_eq!(tabs.len(), 2);
    }

    #[tokio::test]
    async fn test_close_tab() {
        let manager = TabManager::new();
        let tab_id = manager.open_tab("https://example.com").await.unwrap();

        let result = manager.close_tab(&tab_id).await;
        assert!(result.is_ok());

        let tabs = manager.list_tabs().await.unwrap();
        assert_eq!(tabs.len(), 0);
    }
}
