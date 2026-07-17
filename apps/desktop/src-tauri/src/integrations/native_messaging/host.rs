// SAFETY: Native messaging on Windows requires unsafe Win32 registry API calls.
#![allow(unsafe_code)]

//! Native Messaging Host Implementation
//!
//! Handles the native messaging host process that communicates with Chrome extension

use super::*;
use rand::RngCore;
use std::collections::HashMap;
use std::io::{stdin, stdout, BufReader, BufWriter};
use std::time::{Duration, Instant, SystemTime, UNIX_EPOCH};
use tokio::sync::{mpsc, Mutex};

const NATIVE_RESPONSE_TIMEOUT_MS: u64 = 15_000;
const NATIVE_REQUEST_MAX_AGE_MS: u64 = 30_000;
const NATIVE_REQUEST_MAX_FUTURE_SKEW_MS: u64 = 5_000;
const NATIVE_REQUEST_REPLAY_CACHE_LIMIT: usize = 4_096;

struct NativeRequestAuthenticator {
    session_secret: [u8; 32],
    expected_extension_id: Option<String>,
    session_established: bool,
    seen_request_ids: HashMap<String, u64>,
}

impl NativeRequestAuthenticator {
    fn new(session_secret: [u8; 32], expected_extension_id: Option<String>) -> Self {
        Self {
            session_secret,
            expected_extension_id,
            session_established: false,
            seen_request_ids: HashMap::new(),
        }
    }

    fn authenticate(&mut self, request: &NativeRequest, now_ms: u64) -> Result<()> {
        if request.id.is_empty()
            || request.id.len() > 128
            || !request
                .id
                .bytes()
                .all(|byte| byte.is_ascii_alphanumeric() || matches!(byte, b'_' | b'-'))
        {
            return Err(anyhow!("Invalid native request ID"));
        }

        let timestamp = request
            .timestamp
            .ok_or_else(|| anyhow!("Native request is missing its timestamp"))?;
        if now_ms.saturating_sub(timestamp) > NATIVE_REQUEST_MAX_AGE_MS {
            return Err(anyhow!("Native request envelope expired"));
        }
        if timestamp > now_ms.saturating_add(NATIVE_REQUEST_MAX_FUTURE_SKEW_MS) {
            return Err(anyhow!("Native request timestamp is too far in the future"));
        }

        if let NativeMessage::Connect { extension_id } = &request.message {
            if self.session_established {
                return Err(anyhow!(
                    "Native request replay: session is already established"
                ));
            }
            if !super::manifest::is_valid_chrome_extension_id(extension_id) {
                return Err(anyhow!("Invalid Chrome extension destination"));
            }
            if let Some(expected) = &self.expected_extension_id {
                if extension_id != expected {
                    return Err(anyhow!(
                        "Chrome extension destination does not match the native host launch origin"
                    ));
                }
            }
            if request.mac.is_some() {
                return Err(anyhow!("Initial native connect request must be unsigned"));
            }
            self.session_established = true;
            self.seen_request_ids.insert(request.id.clone(), timestamp);
            return Ok(());
        }

        if !self.session_established {
            return Err(anyhow!(
                "Native request rejected before the authenticated connect handshake"
            ));
        }

        let provided_mac = request
            .mac
            .as_deref()
            .ok_or_else(|| anyhow!("Native request is missing its negotiated MAC"))?;
        let provided_mac = hex::decode(provided_mac)
            .map_err(|_| anyhow!("Native request MAC is not valid hexadecimal"))?;
        if provided_mac.len() != 32 {
            return Err(anyhow!("Native request MAC must be exactly 32 bytes"));
        }
        if request.wire_message_json.is_empty() {
            return Err(anyhow!(
                "Native request is missing its authenticated wire payload"
            ));
        }

        type HmacSha256 = Hmac<sha2::Sha256>;
        let signed_payload = format!("{}|{}|{}", request.id, timestamp, request.wire_message_json);
        let mut verifier = HmacSha256::new_from_slice(&self.session_secret)
            .map_err(|error| anyhow!("Native request HMAC initialization failed: {error}"))?;
        verifier.update(signed_payload.as_bytes());
        verifier
            .verify_slice(&provided_mac)
            .map_err(|_| anyhow!("Native request MAC verification failed"))?;

        if self.seen_request_ids.contains_key(&request.id) {
            return Err(anyhow!("Native request replay detected"));
        }
        self.seen_request_ids
            .retain(|_, seen_at| now_ms.saturating_sub(*seen_at) <= NATIVE_REQUEST_MAX_AGE_MS);
        if self.seen_request_ids.len() >= NATIVE_REQUEST_REPLAY_CACHE_LIMIT {
            return Err(anyhow!("Native request replay cache capacity exceeded"));
        }
        self.seen_request_ids.insert(request.id.clone(), timestamp);
        Ok(())
    }

