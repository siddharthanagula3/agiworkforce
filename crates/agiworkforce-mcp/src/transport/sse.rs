//! SSE transport bringup.
//!
//! Long-lived `GET <url>` with `Accept: text/event-stream` for server→client
//! frames; outbound JSON-RPC requests go via POST to either the same URL or to
//! a server-supplied `endpoint` hint.

use anyhow::{Context, Result, bail};
use futures_util::StreamExt;
use std::collections::HashMap;
use std::time::Duration;
use tokio::sync::mpsc;

use crate::client::TransportConn;
use crate::config::McpTimeouts;
use crate::jsonrpc::find_subsequence;
use crate::notification::McpNotification;

/// Open an SSE-based MCP transport and return the live [`TransportConn`].
///
/// Spawns a background task that parses SSE frames, forwards JSON-RPC payloads
/// through an mpsc channel (the request correlator drains it), and best-effort
/// forwards server *notifications* to `notif_tx`. The initialize handshake is
/// run by the caller ([`crate::client::McpClient::connect`]).
pub(crate) async fn connect(
    name: &str,
    url: &str,
    headers: &HashMap<String, String>,
    timeouts: McpTimeouts,
    notif_tx: mpsc::Sender<McpNotification>,
) -> Result<TransportConn> {
    if timeouts.validate_urls {
        crate::security::validate_server_url(url).with_context(|| format!("[{name}] SSE"))?;
    }
    refuse_cleartext_credentials(name, url, headers)?;
    let client = build_sse_client(url, &timeouts)?;

    let resp = open_sse_stream(name, &client, url, headers).await?;

    let session_id = resp
        .headers()
        .get("Mcp-Session-Id")
        .and_then(|v| v.to_str().ok())
        .map(String::from);

    // Spawn a task that owns the stream and forwards parsed JSON-RPC frames (and
    // endpoint hints) through channels.
    let (tx, rx) = mpsc::channel::<serde_json::Value>(64);
    let (endpoint_tx, mut endpoint_rx) = mpsc::channel::<String>(1);
    spawn_stream_drain(
        name,
        url,
        resp,
        timeouts.frame_cap(),
        tx,
        Some(endpoint_tx),
        notif_tx,
    );

    // Wait briefly for an endpoint hint. Most MCP SSE servers emit it within a
    // few hundred ms; on timeout, fall back to the original URL for POSTs.
    let post_url = match tokio::time::timeout(Duration::from_millis(500), endpoint_rx.recv()).await
    {
        Ok(Some(ep)) => ep,
        _ => url.to_string(),
    };

    Ok(TransportConn::Sse {
        post_url,
        headers: headers.clone(),
        client,
        rx,
        session_id,
    })
}

/// Open a legacy split-endpoint HTTP+SSE transport (the desktop remote MCP
/// convention): POST `{base}/message` for outbound requests; a best-effort
/// long-lived `GET {base}/sse` for server-initiated frames. When the GET fails
/// (servers without an SSE stream), the connection degrades to POST-only with
/// inline responses instead of failing bringup.
pub(crate) async fn connect_legacy(
    name: &str,
    base_url: &str,
    headers: &HashMap<String, String>,
    timeouts: McpTimeouts,
    notif_tx: mpsc::Sender<McpNotification>,
) -> Result<TransportConn> {
    if timeouts.validate_urls {
        crate::security::validate_server_url(base_url)
            .with_context(|| format!("[{name}] SSE-legacy"))?;
    }
    refuse_cleartext_credentials(name, base_url, headers)?;
    let client = build_sse_client(base_url, &timeouts)?;

    let base = base_url.trim_end_matches('/');
    let post_url = format!("{base}/message");
    let sse_url = format!("{base}/sse");

    let (tx, rx) = mpsc::channel::<serde_json::Value>(64);

    // Best-effort SSE listener with reconnect (desktop parity: up to 5
    // consecutive connect failures, linear 1s backoff, attempts reset after a
    // successful connect). Non-blocking, bringup never waits on the GET, and
    // servers without an SSE stream keep working POST-only. The supervisor
    // holds `tx` for the lifetime of the transport so the request correlator's
    // channel stays open even when no stream is attached.
    spawn_legacy_sse_supervisor(
        name,
        sse_url,
        headers.clone(),
        client.clone(),
        timeouts.frame_cap(),
        tx,
        notif_tx,
    );

    Ok(TransportConn::Sse {
        post_url,
        headers: headers.clone(),
        client,
        rx,
        session_id: None,
    })
}

