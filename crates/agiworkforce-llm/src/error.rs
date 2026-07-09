//! Structured provider errors and HTTP error-response classification.
//!
//! [`LlmError`] is the crate's app-neutral error type: apps map it onto their
//! own error enums at the facade boundary (the CLI maps to `CliError`, the
//! desktop will map to its IPC error contract in stage c2). The classification
//! rules — including provider-specific message overrides, `Retry-After`
//! parsing, managed-cloud paywall detection, and context-overflow sniffing —
//! moved verbatim from `apps/cli/src/models/streaming.rs`.

use std::time::Duration;

/// Structured error from provider request/stream mechanics.
#[derive(Debug, thiserror::Error)]
pub enum LlmError {
    /// API-level errors from LLM providers (HTTP status, humanized body).
    #[error("[{provider}] API error (HTTP {status}): {message}")]
    Api {
        provider: String,
        status: u16,
        message: String,
    },
    /// Authentication failures (missing key, expired token, revoked).
    #[error("[{provider}] Authentication failed: {message}")]
    Auth { provider: String, message: String },
    /// Rate limiting from the provider (`Retry-After` seconds when sent).
    #[error("[{provider}] Rate limited{}", retry_after.map(|s| format!(" — retry after {s}s")).unwrap_or_default())]
    RateLimited {
        provider: String,
        retry_after: Option<u64>,
    },
    /// Network errors (connection refused, timeout, DNS) while sending.
    #[error("Network error ({url}): {message}")]
    Network { url: String, message: String },
    /// Context window overflow detected from the provider's error body.
    #[error("Context overflow for model '{model}'")]
    ContextOverflow { model: String },
    /// AGI Workforce managed-cloud paywall — the user's tier cap was reached.
    /// HTTP 429 + `{"kind":"paywall", ...}`.
    #[error("Paywall: feature '{feature}' requires the {required_tier} plan: {reason}")]
    Paywall {
        feature: String,
        required_tier: String,
        reason: String,
    },
    /// The stream produced no data within the idle window.
    ///
    /// The Display text intentionally reproduces the CLI's historical message
    /// (for a 300s window: "Streaming timed out: no data received for 5
    /// minutes") — the CLI facade surfaces it verbatim.
    #[error("Streaming timed out: no data received for {}", humanize_duration(*after))]
    IdleTimeout { after: Duration },
    /// Mid-stream read failure (connection dropped, TLS error, …).
    #[error("Error reading stream: {message}")]
    Read { message: String },
}

impl LlmError {
    /// Stable machine-readable kind, used by conformance fixtures and app-side
    /// mapping tables.
    pub fn kind(&self) -> &'static str {
        match self {
            LlmError::Api { .. } => "api",
            LlmError::Auth { .. } => "auth",
            LlmError::RateLimited { .. } => "rate_limited",
            LlmError::Network { .. } => "network",
            LlmError::ContextOverflow { .. } => "context_overflow",
            LlmError::Paywall { .. } => "paywall",
            LlmError::IdleTimeout { .. } => "idle_timeout",
            LlmError::Read { .. } => "read",
        }
    }

    /// Retry classification, mirroring the CLI's `CliError::is_retryable`:
    /// rate limits and network errors always retry; API errors retry on
    /// 429/500/502/503/504.
    pub fn is_retryable(&self) -> bool {
        const RETRYABLE_API_STATUSES: &[u16] = &[429, 500, 502, 503, 504];
        match self {
            LlmError::RateLimited { .. } | LlmError::Network { .. } => true,
            LlmError::Api { status, .. } => RETRYABLE_API_STATUSES.contains(status),
            _ => false,
        }
    }

    /// Provider-suggested retry delay (rate limits only).
    pub fn retry_after(&self) -> Option<u64> {
        match self {
            LlmError::RateLimited { retry_after, .. } => *retry_after,
            _ => None,
        }
    }
}

/// Render a duration the way the CLI's historical timeout message did:
/// whole minutes as "N minutes", everything else as seconds.
fn humanize_duration(d: Duration) -> String {
    let secs = d.as_secs();
    if secs >= 60 && secs.is_multiple_of(60) {
        let minutes = secs / 60;
        if minutes == 1 {
            "1 minute".to_string()
        } else {
            format!("{minutes} minutes")
        }
    } else if secs == 1 {
        "1 second".to_string()
    } else {
        format!("{secs} seconds")
    }
}

/// Managed-cloud paywall body, parsed from
/// `{"kind":"paywall","feature":"chat","requiredTier":"hobby","reason":"..."}`.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct PaywallNotice {
    pub feature: String,
    pub required_tier: String,
    pub reason: String,
}

