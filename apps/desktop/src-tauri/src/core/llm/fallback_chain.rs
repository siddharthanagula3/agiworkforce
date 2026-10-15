//! Provider rate-limit cooldowns and error classification for the LLM router.
//!
//! `LLMRouter` keeps one shared [`RateLimitTracker`] so a provider or model that
//! returned a rate limit or 5xx is skipped while its cooldown runs, and the
//! classification helpers decide which provider errors are worth retrying.

use std::collections::HashMap;
use std::time::{Duration, Instant};

use parking_lot::RwLock;
use serde::{Deserialize, Serialize};

use crate::core::llm::Provider;

// ============================================================================
// Rate Limit Tracking
// ============================================================================

/// Tracks rate limit cooldowns for each provider
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CooldownEntry {
    /// When the cooldown started
    #[serde(skip)]
    pub started_at: Option<Instant>,
    /// Duration of the cooldown
    pub duration: Duration,
    /// Number of consecutive rate limits hit
    pub consecutive_hits: u32,
    /// The model that was rate limited (if specific to a model)
    pub model: Option<String>,
}

impl CooldownEntry {
    /// Check if this cooldown has expired
    pub fn is_expired(&self) -> bool {
        match self.started_at {
            Some(started) => started.elapsed() >= self.duration,
            None => true,
        }
    }

    /// Get remaining cooldown time
    pub fn remaining(&self) -> Duration {
        match self.started_at {
            Some(started) => {
                let elapsed = started.elapsed();
                if elapsed >= self.duration {
                    Duration::ZERO
                } else {
                    self.duration - elapsed
                }
            }
            None => Duration::ZERO,
        }
    }
}

/// Configuration for rate limit tracking behavior
#[derive(Debug, Clone)]
pub struct RateLimitConfig {
    /// Base cooldown duration when rate limited
    pub base_cooldown: Duration,
    /// Maximum cooldown duration after consecutive rate limits
    pub max_cooldown: Duration,
    /// Multiplier for exponential backoff on consecutive rate limits
    pub backoff_multiplier: f64,
    /// Whether to track rate limits per-model (vs per-provider only)
    pub per_model_tracking: bool,
}

impl Default for RateLimitConfig {
    fn default() -> Self {
        Self {
            base_cooldown: Duration::from_secs(60),
            max_cooldown: Duration::from_secs(600), // 10 minutes
            backoff_multiplier: 2.0,
            per_model_tracking: true,
        }
    }
}

/// Tracks rate limit cooldowns across all providers
#[derive(Debug)]
pub struct RateLimitTracker {
    /// Cooldowns indexed by provider (and optionally model)
    cooldowns: RwLock<HashMap<String, CooldownEntry>>,
    /// Configuration for cooldown behavior
    config: RateLimitConfig,
}

impl Default for RateLimitTracker {
    fn default() -> Self {
        Self::new(RateLimitConfig::default())
    }
}

impl RateLimitTracker {
    /// Create a new rate limit tracker with the given configuration
    pub fn new(config: RateLimitConfig) -> Self {
        Self {
            cooldowns: RwLock::new(HashMap::new()),
            config,
        }
    }

    /// Generate a key for the cooldown map
    fn key(&self, provider: Provider, model: Option<&str>) -> String {
        if self.config.per_model_tracking {
            if let Some(m) = model {
                return format!("{}:{}", provider.as_string(), m);
            }
        }
        provider.as_string().to_string()
    }

    /// Check if a provider/model is currently rate limited (includes 5xx cooldowns).
    pub fn is_rate_limited(&self, provider: Provider, model: Option<&str>) -> bool {
        let cooldowns = self.cooldowns.read();

        // Check model-specific cooldown first
        let model_key = self.key(provider, model);
        if let Some(entry) = cooldowns.get(&model_key) {
            if !entry.is_expired() {
                return true;
            }
        }

        // Also check provider-level cooldown
        let provider_key = self.key(provider, None);
        if let Some(entry) = cooldowns.get(&provider_key) {
            if !entry.is_expired() {
                return true;
            }
        }

        // Also check 5xx server-error cooldowns
        let error_model_key = format!("5xx:{}", model_key);
        if let Some(entry) = cooldowns.get(&error_model_key) {
            if !entry.is_expired() {
                return true;
            }
        }
        let error_provider_key = format!("5xx:{}", provider_key);
        if let Some(entry) = cooldowns.get(&error_provider_key) {
            if !entry.is_expired() {
                return true;
            }
        }

        false
    }

