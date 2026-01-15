//! Secure secret management for JWT and other cryptographic keys
//!
//! This module provides a secure way to generate, store, and retrieve secrets
//! using machine-derived encryption keys and SQLite storage.
//!
//! # Security Features
//! - Cryptographically secure random secret generation
//! - Machine-derived encryption keys (no keyring permission prompts)
//! - Database storage with AES-256-GCM encryption
//! - Automatic secret rotation support
//! - No secrets logged or exposed in error messages

use super::encryption::{decrypt_secret, encrypt_secret, EncryptedSecret};
use super::machine_key::{self, KeyPurpose};
use base64::{engine::general_purpose, Engine as _};
use rand::RngCore;
use rusqlite::Connection;
use std::sync::{Arc, Mutex};
use tracing::{debug, error, info};

const JWT_SECRET_DB_KEY: &str = "jwt_secret";
const DB_ENCRYPTION_KEY_DB_KEY: &str = "db_encryption_key";
const SECRET_LENGTH: usize = 64; // 512 bits for JWT secret
const ENCRYPTION_KEY_LENGTH: usize = 32; // 256 bits for AES-256

/// Error types for secret management operations
#[derive(Debug, thiserror::Error)]
pub enum SecretError {
    #[error("Failed to generate secret")]
    GenerationError,

