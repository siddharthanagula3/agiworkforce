//! Model Fallback Chain with Rate Limit Awareness
//!
//! This module provides intelligent model selection with automatic failover
//! when providers are rate-limited or unavailable. It tracks provider cooldowns
//! and selects the best available candidate from a prioritized fallback chain.
//!
//! # Architecture
//!
//! ```text
//! FallbackChain
//!     |
//!     +-- RateLimitTracker (per-provider cooldown tracking)
//!     |
//!     +-- ModelCandidate[] (prioritized fallback order)
//!     |
//!     +-- FallbackConfig (retry/backoff settings)
//! ```
//!
//! # Example
//!
//! ```rust,ignore
//! use crate::core::llm::fallback_chain::{FallbackChain, FallbackConfig, ModelCandidate};
//! use crate::core::llm::Provider;
//!
//! let chain = FallbackChain::new(FallbackConfig::default());
//! let candidates = vec![
//!     ModelCandidate::new(Provider::Anthropic, "claude-sonnet-4-5"),
//!     ModelCandidate::new(Provider::OpenAI, "gpt-5.2"),
//!     ModelCandidate::new(Provider::Google, "gemini-3-pro-preview"),
//! ];
//!
//! let result = chain.run_with_fallback(&candidates, |candidate| async {
//!     // Your LLM operation here
//!     Ok(response)
//! }).await?;
//! ```

use std::collections::HashMap;
use std::fmt;
use std::sync::Arc;
use std::time::{Duration, Instant};

use parking_lot::RwLock;
use serde::{Deserialize, Serialize};
use thiserror::Error;

use crate::core::llm::Provider;

// ============================================================================
// Error Types
// ============================================================================

/// Error indicating a rate limit was hit
#[derive(Debug, Clone)]
pub struct RateLimitError {
    /// The provider that was rate limited
    pub provider: Provider,
    /// The model that was rate limited (if known)
    pub model: Option<String>,
    /// Suggested retry delay from the provider (if available)
    pub retry_after: Option<Duration>,
    /// The raw error message
    pub message: String,
}

impl fmt::Display for RateLimitError {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        write!(
            f,
            "Rate limited by {} ({})",
            self.provider.as_string(),
            self.model.as_deref().unwrap_or("unknown model")
        )?;
        if let Some(retry_after) = self.retry_after {
            write!(f, " - retry after {:?}", retry_after)?;
        }
        Ok(())
    }
}

impl std::error::Error for RateLimitError {}

/// Error from a single provider attempt
#[derive(Debug, Clone)]
pub struct ProviderError {
    /// The provider that failed
    pub provider: Provider,
    /// The model that was attempted
    pub model: String,
    /// The error message
    pub message: String,
    /// Whether this error is retryable
    pub is_retryable: bool,
    /// Whether this was a rate limit error
    pub is_rate_limit: bool,
    /// Timestamp when the error occurred
    pub timestamp: Instant,
}

impl fmt::Display for ProviderError {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        write!(
            f,
            "[{}:{}] {}",
            self.provider.as_string(),
            self.model,
            self.message
        )
    }
}

impl std::error::Error for ProviderError {}

/// Aggregate error containing all provider failures
#[derive(Debug, Error)]
pub struct AggregateError {
    /// All errors from attempted providers
    pub errors: Vec<ProviderError>,
    /// Total number of candidates that were attempted
    pub candidates_attempted: usize,
    /// Number of candidates skipped due to rate limiting
    pub candidates_skipped_rate_limit: usize,
    /// Summary message
    message: String,
}

impl AggregateError {
    /// Create a new aggregate error from a list of provider errors
    pub fn new(
        errors: Vec<ProviderError>,
        candidates_attempted: usize,
        candidates_skipped_rate_limit: usize,
    ) -> Self {
        let message =
            Self::build_message(&errors, candidates_attempted, candidates_skipped_rate_limit);
        Self {
            errors,
            candidates_attempted,
            candidates_skipped_rate_limit,
            message,
        }
    }

    fn build_message(errors: &[ProviderError], attempted: usize, skipped: usize) -> String {
        if errors.is_empty() && skipped > 0 {
            return format!(
                "All {} model candidates are currently rate-limited. Please try again later.",
                skipped
            );
        }

        let mut msg = format!(
            "All {} model candidates failed ({} attempted, {} skipped due to rate limits):",
            attempted + skipped,
            attempted,
            skipped
        );

        for (i, err) in errors.iter().enumerate() {
            msg.push_str(&format!("\n  {}. {}", i + 1, err));
        }

        msg
    }

