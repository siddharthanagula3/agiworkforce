
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
