//! SQLCipher database encryption helpers.
//!
//! This module provides functions to open encrypted database connections using
//! SQLCipher. When compiled with the `bundled-sqlcipher` feature (via the
//! `rusqlite` crate), the PRAGMA key command enables transparent encryption.
//! When compiled with the plain `bundled` feature (e.g., in tests), the PRAGMA
//! is silently ignored by standard SQLite.
//!
//! # Usage
//!
//! ```rust,ignore
//! use crate::data::db::encryption;
//! use crate::sys::security::machine_key::{self, KeyPurpose};
//!
//! let key = machine_key::try_derive_key(KeyPurpose::DatabaseEncryption)?;
//! let conn = encryption::open_encrypted_connection("/path/to/db", &key)?;
//! ```

use rusqlite::{Connection, OpenFlags};
use std::path::Path;
use std::sync::Mutex;

/// Serializes the rekey of every auxiliary database.
///
/// Two threads opening the same store on first launch would otherwise back up,
/// rekey, and restore the same file group concurrently and corrupt it. Rekeys
/// happen once per file, so one lock for all of them costs nothing.
static REKEY_LOCK: Mutex<()> = Mutex::new(());

/// The formats that can be proven without writing to the database file.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum DatabaseFormat {
    /// The path does not exist yet, or is a zero-byte SQLite placeholder.
    New,
    /// The database schema is readable with the supplied SQLCipher key.
    Keyed,
    /// The schema is readable without a key and is therefore legacy plaintext.
    Plaintext,
}

/// Source-backed failures from database format inspection/opening.
///
/// SQLCipher intentionally reports the same error for an incorrect key and
/// invalid ciphertext. Once both a keyed read and a plaintext read fail, those
/// cases cannot be distinguished safely. The error therefore keeps both source
/// messages and never guesses that migration is appropriate.
#[derive(Debug, thiserror::Error)]
pub enum DatabaseOpenError {
    #[error("failed to inspect the database file: {source}")]
    Inspection {
        #[source]
        source: std::io::Error,
    },
    #[error(
        "encrypted database key did not match or the file is corrupt; no data was changed \
         (keyed read: {keyed_read}; plaintext read: {plaintext_read})"
    )]
    EncryptedOrCorrupt {
        keyed_read: String,
        plaintext_read: String,
    },
    #[error("failed to open a new encrypted database: {0}")]
    NewDatabase(String),
    #[error("failed to reopen the proven encrypted database: {0}")]
    KeyedDatabase(String),
    #[error("proven plaintext database migration failed without replacing the source: {0}")]
    PlaintextMigration(String),
    #[error("plaintext migration succeeded but the encrypted database could not be reopened: {0}")]
    MigratedDatabase(String),
}

/// Apply SQLCipher encryption PRAGMA to an opened connection.
///
/// Must be called immediately after `Connection::open()` and before any other
/// SQL statements. The encryption key is provided as raw bytes and converted
/// to a hex-encoded PRAGMA key.
///
/// When using SQLCipher (`bundled-sqlcipher` feature), this sets the encryption
/// key for transparent database encryption. When using plain SQLite (`bundled`
/// feature, e.g., in tests), the PRAGMA is silently ignored.
///
/// # Arguments
/// * `conn` - A freshly opened database connection (no prior SQL executed)
/// * `key` - The raw encryption key bytes (typically 32 bytes for AES-256)
///
/// # Errors
/// Returns an error string if the PRAGMA fails or the key verification fails
/// (which indicates a wrong key or that the database is not encrypted).
pub fn apply_encryption_key(conn: &Connection, key: &[u8]) -> Result<(), String> {
    if key.is_empty() {
        return Ok(()); // No encryption key provided, skip
    }

    let hex_key = hex::encode(key);

    // Set the encryption key -- must be the first operation after opening.
    // The x'...' syntax tells SQLCipher to interpret the value as raw hex bytes.
    // [M24] Error message is redacted to avoid leaking the hex key into rusqlite
    // error logs or tracing output in the event of a failure.
    conn.execute_batch(&format!("PRAGMA key = \"x'{}'\";", hex_key))
        .map_err(|_| {
            "Failed to set database encryption key (key redacted from logs)".to_string()
        })?;

    // Configure cipher page size for optimal security/performance balance
    conn.execute_batch("PRAGMA cipher_page_size = 4096;")
        .map_err(|e| format!("Failed to set cipher page size: {}", e))?;

    // Verify the key works by reading the database schema.
    // If the key is wrong or the database is unencrypted while we expect
    // encryption, this will fail with "file is not a database".
    conn.execute_batch("SELECT count(*) FROM sqlite_master;")
        .map_err(|e| {
            format!(
                "Database encryption key verification failed \
                 (wrong key or unencrypted database): {}",
                e
            )
        })?;

    Ok(())
}

