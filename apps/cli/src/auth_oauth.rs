//! Browser-based PKCE OAuth flow for `/login`. M39 of v1.2.
//!
//! Flow:
//! 1. Generate a 64-byte random code_verifier; derive code_challenge = base64url(sha256(verifier)).
//! 2. Find a free localhost port; bind a one-shot TCP listener at http://127.0.0.1:<port>/callback.
//! 3. Open the provider's authorize URL in the default browser (via `webbrowser` crate),
//!    passing client_id, redirect_uri, code_challenge, state.
//! 4. User authenticates in browser; provider redirects to our listener with `?code=...&state=...`.
//! 5. Verify state matches, POST { grant_type=authorization_code, code, code_verifier, redirect_uri }
//!    to the token endpoint. Receive { access_token, refresh_token, expires_in }.
//! 6. Return `OAuthTokens`; caller persists via mcp::McpOAuthStore (keyring-backed).
//!
//! Provider table maps known names → endpoints. Custom providers can pass URLs directly.

#![allow(dead_code)]

use anyhow::{Context, Result, anyhow};
use base64::Engine;
use serde::{Deserialize, Serialize};
use sha2::{Digest, Sha256};
use std::io::{Read, Write};
use std::net::TcpListener;
use std::time::Duration;

#[derive(Debug, Clone)]
pub struct ProviderEndpoints {
    pub name: String,
    pub authorize_url: String,
    pub token_url: String,
    pub client_id: String,
    pub scopes: Vec<String>,
}

