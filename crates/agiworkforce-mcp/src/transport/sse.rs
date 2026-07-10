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
    let client = build_sse_client(&timeouts)?;

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
        timeouts.max_frame_bytes,
        tx,
        Some(endpoint_tx),
        notif_tx,
    );

    // Wait briefly for an endpoint hint. Most MCP SSE servers emit it within a
    // few hundred ms; on timeout, fall back to the original URL for POSTs.
    let post_url = match tokio::time::timeout(Duration::from_millis(500), endpoint_rx.recv()).await {
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
    let client = build_sse_client(&timeouts)?;

    let base = base_url.trim_end_matches('/');
    let post_url = format!("{base}/message");
    let sse_url = format!("{base}/sse");

    let (tx, rx) = mpsc::channel::<serde_json::Value>(64);

    // Best-effort SSE listener with reconnect (desktop parity: up to 5
    // consecutive connect failures, linear 1s backoff, attempts reset after a
    // successful connect). Non-blocking — bringup never waits on the GET, and
    // servers without an SSE stream keep working POST-only. The supervisor
    // holds `tx` for the lifetime of the transport so the request correlator's
    // channel stays open even when no stream is attached.
    spawn_legacy_sse_supervisor(
        name,
        sse_url,
        headers.clone(),
        client.clone(),
        timeouts.max_frame_bytes,
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
    max_frame: Option<usize>,
    tx: mpsc::Sender<serde_json::Value>,
    notif_tx: mpsc::Sender<McpNotification>,
) {
    let server_name = name.to_string();
    tokio::spawn(async move {
        // Desktop parity (connect_sse): the SSE GET refuses cleartext HTTP to
        // non-localhost hosts so credentials cannot transit a network
        // unencrypted. POSTs are unaffected (they matched desktop's POST path,
        // which had no such check) — the transport degrades to POST-only.
        if let Err(e) = crate::security::enforce_https_for_remote(&sse_url) {
            eprintln!(
                "[{server_name}] SSE-legacy: {e:#}; continuing POST-only (no SSE listener)"
            );
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
                        // Transport dropped — exit for good.
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
        eprintln!(
            "[{server_name}] SSE-legacy: reconnection limit reached; continuing POST-only"
        );
        // Park holding `tx` so the correlator channel stays open (POST-only).
        std::future::pending::<()>().await;
    });
}

/// Build the long-lived reqwest client for SSE transports. Do NOT set
/// `.timeout()` here — the SSE GET stays open indefinitely and any per-request
/// cap kills it. Per-call timeouts are applied via `tokio::time::timeout` in
/// send_request.
fn build_sse_client(timeouts: &McpTimeouts) -> Result<reqwest::Client> {
    let mut builder = reqwest::Client::builder();
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

/// Why a drain stopped — decides whether a legacy supervisor reconnects.
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
    max_frame: Option<usize>,
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
    max_frame: Option<usize>,
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
            // Optional hardening: reject a single unbounded frame instead of
            // growing the buffer without limit. Off by default (CLI parity).
            if let Some(cap) = max_frame {
                if buf.len() > cap && find_subsequence(&buf, b"\n\n").is_none() {
                    eprintln!("[{server_name}] SSE frame exceeded {cap} bytes; closing stream");
                    break;
                }
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
                        // lines — concatenate with newlines per spec.
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
                // Legacy split-endpoint connections pass no `endpoint_tx` —
                // their POST endpoint is fixed at `{base}/message`.
                if current_event.as_deref() == Some("endpoint") {
                    if let Some(ep_tx) = endpoint_tx {
                        let endpoint = resolve_endpoint(base_url, data_buf.trim());
                        let _ = ep_tx.try_send(endpoint);
                    }
                    current_event = None;
                    continue;
                }
                match serde_json::from_str::<serde_json::Value>(&data_buf) {
                    Ok(v) => {
                        // Best-effort: surface true server notifications
                        // (method present, no id) out-of-band. Never blocks the
                        // drain — a full/absent receiver just drops the notice.
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
                            // Receiver dropped — connection closed.
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
fn resolve_endpoint(base_url: &str, hint: &str) -> String {
    if hint.starts_with("http://") || hint.starts_with("https://") {
        return hint.to_string();
    }
    if let Ok(base) = reqwest::Url::parse(base_url) {
        if let Ok(joined) = base.join(hint) {
            return joined.into();
        }
    }
    hint.to_string()
}
