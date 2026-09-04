// OAuth provider authentication for AGI Workforce CLI
// Supports: Anthropic (Claude Max), OpenAI (ChatGPT Plus/Pro), GitHub Copilot

use anyhow::{Context, Result};
use base64::{engine::general_purpose::URL_SAFE_NO_PAD, Engine};
use sha2::{Digest, Sha256};

use crate::terminal_style as ts;

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
    /// True when the provider echoes the CSRF `state` back appended to the
    /// authorization code as `code#state` (Anthropic's convention). When true,
    /// the returned state fragment is REQUIRED and validated against our nonce.
    /// it can never be silently skipped (an attacker omitting it must fail).
    pub echoes_state_in_code: bool,
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
    echoes_state_in_code: true,
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
    // OpenAI uses a loopback callback; the pasted code does not carry a
    // `#state` fragment, so the code-fragment check does not apply here.
    echoes_state_in_code: false,
};

pub const AGIWORKFORCE_OAUTH: OAuthProvider = OAuthProvider {
    id: "agiworkforce",
    name: "AGI",
    description: "Your AGI subscription",
    client_id: "cli",
    authorize_url: "https://agiworkforce.com/auth/device",
    token_url: "https://api.agiworkforce.com/auth/device/token",
    redirect_uri: "",
    scopes: "",
    // Device-code flow: no redirect, no `code#state` fragment.
    echoes_state_in_code: false,
};

pub const ALL_PROVIDERS: &[&OAuthProvider] =
    &[&AGIWORKFORCE_OAUTH, &ANTHROPIC_OAUTH, &OPENAI_OAUTH];

// ─────────────────────────────────────────────────────────────────────────────
// PKCE (Proof Key for Code Exchange)
// ─────────────────────────────────────────────────────────────────────────────

pub struct PkceCodes {
    pub verifier: String,
    pub challenge: String,
    /// Independent CSRF nonce for the `state` parameter. MUST stay distinct
    /// from `verifier`, RFC 7636 requires the code_verifier to remain secret
    /// on the client until token exchange, so it must never travel in the
    /// authorize URL.
    pub state: String,
}

pub fn generate_pkce() -> PkceCodes {
    let verifier = generate_random_string(43);
    let hash = Sha256::digest(verifier.as_bytes());
    let challenge = URL_SAFE_NO_PAD.encode(hash);
    let state = generate_random_string(32);
    PkceCodes {
        verifier,
        challenge,
        state,
    }
}

