use std::future::Future;
use std::time::Duration;
use tokio::time::sleep;

/// Retry configuration
pub struct RetryConfig {
    pub max_attempts: usize,
    pub initial_delay_ms: u64,
    pub max_delay_ms: u64,
    pub backoff_multiplier: f64,
}

impl Default for RetryConfig {
    fn default() -> Self {
        Self {
            max_attempts: 3,
            initial_delay_ms: 1000,
            max_delay_ms: 30000,
            backoff_multiplier: 2.0,
        }
    }
}

impl RetryConfig {
    pub fn network() -> Self {
        Self {
            max_attempts: 3,
            initial_delay_ms: 1000,
            max_delay_ms: 10000,
            backoff_multiplier: 2.0,
        }
    }

    pub fn database() -> Self {
        Self {
            max_attempts: 5,
            initial_delay_ms: 500,
            max_delay_ms: 5000,
            backoff_multiplier: 1.5,
        }
    }

    pub fn api() -> Self {
        Self {
            max_attempts: 4,
            initial_delay_ms: 2000,
            max_delay_ms: 30000,
            backoff_multiplier: 2.0,
        }
    }

    pub fn filesystem() -> Self {
        Self {
            max_attempts: 3,
            initial_delay_ms: 500,
            max_delay_ms: 3000,
            backoff_multiplier: 2.0,
        }
    }
}

/// Retry an operation with exponential backoff
pub async fn retry_with_backoff<F, Fut, T, E>(operation: F, config: RetryConfig) -> Result<T, E>
where
    F: Fn() -> Fut,
    Fut: Future<Output = Result<T, E>>,
    E: std::fmt::Display,
{
    let mut last_error: Option<E> = None;

    for attempt in 0..config.max_attempts {
        match operation().await {
            Ok(result) => return Ok(result),
            Err(err) => {
                tracing::warn!(
                    "Attempt {}/{} failed: {}",
                    attempt + 1,
                    config.max_attempts,
                    err
                );

                last_error = Some(err);

                // Don't sleep on last attempt
                if attempt < config.max_attempts - 1 {
                    let delay = calculate_delay(
                        attempt,
                        config.initial_delay_ms,
                        config.backoff_multiplier,
                        config.max_delay_ms,
                    );
                    sleep(Duration::from_millis(delay)).await;
                }
            }
        }
    }

    Err(last_error.unwrap())
}

/// Calculate delay with exponential backoff
fn calculate_delay(attempt: usize, initial_delay: u64, multiplier: f64, max_delay: u64) -> u64 {
    let delay = (initial_delay as f64) * multiplier.powi(attempt as i32);
    delay.min(max_delay as f64) as u64
}

/// Network error recovery strategy
pub async fn recover_network_error<F, Fut, T>(operation: F) -> Result<T, String>
where
    F: Fn() -> Fut,
    Fut: Future<Output = Result<T, String>>,
{
    retry_with_backoff(operation, RetryConfig::network()).await
}

/// Database error recovery strategy
pub async fn recover_database_error<F, Fut, T>(operation: F) -> Result<T, rusqlite::Error>
where
    F: Fn() -> Fut,
    Fut: Future<Output = Result<T, rusqlite::Error>>,
{
    retry_with_backoff(operation, RetryConfig::database()).await
}

/// File system error recovery strategy
pub async fn recover_filesystem_error<F, Fut, T>(operation: F) -> Result<T, std::io::Error>
where
    F: Fn() -> Fut,
    Fut: Future<Output = Result<T, std::io::Error>>,
{
    retry_with_backoff(operation, RetryConfig::filesystem()).await
}

/// API rate limit recovery strategy (with exponential backoff)
pub async fn recover_rate_limit<F, Fut, T>(operation: F) -> Result<T, String>
where
    F: Fn() -> Fut,
    Fut: Future<Output = Result<T, String>>,
{
    let config = RetryConfig {
        max_attempts: 5,
        initial_delay_ms: 5000, // Start with 5 seconds
        max_delay_ms: 60000,    // Max 1 minute
        backoff_multiplier: 2.0,
    };

    retry_with_backoff(operation, config).await
}

