//! OAuth 2.0 + PKCE flow for MCP servers (Sprint B3).
//!
//! Implements the happy paths of:
//!
//! * RFC 9728 — OAuth 2.0 Protected Resource Metadata (server tells us
//!   where its authorization server lives, either via the
//!   `WWW-Authenticate: Bearer resource_metadata="<url>"` challenge or via
//!   `<server>/.well-known/oauth-protected-resource`).
//! * RFC 8414 — OAuth 2.0 Authorization Server Metadata (discovers the
//!   `authorization_endpoint`, `token_endpoint`, optional
//!   `registration_endpoint`).
//! * RFC 7591 — Dynamic Client Registration (only used when the user
//!   doesn't supply a `client_id` in their config).
//! * RFC 6749 / RFC 7636 — Authorization-Code grant with PKCE.
//!
//! PKCE primitives (`generate_pkce`, `generate_random_string`) are reused
//! from `crate::oauth` — we don't re-implement S256 here.

use anyhow::{anyhow, bail, Context, Result};
use serde::{Deserialize, Serialize};
use std::time::{Duration, SystemTime, UNIX_EPOCH};
use tokio::io::{AsyncBufReadExt, AsyncWriteExt, BufReader};
use tokio::net::TcpListener;

use crate::oauth::{generate_pkce, generate_random_string};

use super::oauth_store::McpOAuthToken;
use super::McpOAuthConfig;

/// Hard cap on the loopback wait so headless invocations fail fast.
const OAUTH_INTERACTIVE_TIMEOUT: Duration = Duration::from_secs(120);

// ---------------------------------------------------------------------------
// Discovery types
// ---------------------------------------------------------------------------

/// RFC 9728 protected-resource metadata. Tells us which authorization
/// server(s) protect this resource. Spec defines more fields, but
/// `authorization_servers` and `resource` are the two we need.
#[derive(Debug, Clone, Deserialize)]
pub struct ProtectedResourceMetadata {
    #[serde(default)]
    pub authorization_servers: Vec<String>,
    /// Resource identifier the AS will issue tokens for. Captured for
    /// future audience-binding work; not consumed yet.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    #[allow(dead_code)]
    pub resource: Option<String>,
}

/// RFC 8414 authorization-server metadata. Same observation: spec defines
/// many fields; we only depend on `authorization_endpoint` + `token_endpoint`,
/// plus the optional `registration_endpoint` for RFC 7591 fallback.
#[derive(Debug, Clone, Deserialize)]
pub struct AsMetadata {
    pub authorization_endpoint: String,
    pub token_endpoint: String,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub registration_endpoint: Option<String>,
    /// Optional revocation endpoint (RFC 7009). Captured for future logout
    /// support; not consumed yet.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    #[allow(dead_code)]
    pub revocation_endpoint: Option<String>,
    /// Scopes the AS advertises support for. Captured for future
    /// validation / scope-narrowing logic; not consumed yet.
    #[serde(default)]
    #[allow(dead_code)]
    pub scopes_supported: Vec<String>,
}

/// Result of dynamic client registration (RFC 7591).
#[derive(Debug, Clone, Deserialize)]
pub struct RegisteredClient {
    pub client_id: String,
    /// Confidential-client secret. Captured because some servers always
    /// return it even for `token_endpoint_auth_method=none`; not consumed
    /// (we register as a public client).
    #[serde(default, skip_serializing_if = "Option::is_none")]
    #[allow(dead_code)]
    pub client_secret: Option<String>,
}

// ---------------------------------------------------------------------------
// WWW-Authenticate parsing (RFC 6750 §3 / RFC 9728 §5.1)
// ---------------------------------------------------------------------------

/// Pull `resource_metadata="<url>"` out of a `WWW-Authenticate: Bearer ...`
/// header. Returns `None` if the header is absent or has no metadata pointer.
pub fn parse_resource_metadata_url(www_authenticate: Option<&str>) -> Option<String> {
    let raw = www_authenticate?;
    parse_param(raw, "resource_metadata")
}

/// Extract a single quoted parameter value from a Bearer challenge string.
/// Best-effort; we don't try to handle every escape sequence.
fn parse_param(header: &str, key: &str) -> Option<String> {
    // Look for `<key>="<value>"` (case-insensitive on the key).
    let needle = format!("{}=", key);
    let lower = header.to_ascii_lowercase();
    let needle_lower = needle.to_ascii_lowercase();
    let idx = lower.find(&needle_lower)?;
    let after = &header[idx + needle.len()..];
    if let Some(stripped) = after.strip_prefix('"') {
        let end = stripped.find('"')?;
        Some(stripped[..end].to_string())
    } else {
        // Unquoted — read until comma or whitespace.
        let end = after
            .find(|c: char| c == ',' || c.is_whitespace())
            .unwrap_or(after.len());
        Some(after[..end].to_string())
    }
}

