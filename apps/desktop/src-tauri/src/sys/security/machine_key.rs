//! Machine-derived encryption key management
//!
//! This module provides deterministic encryption keys derived from machine-specific
//! identifiers. This replaces the keyring-based approach which required user permission
//! prompts on macOS and other platforms.
//!
//! # Security Model
//! - Master key is derived from machine_id + app_bundle_id + install_id using PBKDF2
//! - The key is deterministic per machine, meaning secrets encrypted on one machine
//!   cannot be decrypted on another
//! - This provides "good enough" security for desktop app secrets while avoiding
//!   permission prompts
//!
//! # Key Derivation
//! - Uses PBKDF2-HMAC-SHA256 with 600,000 iterations (OWASP recommendation)
//! - Salt is derived from machine_id to ensure consistency across restarts
//! - Different key purposes get different derived keys via key stretching
//!
//! # Password-Based Derivation (SECSYS-001)
//! For enhanced security, use `derive_key_with_password()` which combines:
//! - User's master password (Argon2id hashed)
//! - Machine-specific identifiers
//! - Purpose-specific HKDF derivation
//!
//! The password-based approach should be preferred for sensitive secrets.
//! Machine-only derivation remains available for backward compatibility during migration.

use crate::core::sync_utils::RwLockExt;
use base64::{engine::general_purpose, Engine as _};
use hmac::{Hmac, Mac};
use once_cell::sync::Lazy;
use pbkdf2::pbkdf2_hmac_array;
use sha2::Sha256;
use std::sync::RwLock;

const PBKDF2_ITERATIONS: u32 = 600_000;
const KEY_SIZE: usize = 32; // AES-256
const APP_BUNDLE_ID: &str = "com.agiworkforce.desktop";

/// Different purposes for derived keys
#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash)]
pub enum KeyPurpose {
    /// For encrypting JWT secrets stored in database
    JwtSecret,
    /// For encrypting database content (settings, etc.)
    DatabaseEncryption,
    /// For encrypting MCP credentials
    McpCredentials,
    /// For encrypting API keys
    ApiKeys,
    /// For master encryption (general purpose)
    MasterEncryption,
    /// For encrypting email account credentials
    EmailCredentials,
    /// For encrypting calendar account credentials
    CalendarCredentials,
    /// For encrypting cloud sync payloads
    CloudEncryption,
    /// For encrypting Slack/WhatsApp/Teams credentials (FIX-002).
    /// Single flat variant intentionally — all three platforms ride on the
    /// same master-password-derived key; per-platform separation is theatre
    /// when one master key controls every purpose anyway.
    Messaging,
    /// For encrypting Supabase auth tokens stored in the Tauri vault
    /// instead of localStorage (FIX-004).
    SupabaseAuth,
    /// For encrypting per-tool connector permission records stored at
    /// `~/.agiworkforce/connector-permissions.json` (Desktop P0, audit C-rank 1).
    ConnectorPermissions,
}

impl KeyPurpose {
    /// Get the string representation of this key purpose
    pub fn as_str(&self) -> &'static str {
        match self {
            KeyPurpose::JwtSecret => "jwt_secret",
            KeyPurpose::DatabaseEncryption => "db_encryption",
            KeyPurpose::McpCredentials => "mcp_credentials",
            KeyPurpose::ApiKeys => "api_keys",
            KeyPurpose::MasterEncryption => "master_encryption",
            KeyPurpose::EmailCredentials => "email_credentials",
            KeyPurpose::CalendarCredentials => "calendar_credentials",
            KeyPurpose::CloudEncryption => "cloud_encryption",
            KeyPurpose::Messaging => "messaging",
            KeyPurpose::SupabaseAuth => "supabase_auth",
            KeyPurpose::ConnectorPermissions => "connector_permissions",
        }
    }
}

/// Global instance of the machine key manager
static MACHINE_KEY_MANAGER: Lazy<MachineKeyManager> = Lazy::new(MachineKeyManager::new);

/// Machine key manager that derives encryption keys from machine identifiers
pub struct MachineKeyManager {
    machine_id: String,
    install_id: RwLock<Option<String>>,
}

