use super::{AGIError, Categorizable, Result};
use serde::{Deserialize, Serialize};
use std::future::Future;
use std::time::Duration;
use tracing::{debug, warn};

/// Backoff strategy for retry delays
#[derive(Debug, Clone, Serialize, Deserialize)]
pub enum BackoffStrategy {
    /// Fixed delay between retries
    Fixed(Duration),

    /// Linear increase: delay = base * attempt
    Linear(Duration),

    /// Exponential increase: delay = base * 2^attempt, capped at max
    Exponential { base: Duration, max: Duration },

    /// Exponential with jitter to avoid thundering herd
    ExponentialWithJitter { base: Duration, max: Duration },
}

impl BackoffStrategy {
    pub fn calculate(&self, attempt: u32) -> Duration {
        match self {
            BackoffStrategy::Fixed(duration) => *duration,
            BackoffStrategy::Linear(base) => *base * attempt,
            BackoffStrategy::Exponential { base, max } => {
                let delay = base.as_millis() * 2_u128.pow(attempt);
                Duration::from_millis(delay.min(max.as_millis()) as u64)
            }
            BackoffStrategy::ExponentialWithJitter { base, max } => {
                let delay = base.as_millis() * 2_u128.pow(attempt);
                let capped = delay.min(max.as_millis()) as u64;

                // Add jitter: random value between 0 and 25% of delay
                let jitter = (capped as f64 * 0.25 * rand::random::<f64>()) as u64;
                Duration::from_millis(capped + jitter)
            }
        }
    }
}

/// Retry policy configuration
#[derive(Debug, Clone)]
pub struct RetryPolicy {
    pub max_attempts: u32,
    pub backoff: BackoffStrategy,
    pub timeout: Option<Duration>,
    pub retry_on: fn(&AGIError) -> bool,
}

impl RetryPolicy {
    /// Default retry policy: 3 attempts with exponential backoff + jitter
    pub fn default() -> Self {
        Self {
            max_attempts: 3,
            backoff: BackoffStrategy::ExponentialWithJitter {
                base: Duration::from_secs(1),
                max: Duration::from_secs(30),
            },
            timeout: Some(Duration::from_secs(60)),
            retry_on: |e| e.is_retryable(),
        }
    }

    /// Aggressive retry policy: 5 attempts with faster exponential backoff
    pub fn aggressive() -> Self {
        Self {
            max_attempts: 5,
            backoff: BackoffStrategy::Exponential {
                base: Duration::from_millis(100),
                max: Duration::from_secs(10),
            },
            timeout: Some(Duration::from_secs(120)),
            retry_on: |e| e.is_retryable(),
        }
    }

    /// Conservative retry policy: 2 attempts with fixed delay
    pub fn conservative() -> Self {
        Self {
            max_attempts: 2,
            backoff: BackoffStrategy::Fixed(Duration::from_secs(2)),
            timeout: Some(Duration::from_secs(30)),
            retry_on: |e| e.is_retryable(),
        }
    }

    /// Network-specific retry policy
    pub fn network() -> Self {
        Self {
            max_attempts: 4,
            backoff: BackoffStrategy::ExponentialWithJitter {
                base: Duration::from_millis(500),
                max: Duration::from_secs(15),
            },
            timeout: Some(Duration::from_secs(90)),
            retry_on: |e| matches!(e, AGIError::TransientError(_) | AGIError::TimeoutError(_)),
        }
    }

    /// LLM-specific retry policy (handles rate limits)
    pub fn llm() -> Self {
        Self {
            max_attempts: 4,
            backoff: BackoffStrategy::ExponentialWithJitter {
                base: Duration::from_secs(2),
                max: Duration::from_secs(60),
            },
            timeout: Some(Duration::from_secs(300)), // 5 minutes for LLM
            retry_on: |e| matches!(e, AGIError::LLMError(_) | AGIError::TransientError(_)),
        }
    }

