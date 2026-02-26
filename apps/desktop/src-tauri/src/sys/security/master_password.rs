//! Master Password Management for Secure Key Derivation
//!
//! This module implements user password-based key derivation to add a proper
//! security layer on top of machine-based keys. Keys are now derived using:
//!
//! 1. User's master password (Argon2id hashed)
//! 2. Machine-specific identifiers
//! 3. Purpose-specific salts (via HKDF)
//!
//! # Security Model
//!
//! - Password verification uses Argon2id with OWASP-recommended parameters
//! - Key derivation combines password-derived key with machine ID
//! - Final keys use HKDF-SHA256 for purpose separation
//! - Password verifier stored in database (not the password itself)
//!
//! # Migration Support
//!
//! For existing installations without a master password:
//! - Old machine-only keys remain available during migration
//! - `needs_migration()` detects if secrets need re-encryption
//! - Migration re-encrypts all secrets with new password-based keys

use super::machine_key::{self, KeyPurpose};
use argon2::{
    password_hash::{rand_core::OsRng, PasswordHash, PasswordHasher, PasswordVerifier, SaltString},
    Argon2, Params, Version,
};
use base64::{engine::general_purpose, Engine as _};
use chrono::Utc;
use rusqlite::Connection;
use serde::{Deserialize, Serialize};
use sha2::Sha256;
use std::sync::{Arc, Mutex};

// AUDIT-003-015 fix: Secure zeroization function that prevents compiler optimization
// from eliding the memory clearing operation. Uses volatile write semantics and
// memory barrier to ensure the zeroing actually happens.
#[allow(unsafe_code)]
fn secure_zeroize(data: &mut [u8]) {
    // Use volatile write to prevent compiler optimization
    for byte in data.iter_mut() {
        // SAFETY: volatile_write ensures the write is not optimized away
        unsafe {
            std::ptr::write_volatile(byte, 0);
        }
    }
    // Memory barrier to ensure all writes complete before returning
    std::sync::atomic::compiler_fence(std::sync::atomic::Ordering::SeqCst);
}

/// Argon2id parameters following OWASP recommendations
/// - Memory: 19 MiB (19456 KiB)
/// - Iterations: 2
/// - Parallelism: 1
const ARGON2_MEMORY_KIB: u32 = 19 * 1024; // 19 MiB
const ARGON2_ITERATIONS: u32 = 2;
const ARGON2_PARALLELISM: u32 = 1;
const ARGON2_OUTPUT_LEN: usize = 32;

/// HKDF output key size (256 bits for AES-256)
const DERIVED_KEY_SIZE: usize = 32;

/// Minimum password length for security
const MIN_PASSWORD_LENGTH: usize = 8;

/// Error types for master password operations
#[derive(Debug, Clone, Serialize, Deserialize)]
pub enum MasterPasswordError {
    /// Password is too short
    PasswordTooShort { min_length: usize },
    /// Password verification failed
    InvalidPassword,
    /// Master password is not configured yet
    NotConfigured,
    /// Master password is already configured
    AlreadyConfigured,
    /// Database error
    DatabaseError(String),
    /// Cryptographic operation failed
    CryptoError(String),
    /// App is currently locked
    AppLocked,
}

impl std::fmt::Display for MasterPasswordError {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        match self {
            MasterPasswordError::PasswordTooShort { min_length } => {
                write!(
                    f,
                    "Password must be at least {} characters long",
                    min_length
                )
            }
            MasterPasswordError::InvalidPassword => write!(f, "Invalid password"),
            MasterPasswordError::NotConfigured => {
                write!(f, "Master password has not been set up yet")
            }
            MasterPasswordError::AlreadyConfigured => {
                write!(f, "Master password is already configured")
            }
            MasterPasswordError::DatabaseError(msg) => write!(f, "Database error: {}", msg),
            MasterPasswordError::CryptoError(msg) => write!(f, "Cryptographic error: {}", msg),
            MasterPasswordError::AppLocked => {
                write!(f, "App is locked. Please unlock with your master password.")
            }
        }
    }
}

impl std::error::Error for MasterPasswordError {}

/// Stored Argon2 parameters for future-proofing
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Argon2Params {
    pub memory_kib: u32,
    pub iterations: u32,
    pub parallelism: u32,
    pub output_len: usize,
}