    fn is_established(&self) -> bool {
        self.session_established
    }
}

/// Native messaging host that runs as a subprocess
pub struct NativeMessagingHost {
    state: Arc<RwLock<NativeMessagingState>>,
    message_tx: mpsc::Sender<NativeRequest>,
    response_rx: Arc<Mutex<mpsc::Receiver<NativeResponse>>>,
    session_secret: [u8; 32],
    session_secret_hex: String,
    expected_extension_id: Option<String>,
}

impl NativeMessagingHost {
    pub fn new() -> (
        Self,
        mpsc::Receiver<NativeRequest>,
        mpsc::Sender<NativeResponse>,
    ) {
        Self::new_for_extension(None)
    }

    pub fn new_for_extension(
        expected_extension_id: Option<String>,
    ) -> (
        Self,
        mpsc::Receiver<NativeRequest>,
        mpsc::Sender<NativeResponse>,
    ) {
        let (msg_tx, msg_rx) = mpsc::channel(100);
        let (resp_tx, resp_rx) = mpsc::channel(100);
        let mut session_secret = [0_u8; 32];
        rand::rngs::OsRng.fill_bytes(&mut session_secret);

        let host = Self {
            state: Arc::new(RwLock::new(NativeMessagingState::new())),
            message_tx: msg_tx,
            response_rx: Arc::new(Mutex::new(resp_rx)),
            session_secret,
            session_secret_hex: hex::encode(session_secret),
            expected_extension_id,
        };

        (host, msg_rx, resp_tx)
    }

    /// Run the native messaging host (blocking - reads from stdin)
    pub async fn run_stdio_host(&self) -> Result<()> {
        let mut stdin = BufReader::new(stdin());
        let mut stdout = BufWriter::new(stdout());
        let mut buffered_responses: HashMap<String, NativeResponse> = HashMap::new();
        let mut authenticator = NativeRequestAuthenticator::new(
            self.session_secret,
            self.expected_extension_id.clone(),
        );

        tracing::info!("Native messaging host started");

        loop {
            match read_message(&mut stdin) {
                Ok(request) => {
                    tracing::debug!("Received native message: {:?}", request.id);

                    if let Err(error) = authenticator.authenticate(&request, current_epoch_millis())
                    {
                        tracing::warn!("Rejected unauthenticated native request: {}", error);
                        let mut response = NativeResponse::error(request.id, error);
                        if authenticator.is_established() {
                            let _ = self.sign_response(&mut response);
                        }
                        if let Err(write_error) = write_message(&mut stdout, &response) {
                            tracing::error!(
                                "Failed to write native authentication error: {}",
                                write_error
                            );
                        }
                        continue;
                    }

                    // Send to message handler
                    if let Err(e) = self.message_tx.send(request.clone()).await {
                        tracing::error!("Failed to forward message: {}", e);
                        let response = NativeResponse::error(
                            request.id,
                            format!("Native host forwarding failed: {}", e),
                        );
                        if let Err(write_err) = write_message(&mut stdout, &response) {
                            tracing::error!(
                                "Failed to write forwarding error response: {}",
                                write_err
                            );
                        }
                        continue;
                    }

                    let mut response = self
                        .wait_for_response_for_request(&request.id, &mut buffered_responses)
                        .await;
                    if matches!(request.message, NativeMessage::Connect { .. }) {
                        response = response.with_session_secret(self.session_secret_hex.clone());
                    }
                    if let Err(e) = self.sign_response(&mut response) {
                        tracing::error!("Failed to sign native response: {}", e);
                        response = NativeResponse::error(
                            request.id,
                            format!("Native host response signing failed: {}", e),
                        );
                        let _ = self.sign_response(&mut response);
                    }

                    // Send response back to extension
                    if let Err(e) = write_message(&mut stdout, &response) {
                        tracing::error!("Failed to write response: {}", e);
                    }
                }
                Err(e) => {
                    // EOF or error - extension disconnected
                    let err = e.to_string();
                    if err.contains("EOF")
                        || err.contains("UnexpectedEof")
                        || err.contains("fill whole buffer")
                    {
                        tracing::info!("Extension disconnected");
                        break;
                    }
                    tracing::error!("Error reading message: {}", e);
                }
            }
        }

        Ok(())
    }

