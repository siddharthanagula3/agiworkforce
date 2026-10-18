use crate::sys::security::SecretManager;
use std::sync::Arc;
use tauri::State;

pub struct SecretManagerState(pub Arc<SecretManager>);

impl SecretManagerState {
    pub fn manager(&self) -> &SecretManager {
        self.0.as_ref()
    }
}

/// The secrets the app window may check, save and remove through these
/// commands. Every other row of the secret manager's table belongs to native
/// code: the vault salt, the network proxy profile, the cloud session and the
/// signing secrets. A key outside this list is refused before it is looked
/// up, so the window cannot probe, overwrite or delete one of those.
const PAGE_OWNED_SECRET_KEYS: [&str; 1] = ["perplexity_api_key"];

fn page_owned_secret_key(key: &str) -> Result<&'static str, String> {
    PAGE_OWNED_SECRET_KEYS
        .iter()
        .copied()
        .find(|owned| *owned == key)
        .ok_or_else(|| {
            "This secret is not one the app window may read, change or remove.".to_string()
        })
}

#[tauri::command]
pub async fn secret_manager_has(
    key: String,
    state: State<'_, SecretManagerState>,
) -> Result<bool, String> {
    let key = page_owned_secret_key(&key)?;
    state.manager().has_secret(key).map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn secret_manager_set(
    key: String,
    value: String,
    state: State<'_, SecretManagerState>,
) -> Result<(), String> {
    let key = page_owned_secret_key(&key)?;
    state
        .manager()
        .set_secret(key, &value)
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn secret_manager_delete(
    key: String,
    state: State<'_, SecretManagerState>,
) -> Result<(), String> {
    let key = page_owned_secret_key(&key)?;
    state
        .manager()
        .delete_secret(key)
        .map_err(|e| e.to_string())
}

#[cfg(test)]
mod tests {
    use super::*;
    use rusqlite::Connection;
    use std::sync::Mutex;

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

    #[test]
    fn the_window_may_name_only_the_secrets_it_owns() {
        assert_eq!(
            page_owned_secret_key("perplexity_api_key"),
            Ok("perplexity_api_key")
        );

        for native_only in [
            "master_salt",
            "network_proxy_config",
            "jwt_secret",
            "cloud_refresh_token",
            "perplexity_api_key ",
            "",
        ] {
            assert!(
                page_owned_secret_key(native_only).is_err(),
                "{native_only:?} must stay out of the window's reach"
            );
        }
    }
}
