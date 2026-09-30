use std::collections::HashMap;

use base64::Engine as _;
use serde_json::{json, Value};

use crate::daemon::hmac_sha256;
use crate::features::a2a::security::constant_time_eq;

pub const ENVELOPE_VERSION: u64 = 3;
const MAX_MESSAGE_AGE_MS: i64 = 30_000;
const NONCE_TTL_MS: i64 = 60_000;
const HKDF_INFO: &[u8] = b"dispatch-hmac-v3";

#[derive(Debug, PartialEq, Eq)]
pub enum VerifyError {
    Malformed,
    Unsigned,
    UpdateRequired,
    TimestampExpired,
    NonceReplay,
    HmacMismatch,
}

pub struct DispatchSession {
    key: [u8; 32],
    nonces: HashMap<String, i64>,
}

fn decode_hex(value: &str) -> Option<Vec<u8>> {
    if !value.len().is_multiple_of(2) {
        return None;
    }
    (0..value.len())
        .step_by(2)
        .map(|index| u8::from_str_radix(value.get(index..index + 2)?, 16).ok())
        .collect()
}

pub fn derive_key(
    pairing_code: &str,
    session_salt: &str,
    pairing_secret: &str,
) -> Option<[u8; 32]> {
    let secret = pairing_secret.to_ascii_lowercase();
    if secret.len() != 64 || session_salt.is_empty() {
        return None;
    }
    let secret = decode_hex(&secret)?;
    let prk = hmac_sha256(format!("{pairing_code}:{session_salt}").as_bytes(), &secret);
    let mut info = HKDF_INFO.to_vec();
    info.push(0x01);
    Some(hmac_sha256(&prk, &info))
}

fn write_canonical(value: &Value, out: &mut String) {
    match value {
        Value::Object(map) => {
            let mut keys: Vec<&String> = map.keys().collect();
            keys.sort_by(|left, right| left.encode_utf16().cmp(right.encode_utf16()));
            out.push('{');
            for (position, key) in keys.iter().enumerate() {
                if position > 0 {
                    out.push(',');
                }
                out.push_str(&Value::String((*key).clone()).to_string());
                out.push(':');
                write_canonical(&map[key.as_str()], out);
            }
            out.push('}');
        }
        Value::Array(items) => {
            out.push('[');
            for (position, item) in items.iter().enumerate() {
                if position > 0 {
                    out.push(',');
                }
                write_canonical(item, out);
            }
            out.push(']');
        }
        other => out.push_str(&other.to_string()),
    }
}

pub fn canonical_json(value: &Value) -> String {
    let mut out = String::new();
    write_canonical(value, &mut out);
    out
}

impl DispatchSession {
    pub fn new(key: [u8; 32]) -> Self {
        Self {
            key,
            nonces: HashMap::new(),
        }
    }

    fn mac(&self, kind: &str, payload: &Value, ts: i64, nonce: &str) -> String {
        let input = canonical_json(&json!({
            "nonce": nonce,
            "payload": payload,
            "ts": ts,
            "type": kind,
            "v": ENVELOPE_VERSION,
        }));
        crate::hex::encode(&hmac_sha256(&self.key, input.as_bytes()))
    }

    pub fn sign(&self, kind: &str, payload: Value, now: i64) -> Value {
        use rand::Rng;
        let mut nonce = [0u8; 16];
        rand::rng().fill_bytes(&mut nonce);
        let nonce = base64::engine::general_purpose::STANDARD.encode(nonce);
        json!({
            "hmac": self.mac(kind, &payload, now, &nonce),
            "nonce": nonce,
            "payload": payload,
            "ts": now,
            "type": kind,
            "v": ENVELOPE_VERSION,
        })
    }

    pub fn verify(&mut self, message: &Value, now: i64) -> Result<(String, Value), VerifyError> {
        let envelope = message.as_object().ok_or(VerifyError::Malformed)?;
        let hmac = envelope
            .get("hmac")
            .and_then(Value::as_str)
            .ok_or(VerifyError::Unsigned)?;
        if envelope.get("v").and_then(Value::as_u64) != Some(ENVELOPE_VERSION) {
            return Err(VerifyError::UpdateRequired);
        }
        let (Some(nonce), Some(ts), Some(kind)) = (
            envelope.get("nonce").and_then(Value::as_str),
            envelope.get("ts").and_then(Value::as_i64),
            envelope.get("type").and_then(Value::as_str),
        ) else {
            return Err(VerifyError::Malformed);
        };
        if (now - ts).abs() > MAX_MESSAGE_AGE_MS {
            return Err(VerifyError::TimestampExpired);
        }
        self.nonces
            .retain(|_, seen_at| *seen_at >= now - NONCE_TTL_MS);
        if self.nonces.contains_key(nonce) {
            return Err(VerifyError::NonceReplay);
        }
        let payload = envelope.get("payload").cloned().unwrap_or(Value::Null);
        let expected = self.mac(kind, &payload, ts, nonce);
        if !constant_time_eq(expected.as_bytes(), hmac.as_bytes()) {
            return Err(VerifyError::HmacMismatch);
        }
        self.nonces.insert(nonce.to_string(), now);
        Ok((kind.to_string(), payload))
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    const VECTORS: &str = include_str!(
        "../../../../packages/platform/utils/src/__tests__/fixtures/dispatch-envelope-vectors.json"
    );

    fn vectors() -> Value {
        serde_json::from_str(VECTORS).expect("vector fixture parses")
    }

    fn session(vectors: &Value) -> DispatchSession {
        let key = derive_key(
            vectors["pairingCode"].as_str().expect("code"),
            vectors["sessionSalt"].as_str().expect("salt"),
            vectors["pairingSecret"].as_str().expect("secret"),
        )
        .expect("key derives");
        DispatchSession::new(key)
    }

    fn envelope(entry: &Value) -> Value {
        json!({
            "hmac": entry["hmac"],
            "nonce": entry["nonce"],
            "payload": entry["payload"],
            "ts": entry["ts"],
            "type": entry["type"],
            "v": ENVELOPE_VERSION,
        })
    }

    #[test]
    fn derives_the_key_the_typescript_host_derives() {
        let vectors = vectors();
        assert_eq!(
            crate::hex::encode(&session(&vectors).key),
            vectors["key"].as_str().expect("key")
        );
    }

    #[test]
    fn signs_every_vector_byte_for_byte() {
        let vectors = vectors();
        let session = session(&vectors);
        for entry in vectors["cases"].as_array().expect("cases") {
            let input = canonical_json(&json!({
                "nonce": entry["nonce"],
                "payload": entry["payload"],
                "ts": entry["ts"],
                "type": entry["type"],
                "v": ENVELOPE_VERSION,
            }));
            assert_eq!(input, entry["signingInput"].as_str().expect("input"));
            let mac = session.mac(
                entry["type"].as_str().expect("type"),
                &entry["payload"],
                entry["ts"].as_i64().expect("ts"),
                entry["nonce"].as_str().expect("nonce"),
            );
            assert_eq!(mac, entry["hmac"].as_str().expect("hmac"));
        }
    }

    #[test]
    fn verifies_each_vector_and_refuses_it_once_tampered() {
        let vectors = vectors();
        for entry in vectors["cases"].as_array().expect("cases") {
            let now = entry["ts"].as_i64().expect("ts");
            assert!(session(&vectors).verify(&envelope(entry), now).is_ok());
            let mut tampered = envelope(entry);
            tampered["payload"]["injected"] = json!(true);
            assert_eq!(
                session(&vectors).verify(&tampered, now),
                Err(VerifyError::HmacMismatch)
            );
        }
    }
}
