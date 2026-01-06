use super::encryption::{decrypt_secret, encrypt_secret, EncryptedSecret};
use base64::{engine::general_purpose, Engine as _};
#[cfg(not(test))]
use keyring::Entry;
use rand::RngCore;
use rusqlite::Connection;
use std::sync::{Arc, Mutex};
use tracing::{debug, error, info, warn};

#[allow(dead_code)]
const JWT_SECRET_KEY: &str = "agiworkforce.jwt_secret";
const JWT_SECRET_DB_KEY: &str = "jwt_secret";
#[allow(dead_code)]
const DB_ENCRYPTION_KEY_NAME: &str = "agiworkforce.db_encryption_key";
const SERVICE_NAME: &str = "AGI Workforce";
const SECRET_LENGTH: usize = 64;
const ENCRYPTION_KEY_LENGTH: usize = 32;

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

    #[error("Encryption/decryption failed: {0}")]
    EncryptionError(String),
}

pub struct SecretManager {
    db_conn: Arc<Mutex<Connection>>,
    #[allow(dead_code)]
    service_name: String,
}

impl SecretManager {
    pub fn new(db_conn: Arc<Mutex<Connection>>) -> Self {
        Self {
            db_conn,
            service_name: SERVICE_NAME.to_string(),
        }
    }

    #[cfg(test)]
    pub fn new_with_service_name(db_conn: Arc<Mutex<Connection>>, service_name: String) -> Self {
        Self {
            db_conn,
            service_name,
        }
    }