    /// Record a rate limit hit for a provider/model
    pub fn record_rate_limit(
        &self,
        provider: Provider,
        model: Option<&str>,
        retry_after: Option<Duration>,
    ) {
        let key = self.key(provider, model);
        let mut cooldowns = self.cooldowns.write();

        let existing = cooldowns.get(&key);
        let consecutive_hits = existing.map(|e| e.consecutive_hits + 1).unwrap_or(1);

        // Calculate cooldown with exponential backoff
        let base_duration = retry_after.unwrap_or(self.config.base_cooldown);
        let backoff_factor = self
            .config
            .backoff_multiplier
            .powi((consecutive_hits - 1) as i32);
        let duration = Duration::from_secs_f64(
            (base_duration.as_secs_f64() * backoff_factor)
                .min(self.config.max_cooldown.as_secs_f64()),
        );

        tracing::warn!(
            provider = %provider.as_string(),
            model = model.unwrap_or("(provider-level)"),
            consecutive_hits = consecutive_hits,
            cooldown_secs = duration.as_secs(),
            "Rate limit recorded, entering cooldown"
        );

        cooldowns.insert(
            key,
            CooldownEntry {
                started_at: Some(Instant::now()),
                duration,
                consecutive_hits,
                model: model.map(String::from),
            },
        );
    }

    /// Record a server error (5xx) for a provider/model, entering a short cooldown.
    ///
    /// Uses a shorter base cooldown (15s) and max cooldown (120s) compared to rate
    /// limits, since 5xx errors are typically transient and resolve faster.
    pub fn record_server_error(&self, provider: Provider, model: Option<&str>) {
        let key = format!("5xx:{}", self.key(provider, model));
        let mut cooldowns = self.cooldowns.write();

        let existing = cooldowns.get(&key);
        let consecutive_hits = existing.map(|e| e.consecutive_hits + 1).unwrap_or(1);

        let base_duration = Duration::from_secs(15);
        let max_duration = Duration::from_secs(120);
        let backoff_factor = self
            .config
            .backoff_multiplier
            .powi((consecutive_hits - 1) as i32);
        let duration = Duration::from_secs_f64(
            (base_duration.as_secs_f64() * backoff_factor).min(max_duration.as_secs_f64()),
        );

        tracing::warn!(
            provider = %provider.as_string(),
            model = model.unwrap_or("(provider-level)"),
            consecutive_hits = consecutive_hits,
            cooldown_secs = duration.as_secs(),
            "Server error (5xx) recorded, entering cooldown"
        );

        cooldowns.insert(
            key,
            CooldownEntry {
                started_at: Some(Instant::now()),
                duration,
                consecutive_hits,
                model: model.map(String::from),
            },
        );
    }

    /// Record a successful request, resetting the consecutive hit counter
    pub fn record_success(&self, provider: Provider, model: Option<&str>) {
        let key = self.key(provider, model);
        let mut cooldowns = self.cooldowns.write();
        cooldowns.remove(&key);
        cooldowns.remove(&format!("5xx:{}", key));
    }

    /// Clear all cooldowns (useful for testing or manual reset)
    pub fn clear_all(&self) {
        let mut cooldowns = self.cooldowns.write();
        cooldowns.clear();
    }

    /// Get current cooldown status for all providers (for debugging/UI)
    pub fn get_status(&self) -> HashMap<String, CooldownStatus> {
        let cooldowns = self.cooldowns.read();
        cooldowns
            .iter()
            .filter(|(_, entry)| !entry.is_expired())
            .map(|(key, entry)| {
                (
                    key.clone(),
                    CooldownStatus {
                        remaining: entry.remaining(),
                        consecutive_hits: entry.consecutive_hits,
                    },
                )
            })
            .collect()
    }
}

/// Status of a single cooldown entry
#[derive(Debug, Clone, Serialize)]
pub struct CooldownStatus {
    /// Remaining time in cooldown
    pub remaining: Duration,
    /// Number of consecutive rate limit hits
    pub consecutive_hits: u32,
}

