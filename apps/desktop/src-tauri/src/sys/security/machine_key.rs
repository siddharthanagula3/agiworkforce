//! Encryption-key management for locally stored secrets.
//!
//! # Security Model
//! - A 256-bit per-install secret is generated once with the operating-system
//!   CSPRNG and kept in the OS credential service. It is the only secret input
//!   to every purpose-derived key.
//! - Machine identifiers bind a key to this machine. They are readable by any
//!   unprivileged local process, so they are never treated as secret material.
//! - Without the per-install secret no key is produced: callers receive an
//!   error instead of a key that a local process could recompute.
//! - Each purpose is derived once per process and cached in memory; replacing
//!   the install secret invalidates the cache.
//!
//! # Legacy Machine-Only Keys
//! Builds before the per-install secret derived keys from `machine_id` alone.
//! Those keys are still reproducible through [`legacy_machine_only_keys`], but
//! only so data written by those builds can be read once and re-wrapped under
//! the current key. They must never encrypt anything new.
//!
//! # Password-Based Derivation (SECSYS-001)
//! [`derive_key_with_password`] combines the user's master password with the
//! machine identity and remains the preferred path wherever a master password
//! exists.

use crate::core::sync_utils::RwLockExt;
use base64::{engine::general_purpose, Engine as _};
use hmac::{Hmac, Mac};
use once_cell::sync::Lazy;
use pbkdf2::pbkdf2_hmac_array;
use rand::{rngs::OsRng, RngCore};
use sha2::{Digest, Sha256};
use std::collections::{BTreeSet, HashMap};
use std::sync::RwLock;

const PBKDF2_ITERATIONS: u32 = 600_000;
const KEY_SIZE: usize = 32; // AES-256
const APP_BUNDLE_ID: &str = "com.agiworkforce.desktop";

/// Length of the CSPRNG-generated per-install secret.
pub const INSTALL_SECRET_BYTES: usize = 32;
const INSTALL_SECRET_KEYRING_ACCOUNT: &str = "install-secret-v1";
const INSTALL_SECRET_HARNESS_ENV: &str = "AGI_DESKTOP_WDIO_INSTALL_SECRET";
const DATABASE_KEY_HARNESS_ENV: &str = "AGI_DESKTOP_WDIO_DATABASE_KEY";

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
    Messaging,
    /// For encrypting per-tool connector permission records stored at
    /// `~/.agiworkforce/connector-permissions.json` (Desktop P0, audit C-rank 1).
    ConnectorPermissions,
}

impl KeyPurpose {
    /// Every purpose this manager can derive a key for.
    pub const ALL: [KeyPurpose; 10] = [
        KeyPurpose::JwtSecret,
        KeyPurpose::DatabaseEncryption,
        KeyPurpose::McpCredentials,
        KeyPurpose::ApiKeys,
        KeyPurpose::MasterEncryption,
        KeyPurpose::EmailCredentials,
        KeyPurpose::CalendarCredentials,
        KeyPurpose::CloudEncryption,
        KeyPurpose::Messaging,
        KeyPurpose::ConnectorPermissions,
    ];

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

/// Why a purpose key could not be derived.
#[derive(Debug, thiserror::Error, PartialEq, Eq)]
pub enum KeyDerivationError {
    #[error(
        "no per-install encryption secret is available; secure storage must supply one before \
         local secrets can be read or written"
    )]
    MissingInstallSecret,
    #[error("the derived-key cache is unavailable")]
    KeyCacheUnavailable,
}

/// Failures from the secure store that holds the per-install secret.
#[derive(Debug, thiserror::Error)]
pub enum InstallSecretError {
    #[error("secure install-secret storage is unavailable: {0}")]
    SecureStorage(String),
    #[error(
        "secure install-secret storage returned {actual} bytes; expected {INSTALL_SECRET_BYTES}"
    )]
    InvalidStoredSecret { actual: usize },
    #[error("operating-system random generation failed: {0}")]
    RandomGeneration(String),
    #[error("the application bundle identifier is not valid for secure install-secret storage")]
    InvalidBundleIdentifier,
}

/// Secure-storage boundary for the per-install secret.
pub trait InstallSecretStore {
    fn load(&self) -> Result<Option<[u8; INSTALL_SECRET_BYTES]>, InstallSecretError>;
    fn store(&self, secret: &[u8; INSTALL_SECRET_BYTES]) -> Result<(), InstallSecretError>;
}

/// Operating-system credential storage, namespaced by bundle identity.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct OsInstallSecretStore {
    service: String,
}

