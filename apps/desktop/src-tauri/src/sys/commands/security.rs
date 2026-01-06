use crate::sys::security::{
    ApiSecurityManager, AuthManager, AuthToken, SecureStorage, UpdateMetadata,
    UpdateSecurityManager, UserRole, VerificationResult,
};
use parking_lot::{RwLockReadGuard, RwLockWriteGuard};
use serde::{Deserialize, Serialize};
use std::sync::Arc;
use tauri::State;

pub struct AuthManagerState(pub Arc<parking_lot::RwLock<AuthManager>>);
pub struct ApiSecurityState(pub Arc<parking_lot::RwLock<ApiSecurityManager>>);
pub struct SecureStorageState(pub Arc<parking_lot::RwLock<SecureStorage>>);
pub struct UpdateSecurityState(pub Arc<parking_lot::RwLock<UpdateSecurityManager>>);

impl AuthManagerState {
    pub fn read(&self) -> RwLockReadGuard<'_, AuthManager> {
        self.0.read()
    }

    #[allow(dead_code)]
    pub fn write(&self) -> RwLockWriteGuard<'_, AuthManager> {
        self.0.write()
    }
}

impl ApiSecurityState {
    pub fn read(&self) -> RwLockReadGuard<'_, ApiSecurityManager> {
        self.0.read()
    }
}

impl SecureStorageState {
    pub fn read(&self) -> RwLockReadGuard<'_, SecureStorage> {
        self.0.read()
    }
}