/// Detect a step-up auth challenge per RFC 9470 / RFC 6750 §3.1.
/// Returns the `scope` parameter from the challenge if `error="insufficient_scope"`.
pub fn parse_insufficient_scope(www_authenticate: Option<&str>) -> Option<String> {
    let raw = www_authenticate?;
    let err = parse_param(raw, "error")?;
    if err.eq_ignore_ascii_case("insufficient_scope") {
        parse_param(raw, "scope")
    } else {
        None
    }
}

// ---------------------------------------------------------------------------
// Discovery
// ---------------------------------------------------------------------------

/// Discover the protected-resource metadata for an MCP server (RFC 9728).
/// Prefers the URL from `WWW-Authenticate: Bearer resource_metadata="..."`
/// if available, otherwise falls back to
/// `<server>/.well-known/oauth-protected-resource`.
pub async fn discover_protected_resource(
    server_url: &str,
    www_authenticate: Option<&str>,
) -> Result<(String, ProtectedResourceMetadata)> {
    let metadata_url = parse_resource_metadata_url(www_authenticate)
        .unwrap_or_else(|| well_known(server_url, "oauth-protected-resource"));

    let client = reqwest::Client::builder()
        .timeout(Duration::from_secs(10))
        .build()
        .context("build reqwest client for resource-metadata discovery")?;

    let resp = client
        .get(&metadata_url)
        .header("Accept", "application/json")
        .send()
        .await
        .with_context(|| format!("fetch protected-resource metadata at {}", metadata_url))?;

    if !resp.status().is_success() {
        let status = resp.status();
        let body = resp.text().await.unwrap_or_default();
        bail!(
            "protected-resource metadata at {} returned {} — {}",
            metadata_url,
            status,
            body
        );
    }

    let meta: ProtectedResourceMetadata = resp
        .json()
        .await
        .with_context(|| format!("parse protected-resource metadata at {}", metadata_url))?;

    if meta.authorization_servers.is_empty() {
        bail!(
            "protected-resource metadata at {} contains no authorization_servers",
            metadata_url
        );
    }

    Ok((metadata_url, meta))
}

/// Discover the authorization server's endpoints (RFC 8414).
pub async fn discover_authorization_server(as_url: &str) -> Result<AsMetadata> {
    let metadata_url = well_known(as_url, "oauth-authorization-server");

    let client = reqwest::Client::builder()
        .timeout(Duration::from_secs(10))
        .build()
        .context("build reqwest client for AS discovery")?;

    let resp = client
        .get(&metadata_url)
        .header("Accept", "application/json")
        .send()
        .await
        .with_context(|| format!("fetch AS metadata at {}", metadata_url))?;

    if !resp.status().is_success() {
        let status = resp.status();
        let body = resp.text().await.unwrap_or_default();
        bail!(
            "AS metadata at {} returned {} — {}",
            metadata_url,
            status,
            body
        );
    }

    resp.json::<AsMetadata>()
        .await
        .with_context(|| format!("parse AS metadata at {}", metadata_url))
}

/// Build a `<scheme>://<host>/.well-known/<suffix>` URL from any URL.
fn well_known(base: &str, suffix: &str) -> String {
    // Strip any trailing path; .well-known lives at the host root.
    let trimmed = base.trim_end_matches('/');
    if let Some(scheme_end) = trimmed.find("://") {
        let after_scheme = &trimmed[scheme_end + 3..];
        if let Some(slash) = after_scheme.find('/') {
            let host = &trimmed[..scheme_end + 3 + slash];
            return format!("{}/.well-known/{}", host, suffix);
        }
    }
    format!("{}/.well-known/{}", trimmed, suffix)
}

// ---------------------------------------------------------------------------
// Dynamic client registration (RFC 7591)
// ---------------------------------------------------------------------------

#[derive(Debug, Serialize)]
struct RegistrationRequest<'a> {
    client_name: &'a str,
    redirect_uris: Vec<&'a str>,
    grant_types: Vec<&'a str>,
    response_types: Vec<&'a str>,
    token_endpoint_auth_method: &'a str,
}