/// Attempt to parse a paywall JSON body returned by the AGI Workforce
/// managed-cloud API when a user exceeds 150% of their tier quota. Returns
/// `None` when the body is not a paywall payload so callers can fall back to
/// regular rate-limit handling.
pub fn parse_paywall_body(body: &str) -> Option<PaywallNotice> {
    let v: serde_json::Value = serde_json::from_str(body).ok()?;
    if v.get("kind").and_then(|k| k.as_str()) != Some("paywall") {
        return None;
    }
    let feature = v
        .get("feature")
        .and_then(|f| f.as_str())
        .unwrap_or("chat")
        .to_string();
    let required_tier = v
        .get("requiredTier")
        .and_then(|t| t.as_str())
        .unwrap_or("hobby")
        .to_string();
    let reason = v
        .get("reason")
        .and_then(|r| r.as_str())
        .unwrap_or("Monthly token quota exceeded")
        .to_string();
    Some(PaywallNotice {
        feature,
        required_tier,
        reason,
    })
}

/// Check whether an error message looks like a context window overflow.
pub fn looks_like_context_overflow(msg: &str) -> bool {
    let lower = msg.to_lowercase();
    lower.contains("context")
        && (lower.contains("exceed")
            || lower.contains("too long")
            || lower.contains("overflow")
            || lower.contains("maximum"))
}

/// Infer provider name from a base URL for error reporting.
///
/// Best-effort fallback only — callers that know the provider should pass its
/// name via [`crate::ProviderSpec::id`]. Local OpenAI-compatible servers
/// (LM Studio, Ollama, …) can't be distinguished from each other by host
/// alone, so a `localhost`/`127.0.0.1` URL is labeled the generic "local".
pub fn provider_name_from_url(url: &str) -> &'static str {
    if url.contains("anthropic") {
        "anthropic"
    } else if url.contains("openai") {
        "openai"
    } else if url.contains("mistral") {
        "mistral"
    } else if url.contains("xai") || url.contains("grok") {
        "xai"
    } else if url.contains("deepseek") {
        "deepseek"
    } else if url.contains("groq") {
        "groq"
    } else if url.contains("openrouter") {
        "openrouter"
    } else if url.contains("api.ollama.com") {
        "ollama-cloud"
    } else if url.contains("localhost") || url.contains("127.0.0.1") {
        "local"
    } else {
        "unknown"
    }
}

/// Extract the best human-readable message from a provider error body. Handles
/// the common shapes — `{"error":{"message":"…"}}` (OpenAI/OpenRouter),
/// `{"error":"…"}`, `{"message":"…"}`, `{"detail":"…"}` — plus OpenRouter's
/// nested `{"error":{"metadata":{"raw":"{…}"}}}` where the real provider message
/// is a JSON string buried inside `metadata.raw`. Returns `None` when nothing
/// usable is found so callers can pick an appropriate fallback.
pub fn humanize_error_body(body: &str) -> Option<String> {
    let v: serde_json::Value = serde_json::from_str(body.trim()).ok()?;

    // OpenRouter wraps the upstream provider's error as a JSON *string* under
    // error.metadata.raw — unwrap it for the most specific message.
    if let Some(raw) = v.pointer("/error/metadata/raw").and_then(|r| r.as_str())
        && let Ok(inner) = serde_json::from_str::<serde_json::Value>(raw) {
            let inner_msg = inner
                .get("error")
                .and_then(|e| e.as_str().or_else(|| e.get("message").and_then(|m| m.as_str())))
                .or_else(|| inner.get("message").and_then(|m| m.as_str()));
            if let Some(m) = inner_msg.map(str::trim).filter(|m| !m.is_empty()) {
                return Some(m.to_string());
            }
        }

    let msg = v
        .get("error")
        .and_then(|e| e.get("message").and_then(|m| m.as_str()).or_else(|| e.as_str()))
        .or_else(|| v.get("message").and_then(|m| m.as_str()))
        .or_else(|| v.get("detail").and_then(|m| m.as_str()));
    msg.map(str::trim).filter(|m| !m.is_empty()).map(str::to_string)
}

/// Turn a provider's 401/403 error body into a concise, human-readable message
/// instead of dumping raw JSON at the user. Falls back to a generic auth line
/// when the body is empty or unparseable, so we never echo raw JSON/HTML.
fn humanize_auth_error_body(body: &str) -> String {
    humanize_error_body(body).unwrap_or_else(|| "invalid or expired API key".to_string())
}

