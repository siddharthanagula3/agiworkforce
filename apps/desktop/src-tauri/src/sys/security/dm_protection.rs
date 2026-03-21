//! DM Protection with pairing codes for unknown senders
//!
//! Persists config and allowlisted senders to a JSON file in the app data
//! directory so that paired devices survive app restarts.  Pending pairing
//! codes are intentionally kept in-memory only because they expire within
//! minutes.

use crate::sys::error::{Error, Result};
use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use std::path::PathBuf;
use std::sync::{Arc, RwLock};

/// DM Protection configuration
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct DmProtectionConfig {
    pub enabled: bool,
    pub require_pairing_for_unknown: bool,
    pub code_expiry_minutes: u32,
    pub max_pending_codes: usize,
}

impl Default for DmProtectionConfig {
    fn default() -> Self {
        Self {
            enabled: true,
            require_pairing_for_unknown: true,
            code_expiry_minutes: 5,
            max_pending_codes: 10,
        }
    }
}

/// A pending pairing code
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct PairingCode {
    pub code: String,
    pub created_at: i64,
    pub expires_at: i64,
    pub requester_id: String,
    pub platform: String,
}

/// An allowlisted sender
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AllowlistedSender {
    pub id: String,
    pub platform: String,
    pub display_name: Option<String>,
    pub added_at: String,
    pub verified_via: VerificationMethod,
}

#[derive(Debug, Clone, Copy, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum VerificationMethod {
    PairingCode,
    ManualApproval,
    TrustedPlatform,
}

/// On-disk representation of the persisted DM protection state.
///
/// Pending pairing codes are excluded because they are short-lived
/// (minutes) and do not need to survive restarts.
#[derive(Debug, Clone, Serialize, Deserialize)]
struct PersistedDmState {
    config: DmProtectionConfig,
    allowlist: HashMap<String, AllowlistedSender>,
}

const PERSISTENCE_FILE_NAME: &str = "dm_protection.json";

/// DM Protection manager
pub struct DmProtection {
    config: RwLock<DmProtectionConfig>,
    pending_codes: Arc<RwLock<HashMap<String, PairingCode>>>,
    allowlist: Arc<RwLock<HashMap<String, AllowlistedSender>>>,
    /// Path to the JSON persistence file.  `None` when running in degraded
    /// mode (e.g. tests or when the app data directory is unavailable).
    storage_path: Option<PathBuf>,
}

impl DmProtection {
    /// Create a new instance without persistence (in-memory only).
    pub fn new(config: DmProtectionConfig) -> Self {
        Self {
            config: RwLock::new(config),
            pending_codes: Arc::new(RwLock::new(HashMap::new())),
            allowlist: Arc::new(RwLock::new(HashMap::new())),
            storage_path: None,
        }
    }

    /// Load persisted state from the app data directory.
    ///
    /// If the persistence file does not exist or is unreadable, falls back to
    /// defaults gracefully (no error).  Subsequent mutations will attempt to
    /// persist state.
    pub fn load() -> Self {
        let storage_path = Self::resolve_storage_path();

        let (config, allowlist) = storage_path
            .as_ref()
            .and_then(|path| {
                std::fs::read_to_string(path).ok().and_then(|contents| {
                    serde_json::from_str::<PersistedDmState>(&contents)
                        .ok()
                        .map(|state| (state.config, state.allowlist))
                })
            })
            .unwrap_or_else(|| (DmProtectionConfig::default(), HashMap::new()));

        Self {
            config: RwLock::new(config),
            pending_codes: Arc::new(RwLock::new(HashMap::new())),
            allowlist: Arc::new(RwLock::new(allowlist)),
            storage_path,
        }
    }

    /// Resolve the storage file path via `app_data_dir()`.
    ///
    /// Returns `None` if the app data directory cannot be determined, which
    /// causes the instance to operate in degraded (in-memory only) mode.
    fn resolve_storage_path() -> Option<PathBuf> {
        crate::sys::utils::app_data_dir()
            .ok()
            .map(|dir| dir.join(PERSISTENCE_FILE_NAME))
    }

    /// Persist the current config and allowlist to disk.
    ///
    /// Errors are logged but not propagated -- persistence is best-effort so
    /// that a transient I/O failure does not break the caller's operation.
    fn persist(&self) {
        let path = match self.storage_path.as_ref() {
            Some(p) => p,
            None => return,
        };

        let config = match self.config.read() {
            Ok(c) => c.clone(),
            Err(_) => return,
        };

        let allowlist = match self.allowlist.read() {
            Ok(a) => a.clone(),
            Err(_) => return,
        };

        let state = PersistedDmState { config, allowlist };

        match serde_json::to_string_pretty(&state) {
            Ok(json) => {
                if let Some(parent) = path.parent() {
                    let _ = std::fs::create_dir_all(parent);
                }
                if let Err(e) = std::fs::write(path, json) {
                    eprintln!("[dm_protection] failed to persist state: {e}");
                }
            }
            Err(e) => {
                eprintln!("[dm_protection] failed to serialize state: {e}");
            }
        }
    }

