use super::{PresenceManager, RealtimeEvent};
use crate::automation::browser::advanced::Cookie;
use crate::automation::browser::{AccessibilityAnalyzer, AdvancedBrowserOps, CdpClient};
use crate::integrations::native_messaging::manifest::install_manifests;
use crate::integrations::native_messaging::{ConnectionState, NativeMessage};
use crate::sys::commands::BrowserStateWrapper;
use crate::ui::events::tool_stream::{emit_tool_completed, emit_tool_error, emit_tool_started};
use base64::{engine::general_purpose::STANDARD as BASE64_STANDARD, Engine as _};
use futures::{
    stream::{SplitSink, SplitStream},
    SinkExt, StreamExt,
};
use serde_json::{json, Value};
use std::collections::HashMap;
use std::net::{IpAddr, SocketAddr};
use std::sync::Arc;
use std::time::{Duration, Instant};
use subtle::ConstantTimeEq;
use tauri::Emitter;
use tauri::Manager;
use tokio::io::AsyncWriteExt;
use tokio::net::{TcpListener, TcpStream};
use tokio::sync::{Mutex as TokioMutex, RwLock as TokioRwLock, Semaphore};
use tokio_tungstenite::{
    accept_hdr_async_with_config,
    tungstenite::{
        handshake::server::{ErrorResponse, Request, Response},
        protocol::WebSocketConfig,
        Message,
    },
    WebSocketStream,
};

// SEV-DESK-01 limits ─────────────────────────────────────────────────────────
//
// The realtime server binds 127.0.0.1 and accepts ws+http upgrades from
// the Chrome extension, VS Code extension, and Tauri webview. Without these
// caps, any local process running as the same user (malware, bug-installer)
// could open thousands of unauthenticated connections to exhaust file
// descriptors / heap, or brute-force the IPC token.
//
// MAX_CONNECTIONS — total simultaneous accepted connections. Beyond this, the
//   accept loop drops new connections at the TCP level (no upgrade).
// MAX_AUTH_FAILURES / AUTH_FAILURE_WINDOW — within any 60s rolling window,
//   five auth failures from the same IP triggers a lockout.
// LOCKOUT_DURATION — duration the offending IP is rejected at handshake.
// MAX_WS_MESSAGE_SIZE — caps a single WS frame so a malicious / buggy peer
//   cannot force the server to buffer 64 MiB before validating.
const MAX_CONNECTIONS: usize = 32;
const MAX_AUTH_FAILURES: u32 = 5;
const AUTH_FAILURE_WINDOW: Duration = Duration::from_secs(60);
const LOCKOUT_DURATION: Duration = Duration::from_secs(300);
const MAX_WS_MESSAGE_SIZE: usize = 4 * 1024 * 1024;

#[derive(Default)]
struct AuthFailureRecord {
    /// First failure in the current window. Reset whenever the window expires.
    first_failure_at: Option<Instant>,
    /// Failures observed within the current window.
    count: u32,
    /// Lockout end-time. While `Some(t)` and `t > now`, all upgrades from
    /// this IP are rejected at the handshake.
    lockout_until: Option<Instant>,
}

// ── RT-04: WebSocket Origin allow-list ───────────────────────────────────────
//
// Any WebSocket from a non-allowed origin is rejected at the HTTP-upgrade
// phase, before any application data is exchanged.  Allowed origins:
//
//   • chrome-extension://...      — Chrome/Chromium extension (any ID)
//   • vscode-webview://...        — VS Code webview panel
//   • vscode-file://...           — VS Code file-based webview
//   • null                        — Tauri webview (no Origin header)
//   • http(s)://localhost[:port]  — localhost (dev tools, Electron)
//   • http(s)://127.0.0.1[:port]  — loopback IPv4
//   • http(s)://[::1][:port]      — loopback IPv6
//
// HTTP/HTTPS pages from arbitrary domains are always rejected.
//
// B3 fix: the previous implementation used `origin.starts_with("http://localhost")`
// which silently accepted `http://localhost.attacker.com`. We now require the
// host component (after the scheme + `://`) to *equal* one of the allowed
// values (modulo an optional `:port` suffix) so prefix attacks are closed.
fn is_origin_allowed(origin: Option<&str>) -> bool {
    let Some(origin) = origin else {
        // No Origin header — Tauri native webview; allow.
        return true;
    };
    if origin == "null" {
        // Tauri sends the literal string "null".
        return true;
    }
    if origin.starts_with("chrome-extension://")
        || origin.starts_with("vscode-webview://")
        || origin.starts_with("vscode-file://")
    {
        return true;
    }
    // For http(s) origins we must compare the *host* exactly, not the prefix.
    // Origin headers are of the form `http(s)://host[:port]` (no path / no query).
    let rest = origin
        .strip_prefix("http://")
        .or_else(|| origin.strip_prefix("https://"));
    let Some(rest) = rest else {
        return false;
    };
    // Strip optional :port. IPv6 origins are bracketed: `[::1]:8080` -> host `[::1]`.
    let host = if let Some(stripped) = rest.strip_prefix('[') {
        // IPv6: host runs through the closing ']'. `stripped` does NOT
        // include the leading `[`, so the `]` index in `stripped` is offset
        // by 1 relative to `rest` — and we want to keep BOTH brackets.
        match stripped.find(']') {
            Some(end) => &rest[..end + 2], // +1 for `[`, +1 for `]`
            None => return false,
        }
    } else {
        // IPv4 / DNS host: host runs until the first ':' or end.
        match rest.find(':') {
            Some(end) => &rest[..end],
            None => rest,
        }
    };
    matches!(host, "localhost" | "127.0.0.1" | "[::1]")
}

/// Duration the server waits for the first auth message before closing.
const AUTH_TIMEOUT: Duration = Duration::from_secs(2);
// ─────────────────────────────────────────────────────────────────────────────

pub struct WebSocketClient {
    pub id: String,
    pub user_id: Option<String>,
    pub team_id: Option<String>,
    /// The resource this client is currently interacting with (e.g. typing in)
    pub current_resource: Option<String>,
}

pub struct RealtimeServer {
    clients: Arc<TokioMutex<HashMap<String, WebSocketClient>>>,
    senders: Arc<TokioMutex<HashMap<String, SplitSink<WebSocketStream<TcpStream>, Message>>>>,
    presence: Arc<PresenceManager>,
    /// B6 fix: live IPC token guarded by an `Arc<RwLock<String>>` so
    /// `bridge_rotate_token` can swap the value at runtime and new
    /// connections immediately authenticate against the rotated value.
    /// Existing connections keep the snapshot they captured at handshake.
    token: Arc<TokioRwLock<String>>,
    app_handle: Option<tauri::AppHandle>,
    /// SEV-DESK-01: caps simultaneous accepted connections at MAX_CONNECTIONS.
    connection_semaphore: Arc<Semaphore>,
    /// SEV-DESK-01: per-source-IP auth-failure record; entries decay after
    /// AUTH_FAILURE_WINDOW elapses without further failures.
    auth_failures: Arc<TokioMutex<HashMap<IpAddr, AuthFailureRecord>>>,
    /// E2 fix: token issued by POST /pair and stored for subsequent
    /// X-Bridge-Token validation. Empty string means no pairing has occurred.
    pair_token: Arc<TokioRwLock<String>>,
}

impl RealtimeServer {
    pub fn new(
        presence: Arc<PresenceManager>,
        token: Arc<TokioRwLock<String>>,
        app_handle: Option<tauri::AppHandle>,
    ) -> Self {
        Self {
            clients: Arc::new(TokioMutex::new(HashMap::new())),
            senders: Arc::new(TokioMutex::new(HashMap::new())),
            presence,
            token,
            app_handle,
            connection_semaphore: Arc::new(Semaphore::new(MAX_CONNECTIONS)),
            auth_failures: Arc::new(TokioMutex::new(HashMap::new())),
            pair_token: Arc::new(TokioRwLock::new(String::new())),
        }
    }

    /// Return the current pair token for X-Bridge-Token validation.
    /// Returns an empty string if no pairing has been performed yet.
    pub async fn get_pair_token(&self) -> String {
        self.pair_token.read().await.clone()
    }

    /// SEV-DESK-01: returns true if `ip` is currently in the lockout window.
    /// Also opportunistically clears expired lockouts so the map does not
    /// grow without bound for transient offenders.
    async fn is_locked_out(map: &Arc<TokioMutex<HashMap<IpAddr, AuthFailureRecord>>>, ip: IpAddr) -> bool {
        let mut failures = map.lock().await;
        let Some(rec) = failures.get_mut(&ip) else {
            return false;
        };
        if let Some(until) = rec.lockout_until {
            if Instant::now() < until {
                return true;
            }
            // Lockout expired — reset so a previously locked-out client gets
            // a fresh failure budget after the cooldown.
            rec.lockout_until = None;
            rec.count = 0;
            rec.first_failure_at = None;
        }
        false
    }

