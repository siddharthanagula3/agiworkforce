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
    conn.execute_batch(&format!("PRAGMA key = \"x'{}'\";", hex_key))
        .map_err(|e| format!("Failed to set database encryption key: {}", e))?;

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
/// `sqlcipher_export()` function to create an encrypted copy and replaces
/// the original file. A backup of the unencrypted database is preserved
/// with a `.unencrypted.bak` suffix.
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
        tracing::info!(
            "Database appears to already be encrypted or empty, skipping migration"
        );
        return Ok(());
    }

    tracing::info!("Migrating unencrypted database to SQLCipher...");

    // Step 2: Create a backup of the original unencrypted file
    std::fs::copy(db_path, &backup_path)
        .map_err(|e| format!("Failed to create backup: {}", e))?;

    // Step 3: Open the unencrypted source database
    let source = Connection::open(db_path)
        .map_err(|e| format!("Failed to open source DB: {}", e))?;

    // Step 4: Use ATTACH with KEY to create an encrypted copy via sqlcipher_export
    let hex_key = hex::encode(key);
    source
        .execute_batch(&format!(
            "ATTACH DATABASE '{}' AS encrypted KEY \"x'{}'\";",
            temp_encrypted_path, hex_key
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

    // Step 6: Replace the original with the encrypted version
    std::fs::rename(&temp_encrypted_path, db_path).map_err(|e| {
        format!("Failed to replace DB with encrypted version: {}", e)
    })?;

    tracing::info!(
        "Database migration to SQLCipher complete. Backup at: {}",
        backup_path
    );

    Ok(())
}
