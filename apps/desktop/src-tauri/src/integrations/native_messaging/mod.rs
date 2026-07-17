//! Chrome Native Messaging Host
//!
//! Implements the Chrome Native Messaging protocol to enable
//! bidirectional communication between the desktop app and browser extension.
//!
//! Protocol: https://developer.chrome.com/docs/extensions/develop/concepts/native-messaging

use anyhow::{anyhow, Result};
use hmac::{Hmac, Mac};
use serde::{Deserialize, Serialize};
use std::io::{Read, Write};
use std::sync::{Arc, Mutex};
use tokio::sync::RwLock;

pub mod host;
pub mod manifest;
pub mod messages;

/// Native messaging message types
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(tag = "type", rename_all = "snake_case")]
pub enum NativeMessage {
    // Connection management
    Connect {
        extension_id: String,
    },
    Disconnect {
        reason: Option<String>,
    },
    Ping,
    Pong,

    // Browser automation commands
    Click {
        selector: String,
        tab_id: Option<i32>,
    },
    Type {
        selector: String,
        text: String,
        tab_id: Option<i32>,
    },
    Navigate {
        url: String,
        tab_id: Option<i32>,
    },
    Screenshot {
        tab_id: Option<i32>,
        format: Option<String>,
    },
    Hover {
        selector: String,
        tab_id: Option<i32>,
    },
    WaitForSelector {
        selector: String,
        timeout_ms: Option<u64>,
        tab_id: Option<i32>,
    },
    SelectOption {
        selector: String,
        value: String,
        tab_id: Option<i32>,
    },
    SetChecked {
        selector: String,
        checked: bool,
        tab_id: Option<i32>,
    },
    Focus {
        selector: String,
        tab_id: Option<i32>,
    },
    ScrollIntoView {
        selector: String,
        tab_id: Option<i32>,
    },

    // DOM operations
    GetElement {
        selector: String,
        tab_id: Option<i32>,
    },
    GetElements {
        selector: String,
        tab_id: Option<i32>,
    },
    GetText {
        selector: String,
        tab_id: Option<i32>,
    },
    GetAttribute {
        selector: String,
        attribute: String,
        tab_id: Option<i32>,
    },
    SetAttribute {
        selector: String,
        attribute: String,
        value: String,
        tab_id: Option<i32>,
    },

    // Accessibility tree
    GetAccessibilityTree {
        tab_id: Option<i32>,
    },
    GetFocusableElements {
        tab_id: Option<i32>,
    },

    // Tab management
    GetTabs,
    GetActiveTab,
    CreateTab {
        url: String,
    },
    CloseTab {
        tab_id: i32,
    },
    SwitchTab {
        tab_id: i32,
    },

    // Cookies and storage
    GetCookies {
        url: Option<String>,
    },
    SetCookie {
        cookie: CookieData,
    },
    GetLocalStorage {
        key: Option<String>,
        tab_id: Option<i32>,
    },
    SetLocalStorage {
        key: String,
        value: String,
        tab_id: Option<i32>,
    },

    // Page info
    GetPageInfo {
        tab_id: Option<i32>,
    },
    GetPageContent {
        tab_id: Option<i32>,
    },
    PageContext {
        url: String,
        title: String,
        html: String,
        selected_text: Option<String>,
        tab_id: i32,
        timestamp: u64,
    },
    TaskResult {
        task_id: String,
        success: bool,
        screenshot: Option<String>,
        result: Option<serde_json::Value>,
        error: Option<String>,
        actions_performed: u32,
        duration: u64,
    },

    /// Explicitly approved selected-context handoff from the Chrome side panel.
    SelectedTextQuery(SelectedTextQueryPayload),

    // Script execution (controlled)
    ExecuteScript {
        script: String,
        tab_id: Option<i32>,
    },

    // Response messages
    Response {
        id: String,
        success: bool,
        data: Option<serde_json::Value>,
        error: Option<String>,
    },
}

