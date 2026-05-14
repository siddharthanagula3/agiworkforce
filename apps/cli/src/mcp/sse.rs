//! SSE transport bringup (Sprint B1).
//!
//! Long-lived `GET <url>` with `Accept: text/event-stream` for
//! server→client frames; outbound JSON-RPC requests go via POST to either
//! the same URL or to a server-supplied `endpoint` hint.

use anyhow::{bail, Context, Result};
use futures_util::StreamExt;
use std::collections::HashMap;
use std::sync::{Arc, Mutex};
use std::time::Duration;
use tokio::sync::mpsc;

use super::{
    elicitation::AutoDeclineHandler, find_subsequence, McpConnection, McpServerConfig,
    McpTimeouts, McpTransportConn,
};

/// Connect to an SSE-based MCP server.
///
/// Opens a long-lived GET request to `url` with `Accept: text/event-stream`,
/// spawns a background task that parses SSE frames and forwards JSON-RPC
/// payloads through an mpsc channel, then runs the standard `initialize`
/// handshake.
///
/// SSE protocol detail: the official MCP "everything" server (and most
/// reference implementations) emit an `event: endpoint` message early in
/// the stream that carries the URL to POST outbound requests to. We honor
/// that hint when present; otherwise we POST back to the same URL.
pub(super) async fn connect_sse(
    name: &str,
    url: &str,
    headers: &HashMap<String, String>,
    timeouts: McpTimeouts,
    config: McpServerConfig,
) -> Result<McpConnection> {
    // Build the long-lived reqwest client. Do NOT set `.timeout()` here —
    // the SSE GET stays open indefinitely and any per-request cap kills it.
    // Per-call timeouts are applied via `tokio::time::timeout` in send_request.
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
        .context(format!("[{}] SSE GET failed", name))?;
    if !resp.status().is_success() {
        bail!("[{}] SSE server returned {}", name, resp.status());
    }

    let session_id = resp
        .headers()
        .get("Mcp-Session-Id")
        .and_then(|v| v.to_str().ok())
        .map(String::from);

    // Spawn a task that owns the stream and forwards parsed JSON-RPC frames
    // (and endpoint hints) through channels.
    let (tx, rx) = mpsc::channel::<serde_json::Value>(64);
    let (endpoint_tx, mut endpoint_rx) = mpsc::channel::<String>(1);
    let mut stream = resp.bytes_stream();
    let server_name = name.to_string();
    let base_url = url.to_string();
    tokio::spawn(async move {
        let mut buf: Vec<u8> = Vec::new();
        let mut current_event: Option<String> = None;
        while let Some(chunk) = stream.next().await {
            let chunk = match chunk {
                Ok(c) => c,
                Err(e) => {
                    eprintln!("[{}] SSE stream error: {}", server_name, e);
                    break;
                }
            };
            buf.extend_from_slice(&chunk);
            // SSE frames are separated by "\n\n"; data lines start with "data: ".
            while let Some(pos) = find_subsequence(&buf, b"\n\n") {
                let frame = buf.drain(..pos + 2).collect::<Vec<u8>>();
                let frame_str = String::from_utf8_lossy(&frame);
                let mut data_buf = String::new();
                for line in frame_str.lines() {
                    if let Some(rest) = line.strip_prefix("event:") {
                        current_event = Some(rest.trim().to_string());
                    } else if let Some(rest) = line.strip_prefix("data:") {
                        // SSE allows data fields to be split across multiple
                        // `data:` lines — concatenate with newlines per spec.
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
                        if tx.send(v).await.is_err() {
                            // Receiver dropped — connection closed.
                            return;
                        }
                    }
                    Err(e) => eprintln!(
                        "[{}] SSE: invalid JSON in data frame: {} (payload: {})",
                        server_name, e, data_buf
                    ),
                }
                current_event = None;
            }
        }
    });

    // Wait briefly for an endpoint hint. Most MCP SSE servers emit it
    // within a few hundred ms; if we time out, fall back to the original
    // URL for outbound POSTs.
    let post_url = match tokio::time::timeout(Duration::from_millis(500), endpoint_rx.recv()).await
    {
        Ok(Some(ep)) => ep,
        _ => url.to_string(),
    };

    let mut conn = McpConnection {
        server_name: name.to_string(),
        config,
        inner: McpTransportConn::Sse {
            post_url,
            headers: headers.clone(),
            client,
            rx,
            session_id,
        },
        request_id: 0,
        timeouts,
        stderr_buf: Arc::new(Mutex::new(Vec::new())),
        elicitation_handler: Arc::new(AutoDeclineHandler),
    };

    conn.initialize().await?;
    Ok(conn)
}

/// Resolve the SSE-supplied endpoint hint against the original SSE URL.
/// Hints may be absolute (`https://...`) or relative paths (`/messages?id=…`).
fn resolve_endpoint(base_url: &str, hint: &str) -> String {
    if hint.starts_with("http://") || hint.starts_with("https://") {
        return hint.to_string();
    }
    // Relative — resolve against base URL's origin.
    if let Ok(base) = reqwest::Url::parse(base_url) {
        if let Ok(joined) = base.join(hint) {
            return joined.into();
        }
    }
    // Fallback: return hint as-is. Server will reject if malformed.
    hint.to_string()
}