/// Open a SQLite/SQLCipher connection with optional encryption.
///
/// This is the preferred way to open database connections throughout the app.
/// It combines `Connection::open` with `apply_encryption_key` in a single call.
///
/// # Arguments
/// * `path` - Filesystem path to the SQLite database file
/// * `key` - The raw encryption key bytes; pass an empty slice to skip encryption
///
/// # Errors
/// Returns an error string if the connection cannot be opened or the
/// encryption key cannot be applied.
pub fn open_encrypted_connection(path: &str, key: &[u8]) -> Result<Connection, String> {
    let conn = Connection::open(path)
        .map_err(|e| format!("Failed to open database at {}: {}", path, e))?;

    apply_encryption_key(&conn, key)?;

    Ok(conn)
}

fn open_read_only(path: &Path) -> Result<Connection, rusqlite::Error> {
    Connection::open_with_flags(
        path,
        OpenFlags::SQLITE_OPEN_READ_ONLY | OpenFlags::SQLITE_OPEN_NO_MUTEX,
    )
}

/// Inspect an existing database without creating files, journals, or migration
/// sidecars.
///
/// The keyed and plaintext checks both use read-only SQLite handles. A failed
/// keyed check followed by a successful plaintext check is the only evidence
/// that authorizes automatic plaintext migration.
pub fn inspect_database_format(
    path: impl AsRef<Path>,
    key: &[u8],
) -> Result<DatabaseFormat, DatabaseOpenError> {
    let path = path.as_ref();
    if !path.exists() {
        return Ok(DatabaseFormat::New);
    }

    let metadata =
        std::fs::metadata(path).map_err(|source| DatabaseOpenError::Inspection { source })?;
    if metadata.len() == 0 {
        return Ok(DatabaseFormat::New);
    }

    let keyed_read = match open_read_only(path) {
        Ok(conn) => match apply_encryption_key(&conn, key) {
            Ok(()) => return Ok(DatabaseFormat::Keyed),
            Err(error) => error,
        },
        Err(error) => format!("failed to open read-only handle: {error}"),
    };

    let plaintext_read = match open_read_only(path) {
        Ok(conn) => match conn.execute_batch("SELECT count(*) FROM sqlite_master;") {
            Ok(()) => return Ok(DatabaseFormat::Plaintext),
            Err(error) => error.to_string(),
        },
        Err(error) => format!("failed to open read-only handle: {error}"),
    };

    Err(DatabaseOpenError::EncryptedOrCorrupt {
        keyed_read,
        plaintext_read,
    })
}

/// Open an encrypted database, migrating a legacy plaintext file only after a
/// read-only plaintext schema probe proves that migration is appropriate.
///
/// Older startup code called [`migrate_to_encrypted`] before every open. For an
/// already-encrypted SQLCipher database that performs a deliberately failing
/// plaintext schema read on every launch. AGI owns several long-lived
/// connections, so repeating that probe made the Desktop window wait many
/// seconds before its webview could render.
///
/// Both probes are read-only, so evaluating a wrong key or a corrupt file never
/// creates journals, migration sidecars, or replacement files:
///
/// 1. new database -> create it with the supplied key;
/// 2. keyed database -> reopen it with the proven key;
/// 3. legacy plaintext database -> migrate once, then reopen with the key;
/// 4. corrupt/wrong-key database -> fail closed with both read errors.
pub fn open_or_migrate_encrypted_connection(
    path: &str,
    key: &[u8],
) -> Result<Connection, DatabaseOpenError> {
    match inspect_database_format(path, key)? {
        DatabaseFormat::New => {
            open_encrypted_connection(path, key).map_err(DatabaseOpenError::NewDatabase)
        }
        DatabaseFormat::Keyed => {
            open_encrypted_connection(path, key).map_err(DatabaseOpenError::KeyedDatabase)
        }
        DatabaseFormat::Plaintext => {
            migrate_to_encrypted(path, key).map_err(DatabaseOpenError::PlaintextMigration)?;
            open_encrypted_connection(path, key).map_err(DatabaseOpenError::MigratedDatabase)
        }
    }
}

