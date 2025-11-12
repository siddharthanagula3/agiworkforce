// Browser automation modules
pub mod advanced;
pub mod cdp_client;
pub mod dom_operations;
pub mod extension_bridge;
pub mod playwright_bridge;
pub mod tab_manager;

// Re-exports for convenience
// Note: Cookie is exported from advanced, not extension_bridge to avoid ambiguity
pub use advanced::*;
pub use cdp_client::CdpClient;
pub use dom_operations::*;
pub use extension_bridge::{ExtensionBridge, TabInfo};
pub use playwright_bridge::*;
pub use tab_manager::*;

use std::sync::Arc;
use tokio::sync::Mutex;

use crate::error::Result;

/// Global browser automation state
pub struct BrowserState {
    pub playwright: Arc<Mutex<PlaywrightBridge>>,
    pub tab_manager: Arc<Mutex<TabManager>>,
    pub extension: Arc<Mutex<ExtensionBridge>>,
    pub cdp_clients: Arc<Mutex<std::collections::HashMap<String, Arc<CdpClient>>>>,
}

impl BrowserState {
    /// Create a new browser state
    pub async fn new() -> Result<Self> {
        Ok(Self {
            playwright: Arc::new(Mutex::new(PlaywrightBridge::new().await?)),
            tab_manager: Arc::new(Mutex::new(TabManager::new())),
            extension: Arc::new(Mutex::new(ExtensionBridge::new())),
            cdp_clients: Arc::new(Mutex::new(std::collections::HashMap::new())),
        })
    }

    /// Get or create CDP client for a tab
    pub async fn get_cdp_client(&self, tab_id: &str) -> Result<Arc<CdpClient>> {
        let mut clients = self.cdp_clients.lock().await;

        if let Some(client) = clients.get(tab_id) {
            return Ok(Arc::clone(client));
        }

        // Create new CDP client for this tab
        // In production, get the actual WebSocket URL from the browser
        let ws_url = format!("ws://localhost:9222/devtools/page/{}", tab_id);
        let client = Arc::new(CdpClient::new(ws_url));

        // Connect to the browser
        client.connect().await?;

        clients.insert(tab_id.to_string(), Arc::clone(&client));

        Ok(client)
    }
}
