//! Streamable HTTP transport (MCP 2025-06-18 spec).
//!
//! POST per request; the response is either an inline JSON-RPC body or an
//! SSE-upgrade stream of frames. `Mcp-Session-Id` is captured from every
//! response and echoed on every subsequent request for sticky session affinity.
//!
//! OAuth (PKCE) layers on top. When an [`OAuthConfig`] is set on the transport:
//!   * On every request, look up the host token store keyed by server URL. If a
//!     cached token exists and isn't expiring within 60s, attach
//!     `Authorization: Bearer ...`. If it is expiring and a refresh token is
//!     available, refresh first.
//!   * On a 401, parse `WWW-Authenticate: Bearer resource_metadata="..."` to
//!     discover the AS, run the PKCE flow, persist the token, retry once.
//!   * On a 401 with `error="insufficient_scope"`, re-run with the elevated
//!     scope (step-up auth, RFC 9470).

use anyhow::{Context, Result, bail};
use futures_util::StreamExt;
use std::collections::HashMap;
use std::time::Duration;

use crate::client::TransportConn;
use crate::config::OAuthConfig;
use crate::hooks::{ClientHooks, OAuthToken};
use crate::jsonrpc::{JsonRpcRequest, extract_matching_response, find_subsequence};
use crate::oauth::flow::{parse_insufficient_scope, perform_full_oauth, refresh_token};

/// Build a Streamable-HTTP transport. Synchronous — the `initialize` handshake
/// (which goes through `send_request` → POST) is run by the caller. Sticky
/// `Mcp-Session-Id` capture happens inside [`send_request_http`] on every
/// response, so the first POST response populates it.
pub(crate) fn connect(
    url: &str,
    headers: &HashMap<String, String>,
    oauth: Option<&OAuthConfig>,
) -> Result<TransportConn> {
    // No global `.timeout()` on the client — POSTs are wrapped per-call, and the
    // optional GET stream is long-lived.
    let client = reqwest::Client::builder()
        .build()
        .context("build reqwest client")?;

    Ok(TransportConn::Http {
        url: url.to_string(),
        headers: headers.clone(),
        client,
        session_id: None,
        oauth: oauth.cloned(),
    })
}

/// Send a JSON-RPC request over Streamable HTTP and wait for the response.
///
/// Handles the three response shapes per the 2025-06-18 spec: inline JSON body,
/// SSE-upgrade stream, or `202 Accepted` (no reply → `Ok(None)`). On 401 with
/// an OAuth config, runs discovery + PKCE via the host [`ClientHooks`] and
/// retries exactly once.
#[allow(clippy::too_many_arguments)]
pub(crate) async fn send_request_http(
    url: &str,
    headers: &HashMap<String, String>,
    client: &reqwest::Client,
    session_id: &mut Option<String>,
    oauth: Option<&OAuthConfig>,
    body: &JsonRpcRequest,
    timeout: Duration,
    server_name: &str,
    method_name: &str,
    hooks: &ClientHooks,
    max_frame_bytes: Option<usize>,
) -> Result<Option<serde_json::Value>> {
    // Phase 1: refresh-if-near-expiry, then attach bearer if we have one.
    let mut bearer = if let Some(cfg) = oauth {
        prepare_bearer(url, cfg, hooks).await
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
        max_frame_bytes,
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
                        "[{server_name}] [mcp http] non-success response 401 on '{method_name}' \
                         and no OAuth configured: {body_text}"
                    );
                }
            };

            // Headless guard: TTY-less runs shouldn't pop a browser; surface a
            // clear error instead. The interactivity check is host-provided.
            if !hooks.browser.is_interactive() {
                bail!(
                    "[{server_name}] [mcp http] received 401 on '{method_name}' but no usable cached token \
                     and not running interactively — re-run from a terminal or pre-auth \
                     via `agi mcp oauth login <server>`. body: {body_text}"
                );
            }

            // Detect step-up; otherwise full discovery + PKCE.
            let scope_override = parse_insufficient_scope(www_authenticate.as_deref());

            eprintln!(
                "[{server_name}] [mcp http] received 401 on '{method_name}' — running OAuth flow{}",
                scope_override
                    .as_deref()
                    .map(|s| format!(" (step-up scope: {s})"))
                    .unwrap_or_default()
            );

            let new_token = perform_full_oauth(
                url,
                cfg,
                www_authenticate.as_deref(),
                scope_override.as_deref(),
                hooks.browser.as_ref(),
            )
            .await
            .with_context(|| format!("[{server_name}] OAuth flow failed"))?;

            // Persist before retrying so a crash mid-retry doesn't lose the token.
            if let Err(e) = hooks.token_store.set(url, new_token.clone()) {
                eprintln!(
                    "[{server_name}] [mcp http] warning: failed to persist OAuth token: {e}"
                );
            }

            bearer = Some(new_token.access_token.clone());

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
                max_frame_bytes,
            )
            .await?;

            match retry {
                SendOutcome::Done(v) => Ok(v),
                SendOutcome::Unauthorized { body_text, .. } => {
                    bail!(
                        "[{server_name}] [mcp http] OAuth flow completed but request still \
                         rejected with 401 on '{method_name}' — check that scopes match what \
                         the server requires. body: {body_text}"
                    );
                }
            }
        }
    }
}

