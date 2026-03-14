use crate::sys::security::{AuthManager, AuthToken, SecretManager};
use parking_lot::RwLockReadGuard;
use std::sync::Arc;
use tauri::State;

pub struct AuthManagerState(pub Arc<parking_lot::RwLock<AuthManager>>);
pub struct SecretManagerState(pub Arc<SecretManager>);

impl AuthManagerState {
    pub fn read(&self) -> RwLockReadGuard<'_, AuthManager> {
        self.0.read()
    }
}

impl SecretManagerState {
    pub fn manager(&self) -> &SecretManager {
        self.0.as_ref()
    }
}

#[tauri::command]
pub async fn auth_login(
    email: String,
    password: String,
    state: State<'_, AuthManagerState>,
) -> Result<AuthToken, String> {
    let manager = state.inner().read();
    manager.login(&email, &password)
}

#[tauri::command]
pub async fn secret_manager_has(
    key: String,
    state: State<'_, SecretManagerState>,
) -> Result<bool, String> {
    state.manager().has_secret(&key).map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn secret_manager_set(
    key: String,
    value: String,
    state: State<'_, SecretManagerState>,
) -> Result<(), String> {
    state
        .manager()
        .set_secret(&key, &value)
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn secret_manager_delete(
    key: String,
    state: State<'_, SecretManagerState>,
) -> Result<(), String> {
    state
        .manager()
        .delete_secret(&key)
        .map_err(|e| e.to_string())
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::sys::security::SecretManager;
    use rusqlite::Connection;
    use std::sync::Mutex;

    #[tokio::test]
    async fn test_auth_flow() {
        let conn = Connection::open_in_memory().unwrap();
        conn.execute(
            "CREATE TABLE IF NOT EXISTS settings (
                key TEXT PRIMARY KEY,
                value TEXT NOT NULL,
                encrypted INTEGER NOT NULL DEFAULT 0
            )",
            [],
        )
        .unwrap();

        let secret_manager = Arc::new(SecretManager::new(Arc::new(Mutex::new(conn))));
        let auth_manager = Arc::new(parking_lot::RwLock::new(AuthManager::new(secret_manager)));
        let state = AuthManagerState(auth_manager);

        let manager = state.read();

        let user = manager
            .register(
                "test@example.com".to_string(),
                "password123",
                crate::sys::security::UserRole::Editor,
            )
            .unwrap();

        assert!(!user.id.is_empty());

        let token = manager.login("test@example.com", "password123").unwrap();
        assert!(!token.access_token.is_empty());

        let valid = manager.validate_token(&token.access_token).is_ok();
        assert!(valid);

        manager.logout(&token.access_token).unwrap();
    }

    #[tokio::test]
    async fn test_secret_manager_commands() {
        let conn = Connection::open_in_memory().unwrap();
        conn.execute(
            "CREATE TABLE IF NOT EXISTS settings (
                key TEXT PRIMARY KEY,
                value TEXT NOT NULL,
                encrypted INTEGER NOT NULL DEFAULT 0
            )",
            [],
        )
        .unwrap();

        let secret_manager = Arc::new(SecretManager::new(Arc::new(Mutex::new(conn))));
        let state = SecretManagerState(secret_manager);

        assert!(!state.manager().has_secret("perplexity_api_key").unwrap());

        state
            .manager()
            .set_secret("perplexity_api_key", "test-secret")
            .unwrap();
        assert!(state.manager().has_secret("perplexity_api_key").unwrap());

        state.manager().delete_secret("perplexity_api_key").unwrap();
        assert!(!state.manager().has_secret("perplexity_api_key").unwrap());
    }
}
