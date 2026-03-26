use std::sync::RwLock;
use tauri::State;

use super::security::SecretManagerState;
use crate::sys::security::{verify_jwt_signature_with_secret, SecretManager};

/// Managed state for session tokens — avoids process-global statics.
/// Wrapped in an RwLock so multiple readers can coexist with exclusive writers.
pub struct SessionState(pub RwLock<Option<String>>);

impl SessionState {
    pub fn new() -> Self {
        Self(RwLock::new(None))
    }
}

impl Default for SessionState {
    fn default() -> Self {
        Self::new()
    }
}

/// Validate a JWT token: structural checks (three base64url segments, valid
/// payload with non-expired `exp` claim) **and** HMAC-SHA256 signature
/// verification against the secret stored in [`SecretManager`].
fn validate_jwt(token: &str, secret_manager: &SecretManager) -> Result<(), String> {
    let parts: Vec<&str> = token.split('.').collect();
    if parts.len() != 3 {
        return Err("Invalid JWT: expected 3 dot-separated parts".to_string());
    }

    // Each segment must be non-empty and contain only valid base64url characters
    for (i, part) in parts.iter().enumerate() {
        if part.is_empty() {
            return Err(format!("Invalid JWT: segment {} is empty", i));
        }
        if !part
            .chars()
            .all(|c| c.is_ascii_alphanumeric() || c == '-' || c == '_' || c == '=')
        {
            return Err(format!(
                "Invalid JWT: segment {} contains invalid base64url characters",
                i
            ));
        }
    }

    // ── Signature verification (HMAC-SHA256) ────────────────────────────
    let jwt_secret = secret_manager
        .get_or_create_jwt_secret()
        .map_err(|e| format!("Failed to retrieve JWT secret: {}", e))?;
    verify_jwt_signature_with_secret(token, &jwt_secret)?;

    // ── Payload structural checks ───────────────────────────────────────
    // Decode the payload (segment 1) and check for `exp`
    let payload_b64 = parts[1];

    // base64url -> standard base64
    let std_b64: String = payload_b64
        .chars()
        .map(|c| match c {
            '-' => '+',
            '_' => '/',
            other => other,
        })
        .collect();

    // Add padding if necessary
    let padded = match std_b64.len() % 4 {
        2 => format!("{}==", std_b64),
        3 => format!("{}=", std_b64),
        _ => std_b64,
    };

    // Decode using the data_encoding crate or manual approach
    // We'll use a simple approach that doesn't require new crates
    let decoded_bytes = base64_decode(&padded)
        .map_err(|e| format!("Invalid JWT: failed to decode payload: {}", e))?;

    let payload_str = String::from_utf8(decoded_bytes)
        .map_err(|_| "Invalid JWT: payload is not valid UTF-8".to_string())?;

    // Parse as JSON and check for exp
    let payload: serde_json::Value = serde_json::from_str(&payload_str)
        .map_err(|_| "Invalid JWT: payload is not valid JSON".to_string())?;

    let exp = payload
        .get("exp")
        .and_then(|v| v.as_u64())
        .ok_or_else(|| "Invalid JWT: missing or non-numeric 'exp' claim".to_string())?;

    let now = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map_err(|_| "System clock error".to_string())?
        .as_secs();

    if exp <= now {
        return Err("Session expired. Please log in again.".to_string());
    }

    Ok(())
}

/// Minimal base64 decoder (standard alphabet) that avoids adding a new crate.
/// Handles the base64 alphabet A-Z a-z 0-9 + / with = padding.
fn base64_decode(input: &str) -> Result<Vec<u8>, String> {
    fn char_to_val(c: u8) -> Result<u8, String> {
        match c {
            b'A'..=b'Z' => Ok(c - b'A'),
            b'a'..=b'z' => Ok(c - b'a' + 26),
            b'0'..=b'9' => Ok(c - b'0' + 52),
            b'+' => Ok(62),
            b'/' => Ok(63),
            b'=' => Ok(0), // padding
            _ => Err(format!("Invalid base64 character: {}", c as char)),
        }
    }

    let bytes = input.as_bytes();
    if !bytes.len().is_multiple_of(4) {
        return Err("Invalid base64: length is not a multiple of 4".to_string());
    }

    let mut output = Vec::with_capacity(bytes.len() * 3 / 4);

    for chunk in bytes.chunks(4) {
        let a = char_to_val(chunk[0])?;
        let b = char_to_val(chunk[1])?;
        let c_val = char_to_val(chunk[2])?;
        let d = char_to_val(chunk[3])?;

        output.push((a << 2) | (b >> 4));
        if chunk[2] != b'=' {
            output.push((b << 4) | (c_val >> 2));
        }
        if chunk[3] != b'=' {
            output.push((c_val << 6) | d);
        }
    }

    Ok(output)
}

/// Extract the user ID (`sub` claim) from the current session JWT.
/// Returns `"default"` if no session is stored (single-user desktop fallback).
///
/// # Security
///
/// SECURITY NOTE: This function extracts the `sub` claim WITHOUT verifying the JWT signature.
/// It MUST only be called after the session has been validated via `auth_store_session`.
/// The validated user ID should ideally be stored alongside the token to avoid re-parsing.
/// The `auth_store_session` command validates the JWT signature (HMAC-SHA256) before storing
/// the token in `SessionState`, so the token returned here has already been verified.
pub fn get_session_user_id(state: &SessionState) -> Result<String, String> {
    let store = state.0.read().map_err(|e| e.to_string())?;
    let token = match store.as_ref() {
        Some(t) => t.clone(),
        None => return Ok("default".to_string()),
    };

    let parts: Vec<&str> = token.split('.').collect();
    if parts.len() != 3 {
        return Ok("default".to_string());
    }

    // Decode the payload (segment 1) from base64url
    let std_b64: String = parts[1]
        .chars()
        .map(|c| match c {
            '-' => '+',
            '_' => '/',
            other => other,
        })
        .collect();

    let padded = match std_b64.len() % 4 {
        2 => format!("{}==", std_b64),
        3 => format!("{}=", std_b64),
        _ => std_b64,
    };

    let decoded_bytes = base64_decode(&padded).unwrap_or_default();
    let payload_str = String::from_utf8(decoded_bytes).unwrap_or_default();

    let payload: serde_json::Value =
        serde_json::from_str(&payload_str).unwrap_or(serde_json::Value::Null);

    match payload.get("sub").and_then(|v| v.as_str()) {
        Some(sub) if !sub.is_empty() => Ok(sub.to_string()),
        _ => Ok("default".to_string()),
    }
}

#[tauri::command]
pub async fn auth_store_session(
    session: String,
    state: State<'_, SessionState>,
    secret_state: State<'_, SecretManagerState>,
) -> Result<(), String> {
    validate_jwt(&session, secret_state.manager())?;
    let mut store = state.0.write().map_err(|e| e.to_string())?;
    *store = Some(session);
    Ok(())
}

#[tauri::command]
pub async fn auth_retrieve_session(state: State<'_, SessionState>) -> Result<String, String> {
    let store = state.0.read().map_err(|e| e.to_string())?;
    store.clone().ok_or_else(|| "No session stored".to_string())
}

#[tauri::command]
pub async fn auth_remove_session(state: State<'_, SessionState>) -> Result<(), String> {
    let mut store = state.0.write().map_err(|e| e.to_string())?;
    *store = None;
    Ok(())
}
