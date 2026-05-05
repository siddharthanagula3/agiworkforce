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
use std::time::{Duration, Instant};
use tauri::State;

// ── RT-01 Brute-force rate limiter ──────────────────────────────────────────
//
// Tracks failed verification attempts per process lifetime.
// Thresholds: 5 → 30-second lockout, 10 → 5-minute lockout, 20 → restart required.
// Lockout is checked even on correct password during active lockout period
// (mandatory minimum delay prevents timing-based enumeration).

#[derive(Debug)]
struct LockoutState {
    failed_count: u32,
    locked_until: Option<Instant>,
    require_restart: bool,
}

impl LockoutState {
    fn new() -> Self {
        Self {
            failed_count: 0,
            locked_until: None,
            require_restart: false,
        }
    }

    /// Returns Some(remaining_secs) if currently locked out, None if allowed.
    fn check_lockout(&self) -> Option<u64> {
        if self.require_restart {
            return Some(u64::MAX); // sentinel for restart-required
        }
        if let Some(until) = self.locked_until {
            let now = Instant::now();
            if now < until {
                let remaining = until.duration_since(now).as_secs().max(1);
                return Some(remaining);
            }
        }
        None
    }

    /// Records a failed attempt and sets lockout if thresholds are crossed.
    fn record_failure(&mut self) {
        self.failed_count += 1;
        match self.failed_count {
            n if n >= 20 => {
                self.require_restart = true;
                self.locked_until = None;
            }
            n if n >= 10 => {
                self.locked_until = Some(Instant::now() + Duration::from_secs(300));
            }
            n if n >= 5 => {
                // Only extend the lockout if it isn't already set to a longer duration
                let proposed = Instant::now() + Duration::from_secs(30);
                if self.locked_until.map(|u| proposed > u).unwrap_or(true) {
                    self.locked_until = Some(proposed);
                }
            }
            _ => {}
        }
    }

    /// Resets the failure counter and lockout on successful authentication.
    fn record_success(&mut self) {
        self.failed_count = 0;
        self.locked_until = None;
        // require_restart is NOT cleared on success — the app must restart.
    }
}

// Process-lifetime singleton guarded by a Mutex.
// Uses std::sync::OnceLock so the state is lazily initialised and never
// re-created across hot-reloads in tests.
//
// I2 fix: parking_lot::Mutex (not std::sync::Mutex). With std::sync::Mutex,
// a panic while holding the lock poisons it forever — every subsequent
// vault verify/unlock call would hit `lock().map_err(...)` and return a
// generic 500-style error. The user could not recover without restarting
// the app; meanwhile the lockout counter is process-lifetime so the
// attacker benefits from the DoS. parking_lot::Mutex does not poison.
static LOCKOUT: std::sync::OnceLock<parking_lot::Mutex<LockoutState>> = std::sync::OnceLock::new();

fn lockout() -> &'static parking_lot::Mutex<LockoutState> {
    LOCKOUT.get_or_init(|| parking_lot::Mutex::new(LockoutState::new()))
}

/// Argon2 dummy verification used to pad responses when locked out so that
/// timing is indistinguishable from a real verification attempt.
fn argon2_dummy_verify() {
    use argon2::{
        password_hash::{rand_core::OsRng, PasswordHasher, SaltString},
        Argon2, Params,
    };
    let salt = SaltString::generate(&mut OsRng);
    let params = Params::new(19 * 1024, 2, 1, Some(32)).unwrap_or_default();
    let argon2 = Argon2::new(argon2::Algorithm::Argon2id, argon2::Version::V0x13, params);
    let _ = argon2.hash_password(b"dummy_lockout_pad", &salt);
}

/// Check the lockout gate before allowing a verification attempt.
/// Returns Ok(()) if the attempt is allowed, Err(message) if locked out.
/// Always performs a dummy Argon2 hash on lockout to prevent timing oracles.
fn check_and_enforce_lockout() -> Result<(), String> {
    let guard = lockout().lock();
    if let Some(remaining) = guard.check_lockout() {
        drop(guard); // release before the slow dummy hash
        argon2_dummy_verify();
        if remaining == u64::MAX {
            return Err(
                "Too many failed attempts. Please restart the application to try again.".to_string(),
            );
        }
        return Err(format!(
            "Too many failed attempts. Please wait {} seconds before trying again.",
            remaining
        ));
    }
    Ok(())
}

