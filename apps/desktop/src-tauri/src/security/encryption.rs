use aes_gcm::{
    aead::{Aead, KeyInit, OsRng},
    Aes256Gcm, Nonce,
};
use base64::{Engine as _, engine::general_purpose};
use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use std::sync::RwLock;

const NONCE_SIZE: usize = 12;

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct EncryptedSecret {
    pub ciphertext: String,
    pub nonce: String,
}

pub struct SecretStore {
    key: Vec<u8>,
    secrets: RwLock<HashMap<String, EncryptedSecret>>,
}

impl SecretStore {
    pub fn new() -> Result<Self, String> {
        // In production, this should be derived from a master password or OS keychain
        // For now, generate a random key (will be lost on restart)
        let key = Self::generate_key();

        Ok(Self {
            key,
            secrets: RwLock::new(HashMap::new()),
        })
    }

    fn generate_key() -> Vec<u8> {
        use aes_gcm::aead::rand_core::RngCore;
        let mut key = vec![0u8; 32];
        OsRng.fill_bytes(&mut key);
        key
    }

    pub fn store_secret(&self, name: String, value: &str) -> Result<(), String> {
        let encrypted = encrypt_secret(&self.key, value)?;
        let mut secrets = self.secrets.write().unwrap();
        secrets.insert(name, encrypted);
        Ok(())
    }

    pub fn retrieve_secret(&self, name: &str) -> Result<String, String> {
        let secrets = self.secrets.read().unwrap();
        let encrypted = secrets.get(name)
            .ok_or_else(|| format!("Secret '{}' not found", name))?;
        decrypt_secret(&self.key, encrypted)
    }

    pub fn delete_secret(&self, name: &str) -> Result<(), String> {
        let mut secrets = self.secrets.write().unwrap();
        secrets.remove(name)
            .ok_or_else(|| format!("Secret '{}' not found", name))?;
        Ok(())
    }

    pub fn list_secrets(&self) -> Vec<String> {
        let secrets = self.secrets.read().unwrap();
        secrets.keys().cloned().collect()
    }
}

pub fn encrypt_secret(key: &[u8], plaintext: &str) -> Result<EncryptedSecret, String> {
    let cipher = Aes256Gcm::new_from_slice(key)
        .map_err(|e| format!("Failed to create cipher: {}", e))?;

    use aes_gcm::aead::rand_core::RngCore;
    let mut nonce_bytes = [0u8; NONCE_SIZE];
    OsRng.fill_bytes(&mut nonce_bytes);
    let nonce = Nonce::from_slice(&nonce_bytes);

    let ciphertext = cipher
        .encrypt(nonce, plaintext.as_bytes())
        .map_err(|e| format!("Encryption failed: {}", e))?;

    Ok(EncryptedSecret {
        ciphertext: general_purpose::STANDARD.encode(&ciphertext),
        nonce: general_purpose::STANDARD.encode(&nonce_bytes),
    })
}

pub fn decrypt_secret(key: &[u8], encrypted: &EncryptedSecret) -> Result<String, String> {
    let cipher = Aes256Gcm::new_from_slice(key)
        .map_err(|e| format!("Failed to create cipher: {}", e))?;

    let ciphertext = general_purpose::STANDARD
        .decode(&encrypted.ciphertext)
        .map_err(|e| format!("Failed to decode ciphertext: {}", e))?;

    let nonce_bytes = general_purpose::STANDARD
        .decode(&encrypted.nonce)
        .map_err(|e| format!("Failed to decode nonce: {}", e))?;

    let nonce = Nonce::from_slice(&nonce_bytes);

    let plaintext = cipher
        .decrypt(nonce, ciphertext.as_ref())
        .map_err(|e| format!("Decryption failed: {}", e))?;

    String::from_utf8(plaintext)
        .map_err(|e| format!("Failed to convert decrypted data to string: {}", e))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_encrypt_decrypt() {
        let key = SecretStore::generate_key();
        let plaintext = "my secret password 123";

        let encrypted = encrypt_secret(&key, plaintext).unwrap();
        let decrypted = decrypt_secret(&key, &encrypted).unwrap();

        assert_eq!(plaintext, decrypted);
    }

    #[test]
    fn test_secret_store() {
        let store = SecretStore::new().unwrap();

        store.store_secret("api_key".to_string(), "sk-1234567890").unwrap();
        let retrieved = store.retrieve_secret("api_key").unwrap();
        assert_eq!(retrieved, "sk-1234567890");

        let secrets = store.list_secrets();
        assert_eq!(secrets.len(), 1);
        assert!(secrets.contains(&"api_key".to_string()));

        store.delete_secret("api_key").unwrap();
        assert!(store.retrieve_secret("api_key").is_err());
    }
}