    fn sign_response(&self, response: &mut NativeResponse) -> Result<()> {
        response.sign_with_secret(&self.session_secret, current_epoch_millis())
    }

    async fn wait_for_response_for_request(
        &self,
        request_id: &str,
        buffered_responses: &mut HashMap<String, NativeResponse>,
    ) -> NativeResponse {
        if let Some(response) = buffered_responses.remove(request_id) {
            return response;
        }

        let deadline = Instant::now() + Duration::from_millis(NATIVE_RESPONSE_TIMEOUT_MS);
        loop {
            let remaining = deadline.saturating_duration_since(Instant::now());
            if remaining.is_zero() {
                return NativeResponse::error(
                    request_id.to_string(),
                    format!(
                        "Timed out waiting for desktop response after {}ms",
                        NATIVE_RESPONSE_TIMEOUT_MS
                    ),
                );
            }

            let next_response = tokio::time::timeout(remaining, async {
                let mut rx = self.response_rx.lock().await;
                rx.recv().await
            })
            .await;

            let Some(response) = (match next_response {
                Ok(response) => response,
                Err(_) => {
                    return NativeResponse::error(
                        request_id.to_string(),
                        format!(
                            "Timed out waiting for desktop response after {}ms",
                            NATIVE_RESPONSE_TIMEOUT_MS
                        ),
                    );
                }
            }) else {
                return NativeResponse::error(
                    request_id.to_string(),
                    "Desktop response channel closed unexpectedly".to_string(),
                );
            };

            if response.id == request_id {
                return response;
            }

            tracing::warn!(
                "Received out-of-order native response for id '{}'; buffering while waiting for '{}'",
                response.id,
                request_id
            );
            buffered_responses.insert(response.id.clone(), response);
        }
    }

    pub async fn get_state(&self) -> ConnectionState {
        self.state.read().await.connection_state.clone()
    }

    pub async fn set_connected(&self, extension_id: String) {
        let mut state = self.state.write().await;
        state.connection_state = ConnectionState::Connected;
        state.extension_id = Some(extension_id);
    }

    pub async fn set_disconnected(&self) {
        let mut state = self.state.write().await;
        state.connection_state = ConnectionState::Disconnected;
        state.extension_id = None;
    }
}

fn current_epoch_millis() -> u64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .unwrap_or_default()
        .as_millis()
        .try_into()
        .unwrap_or(u64::MAX)
}

impl Default for NativeMessagingHost {
    fn default() -> Self {
        Self::new().0
    }
}

/// Chrome passes the calling extension origin as the native host's first argument.
/// Bind the claimed `connect.extension_id` to that OS-mediated destination when present.
pub fn extension_id_from_launch_origin(origin: Option<&str>) -> Result<Option<String>> {
    let Some(origin) = origin else {
        return Ok(None);
    };
    let parsed = url::Url::parse(origin)
        .map_err(|error| anyhow!("Invalid native host launch destination: {error}"))?;
    if parsed.scheme() != "chrome-extension"
        || parsed.path() != "/"
        || parsed.query().is_some()
        || parsed.fragment().is_some()
    {
        return Err(anyhow!("Invalid native host launch destination"));
    }
    let extension_id = parsed
        .host_str()
        .ok_or_else(|| anyhow!("Native host launch destination is missing an extension ID"))?;
    if !super::manifest::is_valid_chrome_extension_id(extension_id) {
        return Err(anyhow!("Invalid Chrome extension launch destination"));
    }
    Ok(Some(extension_id.to_string()))
}

/// Handler for processing native messaging requests
pub struct NativeMessageHandler {
    /// Channel to send browser commands
    browser_tx: mpsc::Sender<BrowserCommand>,
}