    /// SEV-DESK-01: records an auth failure for `ip` and applies the lockout
    /// rule. Returns true iff the failure caused a new lockout.
    async fn record_auth_failure(
        map: &Arc<TokioMutex<HashMap<IpAddr, AuthFailureRecord>>>,
        ip: IpAddr,
    ) -> bool {
        let mut failures = map.lock().await;
        let now = Instant::now();
        let rec = failures.entry(ip).or_default();

        // Reset the rolling window if the prior burst expired without
        // crossing the threshold.
        if let Some(start) = rec.first_failure_at {
            if now.duration_since(start) > AUTH_FAILURE_WINDOW {
                rec.count = 0;
                rec.first_failure_at = None;
            }
        }

        if rec.first_failure_at.is_none() {
            rec.first_failure_at = Some(now);
        }
        rec.count = rec.count.saturating_add(1);

        if rec.count >= MAX_AUTH_FAILURES {
            rec.lockout_until = Some(now + LOCKOUT_DURATION);
            tracing::warn!(
                "SEV-DESK-01: locking out {} for {}s after {} auth failures",
                ip,
                LOCKOUT_DURATION.as_secs(),
                rec.count
            );
            return true;
        }
        false
    }

    /// SEV-DESK-01: clears any failure record for `ip` after a successful auth.
    async fn clear_auth_failures(
        map: &Arc<TokioMutex<HashMap<IpAddr, AuthFailureRecord>>>,
        ip: IpAddr,
    ) {
        let mut failures = map.lock().await;
        failures.remove(&ip);
    }

    pub async fn broadcast_to_user(
        &self,
        user_id: &str,
        event: RealtimeEvent,
    ) -> Result<(), String> {
        Self::broadcast_to_specific_user(user_id, event, &self.clients, &self.senders).await
    }

    pub async fn start(&self, port: u16) -> Result<(), Box<dyn std::error::Error>> {
        let addr = format!("127.0.0.1:{}", port);
        let listener = TcpListener::bind(&addr).await?;

        tracing::info!(
            "WebSocket server listening on {} (max {} concurrent connections)",
            addr,
            MAX_CONNECTIONS
        );

        loop {
            match listener.accept().await {
                Ok((stream, peer)) => {
                    // SEV-DESK-01: cap simultaneous connections. `try_acquire_owned`
                    // is non-blocking — when the cap is reached we drop the
                    // connection at the TCP layer rather than queue it (queueing
                    // would still consume the FD and let an attacker hold it
                    // indefinitely).
                    let permit = match self.connection_semaphore.clone().try_acquire_owned() {
                        Ok(permit) => permit,
                        Err(_) => {
                            tracing::warn!(
                                "SEV-DESK-01: rejecting connection from {} — connection cap of {} reached",
                                peer,
                                MAX_CONNECTIONS
                            );
                            // Dropping `stream` closes the TCP socket cleanly.
                            drop(stream);
                            continue;
                        }
                    };

                    // SEV-DESK-01: skip handshake entirely for IPs in lockout.
                    if Self::is_locked_out(&self.auth_failures, peer.ip()).await {
                        tracing::warn!(
                            "SEV-DESK-01: rejecting connection from locked-out IP {}",
                            peer
                        );
                        drop(stream);
                        drop(permit);
                        continue;
                    }

                    // E2 fix: dual-protocol dispatch. Peek the first 8 bytes to
                    // distinguish a plain HTTP request (POST /pair) from a WebSocket
                    // upgrade (begins with "GET "). The peek does NOT consume bytes,
                    // so the WS upgrade path sees a pristine stream.
                    let mut peek_buf = [0u8; 8];
                    let peek_len = match stream.peek(&mut peek_buf).await {
                        Ok(n) => n,
                        Err(e) => {
                            tracing::debug!("Peek failed on new connection from {}: {}", peer, e);
                            drop(stream);
                            drop(permit);
                            continue;
                        }
                    };

                    let is_plain_http = peek_len >= 5 && &peek_buf[..5] == b"POST ";

                    let clients = self.clients.clone();
                    let senders = self.senders.clone();
                    let presence = self.presence.clone();
                    // B6 fix: snapshot the live token at spawn time. Connections
                    // authenticate against whatever value `bridge_rotate_token`
                    // last wrote; in-flight handshakes captured at this point
                    // keep their snapshot for the duration of the handshake.
                    let token = self.token.read().await.clone();
                    let app_handle = self.app_handle.clone();
                    let auth_failures = self.auth_failures.clone();
                    let pair_token = self.pair_token.clone();

                    tokio::spawn(async move {
                        // The permit is held for the entire connection lifetime;
                        // drop on task exit releases it for the next connection.
                        let _permit = permit;

                        if is_plain_http {
                            // Route plain HTTP POST /pair to the pairing handler.
                            Self::handle_http_pair(stream, peer, pair_token).await;
                        } else if let Err(e) = Self::handle_connection_wrapper(
                            stream,
                            peer,
                            clients,
                            senders,
                            presence,
                            token,
                            app_handle,
                            auth_failures,
                        )
                        .await
                        {
                            tracing::error!("Connection error: {}", e);
                        }
                    });
                }
                Err(e) => {
                    tracing::error!("Failed to accept connection: {}", e);
                }
            }
        }
    }

    // ── E2: HTTP /pair handler ────────────────────────────────────────────────
    //
    // Accepts POST /pair from loopback only. Reads the minimal HTTP/1.1 framing
    // (headers until \r\n\r\n, then Content-Length body bytes), validates the
    // path, generates a 32-byte random token, stores it in the shared pair_token
    // lock, and returns {"token":"…","fingerprint":"…"} as JSON.
    //
    // Calling /pair a second time ROTATES the token (idempotent success, new value).
    // Non-loopback source IPs and wrong paths both receive 403 / 404 respectively.

    async fn handle_http_pair(
        mut stream: TcpStream,
        peer: SocketAddr,
        pair_token: Arc<TokioRwLock<String>>,
    ) {
        use tokio::io::AsyncReadExt;

        // Loopback-only: reject any non-127.0.0.1 source immediately.
        if !peer.ip().is_loopback() {
            tracing::warn!("E2: /pair rejected from non-loopback source {}", peer);
            let response = b"HTTP/1.1 403 Forbidden\r\nContent-Length: 9\r\nConnection: close\r\n\r\nForbidden";
            let _ = stream.write_all(response).await;
            let _ = stream.shutdown().await;
            return;
        }

        // Read up to 4 KiB — enough for any real HTTP /pair request.
        let mut buf = vec![0u8; 4096];
        let n = match stream.read(&mut buf).await {
            Ok(0) | Err(_) => return,
            Ok(n) => n,
        };
        let raw = &buf[..n];

        // Parse the request line (first line) to validate method + path.
        let header_section = match std::str::from_utf8(raw) {
            Ok(s) => s,
            Err(_) => {
                let _ = stream.write_all(b"HTTP/1.1 400 Bad Request\r\nContent-Length: 11\r\nConnection: close\r\n\r\nBad Request").await;
                let _ = stream.shutdown().await;
                return;
            }
        };

        let first_line = header_section.lines().next().unwrap_or("");
        // Expect "POST /pair HTTP/1.1" (path segment only; ignore query string).
        let parts: Vec<&str> = first_line.splitn(3, ' ').collect();
        let method = parts.first().copied().unwrap_or("");
        let path = parts.get(1).copied().unwrap_or("");
        let path_no_query = path.split('?').next().unwrap_or(path);

        if method != "POST" || path_no_query != "/pair" {
            let body = format!("Not found: {} {}", method, path_no_query);
            let response = format!(
                "HTTP/1.1 404 Not Found\r\nContent-Type: text/plain\r\nContent-Length: {}\r\nConnection: close\r\n\r\n{}",
                body.len(),
                body
            );
            let _ = stream.write_all(response.as_bytes()).await;
            let _ = stream.shutdown().await;
            return;
        }

        // Generate a 32-byte (64 hex chars) cryptographically random token.
        let new_token = {
            use rand::RngCore;
            let mut bytes = [0u8; 32];
            rand::thread_rng().fill_bytes(&mut bytes);
            hex::encode(bytes)
        };
        let fingerprint = new_token[..8].to_string();

        // Store (rotate) the pair token.
        *pair_token.write().await = new_token.clone();

        tracing::info!("E2: /pair issued new token with fingerprint {}", fingerprint);

        let body = serde_json::json!({
            "token": new_token,
            "fingerprint": fingerprint,
        })
        .to_string();

        let response = format!(
            "HTTP/1.1 200 OK\r\nContent-Type: application/json\r\nContent-Length: {}\r\nAccess-Control-Allow-Origin: *\r\nConnection: close\r\n\r\n{}",
            body.len(),
            body
        );
        let _ = stream.write_all(response.as_bytes()).await;
        let _ = stream.shutdown().await;
    }
    // ─────────────────────────────────────────────────────────────────────────

