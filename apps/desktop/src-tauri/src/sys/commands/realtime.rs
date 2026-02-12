use crate::integrations::realtime::{PresenceManager, UserActivity, UserPresence};
use std::sync::Arc;
use tauri::State;

#[derive(serde::Serialize)]
pub struct RealtimeConnectionInfo {
    pub url: String,
    pub token: String,
}

pub struct RealtimeState {
    pub presence: Arc<PresenceManager>,
    pub websocket_port: u16,
    pub token: String,
}

impl RealtimeState {
    pub fn new(presence: Arc<PresenceManager>, websocket_port: u16, token: String) -> Self {
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
    Ok(RealtimeConnectionInfo {
        url: format!("ws://localhost:{}", state.websocket_port),
        token: state.token.clone(),
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