    pub fn get_or_create_jwt_secret(&self) -> Result<String, SecretError> {
        debug!("Attempting to retrieve JWT secret");

        match self.get_secret_from_keyring() {
            Ok(secret) => {
                info!("JWT secret retrieved from OS keyring");
                return Ok(secret);
            }
            Err(e) => {
                warn!("Failed to retrieve from keyring: {}", sanitize_error(&e));
            }
        }

        match self.get_secret_from_database() {
            Ok(secret) => {
                info!("JWT secret retrieved from database (fallback)");

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

        info!("Generating new JWT secret");
        let secret = self.generate_secret()?;

        let mut stored = false;

        if let Err(e) = self.store_secret_in_keyring(&secret) {
            warn!("Failed to store in keyring: {}", sanitize_error(&e));
        } else {
            info!("JWT secret stored in OS keyring");
            stored = true;
        }

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

    pub fn rotate_jwt_secret(&self) -> Result<String, SecretError> {
        info!("Rotating JWT secret - all existing tokens will be invalidated");

        let new_secret = self.generate_secret()?;

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

    fn generate_secret(&self) -> Result<String, SecretError> {
        let mut secret_bytes = vec![0u8; SECRET_LENGTH];
        rand::thread_rng()
            .try_fill_bytes(&mut secret_bytes)
            .map_err(|_| SecretError::GenerationError)?;

        Ok(general_purpose::URL_SAFE_NO_PAD.encode(secret_bytes))
    }

    fn store_secret_in_keyring(&self, secret: &str) -> Result<(), SecretError> {
        #[cfg(test)]
        {
            let _ = secret;
            Ok(())
        }

        #[cfg(not(test))]
        {
            let entry = Entry::new(&self.service_name, JWT_SECRET_KEY)
                .map_err(SecretError::KeyringStoreError)?;

            entry
                .set_password(secret)
                .map_err(SecretError::KeyringStoreError)?;

            Ok(())
        }
    }

    fn get_secret_from_keyring(&self) -> Result<String, SecretError> {
        #[cfg(test)]
        return Err(SecretError::SecretNotFound);

        #[cfg(not(test))]
        {
            let entry = Entry::new(&self.service_name, JWT_SECRET_KEY)
                .map_err(SecretError::KeyringRetrieveError)?;

            entry
                .get_password()
                .map_err(SecretError::KeyringRetrieveError)
        }
    }

    fn store_secret_in_database(&self, secret: &str) -> Result<(), SecretError> {
        let encryption_key = self.get_or_create_db_encryption_key()?;

        let encrypted =
            encrypt_secret(&encryption_key, secret).map_err(SecretError::EncryptionError)?;

        let encrypted_json = serde_json::to_string(&encrypted)
            .map_err(|e| SecretError::EncryptionError(format!("Failed to serialize: {}", e)))?;

        let conn = self.db_conn.lock().unwrap_or_else(|e| e.into_inner());

        conn.execute(
            "INSERT OR REPLACE INTO settings (key, value, encrypted) VALUES (?1, ?2, 1)",
            rusqlite::params![JWT_SECRET_DB_KEY, encrypted_json],
        )
        .map_err(SecretError::DatabaseStoreError)?;

        Ok(())
    }

    fn get_secret_from_database(&self) -> Result<String, SecretError> {
        let conn = self.db_conn.lock().unwrap_or_else(|e| e.into_inner());

        let encrypted_json: String = conn
            .query_row(
                "SELECT value FROM settings WHERE key = ?1 AND encrypted = 1",
                rusqlite::params![JWT_SECRET_DB_KEY],
                |row| row.get(0),
            )
            .map_err(SecretError::DatabaseRetrieveError)?;

        if encrypted_json.is_empty() {
            return Err(SecretError::SecretNotFound);
        }

        drop(conn);

        let encryption_key = self.get_db_encryption_key()?;

        let encrypted: EncryptedSecret = serde_json::from_str(&encrypted_json)
            .map_err(|e| SecretError::EncryptionError(format!("Failed to deserialize: {}", e)))?;

        decrypt_secret(&encryption_key, &encrypted).map_err(SecretError::EncryptionError)
    }

    fn get_or_create_db_encryption_key(&self) -> Result<Vec<u8>, SecretError> {
        #[cfg(test)]
        return Ok(vec![1u8; ENCRYPTION_KEY_LENGTH]);

        #[cfg(not(test))]
        {
            if let Ok(key) = self.get_db_encryption_key() {
                return Ok(key);
            }

            let mut key_bytes = vec![0u8; ENCRYPTION_KEY_LENGTH];
            rand::thread_rng()
                .try_fill_bytes(&mut key_bytes)
                .map_err(|_| SecretError::GenerationError)?;

            let entry = Entry::new(&self.service_name, DB_ENCRYPTION_KEY_NAME)
                .map_err(SecretError::KeyringStoreError)?;

            let key_base64 = general_purpose::STANDARD.encode(&key_bytes);
            entry
                .set_password(&key_base64)
                .map_err(SecretError::KeyringStoreError)?;

            info!("Generated new database encryption key");
            Ok(key_bytes)
        }
    }

    fn get_db_encryption_key(&self) -> Result<Vec<u8>, SecretError> {
        #[cfg(test)]
        return Ok(vec![1u8; ENCRYPTION_KEY_LENGTH]);

        #[cfg(not(test))]
        {
            let entry = Entry::new(&self.service_name, DB_ENCRYPTION_KEY_NAME)
                .map_err(SecretError::KeyringRetrieveError)?;

            let key_base64 = entry
                .get_password()
                .map_err(SecretError::KeyringRetrieveError)?;

            general_purpose::STANDARD
                .decode(&key_base64)
                .map_err(|e| SecretError::EncryptionError(format!("Invalid key format: {}", e)))
        }
    }

    #[cfg(test)]
    pub fn delete_jwt_secret(&self) -> Result<(), SecretError> {
        // In tests, we don't actually touch the keyring
        // if let Ok(entry) = Entry::new(&self.service_name, JWT_SECRET_KEY) {
        //     let _ = entry.delete_password();
        // }

        let conn = self.db_conn.lock().unwrap();
        let _ = conn.execute(
            "DELETE FROM settings WHERE key = ?1",
            rusqlite::params![JWT_SECRET_DB_KEY],
        );

        Ok(())
    }
}

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

        conn.execute(
            "CREATE TABLE IF NOT EXISTS settings (
                key TEXT PRIMARY KEY,
                value TEXT NOT NULL,
                encrypted INTEGER NOT NULL DEFAULT 0
            )",
            [],
        )
        .unwrap();

        use rand::Rng;
        let random_suffix: u32 = rand::thread_rng().gen();
        let service_name = format!("AGI_Workforce_Test_{}", random_suffix);

        SecretManager::new_with_service_name(Arc::new(Mutex::new(conn)), service_name)
    }

    #[test]
    fn test_generate_secret() {
        let manager = create_test_manager();
        let secret = manager.generate_secret().unwrap();

        assert!(secret.len() > 80);

        assert!(general_purpose::URL_SAFE_NO_PAD.decode(&secret).is_ok());
    }

    #[test]
    fn test_secret_uniqueness() {
        let manager = create_test_manager();
        let secret1 = manager.generate_secret().unwrap();
        let secret2 = manager.generate_secret().unwrap();

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

        let _ = manager.delete_jwt_secret();

        let secret1 = manager.get_or_create_jwt_secret().unwrap();
        assert!(!secret1.is_empty());

        let secret2 = manager.get_or_create_jwt_secret().unwrap();
        assert_eq!(secret1, secret2);
    }

    #[test]
    fn test_rotate_jwt_secret() {
        let manager = create_test_manager();

        let secret1 = manager.get_or_create_jwt_secret().unwrap();

        let secret2 = manager.rotate_jwt_secret().unwrap();

        assert_ne!(secret1, secret2);

        let secret3 = manager.get_or_create_jwt_secret().unwrap();
        assert_eq!(secret2, secret3);
    }

    #[test]
    fn test_delete_jwt_secret() {
        let manager = create_test_manager();

        let _secret = manager.get_or_create_jwt_secret().unwrap();

        manager.delete_jwt_secret().unwrap();

        let new_secret = manager.get_or_create_jwt_secret().unwrap();
        assert!(!new_secret.is_empty());
    }
}
