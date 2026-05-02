//! Master-password-derived AES-256-GCM helper (FIX-001 / FIX-002 / FIX-004).
//!
//! Wraps [`MasterPasswordManager`] so credential-storage IPC handlers can
//! encrypt/decrypt with a single call without each one re-implementing the
//! cipher boilerplate. The wire format is `base64(nonce || ciphertext)` —
//! one self-contained string per credential, matching the inline format
//! that the existing `encrypt_credential` callers in `mcp_oauth.rs` already
//! consume so call-site refactors stay narrow.
//!
//! All operations require the vault to be unlocked. When the vault is
//! locked, both `encrypt` and `decrypt` propagate
//! [`MasterPasswordError::AppLocked`] up the IPC layer so the frontend can
//! surface the unlock modal before retrying.
use std::sync::{Arc, Mutex};

use aes_gcm::aead::rand_core::{OsRng, RngCore};
use aes_gcm::aead::{Aead, KeyInit};
use aes_gcm::{Aes256Gcm, Nonce};
use base64::engine::general_purpose;
use base64::Engine as _;

use super::machine_key::KeyPurpose;
use super::master_password::{MasterPasswordError, MasterPasswordManager};

const NONCE_SIZE: usize = 12;

/// Combined wrapper that derives an AES-256-GCM key from the unlocked
/// master-password vault and encrypts/decrypts arbitrary credentials.
#[derive(Clone)]
pub struct MasterPasswordEncryption {
    manager: Arc<Mutex<MasterPasswordManager>>,
}

impl MasterPasswordEncryption {
    pub fn new(manager: Arc<Mutex<MasterPasswordManager>>) -> Self {
        Self { manager }
    }

    /// Returns whether the underlying vault is unlocked. Callers should
    /// short-circuit and prompt the user via `master_password_unlock` when
    /// this is `false` instead of calling encrypt/decrypt and getting
    /// `MasterPasswordError::AppLocked`.
    pub fn is_unlocked(&self) -> bool {
        self.manager
            .lock()
            .map(|guard| guard.is_unlocked())
            .unwrap_or(false)
    }

    /// Returns whether the user has set up a master password. When this is
    /// `false`, credential-storage call sites should fall back to
    /// machine-key derivation for backwards compatibility — no vault has
    /// been initialized yet.
    pub fn is_configured(&self) -> bool {
        self.manager
            .lock()
            .ok()
            .and_then(|guard| guard.is_configured().ok())
            .unwrap_or(false)
    }

    /// Encrypt `plaintext` for the given purpose. Returns
    /// `base64(nonce || ciphertext)` so callers can store a single string.
    pub fn encrypt(
        &self,
        purpose: KeyPurpose,
        plaintext: &str,
    ) -> Result<String, MasterPasswordError> {
        let key = self.derive_key(purpose)?;
        let cipher = Aes256Gcm::new_from_slice(&key)
            .map_err(|e| MasterPasswordError::CryptoError(format!("invalid key length: {e}")))?;

        let mut nonce_bytes = [0_u8; NONCE_SIZE];
        OsRng.fill_bytes(&mut nonce_bytes);
        #[allow(deprecated)]
        let nonce = Nonce::from_slice(&nonce_bytes);

        let ciphertext = cipher
            .encrypt(nonce, plaintext.as_bytes())
            .map_err(|e| MasterPasswordError::CryptoError(format!("AES-GCM encrypt: {e}")))?;

        let mut combined = Vec::with_capacity(NONCE_SIZE + ciphertext.len());
        combined.extend_from_slice(&nonce_bytes);
        combined.extend_from_slice(&ciphertext);
        Ok(general_purpose::STANDARD.encode(combined))
    }

    /// Decrypt the `base64(nonce || ciphertext)` value produced by
    /// [`MasterPasswordEncryption::encrypt`] for the same `purpose`. Always
    /// derives the key first so a locked vault surfaces
    /// `MasterPasswordError::AppLocked` even when the caller hands in
    /// garbage ciphertext — callers should always be able to distinguish
    /// "you need to unlock" from "your data is corrupted".
    pub fn decrypt(
        &self,
        purpose: KeyPurpose,
        ciphertext_b64: &str,
    ) -> Result<String, MasterPasswordError> {
        let key = self.derive_key(purpose)?;

        let combined = general_purpose::STANDARD
            .decode(ciphertext_b64)
            .map_err(|e| MasterPasswordError::CryptoError(format!("base64 decode: {e}")))?;

        if combined.len() <= NONCE_SIZE {
            return Err(MasterPasswordError::CryptoError(format!(
                "ciphertext too short: {} bytes, need > {NONCE_SIZE}",
                combined.len()
            )));
        }
        let (nonce_bytes, ciphertext) = combined.split_at(NONCE_SIZE);
        #[allow(deprecated)]
        let nonce = Nonce::from_slice(nonce_bytes);

        let cipher = Aes256Gcm::new_from_slice(&key)
            .map_err(|e| MasterPasswordError::CryptoError(format!("invalid key length: {e}")))?;

        let plaintext = cipher
            .decrypt(nonce, ciphertext)
            .map_err(|e| MasterPasswordError::CryptoError(format!("AES-GCM decrypt: {e}")))?;
        String::from_utf8(plaintext)
            .map_err(|e| MasterPasswordError::CryptoError(format!("utf-8 decode: {e}")))
    }

