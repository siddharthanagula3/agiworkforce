//! Secure storage with AES-256-GCM encryption
//!
//! This module provides secure storage functionality using machine-derived
//! encryption keys instead of OS keyring. This eliminates permission prompts
//! while maintaining strong encryption.

use super::machine_key::{self, KeyPurpose};
use aes_gcm::{
    aead::{Aead, KeyInit, OsRng},
    Aes256Gcm, Nonce,
};
use base64::{engine::general_purpose, Engine as _};
use pbkdf2::pbkdf2_hmac_array;
use rusqlite::Connection;
use serde::{Deserialize, Serialize};
use sha2::Sha256;
use std::sync::{Arc, Mutex, RwLock};

const NONCE_SIZE: usize = 12;
const PBKDF2_ITERATIONS: u32 = 600_000; // OWASP recommended for PBKDF2-HMAC-SHA256
const SALT_SIZE: usize = 32;
const KEY_SIZE: usize = 32; // AES-256

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct EncryptedData {
    pub ciphertext: String,
    pub nonce: String,
    pub salt: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SecureKeyMaterial {
    encrypted_key: Vec<u8>,
    salt: Vec<u8>,
}

/// Secure storage manager with AES-256-GCM encryption
/// Uses machine-derived keys instead of OS keyring
pub struct SecureStorage {
    master_key: RwLock<Option<Vec<u8>>>,
    db_conn: Option<Arc<Mutex<Connection>>>,
}

impl SecureStorage {
    /// Create a new secure storage instance
    pub fn new(_service_name: &str) -> Self {
        Self {
            master_key: RwLock::new(None),
            db_conn: None,
        }
    }

    /// Create a new secure storage instance with database connection
    pub fn with_database(db_conn: Arc<Mutex<Connection>>) -> Self {
        Self {
            master_key: RwLock::new(None),
            db_conn: Some(db_conn),
        }
    }

    /// Initialize with a password-derived master key
    pub fn init_with_password(&self, password: &str) -> Result<(), String> {
        let salt = generate_salt();
        let key = derive_key_from_password(password, &salt);

        let mut master = self.master_key.write().unwrap();
        *master = Some(key);

        // Store salt in database if available
        if let Some(ref db) = self.db_conn {
            self.store_salt_in_database(db, &salt)?;
        }

        Ok(())
    }

    /// Initialize with machine-derived key (no password required)
    pub fn init_with_machine_key(&self) -> Result<(), String> {
        let key = machine_key::derive_key(KeyPurpose::MasterEncryption);
        let mut master = self.master_key.write().unwrap();
        *master = Some(key);
        Ok(())
    }

    /// Unlock storage with password
    pub fn unlock(&self, password: &str) -> Result<(), String> {
        let salt = if let Some(ref db) = self.db_conn {
            self.retrieve_salt_from_database(db)?
        } else {
            // Use machine-derived salt as fallback
            machine_key::derive_key(KeyPurpose::MasterEncryption)[..SALT_SIZE].to_vec()
        };

        let key = derive_key_from_password(password, &salt);
        let mut master = self.master_key.write().unwrap();
        *master = Some(key);

        Ok(())
    }

    /// Lock storage (clear master key from memory)
    pub fn lock(&self) {
        let mut master = self.master_key.write().unwrap();
        if let Some(ref mut key) = *master {
            // Zero out the key before dropping
            key.iter_mut().for_each(|b| *b = 0);
        }
        *master = None;
    }

    /// Check if storage is unlocked
    pub fn is_unlocked(&self) -> bool {
        self.master_key.read().unwrap().is_some()
    }

    /// Encrypt and store data
    #[allow(deprecated)]
    pub fn encrypt(&self, plaintext: &[u8]) -> Result<EncryptedData, String> {
        let master = self.master_key.read().unwrap();
        let key = master
            .as_ref()
            .ok_or("Storage is locked. Call unlock() or init_with_machine_key() first")?;

        let cipher = Aes256Gcm::new_from_slice(key)
            .map_err(|e| format!("Failed to create cipher: {}", e))?;

        // Generate random nonce
        use aes_gcm::aead::rand_core::RngCore;
        let mut nonce_bytes = [0u8; NONCE_SIZE];
        OsRng.fill_bytes(&mut nonce_bytes);
        let nonce = Nonce::from_slice(&nonce_bytes);

        // Encrypt
        let ciphertext = cipher
            .encrypt(nonce, plaintext)
            .map_err(|e| format!("Encryption failed: {}", e))?;

        Ok(EncryptedData {
            ciphertext: general_purpose::STANDARD.encode(&ciphertext),
            nonce: general_purpose::STANDARD.encode(nonce_bytes),
            salt: general_purpose::STANDARD.encode(generate_salt()),
        })
    }

    /// Decrypt data
    #[allow(deprecated)]
    pub fn decrypt(&self, encrypted: &EncryptedData) -> Result<Vec<u8>, String> {
        let master = self.master_key.read().unwrap();
        let key = master
            .as_ref()
            .ok_or("Storage is locked. Call unlock() or init_with_machine_key() first")?;

        let cipher = Aes256Gcm::new_from_slice(key)
            .map_err(|e| format!("Failed to create cipher: {}", e))?;

        let ciphertext = general_purpose::STANDARD
            .decode(&encrypted.ciphertext)
            .map_err(|e| format!("Failed to decode ciphertext: {}", e))?;

        let nonce_bytes = general_purpose::STANDARD
            .decode(&encrypted.nonce)
            .map_err(|e| format!("Failed to decode nonce: {}", e))?;

        let nonce = Nonce::from_slice(&nonce_bytes);

        cipher
            .decrypt(nonce, ciphertext.as_ref())
            .map_err(|e| format!("Decryption failed: {}", e))
    }

    /// Store API key in database (encrypted)
    pub fn store_api_key(&self, provider: &str, api_key: &str) -> Result<(), String> {
        // Initialize with machine key if not already unlocked
        if !self.is_unlocked() {
            self.init_with_machine_key()?;
        }

        let encrypted = self.encrypt(api_key.as_bytes())?;
        let encrypted_json = serde_json::to_string(&encrypted)
            .map_err(|e| format!("Failed to serialize: {}", e))?;

        if let Some(ref db) = self.db_conn {
            let conn = db.lock().unwrap();
            conn.execute(
                "INSERT OR REPLACE INTO api_keys (provider, encrypted_key) VALUES (?1, ?2)",
                rusqlite::params![provider, encrypted_json],
            )
            .map_err(|e| format!("Failed to store API key: {}", e))?;
        }

        Ok(())
    }

    /// Retrieve API key from database (decrypted)
    pub fn retrieve_api_key(&self, provider: &str) -> Result<String, String> {
        // Initialize with machine key if not already unlocked
        if !self.is_unlocked() {
            self.init_with_machine_key()?;
        }

        let encrypted_json = if let Some(ref db) = self.db_conn {
            let conn = db.lock().unwrap();
            conn.query_row(
                "SELECT encrypted_key FROM api_keys WHERE provider = ?1",
                rusqlite::params![provider],
                |row| row.get::<_, String>(0),
            )
            .map_err(|e| format!("Failed to retrieve API key: {}", e))?
        } else {
            return Err("No database connection".to_string());
        };

        let encrypted: EncryptedData = serde_json::from_str(&encrypted_json)
            .map_err(|e| format!("Failed to deserialize: {}", e))?;

        let decrypted = self.decrypt(&encrypted)?;
        String::from_utf8(decrypted).map_err(|e| format!("Invalid UTF-8: {}", e))
    }

    /// Delete API key from database
    pub fn delete_api_key(&self, provider: &str) -> Result<(), String> {
        if let Some(ref db) = self.db_conn {
            let conn = db.lock().unwrap();
            conn.execute(
                "DELETE FROM api_keys WHERE provider = ?1",
                rusqlite::params![provider],
            )
            .map_err(|e| format!("Failed to delete API key: {}", e))?;
        }
        Ok(())
    }

    /// Store salt in database
    fn store_salt_in_database(&self, db: &Arc<Mutex<Connection>>, salt: &[u8]) -> Result<(), String> {
        let conn = db.lock().unwrap();
        let salt_b64 = general_purpose::STANDARD.encode(salt);
        conn.execute(
            "INSERT OR REPLACE INTO settings (key, value, encrypted) VALUES ('master_salt', ?1, 0)",
            rusqlite::params![salt_b64],
        )
        .map_err(|e| format!("Failed to store salt: {}", e))?;
        Ok(())
    }

    /// Retrieve salt from database
    fn retrieve_salt_from_database(&self, db: &Arc<Mutex<Connection>>) -> Result<Vec<u8>, String> {
        let conn = db.lock().unwrap();
        let salt_b64: String = conn
            .query_row(
                "SELECT value FROM settings WHERE key = 'master_salt'",
                [],
                |row| row.get(0),
            )
            .map_err(|e| format!("Failed to retrieve salt: {}", e))?;

        general_purpose::STANDARD
            .decode(salt_b64)
            .map_err(|e| format!("Failed to decode salt: {}", e))
    }
}

/// Derive encryption key from password using PBKDF2
fn derive_key_from_password(password: &str, salt: &[u8]) -> Vec<u8> {
    let key: [u8; KEY_SIZE] =
        pbkdf2_hmac_array::<Sha256, KEY_SIZE>(password.as_bytes(), salt, PBKDF2_ITERATIONS);
    key.to_vec()
}

/// Generate cryptographically secure random salt
fn generate_salt() -> Vec<u8> {
    use aes_gcm::aead::rand_core::RngCore;
    let mut salt = vec![0u8; SALT_SIZE];
    OsRng.fill_bytes(&mut salt);
    salt
}

/// Encrypt file at rest with AES-256-GCM
#[allow(deprecated)]
pub fn encrypt_file(input_path: &str, output_path: &str, password: &str) -> Result<(), String> {
    use std::fs;

    let plaintext = fs::read(input_path).map_err(|e| format!("Failed to read file: {}", e))?;

    let salt = generate_salt();
    let key = derive_key_from_password(password, &salt);

    let cipher =
        Aes256Gcm::new_from_slice(&key).map_err(|e| format!("Failed to create cipher: {}", e))?;

    use aes_gcm::aead::rand_core::RngCore;
    let mut nonce_bytes = [0u8; NONCE_SIZE];
    OsRng.fill_bytes(&mut nonce_bytes);
    let nonce = Nonce::from_slice(&nonce_bytes);

    let ciphertext = cipher
        .encrypt(nonce, plaintext.as_ref())
        .map_err(|e| format!("Encryption failed: {}", e))?;

    // Format: [salt (32 bytes)][nonce (12 bytes)][ciphertext]
    let mut output = Vec::new();
    output.extend_from_slice(&salt);
    output.extend_from_slice(&nonce_bytes);
    output.extend_from_slice(&ciphertext);

    fs::write(output_path, output).map_err(|e| format!("Failed to write encrypted file: {}", e))?;

    Ok(())
}

/// Decrypt file encrypted with encrypt_file
#[allow(deprecated)]
pub fn decrypt_file(input_path: &str, output_path: &str, password: &str) -> Result<(), String> {
    use std::fs;

    let encrypted_data = fs::read(input_path).map_err(|e| format!("Failed to read file: {}", e))?;

    if encrypted_data.len() < SALT_SIZE + NONCE_SIZE {
        return Err("Invalid encrypted file format".to_string());
    }

    // Parse: [salt (32 bytes)][nonce (12 bytes)][ciphertext]
    let salt = &encrypted_data[0..SALT_SIZE];
    let nonce_bytes = &encrypted_data[SALT_SIZE..SALT_SIZE + NONCE_SIZE];
    let ciphertext = &encrypted_data[SALT_SIZE + NONCE_SIZE..];

    let key = derive_key_from_password(password, salt);

    let cipher =
        Aes256Gcm::new_from_slice(&key).map_err(|e| format!("Failed to create cipher: {}", e))?;

    let nonce = Nonce::from_slice(nonce_bytes);

    let plaintext = cipher
        .decrypt(nonce, ciphertext)
        .map_err(|e| format!("Decryption failed (wrong password?): {}", e))?;

    fs::write(output_path, plaintext)
        .map_err(|e| format!("Failed to write decrypted file: {}", e))?;

    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_password_based_encryption() {
        let password = "test_password_123!@#";
        let plaintext = b"This is a secret message";

        let salt = generate_salt();
        let key = derive_key_from_password(password, &salt);
        assert_eq!(key.len(), 32);

        // Encrypt
        let cipher = Aes256Gcm::new_from_slice(&key).unwrap();
        use aes_gcm::aead::rand_core::RngCore;
        let mut nonce_bytes = [0u8; NONCE_SIZE];
        OsRng.fill_bytes(&mut nonce_bytes);
        let nonce = Nonce::from_slice(&nonce_bytes);

        let ciphertext = cipher.encrypt(nonce, plaintext.as_ref()).unwrap();

        // Decrypt
        let decrypted = cipher.decrypt(nonce, ciphertext.as_ref()).unwrap();
        assert_eq!(plaintext, decrypted.as_slice());
    }

    #[test]
    fn test_secure_storage_with_machine_key() {
        let storage = SecureStorage::new("test_service");
        storage.init_with_machine_key().unwrap();

        assert!(storage.is_unlocked());

        let plaintext = b"secret data";
        let encrypted = storage.encrypt(plaintext).unwrap();
        let decrypted = storage.decrypt(&encrypted).unwrap();

        assert_eq!(plaintext, decrypted.as_slice());

        storage.lock();
        assert!(!storage.is_unlocked());
    }

    #[test]
    fn test_secure_storage_with_password() {
        let storage = SecureStorage::new("test_service");
        storage.init_with_password("my_secure_password").ok();

        assert!(storage.is_unlocked());

        let plaintext = b"secret data";
        let encrypted = storage.encrypt(plaintext).unwrap();
        let decrypted = storage.decrypt(&encrypted).unwrap();

        assert_eq!(plaintext, decrypted.as_slice());

        storage.lock();
        assert!(!storage.is_unlocked());
    }

    #[test]
    fn test_file_encryption() {
        use std::fs;
        use tempfile::tempdir;

        let dir = tempdir().unwrap();
        let input_path = dir.path().join("test.txt");
        let encrypted_path = dir.path().join("test.enc");
        let decrypted_path = dir.path().join("test_decrypted.txt");

        let original_content = b"This is the original file content";
        fs::write(&input_path, original_content).unwrap();

        let password = "file_encryption_password";

        // Encrypt
        encrypt_file(
            input_path.to_str().unwrap(),
            encrypted_path.to_str().unwrap(),
            password,
        )
        .unwrap();

        // Verify encrypted file exists and is different
        let encrypted_content = fs::read(&encrypted_path).unwrap();
        assert_ne!(encrypted_content, original_content);

        // Decrypt
        decrypt_file(
            encrypted_path.to_str().unwrap(),
            decrypted_path.to_str().unwrap(),
            password,
        )
        .unwrap();

        // Verify decrypted content matches original
        let decrypted_content = fs::read(&decrypted_path).unwrap();
        assert_eq!(decrypted_content, original_content);
    }

    #[test]
    fn test_wrong_password_fails() {
        use std::fs;
        use tempfile::tempdir;

        let dir = tempdir().unwrap();
        let input_path = dir.path().join("test.txt");
        let encrypted_path = dir.path().join("test.enc");
        let decrypted_path = dir.path().join("test_decrypted.txt");

        fs::write(&input_path, b"secret content").unwrap();

        encrypt_file(
            input_path.to_str().unwrap(),
            encrypted_path.to_str().unwrap(),
            "correct_password",
        )
        .unwrap();

        // Try to decrypt with wrong password
        let result = decrypt_file(
            encrypted_path.to_str().unwrap(),
            decrypted_path.to_str().unwrap(),
            "wrong_password",
        );

        assert!(result.is_err());
        assert!(result.unwrap_err().contains("Decryption failed"));
    }
}
