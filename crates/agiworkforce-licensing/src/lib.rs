//! `agiworkforce-licensing` — the Rust half of the offline enterprise-Local
//! licensing verify primitive (retention boundary:
//! `docs/decisions/2026-07-30-enterprise-local-verifier-retention.md`).
//!
//! This crate is a byte-for-byte re-implementation of the TypeScript
//! `@agiworkforce/licensing` package (`packages/contracts/licensing`), including its
//! org-policy verifier (`packages/contracts/licensing/src/org-policy.ts`). Both implementations
//! deliberately share ONE language-neutral fixture corpus so the Rust verdicts
//! can be proven identical to the TS verdicts — the same cross-language replay
//! pattern used by `sync-apply`. The container format is intentionally
//! JWT-shaped (a base64 `payload` string plus a detached Ed25519 signature over
//! the ASCII bytes of that base64 string) so NO canonical-JSON step is needed
//! and neither side ever re-serializes the payload.
//!
//! ## Invariants (mirrored from the TS side)
//!
//! - **Never panics on input.** Every failure path returns a typed verdict; the
//!   public API never `unwrap`s attacker-controlled bytes.
//! - **Never gates data access.** An invalid/expired license resolves to a
//!   structured `{ ok: false }` verdict the caller uses to degrade to the free
//!   Local tier — verification never bricks and never throws.
//! - **Verify-only.** This crate does not sign, activate, or interpret product
//!   feature flags. Editions/pricing/feature semantics (design §4) stay
//!   founder-gated and out of band. It is NOT wired into any app/desktop/CLI/
//!   gateway runtime.
//!
//! The `test-support` feature (fixture signing) exists only so the
//! boundary/rotation/tamper tests can mint real Ed25519 signatures; it is never
//! part of the production verify surface.

mod bytes;
mod claims;
mod container;
mod org_policy;
mod verify;

#[cfg(any(test, feature = "test-support"))]
pub mod test_support;

pub use claims::{Edition, LicenseClaims};
pub use container::{
    ContainerError, ContainerErrorCode, VerifiedContainer, verify_signed_container,
};
pub use org_policy::{
    OrgPolicy, OrgPolicyAuditExport, OrgPolicyByok, OrgPolicyEgress, OrgPolicyError,
    OrgPolicyErrorCode, OrgPolicyVerifyResult, POLICY_CONTAINER_FORMAT, PolicyPermissions,
    TighteningResult, check_policy_tightening, default_policy_baseline, verify_org_policy,
};
pub use verify::{
    LICENSE_CONTAINER_FORMAT, LicenseError, LicenseErrorCode, LicenseVerifyResult, verify_license,
};

#[cfg(test)]
mod tests;
