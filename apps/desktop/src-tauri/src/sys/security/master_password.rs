//! Master password: verification and the vault key.
//!
//! One Argon2id run over the password and a random salt gives a root that is
//! never stored. Two HKDF-SHA256 branches with fixed, distinct labels come out
//! of it: the verifier, which is stored and compared in constant time, and the
//! vault key, which is only ever held in memory while unlocked. Neither branch
//! follows from the other, so the stored row opens nothing.
//!
//! Each purpose key is HKDF-SHA256 over the vault key and the machine ID,
//! salted per install.
//!
//! Rows written before [`KDF_VERSION_CURRENT`] stored an Argon2 PHC string. On
//! a version 2 row its hash field was the vault key itself, because both came
//! from the same Argon2 call. Those rows are read only to replace them at the
//! next unlock, see [`MasterPasswordManager::unlock`].
//!
//! How each build derived the vault key of such a row, from this file's
//! history, all with Argon2id v0x13, 19 MiB, one lane and a 32-byte output:
//!
//! - 2026-01-30 to 2026-05-05 (no version column, read as version 1): two
//!   iterations, the base64 text of the salt as the salt.
//! - 2026-05-05 to 2026-10-11, version 1 rows: the same, but with three
//!   iterations whatever the row's PHC string recorded, so a row from the
//!   first period may have data under both the two- and the three-iteration
//!   key.
//! - 2026-05-05 to 2026-10-11, version 2 rows: three iterations, the decoded
//!   salt.
//!
//! [`MasterPasswordManager::authenticate`] derives every key a row could have
//! sealed data under, and the row is replaced only when each saved key opens
//! under one of them.

use super::machine_key::{self, KeyPurpose};
use argon2::{
    password_hash::{rand_core::OsRng, PasswordHash, PasswordVerifier, Salt, SaltString},
    Argon2, Params, Version,
};
use base64::{engine::general_purpose, Engine as _};
use chrono::Utc;
use rusqlite::Connection;
use serde::{Deserialize, Serialize};
use sha2::Sha256;
use std::sync::{Arc, Mutex, MutexGuard};
use subtle::ConstantTimeEq;
use zeroize::Zeroize;

const ARGON2_MEMORY_KIB: u32 = 19 * 1024;
const ARGON2_ITERATIONS: u32 = 3;
const ARGON2_PARALLELISM: u32 = 1;
const ARGON2_OUTPUT_LEN: usize = 32;

/// The Argon2 cost every build from 2026-05-05 ran for the vault key of a
/// version 1 or 2 row, whatever the row's own PHC string recorded. Frozen: it
/// records what those builds did and must not follow the defaults above.
const LEGACY_FIXED_COST: Argon2Params = Argon2Params {
    memory_kib: 19 * 1024,
    iterations: 3,
    parallelism: 1,
    output_len: 32,
};

/// The range a stored row's Argon2 parameters must fall in before they are
/// run. The floor is the weakest setting any version 3 row was written with,
/// so it must not rise when the defaults above do. The ceiling keeps a
/// tampered row from making an unlock take minutes or exhaust memory.
const ARGON2_MIN_MEMORY_KIB: u32 = 19 * 1024;
const ARGON2_MAX_MEMORY_KIB: u32 = 256 * 1024;
const ARGON2_MIN_ITERATIONS: u32 = 3;
/// Version 1 and 2 rows were written with two iterations before the default
/// became three, and are verified with what their PHC string records.
const ARGON2_MIN_LEGACY_ITERATIONS: u32 = 2;
const ARGON2_MAX_ITERATIONS: u32 = 10;
const ARGON2_MIN_PARALLELISM: u32 = 1;
const ARGON2_MAX_PARALLELISM: u32 = 4;

const DERIVED_KEY_SIZE: usize = 32;

const MIN_PASSWORD_LENGTH: usize = 12;
const MIN_PASSWORD_CHARACTER_CLASSES: u32 = 3;

/// Version 1 passed the base64 text of the salt to Argon2 as if it were the
/// salt, and extracted with a salt shared by every install.
const KDF_VERSION_LEGACY: u32 = 1;
/// Version 2 corrected both, and stored a verifier equal to the vault key.
const KDF_VERSION_SHARED_VERIFIER: u32 = 2;
/// Version 3 stores a verifier that is a separate branch from the vault key.
/// It is the only version written.
const KDF_VERSION_CURRENT: u32 = 3;

const ROOT_BRANCH_SALT: &[u8] = b"com.agiworkforce.desktop:master_password:root:v3";
const VERIFIER_BRANCH_INFO: &[u8] = b"agiworkforce:master_password:verifier:v3";
const VAULT_KEY_BRANCH_INFO: &[u8] = b"agiworkforce:master_password:vault-key:v3";

/// What a master password must satisfy. The interface reads it from
/// [`MasterPasswordStatus`], so the numbers have this one home.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
pub struct PasswordPolicy {
    pub min_length: usize,
    /// How many of lowercase, uppercase, digit and symbol must appear.
    pub min_character_classes: u32,
}

impl PasswordPolicy {
    pub const CURRENT: PasswordPolicy = PasswordPolicy {
        min_length: MIN_PASSWORD_LENGTH,
        min_character_classes: MIN_PASSWORD_CHARACTER_CLASSES,
    };
}

/// The rule a refused password broke.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(tag = "rule", rename_all = "snake_case")]
pub enum PasswordRuleViolation {
    TooShort { min_length: usize },
    TooFewCharacterClasses { min_character_classes: u32 },
}

impl std::fmt::Display for PasswordRuleViolation {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        match self {
            PasswordRuleViolation::TooShort { min_length } => {
                write!(f, "Use at least {} characters.", min_length)
            }
            PasswordRuleViolation::TooFewCharacterClasses {
                min_character_classes,
            } => write!(
                f,
                "Use at least {} of these: a lowercase letter, an uppercase letter, a number, a symbol.",
                min_character_classes
            ),
        }
    }
}

/// The first rule of [`PasswordPolicy::CURRENT`] the password breaks.
pub fn password_rule_violation(password: &str) -> Option<PasswordRuleViolation> {
    let policy = PasswordPolicy::CURRENT;
    if password.chars().count() < policy.min_length {
        return Some(PasswordRuleViolation::TooShort {
            min_length: policy.min_length,
        });
    }
    let has_lower = password.chars().any(|c| c.is_ascii_lowercase());
    let has_upper = password.chars().any(|c| c.is_ascii_uppercase());
    let has_digit = password.chars().any(|c| c.is_ascii_digit());
    let has_other = password
        .chars()
        .any(|c| !c.is_ascii_alphanumeric() && !c.is_whitespace());
    let class_count = has_lower as u32 + has_upper as u32 + has_digit as u32 + has_other as u32;
    if class_count < policy.min_character_classes {
        return Some(PasswordRuleViolation::TooFewCharacterClasses {
            min_character_classes: policy.min_character_classes,
        });
    }
    None
}

fn enforce_password_policy(password: &str) -> Result<(), MasterPasswordError> {
    match password_rule_violation(password) {
        Some(violation) => Err(MasterPasswordError::PasswordRejected(violation)),
        None => Ok(()),
    }
}

/// Error types for master password operations
#[derive(Debug, Clone, Serialize, Deserialize)]
pub enum MasterPasswordError {
    /// The new password breaks the password policy
    PasswordRejected(PasswordRuleViolation),
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
    /// Saved provider keys that no available key opens. Replacing the stored
    /// password row would end any chance of reading them, so nothing was
    /// changed.
    UnreadableSavedKeys { providers: Vec<String> },
}

impl std::fmt::Display for MasterPasswordError {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        match self {
            MasterPasswordError::PasswordRejected(violation) => write!(f, "{}", violation),
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
            MasterPasswordError::UnreadableSavedKeys { providers } => write!(
                f,
                "These saved keys could not be opened with your master password or this device's key, so nothing was changed: {}. Save each one again or remove it, then try again.",
                providers.join(", ")
            ),
        }
    }
}

impl std::error::Error for MasterPasswordError {}

fn database_error(error: rusqlite::Error) -> MasterPasswordError {
    MasterPasswordError::DatabaseError(error.to_string())
}

/// Argon2 parameters stored beside the verifier. A version 3 row is verified
/// with the parameters it was written with, so raising the defaults does not
/// lock anyone out.
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

