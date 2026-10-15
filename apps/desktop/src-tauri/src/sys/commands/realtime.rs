use crate::integrations::realtime::{PairRequestPrompt, RealtimeServer};
use std::sync::Arc;
use tauri::{Manager, State};
use tokio::sync::RwLock as TokioRwLock;

pub struct RealtimeServerHandle(pub Arc<RealtimeServer>);

pub struct RealtimeState {
    pub websocket_port: u16,
    /// B6 fix: live IPC token. Shared with `RealtimeServer` so that
    /// `bridge_rotate_token` updates take effect for new WebSocket
    /// connections immediately, without an app restart.
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

// ── RT-04 Bridge token management ────────────────────────────────────────────

/// Return the current bridge token so the UI can display it to the user during
/// onboarding (the Chrome ext and VS Code ext need to paste it in once).
///
/// Security: the token is only readable by authenticated Tauri IPC callers
/// (same-origin, from the Tauri webview).  It is NOT broadcast over the
/// WebSocket or emitted as a Tauri event.
pub async fn bridge_get_token(state: State<'_, RealtimeState>) -> Result<String, String> {
    Ok(state.token.read().await.clone())
}

/// Rotate the bridge token: generate a new 32-byte random token, persist it
/// to disk (0o600), AND swap it in-memory so the running WebSocket server
/// authenticates new connections against the rotated value.
///
/// B6 fix: previously this function only persisted to disk and emitted a
/// Tauri event; the in-memory token (`RealtimeState.token`, formerly a plain
/// `String`) was unchanged until the next app restart. Both old and new
/// tokens were valid simultaneously, so a perceived "rotation" gave users
/// false confidence after suspected leak. Now `RealtimeState.token` is an
/// `Arc<RwLock<String>>` shared with the live `RealtimeServer`, and we
/// write the new value here before persisting to disk. The Tauri-event
/// broadcast was also removed: `app.emit` fans out to ALL webviews (and
/// any registered global listener), which leaked the secret beyond the
/// onboarding flow. Callers receive the new token only via the return value.
///
/// Existing authenticated WebSocket sessions are disconnected immediately
/// so a compromised token cannot be used on active connections.
pub async fn bridge_rotate_token(
    state: State<'_, RealtimeState>,
    server_handle: State<'_, RealtimeServerHandle>,
    app: tauri::AppHandle,
) -> Result<String, String> {
    use std::io::Write;

    // Generate a cryptographically random 32-byte token.
    let new_token = {
        use rand::RngCore;
        let mut bytes = [0u8; 32];
        rand::thread_rng().fill_bytes(&mut bytes);
        hex::encode(bytes)
    };

    // B6 fix: swap the live in-memory token FIRST. If disk persistence
    // fails afterwards, the worst case is that the server has a fresh
    // token in memory but the `.ipc_token` file still contains the old
    // value, which means after restart the OLD token resumes service.
    // That's acceptable: the rotation is reversed by restart, and no
    // window exists where the old token is accepted but the new one
    // would have been "the truth".
    *state.token.write().await = new_token.clone();

    server_handle.0.disconnect_all_clients().await;

    // Persist with restricted permissions.
    let app_data_dir = app
        .path()
        .app_data_dir()
        .map_err(|e| format!("Failed to resolve app data dir: {e}"))?;
    let token_path = app_data_dir.join(".ipc_token");

    #[cfg(unix)]
    {
        use std::os::unix::fs::OpenOptionsExt;
        let mut file = std::fs::OpenOptions::new()
            .create(true)
            .write(true)
            .truncate(true)
            .mode(0o600)
            .open(&token_path)
            .map_err(|e| format!("Failed to open token file for rotation: {e}"))?;
        file.write_all(new_token.as_bytes())
            .map_err(|e| format!("Failed to write rotated token: {e}"))?;
    }
    #[cfg(not(unix))]
    {
        let mut file = std::fs::OpenOptions::new()
            .create(true)
            .write(true)
            .truncate(true)
            .open(&token_path)
            .map_err(|e| format!("Failed to open token file for rotation: {e}"))?;
        file.write_all(new_token.as_bytes())
            .map_err(|e| format!("Failed to write rotated token: {e}"))?;
    }

    tracing::info!(
        "RT-04 / B6: bridge token rotated in-memory + persisted to {:?}",
        token_path
    );

    // Return the token, never emit it: an app event reaches every window.

    Ok(new_token)
}
// ─────────────────────────────────────────────────────────────────────────────
