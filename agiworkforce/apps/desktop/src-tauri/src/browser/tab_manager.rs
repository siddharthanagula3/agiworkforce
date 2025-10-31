use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use std::path::PathBuf;
use std::sync::Arc;
use tokio::sync::Mutex;

use crate::error::{Error, Result};

/// Tab/Page identifier
pub type TabId = String;

/// Tab information
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct TabInfo {
    pub id: TabId,
    pub url: String,
    pub title: String,
    pub favicon: Option<String>,
    pub loading: bool,
    pub created_at: u64,
}

/// Navigation options
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

/// Wait until condition for navigation
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum WaitUntil {
    Load,
    DomContentLoaded,
    NetworkIdle,
}

/// Screenshot options
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

/// Image format for screenshots
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum ImageFormat {
    Png,
    Jpeg,
}

/// Tab/Page manager
pub struct TabManager {
    tabs: Arc<Mutex<HashMap<TabId, TabInfo>>>,
    active_tab: Arc<Mutex<Option<TabId>>>,
}

impl TabManager {
    /// Create a new tab manager
    pub fn new() -> Self {
        Self {
            tabs: Arc::new(Mutex::new(HashMap::new())),
            active_tab: Arc::new(Mutex::new(None)),
        }
    }

    /// Open a new tab with URL
    pub async fn open_tab(&self, url: &str) -> Result<TabId> {
        tracing::info!("Opening new tab: {}", url);

        // Generate unique tab ID
        let tab_id = uuid::Uuid::new_v4().to_string();

        // Create tab info
        let tab_info = TabInfo {
            id: tab_id.clone(),
            url: url.to_string(),
            title: "Loading...".to_string(),
            favicon: None,
            loading: true,
            created_at: chrono::Utc::now().timestamp_millis() as u64,
        };

        // Store tab
        let mut tabs = self.tabs.lock().await;
        tabs.insert(tab_id.clone(), tab_info);

        // Set as active if first tab
        let mut active = self.active_tab.lock().await;
        if active.is_none() {
            *active = Some(tab_id.clone());
        }

        tracing::info!("Tab opened with ID: {}", tab_id);
        Ok(tab_id)
    }

    /// Close a tab by ID
    pub async fn close_tab(&self, id: &TabId) -> Result<()> {
        tracing::info!("Closing tab: {}", id);

        let mut tabs = self.tabs.lock().await;
        tabs.remove(id)
            .ok_or_else(|| Error::Other(format!("Tab not found: {}", id)))?;

        // If this was the active tab, clear it
        let mut active = self.active_tab.lock().await;
        if active.as_ref() == Some(id) {
            *active = None;
        }

        tracing::info!("Tab closed: {}", id);
        Ok(())
    }

    /// Switch to a tab by ID
    pub async fn switch_to_tab(&self, id: &TabId) -> Result<()> {
        tracing::info!("Switching to tab: {}", id);

        // Verify tab exists
        let tabs = self.tabs.lock().await;
        if !tabs.contains_key(id) {
            return Err(Error::Other(format!("Tab not found: {}", id)));
        }
        drop(tabs);

        // Set as active
        let mut active = self.active_tab.lock().await;
        *active = Some(id.clone());

        tracing::info!("Switched to tab: {}", id);
        Ok(())
    }

    /// Get all open tabs
    pub async fn list_tabs(&self) -> Result<Vec<TabInfo>> {
        let tabs = self.tabs.lock().await;
        let mut tab_list: Vec<TabInfo> = tabs.values().cloned().collect();

        // Sort by creation time
        tab_list.sort_by_key(|t| t.created_at);

        Ok(tab_list)
    }

    /// Get current active tab
    pub async fn get_active_tab(&self) -> Result<Option<TabInfo>> {
        let active = self.active_tab.lock().await;
        if let Some(tab_id) = active.as_ref() {
            let tabs = self.tabs.lock().await;
            Ok(tabs.get(tab_id).cloned())
        } else {
            Ok(None)
        }
    }