// ============================================================================
// Error Classification Helpers
// ============================================================================

/// Determine if an error indicates a rate limit
pub fn is_rate_limit_error(error: &str) -> bool {
    let error_lower = error.to_lowercase();
    error_lower.contains("rate limit")
        || error_lower.contains("too many requests")
        || error_lower.contains("429")
        || error_lower.contains("quota exceeded")
        || error_lower.contains("rate_limit_exceeded")
        || error_lower.contains("tokens per min")
        || error_lower.contains("requests per min")
        || error_lower.contains("rpm limit")
        || error_lower.contains("tpm limit")
}

/// Determine if an error is retryable (transient)
pub fn is_retryable_error(error: &str) -> bool {
    let error_lower = error.to_lowercase();

    // Non-retryable: credit/billing/quota exhaustion errors (must be checked FIRST
    // to prevent false positives from substring matches like "connection" in
    // "connection to billing" or "try again" in "try again with a different payment")
    if error_lower.contains("402")
        || error_lower.contains("insufficient_quota")
        || error_lower.contains("insufficient credits")
        || error_lower.contains("billing")
        || error_lower.contains("payment_required")
        || error_lower.contains("quota_exceeded")
        || (error_lower.contains("credit") && error_lower.contains("exhaust"))
    {
        return false;
    }

    // Rate limiting - retryable but with cooldown
    if is_rate_limit_error(error) {
        return true;
    }

    // Server errors - generally retryable
    if error_lower.contains("500")
        || error_lower.contains("502")
        || error_lower.contains("503")
        || error_lower.contains("504")
        || error_lower.contains("internal server error")
        || error_lower.contains("bad gateway")
        || error_lower.contains("service unavailable")
        || error_lower.contains("gateway timeout")
    {
        return true;
    }

    // Network/connection errors - retryable
    if error_lower.contains("connection")
        || error_lower.contains("timeout")
        || error_lower.contains("network")
        || error_lower.contains("temporarily")
        || error_lower.contains("timed out")
        || error_lower.contains("dns")
    {
        return true;
    }

    // Overload errors - retryable
    if error_lower.contains("overloaded")
        || error_lower.contains("capacity")
        || error_lower.contains("busy")
        || error_lower.contains("try again")
    {
        return true;
    }

    false
}