/// Exact payload emitted by `apps/extension` after its redacted preview is approved.
/// Unknown fields are rejected so a caller cannot smuggle a different destination or
/// an unreviewed context field across the native boundary.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct SelectedTextQueryPayload {
    #[serde(rename = "tabId")]
    pub tab_id: i32,
    #[serde(rename = "url")]
    pub context_url: String,
    #[serde(rename = "selectedText")]
    pub selected_text: String,
    pub timestamp: u64,
}

pub const SELECTED_CONTEXT_HANDOFF_MAX_AGE_MS: u64 = 5 * 60 * 1_000;
const SELECTED_CONTEXT_HANDOFF_MAX_FUTURE_SKEW_MS: u64 = 5_000;
const SELECTED_CONTEXT_HANDOFF_MAX_TEXT_CHARS: usize = 2_000;

/// Context received from Chrome but not attached to any Desktop conversation.
/// The frontend event is the only current consumer; insertion remains a user action.
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
pub struct PendingSelectedContextHandoff {
    pub selected_text: String,
    pub context_url: String,
    pub tab_id: u32,
    pub selected_at: u64,
    pub received_at: u64,
}

/// Exact frontend-visible identity used to acknowledge one reviewed handoff.
/// This deliberately excludes `received_at`, which never leaves the native boundary.
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(deny_unknown_fields)]
pub struct SelectedContextHandoffIdentity {
    pub text: String,
    pub context_url: String,
    pub tab_id: u32,
    pub selected_at: u64,
}

pub static PENDING_SELECTED_CONTEXT_HANDOFF: Mutex<Option<PendingSelectedContextHandoff>> =
    Mutex::new(None);

/// Clear the native stage only when the frontend acknowledges the exact payload it reviewed.
/// A non-match means that payload has already been replaced/cleared; it must never clear a
/// newer selection that arrived while the review UI was open.
pub fn clear_pending_selected_context_handoff(
    identity: &SelectedContextHandoffIdentity,
) -> Result<bool> {
    let mut guard = PENDING_SELECTED_CONTEXT_HANDOFF
        .lock()
        .map_err(|_| anyhow!("Selected context staging lock is unavailable"))?;
    let matches = guard.as_ref().is_some_and(|pending| {
        pending.selected_text == identity.text
            && pending.context_url == identity.context_url
            && pending.tab_id == identity.tab_id
            && pending.selected_at == identity.selected_at
    });
    if matches {
        *guard = None;
    }
    Ok(matches)
}

/// Return the current native stage for a frontend that mounted after the event was emitted.
/// Expired context is erased at this boundary and is never re-surfaced to React.
pub fn get_pending_selected_context_handoff(
    now_ms: u64,
) -> Result<Option<SelectedContextHandoffIdentity>> {
    let mut guard = PENDING_SELECTED_CONTEXT_HANDOFF
        .lock()
        .map_err(|_| anyhow!("Selected context staging lock is unavailable"))?;
    let Some(pending) = guard.as_ref() else {
        return Ok(None);
    };
    if now_ms.saturating_sub(pending.selected_at) > SELECTED_CONTEXT_HANDOFF_MAX_AGE_MS {
        *guard = None;
        return Ok(None);
    }
    Ok(Some(SelectedContextHandoffIdentity {
        text: pending.selected_text.clone(),
        context_url: pending.context_url.clone(),
        tab_id: pending.tab_id,
        selected_at: pending.selected_at,
    }))
}

