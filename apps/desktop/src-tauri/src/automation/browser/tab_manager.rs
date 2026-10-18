use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use std::sync::Arc;
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

pub struct TabManager {
    tabs: Arc<Mutex<HashMap<TabId, TabInfo>>>,
    active_tab: Arc<Mutex<Option<TabId>>>,
}

// Every method that holds both locks takes `tabs` before `active_tab`; reversing the order
// in one method deadlocks against the others.
impl TabManager {
    pub fn new() -> Self {
        Self {
            tabs: Arc::new(Mutex::new(HashMap::new())),
            active_tab: Arc::new(Mutex::new(None)),
        }
    }

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

        let mut tabs = self.tabs.lock().await;
        let mut active = self.active_tab.lock().await;

        tabs.insert(id.to_string(), tab_info);

        if active.is_none() {
            *active = Some(id.to_string());
        }

        Ok(())
    }

    pub async fn close_tab(&self, id: &TabId) -> Result<()> {
        tracing::info!("Closing tab: {}", id);

        let mut tabs = self.tabs.lock().await;
        let mut active = self.active_tab.lock().await;

        tabs.remove(id)
            .ok_or_else(|| Error::Other(format!("Tab not found: {}", id)))?;

        if active.as_ref() == Some(id) {
            *active = None;
        }

        Ok(())
    }

    pub async fn switch_to_tab(&self, id: &TabId) -> Result<()> {
        tracing::info!("Switching to tab: {}", id);

        let tabs = self.tabs.lock().await;
        if !tabs.contains_key(id) {
            return Err(Error::Other(format!("Tab not found: {}", id)));
        }
        drop(tabs);

        let mut active = self.active_tab.lock().await;
        *active = Some(id.clone());

        Ok(())
    }

    pub async fn list_tabs(&self) -> Result<Vec<TabInfo>> {
        let tabs = self.tabs.lock().await;
        let mut tab_list: Vec<TabInfo> = tabs.values().cloned().collect();

        tab_list.sort_by_key(|t| t.created_at);

        Ok(tab_list)
    }

    pub async fn get_active_tab(&self) -> Result<Option<TabInfo>> {
        let tabs = self.tabs.lock().await;
        let active = self.active_tab.lock().await;

        if let Some(tab_id) = active.as_ref() {
            Ok(tabs.get(tab_id).cloned())
        } else {
            Ok(None)
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
    async fn first_registered_tab_becomes_active() {
        let manager = TabManager::new();
        manager
            .register_tab("target-1", "https://example.com")
            .await
            .unwrap();

        let active = manager.get_active_tab().await.unwrap();
        assert_eq!(active.map(|tab| tab.id).as_deref(), Some("target-1"));
    }

    #[tokio::test]
    async fn test_list_tabs() {
        let manager = TabManager::new();
        manager
            .register_tab("target-1", "https://example.com/page1")
            .await
            .unwrap();
        manager
            .register_tab("target-2", "https://example.com/page2")
            .await
            .unwrap();

        let tabs = manager.list_tabs().await.unwrap();
        assert_eq!(tabs.len(), 2);
    }

    #[tokio::test]
    async fn test_close_tab() {
        let manager = TabManager::new();
        manager
            .register_tab("target-1", "https://example.com")
            .await
            .unwrap();

        let result = manager.close_tab(&"target-1".to_string()).await;
        assert!(result.is_ok());

        let tabs = manager.list_tabs().await.unwrap();
        assert_eq!(tabs.len(), 0);
        assert!(manager.get_active_tab().await.unwrap().is_none());
    }
}