    /// Generate a 6-digit pairing code
    pub fn generate_code(&self, requester_id: &str, platform: &str) -> Result<PairingCode> {
        let config = self
            .config
            .read()
            .map_err(|e| Error::Generic(e.to_string()))?;

        // Generate 6-digit code
        let code: String = (0..6)
            .map(|_| char::from_digit(rand::random::<u32>() % 10, 10).unwrap_or('0'))
            .collect();

        let now = chrono::Utc::now().timestamp_millis();
        let expires_at = now + (i64::from(config.code_expiry_minutes) * 60 * 1000);

        let pairing_code = PairingCode {
            code: code.clone(),
            created_at: now,
            expires_at,
            requester_id: requester_id.to_string(),
            platform: platform.to_string(),
        };

        let mut codes = self
            .pending_codes
            .write()
            .map_err(|e| Error::Generic(e.to_string()))?;

        // Remove expired codes and enforce max limit
        let now = chrono::Utc::now().timestamp_millis();
        codes.retain(|_, c| c.expires_at > now);

        if codes.len() >= config.max_pending_codes {
            // Remove oldest code
            if let Some(oldest_key) = codes
                .iter()
                .min_by_key(|(_, c)| c.created_at)
                .map(|(k, _)| k.clone())
            {
                codes.remove(&oldest_key);
            }
        }

        codes.insert(code, pairing_code.clone());

        Ok(pairing_code)
    }

    /// Verify a pairing code and add the sender to the allowlist on success.
    pub fn verify_code(&self, code: &str, requester_id: &str) -> Result<bool> {
        let mut codes = self
            .pending_codes
            .write()
            .map_err(|e| Error::Generic(e.to_string()))?;

        let now = chrono::Utc::now().timestamp_millis();

        if let Some(pairing_code) = codes.get(code) {
            if pairing_code.expires_at > now && pairing_code.requester_id == requester_id {
                // Add to allowlist
                let sender = AllowlistedSender {
                    id: requester_id.to_string(),
                    platform: pairing_code.platform.clone(),
                    display_name: None,
                    added_at: chrono::Utc::now().to_rfc3339(),
                    verified_via: VerificationMethod::PairingCode,
                };

                let mut allowlist = self
                    .allowlist
                    .write()
                    .map_err(|e| Error::Generic(e.to_string()))?;
                allowlist.insert(requester_id.to_string(), sender);

                // Remove used code
                codes.remove(code);

                // Persist the updated allowlist
                drop(codes);
                drop(allowlist);
                self.persist();

                return Ok(true);
            }
        }

        Ok(false)
    }

    /// Check if a sender is allowlisted
    pub fn is_allowed(&self, sender_id: &str) -> Result<bool> {
        let config = self
            .config
            .read()
            .map_err(|e| Error::Generic(e.to_string()))?;

        if !config.enabled || !config.require_pairing_for_unknown {
            return Ok(true);
        }

        let allowlist = self
            .allowlist
            .read()
            .map_err(|e| Error::Generic(e.to_string()))?;

        Ok(allowlist.contains_key(sender_id))
    }

    /// Manually add to allowlist
    pub fn add_to_allowlist(
        &self,
        sender_id: &str,
        platform: &str,
        display_name: Option<&str>,
    ) -> Result<()> {
        let sender = AllowlistedSender {
            id: sender_id.to_string(),
            platform: platform.to_string(),
            display_name: display_name.map(String::from),
            added_at: chrono::Utc::now().to_rfc3339(),
            verified_via: VerificationMethod::ManualApproval,
        };

        let mut allowlist = self
            .allowlist
            .write()
            .map_err(|e| Error::Generic(e.to_string()))?;
        allowlist.insert(sender_id.to_string(), sender);
        drop(allowlist);

        self.persist();

        Ok(())
    }

    /// Remove from allowlist
    pub fn remove_from_allowlist(&self, sender_id: &str) -> Result<bool> {
        let mut allowlist = self
            .allowlist
            .write()
            .map_err(|e| Error::Generic(e.to_string()))?;
        let removed = allowlist.remove(sender_id).is_some();
        drop(allowlist);

        if removed {
            self.persist();
        }

        Ok(removed)
    }

    /// List allowlisted senders
    pub fn list_allowlist(&self) -> Result<Vec<AllowlistedSender>> {
        let allowlist = self
            .allowlist
            .read()
            .map_err(|e| Error::Generic(e.to_string()))?;
        Ok(allowlist.values().cloned().collect())
    }

