//! Direct API provider for BYOK (Bring Your Own Key) cloud providers.
//!
//! Sends requests directly to provider APIs using the user's own API key,
//! bypassing the ManagedCloud proxy. Supports 22+ providers including OpenAI,
//! Anthropic, Google, DeepSeek, xAI, Mistral, Perplexity, Groq, Together,
//! Fireworks, Cerebras, DeepInfra, Cohere, AI21, Sambanova, and Azure.

use super::http_client_factory::{create_http_client, HttpClientConfig};
use crate::core::llm::provider_adapter::ProviderAdapterFactory;
use crate::core::llm::sse_parser::{parse_sse_stream, StreamChunk};
use crate::core::llm::{LLMProvider, LLMRequest, LLMResponse, Provider};
use async_trait::async_trait;
use futures_util::Stream;
use reqwest::Client;
use serde_json::Value;
use std::error::Error;
use std::pin::Pin;

/// A provider that sends requests directly to a cloud provider's API
/// using the user's own API key (BYOK).
pub struct DirectApiProvider {
    /// HTTP client with a 300s overall timeout for non-streaming requests.
    client: Client,
    /// HTTP client with no overall timeout for SSE streaming requests.
    streaming_client: Client,
    /// The cloud provider this instance targets.
    provider: Provider,
    /// The user's API key for authentication.
    api_key: String,
    /// The base URL for the provider's API.
    base_url: String,
}

impl DirectApiProvider {
    /// Create a new DirectApiProvider for a given cloud provider.
    ///
    /// If `base_url` is `None`, the default URL for the provider is used.
    /// Returns an error if the HTTP clients cannot be constructed.
    pub fn new(
        provider: Provider,
        api_key: String,
        base_url: Option<String>,
    ) -> Result<Self, Box<dyn Error + Send + Sync>> {
        Self::with_config(provider, api_key, base_url, HttpClientConfig::default())
    }

    /// Create a new DirectApiProvider with explicit HTTP client configuration.
    pub fn with_config(
        provider: Provider,
        api_key: String,
        base_url: Option<String>,
        config: HttpClientConfig,
    ) -> Result<Self, Box<dyn Error + Send + Sync>> {
        let client =
            create_http_client(&config).map_err(Box::<dyn Error + Send + Sync>::from)?;

        let streaming_config = HttpClientConfig {
            proxy_url: config.proxy_url.clone(),
            ca_cert_path: config.ca_cert_path.clone(),
            connect_timeout_secs: config.connect_timeout_secs,
            read_timeout_secs: None, // No timeout for streaming
        };
        let streaming_client =
            create_http_client(&streaming_config).map_err(Box::<dyn Error + Send + Sync>::from)?;

        let resolved_base_url = base_url
            .filter(|u| !u.is_empty())
            .unwrap_or_else(|| default_base_url(provider).to_string());

        // Validate the base URL to prevent SSRF attacks
        validate_provider_base_url(&resolved_base_url)
            .map_err(Box::<dyn Error + Send + Sync>::from)?;

        Ok(Self {
            client,
            streaming_client,
            provider,
            api_key,
            base_url: resolved_base_url,
        })
    }

    /// Build the full endpoint URL for a chat/messages request.
    fn chat_endpoint(&self) -> String {
        match self.provider {
            Provider::Anthropic => format!("{}/messages", self.base_url),
            Provider::Google => {
                // Google Gemini uses a different URL structure with the API key as a query param.
                // The model is part of the URL path, but we handle that in send_message.
                // Base endpoint for generateContent:
                self.base_url.clone()
            }
            Provider::Azure => {
                // Azure OpenAI uses: {base_url}/chat/completions?api-version=2024-10-21
                // The base_url should already include the deployment path, e.g.:
                // https://{resource}.openai.azure.com/openai/deployments/{deployment}
                format!(
                    "{}/chat/completions?api-version=2024-10-21",
                    self.base_url
                )
            }
            // OpenAI-compatible providers all use /chat/completions
            _ => format!("{}/chat/completions", self.base_url),
        }
    }

