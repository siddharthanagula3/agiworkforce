//! Direct API provider for BYOK (Bring Your Own Key) cloud providers.
//!
//! Sends requests directly to provider APIs using the user's own API key,
//! bypassing the ManagedCloud proxy. Supports 22+ providers including OpenAI,
//! Anthropic, Google, DeepSeek, xAI, Minimax, Perplexity, Together,
//! Fireworks, Cerebras, DeepInfra, Cohere, AI21, Sambanova, and Azure.

use super::http_client_factory::{create_http_client, HttpClientConfig};
use crate::core::llm::provider_adapter::ProviderAdapterFactory;
use crate::core::llm::sse_parser::StreamChunk;
use crate::core::llm::stream_engine::decode_direct_stream;
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
        let client = create_http_client(&config).map_err(Box::<dyn Error + Send + Sync>::from)?;

        let streaming_config = HttpClientConfig {
            read_timeout_secs: Some(120), // Per-read timeout to catch silent/hung providers (SSE idle timeout in llm_router handles normal gaps)
            ..config.clone()
        };
        let streaming_client =
            create_http_client(&streaming_config).map_err(Box::<dyn Error + Send + Sync>::from)?;

        let resolved_base_url = resolve_direct_base_url(provider, base_url)
            .map_err(Box::<dyn Error + Send + Sync>::from)?;

        // Validate the base URL to prevent SSRF attacks
        validate_provider_base_url(&resolved_base_url)
            .map_err(Box::<dyn Error + Send + Sync>::from)?;
        if provider == Provider::Azure {
            validate_azure_base_url(&resolved_base_url)
                .map_err(Box::<dyn Error + Send + Sync>::from)?;
        }

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
                format!("{}/chat/completions?api-version=2024-10-21", self.base_url)
            }
            // OpenAI-compatible providers all use /chat/completions
            _ => format!("{}/chat/completions", self.base_url),
        }
    }

    /// Build the endpoint for this concrete request. OpenAI catalog models
    /// declared as reasoning use the native Responses API; OpenAI chat-tier
    /// models and every OpenAI-compatible provider remain on Chat Completions.
    fn request_endpoint(&self, model: &str) -> String {
        if self.provider == Provider::OpenAI
            && crate::core::llm::models_config::model_uses_responses_api(model)
        {
            format!("{}/responses", self.base_url)
        } else {
            self.chat_endpoint()
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
    fn apply_auth(&self, builder: reqwest::RequestBuilder) -> reqwest::RequestBuilder {
        match self.provider {
            Provider::Anthropic => builder
                .header("x-api-key", &self.api_key)
                .header("anthropic-version", "2023-06-01")
                .header("anthropic-beta", "computer-use-2025-11-24"),
            // Google uses x-goog-api-key header (avoids leaking key in URL/logs)
            Provider::Google => builder.header("x-goog-api-key", &self.api_key),
            // Azure uses api-key header (not Bearer auth)
            Provider::Azure => builder.header("api-key", &self.api_key),
            // OpenRouter recommends (and its ToS/leaderboard attribution wants) two
            // extra headers on every request identifying the calling app. Mirrors
            // apps/web/lib/llm-providers/openrouter.ts's OPENROUTER_SITE_URL/APP_TITLE.
            Provider::OpenRouter => builder
                .bearer_auth(&self.api_key)
                .header("HTTP-Referer", "https://www.agiworkforce.com")
                .header("X-Title", "AGI Workforce"),
            // Local runtimes (LM Studio, llama.cpp, vLLM) don't require an API key by
            // default. Skip the Authorization header entirely when no key was configured
            // rather than sending an empty Bearer token — some local servers reject
            // malformed auth headers. vLLM does support an optional `--api-key` flag, so
            // when a key IS configured this falls through to the Bearer branch below.
            Provider::LmStudio | Provider::LlamaCpp | Provider::Vllm if self.api_key.is_empty() => {
                builder
            }
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

    fn format_api_error(
        provider: Provider,
        status: u16,
        retry_after: Option<&str>,
        body: &str,
    ) -> String {
        let detail = Self::extract_error_detail(body);
        let retry_hint = retry_after
            .map(str::trim)
            .filter(|value| !value.is_empty())
            .map(|value| {
                if value.parse::<f64>().is_ok() {
                    format!("Retry after {value} seconds.")
                } else {
                    format!("Retry after {value}.")
                }
            })
            .unwrap_or_default();
        let separator = if retry_hint.is_empty() {
            ""
        } else if matches!(detail.chars().last(), Some('.') | Some('!') | Some('?')) {
            " "
        } else {
            ". "
        };

        format!(
            "{} API error {}: {}{}{}",
            provider.as_string(),
            status,
            detail,
            separator,
            retry_hint
        )
    }
}

/// Allowed loopback ports for local AI providers (RT-05 fix).
///
/// Only these ports may be used with `http://localhost` or `http://127.0.0.1`:
///   - 11434 — Ollama default
///   - 1234  — LM Studio default
///   - 8080  — common generic local inference server (also llama.cpp default)
///   - 8000  — vLLM default
///   - 5000  — common Flask/FastAPI local server
///   - 3000  — common Node.js local server
///
/// Any other localhost port is an SSRF pivot risk (e.g. pointing at port 8787
/// would make the LLM client POST bearer-token-authenticated requests to the
/// desktop bridge).
const ALLOWED_LOOPBACK_PORTS: &[u16] = &[11434, 1234, 8080, 8000, 5000, 3000];

/// Validates a provider base URL to prevent SSRF attacks.
///
/// Blocks requests to private/link-local IP ranges (e.g. AWS IMDS at
/// 169.254.169.254) and enforces HTTPS for non-localhost connections.
/// Loopback addresses (127.0.0.0/8, ::1) are allowed with HTTP only,
/// restricted to a small set of known-safe ports (RT-05 fix).
fn validate_provider_base_url(url: &str) -> Result<(), String> {
    let parsed = url
        .parse::<reqwest::Url>()
        .map_err(|e| format!("Invalid base URL: {e}"))?;

    // RT-05 fix: reject non-HTTP(S) schemes immediately.
    match parsed.scheme() {
        "https" | "http" => {}
        scheme => {
            return Err(format!(
                "Unsupported URL scheme '{scheme}'. Only https:// (and http:// for approved local ports) are allowed."
            ));
        }
    }

    // Determine if the host is a loopback address.
    // We use parsed.host() (not host_str()) because host_str() returns
    // brackets around IPv6 addresses (e.g. "[::1]") which breaks IpAddr parsing.
    let is_loopback = match parsed.host() {
        Some(url::Host::Domain(d)) => d == "localhost",
        Some(url::Host::Ipv4(v4)) => v4.is_loopback(),
        Some(url::Host::Ipv6(v6)) => v6.is_loopback(),
        None => false,
    };

    if is_loopback {
        // RT-05 fix: HTTP is allowed on loopback only for specific, known-safe ports.
        if parsed.scheme() == "http" {
            let port = parsed.port().unwrap_or(80);
            if !ALLOWED_LOOPBACK_PORTS.contains(&port) {
                return Err(format!(
                    "localhost port {port} is not in the approved list for local providers. \
                     Allowed ports: {:?}. \
                     If you are running a local model server on a different port, \
                     contact support or use one of the supported ports.",
                    ALLOWED_LOOPBACK_PORTS
                ));
            }
        }
        // HTTPS on loopback is unconditionally allowed (self-signed certs, etc.).
        return Ok(());
    }

    // Non-loopback: require HTTPS.
    if parsed.scheme() == "http" {
        return Err(
            "HTTP (non-TLS) is only allowed for approved localhost ports. Use HTTPS for remote providers."
                .to_string(),
        );
    }

    // Block private/link-local IP ranges (SSRF prevention) for remote hosts.
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

    Ok(())
}

fn resolve_direct_base_url(provider: Provider, base_url: Option<String>) -> Result<String, String> {
    let configured_base_url = base_url
        .map(|url| url.trim().to_string())
        .filter(|url| !url.is_empty());

    match provider {
        Provider::Azure => configured_base_url.ok_or_else(|| {
            "Azure OpenAI requires a deployment-specific base URL, for example \
             https://{resource}.openai.azure.com/openai/deployments/{deployment}. \
             Configure the Azure resource and deployment instead of using a default endpoint."
                .to_string()
        }),
        Provider::Bedrock => Err(
            "AWS Bedrock requires SigV4 request signing. Use BedrockProvider with AWS access key, secret key, and region instead of DirectApiProvider."
                .to_string(),
        ),
        Provider::Ollama => Err(
            "Ollama uses the local OllamaProvider and does not accept bearer-token DirectApiProvider routing."
                .to_string(),
        ),
        Provider::ManagedCloud => Err(
            "Managed Cloud uses ManagedCloudProvider with AGI Workforce authentication, not DirectApiProvider."
                .to_string(),
        ),
        _ => configured_base_url
            .or_else(|| default_base_url(provider).map(str::to_string))
            .ok_or_else(|| {
                format!(
                    "No direct API base URL is configured for provider '{}'",
                    provider.as_string()
                )
            }),
    }
}

fn validate_azure_base_url(url: &str) -> Result<(), String> {
    let parsed = url
        .parse::<reqwest::Url>()
        .map_err(|e| format!("Invalid Azure base URL: {e}"))?;
    let host = parsed
        .host_str()
        .ok_or_else(|| "Azure base URL must include a host".to_string())?;
    let lower_host = host.to_ascii_lowercase();
    let lower_path = parsed.path().to_ascii_lowercase();

    if lower_host == "resource.openai.azure.com"
        || lower_host.contains("{resource}")
        || lower_path.contains("{deployment}")
    {
        return Err(
            "Azure base URL still contains example resource/deployment text; configure the real Azure OpenAI deployment URL."
                .to_string(),
        );
    }

    if !host.ends_with(".openai.azure.com") {
        return Err("Azure base URL host must end with .openai.azure.com".to_string());
    }

    let path = parsed.path();
    if !path.contains("/openai/deployments/")
        || path.trim_end_matches('/').ends_with("/openai/deployments")
    {
        return Err("Azure base URL must include /openai/deployments/{deployment}".to_string());
    }

    Ok(())
}

/// Returns the default base URL for direct BYOK providers with stable public API endpoints.
fn default_base_url(provider: Provider) -> Option<&'static str> {
    match provider {
        Provider::OpenAI => Some("https://api.openai.com/v1"),
        Provider::Anthropic => Some("https://api.anthropic.com/v1"),
        Provider::Google => Some("https://generativelanguage.googleapis.com/v1beta"),
        Provider::DeepSeek => Some("https://api.deepseek.com/v1"),
        Provider::XAI => Some("https://api.x.ai/v1"),
        Provider::Perplexity => Some("https://api.perplexity.ai"),
        Provider::Qwen => Some("https://dashscope.aliyuncs.com/compatible-mode/v1"),
        Provider::Moonshot => Some("https://api.moonshot.cn/v1"),
        Provider::Minimax => Some("https://api.minimax.io/v1"),
        Provider::Zhipu => Some("https://open.bigmodel.cn/api/paas/v4"),
        Provider::Together => Some("https://api.together.xyz/v1"),
        Provider::Fireworks => Some("https://api.fireworks.ai/inference/v1"),
        Provider::Cerebras => Some("https://api.cerebras.ai/v1"),
        Provider::DeepInfra => Some("https://api.deepinfra.com/v1/openai"),
        Provider::Cohere => Some("https://api.cohere.com/v2"),
        Provider::AI21 => Some("https://api.ai21.com/studio/v1"),
        Provider::Sambanova => Some("https://api.sambanova.ai/v1"),
        Provider::NvidiaNim => Some("https://integrate.api.nvidia.com/v1"),
        Provider::OpenRouter => Some("https://openrouter.ai/api/v1"),
        Provider::OllamaCloud => Some("https://api.ollama.com/v1"),
        // Local OpenAI-compatible runtimes. HTTP-on-loopback is explicitly allowed for
        // these ports by `ALLOWED_LOOPBACK_PORTS` above.
        Provider::LmStudio => Some("http://localhost:1234/v1"),
        Provider::LlamaCpp => Some("http://localhost:8080/v1"),
        Provider::Vllm => Some("http://localhost:8000/v1"),
        Provider::Azure | Provider::Bedrock | Provider::Ollama | Provider::ManagedCloud => None,
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
            self.request_endpoint(&request.model)
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
            let retry_after = res
                .headers()
                .get(reqwest::header::RETRY_AFTER)
                .and_then(|value| value.to_str().ok())
                .map(str::to_string);
            let body_text = res.text().await.unwrap_or_default();
            return Err(Box::new(std::io::Error::other(Self::format_api_error(
                self.provider,
                status,
                retry_after.as_deref(),
                &body_text,
            ))));
        }

        let body: Value = res.json().await.map_err(|e| {
            format!(
                "Failed to parse {} response: {}",
                self.provider.as_string(),
                e
            )
        })?;

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
            self.request_endpoint(&request.model)
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
            let retry_after = res
                .headers()
                .get(reqwest::header::RETRY_AFTER)
                .and_then(|value| value.to_str().ok())
                .map(str::to_string);
            let body_text = res.text().await.unwrap_or_default();
            return Err(Box::new(std::io::Error::other(Self::format_api_error(
                self.provider,
                status,
                retry_after.as_deref(),
                &body_text,
            ))));
        }

        // Wave 5 c2: SSE/NDJSON decode now runs through the shared
        // `agiworkforce-llm` dialect runners via the desktop stream_engine
        // facade, replacing desktop's duplicate `parse_sse_stream` decoder.
        Ok(Box::pin(decode_direct_stream(
            res,
            self.provider,
            &request.model,
        )))
    }

    fn is_configured(&self) -> bool {
        match self.provider {
            // Local runtimes never require an API key — presence of a registered
            // instance (always constructed with a valid base_url) is sufficient,
            // mirroring OllamaProvider::is_configured().
            Provider::LmStudio | Provider::LlamaCpp | Provider::Vllm => true,
            _ => !self.api_key.is_empty(),
        }
    }

    /// Whether this provider is currently reachable.
    ///
    /// Cloud BYOK providers are assumed reachable (default trait behavior) until a
    /// network error occurs at request time. Local runtimes (LM Studio, llama.cpp,
    /// vLLM) get a lightweight `/v1/models` health-ping so the router can pre-filter
    /// them out of the candidate list when the local server isn't running, instead of
    /// burning retry budget on a doomed request. Mirrors `OllamaProvider::is_available()`.
    async fn is_available(&self) -> bool {
        if !matches!(
            self.provider,
            Provider::LmStudio | Provider::LlamaCpp | Provider::Vllm
        ) {
            return true;
        }

        // Validate the base_url up front so a malformed value produces a clear,
        // traceable log line instead of an opaque reqwest builder error collapsing
        // into a plain `false` with no indication of why the provider looks unreachable.
        if let Err(e) = self.base_url.parse::<reqwest::Url>() {
            tracing::warn!(
                "{} base_url '{}' is not a valid URL, treating server as unavailable: {}",
                self.provider.as_string(),
                self.base_url,
                e
            );
            return false;
        }

        let url = format!("{}/models", self.base_url);
        self.client
            .get(&url)
            .timeout(std::time::Duration::from_secs(2))
            .send()
            .await
            .map(|r| r.status().is_success())
            .unwrap_or(false)
    }

    fn name(&self) -> &str {
        match self.provider {
            Provider::OpenAI => "DirectOpenAI",
            Provider::Anthropic => "DirectAnthropic",
            Provider::Google => "DirectGoogle",
            Provider::DeepSeek => "DirectDeepSeek",
            Provider::XAI => "DirectXAI",
            Provider::Perplexity => "DirectPerplexity",
            Provider::Qwen => "DirectQwen",
            Provider::Moonshot => "DirectMoonshot",
            Provider::Minimax => "DirectMinimax",
            Provider::Zhipu => "DirectZhipu",
            Provider::Ollama => "DirectOllama",
            Provider::ManagedCloud => "DirectManagedCloud",
            Provider::Together => "DirectTogether",
            Provider::Fireworks => "DirectFireworks",
            Provider::Cerebras => "DirectCerebras",
            Provider::DeepInfra => "DirectDeepInfra",
            Provider::Cohere => "DirectCohere",
            Provider::AI21 => "DirectAI21",
            Provider::Sambanova => "DirectSambanova",
            Provider::Azure => "DirectAzure",
            Provider::Bedrock => "DirectBedrock",
            Provider::NvidiaNim => "DirectNvidiaNim",
            Provider::OpenRouter => "DirectOpenRouter",
            Provider::OllamaCloud => "DirectOllamaCloud",
            Provider::LmStudio => "DirectLmStudio",
            Provider::LlamaCpp => "DirectLlamaCpp",
            Provider::Vllm => "DirectVllm",
        }
    }

    fn supports_vision(&self) -> bool {
        matches!(
            self.provider,
            Provider::OpenAI
                | Provider::Anthropic
                | Provider::Google
                | Provider::XAI
                | Provider::Together
                | Provider::Fireworks
                | Provider::DeepInfra
        )
    }

    fn supports_function_calling(&self) -> bool {
        // Perplexity search and Sambanova routes do not support function calling.
        !matches!(self.provider, Provider::Perplexity | Provider::Sambanova)
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
            Provider::Minimax,
            Provider::Perplexity,
            Provider::Together,
            Provider::Fireworks,
            Provider::Cerebras,
            Provider::DeepInfra,
            Provider::Cohere,
            Provider::AI21,
            Provider::Sambanova,
            Provider::NvidiaNim,
            Provider::OpenRouter,
            // Azure and Bedrock use placeholder URLs, tested separately
        ];
        for provider in providers {
            let url = default_base_url(provider).expect("provider should have direct default URL");
            assert!(
                url.starts_with("https://"),
                "Provider {:?} should have HTTPS URL",
                provider
            );
        }
    }

    #[test]
    fn new_creates_provider_with_default_url() {
        let provider = DirectApiProvider::new(Provider::OpenAI, "sk-test-key".to_string(), None);
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
        let provider = DirectApiProvider::new(Provider::OpenAI, String::new(), None);
        assert!(provider.is_ok());
        let p = provider.expect("should create");
        assert!(!p.is_configured());
    }

    #[test]
    fn azure_requires_deployment_base_url() {
        let provider = DirectApiProvider::new(Provider::Azure, "key".to_string(), None);
        assert!(provider.is_err());
    }

    #[test]
    fn azure_rejects_example_base_url() {
        let provider = DirectApiProvider::new(
            Provider::Azure,
            "key".to_string(),
            Some("https://RESOURCE.openai.azure.com/openai".to_string()),
        );
        assert!(provider.is_err());
    }

    #[test]
    fn bedrock_rejects_direct_provider() {
        let provider = DirectApiProvider::new(Provider::Bedrock, "key".to_string(), None);
        assert!(provider.is_err());
    }

    #[test]
    fn format_api_error_includes_retry_after_for_rate_limits() {
        let body = r#"{"error":{"message":"Rate limit exceeded"}}"#;
        let message = DirectApiProvider::format_api_error(Provider::OpenAI, 429, Some("60"), body);

        assert_eq!(
            message,
            "openai API error 429: Rate limit exceeded. Retry after 60 seconds."
        );
    }

    #[test]
    fn chat_endpoint_openai_compat() {
        let p = DirectApiProvider::new(Provider::OpenAI, "key".to_string(), None)
            .expect("should create");
        assert_eq!(
            p.chat_endpoint(),
            "https://api.openai.com/v1/chat/completions"
        );
    }

    #[test]
    fn request_endpoint_routes_catalog_reasoning_models_to_responses() {
        let p = DirectApiProvider::new(Provider::OpenAI, "key".to_string(), None)
            .expect("should create");
        let model = crate::core::llm::models_config::get_all_model_entries()
            .values()
            .find(|entry| entry.provider == "openai" && entry.model_type == "reasoning")
            .expect("catalog must contain an OpenAI reasoning model");

        assert_eq!(
            p.request_endpoint(&model.id),
            "https://api.openai.com/v1/responses"
        );
    }

    #[test]
    fn request_endpoint_preserves_chat_completions_for_catalog_chat_models() {
        let p = DirectApiProvider::new(Provider::OpenAI, "key".to_string(), None)
            .expect("should create");
        // Only OpenAI reasoning-tier models use the Responses API; every other
        // OpenAI model type routes to Chat Completions. The catalog carries no
        // `chat`-type OpenAI model since the latest-family-only sweep, so exercise the non-Responses branch
        // with any non-reasoning OpenAI model.
        let model = crate::core::llm::models_config::get_all_model_entries()
            .values()
            .find(|entry| entry.provider == "openai" && entry.model_type != "reasoning")
            .expect("catalog must contain a non-reasoning OpenAI model");

        assert_eq!(
            p.request_endpoint(&model.id),
            "https://api.openai.com/v1/chat/completions"
        );
    }

    #[test]
    fn chat_endpoint_anthropic() {
        let p = DirectApiProvider::new(Provider::Anthropic, "key".to_string(), None)
            .expect("should create");
        assert_eq!(p.chat_endpoint(), "https://api.anthropic.com/v1/messages");
    }

    #[test]
    fn anthropic_apply_auth_sends_current_computer_use_beta() {
        let p = DirectApiProvider::new(Provider::Anthropic, "key".to_string(), None)
            .expect("should create");
        let builder = reqwest::Client::new().post("https://api.anthropic.com/v1/messages");
        let request = p.apply_auth(builder).build().expect("request should build");
        assert_eq!(
            request
                .headers()
                .get("anthropic-beta")
                .and_then(|value| value.to_str().ok()),
            Some("computer-use-2025-11-24")
        );
    }

    #[test]
    fn google_endpoint_non_streaming() {
        let p = DirectApiProvider::new(Provider::Google, "test-key".to_string(), None)
            .expect("should create");
        let url = p.google_endpoint("fixture-google-model", false);
        assert!(url.contains("generateContent"));
        // API key must NOT appear in the URL (sent via x-goog-api-key header instead)
        assert!(!url.contains("key="), "API key should not be in URL");
        assert!(!url.contains("alt=sse"));
    }

    #[test]
    fn google_endpoint_streaming() {
        let p = DirectApiProvider::new(Provider::Google, "test-key".to_string(), None)
            .expect("should create");
        let url = p.google_endpoint("fixture-google-model", true);
        assert!(url.contains("streamGenerateContent"));
        assert!(url.contains("alt=sse"));
        // API key must NOT appear in the URL (sent via x-goog-api-key header instead)
        assert!(!url.contains("key="), "API key should not be in URL");
    }

    #[test]
    fn openrouter_apply_auth_sends_bearer_and_attribution_headers() {
        // OpenRouter recommends HTTP-Referer/X-Title on every request for its
        // ToS/leaderboard attribution — mirrors apps/web/lib/llm-providers/openrouter.ts.
        let p = DirectApiProvider::new(Provider::OpenRouter, "sk-or-v1-test".to_string(), None)
            .expect("should create");
        let builder = reqwest::Client::new().post("https://openrouter.ai/api/v1/chat/completions");
        let request = p.apply_auth(builder).build().expect("request should build");
        let headers = request.headers();
        assert_eq!(
            headers.get("authorization").and_then(|v| v.to_str().ok()),
            Some("Bearer sk-or-v1-test")
        );
        assert!(headers.contains_key("HTTP-Referer"));
        assert!(headers.contains_key("X-Title"));
    }

    #[test]
    fn perplexity_does_not_support_function_calling() {
        let p = DirectApiProvider::new(Provider::Perplexity, "key".to_string(), None)
            .expect("should create");
        assert!(!p.supports_function_calling());
    }

    // --- LM Studio / llama.cpp / vLLM (local OpenAI-compatible runtimes) tests ---

    #[test]
    fn lmstudio_default_base_url_is_http_loopback() {
        let url = default_base_url(Provider::LmStudio).expect("LM Studio should have a default");
        assert_eq!(url, "http://localhost:1234/v1");
    }

    #[test]
    fn llamacpp_default_base_url_is_http_loopback() {
        let url = default_base_url(Provider::LlamaCpp).expect("llama.cpp should have a default");
        assert_eq!(url, "http://localhost:8080/v1");
    }

    #[test]
    fn vllm_default_base_url_is_http_loopback() {
        let url = default_base_url(Provider::Vllm).expect("vLLM should have a default");
        assert_eq!(url, "http://localhost:8000/v1");
    }

    #[test]
    fn lmstudio_is_configured_without_api_key() {
        let p = DirectApiProvider::new(Provider::LmStudio, String::new(), None)
            .expect("should create without an API key");
        assert!(p.is_configured());
    }

    #[test]
    fn llamacpp_is_configured_without_api_key() {
        let p = DirectApiProvider::new(Provider::LlamaCpp, String::new(), None)
            .expect("should create without an API key");
        assert!(p.is_configured());
    }

    #[test]
    fn vllm_is_configured_without_api_key() {
        let p = DirectApiProvider::new(Provider::Vllm, String::new(), None)
            .expect("should create without an API key");
        assert!(p.is_configured());
    }

    #[test]
    fn lmstudio_chat_endpoint_is_openai_compat() {
        let p =
            DirectApiProvider::new(Provider::LmStudio, String::new(), None).expect("should create");
        assert_eq!(
            p.chat_endpoint(),
            "http://localhost:1234/v1/chat/completions"
        );
    }

    #[test]
    fn llamacpp_chat_endpoint_is_openai_compat() {
        let p =
            DirectApiProvider::new(Provider::LlamaCpp, String::new(), None).expect("should create");
        assert_eq!(
            p.chat_endpoint(),
            "http://localhost:8080/v1/chat/completions"
        );
    }

    #[test]
    fn vllm_chat_endpoint_is_openai_compat() {
        let p = DirectApiProvider::new(Provider::Vllm, String::new(), None).expect("should create");
        assert_eq!(
            p.chat_endpoint(),
            "http://localhost:8000/v1/chat/completions"
        );
    }

    /// Unlike `OllamaProvider::new()`, `DirectApiProvider::new()` validates the base
    /// URL eagerly at construction time (`validate_provider_base_url`), so a malformed
    /// URL can never reach `is_available()` in the first place — it fails fast here.
    #[test]
    fn lmstudio_rejects_malformed_base_url_at_construction() {
        let result = DirectApiProvider::new(
            Provider::LmStudio,
            String::new(),
            Some("not-a-valid-url".to_string()),
        );
        assert!(result.is_err());
    }

    #[test]
    fn llamacpp_rejects_malformed_base_url_at_construction() {
        let result = DirectApiProvider::new(
            Provider::LlamaCpp,
            String::new(),
            Some("not-a-valid-url".to_string()),
        );
        assert!(result.is_err());
    }

    #[test]
    fn vllm_rejects_malformed_base_url_at_construction() {
        let result = DirectApiProvider::new(
            Provider::Vllm,
            String::new(),
            Some("not-a-valid-url".to_string()),
        );
        assert!(result.is_err());
    }

    /// `is_available()` must complete quickly (bounded by its internal 2s timeout)
    /// and never panic regardless of whether a local server actually answers on the
    /// default port. Not asserting the specific boolean here — unlike the malformed-URL
    /// tests above, this exercises a real network call, and asserting "not running"
    /// would be flaky on a dev machine that happens to have LM Studio/llama.cpp open
    /// or something else bound to that port. Live "not running" behavior is verified
    /// manually (see PR notes) against this sandbox's actual absence of both runtimes.
    #[tokio::test]
    async fn lmstudio_is_available_completes_without_panicking() {
        let p = DirectApiProvider::new(Provider::LmStudio, String::new(), None)
            .expect("should create with default URL");
        let _ = p.is_available().await;
    }

    #[tokio::test]
    async fn llamacpp_is_available_completes_without_panicking() {
        let p = DirectApiProvider::new(Provider::LlamaCpp, String::new(), None)
            .expect("should create with default URL");
        let _ = p.is_available().await;
    }

    #[tokio::test]
    async fn vllm_is_available_completes_without_panicking() {
        let p = DirectApiProvider::new(Provider::Vllm, String::new(), None)
            .expect("should create with default URL");
        let _ = p.is_available().await;
    }

    /// Unlike LM Studio/llama.cpp (which never send an Authorization header), vLLM
    /// supports an optional `--api-key` server flag. When no key is configured (the
    /// common case), no Authorization header should be sent — same as the other
    /// local runtimes.
    #[test]
    fn vllm_apply_auth_omits_bearer_header_when_no_key_configured() {
        let p = DirectApiProvider::new(Provider::Vllm, String::new(), None).expect("should create");
        let builder = reqwest::Client::new().post("http://localhost:8000/v1/chat/completions");
        let request = p.apply_auth(builder).build().expect("request should build");
        assert!(
            !request.headers().contains_key("authorization"),
            "vLLM with no configured key must not send an Authorization header"
        );
    }

    /// When a user DOES configure an API key for vLLM (e.g. a server started with
    /// `--api-key`), it must be sent as a standard Bearer token like every other
    /// OpenAI-compatible provider.
    #[test]
    fn vllm_apply_auth_sends_bearer_when_key_configured() {
        let p = DirectApiProvider::new(Provider::Vllm, "vllm-secret".to_string(), None)
            .expect("should create");
        let builder = reqwest::Client::new().post("http://localhost:8000/v1/chat/completions");
        let request = p.apply_auth(builder).build().expect("request should build");
        assert_eq!(
            request
                .headers()
                .get("authorization")
                .and_then(|v| v.to_str().ok()),
            Some("Bearer vllm-secret")
        );
    }

    /// Cloud BYOK providers must keep the default "assumed available" behavior —
    /// the local-runtime health-ping override must not affect them.
    #[tokio::test]
    async fn openai_is_available_defaults_to_true() {
        let p = DirectApiProvider::new(Provider::OpenAI, "sk-test".to_string(), None)
            .expect("should create");
        assert!(p.is_available().await);
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
        assert!(result
            .unwrap_err()
            .contains("HTTP (non-TLS) is only allowed for approved localhost ports"));
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
