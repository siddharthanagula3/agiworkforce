//! File encryption at rest with AES-256-GCM under a caller-supplied key.

use super::aead_nonce::random_nonce;
use super::machine_key;
use aes_gcm::{
    aead::{Aead, KeyInit, OsRng},
    Aes256Gcm, Nonce,
};

const NONCE_SIZE: usize = 12;
const SALT_SIZE: usize = 32;

#[allow(deprecated)]
fn decrypt_aes_gcm(key: &[u8], nonce_bytes: &[u8], ciphertext: &[u8]) -> Option<Vec<u8>> {
    if nonce_bytes.len() != NONCE_SIZE {
        return None;
    }
    let cipher = Aes256Gcm::new_from_slice(key).ok()?;
    cipher
        .decrypt(Nonce::from_slice(nonce_bytes), ciphertext)
        .ok()
}

/// Open a payload with the machine-only keys an older build derived for the
/// same purpose as `key`.
///
/// The fallback is offered only for a key this process currently derives, so a
/// caller-supplied key can never turn this into a machine-only decryption
/// oracle. Reading such a payload does not weaken it, its key was already
/// reproducible by any local process, and it stays reported through
/// `machine_key::has_machine_only_secrets` until it is written again.
fn open_with_legacy_machine_keys<T>(
    key: &[u8],
    mut open: impl FnMut(&[u8]) -> Option<T>,
) -> Option<T> {
    let (purpose, legacy_keys) = machine_key::legacy_keys_for_current_key(key)?;
    let opened = legacy_keys.iter().find_map(|legacy| open(legacy))?;
    machine_key::record_machine_only_payload(purpose.as_str());
    tracing::warn!(
        "Read a {} payload still wrapped under the legacy machine-only key; \
         it stays reproducible by any local process until it is written again.",
        purpose.as_str()
    );
    Some(opened)
}

/// Generate cryptographically secure random salt
fn generate_salt() -> Vec<u8> {
    use aes_gcm::aead::rand_core::RngCore;
    let mut salt = vec![0u8; SALT_SIZE];
    OsRng.fill_bytes(&mut salt);
    salt
}

/// Encrypt file at rest with AES-256-GCM using a provided key
pub fn encrypt_file_with_key(
    input_path: &str,
    output_path: &str,
    key: &[u8],
) -> Result<(), String> {
    use std::fs;

    let plaintext = fs::read(input_path).map_err(|e| format!("Failed to read file: {}", e))?;

    let cipher =
        Aes256Gcm::new_from_slice(key).map_err(|e| format!("Failed to create cipher: {}", e))?;

    let nonce = random_nonce();

    let ciphertext = cipher
        .encrypt(&nonce, plaintext.as_ref())
        .map_err(|e| format!("Encryption failed: {}", e))?;

    // Format: [salt (32 bytes)][nonce (12 bytes)][ciphertext]
    // Write a random salt to maintain format compatibility with decrypt_file_with_key
    // (which skips the salt field) and avoid leaking the encryption path used.
    let dummy_salt = generate_salt();

    let mut output = Vec::new();
    output.extend_from_slice(&dummy_salt);
    output.extend_from_slice(nonce.as_slice());
    output.extend_from_slice(&ciphertext);

    fs::write(output_path, output).map_err(|e| format!("Failed to write encrypted file: {}", e))?;

    Ok(())
}

/// Decrypt file with AES-256-GCM using a provided key
pub fn decrypt_file_with_key(
    input_path: &str,
    output_path: &str,
    key: &[u8],
) -> Result<(), String> {
    use std::fs;

    let encrypted_data = fs::read(input_path).map_err(|e| format!("Failed to read file: {}", e))?;

    if encrypted_data.len() < SALT_SIZE + NONCE_SIZE {
        return Err("Invalid encrypted file format".to_string());
    }

    // Parse: [salt (32 bytes)][nonce (12 bytes)][ciphertext]
    // We ignore salt because we are provided the key directly
    let _salt = &encrypted_data[0..SALT_SIZE];
    let nonce_bytes = &encrypted_data[SALT_SIZE..SALT_SIZE + NONCE_SIZE];
    let ciphertext = &encrypted_data[SALT_SIZE + NONCE_SIZE..];

    // Files an older build encrypted under the machine-only key (cloud E2EE
    // uploads above all) have no second copy anywhere. Rotating the purpose key
    // must not make them permanently unreadable.
    let plaintext = decrypt_aes_gcm(key, nonce_bytes, ciphertext)
        .or_else(|| {
            open_with_legacy_machine_keys(key, |legacy| {
                decrypt_aes_gcm(legacy, nonce_bytes, ciphertext)
            })
        })
        .ok_or_else(|| "Decryption failed".to_string())?;

    crate::sys::utils::write_file_without_following(std::path::Path::new(output_path), &plaintext)
        .map_err(|e| format!("Failed to write decrypted file: {}", e))?;

    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::sys::security::machine_key::KeyPurpose;

    const KEY_SIZE: usize = 32;

    /// F5/F12 migration: a cloud E2EE file an older build wrote under the
    /// machine_key machine-only derivation has no second copy anywhere, so
    /// rotating the purpose key must not make it permanently unreadable.
    #[test]
    fn legacy_machine_key_encrypted_file_still_decrypts_after_key_rotation() {
        use std::fs;
        use tempfile::tempdir;

        let purpose = KeyPurpose::CloudEncryption;
        let legacy_key = machine_key::legacy_machine_only_keys(purpose)
            .first()
            .copied()
            .expect("a legacy candidate always exists");
        let current_key =
            machine_key::try_derive_key(purpose).expect("install secret available in tests");
        assert_ne!(legacy_key.as_slice(), current_key.as_slice());

        let dir = tempdir().expect("temp dir");
        let plain = dir.path().join("upload.txt");
        let encrypted = dir.path().join("upload.enc");
        let restored = dir.path().join("download.txt");
        fs::write(&plain, b"end-to-end encrypted payload").expect("seed plaintext");

        encrypt_file_with_key(
            plain.to_str().expect("path"),
            encrypted.to_str().expect("path"),
            &legacy_key,
        )
        .expect("encrypt under the legacy machine-only key");

        decrypt_file_with_key(
            encrypted.to_str().expect("path"),
            restored.to_str().expect("path"),
            &current_key,
        )
        .expect("the rotated key must still open a legacy machine-only file");
        assert_eq!(
            fs::read(&restored).expect("read restored file"),
            b"end-to-end encrypted payload"
        );
        assert!(machine_key::has_machine_only_secrets());

        // An arbitrary key must never reach the machine-only fallback.
        let stray = dir.path().join("stray.txt");
        assert!(decrypt_file_with_key(
            encrypted.to_str().expect("path"),
            stray.to_str().expect("path"),
            &[0x33u8; KEY_SIZE],
        )
        .is_err());
        assert!(!stray.exists());
    }
}
