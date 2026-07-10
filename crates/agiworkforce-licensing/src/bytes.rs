//! Byte codecs shared by the container layer.
//!
//! Standard base64 (RFC 4648, `=`-padded) is the on-wire encoding for the
//! container `payload`/`signature` fields and for public keys — matching the TS
//! `bytes.ts` codec. We use the `base64` crate's STANDARD engine, which requires
//! correct padding and rejects non-alphabet characters, and returns `None`
//! rather than erroring (the TS decoder's reject-don't-throw contract).
//!
//! The two decoders agree on all fixtures (honest base64 always has canonical
//! trailing bits, and the deterministic tampered fixture decodes in both). They
//! could differ only on a crafted input with non-canonical trailing bits, which
//! STANDARD rejects and the TS decoder masks — but that split is `malformed` vs
//! `bad_signature`, both `ok:false`, so caller behavior (degrade to free) is
//! identical either way.

use base64::Engine as _;
use base64::engine::general_purpose::STANDARD;

/// Strict standard-base64 decode. Returns `None` on any malformed input
/// (invalid character, bad length, misplaced padding) rather than erroring, so
/// container verification can map it to a `malformed` verdict without unwinding.
pub(crate) fn base64_to_bytes(value: &str) -> Option<Vec<u8>> {
    STANDARD.decode(value.as_bytes()).ok()
}

/// Standard base64 encode (with padding). Used only by the test-support signing
/// helpers so generated fixtures encode identically to the TS side.
#[cfg(any(test, feature = "test-support"))]
pub(crate) fn bytes_to_base64(bytes: &[u8]) -> String {
    STANDARD.encode(bytes)
}