    /// Get current config
    pub fn get_config(&self) -> Result<DmProtectionConfig> {
        let config = self
            .config
            .read()
            .map_err(|e| Error::Generic(e.to_string()))?;
        Ok(config.clone())
    }

    /// Update config
    pub fn set_config(&self, config: DmProtectionConfig) -> Result<()> {
        let mut current = self
            .config
            .write()
            .map_err(|e| Error::Generic(e.to_string()))?;
        *current = config;
        drop(current);

        self.persist();

        Ok(())
    }
}

impl Default for DmProtection {
    fn default() -> Self {
        Self::new(DmProtectionConfig::default())
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_persist_and_reload() {
        let dir = std::env::temp_dir().join("dm_protection_test");
        let _ = std::fs::create_dir_all(&dir);
        let path = dir.join(PERSISTENCE_FILE_NAME);

        // Clean up from any prior run.
        let _ = std::fs::remove_file(&path);

        // Create an instance with an explicit storage path.
        let dm = DmProtection {
            config: RwLock::new(DmProtectionConfig {
                enabled: false,
                ..DmProtectionConfig::default()
            }),
            pending_codes: Arc::new(RwLock::new(HashMap::new())),
            allowlist: Arc::new(RwLock::new(HashMap::new())),
            storage_path: Some(path.clone()),
        };

        // Add a sender and persist.
        dm.add_to_allowlist("user-1", "discord", Some("Alice"))
            .expect("add_to_allowlist should succeed");

        // The file should now exist.
        assert!(
            path.exists(),
            "persistence file should exist after mutation"
        );

        // Read it back and verify.
        let contents = std::fs::read_to_string(&path).expect("should read file");
        let state: PersistedDmState = serde_json::from_str(&contents).expect("should parse JSON");

        assert!(!state.config.enabled);
        assert_eq!(state.allowlist.len(), 1);
        assert!(state.allowlist.contains_key("user-1"));
        assert_eq!(
            state.allowlist["user-1"].display_name.as_deref(),
            Some("Alice")
        );

        // Clean up.
        let _ = std::fs::remove_file(&path);
        let _ = std::fs::remove_dir(&dir);
    }

    #[test]
    fn test_remove_persists() {
        let dir = std::env::temp_dir().join("dm_protection_test_remove");
        let _ = std::fs::create_dir_all(&dir);
        let path = dir.join(PERSISTENCE_FILE_NAME);
        let _ = std::fs::remove_file(&path);

        let dm = DmProtection {
            config: RwLock::new(DmProtectionConfig::default()),
            pending_codes: Arc::new(RwLock::new(HashMap::new())),
            allowlist: Arc::new(RwLock::new(HashMap::new())),
            storage_path: Some(path.clone()),
        };

        dm.add_to_allowlist("user-2", "slack", None)
            .expect("add should succeed");
        dm.remove_from_allowlist("user-2")
            .expect("remove should succeed");

        let contents = std::fs::read_to_string(&path).expect("should read file");
        let state: PersistedDmState = serde_json::from_str(&contents).expect("should parse JSON");
        assert!(state.allowlist.is_empty());

        let _ = std::fs::remove_file(&path);
        let _ = std::fs::remove_dir(&dir);
    }

    #[test]
    fn test_set_config_persists() {
        let dir = std::env::temp_dir().join("dm_protection_test_config");
        let _ = std::fs::create_dir_all(&dir);
        let path = dir.join(PERSISTENCE_FILE_NAME);
        let _ = std::fs::remove_file(&path);

        let dm = DmProtection {
            config: RwLock::new(DmProtectionConfig::default()),
            pending_codes: Arc::new(RwLock::new(HashMap::new())),
            allowlist: Arc::new(RwLock::new(HashMap::new())),
            storage_path: Some(path.clone()),
        };

        let new_config = DmProtectionConfig {
            enabled: false,
            require_pairing_for_unknown: false,
            code_expiry_minutes: 15,
            max_pending_codes: 20,
        };
        dm.set_config(new_config)
            .expect("set_config should succeed");

        let contents = std::fs::read_to_string(&path).expect("should read file");
        let state: PersistedDmState = serde_json::from_str(&contents).expect("should parse JSON");
        assert!(!state.config.enabled);
        assert!(!state.config.require_pairing_for_unknown);
        assert_eq!(state.config.code_expiry_minutes, 15);
        assert_eq!(state.config.max_pending_codes, 20);

        let _ = std::fs::remove_file(&path);
        let _ = std::fs::remove_dir(&dir);
    }

    #[test]
    fn test_default_is_in_memory_only() {
        let dm = DmProtection::default();
        assert!(dm.storage_path.is_none());
        // Operations still work without persistence.
        dm.add_to_allowlist("test", "test", None)
            .expect("in-memory add should work");
        let list = dm.list_allowlist().expect("list should work");
        assert_eq!(list.len(), 1);
    }
}