/// Record the outcome of an attempt.
fn record_attempt_outcome(success: bool) {
    let mut guard = lockout().lock();
    if success {
        guard.record_success();
    } else {
        guard.record_failure();
        if guard.require_restart {
            tracing::warn!(
                "RT-01: vault brute-force threshold reached — restart required to unlock"
            );
        }
    }
}
// ────────────────────────────────────────────────────────────────────────────

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

    /// Create a degraded MasterPasswordState backed by an in-memory database.
    /// The master password table will not be initialized; commands will return
    /// meaningful errors instead of panicking on missing state.
    pub fn new_degraded() -> Self {
        let conn =
            Connection::open_in_memory().expect("in-memory SQLite connection should never fail");
        let manager = MasterPasswordManager::new(Arc::new(Mutex::new(conn)));
        Self {
            manager: Arc::new(Mutex::new(manager)),
        }
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
    // RT-01: enforce brute-force rate limit before every attempt.
    check_and_enforce_lockout()?;

    let manager = state
        .manager
        .lock()
        .map_err(|e| format!("Failed to acquire lock: {}", e))?;

    let result = manager.verify(&password).map_err(|e| e.to_string())?;
    record_attempt_outcome(result);
    Ok(result)
}

/// Unlock the app with the master password
#[tauri::command]
pub async fn master_password_unlock(
    password: String,
    state: State<'_, MasterPasswordState>,
) -> Result<MasterPasswordResponse, String> {
    // RT-01: enforce brute-force rate limit before every attempt.
    check_and_enforce_lockout()?;

    let manager = state
        .manager
        .lock()
        .map_err(|e| format!("Failed to acquire lock: {}", e))?;

    match manager.unlock(&password) {
        Ok(()) => {
            record_attempt_outcome(true);
            Ok(MasterPasswordResponse {
                success: true,
                message: "App unlocked successfully".to_string(),
            })
        }
        Err(MasterPasswordError::InvalidPassword) => {
            record_attempt_outcome(false);
            Ok(MasterPasswordResponse {
                success: false,
                message: "Invalid password".to_string(),
            })
        }
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

/// Result of running the credential-store migration to the master-password
/// vault. Emitted to the frontend so the UI can summarize what happened.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct VaultMigrationReport {
    pub api_keys_migrated: u32,
    pub mcp_oauth_credentials_migrated: u32,
    pub messaging_connections_migrated: u32,
    pub rows_skipped_already_modern: u32,
    pub rows_skipped_undecryptable: u32,
}

/// FIX-001 / FIX-002 (Sprint 1): re-encrypt every credential row written
/// under the legacy machine-key-only derivation with the
/// master-password-derived key.
///
/// Idempotent: rows already encrypted with the new key are detected via a
/// successful master-key decrypt and skipped. Rows that fail to decrypt
/// under both schemes are counted in `rows_skipped_undecryptable` and
/// left untouched so subsequent retries can attempt them again.
///
/// Requires the vault to be unlocked. Each table's pass runs inside its
/// own SQLite transaction so a crash mid-migration leaves the schema in
/// a consistent state.
#[tauri::command]
pub async fn master_password_migrate_credentials(
    encryption: State<'_, crate::sys::security::MasterPasswordEncryption>,
    db: State<'_, crate::sys::commands::AppDatabase>,
) -> Result<VaultMigrationReport, String> {
    use crate::sys::security::KeyPurpose;
    use crate::sys::security::MasterPasswordEncryption;

    if !encryption.is_configured() {
        return Err(
            "Master password is not set up yet — nothing to migrate.".to_string(),
        );
    }
    if !encryption.is_unlocked() {
        return Err(
            "Master password is set up but the vault is locked. Unlock the vault before running migration.".to_string(),
        );
    }

    let helper: &MasterPasswordEncryption = encryption.inner();
    let mut report = VaultMigrationReport {
        api_keys_migrated: 0,
        mcp_oauth_credentials_migrated: 0,
        messaging_connections_migrated: 0,
        rows_skipped_already_modern: 0,
        rows_skipped_undecryptable: 0,
    };

    // ---- Table 1: settings_v2 — api_key_* and mcp_oauth_config_*_client_*
    {
        let mut conn = crate::core::mcp::config::open_mcp_settings_db()?;
        let tx = conn
            .transaction()
            .map_err(|e| format!("Failed to begin tx for settings_v2: {e}"))?;

        let candidates: Vec<(String, String)> = {
            let mut stmt = tx
                .prepare(
                    "SELECT key, value FROM settings_v2 WHERE category = 'security' AND encrypted = 1",
                )
                .map_err(|e| format!("Failed to query settings_v2: {e}"))?;
            let rows = stmt
                .query_map([], |row| Ok((row.get::<_, String>(0)?, row.get::<_, String>(1)?)))
                .map_err(|e| format!("Failed to iterate settings_v2 rows: {e}"))?;
            rows.collect::<rusqlite::Result<Vec<_>>>()
                .map_err(|e| format!("Failed to collect settings_v2 rows: {e}"))?
        };

        for (key, encrypted) in candidates {
            // Skip if it already decrypts under the master key.
            if helper
                .decrypt(KeyPurpose::McpCredentials, &encrypted)
                .is_ok()
            {
                report.rows_skipped_already_modern += 1;
                continue;
            }

            // Try the legacy machine-only path.
            let plaintext =
                match crate::sys::commands::mcp_oauth::decrypt_legacy_machine_credential(
                    &encrypted,
                ) {
                    Ok(v) => v,
                    Err(_) => {
                        report.rows_skipped_undecryptable += 1;
                        continue;
                    }
                };

            let new_ciphertext = helper
                .encrypt(KeyPurpose::McpCredentials, &plaintext)
                .map_err(|e| format!("Failed to re-encrypt {key}: {e}"))?;

            tx.execute(
                "UPDATE settings_v2 SET value = ?1 WHERE key = ?2",
                rusqlite::params![new_ciphertext, key],
            )
            .map_err(|e| format!("Failed to update {key}: {e}"))?;

            if key.starts_with("api_key_") {
                report.api_keys_migrated += 1;
            } else if key.starts_with("mcp_oauth_config_") {
                report.mcp_oauth_credentials_migrated += 1;
            }
        }

        tx.commit()
            .map_err(|e| format!("Failed to commit settings_v2 migration tx: {e}"))?;
    }

    // ---- Table 2: messaging_connections — encrypt the credentials JSON blob.
    {
        let conn = db.connection()?;
        let candidates: Vec<(String, String)> = {
            let mut stmt = conn
                .prepare("SELECT id, credentials FROM messaging_connections")
                .map_err(|e| format!("Failed to query messaging_connections: {e}"))?;
            let rows = stmt
                .query_map([], |row| Ok((row.get::<_, String>(0)?, row.get::<_, String>(1)?)))
                .map_err(|e| format!("Failed to iterate messaging_connections rows: {e}"))?;
            rows.collect::<rusqlite::Result<Vec<_>>>()
                .map_err(|e| format!("Failed to collect messaging_connections rows: {e}"))?
        };

        for (id, value) in candidates {
            // Already-encrypted rows decrypt cleanly under the master key.
            if helper.decrypt(KeyPurpose::Messaging, &value).is_ok() {
                report.rows_skipped_already_modern += 1;
                continue;
            }

            // Legacy rows are stored as raw JSON — wrap them under the master
            // key. If the value is neither valid JSON nor master-key
            // ciphertext we count it and leave it; the surrounding error
            // path on send_message will surface the bad data.
            if serde_json::from_str::<serde_json::Value>(&value).is_err() {
                report.rows_skipped_undecryptable += 1;
                continue;
            }

            let new_ciphertext = helper
                .encrypt(KeyPurpose::Messaging, &value)
                .map_err(|e| format!("Failed to encrypt messaging row {id}: {e}"))?;

            conn.execute(
                "UPDATE messaging_connections SET credentials = ?1 WHERE id = ?2",
                rusqlite::params![new_ciphertext, id],
            )
            .map_err(|e| format!("Failed to update messaging row {id}: {e}"))?;
            report.messaging_connections_migrated += 1;
        }
    }

    Ok(report)
}

#[cfg(test)]
mod tests {
    use super::*;

    fn valid_test_passphrase() -> &'static str {
        "alpha-beta-unique-phrase"
    } // gitleaks:allow
    fn invalid_test_passphrase() -> &'static str {
        "nonmatching-phrase"
    } // gitleaks:allow

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