    /// Build the full endpoint URL for a Google Gemini request, which embeds
    /// the model name into the URL. Auth is handled via header in `apply_auth()`.
    fn google_endpoint(&self, model: &str, stream: bool) -> String {
        let action = if stream {
            "streamGenerateContent?alt=sse"
        } else {
            "generateContent"
        };
        format!("{}/models/{}:{}", self.base_url, model, action)
    }

    /// Apply the correct authentication headers for this provider.
    fn apply_auth(
        &self,
        builder: reqwest::RequestBuilder,
    ) -> reqwest::RequestBuilder {
        match self.provider {
            Provider::Anthropic => builder
                .header("x-api-key", &self.api_key)
                .header("anthropic-version", "2023-06-01"),
            // Google uses x-goog-api-key header (avoids leaking key in URL/logs)
            Provider::Google => builder.header("x-goog-api-key", &self.api_key),
            // Azure uses api-key header (not Bearer auth)
            Provider::Azure => builder.header("api-key", &self.api_key),
            // All other providers use Bearer token auth
            _ => builder.bearer_auth(&self.api_key),
        }
    }

    /// Extract a human-readable error message from a provider's error response body.
    fn extract_error_detail(body: &str) -> String {
        if let Ok(value) = serde_json::from_str::<Value>(body) {
            // Try common error response shapes
            if let Some(msg) = value
                .pointer("/error/message")
                .and_then(Value::as_str)
                .or_else(|| value.pointer("/message").and_then(Value::as_str))
                .or_else(|| value.pointer("/error").and_then(Value::as_str))
                .or_else(|| value.pointer("/detail").and_then(Value::as_str))
            {
                let trimmed = msg.trim();
                if !trimmed.is_empty() {
                    return trimmed.chars().take(500).collect();
                }
            }
        }
        body.chars().take(500).collect()
    }
}

/// Validates a provider base URL to prevent SSRF attacks.
///
/// Blocks requests to private/link-local IP ranges (e.g. AWS IMDS at
/// 169.254.169.254) and enforces HTTPS for non-localhost connections.
/// Loopback addresses (127.0.0.0/8, ::1) are allowed with HTTP only,
/// to support local services like Ollama.
fn validate_provider_base_url(url: &str) -> Result<(), String> {
    let parsed = url.parse::<reqwest::Url>()
        .map_err(|e| format!("Invalid base URL: {e}"))?;

    // Determine if the host is a loopback address.
    // We use parsed.host() (not host_str()) because host_str() returns
    // brackets around IPv6 addresses (e.g. "[::1]") which breaks IpAddr parsing.
    let is_loopback = match parsed.host() {
        Some(url::Host::Domain(d)) => d == "localhost",
        Some(url::Host::Ipv4(v4)) => v4.is_loopback(),
        Some(url::Host::Ipv6(v6)) => v6.is_loopback(),
        None => false,
    };

    // Only allow https (or http for loopback / Ollama)
    match parsed.scheme() {
        "https" => {}
        "http" => {
            if !is_loopback {
                return Err(
                    "HTTP (non-TLS) is only allowed for localhost. Use HTTPS for remote providers."
                        .to_string(),
                );
            }
        }
        scheme => return Err(format!("Unsupported URL scheme '{scheme}'. Use HTTPS.")),
    }

    // Block private/link-local IP ranges (SSRF prevention).
    // Loopback is exempted — validated by the scheme check above (HTTP-only).
    if !is_loopback {
        match parsed.host() {
            Some(url::Host::Ipv4(v4)) => {
                if v4.is_private() || v4.is_link_local() {
                    return Err(format!(
                        "Private/link-local IP addresses are not allowed as provider URLs: {v4}"
                    ));
                }
            }
            Some(url::Host::Ipv6(v6)) => {
                let segments = v6.segments();
                // Block fe80::/10 (link-local)
                let is_link_local = (segments[0] & 0xffc0) == 0xfe80;
                // Block fc00::/7 (unique local)
                let is_unique_local = (segments[0] & 0xfe00) == 0xfc00;
                if is_link_local || is_unique_local {
                    return Err(format!(
                        "Link-local/unique-local IPv6 addresses are not allowed as provider URLs: {v6}"
                    ));
                }
            }
            _ => {}
        }
    }

    Ok(())
}