impl OsInstallSecretStore {
    /// Build a credential namespace from the actual Tauri bundle identity.
    ///
    /// Debug, WDIO, demo, and production bundles must never share an install
    /// secret. Apple's bundle-identifier character rules also prevent treating
    /// an arbitrary path or user-controlled string as a Keychain namespace.
    pub fn for_bundle_identifier(identifier: &str) -> Result<Self, InstallSecretError> {
        if !is_valid_bundle_identifier(identifier) {
            return Err(InstallSecretError::InvalidBundleIdentifier);
        }

        Ok(Self {
            service: identifier.to_string(),
        })
    }

    fn entry(&self) -> Result<keyring::Entry, InstallSecretError> {
        keyring::Entry::new(&self.service, INSTALL_SECRET_KEYRING_ACCOUNT)
            .map_err(|error| InstallSecretError::SecureStorage(error.to_string()))
    }

    /// Secret supplied by the automated-E2E harness instead of the Keychain.
    ///
    /// Reading a Keychain item blocks on a GUI approval dialog whenever the
    /// requesting binary's signature is unknown, and every `cargo build`
    /// re-signs the debug binary. Under WDIO nobody can click Allow.
    ///
    /// The escape hatch is deliberately narrow: it applies ONLY to the
    /// isolated `*.wdio` bundle identifier, which is never shipped and owns a
    /// throwaway app-data directory. A production or BYOK bundle ignores the
    /// variable entirely, so no shipped trust boundary depends on it.
    ///
    /// The harness already exports its throwaway SQLCipher key, so the install
    /// secret is derived from that when no dedicated variable is set. A WDIO
    /// run therefore needs no new configuration to avoid the Keychain dialog.
    fn harness_secret(&self) -> Option<[u8; INSTALL_SECRET_BYTES]> {
        if !self.service.ends_with(".wdio") {
            return None;
        }

        if let Some(secret) = hex_secret_from_env(INSTALL_SECRET_HARNESS_ENV) {
            return Some(secret);
        }

        let database_key = std::env::var(DATABASE_KEY_HARNESS_ENV).ok()?;
        let database_key = database_key.trim();
        if database_key.is_empty() {
            return None;
        }

        Some(hkdf_sha256(
            self.service.as_bytes(),
            database_key.as_bytes(),
            b"agiworkforce:wdio_install_secret:v1",
        ))
    }
}

fn hex_secret_from_env(name: &str) -> Option<[u8; INSTALL_SECRET_BYTES]> {
    let raw = std::env::var(name).ok()?;
    let trimmed = raw.trim();
    if trimmed.is_empty() {
        return None;
    }
    if trimmed.len() != INSTALL_SECRET_BYTES * 2 {
        tracing::warn!(
            "{name} must be {} hex characters; ignoring it",
            INSTALL_SECRET_BYTES * 2
        );
        return None;
    }

    let mut secret = [0u8; INSTALL_SECRET_BYTES];
    for (index, slot) in secret.iter_mut().enumerate() {
        let byte = trimmed.get(index * 2..index * 2 + 2)?;
        *slot = u8::from_str_radix(byte, 16).ok()?;
    }
    Some(secret)
}

impl InstallSecretStore for OsInstallSecretStore {
    fn load(&self) -> Result<Option<[u8; INSTALL_SECRET_BYTES]>, InstallSecretError> {
        if let Some(secret) = self.harness_secret() {
            return Ok(Some(secret));
        }

        let secret = match self.entry()?.get_secret() {
            Ok(secret) => secret,
            Err(keyring::Error::NoEntry) => return Ok(None),
            Err(error) => return Err(InstallSecretError::SecureStorage(error.to_string())),
        };

        let actual = secret.len();
        secret
            .try_into()
            .map(Some)
            .map_err(|_| InstallSecretError::InvalidStoredSecret { actual })
    }

    fn store(&self, secret: &[u8; INSTALL_SECRET_BYTES]) -> Result<(), InstallSecretError> {
        // The harness secret is supplied per run and owns a throwaway profile;
        // writing it back would put an E2E secret in the user's Keychain.
        if self.harness_secret().is_some() {
            return Ok(());
        }

        self.entry()?
            .set_secret(secret)
            .map_err(|error| InstallSecretError::SecureStorage(error.to_string()))
    }
}

fn is_valid_bundle_identifier(identifier: &str) -> bool {
    if identifier.len() < 3 || identifier.len() > 255 || !identifier.contains('.') {
        return false;
    }

    identifier.split('.').all(|segment| {
        let bytes = segment.as_bytes();
        !bytes.is_empty()
            && bytes.first().is_some_and(u8::is_ascii_alphanumeric)
            && bytes.last().is_some_and(u8::is_ascii_alphanumeric)
            && bytes
                .iter()
                .all(|byte| byte.is_ascii_alphanumeric() || *byte == b'-')
    })
}

