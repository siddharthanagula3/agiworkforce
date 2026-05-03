// OAuth provider authentication for AGI Workforce CLI
// Supports: Anthropic (Claude Max), OpenAI (ChatGPT Plus/Pro), GitHub Copilot

use anyhow::{Context, Result};
use base64::{engine::general_purpose::URL_SAFE_NO_PAD, Engine};
use sha2::{Digest, Sha256};

// ─────────────────────────────────────────────────────────────────────────────
// Provider OAuth Configurations
// ─────────────────────────────────────────────────────────────────────────────

pub struct OAuthProvider {
    pub id: &'static str,
    pub name: &'static str,
    pub description: &'static str,
    pub client_id: &'static str,
    pub authorize_url: &'static str,
    pub token_url: &'static str,
    pub redirect_uri: &'static str,
    pub scopes: &'static str,
}

pub const ANTHROPIC_OAUTH: OAuthProvider = OAuthProvider {
    id: "anthropic",
    name: "Anthropic",
    description: "Claude Max or Console subscription",
    client_id: "9d1c250a-e61b-44d9-88ed-5944d1962f5e",
    authorize_url: "https://claude.ai/oauth/authorize",
    token_url: "https://console.anthropic.com/v1/oauth/token",
    redirect_uri: "https://console.anthropic.com/oauth/code/callback",
    scopes: "org:create_api_key user:profile user:inference",
};

pub const OPENAI_OAUTH: OAuthProvider = OAuthProvider {
    id: "openai",
    name: "OpenAI",
    description: "ChatGPT Plus/Pro subscription",
    client_id: "app_EMoamEEZ73f0CkXaXp7hrann",
    authorize_url: "https://auth.openai.com/oauth/authorize",
    token_url: "https://auth.openai.com/oauth/token",
    redirect_uri: "http://127.0.0.1:1455/callback",
    scopes: "openid profile email offline_access",
};

pub const AGIWORKFORCE_OAUTH: OAuthProvider = OAuthProvider {
    id: "agiworkforce",
    name: "AGI Workforce",
    description: "Your AGI Workforce subscription",
    client_id: "cli",
    authorize_url: "https://agiworkforce.com/auth/device",
    token_url: "https://api.agiworkforce.com/auth/device/token",
    redirect_uri: "",
    scopes: "",
};

pub const ALL_PROVIDERS: &[&OAuthProvider] =
    &[&AGIWORKFORCE_OAUTH, &ANTHROPIC_OAUTH, &OPENAI_OAUTH];

// ─────────────────────────────────────────────────────────────────────────────
// PKCE (Proof Key for Code Exchange)
// ─────────────────────────────────────────────────────────────────────────────

pub struct PkceCodes {
    pub verifier: String,
    pub challenge: String,
}

pub fn generate_pkce() -> PkceCodes {
    let verifier = generate_random_string(43);
    let hash = Sha256::digest(verifier.as_bytes());
    let challenge = URL_SAFE_NO_PAD.encode(hash);
    PkceCodes {
        verifier,
        challenge,
    }
}

pub fn generate_random_string(len: usize) -> String {
    let chars = b"ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-._~";
    let mut result = String::with_capacity(len);
    let mut remaining = len;

    // Use UUID v4 as a CSPRNG source (backed by OS randomness via getrandom).
    // Each UUID yields 16 random bytes; loop until we have enough.
    while remaining > 0 {
        let bytes = uuid::Uuid::new_v4().into_bytes();
        for &byte in bytes.iter() {
            if remaining == 0 {
                break;
            }
            result.push(chars[(byte as usize) % chars.len()] as char);
            remaining -= 1;
        }
    }

    result
}

// ─────────────────────────────────────────────────────────────────────────────
// OAuth Authorization URL Builder
// ─────────────────────────────────────────────────────────────────────────────

/// Percent-encode a string for use in URL query parameters.
fn percent_encode(input: &str) -> String {
    let mut out = String::with_capacity(input.len() * 2);
    for b in input.bytes() {
        match b {
            b'A'..=b'Z' | b'a'..=b'z' | b'0'..=b'9' | b'-' | b'_' | b'.' | b'~' => {
                out.push(b as char);
            }
            _ => {
                out.push_str(&format!("%{:02X}", b));
            }
        }
    }
    out
}

pub fn build_authorize_url(provider: &OAuthProvider, pkce: &PkceCodes) -> String {
    let mut url = format!(
        "{}?response_type=code&client_id={}&redirect_uri={}&scope={}&code_challenge={}&code_challenge_method=S256&state={}&code=true",
        provider.authorize_url,
        provider.client_id,
        percent_encode(provider.redirect_uri),
        percent_encode(provider.scopes),
        pkce.challenge,
        pkce.verifier,
    );

    // OpenAI-specific params
    if provider.id == "openai" {
        url.push_str("&id_token_add_organizations=true&codex_cli_simplified_flow=true");
    }

    url
}