impl UpdateSecurityState {
    pub fn read(&self) -> RwLockReadGuard<'_, UpdateSecurityManager> {
        self.0.read()
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct RegisterRequest {
    pub email: String,
    pub password: String,
    pub role: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct LoginRequest {
    pub email: String,
    pub password: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ChangePasswordRequest {
    pub user_id: String,
    pub old_password: String,
    pub new_password: String,
}

// Note: auth_register is not exposed via Tauri - registration happens via web/Supabase
#[allow(dead_code)]
pub async fn auth_register(
    email: String,
    password: String,
    role: String,
    state: State<'_, AuthManagerState>,
) -> Result<String, String> {
    let manager = state.inner().read();
    let user_role = UserRole::from_str(&role).ok_or("Invalid role")?;
    let user = manager.register(email, password.as_str(), user_role)?;
    Ok(user.id)
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

// Note: auth_logout is not exposed via Tauri - logout happens via web/Supabase
#[allow(dead_code)]
pub async fn auth_logout(
    access_token: String,
    state: State<'_, AuthManagerState>,
) -> Result<(), String> {
    let manager = state.inner().read();
    manager.logout(&access_token)
}

// Note: auth_refresh_token is not exposed via Tauri - token refresh happens via web/Supabase
#[allow(dead_code)]
pub async fn auth_refresh_token(
    refresh_token: String,
    state: State<'_, AuthManagerState>,
) -> Result<AuthToken, String> {
    let manager = state.inner().read();
    manager.refresh_token(&refresh_token)
}

// Note: auth_validate_token is not exposed via Tauri - token validation happens via web/Supabase
#[allow(dead_code)]
pub async fn auth_validate_token(
    access_token: String,
    state: State<'_, AuthManagerState>,
) -> Result<bool, String> {
    let manager = state.inner().read();
    match manager.validate_token(&access_token) {
        Ok(_) => Ok(true),
        Err(_) => Ok(false),
    }
}

// Note: auth_change_password is not exposed via Tauri - password change happens via web/Supabase
#[allow(dead_code)]
pub async fn auth_change_password(
    user_id: String,
    old_password: String,
    new_password: String,
    state: State<'_, AuthManagerState>,
) -> Result<(), String> {
    let manager = state.inner().read();
    manager.change_password(&user_id, &old_password, &new_password)
}

// Note: api_create_key is not exposed via Tauri - API keys managed via web dashboard
#[allow(dead_code)]
pub async fn api_create_key(
    name: String,
    permissions: Vec<String>,
    expires_in_days: Option<i64>,
    state: State<'_, ApiSecurityState>,
) -> Result<String, String> {
    let manager = state.inner().read();
    let key = manager.create_api_key(name, permissions, expires_in_days);
    Ok(serde_json::to_string(&key).unwrap())
}

// Note: api_revoke_key is not exposed via Tauri - API keys managed via web dashboard
#[allow(dead_code)]
pub async fn api_revoke_key(
    key_id: String,
    state: State<'_, ApiSecurityState>,
) -> Result<(), String> {
    let manager = state.inner().read();
    manager.revoke_api_key(&key_id)
}

// Note: api_list_keys is not exposed via Tauri - API keys managed via web dashboard
#[allow(dead_code)]
pub async fn api_list_keys(state: State<'_, ApiSecurityState>) -> Result<String, String> {
    let manager = state.inner().read();
    let keys = manager.list_api_keys();
    Ok(serde_json::to_string(&keys).unwrap())
}

// Note: api_rotate_key is not exposed via Tauri - API keys managed via web dashboard
#[allow(dead_code)]
pub async fn api_rotate_key(
    key_id: String,
    state: State<'_, ApiSecurityState>,
) -> Result<String, String> {
    let manager = state.inner().read();
    let key = manager.rotate_api_key(&key_id)?;
    Ok(serde_json::to_string(&key).unwrap())
}

// Note: api_validate_signature is not exposed via Tauri - signature validation happens server-side
#[allow(dead_code)]
pub async fn api_validate_signature(
    key_id: String,
    timestamp: String,
    body: String,
    signature: String,
    state: State<'_, ApiSecurityState>,
) -> Result<bool, String> {
    let manager = state.inner().read();
    match manager.validate_signature(&key_id, &timestamp, &body, &signature) {
        Ok(_) => Ok(true),
        Err(e) => Err(e),
    }
}

// Note: storage_init_with_password is not exposed via Tauri - storage managed internally
#[allow(dead_code)]
pub async fn storage_init_with_password(
    password: String,
    state: State<'_, SecureStorageState>,
) -> Result<(), String> {
    let storage = state.inner().read();
    storage.init_with_password(&password)
}

// Note: storage_unlock is not exposed via Tauri - storage managed internally
#[allow(dead_code)]
pub async fn storage_unlock(
    password: String,
    state: State<'_, SecureStorageState>,
) -> Result<(), String> {
    let storage = state.inner().read();
    storage.unlock(&password)
}

// Note: storage_lock is not exposed via Tauri - storage managed internally
#[allow(dead_code)]
pub async fn storage_lock(state: State<'_, SecureStorageState>) -> Result<(), String> {
    let storage = state.inner().read();
    storage.lock();
    Ok(())
}

// Note: storage_is_unlocked is not exposed via Tauri - storage managed internally
#[allow(dead_code)]
pub async fn storage_is_unlocked(state: State<'_, SecureStorageState>) -> Result<bool, String> {
    let storage = state.inner().read();
    Ok(storage.is_unlocked())
}

// Note: storage_store_api_key is not exposed via Tauri - API keys managed via Vercel
#[allow(dead_code)]
pub async fn storage_store_api_key(
    _provider: String,
    _api_key: String,
    _state: State<'_, SecureStorageState>,
) -> Result<(), String> {
    Err("Local API key storage is disabled. Please configure secrets via Vercel environment variables.".to_string())
}

// Note: storage_retrieve_api_key is not exposed via Tauri - API keys managed via Vercel
#[allow(dead_code)]
pub async fn storage_retrieve_api_key(
    _provider: String,
    _state: State<'_, SecureStorageState>,
) -> Result<String, String> {
    Err("Local API key retrieval is disabled. Use the Managed Cloud provider to access Vercel-hosted secrets.".to_string())
}

// Note: storage_delete_api_key is not exposed via Tauri - API keys managed via Vercel
#[allow(dead_code)]
pub async fn storage_delete_api_key(
    _provider: String,
    _state: State<'_, SecureStorageState>,
) -> Result<(), String> {
    Err(
        "Local API key management is disabled. Manage your secrets in the Vercel dashboard."
            .to_string(),
    )
}

// Note: storage_encrypt_file is not exposed via Tauri - encryption managed internally
#[allow(dead_code)]
pub async fn storage_encrypt_file(
    input_path: String,
    output_path: String,
    password: String,
) -> Result<(), String> {
    crate::sys::security::storage::encrypt_file(&input_path, &output_path, &password)
}

// Note: storage_decrypt_file is not exposed via Tauri - encryption managed internally
#[allow(dead_code)]
pub async fn storage_decrypt_file(
    input_path: String,
    output_path: String,
    password: String,
) -> Result<(), String> {
    crate::sys::security::storage::decrypt_file(&input_path, &output_path, &password)
}

// Note: update_verify_package is not exposed via Tauri - updates managed by tauri-plugin-updater
#[allow(dead_code)]
pub async fn update_verify_package(
    file_path: String,
    metadata: String,
    state: State<'_, UpdateSecurityState>,
) -> Result<VerificationResult, String> {
    let manager = state.inner().read();
    let update_metadata: UpdateMetadata =
        serde_json::from_str(&metadata).map_err(|e| format!("Invalid metadata: {}", e))?;

    manager.verify_update(&file_path, &update_metadata)
}

// Note: update_compute_checksum is not exposed via Tauri - updates managed by tauri-plugin-updater
#[allow(dead_code)]
pub async fn update_compute_checksum(
    file_path: String,
    state: State<'_, UpdateSecurityState>,
) -> Result<String, String> {
    let manager = state.inner().read();
    manager.compute_file_checksum(&file_path)
}

// Note: update_validate_url is not exposed via Tauri - updates managed by tauri-plugin-updater
#[allow(dead_code)]
pub async fn update_validate_url(
    url: String,
    state: State<'_, UpdateSecurityState>,
) -> Result<bool, String> {
    let manager = state.inner().read();
    match manager.validate_download_url(&url) {
        Ok(_) => Ok(true),
        Err(e) => Err(e),
    }
}

// Note: update_create_backup is not exposed via Tauri - updates managed by tauri-plugin-updater
#[allow(dead_code)]
pub async fn update_create_backup(
    source_dir: String,
    backup_dir: String,
    state: State<'_, UpdateSecurityState>,
) -> Result<(), String> {
    let manager = state.inner().read();
    manager.create_backup(&source_dir, &backup_dir)
}

// Note: update_restore_backup is not exposed via Tauri - updates managed by tauri-plugin-updater
#[allow(dead_code)]
pub async fn update_restore_backup(
    backup_dir: String,
    target_dir: String,
    state: State<'_, UpdateSecurityState>,
) -> Result<(), String> {
    let manager = state.inner().read();
    manager.restore_backup(&backup_dir, &target_dir)
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