    fn derive_key(&self, purpose: KeyPurpose) -> Result<Vec<u8>, MasterPasswordError> {
        let manager = self.manager.lock().map_err(|e| {
            MasterPasswordError::CryptoError(format!("manager lock poisoned: {e}"))
        })?;
        manager.derive_key(purpose)
    }
}

#[cfg(test)]
mod tests {
    use std::sync::{Arc, Mutex};

    use rusqlite::Connection;

    use super::*;

    fn unlocked_helper() -> MasterPasswordEncryption {
        let conn = Connection::open_in_memory().unwrap();
        let manager = MasterPasswordManager::new(Arc::new(Mutex::new(conn)));
        manager.init_table().unwrap();
        manager.setup("alpha-beta-unique-phrase").unwrap(); // gitleaks:allow
        MasterPasswordEncryption::new(Arc::new(Mutex::new(manager)))
    }

    fn locked_helper() -> MasterPasswordEncryption {
        let conn = Connection::open_in_memory().unwrap();
        let manager = MasterPasswordManager::new(Arc::new(Mutex::new(conn)));
        manager.init_table().unwrap();
        manager.setup("alpha-beta-unique-phrase").unwrap(); // gitleaks:allow
        manager.lock();
        MasterPasswordEncryption::new(Arc::new(Mutex::new(manager)))
    }

    #[test]
    fn encrypt_then_decrypt_round_trips() {
        let helper = unlocked_helper();
        let plaintext = "sk-test-very-secret"; // gitleaks:allow
        let cipher = helper
            .encrypt(KeyPurpose::McpCredentials, plaintext)
            .unwrap();
        let recovered = helper.decrypt(KeyPurpose::McpCredentials, &cipher).unwrap();
        assert_eq!(recovered, plaintext);
    }

    #[test]
    fn encrypt_fails_when_locked() {
        let helper = locked_helper();
        let err = helper
            .encrypt(KeyPurpose::McpCredentials, "x")
            .expect_err("locked vault must refuse encryption");
        assert!(matches!(err, MasterPasswordError::AppLocked), "{err:?}");
    }

    #[test]
    fn decrypt_fails_when_locked() {
        let helper = locked_helper();
        let err = helper
            .decrypt(KeyPurpose::McpCredentials, "AAAA")
            .expect_err("locked vault must refuse decryption");
        assert!(matches!(err, MasterPasswordError::AppLocked), "{err:?}");
    }

    #[test]
    fn ciphertext_does_not_decrypt_under_different_purpose() {
        let helper = unlocked_helper();
        let cipher = helper
            .encrypt(KeyPurpose::McpCredentials, "secret")
            .unwrap();
        let err = helper
            .decrypt(KeyPurpose::Messaging, &cipher)
            .expect_err("cross-purpose decrypt must fail");
        assert!(
            matches!(err, MasterPasswordError::CryptoError(_)),
            "{err:?}"
        );
    }

    #[test]
    fn corrupted_ciphertext_returns_descriptive_error() {
        let helper = unlocked_helper();
        let err = helper
            .decrypt(KeyPurpose::McpCredentials, "this-is-not-base64!!")
            .expect_err("garbage input must fail");
        assert!(matches!(err, MasterPasswordError::CryptoError(_)), "{err:?}");
    }

    #[test]
    fn ciphertext_shorter_than_nonce_is_rejected() {
        let helper = unlocked_helper();
        let too_short = general_purpose::STANDARD.encode([0_u8; 4]);
        let err = helper
            .decrypt(KeyPurpose::McpCredentials, &too_short)
            .expect_err("ciphertext shorter than nonce must fail");
        assert!(
            matches!(&err, MasterPasswordError::CryptoError(msg) if msg.contains("too short")),
            "{err:?}"
        );
    }

    #[test]
    fn is_unlocked_reflects_manager_state() {
        let unlocked = unlocked_helper();
        assert!(unlocked.is_unlocked());

        let locked = locked_helper();
        assert!(!locked.is_unlocked());
    }
}