/// Read the per-install secret from secure storage, generating and persisting
/// one on first launch.
///
/// The secret is persisted before it is returned, so an interrupted first
/// launch cannot leave data encrypted under a secret nobody can load again.
pub fn load_or_create_install_secret<S: InstallSecretStore>(
    store: &S,
) -> Result<[u8; INSTALL_SECRET_BYTES], InstallSecretError> {
    if let Some(secret) = store.load()? {
        return Ok(secret);
    }

    let mut secret = [0u8; INSTALL_SECRET_BYTES];
    OsRng
        .try_fill_bytes(&mut secret)
        .map_err(|error| InstallSecretError::RandomGeneration(error.to_string()))?;
    store.store(&secret)?;
    Ok(secret)
}

/// Global instance of the machine key manager
static MACHINE_KEY_MANAGER: Lazy<MachineKeyManager> = Lazy::new(|| {
    let manager = MachineKeyManager::new();
    #[cfg(test)]
    {
        // Unit tests must never touch the OS credential service: reading a
        // Keychain item blocks on a GUI approval dialog whenever the calling
        // binary's signature changed, which every `cargo build` does.
        let mut secret = [0u8; INSTALL_SECRET_BYTES];
        OsRng
            .try_fill_bytes(&mut secret)
            .expect("test install secret");
        manager.set_install_secret(&secret);
    }
    manager
});

/// Per-process key material used only when secure storage failed to provide an
/// install secret.
///
/// A caller that cannot handle [`KeyDerivationError`] must still never receive
/// the legacy machine-only key, which any local process can recompute. An
/// ephemeral secret keeps stored ciphertext unreadable and loudly wrong instead
/// of quietly decryptable.
static EPHEMERAL_INSTALL_SECRET: Lazy<[u8; INSTALL_SECRET_BYTES]> = Lazy::new(|| {
    let mut secret = [0u8; INSTALL_SECRET_BYTES];
    if OsRng.try_fill_bytes(&mut secret).is_err() {
        let mut hasher = Sha256::new();
        hasher.update(std::process::id().to_le_bytes());
        hasher.update(
            std::time::SystemTime::now()
                .duration_since(std::time::UNIX_EPOCH)
                .map(|elapsed| elapsed.as_nanos())
                .unwrap_or_default()
                .to_le_bytes(),
        );
        secret.copy_from_slice(&hasher.finalize());
    }
    secret
});

/// Payload labels that have been read back under a legacy machine-only key and
/// not yet re-wrapped under the per-install key.
static MACHINE_ONLY_PAYLOADS: Lazy<RwLock<BTreeSet<String>>> =
    Lazy::new(|| RwLock::new(BTreeSet::new()));

/// Legacy derivations cost 600,000 PBKDF2 rounds per machine identifier, and
/// they are recomputed on every payload that fails to open with the current
/// key. Derive each purpose at most once per process.
static LEGACY_KEY_CACHE: Lazy<RwLock<HashMap<KeyPurpose, Vec<[u8; KEY_SIZE]>>>> =
    Lazy::new(|| RwLock::new(HashMap::new()));

/// Machine key manager that derives encryption keys from the per-install secret
pub struct MachineKeyManager {
    machine_id: String,
    state: RwLock<MachineKeyState>,
}

struct MachineKeyState {
    install_id: Option<String>,
    install_secret: Option<[u8; INSTALL_SECRET_BYTES]>,
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
                install_secret: None,
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

    /// Install the per-install secret that every derived key depends on.
    ///
    /// The secret stays inside this manager. It is deliberately not reachable
    /// through [`MachineKeyManager::get_install_id`], whose value is handed to
    /// the webview as a local user identifier.
    pub fn set_install_secret(&self, secret: &[u8; INSTALL_SECRET_BYTES]) {
        if let Ok(mut state) = self.state.safe_write() {
            if state.install_secret.as_ref() != Some(secret) {
                state.install_secret = Some(*secret);
                state.derived_keys.clear();
            }
        }
    }

    /// Whether a per-install secret has been installed.
    pub fn has_install_secret(&self) -> bool {
        self.state
            .safe_read()
            .map(|state| state.install_secret.is_some())
            .unwrap_or(false)
    }

    pub fn set_install_id(&self, id: String) {
        if let Ok(mut state) = self.state.safe_write() {
            if state.install_id.as_ref() != Some(&id) {
                state.install_id = Some(id);
                state.derived_keys.clear();
            }
        }
    }

    /// Get the non-secret installation identifier.
    pub fn get_install_id(&self) -> String {
        self.state
            .safe_read()
            .ok()
            .and_then(|state| state.install_id.clone())
            .unwrap_or_else(|| self.fallback_install_id())
    }