    /// Browser automation retry policy
    pub fn browser() -> Self {
        Self {
            max_attempts: 5,
            backoff: BackoffStrategy::Linear(Duration::from_secs(1)),
            timeout: Some(Duration::from_secs(60)),
            retry_on: |e| {
                matches!(
                    e,
                    AGIError::ToolError(_)
                        | AGIError::TransientError(_)
                        | AGIError::TimeoutError(_)
                )
            },
        }
    }

    /// Database operation retry policy
    pub fn database() -> Self {
        Self {
            max_attempts: 5,
            backoff: BackoffStrategy::Exponential {
                base: Duration::from_millis(500),
                max: Duration::from_secs(5),
            },
            timeout: Some(Duration::from_secs(30)),
            retry_on: |e| e.is_retryable(),
        }
    }

    /// File system operation retry policy
    pub fn filesystem() -> Self {
        Self {
            max_attempts: 3,
            backoff: BackoffStrategy::Fixed(Duration::from_millis(500)),
            timeout: Some(Duration::from_secs(10)),
            retry_on: |e| e.is_retryable(),
        }
    }
}

/// Retry an async operation with the given policy
pub async fn retry_with_policy<F, Fut, T>(policy: &RetryPolicy, mut operation: F) -> Result<T>
where
    F: FnMut() -> Fut,
    Fut: Future<Output = Result<T>>,
{
    let mut attempts = 0;
    let mut last_error: Option<AGIError> = None;

    let start_time = tokio::time::Instant::now();

    while attempts < policy.max_attempts {
        // Check timeout
        if let Some(timeout) = policy.timeout {
            if start_time.elapsed() > timeout {
                warn!(
                    "Operation timed out after {} attempts and {:?}",
                    attempts,
                    start_time.elapsed()
                );
                return Err(AGIError::TimeoutError(format!(
                    "Operation timed out after {:?}",
                    start_time.elapsed()
                )));
            }
        }

        attempts += 1;
        debug!("Attempt {}/{}", attempts, policy.max_attempts);

        match operation().await {
            Ok(result) => {
                if attempts > 1 {
                    debug!("Operation succeeded on attempt {}", attempts);
                }
                return Ok(result);
            }
            Err(e) => {
                warn!("Attempt {}/{} failed: {}", attempts, policy.max_attempts, e);

                // Check if error is retryable
                if !(policy.retry_on)(&e) {
                    warn!("Error is not retryable, aborting");
                    return Err(e);
                }

                last_error = Some(e);

                // Don't sleep on last attempt
                if attempts < policy.max_attempts {
                    let wait_time = policy.backoff.calculate(attempts - 1);
                    debug!("Waiting {:?} before retry", wait_time);
                    tokio::time::sleep(wait_time).await;
                }
            }
        }
    }

    warn!("All {} retry attempts exhausted", policy.max_attempts);
    Err(last_error
        .unwrap_or_else(|| AGIError::FatalError("All retry attempts exhausted".to_string())))
}

/// Retry with timeout wrapper
pub async fn retry_with_timeout<F, Fut, T>(
    policy: &RetryPolicy,
    operation: F,
    timeout: Duration,
) -> Result<T>
where
    F: FnMut() -> Fut,
    Fut: Future<Output = Result<T>>,
{
    match tokio::time::timeout(timeout, retry_with_policy(policy, operation)).await {
        Ok(result) => result,
        Err(_) => Err(AGIError::TimeoutError(format!(
            "Operation timed out after {:?}",
            timeout
        ))),
    }
}