pub fn stage_selected_context_handoff(
    payload: SelectedTextQueryPayload,
    now_ms: u64,
) -> Result<PendingSelectedContextHandoff> {
    let selected_text = payload.selected_text.trim().to_string();
    if selected_text.is_empty()
        || selected_text.chars().count() > SELECTED_CONTEXT_HANDOFF_MAX_TEXT_CHARS
    {
        return Err(anyhow!(
            "Selected context text is empty or exceeds the 2000 character limit"
        ));
    }
    if selected_text.chars().any(|character| {
        matches!(
            character,
            '\u{200B}'..='\u{200D}'
                | '\u{FEFF}'
                | '\u{202A}'..='\u{202E}'
                | '\u{2066}'..='\u{2069}'
                | '\u{FE00}'..='\u{FE0F}'
                | '\u{E0000}'..='\u{E007F}'
        )
    }) {
        return Err(anyhow!(
            "Selected context contains hidden Unicode control characters"
        ));
    }
    if payload.tab_id <= 0 {
        return Err(anyhow!("Selected context is missing a valid Chrome tab"));
    }
    if now_ms.saturating_sub(payload.timestamp) > SELECTED_CONTEXT_HANDOFF_MAX_AGE_MS {
        return Err(anyhow!(
            "Selected context handoff expired before Desktop received it"
        ));
    }
    if payload.timestamp > now_ms.saturating_add(SELECTED_CONTEXT_HANDOFF_MAX_FUTURE_SKEW_MS) {
        return Err(anyhow!(
            "Selected context timestamp is too far in the future"
        ));
    }

    let parsed_url = url::Url::parse(&payload.context_url)
        .map_err(|error| anyhow!("Invalid selected context URL: {error}"))?;
    if !matches!(parsed_url.scheme(), "http" | "https")
        || !parsed_url.username().is_empty()
        || parsed_url.password().is_some()
        || parsed_url.query().is_some()
        || parsed_url.fragment().is_some()
    {
        return Err(anyhow!(
            "Selected context URL must be an HTTP(S) source without credentials, query, or fragment"
        ));
    }

    let staged = PendingSelectedContextHandoff {
        selected_text,
        context_url: payload.context_url,
        tab_id: u32::try_from(payload.tab_id)
            .map_err(|_| anyhow!("Selected context has an invalid Chrome tab"))?,
        selected_at: payload.timestamp,
        received_at: now_ms,
    };
    let mut guard = PENDING_SELECTED_CONTEXT_HANDOFF
        .lock()
        .map_err(|_| anyhow!("Selected context staging lock is unavailable"))?;
    *guard = Some(staged.clone());
    Ok(staged)
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CookieData {
    pub name: String,
    pub value: String,
    pub domain: Option<String>,
    pub path: Option<String>,
    pub secure: Option<bool>,
    pub http_only: Option<bool>,
    pub expires: Option<i64>,
}

/// Native messaging request wrapper
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct NativeRequest {
    pub id: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub timestamp: Option<u64>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub mac: Option<String>,
    pub message: NativeMessage,
    /// Exact JSON object sent by the extension. Request HMAC verification must
    /// use the original property order produced by `JSON.stringify`.
    #[serde(skip)]
    pub wire_message_json: String,
}

/// Native messaging response wrapper
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct NativeResponse {
    pub id: String,
    pub success: bool,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub data: Option<serde_json::Value>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub error: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub session_secret: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub timestamp: Option<u64>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub mac: Option<String>,
}

impl NativeResponse {
    pub fn success(id: String, data: impl Serialize) -> Self {
        Self {
            id,
            success: true,
            data: serde_json::to_value(data).ok(),
            error: None,
            session_secret: None,
            timestamp: None,
            mac: None,
        }
    }

    pub fn error(id: String, error: impl ToString) -> Self {
        Self {
            id,
            success: false,
            data: None,
            error: Some(error.to_string()),
            session_secret: None,
            timestamp: None,
            mac: None,
        }
    }

    pub fn with_session_secret(mut self, session_secret: impl Into<String>) -> Self {
        self.session_secret = Some(session_secret.into());
        self
    }

    pub fn sign_with_secret(&mut self, secret: &[u8], timestamp: u64) -> Result<()> {
        type HmacSha256 = Hmac<sha2::Sha256>;

        let body = self.mac_body_json()?;
        let payload = format!("{}|{}|{}", self.id, timestamp, body);
        let mut mac =
            HmacSha256::new_from_slice(secret).map_err(|e| anyhow!("HMAC init failed: {e}"))?;
        mac.update(payload.as_bytes());

        self.timestamp = Some(timestamp);
        self.mac = Some(hex::encode(mac.finalize().into_bytes()));
        Ok(())
    }

    fn mac_body_json(&self) -> Result<String> {
        let mut body = format!("{{\"success\":{}", self.success);
        if let Some(data) = &self.data {
            body.push_str(",\"data\":");
            body.push_str(&serde_json::to_string(data)?);
        }
        if let Some(error) = &self.error {
            body.push_str(",\"error\":");
            body.push_str(&serde_json::to_string(error)?);
        }
        body.push('}');
        Ok(body)
    }
}

/// Connection state for native messaging
#[derive(Debug, Clone, PartialEq, Eq)]
pub enum ConnectionState {
    Disconnected,
    Connecting,
    Connected,
    Error(String),
}

/// Native messaging service state
pub struct NativeMessagingState {
    pub connection_state: ConnectionState,
    pub extension_id: Option<String>,
    pub pending_requests:
        std::collections::HashMap<String, tokio::sync::oneshot::Sender<NativeResponse>>,
}

impl NativeMessagingState {
    pub fn new() -> Self {
        Self {
            connection_state: ConnectionState::Disconnected,
            extension_id: None,
            pending_requests: std::collections::HashMap::new(),
        }
    }
}

impl Default for NativeMessagingState {
    fn default() -> Self {
        Self::new()
    }
}

/// Read a native messaging message from stdin
/// Format: 4-byte little-endian length prefix + JSON message
pub fn read_message<R: Read>(reader: &mut R) -> Result<NativeRequest> {
    // Read 4-byte length prefix (little-endian)
    let mut len_bytes = [0u8; 4];
    reader
        .read_exact(&mut len_bytes)
        .map_err(|e| anyhow!("Failed to read message length: {}", e))?;

    let length = u32::from_le_bytes(len_bytes) as usize;

    if length > 1024 * 1024 {
        return Err(anyhow!("Message too large: {} bytes", length));
    }

    // Read the JSON message
    let mut buffer = vec![0u8; length];
    reader
        .read_exact(&mut buffer)
        .map_err(|e| anyhow!("Failed to read message body: {}", e))?;

    #[derive(Deserialize)]
    struct WireNativeRequest<'a> {
        id: String,
        timestamp: Option<u64>,
        mac: Option<String>,
        #[serde(borrow)]
        message: &'a serde_json::value::RawValue,
    }

    let wire: WireNativeRequest<'_> =
        serde_json::from_slice(&buffer).map_err(|e| anyhow!("Failed to parse message: {}", e))?;
    let message = serde_json::from_str(wire.message.get())
        .map_err(|e| anyhow!("Failed to parse native message payload: {}", e))?;

    Ok(NativeRequest {
        id: wire.id,
        timestamp: wire.timestamp,
        mac: wire.mac,
        message,
        wire_message_json: wire.message.get().to_string(),
    })
}