/// Commands sent to browser automation
#[derive(Debug, Clone)]
pub enum BrowserCommand {
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
        format: String,
    },
    GetElement {
        selector: String,
        tab_id: Option<i32>,
    },
    GetAccessibilityTree {
        tab_id: Option<i32>,
    },
    GetTabs,
    CreateTab {
        url: String,
    },
    CloseTab {
        tab_id: i32,
    },
    GetCookies {
        url: Option<String>,
    },
    GetPageContent {
        tab_id: Option<i32>,
    },
}

impl NativeMessageHandler {
    pub fn new(browser_tx: mpsc::Sender<BrowserCommand>) -> Self {
        Self { browser_tx }
    }

    /// Process an incoming native message and return a response
    pub async fn handle_message(&self, request: NativeRequest) -> NativeResponse {
        match request.message {
            NativeMessage::Ping => {
                NativeResponse::success(request.id, serde_json::json!({"pong": true}))
            }

            NativeMessage::Connect { extension_id } => {
                tracing::info!("Extension connected: {}", extension_id);
                NativeResponse::success(
                    request.id,
                    serde_json::json!({
                        "connected": true,
                        "version": env!("CARGO_PKG_VERSION")
                    }),
                )
            }

            NativeMessage::Disconnect { reason } => {
                tracing::info!("Extension disconnecting: {:?}", reason);
                NativeResponse::success(request.id, serde_json::json!({"disconnected": true}))
            }

            NativeMessage::Click { selector, tab_id } => {
                match self
                    .browser_tx
                    .send(BrowserCommand::Click { selector, tab_id })
                    .await
                {
                    Ok(_) => {
                        NativeResponse::success(request.id, serde_json::json!({"clicked": true}))
                    }
                    Err(e) => NativeResponse::error(request.id, format!("Failed to click: {}", e)),
                }
            }

            NativeMessage::Type {
                selector,
                text,
                tab_id,
            } => {
                match self
                    .browser_tx
                    .send(BrowserCommand::Type {
                        selector,
                        text,
                        tab_id,
                    })
                    .await
                {
                    Ok(_) => {
                        NativeResponse::success(request.id, serde_json::json!({"typed": true}))
                    }
                    Err(e) => NativeResponse::error(request.id, format!("Failed to type: {}", e)),
                }
            }

            NativeMessage::Navigate { url, tab_id } => {
                match self
                    .browser_tx
                    .send(BrowserCommand::Navigate { url, tab_id })
                    .await
                {
                    Ok(_) => {
                        NativeResponse::success(request.id, serde_json::json!({"navigated": true}))
                    }
                    Err(e) => {
                        NativeResponse::error(request.id, format!("Failed to navigate: {}", e))
                    }
                }
            }

            NativeMessage::Screenshot { tab_id, format } => {
                match self
                    .browser_tx
                    .send(BrowserCommand::Screenshot {
                        tab_id,
                        format: format.unwrap_or_else(|| "png".to_string()),
                    })
                    .await
                {
                    Ok(_) => {
                        NativeResponse::success(request.id, serde_json::json!({"capturing": true}))
                    }
                    Err(e) => {
                        NativeResponse::error(request.id, format!("Failed to capture: {}", e))
                    }
                }
            }

            NativeMessage::GetAccessibilityTree { tab_id } => {
                match self
                    .browser_tx
                    .send(BrowserCommand::GetAccessibilityTree { tab_id })
                    .await
                {
                    Ok(_) => {
                        NativeResponse::success(request.id, serde_json::json!({"fetching": true}))
                    }
                    Err(e) => {
                        NativeResponse::error(request.id, format!("Failed to get tree: {}", e))
                    }
                }
            }

            NativeMessage::GetTabs => match self.browser_tx.send(BrowserCommand::GetTabs).await {
                Ok(_) => NativeResponse::success(request.id, serde_json::json!({"fetching": true})),
                Err(e) => NativeResponse::error(request.id, format!("Failed to get tabs: {}", e)),
            },

            NativeMessage::CreateTab { url } => {
                match self
                    .browser_tx
                    .send(BrowserCommand::CreateTab { url })
                    .await
                {
                    Ok(_) => {
                        NativeResponse::success(request.id, serde_json::json!({"creating": true}))
                    }
                    Err(e) => {
                        NativeResponse::error(request.id, format!("Failed to create tab: {}", e))
                    }
                }
            }

            NativeMessage::GetCookies { url } => {
                match self
                    .browser_tx
                    .send(BrowserCommand::GetCookies { url })
                    .await
                {
                    Ok(_) => {
                        NativeResponse::success(request.id, serde_json::json!({"fetching": true}))
                    }
                    Err(e) => {
                        NativeResponse::error(request.id, format!("Failed to get cookies: {}", e))
                    }
                }
            }

            NativeMessage::GetPageContent { tab_id } => {
                match self
                    .browser_tx
                    .send(BrowserCommand::GetPageContent { tab_id })
                    .await
                {
                    Ok(_) => {
                        NativeResponse::success(request.id, serde_json::json!({"fetching": true}))
                    }
                    Err(e) => {
                        NativeResponse::error(request.id, format!("Failed to get content: {}", e))
                    }
                }
            }

            _ => NativeResponse::error(request.id, "Unsupported message type"),
        }
    }
}