/// Returns the default base URL for a given provider.
fn default_base_url(provider: Provider) -> &'static str {
    match provider {
        Provider::OpenAI => "https://api.openai.com/v1",
        Provider::Anthropic => "https://api.anthropic.com/v1",
        Provider::Google => "https://generativelanguage.googleapis.com/v1beta",
        Provider::DeepSeek => "https://api.deepseek.com/v1",
        Provider::XAI => "https://api.x.ai/v1",
        Provider::Mistral => "https://api.mistral.ai/v1",
        Provider::Perplexity => "https://api.perplexity.ai",
        Provider::Qwen => "https://dashscope.aliyuncs.com/compatible-mode/v1",
        Provider::Moonshot => "https://api.moonshot.cn/v1",
        Provider::Zhipu => "https://open.bigmodel.cn/api/paas/v4",
        // New OpenAI-compatible providers
        Provider::Groq => "https://api.groq.com/openai/v1",
        Provider::Together => "https://api.together.xyz/v1",
        Provider::Fireworks => "https://api.fireworks.ai/inference/v1",
        Provider::Cerebras => "https://api.cerebras.ai/v1",
        Provider::DeepInfra => "https://api.deepinfra.com/v1/openai",
        Provider::Cohere => "https://api.cohere.com/v2",
        Provider::AI21 => "https://api.ai21.com/studio/v1",
        Provider::Sambanova => "https://api.sambanova.ai/v1",
        // Azure uses custom URL patterns — this default is a placeholder;
        // users must configure a proper resource-specific URL.
        Provider::Azure => "https://RESOURCE.openai.azure.com/openai",
        // Bedrock uses AWS SigV4 — this default is a placeholder.
        Provider::Bedrock => "https://bedrock-runtime.us-east-1.amazonaws.com",
        // Ollama and ManagedCloud should not use DirectApiProvider, but
        // provide sensible defaults to avoid panics.
        Provider::Ollama => "http://localhost:11434",
        Provider::ManagedCloud => "https://api.agiworkforce.com",
    }
}

#[async_trait]
impl LLMProvider for DirectApiProvider {
    async fn send_message(
        &self,
        request: &LLMRequest,
    ) -> Result<LLMResponse, Box<dyn Error + Send + Sync>> {
        let adapter = ProviderAdapterFactory::create_adapter(self.provider);
        let adapted_body = adapter.adapt_request(request)?;

        // Build the request URL
        let url = if self.provider == Provider::Google {
            self.google_endpoint(&request.model, false)
        } else {
            self.chat_endpoint()
        };

        let builder = self.client.post(&url);
        let builder = self.apply_auth(builder);

        let res = builder
            .json(&adapted_body)
            .send()
            .await
            .map_err(|e| format!("Network error ({}): {}", self.provider.as_string(), e))?;

        let status = res.status().as_u16();
        if status != 200 {
            let body_text = res.text().await.unwrap_or_default();
            let detail = Self::extract_error_detail(&body_text);
            return Err(Box::new(std::io::Error::other(format!(
                "{} API error {}: {}",
                self.provider.as_string(),
                status,
                detail
            ))));
        }

        let body: Value = res
            .json()
            .await
            .map_err(|e| format!("Failed to parse {} response: {}", self.provider.as_string(), e))?;

        adapter.adapt_response(&body)
    }

    async fn send_message_streaming(
        &self,
        request: &LLMRequest,
    ) -> Result<
        Pin<Box<dyn Stream<Item = Result<StreamChunk, Box<dyn Error + Send + Sync>>> + Send>>,
        Box<dyn Error + Send + Sync>,
    > {
        let adapter = ProviderAdapterFactory::create_adapter(self.provider);

        let mut streaming_request = request.clone();
        streaming_request.stream = true;

        let adapted_body = adapter.adapt_request(&streaming_request)?;

        // Build the request URL
        let url = if self.provider == Provider::Google {
            self.google_endpoint(&request.model, true)
        } else {
            self.chat_endpoint()
        };

        let builder = self.streaming_client.post(&url);
        let builder = self.apply_auth(builder);

        let res = builder
            .json(&adapted_body)
            .send()
            .await
            .map_err(|e| format!("Network error ({}): {}", self.provider.as_string(), e))?;

        if !res.status().is_success() {
            let status = res.status().as_u16();
            let body_text = res.text().await.unwrap_or_default();
            let detail = Self::extract_error_detail(&body_text);
            return Err(Box::new(std::io::Error::other(format!(
                "{} API error {}: {}",
                self.provider.as_string(),
                status,
                detail
            ))));
        }

        Ok(Box::pin(parse_sse_stream(res, self.provider)))
    }

