//! DM Protection with pairing codes for unknown senders

use crate::sys::error::{Error, Result};
use serde::{Deserialize, Serialize};
use std::collections::HashMap;
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

/// DM Protection manager
pub struct DmProtection {
    config: RwLock<DmProtectionConfig>,
    pending_codes: Arc<RwLock<HashMap<String, PairingCode>>>,
    allowlist: Arc<RwLock<HashMap<String, AllowlistedSender>>>,
}

impl DmProtection {
    pub fn new(config: DmProtectionConfig) -> Self {
        Self {
            config: RwLock::new(config),
            pending_codes: Arc::new(RwLock::new(HashMap::new())),
            allowlist: Arc::new(RwLock::new(HashMap::new())),
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
            .map(|_| char::from_digit(rand::random::<u32>() % 10, 10).unwrap())
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

    /// Verify a pairing code
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

        Ok(())
    }

    /// Remove from allowlist
    pub fn remove_from_allowlist(&self, sender_id: &str) -> Result<bool> {
        let mut allowlist = self
            .allowlist
            .write()
            .map_err(|e| Error::Generic(e.to_string()))?;
        Ok(allowlist.remove(sender_id).is_some())
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
        Ok(())
    }
}

impl Default for DmProtection {
    fn default() -> Self {
        Self::new(DmProtectionConfig::default())
    }
}
