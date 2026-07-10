//! TEST / FIXTURE-SIGNING SUPPORT ONLY — not part of the production verify API.
//!
//! Real licenses and org policies are signed OUT OF BAND by the issuer's private
//! key; production code only ever *verifies*. This module exists so the
//! boundary/rotation/tamper unit tests mint REAL Ed25519 signatures (never
//! hand-forged bytes) and derive keypairs deterministically. It is gated behind
//! `#[cfg(any(test, feature = "test-support"))]` so it never ships in a normal
//! build. It mirrors `packages/licensing/src/test-support.ts`.
//!
//! Determinism: an Ed25519 secret key IS its 32-byte seed, so a keypair derived
//! from a fixed committed seed is byte-reproducible — the same property the TS
//! generator relies on so both languages replay one corpus.

use ed25519_dalek::{Signer, SigningKey};

use crate::bytes::bytes_to_base64;

/// A deterministic Ed25519 test keypair.
pub struct TestKeyPair {
    signing_key: SigningKey,
    /// Base64 public key, as embedded in configs / license `policyKeys`.
    pub public_key_b64: String,
}

impl TestKeyPair {
    /// Raw 32-byte Ed25519 public key.
    pub fn public_key_bytes(&self) -> [u8; 32] {
        self.signing_key.verifying_key().to_bytes()
    }
}

/// Derive a deterministic keypair from a fixed 32-byte seed. Pass a 32-byte
/// array, or a short ASCII label that is truncated/zero-padded to 32 bytes
/// (labels keep fixtures readable — e.g. `"agi-root-key-1"`). Mirrors the TS
/// `deriveKeyPairFromSeed` byte-for-byte.
pub fn derive_keypair_from_seed_label(label: &str) -> TestKeyPair {
    let mut seed = [0u8; 32];
    let label_bytes = label.as_bytes();
    let take = label_bytes.len().min(32);
    seed[..take].copy_from_slice(&label_bytes[..take]);
    derive_keypair_from_seed(seed)
}

/// Derive a deterministic keypair from an exact 32-byte seed.
pub fn derive_keypair_from_seed(seed: [u8; 32]) -> TestKeyPair {
    let signing_key = SigningKey::from_bytes(&seed);
    let public_key_b64 = bytes_to_base64(&signing_key.verifying_key().to_bytes());
    TestKeyPair {
        signing_key,
        public_key_b64,
    }
}

/// Build a signed container file for the given payload object and format.
/// Returns the exact bytes that would be written to disk. The signature is over
/// the ASCII bytes of the base64 payload string, matching the wire format.
pub fn make_signed_container(payload: &serde_json::Value, key: &TestKeyPair, format: &str) -> Vec<u8> {
    let payload_json = serde_json::to_string(payload).expect("payload serializes");
    let payload_b64 = bytes_to_base64(payload_json.as_bytes());
    let signature = key.signing_key.sign(payload_b64.as_bytes());
    let container = serde_json::json!({
        "format": format,
        "payload": payload_b64,
        "signature": bytes_to_base64(&signature.to_bytes()),
    });
    serde_json::to_vec_pretty(&container).expect("container serializes")
}

/// Corrupt an already-signed container by flipping the last non-padding base64
/// character of the payload while leaving the signature intact — yields a
/// container whose signature no longer matches. Mirrors the TS
/// `tamperContainerPayload` (a simple byte-flip, not a malleability edge case,
/// so TS and Rust verifiers agree).
pub fn tamper_container_payload(container_bytes: &[u8]) -> Vec<u8> {
    let text = std::str::from_utf8(container_bytes).expect("container is UTF-8");
    let mut container: serde_json::Value = serde_json::from_str(text).expect("container is JSON");
    let payload = container["payload"].as_str().expect("payload is a string");
    let mut chars: Vec<char> = payload.chars().collect();
    let mut idx = chars.len().saturating_sub(1);
    while idx > 0 && chars[idx] == '=' {
        idx -= 1;
    }
    chars[idx] = if chars[idx] == 'A' { 'B' } else { 'A' };
    let flipped: String = chars.into_iter().collect();
    container["payload"] = serde_json::Value::String(flipped);
    serde_json::to_vec_pretty(&container).expect("container serializes")
}