    fn is_configured(&self) -> bool {
        !self.api_key.is_empty()
    }

    fn name(&self) -> &str {
        match self.provider {
            Provider::OpenAI => "DirectOpenAI",
            Provider::Anthropic => "DirectAnthropic",
            Provider::Google => "DirectGoogle",
            Provider::DeepSeek => "DirectDeepSeek",
            Provider::XAI => "DirectXAI",
            Provider::Mistral => "DirectMistral",
            Provider::Perplexity => "DirectPerplexity",
            Provider::Qwen => "DirectQwen",
            Provider::Moonshot => "DirectMoonshot",
            Provider::Zhipu => "DirectZhipu",
            Provider::Ollama => "DirectOllama",
            Provider::ManagedCloud => "DirectManagedCloud",
            Provider::Groq => "DirectGroq",
            Provider::Together => "DirectTogether",
            Provider::Fireworks => "DirectFireworks",
            Provider::Cerebras => "DirectCerebras",
            Provider::DeepInfra => "DirectDeepInfra",
            Provider::Cohere => "DirectCohere",
            Provider::AI21 => "DirectAI21",
            Provider::Sambanova => "DirectSambanova",
            Provider::Azure => "DirectAzure",
            Provider::Bedrock => "DirectBedrock",
        }
    }

    fn supports_vision(&self) -> bool {
        matches!(
            self.provider,
            Provider::OpenAI
                | Provider::Anthropic
                | Provider::Google
                | Provider::XAI
                | Provider::Mistral
                | Provider::Groq
                | Provider::Together
                | Provider::Fireworks
                | Provider::DeepInfra
        )
    }