/// Parse retry-after duration from error messages or headers
pub fn parse_retry_after(error: &str) -> Option<Duration> {
    let error_lower = error.to_lowercase();

    // Try to find "retry after X seconds" pattern
    if let Some(pos) = error_lower.find("retry after") {
        let after_text = &error_lower[pos + 11..];
        if let Some(end) = after_text.find(|c: char| !c.is_numeric() && c != '.') {
            if let Some(wait) = after_text[..end]
                .trim()
                .parse::<f64>()
                .ok()
                .and_then(|secs| Duration::try_from_secs_f64(secs).ok())
            {
                return Some(wait);
            }
        }
    }

    // Try to find "X seconds" pattern
    if let Some(pos) = error_lower.find(" seconds") {
        let before = &error_lower[..pos];
        let start = before
            .rfind(|c: char| !c.is_numeric() && c != '.')
            .map(|i| i + 1)
            .unwrap_or(0);
        if let Some(wait) = before[start..]
            .trim()
            .parse::<f64>()
            .ok()
            .and_then(|secs| Duration::try_from_secs_f64(secs).ok())
        {
            return Some(wait);
        }
    }

    None
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn a_retry_after_too_large_to_be_a_duration_is_ignored_not_fatal() {
        assert_eq!(
            parse_retry_after("Retry after 99999999999999999999999 seconds."),
            None
        );
        assert_eq!(
            parse_retry_after("Retry after 60 seconds."),
            Some(Duration::from_secs(60))
        );
    }

    #[test]
    fn test_rate_limit_tracker_basic() {
        let tracker = RateLimitTracker::default();

        // Initially not rate limited
        assert!(!tracker.is_rate_limited(Provider::OpenAI, Some("fixture-primary-model")));

        // Record rate limit
        tracker.record_rate_limit(Provider::OpenAI, Some("fixture-primary-model"), None);

        // Now rate limited
        assert!(tracker.is_rate_limited(Provider::OpenAI, Some("fixture-primary-model")));

        // Other providers not affected
        assert!(!tracker.is_rate_limited(Provider::Anthropic, Some("fixture-balanced-model")));
    }

    #[test]
    fn test_rate_limit_tracker_success_clears() {
        let tracker = RateLimitTracker::default();

        tracker.record_rate_limit(Provider::OpenAI, Some("fixture-primary-model"), None);
        assert!(tracker.is_rate_limited(Provider::OpenAI, Some("fixture-primary-model")));

        tracker.record_success(Provider::OpenAI, Some("fixture-primary-model"));
        assert!(!tracker.is_rate_limited(Provider::OpenAI, Some("fixture-primary-model")));
    }

    #[test]
    fn test_rate_limit_tracker_consecutive_backoff() {
        let config = RateLimitConfig {
            base_cooldown: Duration::from_secs(10),
            max_cooldown: Duration::from_secs(100),
            backoff_multiplier: 2.0,
            per_model_tracking: true,
        };
        let tracker = RateLimitTracker::new(config);

        // First hit: 10 seconds
        tracker.record_rate_limit(Provider::OpenAI, Some("fixture-primary-model"), None);
        let cooldowns = tracker.cooldowns.read();
        let entry = cooldowns.get("openai:fixture-primary-model").unwrap();
        assert_eq!(entry.consecutive_hits, 1);
        assert_eq!(entry.duration, Duration::from_secs(10));
        drop(cooldowns);

        // Second hit: 20 seconds (10 * 2^1)
        tracker.record_rate_limit(Provider::OpenAI, Some("fixture-primary-model"), None);
        let cooldowns = tracker.cooldowns.read();
        let entry = cooldowns.get("openai:fixture-primary-model").unwrap();
        assert_eq!(entry.consecutive_hits, 2);
        assert_eq!(entry.duration, Duration::from_secs(20));
        drop(cooldowns);

        // Third hit: 40 seconds (10 * 2^2)
        tracker.record_rate_limit(Provider::OpenAI, Some("fixture-primary-model"), None);
        let cooldowns = tracker.cooldowns.read();
        let entry = cooldowns.get("openai:fixture-primary-model").unwrap();
        assert_eq!(entry.consecutive_hits, 3);
        assert_eq!(entry.duration, Duration::from_secs(40));
    }

    #[test]
    fn test_is_rate_limit_error() {
        assert!(is_rate_limit_error("rate limit exceeded"));
        assert!(is_rate_limit_error("429 Too Many Requests"));
        assert!(is_rate_limit_error("Rate_limit_exceeded: tokens per min"));
        assert!(is_rate_limit_error("quota exceeded"));
        assert!(!is_rate_limit_error("internal server error"));
        assert!(!is_rate_limit_error("invalid api key"));
    }

    #[test]
    fn test_is_retryable_error() {
        // Rate limits are retryable
        assert!(is_retryable_error("rate limit exceeded"));

        // Server errors are retryable
        assert!(is_retryable_error("500 internal server error"));
        assert!(is_retryable_error("502 bad gateway"));
        assert!(is_retryable_error("503 service unavailable"));
        assert!(is_retryable_error("504 gateway timeout"));

        // Network errors are retryable
        assert!(is_retryable_error("connection refused"));
        assert!(is_retryable_error("request timed out"));
        assert!(is_retryable_error("network error"));

        // Permanent errors are not retryable
        assert!(!is_retryable_error("invalid api key"));
        assert!(!is_retryable_error("model not found"));
        assert!(!is_retryable_error("invalid request"));
    }

    #[test]
    fn test_parse_retry_after() {
        assert_eq!(
            parse_retry_after("Please retry after 60 seconds"),
            Some(Duration::from_secs(60))
        );
        assert_eq!(
            parse_retry_after("Rate limited. Try again in 30 seconds."),
            Some(Duration::from_secs(30))
        );
        assert_eq!(
            parse_retry_after("Error: retry after 1.5 seconds"),
            Some(Duration::from_secs_f64(1.5))
        );
        assert_eq!(parse_retry_after("Unknown error"), None);
    }
}
