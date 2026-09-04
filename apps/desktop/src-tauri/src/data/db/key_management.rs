//! Stable SQLCipher key storage and legacy-key retirement for the main database.
//!
//! New installations use a random 256-bit key stored by the operating system's
//! credential service. Existing machine-derived databases are opened only after
//! a read-only SQLCipher proof, and a key that proof identifies as one of the
//! legacy machine-only derivations is never kept: the database is rekeyed onto
//! a fresh random key in the same step, because the legacy key is recomputable
//! offline by any unprivileged local process from public machine identifiers.

use super::encryption::{
    inspect_database_format, open_or_migrate_encrypted_connection, rekey_encrypted_database,
    DatabaseFormat, DatabaseOpenError,
};
use crate::sys::security::machine_key;
use rand::{rngs::OsRng, RngCore};
use rusqlite::Connection;
use std::path::Path;
use std::sync::{Arc, OnceLock};

const DATABASE_KEY_BYTES: usize = 32;
const DATABASE_KEYRING_ACCOUNT: &str = "sqlcipher-main-database-key-v1";
static MAIN_DATABASE_ACCESS: OnceLock<MainDatabaseAccess> = OnceLock::new();

/// Minimal secure-storage boundary used by startup and deterministic tests.
pub trait DatabaseKeyStore {
    fn load(&self) -> Result<Option<[u8; DATABASE_KEY_BYTES]>, DatabaseKeyError>;
    fn store(&self, key: &[u8; DATABASE_KEY_BYTES]) -> Result<(), DatabaseKeyError>;
}

/// Operating-system credential storage already used elsewhere in Desktop.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct OsDatabaseKeyStore {
    service: String,
}

impl OsDatabaseKeyStore {
    /// Build a credential namespace from the actual Tauri bundle identity.
    ///
    /// Debug, WDIO, demo, and production bundles must never share a database
    /// key. Apple's bundle-identifier character rules also prevent treating an
    /// arbitrary path or user-controlled string as a Keychain namespace.
    pub fn for_bundle_identifier(identifier: &str) -> Result<Self, DatabaseKeyError> {
        if !is_valid_bundle_identifier(identifier) {
            return Err(DatabaseKeyError::InvalidBundleIdentifier);
        }

        Ok(Self {
            service: identifier.to_string(),
        })
    }

    fn entry(&self) -> Result<keyring::Entry, DatabaseKeyError> {
        keyring::Entry::new(&self.service, DATABASE_KEYRING_ACCOUNT)
            .map_err(|error| DatabaseKeyError::SecureStorage(error.to_string()))
    }

    /// Key supplied by the automated-E2E harness instead of the OS Keychain.
    ///
    /// Reading a Keychain item blocks on a GUI approval dialog whenever the
    /// requesting binary's signature is unknown, and every `cargo build`
    /// re-signs the debug binary. Under WDIO nobody can click Allow, so the
    /// app hangs before it opens its database and no native E2E can run.
    ///
    /// This escape hatch is deliberately narrow: it applies ONLY to the
    /// isolated `*.wdio` bundle identifier, which is never shipped and owns a
    /// throwaway app-data directory. A production or BYOK bundle ignores the
    /// variable entirely, so no shipped trust boundary depends on it.
    fn harness_key(&self) -> Option<[u8; DATABASE_KEY_BYTES]> {
        if !self.service.ends_with(".wdio") {
            return None;
        }

        let raw = std::env::var("AGI_DESKTOP_WDIO_DATABASE_KEY").ok()?;
        let trimmed = raw.trim();
        if trimmed.len() != DATABASE_KEY_BYTES * 2 {
            tracing::warn!(
                "AGI_DESKTOP_WDIO_DATABASE_KEY must be {} hex characters; ignoring it",
                DATABASE_KEY_BYTES * 2
            );
            return None;
        }

        let mut key = [0u8; DATABASE_KEY_BYTES];
        for (index, slot) in key.iter_mut().enumerate() {
            let byte = trimmed.get(index * 2..index * 2 + 2)?;
            *slot = u8::from_str_radix(byte, 16).ok()?;
        }
        Some(key)
    }
}

