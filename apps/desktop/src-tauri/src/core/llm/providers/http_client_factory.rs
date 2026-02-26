//! Centralized HTTP client factory with proxy and custom CA certificate support.
//!
//! Reads proxy settings from environment variables (`HTTP_PROXY`, `HTTPS_PROXY`,
//! `NO_PROXY`) automatically via reqwest's built-in env var support. Additionally
//! accepts an optional explicit proxy URL and custom root CA certificate path
//! for corporate SSL inspection proxies.

use reqwest::{Certificate, Client, Proxy};
use std::time::Duration;

/// Configuration for creating an HTTP client via [`create_http_client`].
///
/// When all fields are left at their defaults the factory produces a client that
/// is functionally identical to `Client::builder().connect_timeout(30s).timeout(300s).build()`,
/// preserving backward compatibility with the previous hand-rolled builders.
pub struct HttpClientConfig {
    /// Optional explicit proxy URL applied to all traffic via `Proxy::all()`.
    /// When `None`, reqwest still reads `HTTP_PROXY` / `HTTPS_PROXY` / `NO_PROXY`
    /// from the environment automatically.
    pub proxy_url: Option<String>,

    /// Optional path to a PEM-encoded root CA certificate file.
    /// Added as an additional trusted root so that corporate SSL inspection
    /// proxies (MITM CAs) are accepted alongside the system certificate store.
    pub ca_cert_path: Option<String>,

    /// TCP connect timeout in seconds (default: 30).
    pub connect_timeout_secs: u64,

    /// Overall request timeout in seconds (default: 300 / 5 minutes).
    /// Use `None` for streaming requests to avoid premature disconnection
    /// during long-running SSE streams.
    pub read_timeout_secs: Option<u64>,
}

impl Default for HttpClientConfig {
    fn default() -> Self {
        Self {
            proxy_url: None,
            ca_cert_path: None,
            connect_timeout_secs: 30,
            read_timeout_secs: Some(300),
        }
    }
}

/// Build a [`reqwest::Client`] from the given configuration.
///
/// # Errors
///
/// Returns a human-readable `String` error when:
/// - The supplied `proxy_url` cannot be parsed.
/// - The `ca_cert_path` file cannot be read or does not contain a valid PEM certificate.
/// - The underlying `reqwest::ClientBuilder::build()` call fails.
pub fn create_http_client(config: &HttpClientConfig) -> Result<Client, String> {
    let mut builder =
        Client::builder().connect_timeout(Duration::from_secs(config.connect_timeout_secs));

    if let Some(timeout_secs) = config.read_timeout_secs {
        builder = builder.timeout(Duration::from_secs(timeout_secs));
    }

    // Apply explicit proxy if configured.
    // Note: even without this, reqwest will honour HTTP_PROXY / HTTPS_PROXY
    // environment variables because we have NOT called `.no_proxy()`.
    if let Some(ref proxy_url) = config.proxy_url {
        let proxy = Proxy::all(proxy_url)
            .map_err(|e| format!("Invalid proxy URL '{}': {}", proxy_url, e))?;
        builder = builder.proxy(proxy);
    }

    // Apply custom CA certificate if configured.
    // This adds the certificate to the trust store alongside the system roots
    // (enabled by the `rustls-tls-native-roots` feature in Cargo.toml).
    if let Some(ref ca_path) = config.ca_cert_path {
        let cert_pem = std::fs::read(ca_path)
            .map_err(|e| format!("Failed to read CA certificate at '{}': {}", ca_path, e))?;
        let cert = Certificate::from_pem(&cert_pem)
            .map_err(|e| format!("Invalid PEM CA certificate at '{}': {}", ca_path, e))?;
        builder = builder.add_root_certificate(cert);
    }

    builder
        .build()
        .map_err(|e| format!("Failed to build HTTP client: {}", e))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn default_config_creates_client() {
        let config = HttpClientConfig::default();
        let client = create_http_client(&config);
        assert!(
            client.is_ok(),
            "Default config should produce a valid client"
        );
    }

    #[test]
    fn invalid_proxy_url_returns_error() {
        let config = HttpClientConfig {
            proxy_url: Some("not a valid url".to_string()),
            ..Default::default()
        };
        let result = create_http_client(&config);
        assert!(result.is_err(), "Invalid proxy URL should produce an error");
    }

    #[test]
    fn missing_ca_cert_returns_error() {
        let config = HttpClientConfig {
            ca_cert_path: Some("/nonexistent/path/to/cert.pem".to_string()),
            ..Default::default()
        };
        let result = create_http_client(&config);
        assert!(
            result.is_err(),
            "Missing CA cert path should produce an error"
        );
    }
}