/// Install the native messaging host manifest
pub fn install_native_host_manifest() -> Result<()> {
    super::manifest::install_manifests(None).map(|_| ())
}

#[cfg(test)]
mod tests {
    use super::*;

    const FIXTURE_NOW_MS: u64 = 1_750_000_000_100;
    const EXPECTED_EXTENSION_ID: &str = "bblfoadbknbnmbchfjpgcefpkccpdnfc";

    fn read_wire_json(json: &str) -> NativeRequest {
        let mut framed = Vec::new();
        framed.extend_from_slice(&(json.len() as u32).to_le_bytes());
        framed.extend_from_slice(json.as_bytes());
        read_message(&mut framed.as_slice()).expect("wire fixture must deserialize")
    }

    fn established_authenticator() -> NativeRequestAuthenticator {
        let secret = std::array::from_fn(|index| index as u8);
        let mut authenticator =
            NativeRequestAuthenticator::new(secret, Some(EXPECTED_EXTENSION_ID.to_string()));
        let connect = read_wire_json(&format!(
            r#"{{"id":"connect_0123456789abcdef","timestamp":{},"mac":null,"message":{{"type":"connect","extension_id":"{}"}}}}"#,
            FIXTURE_NOW_MS - 100,
            EXPECTED_EXTENSION_ID
        ));
        authenticator
            .authenticate(&connect, FIXTURE_NOW_MS - 100)
            .expect("matching launch destination must establish the session");
        authenticator
    }

    #[tokio::test]
    async fn test_wait_for_response_for_request_uses_buffered_response() {
        let (host, _msg_rx, _resp_tx) = NativeMessagingHost::new();
        let mut buffered = HashMap::new();
        buffered.insert(
            "req-1".to_string(),
            NativeResponse::success("req-1".to_string(), serde_json::json!({ "ok": true })),
        );

        let response = host
            .wait_for_response_for_request("req-1", &mut buffered)
            .await;

        assert!(response.success);
        assert_eq!(response.id, "req-1");
        assert!(buffered.is_empty());
    }

    #[tokio::test]
    async fn test_wait_for_response_for_request_buffers_out_of_order_responses() {
        let (host, _msg_rx, resp_tx) = NativeMessagingHost::new();
        let mut buffered = HashMap::new();

        let _ = resp_tx
            .send(NativeResponse::success(
                "req-other".to_string(),
                serde_json::json!({ "ok": true }),
            ))
            .await;
        let _ = resp_tx
            .send(NativeResponse::success(
                "req-target".to_string(),
                serde_json::json!({ "ok": true }),
            ))
            .await;

        let response = host
            .wait_for_response_for_request("req-target", &mut buffered)
            .await;

        assert!(response.success);
        assert_eq!(response.id, "req-target");
        assert!(buffered.contains_key("req-other"));
    }

    #[test]
    fn accepts_the_exact_extension_hmac_fixture_after_destination_bound_connect() {
        let fixture =
            include_str!("../../../tests/fixtures/chrome_selected_context_handoff.json").trim();
        let request = read_wire_json(fixture);
        let mut authenticator = established_authenticator();

        assert!(authenticator.authenticate(&request, FIXTURE_NOW_MS).is_ok());
    }

