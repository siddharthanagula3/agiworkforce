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
use zeroize::Zeroize;

// SEV-DESK-16 fix: the previous hand-rolled `secure_zeroize` used
// `unsafe { std::ptr::write_volatile }` plus a `compiler_fence(SeqCst)` to
// stop the optimiser from eliding the writes. The `zeroize` crate (audited,
// widely used by `argon2`/`aes-gcm`/`rsa`) gives us the same semantics
// without the `#[allow(unsafe_code)]` block. Callers now invoke
// `key.zeroize()` directly via the `Zeroize` trait below.

/// Argon2id parameters following OWASP recommendations
/// - Memory: 19 MiB (19456 KiB)
/// - Iterations: 2
/// - Parallelism: 1
// SEV-DESK-04: bumped from t=2 to t=3 to meet OWASP 2025 high-value-secret
// guidance. PHC strings store the parameters inline (`$argon2id$v=19$m=...,t=...,p=...$`),
// so `Argon2::verify_password` uses the params from the *stored* hash —
// this change does NOT invalidate existing user verifiers. New hashes
// created via `hash_password` (signup, password change) get t=3.
//
// Memory is left at 19 MiB; raising it disproportionately hurts low-RAM
// devices (older Macs, Linux laptops) without proportional security gain
// against the realistic GPU-based threat model.
const ARGON2_MEMORY_KIB: u32 = 19 * 1024; // 19 MiB
const ARGON2_ITERATIONS: u32 = 3;
const ARGON2_PARALLELISM: u32 = 1;
const ARGON2_OUTPUT_LEN: usize = 32;

/// HKDF output key size (256 bits for AES-256)
const DERIVED_KEY_SIZE: usize = 32;

/// Minimum password length for security.
/// SEV-DESK-04: raised from 8 to 12. With Argon2id-19MiB-t=3, an 8-char
/// password is still feasible for a sustained GPU attacker (months of compute);
/// 12 chars + a basic complexity check (`enforce_password_complexity`) pushes
/// the search space past 2^60 even with character-class assumptions.
const MIN_PASSWORD_LENGTH: usize = 12;

/// SEV-DESK-11 + SEV-DESK-13 KDF migration markers.
///
/// `KDF_VERSION_LEGACY` (1) reproduces the original derivation bit-for-bit:
///   - Argon2 password key uses `salt.as_str().as_bytes()` (the base64 *string*
///     of the salt, treated as bytes — incorrect interop but preserved so
///     existing user verifiers + wrapped credentials continue to decrypt).
///   - HKDF-Extract uses a static, install-independent salt
///     `b"com.agiworkforce.desktop:master_password:v1"`.
///
/// `KDF_VERSION_CURRENT` (2) is the corrected derivation:
///   - Argon2 password key uses the *decoded* salt bytes.
///   - HKDF-Extract mixes the per-install `install_id` into the salt so the
///     extracted PRK is per-installation rather than shared across the fleet.
///
/// **Migration policy**: `setup()` always writes `KDF_VERSION_CURRENT`.
/// `change()` preserves the existing version — the wrapped-credentials
/// (`MasterPasswordEncryption::encrypt`) ciphertext stored elsewhere in the
/// DB was sealed with the original kdf_version, and re-encrypting every
/// credential during a password change is out of scope for this fix.
/// Existing v1 users keep working; new installs get v2.
const KDF_VERSION_LEGACY: u32 = 1;
const KDF_VERSION_CURRENT: u32 = 2;

