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
//! - Each purpose is derived once per process and cached in memory; changing
//!   the installation identity invalidates the cache
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
use std::collections::HashMap;
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
            KeyPurpose::ConnectorPermissions => "connector_permissions",
        }
    }
}

/// Global instance of the machine key manager
static MACHINE_KEY_MANAGER: Lazy<MachineKeyManager> = Lazy::new(MachineKeyManager::new);

/// Machine key manager that derives encryption keys from machine identifiers
pub struct MachineKeyManager {
    machine_id: String,
    state: RwLock<MachineKeyState>,
}

struct MachineKeyState {
    install_id: Option<String>,
    derived_keys: HashMap<KeyPurpose, [u8; KEY_SIZE]>,
}

impl MachineKeyManager {
    /// Create a new machine key manager
    fn new() -> Self {
        let machine_id = Self::get_machine_id();
        Self {
            machine_id,
            state: RwLock::new(MachineKeyState {
                install_id: None,
                derived_keys: HashMap::new(),
            }),
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
        if let Ok(mut state) = self.state.safe_write() {
            if state.install_id.as_ref() != Some(&id) {
                state.install_id = Some(id);
                state.derived_keys.clear();
            }
        }
    }

    /// Get or generate the install ID
    pub fn get_install_id(&self) -> String {
        self.state
            .safe_read()
            .ok()
            .and_then(|state| state.install_id.clone())
            .unwrap_or_else(|| self.fallback_install_id())
    }

    /// Derive an encryption key for a specific purpose
    pub fn derive_key(&self, purpose: KeyPurpose) -> Vec<u8> {
        if let Ok(mut state) = self.state.safe_write() {
            if let Some(key) = state.derived_keys.get(&purpose) {
                return key.to_vec();
            }

            // PBKDF2 is intentionally expensive. Hold the write lock while it
            // runs so concurrent startup services cannot duplicate the same
            // 600,000-round derivation before the cache is populated.
            let install_id = state
                .install_id
                .clone()
                .unwrap_or_else(|| self.fallback_install_id());
            let key = self.derive_key_for_install_id(&install_id, purpose);
            state.derived_keys.insert(purpose, key);
            return key.to_vec();
        }

        // A poisoned cache lock must not make encrypted data unavailable.
        // Derive without caching as a fail-closed compatibility fallback.
        self.derive_key_for_install_id(&self.get_install_id(), purpose)
            .to_vec()
    }

    fn fallback_install_id(&self) -> String {
        Self::fallback_install_id_for_machine(&self.machine_id)
    }

    fn fallback_install_id_for_machine(machine_id: &str) -> String {
        use sha2::{Digest, Sha256};

        let mut hasher = Sha256::new();
        hasher.update(machine_id.as_bytes());
        hasher.update(b"install_id_fallback");
        hex::encode(hasher.finalize())
    }

    fn derive_key_for_install_id(&self, install_id: &str, purpose: KeyPurpose) -> [u8; KEY_SIZE] {
        Self::derive_key_for_machine_and_install(&self.machine_id, install_id, purpose)
    }

    fn derive_key_for_machine_and_install(
        machine_id: &str,
        install_id: &str,
        purpose: KeyPurpose,
    ) -> [u8; KEY_SIZE] {
        let salt = format!(
            "{}:{}:{}:{}",
            machine_id,
            APP_BUNDLE_ID,
            install_id,
            purpose.as_str()
        );

        pbkdf2_hmac_array::<Sha256, KEY_SIZE>(
            machine_id.as_bytes(),
            salt.as_bytes(),
            PBKDF2_ITERATIONS,
        )
    }

    fn derive_legacy_database_key_for_machine(machine_id: &str) -> [u8; KEY_SIZE] {
        let install_id = Self::fallback_install_id_for_machine(machine_id);
        Self::derive_key_for_machine_and_install(
            machine_id,
            &install_id,
            KeyPurpose::DatabaseEncryption,
        )
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

/// Return every source-backed key that a pre-Keychain Desktop build could have
/// derived for the main database on this machine.
///
/// The old macOS implementation used `machine-uid`, which shells out to
/// `ioreg`. App Sandbox can deny that subprocess even though reading the same
/// IORegistry property directly is permitted. Keep both derivations so a
/// packaged app can perform a read-only proof against databases created by
/// either execution environment. Callers must never persist or use a candidate
/// unless SQLCipher successfully reads the existing database with it.
pub fn legacy_database_key_candidates() -> Vec<[u8; KEY_SIZE]> {
    let mut machine_ids = vec![MACHINE_KEY_MANAGER.machine_id.clone()];

    let fallback_machine_id = MachineKeyManager::get_fallback_machine_id();
    if !machine_ids.contains(&fallback_machine_id) {
        machine_ids.push(fallback_machine_id);
    }

    #[cfg(target_os = "macos")]
    if let Some(platform_uuid) = macos_platform_uuid() {
        if !machine_ids.contains(&platform_uuid) {
            machine_ids.push(platform_uuid);
        }
    }

    let mut keys = Vec::with_capacity(machine_ids.len());
    for machine_id in machine_ids {
        let key = MachineKeyManager::derive_legacy_database_key_for_machine(&machine_id);
        if !keys.contains(&key) {
            keys.push(key);
        }
    }
    keys
}

/// Read the hardware UUID through IOKit without spawning `ioreg`.
///
/// IORegistry reads are available to sandboxed macOS applications. The
/// CoreFoundation type check prevents treating an unexpected property value as
/// a string, and both owned IOKit/CoreFoundation references are released on
/// every path.
#[cfg(target_os = "macos")]
#[allow(unsafe_code)]
fn macos_platform_uuid() -> Option<String> {
    use core_foundation::base::{kCFAllocatorDefault, CFGetTypeID, CFRelease, TCFType};
    use core_foundation::string::{CFString, CFStringRef};
    use io_kit_sys::types::IO_OBJECT_NULL;

    unsafe {
        let matching = io_kit_sys::IOServiceMatching(c"IOPlatformExpertDevice".as_ptr());
        if matching.is_null() {
            return None;
        }

        // IOServiceGetMatchingService consumes the matching dictionary.
        let service =
            io_kit_sys::IOServiceGetMatchingService(io_kit_sys::kIOMasterPortDefault, matching);
        if service == IO_OBJECT_NULL {
            return None;
        }

        let property_name = CFString::new("IOPlatformUUID");
        let property = io_kit_sys::IORegistryEntryCreateCFProperty(
            service,
            property_name.as_concrete_TypeRef(),
            kCFAllocatorDefault,
            0,
        );
        let _ = io_kit_sys::IOObjectRelease(service);

        if property.is_null() {
            return None;
        }

        if CFGetTypeID(property) != CFString::type_id() {
            CFRelease(property);
            return None;
        }

        let value = CFString::wrap_under_create_rule(property as CFStringRef)
            .to_string()
            .trim()
            .to_string();
        (!value.is_empty()).then_some(value)
    }
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
    fn legacy_database_candidates_include_current_derivation_without_duplicates() {
        let current: [u8; KEY_SIZE] = derive_key(KeyPurpose::DatabaseEncryption)
            .try_into()
            .expect("database key length");
        let candidates = legacy_database_key_candidates();

        assert!(candidates.contains(&current));
        assert!(candidates
            .iter()
            .all(|candidate| candidate.len() == KEY_SIZE));
        for (index, candidate) in candidates.iter().enumerate() {
            assert!(
                !candidates[..index].contains(candidate),
                "legacy candidates must be deduplicated"
            );
        }
    }

    #[cfg(target_os = "macos")]
    #[test]
    fn direct_iokit_platform_uuid_matches_legacy_machine_uid_when_available() {
        let Some(direct_uuid) = macos_platform_uuid() else {
            panic!("IOPlatformUUID should be readable directly through IOKit");
        };

        if let Ok(legacy_uuid) = machine_uid::get() {
            assert_eq!(direct_uuid, legacy_uuid);
        }
    }

    #[test]
    fn test_install_id() {
        let manager = MachineKeyManager::new();

        // Default install ID should work
        let id1 = manager.get_install_id();
        assert!(!id1.is_empty());

        // Populate the per-purpose cache, then prove changing installation
        // identity invalidates it before any subsequent encrypted open.
        let _ = manager.derive_key(KeyPurpose::DatabaseEncryption);
        assert_eq!(
            manager
                .state
                .safe_read()
                .expect("machine key state")
                .derived_keys
                .len(),
            1
        );

        manager.set_install_id("test_install_123".to_string());
        let id2 = manager.get_install_id();
        assert_eq!(id2, "test_install_123");
        assert!(manager
            .state
            .safe_read()
            .expect("machine key state")
            .derived_keys
            .is_empty());
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