    async fn handle_connection_wrapper(
        stream: TcpStream,
        peer: SocketAddr,
        clients: Arc<TokioMutex<HashMap<String, WebSocketClient>>>,
        senders: Arc<TokioMutex<HashMap<String, SplitSink<WebSocketStream<TcpStream>, Message>>>>,
        presence: Arc<PresenceManager>,
        token: String,
        app_handle: Option<tauri::AppHandle>,
        auth_failures: Arc<TokioMutex<HashMap<IpAddr, AuthFailureRecord>>>,
    ) -> Result<(), Box<dyn std::error::Error>> {
        // RT-04 fix: validate Origin header during the WebSocket handshake.
        // `accept_hdr_async_with_config` lets us inspect the HTTP upgrade request
        // before the connection is established AND cap per-frame size.
        let callback = |request: &Request,
                        response: Response|
         -> Result<Response, ErrorResponse> {
            let origin = request
                .headers()
                .get("origin")
                .and_then(|v| v.to_str().ok());

            if !is_origin_allowed(origin) {
                tracing::warn!(
                    "RT-04: WebSocket upgrade rejected from disallowed origin: {:?}",
                    origin
                );
                let rejected = origin.unwrap_or("<none>").to_string();
                // We can't capture `rejected_origin` here due to borrow rules,
                // so we embed the rejection in the error response reason phrase.
                let _ = rejected; // used via tracing above
                let err_response = ErrorResponse::new(Some(
                    "Origin not allowed".to_string(),
                ));
                return Err(err_response);
            }
            Ok(response)
        };

        // SEV-DESK-01: bound per-frame size. tungstenite default is 64 MiB;
        // none of our valid messages are anywhere near 4 MiB. A peer that
        // sends a frame above this gets disconnected at the protocol layer
        // before any deserialisation runs.
        let mut ws_config = WebSocketConfig::default();
        ws_config.max_message_size = Some(MAX_WS_MESSAGE_SIZE);
        ws_config.max_frame_size = Some(MAX_WS_MESSAGE_SIZE);

        let ws_stream = match accept_hdr_async_with_config(stream, callback, Some(ws_config)).await
        {
            Ok(ws) => ws,
            Err(e) => {
                tracing::warn!("RT-04: WebSocket handshake failed (origin check or protocol error): {}", e);
                return Ok(()); // connection is already closed; not an error we need to propagate
            }
        };

        // RT-04 fix: enforce a hard timeout for the initial auth message.
        // Wrap the whole connection handler so that a client that never sends
        // auth is cleaned up after AUTH_TIMEOUT.
        let handle_fut = Self::handle_connection(
            ws_stream,
            peer,
            clients,
            senders,
            presence,
            token,
            app_handle,
            auth_failures,
        );
        // The auth itself is handled inside `handle_connection`; the timeout
        // there is enforced by the `tokio::time::timeout` around `ws_stream.next()`.
        handle_fut.await;
        Ok(())
    }

    async fn handle_connection(
        mut ws_stream: WebSocketStream<TcpStream>,
        peer: SocketAddr,
        clients: Arc<TokioMutex<HashMap<String, WebSocketClient>>>,
        senders: Arc<TokioMutex<HashMap<String, SplitSink<WebSocketStream<TcpStream>, Message>>>>,
        presence: Arc<PresenceManager>,
        token: String,
        app_handle: Option<tauri::AppHandle>,
        auth_failures: Arc<TokioMutex<HashMap<IpAddr, AuthFailureRecord>>>,
    ) {
        // Enforce Authentication
        tracing::debug!("Waiting for authentication...");
        let mut user_id_from_auth: Option<String> = None;
        let mut team_id_from_auth: Option<String> = None;

        // RT-04 fix: the first message must arrive within AUTH_TIMEOUT.
        let first_msg = tokio::time::timeout(AUTH_TIMEOUT, ws_stream.next()).await;
        let auth_failure_reason = if let Ok(Some(Ok(Message::Text(text)))) = first_msg {
            if let Ok(RealtimeEvent::Authenticate {
                user_id,
                team_id,
                token: auth_token,
            }) = serde_json::from_str::<RealtimeEvent>(&text)
            {
                if let Some(sent_token) = auth_token {
                    if sent_token.len() == token.len()
                        && bool::from(sent_token.as_bytes().ct_eq(token.as_bytes()))
                    {
                        user_id_from_auth = Some(user_id);
                        team_id_from_auth = team_id;
                        tracing::info!(
                            "Authentication successful for user: {:?}",
                            user_id_from_auth
                        );
                        None
                    } else {
                        tracing::warn!("Authentication failed: Invalid token");
                        Some("Invalid authentication token for realtime websocket".to_string())
                    }
                } else {
                    tracing::warn!("Authentication failed: Missing token");
                    Some("Missing authentication token for realtime websocket".to_string())
                }
            } else {
                tracing::warn!("Authentication failed: Invalid event format");
                Some("Invalid authentication event format".to_string())
            }
        } else {
            // Connection closed, non-text message received, or 2-second auth timeout expired.
            Some("Realtime websocket closed or timed out before authentication".to_string())
        };

        if let Some(reason) = auth_failure_reason {
            // SEV-DESK-01: record the failure against the source IP. If this
            // crosses MAX_AUTH_FAILURES inside the rolling window, future
            // connections from this IP are rejected at the listener for
            // LOCKOUT_DURATION.
            Self::record_auth_failure(&auth_failures, peer.ip()).await;

            if let Ok(auth_error_message) =
                serde_json::to_string(&RealtimeEvent::AuthenticationFailed {
                    reason: reason.clone(),
                })
            {
                let _ = ws_stream.send(Message::Text(auth_error_message)).await;
            }
            let _ = ws_stream.close(None).await;
            tracing::warn!(
                "Connection closed due to authentication failure from {}: {}",
                peer,
                reason
            );
            return;
        }

        // SEV-DESK-01: success — clear any prior failure budget for this IP
        // so a transient typo or token-rotation race does not poison future
        // connections.
        Self::clear_auth_failures(&auth_failures, peer.ip()).await;

        if let Some(user_id) = &user_id_from_auth {
            if let Ok(auth_ok_message) = serde_json::to_string(&RealtimeEvent::Authenticated {
                user_id: user_id.clone(),
            }) {
                if let Err(e) = ws_stream.send(Message::Text(auth_ok_message)).await {
                    tracing::warn!("Failed to send realtime auth acknowledgement: {}", e);
                }
            }
        }

        let (sender, receiver) = ws_stream.split();
        let client_id = uuid::Uuid::new_v4().to_string();

        {
            let mut clients_lock = clients.lock().await;
            clients_lock.insert(
                client_id.clone(),
                WebSocketClient {
                    id: client_id.clone(),
                    user_id: user_id_from_auth,
                    team_id: team_id_from_auth,
                    current_resource: None,
                },
            );
        }

        {
            let mut senders_lock = senders.lock().await;
            senders_lock.insert(client_id.clone(), sender);
        }

        Self::handle_messages(
            receiver,
            &client_id,
            &clients,
            &senders,
            &presence,
            app_handle.as_ref(),
        )
        .await;

        {
            let mut clients_lock = clients.lock().await;
            if let Some(client) = clients_lock.get(&client_id) {
                if let Some(user_id) = &client.user_id {
                    presence.set_offline(user_id).await;
                }
            }
            clients_lock.remove(&client_id);
        }

        {
            let mut senders_lock = senders.lock().await;
            senders_lock.remove(&client_id);
        }

        tracing::info!("Client disconnected: {}", client_id);
    }

    async fn handle_messages(
        mut receiver: SplitStream<WebSocketStream<TcpStream>>,
        client_id: &str,
        clients: &Arc<TokioMutex<HashMap<String, WebSocketClient>>>,
        senders: &Arc<TokioMutex<HashMap<String, SplitSink<WebSocketStream<TcpStream>, Message>>>>,
        presence: &Arc<PresenceManager>,
        app_handle: Option<&tauri::AppHandle>,
    ) {
        while let Some(Ok(msg)) = receiver.next().await {
            if let Message::Text(text) = msg {
                if let Ok(event) = serde_json::from_str::<RealtimeEvent>(&text) {
                    Self::handle_event(event, client_id, clients, senders, presence, app_handle)
                        .await;
                }
            }
        }
    }

