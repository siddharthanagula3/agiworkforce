//! The `agilicense-v1` / `agipolicy-v1` signed-container format and its
//! verification primitive — a direct port of `packages/licensing/src/container.ts`.
//!
//! A container is one UTF-8 JSON object:
//!
//! ```json
//! {
//!   "format": "agilicense-v1",
//!   "payload": "<base64(standard) of the exact UTF-8 payload JSON bytes>",
//!   "signature": "<base64(standard) of the 64-byte Ed25519 signature>"
//! }
//! ```
//!
//! The signature is computed over the **ASCII bytes of the `payload` base64
//! string** (not the decoded JSON). Verifiers never re-serialize the payload:
//! they verify the signature against `payload.as_bytes()`, then decode `payload`
//! and hand the raw bytes to the caller's schema layer. This eliminates every
//! cross-language serialization ambiguity, which is why the TS and Rust
//! verifiers can share one fixture corpus.
//!
//! The top-level wrapper is parsed leniently (extra keys ignored) to match the
//! TS manual field-extraction; strictness lives in the payload schema layer.

use ed25519_dalek::{Signature, VerifyingKey};
use serde_json::Value;

use crate::bytes::base64_to_bytes;

/// Failure reasons common to any signed container.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum ContainerErrorCode {
    /// Not JSON, wrong container shape, wrong `format`, or un-decodable base64.
    Malformed,
    /// Well-formed container, but no authorized key verifies the signature.
    BadSignature,
}

/// A structured container failure. Carries a human-readable message alongside
/// the machine code (mirrors the TS `ContainerError`).
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct ContainerError {
    pub code: ContainerErrorCode,
    pub message: String,
}

/// Result of verifying a signed container. On success, `payload` is the decoded
/// (base64 → bytes) payload; the caller parses it against its own schema.
#[derive(Debug, Clone, PartialEq, Eq)]
pub enum VerifiedContainer {
    Ok { payload: Vec<u8> },
    Err(ContainerError),
}

const SIGNATURE_LENGTH: usize = 64;
const PUBLIC_KEY_LENGTH: usize = 32;

fn malformed(message: &str) -> VerifiedContainer {
    VerifiedContainer::Err(ContainerError {
        code: ContainerErrorCode::Malformed,
        message: message.to_string(),
    })
}

/// Verify a signed container's structure and signature. Pure, no I/O, never
/// panics. Does NOT interpret the payload (the caller's schema concern).
///
/// The signature must verify against AT LEAST ONE of `authorized_public_keys_b64`
/// (a rotatable list). A malformed configured key is skipped, never fatal — an
/// app baking in one bad root key must not brick verification of a good one.
pub fn verify_signed_container(
    file_bytes: &[u8],
    authorized_public_keys_b64: &[String],
    expected_format: &str,
) -> VerifiedContainer {
    let text = match std::str::from_utf8(file_bytes) {
        Ok(text) => text,
        Err(_) => return malformed("container is not valid UTF-8"),
    };

    let parsed: Value = match serde_json::from_str(text) {
        Ok(value) => value,
        Err(_) => return malformed("container is not valid JSON"),
    };

    let Value::Object(record) = parsed else {
        return malformed("container is not a JSON object");
    };

    if record.get("format").and_then(Value::as_str) != Some(expected_format) {
        return malformed(&format!("container format is not \"{expected_format}\""));
    }

    let (Some(payload_field), Some(signature_field)) = (
        record.get("payload").and_then(Value::as_str),
        record.get("signature").and_then(Value::as_str),
    ) else {
        return malformed("container is missing string \"payload\"/\"signature\" fields");
    };

    let payload_bytes = match base64_to_bytes(payload_field) {
        Some(bytes) => bytes,
        None => return malformed("container payload is not valid base64"),
    };

    let signature_bytes = match base64_to_bytes(signature_field) {
        Some(bytes) if bytes.len() == SIGNATURE_LENGTH => bytes,
        _ => {
            return malformed("container signature is not a base64 64-byte Ed25519 signature");
        }
    };

    if authorized_public_keys_b64.is_empty() {
        return VerifiedContainer::Err(ContainerError {
            code: ContainerErrorCode::BadSignature,
            message: "no authorized public keys provided".to_string(),
        });
    }

    // The signed message is the ASCII bytes of the base64 payload string.
    let signed_message = payload_field.as_bytes();

    // Length was checked above; this conversion cannot fail.
    let signature_array: [u8; SIGNATURE_LENGTH] = match signature_bytes.as_slice().try_into() {
        Ok(array) => array,
        Err(_) => return malformed("container signature has an unexpected length"),
    };
    let signature = Signature::from_bytes(&signature_array);

    for key_b64 in authorized_public_keys_b64 {
        let Some(key_bytes) = base64_to_bytes(key_b64) else {
            // A malformed configured key can't authorize anything; skip it.
            continue;
        };
        let key_array: [u8; PUBLIC_KEY_LENGTH] = match key_bytes.as_slice().try_into() {
            Ok(array) => array,
            Err(_) => continue,
        };
        let Ok(verifying_key) = VerifyingKey::from_bytes(&key_array) else {
            // Non-canonical / small-order point: cannot authorize; try the next.
            continue;
        };
        // `verify_strict` rejects signature malleability and weak keys — the
        // conservative choice for a security primitive. It agrees with the TS
        // side (`@noble/curves` `verify`) on this fixture corpus, which contains
        // only honest signatures and simple byte-flip tampering.
        if verifying_key.verify_strict(signed_message, &signature).is_ok() {
            return VerifiedContainer::Ok {
                payload: payload_bytes,
            };
        }
    }

    VerifiedContainer::Err(ContainerError {
        code: ContainerErrorCode::BadSignature,
        message: "signature not authorized by any provided key".to_string(),
    })
}