/// Attempt to migrate an unencrypted database to an encrypted one.
///
/// This function checks whether the database at `db_path` is currently
/// readable without encryption. If so, it uses the SQLCipher
/// `sqlcipher_export()` function to create an encrypted copy, replaces
/// the original file, and then deletes the plaintext backup. If the backup
/// cannot be deleted a warning is logged but the migration still succeeds.
///
/// Callers must prove the source is plaintext with [`inspect_database_format`]
/// before invoking this function. Encrypted or corrupt files must never reach
/// this mutation path.
///
/// # Arguments
/// * `db_path` - Filesystem path to the database to migrate
/// * `key` - The raw encryption key bytes for the new encrypted database
///
/// # Errors
/// Returns an error string if the backup, export, or file replacement fails.
pub fn migrate_to_encrypted(db_path: &str, key: &[u8]) -> Result<(), String> {
    if key.is_empty() {
        return Ok(());
    }

    let backup_path = format!("{}.unencrypted.bak", db_path);
    let temp_encrypted_path = format!("{}.encrypting", db_path);

    // Step 1: Check if the database is currently readable without a key.
    // If it is, it is unencrypted and needs migration.
    let is_unencrypted = {
        let conn = Connection::open(db_path)
            .map_err(|e| format!("Cannot open DB for migration check: {}", e))?;
        // Try a query -- if the DB is encrypted, this will fail with
        // "file is not a database" because we did not provide a key.
        conn.execute_batch("SELECT count(*) FROM sqlite_master;")
            .is_ok()
    };

    if !is_unencrypted {
        tracing::info!("Database appears to already be encrypted or empty, skipping migration");
        return Ok(());
    }

    tracing::info!("Migrating unencrypted database to SQLCipher...");

    // Step 2: Create a backup of the original unencrypted file
    std::fs::copy(db_path, &backup_path).map_err(|e| format!("Failed to create backup: {}", e))?;

    // Steps 3-5 are wrapped in a block so the source connection is dropped
    // before Step 6's file rename. On Windows, the rename would fail if the
    // source file is still locked by an open connection.
    {
        // Step 3: Open the unencrypted source database
        let source =
            Connection::open(db_path).map_err(|e| format!("Failed to open source DB: {}", e))?;

        // Step 4: Use ATTACH with KEY to create an encrypted copy via sqlcipher_export
        let hex_key = hex::encode(key);
        // Sanitize path for SQL: escape single quotes to prevent injection.
        // SQLite ATTACH doesn't support parameterized binding.
        let safe_path = temp_encrypted_path.replace('\'', "''");
        source
            .execute_batch(&format!(
                "ATTACH DATABASE '{}' AS encrypted KEY \"x'{}'\";",
                safe_path, hex_key
            ))
            .map_err(|e| format!("Failed to attach encrypted DB: {}", e))?;

        // Step 5: Export all data from the unencrypted source into the encrypted target
        source
            .execute_batch(
                "SELECT sqlcipher_export('encrypted');\
                 DETACH DATABASE encrypted;",
            )
            .map_err(|e| {
                // Cleanup the partial encrypted file on failure
                let _ = std::fs::remove_file(&temp_encrypted_path);
                format!("Failed to export data to encrypted DB: {}", e)
            })?;

        // `source` is dropped here, releasing the file lock
    }

    // Step 6: Replace the original with the encrypted version
    std::fs::rename(&temp_encrypted_path, db_path)
        .map_err(|e| format!("Failed to replace DB with encrypted version: {}", e))?;

    if let Err(e) = std::fs::remove_file(&backup_path) {
        tracing::warn!(
            "SQLCipher migration succeeded but failed to delete plaintext backup at '{}': {}. \
             Delete it manually to avoid leaving unencrypted data on disk.",
            backup_path,
            e
        );
    } else {
        tracing::info!("Plaintext backup deleted after successful encryption migration.");
    }

    tracing::info!("Database migration to SQLCipher complete.");

    Ok(())
}