    fn supports_function_calling(&self) -> bool {
        // Perplexity/Sonar and Sambanova do not support function calling
        !matches!(
            self.provider,
            Provider::Perplexity | Provider::Sambanova
        )
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn default_base_urls_are_valid() {
        let providers = [
            Provider::OpenAI,
            Provider::Anthropic,
            Provider::Google,
            Provider::DeepSeek,
            Provider::XAI,
            Provider::Mistral,
            Provider::Perplexity,
            Provider::Groq,
            Provider::Together,
            Provider::Fireworks,
            Provider::Cerebras,
            Provider::DeepInfra,
            Provider::Cohere,
            Provider::AI21,
            Provider::Sambanova,
            // Azure and Bedrock use placeholder URLs, tested separately
        ];
        for provider in providers {
            let url = default_base_url(provider);
            assert!(url.starts_with("https://"), "Provider {:?} should have HTTPS URL", provider);
        }
    }

    #[test]
    fn new_creates_provider_with_default_url() {
        let provider = DirectApiProvider::new(
            Provider::OpenAI,
            "sk-test-key".to_string(),
            None,
        );
        assert!(provider.is_ok());
        let p = provider.expect("should create");
        assert_eq!(p.base_url, "https://api.openai.com/v1");
        assert!(p.is_configured());
    }

    #[test]
    fn new_creates_provider_with_custom_url() {
        let provider = DirectApiProvider::new(
            Provider::OpenAI,
            "sk-test-key".to_string(),
            Some("https://custom.openai.example.com/v1".to_string()),
        );
        assert!(provider.is_ok());
        let p = provider.expect("should create");
        assert_eq!(p.base_url, "https://custom.openai.example.com/v1");
    }

    #[test]
    fn empty_api_key_is_not_configured() {
        let provider = DirectApiProvider::new(
            Provider::OpenAI,
            String::new(),
            None,
        );
        assert!(provider.is_ok());
        let p = provider.expect("should create");
        assert!(!p.is_configured());
    }

    #[test]
    fn chat_endpoint_openai_compat() {
        let p = DirectApiProvider::new(Provider::OpenAI, "key".to_string(), None)
            .expect("should create");
        assert_eq!(p.chat_endpoint(), "https://api.openai.com/v1/chat/completions");
    }

    #[test]
    fn chat_endpoint_anthropic() {
        let p = DirectApiProvider::new(Provider::Anthropic, "key".to_string(), None)
            .expect("should create");
        assert_eq!(p.chat_endpoint(), "https://api.anthropic.com/v1/messages");
    }

    #[test]
    fn google_endpoint_non_streaming() {
        let p = DirectApiProvider::new(Provider::Google, "test-key".to_string(), None)
            .expect("should create");
        let url = p.google_endpoint("gemini-2.5-pro", false);
        assert!(url.contains("generateContent"));
        // API key must NOT appear in the URL (sent via x-goog-api-key header instead)
        assert!(!url.contains("key="), "API key should not be in URL");
        assert!(!url.contains("alt=sse"));
    }

    #[test]
    fn google_endpoint_streaming() {
        let p = DirectApiProvider::new(Provider::Google, "test-key".to_string(), None)
            .expect("should create");
        let url = p.google_endpoint("gemini-2.5-pro", true);
        assert!(url.contains("streamGenerateContent"));
        assert!(url.contains("alt=sse"));
        // API key must NOT appear in the URL (sent via x-goog-api-key header instead)
        assert!(!url.contains("key="), "API key should not be in URL");
    }

    #[test]
    fn perplexity_does_not_support_function_calling() {
        let p = DirectApiProvider::new(Provider::Perplexity, "key".to_string(), None)
            .expect("should create");
        assert!(!p.supports_function_calling());
    }

    // --- validate_provider_base_url tests ---

    #[test]
    fn validate_allows_https_remote_urls() {
        assert!(validate_provider_base_url("https://api.openai.com/v1").is_ok());
        assert!(validate_provider_base_url("https://api.anthropic.com/v1").is_ok());
    }

    #[test]
    fn validate_allows_http_loopback_ipv4() {
        // Ollama default: http://127.0.0.1:11434
        assert!(validate_provider_base_url("http://127.0.0.1:11434").is_ok());
        assert!(validate_provider_base_url("http://localhost:11434").is_ok());
    }

    #[test]
    fn validate_allows_http_loopback_ipv6() {
        assert!(validate_provider_base_url("http://[::1]:11434").is_ok());
    }

    #[test]
    fn validate_blocks_http_non_loopback() {
        let result = validate_provider_base_url("http://10.0.0.5:8080");
        assert!(result.is_err());
        assert!(result.unwrap_err().contains("HTTP (non-TLS) is only allowed for localhost"));
    }

    #[test]
    fn validate_blocks_private_ipv4() {
        // 10.x.x.x
        assert!(validate_provider_base_url("https://10.0.0.1/v1").is_err());
        // 192.168.x.x
        assert!(validate_provider_base_url("https://192.168.1.1/v1").is_err());
        // 172.16.x.x
        assert!(validate_provider_base_url("https://172.16.0.1/v1").is_err());
    }

    #[test]
    fn validate_blocks_link_local_ipv4() {
        // 169.254.169.254 (AWS IMDS)
        assert!(validate_provider_base_url("https://169.254.169.254/latest/meta-data").is_err());
    }

    #[test]
    fn validate_blocks_link_local_ipv6() {
        // fe80::/10
        assert!(validate_provider_base_url("https://[fe80::1]/v1").is_err());
    }

    #[test]
    fn validate_blocks_unique_local_ipv6() {
        // fc00::/7 (fd00::1 is a common unique local address)
        assert!(validate_provider_base_url("https://[fd00::1]/v1").is_err());
    }

    #[test]
    fn validate_blocks_unsupported_scheme() {
        let result = validate_provider_base_url("ftp://example.com");
        assert!(result.is_err());
        assert!(result.unwrap_err().contains("Unsupported URL scheme"));
    }

    #[test]
    fn validate_blocks_invalid_url() {
        assert!(validate_provider_base_url("not a url at all").is_err());
    }
}