    /// Check if all errors were rate limit errors
    pub fn all_rate_limited(&self) -> bool {
        !self.errors.is_empty() && self.errors.iter().all(|e| e.is_rate_limit)
    }

    /// Check if any errors were retryable
    pub fn any_retryable(&self) -> bool {
        self.errors.iter().any(|e| e.is_retryable)
    }

    /// Get the first non-rate-limit error (useful for debugging)
    pub fn first_non_rate_limit_error(&self) -> Option<&ProviderError> {
        self.errors.iter().find(|e| !e.is_rate_limit)
    }

    /// Returns a user-friendly error message (no technical details)
    pub fn user_message(&self) -> String {
        if self.all_rate_limited()
            || (self.errors.is_empty() && self.candidates_skipped_rate_limit > 0)
        {
            "Our AI services are temporarily busy. Please try again in a few moments.".to_string()
        } else {
            "We encountered an issue processing your request. Please try again.".to_string()
        }
    }
}

impl fmt::Display for AggregateError {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        write!(f, "{}", self.message)
    }
}

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

    /// Get the remaining cooldown time for a provider/model
    pub fn cooldown_remaining(&self, provider: Provider, model: Option<&str>) -> Duration {
        let cooldowns = self.cooldowns.read();
        let mut max_remaining = Duration::ZERO;

        // Check model-specific cooldown
        let model_key = self.key(provider, model);
        if let Some(entry) = cooldowns.get(&model_key) {
            max_remaining = max_remaining.max(entry.remaining());
        }

        // Also check provider-level cooldown
        let provider_key = self.key(provider, None);
        if let Some(entry) = cooldowns.get(&provider_key) {
            max_remaining = max_remaining.max(entry.remaining());
        }

        max_remaining
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

    /// Clean up expired cooldowns
    pub fn cleanup_expired(&self) {
        let mut cooldowns = self.cooldowns.write();
        cooldowns.retain(|_, entry| !entry.is_expired());
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
// Model Candidate
// ============================================================================

/// A candidate model for the fallback chain
#[derive(Debug, Clone)]
pub struct ModelCandidate {
    /// The provider for this model
    pub provider: Provider,
    /// The model identifier
    pub model: String,
    /// Priority (lower = higher priority, 0 = highest)
    pub priority: u32,
    /// Optional reason for including this candidate
    pub reason: Option<String>,
    /// Whether this candidate can be skipped if rate limited
    pub skippable: bool,
}

impl ModelCandidate {
    /// Create a new model candidate
    pub fn new(provider: Provider, model: impl Into<String>) -> Self {
        Self {
            provider,
            model: model.into(),
            priority: 0,
            reason: None,
            skippable: true,
        }
    }

    /// Set the priority for this candidate
    pub fn with_priority(mut self, priority: u32) -> Self {
        self.priority = priority;
        self
    }

    /// Set the reason for this candidate
    pub fn with_reason(mut self, reason: impl Into<String>) -> Self {
        self.reason = Some(reason.into());
        self
    }

    /// Mark this candidate as non-skippable (will always be attempted even if rate limited)
    pub fn non_skippable(mut self) -> Self {
        self.skippable = false;
        self
    }
}

// ============================================================================
// Fallback Chain
// ============================================================================

/// Configuration for fallback chain behavior
#[derive(Debug, Clone)]
pub struct FallbackConfig {
    /// Maximum number of candidates to try before giving up
    pub max_attempts: usize,
    /// Whether to skip rate-limited candidates
    pub skip_rate_limited: bool,
    /// Delay between retry attempts (before backoff)
    pub retry_delay: Duration,
    /// Maximum delay between retries
    pub max_retry_delay: Duration,
    /// Backoff multiplier for retries
    pub retry_backoff: f64,
    /// Maximum retries per candidate
    pub max_retries_per_candidate: u32,
    /// Whether to continue trying after non-retryable errors
    pub continue_on_permanent_error: bool,
}

impl Default for FallbackConfig {
    fn default() -> Self {
        Self {
            max_attempts: 10,
            skip_rate_limited: true,
            retry_delay: Duration::from_millis(500),
            max_retry_delay: Duration::from_secs(30),
            retry_backoff: 2.0,
            max_retries_per_candidate: 3,
            continue_on_permanent_error: true,
        }
    }
}

/// Result of a fallback chain execution
#[derive(Debug)]
pub struct FallbackResult<T> {
    /// The successful result (if any)
    pub value: T,
    /// The candidate that succeeded
    pub successful_candidate: ModelCandidate,
    /// Number of candidates attempted before success
    pub attempts: usize,
    /// Errors from failed attempts (if any)
    pub failed_attempts: Vec<ProviderError>,
}

/// The fallback chain executor
pub struct FallbackChain {
    /// Rate limit tracker (shared across invocations)
    rate_limit_tracker: Arc<RateLimitTracker>,
    /// Configuration
    config: FallbackConfig,
}

impl Default for FallbackChain {
    fn default() -> Self {
        Self::new(FallbackConfig::default())
    }
}

impl FallbackChain {
    /// Create a new fallback chain with the given configuration
    pub fn new(config: FallbackConfig) -> Self {
        Self {
            rate_limit_tracker: Arc::new(RateLimitTracker::default()),
            config,
        }
    }

    /// Create a new fallback chain with a shared rate limit tracker
    pub fn with_tracker(config: FallbackConfig, tracker: Arc<RateLimitTracker>) -> Self {
        Self {
            rate_limit_tracker: tracker,
            config,
        }
    }

    /// Get a reference to the rate limit tracker
    pub fn rate_limit_tracker(&self) -> &Arc<RateLimitTracker> {
        &self.rate_limit_tracker
    }

    /// Run an operation with fallback across multiple candidates
    ///
    /// This method tries each candidate in order until one succeeds.
    /// Rate-limited candidates are skipped (if configured), and errors
    /// are collected into an `AggregateError` if all candidates fail.
    ///
    /// The operation closure receives an owned `ModelCandidate` to allow
    /// use in async blocks without lifetime issues.
    pub async fn run_with_fallback<T, F, Fut>(
        &self,
        candidates: &[ModelCandidate],
        operation: F,
    ) -> Result<FallbackResult<T>, AggregateError>
    where
        F: Fn(ModelCandidate) -> Fut,
        Fut: std::future::Future<Output = Result<T, Box<dyn std::error::Error + Send + Sync>>>,
    {
        let mut errors: Vec<ProviderError> = Vec::new();
        let mut candidates_attempted = 0;
        let mut candidates_skipped = 0;

        // Sort candidates by priority
        let mut sorted_candidates: Vec<_> = candidates.iter().collect();
        sorted_candidates.sort_by_key(|c| c.priority);

        for candidate in sorted_candidates.iter().take(self.config.max_attempts) {
            // Check rate limiting
            if self.config.skip_rate_limited
                && candidate.skippable
                && self
                    .rate_limit_tracker
                    .is_rate_limited(candidate.provider, Some(&candidate.model))
            {
                let remaining = self
                    .rate_limit_tracker
                    .cooldown_remaining(candidate.provider, Some(&candidate.model));

                tracing::debug!(
                    provider = %candidate.provider.as_string(),
                    model = %candidate.model,
                    cooldown_remaining_secs = remaining.as_secs(),
                    "Skipping rate-limited candidate"
                );

                candidates_skipped += 1;
                continue;
            }

            candidates_attempted += 1;

            // Clone the candidate for the operation (needed for owned async closures)
            let candidate_clone = (*candidate).clone();

            // Try the operation with retries
            match self.try_with_retries(&candidate_clone, &operation).await {
                Ok(value) => {
                    // Success! Record it and return
                    self.rate_limit_tracker
                        .record_success(candidate.provider, Some(&candidate.model));

                    return Ok(FallbackResult {
                        value,
                        successful_candidate: candidate_clone,
                        attempts: candidates_attempted,
                        failed_attempts: errors,
                    });
                }
                Err(err) => {
                    let is_rate_limit = is_rate_limit_error(&err.message);
                    let is_retryable = is_retryable_error(&err.message);

                    // Record rate limit if detected
                    if is_rate_limit {
                        let retry_after = parse_retry_after(&err.message);
                        self.rate_limit_tracker.record_rate_limit(
                            candidate.provider,
                            Some(&candidate.model),
                            retry_after,
                        );
                    }

                    let provider_error = ProviderError {
                        provider: candidate.provider,
                        model: candidate.model.clone(),
                        message: err.message.clone(),
                        is_retryable,
                        is_rate_limit,
                        timestamp: Instant::now(),
                    };

                    tracing::warn!(
                        provider = %candidate.provider.as_string(),
                        model = %candidate.model,
                        error = %err.message,
                        is_rate_limit = is_rate_limit,
                        is_retryable = is_retryable,
                        "Candidate failed"
                    );

                    errors.push(provider_error);

                    // If non-retryable and configured to stop, break early
                    if !is_retryable && !self.config.continue_on_permanent_error {
                        break;
                    }
                }
            }
        }

        Err(AggregateError::new(
            errors,
            candidates_attempted,
            candidates_skipped,
        ))
    }

    /// Try an operation with retries for a single candidate
    async fn try_with_retries<T, F, Fut>(
        &self,
        candidate: &ModelCandidate,
        operation: &F,
    ) -> Result<T, OperationError>
    where
        F: Fn(ModelCandidate) -> Fut,
        Fut: std::future::Future<Output = Result<T, Box<dyn std::error::Error + Send + Sync>>>,
    {
        let mut last_error = None;
        let mut retry_delay = self.config.retry_delay;

        for attempt in 0..=self.config.max_retries_per_candidate {
            if attempt > 0 {
                tracing::debug!(
                    provider = %candidate.provider.as_string(),
                    model = %candidate.model,
                    attempt = attempt,
                    delay_ms = retry_delay.as_millis(),
                    "Retrying after delay"
                );
                tokio::time::sleep(retry_delay).await;

                // Exponential backoff with jitter
                let jitter = rand::random::<f64>() * 0.25 * retry_delay.as_secs_f64();
                retry_delay = Duration::from_secs_f64(
                    (retry_delay.as_secs_f64() * self.config.retry_backoff + jitter)
                        .min(self.config.max_retry_delay.as_secs_f64()),
                );
            }

            // Clone candidate for each retry attempt (needed for owned async closures)
            match operation(candidate.clone()).await {
                Ok(result) => return Ok(result),
                Err(e) => {
                    let error_str = e.to_string();
                    let is_retryable = is_retryable_error(&error_str);

                    last_error = Some(OperationError {
                        message: error_str.clone(),
                    });

                    // Don't retry non-retryable errors
                    if !is_retryable {
                        break;
                    }

                    // Don't retry rate limits within the same candidate
                    // (we'll move to the next candidate instead)
                    if is_rate_limit_error(&error_str) {
                        break;
                    }
                }
            }
        }

        Err(last_error.unwrap_or(OperationError {
            message: "Unknown error".to_string(),
        }))
    }
}

/// Internal error type for operation failures
#[derive(Debug)]
struct OperationError {
    message: String,
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
            if let Ok(secs) = after_text[..end].trim().parse::<f64>() {
                return Some(Duration::from_secs_f64(secs));
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
        if let Ok(secs) = before[start..].trim().parse::<f64>() {
            return Some(Duration::from_secs_f64(secs));
        }
    }

    None
}

// ============================================================================
// Builder Pattern for Candidates
// ============================================================================

/// Builder for creating a list of model candidates
#[derive(Debug, Default)]
pub struct CandidateBuilder {
    candidates: Vec<ModelCandidate>,
}

impl CandidateBuilder {
    /// Create a new candidate builder
    pub fn new() -> Self {
        Self::default()
    }

    /// Add a candidate to the list
    pub fn add(mut self, provider: Provider, model: impl Into<String>) -> Self {
        self.candidates.push(ModelCandidate::new(provider, model));
        self
    }

    /// Add a candidate with a specific priority
    pub fn add_with_priority(
        mut self,
        provider: Provider,
        model: impl Into<String>,
        priority: u32,
    ) -> Self {
        self.candidates
            .push(ModelCandidate::new(provider, model).with_priority(priority));
        self
    }

    /// Add a candidate with reason
    pub fn add_with_reason(
        mut self,
        provider: Provider,
        model: impl Into<String>,
        reason: impl Into<String>,
    ) -> Self {
        self.candidates
            .push(ModelCandidate::new(provider, model).with_reason(reason));
        self
    }

    /// Build the candidate list
    pub fn build(self) -> Vec<ModelCandidate> {
        self.candidates
    }
}

// ============================================================================
// Integration with LLMRouter
// ============================================================================

/// Convert RouteCandidate to ModelCandidate
impl From<&crate::core::llm::RouteCandidate> for ModelCandidate {
    fn from(route: &crate::core::llm::RouteCandidate) -> Self {
        Self {
            provider: route.provider,
            model: route.model.clone(),
            priority: 0,
            reason: Some(route.reason.to_string()),
            skippable: true,
        }
    }
}

// ============================================================================
// Tests
// ============================================================================

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_rate_limit_tracker_basic() {
        let tracker = RateLimitTracker::default();

        // Initially not rate limited
        assert!(!tracker.is_rate_limited(Provider::OpenAI, Some("gpt-5")));

        // Record rate limit
        tracker.record_rate_limit(Provider::OpenAI, Some("gpt-5"), None);

        // Now rate limited
        assert!(tracker.is_rate_limited(Provider::OpenAI, Some("gpt-5")));

        // Other providers not affected
        assert!(!tracker.is_rate_limited(Provider::Anthropic, Some("claude-sonnet")));
    }

    #[test]
    fn test_rate_limit_tracker_success_clears() {
        let tracker = RateLimitTracker::default();

        tracker.record_rate_limit(Provider::OpenAI, Some("gpt-5"), None);
        assert!(tracker.is_rate_limited(Provider::OpenAI, Some("gpt-5")));

        tracker.record_success(Provider::OpenAI, Some("gpt-5"));
        assert!(!tracker.is_rate_limited(Provider::OpenAI, Some("gpt-5")));
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
        tracker.record_rate_limit(Provider::OpenAI, Some("gpt-5"), None);
        let cooldowns = tracker.cooldowns.read();
        let entry = cooldowns.get("openai:gpt-5").unwrap();
        assert_eq!(entry.consecutive_hits, 1);
        assert_eq!(entry.duration, Duration::from_secs(10));
        drop(cooldowns);

        // Second hit: 20 seconds (10 * 2^1)
        tracker.record_rate_limit(Provider::OpenAI, Some("gpt-5"), None);
        let cooldowns = tracker.cooldowns.read();
        let entry = cooldowns.get("openai:gpt-5").unwrap();
        assert_eq!(entry.consecutive_hits, 2);
        assert_eq!(entry.duration, Duration::from_secs(20));
        drop(cooldowns);

        // Third hit: 40 seconds (10 * 2^2)
        tracker.record_rate_limit(Provider::OpenAI, Some("gpt-5"), None);
        let cooldowns = tracker.cooldowns.read();
        let entry = cooldowns.get("openai:gpt-5").unwrap();
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

    #[test]
    fn test_model_candidate_builder() {
        let candidates = CandidateBuilder::new()
            .add(Provider::Anthropic, "claude-sonnet-4-5")
            .add_with_priority(Provider::OpenAI, "gpt-5.2", 1)
            .add_with_reason(Provider::Google, "gemini-3-pro-preview", "fallback")
            .build();

        assert_eq!(candidates.len(), 3);
        assert_eq!(candidates[0].provider, Provider::Anthropic);
        assert_eq!(candidates[1].priority, 1);
        assert_eq!(candidates[2].reason, Some("fallback".to_string()));
    }

    #[test]
    fn test_aggregate_error_user_message() {
        // All rate limited
        let errors = vec![ProviderError {
            provider: Provider::OpenAI,
            model: "gpt-5".to_string(),
            message: "rate limit exceeded".to_string(),
            is_retryable: true,
            is_rate_limit: true,
            timestamp: Instant::now(),
        }];
        let agg = AggregateError::new(errors, 1, 2);
        assert!(agg.user_message().contains("temporarily busy"));

        // Mixed errors
        let errors = vec![ProviderError {
            provider: Provider::OpenAI,
            model: "gpt-5".to_string(),
            message: "server error".to_string(),
            is_retryable: true,
            is_rate_limit: false,
            timestamp: Instant::now(),
        }];
        let agg = AggregateError::new(errors, 1, 0);
        assert!(agg.user_message().contains("encountered an issue"));
    }

    #[tokio::test]
    async fn test_fallback_chain_success_first_candidate() {
        let chain = FallbackChain::new(FallbackConfig::default());
        let candidates = vec![
            ModelCandidate::new(Provider::Anthropic, "claude-sonnet"),
            ModelCandidate::new(Provider::OpenAI, "gpt-5"),
        ];

        let result = chain
            .run_with_fallback(&candidates, |candidate| async move {
                if candidate.provider == Provider::Anthropic {
                    Ok::<_, Box<dyn std::error::Error + Send + Sync>>("success".to_string())
                } else {
                    Err("should not reach".into())
                }
            })
            .await
            .unwrap();

        assert_eq!(result.value, "success");
        assert_eq!(result.successful_candidate.provider, Provider::Anthropic);
        assert_eq!(result.attempts, 1);
    }

    #[tokio::test]
    async fn test_fallback_chain_fallback_on_error() {
        let chain = FallbackChain::new(FallbackConfig {
            max_retries_per_candidate: 0, // No retries to speed up test
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
    }

    #[tokio::test]
    async fn test_fallback_chain_skips_rate_limited() {
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
        assert_eq!(result.attempts, 1);
    }

    #[tokio::test]
    async fn test_fallback_chain_all_fail() {
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
    }

    #[tokio::test]
    async fn test_fallback_chain_rate_limit_recorded() {
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
                    Err::<String, _>("429 rate limit exceeded".into())
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
    }
}
