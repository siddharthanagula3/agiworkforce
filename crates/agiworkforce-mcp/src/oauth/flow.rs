//! OAuth 2.0 + PKCE flow for MCP servers.
//!
//! Implements the happy paths of:
//!
//! * RFC 9728 — OAuth 2.0 Protected Resource Metadata (server tells us where
//!   its authorization server lives, either via the `WWW-Authenticate: Bearer
//!   resource_metadata="<url>"` challenge or via
//!   `<server>/.well-known/oauth-protected-resource`).
//! * RFC 8414 — OAuth 2.0 Authorization Server Metadata (discovers the
//!   `authorization_endpoint`, `token_endpoint`, optional
//!   `registration_endpoint`).
//! * RFC 7591 — Dynamic Client Registration (only when the caller doesn't
//!   supply a `client_id`).
//! * RFC 6749 / RFC 7636 — Authorization-Code grant with PKCE.
//!
//! Browser launch is delegated to the host via [`BrowserAuthorizer`] so the
//! CLI's user-action chokepoint stays authoritative.

use anyhow::{Context, Result, anyhow, bail};
use serde::{Deserialize, Serialize};
use std::time::{Duration, SystemTime, UNIX_EPOCH};
use tokio::io::{AsyncBufReadExt, AsyncWriteExt, BufReader};
use tokio::net::TcpListener;

use super::pkce::{generate_pkce, generate_random_string};
use crate::config::OAuthConfig;
use crate::hooks::{BrowserAuthorizer, OAuthToken};
use crate::security::{self, ValidatedEndpoint};

/// Hard cap on the loopback wait so headless invocations fail fast.
const OAUTH_INTERACTIVE_TIMEOUT: Duration = Duration::from_secs(120);

/// Every URL this module fetches is named by the remote MCP server (the
/// `WWW-Authenticate` challenge, protected-resource metadata, AS metadata) or
/// by a cached record derived from it. Each one is validated and DNS-pinned
/// before the request, and redirects are refused so a 302 cannot walk the
/// pinned connection over to an internal host.
fn pinned_client(endpoint: &ValidatedEndpoint, purpose: &str) -> Result<reqwest::Client> {
    reqwest::Client::builder()
        .timeout(Duration::from_secs(10))
        .redirect(reqwest::redirect::Policy::none())
        .resolve_to_addrs(&endpoint.host, &endpoint.addrs)
        .build()
        .with_context(|| format!("build reqwest client for {purpose}"))
}

/// `anchor` is the URL the user configured for this server: every endpoint the
/// remote party names is checked against it, so discovery can never reach
/// further into this machine than the server itself does.
async fn checked_endpoint(url: &str, what: &str, anchor: &str) -> Result<ValidatedEndpoint> {
    security::resolve_validated_endpoint(url, anchor)
        .await
        .with_context(|| format!("{what} {url}"))
}

/// A failing endpoint's body is echoed back only when it is a structured OAuth
/// error (RFC 6749 §5.2). Anything else is the content of whatever the URL
/// actually pointed at, and reflecting that into an error the host logs is the
/// read channel of a blind SSRF.
async fn failure_detail(resp: reqwest::Response, what: &str) -> String {
    let body = security::read_body_capped(resp, what)
        .await
        .unwrap_or_default();
    oauth_error_detail(&body).unwrap_or_else(|| "response body withheld".to_string())
}

fn oauth_error_detail(body: &[u8]) -> Option<String> {
    let parsed: serde_json::Value = serde_json::from_slice(body).ok()?;
    let code = parsed.get("error")?.as_str()?;
    let mut detail = clamp(code, 80);
    if let Some(description) = parsed.get("error_description").and_then(|d| d.as_str()) {
        detail.push_str(": ");
        detail.push_str(&clamp(description, 200));
    }
    Some(detail)
}

fn clamp(text: &str, max_chars: usize) -> String {
    let cleaned: String = text.chars().filter(|c| !c.is_control()).collect();
    match cleaned.char_indices().nth(max_chars) {
        Some((idx, _)) => format!("{}…", &cleaned[..idx]),
        None => cleaned,
    }
}

/// A configured `client_secret` is a credential the user holds, not one the
/// server issued: it may only be sent to an origin the user named in config.
/// Without `[auth.token_url]` the endpoint comes from discovery, i.e. from
/// whatever the remote server advertised, so the secret stays home.
fn confidential_client_secret<'a>(
    oauth_cfg: &'a OAuthConfig,
    token_url: &str,
) -> Result<Option<&'a str>> {
    let Some(secret) = oauth_cfg.client_secret.as_deref() else {
        return Ok(None);
    };
    let pinned = oauth_cfg.token_url.as_deref().ok_or_else(|| {
        anyhow!(
            "refusing to send the configured client_secret to the discovered token endpoint \
             {token_url} — set [auth.token_url] so the secret only ever reaches an endpoint you named"
        )
    })?;
    security::enforce_same_origin(pinned, token_url, "token endpoint")
        .context("refusing to send the configured client_secret to another origin")?;
    Ok(Some(secret))
}