    /// Navigate to URL in a tab
    pub async fn navigate(&self, id: &TabId, url: &str, options: NavigationOptions) -> Result<()> {
        tracing::info!("Navigating tab {} to {}", id, url);

        // Get tab
        let mut tabs = self.tabs.lock().await;
        let tab = tabs
            .get_mut(id)
            .ok_or_else(|| Error::Other(format!("Tab not found: {}", id)))?;

        // Update URL and mark as loading
        tab.url = url.to_string();
        tab.loading = true;

        // In production, send CDP command to navigate
        // For now, simulate navigation
        tokio::time::sleep(tokio::time::Duration::from_millis(100)).await;

        tab.loading = false;
        tab.title = "Page Title".to_string(); // Would be extracted from actual page

        tracing::info!("Navigation complete: {}", url);
        Ok(())
    }

    /// Go back in navigation history
    pub async fn go_back(&self, id: &TabId) -> Result<()> {
        tracing::info!("Going back in tab: {}", id);

        // Verify tab exists
        let tabs = self.tabs.lock().await;
        if !tabs.contains_key(id) {
            return Err(Error::Other(format!("Tab not found: {}", id)));
        }

        // In production, send CDP command to go back
        tracing::info!("Went back in tab: {}", id);
        Ok(())
    }

    /// Go forward in navigation history
    pub async fn go_forward(&self, id: &TabId) -> Result<()> {
        tracing::info!("Going forward in tab: {}", id);

        // Verify tab exists
        let tabs = self.tabs.lock().await;
        if !tabs.contains_key(id) {
            return Err(Error::Other(format!("Tab not found: {}", id)));
        }

        // In production, send CDP command to go forward
        tracing::info!("Went forward in tab: {}", id);
        Ok(())
    }

    /// Reload the page
    pub async fn reload(&self, id: &TabId) -> Result<()> {
        tracing::info!("Reloading tab: {}", id);

        // Get tab
        let mut tabs = self.tabs.lock().await;
        let tab = tabs
            .get_mut(id)
            .ok_or_else(|| Error::Other(format!("Tab not found: {}", id)))?;

        tab.loading = true;

        // In production, send CDP command to reload
        tokio::time::sleep(tokio::time::Duration::from_millis(100)).await;

        tab.loading = false;

        tracing::info!("Page reloaded: {}", id);
        Ok(())
    }

    /// Get current URL of a tab
    pub async fn get_url(&self, id: &TabId) -> Result<String> {
        let tabs = self.tabs.lock().await;
        let tab = tabs
            .get(id)
            .ok_or_else(|| Error::Other(format!("Tab not found: {}", id)))?;

        Ok(tab.url.clone())
    }

    /// Get page title
    pub async fn get_title(&self, id: &TabId) -> Result<String> {
        let tabs = self.tabs.lock().await;
        let tab = tabs
            .get(id)
            .ok_or_else(|| Error::Other(format!("Tab not found: {}", id)))?;

        Ok(tab.title.clone())
    }

    /// Take a screenshot of the page
    pub async fn screenshot(&self, id: &TabId, options: ScreenshotOptions) -> Result<PathBuf> {
        tracing::info!("Taking screenshot of tab: {}", id);

        // Verify tab exists
        let tabs = self.tabs.lock().await;
        if !tabs.contains_key(id) {
            return Err(Error::Other(format!("Tab not found: {}", id)));
        }
        drop(tabs);

        // Generate screenshot path
        let screenshot_dir = dirs::data_dir()
            .ok_or_else(|| Error::Other("Failed to get data directory".to_string()))?
            .join("agiworkforce")
            .join("screenshots");

        std::fs::create_dir_all(&screenshot_dir)?;

        let extension = match options.format {
            ImageFormat::Png => "png",
            ImageFormat::Jpeg => "jpg",
        };

        let filename = format!("screenshot_{}.{}", uuid::Uuid::new_v4(), extension);
        let screenshot_path = screenshot_dir.join(filename);

        // In production, capture actual screenshot via CDP
        // For now, create a placeholder file
        std::fs::write(&screenshot_path, b"Screenshot placeholder")?;

        tracing::info!("Screenshot saved to: {:?}", screenshot_path);
        Ok(screenshot_path)
    }

    /// Wait for page load event
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
        manager.open_tab("https://example.com").await.unwrap();
        manager.open_tab("https://google.com").await.unwrap();

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
