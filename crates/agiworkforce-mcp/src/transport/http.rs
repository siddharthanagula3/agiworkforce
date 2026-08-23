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
    timeouts: &crate::config::McpTimeouts,
) -> Result<TransportConn> {
    if timeouts.validate_urls {
        crate::security::validate_server_url(url).context("[mcp http]")?;
    }
    refuse_cleartext_credentials(url, headers_carry_credentials(headers) || oauth.is_some())
        .context("[mcp http]")?;
    // No global `.timeout()` on the client — POSTs are wrapped per-call, and the
    // optional GET stream is long-lived.
    let builder = reqwest::Client::builder().redirect(pinned_redirect_policy(url));
    // Release builds refuse this outright; debug builds allow loopback only.
    crate::security::enforce_tls_verification_policy(url, timeouts.verify_tls)
        .context("[mcp http]")?;
    // The policy above already bails in release, so this is unreachable there.
    // Gating the call site as well keeps `danger_accept_invalid_certs` out of
    // the release binary entirely, so the guarantee survives someone later
    // dropping the policy call — and it is what `rust/disabled-certificate-check`
    // flagged, since the query cannot see the early-return guard. Shadowing
    // rather than `mut`: the gated block is the only mutation here, so `mut`
    // would be an unused-mut error in release under `-D warnings`.
    #[cfg(debug_assertions)]
    let builder = if timeouts.verify_tls {
        builder
    } else {
        builder.danger_accept_invalid_certs(true)
    };
    let client = builder.build().context("build reqwest client")?;

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
    max_frame_bytes: usize,
    max_response_bytes: u64,
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
        max_response_bytes,
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
                eprintln!("[{server_name}] [mcp http] warning: failed to persist OAuth token: {e}");
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
                max_response_bytes,
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
#[derive(Debug)]
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
    max_frame_bytes: usize,
    max_response_bytes: u64,
) -> Result<SendOutcome> {
    // The bearer and the host-configured headers are credentials scoped to this
    // server: refuse to put them on the wire in cleartext (loopback exempt) no
    // matter which host built this transport.
    refuse_cleartext_credentials(url, bearer.is_some() || headers_carry_credentials(headers))
        .with_context(|| format!("[{server_name}] [mcp http] '{method_name}'"))?;

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
        Ok(r) => {
            r.with_context(|| format!("[{server_name}] [mcp http] POST '{method_name}' failed"))?
        }
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
        let body_text = read_text_capped(resp).await;
        return Ok(SendOutcome::Unauthorized {
            www_authenticate,
            body_text,
        });
    }

    if !status.is_success() {
        let body_text = read_text_capped(resp).await;
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
            // Not optional: the server chooses when to send a frame boundary,
            // so without this the buffer grows until the host process dies.
            if buf.len() > max_frame_bytes && find_subsequence(&buf, b"\n\n").is_none() {
                bail!(
                    "[{server_name}] [mcp http] sse-upgrade frame exceeded {max_frame_bytes} bytes on '{method_name}'"
                );
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

    // Default path: JSON body inline, read under a hard cap so a malicious
    // server cannot exhaust memory with one giant reply.
    let raw = read_body_capped(resp, max_response_bytes)
        .await
        .with_context(|| format!("[{server_name}] [mcp http] on '{method_name}'"))?;
    let value: serde_json::Value = serde_json::from_slice(&raw).with_context(|| {
        format!("[{server_name}] [mcp http] parse json body on '{method_name}'")
    })?;
    match extract_matching_response(&value, body.id, server_name)? {
        Some(matched) => Ok(SendOutcome::Done(matched)),
        None => {
            // Body had no matching id — treat like 202.
            Ok(SendOutcome::Done(None))
        }
    }
}

/// Bytes of a diagnostic (error / 401) body kept for the message. The body is
/// attacker-controlled text that only ends up in a log line, so it is truncated
/// rather than refused.
const MAX_DIAGNOSTIC_BODY_BYTES: usize = 64 * 1024;

/// Refuse to attach credentials to a cleartext connection. Loopback stays
/// exempt so local `http://` dev MCP servers keep working; any other host must
/// be reached over HTTPS before a bearer token or a configured auth header goes
/// out on it.
pub(crate) fn refuse_cleartext_credentials(url: &str, has_credentials: bool) -> Result<()> {
    if !has_credentials {
        return Ok(());
    }
    crate::security::enforce_https_for_remote(url)
        .context("refusing to send MCP credentials in cleartext")
}

/// Substrings that make a configured header name a secret. Matched
/// case-insensitively so vendor spellings (`X-Api-Key`, `Api-Key`,
/// `X-Auth-Token`, `X-Session-Secret`) are all covered without an exact-name
/// allowlist that a new vendor would slip past.
const CREDENTIAL_HEADER_MARKERS: [&str; 9] = [
    "auth",
    "key",
    "token",
    "secret",
    "credential",
    "cookie",
    "password",
    "session",
    "signature",
];

/// Whether any host-configured header carries a secret. Only these gate the
/// cleartext refusal: a benign routing header (`X-Client: agi`) on a LAN
/// `http://` MCP server exposes nothing, and failing bringup on it would break
/// working setups for no security gain.
pub(crate) fn headers_carry_credentials(headers: &HashMap<String, String>) -> bool {
    headers.keys().any(|name| {
        let lower = name.to_ascii_lowercase();
        CREDENTIAL_HEADER_MARKERS
            .iter()
            .any(|marker| lower.contains(marker))
    })
}

/// Hops a transport client will follow before giving up. A custom redirect
/// policy replaces reqwest's own limit, so it has to carry one.
const MAX_REDIRECT_HOPS: usize = 5;

/// Redirect policy for a transport client: follow a hop only while it stays on
/// the origin the user configured.
///
/// reqwest's default policy follows up to 10 hops to any origin and strips only
/// `Authorization`/`Cookie`/`Proxy-Authorization`. So without this, a server
/// that answers the same-origin, HTTPS-checked POST with
/// `307 Location: http://attacker.example/` gets the whole JSON-RPC body
/// replayed to it along with every other configured credential header
/// (`X-Api-Key`, `X-Auth-Token`, …) — walking straight past the same-origin and
/// cleartext checks that guard the request URL, and reaching link-local
/// metadata services that `validate_server_url` refused.
pub(crate) fn pinned_redirect_policy(url: &str) -> reqwest::redirect::Policy {
    let pinned = url.to_string();
    reqwest::redirect::Policy::custom(move |attempt| {
        if attempt.previous().len() >= MAX_REDIRECT_HOPS {
            return attempt.error(format!("more than {MAX_REDIRECT_HOPS} MCP redirects"));
        }
        match crate::security::enforce_same_origin(
            &pinned,
            attempt.url().as_str(),
            "MCP redirect target",
        ) {
            Ok(()) => attempt.follow(),
            Err(e) => attempt.error(format!("{e:#}")),
        }
    })
}

/// Read a response body, failing as soon as it passes `cap`. Shared with the
/// SSE transport's inline-response path in [`crate::client`]. `Content-Length`
/// only short-circuits the read: a chunked response carries no length, so the
/// limit has to hold on the bytes themselves.
pub(crate) async fn read_body_capped(mut resp: reqwest::Response, cap: u64) -> Result<Vec<u8>> {
    if let Some(len) = resp.content_length() {
        if len > cap {
            bail!("response too large ({len} bytes, max {cap} bytes)");
        }
    }
    let mut out: Vec<u8> = Vec::new();
    while let Some(chunk) = resp.chunk().await.context("read response body")? {
        if out.len() as u64 + chunk.len() as u64 > cap {
            bail!("response too large (over {cap} bytes)");
        }
        out.extend_from_slice(&chunk);
    }
    Ok(out)
}

/// Read at most [`MAX_DIAGNOSTIC_BODY_BYTES`] of an error body for the message.
pub(crate) async fn read_text_capped(mut resp: reqwest::Response) -> String {
    let mut out: Vec<u8> = Vec::new();
    while let Ok(Some(chunk)) = resp.chunk().await {
        let room = MAX_DIAGNOSTIC_BODY_BYTES.saturating_sub(out.len());
        if room == 0 {
            break;
        }
        out.extend_from_slice(&chunk[..chunk.len().min(room)]);
    }
    String::from_utf8_lossy(&out).into_owned()
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

/// Hand-rolled HTTP/1.1 listeners for the transport tests. `axum` cannot script
/// a raw `307` whose `Location` points at a second, unrelated listener, and
/// asserting that the second listener was never contacted is the whole point of
/// the redirect tests. Shared with the SSE transport's tests.
#[cfg(test)]
pub(crate) mod raw_http {
    use std::collections::VecDeque;
    use std::net::SocketAddr;
    use std::sync::{Arc, Mutex};

    use tokio::io::{AsyncReadExt, AsyncWriteExt};
    use tokio::net::{TcpListener, TcpStream};

    use crate::jsonrpc::find_subsequence;

    /// Read one whole request (headers plus any `Content-Length` body) so the
    /// next read on a keep-alive connection starts on a request boundary.
    async fn read_request(sock: &mut TcpStream) -> String {
        let mut buf: Vec<u8> = Vec::new();
        let mut chunk = [0u8; 1024];
        loop {
            if let Some(pos) = find_subsequence(&buf, b"\r\n\r\n") {
                let head = String::from_utf8_lossy(&buf[..pos]).to_ascii_lowercase();
                let len: usize = head
                    .lines()
                    .find_map(|line| line.strip_prefix("content-length:"))
                    .and_then(|v| v.trim().parse().ok())
                    .unwrap_or(0);
                if buf.len() >= pos + 4 + len {
                    break;
                }
            }
            match sock.read(&mut chunk).await {
                Ok(0) | Err(_) => break,
                Ok(n) => buf.extend_from_slice(&chunk[..n]),
            }
        }
        String::from_utf8_lossy(&buf).into_owned()
    }

    /// Stands in for the attacker origin: records every request it ever
    /// receives, so a test can assert it received none.
    pub(crate) async fn spawn_collector() -> (SocketAddr, Arc<Mutex<Vec<String>>>) {
        let listener = TcpListener::bind("127.0.0.1:0")
            .await
            .expect("bind collector");
        let addr = listener.local_addr().expect("collector addr");
        let hits: Arc<Mutex<Vec<String>>> = Arc::new(Mutex::new(Vec::new()));
        let sink = Arc::clone(&hits);
        tokio::spawn(async move {
            while let Ok((mut sock, _)) = listener.accept().await {
                let req = read_request(&mut sock).await;
                sink.lock().expect("collector lock").push(req);
                let _ = sock
                    .write_all(
                        b"HTTP/1.1 200 OK\r\nContent-Type: application/json\r\nContent-Length: 2\r\n\r\n{}",
                    )
                    .await;
            }
        });
        (addr, hits)
    }

    /// Answers each request with the next canned response, across connections.
    pub(crate) async fn spawn_scripted(script: Vec<String>) -> SocketAddr {
        let listener = TcpListener::bind("127.0.0.1:0")
            .await
            .expect("bind scripted");
        let addr = listener.local_addr().expect("scripted addr");
        let queue = Arc::new(Mutex::new(VecDeque::from(script)));
        tokio::spawn(async move {
            while let Ok((mut sock, _)) = listener.accept().await {
                let queue = Arc::clone(&queue);
                tokio::spawn(async move {
                    loop {
                        if read_request(&mut sock).await.is_empty() {
                            return;
                        }
                        let next = queue.lock().expect("script lock").pop_front();
                        let Some(resp) = next else { return };
                        if sock.write_all(resp.as_bytes()).await.is_err() {
                            return;
                        }
                    }
                });
            }
        });
        addr
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::config::McpTimeouts;

    fn rpc(id: u64) -> JsonRpcRequest {
        JsonRpcRequest {
            jsonrpc: "2.0".to_string(),
            id,
            method: "tools/call".to_string(),
            params: None,
        }
    }

    fn api_key_headers() -> HashMap<String, String> {
        HashMap::from([("X-Api-Key".to_string(), "STATIC_API_KEY".to_string())])
    }

    async fn post_once(
        url: &str,
        headers: &HashMap<String, String>,
        client: &reqwest::Client,
    ) -> Result<SendOutcome> {
        let timeouts = McpTimeouts::default();
        let mut session_id = None;
        send_once(
            url,
            headers,
            client,
            &mut session_id,
            Some("OAUTH_TOKEN"),
            &rpc(1),
            Duration::from_secs(5),
            "redirect",
            "tools/call",
            timeouts.frame_cap(),
            timeouts.response_cap(),
        )
        .await
    }

    fn http_client(url: &str, headers: &HashMap<String, String>) -> reqwest::Client {
        let conn = connect(url, headers, None, &McpTimeouts::default()).expect("connect");
        match conn {
            TransportConn::Http { client, .. } => client,
            _ => panic!("expected an http transport"),
        }
    }

    #[tokio::test]
    async fn cross_origin_redirect_on_a_credentialed_post_is_refused() {
        let (collector, hits) = raw_http::spawn_collector().await;
        let server = raw_http::spawn_scripted(vec![format!(
            "HTTP/1.1 307 Temporary Redirect\r\nLocation: http://{collector}/collect\r\nContent-Length: 0\r\n\r\n"
        )])
        .await;

        let url = format!("http://{server}/");
        let headers = api_key_headers();
        let client = http_client(&url, &headers);

        let result = post_once(&url, &headers, &client).await;

        let seen = hits.lock().expect("collector lock").clone();
        assert!(seen.is_empty(), "attacker origin was contacted: {seen:?}");
        let err = result.expect_err("a cross-origin redirect must not be followed");
        assert!(format!("{err:#}").contains("tools/call"), "{err:#}");
    }

    #[tokio::test]
    async fn same_origin_redirect_is_still_followed() {
        let body = r#"{"jsonrpc":"2.0","id":1,"result":{"ok":true}}"#;
        let len = body.len();
        let server = raw_http::spawn_scripted(vec![
            "HTTP/1.1 307 Temporary Redirect\r\nLocation: /v2\r\nContent-Length: 0\r\n\r\n"
                .to_string(),
            format!(
                "HTTP/1.1 200 OK\r\nContent-Type: application/json\r\nContent-Length: {len}\r\n\r\n{body}"
            ),
        ])
        .await;

        let url = format!("http://{server}/");
        let headers = api_key_headers();
        let client = http_client(&url, &headers);

        let outcome = post_once(&url, &headers, &client)
            .await
            .expect("a same-origin redirect must still be followed");
        assert!(matches!(outcome, SendOutcome::Done(Some(_))));
    }

    #[test]
    fn only_credential_shaped_headers_gate_the_cleartext_refusal() {
        assert!(headers_carry_credentials(&api_key_headers()));
        assert!(headers_carry_credentials(&HashMap::from([(
            "authorization".to_string(),
            "Bearer s3cret".to_string()
        )])));
        assert!(headers_carry_credentials(&HashMap::from([(
            "X-Auth-Token".to_string(),
            "s3cret".to_string()
        )])));
        assert!(!headers_carry_credentials(&HashMap::from([(
            "X-Client".to_string(),
            "agi".to_string()
        )])));
        assert!(!headers_carry_credentials(&HashMap::new()));
    }

    #[test]
    fn credentials_are_refused_over_cleartext_to_a_remote_host() {
        let err = refuse_cleartext_credentials("http://mcp.example.com/", true)
            .expect_err("cleartext credentials must be refused");
        assert!(format!("{err:#}").contains("must use HTTPS"), "{err:#}");
    }

    #[test]
    fn cleartext_without_credentials_stays_allowed() {
        assert!(refuse_cleartext_credentials("http://mcp.example.com/", false).is_ok());
    }

    #[test]
    fn loopback_and_https_stay_allowed_with_credentials() {
        assert!(refuse_cleartext_credentials("http://127.0.0.1:3000/", true).is_ok());
        assert!(refuse_cleartext_credentials("http://localhost:3000/", true).is_ok());
        assert!(refuse_cleartext_credentials("https://mcp.example.com/", true).is_ok());
    }

    #[test]
    fn uppercase_cleartext_scheme_is_still_cleartext() {
        assert!(refuse_cleartext_credentials("HTTP://mcp.example.com/", true).is_err());
    }
}
