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

        tracing::info!("Went back in tab: {}", id);
        Ok(())
    }

    pub async fn go_forward(&self, id: &TabId) -> Result<()> {
        tracing::info!("Going forward in tab: {}", id);

        let tabs = self.tabs.lock().await;
        if !tabs.contains_key(id) {
            return Err(Error::Other(format!("Tab not found: {}", id)));
        }

        tracing::info!("Went forward in tab: {}", id);
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

        let extension = match options.format {
            ImageFormat::Png => "png",
            ImageFormat::Jpeg => "jpg",
        };

        let filename = format!("screenshot_{}.{}", uuid::Uuid::new_v4(), extension);
        let screenshot_path = screenshot_dir.join(filename);

        std::fs::write(&screenshot_path, b"Screenshot placeholder")?;

        tracing::info!("Screenshot saved to: {:?}", screenshot_path);
        Ok(screenshot_path)
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