    /// Derive an encryption key for a specific purpose.
    ///
    /// Fails closed when no per-install secret has been established rather than
    /// falling back to a derivation any local process could reproduce.
    pub fn try_derive_key(&self, purpose: KeyPurpose) -> Result<Vec<u8>, KeyDerivationError> {
        let mut state = self
            .state
            .safe_write()
            .map_err(|_| KeyDerivationError::KeyCacheUnavailable)?;

        if let Some(key) = state.derived_keys.get(&purpose) {
            return Ok(key.to_vec());
        }

        let secret = state
            .install_secret
            .ok_or(KeyDerivationError::MissingInstallSecret)?;
        let key = Self::derive_key_for_install_secret(&self.machine_id, &secret, purpose);
        state.derived_keys.insert(purpose, key);
        Ok(key.to_vec())
    }

    /// Derive an encryption key for callers that cannot report a failure.
    ///
    /// Prefer [`MachineKeyManager::try_derive_key`]. When no install secret is
    /// available this returns a process-ephemeral key, never the legacy
    /// machine-only key, so a broken credential store cannot downgrade stored
    /// secrets to publicly reproducible encryption.
    pub fn derive_key(&self, purpose: KeyPurpose) -> Vec<u8> {
        self.try_derive_key(purpose).unwrap_or_else(|error| {
            tracing::error!(
                "Encryption key for {} is unavailable ({error}); using an ephemeral key. \
                 Stored secrets stay unreadable until secure storage returns.",
                purpose.as_str()
            );
            Self::derive_key_for_install_secret(
                &self.machine_id,
                &EPHEMERAL_INSTALL_SECRET,
                purpose,
            )
            .to_vec()
        })
    }

    fn fallback_install_id(&self) -> String {
        Self::fallback_install_id_for_machine(&self.machine_id)
    }

    fn fallback_install_id_for_machine(machine_id: &str) -> String {
        let mut hasher = Sha256::new();
        hasher.update(machine_id.as_bytes());
        hasher.update(b"install_id_fallback");
        hex::encode(hasher.finalize())
    }

    /// Expand the per-install secret into a purpose key.
    ///
    /// The secret is full-entropy CSPRNG output, so HKDF is the correct
    /// expansion primitive; a password stretcher would only add startup cost
    /// without adding strength.
    fn derive_key_for_install_secret(
        machine_id: &str,
        secret: &[u8; INSTALL_SECRET_BYTES],
        purpose: KeyPurpose,
    ) -> [u8; KEY_SIZE] {
        let salt = format!("{}:{}:install_secret:v1", machine_id, APP_BUNDLE_ID);
        let info = format!("agiworkforce:install_derived:{}:v1", purpose.as_str());
        hkdf_sha256(salt.as_bytes(), secret, info.as_bytes())
    }

    /// Reproduce the pre-per-install-secret derivation.
    ///
    /// `machine_id` is readable by any unprivileged local process, so this key
    /// is public knowledge. It exists only to read data older builds wrote and
    /// must never encrypt anything new.
    fn derive_legacy_machine_only_key(
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

    /// Get a base64-encoded key for a specific purpose
    pub fn derive_key_base64(&self, purpose: KeyPurpose) -> String {
        general_purpose::STANDARD.encode(self.derive_key(purpose))
    }
}

fn hkdf_sha256(salt: &[u8], input_key: &[u8], info: &[u8]) -> [u8; KEY_SIZE] {
    let mut extract = <Hmac<Sha256> as Mac>::new_from_slice(salt)
        .expect("HMAC-SHA256 accepts any key size (RFC 2104)");
    extract.update(input_key);
    let prk = extract.finalize().into_bytes();

    let mut expand = <Hmac<Sha256> as Mac>::new_from_slice(&prk)
        .expect("HMAC-SHA256 accepts any key size (RFC 2104)");
    expand.update(info);
    expand.update(&[0x01]);

    let mut key = [0u8; KEY_SIZE];
    key.copy_from_slice(&expand.finalize().into_bytes()[..KEY_SIZE]);
    key
}

// Public API functions

/// Get the global machine key manager instance
pub fn get_manager() -> &'static MachineKeyManager {
    &MACHINE_KEY_MANAGER
}

/// Derive an encryption key for a specific purpose, failing closed when no
/// per-install secret is available.
pub fn try_derive_key(purpose: KeyPurpose) -> Result<Vec<u8>, KeyDerivationError> {
    MACHINE_KEY_MANAGER.try_derive_key(purpose)
}

/// Derive an encryption key for a specific purpose.
///
/// Prefer [`try_derive_key`]; see [`MachineKeyManager::derive_key`] for what
/// this returns when secure storage has not supplied an install secret.
pub fn derive_key(purpose: KeyPurpose) -> Vec<u8> {
    MACHINE_KEY_MANAGER.derive_key(purpose)
}

/// Derive an encryption key and return as base64
pub fn derive_key_base64(purpose: KeyPurpose) -> String {
    MACHINE_KEY_MANAGER.derive_key_base64(purpose)
}

/// Install the per-install secret that every derived key depends on.
pub fn set_install_secret(secret: &[u8; INSTALL_SECRET_BYTES]) {
    MACHINE_KEY_MANAGER.set_install_secret(secret);
}