pub fn generate_random_string(len: usize) -> String {
    let chars = b"ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-._~";
    let alphabet_len = chars.len();
    let mut result = String::with_capacity(len);
    let mut remaining = len;

    // Rejection-sampling cutoff: keep only byte values below the largest
    // multiple of `alphabet_len` that is <= 256 so the `% alphabet_len` mapping
    // is uniform. Plain `byte % len` would bias the low end of the alphabet (for a
    // 66-char set, 256 % 66 = 58 → values 0..58 would be ~1.5% more likely),
    // weakening the PKCE verifier / CSRF state entropy. Bytes at or above the
    // cutoff are discarded. Computed in u16 to avoid the u8 overflow when the
    // alphabet length divides 256 (256 % len == 0 → cutoff stays 256, accept
    // all bytes instead of rejecting everything).
    let cutoff: u16 = 256 - (256 % alphabet_len as u16);

    // Use UUID v4 as a CSPRNG source (backed by OS randomness via getrandom).
    // Each UUID yields 16 random bytes; loop until we have enough.
    while remaining > 0 {
        let bytes = uuid::Uuid::new_v4().into_bytes();
        for &byte in bytes.iter() {
            if remaining == 0 {
                break;
            }
            // Discard biased bytes; the next UUID refills the pool so output
            // length is unaffected.
            if u16::from(byte) >= cutoff {
                continue;
            }
            result.push(chars[(byte as usize) % alphabet_len] as char);
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
        percent_encode(&pkce.state),
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
    let pkce = generate_pkce();
    let auth_url = build_authorize_url(provider, &pkce);

    eprintln!(
        "\n  {} Authenticating with {} ({})\n",
        ts::prompt("→"),
        ts::accent(provider.name),
        provider.description,
    );
    eprintln!("  Opening browser for authorization...\n");
    eprintln!("  {}\n", ts::muted(&auth_url));

    // Try to open browser (explicit user-initiated auth flow).
    if !open_external_url(&auth_url, UserActionContext::user_initiated()) {
        eprintln!("  Could not open browser. Copy this URL manually:\n");
        eprintln!("  {}\n", ts::link(&auth_url));
    }

    eprintln!("  After authorizing, paste the code from the callback URL below.\n");
    eprintln!("  (The code appears in the URL after 'code=' parameter)\n");

    let code = dialoguer::Password::new()
        .with_prompt("  Authorization code")
        .interact()
        .context("Failed to read authorization code")?;

    // CSRF: a provider that echoes `state` back (Anthropic returns `code#state`)
    // MUST return our exact nonce. Require the fragment and validate it, never
    // silently skip, so an attacker cannot bypass the check by omitting `#state`.
    if provider.echoes_state_in_code {
        let (_, returned_state) = code
            .split_once('#')
            .context("authorization code is missing the required state fragment")?;
        if returned_state != pkce.state {
            anyhow::bail!("OAuth state mismatch, possible CSRF; aborting login");
        }
    }

    eprintln!("\n  Exchanging code for tokens...");

    let tokens = exchange_code(provider, &code, &pkce.verifier).await?;

    let expires = tokens
        .expires_in
        .map(|s| chrono::Utc::now().timestamp_millis() + (s as i64 * 1000))
        .unwrap_or(0);

    eprintln!(
        "  {} Authenticated with {}!",
        ts::success_header("✓"),
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
    let client = reqwest::Client::new();

    // Step 1: Request device code
    eprintln!("\n  {} Connecting to AGI...\n", ts::prompt("→"),);

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
        .context("Failed to request device code from AGI")?;

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
    eprintln!("  {}", ts::muted("━".repeat(50)));
    eprintln!();
    eprintln!("  1. Open this link in your browser:");
    eprintln!("     {}", ts::link(&verification_url));
    eprintln!();
    eprintln!("  2. Enter this code:");
    eprintln!("     {}", ts::success_header(&device.user_code));
    eprintln!();
    eprintln!("  {}", ts::muted("━".repeat(50)));
    eprintln!();
    eprintln!("  {} Waiting for authorization...", ts::muted("⏳"));

    // Try to open browser (explicit user-initiated device-code flow).
    let _ = open_external_url(&verification_url, UserActionContext::user_initiated());

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
            // Authorization pending, keep polling
            if attempt % 6 == 0 {
                eprintln!(
                    "  {} Still waiting... ({}s elapsed)",
                    ts::muted("⏳"),
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

            eprintln!("\n  {} Authenticated with AGI!", ts::success_header("✓"));

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

// ─────────────────────────────────────────────────────────────────────────────
// External-URL open chokepoint
//
// Every code path that wants to launch the user's default browser MUST route
// through `open_external_url`. The chokepoint refuses to open anything unless
// the caller proves the action was explicitly triggered by the user
// (`UserActionContext::user_initiated()`). This makes "a browser tab opened on
// its own" structurally impossible: a non-user-initiated context is a no-op,
// and tests can install a spy to assert no real URL is ever launched.
// ─────────────────────────────────────────────────────────────────────────────

/// Proof that an external-open was requested as a direct result of explicit
/// user action (a typed command, a clicked button, an interactive auth flow the
/// user started). Background/module-load/test code constructs the non-user
/// variant, which makes [`open_external_url`] a no-op.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub struct UserActionContext {
    triggered_by_user: bool,
}

impl UserActionContext {
    /// Build a context for an open that the user explicitly initiated.
    pub const fn user_initiated() -> Self {
        Self {
            triggered_by_user: true,
        }
    }

    /// Build a context for a non-user-initiated path. [`open_external_url`]
    /// never launches a browser for this context.
    pub const fn non_user_initiated() -> Self {
        Self {
            triggered_by_user: false,
        }
    }

    /// Whether this context permits launching an external browser.
    pub const fn triggered_by_user(&self) -> bool {
        self.triggered_by_user
    }
}

#[cfg(test)]
pub(crate) mod external_open_spy {
    use std::sync::atomic::{AtomicBool, AtomicUsize, Ordering};
    use std::sync::{Mutex, MutexGuard, OnceLock};

    /// Serializes spy-using tests across the whole test binary so the shared
    /// static counters can't race under cargo's parallel test runner. Callers
    /// hold the returned guard for the duration of their spy interaction.
    pub fn lock() -> MutexGuard<'static, ()> {
        static SPY_LOCK: OnceLock<Mutex<()>> = OnceLock::new();
        SPY_LOCK
            .get_or_init(|| Mutex::new(()))
            // Recover from a poisoned lock: a panicking test must not wedge the
            // rest of the suite. The guarded data is unit `()`, so there is no
            // invariant to repair.
            .lock()
            .unwrap_or_else(|poisoned| poisoned.into_inner())
    }

    /// When set, [`super::open_external_url`] records the call instead of
    /// touching a real browser. Used by tests to prove no unprompted open ever
    /// happens without launching a real URL.
    pub(super) static SPY_ENABLED: AtomicBool = AtomicBool::new(false);
    /// Count of opens that actually reached the launch step (i.e. passed the
    /// user-action gate) while the spy was enabled.
    pub(super) static OPEN_COUNT: AtomicUsize = AtomicUsize::new(0);

    pub fn enable_and_reset() {
        OPEN_COUNT.store(0, Ordering::SeqCst);
        SPY_ENABLED.store(true, Ordering::SeqCst);
    }

    pub fn disable() {
        SPY_ENABLED.store(false, Ordering::SeqCst);
    }

    pub fn open_count() -> usize {
        OPEN_COUNT.load(Ordering::SeqCst)
    }

    pub(super) fn is_enabled() -> bool {
        SPY_ENABLED.load(Ordering::SeqCst)
    }

    pub(super) fn record_open() {
        OPEN_COUNT.fetch_add(1, Ordering::SeqCst);
    }
}

/// The single chokepoint for launching the user's default browser.
///
/// Returns `true` only when a browser was (or, under the test spy, would have
/// been) launched. Refuses to open anything for a non-user-initiated context,
/// so module-load, registration, and test paths can never trigger a tab on
/// their own. Never panics, failures degrade to `false` so callers can fall
/// back to printing the URL.
#[must_use]
pub fn open_external_url(url: &str, ctx: UserActionContext) -> bool {
    if !ctx.triggered_by_user() {
        return false;
    }

    #[cfg(test)]
    {
        if external_open_spy::is_enabled() {
            external_open_spy::record_open();
            return true;
        }
    }

    webbrowser::open(url).is_ok()
}

#[cfg(test)]
mod open_chokepoint_tests {
    use super::*;

    #[test]
    fn non_user_initiated_never_opens() {
        let _guard = external_open_spy::lock();
        external_open_spy::enable_and_reset();
        let opened = open_external_url(
            "https://example.com/should-not-open",
            UserActionContext::non_user_initiated(),
        );
        external_open_spy::disable();
        assert!(
            !opened,
            "non-user-initiated context must not open a browser"
        );
        assert_eq!(
            external_open_spy::open_count(),
            0,
            "non-user-initiated open must not reach the launch step"
        );
    }

    #[test]
    fn user_initiated_reaches_launch_step_under_spy() {
        let _guard = external_open_spy::lock();
        external_open_spy::enable_and_reset();
        let opened = open_external_url(
            "https://example.com/ok",
            UserActionContext::user_initiated(),
        );
        external_open_spy::disable();
        assert!(
            opened,
            "user-initiated open should reach the (spied) launcher"
        );
        assert_eq!(external_open_spy::open_count(), 1);
    }

    /// Source-level invariant: the raw browser launcher (`webbrowser::open(`) may
    /// appear in `apps/cli/src` EXACTLY once, inside this file's chokepoint
    /// `open_external_url`. This catches a future regression that re-adds a
    /// *direct* launch (the exact original-bug pattern, e.g. in
    /// `render_install_app`), which a runtime spy on the chokepoint cannot see
    /// because a direct call never routes through the spy.
    #[test]
    fn webbrowser_open_only_called_from_the_chokepoint() {
        use std::path::Path;
        // Build the needle at runtime so this test's own source does not
        // self-match the literal it is searching for.
        let needle = ["webbrowser", "::open("].concat();
        let src_root = Path::new(env!("CARGO_MANIFEST_DIR")).join("src");

        fn collect_rs(dir: &Path, out: &mut Vec<std::path::PathBuf>) {
            let entries = match std::fs::read_dir(dir) {
                Ok(e) => e,
                Err(_) => return,
            };
            for entry in entries.flatten() {
                let path = entry.path();
                if path.is_dir() {
                    collect_rs(&path, out);
                } else if path.extension().and_then(|e| e.to_str()) == Some("rs") {
                    out.push(path);
                }
            }
        }

        let mut files = Vec::new();
        collect_rs(&src_root, &mut files);
        assert!(!files.is_empty(), "no .rs files found under {src_root:?}");

        let mut hits: Vec<(std::path::PathBuf, usize)> = Vec::new();
        for file in &files {
            let contents = std::fs::read_to_string(file).unwrap_or_default();
            for (idx, line) in contents.lines().enumerate() {
                // Only count real call sites, not prose: comment/doc lines that
                // merely mention the launcher (like this test's own docstring)
                // are excluded.
                let trimmed = line.trim_start();
                if trimmed.starts_with("//") {
                    continue;
                }
                if line.contains(&needle) {
                    hits.push((file.clone(), idx + 1));
                }
            }
        }

        assert_eq!(
            hits.len(),
            1,
            "raw browser launcher must be called from exactly one site (the \
             open_external_url chokepoint); found {} call(s): {:?}",
            hits.len(),
            hits
        );
        let (hit_path, _) = &hits[0];
        assert_eq!(
            hit_path.file_name().and_then(|n| n.to_str()),
            Some("oauth.rs"),
            "the single raw browser launcher must live in oauth.rs (the \
             chokepoint), found it in {hit_path:?}"
        );
    }
}
