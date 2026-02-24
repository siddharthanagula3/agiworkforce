//! Tauri commands for master password management (SECSYS-001)
//!
//! These commands expose the master password functionality to the frontend,
//! allowing users to set up, verify, and manage their master password.

use crate::sys::security::master_password::{
    MasterPasswordError, MasterPasswordManager, MasterPasswordStatus,
};
use rusqlite::Connection;
use serde::{Deserialize, Serialize};
use std::sync::{Arc, Mutex};
use tauri::State;

/// State wrapper for the master password manager
pub struct MasterPasswordState {
    pub manager: Arc<Mutex<MasterPasswordManager>>,
}

impl MasterPasswordState {
    /// Create a new master password state with an existing database connection
    pub fn new(db_conn: Arc<Mutex<Connection>>) -> Result<Self, String> {
        let manager = MasterPasswordManager::new(db_conn);
        manager
            .init_table()
            .map_err(|e| format!("Failed to initialize master password table: {}", e))?;

        Ok(Self {
            manager: Arc::new(Mutex::new(manager)),
        })
    }
}

/// Response for master password operations
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct MasterPasswordResponse {
    pub success: bool,
    pub message: String,
}

/// Check if the master password has been configured
#[tauri::command]
pub async fn master_password_is_configured(
    state: State<'_, MasterPasswordState>,
) -> Result<bool, String> {
    let manager = state
        .manager
        .lock()
        .map_err(|e| format!("Failed to acquire lock: {}", e))?;

    manager.is_configured().map_err(|e| e.to_string())
}

/// Check if the app is currently unlocked
#[tauri::command]
pub async fn master_password_is_unlocked(
    state: State<'_, MasterPasswordState>,
) -> Result<bool, String> {
    let manager = state
        .manager
        .lock()
        .map_err(|e| format!("Failed to acquire lock: {}", e))?;

    Ok(manager.is_unlocked())
}

/// Get the current master password status
#[tauri::command]
pub async fn master_password_get_status(
    state: State<'_, MasterPasswordState>,
) -> Result<MasterPasswordStatus, String> {
    let manager = state
        .manager
        .lock()
        .map_err(|e| format!("Failed to acquire lock: {}", e))?;

    manager.get_status().map_err(|e| e.to_string())
}

/// Set up the master password for the first time
#[tauri::command]
pub async fn master_password_setup(
    password: String,
    state: State<'_, MasterPasswordState>,
) -> Result<MasterPasswordResponse, String> {
    let manager = state
        .manager
        .lock()
        .map_err(|e| format!("Failed to acquire lock: {}", e))?;

    match manager.setup(&password) {
        Ok(()) => Ok(MasterPasswordResponse {
            success: true,
            message: "Master password set up successfully".to_string(),
        }),
        Err(MasterPasswordError::PasswordTooShort { min_length }) => Ok(MasterPasswordResponse {
            success: false,
            message: format!("Password must be at least {} characters long", min_length),
        }),
        Err(MasterPasswordError::AlreadyConfigured) => Ok(MasterPasswordResponse {
            success: false,
            message: "Master password is already configured".to_string(),
        }),
        Err(e) => Err(e.to_string()),
    }
}

/// Verify the master password (without unlocking)
#[tauri::command]
pub async fn master_password_verify(
    password: String,
    state: State<'_, MasterPasswordState>,
) -> Result<bool, String> {
    let manager = state
        .manager
        .lock()
        .map_err(|e| format!("Failed to acquire lock: {}", e))?;

    manager.verify(&password).map_err(|e| e.to_string())
}

/// Unlock the app with the master password
#[tauri::command]
pub async fn master_password_unlock(
    password: String,
    state: State<'_, MasterPasswordState>,
) -> Result<MasterPasswordResponse, String> {
    let manager = state
        .manager
        .lock()
        .map_err(|e| format!("Failed to acquire lock: {}", e))?;

    match manager.unlock(&password) {
        Ok(()) => Ok(MasterPasswordResponse {
            success: true,
            message: "App unlocked successfully".to_string(),
        }),
        Err(MasterPasswordError::InvalidPassword) => Ok(MasterPasswordResponse {
            success: false,
            message: "Invalid password".to_string(),
        }),
        Err(MasterPasswordError::NotConfigured) => Ok(MasterPasswordResponse {
            success: false,
            message: "Master password has not been set up yet".to_string(),
        }),
        Err(e) => Err(e.to_string()),
    }
}

