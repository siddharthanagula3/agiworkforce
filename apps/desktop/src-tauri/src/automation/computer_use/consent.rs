//! Consent Gate for Computer Use.
//!
//! Tracks whether the user has accepted the computer use terms.
//! Must be accepted before any computer use session can start.

use chrono::{DateTime, Utc};
use serde::{Deserialize, Serialize};

/// Current consent version. Increment to force re-consent on major changes.
pub const CONSENT_VERSION: &str = "1.0";

/// Settings key for persisting consent state.
pub const CONSENT_SETTINGS_KEY: &str = "computer_use.consent";

/// Persisted consent state.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ComputerUseConsent {
    /// Whether the user has accepted computer use terms.
    pub accepted: bool,
    /// When consent was given.
    #[serde(skip_serializing_if = "Option::is_none")]
    pub accepted_at: Option<DateTime<Utc>>,
    /// Consent version that was accepted.
    pub version: String,
}

impl ComputerUseConsent {
    /// Creates a default (not accepted) consent state.
    pub fn not_accepted() -> Self {
        Self {
            accepted: false,
            accepted_at: None,
            version: CONSENT_VERSION.to_string(),
        }
    }

    /// Records that consent was given.
    pub fn accept() -> Self {
        Self {
            accepted: true,
            accepted_at: Some(Utc::now()),
            version: CONSENT_VERSION.to_string(),
        }
    }

    /// Whether consent is valid (accepted and correct version).
    pub fn is_valid(&self) -> bool {
        self.accepted && self.version == CONSENT_VERSION
    }
}

impl Default for ComputerUseConsent {
    fn default() -> Self {
        Self::not_accepted()
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_default_is_not_accepted() {
        let consent = ComputerUseConsent::default();
        assert!(!consent.accepted);
        assert!(!consent.is_valid());
    }

    #[test]
    fn test_accept() {
        let consent = ComputerUseConsent::accept();
        assert!(consent.accepted);
        assert!(consent.is_valid());
        assert!(consent.accepted_at.is_some());
    }

    #[test]
    fn test_version_mismatch_invalidates() {
        let mut consent = ComputerUseConsent::accept();
        consent.version = "0.9".to_string();
        assert!(!consent.is_valid());
    }

    #[test]
    fn test_json_roundtrip() {
        let consent = ComputerUseConsent::accept();
        let json = serde_json::to_string(&consent).unwrap();
        let restored: ComputerUseConsent = serde_json::from_str(&json).unwrap();
        assert!(restored.is_valid());
    }
}
