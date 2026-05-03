//! Streamable HTTP transport bringup (Sprint B2 — MCP 2025-06-18 spec).
//!
//! POST per request, response is either an inline JSON-RPC body or an
//! SSE-upgrade stream of frames. An optional GET to the same URL with
//! `Accept: text/event-stream` subscribes to server→client notifications.
//! `Mcp-Session-Id` is captured from every response and echoed on every
//! subsequent request for sticky session affinity.

use anyhow::{bail, Context, Result};
use futures_util::StreamExt;
use std::collections::HashMap;
use std::time::Duration;
use tokio::sync::mpsc;

use super::{
    extract_matching_response, find_subsequence, JsonRpcRequest, McpConnection, McpServerConfig,
    McpTimeouts, McpTransportConn,
};

/// Connect to a Streamable-HTTP MCP server.
///
/// The connect step does two things:
///   1. Optimistically attempts a `GET <url>` with `Accept: text/event-stream`
///      to subscribe to the server-pushed notification channel. Many servers
///      only accept POST and respond 405 — that's expected; we silently fall
///      back to pure request/response.
///   2. Builds the `McpConnection` and runs the standard `initialize`
///      handshake (which goes through `send_request` → POST).
///
/// Sticky `Mcp-Session-Id` capture happens inside `send_request_http` on
/// every response, so even if the GET attempt failed the session id from
/// the first POST response will populate.
pub(super) async fn connect_http(
    name: &str,
    url: &str,
    headers: &HashMap<String, String>,
    timeouts: McpTimeouts,
    config: McpServerConfig,
) -> Result<McpConnection> {
    // No global `.timeout()` on the client — POSTs are wrapped per-call,
    // and the optional GET stream is long-lived.
    let client = reqwest::Client::builder()
        .build()
        .context("build reqwest client")?;

    let mut notification_rx: Option<mpsc::Receiver<serde_json::Value>> = None;
    let mut session_id: Option<String> = None;

    // Step 1: optimistic GET for the notification stream. Failures here are
    // non-fatal — they just mean we run in pure request/response mode.
    let mut get_req = client.get(url);
    for (k, v) in headers {
        get_req = get_req.header(k, v);
    }
    get_req = get_req.header("Accept", "text/event-stream");

    match get_req.send().await {
        Ok(resp) if resp.status().is_success() => {
            session_id = resp
                .headers()
                .get("Mcp-Session-Id")
                .and_then(|v| v.to_str().ok())
                .map(String::from);

            let (tx, rx) = mpsc::channel::<serde_json::Value>(64);
            let mut stream = resp.bytes_stream();
            let server_name = name.to_string();
            tokio::spawn(async move {
                let mut buf: Vec<u8> = Vec::new();
                while let Some(chunk) = stream.next().await {
                    let chunk = match chunk {
                        Ok(c) => c,
                        Err(e) => {
                            eprintln!("[{}] HTTP-SSE stream error: {}", server_name, e);
                            break;
                        }
                    };
                    buf.extend_from_slice(&chunk);
                    while let Some(pos) = find_subsequence(&buf, b"\n\n") {
                        let frame = buf.drain(..pos + 2).collect::<Vec<u8>>();
                        let frame_str = String::from_utf8_lossy(&frame);
                        let mut data_buf = String::new();
                        for line in frame_str.lines() {
                            if let Some(rest) = line.strip_prefix("data:") {
                                if !data_buf.is_empty() {
                                    data_buf.push('\n');
                                }
                                data_buf.push_str(rest.strip_prefix(' ').unwrap_or(rest));
                            }
                        }
                        if data_buf.is_empty() {
                            continue;
                        }
                        match serde_json::from_str::<serde_json::Value>(&data_buf) {
                            Ok(v) => {
                                if tx.send(v).await.is_err() {
                                    return;
                                }
                            }
                            Err(e) => eprintln!(
                                "[{}] HTTP-SSE: invalid JSON in data frame: {} (payload: {})",
                                server_name, e, data_buf
                            ),
                        }
                    }
                }
            });
            notification_rx = Some(rx);
        }
        Ok(resp) => {
            eprintln!(
                "[{}] HTTP transport: GET returned {} (no notification channel)",
                name,
                resp.status()
            );
        }
        Err(e) => {
            eprintln!(
                "[{}] HTTP transport: GET failed ({}); continuing in request/response mode",
                name, e
            );
        }
    }

    let mut conn = McpConnection {
        server_name: name.to_string(),
        config,
        inner: McpTransportConn::Http {
            url: url.to_string(),
            headers: headers.clone(),
            client,
            notification_rx,
            session_id,
        },
        request_id: 0,
        timeouts,
    };

    conn.initialize().await?;
    Ok(conn)
}

