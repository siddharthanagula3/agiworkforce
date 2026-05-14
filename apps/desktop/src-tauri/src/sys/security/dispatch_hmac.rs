//! Application-layer HMAC authentication for Dispatch control messages.
//!
//! Desktop counterpart to `apps/mobile/lib/dispatchHmac.ts`. Mobile signs
//! every outbound control message with HMAC-SHA-256 over a canonical envelope;
//! desktop must verify the HMAC, the timestamp window, and the nonce
//! freshness. Without verification, an attacker who reaches the signaling
//! relay can forge `surface=desktop, role=assistant` messages that the mobile
//! UI consumes via Realtime — a prompt-injection vector.
//!
//! # Wire format
//!
//! ```text
//! {
//!   "hmac":    "<hex HMAC-SHA-256, 64 chars>",
//!   "nonce":   "<base64 16 random bytes>",
//!   "payload": <original control-message JSON>,
//!   "ts":      <unix ms integer>,
//!   "type":    "<action string, mirrors payload.action>"
//! }
//! ```
//!
//! Keys are alphabetically ordered. The HMAC covers
//! `JSON.stringify({nonce, payload, ts, type})` — i.e. the envelope without
//! the `hmac` field. Mobile uses `JSON.stringify` with insertion-order keys;
//! we preserve compatibility by holding `payload` as a raw JSON value (no
//! re-canonicalization on the receive path).
//!
//! # Session secret derivation (HKDF-SHA-256, RFC 5869)
//!
//! ```text
//! IKM  = UTF-8(pairing_code)               // ≥8 uppercase alphanum
//! Salt = UTF-8(session_salt)               // not secret; from signaling
//! Info = UTF-8("dispatch-hmac-v2")
//! PRK  = HMAC-SHA-256(salt, IKM)           // extract
//! OKM  = HMAC-SHA-256(PRK, Info || 0x01)   // single-block expand → 32 bytes
//! ```
//!
//! # Replay prevention
//!
//! 1. Timestamp window: receiver rejects |now - ts| > 30_000 ms.
//! 2. Nonce cache: sliding 60s window, duplicate nonces rejected, stale
//!    entries evicted on each verify call.
//!
//! # Transitional mode
//!
//! Messages without an `hmac` field are accepted with a warning until
//! [`DISPATCH_HMAC_REQUIRED_AFTER`]. After that date they are rejected with
//! [`VerifyError::UnsignedTransitional`]. This mirrors the mobile cutoff
//! exactly so both peers fail-closed at the same moment.

use std::collections::HashMap;
use std::time::{SystemTime, UNIX_EPOCH};

use base64::engine::general_purpose::STANDARD as BASE64;
use base64::Engine as _;
use hmac::{Hmac, Mac};
use rand::RngCore;
use serde::{Deserialize, Serialize};
use serde_json::value::RawValue;
use sha2::Sha256;
use subtle::ConstantTimeEq;
use thiserror::Error;

type HmacSha256 = Hmac<Sha256>;

/// Maximum age (ms) we accept for incoming messages.
pub const MAX_MESSAGE_AGE_MS: i64 = 30_000;

/// Sliding-window nonce-cache TTL (ms). Must be ≥ 2× [`MAX_MESSAGE_AGE_MS`]
/// so a nonce seen at the edge of the acceptance window is still in the
/// cache when a replay attempt arrives.
pub const NONCE_CACHE_TTL_MS: i64 = 60_000;

/// ISO 8601 UTC date after which unsigned messages must be rejected.
/// Mirrors `apps/mobile/lib/dispatchHmac.ts:DISPATCH_HMAC_REQUIRED_AFTER`.
pub const DISPATCH_HMAC_REQUIRED_AFTER: &str = "2026-06-05T00:00:00.000Z";
const DISPATCH_HMAC_REQUIRED_AFTER_MS: i64 = 1_780_185_600_000;

/// HKDF info parameter — must match the mobile peer.
const HKDF_INFO: &[u8] = b"dispatch-hmac-v2";

