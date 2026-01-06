//! Native Messaging Host Implementation
//!
//! Handles the native messaging host process that communicates with Chrome extension

use super::*;
use std::io::{stdin, stdout, BufReader, BufWriter};
use tokio::sync::{mpsc, Mutex};

/// Native messaging host that runs as a subprocess
pub struct NativeMessagingHost {
    state: Arc<RwLock<NativeMessagingState>>,
    message_tx: mpsc::Sender<NativeRequest>,
    response_rx: Arc<Mutex<mpsc::Receiver<NativeResponse>>>,
}

impl NativeMessagingHost {
    pub fn new() -> (
        Self,
        mpsc::Receiver<NativeRequest>,
        mpsc::Sender<NativeResponse>,
    ) {
        let (msg_tx, msg_rx) = mpsc::channel(100);
        let (resp_tx, resp_rx) = mpsc::channel(100);

        let host = Self {
            state: Arc::new(RwLock::new(NativeMessagingState::new())),
            message_tx: msg_tx,
            response_rx: Arc::new(Mutex::new(resp_rx)),
        };

        (host, msg_rx, resp_tx)
    }

    /// Run the native messaging host (blocking - reads from stdin)
    pub async fn run_stdio_host(&self) -> Result<()> {
        let mut stdin = BufReader::new(stdin());
        let mut stdout = BufWriter::new(stdout());

        tracing::info!("Native messaging host started");

        loop {
            match read_message(&mut stdin) {
                Ok(request) => {
                    tracing::debug!("Received native message: {:?}", request.id);

                    // Send to message handler
                    if let Err(e) = self.message_tx.send(request.clone()).await {
                        tracing::error!("Failed to forward message: {}", e);
                        continue;
                    }

                    // Wait for response
                    let response = {
                        let mut rx = self.response_rx.lock().await;
                        match rx.recv().await {
                            Some(resp) => resp,
                            None => NativeResponse::error(request.id, "Channel closed"),
                        }
                    };

                    // Send response back to extension
                    if let Err(e) = write_message(&mut stdout, &response) {
                        tracing::error!("Failed to write response: {}", e);
                    }
                }
                Err(e) => {
                    // EOF or error - extension disconnected
                    if e.to_string().contains("EOF") || e.to_string().contains("UnexpectedEof") {
                        tracing::info!("Extension disconnected");
                        break;
                    }
                    tracing::error!("Error reading message: {}", e);
                }
            }
        }

        Ok(())
    }

    pub async fn get_state(&self) -> ConnectionState {
        self.state.read().await.connection_state.clone()
    }

    pub async fn set_connected(&self, extension_id: String) {
        let mut state = self.state.write().await;
        state.connection_state = ConnectionState::Connected;
        state.extension_id = Some(extension_id);
    }

    pub async fn set_disconnected(&self) {
        let mut state = self.state.write().await;
        state.connection_state = ConnectionState::Disconnected;
        state.extension_id = None;
    }
}

impl Default for NativeMessagingHost {
    fn default() -> Self {
        Self::new().0
    }
}

/// Handler for processing native messaging requests
pub struct NativeMessageHandler {
    /// Channel to send browser commands
    browser_tx: mpsc::Sender<BrowserCommand>,
}

/// Commands sent to browser automation
#[derive(Debug, Clone)]
pub enum BrowserCommand {
    Click {
        selector: String,
        tab_id: Option<i32>,
    },
    Type {
        selector: String,
        text: String,
        tab_id: Option<i32>,
    },
    Navigate {
        url: String,
        tab_id: Option<i32>,
    },
    Screenshot {
        tab_id: Option<i32>,
        format: String,
    },
    GetElement {
        selector: String,
        tab_id: Option<i32>,
    },
    GetAccessibilityTree {
        tab_id: Option<i32>,
    },
    GetTabs,
    CreateTab {
        url: String,
    },
    CloseTab {
        tab_id: i32,
    },
    GetCookies {
        url: Option<String>,
    },
    GetPageContent {
        tab_id: Option<i32>,
    },
}

impl NativeMessageHandler {
    pub fn new(browser_tx: mpsc::Sender<BrowserCommand>) -> Self {
        Self { browser_tx }
    }

