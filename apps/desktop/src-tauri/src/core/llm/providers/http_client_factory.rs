//! Centralized HTTP client factory with proxy and custom CA certificate support.
//!
//! Reads proxy settings from environment variables (`HTTP_PROXY`, `HTTPS_PROXY`,
//! `NO_PROXY`) automatically via reqwest's built-in env var support. Additionally
//! accepts an optional explicit proxy URL and custom root CA certificate path
//! for corporate SSL inspection proxies.

use reqwest::{Certificate, Client, NoProxy, Proxy, Url};
use std::sync::{OnceLock, RwLock};
use std::time::Duration;

/// Process-wide proxy profile used by every LLM provider created after an
/// update. The persisted owner lives in `sys::commands::network_proxy`; this
/// module deliberately only owns the runtime copy needed by HTTP clients.
#[derive(Clone, PartialEq, Eq)]
pub struct NetworkProxyConfig {
    pub enabled: bool,
    pub proxy_url: String,
    pub no_proxy: String,
    pub ca_cert_path: String,
    pub username: String,
    pub password: String,
}

impl Default for NetworkProxyConfig {
    fn default() -> Self {
        Self {
            enabled: false,
            proxy_url: String::new(),
            no_proxy: "localhost,127.0.0.1,::1".to_string(),
            ca_cert_path: String::new(),
            username: String::new(),
            password: String::new(),
        }
    }
}

static NETWORK_PROXY_CONFIG: OnceLock<RwLock<NetworkProxyConfig>> = OnceLock::new();

fn network_proxy_config() -> &'static RwLock<NetworkProxyConfig> {
    NETWORK_PROXY_CONFIG.get_or_init(|| RwLock::new(NetworkProxyConfig::default()))
}

/// Return the live proxy profile without exposing the global lock to callers.
pub fn get_network_proxy_config() -> NetworkProxyConfig {
    network_proxy_config()
        .read()
        .unwrap_or_else(|poisoned| poisoned.into_inner())
        .clone()
}

/// Validate and atomically install the profile used by subsequently-created
/// LLM HTTP clients. Existing clients must be rebuilt by the caller.
pub fn set_network_proxy_config(config: NetworkProxyConfig) -> Result<(), String> {
    create_http_client(&HttpClientConfig::from_network_proxy(&config))?;
    *network_proxy_config()
        .write()
        .unwrap_or_else(|poisoned| poisoned.into_inner()) = config;
    Ok(())
}

/// Configuration for creating an HTTP client via [`create_http_client`].
///
/// When all fields are left at their defaults the factory produces a client that
/// is functionally identical to `Client::builder().connect_timeout(30s).timeout(300s).build()`,
/// preserving backward compatibility with the previous hand-rolled builders.
#[derive(Clone)]
pub struct HttpClientConfig {
    /// Optional explicit proxy URL applied to all traffic via `Proxy::all()`.
    /// When `None`, reqwest still reads `HTTP_PROXY` / `HTTPS_PROXY` / `NO_PROXY`
    /// from the environment automatically.
    pub proxy_url: Option<String>,

    /// Optional comma-separated bypass list applied to an explicit proxy.
    pub no_proxy: Option<String>,

    /// Optional Basic-auth username for the explicit proxy.
    pub proxy_username: Option<String>,

    /// Optional Basic-auth password for the explicit proxy. This value only
    /// exists in native memory and encrypted native storage.
    pub proxy_password: Option<String>,

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
        Self::from_network_proxy(&get_network_proxy_config())
    }
}

impl HttpClientConfig {
    pub fn from_network_proxy(config: &NetworkProxyConfig) -> Self {
        Self {
            proxy_url: config
                .enabled
                .then(|| config.proxy_url.trim().to_string())
                .filter(|value| !value.is_empty()),
            no_proxy: config
                .enabled
                .then(|| config.no_proxy.trim().to_string())
                .filter(|value| !value.is_empty()),
            proxy_username: config
                .enabled
                .then(|| config.username.clone())
                .filter(|value| !value.is_empty()),
            proxy_password: config
                .enabled
                .then(|| config.password.clone())
                .filter(|value| !value.is_empty()),
            ca_cert_path: Some(config.ca_cert_path.trim().to_string())
                .filter(|value| !value.is_empty()),
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
        let parsed = Url::parse(proxy_url)
            .map_err(|e| format!("Invalid proxy URL '{}': {}", proxy_url, e))?;
        if !matches!(parsed.scheme(), "http" | "https") {
            return Err(format!(
                "Invalid proxy URL '{}': only http:// and https:// proxies are supported",
                proxy_url
            ));
        }
        if !parsed.username().is_empty() || parsed.password().is_some() {
            return Err(
                "Proxy credentials must use the username and password fields, not the proxy URL"
                    .to_string(),
            );
        }

        let mut proxy = Proxy::all(proxy_url)
            .map_err(|e| format!("Invalid proxy URL '{}': {}", proxy_url, e))?;
        if let Some(ref no_proxy) = config.no_proxy {
            proxy = proxy.no_proxy(NoProxy::from_string(no_proxy));
        }
        if let Some(ref username) = config.proxy_username {
            proxy = proxy.basic_auth(
                username,
                config.proxy_password.as_deref().unwrap_or_default(),
            );
        }
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
    fn proxy_url_rejects_embedded_credentials() {
        let config = HttpClientConfig {
            proxy_url: Some("https://user:password@proxy.example.com:8443".to_string()),
            ..HttpClientConfig::from_network_proxy(&NetworkProxyConfig::default())
        };
        let error = create_http_client(&config).expect_err("URL credentials must be rejected");
        assert!(error.contains("username and password fields"), "{error}");
    }

    #[test]
    fn explicit_proxy_supports_auth_and_bypass_list() {
        let config = HttpClientConfig {
            proxy_url: Some("http://proxy.example.com:8080".to_string()),
            no_proxy: Some("localhost,127.0.0.1,.internal.example".to_string()),
            proxy_username: Some("corporate-user".to_string()),
            proxy_password: Some("test-only-password".to_string()),
            ..HttpClientConfig::from_network_proxy(&NetworkProxyConfig::default())
        };
        assert!(create_http_client(&config).is_ok());
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