/// Derived session-key length (bytes).
pub const SESSION_KEY_LEN: usize = 32;

/// Errors that can occur during key derivation.
#[derive(Debug, Error)]
pub enum DeriveError {
    #[error("hmac initialization failed: {0}")]
    HmacInit(String),
    #[error("pairing_code must be at least 8 chars")]
    PairingCodeTooShort,
    #[error("session_salt must be non-empty")]
    SaltEmpty,
}

/// Reasons a [`verify`] call may reject an envelope. Matches the
/// `VerifyResult.reason` discriminant on the mobile side.
#[derive(Debug, Error, PartialEq, Eq)]
pub enum VerifyError {
    /// Envelope shape was wrong (missing fields, non-object input, etc.).
    #[error("malformed envelope")]
    Malformed,
    /// `hmac` field was absent and we are past the cutoff date.
    #[error("unsigned envelope rejected after cutoff")]
    UnsignedTransitional,
    /// `|now - ts|` exceeded [`MAX_MESSAGE_AGE_MS`].
    #[error("timestamp outside ±{0}ms window")]
    TimestampExpired(i64),
    /// Nonce already seen within [`NONCE_CACHE_TTL_MS`].
    #[error("nonce replay")]
    NonceReplay,
    /// Computed HMAC did not match envelope's `hmac` field.
    #[error("hmac mismatch")]
    HmacMismatch,
    /// Envelope contained a malformed hex/base64 field.
    #[error("invalid encoding: {0}")]
    InvalidEncoding(String),
}

/// Outcome of [`verify`] — `Ok(VerifyOk::Signed)` when HMAC matched and the
/// nonce was added to the cache; `Ok(VerifyOk::UnsignedTransitional)` when
/// no `hmac` field was present and we are still within the transitional
/// window (caller should `tracing::warn!` and process anyway).
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum VerifyOk {
    Signed,
    UnsignedTransitional,
}

/// A signed envelope as it appears on the wire. `payload` is held as a
/// raw JSON value so we sign over the original bytes — re-canonicalizing
/// would break compatibility with mobile's `JSON.stringify` insertion order.
#[derive(Debug, Serialize, Deserialize)]
pub struct Envelope<'a> {
    pub hmac: String,
    pub nonce: String,
    #[serde(borrow)]
    pub payload: &'a RawValue,
    pub ts: i64,
    #[serde(rename = "type")]
    pub msg_type: String,
}

/// An envelope without an `hmac` field — used for the transitional window
/// where mobile may still receive unsigned desktop messages.
#[derive(Debug, Deserialize)]
struct MaybeSignedEnvelope<'a> {
    #[serde(default)]
    hmac: Option<String>,
    #[serde(default)]
    nonce: Option<String>,
    #[serde(default, borrow)]
    payload: Option<&'a RawValue>,
    #[serde(default)]
    ts: Option<i64>,
    #[serde(default, rename = "type")]
    msg_type: Option<String>,
}

/// Sliding-window nonce cache. Wrapped in a struct so callers can pass it
/// by `&mut` without juggling map types.
#[derive(Debug, Default)]
pub struct NonceCache {
    seen: HashMap<String, i64>,
}

impl NonceCache {
    pub fn new() -> Self {
        Self::default()
    }

    /// Drop entries older than [`NONCE_CACHE_TTL_MS`] relative to `now`.
    pub fn prune(&mut self, now_ms: i64) {
        let cutoff = now_ms - NONCE_CACHE_TTL_MS;
        self.seen.retain(|_, ts| *ts >= cutoff);
    }

    fn contains(&self, nonce: &str) -> bool {
        self.seen.contains_key(nonce)
    }

    fn insert(&mut self, nonce: String, ts: i64) {
        self.seen.insert(nonce, ts);
    }

    pub fn len(&self) -> usize {
        self.seen.len()
    }

    pub fn is_empty(&self) -> bool {
        self.seen.is_empty()
    }
}

