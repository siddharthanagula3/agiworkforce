//! Integration tests for the fallback chain with the LLM router

#[cfg(test)]
mod tests {
    use std::sync::Arc;
    use std::time::Duration;

    use crate::core::llm::fallback_chain::{
        is_rate_limit_error, is_retryable_error, parse_retry_after, AggregateError,
        CandidateBuilder, FallbackChain, FallbackConfig, ModelCandidate, ProviderError,
        RateLimitConfig, RateLimitTracker,
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
        assert!(!tracker.is_rate_limited(Provider::Anthropic, Some("claude-sonnet")));
        assert!(!tracker.is_rate_limited(Provider::Google, Some("gemini-pro")));
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
        assert!(tracker.is_rate_limited(Provider::OpenAI, Some("gpt-5")));
        assert!(tracker.is_rate_limited(Provider::OpenAI, Some("gpt-5-nano")));

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
            Some("gpt-5"),
            Some(Duration::from_secs(60)),
        );

        // Only that model should be rate limited
        assert!(tracker.is_rate_limited(Provider::OpenAI, Some("gpt-5")));
        assert!(!tracker.is_rate_limited(Provider::OpenAI, Some("gpt-5-nano")));
        assert!(!tracker.is_rate_limited(Provider::OpenAI, None));
    }

    #[test]
    fn test_tracker_cooldown_remaining() {
        let config = RateLimitConfig {
            base_cooldown: Duration::from_secs(60),
            ..Default::default()
        };
        let tracker = RateLimitTracker::new(config);

        tracker.record_rate_limit(Provider::OpenAI, Some("gpt-5"), None);

        let remaining = tracker.cooldown_remaining(Provider::OpenAI, Some("gpt-5"));
        assert!(remaining > Duration::ZERO);
        assert!(remaining <= Duration::from_secs(60));

        // Non-rate-limited providers have zero remaining
        let remaining = tracker.cooldown_remaining(Provider::Anthropic, None);
        assert_eq!(remaining, Duration::ZERO);
    }

    #[test]
    fn test_tracker_success_resets_consecutive_hits() {
        let tracker = RateLimitTracker::default();

        // Record multiple rate limits
        tracker.record_rate_limit(Provider::OpenAI, Some("gpt-5"), None);
        tracker.record_rate_limit(Provider::OpenAI, Some("gpt-5"), None);
        tracker.record_rate_limit(Provider::OpenAI, Some("gpt-5"), None);

        // Record success
        tracker.record_success(Provider::OpenAI, Some("gpt-5"));

        // Should no longer be rate limited
        assert!(!tracker.is_rate_limited(Provider::OpenAI, Some("gpt-5")));
    }

    #[test]
    fn test_tracker_clear_all() {
        let tracker = RateLimitTracker::default();

        tracker.record_rate_limit(Provider::OpenAI, Some("gpt-5"), None);
        tracker.record_rate_limit(Provider::Anthropic, Some("claude"), None);
        tracker.record_rate_limit(Provider::Google, Some("gemini"), None);

        assert!(tracker.is_rate_limited(Provider::OpenAI, Some("gpt-5")));
        assert!(tracker.is_rate_limited(Provider::Anthropic, Some("claude")));
        assert!(tracker.is_rate_limited(Provider::Google, Some("gemini")));

        tracker.clear_all();

        assert!(!tracker.is_rate_limited(Provider::OpenAI, Some("gpt-5")));
        assert!(!tracker.is_rate_limited(Provider::Anthropic, Some("claude")));
        assert!(!tracker.is_rate_limited(Provider::Google, Some("gemini")));
    }

    #[test]
    fn test_tracker_get_status() {
        let tracker = RateLimitTracker::default();

        tracker.record_rate_limit(Provider::OpenAI, Some("gpt-5"), None);
        tracker.record_rate_limit(Provider::Anthropic, Some("claude"), None);

        let status = tracker.get_status();
        assert_eq!(status.len(), 2);
        assert!(status.contains_key("openai:gpt-5"));
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

        // No retry-after info
        assert_eq!(parse_retry_after("Rate limit exceeded"), None);
        assert_eq!(parse_retry_after("Unknown error"), None);
    }

    // ========================================================================
    // ModelCandidate Tests
    // ========================================================================

    #[test]
    fn test_candidate_builder() {
        let candidates = CandidateBuilder::new()
            .add(Provider::Anthropic, "claude-sonnet-4-5")
            .add_with_priority(Provider::OpenAI, "gpt-5.2", 1)
            .add_with_reason(Provider::Google, "gemini-3-pro-preview", "multimodal fallback")
            .build();

        assert_eq!(candidates.len(), 3);

        assert_eq!(candidates[0].provider, Provider::Anthropic);
        assert_eq!(candidates[0].model, "claude-sonnet-4-5");
        assert_eq!(candidates[0].priority, 0);

        assert_eq!(candidates[1].provider, Provider::OpenAI);
        assert_eq!(candidates[1].model, "gpt-5.2");
        assert_eq!(candidates[1].priority, 1);

        assert_eq!(candidates[2].provider, Provider::Google);
        assert_eq!(candidates[2].model, "gemini-3-pro-preview");
        assert_eq!(
            candidates[2].reason,
            Some("multimodal fallback".to_string())
        );
    }

    #[test]
    fn test_candidate_non_skippable() {
        let candidate = ModelCandidate::new(Provider::OpenAI, "gpt-5")
            .non_skippable()
            .with_reason("must try this");

        assert!(!candidate.skippable);
        assert_eq!(candidate.reason, Some("must try this".to_string()));
    }

    // ========================================================================
    // AggregateError Tests
    // ========================================================================

    #[test]
    fn test_aggregate_error_all_rate_limited() {
        let errors = vec![
            ProviderError {
                provider: Provider::OpenAI,
                model: "gpt-5".to_string(),
                message: "rate limit exceeded".to_string(),
                is_retryable: true,
                is_rate_limit: true,
                timestamp: std::time::Instant::now(),
            },
            ProviderError {
                provider: Provider::Anthropic,
                model: "claude".to_string(),
                message: "429 too many requests".to_string(),
                is_retryable: true,
                is_rate_limit: true,
                timestamp: std::time::Instant::now(),
            },
        ];

        let agg = AggregateError::new(errors, 2, 0);

        assert!(agg.all_rate_limited());
        assert!(agg.any_retryable());
        assert!(agg.first_non_rate_limit_error().is_none());
        assert!(agg.user_message().contains("temporarily busy"));
    }

    #[test]
    fn test_aggregate_error_mixed() {
        let errors = vec![
            ProviderError {
                provider: Provider::OpenAI,
                model: "gpt-5".to_string(),
                message: "rate limit exceeded".to_string(),
                is_retryable: true,
                is_rate_limit: true,
                timestamp: std::time::Instant::now(),
            },
            ProviderError {
                provider: Provider::Anthropic,
                model: "claude".to_string(),
                message: "internal server error".to_string(),
                is_retryable: true,
                is_rate_limit: false,
                timestamp: std::time::Instant::now(),
            },
        ];

        let agg = AggregateError::new(errors, 2, 0);

        assert!(!agg.all_rate_limited());
        assert!(agg.any_retryable());

        let first_non_rl = agg.first_non_rate_limit_error().unwrap();
        assert_eq!(first_non_rl.provider, Provider::Anthropic);
    }

    #[test]
    fn test_aggregate_error_all_skipped() {
        let agg = AggregateError::new(vec![], 0, 3);

        assert!(agg.errors.is_empty());
        assert_eq!(agg.candidates_skipped_rate_limit, 3);
        assert!(agg.user_message().contains("temporarily busy"));
    }

    // ========================================================================
    // FallbackChain Async Tests
    // ========================================================================

    #[tokio::test]
    async fn test_chain_success_first_candidate() {
        let chain = FallbackChain::new(FallbackConfig::default());
        let candidates = vec![
            ModelCandidate::new(Provider::Anthropic, "claude-sonnet"),
            ModelCandidate::new(Provider::OpenAI, "gpt-5"),
        ];

        let result = chain
            .run_with_fallback(&candidates, |candidate| async move {
                Ok::<_, Box<dyn std::error::Error + Send + Sync>>(format!(
                    "success:{}",
                    candidate.provider.as_string()
                ))
            })
            .await
            .unwrap();

        assert_eq!(result.value, "success:anthropic");
        assert_eq!(result.successful_candidate.provider, Provider::Anthropic);
        assert_eq!(result.attempts, 1);
        assert!(result.failed_attempts.is_empty());
        assert!(result.skipped_due_to_rate_limit.is_empty());
    }

    #[tokio::test]
    async fn test_chain_fallback_on_error() {
        let chain = FallbackChain::new(FallbackConfig {
            max_retries_per_candidate: 0,
            ..Default::default()
        });
        let candidates = vec![
            ModelCandidate::new(Provider::Anthropic, "claude-sonnet"),
            ModelCandidate::new(Provider::OpenAI, "gpt-5"),
        ];

        let result = chain
            .run_with_fallback(&candidates, |candidate| async move {
                if candidate.provider == Provider::Anthropic {
                    Err::<String, _>("internal server error".into())
                } else {
                    Ok("fallback success".to_string())
                }
            })
            .await
            .unwrap();

        assert_eq!(result.value, "fallback success");
        assert_eq!(result.successful_candidate.provider, Provider::OpenAI);
        assert_eq!(result.attempts, 2);
        assert_eq!(result.failed_attempts.len(), 1);
        assert_eq!(result.failed_attempts[0].provider, Provider::Anthropic);
        assert!(result.skipped_due_to_rate_limit.is_empty());
    }

    #[tokio::test]
    async fn test_chain_skips_rate_limited() {
        let chain = FallbackChain::new(FallbackConfig {
            max_retries_per_candidate: 0,
            ..Default::default()
        });

        // Pre-rate-limit the first provider
        chain.rate_limit_tracker().record_rate_limit(
            Provider::Anthropic,
            Some("claude-sonnet"),
            None,
        );

        let candidates = vec![
            ModelCandidate::new(Provider::Anthropic, "claude-sonnet"),
            ModelCandidate::new(Provider::OpenAI, "gpt-5"),
        ];

        let result = chain
            .run_with_fallback(&candidates, |candidate| async move {
                Ok::<_, Box<dyn std::error::Error + Send + Sync>>(format!(
                    "{}:{}",
                    candidate.provider.as_string(),
                    candidate.model
                ))
            })
            .await
            .unwrap();

        // Should skip Anthropic and go directly to OpenAI
        assert_eq!(result.value, "openai:gpt-5");
        assert_eq!(result.successful_candidate.provider, Provider::OpenAI);
        assert_eq!(result.attempts, 1); // Only attempted OpenAI

        // Verify the skipped list tracks the rate-limited provider
        assert_eq!(result.skipped_due_to_rate_limit.len(), 1);
        assert_eq!(
            result.skipped_due_to_rate_limit[0],
            "anthropic:claude-sonnet"
        );
    }

    #[tokio::test]
    async fn test_chain_non_skippable_ignores_rate_limit() {
        let chain = FallbackChain::new(FallbackConfig {
            max_retries_per_candidate: 0,
            ..Default::default()
        });

        // Pre-rate-limit the provider
        chain.rate_limit_tracker().record_rate_limit(
            Provider::Anthropic,
            Some("claude-sonnet"),
            None,
        );

        let candidates = vec![
            ModelCandidate::new(Provider::Anthropic, "claude-sonnet").non_skippable(),
            ModelCandidate::new(Provider::OpenAI, "gpt-5"),
        ];

        let result = chain
            .run_with_fallback(&candidates, |candidate| async move {
                Ok::<_, Box<dyn std::error::Error + Send + Sync>>(format!(
                    "{}:{}",
                    candidate.provider.as_string(),
                    candidate.model
                ))
            })
            .await
            .unwrap();

        // Should attempt Anthropic despite rate limit because it's non-skippable
        assert_eq!(result.value, "anthropic:claude-sonnet");
    }

    #[tokio::test]
    async fn test_chain_records_rate_limit() {
        let chain = FallbackChain::new(FallbackConfig {
            max_retries_per_candidate: 0,
            ..Default::default()
        });
        let candidates = vec![
            ModelCandidate::new(Provider::Anthropic, "claude-sonnet"),
            ModelCandidate::new(Provider::OpenAI, "gpt-5"),
        ];

        let result = chain
            .run_with_fallback(&candidates, |candidate| async move {
                if candidate.provider == Provider::Anthropic {
                    Err::<String, _>("429 rate limit exceeded. Retry after 60 seconds.".into())
                } else {
                    Ok("success".to_string())
                }
            })
            .await
            .unwrap();

        assert_eq!(result.value, "success");

        // Anthropic should now be rate limited
        assert!(chain
            .rate_limit_tracker()
            .is_rate_limited(Provider::Anthropic, Some("claude-sonnet")));

        // OpenAI should not be rate limited
        assert!(!chain
            .rate_limit_tracker()
            .is_rate_limited(Provider::OpenAI, Some("gpt-5")));
    }

    #[tokio::test]
    async fn test_chain_all_fail() {
        let chain = FallbackChain::new(FallbackConfig {
            max_retries_per_candidate: 0,
            ..Default::default()
        });
        let candidates = vec![
            ModelCandidate::new(Provider::Anthropic, "claude-sonnet"),
            ModelCandidate::new(Provider::OpenAI, "gpt-5"),
        ];

        let result = chain
            .run_with_fallback(&candidates, |_candidate| async move {
                Err::<String, _>("permanent error".into())
            })
            .await;

        assert!(result.is_err());
        let err = result.unwrap_err();
        assert_eq!(err.candidates_attempted, 2);
        assert_eq!(err.errors.len(), 2);
        assert!(err.errors.iter().all(|e| e.message == "permanent error"));
    }

    #[tokio::test]
    async fn test_chain_respects_max_attempts() {
        let chain = FallbackChain::new(FallbackConfig {
            max_attempts: 2,
            max_retries_per_candidate: 0,
            ..Default::default()
        });
        let candidates = vec![
            ModelCandidate::new(Provider::Anthropic, "claude-sonnet"),
            ModelCandidate::new(Provider::OpenAI, "gpt-5"),
            ModelCandidate::new(Provider::Google, "gemini-pro"),
        ];

        let result = chain
            .run_with_fallback(&candidates, |_candidate| async move {
                Err::<String, _>("error".into())
            })
            .await;

        assert!(result.is_err());
        let err = result.unwrap_err();
        // Should only attempt 2 candidates (max_attempts = 2)
        assert_eq!(err.candidates_attempted, 2);
    }

    #[tokio::test]
    async fn test_chain_priority_ordering() {
        let chain = FallbackChain::new(FallbackConfig {
            max_retries_per_candidate: 0,
            ..Default::default()
        });

        // Add candidates with explicit priorities (lower = higher priority)
        let candidates = vec![
            ModelCandidate::new(Provider::Google, "gemini").with_priority(2),
            ModelCandidate::new(Provider::OpenAI, "gpt-5").with_priority(0), // Highest priority
            ModelCandidate::new(Provider::Anthropic, "claude").with_priority(1),
        ];

        let attempts_clone = Arc::new(std::sync::Mutex::new(Vec::new()));

        let _result = chain
            .run_with_fallback(&candidates, |candidate| {
                let attempts = attempts_clone.clone();
                async move {
                    attempts
                        .lock()
                        .unwrap()
                        .push(candidate.provider.as_string().to_string());

                    // Fail first two, succeed on third
                    if candidate.provider == Provider::Google {
                        Ok::<_, Box<dyn std::error::Error + Send + Sync>>("success".to_string())
                    } else {
                        Err("error".into())
                    }
                }
            })
            .await
            .unwrap();

        let attempts = attempts_clone.lock().unwrap();
        // Should be tried in priority order: OpenAI (0), Anthropic (1), Google (2)
        assert_eq!(attempts[0], "openai");
        assert_eq!(attempts[1], "anthropic");
        assert_eq!(attempts[2], "google");
    }

    #[tokio::test]
    async fn test_chain_shared_tracker() {
        let tracker = Arc::new(RateLimitTracker::default());

        // Pre-rate-limit a provider
        tracker.record_rate_limit(Provider::Anthropic, Some("claude"), None);

        let chain = FallbackChain::with_tracker(FallbackConfig::default(), tracker.clone());
        let candidates = vec![
            ModelCandidate::new(Provider::Anthropic, "claude"),
            ModelCandidate::new(Provider::OpenAI, "gpt-5"),
        ];

        let result = chain
            .run_with_fallback(&candidates, |candidate| async move {
                Ok::<_, Box<dyn std::error::Error + Send + Sync>>(candidate.provider.as_string())
            })
            .await
            .unwrap();

        // Should have used OpenAI since Anthropic was pre-rate-limited
        assert_eq!(result.value, "openai");

        // Verify the tracker is the same instance
        assert!(tracker.is_rate_limited(Provider::Anthropic, Some("claude")));
    }

    // ========================================================================
    // FallbackConfig Tests
    // ========================================================================

    #[test]
    fn test_fallback_config_default() {
        let config = FallbackConfig::default();

        assert_eq!(config.max_attempts, 10);
        assert!(config.skip_rate_limited);
        assert_eq!(config.retry_delay, Duration::from_millis(500));
        assert_eq!(config.max_retry_delay, Duration::from_secs(30));
        assert_eq!(config.retry_backoff, 2.0);
        assert_eq!(config.max_retries_per_candidate, 3);
        assert!(config.continue_on_permanent_error);
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
