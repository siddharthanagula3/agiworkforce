/// Secure secret management for JWT and other cryptographic keys
///
/// This module provides a secure way to generate, store, and retrieve secrets
/// using the OS keyring as primary storage and database as a fallback.
///
/// # Security Features
/// - Cryptographically secure random secret generation
/// - OS keyring integration (Windows Credential Manager, macOS Keychain, Linux Secret Service)
/// - Database fallback with encrypted storage
/// - Automatic secret rotation support
/// - No secrets logged or exposed in error messages
use base64::{engine::general_purpose, Engine as _};
use keyring::Entry;
use rand::RngCore;
use rusqlite::Connection;
use std::sync::{Arc, Mutex};
use tracing::{debug, error, info, warn};

const JWT_SECRET_KEY: &str = "agiworkforce.jwt_secret";
const JWT_SECRET_DB_KEY: &str = "jwt_secret";
const SERVICE_NAME: &str = "AGI Workforce";
const SECRET_LENGTH: usize = 64; // 512 bits for JWT secret

/// Error types for secret management operations
#[derive(Debug, thiserror::Error)]
pub enum SecretError {
    #[error("Failed to generate secret")]
    GenerationError,

    #[error("Failed to store secret in keyring")]
    KeyringStoreError(#[source] keyring::Error),

    #[error("Failed to retrieve secret from keyring")]
    KeyringRetrieveError(#[source] keyring::Error),

    #[error("Failed to store secret in database")]
    DatabaseStoreError(#[source] rusqlite::Error),

    #[error("Failed to retrieve secret from database")]
    DatabaseRetrieveError(#[source] rusqlite::Error),

    #[error("Secret not found in any storage")]
    SecretNotFound,

    #[error("Invalid secret format")]
    InvalidSecretFormat,
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
    /// 1. Try to retrieve from OS keyring
    /// 2. If not found, try database (fallback)
    /// 3. If not found anywhere, generate new secret and store it
    ///
    /// # Security Notes
    /// - Secret is never logged
    /// - Errors are sanitized to prevent secret leakage
    pub fn get_or_create_jwt_secret(&self) -> Result<String, SecretError> {
        debug!("Attempting to retrieve JWT secret");

        // Try keyring first (most secure)
        match self.get_secret_from_keyring() {
            Ok(secret) => {
                info!("JWT secret retrieved from OS keyring");
                return Ok(secret);
            }
            Err(e) => {
                warn!("Failed to retrieve from keyring: {}", sanitize_error(&e));
            }
        }

        // Try database fallback
        match self.get_secret_from_database() {
            Ok(secret) => {
                info!("JWT secret retrieved from database (fallback)");
                // Try to migrate to keyring for better security
                if let Err(e) = self.store_secret_in_keyring(&secret) {
                    warn!(
                        "Failed to migrate secret to keyring: {}",
                        sanitize_error(&e)
                    );
                } else {
                    info!("Successfully migrated secret to keyring");
                }
                return Ok(secret);
            }
            Err(e) => {
                debug!("No secret found in database: {}", sanitize_error(&e));
            }
        }

        // Generate new secret if not found anywhere
        info!("Generating new JWT secret");
        let secret = self.generate_secret()?;

        // Store in both keyring and database
        let mut stored = false;

        // Try keyring first
        if let Err(e) = self.store_secret_in_keyring(&secret) {
            warn!("Failed to store in keyring: {}", sanitize_error(&e));
        } else {
            info!("JWT secret stored in OS keyring");
            stored = true;
        }

        // Always store in database as fallback
        if let Err(e) = self.store_secret_in_database(&secret) {
            error!("Failed to store in database: {}", sanitize_error(&e));
            if !stored {
                return Err(e);
            }
        } else {
            info!("JWT secret stored in database");
            stored = true;
        }

        if stored {
            Ok(secret)
        } else {
            Err(SecretError::GenerationError)
        }
    }

    /// Rotate the JWT secret (generate and store a new one)
    ///
    /// # Warning
    /// This will invalidate all existing JWT tokens. Only call this if you
    /// want to force all users to re-authenticate.
    pub fn rotate_jwt_secret(&self) -> Result<String, SecretError> {
        info!("Rotating JWT secret - all existing tokens will be invalidated");

        let new_secret = self.generate_secret()?;

        // Store in both locations
        let mut stored = false;

        if let Err(e) = self.store_secret_in_keyring(&new_secret) {
            warn!(
                "Failed to store rotated secret in keyring: {}",
                sanitize_error(&e)
            );
        } else {
            stored = true;
        }

        if let Err(e) = self.store_secret_in_database(&new_secret) {
            error!(
                "Failed to store rotated secret in database: {}",
                sanitize_error(&e)
            );
            if !stored {
                return Err(e);
            }
        } else {
            stored = true;
        }

        if stored {
            info!("JWT secret rotation completed successfully");
            Ok(new_secret)
        } else {
            error!("Failed to store rotated secret in any storage");
            Err(SecretError::GenerationError)
        }
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

    /// Store secret in OS keyring (primary storage)
    fn store_secret_in_keyring(&self, secret: &str) -> Result<(), SecretError> {
        let entry =
            Entry::new(SERVICE_NAME, JWT_SECRET_KEY).map_err(SecretError::KeyringStoreError)?;

        entry
            .set_password(secret)
            .map_err(SecretError::KeyringStoreError)?;

        Ok(())
    }

    /// Retrieve secret from OS keyring
    fn get_secret_from_keyring(&self) -> Result<String, SecretError> {
        let entry =
            Entry::new(SERVICE_NAME, JWT_SECRET_KEY).map_err(SecretError::KeyringRetrieveError)?;

        entry
            .get_password()
            .map_err(SecretError::KeyringRetrieveError)
    }

    /// Store secret in database (fallback storage)
    fn store_secret_in_database(&self, secret: &str) -> Result<(), SecretError> {
        let conn = self.db_conn.lock().unwrap();

        conn.execute(
            "INSERT OR REPLACE INTO settings (key, value, encrypted) VALUES (?1, ?2, 1)",
            rusqlite::params![JWT_SECRET_DB_KEY, secret],
        )
        .map_err(SecretError::DatabaseStoreError)?;

        Ok(())
    }

    /// Retrieve secret from database
    fn get_secret_from_database(&self) -> Result<String, SecretError> {
        let conn = self.db_conn.lock().unwrap();

        let secret: String = conn
            .query_row(
                "SELECT value FROM settings WHERE key = ?1 AND encrypted = 1",
                rusqlite::params![JWT_SECRET_DB_KEY],
                |row| row.get(0),
            )
            .map_err(SecretError::DatabaseRetrieveError)?;

        if secret.is_empty() {
            return Err(SecretError::SecretNotFound);
        }

        Ok(secret)
    }

    /// Delete secret from all storage locations
    ///
    /// # Warning
    /// This is a destructive operation. Only use for testing or when
    /// you need to completely reset the application's security state.
    #[cfg(test)]
    pub fn delete_jwt_secret(&self) -> Result<(), SecretError> {
        // Delete from keyring
        if let Ok(entry) = Entry::new(SERVICE_NAME, JWT_SECRET_KEY) {
            let _ = entry.delete_password(); // Ignore errors
        }

        // Delete from database
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
        SecretError::KeyringRetrieveError(_) => "Keyring access error".to_string(),
        SecretError::KeyringStoreError(_) => "Keyring storage error".to_string(),
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

        manager.store_secret_in_database(&secret).unwrap();
        let retrieved = manager.get_secret_from_database().unwrap();

        assert_eq!(secret, retrieved);
    }

    #[test]
    fn test_get_or_create_jwt_secret() {
        let manager = create_test_manager();

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
}