pub async fn dynamic_register(reg_endpoint: &str, redirect_uri: &str) -> Result<RegisteredClient> {
    let client = reqwest::Client::builder()
        .timeout(Duration::from_secs(10))
        .build()
        .context("build reqwest client for dynamic registration")?;

    let body = RegistrationRequest {
        client_name: "AGI Workforce CLI",
        redirect_uris: vec![redirect_uri],
        grant_types: vec!["authorization_code", "refresh_token"],
        response_types: vec!["code"],
        token_endpoint_auth_method: "none",
    };

    let resp = client
        .post(reg_endpoint)
        .header("Content-Type", "application/json")
        .header("Accept", "application/json")
        .json(&body)
        .send()
        .await
        .with_context(|| format!("dynamic-register POST {}", reg_endpoint))?;

    if !resp.status().is_success() {
        let status = resp.status();
        let body = resp.text().await.unwrap_or_default();
        bail!(
            "dynamic registration at {} returned {} — {}",
            reg_endpoint,
            status,
            body
        );
    }

    resp.json::<RegisteredClient>()
        .await
        .with_context(|| format!("parse registration response from {}", reg_endpoint))
}

// ---------------------------------------------------------------------------
// PKCE flow
// ---------------------------------------------------------------------------

/// Bind a loopback listener for the OAuth callback and derive the
/// redirect URI that matches it.
///
/// CLI-NEW-MCP-OAUTH-PORT-MISMATCH fix (2026-05-05): centralized so that
/// dynamic registration and the PKCE flow can both be driven by the SAME
/// (listener, redirect_uri) pair — eliminating the prior bug where
/// `dynamic_register` was called with a port-less placeholder
/// (`http://127.0.0.1/callback`) while `start_pkce_flow` then bound a
/// fresh random port (`http://127.0.0.1:55237/callback`). Authorization
/// servers that don't strictly follow RFC 8252 §7.3 (any-port for
/// loopback) would reject the request as a `redirect_uri` mismatch, and
/// any AS that did honour the registered port-less URI would route the
/// browser to port 80 — which our random-port listener never sees.
///
/// Behaviour:
///   * If the user pinned a loopback URI in `oauth_cfg.redirect_uri`,
///     we attempt to bind that exact host:port. Useful when the AS
///     pre-registers a fixed port.
///   * Otherwise we bind 127.0.0.1:0 and synthesize the URI from the
///     OS-assigned port.
async fn prepare_loopback_callback(
    oauth_cfg: &McpOAuthConfig,
) -> Result<(TcpListener, String)> {
    if let Some(uri) = oauth_cfg.redirect_uri.as_deref() {
        let parsed = reqwest::Url::parse(uri)
            .with_context(|| format!("invalid redirect_uri in config: {}", uri))?;
        let host = parsed.host_str().unwrap_or("");
        let is_loopback = host == "127.0.0.1" || host == "[::1]" || host == "localhost";
        if is_loopback {
            if let Some(port) = parsed.port() {
                let bind_host = if host == "[::1]" { "[::1]" } else { "127.0.0.1" };
                let listener = TcpListener::bind(format!("{}:{}", bind_host, port))
                    .await
                    .with_context(|| {
                        format!(
                            "bind loopback listener at configured redirect_uri {}",
                            uri
                        )
                    })?;
                return Ok((listener, uri.to_string()));
            }
            // Loopback with no port — placeholder pattern. Honour the spirit of
            // the user's config (loopback) but bind a real port and rewrite the
            // URI to match. The AS will see the port-bearing URI from the very
            // first request, so RFC-strict implementations are happy.
        }
        // Non-loopback redirect_uri: this binary can't actually receive the
        // callback (we only listen on loopback). Refuse rather than burn the
        // user's time on an OAuth flow that can never complete.
        if !is_loopback {
            bail!(
                "redirect_uri {} is not a loopback address; \
                 the agiworkforce CLI can only receive OAuth callbacks on 127.0.0.1 / [::1]",
                uri
            );
        }
    }

    // Default: random loopback port.
    let listener = TcpListener::bind("127.0.0.1:0")
        .await
        .context("bind loopback listener for OAuth callback")?;
    let local_addr = listener.local_addr().context("query loopback addr")?;
    Ok((
        listener,
        format!("http://127.0.0.1:{}/callback", local_addr.port()),
    ))
}

