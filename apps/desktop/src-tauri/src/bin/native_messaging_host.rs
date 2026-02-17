use agiworkforce_desktop::integrations::native_messaging::host::NativeMessagingHost;
use agiworkforce_desktop::integrations::native_messaging::NativeResponse;
use agiworkforce_desktop::integrations::realtime::RealtimeEvent;
use futures::{SinkExt, StreamExt};
use tokio_tungstenite::tungstenite::Message;
use url::Url;

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
            Ok(t) => Some(t),
            Err(e) => {
                tracing::warn!("Failed to read .ipc_token: {}", e);
                None
            }
        }
    } else {
        tracing::warn!("Failed to determine app data dir");
        None
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
        token: token.clone(),
    };
    if let Ok(auth_msg) = serde_json::to_string(&auth_event) {
        if let Err(e) = ws_sender.send(Message::Text(auth_msg)).await {
            tracing::error!("Failed to send auth message: {}", e);
        }
    }

    // Spawn WS Receiver -> Response Tx (Forward responses from App to Chrome)
    let resp_tx_clone = resp_tx.clone();
    tokio::spawn(async move {
        while let Some(msg) = ws_receiver.next().await {
            match msg {
                Ok(Message::Text(text)) => {
                    tracing::debug!("Received WS message: {}", text);
                    if let Ok(RealtimeEvent::NativeResponse {
                        id,
                        success,
                        data,
                        error,
                    }) = serde_json::from_str::<RealtimeEvent>(&text)
                    {
                        let resp = NativeResponse {
                            id,
                            success,
                            data,
                            error,
                        };
                        if let Err(e) = resp_tx_clone.send(resp).await {
                            tracing::error!("Failed to send response to stdout loop: {}", e);
                            break;
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
    tokio::spawn(async move {
        while let Some(req) = msg_rx.recv().await {
            tracing::info!("Forwarding message to app: {:?}", req.id);
            let event = RealtimeEvent::NativeMessage {
                id: req.id,
                payload: serde_json::to_value(req.message).unwrap_or_default(),
            };

            let msg_str = serde_json::to_string(&event).unwrap_or_default();
            if let Err(e) = ws_sender.send(Message::Text(msg_str)).await {
                tracing::error!("Failed to send message to app: {}", e);
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
