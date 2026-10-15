//! Tests for the router's rate-limit tracker and provider error classification

#[cfg(test)]
mod tests {
    use std::time::Duration;

    use crate::core::llm::fallback_chain::{
        is_rate_limit_error, is_retryable_error, parse_retry_after, RateLimitConfig,
        RateLimitTracker,
    };
    use crate::core::llm::Provider;

    // ========================================================================
    // RateLimitTracker Tests
    // ========================================================================

    #[test]
    fn test_tracker_initial_state() {
        let tracker = RateLimitTracker::default();

        // No providers should be rate limited initially
        assert!(!tracker.is_rate_limited(Provider::OpenAI, None));
        assert!(!tracker.is_rate_limited(Provider::Anthropic, Some("fixture-balanced-model")));
        assert!(!tracker.is_rate_limited(Provider::Google, Some("fixture-fast-model")));
    }

    #[test]
    fn test_tracker_provider_level_rate_limit() {
        let config = RateLimitConfig {
            per_model_tracking: false,
            ..Default::default()
        };
        let tracker = RateLimitTracker::new(config);

        // Rate limit the provider (not specific model)
        tracker.record_rate_limit(Provider::OpenAI, None, Some(Duration::from_secs(60)));

        // All models for this provider should be rate limited
        assert!(tracker.is_rate_limited(Provider::OpenAI, None));
        assert!(tracker.is_rate_limited(Provider::OpenAI, Some("fixture-primary-model")));
        assert!(tracker.is_rate_limited(Provider::OpenAI, Some("fixture-secondary-model")));

        // Other providers not affected
        assert!(!tracker.is_rate_limited(Provider::Anthropic, None));
    }

    #[test]
    fn test_tracker_model_level_rate_limit() {
        let config = RateLimitConfig {
            per_model_tracking: true,
            ..Default::default()
        };
        let tracker = RateLimitTracker::new(config);

        // Rate limit a specific model
        tracker.record_rate_limit(
            Provider::OpenAI,
            Some("fixture-primary-model"),
            Some(Duration::from_secs(60)),
        );

        // Only that model should be rate limited
        assert!(tracker.is_rate_limited(Provider::OpenAI, Some("fixture-primary-model")));
        assert!(!tracker.is_rate_limited(Provider::OpenAI, Some("fixture-secondary-model")));
        assert!(!tracker.is_rate_limited(Provider::OpenAI, None));
    }

    #[test]
    fn test_tracker_success_resets_consecutive_hits() {
        let tracker = RateLimitTracker::default();

        // Record multiple rate limits
        tracker.record_rate_limit(Provider::OpenAI, Some("fixture-primary-model"), None);
        tracker.record_rate_limit(Provider::OpenAI, Some("fixture-primary-model"), None);
        tracker.record_rate_limit(Provider::OpenAI, Some("fixture-primary-model"), None);

        // Record success
        tracker.record_success(Provider::OpenAI, Some("fixture-primary-model"));

        // Should no longer be rate limited
        assert!(!tracker.is_rate_limited(Provider::OpenAI, Some("fixture-primary-model")));
    }

    #[test]
    fn test_tracker_clear_all() {
        let tracker = RateLimitTracker::default();

        tracker.record_rate_limit(Provider::OpenAI, Some("fixture-primary-model"), None);
        tracker.record_rate_limit(Provider::Anthropic, Some("claude"), None);
        tracker.record_rate_limit(Provider::Google, Some("gemini"), None);

        assert!(tracker.is_rate_limited(Provider::OpenAI, Some("fixture-primary-model")));
        assert!(tracker.is_rate_limited(Provider::Anthropic, Some("claude")));
        assert!(tracker.is_rate_limited(Provider::Google, Some("gemini")));

        tracker.clear_all();

        assert!(!tracker.is_rate_limited(Provider::OpenAI, Some("fixture-primary-model")));
        assert!(!tracker.is_rate_limited(Provider::Anthropic, Some("claude")));
        assert!(!tracker.is_rate_limited(Provider::Google, Some("gemini")));
    }