// ---------------------------------------------------------------------------
// Discovery types
// ---------------------------------------------------------------------------

/// RFC 9728 protected-resource metadata.
#[derive(Debug, Clone, Deserialize)]
pub struct ProtectedResourceMetadata {
    #[serde(default)]
    pub authorization_servers: Vec<String>,
    /// Resource identifier the AS will issue tokens for. Captured for future
    /// audience-binding work; not consumed yet.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    #[allow(dead_code)]
    pub resource: Option<String>,
}

/// RFC 8414 authorization-server metadata.
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
    /// Scopes the AS advertises. Captured for future scope-narrowing; unused.
    #[serde(default)]
    #[allow(dead_code)]
    pub scopes_supported: Vec<String>,
}

/// Result of dynamic client registration (RFC 7591).
#[derive(Debug, Clone, Deserialize)]
pub struct RegisteredClient {
    pub client_id: String,
    /// Confidential-client secret. Captured because some servers always return
    /// it even for `token_endpoint_auth_method=none`; not consumed (public client).
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
/// Best-effort; does not try to handle every escape sequence.
fn parse_param(header: &str, key: &str) -> Option<String> {
    let needle = format!("{key}=");
    let lower = header.to_ascii_lowercase();
    let needle_lower = needle.to_ascii_lowercase();
    let idx = lower.find(&needle_lower)?;
    let after = &header[idx + needle.len()..];
    if let Some(stripped) = after.strip_prefix('"') {
        let end = stripped.find('"')?;
        Some(stripped[..end].to_string())
    } else {
        let end = after
            .find(|c: char| c == ',' || c.is_whitespace())
            .unwrap_or(after.len());
        Some(after[..end].to_string())
    }
}

/// Detect a step-up auth challenge per RFC 9470 / RFC 6750 §3.1. Returns the
/// `scope` parameter from the challenge if `error="insufficient_scope"`.
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
pub async fn discover_protected_resource(
    server_url: &str,
    www_authenticate: Option<&str>,
) -> Result<(String, ProtectedResourceMetadata)> {
    // RFC 9728 §5.1: the challenge may only point at the resource server's own
    // metadata. Without this the server chooses any URL it likes and this
    // process fetches it — the SSRF primitive, loopback services included.
    let metadata_url = match parse_resource_metadata_url(www_authenticate) {
        Some(advertised) => {
            security::enforce_same_origin(server_url, &advertised, "protected-resource metadata")
                .with_context(|| {
                format!(
                    "SSRF protection: the WWW-Authenticate challenge from {server_url} named \
                         protected-resource metadata on another origin"
                )
            })?;
            advertised
        }
        None => well_known(server_url, "oauth-protected-resource"),
    };

    let endpoint =
        checked_endpoint(&metadata_url, "protected-resource metadata URL", server_url).await?;
    let client = pinned_client(&endpoint, "resource-metadata discovery")?;

    let resp = client
        .get(endpoint.url.clone())
        .header("Accept", "application/json")
        .send()
        .await
        .with_context(|| format!("fetch protected-resource metadata at {metadata_url}"))?;

    if !resp.status().is_success() {
        let status = resp.status();
        let body = failure_detail(resp, "protected-resource metadata").await;
        bail!("protected-resource metadata at {metadata_url} returned {status} — {body}");
    }

    let body = security::read_body_capped(resp, "protected-resource metadata").await?;
    let meta: ProtectedResourceMetadata = serde_json::from_slice(&body)
        .with_context(|| format!("parse protected-resource metadata at {metadata_url}"))?;

    if meta.authorization_servers.is_empty() {
        bail!("protected-resource metadata at {metadata_url} contains no authorization_servers");
    }

    Ok((metadata_url, meta))
}

/// Discover the authorization server's endpoints (RFC 8414). `server_url` is
/// the MCP server the user configured; the AS it names may live on another
/// origin but not on a network the MCP server itself cannot reach.
pub async fn discover_authorization_server(as_url: &str, server_url: &str) -> Result<AsMetadata> {
    let metadata_url = well_known(as_url, "oauth-authorization-server");

    let endpoint = checked_endpoint(
        &metadata_url,
        "authorization-server metadata URL",
        server_url,
    )
    .await?;
    let client = pinned_client(&endpoint, "AS discovery")?;

    let resp = client
        .get(endpoint.url.clone())
        .header("Accept", "application/json")
        .send()
        .await
        .with_context(|| format!("fetch AS metadata at {metadata_url}"))?;

    if !resp.status().is_success() {
        let status = resp.status();
        let body = failure_detail(resp, "AS metadata").await;
        bail!("AS metadata at {metadata_url} returned {status} — {body}");
    }

    let body = security::read_body_capped(resp, "AS metadata").await?;
    serde_json::from_slice::<AsMetadata>(&body)
        .with_context(|| format!("parse AS metadata at {metadata_url}"))
}

/// Build a `<scheme>://<host>/.well-known/<suffix>` URL from any URL.
fn well_known(base: &str, suffix: &str) -> String {
    let trimmed = base.trim_end_matches('/');
    if let Some(scheme_end) = trimmed.find("://") {
        let after_scheme = &trimmed[scheme_end + 3..];
        if let Some(slash) = after_scheme.find('/') {
            let host = &trimmed[..scheme_end + 3 + slash];
            return format!("{host}/.well-known/{suffix}");
        }
    }
    format!("{trimmed}/.well-known/{suffix}")
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

pub async fn dynamic_register(
    reg_endpoint: &str,
    redirect_uri: &str,
    server_url: &str,
) -> Result<RegisteredClient> {
    let endpoint = checked_endpoint(reg_endpoint, "registration endpoint", server_url).await?;
    let client = pinned_client(&endpoint, "dynamic registration")?;

    let body = RegistrationRequest {
        client_name: "AGI CLI",
        redirect_uris: vec![redirect_uri],
        grant_types: vec!["authorization_code", "refresh_token"],
        response_types: vec!["code"],
        token_endpoint_auth_method: "none",
    };

    let resp = client
        .post(endpoint.url.clone())
        .header("Content-Type", "application/json")
        .header("Accept", "application/json")
        .json(&body)
        .send()
        .await
        .with_context(|| format!("dynamic-register POST {reg_endpoint}"))?;

    if !resp.status().is_success() {
        let status = resp.status();
        let body = failure_detail(resp, "dynamic registration").await;
        bail!("dynamic registration at {reg_endpoint} returned {status} — {body}");
    }

    let body = security::read_body_capped(resp, "dynamic registration").await?;
    serde_json::from_slice::<RegisteredClient>(&body)
        .with_context(|| format!("parse registration response from {reg_endpoint}"))
}

// ---------------------------------------------------------------------------
// PKCE flow
// ---------------------------------------------------------------------------

/// Bind a loopback listener for the OAuth callback and derive the redirect URI
/// that matches it.
///
/// Centralized so dynamic registration and the PKCE flow are both driven by the
/// SAME (listener, redirect_uri) pair — eliminating the prior bug where
/// `dynamic_register` used a port-less placeholder while `start_pkce_flow`
/// bound a fresh random port, producing a `redirect_uri` mismatch on
/// authorization servers that don't honour RFC 8252 §7.3.
async fn prepare_loopback_callback(oauth_cfg: &OAuthConfig) -> Result<(TcpListener, String)> {
    if let Some(uri) = oauth_cfg.redirect_uri.as_deref() {
        let parsed = reqwest::Url::parse(uri)
            .with_context(|| format!("invalid redirect_uri in config: {uri}"))?;
        let host = parsed.host_str().unwrap_or("");
        let is_loopback = host == "127.0.0.1" || host == "[::1]" || host == "localhost";
        if is_loopback {
            if let Some(port) = parsed.port() {
                let bind_host = if host == "[::1]" {
                    "[::1]"
                } else {
                    "127.0.0.1"
                };
                let listener = TcpListener::bind(format!("{bind_host}:{port}"))
                    .await
                    .with_context(|| {
                        format!("bind loopback listener at configured redirect_uri {uri}")
                    })?;
                return Ok((listener, uri.to_string()));
            }
            // Loopback with no port — placeholder pattern. Bind a real port and
            // rewrite the URI so RFC-strict AS implementations are happy.
        }
        // Non-loopback redirect_uri: this binary can only receive the callback
        // on loopback. Refuse rather than burn the user's time.
        if !is_loopback {
            bail!(
                "redirect_uri {uri} is not a loopback address; \
                 the agiworkforce client can only receive OAuth callbacks on 127.0.0.1 / [::1]"
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
/// `client_id` may be either pre-supplied or the output of dynamic
/// registration; this function doesn't care which. `scope_override` lets
/// callers force a scope on step-up auth. Browser launch goes through
/// `browser` so the host's user-action gate stays authoritative.
#[allow(clippy::too_many_arguments)]
pub async fn start_pkce_flow(
    server_url: &str,
    oauth_cfg: &OAuthConfig,
    as_meta: &AsMetadata,
    client_id: &str,
    scope_override: Option<&str>,
    listener: TcpListener,
    redirect_uri: String,
    browser: &dyn BrowserAuthorizer,
) -> Result<OAuthToken> {
    let pkce = generate_pkce();
    let state = generate_random_string(32);
    let scope = scope_override
        .map(str::to_string)
        .or_else(|| oauth_cfg.scope.clone())
        .unwrap_or_default();

    let authorize_endpoint = oauth_cfg
        .authorize_url
        .as_deref()
        .unwrap_or(&as_meta.authorization_endpoint);
    security::validate_browser_endpoint(authorize_endpoint, server_url)
        .with_context(|| format!("authorization endpoint {authorize_endpoint}"))?;

    // Both are settled before the browser opens so an unusable token endpoint
    // fails here instead of after the user has already authorized.
    let token_url = oauth_cfg
        .token_url
        .as_deref()
        .unwrap_or(&as_meta.token_endpoint);
    let client_secret = confidential_client_secret(oauth_cfg, token_url)?;

    let authorize_url = build_authorize_url(
        authorize_endpoint,
        client_id,
        &redirect_uri,
        &scope,
        &pkce.challenge,
        &state,
    );

    // Open browser through the host chokepoint; if it declines/fails, print the
    // URL so the user can copy it. Only print the full URL (including `state`)
    // in that fallback path — never on the success path — so a sibling process
    // reading the terminal can't race the loopback callback.
    if browser.open_url(&authorize_url) {
        eprintln!("\n  [mcp oauth] opened browser for {server_url} (waiting for callback)\n");
    } else {
        eprintln!(
            "\n  [mcp oauth] could not open browser for {server_url} — copy this URL manually:\n  {authorize_url}\n"
        );
    }

    // Wait for the redirect (with timeout so headless CI fails fast).
    let (code, returned_state) =
        tokio::time::timeout(OAUTH_INTERACTIVE_TIMEOUT, wait_for_callback(listener))
            .await
            .map_err(|_| {
                anyhow!(
                    "OAuth flow timed out after {}s — re-run interactively or pre-auth via \
             `agi mcp oauth login <server>`",
                    OAUTH_INTERACTIVE_TIMEOUT.as_secs()
                )
            })??;

    if returned_state != state {
        bail!("oauth state mismatch — possible CSRF, refusing to continue");
    }

    let token_resp = exchange_code_form(
        token_url,
        client_id,
        client_secret,
        &code,
        &pkce.verifier,
        &redirect_uri,
        server_url,
    )
    .await?;

    Ok(token_response_to_record(
        token_resp,
        Some(token_url.to_string()),
        Some(client_id.to_string()),
        scope_override
            .map(str::to_string)
            .or_else(|| oauth_cfg.scope.clone()),
    ))
}

/// Refresh an existing access token via `grant_type=refresh_token`. Reuses the
/// cached `token_url` + `client_id` from the prior authorization.
pub async fn refresh_token(token: &OAuthToken, oauth_cfg: &OAuthConfig) -> Result<OAuthToken> {
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

    // The cached token_url came from AS metadata the remote server pointed us
    // at. When the config declares a token endpoint, that is the user's stated
    // authority: a cached value from another origin means the cache (or the
    // discovery that filled it) was poisoned, and this request would hand a
    // refresh_token and client_secret to whoever owns that origin.
    if let Some(configured) = oauth_cfg.token_url.as_deref() {
        security::enforce_same_origin(configured, token_url, "token endpoint")
            .context("refusing to send the cached refresh token to another origin")?;
    }
    let client_secret = confidential_client_secret(oauth_cfg, token_url)?;

    // Refresh runs with no server URL in hand, so the resource metadata URL
    // recorded when this token was issued is the anchor: a record whose token
    // endpoint sits on loopback is only honoured for a loopback deployment.
    let anchor = token
        .auth_server_metadata_url
        .as_deref()
        .unwrap_or_default();
    let endpoint = checked_endpoint(token_url, "token endpoint", anchor).await?;
    let client = pinned_client(&endpoint, "refresh")?;

    let mut form: Vec<(&str, &str)> = vec![
        ("grant_type", "refresh_token"),
        ("refresh_token", refresh),
        ("client_id", client_id),
    ];
    if let Some(secret) = client_secret {
        form.push(("client_secret", secret));
    }

    let resp = client
        .post(endpoint.url.clone())
        .header("Accept", "application/json")
        .form(&form)
        .send()
        .await
        .with_context(|| format!("refresh POST {token_url}"))?;

    if !resp.status().is_success() {
        let status = resp.status();
        let body = failure_detail(resp, "token refresh").await;
        bail!("token refresh at {token_url} returned {status} — {body}");
    }

    let body = security::read_body_capped(resp, "token refresh").await?;
    let parsed: TokenResponseRaw = serde_json::from_slice(&body)
        .with_context(|| format!("parse refresh response from {token_url}"))?;

    let mut refreshed = token_response_to_record(
        parsed,
        Some(token_url.to_string()),
        Some(client_id.to_string()),
        token.scope.clone(),
    );
    refreshed.auth_server_metadata_url = token.auth_server_metadata_url.clone();
    Ok(refreshed)
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
) -> OAuthToken {
    let now = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|d| d.as_secs())
        .unwrap_or(0);
    let expires_at = raw.expires_in.map(|e| now.saturating_add(e));
    OAuthToken {
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

#[allow(clippy::too_many_arguments)]
async fn exchange_code_form(
    token_url: &str,
    client_id: &str,
    client_secret: Option<&str>,
    code: &str,
    code_verifier: &str,
    redirect_uri: &str,
    server_url: &str,
) -> Result<TokenResponseRaw> {
    let endpoint = checked_endpoint(token_url, "token endpoint", server_url).await?;
    let client = pinned_client(&endpoint, "code exchange")?;

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
        .post(endpoint.url.clone())
        .header("Accept", "application/json")
        .form(&form)
        .send()
        .await
        .with_context(|| format!("exchange POST {token_url}"))?;

    if !resp.status().is_success() {
        let status = resp.status();
        let body = failure_detail(resp, "code exchange").await;
        bail!("code exchange at {token_url} returned {status} — {body}");
    }

    let body = security::read_body_capped(resp, "code exchange").await?;
    serde_json::from_slice::<TokenResponseRaw>(&body)
        .with_context(|| format!("parse code-exchange response from {token_url}"))
}

// ---------------------------------------------------------------------------
// Loopback callback
// ---------------------------------------------------------------------------

/// Block until exactly one HTTP request hits the loopback listener, parse
/// `?code=…&state=…` out of the request line, send a tiny "you can close this
/// tab" 200 OK response, and return the pair.
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

    // Drain the rest of the headers so the client doesn't see a connection reset
    // before we send our response.
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

    // Send response before processing so the browser shows the success page even
    // if extraction fails.
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
            "authorization server returned error: {err}{}",
            error_description
                .map(|d| format!(" — {d}"))
                .unwrap_or_default()
        );
    }

    let code = code.ok_or_else(|| anyhow!("OAuth callback missing `code` param"))?;
    let state = state.ok_or_else(|| anyhow!("OAuth callback missing `state` param"))?;
    Ok((code, state))
}

fn percent_decode(input: &str) -> String {
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
    let sep = if authorize_endpoint.contains('?') {
        '&'
    } else {
        '?'
    };
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
            _ => out.push_str(&format!("%{b:02X}")),
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
/// 3. If `oauth_cfg.client_id` is unset and the AS exposes a
///    `registration_endpoint`, dynamically register (RFC 7591).
/// 4. Run the PKCE flow.
/// 5. Return the token record (caller persists via the host token store).
pub async fn perform_full_oauth(
    server_url: &str,
    oauth_cfg: &OAuthConfig,
    www_authenticate: Option<&str>,
    scope_override: Option<&str>,
    browser: &dyn BrowserAuthorizer,
) -> Result<OAuthToken> {
    // 1. Resource metadata.
    let (metadata_url, prm) = discover_protected_resource(server_url, www_authenticate).await?;

    // 2. AS metadata. Use the first AS the server points us at.
    let as_url = prm
        .authorization_servers
        .first()
        .ok_or_else(|| anyhow!("no authorization_servers in protected-resource metadata"))?;
    let as_meta = discover_authorization_server(as_url, server_url).await?;

    // 3. Bind the loopback callback BEFORE registration so the AS is given the
    //    exact redirect_uri (with the real port) we'll be listening on.
    let (listener, redirect_uri) = prepare_loopback_callback(oauth_cfg).await?;

    // 4. Client id: pre-supplied wins; otherwise try dynamic registration.
    let client_id = if let Some(cid) = oauth_cfg.client_id.clone() {
        cid
    } else if let Some(reg_url) = as_meta.registration_endpoint.as_deref() {
        let reg = dynamic_register(reg_url, &redirect_uri, server_url).await?;
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
        browser,
    )
    .await?;
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

    fn cfg_with_redirect(redirect: Option<&str>) -> OAuthConfig {
        OAuthConfig {
            redirect_uri: redirect.map(String::from),
            ..Default::default()
        }
    }

    #[tokio::test]
    async fn prepare_loopback_callback_default_uses_random_port() {
        let cfg = cfg_with_redirect(None);
        let (listener, uri) = super::prepare_loopback_callback(&cfg)
            .await
            .expect("default loopback bind should succeed");
        let bound_port = listener.local_addr().unwrap().port();
        let parsed = reqwest::Url::parse(&uri).expect("returned uri must parse");
        assert_eq!(parsed.host_str(), Some("127.0.0.1"));
        assert_eq!(parsed.port(), Some(bound_port));
        assert_eq!(parsed.path(), "/callback");
    }

    #[tokio::test]
    async fn prepare_loopback_callback_honours_explicit_loopback_port() {
        let scratch = tokio::net::TcpListener::bind("127.0.0.1:0").await.unwrap();
        let chosen_port = scratch.local_addr().unwrap().port();
        drop(scratch);

        let configured = format!("http://127.0.0.1:{chosen_port}/callback");
        let cfg = cfg_with_redirect(Some(&configured));
        let (listener, uri) = super::prepare_loopback_callback(&cfg)
            .await
            .expect("explicit loopback bind should succeed");
        assert_eq!(uri, configured, "uri must round-trip the configured value");
        assert_eq!(listener.local_addr().unwrap().port(), chosen_port);
    }

    #[tokio::test]
    async fn prepare_loopback_callback_rejects_non_loopback() {
        let cfg = cfg_with_redirect(Some("https://example.com/oauth/callback"));
        let err = super::prepare_loopback_callback(&cfg)
            .await
            .expect_err("non-loopback redirect_uri must error");
        assert!(
            err.to_string().contains("not a loopback address"),
            "expected loopback rejection, got: {err}"
        );
    }

    #[tokio::test]
    async fn prepare_loopback_callback_rebinds_portless_placeholder() {
        let cfg = cfg_with_redirect(Some("http://127.0.0.1/callback"));
        let (listener, uri) = super::prepare_loopback_callback(&cfg)
            .await
            .expect("portless placeholder should fall through to random bind");
        let bound_port = listener.local_addr().unwrap().port();
        assert!(
            uri.contains(&format!(":{bound_port}/callback")),
            "returned URI {uri} should include real bound port {bound_port}"
        );
        assert_ne!(uri, "http://127.0.0.1/callback");
    }

    #[test]
    fn well_known_root_strip() {
        assert_eq!(
            well_known(
                "https://mcp.example.com/some/path/",
                "oauth-protected-resource"
            ),
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
        let line =
            "GET /callback?error=access_denied&error_description=user%20declined HTTP/1.1\r\n";
        let err = parse_query_from_request_line(line).unwrap_err();
        let msg = format!("{err}");
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

    const REMOTE_SERVER: &str = "https://mcp.example.com/mcp";

    fn token_from(server_url: &str, token_url: &str) -> OAuthToken {
        OAuthToken {
            access_token: "stale-access".into(),
            refresh_token: Some("real-refresh-token".into()),
            token_type: Some("Bearer".into()),
            expires_at: None,
            scope: None,
            auth_server_metadata_url: Some(well_known(server_url, "oauth-protected-resource")),
            token_url: Some(token_url.into()),
            client_id: Some("cid".into()),
        }
    }

    fn token_with(token_url: &str) -> OAuthToken {
        token_from(REMOTE_SERVER, token_url)
    }

    fn as_meta_with(authorization_endpoint: &str, token_endpoint: &str) -> AsMetadata {
        AsMetadata {
            authorization_endpoint: authorization_endpoint.into(),
            token_endpoint: token_endpoint.into(),
            registration_endpoint: None,
            revocation_endpoint: None,
            scopes_supported: Vec::new(),
        }
    }

    #[derive(Default)]
    struct SpyBrowser {
        opened: std::sync::Mutex<Vec<String>>,
    }

    impl BrowserAuthorizer for SpyBrowser {
        fn is_interactive(&self) -> bool {
            true
        }
        fn open_url(&self, url: &str) -> bool {
            self.opened.lock().unwrap().push(url.to_string());
            true
        }
    }

    async fn pkce_refusal(oauth_cfg: OAuthConfig, as_meta: AsMetadata) -> (String, usize) {
        let spy = SpyBrowser::default();
        let listener = tokio::net::TcpListener::bind("127.0.0.1:0").await.unwrap();
        let err = start_pkce_flow(
            REMOTE_SERVER,
            &oauth_cfg,
            &as_meta,
            "cid",
            None,
            listener,
            "http://127.0.0.1:1234/callback".to_string(),
            &spy,
        )
        .await
        .expect_err("the flow must refuse before any browser opens");
        let opened = spy.opened.lock().unwrap().len();
        (format!("{err:#}"), opened)
    }

    async fn spawn(app: axum::Router) -> std::net::SocketAddr {
        let listener = tokio::net::TcpListener::bind("127.0.0.1:0").await.unwrap();
        let addr = listener.local_addr().unwrap();
        tokio::spawn(async move { axum::serve(listener, app).await.unwrap() });
        addr
    }

    #[tokio::test]
    async fn discovery_refuses_a_metadata_url_the_challenge_puts_on_another_origin() {
        for target in [
            "http://127.0.0.1:9200/_cat/indices?v",
            "http://169.254.169.254/latest/meta-data/iam/security-credentials/",
            "https://exfil.example.net/collect",
        ] {
            let header = format!(r#"Bearer realm="mcp", resource_metadata="{target}""#);
            let err = discover_protected_resource(REMOTE_SERVER, Some(&header))
                .await
                .expect_err("a challenge may only name the server's own metadata");
            let msg = format!("{err:#}");
            assert!(msg.contains("SSRF protection"), "{target}: {msg}");
            assert!(msg.contains("another origin"), "{target}: {msg}");
        }
    }

    #[tokio::test]
    async fn discovery_refuses_a_cleartext_remote_server() {
        let err = discover_protected_resource("http://mcp.example.com/mcp", None)
            .await
            .expect_err("cleartext remote discovery must be refused");
        assert!(format!("{err:#}").contains("must use HTTPS"));
    }

    #[tokio::test]
    async fn discovery_refuses_a_loopback_authorization_server_named_by_a_remote_server() {
        let err = discover_authorization_server("http://127.0.0.1:9200/", REMOTE_SERVER)
            .await
            .expect_err("a public MCP server must not point discovery at this machine");
        let msg = format!("{err:#}");
        assert!(msg.contains("SSRF protection"), "unexpected error: {msg}");
        assert!(msg.contains("loopback"), "unexpected error: {msg}");
    }

    #[tokio::test]
    async fn discovery_honours_a_same_origin_challenge_url() {
        let app = axum::Router::new().route(
            "/oauth/resource",
            axum::routing::get(|| async {
                axum::Json(serde_json::json!({
                    "authorization_servers": ["http://127.0.0.1"]
                }))
            }),
        );
        let addr = spawn(app).await;
        let header = format!(r#"Bearer resource_metadata="http://{addr}/oauth/resource""#);
        let (url, prm) = discover_protected_resource(&format!("http://{addr}/mcp"), Some(&header))
            .await
            .expect("a same-origin challenge URL is the RFC 9728 happy path");
        assert_eq!(url, format!("http://{addr}/oauth/resource"));
        assert_eq!(prm.authorization_servers, vec!["http://127.0.0.1"]);
    }

    #[tokio::test]
    async fn discovery_still_works_against_a_loopback_server() {
        let app = axum::Router::new().route(
            "/.well-known/oauth-protected-resource",
            axum::routing::get(|| async {
                axum::Json(serde_json::json!({
                    "resource": "http://127.0.0.1/",
                    "authorization_servers": ["http://127.0.0.1"]
                }))
            }),
        );
        let addr = spawn(app).await;
        let (url, prm) = discover_protected_resource(&format!("http://{addr}/"), None)
            .await
            .expect("loopback discovery must keep working");
        assert!(url.ends_with("/.well-known/oauth-protected-resource"));
        assert_eq!(prm.authorization_servers, vec!["http://127.0.0.1"]);
    }

    #[tokio::test]
    async fn discovery_refuses_an_oversized_metadata_body() {
        let app = axum::Router::new().route(
            "/.well-known/oauth-protected-resource",
            axum::routing::get(|| async {
                let filler = "a".repeat(crate::security::MAX_METADATA_BODY_BYTES + 1024);
                axum::Json(serde_json::json!({
                    "resource": filler,
                    "authorization_servers": ["https://as.example.com"]
                }))
            }),
        );
        let addr = spawn(app).await;
        let err = discover_protected_resource(&format!("http://{addr}/"), None)
            .await
            .expect_err("an oversized metadata body must not be buffered");
        assert!(format!("{err:#}").contains("exceeds"));
    }

    #[tokio::test]
    async fn refresh_refuses_a_private_token_url() {
        let token = token_with("http://10.0.0.5/token");
        let err = refresh_token(&token, &OAuthConfig::default())
            .await
            .expect_err("a private-network token endpoint must not receive the refresh token");
        let msg = format!("{err:#}");
        assert!(msg.contains("SSRF protection"), "unexpected error: {msg}");
    }

    #[tokio::test]
    async fn refresh_refuses_a_cleartext_remote_token_url() {
        let token = token_with("http://as.example.com/token");
        let err = refresh_token(&token, &OAuthConfig::default())
            .await
            .expect_err("credentials must not cross the network in cleartext");
        assert!(format!("{err:#}").contains("must use HTTPS"));
    }

    #[tokio::test]
    async fn refresh_refuses_a_cached_token_url_from_another_origin() {
        let token = token_with("https://evil.example.com/token");
        let cfg = OAuthConfig {
            token_url: Some("https://as.example.com/token".into()),
            client_secret: Some("s3cret".into()),
            ..Default::default()
        };
        let err = refresh_token(&token, &cfg)
            .await
            .expect_err("a poisoned cached token endpoint must not override the configured one");
        assert!(format!("{err:#}").contains("does not match the pinned origin"));
    }

    #[tokio::test]
    async fn refresh_refuses_a_loopback_token_url_when_the_server_is_remote() {
        let token = token_with("http://127.0.0.1:9200/token");
        let err = refresh_token(&token, &OAuthConfig::default())
            .await
            .expect_err("a remote server's token must never be refreshed against this machine");
        let msg = format!("{err:#}");
        assert!(msg.contains("SSRF protection"), "unexpected error: {msg}");
        assert!(msg.contains("loopback"), "unexpected error: {msg}");
    }

    #[tokio::test]
    async fn refresh_keeps_a_configured_secret_from_a_discovered_endpoint() {
        let token = token_with("https://as.example.com/token");
        let cfg = OAuthConfig {
            client_secret: Some("configured-secret".into()),
            ..Default::default()
        };
        let err = refresh_token(&token, &cfg)
            .await
            .expect_err("a user-held secret must not go to a discovered endpoint");
        assert!(format!("{err:#}").contains("set [auth.token_url]"));
    }

    #[tokio::test]
    async fn refresh_against_loopback_keeps_the_cached_discovery_url() {
        let app = axum::Router::new().route(
            "/token",
            axum::routing::post(|| async {
                axum::Json(serde_json::json!({
                    "access_token": "fresh-access",
                    "token_type": "Bearer",
                    "expires_in": 3600
                }))
            }),
        );
        let addr = spawn(app).await;
        let local_server = format!("http://{addr}/mcp");
        let token = token_from(&local_server, &format!("http://{addr}/token"));
        let refreshed = refresh_token(&token, &OAuthConfig::default())
            .await
            .expect("loopback refresh must keep working");
        assert_eq!(refreshed.access_token, "fresh-access");
        assert_eq!(
            refreshed.auth_server_metadata_url,
            token.auth_server_metadata_url
        );
    }

    #[tokio::test]
    async fn authorize_endpoints_that_leave_the_web_never_reach_the_browser() {
        for endpoint in ["javascript:alert(1)", "file:///etc/passwd"] {
            let (msg, opened) = pkce_refusal(
                OAuthConfig::default(),
                as_meta_with(endpoint, "https://as.example.com/token"),
            )
            .await;
            assert!(msg.contains("is not allowed"), "{endpoint}: {msg}");
            assert_eq!(opened, 0, "{endpoint} must never be opened");
        }
    }

    #[tokio::test]
    async fn authorize_endpoint_on_this_machine_never_reaches_the_browser() {
        let (msg, opened) = pkce_refusal(
            OAuthConfig::default(),
            as_meta_with(
                "http://127.0.0.1:9200/authorize",
                "https://as.example.com/token",
            ),
        )
        .await;
        assert!(msg.contains("names this machine"), "{msg}");
        assert_eq!(opened, 0);
    }

    #[tokio::test]
    async fn a_configured_secret_stops_the_flow_before_the_browser_opens() {
        let cfg = OAuthConfig {
            client_secret: Some("configured-secret".into()),
            ..Default::default()
        };
        let (msg, opened) = pkce_refusal(
            cfg,
            as_meta_with(
                "https://as.example.com/authorize",
                "https://as.example.com/token",
            ),
        )
        .await;
        assert!(msg.contains("set [auth.token_url]"), "{msg}");
        assert_eq!(opened, 0);
    }

    #[test]
    fn failure_detail_only_echoes_structured_oauth_errors() {
        assert_eq!(
            oauth_error_detail(br#"{"error":"invalid_grant","error_description":"expired"}"#)
                .as_deref(),
            Some("invalid_grant: expired")
        );
        assert!(oauth_error_detail(b"green master 1 0 42 0 12.5kb").is_none());
        assert!(oauth_error_detail(br#"{"error":{"reason":"index_not_found"}}"#).is_none());
        assert!(oauth_error_detail(br#"{"took":3,"hits":{"total":9}}"#).is_none());
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
        assert!(!u.contains("scope="));
    }
}