/// Open a keyed (SQLCipher-encrypted) connection to an auxiliary database.
///
/// This is the one-call convenience used by every auxiliary SQLite database in
/// the app (checkpoints, project memory, knowledge bases, ontology, outcomes,
/// etc.) so they never open plaintext. It mirrors the main-DB bootstrap in
/// `lib.rs`:
///
/// 1. Derives the per-install `DatabaseEncryption` key.
/// 2. Opens the connection with the encryption key applied.
/// 3. Only if that keyed open fails for an existing file, attempts the legacy
///    plaintext-to-SQLCipher migration and retries the keyed open. Migration
///    and retry failures are returned together so callers fail closed.
///
/// The key is derived on each call; callers that open connections on hot paths
/// should hold a long-lived connection rather than reopening per operation.
///
/// # Arguments
/// * `path` - Filesystem path to the SQLite database file
///
/// # Errors
/// Returns an error string when no per-install key is available, when the
/// connection cannot be opened, or when the encryption key cannot be
/// applied/verified.
pub fn open_keyed_connection(path: impl AsRef<std::path::Path>) -> Result<Connection, String> {
    use crate::sys::security::machine_key::{self, KeyPurpose};

    // Accept &str / &Path / PathBuf uniformly; the lower-level helpers take &str.
    let path_ref = path.as_ref();
    let path_str = path_ref.to_string_lossy().to_string();

    // F5: fails closed. A key derived from machine identifiers alone is
    // reproducible by any unprivileged local process, so an auxiliary database
    // is never created or opened without the per-install secret.
    let key = machine_key::try_derive_key(KeyPurpose::DatabaseEncryption)
        .map_err(|error| format!("Encrypted database key unavailable: {error}"))?;

    let open_error = match open_or_migrate_encrypted_connection(&path_str, &key) {
        Ok(connection) => return Ok(connection),
        Err(error) => error,
    };

    let label = format!("sqlcipher:{path_str}");
    let _rekey_guard = REKEY_LOCK
        .lock()
        .unwrap_or_else(|poisoned| poisoned.into_inner());

    // Another thread may have finished rekeying this file while we waited.
    if matches!(
        inspect_database_format(path_ref, &key),
        Ok(DatabaseFormat::Keyed)
    ) {
        return open_encrypted_connection(&path_str, &key);
    }

    for legacy in machine_key::legacy_machine_only_keys(KeyPurpose::DatabaseEncryption) {
        if !matches!(
            inspect_database_format(path_ref, &legacy),
            Ok(DatabaseFormat::Keyed)
        ) {
            continue;
        }

        machine_key::record_machine_only_payload(&label);
        tracing::info!("Rekeying {path_str} from the legacy machine-derived key");
        rekey_encrypted_database(path_ref, &legacy, &key, &label)?;
        machine_key::clear_machine_only_payload(&label);

        return open_encrypted_connection(&path_str, &key);
    }

    Err(open_error.to_string())
}

fn database_file_group(path: &Path) -> Vec<std::path::PathBuf> {
    let mut files = vec![path.to_path_buf()];
    for suffix in ["-wal", "-shm"] {
        let mut sidecar = path.as_os_str().to_os_string();
        sidecar.push(suffix);
        files.push(std::path::PathBuf::from(sidecar));
    }
    files
}

fn back_up_database_group(
    path: &Path,
    suffix: &str,
) -> Result<Vec<(std::path::PathBuf, std::path::PathBuf)>, String> {
    let mut backups = Vec::new();
    for file in database_file_group(path) {
        if !file.exists() {
            continue;
        }
        let mut backup = file.as_os_str().to_os_string();
        backup.push(suffix);
        let backup = std::path::PathBuf::from(backup);
        std::fs::copy(&file, &backup).map_err(|error| {
            format!(
                "Failed to back up {} before rekeying: {error}",
                file.display()
            )
        })?;
        backups.push((file, backup));
    }
    Ok(backups)
}

