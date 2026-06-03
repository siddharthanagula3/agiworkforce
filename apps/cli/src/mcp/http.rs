//! Streamable HTTP transport bringup (Sprint B2 — MCP 2025-06-18 spec).
//!
//! POST per request, response is either an inline JSON-RPC body or an
//! SSE-upgrade stream of frames. `Mcp-Session-Id` is captured from every
//! response and echoed on every subsequent request for sticky session affinity.
//!
//! Sprint B3 layered OAuth (PKCE) on top. When an `McpOAuthConfig` is set
//! on the transport, we:
//!   * On every request, look up `~/.agiworkforce/mcp-oauth.json` keyed by
//!     server URL. If a cached token exists and isn't expiring within 60s,
//!     attach `Authorization: Bearer ...`. If it IS expiring and a refresh
//!     token is available, refresh first.
//!   * On a 401 response, parse `WWW-Authenticate: Bearer
//!     resource_metadata="..."` to discover the AS, run the PKCE flow,
//!     persist the new token, and retry the original request once.
//!   * On a 401 response with `error="insufficient_scope"`, re-run the
//!     PKCE flow with the elevated scope (step-up auth, RFC 9470).

use anyhow::{anyhow, bail, Context, Result};
use futures_util::StreamExt;
use std::collections::HashMap;
use std::sync::{Arc, Mutex};
use std::time::Duration;

use super::oauth_flow::{
    parse_insufficient_scope, perform_full_oauth, refresh_token as refresh_oauth_token,
};
use super::oauth_store::{McpOAuthStore, McpOAuthToken};
use super::{
    elicitation::AutoDeclineHandler, extract_matching_response, find_subsequence, JsonRpcRequest,
    McpConnection, McpOAuthConfig, McpServerConfig, McpTimeouts, McpTransportConn,
};