/// Derive the shared 32-byte session key via HKDF-SHA-256. Mirrors
/// `apps/mobile/lib/dispatchHmac.ts:deriveDispatchSecret`.
pub fn derive_session_key(
    pairing_code: &str,
    session_salt: &str,
) -> Result<[u8; SESSION_KEY_LEN], DeriveError> {
    if pairing_code.len() < 8 {
        return Err(DeriveError::PairingCodeTooShort);
    }
    if session_salt.is_empty() {
        return Err(DeriveError::SaltEmpty);
    }

    // HKDF-Extract: PRK = HMAC-SHA-256(salt, IKM)
    let mut extract = HmacSha256::new_from_slice(session_salt.as_bytes())
        .map_err(|e| DeriveError::HmacInit(e.to_string()))?;
    extract.update(pairing_code.as_bytes());
    let prk = extract.finalize().into_bytes();

    // HKDF-Expand single block: OKM = HMAC-SHA-256(PRK, info || 0x01)
    let mut expand =
        HmacSha256::new_from_slice(&prk).map_err(|e| DeriveError::HmacInit(e.to_string()))?;
    expand.update(HKDF_INFO);
    expand.update(&[0x01]);
    let okm = expand.finalize().into_bytes();

    let mut out = [0u8; SESSION_KEY_LEN];
    out.copy_from_slice(&okm[..SESSION_KEY_LEN]);
    Ok(out)
}

/// Build the canonical signing input. Keys are emitted in alphabetical
/// order: `nonce < payload < ts < type`. The `payload` is splat into the
/// string verbatim — its original byte sequence determines the HMAC.
fn canonical_signing_input(nonce: &str, payload: &RawValue, ts: i64, msg_type: &str) -> String {
    // serde_json::to_string for a String escapes JSON special chars correctly
    // (quotes, backslashes, control chars). We rely on that for nonce/type.
    let nonce_json =
        serde_json::to_string(nonce).expect("nonce string must always serialize as JSON");
    let type_json =
        serde_json::to_string(msg_type).expect("msg_type string must always serialize as JSON");
    format!(
        "{{\"nonce\":{nonce},\"payload\":{payload},\"ts\":{ts},\"type\":{type_}}}",
        nonce = nonce_json,
        payload = payload.get(),
        ts = ts,
        type_ = type_json,
    )
}

fn current_time_ms() -> i64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|d| d.as_millis() as i64)
        .unwrap_or(0)
}

/// Verify a signed envelope received from the mobile peer.
///
/// On success the nonce is added to `cache`. The caller keeps the cache
/// for the duration of the session.
pub fn verify(
    raw_envelope_json: &str,
    session_key: &[u8; SESSION_KEY_LEN],
    cache: &mut NonceCache,
) -> Result<VerifyOk, VerifyError> {
    verify_with_clock(raw_envelope_json, session_key, cache, current_time_ms())
}

