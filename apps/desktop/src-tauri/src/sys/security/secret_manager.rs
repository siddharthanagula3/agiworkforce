//! Application secrets stored in SQLite, encrypted under a key derived from
//! the per-install secret the OS credential service holds. Rows written by
//! older builds are re-wrapped on first read, and no secret is logged or
//! exposed in an error message.

use super::encryption::{decrypt_secret_with_key, encrypt_secret, EncryptedSecret};
use super::machine_key::{self, KeyPurpose};
use rusqlite::Connection;
use std::sync::{Arc, Mutex};

/// Error types for secret management operations
#[derive(Debug, thiserror::Error)]
pub enum SecretError {
    #[error("Failed to store secret in database")]
    DatabaseStoreError(#[source] rusqlite::Error),

    #[error("Failed to retrieve secret from database")]
    DatabaseRetrieveError(#[source] rusqlite::Error),

    #[error("Secret not found in any storage")]
    SecretNotFound,

    #[error("Encryption/decryption failed: {0}")]
    EncryptionError(String),
}

/// Manages cryptographic secrets with secure storage
pub struct SecretManager {
    db_conn: Arc<Mutex<Connection>>,
}

impl SecretManager {
    /// Create a new SecretManager with database connection
    pub fn new(db_conn: Arc<Mutex<Connection>>) -> Self {
        Self { db_conn }
    }

    /// Store secret in database with AES-256-GCM encryption
    fn store_secret_in_database(&self, key: &str, secret: &str) -> Result<(), SecretError> {
        let encryption_key = self.get_db_encryption_key()?;
        let encrypted_json = Self::wrap_secret(&encryption_key, secret)?;

        let conn = self.db_conn.lock().map_err(|_| {
            SecretError::EncryptionError("Database lock corrupted, mutex poisoned".into())
        })?;

        conn.execute(
            "INSERT OR REPLACE INTO settings (key, value, encrypted) VALUES (?1, ?2, 1)",
            rusqlite::params![key, encrypted_json],
        )
        .map_err(SecretError::DatabaseStoreError)?;

        machine_key::clear_machine_only_payload(&Self::payload_label(key));
        Ok(())
    }

    fn wrap_secret(encryption_key: &[u8], secret: &str) -> Result<String, SecretError> {
        let encrypted =
            encrypt_secret(encryption_key, secret).map_err(SecretError::EncryptionError)?;
        serde_json::to_string(&encrypted)
            .map_err(|e| SecretError::EncryptionError(format!("Failed to serialize: {}", e)))
    }

    fn payload_label(key: &str) -> String {
        format!("settings:{key}")
    }

    /// Store an arbitrary application secret in encrypted storage.
    pub fn set_secret(&self, key: &str, secret: &str) -> Result<(), SecretError> {
        self.store_secret_in_database(key, secret)
    }

    /// Retrieve and decrypt secret from database
    fn get_secret_from_database(&self, key: &str) -> Result<String, SecretError> {
        let conn = self.db_conn.lock().map_err(|_| {
            SecretError::EncryptionError("Database lock corrupted, mutex poisoned".into())
        })?;

        let encrypted_json: String = conn
            .query_row(
                "SELECT value FROM settings WHERE key = ?1 AND encrypted = 1",
                rusqlite::params![key],
                |row| row.get(0),
            )
            .map_err(SecretError::DatabaseRetrieveError)?;

        if encrypted_json.is_empty() {
            return Err(SecretError::SecretNotFound);
        }

        // Drop the lock before deriving the key or re-wrapping the row.
        drop(conn);

        let encrypted: EncryptedSecret = serde_json::from_str(&encrypted_json)
            .map_err(|e| SecretError::EncryptionError(format!("Failed to deserialize: {}", e)))?;

        let label = Self::payload_label(key);
        let opened = machine_key::open_with_key_rotation(
            KeyPurpose::DatabaseEncryption,
            &label,
            |candidate| decrypt_secret_with_key(candidate, &encrypted).ok(),
        )
        .map_err(|error| SecretError::EncryptionError(error.to_string()))?
        .ok_or_else(|| {
            SecretError::EncryptionError("Stored secret could not be decrypted".to_string())
        })?;

        if opened.rewrap_required {
            self.rewrap_secret(key, &opened.value);
        }

        Ok(opened.value)
    }

    /// Replace a row an older build wrapped under the machine-only key.
    ///
    /// A failed re-wrap must not lose the secret: the legacy row stays readable
    /// and stays reported by `machine_key::has_machine_only_secrets`, so the
    /// next read retries.
    fn rewrap_secret(&self, key: &str, secret: &str) {
        match self.store_secret_in_database(key, secret) {
            Ok(()) => tracing::info!("Re-wrapped '{key}' under the per-install encryption key"),
            Err(error) => tracing::warn!(
                "Could not re-wrap '{key}' under the per-install encryption key: {error}"
            ),
        }
    }

    /// Retrieve an application secret from encrypted storage.
    pub fn get_secret(&self, key: &str) -> Result<String, SecretError> {
        self.get_secret_from_database(key)
    }

    /// Check whether an encrypted secret exists for the provided key.
    pub fn has_secret(&self, key: &str) -> Result<bool, SecretError> {
        let conn = self.db_conn.lock().map_err(|_| {
            SecretError::EncryptionError("Database lock corrupted, mutex poisoned".into())
        })?;

        let exists: i64 = conn
            .query_row(
                "SELECT EXISTS(SELECT 1 FROM settings WHERE key = ?1 AND encrypted = 1)",
                rusqlite::params![key],
                |row| row.get(0),
            )
            .map_err(SecretError::DatabaseRetrieveError)?;

        Ok(exists == 1)
    }

    /// Get the database encryption key derived from the per-install secret.
    ///
    /// F12: fails closed. Without the secret held by the OS credential service
    /// there is no key another local process could not recompute, so no secret
    /// is written at all.
    fn get_db_encryption_key(&self) -> Result<Vec<u8>, SecretError> {
        machine_key::try_derive_key(KeyPurpose::DatabaseEncryption)
            .map_err(|error| SecretError::EncryptionError(error.to_string()))
    }

    /// Delete a stored secret by key.
    pub fn delete_secret(&self, key: &str) -> Result<(), SecretError> {
        let conn = self.db_conn.lock().map_err(|_| {
            SecretError::EncryptionError("Database lock corrupted, mutex poisoned".into())
        })?;

        conn.execute(
            "DELETE FROM settings WHERE key = ?1",
            rusqlite::params![key],
        )
        .map_err(SecretError::DatabaseStoreError)?;

        Ok(())
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use rusqlite::Connection;

    fn create_test_manager() -> SecretManager {
        let conn = Connection::open_in_memory().unwrap();

        // Create settings table
        conn.execute(
            "CREATE TABLE IF NOT EXISTS settings (
                key TEXT PRIMARY KEY,
                value TEXT NOT NULL,
                encrypted INTEGER NOT NULL DEFAULT 0
            )",
            [],
        )
        .unwrap();

        SecretManager::new(Arc::new(Mutex::new(conn)))
    }

    #[test]
    fn test_database_storage() {
        let manager = create_test_manager();
        let secret = "test_secret_12345".to_string();

        manager
            .store_secret_in_database("test_key", &secret)
            .unwrap();
        let retrieved = manager.get_secret_from_database("test_key").unwrap();

        assert_eq!(secret, retrieved);
    }

    /// F12: a row an older build wrapped under the machine-only key stays
    /// readable and is re-wrapped under the per-install key on first read, so
    /// it stops being decryptable by any local process.
    #[test]
    fn legacy_machine_only_row_is_rewrapped_on_read() {
        use crate::sys::security::encryption::decrypt_secret_with_key;

        let manager = create_test_manager();
        let legacy_key = machine_key::legacy_machine_only_keys(KeyPurpose::DatabaseEncryption)
            .first()
            .copied()
            .expect("a legacy candidate always exists");
        let legacy_row =
            SecretManager::wrap_secret(&legacy_key, "legacy-api-key").expect("legacy wrap");

        manager
            .db_conn
            .lock()
            .expect("database lock")
            .execute(
                "INSERT OR REPLACE INTO settings (key, value, encrypted) VALUES (?1, ?2, 1)",
                rusqlite::params!["perplexity_api_key", legacy_row],
            )
            .expect("seed legacy row");

        assert_eq!(
            manager.get_secret("perplexity_api_key").expect("read"),
            "legacy-api-key"
        );

        let stored: String = manager
            .db_conn
            .lock()
            .expect("database lock")
            .query_row(
                "SELECT value FROM settings WHERE key = ?1",
                rusqlite::params!["perplexity_api_key"],
                |row| row.get(0),
            )
            .expect("read back row");
        let stored: EncryptedSecret = serde_json::from_str(&stored).expect("stored ciphertext");

        assert!(
            decrypt_secret_with_key(&legacy_key, &stored).is_err(),
            "the machine-only key must no longer open the stored secret"
        );
        let current =
            machine_key::try_derive_key(KeyPurpose::DatabaseEncryption).expect("install secret");
        assert_eq!(
            decrypt_secret_with_key(&current, &stored).expect("current key opens the row"),
            "legacy-api-key"
        );
    }

    #[test]
    fn test_generic_secret_lifecycle() {
        let manager = create_test_manager();

        assert!(!manager.has_secret("perplexity_api_key").unwrap());

        manager
            .set_secret("perplexity_api_key", "test-secret")
            .unwrap();
        assert!(manager.has_secret("perplexity_api_key").unwrap());

        manager.delete_secret("perplexity_api_key").unwrap();
        assert!(!manager.has_secret("perplexity_api_key").unwrap());
    }
}