impl DatabaseKeyStore for OsDatabaseKeyStore {
    fn load(&self) -> Result<Option<[u8; DATABASE_KEY_BYTES]>, DatabaseKeyError> {
        if let Some(key) = self.harness_key() {
            return Ok(Some(key));
        }

        let secret = match self.entry()?.get_secret() {
            Ok(secret) => secret,
            Err(keyring::Error::NoEntry) => return Ok(None),
            Err(error) => return Err(DatabaseKeyError::SecureStorage(error.to_string())),
        };

        let actual = secret.len();
        secret
            .try_into()
            .map(Some)
            .map_err(|_| DatabaseKeyError::InvalidStoredKey { actual })
    }

    fn store(&self, key: &[u8; DATABASE_KEY_BYTES]) -> Result<(), DatabaseKeyError> {
        // The harness key is supplied per run and owns a throwaway profile;
        // writing it back would put an E2E secret in the user's Keychain.
        if self.harness_key().is_some() {
            return Ok(());
        }

        self.entry()?
            .set_secret(key)
            .map_err(|error| DatabaseKeyError::SecureStorage(error.to_string()))
    }
}

fn is_valid_bundle_identifier(identifier: &str) -> bool {
    if identifier.len() < 3 || identifier.len() > 255 || !identifier.contains('.') {
        return false;
    }

    identifier.split('.').all(|segment| {
        let bytes = segment.as_bytes();
        !bytes.is_empty()
            && bytes.first().is_some_and(u8::is_ascii_alphanumeric)
            && bytes.last().is_some_and(u8::is_ascii_alphanumeric)
            && bytes
                .iter()
                .all(|byte| byte.is_ascii_alphanumeric() || *byte == b'-')
    })
}