    async fn handle_event(
        event: RealtimeEvent,
        client_id: &str,
        clients: &Arc<TokioMutex<HashMap<String, WebSocketClient>>>,
        senders: &Arc<TokioMutex<HashMap<String, SplitSink<WebSocketStream<TcpStream>, Message>>>>,
        presence: &Arc<PresenceManager>,
        app_handle: Option<&tauri::AppHandle>,
    ) {
        match &event {
            RealtimeEvent::Authenticate {
                user_id, team_id, ..
            } => {
                // Block re-authentication for already-authenticated clients
                {
                    let clients_lock = clients.lock().await;
                    if let Some(client) = clients_lock.get(client_id) {
                        if client.user_id.is_some() {
                            tracing::warn!(
                                "Ignoring re-authentication attempt for already-authenticated client: {}",
                                client_id
                            );
                            return;
                        }
                    }
                }
                {
                    let mut clients_lock = clients.lock().await;
                    if let Some(client) = clients_lock.get_mut(client_id) {
                        client.user_id = Some(user_id.clone());
                        client.team_id = team_id.clone();
                    }
                }
                presence.set_online(user_id).await;
                tracing::info!("Client authenticated: {} as user {}", client_id, user_id);
            }

            RealtimeEvent::GoalCreated { .. } => {
                if let Some(team_id) = Self::get_client_team(client_id, clients).await {
                    Self::broadcast_to_team(&team_id, event.clone(), clients, senders).await;
                }
            }

            RealtimeEvent::GoalUpdated { .. } => {
                if let Some(team_id) = Self::get_client_team(client_id, clients).await {
                    Self::broadcast_to_team(&team_id, event.clone(), clients, senders).await;
                }
            }

            RealtimeEvent::WorkflowUpdated { .. } => {
                if let Some(team_id) = Self::get_client_team(client_id, clients).await {
                    Self::broadcast_to_team(&team_id, event.clone(), clients, senders).await;
                }
            }

            RealtimeEvent::UserTyping {
                ref resource_id, ..
            } => {
                // Track the resource this client is interacting with
                {
                    let mut clients_lock = clients.lock().await;
                    if let Some(client_entry) = clients_lock.get_mut(client_id) {
                        client_entry.current_resource = Some(resource_id.clone());
                    }
                }
                Self::broadcast_to_resource(resource_id, event.clone(), clients, senders).await;
            }

            RealtimeEvent::CursorMoved { .. } => {
                if let Some(team_id) = Self::get_client_team(client_id, clients).await {
                    Self::broadcast_to_team(&team_id, event.clone(), clients, senders).await;
                }
            }

            RealtimeEvent::NativeMessage { id, payload } => {
                tracing::info!("Received native message: {} {:?}", id, payload);
                let native_type = payload
                    .get("type")
                    .and_then(Value::as_str)
                    .map(str::to_string)
                    .unwrap_or_else(|| "unknown".to_string());
                let started_at = Instant::now();

                if let Some(app) = app_handle {
                    let tool_name = format!("extension_native_{}", native_type);
                    emit_tool_started(app, id, &tool_name, Some(payload.clone()));
                }

                let execution = Self::execute_native_message(payload.clone(), app_handle).await;
                let duration_ms = started_at.elapsed().as_millis() as u64;

                let response = match execution {
                    Ok(data) => RealtimeEvent::NativeResponse {
                        id: id.clone(),
                        success: true,
                        data: Some(data),
                        error: None,
                    },
                    Err(error) => RealtimeEvent::NativeResponse {
                        id: id.clone(),
                        success: false,
                        data: None,
                        error: Some(error),
                    },
                };

                if let Some(app) = app_handle {
                    let (success, result, error) = match &response {
                        RealtimeEvent::NativeResponse {
                            success,
                            data,
                            error,
                            ..
                        } => (*success, data.clone(), error.clone()),
                        _ => (
                            false,
                            None,
                            Some("Unexpected native response type".to_string()),
                        ),
                    };

                    if success {
                        emit_tool_completed(
                            app,
                            id,
                            result.clone().unwrap_or_else(|| json!({})),
                            duration_ms,
                        );
                    } else {
                        emit_tool_error(
                            app,
                            id,
                            error
                                .as_deref()
                                .unwrap_or("Native extension request failed"),
                            duration_ms,
                            true,
                        );
                    }

                    // Avoid duplicate/conflicting extension task events for message types
                    // that already emit dedicated events in their execution handlers.
                    let emit_generic_task_event = !matches!(
                        native_type.as_str(),
                        "page_context"
                            | "task_result"
                            | "ping"
                            | "connect"
                            | "disconnect"
                            | "selected_text_query"
                    );

                    if emit_generic_task_event {
                        let task_event = json!({
                            "task_id": id,
                            "success": success,
                            "result": result,
                            "error": error,
                            "actions_performed": 1,
                            "duration": duration_ms,
                            "metadata": {
                                "native_type": native_type
                            }
                        });

                        if let Err(event_error) = app.emit("extension:task-result", &task_event) {
                            tracing::warn!(
                                "Failed to emit extension:task-result from native message: {}",
                                event_error
                            );
                        }
                    }
                }

                let message = Message::Text(serde_json::to_string(&response).unwrap_or_default());
                let mut senders_lock = senders.lock().await;
                if let Some(sender) = senders_lock.get_mut(client_id) {
                    let _ = sender.send(message).await;
                }
            }

            _ => {
                tracing::debug!("Unhandled event type: {:?}", event);
            }
        }
    }

    async fn get_client_team(
        client_id: &str,
        clients: &Arc<TokioMutex<HashMap<String, WebSocketClient>>>,
    ) -> Option<String> {
        let clients_lock = clients.lock().await;
        clients_lock.get(client_id).and_then(|c| c.team_id.clone())
    }

    async fn broadcast_to_team(
        team_id: &str,
        event: RealtimeEvent,
        clients: &Arc<TokioMutex<HashMap<String, WebSocketClient>>>,
        senders: &Arc<TokioMutex<HashMap<String, SplitSink<WebSocketStream<TcpStream>, Message>>>>,
    ) {
        let message = Message::Text(serde_json::to_string(&event).unwrap_or_default());
        let clients_lock = clients.lock().await;
        let mut senders_lock = senders.lock().await;

        for (client_id, client) in clients_lock.iter() {
            if client.team_id.as_deref() == Some(team_id) {
                if let Some(sender) = senders_lock.get_mut(client_id) {
                    let _ = sender.send(message.clone()).await;
                }
            }
        }
    }

    async fn broadcast_to_resource(
        resource_id: &str,
        event: RealtimeEvent,
        clients: &Arc<TokioMutex<HashMap<String, WebSocketClient>>>,
        senders: &Arc<TokioMutex<HashMap<String, SplitSink<WebSocketStream<TcpStream>, Message>>>>,
    ) {
        let message = Message::Text(serde_json::to_string(&event).unwrap_or_default());
        let clients_lock = clients.lock().await;
        let mut senders_lock = senders.lock().await;

        for (client_id, client) in clients_lock.iter() {
            // Only send to clients that are actively interacting with this resource
            let is_on_resource = client
                .current_resource
                .as_deref()
                .is_some_and(|r| r == resource_id);
            if client.user_id.is_some() && is_on_resource {
                if let Some(sender) = senders_lock.get_mut(client_id) {
                    let _ = sender.send(message.clone()).await;
                }
            }
        }
    }

    async fn broadcast_to_specific_user(
        user_id: &str,
        event: RealtimeEvent,
        clients: &Arc<TokioMutex<HashMap<String, WebSocketClient>>>,
        senders: &Arc<TokioMutex<HashMap<String, SplitSink<WebSocketStream<TcpStream>, Message>>>>,
    ) -> Result<(), String> {
        let message = Message::Text(
            serde_json::to_string(&event)
                .map_err(|e| format!("Failed to serialize event: {}", e))?,
        );

        let clients_lock = clients.lock().await;
        let mut senders_lock = senders.lock().await;
        let mut delivered = false;

        for (client_id, client) in clients_lock.iter() {
            if client.user_id.as_deref() == Some(user_id) {
                if let Some(sender) = senders_lock.get_mut(client_id) {
                    let _ = sender.send(message.clone()).await;
                    delivered = true;
                }
            }
        }

        if delivered {
            Ok(())
        } else {
            Err(format!("User {} not connected", user_id))
        }
    }