/// Run the OAuth-2.0 authorization-code-with-PKCE flow against `as_meta`.
///
/// Steps:
///   1. Use the supplied (listener, redirect_uri) pair (already bound by
///      the caller) — see `prepare_loopback_callback`.
///   2. Build the authorize URL with `code_challenge_method=S256`.
///   3. Open the user's browser.
///   4. Block (≤ 2 minutes) waiting for the redirect with `?code=...&state=...`.
///   5. POST the code to `as_meta.token_endpoint`.
///   6. Return the resulting `McpOAuthToken`.
///
/// `client_id` may be either pre-supplied (`oauth_cfg.client_id`) or the
/// output of dynamic registration; this function doesn't care which.
/// `scope_override` lets callers force a specific scope on step-up auth.
pub async fn start_pkce_flow(
    server_url: &str,
    oauth_cfg: &McpOAuthConfig,
    as_meta: &AsMetadata,
    client_id: &str,
    scope_override: Option<&str>,
    listener: TcpListener,
    redirect_uri: String,
) -> Result<McpOAuthToken> {
    // 2. Build authorize URL.
    let pkce = generate_pkce();
    let state = generate_random_string(32);
    let scope = scope_override
        .map(|s| s.to_string())
        .or_else(|| oauth_cfg.scope.clone())
        .unwrap_or_default();

    let authorize_url = build_authorize_url(
        oauth_cfg
            .authorize_url
            .as_deref()
            .unwrap_or(&as_meta.authorization_endpoint),
        client_id,
        &redirect_uri,
        &scope,
        &pkce.challenge,
        &state,
    );

    // 3. Open browser; if it fails, print the URL so the user can copy it.
    //
    // CLI-NEW-009 fix (2026-05-04 audit): the previous code printed the full
    // authorize URL — including the `state=` parameter — to stderr in every
    // case. A local sibling process that reads this terminal output (or a CI
    // log scraper) could observe `state` and race the loopback callback to
    // inject its own `code` (the state mismatch check at line 354 is bypassed
    // because the attacker has the state value). We now only print the full
    // URL when the browser failed to open AND we genuinely need the user to
    // copy it manually. In the success path the user only sees an opaque
    // "opening browser" line.
    match webbrowser::open(&authorize_url) {
        Ok(_) => {
            eprintln!("\n  [mcp oauth] opened browser for {} (waiting for callback)\n", server_url);
        }
        Err(_) => {
            eprintln!(
                "\n  [mcp oauth] could not open browser for {} — copy this URL manually:\n  {}\n",
                server_url, authorize_url
            );
        }
    }

    // 4. Wait for the redirect (with timeout so headless CI fails fast).
    let (code, returned_state) = tokio::time::timeout(
        OAUTH_INTERACTIVE_TIMEOUT,
        wait_for_callback(listener),
    )
    .await
    .map_err(|_| {
        anyhow!(
            "OAuth flow timed out after {}s — re-run interactively or pre-auth via \
             `agiworkforce mcp oauth login <server>`",
            OAUTH_INTERACTIVE_TIMEOUT.as_secs()
        )
    })??;

    if returned_state != state {
        bail!("oauth state mismatch — possible CSRF, refusing to continue");
    }

    // 5. Exchange the code at the token endpoint.
    let token_url = oauth_cfg
        .token_url
        .as_deref()
        .unwrap_or(&as_meta.token_endpoint);

    let token_resp = exchange_code_form(
        token_url,
        client_id,
        oauth_cfg.client_secret.as_deref(),
        &code,
        &pkce.verifier,
        &redirect_uri,
    )
    .await?;

    // 6. Build the persisted token record.
    Ok(token_response_to_record(
        token_resp,
        Some(token_url.to_string()),
        Some(client_id.to_string()),
        scope_override
            .map(|s| s.to_string())
            .or_else(|| oauth_cfg.scope.clone()),
    ))
}

/// Refresh an existing access token via `grant_type=refresh_token`. Reuses
/// the cached `token_url` + `client_id` from the prior authorization.
pub async fn refresh_token(
    token: &McpOAuthToken,
    oauth_cfg: &McpOAuthConfig,
) -> Result<McpOAuthToken> {
    let refresh = token
        .refresh_token
        .as_deref()
        .ok_or_else(|| anyhow!("no refresh_token cached for this server"))?;

    let token_url = token
        .token_url
        .as_deref()
        .or(oauth_cfg.token_url.as_deref())
        .ok_or_else(|| anyhow!("no token_url cached and none in config"))?;

    let client_id = token
        .client_id
        .as_deref()
        .or(oauth_cfg.client_id.as_deref())
        .ok_or_else(|| anyhow!("no client_id cached and none in config"))?;

    let client = reqwest::Client::builder()
        .timeout(Duration::from_secs(10))
        .build()
        .context("build reqwest client for refresh")?;

    let mut form: Vec<(&str, &str)> = vec![
        ("grant_type", "refresh_token"),
        ("refresh_token", refresh),
        ("client_id", client_id),
    ];
    if let Some(secret) = oauth_cfg.client_secret.as_deref() {
        form.push(("client_secret", secret));
    }

    let resp = client
        .post(token_url)
        .header("Accept", "application/json")
        .form(&form)
        .send()
        .await
        .with_context(|| format!("refresh POST {}", token_url))?;

    if !resp.status().is_success() {
        let status = resp.status();
        let body = resp.text().await.unwrap_or_default();
        bail!("token refresh at {} returned {} — {}", token_url, status, body);
    }

    let parsed: TokenResponseRaw = resp
        .json()
        .await
        .with_context(|| format!("parse refresh response from {}", token_url))?;

    Ok(token_response_to_record(
        parsed,
        Some(token_url.to_string()),
        Some(client_id.to_string()),
        token.scope.clone(),
    ))
}

