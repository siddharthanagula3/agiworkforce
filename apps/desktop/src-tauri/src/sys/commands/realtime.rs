use crate::integrations::realtime::{PairRequestPrompt, RealtimeServer};
use std::sync::Arc;
use tauri::State;
use tokio::sync::RwLock as TokioRwLock;

pub struct RealtimeServerHandle(pub Arc<RealtimeServer>);

pub struct RealtimeState {
    pub websocket_port: u16,
    pub token: Arc<TokioRwLock<String>>,
}

impl RealtimeState {
    pub fn new(websocket_port: u16, token: Arc<TokioRwLock<String>>) -> Self {
        Self {
            websocket_port,
            token,
        }
    }
}

/// Pairing requests the extension opened and the user has not answered yet.
///
/// SEC-11: this is the only channel that carries the confirmation code. It is
/// readable exclusively through Tauri IPC, the Desktop's own window, so the
/// user reads the code off their screen and types it into the extension. The
/// loopback HTTP endpoint never returns it.
#[tauri::command]
pub async fn bridge_pending_pair_requests(
    server_handle: State<'_, RealtimeServerHandle>,
) -> Result<Vec<PairRequestPrompt>, String> {
    Ok(server_handle.0.pending_pair_requests().await)
}

/// Drop a pairing request the user did not recognize.
#[tauri::command]
pub async fn bridge_deny_pair_request(
    server_handle: State<'_, RealtimeServerHandle>,
    request_id: String,
) -> Result<bool, String> {
    Ok(server_handle.0.cancel_pair_request(&request_id).await)
}