#[derive(Debug, thiserror::Error)]
pub enum DatabaseKeyError {
    #[error("secure database-key storage is unavailable: {0}")]
    SecureStorage(String),
    #[error("secure database-key storage returned {actual} bytes; expected {DATABASE_KEY_BYTES}")]
    InvalidStoredKey { actual: usize },
    #[error("operating-system random generation failed: {0}")]
    RandomGeneration(String),
    #[error("the application bundle identifier is not valid for secure database-key storage")]
    InvalidBundleIdentifier,
    #[error("the existing database could not be identified without changing it")]
    UnidentifiedDatabase,
    #[error(transparent)]
    Database(#[from] DatabaseOpenError),
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum DatabaseKeyOrigin {
    Stored,
    Generated,
    RekeyedLegacy,
    MigratedPlaintext,
}

/// Cloneable in-process capability for opening another keyed connection to the
/// already verified main database. The path and key stay native and are never
/// serialized to the webview.
#[derive(Clone)]
pub struct MainDatabaseAccess {
    path: Arc<Path>,
    key: Arc<[u8; DATABASE_KEY_BYTES]>,
}

impl MainDatabaseAccess {
    pub fn open_connection(&self) -> Result<Connection, String> {
        let path = self.path.to_string_lossy();
        super::encryption::open_encrypted_connection(&path, self.key.as_ref()).map_err(|error| {
            tracing::error!("Failed to open an additional keyed main-database connection: {error}");
            "The encrypted local database is unavailable.".to_string()
        })
    }
}

/// Publish the verified main-database capability for native services that do
/// not run as Tauri commands and therefore cannot receive managed state.
pub fn register_main_database_access(access: MainDatabaseAccess) -> Result<(), String> {
    MAIN_DATABASE_ACCESS
        .set(access)
        .map_err(|_| "The main database capability was already registered.".to_string())
}

/// Whether the OS-protected main-database key has been registered yet.
///
/// Managers that live in the main database but open per-call by path (e.g.
/// `KnowledgeBase`) use this to prefer the correctly-keyed registered
/// connection in production while still opening a keyed temp file by path in
/// isolated unit tests, where startup never runs.
pub fn main_database_access_registered() -> bool {
    MAIN_DATABASE_ACCESS.get().is_some()
}

/// Open another connection to the verified main database.
///
/// Production code fails closed until startup has registered the OS-protected
/// key. Unit tests retain the legacy helper so isolated database tests do not
/// need a native Keychain or a Tauri application handle.
pub fn open_registered_main_database_connection() -> Result<Connection, String> {
    if let Some(access) = MAIN_DATABASE_ACCESS.get() {
        return access.open_connection();
    }

    #[cfg(test)]
    {
        return crate::data::db::encryption::open_keyed_connection(
            crate::sys::utils::database_path().map_err(|error| error.to_string())?,
        );
    }

    #[cfg(not(test))]
    Err("The encrypted local database is unavailable.".to_string())
}

pub struct StableDatabase {
    pub connection: Connection,
    pub key_origin: DatabaseKeyOrigin,
    pub access: MainDatabaseAccess,
}

fn random_database_key() -> Result<[u8; DATABASE_KEY_BYTES], DatabaseKeyError> {
    let mut key = [0u8; DATABASE_KEY_BYTES];
    OsRng
        .try_fill_bytes(&mut key)
        .map_err(|error| DatabaseKeyError::RandomGeneration(error.to_string()))?;
    Ok(key)
}

fn open_with_key(
    path: &str,
    key: &[u8; DATABASE_KEY_BYTES],
    key_origin: DatabaseKeyOrigin,
) -> Result<StableDatabase, DatabaseKeyError> {
    let connection = open_or_migrate_encrypted_connection(path, key)?;
    Ok(StableDatabase {
        connection,
        key_origin,
        access: MainDatabaseAccess {
            path: Arc::from(Path::new(path)),
            key: Arc::new(*key),
        },
    })
}

fn create_stable_database<S: DatabaseKeyStore>(
    path: &str,
    store: &S,
    key_origin: DatabaseKeyOrigin,
) -> Result<StableDatabase, DatabaseKeyError> {
    let key = random_database_key()?;
    // Persist before creating/migrating the database. If the database operation
    // fails, the next launch can safely retry with the same stored key.
    store.store(&key)?;
    open_with_key(path, &key, key_origin)
}

fn retire_legacy_database_key<S: DatabaseKeyStore>(
    path: &Path,
    path_string: &str,
    legacy_key: &[u8; DATABASE_KEY_BYTES],
    store: &S,
) -> Result<StableDatabase, DatabaseKeyError> {
    let replacement = random_database_key()?;
    store.store(&replacement)?;
    // A store that accepts a write it does not keep (the WDIO harness stub) would
    // otherwise leave the rekeyed file openable by nobody.
    if store.load()?.as_ref() != Some(&replacement) {
        return Err(DatabaseKeyError::SecureStorage(
            "the replacement database key was not retained".to_string(),
        ));
    }

    let label = format!("sqlcipher:{path_string}");
    machine_key::record_machine_only_payload(&label);
    tracing::info!("Rekeying {path_string} off the legacy machine-derived key");
    rekey_encrypted_database(path, legacy_key, &replacement, &label).map_err(|error| {
        DatabaseOpenError::KeyedDatabase(format!(
            "the legacy machine-derived key could not be replaced: {error}"
        ))
    })?;
    machine_key::clear_machine_only_payload(&label);

    open_with_key(path_string, &replacement, DatabaseKeyOrigin::RekeyedLegacy)
}

pub fn open_main_database<S: DatabaseKeyStore>(
    path: impl AsRef<Path>,
    store: &S,
    legacy_candidates: &[[u8; DATABASE_KEY_BYTES]],
) -> Result<StableDatabase, DatabaseKeyError> {
    let path = path.as_ref();
    let path_string = path.to_string_lossy().to_string();
    let stored_key = store.load()?;
    let mut last_unreadable = None;

    if let Some(key) = stored_key {
        match inspect_database_format(path, &key) {
            // An earlier build persisted the proven legacy key instead of
            // replacing it, so secure storage holding a candidate is not proof
            // the database is protected.
            Ok(DatabaseFormat::Keyed) if legacy_candidates.contains(&key) => {
                return retire_legacy_database_key(path, &path_string, &key, store);
            }
            Ok(DatabaseFormat::New | DatabaseFormat::Keyed) => {
                return open_with_key(&path_string, &key, DatabaseKeyOrigin::Stored);
            }
            Ok(DatabaseFormat::Plaintext) => {
                return open_with_key(&path_string, &key, DatabaseKeyOrigin::MigratedPlaintext);
            }
            Err(error @ DatabaseOpenError::EncryptedOrCorrupt { .. }) => {
                // A stale secure-store item can exist after an interrupted
                // upgrade. Continue with read-only legacy proof below.
                last_unreadable = Some(error);
            }
            Err(error) => return Err(error.into()),
        }
    } else if !path.exists()
        || std::fs::metadata(path)
            .map(|metadata| metadata.len() == 0)
            .unwrap_or(false)
    {
        return create_stable_database(&path_string, store, DatabaseKeyOrigin::Generated);
    }

    for candidate in legacy_candidates {
        if stored_key.as_ref() == Some(candidate) {
            continue;
        }

        match inspect_database_format(path, candidate) {
            // Only a candidate that actually opened the schema authorizes a
            // rekey, and the candidate itself is never what gets stored.
            Ok(DatabaseFormat::Keyed) => {
                return retire_legacy_database_key(path, &path_string, candidate, store);
            }
            Ok(DatabaseFormat::Plaintext) => {
                return create_stable_database(
                    &path_string,
                    store,
                    DatabaseKeyOrigin::MigratedPlaintext,
                );
            }
            Ok(DatabaseFormat::New) => {
                return create_stable_database(&path_string, store, DatabaseKeyOrigin::Generated);
            }
            Err(error @ DatabaseOpenError::EncryptedOrCorrupt { .. }) => {
                last_unreadable = Some(error);
            }
            Err(error) => return Err(error.into()),
        }
    }

    // A candidate list is normally non-empty, but use a read-only arbitrary-key
    // probe so a proven plaintext database can still migrate in tests or on an
    // unsupported legacy platform.
    if legacy_candidates.is_empty() {
        match inspect_database_format(path, &[0u8; DATABASE_KEY_BYTES]) {
            Ok(DatabaseFormat::Plaintext) => {
                return create_stable_database(
                    &path_string,
                    store,
                    DatabaseKeyOrigin::MigratedPlaintext,
                );
            }
            Ok(DatabaseFormat::New) => {
                return create_stable_database(&path_string, store, DatabaseKeyOrigin::Generated);
            }
            Ok(DatabaseFormat::Keyed) => {
                // A real SQLCipher database cannot be keyed with an arbitrary
                // value by coincidence; keep the branch exhaustive, and retire
                // a key this obviously guessable the same way.
                return retire_legacy_database_key(
                    path,
                    &path_string,
                    &[0u8; DATABASE_KEY_BYTES],
                    store,
                );
            }
            Err(error @ DatabaseOpenError::EncryptedOrCorrupt { .. }) => {
                last_unreadable = Some(error);
            }
            Err(error) => return Err(error.into()),
        }
    }

    match last_unreadable {
        Some(error) => Err(error.into()),
        None => Err(DatabaseKeyError::UnidentifiedDatabase),
    }
}

#[cfg(test)]
mod harness_key_tests {
    use super::*;

    /// One process-wide lock: these cases mutate a shared environment variable.
    static ENV_GUARD: std::sync::Mutex<()> = std::sync::Mutex::new(());
    const VALID_HEX: &str = "00112233445566778899aabbccddeeff00112233445566778899aabbccddeeff";

    fn with_env<T>(value: Option<&str>, body: impl FnOnce() -> T) -> T {
        let _guard = ENV_GUARD
            .lock()
            .unwrap_or_else(|poisoned| poisoned.into_inner());
        match value {
            Some(value) => std::env::set_var("AGI_DESKTOP_WDIO_DATABASE_KEY", value),
            None => std::env::remove_var("AGI_DESKTOP_WDIO_DATABASE_KEY"),
        }
        let outcome = body();
        std::env::remove_var("AGI_DESKTOP_WDIO_DATABASE_KEY");
        outcome
    }

    fn store_for(identifier: &str) -> OsDatabaseKeyStore {
        OsDatabaseKeyStore::for_bundle_identifier(identifier).expect("valid identifier")
    }

    #[test]
    fn harness_key_is_used_only_by_the_isolated_wdio_bundle() {
        with_env(Some(VALID_HEX), || {
            let harness = store_for("com.agiworkforce.desktop.wdio")
                .harness_key()
                .expect("wdio bundle should accept the harness key");
            assert_eq!(harness[0], 0x00);
            assert_eq!(harness[31], 0xff);

            // The shipped bundles must never honour it, or an environment
            // variable could dictate a production database key.
            assert!(store_for("com.agiworkforce.desktop")
                .harness_key()
                .is_none());
            assert!(store_for("com.agiworkforce.desktop.wdio.other")
                .harness_key()
                .is_none());
        });
    }

    #[test]
    fn harness_key_is_absent_without_a_well_formed_value() {
        let wdio = "com.agiworkforce.desktop.wdio";
        with_env(None, || assert!(store_for(wdio).harness_key().is_none()));
        with_env(Some("deadbeef"), || {
            assert!(store_for(wdio).harness_key().is_none(), "short value")
        });
        with_env(Some(&"zz".repeat(32)), || {
            assert!(store_for(wdio).harness_key().is_none(), "non-hex value")
        });
    }

    #[test]
    fn harness_store_never_writes_the_run_key_into_the_keychain() {
        with_env(Some(VALID_HEX), || {
            let store = store_for("com.agiworkforce.desktop.wdio");
            assert!(store.store(&[7u8; DATABASE_KEY_BYTES]).is_ok());
            // Still the env-provided key, never the value just "stored".
            assert_eq!(store.load().expect("load").expect("some")[0], 0x00);
        });
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::data::db::encryption::open_encrypted_connection;
    use std::sync::Mutex;

    #[derive(Default)]
    struct MemoryKeyStore {
        key: Mutex<Option<[u8; DATABASE_KEY_BYTES]>>,
        writes: Mutex<usize>,
        fail_writes: bool,
    }

    impl DatabaseKeyStore for MemoryKeyStore {
        fn load(&self) -> Result<Option<[u8; DATABASE_KEY_BYTES]>, DatabaseKeyError> {
            Ok(*self.key.lock().expect("key store lock"))
        }

        fn store(&self, key: &[u8; DATABASE_KEY_BYTES]) -> Result<(), DatabaseKeyError> {
            if self.fail_writes {
                return Err(DatabaseKeyError::SecureStorage(
                    "test store unavailable".to_string(),
                ));
            }
            *self.key.lock().expect("key store lock") = Some(*key);
            *self.writes.lock().expect("write count lock") += 1;
            Ok(())
        }
    }

    #[test]
    fn new_database_uses_and_reuses_a_random_stored_key() {
        let temp_dir = tempfile::tempdir().expect("temp directory");
        let db_path = temp_dir.path().join("main.db");
        let store = MemoryKeyStore::default();

        let first = open_main_database(&db_path, &store, &[]).expect("create stable database");
        assert_eq!(first.key_origin, DatabaseKeyOrigin::Generated);
        first
            .connection
            .execute_batch(
                "CREATE TABLE durable (value TEXT NOT NULL);
                 INSERT INTO durable (value) VALUES ('persisted');",
            )
            .expect("seed stable database");
        drop(first);

        let stored_key = store
            .load()
            .expect("load stored key")
            .expect("key was persisted");
        assert_ne!(stored_key, [0u8; DATABASE_KEY_BYTES]);

        let reopened = open_main_database(&db_path, &store, &[]).expect("reopen stable database");
        assert_eq!(reopened.key_origin, DatabaseKeyOrigin::Stored);
        let value: String = reopened
            .connection
            .query_row("SELECT value FROM durable", [], |row| row.get(0))
            .expect("read durable value");
        assert_eq!(value, "persisted");
    }

    fn seed_database(path: &str, key: &[u8; DATABASE_KEY_BYTES], value: &str) {
        let connection = open_encrypted_connection(path, key).expect("create database");
        connection
            .execute_batch(&format!(
                "CREATE TABLE durable (value TEXT NOT NULL);
                 INSERT INTO durable (value) VALUES ('{value}');"
            ))
            .expect("seed database");
    }

    fn durable_value(connection: &Connection) -> String {
        connection
            .query_row("SELECT value FROM durable", [], |row| row.get(0))
            .expect("read durable value")
    }

    /// F12: the legacy candidates are PBKDF2 over public machine identifiers,
    /// so any local process can recompute them offline. Proving one opens the
    /// main database must retire it, not persist it.
    #[test]
    fn proven_legacy_key_is_retired_and_stops_opening_the_database() {
        let temp_dir = tempfile::tempdir().expect("temp directory");
        let db_path = temp_dir.path().join("legacy.db");
        let path = db_path.to_string_lossy().to_string();
        let wrong_key = [0x11u8; DATABASE_KEY_BYTES];
        let legacy_key = [0x83u8; DATABASE_KEY_BYTES];
        let store = MemoryKeyStore::default();

        seed_database(&path, &legacy_key, "legacy");

        let opened = open_main_database(&db_path, &store, &[wrong_key, legacy_key])
            .expect("retire the proven legacy key");
        assert_eq!(opened.key_origin, DatabaseKeyOrigin::RekeyedLegacy);
        assert_eq!(durable_value(&opened.connection), "legacy");
        drop(opened);

        let stored = store
            .load()
            .expect("load stored key")
            .expect("a replacement key was persisted");
        assert_ne!(stored, legacy_key, "the legacy key must never be stored");
        assert_ne!(stored, wrong_key);

        assert!(
            matches!(
                inspect_database_format(&db_path, &legacy_key),
                Err(DatabaseOpenError::EncryptedOrCorrupt { .. })
            ),
            "the recomputable legacy key must no longer open the database"
        );
        assert!(
            !std::fs::read_dir(temp_dir.path())
                .expect("read temp dir")
                .filter_map(Result::ok)
                .any(|entry| entry.file_name().to_string_lossy().contains(".bak")),
            "the pre-rekey copy stays readable under the legacy key and must be gone"
        );

        let reopened = open_main_database(&db_path, &store, &[wrong_key, legacy_key])
            .expect("reopen under the replacement key");
        assert_eq!(reopened.key_origin, DatabaseKeyOrigin::Stored);
        assert_eq!(durable_value(&reopened.connection), "legacy");
        assert_eq!(
            *store.writes.lock().expect("write count"),
            1,
            "retiring the legacy key must be one-shot"
        );
    }

    /// F12's exploit verbatim: recompute the shipped derivation from public
    /// machine identifiers and open the main database with it. After startup
    /// no candidate on that list may open the file any more.
    #[test]
    fn a_real_machine_key_candidate_no_longer_opens_the_main_database() {
        let candidates = machine_key::legacy_database_key_candidates();
        let attacker_key = *candidates
            .first()
            .expect("a legacy candidate always exists");
        let temp_dir = tempfile::tempdir().expect("temp directory");
        let db_path = temp_dir.path().join("agiworkforce.db");
        let path = db_path.to_string_lossy().to_string();
        let store = MemoryKeyStore::default();

        seed_database(&path, &attacker_key, "chat-history");
        assert!(
            matches!(
                inspect_database_format(&db_path, &attacker_key),
                Ok(DatabaseFormat::Keyed)
            ),
            "the recomputed key must open the shipped database before startup"
        );

        let opened =
            open_main_database(&db_path, &store, &candidates).expect("startup opens the database");
        assert_eq!(durable_value(&opened.connection), "chat-history");
        drop(opened);

        let stored = store.load().expect("load").expect("a key was persisted");
        assert!(
            !candidates.contains(&stored),
            "a recomputable machine-only key must never be persisted"
        );
        for candidate in &candidates {
            assert!(
                matches!(
                    inspect_database_format(&db_path, candidate),
                    Err(DatabaseOpenError::EncryptedOrCorrupt { .. })
                ),
                "a recomputable machine-only key must no longer open the database"
            );
        }
        assert!(
            !machine_key::machine_only_payloads().contains(&format!("sqlcipher:{path}")),
            "a retired database must stop reporting itself as machine-only"
        );
    }

    /// An earlier build persisted the proven legacy key into secure storage.
    /// A stored key is therefore not evidence the database is protected.
    #[test]
    fn a_stored_legacy_candidate_is_retired_on_the_next_launch() {
        let temp_dir = tempfile::tempdir().expect("temp directory");
        let db_path = temp_dir.path().join("adopted.db");
        let path = db_path.to_string_lossy().to_string();
        let legacy_key = [0x4du8; DATABASE_KEY_BYTES];
        let store = MemoryKeyStore::default();
        store.store(&legacy_key).expect("seed adopted key");

        seed_database(&path, &legacy_key, "adopted");

        let opened = open_main_database(&db_path, &store, &[legacy_key])
            .expect("retire the stored legacy key");
        assert_eq!(opened.key_origin, DatabaseKeyOrigin::RekeyedLegacy);
        assert_eq!(durable_value(&opened.connection), "adopted");
        drop(opened);

        assert_ne!(store.load().expect("load key"), Some(legacy_key));
        assert!(matches!(
            inspect_database_format(&db_path, &legacy_key),
            Err(DatabaseOpenError::EncryptedOrCorrupt { .. })
        ));
    }

    /// The replacement key is persisted first, so a store that cannot hold it
    /// must leave the database exactly as it was rather than rekey blind.
    #[test]
    fn a_failed_key_replacement_leaves_the_legacy_database_intact() {
        let temp_dir = tempfile::tempdir().expect("temp directory");
        let db_path = temp_dir.path().join("legacy.db");
        let path = db_path.to_string_lossy().to_string();
        let legacy_key = [0x57u8; DATABASE_KEY_BYTES];
        let store = MemoryKeyStore {
            fail_writes: true,
            ..MemoryKeyStore::default()
        };

        seed_database(&path, &legacy_key, "legacy");
        let before = std::fs::read(&db_path).expect("snapshot legacy database");

        let error = open_main_database(&db_path, &store, &[legacy_key])
            .err()
            .expect("an unpersistable replacement key must fail closed");
        assert!(matches!(error, DatabaseKeyError::SecureStorage(_)));
        assert_eq!(
            std::fs::read(&db_path).expect("re-read legacy database"),
            before
        );
        assert!(matches!(
            inspect_database_format(&db_path, &legacy_key),
            Ok(DatabaseFormat::Keyed)
        ));
    }

    #[test]
    fn unproven_legacy_keys_never_rewrite_database_or_secure_storage() {
        let temp_dir = tempfile::tempdir().expect("temp directory");
        let db_path = temp_dir.path().join("legacy.db");
        let path = db_path.to_string_lossy().to_string();
        let actual_key = [0x29u8; DATABASE_KEY_BYTES];
        let store = MemoryKeyStore::default();

        {
            let connection =
                open_encrypted_connection(&path, &actual_key).expect("create encrypted database");
            connection
                .execute_batch("CREATE TABLE durable (value TEXT NOT NULL);")
                .expect("seed encrypted database");
        }
        let before = std::fs::read(&db_path).expect("snapshot encrypted database");

        let error = open_main_database(&db_path, &store, &[[0x61u8; DATABASE_KEY_BYTES]])
            .err()
            .expect("an unproven key must fail closed");
        assert!(matches!(
            error,
            DatabaseKeyError::Database(DatabaseOpenError::EncryptedOrCorrupt { .. })
        ));
        assert_eq!(store.load().expect("load key"), None);
        assert_eq!(*store.writes.lock().expect("write count"), 0);
        assert_eq!(
            std::fs::read(&db_path).expect("re-read encrypted database"),
            before
        );
    }

    #[test]
    fn secure_store_failure_does_not_create_a_new_database() {
        let temp_dir = tempfile::tempdir().expect("temp directory");
        let db_path = temp_dir.path().join("main.db");
        let store = MemoryKeyStore {
            fail_writes: true,
            ..MemoryKeyStore::default()
        };

        let error = open_main_database(&db_path, &store, &[])
            .err()
            .expect("secure storage failure must fail closed");
        assert!(matches!(error, DatabaseKeyError::SecureStorage(_)));
        assert!(
            !db_path.exists(),
            "database must not be created with an unpersisted key"
        );
    }

    #[test]
    fn bundle_identifier_namespaces_isolate_production_and_wdio_keys() {
        let production = OsDatabaseKeyStore::for_bundle_identifier("com.agiworkforce.desktop")
            .expect("production bundle identifier");
        let wdio = OsDatabaseKeyStore::for_bundle_identifier("com.agiworkforce.desktop.wdio")
            .expect("WDIO bundle identifier");

        assert_eq!(production.service, "com.agiworkforce.desktop");
        assert_eq!(wdio.service, "com.agiworkforce.desktop.wdio");
        assert_ne!(production.service, wdio.service);
        assert_eq!(DATABASE_KEYRING_ACCOUNT, "sqlcipher-main-database-key-v1");
    }

    #[test]
    fn invalid_bundle_identifiers_never_reach_the_keyring() {
        for identifier in [
            "",
            "desktop",
            "com..desktop",
            "com.agi workforce.desktop",
            "com.agiworkforce.desktop/",
            ".com.agiworkforce.desktop",
            "com.agiworkforce.desktop.",
            "com.agiworkforce.-desktop",
        ] {
            assert!(
                matches!(
                    OsDatabaseKeyStore::for_bundle_identifier(identifier),
                    Err(DatabaseKeyError::InvalidBundleIdentifier)
                ),
                "identifier should be rejected: {identifier:?}"
            );
        }
    }
}
