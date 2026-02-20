use agiworkforce_desktop::integrations::native_messaging::host::NativeMessagingHost;
use agiworkforce_desktop::integrations::native_messaging::NativeResponse;
use agiworkforce_desktop::integrations::realtime::RealtimeEvent;
use futures::{SinkExt, StreamExt};
use tokio::time::{timeout, Duration};
use tokio_tungstenite::tungstenite::Message;
use url::Url;

const REALTIME_AUTH_TIMEOUT_MS: u64 = 4_000;

// Helper to find app data dir matching Tauri's logic
#[cfg(target_os = "macos")]
fn get_app_data_dir() -> Option<std::path::PathBuf> {
    let home = dirs::home_dir()?;
    Some(home.join("Library/Application Support/com.agiworkforce.desktop"))
}

#[cfg(not(target_os = "macos"))]
fn get_app_data_dir() -> Option<std::path::PathBuf> {
    dirs::data_local_dir().map(|p| p.join("com.agiworkforce.desktop"))
}

#[tokio::main]
async fn main() -> Result<(), Box<dyn std::error::Error>> {
    // Initialize logging to stderr to avoid corrupting stdout (which is used for Chrome communication)
    tracing_subscriber::fmt()
        .with_writer(std::io::stderr)
        .with_env_filter(tracing_subscriber::EnvFilter::from_default_env())
        .init();

    tracing::info!("Starting Native Messaging Host...");

    // Create host instance
    let (host, mut msg_rx, resp_tx) = NativeMessagingHost::new();

    // Read auth token
    let token = if let Some(dir) = get_app_data_dir() {
        let token_path = dir.join(".ipc_token");
        match std::fs::read_to_string(&token_path) {
            Ok(t) => {
                let trimmed = t.trim().to_string();
                if trimmed.is_empty() {
                    let msg = format!("Realtime auth token is empty at {}", token_path.display());
                    tracing::error!("{}", msg);
                    return Err(std::io::Error::new(std::io::ErrorKind::InvalidData, msg).into());
                }
                trimmed
            }
            Err(e) => {
                let msg = format!(
                    "Failed to read realtime auth token at {}: {}",
                    token_path.display(),
                    e
                );
                tracing::error!("{}", msg);
                return Err(std::io::Error::new(std::io::ErrorKind::NotFound, msg).into());
            }
        }
    } else {
        let msg = "Failed to determine app data directory for realtime auth token";
        tracing::error!("{}", msg);
        return Err(std::io::Error::new(std::io::ErrorKind::NotFound, msg).into());
    };

    // Connect to the main app via WebSocket
    let url = Url::parse("ws://127.0.0.1:8787").expect("Invalid Websocket URL");
    tracing::info!("Connecting to main app at {}", url);

    let (ws_stream, _) = match tokio_tungstenite::connect_async(url).await {
        Ok(s) => s,
        Err(e) => {
            tracing::error!(
                "Failed to connect to main app: {}. Ensure AGI Workforce is running.",
                e
            );
            return Err(e.into());
        }
    };
    tracing::info!("Connected to main app.");

    let (mut ws_sender, mut ws_receiver) = ws_stream.split();

    // Authenticate immediately
    let auth_event = RealtimeEvent::Authenticate {
        user_id: "native_host".to_string(),
        team_id: None,
        token: Some(token.clone()),
    };
    if let Ok(auth_msg) = serde_json::to_string(&auth_event) {
        if let Err(e) = ws_sender.send(Message::Text(auth_msg)).await {
            tracing::error!("Failed to send auth message: {}", e);
            return Err(e.into());
        }
    }

    let auth_result = timeout(Duration::from_millis(REALTIME_AUTH_TIMEOUT_MS), async {
        while let Some(msg) = ws_receiver.next().await {
            match msg {
                Ok(Message::Text(text)) => {
                    if let Ok(event) = serde_json::from_str::<RealtimeEvent>(&text) {
                        match event {
                            RealtimeEvent::Authenticated { user_id } => {
                                return Ok(user_id);
                            }
                            RealtimeEvent::AuthenticationFailed { reason } => {
                                return Err(format!(
                                    "Realtime websocket authentication failed: {}",
                                    reason
                                ));
                            }
                            _ => {}
                        }
                    }
                }
                Ok(Message::Close(_)) => {
                    return Err(
                        "Realtime websocket closed before authentication acknowledgement"
                            .to_string(),
                    );
                }
                Err(e) => {
                    return Err(format!(
                        "Realtime websocket error before authentication acknowledgement: {}",
                        e
                    ));
                }
                _ => {}
            }
        }
        Err("Realtime websocket closed without authentication acknowledgement".to_string())
    })
    .await;

    match auth_result {
        Ok(Ok(user_id)) => {
            tracing::info!("Realtime websocket authenticated as {}", user_id);
        }
        Ok(Err(error)) => {
            tracing::error!("{}", error);
            return Err(std::io::Error::new(std::io::ErrorKind::PermissionDenied, error).into());
        }
        Err(_) => {
            let message = format!(
                "Timed out waiting for realtime authentication acknowledgement after {}ms",
                REALTIME_AUTH_TIMEOUT_MS
            );
            tracing::error!("{}", message);
            return Err(std::io::Error::new(std::io::ErrorKind::TimedOut, message).into());
        }
    }

    // Spawn WS Receiver -> Response Tx (Forward responses from App to Chrome)
    let resp_tx_clone = resp_tx.clone();
    tokio::spawn(async move {
        while let Some(msg) = ws_receiver.next().await {
            match msg {
                Ok(Message::Text(text)) => {
                    tracing::debug!("Received WS message: {}", text);
                    if let Ok(event) = serde_json::from_str::<RealtimeEvent>(&text) {
                        match event {
                            RealtimeEvent::NativeResponse {
                                id,
                                success,
                                data,
                                error,
                            } => {
                                let resp = NativeResponse {
                                    id,
                                    success,
                                    data,
                                    error,
                                };
                                if let Err(e) = resp_tx_clone.send(resp).await {
                                    tracing::error!(
                                        "Failed to send response to stdout loop: {}",
                                        e
                                    );
                                    break;
                                }
                            }
                            RealtimeEvent::Authenticated { user_id } => {
                                tracing::info!("Realtime websocket authenticated as {}", user_id);
                            }
                            RealtimeEvent::AuthenticationFailed { reason } => {
                                tracing::error!(
                                    "Realtime websocket authentication failed: {}",
                                    reason
                                );
                                break;
                            }
                            _ => {}
                        }
                    }
                }
                Ok(Message::Close(_)) => {
                    tracing::info!("WebSocket connection closed by server.");
                    break;
                }
                Err(e) => {
                    tracing::error!("WebSocket error: {}", e);
                    break;
                }
                _ => {}
            }
        }
        tracing::info!("Receiver loop ended.");
    });

    // Main Loop: Request Rx -> WS Sender (Forward requests from Chrome to App)
    let resp_tx_sender = resp_tx.clone();
    tokio::spawn(async move {
        while let Some(req) = msg_rx.recv().await {
            tracing::info!("Forwarding message to app: {:?}", req.id);
            let request_id = req.id.clone();
            let event = RealtimeEvent::NativeMessage {
                id: request_id.clone(),
                payload: serde_json::to_value(req.message).unwrap_or_default(),
            };

            let msg_str = serde_json::to_string(&event).unwrap_or_default();
            if let Err(e) = ws_sender.send(Message::Text(msg_str)).await {
                tracing::error!("Failed to send message to app: {}", e);
                let _ = resp_tx_sender
                    .send(NativeResponse::error(
                        request_id,
                        format!("Desktop websocket send failed: {}", e),
                    ))
                    .await;
                break;
            }
        }
        tracing::info!("Sender loop ended.");
    });

    // Run the host (blocks on stdin reading)
    match host.run_stdio_host().await {
        Ok(_) => tracing::info!("Host exited cleanly"),
        Err(e) => tracing::error!("Host exited with error: {}", e),
    }

    Ok(())
}