// ---------------------------------------------------------------------------
// Token response shape
// ---------------------------------------------------------------------------

#[derive(Debug, Deserialize)]
struct TokenResponseRaw {
    access_token: String,
    #[serde(default)]
    refresh_token: Option<String>,
    #[serde(default)]
    token_type: Option<String>,
    #[serde(default)]
    expires_in: Option<u64>,
    #[serde(default)]
    scope: Option<String>,
}

fn token_response_to_record(
    raw: TokenResponseRaw,
    token_url: Option<String>,
    client_id: Option<String>,
    requested_scope: Option<String>,
) -> McpOAuthToken {
    let now = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|d| d.as_secs())
        .unwrap_or(0);
    let expires_at = raw.expires_in.map(|e| now.saturating_add(e));
    McpOAuthToken {
        access_token: raw.access_token,
        refresh_token: raw.refresh_token,
        token_type: raw.token_type.or_else(|| Some("Bearer".to_string())),
        expires_at,
        scope: raw.scope.or(requested_scope),
        auth_server_metadata_url: None,
        token_url,
        client_id,
    }
}

async fn exchange_code_form(
    token_url: &str,
    client_id: &str,
    client_secret: Option<&str>,
    code: &str,
    code_verifier: &str,
    redirect_uri: &str,
) -> Result<TokenResponseRaw> {
    let client = reqwest::Client::builder()
        .timeout(Duration::from_secs(10))
        .build()
        .context("build reqwest client for code exchange")?;

    let mut form: Vec<(&str, &str)> = vec![
        ("grant_type", "authorization_code"),
        ("code", code),
        ("redirect_uri", redirect_uri),
        ("client_id", client_id),
        ("code_verifier", code_verifier),
    ];
    if let Some(secret) = client_secret {
        form.push(("client_secret", secret));
    }

    let resp = client
        .post(token_url)
        .header("Accept", "application/json")
        .form(&form)
        .send()
        .await
        .with_context(|| format!("exchange POST {}", token_url))?;

    if !resp.status().is_success() {
        let status = resp.status();
        let body = resp.text().await.unwrap_or_default();
        bail!("code exchange at {} returned {} — {}", token_url, status, body);
    }

    resp.json::<TokenResponseRaw>()
        .await
        .with_context(|| format!("parse code-exchange response from {}", token_url))
}

// ---------------------------------------------------------------------------
// Loopback callback
// ---------------------------------------------------------------------------

/// Block until exactly one HTTP request hits the loopback listener, parse
/// `?code=…&state=…` out of the request line, send a tiny "you can close
/// this tab" 200 OK response, and return the pair.
async fn wait_for_callback(listener: TcpListener) -> Result<(String, String)> {
    let (mut stream, _peer) = listener
        .accept()
        .await
        .context("accept loopback OAuth callback")?;
    let (read_half, mut write_half) = stream.split();
    let mut reader = BufReader::new(read_half);
    let mut request_line = String::new();
    reader
        .read_line(&mut request_line)
        .await
        .context("read OAuth callback request line")?;

    // Drain the rest of the headers so the client doesn't see a connection
    // reset before we send our response.
    let mut header_line = String::new();
    loop {
        header_line.clear();
        let n = reader
            .read_line(&mut header_line)
            .await
            .context("read OAuth callback headers")?;
        if n == 0 || header_line == "\r\n" || header_line == "\n" {
            break;
        }
    }

    // Send response before processing so the browser shows the success page
    // even if extraction fails.
    let body = "<!doctype html><html><body style=\"font-family:system-ui;text-align:center;padding:3rem;\">\
                <h1>Authorization complete</h1>\
                <p>You can close this tab and return to your terminal.</p>\
                </body></html>";
    let resp = format!(
        "HTTP/1.1 200 OK\r\nContent-Type: text/html; charset=utf-8\r\n\
         Content-Length: {}\r\nConnection: close\r\n\r\n{}",
        body.len(),
        body
    );
    let _ = write_half.write_all(resp.as_bytes()).await;
    let _ = write_half.shutdown().await;

    parse_query_from_request_line(&request_line)
}