/// Memory error recovery strategy (clear caches and retry)
pub async fn recover_out_of_memory<F, Fut, T>(
    operation: F,
    cache_clear: impl Fn(),
) -> Result<T, String>
where
    F: Fn() -> Fut,
    Fut: Future<Output = Result<T, String>>,
{
    // First attempt
    match operation().await {
        Ok(result) => return Ok(result),
        Err(_) => {
            tracing::warn!("Out of memory, clearing caches...");
            cache_clear();

            // Wait a bit for GC
            sleep(Duration::from_millis(1000)).await;

            // Retry once after clearing caches
            operation().await
        }
    }
}

/// Create file with defaults if not found
pub async fn create_if_not_found(
    file_path: &str,
    default_content: &str,
) -> Result<(), std::io::Error> {
    use tokio::fs;

    match fs::read(file_path).await {
        Ok(_) => Ok(()),
        Err(err) if err.kind() == std::io::ErrorKind::NotFound => {
            // Create parent directories if needed
            if let Some(parent) = std::path::Path::new(file_path).parent() {
                fs::create_dir_all(parent).await?;
            }

            // Write default content
            fs::write(file_path, default_content).await?;
            tracing::info!("Created file with defaults: {}", file_path);
            Ok(())
        }
        Err(err) => Err(err),
    }
}

/// Prompt for elevation if permission denied
#[cfg(target_os = "windows")]
pub async fn prompt_for_elevation(operation_name: &str) -> Result<(), String> {

    tracing::info!(
        "Permission denied, requesting elevation for: {}",
        operation_name
    );

    // TODO: Implement actual elevation prompt
    // For now, just return an error with instructions
    Err(format!(
        "Permission denied for '{}'. Please run the application as administrator.",
        operation_name
    ))
}

#[cfg(not(target_os = "windows"))]
pub async fn prompt_for_elevation(operation_name: &str) -> Result<(), String> {
    Err(format!(
        "Permission denied for '{}'. Please check file permissions.",
        operation_name
    ))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_calculate_delay() {
        assert_eq!(calculate_delay(0, 1000, 2.0, 10000), 1000);
        assert_eq!(calculate_delay(1, 1000, 2.0, 10000), 2000);
        assert_eq!(calculate_delay(2, 1000, 2.0, 10000), 4000);
        assert_eq!(calculate_delay(3, 1000, 2.0, 10000), 8000);
        assert_eq!(calculate_delay(4, 1000, 2.0, 10000), 10000); // capped at max
    }

    #[tokio::test]
    async fn test_retry_success_on_third_attempt() {
        let mut attempts = 0;

        let operation = || async {
            attempts += 1;
            if attempts < 3 {
                Err("Simulated failure".to_string())
            } else {
                Ok("Success".to_string())
            }
        };

        let config = RetryConfig {
            max_attempts: 5,
            initial_delay_ms: 10,
            max_delay_ms: 100,
            backoff_multiplier: 2.0,
        };

        let result = retry_with_backoff(operation, config).await;
        assert!(result.is_ok());
        assert_eq!(result.unwrap(), "Success");
        assert_eq!(attempts, 3);
    }

    #[tokio::test]
    async fn test_retry_all_attempts_fail() {
        let mut attempts = 0;

        let operation = || async {
            attempts += 1;
            Err::<(), String>("Simulated failure".to_string())
        };

        let config = RetryConfig {
            max_attempts: 3,
            initial_delay_ms: 10,
            max_delay_ms: 100,
            backoff_multiplier: 2.0,
        };

        let result = retry_with_backoff(operation, config).await;
        assert!(result.is_err());
        assert_eq!(attempts, 3);
    }
}
