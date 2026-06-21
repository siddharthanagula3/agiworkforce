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
//! let key = machine_key::derive_key(KeyPurpose::DatabaseEncryption);
//! let conn = encryption::open_encrypted_connection("/path/to/db", &key)?;
//! ```

use rusqlite::Connection;

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

/// Attempt to migrate an unencrypted database to an encrypted one.
///
/// This function checks whether the database at `db_path` is currently
/// readable without encryption. If so, it uses the SQLCipher
/// `sqlcipher_export()` function to create an encrypted copy, replaces
/// the original file, and then deletes the plaintext backup. If the backup
/// cannot be deleted a warning is logged but the migration still succeeds.
///
/// If the database is already encrypted (i.e., cannot be read without a key),
/// this function returns `Ok(())` without making changes.
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

    // Step 7: [M25] Delete the plaintext backup to avoid leaving sensitive data on disk.
    // Log a warning if deletion fails (e.g., read-only fs) but do not fail the migration —
    // the encrypted database is already in place and the migration succeeded.
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
/// 1. Derives the per-machine `DatabaseEncryption` key.
/// 2. If a file already exists at `path`, transparently migrates a legacy
///    plaintext database to SQLCipher (no-op if already encrypted). A migration
///    error is logged but does not abort the open — the subsequent
///    `open_encrypted_connection` will surface a hard error if the database is
///    genuinely unreadable with the key.
/// 3. Opens the connection with the encryption key applied.
///
/// The key is derived on each call; callers that open connections on hot paths
/// should hold a long-lived connection rather than reopening per operation.
///
/// # Arguments
/// * `path` - Filesystem path to the SQLite database file
///
/// # Errors
/// Returns an error string if the connection cannot be opened or the encryption
/// key cannot be applied/verified.
pub fn open_keyed_connection(path: impl AsRef<std::path::Path>) -> Result<Connection, String> {
    use crate::sys::security::{derive_key, KeyPurpose};

    // Accept &str / &Path / PathBuf uniformly; the lower-level helpers take &str.
    let path_ref = path.as_ref();
    let path_str = path_ref.to_string_lossy();

    let key = derive_key(KeyPurpose::DatabaseEncryption);

    // Transparently migrate any pre-existing plaintext database in place. This
    // is a one-time upgrade for databases created before encryption landed.
    if path_ref.exists() {
        if let Err(e) = migrate_to_encrypted(&path_str, &key) {
            tracing::warn!(
                "Auxiliary database encryption migration skipped or failed for '{}': {}. \
                 Attempting to open as-is.",
                path_str,
                e
            );
        }
    }

    open_encrypted_connection(&path_str, &key)
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

        // 2. Negative proof — only exercised when SQLCipher is compiled in.
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
}
