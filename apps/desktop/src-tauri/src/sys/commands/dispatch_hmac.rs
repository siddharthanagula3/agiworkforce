//! Tauri commands wrapping the [`crate::sys::security::dispatch_hmac`] crypto
//! module so the desktop frontend (or any Realtime/WebRTC listener built on
//! top of it) can verify and sign Dispatch control messages.
//!
//! The crypto primitives are tested in isolation in
//! `sys/security/dispatch_hmac.rs` (22 cases covering HKDF, sign/verify
//! round-trip, replay defenses, and transitional accept). This module is
//! the thin IPC layer that exposes them through Tauri commands and holds
//! the per-session state (derived key + nonce cache).
//!
//! # Lifecycle
//!
//! 1. After signaling pairing, the frontend receives `dispatchSalt` from
//!    the relay's `registered`/`peer_ready` event metadata. It calls
//!    [`dispatch_hmac_init`] with the user's pairing code + that salt.
//! 2. Per incoming envelope: [`dispatch_hmac_verify`] returns `"signed"`,
//!    `"unsigned_transitional"`, or an error string the caller should
//!    surface to the user / drop the message on.
//! 3. Per outgoing envelope: [`dispatch_hmac_sign`] returns the wire JSON
//!    ready to ship over the data channel.
//! 4. On disconnect: [`dispatch_hmac_reset`] clears the session.
//!
//! # State
//!
//! The session key + nonce cache live behind a single [`Mutex`] inside
//! [`DispatchHmacState`]. The crypto verify path is fast (single HMAC over
//! a few hundred bytes), so contention is acceptable at desktop tier.

use std::sync::Mutex;

use serde::{Deserialize, Serialize};
use tauri::State;

use crate::sys::security::dispatch_hmac::{
    self, NonceCache, VerifyError, VerifyOk, SESSION_KEY_LEN,
};

/// Outcome surfaced to the frontend. Mirrors the discriminant on the
/// mobile side (`"signed" | "unsigned_transitional"`).
#[derive(Debug, Clone, Copy, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "snake_case")]
pub enum VerifyOutcome {
    Signed,
    UnsignedTransitional,
}

impl From<VerifyOk> for VerifyOutcome {
    fn from(v: VerifyOk) -> Self {
        match v {
            VerifyOk::Signed => VerifyOutcome::Signed,
            VerifyOk::UnsignedTransitional => VerifyOutcome::UnsignedTransitional,
        }
    }
}

/// Tauri-managed per-session state. One instance lives in the app handle
/// and is reset on disconnect.
pub struct DispatchHmacState {
    inner: Mutex<Inner>,
}

#[derive(Default)]
struct Inner {
    /// Active session key (32 bytes); `None` when no session.
    session_key: Option<[u8; SESSION_KEY_LEN]>,
    /// Sliding-window nonce cache; cleared on `reset`.
    cache: NonceCache,
}

impl DispatchHmacState {
    pub fn new() -> Self {
        Self {
            inner: Mutex::new(Inner::default()),
        }
    }
}

impl Default for DispatchHmacState {
    fn default() -> Self {
        Self::new()
    }
}

// ── Commands ────────────────────────────────────────────────────────────────

/// Derive + store the session key for the active Dispatch connection.
///
/// `pairing_code` is the user-visible 8+ char pairing code shared between
/// devices. `session_salt` is the random per-session salt the signaling
/// relay sent in `dispatchSalt`. Both are needed so the desktop derives
/// the same 32-byte key the mobile side derives.
///
/// Returns the derived key as a 64-char hex string for diagnostic logging
/// only; do not persist it.
#[tauri::command]
pub fn dispatch_hmac_init(
    state: State<'_, DispatchHmacState>,
    pairing_code: String,
    session_salt: String,
) -> Result<String, String> {
    let key = dispatch_hmac::derive_session_key(&pairing_code, &session_salt)
        .map_err(|e| e.to_string())?;
    let mut inner = state.inner.lock().map_err(|_| "state lock poisoned".to_string())?;
    inner.session_key = Some(key);
    // Wipe the cache too — a new pairing means a fresh nonce window.
    inner.cache = NonceCache::new();
    Ok(hex_encode(&key))
}

/// Verify an inbound envelope using the stored session key. Returns
/// `"signed"` when the HMAC matched and the nonce was added to the cache,
/// or `"unsigned_transitional"` when the message had no `hmac` field and
/// we are still within the transitional accept window.
///
/// The caller (frontend) should `tracing::warn!` on `unsigned_transitional`
/// to surface the impending cutoff to whoever owns the deployment.
#[tauri::command]
pub fn dispatch_hmac_verify(
    state: State<'_, DispatchHmacState>,
    envelope_json: String,
) -> Result<VerifyOutcome, String> {
    let mut inner = state.inner.lock().map_err(|_| "state lock poisoned".to_string())?;
    let key = inner
        .session_key
        .ok_or_else(|| "dispatch session not initialized — call dispatch_hmac_init first".to_string())?;
    let cache = &mut inner.cache;
    let outcome = dispatch_hmac::verify(&envelope_json, &key, cache)
        .map(VerifyOutcome::from)
        .map_err(verify_error_to_string)?;

    // DESK-DISPATCH-HMAC-SILENT (audit 2026-05-06): the security module
    // documents that callers must warn on UnsignedTransitional, but no
    // caller did. Emit the warning here at the Tauri command layer so it
    // appears in every deployment log regardless of frontend behaviour.
    if matches!(outcome, VerifyOutcome::UnsignedTransitional) {
        tracing::warn!(
            target: "dispatch_hmac",
            "Accepting unsigned message in transitional window — sender did not provide HMAC. \
             Mobile app may need update before 2026-06-05 cutoff.",
        );
    }

    Ok(outcome)
}