/// Pull `code` and `state` out of the GET request line:
///   "GET /callback?code=ABC&state=XYZ HTTP/1.1\r\n"
fn parse_query_from_request_line(request_line: &str) -> Result<(String, String)> {
    // Tokenize: METHOD PATH HTTP/x.y
    let mut parts = request_line.split_whitespace();
    let _method = parts
        .next()
        .ok_or_else(|| anyhow!("malformed callback request line"))?;
    let path = parts
        .next()
        .ok_or_else(|| anyhow!("missing path in callback request"))?;
    let qs_start = path
        .find('?')
        .ok_or_else(|| anyhow!("no query string on callback request"))?;
    let query = &path[qs_start + 1..];

    let mut code: Option<String> = None;
    let mut state: Option<String> = None;
    let mut error: Option<String> = None;
    let mut error_description: Option<String> = None;

    for pair in query.split('&') {
        let (k, v) = match pair.split_once('=') {
            Some(p) => p,
            None => continue,
        };
        let decoded = percent_decode(v);
        match k {
            "code" => code = Some(decoded),
            "state" => state = Some(decoded),
            "error" => error = Some(decoded),
            "error_description" => error_description = Some(decoded),
            _ => {}
        }
    }

    if let Some(err) = error {
        bail!(
            "authorization server returned error: {}{}",
            err,
            error_description
                .map(|d| format!(" — {}", d))
                .unwrap_or_default()
        );
    }

    let code = code.ok_or_else(|| anyhow!("OAuth callback missing `code` param"))?;
    let state = state.ok_or_else(|| anyhow!("OAuth callback missing `state` param"))?;
    Ok((code, state))
}

fn percent_decode(input: &str) -> String {
    // Lightweight inline decoder so we don't pull in a dep just for this.
    let bytes = input.as_bytes();
    let mut out: Vec<u8> = Vec::with_capacity(bytes.len());
    let mut i = 0;
    while i < bytes.len() {
        let b = bytes[i];
        if b == b'%' && i + 2 < bytes.len() {
            let hi = (bytes[i + 1] as char).to_digit(16);
            let lo = (bytes[i + 2] as char).to_digit(16);
            if let (Some(h), Some(l)) = (hi, lo) {
                out.push(((h << 4) | l) as u8);
                i += 3;
                continue;
            }
        }
        if b == b'+' {
            out.push(b' ');
        } else {
            out.push(b);
        }
        i += 1;
    }
    String::from_utf8_lossy(&out).into_owned()
}

// ---------------------------------------------------------------------------
// Authorize URL builder
// ---------------------------------------------------------------------------

fn build_authorize_url(
    authorize_endpoint: &str,
    client_id: &str,
    redirect_uri: &str,
    scope: &str,
    code_challenge: &str,
    state: &str,
) -> String {
    let sep = if authorize_endpoint.contains('?') { '&' } else { '?' };
    let mut out = format!(
        "{base}{sep}response_type=code&client_id={cid}&redirect_uri={ru}&\
         code_challenge={chal}&code_challenge_method=S256&state={st}",
        base = authorize_endpoint,
        sep = sep,
        cid = url_encode(client_id),
        ru = url_encode(redirect_uri),
        chal = url_encode(code_challenge),
        st = url_encode(state),
    );
    if !scope.is_empty() {
        out.push_str(&format!("&scope={}", url_encode(scope)));
    }
    out
}

fn url_encode(input: &str) -> String {
    let mut out = String::with_capacity(input.len() * 2);
    for b in input.bytes() {
        match b {
            b'A'..=b'Z' | b'a'..=b'z' | b'0'..=b'9' | b'-' | b'_' | b'.' | b'~' => {
                out.push(b as char);
            }
            _ => out.push_str(&format!("%{:02X}", b)),
        }
    }
    out
}

// ---------------------------------------------------------------------------
// High-level driver
// ---------------------------------------------------------------------------