/// Conditional retry - only retry if condition is met
pub async fn retry_if<F, Fut, T, C>(policy: &RetryPolicy, operation: F, condition: C) -> Result<T>
where
    F: FnMut() -> Fut,
    Fut: Future<Output = Result<T>>,
    C: Fn(&AGIError) -> bool,
{
    let custom_policy = RetryPolicy {
        retry_on: |e| (policy.retry_on)(e) && condition(e),
        ..policy.clone()
    };

    retry_with_policy(&custom_policy, operation).await
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_fixed_backoff() {
        let strategy = BackoffStrategy::Fixed(Duration::from_secs(2));
        assert_eq!(strategy.calculate(0), Duration::from_secs(2));
        assert_eq!(strategy.calculate(1), Duration::from_secs(2));
        assert_eq!(strategy.calculate(5), Duration::from_secs(2));
    }

    #[test]
    fn test_linear_backoff() {
        let strategy = BackoffStrategy::Linear(Duration::from_secs(1));
        assert_eq!(strategy.calculate(0), Duration::from_secs(0));
        assert_eq!(strategy.calculate(1), Duration::from_secs(1));
        assert_eq!(strategy.calculate(3), Duration::from_secs(3));
    }

    #[test]
    fn test_exponential_backoff() {
        let strategy = BackoffStrategy::Exponential {
            base: Duration::from_secs(1),
            max: Duration::from_secs(60),
        };
        assert_eq!(strategy.calculate(0), Duration::from_secs(1));
        assert_eq!(strategy.calculate(1), Duration::from_secs(2));
        assert_eq!(strategy.calculate(2), Duration::from_secs(4));
        assert_eq!(strategy.calculate(3), Duration::from_secs(8));
        // Test cap
        assert!(strategy.calculate(10) <= Duration::from_secs(60));
    }

    #[tokio::test]
    async fn test_retry_success_on_second_attempt() {
        use std::sync::atomic::{AtomicU32, Ordering};
        use std::sync::Arc;

        let counter = Arc::new(AtomicU32::new(0));
        let counter_clone = counter.clone();

        let operation = move || {
            let counter = counter_clone.clone();
            async move {
                let count = counter.fetch_add(1, Ordering::SeqCst);
                if count < 1 {
                    Err(AGIError::TransientError("Simulated failure".to_string()))
                } else {
                    Ok("Success".to_string())
                }
            }
        };

        let policy = RetryPolicy {
            max_attempts: 3,
            backoff: BackoffStrategy::Fixed(Duration::from_millis(10)),
            timeout: Some(Duration::from_secs(5)),
            retry_on: |e| e.is_retryable(),
        };

        let result = retry_with_policy(&policy, operation).await;
        assert!(result.is_ok());
        assert_eq!(result.unwrap(), "Success");
        assert_eq!(counter.load(Ordering::SeqCst), 2);
    }

    #[tokio::test]
    async fn test_retry_all_attempts_fail() {
        use std::sync::atomic::{AtomicU32, Ordering};
        use std::sync::Arc;

        let counter = Arc::new(AtomicU32::new(0));
        let counter_clone = counter.clone();

        let operation = move || {
            let counter = counter_clone.clone();
            async move {
                counter.fetch_add(1, Ordering::SeqCst);
                Err::<(), AGIError>(AGIError::TransientError("Simulated failure".to_string()))
            }
        };

        let policy = RetryPolicy {
            max_attempts: 3,
            backoff: BackoffStrategy::Fixed(Duration::from_millis(10)),
            timeout: Some(Duration::from_secs(5)),
            retry_on: |e| e.is_retryable(),
        };

        let result = retry_with_policy(&policy, operation).await;
        assert!(result.is_err());
        assert_eq!(counter.load(Ordering::SeqCst), 3);
    }

    #[tokio::test]
    async fn test_retry_non_retryable_error() {
        use std::sync::atomic::{AtomicU32, Ordering};
        use std::sync::Arc;

        let counter = Arc::new(AtomicU32::new(0));
        let counter_clone = counter.clone();

        let operation = move || {
            let counter = counter_clone.clone();
            async move {
                counter.fetch_add(1, Ordering::SeqCst);
                Err::<(), AGIError>(AGIError::FatalError("Not retryable".to_string()))
            }
        };

        let policy = RetryPolicy::default();

        let result = retry_with_policy(&policy, operation).await;
        assert!(result.is_err());
        // Should only try once since error is not retryable
        assert_eq!(counter.load(Ordering::SeqCst), 1);
    }
}
