use std::sync::RwLock;
use tauri::command;

// In-memory session storage - avoids OS keychain permission prompts
// The session is stored in localStorage on the frontend and synced here for Rust API calls
static SESSION_STORE: RwLock<Option<String>> = RwLock::new(None);

#[command]
pub async fn auth_store_session(session: String) -> Result<(), String> {
    let mut store = SESSION_STORE.write().map_err(|e| e.to_string())?;
    *store = Some(session);
    Ok(())
}

#[command]
pub async fn auth_retrieve_session() -> Result<String, String> {
    let store = SESSION_STORE.read().map_err(|e| e.to_string())?;
    store.clone().ok_or_else(|| "No session stored".to_string())
}

#[command]
pub async fn auth_remove_session() -> Result<(), String> {
    let mut store = SESSION_STORE.write().map_err(|e| e.to_string())?;
    *store = None;
    Ok(())
}