impl Default for Argon2Params {
    fn default() -> Self {
        Self {
            memory_kib: ARGON2_MEMORY_KIB,
            iterations: ARGON2_ITERATIONS,
            parallelism: ARGON2_PARALLELISM,
            output_len: ARGON2_OUTPUT_LEN,
        }
    }
}

/// Master password configuration status
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct MasterPasswordStatus {
    /// Whether a master password has been configured
    pub is_configured: bool,
    /// Whether the app is currently unlocked
    pub is_unlocked: bool,
    /// When the password was last changed (if configured)
    pub last_changed: Option<String>,
    /// Whether migration from machine-only keys is needed
    pub needs_migration: bool,
}

/// Manager for master password operations
pub struct MasterPasswordManager {
    db_conn: Arc<Mutex<Connection>>,
    /// Cached derived key after successful unlock (cleared on lock)
    cached_key: Arc<Mutex<Option<Vec<u8>>>>,
}

impl MasterPasswordManager {
    /// Create a new master password manager
    pub fn new(db_conn: Arc<Mutex<Connection>>) -> Self {
        Self {
            db_conn,
            cached_key: Arc::new(Mutex::new(None)),
        }
    }

    /// Initialize the database table for master password storage
    pub fn init_table(&self) -> Result<(), MasterPasswordError> {
        let conn = self.db_conn.lock().map_err(|e| {
            MasterPasswordError::DatabaseError(format!("Failed to acquire lock: {}", e))
        })?;

        conn.execute(
            "CREATE TABLE IF NOT EXISTS master_password (
                id INTEGER PRIMARY KEY CHECK (id = 1),
                verifier_hash TEXT NOT NULL,
                verifier_salt TEXT NOT NULL,
                argon2_params TEXT NOT NULL,
                created_at TEXT NOT NULL,
                updated_at TEXT NOT NULL
            )",
            [],
        )
        .map_err(|e| MasterPasswordError::DatabaseError(e.to_string()))?;