/// Refuse to hand configured credentials to a cleartext connection. Loopback
/// stays exempt so local `http://` dev MCP servers keep working; every other
/// host must be reached over HTTPS before an `Authorization`/API-key header the
/// host configured is attached to a GET or a POST. Headers that carry no secret
/// do not gate bringup, see [`super::http::headers_carry_credentials`].
fn refuse_cleartext_credentials(
    name: &str,
    url: &str,
    headers: &HashMap<String, String>,
) -> Result<()> {
    if !super::http::headers_carry_credentials(headers) {
        return Ok(());
    }
    crate::security::enforce_https_for_remote(url)
        .with_context(|| format!("[{name}] refusing to send configured MCP headers in cleartext"))
}

/// Reconnect cap for the legacy SSE listener: consecutive connect failures
/// before giving up (desktop parity).
const LEGACY_SSE_MAX_RECONNECT_ATTEMPTS: u32 = 5;

/// Base backoff between legacy SSE reconnect attempts; multiplied by the
/// consecutive-failure count (desktop parity).
const LEGACY_SSE_RECONNECT_DELAY_MS: u64 = 1000;

/// Supervise the legacy `GET {base}/sse` listener: connect, drain until the
/// stream drops, reconnect with linear backoff, and give up after
/// [`LEGACY_SSE_MAX_RECONNECT_ATTEMPTS`] consecutive connect failures. On
/// give-up the task parks holding `tx` so POST-only operation continues.
fn spawn_legacy_sse_supervisor(
    name: &str,
    sse_url: String,
    headers: HashMap<String, String>,
    client: reqwest::Client,
    max_frame: usize,
    tx: mpsc::Sender<serde_json::Value>,
    notif_tx: mpsc::Sender<McpNotification>,
) {
    let server_name = name.to_string();
    tokio::spawn(async move {
        // Desktop parity (connect_sse): the SSE GET refuses cleartext HTTP to
        // non-localhost hosts so credentials cannot transit a network
        // unencrypted. POSTs are unaffected (they matched desktop's POST path,
        // which had no such check), the transport degrades to POST-only.
        if let Err(e) = crate::security::enforce_https_for_remote(&sse_url) {
            eprintln!("[{server_name}] SSE-legacy: {e:#}; continuing POST-only (no SSE listener)");
            std::future::pending::<()>().await;
        }
        let mut attempts: u32 = 0;
        while attempts < LEGACY_SSE_MAX_RECONNECT_ATTEMPTS {
            match open_sse_stream(&server_name, &client, &sse_url, &headers).await {
                Ok(resp) => {
                    attempts = 0;
                    let outcome = drain_stream(
                        &server_name,
                        &sse_url,
                        resp,
                        max_frame,
                        &tx,
                        None,
                        &notif_tx,
                    )
                    .await;
                    if matches!(outcome, DrainOutcome::ReceiverClosed) {
                        // Transport dropped, exit for good.
                        return;
                    }
                    eprintln!("[{server_name}] SSE-legacy: stream ended; reconnecting");
                }
                Err(e) => {
                    attempts += 1;
                    eprintln!(
                        "[{server_name}] SSE-legacy: GET {sse_url} failed ({e:#}) \
                         (attempt {attempts}/{LEGACY_SSE_MAX_RECONNECT_ATTEMPTS})"
                    );
                }
            }
            if tx.is_closed() {
                return;
            }
            if attempts < LEGACY_SSE_MAX_RECONNECT_ATTEMPTS {
                tokio::time::sleep(Duration::from_millis(
                    LEGACY_SSE_RECONNECT_DELAY_MS * u64::from(attempts.max(1)),
                ))
                .await;
            }
        }
        eprintln!("[{server_name}] SSE-legacy: reconnection limit reached; continuing POST-only");
        // Park holding `tx` so the correlator channel stays open (POST-only).
        std::future::pending::<()>().await;
    });
}