    #[test]
    fn test_tracker_get_status() {
        let tracker = RateLimitTracker::default();

        tracker.record_rate_limit(Provider::OpenAI, Some("fixture-primary-model"), None);
        tracker.record_rate_limit(Provider::Anthropic, Some("claude"), None);

        let status = tracker.get_status();
        assert_eq!(status.len(), 2);
        assert!(status.contains_key("openai:fixture-primary-model"));
        assert!(status.contains_key("anthropic:claude"));
    }

    // ========================================================================
    // Error Classification Tests
    // ========================================================================

    #[test]
    fn test_rate_limit_error_detection() {
        // Positive cases
        assert!(is_rate_limit_error("Rate limit exceeded"));
        assert!(is_rate_limit_error("429 Too Many Requests"));
        assert!(is_rate_limit_error("rate_limit_exceeded: tokens per min"));
        assert!(is_rate_limit_error("Quota exceeded for this model"));
        assert!(is_rate_limit_error("RPM limit reached"));
        assert!(is_rate_limit_error("TPM limit exceeded"));

        // Negative cases
        assert!(!is_rate_limit_error("Internal server error"));
        assert!(!is_rate_limit_error("Invalid API key"));
        assert!(!is_rate_limit_error("Model not found"));
        assert!(!is_rate_limit_error("Request timeout"));
    }

    #[test]
    fn test_retryable_error_detection() {
        // Rate limits are retryable
        assert!(is_retryable_error("Rate limit exceeded"));
        assert!(is_retryable_error("429"));

        // Server errors are retryable
        assert!(is_retryable_error("500 Internal Server Error"));
        assert!(is_retryable_error("502 Bad Gateway"));
        assert!(is_retryable_error("503 Service Unavailable"));
        assert!(is_retryable_error("504 Gateway Timeout"));

        // Network errors are retryable
        assert!(is_retryable_error("Connection refused"));
        assert!(is_retryable_error("Request timed out"));
        assert!(is_retryable_error("Network error"));
        assert!(is_retryable_error("DNS resolution failed"));

        // Overload errors are retryable
        assert!(is_retryable_error("Server overloaded"));
        assert!(is_retryable_error("Temporarily unavailable"));
        assert!(is_retryable_error("Please try again later"));

        // Permanent errors are not retryable
        assert!(!is_retryable_error("Invalid API key"));
        assert!(!is_retryable_error("Model not found"));
        assert!(!is_retryable_error("Invalid request format"));
        assert!(!is_retryable_error("Insufficient permissions"));
    }

    #[test]
    fn test_parse_retry_after() {
        // Standard patterns
        assert_eq!(
            parse_retry_after("Please retry after 60 seconds"),
            Some(Duration::from_secs(60))
        );
        assert_eq!(
            parse_retry_after("Rate limited. Retry after 30 seconds."),
            Some(Duration::from_secs(30))
        );
        assert_eq!(
            parse_retry_after("Wait 120 seconds before retrying"),
            Some(Duration::from_secs(120))
        );

        // Decimal values
        assert_eq!(
            parse_retry_after("Retry after 1.5 seconds"),
            Some(Duration::from_secs_f64(1.5))
        );

        // The exact text a provider error carries when the API sent Retry-After
        assert_eq!(
            parse_retry_after("openai API error 429: Rate limit exceeded. Retry after 60 seconds."),
            Some(Duration::from_secs(60))
        );

        // No retry-after info
        assert_eq!(parse_retry_after("Rate limit exceeded"), None);
        assert_eq!(parse_retry_after("Unknown error"), None);
    }

    #[test]
    fn test_rate_limit_config_default() {
        let config = RateLimitConfig::default();

        assert_eq!(config.base_cooldown, Duration::from_secs(60));
        assert_eq!(config.max_cooldown, Duration::from_secs(600));
        assert_eq!(config.backoff_multiplier, 2.0);
        assert!(config.per_model_tracking);
    }
}