// ─────────────────────────────────────────────────────────────────────────────
// Token Exchange
// ─────────────────────────────────────────────────────────────────────────────

#[derive(Debug, serde::Deserialize)]
#[allow(dead_code)]
pub struct TokenResponse {
    pub access_token: String,
    pub refresh_token: Option<String>,
    pub expires_in: Option<u64>,
    pub token_type: Option<String>,
    pub id_token: Option<String>,
}

/// Exchange an authorization code for tokens.
pub async fn exchange_code(
    provider: &OAuthProvider,
    code: &str,
    verifier: &str,
) -> Result<TokenResponse> {
    let client = reqwest::Client::new();

    // For Anthropic, code might contain state after #
    let (auth_code, state) = if code.contains('#') {
        let parts: Vec<&str> = code.splitn(2, '#').collect();
        (parts[0], Some(parts[1]))
    } else {
        (code, None)
    };

    let mut body = serde_json::json!({
        "grant_type": "authorization_code",
        "code": auth_code,
        "client_id": provider.client_id,
        "redirect_uri": provider.redirect_uri,
        "code_verifier": verifier,
    });

    if let Some(s) = state {
        body["state"] = serde_json::Value::String(s.to_string());
    }

    let resp = client
        .post(provider.token_url)
        .header("Content-Type", "application/json")
        .json(&body)
        .send()
        .await
        .context("Failed to exchange authorization code")?;

    if !resp.status().is_success() {
        let status = resp.status();
        let body = resp.text().await.unwrap_or_default();
        anyhow::bail!("Token exchange failed ({}): {}", status, body);
    }

    resp.json::<TokenResponse>()
        .await
        .context("Failed to parse token response")
}

/// Refresh an expired access token.
#[allow(dead_code)]
pub async fn refresh_token(provider: &OAuthProvider, refresh_token: &str) -> Result<TokenResponse> {
    let client = reqwest::Client::new();

    let body = serde_json::json!({
        "grant_type": "refresh_token",
        "refresh_token": refresh_token,
        "client_id": provider.client_id,
    });

    let resp = client
        .post(provider.token_url)
        .header("Content-Type", "application/json")
        .json(&body)
        .send()
        .await
        .context("Failed to refresh token")?;

    if !resp.status().is_success() {
        let status = resp.status();
        let body = resp.text().await.unwrap_or_default();
        anyhow::bail!("Token refresh failed ({}): {}", status, body);
    }

    resp.json::<TokenResponse>()
        .await
        .context("Failed to parse refresh response")
}

// ─────────────────────────────────────────────────────────────────────────────
// Interactive OAuth Login Flow
// ─────────────────────────────────────────────────────────────────────────────

/// Run the OAuth login flow for a provider.
/// Opens browser → user authorizes → pastes code → exchanges for tokens.
pub async fn oauth_login(provider: &OAuthProvider) -> Result<crate::auth::AuthEntry> {
    use colored::Colorize;

    let pkce = generate_pkce();
    let auth_url = build_authorize_url(provider, &pkce);

    eprintln!(
        "\n  {} Authenticating with {} ({})\n",
        "→".cyan().bold(),
        provider.name.cyan(),
        provider.description,
    );
    eprintln!("  Opening browser for authorization...\n");
    eprintln!("  {}\n", auth_url.dimmed());

    // Try to open browser
    if webbrowser::open(&auth_url).is_err() {
        eprintln!("  Could not open browser. Copy this URL manually:\n");
        eprintln!("  {}\n", auth_url.cyan());
    }

    eprintln!("  After authorizing, paste the code from the callback URL below.\n");
    eprintln!("  (The code appears in the URL after 'code=' parameter)\n");

    let code = dialoguer::Password::new()
        .with_prompt("  Authorization code")
        .interact()
        .context("Failed to read authorization code")?;

    eprintln!("\n  Exchanging code for tokens...");

    let tokens = exchange_code(provider, &code, &pkce.verifier).await?;

    let expires = tokens
        .expires_in
        .map(|s| chrono::Utc::now().timestamp_millis() + (s as i64 * 1000))
        .unwrap_or(0);

    eprintln!(
        "  {} Authenticated with {}!",
        "✓".green().bold(),
        provider.name
    );

    Ok(crate::auth::AuthEntry::OAuth {
        refresh: tokens.refresh_token.unwrap_or_default(),
        access: tokens.access_token,
        expires,
        account_id: None,
    })
}

/// Get the OAuth provider config by ID.
pub fn get_provider(id: &str) -> Option<&'static OAuthProvider> {
    ALL_PROVIDERS.iter().find(|p| p.id == id).copied()
}

