use crate::integrations::realtime::{PresenceManager, UserActivity, UserPresence};
use std::sync::Arc;
use tauri::{Manager, State};
use tokio::sync::RwLock as TokioRwLock;

#[derive(serde::Serialize)]
pub struct RealtimeConnectionInfo {
    pub url: String,
    pub token: String,
}

#[derive(serde::Serialize)]
pub struct RealtimeConnectionInfo {
    pub url: String,
    pub token: String,
}

pub struct RealtimeState {
    pub presence: Arc<PresenceManager>,
    pub websocket_port: u16,
    /// B6 fix: live IPC token. Shared with `RealtimeServer` so that
    /// `bridge_rotate_token` updates take effect for new WebSocket
    /// connections immediately, without an app restart.
    pub token: Arc<TokioRwLock<String>>,
}

impl RealtimeState {
    pub fn new(
        presence: Arc<PresenceManager>,
        websocket_port: u16,
        token: Arc<TokioRwLock<String>>,
    ) -> Self {
        Self {
            presence,
            websocket_port,
            token,
        }
    }
}

#[tauri::command]
pub async fn connect_websocket(
    state: State<'_, RealtimeState>,
    _user_id: String,
    _team_id: Option<String>,
) -> Result<RealtimeConnectionInfo, String> {
    let current = state.token.read().await.clone();
    Ok(RealtimeConnectionInfo {
        url: format!("ws://localhost:{}", state.websocket_port),
        token: current,
    })
}

#[tauri::command]
pub async fn get_team_presence(
    state: State<'_, RealtimeState>,
    team_id: String,
) -> Result<Vec<UserPresence>, String> {
    let presence = state.presence.get_team_presence(&team_id).await;
    Ok(presence)
}

#[tauri::command]
pub async fn update_user_activity(
    state: State<'_, RealtimeState>,
    user_id: String,
    activity: UserActivity,
) -> Result<(), String> {
    state.presence.set_activity(&user_id, activity).await;
    Ok(())
}

#[tauri::command]
pub async fn set_user_online(
    state: State<'_, RealtimeState>,
    user_id: String,
) -> Result<(), String> {
    state.presence.set_online(&user_id).await;
    Ok(())
}

#[tauri::command]
pub async fn set_user_offline(
    state: State<'_, RealtimeState>,
    user_id: String,
) -> Result<(), String> {
    state.presence.set_offline(&user_id).await;
    Ok(())
}

#[tauri::command]
pub async fn get_user_presence(
    state: State<'_, RealtimeState>,
    user_id: String,
) -> Result<Option<UserPresence>, String> {
    Ok(state.presence.get_user_presence(&user_id).await)
}

// ── RT-04 Bridge token management ────────────────────────────────────────────

/// Return the current bridge token so the UI can display it to the user during
/// onboarding (the Chrome ext and VS Code ext need to paste it in once).
///
/// Security: the token is only readable by authenticated Tauri IPC callers
/// (same-origin, from the Tauri webview).  It is NOT broadcast over the
/// WebSocket or emitted as a Tauri event.
#[tauri::command]
pub async fn bridge_get_token(
    state: State<'_, RealtimeState>,
) -> Result<String, String> {
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
/// Existing authenticated WebSocket sessions are NOT terminated immediately;
/// they will receive auth errors on their next re-auth attempt or when the
/// connection is cycled.  Clients must re-fetch the token via onboarding.
#[tauri::command]
pub async fn bridge_rotate_token(
    state: State<'_, RealtimeState>,
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
    // value — which means after restart the OLD token resumes service.
    // That's acceptable: the rotation is reversed by restart, and no
    // window exists where the old token is accepted but the new one
    // would have been "the truth".
    *state.token.write().await = new_token.clone();

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

    // B6 fix: previous code did `app.emit("bridge:token-rotated", &new_token)`,
    // broadcasting the secret to every Tauri window. Caller already has
    // the new token via the return value. Removed.

    Ok(new_token)
}
// ─────────────────────────────────────────────────────────────────────────────