/// Outcome of a single POST attempt.
enum SendOutcome {
    Done(Option<serde_json::Value>),
    Unauthorized {
        www_authenticate: Option<String>,
        body_text: String,
    },
}

/// Single round-trip without OAuth retry logic.
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
    max_frame_bytes: Option<usize>,
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
        req = req.header("Authorization", format!("Bearer {b}"));
    }

    let resp = match tokio::time::timeout(timeout, req.send()).await {
        Ok(r) => r.with_context(|| format!("[{server_name}] [mcp http] POST '{method_name}' failed"))?,
        Err(_) => bail!(
            "[{server_name}] [mcp http] POST timeout ({}ms) on '{method_name}'",
            timeout.as_millis()
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
            "[{server_name}] [mcp http] non-success response {status} on '{method_name}': {body_text}"
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
                    "[{server_name}] [mcp http] sse-upgrade idle timeout ({}ms) on '{method_name}'",
                    timeout.as_millis()
                ),
            };
            let chunk = match next {
                Some(Ok(c)) => c,
                Some(Err(e)) => bail!(
                    "[{server_name}] [mcp http] sse-upgrade read error on '{method_name}': {e}"
                ),
                None => bail!(
                    "[{server_name}] [mcp http] sse-upgrade closed before response on '{method_name}'"
                ),
            };
            buf.extend_from_slice(&chunk);
            // Optional hardening: reject a single unbounded frame. Off by
            // default (CLI parity); the sim harness enables it to prove the cap.
            if let Some(cap) = max_frame_bytes {
                if buf.len() > cap && find_subsequence(&buf, b"\n\n").is_none() {
                    bail!(
                        "[{server_name}] [mcp http] sse-upgrade frame exceeded {cap} bytes on '{method_name}'"
                    );
                }
            }
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
                let v = serde_json::from_str::<serde_json::Value>(&data_buf).with_context(|| {
                    format!("[{server_name}] [mcp http] invalid JSON in sse-upgrade frame on '{method_name}'")
                })?;
                if let Some(matched) = extract_matching_response(&v, expected_id, server_name)? {
                    return Ok(SendOutcome::Done(matched));
                }
                // Otherwise a notification / different-id response — keep draining.
            }
        }
    }

    // Default path: JSON body inline.
    let value: serde_json::Value = resp
        .json()
        .await
        .with_context(|| format!("[{server_name}] [mcp http] parse json body on '{method_name}'"))?;
    match extract_matching_response(&value, body.id, server_name)? {
        Some(matched) => Ok(SendOutcome::Done(matched)),
        None => {
            // Body had no matching id — treat like 202.
            Ok(SendOutcome::Done(None))
        }
    }
}

/// Look up a cached token for `url` and refresh it if within 60s of expiry.
/// Returns the access token to attach as a Bearer (or `None` if no cached token
/// exists yet — first-use case).
async fn prepare_bearer(url: &str, cfg: &OAuthConfig, hooks: &ClientHooks) -> Option<String> {
    let cached = hooks.token_store.get(url)?;

    if !cached.is_expiring_soon(60) {
        return Some(cached.access_token);
    }

    // Try refresh. If it fails, drop the cached token; the caller then sees a
    // 401 and runs the full flow.
    match refresh_token(&cached, cfg).await {
        Ok(refreshed) => {
            let access = refreshed.access_token.clone();
            // Preserve the metadata URL across refresh so future flows skip
            // re-discovery if the refresh later fails.
            let merged = OAuthToken {
                auth_server_metadata_url: refreshed
                    .auth_server_metadata_url
                    .clone()
                    .or(cached.auth_server_metadata_url),
                ..refreshed
            };
            let _ = hooks.token_store.set(url, merged);
            Some(access)
        }
        Err(e) => {
            eprintln!("[mcp oauth] refresh for {url} failed ({e}); will re-auth on 401");
            None
        }
    }
}