    #[test]
    fn rejects_tampered_selected_context_with_the_original_mac() {
        let fixture = include_str!("../../../tests/fixtures/chrome_selected_context_handoff.json")
            .trim()
            .replace(
                "Use [REDACTED_ANTHROPIC_KEY] for the demo",
                "tampered payload",
            );
        let request = read_wire_json(&fixture);
        let mut authenticator = established_authenticator();

        let error = authenticator
            .authenticate(&request, FIXTURE_NOW_MS)
            .expect_err("tampering must fail closed");
        assert!(error.to_string().contains("MAC"));
    }

    #[test]
    fn rejects_replayed_native_request_ids() {
        let fixture =
            include_str!("../../../tests/fixtures/chrome_selected_context_handoff.json").trim();
        let request = read_wire_json(fixture);
        let mut authenticator = established_authenticator();

        authenticator
            .authenticate(&request, FIXTURE_NOW_MS)
            .expect("first delivery must be accepted");
        let error = authenticator
            .authenticate(&request, FIXTURE_NOW_MS)
            .expect_err("replay must be rejected");
        assert!(error.to_string().contains("replay"));
    }

    #[test]
    fn rejects_expired_native_request_envelopes() {
        let fixture =
            include_str!("../../../tests/fixtures/chrome_selected_context_handoff.json").trim();
        let request = read_wire_json(fixture);
        let mut authenticator = established_authenticator();

        let error = authenticator
            .authenticate(&request, FIXTURE_NOW_MS + NATIVE_REQUEST_MAX_AGE_MS + 1)
            .expect_err("expired envelope must be rejected");
        assert!(error.to_string().contains("expired"));
    }

    #[test]
    fn rejects_privileged_context_before_a_secret_is_negotiated() {
        let fixture =
            include_str!("../../../tests/fixtures/chrome_selected_context_handoff.json").trim();
        let request = read_wire_json(fixture);
        let secret = std::array::from_fn(|index| index as u8);
        let mut authenticator =
            NativeRequestAuthenticator::new(secret, Some(EXPECTED_EXTENSION_ID.to_string()));

        let error = authenticator
            .authenticate(&request, FIXTURE_NOW_MS)
            .expect_err("selected context requires a negotiated session secret");
        assert!(error.to_string().contains("handshake"));
    }

    #[test]
    fn rejects_post_handshake_context_without_a_mac() {
        let fixture = include_str!("../../../tests/fixtures/chrome_selected_context_handoff.json")
            .trim()
            .replace(
                "\"mac\":\"46234cd3d8354a57d53b85d6402bd849b2d24c6cf360062303b45dc4c39a687c\"",
                "\"mac\":null",
            );
        let request = read_wire_json(&fixture);
        let mut authenticator = established_authenticator();

        let error = authenticator
            .authenticate(&request, FIXTURE_NOW_MS)
            .expect_err("post-handshake selected context must carry a MAC");
        assert!(error.to_string().contains("missing its negotiated MAC"));
    }

    #[test]
    fn rejects_connect_payload_for_a_different_launch_destination() {
        let secret = std::array::from_fn(|index| index as u8);
        let mut authenticator =
            NativeRequestAuthenticator::new(secret, Some(EXPECTED_EXTENSION_ID.to_string()));
        let connect = read_wire_json(&format!(
            r#"{{"id":"connect_0123456789abcdef","timestamp":{},"mac":null,"message":{{"type":"connect","extension_id":"aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa"}}}}"#,
            FIXTURE_NOW_MS
        ));

        let error = authenticator
            .authenticate(&connect, FIXTURE_NOW_MS)
            .expect_err("claimed extension must match Chrome's launch origin");
        assert!(error.to_string().contains("destination"));
    }

    #[test]
    fn parses_the_chrome_launch_origin_as_the_expected_extension_destination() {
        assert_eq!(
            extension_id_from_launch_origin(Some(
                "chrome-extension://bblfoadbknbnmbchfjpgcefpkccpdnfc/"
            ))
            .unwrap(),
            Some(EXPECTED_EXTENSION_ID.to_string())
        );
    }

    #[test]
    fn rejects_a_non_extension_native_host_launch_destination() {
        assert!(extension_id_from_launch_origin(Some("https://agiworkforce.com/")).is_err());
    }
}