/// Test-friendly verify that accepts an explicit clock value.
pub fn verify_with_clock(
    raw_envelope_json: &str,
    session_key: &[u8; SESSION_KEY_LEN],
    cache: &mut NonceCache,
    now_ms: i64,
) -> Result<VerifyOk, VerifyError> {
    // Explicitly reject non-objects (arrays, null, scalars, garbage) before
    // struct deserialization. serde happily fills a struct with all defaults
    // from `null` or `[]`, which would silently route into the unsigned-
    // transitional path — we want those rejected as Malformed.
    let trimmed = raw_envelope_json.trim_start();
    if !trimmed.starts_with('{') {
        return Err(VerifyError::Malformed);
    }
    let parsed: MaybeSignedEnvelope =
        serde_json::from_str(raw_envelope_json).map_err(|_| VerifyError::Malformed)?;

    // Transitional path — no hmac field present.
    if parsed.hmac.is_none() {
        if now_ms < DISPATCH_HMAC_REQUIRED_AFTER_MS {
            return Ok(VerifyOk::UnsignedTransitional);
        }
        return Err(VerifyError::UnsignedTransitional);
    }

    // Past this point all signed-envelope fields are required.
    let hmac = parsed.hmac.ok_or(VerifyError::Malformed)?;
    let nonce = parsed.nonce.ok_or(VerifyError::Malformed)?;
    let payload = parsed.payload.ok_or(VerifyError::Malformed)?;
    let ts = parsed.ts.ok_or(VerifyError::Malformed)?;
    let msg_type = parsed.msg_type.ok_or(VerifyError::Malformed)?;

    // Timestamp window: |now - ts| <= MAX_MESSAGE_AGE_MS
    let age = now_ms - ts;
    if age > MAX_MESSAGE_AGE_MS || age < -MAX_MESSAGE_AGE_MS {
        return Err(VerifyError::TimestampExpired(MAX_MESSAGE_AGE_MS));
    }

    // Nonce cache check — prune stale entries first.
    cache.prune(now_ms);
    if cache.contains(&nonce) {
        return Err(VerifyError::NonceReplay);
    }

    // Decode the claimed HMAC from hex; reject malformed encodings before
    // doing any crypto so we don't waste cycles on garbage input.
    let claimed_hmac = hex_decode_32(&hmac)
        .ok_or_else(|| VerifyError::InvalidEncoding("hmac is not 64-char hex".into()))?;

    // Compute the expected HMAC over the canonical signing input.
    let signing_input = canonical_signing_input(&nonce, payload, ts, &msg_type);
    let mut mac = HmacSha256::new_from_slice(session_key)
        .map_err(|_| VerifyError::InvalidEncoding("session_key length".into()))?;
    mac.update(signing_input.as_bytes());
    let expected = mac.finalize().into_bytes();

    // Constant-time compare. `subtle::ConstantTimeEq` returns a Choice;
    // unwrap_u8() == 1 means equal.
    if expected.as_slice().ct_eq(&claimed_hmac).unwrap_u8() != 1 {
        return Err(VerifyError::HmacMismatch);
    }

    cache.insert(nonce, now_ms);
    Ok(VerifyOk::Signed)
}

/// Sign an outbound payload, returning the wire JSON ready to send.
///
/// `payload_json` must be a valid JSON value (object, array, string, etc.).
/// The 16-byte nonce is generated via `getrandom`.
pub fn sign_to_string<P: Serialize>(
    payload: &P,
    msg_type: &str,
    session_key: &[u8; SESSION_KEY_LEN],
) -> Result<String, serde_json::Error> {
    let mut nonce_bytes = [0u8; 16];
    rand::thread_rng().fill_bytes(&mut nonce_bytes);
    let nonce = BASE64.encode(nonce_bytes);
    let ts = current_time_ms();
    sign_to_string_with_inputs(payload, msg_type, session_key, &nonce, ts)
}

/// Test-friendly variant that accepts an explicit nonce + ts so unit tests
/// can produce reproducible envelopes.
pub fn sign_to_string_with_inputs<P: Serialize>(
    payload: &P,
    msg_type: &str,
    session_key: &[u8; SESSION_KEY_LEN],
    nonce: &str,
    ts: i64,
) -> Result<String, serde_json::Error> {
    let payload_string = serde_json::to_string(payload)?;
    let payload_raw = RawValue::from_string(payload_string)?;

    let signing_input = canonical_signing_input(nonce, &payload_raw, ts, msg_type);
    let mut mac =
        HmacSha256::new_from_slice(session_key).expect("session_key length is fixed at 32 bytes");
    mac.update(signing_input.as_bytes());
    let mac_bytes = mac.finalize().into_bytes();
    let hmac = hex_encode(&mac_bytes);

    // Emit fields in alphabetical order to match the canonical signing
    // form one-to-one. (Not required for HMAC integrity since payload is
    // raw, but matches mobile's wire layout.)
    let envelope = format!(
        "{{\"hmac\":{hmac_json},\"nonce\":{nonce_json},\"payload\":{payload},\"ts\":{ts},\"type\":{type_json}}}",
        hmac_json = serde_json::to_string(&hmac)?,
        nonce_json = serde_json::to_string(nonce)?,
        payload = payload_raw.get(),
        ts = ts,
        type_json = serde_json::to_string(msg_type)?,
    );
    Ok(envelope)
}