    async fn execute_native_message(
        payload: Value,
        app_handle: Option<&tauri::AppHandle>,
    ) -> Result<Value, String> {
        let message: NativeMessage = serde_json::from_value(payload)
            .map_err(|e| format!("Invalid native message payload: {}", e))?;

        match message {
            NativeMessage::Ping => Ok(json!({ "pong": true })),

            NativeMessage::Connect { extension_id } => {
                if let Err(error) = install_manifests(Some(extension_id.as_str())) {
                    tracing::warn!(
                        "Failed to refresh native messaging manifests for extension {}: {}",
                        extension_id,
                        error
                    );
                }

                if let Some(app) = app_handle {
                    if let Some(native_state) =
                        app.try_state::<crate::sys::commands::NativeMessagingStateWrapper>()
                    {
                        *native_state.extension_id.write().await = Some(extension_id.clone());
                        let mut state = native_state.state.write().await;
                        state.connection_state = ConnectionState::Connected;
                        state.extension_id = Some(extension_id.clone());
                    }

                    if let Err(e) = app.emit(
                        "extension:connection-status",
                        &json!({
                            "connected": true,
                            "status": "connected",
                            "extension_id": extension_id,
                            "timestamp": chrono::Utc::now().timestamp_millis()
                        }),
                    ) {
                        tracing::warn!(
                            "Failed to emit extension:connection-status (connected): {}",
                            e
                        );
                    }
                }

                Ok(json!({
                    "connected": true,
                    "extension_id": extension_id,
                    "version": env!("CARGO_PKG_VERSION")
                }))
            }

            NativeMessage::Disconnect { reason } => {
                if let Some(app) = app_handle {
                    if let Some(native_state) =
                        app.try_state::<crate::sys::commands::NativeMessagingStateWrapper>()
                    {
                        *native_state.extension_id.write().await = None;
                        let mut state = native_state.state.write().await;
                        state.connection_state = ConnectionState::Disconnected;
                        state.extension_id = None;
                    }

                    if let Err(e) = app.emit(
                        "extension:connection-status",
                        &json!({
                            "connected": false,
                            "status": "disconnected",
                            "reason": reason,
                            "timestamp": chrono::Utc::now().timestamp_millis()
                        }),
                    ) {
                        tracing::warn!(
                            "Failed to emit extension:connection-status (disconnected): {}",
                            e
                        );
                    }
                }

                Ok(json!({
                    "disconnected": true,
                    "reason": reason
                }))
            }

            NativeMessage::GetTabs => {
                let app = app_handle.ok_or_else(|| "Desktop app handle unavailable".to_string())?;
                let browser_state = app.state::<BrowserStateWrapper>();
                let tab_manager = browser_state
                    .get_tab_manager()
                    .map_err(|e| format!("Browser state unavailable: {}", e))?;
                let tab_manager = tab_manager.lock().await;
                let active_tab_id = tab_manager
                    .get_active_tab()
                    .await
                    .map_err(|e| e.to_string())?
                    .map(|tab| tab.id);
                let tabs = tab_manager.list_tabs().await.map_err(|e| e.to_string())?;

                let tab_payload = tabs
                    .into_iter()
                    .map(|tab| {
                        json!({
                            "id": tab.id,
                            "url": tab.url,
                            "title": tab.title,
                            "active": active_tab_id.as_ref() == Some(&tab.id),
                            "favicon_url": tab.favicon,
                            "status": if tab.loading { "loading" } else { "complete" }
                        })
                    })
                    .collect::<Vec<_>>();

                Ok(json!({ "tabs": tab_payload }))
            }

            NativeMessage::GetActiveTab => {
                let app = app_handle.ok_or_else(|| "Desktop app handle unavailable".to_string())?;
                let browser_state = app.state::<BrowserStateWrapper>();
                let tab_manager = browser_state
                    .get_tab_manager()
                    .map_err(|e| format!("Browser state unavailable: {}", e))?;
                let tab_manager = tab_manager.lock().await;
                let tab = tab_manager
                    .get_active_tab()
                    .await
                    .map_err(|e| e.to_string())?;

                Ok(json!({
                    "active_tab": tab
                }))
            }

            NativeMessage::CreateTab { url } => {
                let app = app_handle.ok_or_else(|| "Desktop app handle unavailable".to_string())?;
                let browser_state = app.state::<BrowserStateWrapper>();
                let tab_manager = browser_state
                    .get_tab_manager()
                    .map_err(|e| format!("Browser state unavailable: {}", e))?;
                let tab_id = tab_manager
                    .lock()
                    .await
                    .open_tab(&url)
                    .await
                    .map_err(|e| e.to_string())?;

                Ok(json!({
                    "created": true,
                    "tab_id": tab_id,
                    "url": url
                }))
            }

            NativeMessage::CloseTab { tab_id } => {
                let app = app_handle.ok_or_else(|| "Desktop app handle unavailable".to_string())?;
                let browser_state = app.state::<BrowserStateWrapper>();
                let tab_manager = browser_state
                    .get_tab_manager()
                    .map_err(|e| format!("Browser state unavailable: {}", e))?;
                tab_manager
                    .lock()
                    .await
                    .close_tab(&tab_id.to_string())
                    .await
                    .map_err(|e| e.to_string())?;

                Ok(json!({
                    "closed": true,
                    "tab_id": tab_id
                }))
            }

            NativeMessage::SwitchTab { tab_id } => {
                let app = app_handle.ok_or_else(|| "Desktop app handle unavailable".to_string())?;
                let browser_state = app.state::<BrowserStateWrapper>();
                let tab_manager = browser_state
                    .get_tab_manager()
                    .map_err(|e| format!("Browser state unavailable: {}", e))?;
                tab_manager
                    .lock()
                    .await
                    .switch_to_tab(&tab_id.to_string())
                    .await
                    .map_err(|e| e.to_string())?;

                Ok(json!({
                    "switched": true,
                    "tab_id": tab_id
                }))
            }

            NativeMessage::Navigate { url, tab_id } => {
                let app = app_handle.ok_or_else(|| "Desktop app handle unavailable".to_string())?;
                let (client, resolved_tab_id) =
                    Self::get_native_cdp_client(app, tab_id, true, Some(&url)).await?;
                client.navigate(&url).await.map_err(|e| e.to_string())?;

                Ok(json!({
                    "navigated": true,
                    "tab_id": resolved_tab_id,
                    "url": url
                }))
            }

            NativeMessage::Click { selector, tab_id } => {
                let app = app_handle.ok_or_else(|| "Desktop app handle unavailable".to_string())?;
                let (client, resolved_tab_id) =
                    Self::get_native_cdp_client(app, tab_id, false, None).await?;
                client
                    .click_element(&selector)
                    .await
                    .map_err(|e| e.to_string())?;

                Ok(json!({
                    "clicked": true,
                    "tab_id": resolved_tab_id,
                    "selector": selector
                }))
            }

            NativeMessage::Type {
                selector,
                text,
                tab_id,
            } => {
                let app = app_handle.ok_or_else(|| "Desktop app handle unavailable".to_string())?;
                let (client, resolved_tab_id) =
                    Self::get_native_cdp_client(app, tab_id, false, None).await?;
                client
                    .type_into_element(&selector, &text, false)
                    .await
                    .map_err(|e| e.to_string())?;

                Ok(json!({
                    "typed": true,
                    "tab_id": resolved_tab_id,
                    "selector": selector,
                    "chars": text.chars().count()
                }))
            }

            NativeMessage::GetElement { selector, tab_id } => {
                let app = app_handle.ok_or_else(|| "Desktop app handle unavailable".to_string())?;
                let (client, resolved_tab_id) =
                    Self::get_native_cdp_client(app, tab_id, false, None).await?;
                let script = format!(
                    r#"(function() {{
                        const el = document.querySelector('{}');
                        if (!el) return null;
                        return {{
                            tag_name: el.tagName.toLowerCase(),
                            id: el.id || null,
                            class_name: el.className || null,
                            text_content: (el.textContent || '').trim(),
                            inner_html: el.innerHTML || '',
                            outer_html: el.outerHTML || ''
                        }};
                    }})()"#,
                    selector.replace('\'', "\\'")
                );
                let element = client.evaluate(&script).await.map_err(|e| e.to_string())?;