/// Connect to a Streamable-HTTP MCP server.
///
/// The connect step builds the `McpConnection` and runs the standard
/// `initialize` handshake (which goes through `send_request` → POST).
///
/// Sticky `Mcp-Session-Id` capture happens inside `send_request_http` on
/// every response, so the first POST response will populate it.
///
/// If `oauth` is set and a cached token exists, the initialize POST attaches
/// `Authorization: Bearer ...`. A 401 on the initialize POST triggers the
/// OAuth dance via `send_request_http`, just like 401 on a regular request.
pub(super) async fn connect_http(
    name: &str,
    url: &str,
    headers: &HashMap<String, String>,
    oauth: Option<&McpOAuthConfig>,
    timeouts: McpTimeouts,
    config: McpServerConfig,
) -> Result<McpConnection> {
    // No global `.timeout()` on the client — POSTs are wrapped per-call,
    // and the optional GET stream is long-lived.
    let client = reqwest::Client::builder()
        .build()
        .context("build reqwest client")?;

    let session_id: Option<String> = None;

    let mut conn = McpConnection {
        server_name: name.to_string(),
        config,
        inner: McpTransportConn::Http {
            url: url.to_string(),
            headers: headers.clone(),
            client,
            session_id,
            oauth: oauth.cloned(),
        },
        request_id: 0,
        timeouts,
        stderr_buf: Arc::new(Mutex::new(Vec::new())),
        elicitation_handler: Arc::new(AutoDeclineHandler),
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
///
/// If `oauth` is `Some`, on every call we:
///   - check the token store; refresh proactively if expiring within 60s.
///   - attach `Authorization: Bearer <access_token>` header.
///   - on 401, run discovery + PKCE flow via `handle_oauth_challenge`,
///     then retry the request exactly once.
#[allow(clippy::too_many_arguments)]
pub(super) async fn send_request_http(
    url: &str,
    headers: &HashMap<String, String>,
    client: &reqwest::Client,
    session_id: &mut Option<String>,
    oauth: Option<&McpOAuthConfig>,
    body: &JsonRpcRequest,
    timeout: Duration,
    server_name: &str,
    method_name: &str,
) -> Result<Option<serde_json::Value>> {
    // Phase 1: refresh-if-near-expiry, then attach bearer if we have one.
    let mut bearer = if let Some(cfg) = oauth {
        prepare_bearer(url, cfg).await
    } else {
        None
    };

    let outcome = send_once(
        url,
        headers,
        client,
        session_id,
        bearer.as_deref(),
        body,
        timeout,
        server_name,
        method_name,
    )
    .await?;

    match outcome {
        SendOutcome::Done(v) => Ok(v),
        SendOutcome::Unauthorized {
            www_authenticate,
            body_text,
        } => {
            let cfg = match oauth {
                Some(c) => c,
                None => {
                    bail!(
                        "[{}] [mcp http] non-success response 401 on '{}' \
                         and no OAuth configured: {}",
                        server_name,
                        method_name,
                        body_text
                    );
                }
            };

            // Headless guard: TTY-less runs (e.g. `agi -p`) shouldn't
            // pop a browser; surface a clear error instead.
            if !is_interactive() {
                bail!(
                    "[{}] [mcp http] received 401 on '{}' but no usable cached token \
                     and not running interactively — re-run from a terminal or pre-auth \
                     via `agi mcp oauth login <server>`. body: {}",
                    server_name,
                    method_name,
                    body_text
                );
            }

            // Detect step-up; otherwise full discovery + PKCE.
            let scope_override = parse_insufficient_scope(www_authenticate.as_deref());

            eprintln!(
                "[{}] [mcp http] received 401 on '{}' — running OAuth flow{}",
                server_name,
                method_name,
                scope_override
                    .as_deref()
                    .map(|s| format!(" (step-up scope: {})", s))
                    .unwrap_or_default()
            );

            let new_token = perform_full_oauth(
                url,
                cfg,
                www_authenticate.as_deref(),
                scope_override.as_deref(),
            )
            .await
            .with_context(|| format!("[{}] OAuth flow failed", server_name))?;

            // Persist before retrying so a crash mid-retry doesn't lose
            // the token we just earned.
            if let Err(e) = persist_token(url, &new_token) {
                eprintln!(
                    "[{}] [mcp http] warning: failed to persist OAuth token: {}",
                    server_name, e
                );
            }

            bearer = Some(new_token.access_token.clone());

            // Single retry with the new bearer.
            let retry = send_once(
                url,
                headers,
                client,
                session_id,
                bearer.as_deref(),
                body,
                timeout,
                server_name,
                method_name,
            )
            .await?;

            match retry {
                SendOutcome::Done(v) => Ok(v),
                SendOutcome::Unauthorized { body_text, .. } => {
                    bail!(
                        "[{}] [mcp http] OAuth flow completed but request still \
                         rejected with 401 on '{}' — check that scopes match what \
                         the server requires. body: {}",
                        server_name,
                        method_name,
                        body_text
                    );
                }
            }
        }
    }
}

/// Outcome of a single POST attempt — either a usable response (or `None`
/// for 202 Accepted), or a 401 with the captured WWW-Authenticate header
/// so the caller can decide whether to run the OAuth dance.
enum SendOutcome {
    Done(Option<serde_json::Value>),
    Unauthorized {
        www_authenticate: Option<String>,
        body_text: String,
    },
}

/// Single round-trip without OAuth retry logic. The OAuth retry loop in
/// `send_request_http` calls this at least once and at most twice.
#[allow(clippy::too_many_arguments)]
async fn send_once(
    url: &str,
    headers: &HashMap<String, String>,
    client: &reqwest::Client,
    session_id: &mut Option<String>,
    bearer: Option<&str>,
    body: &JsonRpcRequest,
    timeout: Duration,
    server_name: &str,
    method_name: &str,
) -> Result<SendOutcome> {
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
    if let Some(b) = bearer {
        req = req.header("Authorization", format!("Bearer {}", b));
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
        return Ok(SendOutcome::Done(None));
    }

    if status == reqwest::StatusCode::UNAUTHORIZED {
        // Capture WWW-Authenticate before consuming the body.
        let www_authenticate = resp
            .headers()
            .get("WWW-Authenticate")
            .and_then(|v| v.to_str().ok())
            .map(String::from);
        let body_text = resp.text().await.unwrap_or_default();
        return Ok(SendOutcome::Unauthorized {
            www_authenticate,
            body_text,
        });
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
                let v =
                    serde_json::from_str::<serde_json::Value>(&data_buf).with_context(|| {
                        format!(
                            "[{}] [mcp http] invalid JSON in sse-upgrade frame on '{}'",
                            server_name, method_name
                        )
                    })?;
                if let Some(matched) = extract_matching_response(&v, expected_id, server_name)? {
                    return Ok(SendOutcome::Done(matched));
                }
                // Otherwise it's a notification or a different-id response — keep draining.
            }
        }
    }

    // Default path: JSON body inline.
    let value: serde_json::Value = resp.json().await.with_context(|| {
        format!(
            "[{}] [mcp http] parse json body on '{}'",
            server_name, method_name
        )
    })?;
    match extract_matching_response(&value, body.id, server_name)? {
        Some(matched) => Ok(SendOutcome::Done(matched)),
        None => {
            // Body had no matching id — surface as Null so callers can no-op.
            // Some servers reply with a bare notification object even to a
            // request POST; treat it the same as 202.
            Ok(SendOutcome::Done(None))
        }
    }
}