impl MachineKeyManager {
    /// Create a new machine key manager
    fn new() -> Self {
        let machine_id = Self::get_machine_id();
        Self {
            machine_id,
            install_id: RwLock::new(None),
        }
    }

    /// Get the machine ID using platform-specific methods
    fn get_machine_id() -> String {
        // Try to get machine ID from the machine-uid crate
        match machine_uid::get() {
            Ok(id) => id,
            Err(_) => {
                // Fallback: use a combination of hostname and other identifiers
                Self::get_fallback_machine_id()
            }
        }
    }

    /// Fallback machine ID generation when machine-uid fails
    fn get_fallback_machine_id() -> String {
        use sha2::{Digest, Sha256};

        let mut hasher = Sha256::new();

        // Add hostname
        if let Ok(hostname) = hostname::get() {
            hasher.update(hostname.to_string_lossy().as_bytes());
        }

        // Add home directory path (unique per user)
        if let Some(home) = dirs::home_dir() {
            hasher.update(home.to_string_lossy().as_bytes());
        }

        // Add data directory path
        if let Some(data) = dirs::data_dir() {
            hasher.update(data.to_string_lossy().as_bytes());
        }

        // Add constant to make it app-specific
        hasher.update(APP_BUNDLE_ID.as_bytes());

        let result = hasher.finalize();
        general_purpose::STANDARD.encode(result)
    }

    /// Set the install ID (should be called during app initialization)
    /// This ID is stored in the database and used for additional entropy
    pub fn set_install_id(&self, id: String) {
        if let Ok(mut install_id) = self.install_id.safe_write() {
            *install_id = Some(id);
        }
    }

    /// Get or generate the install ID
    pub fn get_install_id(&self) -> String {
        let install_id = self
            .install_id
            .safe_read()
            .ok()
            .and_then(|guard| guard.clone());
        install_id.unwrap_or_else(|| {
            // If not set, generate a deterministic one from machine_id
            use sha2::{Digest, Sha256};
            let mut hasher = Sha256::new();
            hasher.update(self.machine_id.as_bytes());
            hasher.update(b"install_id_fallback");
            hex::encode(hasher.finalize())
        })
    }

    /// Derive an encryption key for a specific purpose
    pub fn derive_key(&self, purpose: KeyPurpose) -> Vec<u8> {
        let install_id = self.get_install_id();

        // Create a unique salt for this purpose
        let salt = format!(
            "{}:{}:{}:{}",
            self.machine_id,
            APP_BUNDLE_ID,
            install_id,
            purpose.as_str()
        );

        // Derive key using PBKDF2
        let key: [u8; KEY_SIZE] = pbkdf2_hmac_array::<Sha256, KEY_SIZE>(
            self.machine_id.as_bytes(),
            salt.as_bytes(),
            PBKDF2_ITERATIONS,
        );

        key.to_vec()
    }

    /// Get a base64-encoded key for a specific purpose
    pub fn derive_key_base64(&self, purpose: KeyPurpose) -> String {
        general_purpose::STANDARD.encode(self.derive_key(purpose))
    }
}

// Public API functions

/// Get the global machine key manager instance
pub fn get_manager() -> &'static MachineKeyManager {
    &MACHINE_KEY_MANAGER
}

/// Derive an encryption key for a specific purpose
pub fn derive_key(purpose: KeyPurpose) -> Vec<u8> {
    MACHINE_KEY_MANAGER.derive_key(purpose)
}

/// Derive an encryption key and return as base64
pub fn derive_key_base64(purpose: KeyPurpose) -> String {
    MACHINE_KEY_MANAGER.derive_key_base64(purpose)
}

/// Set the install ID for the key manager
pub fn set_install_id(id: String) {
    MACHINE_KEY_MANAGER.set_install_id(id);
}

/// Get the current machine ID (for debugging/display purposes only)
pub fn get_machine_id_hash() -> String {
    use sha2::{Digest, Sha256};
    let mut hasher = Sha256::new();
    hasher.update(MACHINE_KEY_MANAGER.machine_id.as_bytes());
    // Return truncated hash for privacy
    hex::encode(&hasher.finalize()[..8])
}