/// Build the long-lived reqwest client for SSE transports. Do NOT set
/// `.timeout()` here, the SSE GET stays open indefinitely and any per-request
/// cap kills it. Per-call timeouts are applied via `tokio::time::timeout` in
/// send_request.
fn build_sse_client(url: &str, timeouts: &McpTimeouts) -> Result<reqwest::Client> {
    // This one client carries the SSE GET *and* every JSON-RPC POST, so the
    // redirect pin has to be here: an unpinned client would hand a
    // `307 Location: http://attacker.example/` the replayed request body and
    // the configured credential headers, whatever the endpoint-hint and
    // cleartext checks decided about the URL we asked for.
    let mut builder = reqwest::Client::builder().redirect(super::http::pinned_redirect_policy(url));
    // Takes the url so the policy is enforced HERE, beside the dangerous call,
    // rather than at each caller where a new one could forget it. Release
    // builds refuse this outright; debug builds allow loopback only.
    crate::security::enforce_tls_verification_policy(url, timeouts.verify_tls)?;
    // The policy above already bails in release, so this is unreachable there.
    // Gating the call site as well keeps `danger_accept_invalid_certs` out of
    // the release binary entirely, so the guarantee survives someone later
    // dropping the policy call, and it is what `rust/disabled-certificate-check`
    // flagged, since the query cannot see the early-return guard.
    #[cfg(debug_assertions)]
    if !timeouts.verify_tls {
        builder = builder.danger_accept_invalid_certs(true);
    }
    if let Some(ct) = timeouts.connect_timeout {
        builder = builder.connect_timeout(ct);
    }
    if let Some(rt) = timeouts.sse_read_timeout {
        builder = builder.read_timeout(rt);
    }
    builder.build().context("build reqwest client")
}

/// Issue the long-lived SSE GET and validate the response status.
async fn open_sse_stream(
    name: &str,
    client: &reqwest::Client,
    url: &str,
    headers: &HashMap<String, String>,
) -> Result<reqwest::Response> {
    let mut req = client.get(url);
    for (k, v) in headers {
        req = req.header(k, v);
    }
    req = req.header("Accept", "text/event-stream");

    let resp = req
        .send()
        .await
        .with_context(|| format!("[{name}] SSE GET failed"))?;
    if !resp.status().is_success() {
        bail!("[{name}] SSE server returned {}", resp.status());
    }
    Ok(resp)
}

/// Why a drain stopped, decides whether a legacy supervisor reconnects.
enum DrainOutcome {
    /// The frame receiver was dropped: the transport is gone; do not reconnect.
    ReceiverClosed,
    /// The stream errored/ended (or hit the frame cap / bad JSON): the legacy
    /// supervisor may reconnect.
    StreamEnded,
}

/// Spawn the task that owns the SSE byte stream and forwards parsed JSON-RPC
/// frames (and, when `endpoint_tx` is supplied, `event: endpoint` hints)
/// through channels. Single-shot (CLI streamable-SSE parity: no stream-level
/// reconnect); the legacy convention layers its own reconnect supervisor.
fn spawn_stream_drain(
    name: &str,
    url: &str,
    resp: reqwest::Response,
    max_frame: usize,
    tx: mpsc::Sender<serde_json::Value>,
    endpoint_tx: Option<mpsc::Sender<String>>,
    notif_tx: mpsc::Sender<McpNotification>,
) {
    let server_name = name.to_string();
    let base_url = url.to_string();
    tokio::spawn(async move {
        let _ = drain_stream(
            &server_name,
            &base_url,
            resp,
            max_frame,
            &tx,
            endpoint_tx.as_ref(),
            &notif_tx,
        )
        .await;
    });
}