        // Create migration tracking table
        conn.execute(
            "CREATE TABLE IF NOT EXISTS master_password_migration (
                id INTEGER PRIMARY KEY CHECK (id = 1),
                migration_started_at TEXT,
                migration_completed_at TEXT,
                secrets_migrated INTEGER DEFAULT 0,
                status TEXT NOT NULL DEFAULT 'pending'
            )",
            [],
        )
        .map_err(|e| MasterPasswordError::DatabaseError(e.to_string()))?;

        Ok(())
    }

    /// Check if a master password has been configured
    pub fn is_configured(&self) -> Result<bool, MasterPasswordError> {
        let conn = self.db_conn.lock().map_err(|e| {
            MasterPasswordError::DatabaseError(format!("Failed to acquire lock: {}", e))
        })?;

        let count: i32 = conn
            .query_row(
                "SELECT COUNT(*) FROM master_password WHERE id = 1",
                [],
                |row| row.get(0),
            )
            .unwrap_or(0);

        Ok(count > 0)
    }

    /// Check if the app is currently unlocked
    pub fn is_unlocked(&self) -> bool {
        self.cached_key
            .lock()
            .map(|guard| guard.is_some())
            .unwrap_or(false)
    }

    /// Get the current master password status
    pub fn get_status(&self) -> Result<MasterPasswordStatus, MasterPasswordError> {
        let is_configured = self.is_configured()?;
        let is_unlocked = self.is_unlocked();

        let last_changed = if is_configured {
            let conn = self.db_conn.lock().map_err(|e| {
                MasterPasswordError::DatabaseError(format!("Failed to acquire lock: {}", e))
            })?;

            conn.query_row(
                "SELECT updated_at FROM master_password WHERE id = 1",
                [],
                |row| row.get::<_, String>(0),
            )
            .ok()
        } else {
            None
        };

        let needs_migration = self.needs_migration()?;

        Ok(MasterPasswordStatus {
            is_configured,
            is_unlocked,
            last_changed,
            needs_migration,
        })
    }

    /// Set up the master password for the first time
    pub fn setup(&self, password: &str) -> Result<(), MasterPasswordError> {
        // Check if already configured
        if self.is_configured()? {
            return Err(MasterPasswordError::AlreadyConfigured);
        }

        // Validate password length
        if password.len() < MIN_PASSWORD_LENGTH {
            return Err(MasterPasswordError::PasswordTooShort {
                min_length: MIN_PASSWORD_LENGTH,
            });
        }

        // Generate salt and hash password
        let salt = SaltString::generate(&mut OsRng);
        let argon2 = self.create_argon2()?;

        let password_hash = argon2
            .hash_password(password.as_bytes(), &salt)
            .map_err(|e| {
                MasterPasswordError::CryptoError(format!("Failed to hash password: {}", e))
            })?;

        let params = Argon2Params::default();
        let params_json = serde_json::to_string(&params).map_err(|e| {
            MasterPasswordError::CryptoError(format!("Failed to serialize params: {}", e))
        })?;

        let now = Utc::now().to_rfc3339();

        // Store in database
        let conn = self.db_conn.lock().map_err(|e| {
            MasterPasswordError::DatabaseError(format!("Failed to acquire lock: {}", e))
        })?;

        conn.execute(
            "INSERT INTO master_password (id, verifier_hash, verifier_salt, argon2_params, created_at, updated_at)
             VALUES (1, ?1, ?2, ?3, ?4, ?5)",
            [
                password_hash.to_string(),
                salt.to_string(),
                params_json,
                now.clone(),
                now,
            ],
        )
        .map_err(|e| MasterPasswordError::DatabaseError(e.to_string()))?;

        // Cache the derived key
        let derived_key = self.derive_password_key(password, &salt)?;
        if let Ok(mut cache) = self.cached_key.lock() {
            *cache = Some(derived_key);
        }

        Ok(())
    }

    /// Verify the master password
    pub fn verify(&self, password: &str) -> Result<bool, MasterPasswordError> {
        if !self.is_configured()? {
            return Err(MasterPasswordError::NotConfigured);
        }

        let conn = self.db_conn.lock().map_err(|e| {
            MasterPasswordError::DatabaseError(format!("Failed to acquire lock: {}", e))
        })?;

        let stored_hash: String = conn
            .query_row(
                "SELECT verifier_hash FROM master_password WHERE id = 1",
                [],
                |row| row.get(0),
            )
            .map_err(|e| MasterPasswordError::DatabaseError(e.to_string()))?;

        let parsed_hash = PasswordHash::new(&stored_hash)
            .map_err(|e| MasterPasswordError::CryptoError(format!("Invalid stored hash: {}", e)))?;

        let argon2 = self.create_argon2()?;
        Ok(argon2
            .verify_password(password.as_bytes(), &parsed_hash)
            .is_ok())
    }

    /// Unlock the app with the master password
    pub fn unlock(&self, password: &str) -> Result<(), MasterPasswordError> {
        if !self.verify(password)? {
            return Err(MasterPasswordError::InvalidPassword);
        }

        // Get the salt to derive the key
        let conn = self.db_conn.lock().map_err(|e| {
            MasterPasswordError::DatabaseError(format!("Failed to acquire lock: {}", e))
        })?;

        let stored_salt: String = conn
            .query_row(
                "SELECT verifier_salt FROM master_password WHERE id = 1",
                [],
                |row| row.get(0),
            )
            .map_err(|e| MasterPasswordError::DatabaseError(e.to_string()))?;

        drop(conn); // Release lock before deriving key

        let salt = SaltString::from_b64(&stored_salt)
            .map_err(|e| MasterPasswordError::CryptoError(format!("Invalid stored salt: {}", e)))?;

        let derived_key = self.derive_password_key(password, &salt)?;

        if let Ok(mut cache) = self.cached_key.lock() {
            *cache = Some(derived_key);
        }

        Ok(())
    }

    /// Lock the app (clear cached key)
    pub fn lock(&self) {
        if let Ok(mut cache) = self.cached_key.lock() {
            // AUDIT-003-015 fix: Securely clear the key using volatile write
            // and memory barrier to prevent compiler optimization from eliding
            // the zeroization.
            if let Some(ref mut key) = *cache {
                secure_zeroize(key);
            }
            *cache = None;
        }
    }

    /// Change the master password
    pub fn change(
        &self,
        current_password: &str,
        new_password: &str,
    ) -> Result<(), MasterPasswordError> {
        // Verify current password
        if !self.verify(current_password)? {
            return Err(MasterPasswordError::InvalidPassword);
        }

        // Validate new password length
        if new_password.len() < MIN_PASSWORD_LENGTH {
            return Err(MasterPasswordError::PasswordTooShort {
                min_length: MIN_PASSWORD_LENGTH,
            });
        }

        // Generate new salt and hash
        let salt = SaltString::generate(&mut OsRng);
        let argon2 = self.create_argon2()?;

        let password_hash = argon2
            .hash_password(new_password.as_bytes(), &salt)
            .map_err(|e| {
                MasterPasswordError::CryptoError(format!("Failed to hash password: {}", e))
            })?;

        let params = Argon2Params::default();
        let params_json = serde_json::to_string(&params).map_err(|e| {
            MasterPasswordError::CryptoError(format!("Failed to serialize params: {}", e))
        })?;

        let now = Utc::now().to_rfc3339();

        // Update in database
        let conn = self.db_conn.lock().map_err(|e| {
            MasterPasswordError::DatabaseError(format!("Failed to acquire lock: {}", e))
        })?;

        conn.execute(
            "UPDATE master_password SET verifier_hash = ?1, verifier_salt = ?2, argon2_params = ?3, updated_at = ?4 WHERE id = 1",
            [
                password_hash.to_string(),
                salt.to_string(),
                params_json,
                now,
            ],
        )
        .map_err(|e| MasterPasswordError::DatabaseError(e.to_string()))?;

        drop(conn);

        // Update cached key
        let derived_key = self.derive_password_key(new_password, &salt)?;
        if let Ok(mut cache) = self.cached_key.lock() {
            // AUDIT-003-015 fix: Clear old key securely
            if let Some(ref mut key) = *cache {
                secure_zeroize(key);
            }
            *cache = Some(derived_key);
        }

        Ok(())
    }

    /// Derive an encryption key using the master password and machine ID
    ///
    /// Key derivation flow:
    /// 1. password_key = Argon2id(password, stored_salt)
    /// 2. combined = password_key || machine_id
    /// 3. final_key = HKDF-SHA256(combined, purpose_salt, 32)
    pub fn derive_key(&self, purpose: KeyPurpose) -> Result<Vec<u8>, MasterPasswordError> {
        let cached_key = self.cached_key.lock().map_err(|e| {
            MasterPasswordError::CryptoError(format!("Failed to acquire lock: {}", e))
        })?;

        let password_key = cached_key.as_ref().ok_or(MasterPasswordError::AppLocked)?;

        // Get machine ID
        let machine_id = machine_key::get_machine_id_hash();

        // Combine password key and machine ID
        let mut combined = password_key.clone();
        combined.extend_from_slice(machine_id.as_bytes());

        // Use HKDF to derive the final key
        self.hkdf_derive(&combined, purpose)
    }

    /// Check if migration from machine-only keys is needed
    pub fn needs_migration(&self) -> Result<bool, MasterPasswordError> {
        // If not configured, no migration needed (new install)
        if !self.is_configured()? {
            return Ok(false);
        }

        let conn = self.db_conn.lock().map_err(|e| {
            MasterPasswordError::DatabaseError(format!("Failed to acquire lock: {}", e))
        })?;

        // Check if migration tracking exists and is complete
        let status: Option<String> = conn
            .query_row(
                "SELECT status FROM master_password_migration WHERE id = 1",
                [],
                |row| row.get(0),
            )
            .ok();

        match status {
            Some(s) if s == "completed" => Ok(false),
            Some(_) => Ok(true), // In progress or pending
            None => {
                // No migration record exists - check if there are existing secrets
                // that need migration
                let has_old_secrets: i32 = conn
                    .query_row(
                        "SELECT COUNT(*) FROM settings WHERE encrypted = 1",
                        [],
                        |row| row.get(0),
                    )
                    .unwrap_or(0);

                Ok(has_old_secrets > 0)
            }
        }
    }

    /// Mark migration as started
    pub fn start_migration(&self) -> Result<(), MasterPasswordError> {
        let conn = self.db_conn.lock().map_err(|e| {
            MasterPasswordError::DatabaseError(format!("Failed to acquire lock: {}", e))
        })?;

        let now = Utc::now().to_rfc3339();

        conn.execute(
            "INSERT OR REPLACE INTO master_password_migration (id, migration_started_at, status)
             VALUES (1, ?1, 'in_progress')",
            [&now],
        )
        .map_err(|e| MasterPasswordError::DatabaseError(e.to_string()))?;

        Ok(())
    }

    /// Update migration progress
    pub fn update_migration_progress(
        &self,
        secrets_migrated: i32,
    ) -> Result<(), MasterPasswordError> {
        let conn = self.db_conn.lock().map_err(|e| {
            MasterPasswordError::DatabaseError(format!("Failed to acquire lock: {}", e))
        })?;

        conn.execute(
            "UPDATE master_password_migration SET secrets_migrated = ?1 WHERE id = 1",
            [secrets_migrated],
        )
        .map_err(|e| MasterPasswordError::DatabaseError(e.to_string()))?;

        Ok(())
    }

    /// Mark migration as complete
    pub fn complete_migration(&self) -> Result<(), MasterPasswordError> {
        let conn = self.db_conn.lock().map_err(|e| {
            MasterPasswordError::DatabaseError(format!("Failed to acquire lock: {}", e))
        })?;

        let now = Utc::now().to_rfc3339();

        conn.execute(
            "UPDATE master_password_migration SET migration_completed_at = ?1, status = 'completed' WHERE id = 1",
            [&now],
        )
        .map_err(|e| MasterPasswordError::DatabaseError(e.to_string()))?;

        Ok(())
    }

    /// Create an Argon2 instance with the configured parameters
    fn create_argon2(&self) -> Result<Argon2<'static>, MasterPasswordError> {
        let params = Params::new(
            ARGON2_MEMORY_KIB,
            ARGON2_ITERATIONS,
            ARGON2_PARALLELISM,
            Some(ARGON2_OUTPUT_LEN),
        )
        .map_err(|e| MasterPasswordError::CryptoError(format!("Invalid Argon2 params: {}", e)))?;

        Ok(Argon2::new(
            argon2::Algorithm::Argon2id,
            Version::V0x13,
            params,
        ))
    }

    /// Derive a key from the password using Argon2
    fn derive_password_key(
        &self,
        password: &str,
        salt: &SaltString,
    ) -> Result<Vec<u8>, MasterPasswordError> {
        let argon2 = self.create_argon2()?;

        let mut output = vec![0u8; ARGON2_OUTPUT_LEN];
        // SaltString stores base64-encoded salt, use as_str() to get the string representation
        argon2
            .hash_password_into(password.as_bytes(), salt.as_str().as_bytes(), &mut output)
            .map_err(|e| {
                MasterPasswordError::CryptoError(format!("Failed to derive key: {}", e))
            })?;

        Ok(output)
    }

    /// Use HKDF-SHA256 to derive a purpose-specific key
    fn hkdf_derive(
        &self,
        input_key: &[u8],
        purpose: KeyPurpose,
    ) -> Result<Vec<u8>, MasterPasswordError> {
        use hmac::{Hmac, Mac};

        // Create purpose-specific info string
        let info = format!("agiworkforce:{}:v1", purpose.as_str());

        // HKDF-Extract: PRK = HMAC(salt, IKM)
        // Using a fixed salt derived from app identifier
        let salt = b"com.agiworkforce.desktop:master_password:v1";
        let mut extract_hmac = <Hmac<Sha256> as Mac>::new_from_slice(salt)
            .map_err(|e| MasterPasswordError::CryptoError(format!("HMAC init failed: {}", e)))?;
        extract_hmac.update(input_key);
        let prk = extract_hmac.finalize().into_bytes();

        // HKDF-Expand: OKM = HMAC(PRK, info || 0x01)
        let mut expand_hmac = <Hmac<Sha256> as Mac>::new_from_slice(&prk)
            .map_err(|e| MasterPasswordError::CryptoError(format!("HMAC init failed: {}", e)))?;
        expand_hmac.update(info.as_bytes());
        expand_hmac.update(&[0x01]);
        let okm = expand_hmac.finalize().into_bytes();

        Ok(okm[..DERIVED_KEY_SIZE].to_vec())
    }
}