/// Lock the app (clear cached key)
#[tauri::command]
pub async fn master_password_lock(
    state: State<'_, MasterPasswordState>,
) -> Result<MasterPasswordResponse, String> {
    let manager = state
        .manager
        .lock()
        .map_err(|e| format!("Failed to acquire lock: {}", e))?;

    manager.lock();

    Ok(MasterPasswordResponse {
        success: true,
        message: "App locked successfully".to_string(),
    })
}

/// Change the master password
#[tauri::command]
pub async fn master_password_change(
    current_password: String,
    new_password: String,
    state: State<'_, MasterPasswordState>,
) -> Result<MasterPasswordResponse, String> {
    let manager = state
        .manager
        .lock()
        .map_err(|e| format!("Failed to acquire lock: {}", e))?;

    match manager.change(&current_password, &new_password) {
        Ok(()) => Ok(MasterPasswordResponse {
            success: true,
            message: "Master password changed successfully".to_string(),
        }),
        Err(MasterPasswordError::InvalidPassword) => Ok(MasterPasswordResponse {
            success: false,
            message: "Current password is incorrect".to_string(),
        }),
        Err(MasterPasswordError::PasswordTooShort { min_length }) => Ok(MasterPasswordResponse {
            success: false,
            message: format!(
                "New password must be at least {} characters long",
                min_length
            ),
        }),
        Err(e) => Err(e.to_string()),
    }
}

/// Check if migration from machine-only keys is needed
#[tauri::command]
pub async fn master_password_needs_migration(
    state: State<'_, MasterPasswordState>,
) -> Result<bool, String> {
    let manager = state
        .manager
        .lock()
        .map_err(|e| format!("Failed to acquire lock: {}", e))?;

    manager.needs_migration().map_err(|e| e.to_string())
}

/// Start the migration process
#[tauri::command]
pub async fn master_password_start_migration(
    state: State<'_, MasterPasswordState>,
) -> Result<MasterPasswordResponse, String> {
    let manager = state
        .manager
        .lock()
        .map_err(|e| format!("Failed to acquire lock: {}", e))?;

    match manager.start_migration() {
        Ok(()) => Ok(MasterPasswordResponse {
            success: true,
            message: "Migration started".to_string(),
        }),
        Err(e) => Err(e.to_string()),
    }
}

/// Complete the migration process
#[tauri::command]
pub async fn master_password_complete_migration(
    state: State<'_, MasterPasswordState>,
) -> Result<MasterPasswordResponse, String> {
    let manager = state
        .manager
        .lock()
        .map_err(|e| format!("Failed to acquire lock: {}", e))?;

    match manager.complete_migration() {
        Ok(()) => Ok(MasterPasswordResponse {
            success: true,
            message: "Migration completed successfully".to_string(),
        }),
        Err(e) => Err(e.to_string()),
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    // gitleaks:allow (test fixture — not a real secret)
    fn valid_test_passphrase() -> &'static str { "alpha-beta-unique-phrase" }
    // gitleaks:allow (test fixture — not a real secret)
    fn invalid_test_passphrase() -> &'static str { "nonmatching-phrase" }

    fn create_test_state() -> MasterPasswordState {
        // Use in-memory database for tests to avoid temp file cleanup issues
        let conn = Connection::open_in_memory().unwrap();
        MasterPasswordState::new(Arc::new(Mutex::new(conn))).unwrap()
    }

    #[tokio::test]
    async fn test_setup_and_unlock_flow() {
        let state = create_test_state();
        let manager = state.manager.lock().unwrap();

        // Initially not configured
        assert!(!manager.is_configured().unwrap());

        // Setup
        manager.setup(valid_test_passphrase()).unwrap();
        assert!(manager.is_configured().unwrap());

        // Verify
        assert!(manager.verify(valid_test_passphrase()).unwrap());
        assert!(!manager.verify(invalid_test_passphrase()).unwrap());

        // Lock and unlock
        manager.lock();
        assert!(!manager.is_unlocked());

        manager.unlock(valid_test_passphrase()).unwrap();
        assert!(manager.is_unlocked());
    }
}