/// Own the SSE byte stream until it ends, forwarding parsed frames. Returns
/// why it stopped so a caller can decide whether to reconnect.
async fn drain_stream(
    server_name: &str,
    base_url: &str,
    resp: reqwest::Response,
    max_frame: usize,
    tx: &mpsc::Sender<serde_json::Value>,
    endpoint_tx: Option<&mpsc::Sender<String>>,
    notif_tx: &mpsc::Sender<McpNotification>,
) -> DrainOutcome {
    let mut stream = resp.bytes_stream();
    {
        let mut buf: Vec<u8> = Vec::new();
        let mut current_event: Option<String> = None;
        while let Some(chunk) = stream.next().await {
            let chunk = match chunk {
                Ok(c) => c,
                Err(e) => {
                    eprintln!("[{server_name}] SSE stream error: {e}");
                    break;
                }
            };
            buf.extend_from_slice(&chunk);
            // The bytes come from the remote server, so this cap is not
            // optional: without a frame boundary the buffer would grow until
            // the host process dies.
            if buf.len() > max_frame && find_subsequence(&buf, b"\n\n").is_none() {
                eprintln!("[{server_name}] SSE frame exceeded {max_frame} bytes; closing stream");
                break;
            }
            // SSE frames are separated by "\n\n"; data lines start with "data: ".
            while let Some(pos) = find_subsequence(&buf, b"\n\n") {
                let frame = buf.drain(..pos + 2).collect::<Vec<u8>>();
                let frame_str = String::from_utf8_lossy(&frame);
                let mut data_buf = String::new();
                for line in frame_str.lines() {
                    if let Some(rest) = line.strip_prefix("event:") {
                        current_event = Some(rest.trim().to_string());
                    } else if let Some(rest) = line.strip_prefix("data:") {
                        // SSE allows data fields split across multiple `data:`
                        // lines, concatenate with newlines per spec.
                        if !data_buf.is_empty() {
                            data_buf.push('\n');
                        }
                        data_buf.push_str(rest.strip_prefix(' ').unwrap_or(rest));
                    }
                    // id:, retry:, comments (`:`-prefixed) are ignored.
                }
                if data_buf.is_empty() {
                    current_event = None;
                    continue;
                }
                // Handle endpoint hints from the server (MCP "everything"
                // server pattern: `event: endpoint\ndata: /messages?...`).
                // Legacy split-endpoint connections pass no `endpoint_tx`.
                // their POST endpoint is fixed at `{base}/message`.
                if current_event.as_deref() == Some("endpoint") {
                    if let Some(ep_tx) = endpoint_tx {
                        match resolve_endpoint(base_url, data_buf.trim()) {
                            Ok(endpoint) => {
                                let _ = ep_tx.try_send(endpoint);
                            }
                            Err(e) => {
                                eprintln!(
                                    "[{server_name}] SSE: ignoring endpoint hint: {e:#}; POSTing to {base_url}"
                                );
                            }
                        }
                    }
                    current_event = None;
                    continue;
                }
                match serde_json::from_str::<serde_json::Value>(&data_buf) {
                    Ok(v) => {
                        // Best-effort: surface true server notifications
                        // (method present, no id) out-of-band. Never blocks the
                        // drain, a full/absent receiver just drops the notice.
                        if v.get("method").is_some() && v.get("id").is_none() {
                            if let Some(method) =
                                v.get("method").and_then(|m| m.as_str()).map(String::from)
                            {
                                let params =
                                    v.get("params").cloned().unwrap_or(serde_json::Value::Null);
                                let _ = notif_tx.try_send(McpNotification { method, params });
                            }
                        }
                        if tx.send(v).await.is_err() {
                            // Receiver dropped, connection closed.
                            return DrainOutcome::ReceiverClosed;
                        }
                    }
                    Err(e) => {
                        eprintln!(
                            "[{server_name}] SSE: invalid JSON in data frame: {e} (payload: {data_buf})"
                        );
                        return DrainOutcome::StreamEnded;
                    }
                }
                current_event = None;
            }
        }
    }
    DrainOutcome::StreamEnded
}

/// Resolve the SSE-supplied endpoint hint against the original SSE URL. Hints
/// may be absolute (`https://...`) or relative paths (`/messages?id=…`).
///
/// The hint is chosen by the remote server, and every later JSON-RPC POST.
/// carrying the credential headers the host configured for *this* server, goes
/// to whatever it names. So it is resolved against the configured URL and then
/// held to that origin: a cross-origin hint (absolute, or a protocol-relative
/// `//other.host/path` that `join` would honor) is refused, and the caller
/// keeps POSTing to the URL the user configured.
fn resolve_endpoint(base_url: &str, hint: &str) -> Result<String> {
    let base = reqwest::Url::parse(base_url)
        .with_context(|| format!("parse SSE base URL '{base_url}'"))?;
    let resolved = base
        .join(hint)
        .with_context(|| format!("resolve SSE endpoint hint '{hint}'"))?;
    crate::security::enforce_same_origin(base_url, resolved.as_str(), "SSE endpoint hint")?;
    Ok(resolved.into())
}

#[cfg(test)]
mod tests {
    use super::*;

    const BASE: &str = "https://legit-mcp.example.com/sse";

    #[test]
    fn relative_hint_resolves_against_the_configured_url() {
        assert_eq!(
            resolve_endpoint(BASE, "/messages?sessionId=42").unwrap(),
            "https://legit-mcp.example.com/messages?sessionId=42"
        );
    }

    #[test]
    fn same_origin_absolute_hint_is_kept() {
        assert_eq!(
            resolve_endpoint(BASE, "https://legit-mcp.example.com/messages").unwrap(),
            "https://legit-mcp.example.com/messages"
        );
    }