/// Look up a cached token for `url` and refresh it if it's within 60s of
/// expiry. Returns the access token to attach as a Bearer (or `None` if no
/// cached token exists yet — first-use case).
async fn prepare_bearer(url: &str, cfg: &McpOAuthConfig) -> Option<String> {
    let mut store = McpOAuthStore::load().ok()?;
    let cached = store.get(url).cloned()?;

    if !cached.is_expiring_soon(60) {
        return Some(cached.access_token);
    }

    // Try refresh. If it fails, drop the cached token; the caller will then
    // see a 401 and run the full flow.
    match refresh_oauth_token(&cached, cfg).await {
        Ok(refreshed) => {
            let access = refreshed.access_token.clone();
            // Preserve the metadata URL across refresh so future flows skip
            // re-discovery if the refresh later fails.
            let merged = McpOAuthToken {
                auth_server_metadata_url: refreshed
                    .auth_server_metadata_url
                    .clone()
                    .or(cached.auth_server_metadata_url),
                ..refreshed
            };
            store.put(url.to_string(), merged);
            let _ = store.save();
            Some(access)
        }
        Err(e) => {
            eprintln!(
                "[mcp oauth] refresh for {} failed ({}); will re-auth on 401",
                url, e
            );
            None
        }
    }
}

/// Persist a freshly-acquired token to the on-disk store.
fn persist_token(url: &str, token: &McpOAuthToken) -> Result<()> {
    let mut store =
        McpOAuthStore::load().map_err(|e| anyhow!("load mcp-oauth.json before persist: {}", e))?;
    store.put(url.to_string(), token.clone());
    store.save()
}

/// Crude check: are we attached to a TTY? Headless invocations (CI, `-p`
/// mode) shouldn't pop a browser.
fn is_interactive() -> bool {
    use std::io::IsTerminal;
    std::io::stdin().is_terminal() && std::io::stderr().is_terminal()
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::sync::{Arc, Mutex};
    use tokio::io::{AsyncReadExt, AsyncWriteExt};
    use tokio::net::TcpListener;

    async fn read_http_request(socket: &mut tokio::net::TcpStream) -> String {
        let mut data = Vec::new();
        let mut buf = [0u8; 1024];
        loop {
            let n = socket.read(&mut buf).await.expect("read request");
            if n == 0 {
                break;
            }
            data.extend_from_slice(&buf[..n]);
            let Some(header_end) = find_subsequence(&data, b"\r\n\r\n") else {
                continue;
            };
            let headers = String::from_utf8_lossy(&data[..header_end]);
            let content_len = headers
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
            if data.len() >= header_end + 4 + content_len {
                break;
            }
        }
        String::from_utf8_lossy(&data).into_owned()
    }

    #[tokio::test]
    async fn connect_http_does_not_subscribe_notification_get() {
        let listener = TcpListener::bind("127.0.0.1:0").await.expect("bind");
        let url = format!("http://{}", listener.local_addr().expect("addr"));
        let seen_methods = Arc::new(Mutex::new(Vec::new()));
        let seen_for_server = Arc::clone(&seen_methods);

        let server = tokio::spawn(async move {
            let mut post_count = 0usize;
            while post_count < 2 {
                let accept = tokio::time::timeout(Duration::from_secs(2), listener.accept()).await;
                let Ok(Ok((mut socket, _))) = accept else {
                    break;
                };
                let request = read_http_request(&mut socket).await;
                let first_line = request.lines().next().unwrap_or_default().to_string();
                let method = first_line
                    .split_whitespace()
                    .next()
                    .unwrap_or_default()
                    .to_string();
                seen_for_server
                    .lock()
                    .expect("seen lock")
                    .push(method.clone());

                let response = if method == "POST" && request.contains("\"initialize\"") {
                    post_count += 1;
                    let body =
                        r#"{"jsonrpc":"2.0","id":1,"result":{"serverInfo":{"name":"test"}}}"#;
                    format!(
                        "HTTP/1.1 200 OK\r\nContent-Type: application/json\r\nContent-Length: {}\r\nConnection: close\r\n\r\n{}",
                        body.len(),
                        body
                    )
                } else if method == "POST" {
                    post_count += 1;
                    "HTTP/1.1 202 Accepted\r\nContent-Length: 0\r\nConnection: close\r\n\r\n"
                        .to_string()
                } else {
                    "HTTP/1.1 405 Method Not Allowed\r\nContent-Length: 0\r\nConnection: close\r\n\r\n"
                        .to_string()
                };
                socket
                    .write_all(response.as_bytes())
                    .await
                    .expect("write response");
            }
        });

        let config = McpServerConfig::http(url.clone(), HashMap::new());
        let _conn = connect_http(
            "http-no-get",
            &url,
            &HashMap::new(),
            None,
            McpTimeouts {
                initialize: Duration::from_secs(2),
                list_tools: Duration::from_secs(2),
                call_tool: Duration::from_secs(2),
                health_check: Duration::from_secs(2),
            },
            config,
        )
        .await
        .expect("connect http");

        server.await.expect("server task");
        let methods = seen_methods.lock().expect("seen lock").clone();
        assert_eq!(methods, vec!["POST".to_string(), "POST".to_string()]);
    }
}