/// End-to-end OAuth bringup for a single MCP server.
///
/// 1. Discover the protected resource (RFC 9728).
/// 2. Discover the authorization server (RFC 8414).
/// 3. If `oauth_cfg.client_id` is unset and the AS exposes
///    `registration_endpoint`, dynamically register (RFC 7591).
/// 4. Run the PKCE flow.
/// 5. Return the persisted token record (caller is responsible for saving).
pub async fn perform_full_oauth(
    server_url: &str,
    oauth_cfg: &McpOAuthConfig,
    www_authenticate: Option<&str>,
    scope_override: Option<&str>,
) -> Result<McpOAuthToken> {
    // 1. Resource metadata.
    let (metadata_url, prm) =
        discover_protected_resource(server_url, www_authenticate).await?;

    // 2. AS metadata. Use the first AS the server points us at.
    let as_url = prm
        .authorization_servers
        .first()
        .ok_or_else(|| anyhow!("no authorization_servers in protected-resource metadata"))?;
    let as_meta = discover_authorization_server(as_url).await?;

    // 3. Bind the loopback callback BEFORE registration so we can give the
    //    AS the *exact* redirect_uri (with the real port) we'll be listening
    //    on. CLI-NEW-MCP-OAUTH-PORT-MISMATCH fix (2026-05-05): previously a
    //    port-less placeholder was registered and `start_pkce_flow` rebound
    //    on a random port, producing a registered ≠ requested redirect_uri
    //    mismatch on AS implementations that don't honour RFC 8252 §7.3.
    let (listener, redirect_uri) = prepare_loopback_callback(oauth_cfg).await?;

    // 4. Client id: pre-supplied wins; otherwise try dynamic registration
    //    using the real redirect_uri we just bound.
    let client_id = if let Some(cid) = oauth_cfg.client_id.clone() {
        cid
    } else if let Some(reg_url) = as_meta.registration_endpoint.as_deref() {
        let reg = dynamic_register(reg_url, &redirect_uri).await?;
        reg.client_id
    } else {
        bail!(
            "MCP server requires OAuth but no client_id was supplied and the AS \
             does not advertise a registration_endpoint — set [auth.client_id] \
             in your config"
        );
    };

    // 5. Run PKCE using the same listener+URI that was registered.
    let mut token = start_pkce_flow(
        server_url,
        oauth_cfg,
        &as_meta,
        &client_id,
        scope_override,
        listener,
        redirect_uri,
    )
    .await?;
    // Stash the metadata URL so refresh skips re-discovery next time.
    token.auth_server_metadata_url = Some(metadata_url);
    Ok(token)
}