/// Send a JSON-RPC request over Streamable HTTP and wait for the response.
///
/// Handles three response shapes per the 2025-06-18 spec:
///   (a) `200 OK` + `application/json`  → body IS the JSON-RPC response.
///   (b) `200 OK` + `text/event-stream` → SSE-upgrade. Drain frames until
///        a frame's `id` matches `body.id`, then return that frame.
///   (c) `202 Accepted` (empty body)    → fire-and-forget ack. Returns
///        `Ok(None)` to the caller.
///
/// `Mcp-Session-Id` is captured from response headers and stored back into
/// `*session_id` for sticky session affinity on subsequent requests.
#[allow(clippy::too_many_arguments)]
pub(super) async fn send_request_http(
    url: &str,
    headers: &HashMap<String, String>,
    client: &reqwest::Client,
    session_id: &mut Option<String>,
    body: &JsonRpcRequest,
    timeout: Duration,
    server_name: &str,
    method_name: &str,
) -> Result<Option<serde_json::Value>> {
    let mut req = client
        .post(url)
        .header("Content-Type", "application/json")
        .header("Accept", "application/json, text/event-stream")
        .json(body);
    for (k, v) in headers {
        req = req.header(k, v);
    }
    if let Some(sid) = session_id.as_deref() {
        req = req.header("Mcp-Session-Id", sid);
    }

    let resp = match tokio::time::timeout(timeout, req.send()).await {
        Ok(r) => r.with_context(|| {
            format!("[{}] [mcp http] POST '{}' failed", server_name, method_name)
        })?,
        Err(_) => bail!(
            "[{}] [mcp http] POST timeout ({}ms) on '{}'",
            server_name,
            timeout.as_millis(),
            method_name
        ),
    };

    // Capture sticky session id off any response (even errors).
    if let Some(sid_hv) = resp.headers().get("Mcp-Session-Id") {
        if let Ok(sid_str) = sid_hv.to_str() {
            *session_id = Some(sid_str.to_string());
        }
    }

    let status = resp.status();
    if status == reqwest::StatusCode::ACCEPTED {
        // Fire-and-forget — server accepted the request but won't reply.
        return Ok(None);
    }
    if !status.is_success() {
        let body_text = resp.text().await.unwrap_or_default();
        bail!(
            "[{}] [mcp http] non-success response {} on '{}': {}",
            server_name,
            status,
            method_name,
            body_text
        );
    }

    let ct = resp
        .headers()
        .get("Content-Type")
        .and_then(|v| v.to_str().ok())
        .unwrap_or("")
        .to_string();

    if ct.starts_with("text/event-stream") {
        // SSE-upgrade response — drain frames until the matching id arrives.
        let expected_id = body.id;
        let mut stream = resp.bytes_stream();
        let mut buf: Vec<u8> = Vec::new();
        loop {
            let next = match tokio::time::timeout(timeout, stream.next()).await {
                Ok(n) => n,
                Err(_) => bail!(
                    "[{}] [mcp http] sse-upgrade idle timeout ({}ms) on '{}'",
                    server_name,
                    timeout.as_millis(),
                    method_name
                ),
            };
            let chunk = match next {
                Some(Ok(c)) => c,
                Some(Err(e)) => bail!(
                    "[{}] [mcp http] sse-upgrade read error on '{}': {}",
                    server_name,
                    method_name,
                    e
                ),
                None => bail!(
                    "[{}] [mcp http] sse-upgrade closed before response on '{}'",
                    server_name,
                    method_name
                ),
            };
            buf.extend_from_slice(&chunk);
            while let Some(pos) = find_subsequence(&buf, b"\n\n") {
                let frame = buf.drain(..pos + 2).collect::<Vec<u8>>();
                let frame_str = String::from_utf8_lossy(&frame);
                let mut data_buf = String::new();
                for line in frame_str.lines() {
                    if let Some(rest) = line.strip_prefix("data:") {
                        if !data_buf.is_empty() {
                            data_buf.push('\n');
                        }
                        data_buf.push_str(rest.strip_prefix(' ').unwrap_or(rest));
                    }
                }
                if data_buf.is_empty() {
                    continue;
                }
                if let Ok(v) = serde_json::from_str::<serde_json::Value>(&data_buf) {
                    if let Some(matched) =
                        extract_matching_response(&v, expected_id, server_name)?
                    {
                        return Ok(matched);
                    }
                    // Otherwise it's a notification or a different-id
                    // response — keep draining.
                }
            }
        }
    }

    // Default path: JSON body inline.
    let value: serde_json::Value = resp.json().await.with_context(|| {
        format!("[{}] [mcp http] parse json body on '{}'", server_name, method_name)
    })?;
    match extract_matching_response(&value, body.id, server_name)? {
        Some(matched) => Ok(matched),
        None => {
            // Body had no matching id — surface as Null so callers can no-op.
            // Some servers reply with a bare notification object even to a
            // request POST; treat it the same as 202.
            Ok(None)
        }
    }
}