/// Classify a non-success HTTP response into a structured [`LlmError`].
///
/// Order of precedence (matching the CLI's historical per-dialect flow):
/// 1. context-overflow sniffing on the body
/// 2. provider-specific overrides (Anthropic 529, OpenAI 404, Google 400 key)
/// 3. 401/403 → Auth (humanized body)
/// 4. 429 → managed-cloud paywall body, else RateLimited (with `Retry-After`)
/// 5. everything else → Api with a humanized message
pub fn classify_error_response(
    provider: &str,
    model: &str,
    status: u16,
    retry_after: Option<&str>,
    body: &str,
) -> LlmError {
    if looks_like_context_overflow(body) {
        return LlmError::ContextOverflow {
            model: model.to_string(),
        };
    }

    // Provider-specific error messages
    match (provider, status) {
        ("anthropic", 529) => {
            return LlmError::Api {
                provider: provider.to_string(),
                status,
                message: "Anthropic is overloaded. Retrying...".to_string(),
            };
        }
        ("openai", 404) => {
            return LlmError::Api {
                provider: provider.to_string(),
                status,
                message: "Model not found or not available".to_string(),
            };
        }
        ("google", 400) if body.to_lowercase().contains("api key") => {
            return LlmError::Auth {
                provider: provider.to_string(),
                message: "Invalid Google API key".to_string(),
            };
        }
        _ => {}
    }

    match status {
        401 | 403 => LlmError::Auth {
            provider: provider.to_string(),
            message: humanize_auth_error_body(body),
        },
        429 => {
            // AGI Workforce managed-cloud paywall: 429 + {"kind":"paywall", ...}
            // Takes precedence over generic rate-limit handling.
            if let Some(pw) = parse_paywall_body(body) {
                return LlmError::Paywall {
                    feature: pw.feature,
                    required_tier: pw.required_tier,
                    reason: pw.reason,
                };
            }
            let secs = retry_after.and_then(|s| s.trim().parse::<u64>().ok());
            LlmError::RateLimited {
                provider: provider.to_string(),
                retry_after: secs,
            }
        }
        _ => {
            // Never surface a raw JSON/HTML body to the user. Extract the
            // human-readable message; fall back to a terse HTTP line.
            let message = humanize_error_body(body)
                .unwrap_or_else(|| format!("request failed (HTTP {status})"));
            LlmError::Api {
                provider: provider.to_string(),
                status,
                message,
            }
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    // -- Context overflow detection --

    #[test]
    fn context_overflow_detects_exceed() {
        assert!(looks_like_context_overflow(
            "This request's context exceeds the model's maximum"
        ));
    }

    #[test]
    fn context_overflow_detects_too_long() {
        assert!(looks_like_context_overflow(
            "The context is too long for this model"
        ));
    }

    #[test]
    fn context_overflow_detects_overflow() {
        assert!(looks_like_context_overflow(
            "context overflow: token limit reached"
        ));
    }

    #[test]
    fn context_overflow_detects_maximum() {
        assert!(looks_like_context_overflow(
            "context length exceeds maximum allowed"
        ));
    }

    #[test]
    fn context_overflow_ignores_unrelated() {
        assert!(!looks_like_context_overflow("invalid api key"));
        assert!(!looks_like_context_overflow("rate limited"));
        assert!(!looks_like_context_overflow("exceeded quota")); // no "context"
    }

    // -- Provider-specific error messages --

    #[test]
    fn anthropic_529_overloaded() {
        let err = classify_error_response("anthropic", "m", 529, None, "overloaded");
        assert!(
            err.to_string().contains("Anthropic is overloaded"),
            "Expected overloaded message, got: {err}"
        );
    }

    #[test]
    fn openai_404_model_not_found() {
        let err = classify_error_response("openai", "m", 404, None, "model does not exist");
        assert!(
            err.to_string().contains("Model not found or not available"),
            "Expected model-not-found message, got: {err}"
        );
    }

    #[test]
    fn google_400_bad_api_key() {
        let err = classify_error_response(
            "google",
            "m",
            400,
            None,
            "API key not valid. Please pass a valid API key.",
        );
        assert!(
            err.to_string().contains("Invalid Google API key"),
            "Expected api-key message, got: {err}"
        );
    }

    #[test]
    fn google_400_without_api_key_text_is_generic() {
        let err = classify_error_response("google", "m", 400, None, "some other bad request");
        assert!(
            !err.to_string().contains("Invalid Google API key"),
            "Should not show api-key message for unrelated 400: {err}"
        );
    }

    // -- Standard codes --

    #[test]
    fn classify_401_as_auth() {
        let err = classify_error_response("openai", "m", 401, None, "invalid key");
        assert!(matches!(err, LlmError::Auth { .. }), "401 should be auth: {err}");
        assert!(err.to_string().contains("Authentication failed"));
    }

    #[test]
    fn classify_429_as_rate_limited_with_retry_after() {
        let err = classify_error_response("anthropic", "m", 429, Some("30"), "rate limited");
        assert!(matches!(
            err,
            LlmError::RateLimited {
                retry_after: Some(30),
                ..
            }
        ));
        assert!(err.is_retryable());
        assert_eq!(err.retry_after(), Some(30));
    }

    #[test]
    fn classify_500_as_retryable_api_error() {
        let err = classify_error_response("google", "m", 500, None, "internal error");
        assert!(matches!(err, LlmError::Api { status: 500, .. }));
        assert!(err.is_retryable());
    }

    #[test]
    fn classify_400_api_error_is_not_retryable() {
        let err = classify_error_response("openai", "m", 400, None, "bad request");
        assert!(!err.is_retryable());
    }

    #[test]
    fn classify_402_humanizes_nested_openrouter_error_no_raw_json() {
        // OpenRouter buries the real provider message in error.metadata.raw.
        let body = r#"{"error":{"message":"Provider returned error","code":402,"metadata":{"raw":"{\"error\":\"API key USD spend limit exceeded.\"}","provider_name":"Venice"}}}"#;
        let err = classify_error_response("openrouter", "m", 402, None, body);
        let msg = err.to_string();
        assert!(
            msg.contains("spend limit"),
            "should surface the nested provider message: {msg}"
        );
        assert!(
            !msg.contains("metadata") && !msg.contains("{\""),
            "must not echo raw JSON: {msg}"
        );
    }

    #[test]
    fn humanize_error_body_extracts_standard_and_nested_shapes() {
        assert_eq!(
            humanize_error_body(r#"{"error":{"message":"boom"}}"#).as_deref(),
            Some("boom")
        );
        assert_eq!(
            humanize_error_body(r#"{"message":"hi"}"#).as_deref(),
            Some("hi")
        );
        assert_eq!(
            humanize_error_body(r#"{"error":"plain"}"#).as_deref(),
            Some("plain")
        );
        assert_eq!(humanize_error_body("not json at all"), None);
        let nested = r#"{"error":{"metadata":{"raw":"{\"error\":\"real msg\"}"}}}"#;
        assert_eq!(humanize_error_body(nested).as_deref(), Some("real msg"));
    }

    // -- Paywall detection --

    #[test]
    fn parse_paywall_body_detects_paywall_json() {
        let body = r#"{"kind":"paywall","feature":"chat","requiredTier":"hobby","reason":"Monthly token quota exceeded (150%)"}"#;
        let pw = parse_paywall_body(body).expect("should parse paywall body");
        assert_eq!(pw.feature, "chat");
        assert_eq!(pw.required_tier, "hobby");
        assert_eq!(pw.reason, "Monthly token quota exceeded (150%)");
    }

    #[test]
    fn parse_paywall_body_returns_none_for_non_paywall_429() {
        let body = r#"{"error":{"type":"rate_limit_error","message":"Rate limit exceeded"}}"#;
        assert!(parse_paywall_body(body).is_none());
    }

    #[test]
    fn parse_paywall_body_returns_none_for_empty_body() {
        assert!(parse_paywall_body("").is_none());
        assert!(parse_paywall_body("null").is_none());
    }

    #[test]
    fn classify_returns_paywall_for_managed_cloud_429() {
        let body = r#"{"kind":"paywall","feature":"chat","requiredTier":"pro","reason":"Pro features require upgrade"}"#;
        let err = classify_error_response("agiworkforce", "m", 429, None, body);
        assert!(matches!(err, LlmError::Paywall { .. }), "got: {err}");
    }

    #[test]
    fn classify_returns_rate_limited_for_plain_429() {
        let err = classify_error_response(
            "agiworkforce",
            "m",
            429,
            None,
            r#"{"error":"rate limited"}"#,
        );
        assert!(matches!(
            err,
            LlmError::RateLimited {
                retry_after: None,
                ..
            }
        ));
    }

    // -- Idle timeout display parity with the legacy CLI message --

    #[test]
    fn idle_timeout_display_matches_cli_legacy_text_for_300s() {
        let err = LlmError::IdleTimeout {
            after: Duration::from_secs(300),
        };
        assert_eq!(
            err.to_string(),
            "Streaming timed out: no data received for 5 minutes"
        );
    }

    #[test]
    fn idle_timeout_display_for_other_windows() {
        assert_eq!(
            LlmError::IdleTimeout {
                after: Duration::from_secs(30)
            }
            .to_string(),
            "Streaming timed out: no data received for 30 seconds"
        );
        assert_eq!(
            LlmError::IdleTimeout {
                after: Duration::from_secs(60)
            }
            .to_string(),
            "Streaming timed out: no data received for 1 minute"
        );
    }

    #[test]
    fn provider_name_from_url_covers_known_hosts() {
        assert_eq!(provider_name_from_url("https://api.anthropic.com/v1"), "anthropic");
        assert_eq!(provider_name_from_url("https://api.openai.com/v1"), "openai");
        assert_eq!(provider_name_from_url("http://localhost:1234/v1"), "local");
        assert_eq!(provider_name_from_url("https://api.ollama.com/v1"), "ollama-cloud");
        assert_eq!(provider_name_from_url("https://example.com"), "unknown");
    }
}
