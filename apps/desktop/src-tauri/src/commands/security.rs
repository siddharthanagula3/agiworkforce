use crate::security::{
    ApiSecurityManager, AuthManager, AuthToken, SecureStorage, UpdateMetadata,
    UpdateSecurityManager, UserRole, VerificationResult,
};
use serde::{Deserialize, Serialize};
use std::sync::Arc;
use tauri::State;

// State wrappers for Tauri
pub struct AuthManagerState(pub Arc<parking_lot::RwLock<AuthManager>>);
pub struct ApiSecurityState(pub Arc<parking_lot::RwLock<ApiSecurityManager>>);
pub struct SecureStorageState(pub Arc<parking_lot::RwLock<SecureStorage>>);
pub struct UpdateSecurityState(pub Arc<parking_lot::RwLock<UpdateSecurityManager>>);

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

// ============================================================================
// Authentication Commands
// ============================================================================

#[tauri::command]
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

#[tauri::command]
pub async fn auth_logout(
    access_token: String,
    state: State<'_, AuthManagerState>,
) -> Result<(), String> {
    let manager = state.inner().read();
    manager.logout(&access_token)
}

#[tauri::command]
pub async fn auth_refresh_token(
    refresh_token: String,
    state: State<'_, AuthManagerState>,
) -> Result<AuthToken, String> {
    let manager = state.inner().read();
    manager.refresh_token(&refresh_token)
}

#[tauri::command]
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

#[tauri::command]
pub async fn auth_change_password(
    user_id: String,
    old_password: String,
    new_password: String,
    state: State<'_, AuthManagerState>,
) -> Result<(), String> {
    let manager = state.inner().read();
    manager.change_password(&user_id, &old_password, &new_password)
}

// ============================================================================
// API Security Commands
// ============================================================================

#[tauri::command]
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

#[tauri::command]
pub async fn api_revoke_key(
    key_id: String,
    state: State<'_, ApiSecurityState>,
) -> Result<(), String> {
    let manager = state.inner().read();
    manager.revoke_api_key(&key_id)
}

#[tauri::command]
pub async fn api_list_keys(state: State<'_, ApiSecurityState>) -> Result<String, String> {
    let manager = state.inner().read();
    let keys = manager.list_api_keys();
    Ok(serde_json::to_string(&keys).unwrap())
}

#[tauri::command]
pub async fn api_rotate_key(
    key_id: String,
    state: State<'_, ApiSecurityState>,
) -> Result<String, String> {
    let manager = state.inner().read();
    let key = manager.rotate_api_key(&key_id)?;
    Ok(serde_json::to_string(&key).unwrap())
}

#[tauri::command]
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

// ============================================================================
// Secure Storage Commands
// ============================================================================

#[tauri::command]
pub async fn storage_init_with_password(
    password: String,
    state: State<'_, SecureStorageState>,
) -> Result<(), String> {
    let storage = state.inner().read();
    storage.init_with_password(&password)
}

#[tauri::command]
pub async fn storage_unlock(
    password: String,
    state: State<'_, SecureStorageState>,
) -> Result<(), String> {
    let storage = state.inner().read();
    storage.unlock(&password)
}

#[tauri::command]
pub async fn storage_lock(state: State<'_, SecureStorageState>) -> Result<(), String> {
    let storage = state.inner().read();
    storage.lock();
    Ok(())
}

#[tauri::command]
pub async fn storage_is_unlocked(state: State<'_, SecureStorageState>) -> Result<bool, String> {
    let storage = state.inner().read();
    Ok(storage.is_unlocked())
}

#[tauri::command]
pub async fn storage_store_api_key(
    provider: String,
    api_key: String,
    state: State<'_, SecureStorageState>,
) -> Result<(), String> {
    let storage = state.inner().read();
    storage.store_api_key(&provider, &api_key)
}

#[tauri::command]
pub async fn storage_retrieve_api_key(
    provider: String,
    state: State<'_, SecureStorageState>,
) -> Result<String, String> {
    let storage = state.inner().read();
    storage.retrieve_api_key(&provider)
}

#[tauri::command]
pub async fn storage_delete_api_key(
    provider: String,
    state: State<'_, SecureStorageState>,
) -> Result<(), String> {
    let storage = state.inner().read();
    storage.delete_api_key(&provider)
}

#[tauri::command]
pub async fn storage_encrypt_file(
    input_path: String,
    output_path: String,
    password: String,
) -> Result<(), String> {
    crate::security::storage::encrypt_file(&input_path, &output_path, &password)
}

#[tauri::command]
pub async fn storage_decrypt_file(
    input_path: String,
    output_path: String,
    password: String,
) -> Result<(), String> {
    crate::security::storage::decrypt_file(&input_path, &output_path, &password)
}

// ============================================================================
// Update Security Commands
// ============================================================================

#[tauri::command]
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

#[tauri::command]
pub async fn update_compute_checksum(
    file_path: String,
    state: State<'_, UpdateSecurityState>,
) -> Result<String, String> {
    let manager = state.inner().read();
    manager.compute_file_checksum(&file_path)
}

#[tauri::command]
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

#[tauri::command]
pub async fn update_create_backup(
    source_dir: String,
    backup_dir: String,
    state: State<'_, UpdateSecurityState>,
) -> Result<(), String> {
    let manager = state.inner().read();
    manager.create_backup(&source_dir, &backup_dir)
}

#[tauri::command]
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
    use rusqlite::Connection;
    use std::sync::Mutex;

    #[tokio::test]
    async fn test_auth_flow() {
        // Create in-memory database for testing
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

        // Register
        let user_id = auth_register(
            "test@example.com".to_string(),
            "password123".to_string(),
            "editor".to_string(),
            State::from(&state),
        )
        .await
        .unwrap();

        assert!(!user_id.is_empty());

        // Login
        let token = auth_login(
            "test@example.com".to_string(),
            "password123".to_string(),
            State::from(&state),
        )
        .await
        .unwrap();

        assert!(!token.access_token.is_empty());

        // Validate
        let valid = auth_validate_token(token.access_token.clone(), State::from(&state))
            .await
            .unwrap();

        assert!(valid);

        // Logout
        auth_logout(token.access_token, State::from(&state))
            .await
            .unwrap();
    }
}