/// Derive an encryption key using a password combined with machine ID (SECSYS-001)
///
/// This function provides enhanced security by combining:
/// 1. User-provided password (hashed with Argon2id)
/// 2. Machine-specific identifiers
/// 3. Purpose-specific HKDF derivation
///
/// # Arguments
/// * `password_key` - The Argon2id-derived key from the user's password
/// * `purpose` - The purpose for which the key will be used
///
/// # Returns
/// A 32-byte encryption key derived from both password and machine identity
///
/// # Security Note
/// This should be the preferred method for deriving keys for sensitive secrets.
/// The old `derive_key()` function remains for backward compatibility during migration.
pub fn derive_key_with_password(password_key: &[u8], purpose: KeyPurpose) -> Vec<u8> {
    let install_id = MACHINE_KEY_MANAGER.get_install_id();

    // Combine password key with machine identifiers
    let mut combined = password_key.to_vec();
    combined.extend_from_slice(MACHINE_KEY_MANAGER.machine_id.as_bytes());
    combined.extend_from_slice(install_id.as_bytes());
    combined.extend_from_slice(APP_BUNDLE_ID.as_bytes());

    // Create purpose-specific info string for HKDF
    let info = format!("agiworkforce:password_derived:{}:v1", purpose.as_str());

    // HKDF-Extract: PRK = HMAC(salt, IKM)
    let salt = b"com.agiworkforce.desktop:password_key:v1";
    // SAFETY: HMAC-SHA256 accepts any key size per RFC 2104 — new_from_slice cannot fail.
    let mut extract_hmac = <Hmac<Sha256> as Mac>::new_from_slice(salt)
        .expect("HMAC-SHA256 accepts any key size (RFC 2104)");
    extract_hmac.update(&combined);
    let prk = extract_hmac.finalize().into_bytes();

    // HKDF-Expand: OKM = HMAC(PRK, info || 0x01)
    let mut expand_hmac = <Hmac<Sha256> as Mac>::new_from_slice(&prk)
        .expect("HMAC-SHA256 accepts any key size (RFC 2104)");
    expand_hmac.update(info.as_bytes());
    expand_hmac.update(&[0x01]);
    let okm = expand_hmac.finalize().into_bytes();

    okm[..KEY_SIZE].to_vec()
}

/// Derive an encryption key with password and return as base64
pub fn derive_key_with_password_base64(password_key: &[u8], purpose: KeyPurpose) -> String {
    general_purpose::STANDARD.encode(derive_key_with_password(password_key, purpose))
}

/// Returns whether machine-only secrets exist that need migration.
///
/// Always returns `false` — migration tracking is handled by `MasterPasswordManager`.
/// This method exists for API compatibility and may be implemented in the future.
pub fn has_machine_only_secrets() -> bool {
    false
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_key_derivation() {
        let key1 = derive_key(KeyPurpose::JwtSecret);
        let key2 = derive_key(KeyPurpose::DatabaseEncryption);

        // Keys should be 32 bytes (256 bits)
        assert_eq!(key1.len(), 32);
        assert_eq!(key2.len(), 32);

        // Different purposes should produce different keys
        assert_ne!(key1, key2);
    }

    #[test]
    fn test_key_consistency() {
        // Keys should be deterministic
        let key1 = derive_key(KeyPurpose::JwtSecret);
        let key2 = derive_key(KeyPurpose::JwtSecret);
        assert_eq!(key1, key2);
    }

    #[test]
    fn test_install_id() {
        let manager = MachineKeyManager::new();

        // Default install ID should work
        let id1 = manager.get_install_id();
        assert!(!id1.is_empty());

        // Setting install ID should change it
        manager.set_install_id("test_install_123".to_string());
        let id2 = manager.get_install_id();
        assert_eq!(id2, "test_install_123");
    }

    #[test]
    fn test_key_base64() {
        let key = derive_key_base64(KeyPurpose::MasterEncryption);

        // Should be valid base64
        assert!(general_purpose::STANDARD.decode(&key).is_ok());

        // Decoded should be 32 bytes
        let decoded = general_purpose::STANDARD.decode(&key).unwrap();
        assert_eq!(decoded.len(), 32);
    }
}