fn hex_encode(bytes: &[u8]) -> String {
    let mut out = String::with_capacity(bytes.len() * 2);
    for b in bytes {
        out.push_str(&format!("{:02x}", b));
    }
    out
}

fn hex_decode_32(s: &str) -> Option<[u8; 32]> {
    if s.len() != 64 {
        return None;
    }
    let mut out = [0u8; 32];
    for (i, byte) in out.iter_mut().enumerate() {
        let pair = s.get(i * 2..i * 2 + 2)?;
        *byte = u8::from_str_radix(pair, 16).ok()?;
    }
    Some(out)
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;

    fn key_from(pairing: &str, salt: &str) -> [u8; 32] {
        derive_session_key(pairing, salt).expect("derivation should succeed for valid inputs")
    }

    // ----- Key derivation -----

    #[test]
    fn derive_produces_32_bytes() {
        let key = derive_session_key("ABCD1234", "saltsalt").expect("derive ok");
        assert_eq!(key.len(), 32);
    }

    #[test]
    fn derive_is_deterministic() {
        let k1 = derive_session_key("MYCODE99", "sessionA").unwrap();
        let k2 = derive_session_key("MYCODE99", "sessionA").unwrap();
        assert_eq!(k1, k2);
    }

    #[test]
    fn derive_differs_on_pairing_code() {
        let k1 = derive_session_key("AAAABBBB", "saltsalt").unwrap();
        let k2 = derive_session_key("CCCCDDDD", "saltsalt").unwrap();
        assert_ne!(k1, k2);
    }

    #[test]
    fn derive_differs_on_session_salt() {
        let k1 = derive_session_key("AAAABBBB", "salt1").unwrap();
        let k2 = derive_session_key("AAAABBBB", "salt2").unwrap();
        assert_ne!(k1, k2);
    }

    #[test]
    fn derive_rejects_short_pairing_code() {
        assert!(matches!(
            derive_session_key("SHORT", "salt"),
            Err(DeriveError::PairingCodeTooShort)
        ));
    }

    #[test]
    fn derive_rejects_empty_salt() {
        assert!(matches!(
            derive_session_key("ABCDEFGH", ""),
            Err(DeriveError::SaltEmpty)
        ));
    }

    // -----  Sign / verify round-trip  -----

    #[test]
    fn sign_then_verify_succeeds() {
        let key = key_from("ABCD1234", "saltsalt");
        let envelope = sign_to_string_with_inputs(
            &json!({"action": "ping", "value": 42}),
            "ping",
            &key,
            "AAAABBBBCCCCDDDDEEEE==",
            1_700_000_000_000,
        )
        .unwrap();

        let mut cache = NonceCache::new();
        let result = verify_with_clock(&envelope, &key, &mut cache, 1_700_000_000_500);
        assert_eq!(result, Ok(VerifyOk::Signed));
        assert_eq!(cache.len(), 1);
    }

    #[test]
    fn verify_rejects_tampered_payload() {
        let key = key_from("ABCD1234", "saltsalt");
        let envelope = sign_to_string_with_inputs(
            &json!({"action": "ping"}),
            "ping",
            &key,
            "NONCE_REPLAY_TEST_XYZW",
            1_700_000_000_000,
        )
        .unwrap();

        // Tamper: change "ping" → "pong" in the payload
        let tampered = envelope.replace("\"action\":\"ping\"", "\"action\":\"pong\"");
        assert_ne!(tampered, envelope);

        let mut cache = NonceCache::new();
        let result = verify_with_clock(&tampered, &key, &mut cache, 1_700_000_000_500);
        assert_eq!(result, Err(VerifyError::HmacMismatch));
    }

    #[test]
    fn verify_rejects_tampered_type() {
        let key = key_from("ABCD1234", "saltsalt");
        let envelope = sign_to_string_with_inputs(
            &json!({}),
            "ping",
            &key,
            "TYPE_TAMPER_NONCE_AAAA",
            1_700_000_000_000,
        )
        .unwrap();
        let tampered = envelope.replace("\"type\":\"ping\"", "\"type\":\"pong\"");
        let mut cache = NonceCache::new();
        let result = verify_with_clock(&tampered, &key, &mut cache, 1_700_000_000_500);
        assert_eq!(result, Err(VerifyError::HmacMismatch));
    }

    #[test]
    fn verify_rejects_wrong_session_key() {
        let key = key_from("ABCD1234", "saltsalt");
        let other = key_from("DIFFERENT", "saltsalt");
        let envelope = sign_to_string_with_inputs(
            &json!({}),
            "ping",
            &key,
            "WRONG_KEY_NONCE_TESTAA",
            1_700_000_000_000,
        )
        .unwrap();
        let mut cache = NonceCache::new();
        let result = verify_with_clock(&envelope, &other, &mut cache, 1_700_000_000_500);
        assert_eq!(result, Err(VerifyError::HmacMismatch));
    }

    // -----  Timestamp window  -----

    #[test]
    fn verify_rejects_too_old_timestamp() {
        let key = key_from("ABCD1234", "saltsalt");
        let envelope = sign_to_string_with_inputs(
            &json!({}),
            "ping",
            &key,
            "OLD_NONCE_AAAAAAAAAAAA",
            1_000_000_000_000,
        )
        .unwrap();
        // 31s in the future relative to envelope ts.
        let mut cache = NonceCache::new();
        let now = 1_000_000_000_000 + 31_000;
        let result = verify_with_clock(&envelope, &key, &mut cache, now);
        assert_eq!(result, Err(VerifyError::TimestampExpired(MAX_MESSAGE_AGE_MS)));
    }

    #[test]
    fn verify_rejects_far_future_timestamp() {
        let key = key_from("ABCD1234", "saltsalt");
        let envelope = sign_to_string_with_inputs(
            &json!({}),
            "ping",
            &key,
            "FUTURE_NONCE_AAAAAAAA",
            1_700_000_000_000,
        )
        .unwrap();
        let mut cache = NonceCache::new();
        // 31s before envelope ts → message claims to be from 31s in the future.
        let now = 1_700_000_000_000 - 31_000;
        let result = verify_with_clock(&envelope, &key, &mut cache, now);
        assert_eq!(result, Err(VerifyError::TimestampExpired(MAX_MESSAGE_AGE_MS)));
    }

    #[test]
    fn verify_accepts_timestamp_at_boundary() {
        let key = key_from("ABCD1234", "saltsalt");
        let envelope = sign_to_string_with_inputs(
            &json!({}),
            "ping",
            &key,
            "BOUNDARY_NONCE_AAAAAA",
            1_700_000_000_000,
        )
        .unwrap();
        let mut cache = NonceCache::new();
        // Exactly 29_999ms in the past — within the ±30s window.
        let now = 1_700_000_000_000 + 29_999;
        let result = verify_with_clock(&envelope, &key, &mut cache, now);
        assert_eq!(result, Ok(VerifyOk::Signed));
    }

    // -----  Nonce replay  -----

    #[test]
    fn verify_rejects_duplicate_nonce() {
        let key = key_from("ABCD1234", "saltsalt");
        let envelope = sign_to_string_with_inputs(
            &json!({}),
            "ping",
            &key,
            "DUP_NONCE_AAAAAAAAAAAA",
            1_700_000_000_000,
        )
        .unwrap();
        let mut cache = NonceCache::new();
        let now = 1_700_000_000_500;
        assert_eq!(
            verify_with_clock(&envelope, &key, &mut cache, now),
            Ok(VerifyOk::Signed)
        );
        assert_eq!(
            verify_with_clock(&envelope, &key, &mut cache, now),
            Err(VerifyError::NonceReplay)
        );
    }

    #[test]
    fn cache_prune_evicts_old_entries() {
        let mut cache = NonceCache::new();
        cache.insert("old".into(), 1_000);
        cache.insert("recent".into(), 100_000);
        // now is well after old's TTL (60_000 + 1_000 = 61_000) but recent is
        // only 60_000 - (now - 100_000) ms old.
        cache.prune(120_000);
        assert!(!cache.contains("old"));
        assert!(cache.contains("recent"));
    }

    // -----  Malformed input  -----

    #[test]
    fn verify_rejects_non_object() {
        let key = key_from("ABCD1234", "saltsalt");
        let mut cache = NonceCache::new();
        assert_eq!(
            verify_with_clock("[]", &key, &mut cache, 1_700_000_000_000),
            Err(VerifyError::Malformed)
        );
        assert_eq!(
            verify_with_clock("null", &key, &mut cache, 1_700_000_000_000),
            Err(VerifyError::Malformed)
        );
        assert_eq!(
            verify_with_clock("not json", &key, &mut cache, 1_700_000_000_000),
            Err(VerifyError::Malformed)
        );
    }

    #[test]
    fn verify_rejects_envelope_missing_nonce() {
        let key = key_from("ABCD1234", "saltsalt");
        let mut cache = NonceCache::new();
        let raw = r#"{"hmac":"00","payload":{},"ts":1700000000000,"type":"ping"}"#;
        assert_eq!(
            verify_with_clock(raw, &key, &mut cache, 1_700_000_000_500),
            Err(VerifyError::Malformed)
        );
    }

    #[test]
    fn verify_rejects_invalid_hex_hmac() {
        let key = key_from("ABCD1234", "saltsalt");
        let mut cache = NonceCache::new();
        let raw = r#"{"hmac":"zz","nonce":"AAAA","payload":{},"ts":1700000000000,"type":"ping"}"#;
        let res = verify_with_clock(raw, &key, &mut cache, 1_700_000_000_500);
        assert!(matches!(res, Err(VerifyError::InvalidEncoding(_))));
    }

    // -----  Transitional mode  -----

    #[test]
    fn verify_accepts_unsigned_before_cutoff() {
        let key = key_from("ABCD1234", "saltsalt");
        let mut cache = NonceCache::new();
        let raw = r#"{"payload":{"x":1},"ts":1700000000000,"type":"ping"}"#;
        // 2026-05-06 < cutoff 2026-06-05.
        let now = 1_777_603_200_000;
        assert_eq!(
            verify_with_clock(raw, &key, &mut cache, now),
            Ok(VerifyOk::UnsignedTransitional)
        );
    }

    #[test]
    fn verify_rejects_unsigned_after_cutoff() {
        let key = key_from("ABCD1234", "saltsalt");
        let mut cache = NonceCache::new();
        let raw = r#"{"payload":{"x":1},"ts":1700000000000,"type":"ping"}"#;
        // 2026-06-06 > cutoff 2026-06-05.
        let now = DISPATCH_HMAC_REQUIRED_AFTER_MS + 86_400_000;
        assert_eq!(
            verify_with_clock(raw, &key, &mut cache, now),
            Err(VerifyError::UnsignedTransitional)
        );
    }

    // -----  Canonical signing input formatting  -----

    #[test]
    fn canonical_input_sorts_keys_alphabetically() {
        let payload = serde_json::value::RawValue::from_string("{}".into()).unwrap();
        let s = canonical_signing_input("nonce_val", &payload, 12345, "type_val");
        // nonce < payload < ts < type
        assert_eq!(
            s,
            "{\"nonce\":\"nonce_val\",\"payload\":{},\"ts\":12345,\"type\":\"type_val\"}"
        );
    }

    #[test]
    fn canonical_input_preserves_payload_byte_sequence() {
        // Mobile uses JSON.stringify which preserves insertion order for
        // payload objects. We hold payload as RawValue so re-canonicalization
        // is impossible — the bytes go through verbatim.
        let payload = serde_json::value::RawValue::from_string(
            "{\"z\":1,\"a\":2}".into(), // intentionally non-alphabetical
        )
        .unwrap();
        let s = canonical_signing_input("n", &payload, 1, "t");
        assert!(s.contains("\"payload\":{\"z\":1,\"a\":2}"));
    }
}
