use crate::sys::security::{AuthManager, AuthToken};
use parking_lot::RwLockReadGuard;
use std::sync::Arc;
use tauri::State;

pub struct AuthManagerState(pub Arc<parking_lot::RwLock<AuthManager>>);

impl AuthManagerState {
    pub fn read(&self) -> RwLockReadGuard<'_, AuthManager> {
        self.0.read()
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
}