fn restore_database_group(path: &Path, backups: &[(std::path::PathBuf, std::path::PathBuf)]) {
    // A partial rekey can leave journal sidecars the backup does not cover;
    // restoring the main file next to them would corrupt the database.
    for file in database_file_group(path) {
        if backups.iter().any(|(original, _)| original == &file) {
            continue;
        }
        let _ = std::fs::remove_file(&file);
    }

    for (file, backup) in backups {
        if let Err(error) = std::fs::rename(backup, file) {
            tracing::error!(
                "Failed to restore {} from {} after a failed rekey: {error}",
                file.display(),
                backup.display()
            );
        }
    }
}

/// Delete the pre-rekey copies.
///
/// A surviving backup is still readable under the publicly reproducible
/// machine-only key, so a file that cannot be removed is truncated first and
/// reported if even that fails.
fn discard_database_backups(backups: &[(std::path::PathBuf, std::path::PathBuf)], label: &str) {
    use crate::sys::security::machine_key;

    for (_, backup) in backups {
        if std::fs::remove_file(backup).is_ok() {
            continue;
        }

        let truncated = std::fs::write(backup, b"").is_ok();
        if std::fs::remove_file(backup).is_ok() {
            continue;
        }

        if truncated {
            tracing::warn!(
                "Rekey succeeded and the backup at {} was emptied, but it could not be deleted",
                backup.display()
            );
            continue;
        }

        machine_key::record_machine_only_payload(&format!("{label}.backup"));
        tracing::error!(
            "Rekey succeeded but the backup at {} could not be deleted or emptied; \
             it stays readable under the legacy machine-derived key until it is removed",
            backup.display()
        );
    }
}