/// Whether the per-install secret has been loaded from secure storage.
pub fn has_install_secret() -> bool {
    MACHINE_KEY_MANAGER.has_install_secret()
}

/// Set the non-secret installation identifier for the key manager
pub fn set_install_id(id: String) {
    MACHINE_KEY_MANAGER.set_install_id(id);
}

/// Get the current machine ID (for debugging/display purposes only)
pub fn get_machine_id_hash() -> String {
    let mut hasher = Sha256::new();
    hasher.update(MACHINE_KEY_MANAGER.machine_id.as_bytes());
    // Return truncated hash for privacy
    hex::encode(&hasher.finalize()[..8])
}

/// Every machine identifier a shipped build could have derived keys from.
///
/// The old macOS implementation used `machine-uid`, which shells out to
/// `ioreg`. App Sandbox can deny that subprocess even though reading the same
/// IORegistry property directly is permitted. Keep both derivations so a
/// packaged app can prove which one a stored payload was written with.
fn legacy_machine_ids() -> Vec<String> {
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

    machine_ids
}

/// Every key a pre-per-install-secret build could have derived for `purpose`.
///
/// Callers must use these only to prove which key an existing payload was
/// written with, then re-wrap that payload under [`try_derive_key`].
pub fn legacy_machine_only_keys(purpose: KeyPurpose) -> Vec<[u8; KEY_SIZE]> {
    if let Ok(cache) = LEGACY_KEY_CACHE.safe_read() {
        if let Some(keys) = cache.get(&purpose) {
            return keys.clone();
        }
    }

    let mut keys = Vec::new();
    for machine_id in legacy_machine_ids() {
        let install_id = MachineKeyManager::fallback_install_id_for_machine(&machine_id);
        let key =
            MachineKeyManager::derive_legacy_machine_only_key(&machine_id, &install_id, purpose);
        if !keys.contains(&key) {
            keys.push(key);
        }
    }

    if let Ok(mut cache) = LEGACY_KEY_CACHE.safe_write() {
        cache.insert(purpose, keys.clone());
    }
    keys
}

/// Legacy candidates for the main database, used by the startup key adoption
/// path in `data::db::key_management`.
pub fn legacy_database_key_candidates() -> Vec<[u8; KEY_SIZE]> {
    legacy_machine_only_keys(KeyPurpose::DatabaseEncryption)
}

