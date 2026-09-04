use crate::core::sync_utils::RwLockExt;
use crate::sys::security::machine_key::{self, KeyPurpose};
use aes_gcm::{
    aead::{rand_core::OsRng, Aead, KeyInit},
    Aes256Gcm, Nonce,
};
use base64::{engine::general_purpose, Engine as _};
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
    // AUDIT-003-009 fix: derive the key from machine_key instead of generating a
    // random one, so secrets stay recoverable after an application restart.
    pub fn new() -> Result<Self, String> {
        let key = Self::derive_persistent_key()?;

        Ok(Self {
            key,
            secrets: RwLock::new(HashMap::new()),
        })
    }

    // F5: the key comes from the per-install secret held by the OS credential
    // service. Without it there is no key that another local process could not
    // reproduce, so the store refuses to open at all.
    fn derive_persistent_key() -> Result<Vec<u8>, String> {
        machine_key::try_derive_key(KeyPurpose::MasterEncryption).map_err(|error| error.to_string())
    }

    pub fn store_secret(&self, name: String, value: &str) -> Result<(), String> {
        let encrypted = encrypt_secret(&self.key, value)?;
        let mut secrets = self
            .secrets
            .safe_write()
            .map_err(|e| format!("Failed to acquire write lock: {}", e))?;
        secrets.insert(name, encrypted);
        Ok(())
    }

    pub fn retrieve_secret(&self, name: &str) -> Result<String, String> {
        let secrets = self
            .secrets
            .safe_read()
            .map_err(|e| format!("Failed to acquire read lock: {}", e))?;
        let encrypted = secrets
            .get(name)
            .ok_or_else(|| format!("Secret '{}' not found", name))?;
        decrypt_secret(&self.key, encrypted)
    }

    pub fn delete_secret(&self, name: &str) -> Result<(), String> {
        let mut secrets = self
            .secrets
            .safe_write()
            .map_err(|e| format!("Failed to acquire write lock: {}", e))?;
        secrets
            .remove(name)
            .ok_or_else(|| format!("Secret '{}' not found", name))?;
        Ok(())
    }

    pub fn list_secrets(&self) -> Vec<String> {
        self.secrets
            .safe_read()
            .map(|guard| guard.keys().cloned().collect())
            .unwrap_or_default()
    }
}

pub fn encrypt_secret(key: &[u8], plaintext: &str) -> Result<EncryptedSecret, String> {
    let cipher =
        Aes256Gcm::new_from_slice(key).map_err(|e| format!("Failed to create cipher: {}", e))?;

    use aes_gcm::aead::rand_core::RngCore;
    let mut nonce_bytes = [0u8; NONCE_SIZE];
    OsRng.fill_bytes(&mut nonce_bytes);
    #[allow(deprecated)]
    let nonce = Nonce::from_slice(&nonce_bytes);

    let ciphertext = cipher
        .encrypt(nonce, plaintext.as_bytes())
        .map_err(|e| format!("Encryption failed: {}", e))?;

    Ok(EncryptedSecret {
        ciphertext: general_purpose::STANDARD.encode(&ciphertext),
        nonce: general_purpose::STANDARD.encode(nonce_bytes),
    })
}

pub fn decrypt_secret_with_key(key: &[u8], encrypted: &EncryptedSecret) -> Result<String, String> {
    let cipher =
        Aes256Gcm::new_from_slice(key).map_err(|e| format!("Failed to create cipher: {}", e))?;

    let ciphertext = general_purpose::STANDARD
        .decode(&encrypted.ciphertext)
        .map_err(|e| format!("Failed to decode ciphertext: {}", e))?;

    let nonce_bytes = general_purpose::STANDARD
        .decode(&encrypted.nonce)
        .map_err(|e| format!("Failed to decode nonce: {}", e))?;

    if nonce_bytes.len() != 12 {
        return Err(format!(
            "Invalid nonce length: expected 12 bytes, got {}",
            nonce_bytes.len()
        ));
    }

    #[allow(deprecated)]
    let nonce = Nonce::from_slice(&nonce_bytes);

    let plaintext = cipher
        .decrypt(nonce, ciphertext.as_ref())
        .map_err(|e| format!("Decryption failed: {}", e))?;

    String::from_utf8(plaintext)
        .map_err(|e| format!("Failed to convert decrypted data to string: {}", e))
}

pub fn decrypt_secret(key: &[u8], encrypted: &EncryptedSecret) -> Result<String, String> {
    let primary_error = match decrypt_secret_with_key(key, encrypted) {
        Ok(plaintext) => return Ok(plaintext),
        Err(error) => error,
    };

    let Some((purpose, legacy_keys)) = machine_key::legacy_keys_for_current_key(key) else {
        return Err(primary_error);
    };

    for legacy in legacy_keys {
        if let Ok(plaintext) = decrypt_secret_with_key(&legacy, encrypted) {
            machine_key::record_machine_only_payload(purpose.as_str());
            tracing::warn!(
                "Read a {} secret still wrapped under the legacy machine-only key; \
                 it stays reproducible by any local process until it is written again.",
                purpose.as_str()
            );
            return Ok(plaintext);
        }
    }

    Err(primary_error)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_encrypt_decrypt() {
        // AUDIT-003-009: Test uses derive_persistent_key instead of random generation
        let key = SecretStore::derive_persistent_key().unwrap();
        let plaintext = "my secret password 123";

        let encrypted = encrypt_secret(&key, plaintext).unwrap();
        let decrypted = decrypt_secret(&key, &encrypted).unwrap();

        assert_eq!(plaintext, decrypted);
    }

    #[test]
    fn test_key_consistency() {
        // AUDIT-003-009: Verify that derived keys are consistent across calls
        let key1 = SecretStore::derive_persistent_key().unwrap();
        let key2 = SecretStore::derive_persistent_key().unwrap();
        assert_eq!(key1, key2, "Derived keys should be consistent");
    }

    /// F5: a secret an older build wrapped under the machine-only key must stay
    /// readable, and the process must report that it is not yet re-wrapped.
    #[test]
    fn legacy_machine_only_ciphertext_is_readable_and_reported() {
        let purpose = KeyPurpose::MasterEncryption;
        let legacy = machine_key::legacy_machine_only_keys(purpose)
            .first()
            .copied()
            .expect("a legacy candidate always exists");
        let stored = encrypt_secret(&legacy, "legacy-session-token").unwrap();
        let current = machine_key::try_derive_key(purpose).expect("install secret in tests");

        assert!(decrypt_secret_with_key(&current, &stored).is_err());
        assert_eq!(
            decrypt_secret(&current, &stored).unwrap(),
            "legacy-session-token"
        );
        assert!(machine_key::has_machine_only_secrets());

        // An arbitrary key must never reach the machine-only fallback.
        assert!(decrypt_secret(&[0x33u8; 32], &stored).is_err());
    }

    #[test]
    fn test_secret_store() {
        let store = SecretStore::new().unwrap();

        store
            .store_secret("api_key".to_string(), "sk-1234567890")
            .unwrap();
        let retrieved = store.retrieve_secret("api_key").unwrap();
        assert_eq!(retrieved, "sk-1234567890");

        let secrets = store.list_secrets();
        assert_eq!(secrets.len(), 1);
        assert!(secrets.contains(&"api_key".to_string()));

        store.delete_secret("api_key").unwrap();
        assert!(store.retrieve_secret("api_key").is_err());
    }
}