    /// Process an incoming native message and return a response
    pub async fn handle_message(&self, request: NativeRequest) -> NativeResponse {
        match request.message {
            NativeMessage::Ping => {
                NativeResponse::success(request.id, serde_json::json!({"pong": true}))
            }

            NativeMessage::Connect { extension_id } => {
                tracing::info!("Extension connected: {}", extension_id);
                NativeResponse::success(
                    request.id,
                    serde_json::json!({
                        "connected": true,
                        "version": env!("CARGO_PKG_VERSION")
                    }),
                )
            }

            NativeMessage::Disconnect { reason } => {
                tracing::info!("Extension disconnecting: {:?}", reason);
                NativeResponse::success(request.id, serde_json::json!({"disconnected": true}))
            }

            NativeMessage::Click { selector, tab_id } => {
                match self
                    .browser_tx
                    .send(BrowserCommand::Click { selector, tab_id })
                    .await
                {
                    Ok(_) => {
                        NativeResponse::success(request.id, serde_json::json!({"clicked": true}))
                    }
                    Err(e) => NativeResponse::error(request.id, format!("Failed to click: {}", e)),
                }
            }

            NativeMessage::Type {
                selector,
                text,
                tab_id,
            } => {
                match self
                    .browser_tx
                    .send(BrowserCommand::Type {
                        selector,
                        text,
                        tab_id,
                    })
                    .await
                {
                    Ok(_) => {
                        NativeResponse::success(request.id, serde_json::json!({"typed": true}))
                    }
                    Err(e) => NativeResponse::error(request.id, format!("Failed to type: {}", e)),
                }
            }

            NativeMessage::Navigate { url, tab_id } => {
                match self
                    .browser_tx
                    .send(BrowserCommand::Navigate { url, tab_id })
                    .await
                {
                    Ok(_) => {
                        NativeResponse::success(request.id, serde_json::json!({"navigated": true}))
                    }
                    Err(e) => {
                        NativeResponse::error(request.id, format!("Failed to navigate: {}", e))
                    }
                }
            }

            NativeMessage::Screenshot { tab_id, format } => {
                match self
                    .browser_tx
                    .send(BrowserCommand::Screenshot {
                        tab_id,
                        format: format.unwrap_or_else(|| "png".to_string()),
                    })
                    .await
                {
                    Ok(_) => {
                        NativeResponse::success(request.id, serde_json::json!({"capturing": true}))
                    }
                    Err(e) => {
                        NativeResponse::error(request.id, format!("Failed to capture: {}", e))
                    }
                }
            }

            NativeMessage::GetAccessibilityTree { tab_id } => {
                match self
                    .browser_tx
                    .send(BrowserCommand::GetAccessibilityTree { tab_id })
                    .await
                {
                    Ok(_) => {
                        NativeResponse::success(request.id, serde_json::json!({"fetching": true}))
                    }
                    Err(e) => {
                        NativeResponse::error(request.id, format!("Failed to get tree: {}", e))
                    }
                }
            }

            NativeMessage::GetTabs => match self.browser_tx.send(BrowserCommand::GetTabs).await {
                Ok(_) => NativeResponse::success(request.id, serde_json::json!({"fetching": true})),
                Err(e) => NativeResponse::error(request.id, format!("Failed to get tabs: {}", e)),
            },

            NativeMessage::CreateTab { url } => {
                match self
                    .browser_tx
                    .send(BrowserCommand::CreateTab { url })
                    .await
                {
                    Ok(_) => {
                        NativeResponse::success(request.id, serde_json::json!({"creating": true}))
                    }
                    Err(e) => {
                        NativeResponse::error(request.id, format!("Failed to create tab: {}", e))
                    }
                }
            }

            NativeMessage::GetCookies { url } => {
                match self
                    .browser_tx
                    .send(BrowserCommand::GetCookies { url })
                    .await
                {
                    Ok(_) => {
                        NativeResponse::success(request.id, serde_json::json!({"fetching": true}))
                    }
                    Err(e) => {
                        NativeResponse::error(request.id, format!("Failed to get cookies: {}", e))
                    }
                }
            }

            NativeMessage::GetPageContent { tab_id } => {
                match self
                    .browser_tx
                    .send(BrowserCommand::GetPageContent { tab_id })
                    .await
                {
                    Ok(_) => {
                        NativeResponse::success(request.id, serde_json::json!({"fetching": true}))
                    }
                    Err(e) => {
                        NativeResponse::error(request.id, format!("Failed to get content: {}", e))
                    }
                }
            }

            _ => NativeResponse::error(request.id, "Unsupported message type"),
        }
    }
}

/// Install the native messaging host manifest
pub fn install_native_host_manifest() -> Result<()> {
    let host_name = "com.agiworkforce.native";
    let manifest_path = get_manifest_path(host_name)?;

    // Get the path to the current executable
    let exe_path =
        std::env::current_exe().map_err(|e| anyhow!("Failed to get executable path: {}", e))?;

    let manifest = generate_host_manifest(
        host_name,
        "AGI Workforce Native Messaging Host",
        exe_path
            .to_str()
            .ok_or_else(|| anyhow!("Invalid executable path"))?,
        &[], // Will be populated with actual extension ID
    );

    // Create parent directories if needed
    if let Some(parent) = manifest_path.parent() {
        std::fs::create_dir_all(parent)
            .map_err(|e| anyhow!("Failed to create manifest directory: {}", e))?;
    }

    // Write the manifest
    let manifest_json = serde_json::to_string_pretty(&manifest)
        .map_err(|e| anyhow!("Failed to serialize manifest: {}", e))?;

    std::fs::write(&manifest_path, manifest_json)
        .map_err(|e| anyhow!("Failed to write manifest: {}", e))?;

    tracing::info!(
        "Native messaging host manifest installed at: {:?}",
        manifest_path
    );

    #[cfg(target_os = "windows")]
    {
        // On Windows, also need to add registry key
        // This would require winreg crate
        tracing::warn!("Windows registry setup not implemented - manual registration required");
    }

    Ok(())
}