impl Argon2Params {
    fn same_cost(&self, other: &Argon2Params) -> bool {
        self.memory_kib == other.memory_kib
            && self.iterations == other.iterations
            && self.parallelism == other.parallelism
    }

    /// Parse the parameters stored beside a verifier, refusing any outside
    /// the supported range before a single Argon2 block is allocated.
    fn from_stored(stored: &str) -> Result<Self, MasterPasswordError> {
        let params: Self = serde_json::from_str(stored).map_err(|e| {
            MasterPasswordError::CryptoError(format!("Invalid stored Argon2 params: {}", e))
        })?;

        check_argon2_cost(
            params.memory_kib,
            params.iterations,
            params.parallelism,
            ARGON2_MIN_ITERATIONS,
        )?;

        Ok(params)
    }
}

/// Refuse stored Argon2 costs outside the supported range. Runs before the
/// hash does, so no memory is allocated for a row that fails it.
fn check_argon2_cost(
    memory_kib: u32,
    iterations: u32,
    parallelism: u32,
    min_iterations: u32,
) -> Result<(), MasterPasswordError> {
    let in_range = (ARGON2_MIN_MEMORY_KIB..=ARGON2_MAX_MEMORY_KIB).contains(&memory_kib)
        && (min_iterations..=ARGON2_MAX_ITERATIONS).contains(&iterations)
        && (ARGON2_MIN_PARALLELISM..=ARGON2_MAX_PARALLELISM).contains(&parallelism);
    if in_range {
        return Ok(());
    }

    Err(MasterPasswordError::CryptoError(format!(
        "The stored master password settings are outside the supported range (memory {} KiB, iterations {}, parallelism {}), so the password was not checked. Supported: memory {} to {} KiB, iterations {} to {}, parallelism {} to {}.",
        memory_kib,
        iterations,
        parallelism,
        ARGON2_MIN_MEMORY_KIB,
        ARGON2_MAX_MEMORY_KIB,
        min_iterations,
        ARGON2_MAX_ITERATIONS,
        ARGON2_MIN_PARALLELISM,
        ARGON2_MAX_PARALLELISM,
    )))
}

fn argon2_with(params: &Argon2Params) -> Result<Argon2<'static>, MasterPasswordError> {
    let params = Params::new(
        params.memory_kib,
        params.iterations,
        params.parallelism,
        Some(ARGON2_OUTPUT_LEN),
    )
    .map_err(|e| MasterPasswordError::CryptoError(format!("Invalid Argon2 params: {}", e)))?;

    Ok(Argon2::new(
        argon2::Algorithm::Argon2id,
        Version::V0x13,
        params,
    ))
}

/// HKDF-SHA256 (RFC 5869) for one output block.
fn hkdf_sha256(salt: &[u8], input_key: &[u8], info: &[u8]) -> Result<Vec<u8>, MasterPasswordError> {
    use hmac::{Hmac, Mac};

    let mut extract_hmac = <Hmac<Sha256> as Mac>::new_from_slice(salt)
        .map_err(|e| MasterPasswordError::CryptoError(format!("HMAC init failed: {}", e)))?;
    extract_hmac.update(input_key);
    let prk = extract_hmac.finalize().into_bytes();

    let mut expand_hmac = <Hmac<Sha256> as Mac>::new_from_slice(&prk)
        .map_err(|e| MasterPasswordError::CryptoError(format!("HMAC init failed: {}", e)))?;
    expand_hmac.update(info);
    expand_hmac.update(&[0x01]);
    let okm = expand_hmac.finalize().into_bytes();

    Ok(okm[..DERIVED_KEY_SIZE].to_vec())
}

/// The verifier and the vault key a password gives under version 3, in that
/// order. The root they branch from is wiped before returning.
fn derive_verifier_and_vault_key(
    password: &str,
    salt: &SaltString,
    params: &Argon2Params,
) -> Result<(Vec<u8>, Vec<u8>), MasterPasswordError> {
    let argon2 = argon2_with(params)?;
    let mut salt_buf = [0u8; Salt::MAX_LENGTH];
    let raw_salt = salt
        .as_salt()
        .decode_b64(&mut salt_buf)
        .map_err(|e| MasterPasswordError::CryptoError(format!("Failed to decode salt: {}", e)))?;

    let mut root = vec![0u8; ARGON2_OUTPUT_LEN];
    argon2
        .hash_password_into(password.as_bytes(), raw_salt, &mut root)
        .map_err(|e| MasterPasswordError::CryptoError(format!("Failed to derive key: {}", e)))?;

    let verifier = hkdf_sha256(ROOT_BRANCH_SALT, &root, VERIFIER_BRANCH_INFO);
    let vault_key = hkdf_sha256(ROOT_BRANCH_SALT, &root, VAULT_KEY_BRANCH_INFO);
    root.zeroize();

    Ok((verifier?, vault_key?))
}

/// The `master_password` columns a new password is stored as.
struct FreshVerifier {
    verifier: String,
    salt: String,
    argon2_params: String,
}

impl FreshVerifier {
    /// A new salt, the verifier to store and the vault key to hold in memory.
    ///
    /// The salt is always new. Reusing the salt of a version 2 row would make
    /// the new root equal to the verifier that row had on disk.
    fn for_password(password: &str) -> Result<(Self, Vec<u8>), MasterPasswordError> {
        let salt = SaltString::generate(&mut OsRng);
        let params = Argon2Params::default();
        let (mut verifier, vault_key) = derive_verifier_and_vault_key(password, &salt, &params)?;
        let argon2_params = serde_json::to_string(&params).map_err(|e| {
            MasterPasswordError::CryptoError(format!("Failed to serialize params: {}", e))
        })?;
        let fresh = Self {
            verifier: general_purpose::STANDARD.encode(&verifier),
            salt: salt.to_string(),
            argon2_params,
        };
        verifier.zeroize();
        Ok((fresh, vault_key))
    }
}

struct StoredVerifier {
    verifier: String,
    salt: String,
    argon2_params: String,
    kdf_version: u32,
}

/// Zero the pages a replaced row and its old ciphertexts leave behind. A
/// version 2 verifier is key material, so it should not outlive its row.
fn scrub_replaced_rows(conn: &Connection) {
    if let Err(error) = conn.pragma_update(None, "secure_delete", true) {
        tracing::warn!("Replaced master password rows were not zeroed on disk: {error}");
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
    /// Whether saved keys the vault owns are still outside it
    pub needs_migration: bool,
    /// What a new password must satisfy
    pub password_policy: PasswordPolicy,
}

/// A vault key held outside the unlock cache while the password is being set,
/// upgraded, changed or removed. It derives the same purpose keys an unlocked
/// vault would, and is wiped when dropped.
pub struct PasswordKey<'a> {
    manager: &'a MasterPasswordManager,
    key: Vec<u8>,
    kdf_version: u32,
    /// Other vault keys an earlier build may have derived for the same stored
    /// row. Only version 1 and 2 rows have any.
    alternates: Vec<Vec<u8>>,
}

impl PasswordKey<'_> {
    /// The purpose key the vault uses while unlocked under this key.
    pub fn purpose_key(&self, purpose: KeyPurpose) -> Result<Vec<u8>, MasterPasswordError> {
        self.manager
            .purpose_key(&self.key, purpose, self.kdf_version)
    }

    /// Every purpose key data may have been sealed under for this stored row,
    /// the one the vault uses first.
    pub fn purpose_keys(&self, purpose: KeyPurpose) -> Result<Vec<Vec<u8>>, MasterPasswordError> {
        std::iter::once(&self.key)
            .chain(self.alternates.iter())
            .map(|key| self.manager.purpose_key(key, purpose, self.kdf_version))
            .collect()
    }
}

impl Drop for PasswordKey<'_> {
    fn drop(&mut self) {
        self.key.zeroize();
        for alternate in &mut self.alternates {
            alternate.zeroize();
        }
    }
}

/// What an unlock did beyond opening the vault.
#[derive(Debug, Default, Clone, PartialEq, Eq)]
pub struct UnlockOutcome {
    /// Providers whose saved key no key opens. While there are any, an older
    /// stored row is kept as it is instead of being replaced.
    pub keys_not_upgraded: Vec<String>,
}

