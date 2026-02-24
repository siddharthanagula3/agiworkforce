use super::http_client_factory::{create_http_client, HttpClientConfig};
use once_cell::sync::Lazy;
use reqwest::Client;
use reqwest_middleware::{ClientBuilder, ClientWithMiddleware};
use reqwest_retry::{policies::ExponentialBackoff, RetryTransientMiddleware};
use std::sync::Arc;

/// A lazily-initialized fallback client without retry middleware.
/// This uses `reqwest::Client::new()` which is infallible with default settings.
static FALLBACK_CLIENT: Lazy<Arc<ClientWithMiddleware>> = Lazy::new(|| {
    // Client::new() with default settings cannot fail
    let client = Client::new();
    let client_with_middleware = ClientBuilder::new(client).build();
    Arc::new(client_with_middleware)
});

/// Shared HTTP client with automatic retries and timeout management
///
/// Features:
/// - Automatic retries for 429 (Rate Limit) and 5xx errors
/// - Strict timeouts: 30s connect, 5m read
/// - Exponential backoff for retries
/// - Proxy and custom CA certificate support via [`HttpClientConfig`]
pub struct HttpClient {
    client: Arc<ClientWithMiddleware>,
}

impl HttpClient {
    /// Create a new HTTP client with retry and timeout configuration.
    ///
    /// Uses [`create_http_client`] under the hood so that proxy settings from
    /// environment variables (`HTTP_PROXY`, `HTTPS_PROXY`) and system root
    /// certificates are honoured automatically.
    pub fn new() -> Result<Self, String> {
        Self::with_config(HttpClientConfig::default())
    }

    /// Create a new HTTP client with explicit proxy / CA certificate configuration.
    pub fn with_config(config: HttpClientConfig) -> Result<Self, String> {
        // Retry policy: exponential backoff for transient errors
        let retry_policy = ExponentialBackoff::builder().build_with_max_retries(3); // Retry up to 3 times

        // Build the base client via the centralized factory
        let client = create_http_client(&config)?;

        let client = ClientBuilder::new(client)
            .with(RetryTransientMiddleware::new_with_policy(retry_policy))
            .build();

        Ok(Self {
            client: Arc::new(client),
        })
    }

    /// Get a clone of the underlying client
    pub fn client(&self) -> ClientWithMiddleware {
        self.client.as_ref().clone()
    }
}

impl Default for HttpClient {
    fn default() -> Self {
        Self::new().unwrap_or_else(|e| {
            tracing::warn!(
                "Failed to create HttpClient with retries: {}. Using fallback client without retry middleware.",
                e
            );
            Self {
                client: Arc::clone(&FALLBACK_CLIENT),
            }
        })
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