/// Legacy predecessors of a key this manager currently derives.
///
/// Returns nothing for a key the manager did not derive, so a caller-supplied
/// key can never select a machine-only key it was not already entitled to.
pub fn legacy_keys_for_current_key(key: &[u8]) -> Option<(KeyPurpose, Vec<[u8; KEY_SIZE]>)> {
    if key.len() != KEY_SIZE || !MACHINE_KEY_MANAGER.has_install_secret() {
        return None;
    }

    KeyPurpose::ALL
        .into_iter()
        .find(|purpose| {
            MACHINE_KEY_MANAGER
                .try_derive_key(*purpose)
                .is_ok_and(|current| current == key)
        })
        .map(|purpose| (purpose, legacy_machine_only_keys(purpose)))
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
/// This is the preferred method wherever a master password exists: its secret
/// input is the password, which never leaves the user.
pub fn derive_key_with_password(password_key: &[u8], purpose: KeyPurpose) -> Vec<u8> {
    let install_id = MACHINE_KEY_MANAGER.get_install_id();

    // Combine password key with machine identifiers
    let mut combined = password_key.to_vec();
    combined.extend_from_slice(MACHINE_KEY_MANAGER.machine_id.as_bytes());
    combined.extend_from_slice(install_id.as_bytes());
    combined.extend_from_slice(APP_BUNDLE_ID.as_bytes());

    let info = format!("agiworkforce:password_derived:{}:v1", purpose.as_str());
    let salt = b"com.agiworkforce.desktop:password_key:v1";

    hkdf_sha256(salt, &combined, info.as_bytes()).to_vec()
}

/// Derive an encryption key with password and return as base64
pub fn derive_key_with_password_base64(password_key: &[u8], purpose: KeyPurpose) -> String {
    general_purpose::STANDARD.encode(derive_key_with_password(password_key, purpose))
}

/// A payload read back through [`open_with_key_rotation`].
pub struct KeyedPayload<T> {
    pub value: T,
    /// The payload opened under a legacy machine-only key and must be written
    /// back under the current key before it can be considered protected.
    pub rewrap_required: bool,
}

/// Read a payload with the current purpose key, falling back to the legacy
/// machine-only keys so data written by older builds can be re-wrapped.
///
/// `label` identifies the exact payload (store name, file path, or row key) so
/// [`has_machine_only_secrets`] can report what is still outstanding.
/// `open` returns `None` when the supplied key does not open the payload.
pub fn open_with_key_rotation<T>(
    purpose: KeyPurpose,
    label: &str,
    mut open: impl FnMut(&[u8]) -> Option<T>,
) -> Result<Option<KeyedPayload<T>>, KeyDerivationError> {
    let current = try_derive_key(purpose)?;
    if let Some(value) = open(&current) {
        clear_machine_only_payload(label);
        return Ok(Some(KeyedPayload {
            value,
            rewrap_required: false,
        }));
    }

    for legacy in legacy_machine_only_keys(purpose) {
        if let Some(value) = open(&legacy) {
            record_machine_only_payload(label);
            return Ok(Some(KeyedPayload {
                value,
                rewrap_required: true,
            }));
        }
    }

    Ok(None)
}

/// Record that `label` still holds data wrapped under a legacy machine-only key.
pub fn record_machine_only_payload(label: &str) {
    if let Ok(mut payloads) = MACHINE_ONLY_PAYLOADS.safe_write() {
        payloads.insert(label.to_string());
    }
}

/// Record that `label` has been re-wrapped under the per-install key.
pub fn clear_machine_only_payload(label: &str) {
    if let Ok(mut payloads) = MACHINE_ONLY_PAYLOADS.safe_write() {
        payloads.remove(label);
    }
}

/// Payload labels observed under a legacy machine-only key and not yet
/// re-wrapped.
pub fn machine_only_payloads() -> Vec<String> {
    MACHINE_ONLY_PAYLOADS
        .safe_read()
        .map(|payloads| payloads.iter().cloned().collect())
        .unwrap_or_default()
}

/// Whether any payload read this session is still wrapped under a legacy
/// machine-only key.
///
/// This reports what the running process has actually observed: stores register
/// themselves through [`open_with_key_rotation`] and clear themselves once the
/// re-wrap succeeds. A store re-wrapped by another process is still reported
/// until this one reads it again, which errs toward over-reporting rather than
/// claiming protection that was never proven.
pub fn has_machine_only_secrets() -> bool {
    MACHINE_ONLY_PAYLOADS
        .safe_read()
        .map(|payloads| !payloads.is_empty())
        .unwrap_or(false)
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::sync::Mutex;

    struct MemoryInstallSecretStore {
        secret: Mutex<Option<[u8; INSTALL_SECRET_BYTES]>>,
        writes: Mutex<usize>,
        fail: bool,
    }

    impl MemoryInstallSecretStore {
        fn empty() -> Self {
            Self {
                secret: Mutex::new(None),
                writes: Mutex::new(0),
                fail: false,
            }
        }

        fn unavailable() -> Self {
            Self {
                secret: Mutex::new(None),
                writes: Mutex::new(0),
                fail: true,
            }
        }
    }

    impl InstallSecretStore for MemoryInstallSecretStore {
        fn load(&self) -> Result<Option<[u8; INSTALL_SECRET_BYTES]>, InstallSecretError> {
            if self.fail {
                return Err(InstallSecretError::SecureStorage(
                    "test credential store unavailable".to_string(),
                ));
            }
            Ok(*self.secret.lock().expect("install secret lock"))
        }

        fn store(&self, secret: &[u8; INSTALL_SECRET_BYTES]) -> Result<(), InstallSecretError> {
            if self.fail {
                return Err(InstallSecretError::SecureStorage(
                    "test credential store unavailable".to_string(),
                ));
            }
            *self.secret.lock().expect("install secret lock") = Some(*secret);
            *self.writes.lock().expect("write count lock") += 1;
            Ok(())
        }
    }

    fn manager_with_secret(secret: [u8; INSTALL_SECRET_BYTES]) -> MachineKeyManager {
        let manager = MachineKeyManager::new();
        manager.set_install_secret(&secret);
        manager
    }

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

    /// F5/F12: without a per-install secret, no key may be produced, and the
    /// compatibility shim must never hand back the machine-only key that any
    /// unprivileged local process can recompute.
    #[test]
    fn derivation_fails_closed_without_an_install_secret() {
        let manager = MachineKeyManager::new();
        assert!(!manager.has_install_secret());

        for purpose in KeyPurpose::ALL {
            assert_eq!(
                manager.try_derive_key(purpose),
                Err(KeyDerivationError::MissingInstallSecret),
                "{} must not derive a key without an install secret",
                purpose.as_str()
            );
        }

        // One purpose is enough to prove the shim's fallback shape; each legacy
        // comparison costs 600,000 PBKDF2 rounds per machine identifier.
        let purpose = KeyPurpose::DatabaseEncryption;
        let fallback = manager.derive_key(purpose);
        assert_eq!(fallback.len(), KEY_SIZE);
        for legacy in legacy_machine_only_keys(purpose) {
            assert_ne!(
                fallback.as_slice(),
                legacy.as_slice(),
                "{} fell back to the publicly reproducible machine-only key",
                purpose.as_str()
            );
        }
    }

    /// A key derived with a real install secret must depend on that secret and
    /// must not equal the machine-only key it replaced.
    #[test]
    fn install_secret_changes_every_derived_key() {
        let first = manager_with_secret([0x11; INSTALL_SECRET_BYTES]);
        let second = manager_with_secret([0x22; INSTALL_SECRET_BYTES]);

        for purpose in KeyPurpose::ALL {
            let first_key = first.try_derive_key(purpose).expect("install secret set");
            let second_key = second.try_derive_key(purpose).expect("install secret set");
            assert_ne!(first_key, second_key);
        }

        let purpose = KeyPurpose::DatabaseEncryption;
        let derived = first.try_derive_key(purpose).expect("install secret set");
        for legacy in legacy_machine_only_keys(purpose) {
            assert_ne!(derived.as_slice(), legacy.as_slice());
        }
    }

    #[test]
    fn install_secret_is_generated_once_and_reused() {
        let store = MemoryInstallSecretStore::empty();

        let first = load_or_create_install_secret(&store).expect("generate install secret");
        assert_ne!(first, [0u8; INSTALL_SECRET_BYTES]);
        assert_eq!(*store.writes.lock().expect("write count"), 1);

        let second = load_or_create_install_secret(&store).expect("reuse install secret");
        assert_eq!(first, second);
        assert_eq!(
            *store.writes.lock().expect("write count"),
            1,
            "an existing install secret must never be overwritten"
        );
    }

    #[test]
    fn unavailable_credential_store_fails_closed() {
        let store = MemoryInstallSecretStore::unavailable();
        assert!(matches!(
            load_or_create_install_secret(&store),
            Err(InstallSecretError::SecureStorage(_))
        ));

        // A manager that never received a secret must refuse to derive, so a
        // failed credential store cannot silently downgrade encryption.
        let manager = MachineKeyManager::new();
        assert_eq!(
            manager.try_derive_key(KeyPurpose::DatabaseEncryption),
            Err(KeyDerivationError::MissingInstallSecret)
        );
    }

    /// The install secret must not become the value the app hands to the
    /// webview as a local user identifier.
    #[test]
    fn install_secret_is_never_exposed_as_the_install_id() {
        let manager = MachineKeyManager::new();
        let before = manager.get_install_id();

        let secret = [0x5a; INSTALL_SECRET_BYTES];
        manager.set_install_secret(&secret);

        let after = manager.get_install_id();
        assert_eq!(before, after);
        assert!(!after.contains(&hex::encode(secret)));
        assert!(!hex::encode(secret).contains(&after));
    }

    #[test]
    fn legacy_payload_round_trips_into_the_install_secret_key() {
        use crate::sys::security::encryption::{decrypt_secret_with_key, encrypt_secret};

        let purpose = KeyPurpose::McpCredentials;
        let label = "test:legacy_round_trip";
        let legacy_key = legacy_machine_only_keys(purpose)
            .first()
            .copied()
            .expect("a legacy candidate always exists");
        let stored = encrypt_secret(&legacy_key, "legacy-oauth-token").expect("legacy encrypt");

        let opened = open_with_key_rotation(purpose, label, |key| {
            decrypt_secret_with_key(key, &stored).ok()
        })
        .expect("install secret available in tests")
        .expect("legacy payload must be readable");

        assert!(opened.rewrap_required);
        assert_eq!(opened.value, "legacy-oauth-token");
        assert!(machine_only_payloads().contains(&label.to_string()));
        assert!(has_machine_only_secrets());

        let current = try_derive_key(purpose).expect("install secret available in tests");
        let rewrapped = encrypt_secret(&current, &opened.value).expect("rewrap");
        assert!(decrypt_secret_with_key(&legacy_key, &rewrapped).is_err());

        let reopened = open_with_key_rotation(purpose, label, |key| {
            decrypt_secret_with_key(key, &rewrapped).ok()
        })
        .expect("install secret available in tests")
        .expect("re-wrapped payload must be readable");

        assert!(!reopened.rewrap_required);
        assert_eq!(reopened.value, "legacy-oauth-token");
        assert!(!machine_only_payloads().contains(&label.to_string()));
    }

    #[test]
    fn legacy_keys_are_offered_only_for_keys_this_manager_derives() {
        let purpose = KeyPurpose::McpCredentials;
        let current = try_derive_key(purpose).expect("install secret available");
        assert_eq!(
            legacy_keys_for_current_key(&current),
            Some((purpose, legacy_machine_only_keys(purpose)))
        );

        assert!(legacy_keys_for_current_key(&[0x42; KEY_SIZE]).is_none());
        assert!(legacy_keys_for_current_key(b"short").is_none());
    }

    #[test]
    fn legacy_database_candidates_are_machine_only_and_deduplicated() {
        let candidates = legacy_database_key_candidates();
        assert!(!candidates.is_empty());

        let current: Vec<u8> =
            try_derive_key(KeyPurpose::DatabaseEncryption).expect("install secret available");
        assert!(
            !candidates
                .iter()
                .any(|candidate| candidate == current.as_slice()),
            "the current database key must not be a machine-only derivation"
        );

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
        let manager = manager_with_secret([0x77; INSTALL_SECRET_BYTES]);

        // Default install ID should work
        let id1 = manager.get_install_id();
        assert!(!id1.is_empty());

        // Populate the per-purpose cache, then prove changing installation
        // identity invalidates it before any subsequent encrypted open.
        let _ = manager.try_derive_key(KeyPurpose::DatabaseEncryption);
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
    fn install_secret_replacement_invalidates_cached_keys() {
        let manager = manager_with_secret([0x01; INSTALL_SECRET_BYTES]);
        let first = manager
            .try_derive_key(KeyPurpose::JwtSecret)
            .expect("derive");

        manager.set_install_secret(&[0x02; INSTALL_SECRET_BYTES]);
        let second = manager
            .try_derive_key(KeyPurpose::JwtSecret)
            .expect("derive");

        assert_ne!(first, second);
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

    static HARNESS_ENV_GUARD: Mutex<()> = Mutex::new(());

    /// The E2E harness exports only its throwaway SQLCipher key. Requiring a
    /// second variable nobody sets sends the WDIO bundle to a Keychain approval
    /// dialog it cannot answer, and startup then drops to the recovery window.
    #[test]
    fn wdio_install_secret_falls_back_to_the_harness_database_key() {
        let _guard = HARNESS_ENV_GUARD
            .lock()
            .unwrap_or_else(|poisoned| poisoned.into_inner());
        std::env::remove_var(INSTALL_SECRET_HARNESS_ENV);
        std::env::set_var(DATABASE_KEY_HARNESS_ENV, "a".repeat(64));

        let wdio = OsInstallSecretStore::for_bundle_identifier("com.agiworkforce.desktop.wdio")
            .expect("wdio identifier");
        let secret = wdio
            .harness_secret()
            .expect("the harness database key must seed an install secret");
        assert_ne!(secret, [0u8; INSTALL_SECRET_BYTES]);
        assert_eq!(
            wdio.harness_secret(),
            Some(secret),
            "the harness secret must stay stable for the whole run"
        );
        assert_eq!(
            load_or_create_install_secret(&wdio).expect("harness install secret"),
            secret,
            "the harness must never reach the OS credential service"
        );

        let production = OsInstallSecretStore::for_bundle_identifier("com.agiworkforce.desktop")
            .expect("production identifier");
        assert!(
            production.harness_secret().is_none(),
            "a shipped bundle must ignore harness environment variables"
        );

        std::env::remove_var(DATABASE_KEY_HARNESS_ENV);
    }

    #[test]
    fn harness_secret_is_used_only_by_the_isolated_wdio_bundle() {
        let _guard = HARNESS_ENV_GUARD
            .lock()
            .unwrap_or_else(|poisoned| poisoned.into_inner());
        std::env::remove_var(DATABASE_KEY_HARNESS_ENV);

        let valid = "00".repeat(INSTALL_SECRET_BYTES);
        std::env::set_var(INSTALL_SECRET_HARNESS_ENV, &valid);

        let wdio = OsInstallSecretStore::for_bundle_identifier("com.agiworkforce.desktop.wdio")
            .expect("wdio identifier");
        assert_eq!(
            wdio.harness_secret(),
            Some([0u8; INSTALL_SECRET_BYTES]),
            "the isolated harness bundle should accept the run secret"
        );

        let production = OsInstallSecretStore::for_bundle_identifier("com.agiworkforce.desktop")
            .expect("production identifier");
        assert!(
            production.harness_secret().is_none(),
            "an environment variable must never dictate a shipped install secret"
        );

        std::env::set_var(INSTALL_SECRET_HARNESS_ENV, "deadbeef");
        assert!(wdio.harness_secret().is_none(), "short value");
        std::env::remove_var(INSTALL_SECRET_HARNESS_ENV);
        assert!(wdio.harness_secret().is_none(), "absent value");
    }

    #[test]
    fn invalid_bundle_identifiers_never_reach_the_keyring() {
        for identifier in [
            "",
            "desktop",
            "com..desktop",
            "com.agi workforce.desktop",
            "com.agiworkforce.desktop/",
            ".com.agiworkforce.desktop",
            "com.agiworkforce.desktop.",
            "com.agiworkforce.-desktop",
        ] {
            assert!(
                matches!(
                    OsInstallSecretStore::for_bundle_identifier(identifier),
                    Err(InstallSecretError::InvalidBundleIdentifier)
                ),
                "identifier should be rejected: {identifier:?}"
            );
        }
    }
}
