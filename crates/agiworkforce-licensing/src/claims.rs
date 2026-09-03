
use serde::Deserialize;

/// License editions. The only closed enum in the claims (design §2.1).
#[derive(Debug, Clone, Copy, PartialEq, Eq, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum Edition {
    Team,
    Enterprise,
}

#[derive(Debug, Clone, PartialEq, Eq, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct LicenseClaims {
    /// Stable unique id for this issued license.
    pub license_id: String,
    pub org_id: String,
    /// Human-readable org name for display in-app.
    pub org_name: String,
    /// Closed enum per design.
    pub edition: Edition,
    pub seats: u64,
    /// Unix epoch milliseconds when the license was issued.
    pub issued_at: i64,
    /// Unix epoch milliseconds when the paid term ends (grace applies after).
    pub expires_at: i64,
    /// Extra days after `expiresAt` before enterprise features degrade.
    pub grace_days: u64,
    pub features: Vec<String>,
    /// Base64-encoded 32-byte raw Ed25519 public keys authorized to sign org
    /// policy for this org. The license is the root of trust for policy.
    pub policy_keys: Vec<String>,
}

impl LicenseClaims {
    /// Mirror the TS zod `.min(1)` string constraints. Returns an error message
    /// on the first empty required string, else `Ok`. Callers translate an error
    /// into a `malformed` verdict.
    pub(crate) fn validate(&self) -> Result<(), String> {
        for (field, value) in [
            ("licenseId", &self.license_id),
            ("orgId", &self.org_id),
            ("orgName", &self.org_name),
        ] {
            if value.is_empty() {
                return Err(format!(
                    "license claims field \"{field}\" must be non-empty"
                ));
            }
        }
        Ok(())
    }
}