// ---------------------------------------------------------------------------
// Tests (parsing helpers only — flows hit real network/browser)
// ---------------------------------------------------------------------------

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn parses_resource_metadata_from_www_authenticate() {
        let h = r#"Bearer realm="mcp", resource_metadata="https://example.com/.well-known/oauth-protected-resource""#;
        assert_eq!(
            parse_resource_metadata_url(Some(h)).as_deref(),
            Some("https://example.com/.well-known/oauth-protected-resource")
        );
    }

    #[test]
    fn no_resource_metadata_when_header_missing() {
        assert!(parse_resource_metadata_url(None).is_none());
        assert!(parse_resource_metadata_url(Some("Bearer realm=\"x\"")).is_none());
    }

    #[test]
    fn detects_insufficient_scope() {
        let h = r#"Bearer error="insufficient_scope", scope="messages:write""#;
        assert_eq!(
            parse_insufficient_scope(Some(h)).as_deref(),
            Some("messages:write")
        );
    }

    #[test]
    fn ignores_other_errors() {
        let h = r#"Bearer error="invalid_token""#;
        assert!(parse_insufficient_scope(Some(h)).is_none());
    }

    // ---- prepare_loopback_callback (CLI-NEW-MCP-OAUTH-PORT-MISMATCH) ----

    /// Helper: build an `McpOAuthConfig` with only `redirect_uri` set.
    /// `McpOAuthConfig` has no `Default` impl so we enumerate fields here;
    /// any new field added to the struct will surface as a compile error
    /// in this helper, which is the right place to be reminded.
    fn cfg_with_redirect(redirect: Option<&str>) -> McpOAuthConfig {
        McpOAuthConfig {
            authorize_url: None,
            token_url: None,
            scope: None,
            client_id: None,
            client_secret: None,
            redirect_uri: redirect.map(String::from),
        }
    }

    /// No redirect_uri configured → bind random loopback port and return a
    /// matching URI. The URI's port must equal the listener's bound port.
    #[tokio::test]
    async fn prepare_loopback_callback_default_uses_random_port() {
        let cfg = cfg_with_redirect(None);
        let (listener, uri) = super::prepare_loopback_callback(&cfg)
            .await
            .expect("default loopback bind should succeed");
        let bound_port = listener.local_addr().unwrap().port();
        let parsed = reqwest::Url::parse(&uri).expect("returned uri must parse");
        assert_eq!(parsed.host_str(), Some("127.0.0.1"));
        assert_eq!(
            parsed.port(),
            Some(bound_port),
            "uri port {} must match bound listener port {}",
            uri,
            bound_port
        );
        assert_eq!(parsed.path(), "/callback");
    }

    /// Explicit loopback redirect_uri WITH a port → bind that exact port
    /// and round-trip the URI verbatim. Asserts the registered URI and the
    /// listener's port are identical, which is the whole point of this fix.
    #[tokio::test]
    async fn prepare_loopback_callback_honours_explicit_loopback_port() {
        // Pick a port at random by binding a temp socket, releasing it,
        // and using its number — avoids hard-coding a port that might be
        // in use on some dev's machine.
        let scratch = tokio::net::TcpListener::bind("127.0.0.1:0").await.unwrap();
        let chosen_port = scratch.local_addr().unwrap().port();
        drop(scratch);

        let configured = format!("http://127.0.0.1:{}/callback", chosen_port);
        let cfg = cfg_with_redirect(Some(&configured));
        let (listener, uri) = super::prepare_loopback_callback(&cfg)
            .await
            .expect("explicit loopback bind should succeed");
        assert_eq!(uri, configured, "uri must round-trip the configured value");
        assert_eq!(listener.local_addr().unwrap().port(), chosen_port);
    }

    /// Non-loopback redirect_uri → refuse, since we can only listen on
    /// loopback. Prevents the user from kicking off an OAuth flow whose
    /// callback could never reach them.
    #[tokio::test]
    async fn prepare_loopback_callback_rejects_non_loopback() {
        let cfg = cfg_with_redirect(Some("https://example.com/oauth/callback"));
        let err = super::prepare_loopback_callback(&cfg)
            .await
            .expect_err("non-loopback redirect_uri must error");
        let msg = err.to_string();
        assert!(
            msg.contains("not a loopback address"),
            "expected loopback rejection, got: {}",
            msg
        );
    }

    /// Loopback redirect_uri WITHOUT a port (the legacy placeholder
    /// pattern `http://127.0.0.1/callback`) → fall through to random port
    /// rather than honouring the URI verbatim. Prevents the AS from being
    /// registered with port 80 (which we never listen on).
    #[tokio::test]
    async fn prepare_loopback_callback_rebinds_portless_placeholder() {
        let cfg = cfg_with_redirect(Some("http://127.0.0.1/callback"));
        let (listener, uri) = super::prepare_loopback_callback(&cfg)
            .await
            .expect("portless placeholder should fall through to random bind");
        let bound_port = listener.local_addr().unwrap().port();
        assert!(
            uri.contains(&format!(":{}/callback", bound_port)),
            "returned URI {} should include real bound port {}",
            uri,
            bound_port
        );
        // Crucially: NOT the port-less placeholder.
        assert_ne!(uri, "http://127.0.0.1/callback");
    }

    #[test]
    fn well_known_root_strip() {
        assert_eq!(
            well_known("https://mcp.example.com/some/path/", "oauth-protected-resource"),
            "https://mcp.example.com/.well-known/oauth-protected-resource"
        );
        assert_eq!(
            well_known("https://mcp.example.com", "oauth-authorization-server"),
            "https://mcp.example.com/.well-known/oauth-authorization-server"
        );
    }

    #[test]
    fn parses_callback_query() {
        let line = "GET /callback?code=ABC&state=XYZ HTTP/1.1\r\n";
        let (code, state) = parse_query_from_request_line(line).unwrap();
        assert_eq!(code, "ABC");
        assert_eq!(state, "XYZ");
    }

    #[test]
    fn percent_decodes_plus_and_hex() {
        assert_eq!(percent_decode("a%20b+c"), "a b c");
        assert_eq!(percent_decode("hello%21"), "hello!");
    }

    #[test]
    fn callback_surfaces_authorization_errors() {
        let line = "GET /callback?error=access_denied&error_description=user%20declined HTTP/1.1\r\n";
        let err = parse_query_from_request_line(line).unwrap_err();
        let msg = format!("{}", err);
        assert!(msg.contains("access_denied"));
        assert!(msg.contains("user declined"));
    }

    #[test]
    fn build_authorize_url_with_query_existing() {
        let u = build_authorize_url(
            "https://example.com/auth?foo=bar",
            "cid",
            "http://127.0.0.1:1234/callback",
            "read write",
            "challenge",
            "state123",
        );
        assert!(u.contains("foo=bar&response_type=code"));
        assert!(u.contains("scope=read%20write"));
        assert!(u.contains("code_challenge_method=S256"));
    }

    #[test]
    fn build_authorize_url_without_query() {
        let u = build_authorize_url(
            "https://example.com/auth",
            "cid",
            "http://127.0.0.1:1234/callback",
            "",
            "challenge",
            "state123",
        );
        assert!(u.starts_with("https://example.com/auth?response_type=code"));
        // No scope param when scope is empty.
        assert!(!u.contains("scope="));
    }
}