                Ok(json!({
                    "tab_id": resolved_tab_id,
                    "selector": selector,
                    "element": element
                }))
            }

            NativeMessage::GetElements { selector, tab_id } => {
                let app = app_handle.ok_or_else(|| "Desktop app handle unavailable".to_string())?;
                let (client, resolved_tab_id) =
                    Self::get_native_cdp_client(app, tab_id, false, None).await?;
                let elements = client
                    .query_all(&selector)
                    .await
                    .map_err(|e| e.to_string())?;

                Ok(json!({
                    "tab_id": resolved_tab_id,
                    "selector": selector,
                    "elements": elements
                }))
            }

            NativeMessage::GetText { selector, tab_id } => {
                let app = app_handle.ok_or_else(|| "Desktop app handle unavailable".to_string())?;
                let (client, resolved_tab_id) =
                    Self::get_native_cdp_client(app, tab_id, false, None).await?;
                let text = client
                    .get_text(&selector)
                    .await
                    .map_err(|e| e.to_string())?;

                Ok(json!({
                    "tab_id": resolved_tab_id,
                    "selector": selector,
                    "text": text
                }))
            }

            NativeMessage::GetAttribute {
                selector,
                attribute,
                tab_id,
            } => {
                let app = app_handle.ok_or_else(|| "Desktop app handle unavailable".to_string())?;
                let (client, resolved_tab_id) =
                    Self::get_native_cdp_client(app, tab_id, false, None).await?;
                let value = client
                    .get_attribute(&selector, &attribute)
                    .await
                    .map_err(|e| e.to_string())?;

                Ok(json!({
                    "tab_id": resolved_tab_id,
                    "selector": selector,
                    "attribute": attribute,
                    "value": value
                }))
            }

            NativeMessage::SetAttribute {
                selector,
                attribute,
                value,
                tab_id,
            } => {
                let app = app_handle.ok_or_else(|| "Desktop app handle unavailable".to_string())?;
                let (client, resolved_tab_id) =
                    Self::get_native_cdp_client(app, tab_id, false, None).await?;

                // Escape values for safe interpolation into JS string literals.
                // JSON-encoding produces a quoted string with all special chars
                // properly escaped (backslash, quotes, newlines, etc.).
                let safe_selector = serde_json::to_string(&selector)
                    .map_err(|e| format!("Failed to encode selector: {}", e))?;
                let safe_attribute = serde_json::to_string(&attribute)
                    .map_err(|e| format!("Failed to encode attribute: {}", e))?;
                let safe_value = serde_json::to_string(&value)
                    .map_err(|e| format!("Failed to encode value: {}", e))?;

                let script = format!(
                    r#"(function() {{
                        const el = document.querySelector({});
                        if (!el) throw new Error('Element not found');
                        el.setAttribute({}, {});
                        return true;
                    }})()"#,
                    safe_selector, safe_attribute, safe_value
                );
                client.evaluate(&script).await.map_err(|e| e.to_string())?;

                Ok(json!({
                    "set": true,
                    "tab_id": resolved_tab_id,
                    "selector": selector,
                    "attribute": attribute
                }))
            }

            NativeMessage::Screenshot { tab_id, format } => {
                let app = app_handle.ok_or_else(|| "Desktop app handle unavailable".to_string())?;
                let (client, resolved_tab_id) =
                    Self::get_native_cdp_client(app, tab_id, false, None).await?;
                let image_bytes = client
                    .capture_screenshot(false)
                    .await
                    .map_err(|e| e.to_string())?;
                let requested_format = format.unwrap_or_else(|| "png".to_string());

                Ok(json!({
                    "tab_id": resolved_tab_id,
                    "format": requested_format,
                    "data": BASE64_STANDARD.encode(image_bytes)
                }))
            }

            NativeMessage::GetAccessibilityTree { tab_id } => {
                let app = app_handle.ok_or_else(|| "Desktop app handle unavailable".to_string())?;
                let (client, resolved_tab_id) =
                    Self::get_native_cdp_client(app, tab_id, false, None).await?;
                let tree = client
                    .evaluate(AccessibilityAnalyzer::get_accessibility_tree_script())
                    .await
                    .map_err(|e| e.to_string())?;

                Ok(json!({
                    "tab_id": resolved_tab_id,
                    "tree": tree
                }))
            }

            NativeMessage::GetFocusableElements { tab_id } => {
                let app = app_handle.ok_or_else(|| "Desktop app handle unavailable".to_string())?;
                let (client, resolved_tab_id) =
                    Self::get_native_cdp_client(app, tab_id, false, None).await?;
                let elements = client
                    .evaluate(
                        r#"(function() {
                            const nodes = document.querySelectorAll(
                                'a[href], button, input, textarea, select, [tabindex]:not([tabindex="-1"])'
                            );
                            return Array.from(nodes).map((el) => ({
                                tag: el.tagName.toLowerCase(),
                                id: el.id || null,
                                class_name: el.className || null,
                                text: (el.textContent || '').trim().slice(0, 200)
                            }));
                        })()"#,
                    )
                    .await
                    .map_err(|e| e.to_string())?;

                Ok(json!({
                    "tab_id": resolved_tab_id,
                    "elements": elements
                }))
            }

            NativeMessage::GetCookies { url } => {
                let app = app_handle.ok_or_else(|| "Desktop app handle unavailable".to_string())?;
                let (client, resolved_tab_id) =
                    Self::get_native_cdp_client(app, None, false, None).await?;
                let mut cookies = AdvancedBrowserOps::get_cookies(client)
                    .await
                    .map_err(|e| e.to_string())?;

                if let Some(target_url) = url {
                    let domain = target_url
                        .replace("https://", "")
                        .replace("http://", "")
                        .split('/')
                        .next()
                        .unwrap_or("")
                        .to_string();
                    cookies.retain(|cookie| cookie.domain.contains(&domain));
                }

                Ok(json!({
                    "tab_id": resolved_tab_id,
                    "cookies": cookies
                }))
            }

            NativeMessage::SetCookie { cookie } => {
                let app = app_handle.ok_or_else(|| "Desktop app handle unavailable".to_string())?;
                let (client, resolved_tab_id) =
                    Self::get_native_cdp_client(app, None, false, None).await?;
                let mapped_cookie = Cookie {
                    name: cookie.name,
                    value: cookie.value,
                    domain: cookie.domain.unwrap_or_default(),
                    path: cookie.path.unwrap_or_else(|| "/".to_string()),
                    secure: cookie.secure.unwrap_or(false),
                    http_only: cookie.http_only.unwrap_or(false),
                    same_site: None,
                };
                AdvancedBrowserOps::set_cookie(client, mapped_cookie)
                    .await
                    .map_err(|e| e.to_string())?;

                Ok(json!({
                    "set": true,
                    "tab_id": resolved_tab_id
                }))
            }

            NativeMessage::GetLocalStorage { key, tab_id } => {
                let app = app_handle.ok_or_else(|| "Desktop app handle unavailable".to_string())?;
                let (client, resolved_tab_id) =
                    Self::get_native_cdp_client(app, tab_id, false, None).await?;
                let data = if let Some(storage_key) = key {
                    let script = format!(
                        "window.localStorage.getItem('{}')",
                        storage_key.replace('\'', "\\'")
                    );
                    client.evaluate(&script).await.map_err(|e| e.to_string())?
                } else {
                    client
                        .evaluate(
                            r#"(function() {
                                const output = {};
                                for (let i = 0; i < localStorage.length; i++) {
                                    const key = localStorage.key(i);
                                    if (key !== null) {
                                        output[key] = localStorage.getItem(key);
                                    }
                                }
                                return output;
                            })()"#,
                        )
                        .await
                        .map_err(|e| e.to_string())?
                };

                Ok(json!({
                    "tab_id": resolved_tab_id,
                    "data": data
                }))
            }

            NativeMessage::SetLocalStorage { key, value, tab_id } => {
                let app = app_handle.ok_or_else(|| "Desktop app handle unavailable".to_string())?;
                let (client, resolved_tab_id) =
                    Self::get_native_cdp_client(app, tab_id, false, None).await?;
                let script = format!(
                    "window.localStorage.setItem('{}', '{}'); true;",
                    key.replace('\'', "\\'"),
                    value.replace('\'', "\\'")
                );
                client.evaluate(&script).await.map_err(|e| e.to_string())?;

                Ok(json!({
                    "set": true,
                    "tab_id": resolved_tab_id,
                    "key": key
                }))
            }

            NativeMessage::GetPageInfo { tab_id } => {
                let app = app_handle.ok_or_else(|| "Desktop app handle unavailable".to_string())?;
                let (client, resolved_tab_id) =
                    Self::get_native_cdp_client(app, tab_id, false, None).await?;
                let url = client.get_url().await.map_err(|e| e.to_string())?;
                let title = client.get_title().await.map_err(|e| e.to_string())?;

                Ok(json!({
                    "tab_id": resolved_tab_id,
                    "url": url,
                    "title": title
                }))
            }

            NativeMessage::GetPageContent { tab_id } => {
                let app = app_handle.ok_or_else(|| "Desktop app handle unavailable".to_string())?;
                let (client, resolved_tab_id) =
                    Self::get_native_cdp_client(app, tab_id, false, None).await?;
                let html = client.get_content().await.map_err(|e| e.to_string())?;

                Ok(json!({
                    "tab_id": resolved_tab_id,
                    "html": html
                }))
            }

            NativeMessage::PageContext {
                url,
                title,
                html,
                selected_text,
                tab_id,
                timestamp,
            } => {
                let app = app_handle.ok_or_else(|| "Desktop app handle unavailable".to_string())?;
                let tab_id_u32 = u32::try_from(tab_id)
                    .map_err(|_| format!("Invalid negative tab_id for page_context: {}", tab_id))?;

                let context = crate::sys::commands::extension::PageContext {
                    url,
                    title,
                    html,
                    selected_text,
                    tab_id: tab_id_u32,
                    timestamp,
                };
                let response =
                    crate::sys::commands::extension::process_page_context_event(context, app)
                        .await?;
                serde_json::to_value(response)
                    .map_err(|e| format!("Failed to serialize page_context response: {}", e))
            }

            NativeMessage::TaskResult {
                task_id,
                success,
                screenshot,
                result,
                error,
                actions_performed,
                duration,
            } => {
                let app = app_handle.ok_or_else(|| "Desktop app handle unavailable".to_string())?;
                let task_result = crate::sys::commands::extension::TaskResult {
                    task_id,
                    success,
                    screenshot,
                    result,
                    error,
                    actions_performed,
                    duration,
                };
                let response =
                    crate::sys::commands::extension::process_task_result_event(task_result, app)
                        .await?;
                serde_json::to_value(response)
                    .map_err(|e| format!("Failed to serialize task_result response: {}", e))
            }

            NativeMessage::SelectedTextQuery {
                selected_text,
                context_url,
                tab_id,
            } => {
                let app = app_handle.ok_or_else(|| "Desktop app handle unavailable".to_string())?;

                // Store the selected text in the latest page context so the LLM prompt
                // builder can include it when the user next sends a message.
                if let Ok(mut guard) = crate::sys::commands::extension::LATEST_PAGE_CONTEXT.lock() {
                    match *guard {
                        Some(ref mut ctx) => {
                            // If tab_id or context_url differ from stored context,
                            // clear stale title/html so they are not attributed to
                            // the wrong page.
                            if let Some(new_tab_id) = tab_id.and_then(|id| u32::try_from(id).ok()) {
                                if ctx.tab_id != new_tab_id {
                                    ctx.title.clear();
                                    ctx.html.clear();
                                    ctx.tab_id = new_tab_id;
                                }
                            }
                            if let Some(ref url) = context_url {
                                if ctx.url != *url {
                                    ctx.url = url.clone();
                                    ctx.title.clear();
                                    ctx.html.clear();
                                }
                            }
                            ctx.selected_text = Some(selected_text.clone());
                        }
                        None => {
                            let now_ms = std::time::SystemTime::now()
                                .duration_since(std::time::UNIX_EPOCH)
                                .map(|d| d.as_millis() as u64)
                                .unwrap_or(0);
                            *guard = Some(crate::sys::commands::extension::PageContext {
                                url: context_url.clone().unwrap_or_default(),
                                title: String::new(),
                                html: String::new(),
                                selected_text: Some(selected_text.clone()),
                                tab_id: tab_id.unwrap_or(0).max(0) as u32,
                                timestamp: now_ms,
                            });
                        }
                    }
                }

                // Emit a Tauri event so the frontend can open the chat and pre-fill context.
                let _ = app.emit(
                    "extension:selected_text_query",
                    &json!({
                        "text": selected_text,
                        "context_url": context_url,
                        "tab_id": tab_id,
                    }),
                );

                Ok(json!({ "success": true }))
            }

            NativeMessage::ExecuteScript { script, tab_id } => {
                let app = app_handle.ok_or_else(|| "Desktop app handle unavailable".to_string())?;
                let (client, resolved_tab_id) =
                    Self::get_native_cdp_client(app, tab_id, false, None).await?;
                let result = client.evaluate(&script).await.map_err(|e| e.to_string())?;

                Ok(json!({
                    "tab_id": resolved_tab_id,
                    "result": result
                }))
            }

            NativeMessage::Hover { selector, tab_id } => {
                let app = app_handle.ok_or_else(|| "Desktop app handle unavailable".to_string())?;
                let (client, resolved_tab_id) =
                    Self::get_native_cdp_client(app, tab_id, false, None).await?;
                client
                    .hover_element(&selector)
                    .await
                    .map_err(|e| e.to_string())?;

                Ok(json!({
                    "hovered": true,
                    "tab_id": resolved_tab_id,
                    "selector": selector
                }))
            }

            NativeMessage::WaitForSelector {
                selector,
                timeout_ms,
                tab_id,
            } => {
                let app = app_handle.ok_or_else(|| "Desktop app handle unavailable".to_string())?;
                let (client, resolved_tab_id) =
                    Self::get_native_cdp_client(app, tab_id, false, None).await?;
                let timeout = timeout_ms.unwrap_or(30_000);
                client
                    .wait_for_selector(&selector, timeout)
                    .await
                    .map_err(|e| e.to_string())?;

                Ok(json!({
                    "found": true,
                    "tab_id": resolved_tab_id,
                    "selector": selector
                }))
            }

            NativeMessage::SelectOption {
                selector,
                value,
                tab_id,
            } => {
                let app = app_handle.ok_or_else(|| "Desktop app handle unavailable".to_string())?;
                let (client, resolved_tab_id) =
                    Self::get_native_cdp_client(app, tab_id, false, None).await?;
                client
                    .select_option(&selector, &value)
                    .await
                    .map_err(|e| e.to_string())?;

                Ok(json!({
                    "selected": true,
                    "tab_id": resolved_tab_id,
                    "selector": selector,
                    "value": value
                }))
            }

            NativeMessage::SetChecked {
                selector,
                checked,
                tab_id,
            } => {
                let app = app_handle.ok_or_else(|| "Desktop app handle unavailable".to_string())?;
                let (client, resolved_tab_id) =
                    Self::get_native_cdp_client(app, tab_id, false, None).await?;
                client
                    .set_checked(&selector, checked)
                    .await
                    .map_err(|e| e.to_string())?;

                Ok(json!({
                    "checked": checked,
                    "tab_id": resolved_tab_id,
                    "selector": selector
                }))
            }

            NativeMessage::Focus { selector, tab_id } => {
                let app = app_handle.ok_or_else(|| "Desktop app handle unavailable".to_string())?;
                let (client, resolved_tab_id) =
                    Self::get_native_cdp_client(app, tab_id, false, None).await?;
                client
                    .focus_element(&selector)
                    .await
                    .map_err(|e| e.to_string())?;

                Ok(json!({
                    "focused": true,
                    "tab_id": resolved_tab_id,
                    "selector": selector
                }))
            }

            NativeMessage::ScrollIntoView { selector, tab_id } => {
                let app = app_handle.ok_or_else(|| "Desktop app handle unavailable".to_string())?;
                let (client, resolved_tab_id) =
                    Self::get_native_cdp_client(app, tab_id, false, None).await?;
                client
                    .scroll_into_view(&selector)
                    .await
                    .map_err(|e| e.to_string())?;

                Ok(json!({
                    "scrolled": true,
                    "tab_id": resolved_tab_id,
                    "selector": selector
                }))
            }

            NativeMessage::Response { .. } | NativeMessage::Pong => {
                Err("Unexpected native message type from extension".to_string())
            }
        }
    }

    async fn get_native_cdp_client(
        app_handle: &tauri::AppHandle,
        requested_tab_id: Option<i32>,
        allow_create: bool,
        initial_url: Option<&str>,
    ) -> Result<(Arc<CdpClient>, String), String> {
        let browser_state = app_handle.state::<BrowserStateWrapper>();
        let resolved_tab_id = if let Some(tab_id) = requested_tab_id {
            tab_id.to_string()
        } else {
            let tab_manager = browser_state
                .get_tab_manager()
                .map_err(|e| format!("Browser state unavailable: {}", e))?;
            let tab_manager = tab_manager.lock().await;
            let tabs = tab_manager.list_tabs().await.map_err(|e| e.to_string())?;

            if let Some(tab) = tabs.first() {
                tab.id.clone()
            } else if allow_create {
                let url = initial_url.unwrap_or("about:blank");
                tab_manager.open_tab(url).await.map_err(|e| e.to_string())?
            } else {
                return Err(
                    "No browser tabs available. Open a tab or provide a valid tab_id first."
                        .to_string(),
                );
            }
        };

        let cdp = browser_state
            .get_cdp_client_for_tab(&resolved_tab_id)
            .await
            .map_err(|e| {
                format!(
                    "Failed to connect to browser tab {}: {}",
                    resolved_tab_id, e
                )
            })?;

        Ok((cdp, resolved_tab_id))
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::net::{IpAddr, Ipv4Addr, SocketAddr};

    // ── E2: /pair endpoint tests ──────────────────────────────────────────────

    /// helper: send a raw HTTP request string to a bound TcpListener and collect
    /// the full response bytes.
    async fn send_http(listener_addr: SocketAddr, request: &str) -> Vec<u8> {
        use tokio::io::{AsyncReadExt, AsyncWriteExt};
        let mut client = tokio::net::TcpStream::connect(listener_addr).await.unwrap();
        client.write_all(request.as_bytes()).await.unwrap();
        client.shutdown().await.ok();
        let mut response = Vec::new();
        client.read_to_end(&mut response).await.unwrap();
        response
    }

    /// Spawn handle_http_pair on a fresh loopback listener; return (addr, pair_token_arc).
    async fn spawn_pair_handler() -> (SocketAddr, Arc<TokioRwLock<String>>) {
        let listener = tokio::net::TcpListener::bind("127.0.0.1:0").await.unwrap();
        let addr = listener.local_addr().unwrap();
        let pair_token: Arc<TokioRwLock<String>> = Arc::new(TokioRwLock::new(String::new()));
        let pair_token_clone = pair_token.clone();
        tokio::spawn(async move {
            let (stream, peer) = listener.accept().await.unwrap();
            RealtimeServer::handle_http_pair(stream, peer, pair_token_clone).await;
        });
        (addr, pair_token)
    }

    #[tokio::test]
    async fn pair_returns_200_with_token_and_fingerprint() {
        let (addr, pair_token) = spawn_pair_handler().await;
        let resp_bytes = send_http(addr, "POST /pair HTTP/1.1\r\nHost: 127.0.0.1\r\nContent-Length: 0\r\n\r\n").await;
        let resp = String::from_utf8_lossy(&resp_bytes);
        assert!(resp.starts_with("HTTP/1.1 200"), "expected 200, got: {resp}");
        let body_start = resp.find("\r\n\r\n").unwrap() + 4;
        let body: serde_json::Value = serde_json::from_str(&resp[body_start..]).unwrap();
        let token = body["token"].as_str().unwrap();
        let fingerprint = body["fingerprint"].as_str().unwrap();
        // token must be 64 hex chars (32 bytes)
        assert_eq!(token.len(), 64, "token should be 64 hex chars");
        assert!(token.chars().all(|c| c.is_ascii_hexdigit()));
        // fingerprint is first 8 chars of token
        assert_eq!(fingerprint, &token[..8]);
        // pair_token shared state updated
        assert_eq!(*pair_token.read().await, token);
    }

    #[tokio::test]
    async fn pair_token_has_correct_length() {
        let (addr, pair_token) = spawn_pair_handler().await;
        send_http(addr, "POST /pair HTTP/1.1\r\nHost: 127.0.0.1\r\nContent-Length: 0\r\n\r\n").await;
        let stored = pair_token.read().await.clone();
        // 32 bytes = 64 hex chars
        assert_eq!(stored.len(), 64);
    }

    #[tokio::test]
    async fn pair_fingerprint_is_first_8_chars_of_token() {
        let (addr, _pair_token) = spawn_pair_handler().await;
        let resp_bytes = send_http(addr, "POST /pair HTTP/1.1\r\nHost: 127.0.0.1\r\nContent-Length: 0\r\n\r\n").await;
        let resp = String::from_utf8_lossy(&resp_bytes);
        let body_start = resp.find("\r\n\r\n").unwrap() + 4;
        let body: serde_json::Value = serde_json::from_str(&resp[body_start..]).unwrap();
        let token = body["token"].as_str().unwrap();
        let fingerprint = body["fingerprint"].as_str().unwrap();
        assert_eq!(fingerprint.len(), 8);
        assert_eq!(fingerprint, &token[..8]);
    }

    #[tokio::test]
    async fn pair_idempotent_second_call_rotates_token() {
        // First call
        let (addr1, pair_token1) = spawn_pair_handler().await;
        let resp1 = send_http(addr1, "POST /pair HTTP/1.1\r\nHost: 127.0.0.1\r\nContent-Length: 0\r\n\r\n").await;
        let r1 = String::from_utf8_lossy(&resp1);
        let b1: serde_json::Value = serde_json::from_str(&r1[r1.find("\r\n\r\n").unwrap() + 4..]).unwrap();
        let token1 = b1["token"].as_str().unwrap().to_string();

        // Second call on a new handler sharing the same pair_token arc
        let listener2 = tokio::net::TcpListener::bind("127.0.0.1:0").await.unwrap();
        let addr2 = listener2.local_addr().unwrap();
        let pair_token2 = pair_token1.clone();
        tokio::spawn(async move {
            let (stream, peer) = listener2.accept().await.unwrap();
            RealtimeServer::handle_http_pair(stream, peer, pair_token2).await;
        });
        let resp2 = send_http(addr2, "POST /pair HTTP/1.1\r\nHost: 127.0.0.1\r\nContent-Length: 0\r\n\r\n").await;
        let r2 = String::from_utf8_lossy(&resp2);
        let b2: serde_json::Value = serde_json::from_str(&r2[r2.find("\r\n\r\n").unwrap() + 4..]).unwrap();
        let token2 = b2["token"].as_str().unwrap().to_string();

        // Both calls succeed (200) but tokens differ (rotation)
        assert!(r1.starts_with("HTTP/1.1 200"));
        assert!(r2.starts_with("HTTP/1.1 200"));
        assert_ne!(token1, token2, "second /pair call must rotate token");
        assert_eq!(*pair_token1.read().await, token2);
    }

    #[tokio::test]
    async fn pair_wrong_path_returns_404() {
        let (addr, _pair_token) = spawn_pair_handler().await;
        let resp_bytes = send_http(addr, "POST /wrong HTTP/1.1\r\nHost: 127.0.0.1\r\nContent-Length: 0\r\n\r\n").await;
        let resp = String::from_utf8_lossy(&resp_bytes);
        assert!(resp.starts_with("HTTP/1.1 404"), "expected 404, got: {resp}");
    }

    #[tokio::test]
    async fn pair_non_loopback_returns_403() {
        use tokio::io::{AsyncReadExt, AsyncWriteExt};
        // We can't bind a non-loopback address in tests, so we invoke
        // handle_http_pair directly with a fake peer address.
        let listener = tokio::net::TcpListener::bind("127.0.0.1:0").await.unwrap();
        let addr = listener.local_addr().unwrap();
        let pair_token: Arc<TokioRwLock<String>> = Arc::new(TokioRwLock::new(String::new()));
        let pair_token_clone = pair_token.clone();

        // Spawn the handler but inject a non-loopback peer address.
        tokio::spawn(async move {
            let (stream, _real_peer) = listener.accept().await.unwrap();
            let fake_peer = SocketAddr::new(IpAddr::V4(Ipv4Addr::new(192, 168, 1, 1)), 54321);
            RealtimeServer::handle_http_pair(stream, fake_peer, pair_token_clone).await;
        });

        let mut client = tokio::net::TcpStream::connect(addr).await.unwrap();
        client.write_all(b"POST /pair HTTP/1.1\r\nHost: 127.0.0.1\r\nContent-Length: 0\r\n\r\n").await.unwrap();
        client.shutdown().await.ok();
        let mut response = Vec::new();
        client.read_to_end(&mut response).await.unwrap();
        let resp = String::from_utf8_lossy(&response);
        assert!(resp.starts_with("HTTP/1.1 403"), "expected 403, got: {resp}");
        // pair_token must remain empty — no token issued
        assert!(pair_token.read().await.is_empty());
    }

    #[tokio::test]
    async fn pair_token_all_hex_chars() {
        let (addr, pair_token) = spawn_pair_handler().await;
        send_http(addr, "POST /pair HTTP/1.1\r\nHost: 127.0.0.1\r\nContent-Length: 0\r\n\r\n").await;
        let stored = pair_token.read().await.clone();
        assert!(!stored.is_empty());
        assert!(stored.chars().all(|c| c.is_ascii_hexdigit()), "token must be all hex");
    }

    #[tokio::test]
    async fn test_execute_native_message_ping() {
        let result = RealtimeServer::execute_native_message(json!({ "type": "ping" }), None).await;

        assert!(result.is_ok());
        assert_eq!(result.unwrap(), json!({ "pong": true }));
    }

    #[tokio::test]
    async fn test_execute_native_message_connect_without_app_handle() {
        let result = RealtimeServer::execute_native_message(
            json!({ "type": "connect", "extension_id": "ext_123" }),
            None,
        )
        .await;

        assert!(result.is_ok());
        let payload = result.unwrap_or_default();
        assert_eq!(payload.get("connected"), Some(&json!(true)));
        assert_eq!(payload.get("extension_id"), Some(&json!("ext_123")));
    }

    #[tokio::test]
    async fn test_execute_native_message_disconnect_without_app_handle() {
        let result = RealtimeServer::execute_native_message(
            json!({ "type": "disconnect", "reason": "test_disconnect" }),
            None,
        )
        .await;

        assert!(result.is_ok());
        let payload = result.unwrap_or_default();
        assert_eq!(payload.get("disconnected"), Some(&json!(true)));
        assert_eq!(payload.get("reason"), Some(&json!("test_disconnect")));
    }

    #[tokio::test]
    async fn test_execute_native_message_rejects_invalid_payload() {
        let result =
            RealtimeServer::execute_native_message(json!({ "type": "unknown_type" }), None).await;

        assert!(result.is_err());
        assert!(result
            .err()
            .unwrap_or_default()
            .contains("Invalid native message payload"));
    }

    #[tokio::test]
    async fn test_execute_native_message_page_context_requires_app_handle() {
        let result = RealtimeServer::execute_native_message(
            json!({
                "type": "page_context",
                "url": "https://example.com",
                "title": "Example",
                "html": "<html><body>ok</body></html>",
                "selected_text": "ok",
                "tab_id": 1,
                "timestamp": 1
            }),
            None,
        )
        .await;

        assert!(result.is_err());
        assert!(result
            .err()
            .unwrap_or_default()
            .contains("Desktop app handle unavailable"));
    }

    #[tokio::test]
    async fn test_execute_native_message_task_result_requires_app_handle() {
        let result = RealtimeServer::execute_native_message(
            json!({
                "type": "task_result",
                "task_id": "task-1",
                "success": true,
                "screenshot": null,
                "result": { "ok": true },
                "error": null,
                "actions_performed": 1,
                "duration": 12
            }),
            None,
        )
        .await;

        assert!(result.is_err());
        assert!(result
            .err()
            .unwrap_or_default()
            .contains("Desktop app handle unavailable"));
    }

    // ── B3 fix: Origin allowlist tests ──────────────────────────────────────
    //
    // The previous implementation used `origin.starts_with("http://localhost")`
    // which silently allowed `http://localhost.attacker.com`. These tests
    // pin the new exact-host behaviour so a future refactor cannot regress.

    #[test]
    fn origin_none_allowed_for_tauri_native() {
        assert!(is_origin_allowed(None));
    }

    #[test]
    fn origin_null_allowed_for_tauri_string() {
        assert!(is_origin_allowed(Some("null")));
    }

    #[test]
    fn origin_chrome_extension_allowed() {
        assert!(is_origin_allowed(Some(
            "chrome-extension://abcdefghijklmnopabcdefghijklmnop"
        )));
    }

    #[test]
    fn origin_vscode_webview_allowed() {
        assert!(is_origin_allowed(Some(
            "vscode-webview://12345678-1234-1234-1234-1234567890ab"
        )));
    }

    #[test]
    fn origin_vscode_file_allowed() {
        assert!(is_origin_allowed(Some("vscode-file://./foo")));
    }

    #[test]
    fn origin_localhost_with_port_allowed() {
        assert!(is_origin_allowed(Some("http://localhost:3000")));
    }

    #[test]
    fn origin_localhost_https_allowed() {
        assert!(is_origin_allowed(Some("https://localhost")));
    }

    #[test]
    fn origin_127_0_0_1_with_port_allowed() {
        assert!(is_origin_allowed(Some("http://127.0.0.1:8787")));
    }

    #[test]
    fn origin_ipv6_loopback_allowed() {
        assert!(is_origin_allowed(Some("http://[::1]:8080")));
    }

    #[test]
    fn origin_localhost_subdomain_attack_rejected() {
        // B3 regression test: prefix-match would have accepted this.
        assert!(!is_origin_allowed(Some("http://localhost.attacker.com")));
    }

    #[test]
    fn origin_127_0_0_1_subdomain_attack_rejected() {
        assert!(!is_origin_allowed(Some("http://127.0.0.1.attacker.com")));
    }

    #[test]
    fn origin_arbitrary_https_rejected() {
        assert!(!is_origin_allowed(Some("https://attacker.com")));
    }

    #[test]
    fn origin_arbitrary_http_rejected() {
        assert!(!is_origin_allowed(Some("http://evil.example.com")));
    }

    #[test]
    fn origin_unsupported_scheme_rejected() {
        assert!(!is_origin_allowed(Some("file:///etc/passwd")));
        assert!(!is_origin_allowed(Some("ftp://localhost")));
        assert!(!is_origin_allowed(Some("javascript:void(0)")));
    }

    #[test]
    fn origin_malformed_rejected() {
        assert!(!is_origin_allowed(Some("not-a-url")));
        assert!(!is_origin_allowed(Some("http://")));
        // Unclosed IPv6 bracket.
        assert!(!is_origin_allowed(Some("http://[::1")));
    }

    #[test]
    fn origin_localhost_no_port_allowed() {
        assert!(is_origin_allowed(Some("http://localhost")));
        assert!(is_origin_allowed(Some("http://127.0.0.1")));
        assert!(is_origin_allowed(Some("http://[::1]")));
    }
}
