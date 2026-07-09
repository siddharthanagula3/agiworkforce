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
    // Build the long-lived reqwest client. Do NOT set `.timeout()` here — the
    // SSE GET stays open indefinitely and any per-request cap kills it. Per-call
    // timeouts are applied via `tokio::time::timeout` in send_request.
    let client = reqwest::Client::builder()
        .build()
        .context("build reqwest client")?;

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

    let session_id = resp
        .headers()
        .get("Mcp-Session-Id")
        .and_then(|v| v.to_str().ok())
        .map(String::from);

    // Spawn a task that owns the stream and forwards parsed JSON-RPC frames (and
    // endpoint hints) through channels.
    let (tx, rx) = mpsc::channel::<serde_json::Value>(64);
    let (endpoint_tx, mut endpoint_rx) = mpsc::channel::<String>(1);
    let mut stream = resp.bytes_stream();
    let server_name = name.to_string();
    let base_url = url.to_string();
    let max_frame = timeouts.max_frame_bytes;
    tokio::spawn(async move {
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
                if current_event.as_deref() == Some("endpoint") {
                    let endpoint = resolve_endpoint(&base_url, data_buf.trim());
                    let _ = endpoint_tx.try_send(endpoint);
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
                            return;
                        }
                    }
                    Err(e) => {
                        eprintln!(
                            "[{server_name}] SSE: invalid JSON in data frame: {e} (payload: {data_buf})"
                        );
                        return;
                    }
                }
                current_event = None;
            }
        }
    });

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