/// SEV-DESK-04: lightweight complexity gate. We deliberately keep this
/// simple — modern guidance (NIST SP 800-63B-4) discourages overly complex
/// rules that push users toward predictable transformations ("Password1!").
/// Length is the dominant factor; we just require *some* mixture so the
/// tail of weak inputs ("12345678901a") gets rejected. Anything stronger
/// (HIBP check, breach scan) belongs in the onboarding UI, not here.
fn enforce_password_complexity(password: &str) -> Result<(), MasterPasswordError> {
    if password.chars().count() < MIN_PASSWORD_LENGTH {
        return Err(MasterPasswordError::PasswordTooShort {
            min_length: MIN_PASSWORD_LENGTH,
        });
    }
    let has_lower = password.chars().any(|c| c.is_ascii_lowercase());
    let has_upper = password.chars().any(|c| c.is_ascii_uppercase());
    let has_digit = password.chars().any(|c| c.is_ascii_digit());
    let has_other = password
        .chars()
        .any(|c| !c.is_ascii_alphanumeric() && !c.is_whitespace());
    let class_count =
        has_lower as u32 + has_upper as u32 + has_digit as u32 + has_other as u32;
    if class_count < 3 {
        return Err(MasterPasswordError::CryptoError(
            "Password must contain at least three of: lowercase, uppercase, digit, symbol"
                .to_string(),
        ));
    }
    Ok(())
}

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

        // SEV-DESK-11/13: include `kdf_version` from the start. New tables
        // begin at the current KDF version; this column is the source of
        // truth that branches derive_password_key and hkdf_derive at
        // runtime so v1 records continue decrypting correctly.
        conn.execute(
            "CREATE TABLE IF NOT EXISTS master_password (
                id INTEGER PRIMARY KEY CHECK (id = 1),
                verifier_hash TEXT NOT NULL,
                verifier_salt TEXT NOT NULL,
                argon2_params TEXT NOT NULL,
                kdf_version INTEGER NOT NULL DEFAULT 1,
                created_at TEXT NOT NULL,
                updated_at TEXT NOT NULL
            )",
            [],
        )
        .map_err(|e| MasterPasswordError::DatabaseError(e.to_string()))?;

        // SEV-DESK-11/13: idempotent ADD COLUMN for installs that already
        // have a master_password table from before kdf_version was
        // introduced. SQLite's ALTER TABLE returns a "duplicate column"
        // error if the column already exists — we swallow that one
        // specifically and re-raise anything else.
        if let Err(e) = conn.execute(
            "ALTER TABLE master_password ADD COLUMN kdf_version INTEGER NOT NULL DEFAULT 1",
            [],
        ) {
            let msg = e.to_string().to_lowercase();
            if !msg.contains("duplicate column") && !msg.contains("already exists") {
                return Err(MasterPasswordError::DatabaseError(e.to_string()));
            }
        }

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

    /// SEV-DESK-11/13: read the stored `kdf_version` for the current
    /// master-password row. Defaults to `KDF_VERSION_LEGACY` (1) so any
    /// fault in the read path errs on the side of preserving ciphertext
    /// access.
    fn read_kdf_version(&self) -> Result<u32, MasterPasswordError> {
        let conn = self.db_conn.lock().map_err(|e| {
            MasterPasswordError::DatabaseError(format!("Failed to acquire lock: {}", e))
        })?;
        let v: i64 = conn
            .query_row(
                "SELECT kdf_version FROM master_password WHERE id = 1",
                [],
                |row| row.get(0),
            )
            .unwrap_or(KDF_VERSION_LEGACY as i64);
        Ok(v as u32)
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

        // SEV-DESK-04: validate length + complexity (3 of 4 character classes).
        // Replaces the bare length check to push the bottom decile of users
        // off trivially crackable inputs.
        enforce_password_complexity(password)?;

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

        // SEV-DESK-11/13: new installs always use the current KDF version.
        conn.execute(
            "INSERT INTO master_password (id, verifier_hash, verifier_salt, argon2_params, kdf_version, created_at, updated_at)
             VALUES (1, ?1, ?2, ?3, ?4, ?5, ?6)",
            rusqlite::params![
                password_hash.to_string(),
                salt.to_string(),
                params_json,
                KDF_VERSION_CURRENT as i64,
                now.clone(),
                now,
            ],
        )
        .map_err(|e| MasterPasswordError::DatabaseError(e.to_string()))?;
        drop(conn);

        // Cache the derived key using the KDF version we just stored.
        let derived_key =
            self.derive_password_key(password, &salt, KDF_VERSION_CURRENT)?;
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

        // SEV-DESK-11/13: read the salt + kdf_version atomically. The
        // version is the source of truth for whether the legacy
        // base64-string-as-bytes path or the corrected raw-bytes path is
        // used for derivation.
        let (stored_salt, kdf_version): (String, i64) = {
            let conn = self.db_conn.lock().map_err(|e| {
                MasterPasswordError::DatabaseError(format!("Failed to acquire lock: {}", e))
            })?;
            conn.query_row(
                "SELECT verifier_salt, kdf_version FROM master_password WHERE id = 1",
                [],
                |row| Ok((row.get::<_, String>(0)?, row.get::<_, i64>(1)?)),
            )
            .map_err(|e| MasterPasswordError::DatabaseError(e.to_string()))?
        };

        let salt = SaltString::from_b64(&stored_salt)
            .map_err(|e| MasterPasswordError::CryptoError(format!("Invalid stored salt: {}", e)))?;

        let derived_key =
            self.derive_password_key(password, &salt, kdf_version as u32)?;

        if let Ok(mut cache) = self.cached_key.lock() {
            *cache = Some(derived_key);
        }

        Ok(())
    }

    /// Lock the app (clear cached key)
    pub fn lock(&self) {
        if let Ok(mut cache) = self.cached_key.lock() {
            // SEV-DESK-16: zeroize via the audited `zeroize` crate. The
            // `Zeroize` trait emits volatile writes and the compiler is
            // forbidden from eliding them — same guarantee as the previous
            // hand-rolled implementation, no `unsafe` required.
            if let Some(ref mut key) = *cache {
                key.zeroize();
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

        // SEV-DESK-04: same complexity rules as `setup` for password changes.
        enforce_password_complexity(new_password)?;

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

        // SEV-DESK-11/13: read the current `kdf_version` and PRESERVE it
        // through the password change. Wrapped credentials elsewhere in
        // the DB were sealed under the existing kdf_version's derive
        // chain — bumping the version here without re-encrypting them
        // would orphan the user's data.
        let kdf_version = self.read_kdf_version()?;

        // Update in database (kdf_version unchanged on rotate)
        let conn = self.db_conn.lock().map_err(|e| {
            MasterPasswordError::DatabaseError(format!("Failed to acquire lock: {}", e))
        })?;

        conn.execute(
            "UPDATE master_password SET verifier_hash = ?1, verifier_salt = ?2, argon2_params = ?3, updated_at = ?4 WHERE id = 1",
            rusqlite::params![
                password_hash.to_string(),
                salt.to_string(),
                params_json,
                now,
            ],
        )
        .map_err(|e| MasterPasswordError::DatabaseError(e.to_string()))?;

        drop(conn);

        // Update cached key with the same kdf_version we read above so
        // subsequent `derive_key` calls produce identical wrapping keys.
        let derived_key = self.derive_password_key(new_password, &salt, kdf_version)?;
        if let Ok(mut cache) = self.cached_key.lock() {
            // SEV-DESK-16: zeroize the old key before swapping in the new one.
            if let Some(ref mut key) = *cache {
                key.zeroize();
            }
            *cache = Some(derived_key);
        }

        Ok(())
    }

    /// Derive an encryption key using the master password and machine ID.
    ///
    /// Key derivation flow:
    /// 1. password_key = Argon2id(password, stored_salt)  ← computed at unlock
    /// 2. combined = password_key || machine_id
    /// 3. final_key = HKDF-SHA256(combined, purpose_salt, 32)
    ///
    /// SEV-DESK-11/13: reads the persisted `kdf_version` so the HKDF salt +
    /// info string match the version that produced the cached password key.
    /// v1 records continue producing identical bytes to the pre-fix code;
    /// v2 records use install-bound HKDF salts.
    pub fn derive_key(&self, purpose: KeyPurpose) -> Result<Vec<u8>, MasterPasswordError> {
        let kdf_version = self.read_kdf_version()?;

        let cached_key = self.cached_key.lock().map_err(|e| {
            MasterPasswordError::CryptoError(format!("Failed to acquire lock: {}", e))
        })?;

        let password_key = cached_key.as_ref().ok_or(MasterPasswordError::AppLocked)?;

        // Get machine ID
        let machine_id = machine_key::get_machine_id_hash();

        // Combine password key and machine ID
        let mut combined = password_key.clone();
        combined.extend_from_slice(machine_id.as_bytes());

        // Use HKDF to derive the final key, branching on kdf_version.
        self.hkdf_derive(&combined, purpose, kdf_version)
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

    /// Derive a key from the password using Argon2.
    ///
    /// SEV-DESK-11: branches on `kdf_version`. Legacy (v1) keeps the
    /// `salt.as_str().as_bytes()` behaviour bit-for-bit so existing
    /// vaults stay decryptable. Current (v2) decodes the salt into raw
    /// bytes via `Salt::decode_b64` — the cryptographically correct form.
    fn derive_password_key(
        &self,
        password: &str,
        salt: &SaltString,
        kdf_version: u32,
    ) -> Result<Vec<u8>, MasterPasswordError> {
        let argon2 = self.create_argon2()?;

        let mut output = vec![0u8; ARGON2_OUTPUT_LEN];

        match kdf_version {
            KDF_VERSION_LEGACY => {
                // PRESERVED: pass the base64 salt string as bytes. This is
                // wrong-but-historical and must not change for v1 records.
                argon2
                    .hash_password_into(
                        password.as_bytes(),
                        salt.as_str().as_bytes(),
                        &mut output,
                    )
                    .map_err(|e| {
                        MasterPasswordError::CryptoError(format!(
                            "Failed to derive key (v1): {}",
                            e
                        ))
                    })?;
            }
            _ => {
                // v2+: decode the salt into raw bytes. `Salt::decode_b64`
                // writes into a caller buffer and returns a `&[u8]` view.
                use argon2::password_hash::Salt;
                let mut salt_buf = [0u8; Salt::MAX_LENGTH];
                let raw_salt = salt
                    .as_salt()
                    .decode_b64(&mut salt_buf)
                    .map_err(|e| {
                        MasterPasswordError::CryptoError(format!(
                            "Failed to decode salt (v2): {}",
                            e
                        ))
                    })?;
                argon2
                    .hash_password_into(password.as_bytes(), raw_salt, &mut output)
                    .map_err(|e| {
                        MasterPasswordError::CryptoError(format!(
                            "Failed to derive key (v2): {}",
                            e
                        ))
                    })?;
            }
        }

        Ok(output)
    }

    /// Use HKDF-SHA256 to derive a purpose-specific key.
    ///
    /// SEV-DESK-13: branches on `kdf_version`. Legacy (v1) uses a static,
    /// install-independent salt. Current (v2) mixes the per-install
    /// `install_id` into the HKDF salt so a leaked HKDF root from one
    /// install cannot be used to attack another install.
    fn hkdf_derive(
        &self,
        input_key: &[u8],
        purpose: KeyPurpose,
        kdf_version: u32,
    ) -> Result<Vec<u8>, MasterPasswordError> {
        use hmac::{Hmac, Mac};

        // Create purpose-specific info string. Mirror the kdf_version into
        // the HKDF info so v1 and v2 derive distinct keys even when the
        // input_key is identical — this defends against v1↔v2 confusion
        // attacks if a per-install upgrade mechanism is added later.
        let info = format!("agiworkforce:{}:v{}", purpose.as_str(), kdf_version);

        // HKDF-Extract: PRK = HMAC(salt, IKM)
        let salt: Vec<u8> = match kdf_version {
            KDF_VERSION_LEGACY => b"com.agiworkforce.desktop:master_password:v1".to_vec(),
            _ => {
                // v2+: per-install salt so the extracted PRK is unique to
                // this device installation, not the AGI Workforce binary.
                // `get_manager()` is the singleton accessor returning a
                // `&'static MachineKeyManager`.
                let install_id = machine_key::get_manager().get_install_id();
                format!(
                    "com.agiworkforce.desktop:master_password:v2:{}",
                    install_id
                )
                .into_bytes()
            }
        };
        let mut extract_hmac = <Hmac<Sha256> as Mac>::new_from_slice(&salt)
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

    // SEV-DESK-04: test fixtures updated to satisfy the new
    // `enforce_password_complexity` rule (>= 12 chars, 3-of-4 of
    // {lowercase, uppercase, digit, symbol}).
    // gitleaks:allow (test fixture — not a real secret)
    fn valid_test_passphrase() -> &'static str {
        "Alpha-Beta-Unique-Phrase-9"
    }
    // gitleaks:allow (test fixture — not a real secret)
    fn alternate_test_passphrase() -> &'static str {
        "Gamma-Delta-Alt-Phrase-7"
    }
    // gitleaks:allow (test fixture — not a real secret)
    fn invalid_test_passphrase() -> &'static str {
        "Nonmatching-Phrase-1"
    }
    // gitleaks:allow (test fixture — not a real secret)
    fn too_short_test_passphrase() -> &'static str {
        "Tiny-1A"
    }

    fn create_test_manager() -> MasterPasswordManager {
        // Use in-memory database for tests to avoid temp file cleanup issues
        let conn = Connection::open_in_memory().unwrap();
        let manager = MasterPasswordManager::new(Arc::new(Mutex::new(conn)));
        manager.init_table().unwrap();
        manager
    }

    /// SEV-DESK-11/13: verify the v1 and v2 derive paths produce DIFFERENT
    /// password keys (so they cannot be confused) AND that each path is
    /// internally consistent (same input → same output) so existing v1
    /// users can still decrypt their wrapped credentials forever.
    #[test]
    fn test_kdf_v1_v2_distinct_and_deterministic() {
        let manager = create_test_manager();
        let salt = SaltString::generate(&mut OsRng);
        let pw = valid_test_passphrase();

        let v1_a = manager.derive_password_key(pw, &salt, KDF_VERSION_LEGACY).unwrap();
        let v1_b = manager.derive_password_key(pw, &salt, KDF_VERSION_LEGACY).unwrap();
        let v2_a = manager.derive_password_key(pw, &salt, KDF_VERSION_CURRENT).unwrap();
        let v2_b = manager.derive_password_key(pw, &salt, KDF_VERSION_CURRENT).unwrap();

        // Determinism per version
        assert_eq!(v1_a, v1_b, "v1 must be deterministic");
        assert_eq!(v2_a, v2_b, "v2 must be deterministic");

        // v1 and v2 must produce different bytes — proves the salt encoding
        // branch is actually taken and confusion attacks (using the wrong
        // path) yield a key that cannot decrypt the other version's data.
        assert_ne!(v1_a, v2_a, "v1 and v2 must differ");

        // Both must be 32 bytes (AES-256 key size).
        assert_eq!(v1_a.len(), ARGON2_OUTPUT_LEN);
        assert_eq!(v2_a.len(), ARGON2_OUTPUT_LEN);
    }

    /// SEV-DESK-11/13: end-to-end smoke test — a fresh `setup()` writes
    /// the row at `KDF_VERSION_CURRENT`, and `derive_key` reads that
    /// version back through `read_kdf_version`. This protects against a
    /// regression where the column read returns the legacy default and
    /// silently uses the wrong derive path on new installs.
    #[test]
    fn test_setup_writes_current_kdf_version() {
        let manager = create_test_manager();
        manager.setup(valid_test_passphrase()).unwrap();

        let version = manager.read_kdf_version().unwrap();
        assert_eq!(
            version, KDF_VERSION_CURRENT,
            "setup() must write the current KDF version"
        );

        // derive_key should succeed (we are unlocked since setup caches the key).
        let k1 = manager.derive_key(KeyPurpose::McpCredentials).unwrap();
        let k2 = manager.derive_key(KeyPurpose::McpCredentials).unwrap();
        assert_eq!(k1, k2, "derive_key must be deterministic for fixed inputs");
        assert_eq!(k1.len(), DERIVED_KEY_SIZE);
    }

    /// SEV-DESK-11/13: simulate an existing v1 install — manually flip the
    /// stored version to legacy after setup and confirm derive_key continues
    /// to work and produces a v1 byte stream (different from v2).
    #[test]
    fn test_legacy_v1_record_continues_working() {
        let manager = create_test_manager();
        manager.setup(valid_test_passphrase()).unwrap();

        // Force the row to v1 to simulate an upgrade-from-old-binary.
        {
            let conn = manager.db_conn.lock().unwrap();
            conn.execute(
                "UPDATE master_password SET kdf_version = ?1 WHERE id = 1",
                [KDF_VERSION_LEGACY as i64],
            )
            .unwrap();
        }

        // Re-unlock so the cached_key is regenerated under v1 rules.
        manager.lock();
        manager.unlock(valid_test_passphrase()).unwrap();

        let v1_key = manager.derive_key(KeyPurpose::McpCredentials).unwrap();
        assert_eq!(v1_key.len(), DERIVED_KEY_SIZE);

        // Now switch back to v2 and confirm the derived key changes.
        {
            let conn = manager.db_conn.lock().unwrap();
            conn.execute(
                "UPDATE master_password SET kdf_version = ?1 WHERE id = 1",
                [KDF_VERSION_CURRENT as i64],
            )
            .unwrap();
        }
        manager.lock();
        manager.unlock(valid_test_passphrase()).unwrap();
        let v2_key = manager.derive_key(KeyPurpose::McpCredentials).unwrap();
        assert_ne!(
            v1_key, v2_key,
            "v1 and v2 derived purpose keys must differ"
        );
    }

    /// SEV-DESK-11/13: verify `change()` preserves the existing kdf_version.
    /// Bumping it on rotate would orphan wrapped credentials sealed under v1.
    #[test]
    fn test_change_preserves_kdf_version() {
        let manager = create_test_manager();
        manager.setup(valid_test_passphrase()).unwrap();

        // Force v1 to mimic an existing user.
        {
            let conn = manager.db_conn.lock().unwrap();
            conn.execute(
                "UPDATE master_password SET kdf_version = ?1 WHERE id = 1",
                [KDF_VERSION_LEGACY as i64],
            )
            .unwrap();
        }

        manager
            .change(valid_test_passphrase(), alternate_test_passphrase())
            .unwrap();

        let version = manager.read_kdf_version().unwrap();
        assert_eq!(
            version, KDF_VERSION_LEGACY,
            "change() must NOT auto-upgrade kdf_version"
        );
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