/// Write a native messaging message to stdout
/// Format: 4-byte little-endian length prefix + JSON message
pub fn write_message<W: Write>(writer: &mut W, response: &NativeResponse) -> Result<()> {
    let json =
        serde_json::to_vec(response).map_err(|e| anyhow!("Failed to serialize response: {}", e))?;

    let length = json.len() as u32;
    let len_bytes = length.to_le_bytes();

    writer
        .write_all(&len_bytes)
        .map_err(|e| anyhow!("Failed to write message length: {}", e))?;
    writer
        .write_all(&json)
        .map_err(|e| anyhow!("Failed to write message body: {}", e))?;
    writer
        .flush()
        .map_err(|e| anyhow!("Failed to flush: {}", e))?;

    Ok(())
}

/// Generate the native messaging host manifest for Chrome
pub fn generate_host_manifest(
    host_name: &str,
    description: &str,
    executable_path: &str,
    extension_ids: &[&str],
) -> serde_json::Value {
    serde_json::json!({
        "name": host_name,
        "description": description,
        "path": executable_path,
        "type": "stdio",
        "allowed_origins": extension_ids.iter()
            .map(|id| format!("chrome-extension://{}/", id))
            .collect::<Vec<_>>()
    })
}

/// Get the path where the native messaging host manifest should be installed
pub fn get_manifest_path(host_name: &str) -> Result<std::path::PathBuf> {
    #[cfg(target_os = "macos")]
    {
        let home =
            std::env::var("HOME").map_err(|_| anyhow!("HOME environment variable not set"))?;
        Ok(std::path::PathBuf::from(format!(
            "{}/Library/Application Support/Google/Chrome/NativeMessagingHosts/{}.json",
            home, host_name
        )))
    }

    #[cfg(target_os = "windows")]
    {
        Ok(std::path::PathBuf::from(format!(
            "HKEY_CURRENT_USER\\Software\\Google\\Chrome\\NativeMessagingHosts\\{}",
            host_name
        )))
    }

    #[cfg(target_os = "linux")]
    {
        let home =
            std::env::var("HOME").map_err(|_| anyhow!("HOME environment variable not set"))?;
        Ok(std::path::PathBuf::from(format!(
            "{}/.config/google-chrome/NativeMessagingHosts/{}.json",
            home, host_name
        )))
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn read_wire_json(json: &str) -> Result<NativeRequest> {
        let mut framed = Vec::new();
        framed.extend_from_slice(&(json.len() as u32).to_le_bytes());
        framed.extend_from_slice(json.as_bytes());
        read_message(&mut framed.as_slice())
    }

    #[test]
    fn test_read_write_message() {
        let response =
            NativeResponse::success("test-123".to_string(), serde_json::json!({"result": "ok"}));

        let mut buffer = Vec::new();
        write_message(&mut buffer, &response).unwrap();

        // Verify we can read it back
        let json = serde_json::to_vec(&response).unwrap();
        let expected_len = json.len() as u32;
        let actual_len = u32::from_le_bytes([buffer[0], buffer[1], buffer[2], buffer[3]]);
        assert_eq!(expected_len, actual_len);
    }

    #[test]
    fn test_generate_manifest() {
        let manifest = generate_host_manifest(
            "com.agiworkforce.native",
            "AGI Workforce Native Host",
            "/usr/local/bin/agiworkforce-native",
            &["abcdefghijklmnopqrstuvwxyz123456"],
        );

        assert_eq!(manifest["name"], "com.agiworkforce.native");
        assert_eq!(manifest["type"], "stdio");
    }

    #[test]
    fn test_native_response_signing_adds_strict_envelope() {
        let mut response =
            NativeResponse::success("req-1".to_string(), serde_json::json!({"connected": true}))
                .with_session_secret("00".repeat(32));

        response.sign_with_secret(&[7_u8; 32], 1234).unwrap();
        let json = serde_json::to_value(&response).unwrap();

        assert_eq!(json["id"], "req-1");
        assert_eq!(json["timestamp"], 1234);
        assert_eq!(json["session_secret"], "00".repeat(32));
        assert_eq!(json["mac"].as_str().unwrap().len(), 64);
    }

    #[test]
    fn chrome_selected_context_fixture_matches_the_exact_native_schema() {
        let fixture =
            include_str!("../../../tests/fixtures/chrome_selected_context_handoff.json").trim();
        let request = read_wire_json(fixture).expect("extension fixture must deserialize");
        let expected_message = serde_json::json!({
            "type": "selected_text_query",
            "tabId": 17,
            "url": "https://example.com/private",
            "selectedText": "Use [REDACTED_ANTHROPIC_KEY] for the demo",
            "timestamp": 1_750_000_000_000_u64,
        });

        assert_eq!(
            serde_json::to_value(request.message).unwrap(),
            expected_message
        );
    }

    #[test]
    fn selected_context_rejects_a_non_desktop_destination_field() {
        let invalid = r#"{"id":"1750000000100_0123456789abcdef","timestamp":1750000000100,"mac":"46234cd3d8354a57d53b85d6402bd849b2d24c6cf360062303b45dc4c39a687c","message":{"type":"selected_text_query","tabId":17,"url":"https://example.com/private","selectedText":"approved text","timestamp":1750000000000,"destination":"managed-cloud"}}"#;

        assert!(read_wire_json(invalid).is_err());
    }

    #[test]
    #[serial_test::serial]
    fn selected_context_is_staged_without_arming_automatic_chat_injection() {
        *crate::sys::commands::extension::LATEST_PAGE_CONTEXT
            .lock()
            .unwrap() = None;
        *PENDING_SELECTED_CONTEXT_HANDOFF.lock().unwrap() = None;
        let payload = SelectedTextQueryPayload {
            tab_id: 17,
            context_url: "https://example.com/private".to_string(),
            selected_text: "approved context".to_string(),
            timestamp: 1_750_000_000_000,
        };

        let staged = stage_selected_context_handoff(payload, 1_750_000_000_100).unwrap();

        assert_eq!(staged.selected_text, "approved context");
        assert!(crate::sys::commands::extension::LATEST_PAGE_CONTEXT
            .lock()
            .unwrap()
            .is_none());
        assert_eq!(
            PENDING_SELECTED_CONTEXT_HANDOFF.lock().unwrap().as_ref(),
            Some(&staged)
        );
        *PENDING_SELECTED_CONTEXT_HANDOFF.lock().unwrap() = None;
    }

    #[test]
    #[serial_test::serial]
    fn expired_selected_context_is_rejected_without_being_staged() {
        *PENDING_SELECTED_CONTEXT_HANDOFF.lock().unwrap() = None;
        let payload = SelectedTextQueryPayload {
            tab_id: 17,
            context_url: "https://example.com/private".to_string(),
            selected_text: "approved context".to_string(),
            timestamp: 1_750_000_000_000,
        };

        assert!(stage_selected_context_handoff(
            payload,
            1_750_000_000_000 + SELECTED_CONTEXT_HANDOFF_MAX_AGE_MS + 1
        )
        .is_err());
        assert!(PENDING_SELECTED_CONTEXT_HANDOFF.lock().unwrap().is_none());
    }

    #[test]
    #[serial_test::serial]
    fn pending_selected_context_getter_erases_an_expired_stage() {
        *PENDING_SELECTED_CONTEXT_HANDOFF.lock().unwrap() = None;
        let payload = SelectedTextQueryPayload {
            tab_id: 17,
            context_url: "https://example.com/private".to_string(),
            selected_text: "approved context".to_string(),
            timestamp: 1_750_000_000_000,
        };
        stage_selected_context_handoff(payload, 1_750_000_000_100).unwrap();

        let recovered = get_pending_selected_context_handoff(
            1_750_000_000_000 + SELECTED_CONTEXT_HANDOFF_MAX_AGE_MS + 1,
        )
        .unwrap();

        assert!(recovered.is_none());
        assert!(PENDING_SELECTED_CONTEXT_HANDOFF.lock().unwrap().is_none());
    }

    #[test]
    #[serial_test::serial]
    fn selected_context_acknowledgement_clears_only_the_exact_staged_payload() {
        *PENDING_SELECTED_CONTEXT_HANDOFF.lock().unwrap() = None;
        let payload = SelectedTextQueryPayload {
            tab_id: 17,
            context_url: "https://example.com/private".to_string(),
            selected_text: "approved context".to_string(),
            timestamp: 1_750_000_000_000,
        };
        stage_selected_context_handoff(payload, 1_750_000_000_100).unwrap();

        let pending = get_pending_selected_context_handoff(1_750_000_000_100)
            .unwrap()
            .expect("fresh staged context must be visible to a late frontend mount");
        assert_eq!(pending.text, "approved context");
        assert_eq!(pending.context_url, "https://example.com/private");
        assert_eq!(pending.tab_id, 17);
        assert_eq!(pending.selected_at, 1_750_000_000_000);

        let wrong = SelectedContextHandoffIdentity {
            text: "different context".to_string(),
            context_url: "https://example.com/private".to_string(),
            tab_id: 17,
            selected_at: 1_750_000_000_000,
        };
        assert!(!clear_pending_selected_context_handoff(&wrong).unwrap());
        assert!(PENDING_SELECTED_CONTEXT_HANDOFF.lock().unwrap().is_some());

        let exact = SelectedContextHandoffIdentity {
            text: "approved context".to_string(),
            context_url: "https://example.com/private".to_string(),
            tab_id: 17,
            selected_at: 1_750_000_000_000,
        };
        assert!(clear_pending_selected_context_handoff(&exact).unwrap());
        assert!(PENDING_SELECTED_CONTEXT_HANDOFF.lock().unwrap().is_none());
    }
}
