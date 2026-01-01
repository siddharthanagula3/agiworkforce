use reqwest::Client;
use reqwest_middleware::{ClientBuilder, ClientWithMiddleware};
use reqwest_retry::{policies::ExponentialBackoff, RetryTransientMiddleware};
use std::sync::Arc;
use std::time::Duration;

/// Shared HTTP client with automatic retries and timeout management
///
/// Features:
/// - Automatic retries for 429 (Rate Limit) and 5xx errors
/// - Strict timeouts: 30s connect, 5m read
/// - Exponential backoff for retries
pub struct HttpClient {
    client: Arc<ClientWithMiddleware>,
}

impl HttpClient {
    /// Create a new HTTP client with retry and timeout configuration
    pub fn new() -> Self {
        // Retry policy: exponential backoff for transient errors
        let retry_policy = ExponentialBackoff::builder().build_with_max_retries(3); // Retry up to 3 times

        // Build the client with timeouts
        let client = Client::builder()
            .connect_timeout(Duration::from_secs(30)) // 30s connect timeout
            .timeout(Duration::from_secs(300)) // 5m read timeout
            .build()
            .expect("Failed to create HTTP client");

        let client = ClientBuilder::new(client)
            .with(RetryTransientMiddleware::new_with_policy(retry_policy))
            .build();

        Self {
            client: Arc::new(client),
        }
    }

    /// Get a clone of the underlying client
    pub fn client(&self) -> ClientWithMiddleware {
        self.client.as_ref().clone()
    }
}

impl Default for HttpClient {
    fn default() -> Self {
        Self::new()
    }
}

impl Clone for HttpClient {
    fn clone(&self) -> Self {
        Self {
            client: Arc::clone(&self.client),
        }
    }
}

/// Determine if an HTTP status code should trigger a retry
pub fn should_retry(status: u16) -> bool {
    // Retry on rate limits (429) and server errors (5xx)
    status == 429 || (500..600).contains(&status)
}
