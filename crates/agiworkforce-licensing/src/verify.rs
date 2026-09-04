//! `verify_license`: the offline, pure license-verification entry point (design
//! §2.1). Port of `packages/contracts/licensing/src/verify.ts`. No I/O, never panics,
//! never gates data access: an invalid/expired license resolves to a structured
//! `{ ok: false }` verdict the caller uses to degrade to the free Local tier.

use crate::claims::LicenseClaims;
use crate::container::{ContainerErrorCode, VerifiedContainer, verify_signed_container};

/// The `format` discriminator for `.agilicense` containers.
pub const LICENSE_CONTAINER_FORMAT: &str = "agilicense-v1";

const MS_PER_DAY: i64 = 86_400_000;

/// License failure taxonomy (identical to the TS `LicenseErrorCode`).
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum LicenseErrorCode {
    /// Not a well-formed container, or claims JSON/schema invalid.
    Malformed,
    /// Well-formed, but no root key verifies the signature.
    BadSignature,
    /// Signature valid, but the clock is before `issuedAt`.
    NotYetValid,
    /// Signature valid, but now is past `expiresAt + graceDays`. Degrade to free.
    Expired,
}

/// A structured license failure (machine code + human message).
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct LicenseError {
    pub code: LicenseErrorCode,
    pub message: String,
}

/// The verdict of `verify_license`.
#[derive(Debug, Clone, PartialEq, Eq)]
pub enum LicenseVerifyResult {
    Ok {
        claims: LicenseClaims,
        /// True when now is past `expiresAt` but still inside the grace window.
        /// The license is still valid; callers surface a renewal warning.
        grace_active: bool,
    },
    Err(LicenseError),
}

impl LicenseVerifyResult {
    /// Convenience accessor mirroring the TS `result.ok` discriminant.
    pub fn is_ok(&self) -> bool {
        matches!(self, LicenseVerifyResult::Ok { .. })
    }
}

fn err(code: LicenseErrorCode, message: &str) -> LicenseVerifyResult {
    LicenseVerifyResult::Err(LicenseError {
        code,
        message: message.to_string(),
    })
}

/// Verify an `.agilicense` file offline.
///
/// # Arguments
/// * `file_bytes`, raw bytes of the `.agilicense` file.
/// * `root_public_keys`, base64 32-byte Ed25519 root public keys baked into the
///   app build. Rotatable list: the signature must verify against any one of
///   them, so a retired key can coexist with its replacement (design §2.1).
/// * `now_ms`, the local clock in Unix epoch milliseconds (injected, keeps this
///   pure and testable; offline verification uses the local clock).
pub fn verify_license(
    file_bytes: &[u8],
    root_public_keys: &[String],
    now_ms: i64,
) -> LicenseVerifyResult {
    let payload =
        match verify_signed_container(file_bytes, root_public_keys, LICENSE_CONTAINER_FORMAT) {
            VerifiedContainer::Ok { payload } => payload,
            // ContainerErrorCode (Malformed | BadSignature) is a subset of
            // LicenseErrorCode, so the code carries through unchanged.
            VerifiedContainer::Err(error) => {
                let code = match error.code {
                    ContainerErrorCode::Malformed => LicenseErrorCode::Malformed,
                    ContainerErrorCode::BadSignature => LicenseErrorCode::BadSignature,
                };
                return err(code, &error.message);
            }
        };

    let claims_text = match std::str::from_utf8(&payload) {
        Ok(text) => text,
        Err(_) => {
            return err(
                LicenseErrorCode::Malformed,
                "license claims are not valid UTF-8",
            );
        }
    };

    let claims: LicenseClaims = match serde_json::from_str(claims_text) {
        Ok(claims) => claims,
        Err(_) => {
            // Covers both "not valid JSON" and "failed schema", both are a
            // structured `malformed` verdict on the TS side, never a throw.
            return err(
                LicenseErrorCode::Malformed,
                "license claims are not valid JSON or schema",
            );
        }
    };

    if let Err(message) = claims.validate() {
        return err(LicenseErrorCode::Malformed, &message);
    }

    if now_ms < claims.issued_at {
        return err(
            LicenseErrorCode::NotYetValid,
            "license is not yet valid (clock is before issuedAt)",
        );
    }

    // graceDays is a small non-negative day count; the product of it and
    // MS_PER_DAY cannot realistically overflow i64, but saturate to stay panic-free.
    let grace_cutoff = claims
        .expires_at
        .saturating_add((claims.grace_days as i64).saturating_mul(MS_PER_DAY));
    if now_ms > grace_cutoff {
        return err(
            LicenseErrorCode::Expired,
            "license is expired past its grace window; degrade to free tier",
        );
    }

    let grace_active = now_ms > claims.expires_at;
    LicenseVerifyResult::Ok {
        claims,
        grace_active,
    }
}
