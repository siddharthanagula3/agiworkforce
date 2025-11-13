use crate::realtime::{PresenceManager, UserActivity, UserPresence};
use std::sync::Arc;
use tauri::State;

pub struct RealtimeState {
    pub presence: Arc<PresenceManager>,
    pub websocket_port: u16,
}

impl RealtimeState {
    pub fn new(presence: Arc<PresenceManager>, websocket_port: u16) -> Self {
        Self {
            presence,
            websocket_port,
        }
    }
}

#[tauri::command]
pub async fn connect_websocket(
    state: State<'_, RealtimeState>,
    _user_id: String,
    _team_id: Option<String>,
) -> Result<String, String> {
    // Return WebSocket URL
    Ok(format!("ws://127.0.0.1:{}", state.websocket_port))
}

#[tauri::command]
pub async fn get_team_presence(
    state: State<'_, RealtimeState>,
    team_id: String,
) -> Result<Vec<UserPresence>, String> {
    let presence = state.presence.get_team_presence(&team_id);
    Ok(presence)
}

#[tauri::command]
pub async fn update_user_activity(
    state: State<'_, RealtimeState>,
    user_id: String,
    activity: UserActivity,
) -> Result<(), String> {
    state.presence.set_activity(&user_id, activity);
    Ok(())
}

#[tauri::command]
pub async fn set_user_online(
    state: State<'_, RealtimeState>,
    user_id: String,
) -> Result<(), String> {
    state.presence.set_online(&user_id);
    Ok(())
}

#[tauri::command]
pub async fn set_user_offline(
    state: State<'_, RealtimeState>,
    user_id: String,
) -> Result<(), String> {
    state.presence.set_offline(&user_id);
    Ok(())
}

#[tauri::command]
pub async fn get_user_presence(
    state: State<'_, RealtimeState>,
    user_id: String,
) -> Result<Option<UserPresence>, String> {
    Ok(state.presence.get_user_presence(&user_id))
}