    #[error("Failed to store secret in database")]
    DatabaseStoreError(#[source] rusqlite::Error),

    #[error("Failed to retrieve secret from database")]
    DatabaseRetrieveError(#[source] rusqlite::Error),

    #[error("Secret not found in any storage")]
    SecretNotFound,

    #[error("Invalid secret format")]
    InvalidSecretFormat,

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

    /// Get or create the JWT secret
    ///
    /// This method will:
    /// 1. Try to retrieve from database (encrypted)
    /// 2. If not found, generate new secret and store it
    ///
    /// # Security Notes
    /// - Secret is never logged
    /// - Errors are sanitized to prevent secret leakage
    pub fn get_or_create_jwt_secret(&self) -> Result<String, SecretError> {
        debug!("Attempting to retrieve JWT secret");

        // Try database
        match self.get_secret_from_database(JWT_SECRET_DB_KEY) {
            Ok(secret) => {
                info!("JWT secret retrieved from database");
                return Ok(secret);
            }
            Err(e) => {
                debug!("No JWT secret found in database: {}", sanitize_error(&e));
            }
        }

        // Generate new secret if not found
        info!("Generating new JWT secret");
        let secret = self.generate_secret()?;

        // Store in database
        if let Err(e) = self.store_secret_in_database(JWT_SECRET_DB_KEY, &secret) {
            error!("Failed to store JWT secret in database: {}", sanitize_error(&e));
            return Err(e);
        }

        info!("JWT secret stored in database");
        Ok(secret)
    }

    /// Rotate the JWT secret (generate and store a new one)
    ///
    /// # Warning
    /// This will invalidate all existing JWT tokens. Only call this if you
    /// want to force all users to re-authenticate.
    pub fn rotate_jwt_secret(&self) -> Result<String, SecretError> {
        info!("Rotating JWT secret - all existing tokens will be invalidated");

        let new_secret = self.generate_secret()?;

        if let Err(e) = self.store_secret_in_database(JWT_SECRET_DB_KEY, &new_secret) {
            error!("Failed to store rotated secret in database: {}", sanitize_error(&e));
            return Err(e);
        }

        info!("JWT secret rotation completed successfully");
        Ok(new_secret)
    }

    /// Generate a cryptographically secure random secret
    fn generate_secret(&self) -> Result<String, SecretError> {
        let mut secret_bytes = vec![0u8; SECRET_LENGTH];
        rand::thread_rng()
            .try_fill_bytes(&mut secret_bytes)
            .map_err(|_| SecretError::GenerationError)?;

        // Use base64 URL-safe encoding without padding
        Ok(general_purpose::URL_SAFE_NO_PAD.encode(secret_bytes))
    }

    /// Store secret in database with AES-256-GCM encryption
    fn store_secret_in_database(&self, key: &str, secret: &str) -> Result<(), SecretError> {
        // Get encryption key from machine-derived keys
        let encryption_key = self.get_db_encryption_key();

        // Encrypt the secret
        let encrypted =
            encrypt_secret(&encryption_key, secret).map_err(SecretError::EncryptionError)?;

        // Serialize the encrypted secret to JSON
        let encrypted_json = serde_json::to_string(&encrypted)
            .map_err(|e| SecretError::EncryptionError(format!("Failed to serialize: {}", e)))?;

        let conn = self.db_conn.lock().unwrap_or_else(|e| e.into_inner());

        conn.execute(
            "INSERT OR REPLACE INTO settings (key, value, encrypted) VALUES (?1, ?2, 1)",
            rusqlite::params![key, encrypted_json],
        )
        .map_err(SecretError::DatabaseStoreError)?;

        Ok(())
    }

    /// Retrieve and decrypt secret from database
    fn get_secret_from_database(&self, key: &str) -> Result<String, SecretError> {
        let conn = self.db_conn.lock().unwrap_or_else(|e| e.into_inner());

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

        // Drop the lock before getting the encryption key
        drop(conn);

        // Get the database encryption key
        let encryption_key = self.get_db_encryption_key();

        // Deserialize the encrypted secret from JSON
        let encrypted: EncryptedSecret = serde_json::from_str(&encrypted_json)
            .map_err(|e| SecretError::EncryptionError(format!("Failed to deserialize: {}", e)))?;

        // Decrypt the secret
        decrypt_secret(&encryption_key, &encrypted).map_err(SecretError::EncryptionError)
    }

    /// Get the database encryption key derived from machine identifiers
    fn get_db_encryption_key(&self) -> Vec<u8> {
        machine_key::derive_key(KeyPurpose::DatabaseEncryption)
    }

    /// Get or create a secondary encryption key (stored encrypted in database)
    /// This is used for additional layered encryption if needed
    pub fn get_or_create_secondary_key(&self) -> Result<Vec<u8>, SecretError> {
        // Try to get existing key
        if let Ok(key_b64) = self.get_secret_from_database(DB_ENCRYPTION_KEY_DB_KEY) {
            return general_purpose::STANDARD
                .decode(&key_b64)
                .map_err(|e| SecretError::EncryptionError(format!("Invalid key format: {}", e)));
        }

        // Generate a new key
        let mut key_bytes = vec![0u8; ENCRYPTION_KEY_LENGTH];
        rand::thread_rng()
            .try_fill_bytes(&mut key_bytes)
            .map_err(|_| SecretError::GenerationError)?;

        // Store it in database (encrypted with machine-derived key)
        let key_base64 = general_purpose::STANDARD.encode(&key_bytes);
        self.store_secret_in_database(DB_ENCRYPTION_KEY_DB_KEY, &key_base64)?;

        info!("Generated new secondary encryption key");
        Ok(key_bytes)
    }

    /// Delete secret from database
    ///
    /// # Warning
    /// This is a destructive operation. Only use for testing or when
    /// you need to completely reset the application's security state.
    #[cfg(test)]
    pub fn delete_jwt_secret(&self) -> Result<(), SecretError> {
        let conn = self.db_conn.lock().unwrap();
        let _ = conn.execute(
            "DELETE FROM settings WHERE key = ?1",
            rusqlite::params![JWT_SECRET_DB_KEY],
        );

        Ok(())
    }
}

/// Sanitize error messages to prevent secret leakage
fn sanitize_error(error: &SecretError) -> String {
    match error {
        SecretError::DatabaseRetrieveError(_) => "Database access error".to_string(),
        SecretError::DatabaseStoreError(_) => "Database storage error".to_string(),
        _ => error.to_string(),
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
    fn test_generate_secret() {
        let manager = create_test_manager();
        let secret = manager.generate_secret().unwrap();

        // Check length (base64 encoded 64 bytes is roughly 86 characters)
        assert!(secret.len() > 80);

        // Check it's valid base64
        assert!(general_purpose::URL_SAFE_NO_PAD.decode(&secret).is_ok());
    }

    #[test]
    fn test_secret_uniqueness() {
        let manager = create_test_manager();
        let secret1 = manager.generate_secret().unwrap();
        let secret2 = manager.generate_secret().unwrap();

        // Each generated secret should be unique
        assert_ne!(secret1, secret2);
    }

    #[test]
    fn test_database_storage() {
        let manager = create_test_manager();
        let secret = "test_secret_12345".to_string();

        manager.store_secret_in_database("test_key", &secret).unwrap();
        let retrieved = manager.get_secret_from_database("test_key").unwrap();

        assert_eq!(secret, retrieved);
    }

    #[test]
    fn test_get_or_create_jwt_secret() {
        let manager = create_test_manager();

        // Ensure clean state
        let _ = manager.delete_jwt_secret();

        // First call should create a new secret
        let secret1 = manager.get_or_create_jwt_secret().unwrap();
        assert!(!secret1.is_empty());

        // Second call should return the same secret
        let secret2 = manager.get_or_create_jwt_secret().unwrap();
        assert_eq!(secret1, secret2);
    }

    #[test]
    fn test_rotate_jwt_secret() {
        let manager = create_test_manager();

        // Create initial secret
        let secret1 = manager.get_or_create_jwt_secret().unwrap();

        // Rotate to new secret
        let secret2 = manager.rotate_jwt_secret().unwrap();

        // Should be different
        assert_ne!(secret1, secret2);

        // Subsequent retrieval should get the new secret
        let secret3 = manager.get_or_create_jwt_secret().unwrap();
        assert_eq!(secret2, secret3);
    }

    #[test]
    fn test_delete_jwt_secret() {
        let manager = create_test_manager();

        // Create a secret
        let _secret = manager.get_or_create_jwt_secret().unwrap();

        // Delete it
        manager.delete_jwt_secret().unwrap();

        // Next call should create a new secret
        let new_secret = manager.get_or_create_jwt_secret().unwrap();
        assert!(!new_secret.is_empty());
    }

    #[test]
    fn test_secondary_key() {
        let manager = create_test_manager();

        // Get or create secondary key
        let key1 = manager.get_or_create_secondary_key().unwrap();
        assert_eq!(key1.len(), 32); // AES-256 key

        // Should return the same key on second call
        let key2 = manager.get_or_create_secondary_key().unwrap();
        assert_eq!(key1, key2);
    }
}
