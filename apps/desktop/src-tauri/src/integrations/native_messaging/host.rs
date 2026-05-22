// SAFETY: Native messaging on Windows requires unsafe Win32 registry API calls.
#![allow(unsafe_code)]

//! Native Messaging Host Implementation
//!
//! Handles the native messaging host process that communicates with Chrome extension

use super::*;
use rand::RngCore;
use std::collections::HashMap;
use std::io::{stdin, stdout, BufReader, BufWriter};
use std::time::{Duration, Instant, SystemTime, UNIX_EPOCH};
use tokio::sync::{mpsc, Mutex};

const NATIVE_RESPONSE_TIMEOUT_MS: u64 = 15_000;

/// Native messaging host that runs as a subprocess
pub struct NativeMessagingHost {
    state: Arc<RwLock<NativeMessagingState>>,
    message_tx: mpsc::Sender<NativeRequest>,
    response_rx: Arc<Mutex<mpsc::Receiver<NativeResponse>>>,
    session_secret: [u8; 32],
    session_secret_hex: String,
}

impl NativeMessagingHost {
    pub fn new() -> (
        Self,
        mpsc::Receiver<NativeRequest>,
        mpsc::Sender<NativeResponse>,
    ) {
        let (msg_tx, msg_rx) = mpsc::channel(100);
        let (resp_tx, resp_rx) = mpsc::channel(100);
        let mut session_secret = [0_u8; 32];
        rand::rngs::OsRng.fill_bytes(&mut session_secret);

        let host = Self {
            state: Arc::new(RwLock::new(NativeMessagingState::new())),
            message_tx: msg_tx,
            response_rx: Arc::new(Mutex::new(resp_rx)),
            session_secret,
            session_secret_hex: hex::encode(session_secret),
        };

        (host, msg_rx, resp_tx)
    }

    /// Run the native messaging host (blocking - reads from stdin)
    pub async fn run_stdio_host(&self) -> Result<()> {
        let mut stdin = BufReader::new(stdin());
        let mut stdout = BufWriter::new(stdout());
        let mut buffered_responses: HashMap<String, NativeResponse> = HashMap::new();

        tracing::info!("Native messaging host started");

        loop {
            match read_message(&mut stdin) {
                Ok(request) => {
                    tracing::debug!("Received native message: {:?}", request.id);

                    // Send to message handler
                    if let Err(e) = self.message_tx.send(request.clone()).await {
                        tracing::error!("Failed to forward message: {}", e);
                        let response = NativeResponse::error(
                            request.id,
                            format!("Native host forwarding failed: {}", e),
                        );
                        if let Err(write_err) = write_message(&mut stdout, &response) {
                            tracing::error!(
                                "Failed to write forwarding error response: {}",
                                write_err
                            );
                        }
                        continue;
                    }

                    let mut response = self
                        .wait_for_response_for_request(&request.id, &mut buffered_responses)
                        .await;
                    if matches!(request.message, NativeMessage::Connect { .. }) {
                        response = response.with_session_secret(self.session_secret_hex.clone());
                    }
                    if let Err(e) = self.sign_response(&mut response) {
                        tracing::error!("Failed to sign native response: {}", e);
                        response = NativeResponse::error(
                            request.id,
                            format!("Native host response signing failed: {}", e),
                        );
                        let _ = self.sign_response(&mut response);
                    }

                    // Send response back to extension
                    if let Err(e) = write_message(&mut stdout, &response) {
                        tracing::error!("Failed to write response: {}", e);
                    }
                }
                Err(e) => {
                    // EOF or error - extension disconnected
                    let err = e.to_string();
                    if err.contains("EOF")
                        || err.contains("UnexpectedEof")
                        || err.contains("fill whole buffer")
                    {
                        tracing::info!("Extension disconnected");
                        break;
                    }
                    tracing::error!("Error reading message: {}", e);
                }
            }
        }

        Ok(())
    }

    fn sign_response(&self, response: &mut NativeResponse) -> Result<()> {
        response.sign_with_secret(&self.session_secret, current_epoch_millis())
    }

    async fn wait_for_response_for_request(
        &self,
        request_id: &str,
        buffered_responses: &mut HashMap<String, NativeResponse>,
    ) -> NativeResponse {
        if let Some(response) = buffered_responses.remove(request_id) {
            return response;
        }

        let deadline = Instant::now() + Duration::from_millis(NATIVE_RESPONSE_TIMEOUT_MS);
        loop {
            let remaining = deadline.saturating_duration_since(Instant::now());
            if remaining.is_zero() {
                return NativeResponse::error(
                    request_id.to_string(),
                    format!(
                        "Timed out waiting for desktop response after {}ms",
                        NATIVE_RESPONSE_TIMEOUT_MS
                    ),
                );
            }

            let next_response = tokio::time::timeout(remaining, async {
                let mut rx = self.response_rx.lock().await;
                rx.recv().await
            })
            .await;

            let Some(response) = (match next_response {
                Ok(response) => response,
                Err(_) => {
                    return NativeResponse::error(
                        request_id.to_string(),
                        format!(
                            "Timed out waiting for desktop response after {}ms",
                            NATIVE_RESPONSE_TIMEOUT_MS
                        ),
                    );
                }
            }) else {
                return NativeResponse::error(
                    request_id.to_string(),
                    "Desktop response channel closed unexpectedly".to_string(),
                );
            };

            if response.id == request_id {
                return response;
            }

            tracing::warn!(
                "Received out-of-order native response for id '{}'; buffering while waiting for '{}'",
                response.id,
                request_id
            );
            buffered_responses.insert(response.id.clone(), response);
        }
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

fn current_epoch_millis() -> u64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .unwrap_or_default()
        .as_millis()
        .try_into()
        .unwrap_or(u64::MAX)
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
    super::manifest::install_manifests(None).map(|_| ())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[tokio::test]
    async fn test_wait_for_response_for_request_uses_buffered_response() {
        let (host, _msg_rx, _resp_tx) = NativeMessagingHost::new();
        let mut buffered = HashMap::new();
        buffered.insert(
            "req-1".to_string(),
            NativeResponse::success("req-1".to_string(), serde_json::json!({ "ok": true })),
        );

        let response = host
            .wait_for_response_for_request("req-1", &mut buffered)
            .await;

        assert!(response.success);
        assert_eq!(response.id, "req-1");
        assert!(buffered.is_empty());
    }

    #[tokio::test]
    async fn test_wait_for_response_for_request_buffers_out_of_order_responses() {
        let (host, _msg_rx, resp_tx) = NativeMessagingHost::new();
        let mut buffered = HashMap::new();

        let _ = resp_tx
            .send(NativeResponse::success(
                "req-other".to_string(),
                serde_json::json!({ "ok": true }),
            ))
            .await;
        let _ = resp_tx
            .send(NativeResponse::success(
                "req-target".to_string(),
                serde_json::json!({ "ok": true }),
            ))
            .await;

        let response = host
            .wait_for_response_for_request("req-target", &mut buffered)
            .await;

        assert!(response.success);
        assert_eq!(response.id, "req-target");
        assert!(buffered.contains_key("req-other"));
    }
}
