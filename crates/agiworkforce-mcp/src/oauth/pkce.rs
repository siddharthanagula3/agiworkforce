//! PKCE (RFC 7636) primitives.
//!
//! Reimplemented in-crate rather than depending on the CLI's `crate::oauth` so
//! the engine is self-contained. The algorithm is standard S256 with a
//! uniform (rejection-sampled) verifier/state, ported byte-for-byte from the
//! CLI generator — PKCE values are random per-flow, so any correct S256
//! implementation is wire-equivalent.

use base64::{Engine, engine::general_purpose::URL_SAFE_NO_PAD};
use sha2::{Digest, Sha256};

/// A verifier + its S256 challenge. The `state` CSRF nonce is generated
/// separately by the caller so it never shares entropy with the verifier.
pub(crate) struct PkceCodes {
    pub verifier: String,
    pub challenge: String,
}

pub(crate) fn generate_pkce() -> PkceCodes {
    let verifier = generate_random_string(43);
    let hash = Sha256::digest(verifier.as_bytes());
    let challenge = URL_SAFE_NO_PAD.encode(hash);
    PkceCodes { verifier, challenge }
}

/// Uniformly-random string over the PKCE unreserved alphabet.
pub(crate) fn generate_random_string(len: usize) -> String {
    let chars = b"ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-._~";
    let alphabet_len = chars.len();
    let mut result = String::with_capacity(len);
    let mut remaining = len;

    // Rejection-sampling cutoff: keep only byte values below the largest
    // multiple of `alphabet_len` that is <= 256 so the `% alphabet_len` mapping
    // is uniform. Computed in u16 to avoid u8 overflow when the alphabet length
    // divides 256 (cutoff stays 256, accept all bytes).
    let cutoff: u16 = 256 - (256 % alphabet_len as u16);

    // Use UUID v4 as a CSPRNG source (backed by OS randomness via getrandom).
    // Each UUID yields 16 random bytes; loop until we have enough.
    while remaining > 0 {
        let bytes = uuid::Uuid::new_v4().into_bytes();
        for &byte in bytes.iter() {
            if remaining == 0 {
                break;
            }
            // Discard biased bytes; the next UUID refills the pool.
            if u16::from(byte) >= cutoff {
                continue;
            }
            result.push(chars[(byte as usize) % alphabet_len] as char);
            remaining -= 1;
        }
    }

    result
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn verifier_is_43_chars_in_alphabet() {
        let s = generate_random_string(43);
        assert_eq!(s.chars().count(), 43);
        assert!(
            s.chars()
                .all(|c| c.is_ascii_alphanumeric() || matches!(c, '-' | '.' | '_' | '~'))
        );
    }

    #[test]
    fn challenge_is_s256_of_verifier() {
        let pkce = generate_pkce();
        let expected = URL_SAFE_NO_PAD.encode(Sha256::digest(pkce.verifier.as_bytes()));
        assert_eq!(pkce.challenge, expected);
        // base64url no-pad => no '+', '/', or '=' characters.
        assert!(!pkce.challenge.contains(['+', '/', '=']));
    }

    #[test]
    fn random_strings_are_distinct() {
        assert_ne!(generate_random_string(32), generate_random_string(32));
    }
}