/// Get the key derivation result as base64 for storage/comparison
pub fn derive_key_base64(
    manager: &MasterPasswordManager,
    purpose: KeyPurpose,
) -> Result<String, MasterPasswordError> {
    let key = manager.derive_key(purpose)?;
    Ok(general_purpose::STANDARD.encode(&key))
}

#[cfg(test)]
mod tests {
    use super::*;

    // gitleaks:allow (test fixture — not a real secret)
    fn valid_test_passphrase() -> &'static str {
        "alpha-beta-unique-phrase"
    }
    // gitleaks:allow (test fixture — not a real secret)
    fn alternate_test_passphrase() -> &'static str {
        "gamma-delta-alt-phrase"
    }
    // gitleaks:allow (test fixture — not a real secret)
    fn invalid_test_passphrase() -> &'static str {
        "nonmatching-phrase"
    }
    // gitleaks:allow (test fixture — not a real secret)
    fn too_short_test_passphrase() -> &'static str {
        "tiny"
    }

    fn create_test_manager() -> MasterPasswordManager {
        // Use in-memory database for tests to avoid temp file cleanup issues
        let conn = Connection::open_in_memory().unwrap();
        let manager = MasterPasswordManager::new(Arc::new(Mutex::new(conn)));
        manager.init_table().unwrap();
        manager
    }

    #[test]
    fn test_setup_and_verify() {
        let manager = create_test_manager();

        assert!(!manager.is_configured().unwrap());

        manager.setup(valid_test_passphrase()).unwrap();

        assert!(manager.is_configured().unwrap());
        assert!(manager.verify(valid_test_passphrase()).unwrap());
        assert!(!manager.verify(invalid_test_passphrase()).unwrap());
    }

    #[test]
    fn test_password_too_short() {
        let manager = create_test_manager();

        let result = manager.setup(too_short_test_passphrase());
        assert!(matches!(
            result,
            Err(MasterPasswordError::PasswordTooShort { .. })
        ));
    }

    #[test]
    fn test_unlock_and_lock() {
        let manager = create_test_manager();
        manager.setup(valid_test_passphrase()).unwrap();

        // Should be unlocked after setup
        assert!(manager.is_unlocked());

        manager.lock();
        assert!(!manager.is_unlocked());

        manager.unlock(valid_test_passphrase()).unwrap();
        assert!(manager.is_unlocked());
    }

    #[test]
    fn test_change_password() {
        let manager = create_test_manager();
        manager.setup(valid_test_passphrase()).unwrap();

        manager
            .change(valid_test_passphrase(), alternate_test_passphrase())
            .unwrap();

        assert!(!manager.verify(valid_test_passphrase()).unwrap());
        assert!(manager.verify(alternate_test_passphrase()).unwrap());
    }

    #[test]
    fn test_derive_key_requires_unlock() {
        let manager = create_test_manager();
        manager.setup(valid_test_passphrase()).unwrap();
        manager.lock();

        let result = manager.derive_key(KeyPurpose::MasterEncryption);
        assert!(matches!(result, Err(MasterPasswordError::AppLocked)));
    }

    #[test]
    fn test_derive_key_different_purposes() {
        let manager = create_test_manager();
        manager.setup(valid_test_passphrase()).unwrap();

        let key1 = manager.derive_key(KeyPurpose::JwtSecret).unwrap();
        let key2 = manager.derive_key(KeyPurpose::McpCredentials).unwrap();

        // Different purposes should produce different keys
        assert_ne!(key1, key2);
        assert_eq!(key1.len(), DERIVED_KEY_SIZE);
        assert_eq!(key2.len(), DERIVED_KEY_SIZE);
    }

    #[test]
    fn test_key_consistency() {
        let manager = create_test_manager();
        manager.setup(valid_test_passphrase()).unwrap();

        let key1 = manager.derive_key(KeyPurpose::MasterEncryption).unwrap();
        let key2 = manager.derive_key(KeyPurpose::MasterEncryption).unwrap();

        // Same purpose should produce same key
        assert_eq!(key1, key2);
    }

    #[test]
    fn test_already_configured_error() {
        let manager = create_test_manager();
        manager.setup(valid_test_passphrase()).unwrap();

        let result = manager.setup(alternate_test_passphrase());
        assert!(matches!(
            result,
            Err(MasterPasswordError::AlreadyConfigured)
        ));
    }
}