    #[test]
    fn cross_origin_absolute_hint_is_refused() {
        let err = resolve_endpoint(BASE, "https://attacker.example/collect")
            .expect_err("cross-origin endpoint hint must be refused");
        assert!(
            format!("{err:#}").contains("does not match the pinned origin"),
            "{err:#}"
        );
    }

    #[test]
    fn protocol_relative_hint_is_refused() {
        let err = resolve_endpoint(BASE, "//attacker.example/collect")
            .expect_err("protocol-relative endpoint hint must be refused");
        assert!(
            format!("{err:#}").contains("does not match the pinned origin"),
            "{err:#}"
        );
    }

    #[test]
    fn downgraded_and_offport_hints_are_refused() {
        assert!(resolve_endpoint(BASE, "http://legit-mcp.example.com/messages").is_err());
        assert!(resolve_endpoint(BASE, "https://legit-mcp.example.com:8443/messages").is_err());
        assert!(resolve_endpoint(BASE, "file:///etc/passwd").is_err());
    }

    #[test]
    fn loopback_dev_server_hint_still_works() {
        assert_eq!(
            resolve_endpoint(
                "http://127.0.0.1:3000/sse",
                "http://127.0.0.1:3000/messages"
            )
            .unwrap(),
            "http://127.0.0.1:3000/messages"
        );
    }

    #[test]
    fn credential_headers_are_refused_over_cleartext_to_a_remote_host() {
        let creds = HashMap::from([("Authorization".to_string(), "Bearer s3cret".to_string())]);
        assert!(refuse_cleartext_credentials("t", "http://mcp.example.com/sse", &creds).is_err());
        assert!(refuse_cleartext_credentials("t", "https://mcp.example.com/sse", &creds).is_ok());
        assert!(refuse_cleartext_credentials("t", "http://127.0.0.1:3000/sse", &creds).is_ok());
        assert!(
            refuse_cleartext_credentials("t", "http://mcp.example.com/sse", &HashMap::new())
                .is_ok()
        );
    }

    #[test]
    fn a_benign_header_does_not_block_a_cleartext_lan_server() {
        let benign = HashMap::from([("X-Client".to_string(), "agi".to_string())]);
        assert!(refuse_cleartext_credentials("t", "http://192.168.1.5:3000/sse", &benign).is_ok());
        let key = HashMap::from([("X-Api-Key".to_string(), "s3cret".to_string())]);
        assert!(refuse_cleartext_credentials("t", "http://192.168.1.5:3000/sse", &key).is_err());
    }

    #[tokio::test]
    async fn cross_origin_redirect_on_a_credentialed_post_is_refused() {
        let (collector, hits) = crate::transport::http::raw_http::spawn_collector().await;
        let server = crate::transport::http::raw_http::spawn_scripted(vec![format!(
            "HTTP/1.1 307 Temporary Redirect\r\nLocation: http://{collector}/collect\r\nContent-Length: 0\r\n\r\n"
        )])
        .await;

        let url = format!("http://{server}/sse");
        let client = build_sse_client(&url, &McpTimeouts::default()).expect("build sse client");

        let result = client
            .post(&url)
            .header("X-Api-Key", "STATIC_API_KEY")
            .json(&serde_json::json!({"jsonrpc": "2.0", "id": 1, "method": "tools/call"}))
            .send()
            .await;

        let seen = hits.lock().expect("collector lock").clone();
        assert!(seen.is_empty(), "attacker origin was contacted: {seen:?}");
        let err = result.expect_err("a cross-origin redirect must not be followed");
        assert!(err.is_redirect(), "{err}");
    }

    #[tokio::test]
    async fn same_origin_redirect_on_the_sse_client_is_followed() {
        let server = crate::transport::http::raw_http::spawn_scripted(vec![
            "HTTP/1.1 307 Temporary Redirect\r\nLocation: /message\r\nContent-Length: 0\r\n\r\n"
                .to_string(),
            "HTTP/1.1 200 OK\r\nContent-Type: application/json\r\nContent-Length: 2\r\n\r\n{}"
                .to_string(),
        ])
        .await;

        let url = format!("http://{server}/sse");
        let client = build_sse_client(&url, &McpTimeouts::default()).expect("build sse client");

        let resp = client
            .post(&url)
            .json(&serde_json::json!({"jsonrpc": "2.0", "id": 1, "method": "tools/call"}))
            .send()
            .await
            .expect("a same-origin redirect must still be followed");
        assert!(resp.status().is_success(), "{}", resp.status());
        assert!(resp.url().path().ends_with("/message"), "{}", resp.url());
    }
}