// ─────────────────────────────────────────────────────────────────────────────
// Device Code Flow (for AGI Workforce + GitHub Copilot style auth)
// ─────────────────────────────────────────────────────────────────────────────

#[derive(serde::Deserialize)]
struct DeviceCodeResponse {
    device_code: String,
    user_code: String,
    verification_uri: Option<String>,
    #[serde(default = "default_interval")]
    interval: u64,
    #[serde(default = "default_expires")]
    expires_in: u64,
}

fn default_interval() -> u64 {
    5
}
fn default_expires() -> u64 {
    900
}

#[derive(serde::Deserialize)]
#[allow(dead_code)]
struct DeviceTokenResponse {
    access_token: String,
    token_type: Option<String>,
    expires_in: Option<u64>,
    refresh_token: Option<String>,
}

/// Run the device code login flow for AGI Workforce.
/// 1. Request device code from server
/// 2. Show code to user + verification URL
/// 3. Poll for token until approved or timeout
pub async fn device_code_login(api_base: &str) -> Result<crate::auth::AuthEntry> {
    use colored::Colorize;

    let client = reqwest::Client::new();

    // Step 1: Request device code
    eprintln!("\n  {} Connecting to AGI Workforce...\n", "→".cyan().bold(),);

    let resp = client
        .post(format!("{api_base}/auth/device/code"))
        .header("Content-Type", "application/json")
        .header(
            "User-Agent",
            format!("agiworkforce-cli/{}", env!("CARGO_PKG_VERSION")),
        )
        .json(&serde_json::json!({ "client_id": "cli" }))
        .send()
        .await
        .context("Failed to request device code from AGI Workforce")?;

    if !resp.status().is_success() {
        let status = resp.status();
        let body = resp.text().await.unwrap_or_default();
        anyhow::bail!("Device code request failed ({}): {}", status, body);
    }

    let device: DeviceCodeResponse = resp
        .json()
        .await
        .context("Failed to parse device code response")?;

    let verification_url = device
        .verification_uri
        .unwrap_or_else(|| "https://agiworkforce.com/auth/device".to_string());

    // Step 2: Show instructions
    eprintln!("  {}", "━".repeat(50).dimmed());
    eprintln!();
    eprintln!("  1. Open this link in your browser:");
    eprintln!("     {}", verification_url.cyan().underline());
    eprintln!();
    eprintln!("  2. Enter this code:");
    eprintln!("     {}", device.user_code.green().bold());
    eprintln!();
    eprintln!("  {}", "━".repeat(50).dimmed());
    eprintln!();
    eprintln!("  {} Waiting for authorization...", "⏳".dimmed());

    // Try to open browser
    let _ = webbrowser::open(&verification_url);

    // Step 3: Poll for token
    let max_attempts = (device.expires_in / device.interval).max(1);
    let interval = std::time::Duration::from_secs(device.interval.max(3));

    for attempt in 1..=max_attempts {
        tokio::time::sleep(interval).await;

        let poll_resp = client
            .post(format!("{api_base}/auth/device/token"))
            .header("Content-Type", "application/json")
            .header(
                "User-Agent",
                format!("agiworkforce-cli/{}", env!("CARGO_PKG_VERSION")),
            )
            .json(&serde_json::json!({ "device_code": device.device_code }))
            .send()
            .await;

        let poll_resp = match poll_resp {
            Ok(r) => r,
            Err(_) => continue, // network error, retry
        };

        let status = poll_resp.status();

        if status == reqwest::StatusCode::FORBIDDEN {
            // Authorization pending — keep polling
            if attempt % 6 == 0 {
                eprintln!(
                    "  {} Still waiting... ({}s elapsed)",
                    "⏳".dimmed(),
                    attempt * device.interval
                );
            }
            continue;
        }

        if status == reqwest::StatusCode::BAD_REQUEST {
            anyhow::bail!("Device code expired. Please run /login again.");
        }

        if status.is_success() {
            let tokens: DeviceTokenResponse = poll_resp
                .json()
                .await
                .context("Failed to parse token response")?;

            let expires = tokens
                .expires_in
                .map(|s| chrono::Utc::now().timestamp_millis() + (s as i64 * 1000))
                .unwrap_or(0);

            eprintln!(
                "\n  {} Authenticated with AGI Workforce!",
                "✓".green().bold()
            );

            return Ok(crate::auth::AuthEntry::OAuth {
                refresh: tokens.refresh_token.unwrap_or_default(),
                access: tokens.access_token,
                expires,
                account_id: None,
            });
        }
    }

    anyhow::bail!(
        "Authorization timed out after {}s. Please try again.",
        device.expires_in
    )
}