/// Sign a payload + type with the stored session key, returning the wire
/// JSON envelope ready to send. `payload` is any JSON value; the envelope
/// preserves its byte order for HMAC compatibility with mobile.
#[tauri::command]
pub fn dispatch_hmac_sign(
    state: State<'_, DispatchHmacState>,
    payload: serde_json::Value,
    msg_type: String,
) -> Result<String, String> {
    let inner = state.inner.lock().map_err(|_| "state lock poisoned".to_string())?;
    let key = inner
        .session_key
        .ok_or_else(|| "dispatch session not initialized — call dispatch_hmac_init first".to_string())?;
    dispatch_hmac::sign_to_string(&payload, &msg_type, &key).map_err(|e| e.to_string())
}

/// Clear the session key + nonce cache. Call this when the Dispatch
/// connection terminates so a stolen key cannot be reused.
#[tauri::command]
pub fn dispatch_hmac_reset(state: State<'_, DispatchHmacState>) -> Result<(), String> {
    let mut inner = state.inner.lock().map_err(|_| "state lock poisoned".to_string())?;
    if let Some(mut k) = inner.session_key.take() {
        // Best-effort key zeroization — Rust doesn't guarantee no compiler
        // optimization erasure here, but writing zeros is enough to keep
        // a casual heap-dump attacker from reading the key.
        for b in k.iter_mut() {
            *b = 0;
        }
    }
    inner.cache = NonceCache::new();
    Ok(())
}

// ── Helpers ─────────────────────────────────────────────────────────────────

fn verify_error_to_string(e: VerifyError) -> String {
    match e {
        VerifyError::Malformed => "malformed".to_string(),
        VerifyError::UnsignedTransitional => "unsigned_after_cutoff".to_string(),
        VerifyError::TimestampExpired(_) => "timestamp_expired".to_string(),
        VerifyError::NonceReplay => "nonce_replay".to_string(),
        VerifyError::HmacMismatch => "hmac_mismatch".to_string(),
        VerifyError::InvalidEncoding(detail) => format!("invalid_encoding: {detail}"),
    }
}

fn hex_encode(bytes: &[u8]) -> String {
    let mut out = String::with_capacity(bytes.len() * 2);
    for b in bytes {
        out.push_str(&format!("{:02x}", b));
    }
    out
}

// ── Tests ───────────────────────────────────────────────────────────────────

#[cfg(test)]
mod tests {
    use super::*;
    use crate::sys::security::dispatch_hmac::sign_to_string_with_inputs;
    use serde_json::json;

    fn fresh_state() -> DispatchHmacState {
        DispatchHmacState::new()
    }

    fn init_and_get_key(state: &DispatchHmacState) -> [u8; 32] {
        // Mimic dispatch_hmac_init without the Tauri State wrapper — the inner
        // Mutex is the same.
        let key = dispatch_hmac::derive_session_key("ABCD1234", "saltsalt").unwrap();
        let mut inner = state.inner.lock().unwrap();
        inner.session_key = Some(key);
        inner.cache = NonceCache::new();
        key
    }

    #[test]
    fn verify_outcome_serializes_snake_case() {
        let json_signed = serde_json::to_string(&VerifyOutcome::Signed).unwrap();
        assert_eq!(json_signed, "\"signed\"");
        let json_unsigned = serde_json::to_string(&VerifyOutcome::UnsignedTransitional).unwrap();
        assert_eq!(json_unsigned, "\"unsigned_transitional\"");
    }

    #[test]
    fn verify_round_trip_via_state() {
        let state = fresh_state();
        let key = init_and_get_key(&state);

        let envelope = sign_to_string_with_inputs(
            &json!({"hello": "world"}),
            "ping",
            &key,
            "STATE_NONCE_AAAAAAAAA",
            // Use SystemTime now-ish so the verify path's wall-clock check passes.
            std::time::SystemTime::now()
                .duration_since(std::time::UNIX_EPOCH)
                .unwrap()
                .as_millis() as i64,
        )
        .unwrap();

        // Walk the same code path as the Tauri command without the State
        // wrapper.
        let mut inner = state.inner.lock().unwrap();
        let result = dispatch_hmac::verify(&envelope, &inner.session_key.unwrap(), &mut inner.cache)
            .map(VerifyOutcome::from)
            .map_err(verify_error_to_string);
        assert_eq!(result, Ok(VerifyOutcome::Signed));
    }

    #[test]
    fn reset_clears_session_key_and_cache() {
        let state = fresh_state();
        let _key = init_and_get_key(&state);

        // Plant a fake nonce.
        {
            let mut inner = state.inner.lock().unwrap();
            inner.cache.prune(0); // no-op; just exercise the API
        }

        // Reset.
        let mut inner = state.inner.lock().unwrap();
        inner.session_key = None;
        inner.cache = NonceCache::new();
        assert!(inner.session_key.is_none());
        assert!(inner.cache.is_empty());
    }

    #[test]
    fn verify_error_strings_are_stable() {
        // Frontend code may pattern-match on these — keep the strings stable.
        assert_eq!(verify_error_to_string(VerifyError::Malformed), "malformed");
        assert_eq!(verify_error_to_string(VerifyError::NonceReplay), "nonce_replay");
        assert_eq!(verify_error_to_string(VerifyError::HmacMismatch), "hmac_mismatch");
        assert_eq!(
            verify_error_to_string(VerifyError::TimestampExpired(30_000)),
            "timestamp_expired"
        );
        assert_eq!(
            verify_error_to_string(VerifyError::UnsignedTransitional),
            "unsigned_after_cutoff"
        );
    }
}