struct CachedKey {
    key: Vec<u8>,
    kdf_version: u32,
}

/// Manager for master password operations
pub struct MasterPasswordManager {
    db_conn: Arc<Mutex<Connection>>,
    /// The vault key and the version it derives purpose keys under, held
    /// from unlock to lock.
    cached_key: Arc<Mutex<Option<CachedKey>>>,
}

impl MasterPasswordManager {
    /// Create a new master password manager
    pub fn new(db_conn: Arc<Mutex<Connection>>) -> Self {
        Self {
            db_conn,
            cached_key: Arc::new(Mutex::new(None)),
        }
    }

    fn db(&self) -> Result<MutexGuard<'_, Connection>, MasterPasswordError> {
        self.db_conn.lock().map_err(|e| {
            MasterPasswordError::DatabaseError(format!("Failed to acquire lock: {}", e))
        })
    }

    fn password_key(&self, key: Vec<u8>, kdf_version: u32) -> PasswordKey<'_> {
        PasswordKey {
            manager: self,
            key,
            kdf_version,
            alternates: Vec::new(),
        }
    }

    /// Initialize the database table for master password storage
    pub fn init_table(&self) -> Result<(), MasterPasswordError> {
        let conn = self.db()?;

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
        .map_err(database_error)?;

        // Tables created before `kdf_version` existed gain the column here.
        // SQLite reports a duplicate column when it is already present.
        if let Err(e) = conn.execute(
            "ALTER TABLE master_password ADD COLUMN kdf_version INTEGER NOT NULL DEFAULT 1",
            [],
        ) {
            let msg = e.to_string().to_lowercase();
            if !msg.contains("duplicate column") && !msg.contains("already exists") {
                return Err(MasterPasswordError::DatabaseError(e.to_string()));
            }
        }

        Ok(())
    }

    /// Check if a master password has been configured
    pub fn is_configured(&self) -> Result<bool, MasterPasswordError> {
        let conn = self.db()?;

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
            let conn = self.db()?;

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
            password_policy: PasswordPolicy::CURRENT,
        })
    }

    /// Set the master password for the first time.
    ///
    /// `seal_existing` moves whatever the vault owns, and is still under a key
    /// that needs no password, to the new vault key. It runs inside the
    /// transaction that stores the salt and verifier, so a master password
    /// never exists beside a vault-owned secret it does not protect, and an
    /// error from it leaves no master password set.
    pub fn setup_with<F>(&self, password: &str, seal_existing: F) -> Result<(), MasterPasswordError>
    where
        F: FnOnce(&Connection, &PasswordKey<'_>) -> Result<(), MasterPasswordError>,
    {
        if self.is_configured()? {
            return Err(MasterPasswordError::AlreadyConfigured);
        }

        enforce_password_policy(password)?;

        let (fresh, vault_key) = FreshVerifier::for_password(password)?;
        let key = self.password_key(vault_key, KDF_VERSION_CURRENT);
        let now = Utc::now().to_rfc3339();

        {
            let mut conn = self.db()?;
            let tx = conn.transaction().map_err(database_error)?;

            seal_existing(&tx, &key)?;

            tx.execute(
                "INSERT INTO master_password (id, verifier_hash, verifier_salt, argon2_params, kdf_version, created_at, updated_at)
                 VALUES (1, ?1, ?2, ?3, ?4, ?5, ?6)",
                rusqlite::params![
                    fresh.verifier,
                    fresh.salt,
                    fresh.argon2_params,
                    KDF_VERSION_CURRENT as i64,
                    now.clone(),
                    now,
                ],
            )
            .map_err(database_error)?;

            tx.commit().map_err(database_error)?;
        }

        self.cache(&key);
        Ok(())
    }

    /// `setup_with` for fixtures that have nothing to seal.
    #[cfg(test)]
    pub fn setup(&self, password: &str) -> Result<(), MasterPasswordError> {
        self.setup_with(password, |_, _| Ok(()))
    }

    /// Verify the master password
    pub fn verify(&self, password: &str) -> Result<bool, MasterPasswordError> {
        match self.authenticate(password) {
            Ok(_) => Ok(true),
            Err(MasterPasswordError::InvalidPassword) => Ok(false),
            Err(error) => Err(error),
        }
    }

    /// Unlock the app with the master password.
    ///
    /// `settle` runs in one transaction with the vault key in hand. On a row
    /// older than [`KDF_VERSION_CURRENT`] it is also given the key the row is
    /// about to be replaced with, and must move everything the old key seals
    /// to it; the new salt and verifier are stored in the same transaction,
    /// so an interruption leaves the old row and everything it opens intact.
    ///
    /// An error from `settle` is logged and the vault still opens under the
    /// key the stored row gives, so a failed upgrade is retried at the next
    /// unlock instead of keeping the user out of their keys. When the error is
    /// [`MasterPasswordError::UnreadableSavedKeys`], the outcome names those
    /// keys so the caller can tell the user why the row was kept.
    pub fn unlock<F>(&self, password: &str, settle: F) -> Result<UnlockOutcome, MasterPasswordError>
    where
        F: FnOnce(
            &Connection,
            &PasswordKey<'_>,
            Option<&PasswordKey<'_>>,
        ) -> Result<(), MasterPasswordError>,
    {
        let key = self.authenticate(password)?;
        let mut outcome = UnlockOutcome::default();

        let key = match self.settle_unlock(password, &key, settle) {
            Ok(Some(upgraded)) => upgraded,
            Ok(None) => key,
            Err(MasterPasswordError::UnreadableSavedKeys { providers }) => {
                tracing::warn!(
                    "The stored master password row was kept as it is, because no key opens the saved keys for: {}",
                    providers.join(", ")
                );
                outcome.keys_not_upgraded = providers;
                key
            }
            Err(error) => {
                tracing::warn!(
                    "The vault opened, but its stored credentials were not brought up to date: {error}"
                );
                key
            }
        };

        self.cache(&key);
        Ok(outcome)
    }

    fn settle_unlock<F>(
        &self,
        password: &str,
        current: &PasswordKey<'_>,
        settle: F,
    ) -> Result<Option<PasswordKey<'_>>, MasterPasswordError>
    where
        F: FnOnce(
            &Connection,
            &PasswordKey<'_>,
            Option<&PasswordKey<'_>>,
        ) -> Result<(), MasterPasswordError>,
    {
        if current.kdf_version == KDF_VERSION_CURRENT {
            let mut conn = self.db()?;
            let tx = conn.transaction().map_err(database_error)?;
            settle(&tx, current, None)?;
            tx.commit().map_err(database_error)?;
            return Ok(None);
        }

        let (fresh, vault_key) = FreshVerifier::for_password(password)?;
        let upgraded = self.password_key(vault_key, KDF_VERSION_CURRENT);

        let mut conn = self.db()?;
        scrub_replaced_rows(&conn);
        let tx = conn.transaction().map_err(database_error)?;

        settle(&tx, current, Some(&upgraded))?;

        tx.execute(
            "UPDATE master_password SET verifier_hash = ?1, verifier_salt = ?2, argon2_params = ?3, kdf_version = ?4 WHERE id = 1",
            rusqlite::params![
                fresh.verifier,
                fresh.salt,
                fresh.argon2_params,
                KDF_VERSION_CURRENT as i64,
            ],
        )
        .map_err(database_error)?;

        tx.commit().map_err(database_error)?;
        Ok(Some(upgraded))
    }

    fn cache(&self, key: &PasswordKey<'_>) {
        if let Ok(mut cache) = self.cached_key.lock() {
            if let Some(previous) = cache.as_mut() {
                previous.key.zeroize();
            }
            *cache = Some(CachedKey {
                key: key.key.clone(),
                kdf_version: key.kdf_version,
            });
        }
    }

    /// Lock the app (clear cached key)
    pub fn lock(&self) {
        if let Ok(mut cache) = self.cached_key.lock() {
            if let Some(cached) = cache.as_mut() {
                cached.key.zeroize();
            }
            *cache = None;
        }
    }

    fn stored_verifier(&self) -> Result<StoredVerifier, MasterPasswordError> {
        let conn = self.db()?;
        conn.query_row(
            "SELECT verifier_hash, verifier_salt, argon2_params, kdf_version FROM master_password WHERE id = 1",
            [],
            |row| {
                Ok(StoredVerifier {
                    verifier: row.get(0)?,
                    salt: row.get(1)?,
                    argon2_params: row.get(2)?,
                    kdf_version: row.get::<_, i64>(3)? as u32,
                })
            },
        )
        .map_err(database_error)
    }

    /// Check the password against the stored row and return the vault key it
    /// gives. Works whether or not the vault is unlocked.
    ///
    /// For a version 1 or 2 row the key is the one builds since 2026-05-05
    /// derived, at [`LEGACY_FIXED_COST`], and the key at the cost the row's
    /// PHC string records is carried as an alternate when the two differ.
    fn authenticate(&self, password: &str) -> Result<PasswordKey<'_>, MasterPasswordError> {
        if !self.is_configured()? {
            return Err(MasterPasswordError::NotConfigured);
        }

        let stored = self.stored_verifier()?;
        let salt = SaltString::from_b64(&stored.salt)
            .map_err(|e| MasterPasswordError::CryptoError(format!("Invalid stored salt: {}", e)))?;

        match stored.kdf_version {
            KDF_VERSION_CURRENT => {
                let params = Argon2Params::from_stored(&stored.argon2_params)?;
                let expected = general_purpose::STANDARD
                    .decode(&stored.verifier)
                    .map_err(|e| {
                        MasterPasswordError::CryptoError(format!("Invalid stored verifier: {}", e))
                    })?;

                let (mut verifier, vault_key) =
                    derive_verifier_and_vault_key(password, &salt, &params)?;
                let key = self.password_key(vault_key, KDF_VERSION_CURRENT);
                let matches = bool::from(verifier.as_slice().ct_eq(expected.as_slice()));
                verifier.zeroize();

                if matches {
                    Ok(key)
                } else {
                    Err(MasterPasswordError::InvalidPassword)
                }
            }
            KDF_VERSION_LEGACY | KDF_VERSION_SHARED_VERIFIER => {
                let parsed_hash = PasswordHash::new(&stored.verifier).map_err(|e| {
                    MasterPasswordError::CryptoError(format!("Invalid stored hash: {}", e))
                })?;
                let hash_params = Params::try_from(&parsed_hash).map_err(|e| {
                    MasterPasswordError::CryptoError(format!("Invalid stored hash: {}", e))
                })?;
                check_argon2_cost(
                    hash_params.m_cost(),
                    hash_params.t_cost(),
                    hash_params.p_cost(),
                    ARGON2_MIN_LEGACY_ITERATIONS,
                )?;
                if self
                    .create_argon2()?
                    .verify_password(password.as_bytes(), &parsed_hash)
                    .is_err()
                {
                    return Err(MasterPasswordError::InvalidPassword);
                }

                let recorded = Argon2Params {
                    memory_kib: hash_params.m_cost(),
                    iterations: hash_params.t_cost(),
                    parallelism: hash_params.p_cost(),
                    output_len: ARGON2_OUTPUT_LEN,
                };
                let fixed = self.derive_password_key(
                    password,
                    &salt,
                    stored.kdf_version,
                    &LEGACY_FIXED_COST,
                )?;
                let mut key = self.password_key(fixed, stored.kdf_version);
                if !recorded.same_cost(&LEGACY_FIXED_COST) {
                    key.alternates.push(self.derive_password_key(
                        password,
                        &salt,
                        stored.kdf_version,
                        &recorded,
                    )?);
                }
                Ok(key)
            }
            other => Err(MasterPasswordError::CryptoError(format!(
                "Unsupported master password key version {}",
                other
            ))),
        }
    }

    /// Change the master password.
    ///
    /// Every key the vault hands out derives from the password and its salt,
    /// and a change replaces both, so whatever was sealed under the old key
    /// has to move to the new one. `reseal` does that, and it runs inside the
    /// transaction that stores the new salt and verifier: it is given the
    /// connection, the old key and the new key, and an error from it, or from
    /// the write that follows, rolls everything back and leaves the old
    /// password working. The salt and verifier live only in this database.
    pub fn change<F>(
        &self,
        current_password: &str,
        new_password: &str,
        reseal: F,
    ) -> Result<(), MasterPasswordError>
    where
        F: FnOnce(
            &Connection,
            &PasswordKey<'_>,
            &PasswordKey<'_>,
        ) -> Result<(), MasterPasswordError>,
    {
        let old_key = self.authenticate(current_password)?;

        enforce_password_policy(new_password)?;

        let (fresh, vault_key) = FreshVerifier::for_password(new_password)?;
        let new_key = self.password_key(vault_key, KDF_VERSION_CURRENT);
        let now = Utc::now().to_rfc3339();

        {
            let mut conn = self.db()?;
            if old_key.kdf_version != KDF_VERSION_CURRENT {
                scrub_replaced_rows(&conn);
            }
            let tx = conn.transaction().map_err(database_error)?;

            reseal(&tx, &old_key, &new_key)?;

            tx.execute(
                "UPDATE master_password SET verifier_hash = ?1, verifier_salt = ?2, argon2_params = ?3, kdf_version = ?4, updated_at = ?5 WHERE id = 1",
                rusqlite::params![
                    fresh.verifier,
                    fresh.salt,
                    fresh.argon2_params,
                    KDF_VERSION_CURRENT as i64,
                    now,
                ],
            )
            .map_err(database_error)?;

            tx.commit().map_err(database_error)?;
        }

        self.cache(&new_key);
        Ok(())
    }

    /// Remove the master password.
    ///
    /// `reseal` moves whatever is sealed under the vault key back to a key
    /// that needs no password, inside the transaction that deletes the salt
    /// and verifier. An error from it rolls everything back and leaves the
    /// password in place.
    pub fn remove<F>(&self, password: &str, reseal: F) -> Result<(), MasterPasswordError>
    where
        F: FnOnce(&Connection, &PasswordKey<'_>) -> Result<(), MasterPasswordError>,
    {
        let key = self.authenticate(password)?;

        {
            let mut conn = self.db()?;
            if key.kdf_version != KDF_VERSION_CURRENT {
                scrub_replaced_rows(&conn);
            }
            let tx = conn.transaction().map_err(database_error)?;

            reseal(&tx, &key)?;

            tx.execute("DELETE FROM master_password WHERE id = 1", [])
                .map_err(database_error)?;

            tx.commit().map_err(database_error)?;
        }

        self.lock();
        Ok(())
    }

    /// A row as builds from 2026-05-05 wrote it: an Argon2 PHC string as the
    /// verifier, at three iterations.
    #[cfg(test)]
    pub(crate) fn store_legacy_row(&self, password: &str, kdf_version: u32) {
        self.store_legacy_row_at(password, kdf_version, LEGACY_FIXED_COST.iterations);
    }

    /// A row as a build of the given era wrote it. Builds before 2026-05-05
    /// ran two iterations.
    #[cfg(test)]
    pub(crate) fn store_legacy_row_at(&self, password: &str, kdf_version: u32, iterations: u32) {
        use argon2::password_hash::PasswordHasher;

        let salt = SaltString::generate(&mut OsRng);
        let phc = argon2_with(&Argon2Params {
            iterations,
            ..LEGACY_FIXED_COST
        })
        .unwrap()
        .hash_password(password.as_bytes(), &salt)
        .unwrap()
        .to_string();
        let params = serde_json::to_string(&Argon2Params::default()).unwrap();
        self.db()
            .unwrap()
            .execute(
                "INSERT INTO master_password (id, verifier_hash, verifier_salt, argon2_params, kdf_version, created_at, updated_at)
                 VALUES (1, ?1, ?2, ?3, ?4, 'then', 'then')",
                rusqlite::params![phc, salt.to_string(), params, kdf_version as i64],
            )
            .unwrap();
    }

    /// Every purpose key the stored row could have sealed data under.
    #[cfg(test)]
    pub(crate) fn candidate_purpose_keys(
        &self,
        password: &str,
        purpose: KeyPurpose,
    ) -> Vec<Vec<u8>> {
        self.authenticate(password)
            .unwrap()
            .purpose_keys(purpose)
            .unwrap()
    }

    /// The purpose key a vault key derives: the vault key and the machine ID
    /// through HKDF. Takes the `kdf_version` instead of reading it, so it can
    /// run while a transaction holds the database.
    fn purpose_key(
        &self,
        password_key: &[u8],
        purpose: KeyPurpose,
        kdf_version: u32,
    ) -> Result<Vec<u8>, MasterPasswordError> {
        let machine_id = machine_key::get_machine_id_hash();

        let mut combined = password_key.to_vec();
        combined.extend_from_slice(machine_id.as_bytes());

        let derived = self.hkdf_derive(&combined, purpose, kdf_version);
        combined.zeroize();
        derived
    }

    /// Derive an encryption key from the unlocked vault key and the machine
    /// ID. The version is the one the cached key was unlocked under, so the
    /// two cannot disagree.
    pub fn derive_key(&self, purpose: KeyPurpose) -> Result<Vec<u8>, MasterPasswordError> {
        let cached_key = self.cached_key.lock().map_err(|e| {
            MasterPasswordError::CryptoError(format!("Failed to acquire lock: {}", e))
        })?;

        let cached = cached_key.as_ref().ok_or(MasterPasswordError::AppLocked)?;

        self.purpose_key(&cached.key, purpose, cached.kdf_version)
    }

    /// Whether a saved key the vault owns is still under a key that needs no
    /// password. `setup_with` leaves none, so this is true only for a store
    /// whose master password was set before that, until it is migrated.
    pub fn needs_migration(&self) -> Result<bool, MasterPasswordError> {
        if !self.is_configured()? {
            return Ok(false);
        }

        let conn = self.db()?;
        super::vault_credentials::owned_settings_outside_the_vault(&conn)
            .map(|outside| outside > 0)
            .map_err(MasterPasswordError::DatabaseError)
    }

    /// The Argon2 instance a version 1 or 2 verifier is checked with. The
    /// cost comes from the PHC string, not from this instance.
    fn create_argon2(&self) -> Result<Argon2<'static>, MasterPasswordError> {
        argon2_with(&Argon2Params::default())
    }

    /// The vault key of a version 1 or 2 row at the given Argon2 cost, kept
    /// bit for bit so those rows can be opened once and replaced.
    fn derive_password_key(
        &self,
        password: &str,
        salt: &SaltString,
        kdf_version: u32,
        cost: &Argon2Params,
    ) -> Result<Vec<u8>, MasterPasswordError> {
        let argon2 = argon2_with(cost)?;

        let mut output = vec![0u8; ARGON2_OUTPUT_LEN];

        match kdf_version {
            KDF_VERSION_LEGACY => {
                argon2
                    .hash_password_into(password.as_bytes(), salt.as_str().as_bytes(), &mut output)
                    .map_err(|e| {
                        MasterPasswordError::CryptoError(format!(
                            "Failed to derive key (v1): {}",
                            e
                        ))
                    })?;
            }
            KDF_VERSION_SHARED_VERIFIER => {
                let mut salt_buf = [0u8; Salt::MAX_LENGTH];
                let raw_salt = salt.as_salt().decode_b64(&mut salt_buf).map_err(|e| {
                    MasterPasswordError::CryptoError(format!("Failed to decode salt (v2): {}", e))
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
            other => {
                return Err(MasterPasswordError::CryptoError(format!(
                    "Version {} has no legacy key derivation",
                    other
                )));
            }
        }

        Ok(output)
    }

    /// HKDF-SHA256 from the vault key and machine ID to one purpose key.
    ///
    /// Version 1 extracts with a salt shared by every install; later versions
    /// mix in the install ID. The version is part of both the salt and the
    /// info, so no two versions derive the same key from the same input.
    fn hkdf_derive(
        &self,
        input_key: &[u8],
        purpose: KeyPurpose,
        kdf_version: u32,
    ) -> Result<Vec<u8>, MasterPasswordError> {
        let info = format!("agiworkforce:{}:v{}", purpose.as_str(), kdf_version);

        let salt: Vec<u8> = match kdf_version {
            KDF_VERSION_LEGACY => b"com.agiworkforce.desktop:master_password:v1".to_vec(),
            _ => {
                let install_id = machine_key::get_manager().get_install_id();
                format!(
                    "com.agiworkforce.desktop:master_password:v{}:{}",
                    kdf_version, install_id
                )
                .into_bytes()
            }
        };

        hkdf_sha256(&salt, input_key, info.as_bytes())
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

    // gitleaks:allow (test fixture, not a real secret)
    fn valid_test_passphrase() -> &'static str {
        "Alpha-Beta-Unique-Phrase-9"
    }
    // gitleaks:allow (test fixture, not a real secret)
    fn alternate_test_passphrase() -> &'static str {
        "Gamma-Delta-Alt-Phrase-7"
    }
    // gitleaks:allow (test fixture, not a real secret)
    fn invalid_test_passphrase() -> &'static str {
        "Nonmatching-Phrase-1"
    }
    // gitleaks:allow (test fixture, not a real secret)
    fn too_short_test_passphrase() -> &'static str {
        "Tiny-1A"
    }
    // gitleaks:allow (test fixture, not a real secret)
    fn single_class_test_passphrase() -> &'static str {
        "onlylowercaseletters"
    }

    fn create_test_manager() -> MasterPasswordManager {
        let conn = Connection::open_in_memory().unwrap();
        let manager = MasterPasswordManager::new(Arc::new(Mutex::new(conn)));
        manager.init_table().unwrap();
        manager
    }

    fn vault_key(manager: &MasterPasswordManager, password: &str) -> Vec<u8> {
        manager.authenticate(password).unwrap().key.clone()
    }

    fn argon2_root(password: &str, stored: &StoredVerifier) -> Vec<u8> {
        let salt = SaltString::from_b64(&stored.salt).unwrap();
        let params = Argon2Params::from_stored(&stored.argon2_params).unwrap();
        let mut salt_buf = [0u8; Salt::MAX_LENGTH];
        let raw_salt = salt.as_salt().decode_b64(&mut salt_buf).unwrap();
        let mut root = vec![0u8; ARGON2_OUTPUT_LEN];
        argon2_with(&params)
            .unwrap()
            .hash_password_into(password.as_bytes(), raw_salt, &mut root)
            .unwrap();
        root
    }

    fn fixture_failure() -> MasterPasswordError {
        MasterPasswordError::CryptoError("fixture".to_string())
    }

    #[test]
    fn the_stored_row_holds_a_verifier_that_is_neither_the_vault_key_nor_the_root() {
        let manager = create_test_manager();
        manager.setup(valid_test_passphrase()).unwrap();

        let stored = manager.stored_verifier().unwrap();
        assert_eq!(stored.kdf_version, KDF_VERSION_CURRENT);
        assert!(!stored.verifier.starts_with("$argon2"));

        let verifier = general_purpose::STANDARD.decode(&stored.verifier).unwrap();
        let key = vault_key(&manager, valid_test_passphrase());
        let root = argon2_root(valid_test_passphrase(), &stored);

        assert_eq!(verifier.len(), DERIVED_KEY_SIZE);
        assert_ne!(verifier, key);
        assert_ne!(verifier, root);
        assert_ne!(key, root);
        assert_ne!(
            hkdf_sha256(ROOT_BRANCH_SALT, &verifier, VAULT_KEY_BRANCH_INFO).unwrap(),
            key,
            "the vault key must not follow from the stored verifier"
        );

        for secret in [&key, &root] {
            let padded = general_purpose::STANDARD.encode(secret);
            let unpadded = general_purpose::STANDARD_NO_PAD.encode(secret);
            for column in [&stored.verifier, &stored.salt, &stored.argon2_params] {
                assert!(!column.contains(&padded));
                assert!(!column.contains(&unpadded));
            }
        }

        assert_eq!(
            manager.derive_key(KeyPurpose::McpCredentials).unwrap(),
            manager
                .purpose_key(&key, KeyPurpose::McpCredentials, KDF_VERSION_CURRENT)
                .unwrap()
        );
    }

    #[test]
    fn a_version_2_row_held_the_vault_key_and_is_replaced_at_the_next_unlock() {
        let manager = create_test_manager();
        manager.store_legacy_row(valid_test_passphrase(), KDF_VERSION_SHARED_VERIFIER);
        let before = manager.stored_verifier().unwrap();
        let old_key = vault_key(&manager, valid_test_passphrase());

        let stored_hash = PasswordHash::new(&before.verifier).unwrap();
        assert_eq!(
            stored_hash.hash.unwrap().as_bytes(),
            old_key.as_slice(),
            "a version 2 verifier is the vault key, which is why the row is replaced"
        );

        let mut handed = None;
        manager
            .unlock(valid_test_passphrase(), |_, current, upgraded| {
                handed = Some((current.key.clone(), upgraded.map(|key| key.key.clone())));
                Ok(())
            })
            .unwrap();

        let (current, upgraded) = handed.expect("the settle step ran");
        assert_eq!(current, old_key);
        let upgraded = upgraded.expect("an older row is upgraded");

        let after = manager.stored_verifier().unwrap();
        assert_eq!(after.kdf_version, KDF_VERSION_CURRENT);
        assert_ne!(after.salt, before.salt, "the old salt gives the old key");
        assert!(!after.verifier.starts_with("$argon2"));
        let verifier = general_purpose::STANDARD.decode(&after.verifier).unwrap();
        assert_ne!(verifier, upgraded);
        assert_ne!(verifier, old_key);
        assert_ne!(upgraded, old_key);
        assert_ne!(argon2_root(valid_test_passphrase(), &after), old_key);

        assert_eq!(
            manager.derive_key(KeyPurpose::McpCredentials).unwrap(),
            manager
                .purpose_key(&upgraded, KeyPurpose::McpCredentials, KDF_VERSION_CURRENT)
                .unwrap()
        );
        assert!(manager.verify(valid_test_passphrase()).unwrap());
        assert!(!manager.verify(invalid_test_passphrase()).unwrap());
    }

    /// The purpose key a build from before 2026-05-05 derived, written out
    /// from that build's source (`git show e9a6dfe628`) with nothing shared
    /// with the code under test but the HMAC primitive: Argon2id v0x13 at
    /// 19 MiB, the given iterations, one lane, over the base64 text of the
    /// salt; then HKDF with the fixed version 1 salt and info.
    fn historical_version_1_purpose_key(
        password: &str,
        stored: &StoredVerifier,
        iterations: u32,
    ) -> Vec<u8> {
        let argon2 = Argon2::new(
            argon2::Algorithm::Argon2id,
            Version::V0x13,
            Params::new(19 * 1024, iterations, 1, Some(32)).unwrap(),
        );
        let mut vault_key = vec![0u8; 32];
        argon2
            .hash_password_into(password.as_bytes(), stored.salt.as_bytes(), &mut vault_key)
            .unwrap();

        let mut combined = vault_key;
        combined.extend_from_slice(machine_key::get_machine_id_hash().as_bytes());
        hkdf_sha256(
            b"com.agiworkforce.desktop:master_password:v1",
            &combined,
            b"agiworkforce:mcp_credentials:v1",
        )
        .unwrap()
    }

    #[test]
    fn a_row_from_before_may_2026_gives_both_keys_its_data_may_be_under() {
        let manager = create_test_manager();
        manager.store_legacy_row_at(valid_test_passphrase(), KDF_VERSION_LEGACY, 2);
        let stored = manager.stored_verifier().unwrap();
        assert!(stored.verifier.contains("t=2,"), "{}", stored.verifier);

        let keys =
            manager.candidate_purpose_keys(valid_test_passphrase(), KeyPurpose::McpCredentials);

        let two_iterations = historical_version_1_purpose_key(valid_test_passphrase(), &stored, 2);
        let three_iterations =
            historical_version_1_purpose_key(valid_test_passphrase(), &stored, 3);
        assert_ne!(two_iterations, three_iterations);
        assert_eq!(
            keys,
            vec![three_iterations, two_iterations],
            "the key builds since 2026-05-05 used comes first, then the one the row was written with"
        );
    }

    #[test]
    fn a_row_written_at_three_iterations_has_one_key() {
        for version in [KDF_VERSION_LEGACY, KDF_VERSION_SHARED_VERIFIER] {
            let manager = create_test_manager();
            manager.store_legacy_row(valid_test_passphrase(), version);

            let keys =
                manager.candidate_purpose_keys(valid_test_passphrase(), KeyPurpose::McpCredentials);

            assert_eq!(keys.len(), 1);
            if version == KDF_VERSION_LEGACY {
                let stored = manager.stored_verifier().unwrap();
                assert_eq!(
                    keys[0],
                    historical_version_1_purpose_key(valid_test_passphrase(), &stored, 3)
                );
            }
        }
    }

    #[test]
    fn an_upgrade_blocked_by_keys_no_key_opens_keeps_the_row_and_names_them() {
        let manager = create_test_manager();
        manager.store_legacy_row_at(valid_test_passphrase(), KDF_VERSION_LEGACY, 2);
        let before = manager.stored_verifier().unwrap();

        let outcome = manager
            .unlock(valid_test_passphrase(), |_, _, _| {
                Err(MasterPasswordError::UnreadableSavedKeys {
                    providers: vec!["openai".to_string(), "anthropic".to_string()],
                })
            })
            .expect("the vault still opens");

        assert_eq!(
            outcome.keys_not_upgraded,
            vec!["openai".to_string(), "anthropic".to_string()]
        );
        let after = manager.stored_verifier().unwrap();
        assert_eq!(after.kdf_version, KDF_VERSION_LEGACY);
        assert_eq!(after.verifier, before.verifier);
        assert_eq!(after.salt, before.salt);
        assert!(manager.is_unlocked());
        assert_eq!(
            manager.derive_key(KeyPurpose::McpCredentials).unwrap(),
            historical_version_1_purpose_key(valid_test_passphrase(), &before, 3),
            "unlocked under the key the last build used"
        );
    }

    #[test]
    fn an_unlock_that_settles_reports_nothing_left_behind() {
        let manager = create_test_manager();
        manager.store_legacy_row_at(valid_test_passphrase(), KDF_VERSION_LEGACY, 2);

        let outcome = manager
            .unlock(valid_test_passphrase(), |_, _, _| Ok(()))
            .unwrap();

        assert_eq!(outcome, UnlockOutcome::default());
        assert_eq!(
            manager.stored_verifier().unwrap().kdf_version,
            KDF_VERSION_CURRENT
        );
    }

    #[test]
    fn a_version_1_row_is_replaced_at_the_next_unlock_and_only_once() {
        let manager = create_test_manager();
        manager.store_legacy_row(valid_test_passphrase(), KDF_VERSION_LEGACY);

        let mut upgraded_first = false;
        manager
            .unlock(valid_test_passphrase(), |_, _, upgraded| {
                upgraded_first = upgraded.is_some();
                Ok(())
            })
            .unwrap();
        assert!(upgraded_first);
        let after_first = manager.stored_verifier().unwrap();
        assert_eq!(after_first.kdf_version, KDF_VERSION_CURRENT);

        manager.lock();
        let mut upgraded_second = true;
        manager
            .unlock(valid_test_passphrase(), |_, _, upgraded| {
                upgraded_second = upgraded.is_some();
                Ok(())
            })
            .unwrap();
        assert!(!upgraded_second);
        let after_second = manager.stored_verifier().unwrap();
        assert_eq!(after_second.verifier, after_first.verifier);
        assert_eq!(after_second.salt, after_first.salt);
    }

    #[test]
    fn an_upgrade_whose_reseal_fails_leaves_the_old_row_and_still_unlocks() {
        let manager = create_test_manager();
        manager.store_legacy_row(valid_test_passphrase(), KDF_VERSION_SHARED_VERIFIER);
        let before = manager.stored_verifier().unwrap();
        let old_key = vault_key(&manager, valid_test_passphrase());

        manager
            .unlock(valid_test_passphrase(), |_, _, _| Err(fixture_failure()))
            .unwrap();

        let after = manager.stored_verifier().unwrap();
        assert_eq!(after.kdf_version, KDF_VERSION_SHARED_VERIFIER);
        assert_eq!(after.verifier, before.verifier);
        assert_eq!(after.salt, before.salt);
        assert!(manager.is_unlocked());
        assert_eq!(
            manager.derive_key(KeyPurpose::McpCredentials).unwrap(),
            manager
                .purpose_key(
                    &old_key,
                    KeyPurpose::McpCredentials,
                    KDF_VERSION_SHARED_VERIFIER
                )
                .unwrap()
        );
    }

    #[test]
    fn a_wrong_password_is_refused_before_anything_is_settled() {
        let legacy = create_test_manager();
        legacy.store_legacy_row(valid_test_passphrase(), KDF_VERSION_SHARED_VERIFIER);
        let current = create_test_manager();
        current.setup(valid_test_passphrase()).unwrap();
        current.lock();

        for manager in [&legacy, &current] {
            let before = manager.stored_verifier().unwrap();
            let mut settled = false;
            let refusal = manager.unlock(invalid_test_passphrase(), |_, _, _| {
                settled = true;
                Ok(())
            });

            assert!(matches!(refusal, Err(MasterPasswordError::InvalidPassword)));
            assert!(!settled);
            assert!(!manager.is_unlocked());
            let after = manager.stored_verifier().unwrap();
            assert_eq!(after.kdf_version, before.kdf_version);
            assert_eq!(after.verifier, before.verifier);
        }
    }

    #[test]
    fn a_current_row_is_checked_with_the_argon2_parameters_stored_beside_it() {
        let manager = create_test_manager();
        manager.setup(valid_test_passphrase()).unwrap();
        assert!(manager.verify(valid_test_passphrase()).unwrap());

        let other_params = serde_json::to_string(&Argon2Params {
            iterations: ARGON2_ITERATIONS + 1,
            ..Argon2Params::default()
        })
        .unwrap();
        manager
            .db()
            .unwrap()
            .execute(
                "UPDATE master_password SET argon2_params = ?1 WHERE id = 1",
                [&other_params],
            )
            .unwrap();

        assert!(!manager.verify(valid_test_passphrase()).unwrap());
    }

    #[test]
    fn stored_argon2_parameters_outside_the_supported_range_are_refused_unrun() {
        let manager = create_test_manager();
        manager.setup(valid_test_passphrase()).unwrap();
        manager.lock();

        let out_of_range = [
            Argon2Params {
                memory_kib: ARGON2_MAX_MEMORY_KIB + 1,
                ..Argon2Params::default()
            },
            Argon2Params {
                memory_kib: u32::MAX,
                ..Argon2Params::default()
            },
            Argon2Params {
                memory_kib: ARGON2_MIN_MEMORY_KIB - 1,
                ..Argon2Params::default()
            },
            Argon2Params {
                iterations: ARGON2_MAX_ITERATIONS + 1,
                ..Argon2Params::default()
            },
            Argon2Params {
                iterations: ARGON2_MIN_ITERATIONS - 1,
                ..Argon2Params::default()
            },
            Argon2Params {
                parallelism: ARGON2_MAX_PARALLELISM + 1,
                ..Argon2Params::default()
            },
            Argon2Params {
                parallelism: ARGON2_MIN_PARALLELISM - 1,
                ..Argon2Params::default()
            },
        ];

        for params in out_of_range {
            let stored = serde_json::to_string(&params).unwrap();
            manager
                .db()
                .unwrap()
                .execute(
                    "UPDATE master_password SET argon2_params = ?1 WHERE id = 1",
                    [&stored],
                )
                .unwrap();

            let mut settled = false;
            let refusal = manager
                .unlock(valid_test_passphrase(), |_, _, _| {
                    settled = true;
                    Ok(())
                })
                .expect_err("out-of-range parameters are never run");
            let MasterPasswordError::CryptoError(message) = refusal else {
                panic!("expected the parameters to be named as the cause");
            };
            assert!(message.contains("outside the supported range"), "{message}");
            assert!(!settled);
            assert!(!manager.is_unlocked());
        }
    }

    #[test]
    fn a_legacy_hash_asking_for_more_than_the_supported_cost_is_refused_unrun() {
        let manager = create_test_manager();
        manager.store_legacy_row(valid_test_passphrase(), KDF_VERSION_SHARED_VERIFIER);
        let stored = manager.stored_verifier().unwrap();
        let asked_for = format!("m={},", ARGON2_MAX_MEMORY_KIB + 1);
        let tampered =
            stored
                .verifier
                .replacen(&format!("m={},", ARGON2_MEMORY_KIB), &asked_for, 1);
        assert_ne!(tampered, stored.verifier);
        manager
            .db()
            .unwrap()
            .execute(
                "UPDATE master_password SET verifier_hash = ?1 WHERE id = 1",
                [&tampered],
            )
            .unwrap();

        let refusal = manager
            .verify(valid_test_passphrase())
            .expect_err("an out-of-range hash is never run");
        let MasterPasswordError::CryptoError(message) = refusal else {
            panic!("expected the parameters to be named as the cause");
        };
        assert!(message.contains("outside the supported range"), "{message}");
    }

    #[test]
    fn the_defaults_a_new_password_is_stored_with_are_inside_the_supported_range() {
        let stored = serde_json::to_string(&Argon2Params::default()).unwrap();

        assert!(Argon2Params::from_stored(&stored).is_ok());
        assert!(Argon2Params::from_stored("{ not json").is_err());
    }

    #[test]
    fn a_row_of_an_unknown_version_is_refused() {
        let manager = create_test_manager();
        manager.setup(valid_test_passphrase()).unwrap();
        manager
            .db()
            .unwrap()
            .execute(
                "UPDATE master_password SET kdf_version = ?1 WHERE id = 1",
                [KDF_VERSION_CURRENT as i64 + 1],
            )
            .unwrap();

        assert!(matches!(
            manager.verify(valid_test_passphrase()),
            Err(MasterPasswordError::CryptoError(_))
        ));
    }

    #[test]
    fn the_legacy_derivations_stay_distinct_and_deterministic() {
        let manager = create_test_manager();
        let salt = SaltString::generate(&mut OsRng);
        let pw = valid_test_passphrase();

        let v1_a = manager
            .derive_password_key(pw, &salt, KDF_VERSION_LEGACY, &LEGACY_FIXED_COST)
            .unwrap();
        let v1_b = manager
            .derive_password_key(pw, &salt, KDF_VERSION_LEGACY, &LEGACY_FIXED_COST)
            .unwrap();
        let v2_a = manager
            .derive_password_key(pw, &salt, KDF_VERSION_SHARED_VERIFIER, &LEGACY_FIXED_COST)
            .unwrap();
        let v2_b = manager
            .derive_password_key(pw, &salt, KDF_VERSION_SHARED_VERIFIER, &LEGACY_FIXED_COST)
            .unwrap();

        assert_eq!(v1_a, v1_b);
        assert_eq!(v2_a, v2_b);
        assert_ne!(v1_a, v2_a);
        assert_eq!(v1_a.len(), ARGON2_OUTPUT_LEN);
        assert_eq!(v2_a.len(), ARGON2_OUTPUT_LEN);
        assert!(manager
            .derive_password_key(pw, &salt, KDF_VERSION_CURRENT, &LEGACY_FIXED_COST)
            .is_err());
    }

    #[test]
    fn each_version_derives_its_own_purpose_key_from_the_same_vault_key() {
        let manager = create_test_manager();
        let key = [7u8; ARGON2_OUTPUT_LEN];

        let keys: Vec<Vec<u8>> = [
            KDF_VERSION_LEGACY,
            KDF_VERSION_SHARED_VERIFIER,
            KDF_VERSION_CURRENT,
        ]
        .iter()
        .map(|version| {
            manager
                .purpose_key(&key, KeyPurpose::McpCredentials, *version)
                .unwrap()
        })
        .collect();

        assert_ne!(keys[0], keys[1]);
        assert_ne!(keys[1], keys[2]);
        assert_ne!(keys[0], keys[2]);
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
    fn setting_a_password_hands_the_new_key_to_the_seal_step() {
        let manager = create_test_manager();
        let mut handed = None;

        manager
            .setup_with(valid_test_passphrase(), |_, key| {
                handed = Some(key.purpose_key(KeyPurpose::McpCredentials)?);
                Ok(())
            })
            .unwrap();

        assert_eq!(
            handed.expect("the seal step ran"),
            manager.derive_key(KeyPurpose::McpCredentials).unwrap()
        );
    }

    #[test]
    fn a_seal_step_that_fails_leaves_no_password_set() {
        let manager = create_test_manager();

        let failure = manager.setup_with(valid_test_passphrase(), |_, _| Err(fixture_failure()));

        assert!(matches!(failure, Err(MasterPasswordError::CryptoError(_))));
        assert!(!manager.is_configured().unwrap());
        assert!(!manager.is_unlocked());
    }

    #[test]
    fn a_short_password_is_refused_with_the_length_rule() {
        let manager = create_test_manager();

        let result = manager.setup(too_short_test_passphrase());
        assert!(matches!(
            result,
            Err(MasterPasswordError::PasswordRejected(
                PasswordRuleViolation::TooShort {
                    min_length: MIN_PASSWORD_LENGTH
                }
            ))
        ));
        assert!(!manager.is_configured().unwrap());
    }

    #[test]
    fn a_password_of_one_kind_of_character_is_refused_in_plain_words() {
        let manager = create_test_manager();

        let refusal = manager
            .setup(single_class_test_passphrase())
            .expect_err("one character class is not enough");
        assert!(matches!(
            refusal,
            MasterPasswordError::PasswordRejected(PasswordRuleViolation::TooFewCharacterClasses {
                min_character_classes: MIN_PASSWORD_CHARACTER_CLASSES
            })
        ));

        let shown = refusal.to_string();
        assert!(!shown.contains("Cryptographic"), "{shown}");
        assert!(shown.contains("a lowercase letter"), "{shown}");
        assert!(!manager.is_configured().unwrap());
    }

    /// The same passwords `masterPasswordVault.test.ts` holds the Settings
    /// check to, so the two sides agree on what the rule means.
    #[test]
    fn the_rule_reads_the_passwords_settings_is_tested_with_the_same_way() {
        let too_short = Some(PasswordRuleViolation::TooShort {
            min_length: MIN_PASSWORD_LENGTH,
        });
        let too_few_classes = Some(PasswordRuleViolation::TooFewCharacterClasses {
            min_character_classes: MIN_PASSWORD_CHARACTER_CLASSES,
        });
        let eleven_characters = format!("{}aA1", "\u{1F600}".repeat(8));

        assert_eq!(
            password_rule_violation(too_short_test_passphrase()),
            too_short
        );
        assert_eq!(
            password_rule_violation(single_class_test_passphrase()),
            too_few_classes
        );
        assert_eq!(
            password_rule_violation("lowercase words 123"),
            too_few_classes
        );
        assert_eq!(password_rule_violation(&eleven_characters), too_short);
        assert_eq!(password_rule_violation(valid_test_passphrase()), None);
        assert_eq!(password_rule_violation("lowercase-words-123"), None);
    }

    #[test]
    fn a_changed_password_is_held_to_the_same_rules() {
        let manager = create_test_manager();
        manager.setup(valid_test_passphrase()).unwrap();

        let refusal = manager.change(
            valid_test_passphrase(),
            single_class_test_passphrase(),
            |_, _, _| Ok(()),
        );

        assert!(matches!(
            refusal,
            Err(MasterPasswordError::PasswordRejected(
                PasswordRuleViolation::TooFewCharacterClasses { .. }
            ))
        ));
        assert!(manager.verify(valid_test_passphrase()).unwrap());
    }

    #[test]
    fn the_status_carries_the_password_policy() {
        let manager = create_test_manager();

        let status = manager.get_status().unwrap();

        assert_eq!(status.password_policy, PasswordPolicy::CURRENT);
        assert_eq!(status.password_policy.min_length, MIN_PASSWORD_LENGTH);
        assert_eq!(
            status.password_policy.min_character_classes,
            MIN_PASSWORD_CHARACTER_CLASSES
        );
        assert!(!status.needs_migration);
    }

    #[test]
    fn test_unlock_and_lock() {
        let manager = create_test_manager();
        manager.setup(valid_test_passphrase()).unwrap();

        assert!(manager.is_unlocked());

        manager.lock();
        assert!(!manager.is_unlocked());

        manager
            .unlock(valid_test_passphrase(), |_, _, _| Ok(()))
            .unwrap();
        assert!(manager.is_unlocked());
    }

    #[test]
    fn test_change_password() {
        let manager = create_test_manager();
        manager.setup(valid_test_passphrase()).unwrap();

        manager
            .change(
                valid_test_passphrase(),
                alternate_test_passphrase(),
                |_, _, _| Ok(()),
            )
            .unwrap();

        assert!(!manager.verify(valid_test_passphrase()).unwrap());
        assert!(manager.verify(alternate_test_passphrase()).unwrap());
    }

    #[test]
    fn a_change_from_an_older_row_writes_the_current_version() {
        let manager = create_test_manager();
        manager.store_legacy_row(valid_test_passphrase(), KDF_VERSION_LEGACY);

        manager
            .change(
                valid_test_passphrase(),
                alternate_test_passphrase(),
                |_, _, _| Ok(()),
            )
            .unwrap();

        let stored = manager.stored_verifier().unwrap();
        assert_eq!(stored.kdf_version, KDF_VERSION_CURRENT);
        assert!(!stored.verifier.starts_with("$argon2"));
        assert!(manager.verify(alternate_test_passphrase()).unwrap());
        assert!(!manager.verify(valid_test_passphrase()).unwrap());
    }

    #[test]
    fn after_an_upgrade_the_password_can_still_be_changed_and_removed() {
        let manager = create_test_manager();
        manager.store_legacy_row(valid_test_passphrase(), KDF_VERSION_SHARED_VERIFIER);
        manager
            .unlock(valid_test_passphrase(), |_, _, _| Ok(()))
            .unwrap();

        manager
            .change(
                valid_test_passphrase(),
                alternate_test_passphrase(),
                |_, _, _| Ok(()),
            )
            .unwrap();
        assert!(manager.verify(alternate_test_passphrase()).unwrap());
        assert!(!manager.verify(valid_test_passphrase()).unwrap());

        manager
            .remove(alternate_test_passphrase(), |_, _| Ok(()))
            .unwrap();
        assert!(!manager.is_configured().unwrap());
        assert!(!manager.is_unlocked());
    }

    #[test]
    fn a_change_whose_reseal_fails_keeps_the_old_password_and_key() {
        let manager = create_test_manager();
        manager.setup(valid_test_passphrase()).unwrap();
        let key_before = manager.derive_key(KeyPurpose::McpCredentials).unwrap();

        let failure = manager.change(
            valid_test_passphrase(),
            alternate_test_passphrase(),
            |_, _, _| Err(fixture_failure()),
        );

        assert!(matches!(failure, Err(MasterPasswordError::CryptoError(_))));
        assert!(manager.verify(valid_test_passphrase()).unwrap());
        assert!(!manager.verify(alternate_test_passphrase()).unwrap());
        assert_eq!(
            manager.derive_key(KeyPurpose::McpCredentials).unwrap(),
            key_before
        );
    }

    #[test]
    fn the_reseal_step_is_handed_the_keys_the_vault_uses_before_and_after() {
        let manager = create_test_manager();
        manager.setup(valid_test_passphrase()).unwrap();
        let key_before = manager.derive_key(KeyPurpose::McpCredentials).unwrap();
        let mut handed = None;

        manager
            .change(
                valid_test_passphrase(),
                alternate_test_passphrase(),
                |_, old_key, new_key| {
                    handed = Some((
                        old_key.purpose_key(KeyPurpose::McpCredentials)?,
                        new_key.purpose_key(KeyPurpose::McpCredentials)?,
                    ));
                    Ok(())
                },
            )
            .unwrap();

        let (old, new) = handed.expect("the reseal step ran");
        assert_eq!(old, key_before);
        assert_eq!(new, manager.derive_key(KeyPurpose::McpCredentials).unwrap());
        assert_ne!(old, new);
    }

    #[test]
    fn removing_the_password_needs_the_password_and_clears_the_vault() {
        let manager = create_test_manager();
        manager.setup(valid_test_passphrase()).unwrap();

        assert!(matches!(
            manager.remove(invalid_test_passphrase(), |_, _| Ok(())),
            Err(MasterPasswordError::InvalidPassword)
        ));
        assert!(manager.is_configured().unwrap());

        assert!(matches!(
            manager.remove(valid_test_passphrase(), |_, _| Err(fixture_failure())),
            Err(MasterPasswordError::CryptoError(_))
        ));
        assert!(manager.is_configured().unwrap());
        assert!(manager.is_unlocked());

        manager
            .remove(valid_test_passphrase(), |_, _| Ok(()))
            .unwrap();
        assert!(!manager.is_configured().unwrap());
        assert!(!manager.is_unlocked());
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
