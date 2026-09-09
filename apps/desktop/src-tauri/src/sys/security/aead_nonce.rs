//! The single source of AES-256-GCM nonces.
//!
//! Every store in this crate frames a record as `nonce || ciphertext` under a
//! long-lived key, so a repeated nonce is not a weakness but a total loss: two
//! records under one nonce leak the XOR of their plaintexts and forge the GCM
//! tag. Hand-rolling the draw at each call site put fourteen copies of that
//! decision in the tree, and a zero-filled buffer one line away from the
//! `encrypt` call is indistinguishable, to a reader or a scanner, from a fixed
//! nonce that was never filled.

use aes_gcm::aead::{AeadCore, OsRng};
use aes_gcm::{Aes256Gcm, Nonce};

pub const NONCE_LEN: usize = 12;

type GcmNonce = Nonce<<Aes256Gcm as AeadCore>::NonceSize>;

/// Draw a fresh 96-bit nonce from the operating system CSPRNG.
pub fn random_nonce() -> GcmNonce {
    Aes256Gcm::generate_nonce(&mut OsRng)
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::collections::HashSet;

    #[test]
    fn draws_a_full_width_nonce() {
        assert_eq!(random_nonce().len(), NONCE_LEN);
    }

    #[test]
    fn never_returns_the_zero_nonce() {
        assert!(random_nonce().iter().any(|byte| *byte != 0));
    }

    #[test]
    fn does_not_repeat_across_draws() {
        let drawn: HashSet<Vec<u8>> = (0..512).map(|_| random_nonce().to_vec()).collect();
        assert_eq!(drawn.len(), 512);
    }
}