impl ProviderEndpoints {
    pub fn known(name: &str) -> Option<Self> {
        match name {
            "anthropic" => Some(Self {
                name: "anthropic".into(),
                authorize_url: "https://console.anthropic.com/oauth/authorize".into(),
                token_url: "https://console.anthropic.com/v1/oauth/token".into(),
                client_id: "agiworkforce-cli".into(),
                scopes: vec!["read".into(), "completions".into()],
            }),
            "openai" => Some(Self {
                name: "openai".into(),
                authorize_url: "https://auth.openai.com/oauth/authorize".into(),
                token_url: "https://auth.openai.com/oauth/token".into(),
                client_id: "agiworkforce-cli".into(),
                scopes: vec!["read".into()],
            }),
            _ => None,
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct OAuthTokens {
    pub access_token: String,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub refresh_token: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub expires_in: Option<i64>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub token_type: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub scope: Option<String>,
}

/// Generate a cryptographically-random code_verifier per RFC 7636.
pub fn generate_code_verifier() -> String {
    let bytes: [u8; 64] = rand::random();
    base64::engine::general_purpose::URL_SAFE_NO_PAD.encode(bytes)
}

/// Derive code_challenge = base64url(sha256(verifier)) per RFC 7636 S256.
pub fn derive_code_challenge(verifier: &str) -> String {
    let mut h = Sha256::new();
    h.update(verifier.as_bytes());
    base64::engine::general_purpose::URL_SAFE_NO_PAD.encode(h.finalize())
}

/// Cryptographically-random state token to defend against CSRF.
pub fn generate_state() -> String {
    let bytes: [u8; 32] = rand::random();
    base64::engine::general_purpose::URL_SAFE_NO_PAD.encode(bytes)
}

/// Build the full authorize URL with all PKCE params.
pub fn build_authorize_url(
    provider: &ProviderEndpoints,
    redirect_uri: &str,
    code_challenge: &str,
    state: &str,
) -> String {
    let scope = provider.scopes.join(" ");
    let params = [
        ("response_type", "code"),
        ("client_id", &provider.client_id),
        ("redirect_uri", redirect_uri),
        ("scope", &scope),
        ("state", state),
        ("code_challenge", code_challenge),
        ("code_challenge_method", "S256"),
    ];
    let qs = params
        .iter()
        .map(|(k, v)| format!("{}={}", urlencoding::encode(k), urlencoding::encode(v)))
        .collect::<Vec<_>>()
        .join("&");
    format!("{}?{}", provider.authorize_url, qs)
}

/// Pick a free localhost port + bind a one-shot listener. Returns the listener + port.
fn bind_ephemeral_listener() -> Result<(TcpListener, u16)> {
    let listener = TcpListener::bind("127.0.0.1:0").context("bind ephemeral port")?;
    let port = listener.local_addr().context("local_addr")?.port();
    Ok((listener, port))
}

/// Wait for the OAuth redirect on the listener. Reads the HTTP request, parses
/// `?code=…&state=…` from the path, writes a "you can close this tab" HTML
/// response, and returns the captured params.
fn capture_redirect(listener: TcpListener, expected_state: &str) -> Result<String> {
    listener.set_nonblocking(false).ok();
    let (mut stream, _) = listener.accept().context("accept callback connection")?;
    stream.set_read_timeout(Some(Duration::from_secs(120))).ok();
    let mut buf = [0u8; 4096];
    let n = stream.read(&mut buf).context("read callback request")?;
    let req = std::str::from_utf8(&buf[..n]).unwrap_or("");
    // GET /callback?code=…&state=… HTTP/1.1
    let path = req
        .lines()
        .next()
        .and_then(|line| line.split_whitespace().nth(1))
        .ok_or_else(|| anyhow!("malformed HTTP request"))?;
    let qs = path.splitn(2, '?').nth(1).ok_or_else(|| anyhow!("no query string"))?;
    let mut code: Option<String> = None;
    let mut state: Option<String> = None;
    for kv in qs.split('&') {
        let mut parts = kv.splitn(2, '=');
        let k = parts.next().unwrap_or("");
        let v = parts.next().unwrap_or("");
        let v = urlencoding::decode(v).map(|s| s.to_string()).unwrap_or_else(|_| v.to_string());
        match k {
            "code" => code = Some(v),
            "state" => state = Some(v),
            _ => {}
        }
    }
    let html = "HTTP/1.1 200 OK\r\nContent-Type: text/html\r\nContent-Length: 88\r\n\r\n<!doctype html><h1>AGI Workforce — login complete</h1><p>You can close this tab.</p>";
    let _ = stream.write_all(html.as_bytes());
    let state = state.ok_or_else(|| anyhow!("redirect missing state"))?;
    if state != expected_state {
        anyhow::bail!("OAuth state mismatch — possible CSRF; refusing to continue");
    }
    code.ok_or_else(|| anyhow!("redirect missing code"))
}

async fn exchange_code(
    provider: &ProviderEndpoints,
    code: &str,
    code_verifier: &str,
    redirect_uri: &str,
) -> Result<OAuthTokens> {
    let client = reqwest::Client::new();
    let form = [
        ("grant_type", "authorization_code"),
        ("code", code),
        ("code_verifier", code_verifier),
        ("client_id", &provider.client_id),
        ("redirect_uri", redirect_uri),
    ];
    let resp = client
        .post(&provider.token_url)
        .form(&form)
        .send()
        .await
        .context("send token request")?;
    if !resp.status().is_success() {
        let s = resp.status();
        let body = resp.text().await.unwrap_or_default();
        anyhow::bail!("token endpoint returned {s}: {body}");
    }
    let tokens: OAuthTokens = resp.json().await.context("parse token response")?;
    Ok(tokens)
}

/// Full PKCE flow. Caller persists the returned tokens (e.g., via mcp::McpServerOAuthStore).
pub async fn pkce_login(provider_name: &str) -> Result<OAuthTokens> {
    let provider = ProviderEndpoints::known(provider_name)
        .ok_or_else(|| anyhow!("unknown provider: {provider_name}"))?;
    let verifier = generate_code_verifier();
    let challenge = derive_code_challenge(&verifier);
    let state = generate_state();
    let (listener, port) = bind_ephemeral_listener()?;
    let redirect_uri = format!("http://127.0.0.1:{port}/callback");
    let auth_url = build_authorize_url(&provider, &redirect_uri, &challenge, &state);
    eprintln!("[/login] Opening browser: {}", auth_url);
    let _ = webbrowser::open(&auth_url);
    let expected_state = state.clone();
    let code = tokio::task::spawn_blocking(move || capture_redirect(listener, &expected_state))
        .await
        .context("join listener task")??;
    exchange_code(&provider, &code, &verifier, &redirect_uri).await
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn known_providers_have_endpoints() {
        let a = ProviderEndpoints::known("anthropic").expect("anthropic");
        assert!(a.authorize_url.starts_with("https://"));
        assert!(a.token_url.starts_with("https://"));
        let o = ProviderEndpoints::known("openai").expect("openai");
        assert!(o.authorize_url.starts_with("https://"));
        assert!(ProviderEndpoints::known("nope").is_none());
    }

    #[test]
    fn code_verifier_is_base64url_no_pad() {
        let v = generate_code_verifier();
        // 64 random bytes → 86 base64url chars (no padding).
        assert!(v.len() >= 80 && v.len() <= 90, "got len {}", v.len());
        assert!(!v.contains('='));
        assert!(!v.contains('+'));
        assert!(!v.contains('/'));
    }

    #[test]
    fn code_challenge_is_sha256_b64url_of_verifier() {
        // RFC 7636 Appendix B test vector:
        // verifier = "dBjftJeZ4CVP-mB92K27uhbUJU1p1r_wW1gFWFOEjXk"
        // expected = "E9Melhoa2OwvFrEMTJguCHaoeK1t8URWbuGJSstw-cM"
        let v = "dBjftJeZ4CVP-mB92K27uhbUJU1p1r_wW1gFWFOEjXk";
        let c = derive_code_challenge(v);
        assert_eq!(c, "E9Melhoa2OwvFrEMTJguCHaoeK1t8URWbuGJSstw-cM");
    }

    #[test]
    fn state_is_random_and_long() {
        let a = generate_state();
        let b = generate_state();
        assert_ne!(a, b);
        assert!(a.len() >= 40);
    }

    #[test]
    fn authorize_url_contains_all_required_params() {
        let p = ProviderEndpoints::known("anthropic").unwrap();
        let url = build_authorize_url(&p, "http://127.0.0.1:1234/callback", "challenge-x", "state-y");
        assert!(url.contains("response_type=code"));
        assert!(url.contains("client_id="));
        assert!(url.contains("redirect_uri=http"));
        assert!(url.contains("scope="));
        assert!(url.contains("state=state-y"));
        assert!(url.contains("code_challenge=challenge-x"));
        assert!(url.contains("code_challenge_method=S256"));
    }

    #[test]
    fn bind_ephemeral_returns_valid_port() {
        let (listener, port) = bind_ephemeral_listener().expect("bind");
        assert!(port > 1024);
        drop(listener);
    }
}
