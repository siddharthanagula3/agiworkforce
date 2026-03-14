pub mod advanced;
pub mod cdp_client;
pub mod dom_operations;
pub mod extension_bridge;
pub mod playwright_bridge;
pub mod semantic;
pub mod tab_manager;

pub use advanced::*;
pub use cdp_client::CdpClient;
pub use dom_operations::*;
pub use extension_bridge::ExtensionBridge;
pub use playwright_bridge::*;
pub use semantic::*;
pub use tab_manager::*;

use std::sync::Arc;
use tokio::sync::Mutex;

use crate::sys::error::Result;

pub struct BrowserState {
    pub playwright: Arc<Mutex<PlaywrightBridge>>,
    pub tab_manager: Arc<Mutex<TabManager>>,
    pub extension: Arc<Mutex<ExtensionBridge>>,
    pub cdp_clients: Arc<Mutex<std::collections::HashMap<String, Arc<CdpClient>>>>,
}

impl BrowserState {
    pub async fn new() -> Result<Self> {
        Ok(Self {
            playwright: Arc::new(Mutex::new(PlaywrightBridge::new().await?)),
            tab_manager: Arc::new(Mutex::new(TabManager::new())),
            extension: Arc::new(Mutex::new(ExtensionBridge::new())),
            cdp_clients: Arc::new(Mutex::new(std::collections::HashMap::new())),
        })
    }

    pub async fn get_cdp_client(&self, tab_id: &str) -> Result<Arc<CdpClient>> {
        let mut clients = self.cdp_clients.lock().await;

        if let Some(client) = clients.get(tab_id) {
            return Ok(Arc::clone(client));
        }

        let endpoint = {
            let bridge = self.playwright.lock().await;
            bridge.endpoint()
        };
        let ws_url = endpoint.resolve_page_ws_endpoint(tab_id).await?;
        let client = Arc::new(CdpClient::new(ws_url));

        client.connect().await?;

        clients.insert(tab_id.to_string(), Arc::clone(&client));

        Ok(client)
    }
}