/// Re-encrypt a database in place from `from_key` to `to_key`.
///
/// The whole file group is copied first and restored if anything fails, so a
/// database is never left half-rekeyed or keyed by a value no longer stored.
///
/// Both the auxiliary stores here and the main database's startup key adoption
/// in [`crate::data::db::key_management`] use this to retire a key an older
/// build derived from machine identifiers alone.
pub fn rekey_encrypted_database(
    path: &Path,
    from_key: &[u8],
    to_key: &[u8],
    label: &str,
) -> Result<(), String> {
    // A fixed backup name would let a second rekey of the same file overwrite
    // the copy the first one still needs to restore from.
    let suffix = format!(
        ".machine-key-{}-{}.bak",
        std::process::id(),
        std::time::SystemTime::now()
            .duration_since(std::time::UNIX_EPOCH)
            .map(|elapsed| elapsed.as_nanos())
            .unwrap_or_default()
    );
    let backups = back_up_database_group(path, &suffix)?;
    let path_str = path.to_string_lossy().to_string();

    let rekeyed = (|| -> Result<(), String> {
        {
            let connection = open_encrypted_connection(&path_str, from_key)?;
            // [M24] The key is redacted from the error so it cannot reach logs.
            connection
                .execute_batch(&format!("PRAGMA rekey = \"x'{}'\";", hex::encode(to_key)))
                .map_err(|_| {
                    "Failed to rekey the encrypted database (key redacted from logs)".to_string()
                })?;
        }

        match inspect_database_format(path, to_key) {
            Ok(DatabaseFormat::Keyed) => Ok(()),
            Ok(DatabaseFormat::Plaintext) => {
                Err("Rekey left the database readable without a key".to_string())
            }
            Ok(DatabaseFormat::New) => Err("Rekey emptied the database".to_string()),
            Err(error) => Err(error.to_string()),
        }
    })();

    match rekeyed {
        Ok(()) => {
            discard_database_backups(&backups, label);
            Ok(())
        }
        Err(error) => {
            restore_database_group(path, &backups);
            Err(format!("{error}; the database was restored unchanged"))
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    /// Proves `open_keyed_connection` produces a working, encrypted database:
    ///
    /// 1. Round-trip: a row written through the keyed connection is readable
    ///    through a freshly opened keyed connection to the same file. This holds
    ///    under both the plain `bundled` and `bundled-sqlcipher` builds.
    /// 2. Negative proof (only meaningful under SQLCipher): when the build
    ///    actually supports SQLCipher (`PRAGMA cipher_version` is non-empty), a
    ///    plain `rusqlite::Connection::open` without the key must NOT be able to
    ///    read the database. Under a plain `bundled` test build the PRAGMA key is
    ///    a no-op, so this negative assertion is correctly skipped.
    #[test]
    fn open_keyed_connection_yields_encrypted_db() {
        let tmp = std::env::temp_dir().join(format!(
            "agi_enc_test_{}_{}.db",
            std::process::id(),
            std::time::SystemTime::now()
                .duration_since(std::time::UNIX_EPOCH)
                .unwrap()
                .as_nanos()
        ));
        let path = tmp.to_string_lossy().to_string();
        // Ensure a clean slate.
        let _ = std::fs::remove_file(&path);

        // 1. Create + write through the keyed helper.
        let cipher_version = {
            let conn = open_keyed_connection(&path).expect("open keyed connection");
            conn.execute_batch(
                "CREATE TABLE secret (id INTEGER PRIMARY KEY, value TEXT NOT NULL);
                 INSERT INTO secret (id, value) VALUES (1, 'top-secret');",
            )
            .expect("create + insert");

            // Capture whether this build actually has SQLCipher available.
            conn.query_row("PRAGMA cipher_version;", [], |r| r.get::<_, String>(0))
                .unwrap_or_default()
        };

        // 1b. Round-trip through a second keyed connection (must always work).
        {
            let conn = open_keyed_connection(&path).expect("reopen keyed connection");
            let value: String = conn
                .query_row("SELECT value FROM secret WHERE id = 1;", [], |r| r.get(0))
                .expect("read back row through keyed connection");
            assert_eq!(value, "top-secret");
        }

        if !cipher_version.trim().is_empty() {
            let plain = Connection::open(&path).expect("plain open of file handle");
            let read_result = plain.query_row("SELECT value FROM secret WHERE id = 1;", [], |r| {
                r.get::<_, String>(0)
            });
            assert!(
                read_result.is_err(),
                "plaintext connection must NOT be able to read an encrypted database \
                 (cipher_version = {:?})",
                cipher_version
            );
        }

        let _ = std::fs::remove_file(&path);
    }

    #[test]
    fn open_or_migrate_preserves_legacy_plaintext_data_and_reopens_fast_path() {
        let tmp = std::env::temp_dir().join(format!(
            "agi_enc_migration_test_{}_{}.db",
            std::process::id(),
            std::time::SystemTime::now()
                .duration_since(std::time::UNIX_EPOCH)
                .unwrap()
                .as_nanos()
        ));
        let path = tmp.to_string_lossy().to_string();
        let key = [0x2Au8; 32];
        let _ = std::fs::remove_file(&path);

        {
            let plain = Connection::open(&path).expect("create legacy plaintext database");
            plain
                .execute_batch(
                    "CREATE TABLE legacy (id INTEGER PRIMARY KEY, value TEXT NOT NULL);
                     INSERT INTO legacy (id, value) VALUES (1, 'preserved');",
                )
                .expect("seed legacy plaintext database");
        }

        {
            let migrated = open_or_migrate_encrypted_connection(&path, &key)
                .expect("open or migrate legacy database");
            let value: String = migrated
                .query_row("SELECT value FROM legacy WHERE id = 1;", [], |row| {
                    row.get(0)
                })
                .expect("read preserved legacy row");
            assert_eq!(value, "preserved");
        }

        {
            let reopened = open_or_migrate_encrypted_connection(&path, &key)
                .expect("reopen already-keyed database without a plaintext probe");
            let value: String = reopened
                .query_row("SELECT value FROM legacy WHERE id = 1;", [], |row| {
                    row.get(0)
                })
                .expect("read row through keyed fast path");
            assert_eq!(value, "preserved");
        }

        let _ = std::fs::remove_file(&path);
        let _ = std::fs::remove_file(format!("{}.unencrypted.bak", path));
        let _ = std::fs::remove_file(format!("{}.encrypting", path));
    }

    #[test]
    fn wrong_key_is_not_reported_as_a_completed_legacy_migration_and_preserves_bytes() {
        let temp_dir = tempfile::tempdir().expect("temp directory");
        let db_path = temp_dir.path().join("encrypted.db");
        let path = db_path.to_string_lossy().to_string();
        let original_key = [0x31u8; 32];
        let wrong_key = [0x72u8; 32];

        {
            let conn =
                open_encrypted_connection(&path, &original_key).expect("create encrypted database");
            conn.execute_batch(
                "CREATE TABLE secret (id INTEGER PRIMARY KEY, value TEXT NOT NULL);
                 INSERT INTO secret (id, value) VALUES (1, 'preserve-me');",
            )
            .expect("seed encrypted database");
        }

        let before = std::fs::read(&db_path).expect("snapshot encrypted database");
        let error = open_or_migrate_encrypted_connection(&path, &wrong_key)
            .expect_err("a wrong key must fail closed")
            .to_string();

        assert!(
            error.contains("encrypted database key did not match or the file is corrupt"),
            "the error must preserve the honest, non-distinguishable classification: {error}"
        );
        assert!(
            !error.contains("migration completed"),
            "a wrong key must never be described as a completed migration: {error}"
        );
        assert_eq!(
            std::fs::read(&db_path).expect("re-read encrypted database"),
            before,
            "a wrong-key probe must not mutate database bytes"
        );
        assert!(!db_path.with_extension("db.unencrypted.bak").exists());
        assert!(!db_path.with_extension("db.encrypting").exists());
    }

    #[test]
    fn corrupt_file_is_not_reported_as_a_completed_legacy_migration_and_preserves_bytes() {
        let temp_dir = tempfile::tempdir().expect("temp directory");
        let db_path = temp_dir.path().join("corrupt.db");
        let path = db_path.to_string_lossy().to_string();
        let key = [0x55u8; 32];
        let corrupt_bytes = b"not sqlite and not valid sqlcipher ciphertext";
        std::fs::write(&db_path, corrupt_bytes).expect("seed corrupt file");

        let error = open_or_migrate_encrypted_connection(&path, &key)
            .expect_err("a corrupt database must fail closed")
            .to_string();

        assert!(
            error.contains("encrypted database key did not match or the file is corrupt"),
            "the error must avoid claiming corruption can be distinguished from a wrong key: {error}"
        );
        assert!(
            !error.contains("migration completed"),
            "corruption must never be described as a completed migration: {error}"
        );
        assert_eq!(
            std::fs::read(&db_path).expect("re-read corrupt database"),
            corrupt_bytes,
            "a corrupt-file probe must not mutate database bytes"
        );
        assert!(!db_path.with_extension("db.unencrypted.bak").exists());
        assert!(!db_path.with_extension("db.encrypting").exists());
    }

    #[test]
    fn proven_plaintext_is_the_only_existing_format_that_migrates() {
        let temp_dir = tempfile::tempdir().expect("temp directory");
        let db_path = temp_dir.path().join("plaintext.db");
        let path = db_path.to_string_lossy().to_string();
        let key = [0x44u8; 32];

        {
            let conn = Connection::open(&db_path).expect("create plaintext database");
            conn.execute_batch(
                "CREATE TABLE legacy (id INTEGER PRIMARY KEY, value TEXT NOT NULL);
                 INSERT INTO legacy (id, value) VALUES (1, 'preserved');",
            )
            .expect("seed plaintext database");
        }

        let plaintext_before = std::fs::read(&db_path).expect("snapshot plaintext database");
        let conn = open_or_migrate_encrypted_connection(&path, &key)
            .expect("proven plaintext database should migrate");
        let value: String = conn
            .query_row("SELECT value FROM legacy WHERE id = 1", [], |row| {
                row.get(0)
            })
            .expect("read migrated row");
        assert_eq!(value, "preserved");
        drop(conn);

        let encrypted_after = std::fs::read(&db_path).expect("read migrated database");
        assert_ne!(
            encrypted_after, plaintext_before,
            "a successful plaintext migration must replace the plaintext bytes"
        );
        assert!(
            !encrypted_after.starts_with(b"SQLite format 3\0"),
            "the migrated database must not retain a plaintext SQLite header"
        );
        assert!(!db_path.with_extension("db.unencrypted.bak").exists());
        assert!(!db_path.with_extension("db.encrypting").exists());
    }

    #[test]
    fn plaintext_format_probe_is_read_only_and_preserves_every_byte() {
        let temp_dir = tempfile::tempdir().expect("temp directory");
        let db_path = temp_dir.path().join("plaintext-probe.db");
        {
            let conn = Connection::open(&db_path).expect("create plaintext database");
            conn.execute_batch(
                "CREATE TABLE legacy (id INTEGER PRIMARY KEY, value TEXT NOT NULL);
                 INSERT INTO legacy (id, value) VALUES (1, 'unchanged');",
            )
            .expect("seed plaintext database");
        }
        let before = std::fs::read(&db_path).expect("snapshot plaintext database");

        assert_eq!(
            inspect_database_format(&db_path, &[0x19u8; 32]).expect("inspect plaintext"),
            DatabaseFormat::Plaintext
        );
        assert_eq!(
            std::fs::read(&db_path).expect("re-read plaintext database"),
            before
        );
        assert!(!db_path.with_extension("db-journal").exists());
        assert!(!db_path.with_extension("db-wal").exists());
        assert!(!db_path.with_extension("db-shm").exists());
        assert!(!db_path.with_extension("db.unencrypted.bak").exists());
        assert!(!db_path.with_extension("db.encrypting").exists());
    }

    /// F5: an auxiliary database keyed by an older build from machine
    /// identifiers alone must be rekeyed to the per-install key on the next
    /// open, and must stop opening under the publicly reproducible key.
    #[test]
    fn open_keyed_connection_rekeys_a_legacy_machine_keyed_database() {
        use crate::sys::security::machine_key::{self, KeyPurpose};

        let temp_dir = tempfile::tempdir().expect("temp directory");
        let db_path = temp_dir.path().join("legacy_machine_key.db");
        let path = db_path.to_string_lossy().to_string();

        let legacy_key = machine_key::legacy_machine_only_keys(KeyPurpose::DatabaseEncryption)
            .first()
            .copied()
            .expect("a legacy candidate always exists");
        let current_key: Vec<u8> = machine_key::try_derive_key(KeyPurpose::DatabaseEncryption)
            .expect("install secret available in tests");
        assert_ne!(legacy_key.as_slice(), current_key.as_slice());

        {
            let connection =
                open_encrypted_connection(&path, &legacy_key).expect("create legacy database");
            connection
                .execute_batch(
                    "CREATE TABLE memory (value TEXT NOT NULL);
                     INSERT INTO memory (value) VALUES ('legacy-note');",
                )
                .expect("seed legacy database");
        }

        let connection = open_keyed_connection(&db_path).expect("adopt and rekey legacy database");
        let value: String = connection
            .query_row("SELECT value FROM memory", [], |row| row.get(0))
            .expect("legacy row survives the rekey");
        assert_eq!(value, "legacy-note");
        drop(connection);

        assert_eq!(
            inspect_database_format(&db_path, &current_key).expect("inspect rekeyed database"),
            DatabaseFormat::Keyed
        );
        assert!(
            matches!(
                inspect_database_format(&db_path, &legacy_key),
                Err(DatabaseOpenError::EncryptedOrCorrupt { .. })
            ),
            "the machine-only key must no longer open the database"
        );
        assert!(!machine_key::machine_only_payloads().contains(&format!("sqlcipher:{path}")));
        let leftovers: Vec<String> = std::fs::read_dir(temp_dir.path())
            .expect("list the database directory")
            .filter_map(|entry| Some(entry.ok()?.file_name().to_string_lossy().to_string()))
            .filter(|name| name.contains(".machine-key"))
            .collect();
        assert!(
            leftovers.is_empty(),
            "a pre-rekey copy readable under the machine-only key survived: {leftovers:?}"
        );

        // Re-opening a database already under the per-install key must not
        // touch it again.
        let bytes_after_rekey = std::fs::read(&db_path).expect("snapshot rekeyed database");
        drop(open_keyed_connection(&db_path).expect("reopen rekeyed database"));
        assert_eq!(
            std::fs::read(&db_path).expect("re-read rekeyed database"),
            bytes_after_rekey
        );
    }
}
