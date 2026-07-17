//! License claims — the signed payload of an `.agilicense` file. Mirrors
//! `packages/contracts/licensing/src/claims.ts` (design §2.1) exactly.
//!
//! Shape-only validation: `features` is an OPEN string array (product capability
//! flags are a founder pricing/edition decision, populated out of band — never
//! enumerated here). `edition` is the only closed enum. `issuedAt`/`expiresAt`
//! are Unix epoch MILLISECONDS as integers (chosen over ISO strings so this
//! crate replays the fixture corpus without date-parsing ambiguity). `seats` and
//! `graceDays` are non-negative — typed as `u64` so a negative value fails
//! deserialization (→ a `malformed` verdict, matching the TS zod `.nonnegative()`).

use serde::Deserialize;

/// License editions. The only closed enum in the claims (design §2.1).
#[derive(Debug, Clone, Copy, PartialEq, Eq, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum Edition {
    Team,
    Enterprise,
}

/// `LicenseClaims` — the exact claim set from design §2.1. Validates SHAPE only;
/// it never asserts any particular feature flag exists. `deny_unknown_fields`
/// mirrors the TS zod `.strict()`.
#[derive(Debug, Clone, PartialEq, Eq, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct LicenseClaims {
    /// Stable unique id for this issued license.
    pub license_id: String,
    /// Organization this license binds to (also binds org policy — see §2.2).
    pub org_id: String,
    /// Human-readable org name for display in-app.
    pub org_name: String,
    /// Closed enum per design.
    pub edition: Edition,
    /// Honor-count seat number (offline; not server-enforced — design §2.1).
    pub seats: u64,
    /// Unix epoch milliseconds when the license was issued.
    pub issued_at: i64,
    /// Unix epoch milliseconds when the paid term ends (grace applies after).
    pub expires_at: i64,
    /// Extra days after `expiresAt` before enterprise features degrade.
    pub grace_days: u64,
    /// OPEN capability flags. Opaque strings — verification never interprets them.
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
