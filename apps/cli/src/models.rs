use anyhow::{bail, Context, Result};
use futures_util::StreamExt;
use reqwest::Client;
use serde::{Deserialize, Serialize};
use serde_json::Value;
use std::collections::HashMap;
use std::time::Duration;

use crate::config::CliConfig;
use crate::errors::CliError;

/// Maximum time to wait between successive stream chunks before giving up.
const STREAM_IDLE_TIMEOUT: Duration = Duration::from_secs(300); // 5 minutes

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/// Which Ollama deployment we're talking to.
#[derive(Debug, Clone, PartialEq, Eq)]
pub enum OllamaMode {
    /// Local Ollama server (`ollama serve`, no API key).
    Local,
    /// Hosted Ollama Cloud — requires `OLLAMA_API_KEY`.
    Cloud,
}

/// Which LLM provider to route to.
///
/// Three native handlers stay specialized because their API shapes differ
/// substantially from OpenAI Chat Completions: `Anthropic` (Messages API),
/// `Google` (Gemini), and `Ollama` (newline-delimited JSON, local or cloud).
///
/// Everything else — OpenAI itself, xAI, DeepSeek, Perplexity, Qwen, Moonshot,
/// Zhipu, LM Studio, Mistral, plus any user-defined `[providers.*]` block — flows
/// through the `OpenAICompatible` variant. The variant carries the canonical
/// base URL and the env var name for the API key (or `None` for unauthenticated
/// local endpoints like LM Studio).
#[derive(Debug, Clone, PartialEq, Eq)]
#[allow(clippy::upper_case_acronyms)]
pub enum Provider {
    Anthropic,
    Google,
    Ollama(OllamaMode),
    /// OpenAI-compatible Chat Completions endpoint.
    ///
    /// `name`         — display/log name (e.g. "openai", "xai", "lmstudio", "openrouter").
    /// `base_url`     — full chat completions URL (e.g. "https://api.openai.com/v1/chat/completions").
    /// `api_key_env`  — env var holding the API key, or `None` for keyless local endpoints.
    OpenAICompatible {
        name: &'static str,
        base_url: &'static str,
        api_key_env: Option<&'static str>,
    },
    /// User-defined OpenAI-compatible endpoint loaded from `~/.agiworkforce/config.toml`.
    /// Uses owned strings so the registry can survive past the lifetime of the
    /// initial config load.
    Custom {
        name: String,
        base_url: String,
        api_key_env: Option<String>,
    },
}

// ---------------------------------------------------------------------------
// Pre-registered OpenAI-compatible providers
// ---------------------------------------------------------------------------

/// Convenience constructor for the canonical OpenAI endpoint.
pub fn openai_provider() -> Provider {
    Provider::OpenAICompatible {
        name: "openai",
        base_url: "https://api.openai.com/v1/chat/completions",
        api_key_env: Some("OPENAI_API_KEY"),
    }
}

/// xAI / Grok.
pub fn xai_provider() -> Provider {
    Provider::OpenAICompatible {
        name: "xai",
        base_url: "https://api.x.ai/v1/chat/completions",
        api_key_env: Some("XAI_API_KEY"),
    }
}

/// DeepSeek.
pub fn deepseek_provider() -> Provider {
    Provider::OpenAICompatible {
        name: "deepseek",
        base_url: "https://api.deepseek.com/v1/chat/completions",
        api_key_env: Some("DEEPSEEK_API_KEY"),
    }
}

/// Perplexity.
pub fn perplexity_provider() -> Provider {
    Provider::OpenAICompatible {
        name: "perplexity",
        base_url: "https://api.perplexity.ai/chat/completions",
        api_key_env: Some("PERPLEXITY_API_KEY"),
    }
}

/// Alibaba Qwen / DashScope OpenAI-compatible mode.
pub fn qwen_provider() -> Provider {
    Provider::OpenAICompatible {
        name: "qwen",
        base_url: "https://dashscope.aliyuncs.com/compatible-mode/v1/chat/completions",
        api_key_env: Some("QWEN_API_KEY"),
    }
}

/// Moonshot / Kimi.
pub fn moonshot_provider() -> Provider {
    Provider::OpenAICompatible {
        name: "moonshot",
        base_url: "https://api.moonshot.cn/v1/chat/completions",
        api_key_env: Some("MOONSHOT_API_KEY"),
    }
}

/// Zhipu / GLM.
pub fn zhipu_provider() -> Provider {
    Provider::OpenAICompatible {
        name: "zhipu",
        base_url: "https://open.bigmodel.cn/api/paas/v4/chat/completions",
        api_key_env: Some("ZHIPU_API_KEY"),
    }
}

/// LM Studio — local OpenAI-compatible server, no key required.
pub fn lmstudio_provider() -> Provider {
    Provider::OpenAICompatible {
        name: "lmstudio",
        base_url: "http://localhost:1234/v1/chat/completions",
        api_key_env: None,
    }
}

/// Mistral AI — OpenAI-compatible endpoint.
pub fn mistral_provider() -> Provider {
    Provider::OpenAICompatible {
        name: "mistral",
        base_url: "https://api.mistral.ai/v1/chat/completions",
        api_key_env: Some("MISTRAL_API_KEY"),
    }
}

/// A content block within a message (supports text and tool interactions).
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(tag = "type")]
pub enum ContentBlock {
    #[serde(rename = "text")]
    Text { text: String },
    #[serde(rename = "tool_use")]
    ToolUse {
        id: String,
        name: String,
        input: serde_json::Value,
    },
    #[serde(rename = "tool_result")]
    ToolResult {
        tool_use_id: String,
        content: String,
        #[serde(default)]
        is_error: bool,
    },
}

/// A tool definition to send to the API.
///
/// Note: only `name`, `description`, and `input_schema` are forwarded to the
/// model. The remaining fields are LOCAL metadata for the executor —
/// concurrency hints (Phase 6) and per-tool size caps (Phase 8). Each provider
/// stream function explicitly picks the API-bound fields by name, so these
/// extra fields stay client-side.
#[derive(Debug, Clone, Serialize)]
pub struct ToolDefinition {
    pub name: String,
    pub description: String,
    pub input_schema: serde_json::Value,
    /// Tool only reads filesystem / network state; never mutates. Read-only
    /// tools are safe to batch concurrently (Phase 7).
    #[serde(skip)]
    #[serde(default)]
    pub is_read_only: bool,
    /// Tool can run concurrently with other concurrency-safe tools without
    /// races. Defaults to false; only set true after auditing the tool for
    /// shared mutable state.
    #[serde(skip)]
    #[serde(default)]
    pub is_concurrency_safe: bool,
    /// Per-tool override for output truncation in chars. None falls back to
    /// the global `MAX_OUTPUT_BYTES` (50 KB). Larger for `web_fetch`,
    /// smaller for status-only tools (Phase 8).
    #[serde(skip)]
    #[serde(default)]
    pub max_result_size_chars: Option<usize>,
    /// Phase E (W2-W6): when `true`, this tool's schema is NOT included in
    /// the model's initial system-prompt tool list. Instead the model must
    /// call `tool_search` to load the schema on demand. Defaults to `false`
    /// (always-loaded). Set `true` for niche tools: Memory, Notebook,
    /// Computer, MCP extensions, skills — keeping the initial payload small.
    /// The tool remains fully executable once its schema is loaded.
    #[serde(skip)]
    #[serde(default)]
    pub should_defer: bool,
}

/// A tool call parsed from the API response.
#[derive(Debug, Clone)]
pub struct ToolCallResponse {
    pub id: String,
    pub name: String,
    pub arguments: serde_json::Value,
}

/// Message content — either a simple string or structured content blocks.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(untagged)]
pub enum MessageContent {
    Text(String),
    Blocks(Vec<ContentBlock>),
}

/// A single message in a conversation.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Message {
    pub role: String,
    pub content: MessageContent,
}

impl Message {
    /// Create a simple text message.
    pub fn text(role: &str, text: impl Into<String>) -> Self {
        Self {
            role: role.to_string(),
            content: MessageContent::Text(text.into()),
        }
    }

    /// Create a message with content blocks.
    pub fn blocks(role: &str, blocks: Vec<ContentBlock>) -> Self {
        Self {
            role: role.to_string(),
            content: MessageContent::Blocks(blocks),
        }
    }

    /// Extract text content from this message (concatenates all text blocks).
    pub fn text_content(&self) -> String {
        match &self.content {
            MessageContent::Text(t) => t.clone(),
            MessageContent::Blocks(blocks) => blocks
                .iter()
                .filter_map(|b| match b {
                    ContentBlock::Text { text } => Some(text.as_str()),
                    _ => None,
                })
                .collect::<Vec<_>>()
                .join(""),
        }
    }
}

/// Streamed chunk callback — receives each text delta as it arrives.
pub type StreamCallback = Box<dyn FnMut(&str) + Send>;

/// Non-streaming completion result.
pub struct CompletionResult {
    pub text: String,
    pub tool_calls: Vec<ToolCallResponse>,
    pub input_tokens: u32,
    pub output_tokens: u32,
    /// Tokens read from prompt cache (Anthropic only). Billed at ~10% of
    /// regular input rate. 0 when no cache hit or provider doesn't support
    /// caching.
    pub cache_read_input_tokens: u32,
    /// Tokens written to prompt cache (Anthropic only). Billed at full input
    /// rate (some providers add a 25% premium). 0 when no cache write or
    /// provider doesn't support caching.
    pub cache_creation_input_tokens: u32,
    /// True when the request was routed through a subscription (Copilot, ChatGPT Plus).
    /// Cost display should show $0.00 when this is set.
    pub via_subscription: bool,
    /// The reason the model stopped generating (e.g. "end_turn", "tool_use", "stop", "tool_calls").
    /// Used to determine whether the model wants to use tools or has finished.
    #[allow(dead_code)]
    pub stop_reason: Option<String>,
}

// ---------------------------------------------------------------------------
// Provider detection
// ---------------------------------------------------------------------------

/// Resolve a `Provider` from a config provider name string.
///
/// Returns `None` if the name is not recognized, in which case callers
/// should fall back to [`detect_provider`] for model-name-based detection.
///
/// Recognizes the 10 pre-registered cloud providers, the two Ollama modes,
/// LM Studio, plus any custom provider registered through the dynamic
/// registry (see `register_custom_providers`).
pub fn provider_from_name(name: &str) -> Option<Provider> {
    let lower = name.to_lowercase();
    match lower.as_str() {
        "anthropic" => Some(Provider::Anthropic),
        "openai" => Some(openai_provider()),
        "google" => Some(Provider::Google),
        "ollama" | "ollama-local" | "ollama_local" => Some(Provider::Ollama(OllamaMode::Local)),
        "ollama-cloud" | "ollama_cloud" | "ollamacloud" => {
            Some(Provider::Ollama(OllamaMode::Cloud))
        }
        "xai" | "grok" => Some(xai_provider()),
        "deepseek" => Some(deepseek_provider()),
        "perplexity" => Some(perplexity_provider()),
        "qwen" | "dashscope" => Some(qwen_provider()),
        "moonshot" | "kimi" => Some(moonshot_provider()),
        "zhipu" | "glm" => Some(zhipu_provider()),
        "lmstudio" | "lm-studio" | "lm_studio" => Some(lmstudio_provider()),
        "mistral" | "mistral-ai" | "mistralai" => Some(mistral_provider()),
        _ => lookup_custom_provider(&lower),
    }
}

/// Detect the provider from a model name string.
///
/// Mistral / Codestral and other formerly-native providers now route through
/// the OpenAI-compatible variant (`Mistral` was dropped on 2026-05-03 because
/// no API key was wired anywhere in the platform).
pub fn detect_provider(model: &str) -> Provider {
    let m = model.to_lowercase();
    if m.starts_with("claude") || m.starts_with("anthropic") {
        Provider::Anthropic
    } else if m.starts_with("gpt")
        || m.starts_with("o1")
        || m.starts_with("o3")
        || m.starts_with("o4")
        || m.starts_with("chatgpt")
    {
        openai_provider()
    } else if m.starts_with("gemini") || m.starts_with("models/gemini") {
        Provider::Google
    } else if m.starts_with("mistral") || m.starts_with("codestral") {
        mistral_provider()
    } else if m.starts_with("grok") {
        xai_provider()
    } else if m.starts_with("deepseek") {
        deepseek_provider()
    } else if m.starts_with("kimi") || m.starts_with("moonshot") {
        moonshot_provider()
    } else if m.starts_with("glm") || m.starts_with("zhipu") {
        zhipu_provider()
    } else if m.starts_with("qwen") {
        qwen_provider()
    } else if m.contains("llama") || m.contains("phi") || m.contains("command-r") {
        // Local models commonly served via Ollama (default to local mode)
        Provider::Ollama(OllamaMode::Local)
    } else {
        // Default fallback: try local Ollama (most permissive — no key required)
        Provider::Ollama(OllamaMode::Local)
    }
}

/// Resolve the API key for a provider, returning an error if required but missing.
fn resolve_key(config: &CliConfig, provider: &Provider) -> Result<Option<String>> {
    let name = provider_name(provider);
    match provider {
        Provider::Ollama(OllamaMode::Local) => Ok(None), // no key needed
        Provider::Ollama(OllamaMode::Cloud) => {
            // Ollama Cloud requires OLLAMA_API_KEY. Fall back to env var if not in config.
            let key = config.resolve_api_key(name).or_else(|| {
                std::env::var("OLLAMA_API_KEY")
                    .ok()
                    .filter(|k| !k.is_empty())
            });
            if key.is_none() {
                return Err(CliError::auth(
                    name,
                    "No API key found. Set the OLLAMA_API_KEY environment variable.".to_string(),
                )
                .into());
            }
            Ok(key)
        }
        Provider::OpenAICompatible {
            name: pname,
            api_key_env,
            ..
        } => {
            // Keyless local endpoints (LM Studio) can return None.
            let Some(env_var) = api_key_env else {
                return Ok(None);
            };
            let key = config
                .resolve_api_key(pname)
                .or_else(|| std::env::var(env_var).ok().filter(|k| !k.is_empty()));
            if key.is_none() {
                return Err(CliError::auth(
                    *pname,
                    format!("No API key found. Set the {} environment variable.", env_var),
                )
                .into());
            }
            Ok(key)
        }
        Provider::Custom {
            name: pname,
            api_key_env,
            ..
        } => {
            let Some(env_var) = api_key_env else {
                return Ok(None);
            };
            let key = config
                .resolve_api_key(pname)
                .or_else(|| std::env::var(env_var).ok().filter(|k| !k.is_empty()));
            if key.is_none() {
                return Err(CliError::auth(
                    pname.clone(),
                    format!("No API key found. Set the {} environment variable.", env_var),
                )
                .into());
            }
            Ok(key)
        }
        Provider::Anthropic | Provider::Google => {
            let key = config.resolve_api_key(name);
            if key.is_none() {
                let env_var = config
                    .providers
                    .get(name)
                    .and_then(|p| p.api_key_env.as_deref())
                    .unwrap_or("UNKNOWN");
                return Err(CliError::auth(
                    name,
                    format!(
                        "No API key found. Set the {} environment variable.",
                        env_var
                    ),
                )
                .into());
            }
            Ok(key)
        }
    }
}

pub fn provider_name(provider: &Provider) -> &'static str {
    match provider {
        Provider::Anthropic => "anthropic",
        Provider::Google => "google",
        Provider::Ollama(OllamaMode::Local) => "ollama",
        Provider::Ollama(OllamaMode::Cloud) => "ollama_cloud",
        Provider::OpenAICompatible { name, .. } => name,
        // Custom providers have owned String names; we leak a static name only
        // for matching against config maps. Use the first registered custom
        // name here — callers needing the dynamic name should match on the
        // variant directly. Falls back to "custom" as a stable label.
        Provider::Custom { .. } => "custom",
    }
}

/// Custom provider lookup helper used by `provider_from_name` to resolve names
/// loaded from `[providers.*]` blocks in `~/.agiworkforce/config.toml`.
fn lookup_custom_provider(name: &str) -> Option<Provider> {
    let registry = CUSTOM_PROVIDERS.read().ok()?;
    registry.get(name).cloned()
}

/// Process-wide registry of user-defined OpenAI-compatible providers loaded from
/// `[providers.<name>]` config blocks. Populated once at startup by
/// `register_custom_providers`.
static CUSTOM_PROVIDERS: once_cell::sync::Lazy<
    std::sync::RwLock<HashMap<String, Provider>>,
> = once_cell::sync::Lazy::new(|| std::sync::RwLock::new(HashMap::new()));

/// Register custom OpenAI-compatible providers loaded from the user config file.
///
/// Skips entries whose name collides with a pre-registered provider (Anthropic,
/// OpenAI, Google, Ollama, xAI, DeepSeek, Perplexity, Qwen, Moonshot, Zhipu,
/// LM Studio, Mistral) so users cannot accidentally hijack a native handler.
///
/// Each entry needs a `base_url`; `api_key_env` is optional (omit for keyless
/// local endpoints). Base URLs without `/chat/completions` get the path
/// appended automatically so users can provide either form.
pub fn register_custom_providers(config: &CliConfig) {
    const RESERVED: &[&str] = &[
        "anthropic",
        "openai",
        "google",
        "ollama",
        "ollama-cloud",
        "ollama_cloud",
        "ollamacloud",
        "xai",
        "grok",
        "deepseek",
        "perplexity",
        "qwen",
        "dashscope",
        "moonshot",
        "kimi",
        "zhipu",
        "glm",
        "lmstudio",
        "lm-studio",
        "lm_studio",
        "mistral",
        "mistral-ai",
        "mistralai",
    ];

    let Ok(mut registry) = CUSTOM_PROVIDERS.write() else {
        return;
    };
    registry.clear();

    for (name, pc) in &config.providers {
        let lower = name.to_lowercase();
        if RESERVED.contains(&lower.as_str()) {
            continue;
        }
        let Some(base) = pc.base_url.as_ref() else {
            continue;
        };
        let trimmed = base.trim_end_matches('/');

        // SEV-CLI-04 fix: enforce a scheme allowlist before registering any
        // custom provider. Without this, a project-level config inside a cloned
        // repository can point base_url at IMDS (169.254.169.254), an internal
        // service, or another loopback port and exfiltrate API keys + prompts
        // there. Permit only https:// (production) and explicit loopback hosts
        // for local model servers (Ollama, LMStudio).
        if !is_safe_provider_base_url(trimmed) {
            tracing::warn!(
                provider = %lower,
                base_url = %trimmed,
                "skipping custom provider — base_url must be https:// or http://(localhost|127.0.0.1|[::1])"
            );
            continue;
        }

        let url = if trimmed.ends_with("/chat/completions") {
            trimmed.to_string()
        } else {
            format!("{}/chat/completions", trimmed)
        };
        registry.insert(
            lower.clone(),
            Provider::Custom {
                name: lower,
                base_url: url,
                api_key_env: pc.api_key_env.clone(),
            },
        );
    }
}

/// Returns true if the URL is acceptable as a custom-provider base URL.
/// Allows `https://` to any host, and `http://` only to loopback hosts.
fn is_safe_provider_base_url(url: &str) -> bool {
    if url.starts_with("https://") {
        return true;
    }
    if let Some(rest) = url.strip_prefix("http://") {
        // IPv6 hosts arrive bracketed: `http://[::1]:8000/v1`. Splitting on
        // ':' would chop the host to just `[`, mis-classifying loopback as
        // public. Detect the bracketed form explicitly and extract the
        // entire `[...]` segment as the host.
        let host = if rest.starts_with('[') {
            match rest.find(']') {
                Some(end) => rest[..=end].to_ascii_lowercase(),
                None => return false, // malformed — refuse rather than guess
            }
        } else {
            rest.split(['/', ':', '?', '#'])
                .next()
                .unwrap_or("")
                .to_ascii_lowercase()
        };
        return host == "localhost" || host == "127.0.0.1" || host == "[::1]";
    }
    false
}

#[cfg(test)]
mod safe_provider_url_tests {
    use super::is_safe_provider_base_url;

    #[test]
    fn https_anywhere_is_allowed() {
        assert!(is_safe_provider_base_url("https://api.openai.com/v1"));
        assert!(is_safe_provider_base_url("https://example.com"));
    }

    #[test]
    fn http_localhost_is_allowed() {
        assert!(is_safe_provider_base_url("http://localhost:11434/v1"));
        assert!(is_safe_provider_base_url("http://127.0.0.1:1234"));
        assert!(is_safe_provider_base_url("http://[::1]:8000/v1"));
    }

    #[test]
    fn http_external_is_blocked() {
        assert!(!is_safe_provider_base_url("http://example.com"));
        assert!(!is_safe_provider_base_url(
            "http://169.254.169.254/latest/meta-data"
        ));
        assert!(!is_safe_provider_base_url("http://192.168.1.1"));
        assert!(!is_safe_provider_base_url("http://0.0.0.0:8080"));
    }

    #[test]
    fn other_schemes_are_blocked() {
        assert!(!is_safe_provider_base_url("file:///etc/passwd"));
        assert!(!is_safe_provider_base_url("ftp://example.com"));
        assert!(!is_safe_provider_base_url("gopher://internal"));
        assert!(!is_safe_provider_base_url(""));
        assert!(!is_safe_provider_base_url("localhost:8080"));
    }
}

// ---------------------------------------------------------------------------
// Subscription auth helpers
// ---------------------------------------------------------------------------

/// Try subscription auth (Copilot, ChatGPT Plus) for the given provider.
///
/// Returns `Some((token, url, subscription_name, account_id))` if subscription
/// auth is available, `None` otherwise.
async fn try_subscription_auth(
    provider: &Provider,
) -> Option<(String, String, String, Option<String>)> {
    let mut auth_store = crate::auth::load_auth().ok()?;

    // Determine which subscription providers are compatible with this Provider
    let subscription_names: &[&str] = match provider {
        Provider::OpenAICompatible { name: "openai", .. } => &["chatgpt", "copilot"],
        Provider::Anthropic => &["copilot"], // Copilot can proxy Claude models
        _ => return None,
    };

    for &sub_name in subscription_names {
        if let Ok(Some((token, base_url_override))) =
            crate::auth::resolve_auth(&mut auth_store, sub_name).await
        {
            let url = base_url_override.unwrap_or_else(|| default_subscription_url(sub_name));
            // Subscription auth tokens must only be sent over HTTPS
            if !url.starts_with("https://") {
                // Redact URL to avoid leaking embedded credentials in logs
                let scheme = url.split("://").next().unwrap_or("unknown");
                eprintln!(
                    "[auth] Rejecting non-HTTPS subscription URL for {} (scheme: {})",
                    sub_name, scheme
                );
                continue;
            }
            let account_id = auth_store.entries.get(sub_name).and_then(|e| match e {
                crate::auth::AuthEntry::OAuth { account_id, .. } => account_id.clone(),
                _ => None,
            });
            // Persist any token refreshes that happened during resolve_auth
            let _ = crate::auth::save_auth(&auth_store);
            return Some((token, url, sub_name.to_string(), account_id));
        }
    }

    // Persist any token refreshes even if none matched
    let _ = crate::auth::save_auth(&auth_store);
    None
}

/// Default API URL for a subscription provider.
fn default_subscription_url(name: &str) -> String {
    match name {
        "copilot" => "https://api.githubcopilot.com/chat/completions".to_string(),
        "chatgpt" => "https://chatgpt.com/backend-api/codex/responses".to_string(),
        _ => "https://api.openai.com/v1/chat/completions".to_string(),
    }
}

// ---------------------------------------------------------------------------
// Streaming completion
// ---------------------------------------------------------------------------

/// Send a streaming chat completion request and invoke `on_chunk` for each text delta.
/// Returns a `CompletionResult` with text, tool calls, and token usage.
pub async fn stream_completion(
    config: &CliConfig,
    provider: &Provider,
    model: &str,
    messages: &[Message],
    max_tokens: u32,
    tools: Option<&[ToolDefinition]>,
    mut on_chunk: StreamCallback,
) -> Result<CompletionResult> {
    let client = Client::new();
    let temperature = config.default.temperature;

    // ---- Try subscription auth first (Copilot, ChatGPT Plus) ----
    if let Some((token, url, sub_name, account_id)) = try_subscription_auth(provider).await {
        let mut result = match sub_name.as_str() {
            "copilot" => {
                stream_copilot_api(
                    &client,
                    &token,
                    &url,
                    model,
                    messages,
                    max_tokens,
                    temperature,
                    tools,
                    &mut on_chunk,
                )
                .await?
            }
            "chatgpt" => {
                stream_chatgpt_codex(
                    &client,
                    &token,
                    &url,
                    model,
                    messages,
                    max_tokens,
                    temperature,
                    tools,
                    &mut on_chunk,
                    account_id.as_deref(),
                )
                .await?
            }
            _ => {
                stream_openai_compatible(
                    &client,
                    &token,
                    &url,
                    model,
                    messages,
                    max_tokens,
                    temperature,
                    tools,
                    &mut on_chunk,
                )
                .await?
            }
        };
        result.via_subscription = true;
        return Ok(result);
    }

    // ---- Fall through to API key auth ----
    let api_key = resolve_key(config, provider)?;

    match provider {
        Provider::Anthropic => {
            stream_anthropic(
                &client,
                api_key.as_deref().unwrap_or_default(),
                model,
                messages,
                max_tokens,
                temperature,
                tools,
                &mut on_chunk,
            )
            .await
        }
        Provider::Google => {
            stream_google(
                &client,
                api_key.as_deref().unwrap_or_default(),
                model,
                messages,
                max_tokens,
                temperature,
                tools,
                &mut on_chunk,
            )
            .await
        }
        Provider::Ollama(OllamaMode::Local) => {
            let base_url = config
                .base_url("ollama")
                .unwrap_or_else(|| "http://localhost:11434".to_string());
            stream_ollama(
                &client,
                &base_url,
                model,
                messages,
                max_tokens,
                temperature,
                tools,
                &mut on_chunk,
            )
            .await
        }
        Provider::Ollama(OllamaMode::Cloud) => {
            let base_url = config
                .base_url("ollama-cloud")
                .unwrap_or_else(|| "https://api.ollama.com/v1".to_string());
            let url = format!("{}/chat/completions", base_url.trim_end_matches('/'));
            stream_openai_compatible(
                &client,
                api_key.as_deref().unwrap_or_default(),
                &url,
                model,
                messages,
                max_tokens,
                temperature,
                tools,
                &mut on_chunk,
            )
            .await
        }
        Provider::OpenAICompatible {
            name: _,
            base_url,
            ..
        } => {
            stream_openai_compatible(
                &client,
                api_key.as_deref().unwrap_or_default(),
                base_url,
                model,
                messages,
                max_tokens,
                temperature,
                tools,
                &mut on_chunk,
            )
            .await
        }
        Provider::Custom { base_url, .. } => {
            stream_openai_compatible(
                &client,
                api_key.as_deref().unwrap_or_default(),
                base_url,
                model,
                messages,
                max_tokens,
                temperature,
                tools,
                &mut on_chunk,
            )
            .await
        }
    }
}

// ---------------------------------------------------------------------------
// HTTP status → CliError classification
// ---------------------------------------------------------------------------

/// Infer provider name from a base URL for error reporting.
fn provider_name_from_url(url: &str) -> &str {
    if url.contains("openai") {
        "openai"
    } else if url.contains("mistral") {
        "mistral"
    } else if url.contains("xai") || url.contains("grok") {
        "xai"
    } else if url.contains("deepseek") {
        "deepseek"
    } else if url.contains("localhost") || url.contains("127.0.0.1") {
        "ollama"
    } else {
        "unknown"
    }
}

/// Check whether an error message looks like a context window overflow.
fn looks_like_context_overflow(msg: &str) -> bool {
    let lower = msg.to_lowercase();
    lower.contains("context")
        && (lower.contains("exceed")
            || lower.contains("too long")
            || lower.contains("overflow")
            || lower.contains("maximum"))
}

/// Convert an HTTP error response into a typed `CliError`.
///
/// Classifies by status code:
/// - 401/403 -> `CliError::Auth`
/// - 429     -> `CliError::RateLimited` (with `Retry-After` header if present)
/// - 500/502/503/504 -> `CliError::Api`
/// - everything else -> `CliError::Api`
fn classify_http_error(
    provider: &str,
    status: reqwest::StatusCode,
    retry_after: Option<&reqwest::header::HeaderValue>,
    body: &str,
) -> CliError {
    let code = status.as_u16();

    // Provider-specific error messages
    match (provider, code) {
        ("anthropic", 529) => {
            return CliError::api(provider, code, "Anthropic is overloaded. Retrying...");
        }
        ("openai", 404) => {
            return CliError::api(provider, code, "Model not found or not available");
        }
        ("google", 400) if body.to_lowercase().contains("api key") => {
            return CliError::auth(provider, "Invalid Google API key");
        }
        _ => {}
    }

    match code {
        401 | 403 => CliError::auth(provider, body),
        429 => {
            // AGI Workforce managed-cloud paywall: 429 + {"kind":"paywall", ...}
            // Takes precedence over generic rate-limit handling.
            if let Some(pw) = parse_paywall_body(body) {
                return pw;
            }
            let secs = retry_after
                .and_then(|v| v.to_str().ok())
                .and_then(|s| s.parse::<u64>().ok());
            CliError::rate_limited(provider, secs)
        }
        _ => CliError::api(provider, code, body),
    }
}

/// Attempt to parse a paywall JSON body returned by the AGI Workforce managed-cloud
/// API (`/api/llm/v1/chat/completions`) when a user exceeds 150 % of their tier quota.
///
/// Expected shape: `{"kind":"paywall","feature":"chat","requiredTier":"hobby","reason":"..."}`
///
/// Returns `Some(CliError::Paywall {...})` when the body matches, `None` otherwise so
/// callers can fall back to the regular rate-limit error.
pub fn parse_paywall_body(body: &str) -> Option<CliError> {
    let v: serde_json::Value = serde_json::from_str(body).ok()?;
    if v.get("kind").and_then(|k| k.as_str()) != Some("paywall") {
        return None;
    }
    let feature = v
        .get("feature")
        .and_then(|f| f.as_str())
        .unwrap_or("chat")
        .to_string();
    let required_tier = v
        .get("requiredTier")
        .and_then(|t| t.as_str())
        .unwrap_or("hobby")
        .to_string();
    let reason = v
        .get("reason")
        .and_then(|r| r.as_str())
        .unwrap_or("Monthly token quota exceeded")
        .to_string();
    Some(CliError::paywall(feature, required_tier, reason))
}

// ---------------------------------------------------------------------------
// Anthropic Messages API (streaming)
// ---------------------------------------------------------------------------

#[allow(clippy::too_many_arguments)]
async fn stream_anthropic(
    client: &Client,
    api_key: &str,
    model: &str,
    messages: &[Message],
    max_tokens: u32,
    temperature: Option<f32>,
    tools: Option<&[ToolDefinition]>,
    on_chunk: &mut StreamCallback,
) -> Result<CompletionResult> {
    let api_messages: Vec<Value> = messages
        .iter()
        .filter(|m| m.role != "system")
        .map(convert_message_to_anthropic)
        .collect();

    let system_text = messages
        .iter()
        .find(|m| m.role == "system")
        .map(|m| m.text_content())
        .unwrap_or_default();

    // Build a system prompt with a cache breakpoint just before the volatile
    // <environment> block (see agent.rs::build_system_prompt — the env block
    // is always last). When the prefix is non-empty we send the system field
    // as an array of two text blocks; cache_control on the first block makes
    // everything above the env block cacheable. This typically halves the
    // billed input tokens on the second-and-later turn of a session.
    //
    // The split is robust: if the marker isn't present (e.g. sysprompt was
    // overridden via --system-prompt with no env block), we fall back to a
    // single cached block. If the system text is empty, omit the system
    // field entirely.
    let system_value: Option<Value> = if system_text.is_empty() {
        None
    } else if let Some(env_pos) = system_text.rfind("<environment>") {
        let (head, tail) = system_text.split_at(env_pos);
        let head_trimmed = head.trim_end();
        if head_trimmed.is_empty() {
            // No stable prefix — single non-cached block.
            Some(serde_json::json!(system_text))
        } else {
            Some(serde_json::json!([
                {
                    "type": "text",
                    "text": head_trimmed,
                    "cache_control": {"type": "ephemeral"}
                },
                {"type": "text", "text": tail}
            ]))
        }
    } else {
        // No env marker — cache the whole system prompt (rare path: custom
        // prompt with no environment injection).
        Some(serde_json::json!([
            {
                "type": "text",
                "text": system_text,
                "cache_control": {"type": "ephemeral"}
            }
        ]))
    };

    let mut body = serde_json::json!({
        "model": model,
        "max_tokens": max_tokens,
        "stream": true,
        "messages": api_messages,
    });
    if let Some(sys) = system_value {
        body["system"] = sys;
    }

    if let Some(temp) = temperature {
        body["temperature"] = serde_json::json!(temp);
    }

    if let Some(tool_defs) = tools {
        // Mark the last tool with cache_control so the entire tools array is
        // cacheable. Tools rarely change mid-session, so this is pure win.
        let last_idx = tool_defs.len().saturating_sub(1);
        let tools_json: Vec<Value> = tool_defs
            .iter()
            .enumerate()
            .map(|(i, t)| {
                let mut entry = serde_json::json!({
                    "name": t.name,
                    "description": t.description,
                    "input_schema": t.input_schema,
                });
                if i == last_idx && !tool_defs.is_empty() {
                    entry["cache_control"] = serde_json::json!({"type": "ephemeral"});
                }
                entry
            })
            .collect();
        body["tools"] = serde_json::json!(tools_json);
    }

    let url = "https://api.anthropic.com/v1/messages";
    let resp = client
        .post(url)
        .header("x-api-key", api_key)
        .header("anthropic-version", "2023-06-01")
        .header("content-type", "application/json")
        .json(&body)
        .send()
        .await
        .map_err(|e| CliError::network(url, e.to_string()))?;

    if !resp.status().is_success() {
        let status = resp.status();
        let retry_after = resp.headers().get(reqwest::header::RETRY_AFTER).cloned();
        let text = resp.text().await.unwrap_or_default();
        if looks_like_context_overflow(&text) {
            return Err(CliError::context_overflow(model, 0, 0).into());
        }
        return Err(classify_http_error("anthropic", status, retry_after.as_ref(), &text).into());
    }

    let mut full_text = String::new();
    let mut input_tokens: u32 = 0;
    let mut output_tokens: u32 = 0;
    let mut cache_read_input_tokens: u32 = 0;
    let mut cache_creation_input_tokens: u32 = 0;
    let mut stream = resp.bytes_stream();
    let mut buffer = String::new();

    // Tool call tracking
    let mut tool_calls: Vec<ToolCallResponse> = Vec::new();
    let mut current_tool_id = String::new();
    let mut current_tool_name = String::new();
    let mut current_tool_input = String::new();
    let mut stop_reason: Option<String> = None;

    loop {
        let chunk = tokio::time::timeout(STREAM_IDLE_TIMEOUT, stream.next()).await;
        let chunk = match chunk {
            Err(_) => bail!("Streaming timed out: no data received for 5 minutes"),
            Ok(None) => break,
            Ok(Some(result)) => result,
        };
        let bytes = chunk.context("Error reading stream")?;
        buffer.push_str(&String::from_utf8_lossy(&bytes));

        // Process complete SSE lines
        while let Some(line_end) = buffer.find('\n') {
            let line = buffer[..line_end].trim_end().to_string();
            buffer = buffer[line_end + 1..].to_string();

            if let Some(data) = line.strip_prefix("data: ") {
                if data == "[DONE]" {
                    continue;
                }
                if let Ok(event) = serde_json::from_str::<Value>(data) {
                    let event_type = event.get("type").and_then(|t| t.as_str()).unwrap_or("");

                    match event_type {
                        "content_block_start" => {
                            // Check if this is a tool_use block
                            if let Some(cb) = event.get("content_block") {
                                if cb.get("type").and_then(|t| t.as_str()) == Some("tool_use") {
                                    current_tool_id = cb
                                        .get("id")
                                        .and_then(|i| i.as_str())
                                        .unwrap_or("")
                                        .to_string();
                                    current_tool_name = cb
                                        .get("name")
                                        .and_then(|n| n.as_str())
                                        .unwrap_or("")
                                        .to_string();
                                    current_tool_input.clear();
                                }
                            }
                        }
                        "content_block_delta" => {
                            if let Some(delta) = event.get("delta") {
                                let delta_type =
                                    delta.get("type").and_then(|t| t.as_str()).unwrap_or("");
                                match delta_type {
                                    "text_delta" => {
                                        if let Some(text) =
                                            delta.get("text").and_then(|t| t.as_str())
                                        {
                                            full_text.push_str(text);
                                            on_chunk(text);
                                        }
                                    }
                                    "input_json_delta" => {
                                        if let Some(json_chunk) =
                                            delta.get("partial_json").and_then(|p| p.as_str())
                                        {
                                            current_tool_input.push_str(json_chunk);
                                        }
                                    }
                                    _ => {}
                                }
                            }
                        }
                        "content_block_stop" => {
                            // If we were accumulating a tool call, finalize it
                            if !current_tool_name.is_empty() {
                                let arguments = serde_json::from_str(&current_tool_input)
                                    .unwrap_or(serde_json::Value::Object(serde_json::Map::new()));
                                tool_calls.push(ToolCallResponse {
                                    id: current_tool_id.clone(),
                                    name: current_tool_name.clone(),
                                    arguments,
                                });
                                current_tool_id.clear();
                                current_tool_name.clear();
                                current_tool_input.clear();
                            }
                        }
                        "message_start" => {
                            if let Some(usage) = event.get("message").and_then(|m| m.get("usage")) {
                                input_tokens = usage
                                    .get("input_tokens")
                                    .and_then(|v| v.as_u64())
                                    .unwrap_or(0)
                                    as u32;
                                // Anthropic returns cache stats inline with the
                                // initial usage object on message_start. Capture
                                // them here so callers see cache hits even when
                                // the rest of the message is streamed slowly.
                                cache_read_input_tokens = usage
                                    .get("cache_read_input_tokens")
                                    .and_then(|v| v.as_u64())
                                    .unwrap_or(0)
                                    as u32;
                                cache_creation_input_tokens = usage
                                    .get("cache_creation_input_tokens")
                                    .and_then(|v| v.as_u64())
                                    .unwrap_or(0)
                                    as u32;
                            }
                        }
                        "message_delta" => {
                            if let Some(delta) = event.get("delta") {
                                if let Some(reason) =
                                    delta.get("stop_reason").and_then(|r| r.as_str())
                                {
                                    stop_reason = Some(reason.to_string());
                                }
                            }
                            if let Some(usage) = event.get("usage") {
                                output_tokens = usage
                                    .get("output_tokens")
                                    .and_then(|v| v.as_u64())
                                    .unwrap_or(0)
                                    as u32;
                                // Some Anthropic responses populate cache stats
                                // on message_delta instead of (or in addition
                                // to) message_start. Prefer the larger value so
                                // we don't lose accuracy if both fire.
                                let delta_cache_read = usage
                                    .get("cache_read_input_tokens")
                                    .and_then(|v| v.as_u64())
                                    .unwrap_or(0)
                                    as u32;
                                if delta_cache_read > cache_read_input_tokens {
                                    cache_read_input_tokens = delta_cache_read;
                                }
                                let delta_cache_creation = usage
                                    .get("cache_creation_input_tokens")
                                    .and_then(|v| v.as_u64())
                                    .unwrap_or(0)
                                    as u32;
                                if delta_cache_creation > cache_creation_input_tokens {
                                    cache_creation_input_tokens = delta_cache_creation;
                                }
                            }
                        }
                        _ => {}
                    }
                }
            }
        }
    }

    Ok(CompletionResult {
        text: full_text,
        tool_calls,
        input_tokens,
        output_tokens,
        cache_read_input_tokens,
        cache_creation_input_tokens,
        via_subscription: false,
        stop_reason,
    })
}

/// Convert an internal Message to Anthropic API JSON format.
fn convert_message_to_anthropic(m: &Message) -> Value {
    match &m.content {
        MessageContent::Text(t) => serde_json::json!({
            "role": m.role,
            "content": t,
        }),
        MessageContent::Blocks(blocks) => {
            let content: Vec<Value> = blocks
                .iter()
                .map(|b| match b {
                    ContentBlock::Text { text } => serde_json::json!({
                        "type": "text", "text": text
                    }),
                    ContentBlock::ToolUse { id, name, input } => serde_json::json!({
                        "type": "tool_use", "id": id, "name": name, "input": input
                    }),
                    ContentBlock::ToolResult {
                        tool_use_id,
                        content,
                        is_error,
                    } => serde_json::json!({
                        "type": "tool_result", "tool_use_id": tool_use_id,
                        "content": content, "is_error": is_error
                    }),
                })
                .collect();
            serde_json::json!({ "role": m.role, "content": content })
        }
    }
}

// ---------------------------------------------------------------------------
// OpenAI-compatible Chat Completions API (streaming)
// Used by: OpenAI, Mistral, xAI, DeepSeek
// ---------------------------------------------------------------------------

#[allow(clippy::too_many_arguments)]
async fn stream_openai_compatible(
    client: &Client,
    api_key: &str,
    base_url: &str,
    model: &str,
    messages: &[Message],
    max_tokens: u32,
    temperature: Option<f32>,
    tools: Option<&[ToolDefinition]>,
    on_chunk: &mut StreamCallback,
) -> Result<CompletionResult> {
    let api_messages: Vec<Value> = messages
        .iter()
        .flat_map(convert_message_to_openai)
        .collect();

    let mut body = serde_json::json!({
        "model": model,
        "max_tokens": max_tokens,
        "stream": true,
        "stream_options": { "include_usage": true },
        "messages": api_messages,
    });

    if let Some(temp) = temperature {
        body["temperature"] = serde_json::json!(temp);
    }

    if let Some(tool_defs) = tools {
        let tools_json: Vec<Value> = tool_defs
            .iter()
            .map(|t| {
                serde_json::json!({
                    "type": "function",
                    "function": {
                        "name": t.name,
                        "description": t.description,
                        "parameters": t.input_schema,
                    }
                })
            })
            .collect();
        body["tools"] = serde_json::json!(tools_json);
    }

    let resp = client
        .post(base_url)
        .header("Authorization", format!("Bearer {}", api_key))
        .header("content-type", "application/json")
        .json(&body)
        .send()
        .await
        .map_err(|e| CliError::network(base_url, e.to_string()))?;

    if !resp.status().is_success() {
        let status = resp.status();
        let retry_after = resp.headers().get(reqwest::header::RETRY_AFTER).cloned();
        let text = resp.text().await.unwrap_or_default();
        let provider = provider_name_from_url(base_url);
        if looks_like_context_overflow(&text) {
            return Err(CliError::context_overflow(model, 0, 0).into());
        }
        return Err(classify_http_error(provider, status, retry_after.as_ref(), &text).into());
    }

    parse_openai_sse_stream(resp, on_chunk).await
}

// ---------------------------------------------------------------------------
// Google Gemini API (streaming)
// ---------------------------------------------------------------------------

#[allow(clippy::too_many_arguments)]
async fn stream_google(
    client: &Client,
    api_key: &str,
    model: &str,
    messages: &[Message],
    max_tokens: u32,
    temperature: Option<f32>,
    tools: Option<&[ToolDefinition]>,
    on_chunk: &mut StreamCallback,
) -> Result<CompletionResult> {
    // Gemini uses a different message format: contents with parts
    let contents: Vec<Value> = messages
        .iter()
        .filter(|m| m.role != "system")
        .map(convert_message_to_gemini)
        .collect();

    let system_instruction = messages.iter().find(|m| m.role == "system").map(|m| {
        serde_json::json!({
            "parts": [{ "text": m.text_content() }]
        })
    });

    let mut body = serde_json::json!({
        "contents": contents,
        "generationConfig": {
            "maxOutputTokens": max_tokens,
        },
    });

    if let Some(temp) = temperature {
        body["generationConfig"]["temperature"] = serde_json::json!(temp);
    }

    if let Some(si) = system_instruction {
        body["systemInstruction"] = si;
    }

    if let Some(tool_defs) = tools {
        let declarations: Vec<Value> = tool_defs
            .iter()
            .map(|t| {
                serde_json::json!({
                    "name": t.name,
                    "description": t.description,
                    "parameters": t.input_schema,
                })
            })
            .collect();
        body["tools"] = serde_json::json!([{ "functionDeclarations": declarations }]);
    }

    // Normalize model name: strip "models/" prefix if user included it
    let model_path = if model.starts_with("models/") {
        model.to_string()
    } else {
        format!("models/{}", model)
    };

    // CodeQL rust/cleartext-transmission (audit 2026-05-03): pass the
    // API key via `x-goog-api-key` header instead of the `?key=` query
    // parameter. URL query strings are routinely logged in proxy logs,
    // browser histories, and reverse-proxy access logs — putting the
    // key in the header keeps it out of those byways. The transmission
    // itself was already HTTPS-encrypted but the key would still
    // appear in upstream log middleware records.
    let url = format!(
        "https://generativelanguage.googleapis.com/v1beta/{}:streamGenerateContent?alt=sse",
        model_path
    );

    let resp = client
        .post(&url)
        .header("content-type", "application/json")
        .header("x-goog-api-key", api_key)
        .json(&body)
        .send()
        .await
        .map_err(|e| CliError::network(&url, e.to_string()))?;

    if !resp.status().is_success() {
        let status = resp.status();
        let retry_after = resp.headers().get(reqwest::header::RETRY_AFTER).cloned();
        let text = resp.text().await.unwrap_or_default();
        if looks_like_context_overflow(&text) {
            return Err(CliError::context_overflow(model, 0, 0).into());
        }
        return Err(classify_http_error("google", status, retry_after.as_ref(), &text).into());
    }

    let mut full_text = String::new();
    let mut input_tokens: u32 = 0;
    let mut output_tokens: u32 = 0;
    let mut tool_calls: Vec<ToolCallResponse> = Vec::new();
    let mut stop_reason: Option<String> = None;
    let mut stream = resp.bytes_stream();
    let mut buffer = String::new();

    loop {
        let chunk = tokio::time::timeout(STREAM_IDLE_TIMEOUT, stream.next()).await;
        let chunk = match chunk {
            Err(_) => bail!("Streaming timed out: no data received for 5 minutes"),
            Ok(None) => break,
            Ok(Some(result)) => result,
        };
        let bytes = chunk.context("Error reading stream")?;
        buffer.push_str(&String::from_utf8_lossy(&bytes));

        while let Some(line_end) = buffer.find('\n') {
            let line = buffer[..line_end].trim_end().to_string();
            buffer = buffer[line_end + 1..].to_string();

            if let Some(data) = line.strip_prefix("data: ") {
                if let Ok(event) = serde_json::from_str::<Value>(data) {
                    // Extract text and tool calls from candidates[0].content.parts
                    if let Some(candidates) = event.get("candidates").and_then(|c| c.as_array()) {
                        if let Some(candidate) = candidates.first() {
                            // Check finish reason
                            if let Some(reason) =
                                candidate.get("finishReason").and_then(|r| r.as_str())
                            {
                                stop_reason = Some(reason.to_string());
                            }

                            if let Some(parts) = candidate
                                .get("content")
                                .and_then(|c| c.get("parts"))
                                .and_then(|p| p.as_array())
                            {
                                for part in parts {
                                    // Text content
                                    if let Some(text) = part.get("text").and_then(|t| t.as_str()) {
                                        full_text.push_str(text);
                                        on_chunk(text);
                                    }
                                    // Function call
                                    if let Some(fc) = part.get("functionCall") {
                                        let name = fc
                                            .get("name")
                                            .and_then(|n| n.as_str())
                                            .unwrap_or_default()
                                            .to_string();
                                        let args = fc.get("args").cloned().unwrap_or(
                                            serde_json::Value::Object(serde_json::Map::new()),
                                        );
                                        let id = format!("gemini_{}", tool_calls.len());
                                        tool_calls.push(ToolCallResponse {
                                            id,
                                            name,
                                            arguments: args,
                                        });
                                    }
                                }
                            }
                        }
                    }
                    // Token usage from usageMetadata
                    if let Some(usage) = event.get("usageMetadata") {
                        input_tokens = usage
                            .get("promptTokenCount")
                            .and_then(|v| v.as_u64())
                            .unwrap_or(0) as u32;
                        output_tokens = usage
                            .get("candidatesTokenCount")
                            .and_then(|v| v.as_u64())
                            .unwrap_or(0) as u32;
                    }
                }
            }
        }
    }

    Ok(CompletionResult {
        text: full_text,
        tool_calls,
        input_tokens,
        output_tokens,
        cache_read_input_tokens: 0,
        cache_creation_input_tokens: 0,
        via_subscription: false,
        stop_reason,
    })
}

/// Convert an internal Message to Gemini API JSON format.
fn convert_message_to_gemini(m: &Message) -> Value {
    let role = if m.role == "assistant" {
        "model"
    } else {
        "user"
    };
    match &m.content {
        MessageContent::Text(t) => serde_json::json!({
            "role": role,
            "parts": [{ "text": t }],
        }),
        MessageContent::Blocks(blocks) => {
            let parts: Vec<Value> = blocks
                .iter()
                .map(|b| match b {
                    ContentBlock::Text { text } => serde_json::json!({ "text": text }),
                    ContentBlock::ToolUse { name, input, .. } => {
                        serde_json::json!({
                            "functionCall": { "name": name, "args": input }
                        })
                    }
                    ContentBlock::ToolResult { content, .. } => {
                        // Gemini uses functionResponse — we need the function name,
                        // but ToolResult only has tool_use_id. Use a generic name.
                        serde_json::json!({
                            "functionResponse": {
                                "name": "tool",
                                "response": { "result": content }
                            }
                        })
                    }
                })
                .collect();
            serde_json::json!({ "role": role, "parts": parts })
        }
    }
}

// ---------------------------------------------------------------------------
// Ollama API (streaming)
// ---------------------------------------------------------------------------

#[allow(clippy::too_many_arguments)]
async fn stream_ollama(
    client: &Client,
    base_url: &str,
    model: &str,
    messages: &[Message],
    _max_tokens: u32,
    temperature: Option<f32>,
    tools: Option<&[ToolDefinition]>,
    on_chunk: &mut StreamCallback,
) -> Result<CompletionResult> {
    let api_messages: Vec<Value> = messages
        .iter()
        .flat_map(convert_message_to_openai)
        .collect();

    let mut body = serde_json::json!({
        "model": model,
        "messages": api_messages,
        "stream": true,
    });

    if let Some(temp) = temperature {
        body["options"] = serde_json::json!({ "temperature": temp });
    }

    // Ollama supports OpenAI-format tool definitions
    if let Some(tool_defs) = tools {
        let tools_json: Vec<Value> = tool_defs
            .iter()
            .map(|t| {
                serde_json::json!({
                    "type": "function",
                    "function": {
                        "name": t.name,
                        "description": t.description,
                        "parameters": t.input_schema,
                    }
                })
            })
            .collect();
        body["tools"] = serde_json::json!(tools_json);
    }

    let url = format!("{}/api/chat", base_url.trim_end_matches('/'));

    let resp = client
        .post(&url)
        .header("content-type", "application/json")
        .json(&body)
        .send()
        .await
        .map_err(|e| {
            let msg = e.to_string();
            if msg.contains("Connection refused") || msg.contains("connection refused") {
                CliError::network(
                    &url,
                    "Ollama server not running. Start it with: ollama serve",
                )
            } else {
                CliError::network(&url, msg)
            }
        })?;

    if !resp.status().is_success() {
        let status = resp.status();
        let retry_after = resp.headers().get(reqwest::header::RETRY_AFTER).cloned();
        let text = resp.text().await.unwrap_or_default();
        if looks_like_context_overflow(&text) {
            return Err(CliError::context_overflow(model, 0, 0).into());
        }
        return Err(classify_http_error("ollama", status, retry_after.as_ref(), &text).into());
    }

    let mut full_text = String::new();
    let mut input_tokens: u32 = 0;
    let mut output_tokens: u32 = 0;
    let mut tool_calls: Vec<ToolCallResponse> = Vec::new();
    let mut stop_reason: Option<String> = None;
    let mut stream = resp.bytes_stream();
    let mut buffer = String::new();

    loop {
        let chunk = tokio::time::timeout(STREAM_IDLE_TIMEOUT, stream.next()).await;
        let chunk = match chunk {
            Err(_) => bail!("Streaming timed out: no data received for 5 minutes"),
            Ok(None) => break,
            Ok(Some(result)) => result,
        };
        let bytes = chunk.context("Error reading stream")?;
        buffer.push_str(&String::from_utf8_lossy(&bytes));

        // Ollama sends newline-delimited JSON (not SSE)
        while let Some(line_end) = buffer.find('\n') {
            let line = buffer[..line_end].trim_end().to_string();
            buffer = buffer[line_end + 1..].to_string();

            if line.is_empty() {
                continue;
            }

            if let Ok(event) = serde_json::from_str::<Value>(&line) {
                // Streaming content
                if let Some(text) = event
                    .get("message")
                    .and_then(|m| m.get("content"))
                    .and_then(|c| c.as_str())
                {
                    if !text.is_empty() {
                        full_text.push_str(text);
                        on_chunk(text);
                    }
                }

                // Tool calls from Ollama (in the message.tool_calls field)
                if let Some(tc_array) = event
                    .get("message")
                    .and_then(|m| m.get("tool_calls"))
                    .and_then(|t| t.as_array())
                {
                    for tc in tc_array {
                        if let Some(func) = tc.get("function") {
                            let name = func
                                .get("name")
                                .and_then(|n| n.as_str())
                                .unwrap_or_default()
                                .to_string();
                            let args = func
                                .get("arguments")
                                .and_then(|a| {
                                    if a.is_string() {
                                        serde_json::from_str(a.as_str().unwrap_or("{}")).ok()
                                    } else {
                                        Some(a.clone())
                                    }
                                })
                                .unwrap_or(serde_json::Value::Object(serde_json::Map::new()));
                            let id = format!("ollama_{}", tool_calls.len());
                            tool_calls.push(ToolCallResponse {
                                id,
                                name,
                                arguments: args,
                            });
                        }
                    }
                    stop_reason = Some("tool_calls".to_string());
                }

                // Final message includes done=true and token counts
                if event.get("done").and_then(|d| d.as_bool()) == Some(true) {
                    input_tokens = event
                        .get("prompt_eval_count")
                        .and_then(|v| v.as_u64())
                        .unwrap_or(0) as u32;
                    output_tokens = event
                        .get("eval_count")
                        .and_then(|v| v.as_u64())
                        .unwrap_or(0) as u32;
                    if stop_reason.is_none() {
                        stop_reason = Some("stop".to_string());
                    }
                }
            }
        }
    }

    Ok(CompletionResult {
        text: full_text,
        tool_calls,
        input_tokens,
        output_tokens,
        cache_read_input_tokens: 0,
        cache_creation_input_tokens: 0,
        via_subscription: false,
        stop_reason,
    })
}

// ---------------------------------------------------------------------------
// GitHub Copilot subscription API (streaming)
// ---------------------------------------------------------------------------

#[allow(clippy::too_many_arguments)]
async fn stream_copilot_api(
    client: &Client,
    token: &str,
    url: &str,
    model: &str,
    messages: &[Message],
    max_tokens: u32,
    temperature: Option<f32>,
    tools: Option<&[ToolDefinition]>,
    on_chunk: &mut StreamCallback,
) -> Result<CompletionResult> {
    let api_messages: Vec<Value> = messages
        .iter()
        .flat_map(convert_message_to_openai)
        .collect();

    let mut body = serde_json::json!({
        "model": model,
        "max_tokens": max_tokens,
        "stream": true,
        "stream_options": { "include_usage": true },
        "messages": api_messages,
    });

    if let Some(temp) = temperature {
        body["temperature"] = serde_json::json!(temp);
    }

    if let Some(tool_defs) = tools {
        let tools_json: Vec<Value> = tool_defs
            .iter()
            .map(|t| {
                serde_json::json!({
                    "type": "function",
                    "function": {
                        "name": t.name,
                        "description": t.description,
                        "parameters": t.input_schema,
                    }
                })
            })
            .collect();
        body["tools"] = serde_json::json!(tools_json);
    }

    let resp = client
        .post(url)
        .header("Authorization", format!("Bearer {}", token))
        .header("content-type", "application/json")
        .header(
            "User-Agent",
            concat!("agiworkforce-cli/", env!("CARGO_PKG_VERSION")),
        )
        .header("Openai-Intent", "conversation-edits")
        .header("Copilot-Vision-Request", "true")
        .json(&body)
        .send()
        .await
        .map_err(|e| CliError::network(url, e.to_string()))?;

    if !resp.status().is_success() {
        let status = resp.status();
        let retry_after = resp.headers().get(reqwest::header::RETRY_AFTER).cloned();
        let text = resp.text().await.unwrap_or_default();
        if looks_like_context_overflow(&text) {
            return Err(CliError::context_overflow(model, 0, 0).into());
        }
        return Err(classify_http_error("copilot", status, retry_after.as_ref(), &text).into());
    }

    parse_openai_sse_stream(resp, on_chunk).await
}

// ---------------------------------------------------------------------------
// ChatGPT Plus / Codex subscription API (streaming)
// ---------------------------------------------------------------------------

#[allow(clippy::too_many_arguments)]
async fn stream_chatgpt_codex(
    client: &Client,
    token: &str,
    url: &str,
    model: &str,
    messages: &[Message],
    max_tokens: u32,
    temperature: Option<f32>,
    tools: Option<&[ToolDefinition]>,
    on_chunk: &mut StreamCallback,
    account_id: Option<&str>,
) -> Result<CompletionResult> {
    let api_messages: Vec<Value> = messages
        .iter()
        .flat_map(convert_message_to_openai)
        .collect();

    let mut body = serde_json::json!({
        "model": model,
        "max_tokens": max_tokens,
        "stream": true,
        "stream_options": { "include_usage": true },
        "messages": api_messages,
    });

    if let Some(temp) = temperature {
        body["temperature"] = serde_json::json!(temp);
    }

    if let Some(tool_defs) = tools {
        let tools_json: Vec<Value> = tool_defs
            .iter()
            .map(|t| {
                serde_json::json!({
                    "type": "function",
                    "function": {
                        "name": t.name,
                        "description": t.description,
                        "parameters": t.input_schema,
                    }
                })
            })
            .collect();
        body["tools"] = serde_json::json!(tools_json);
    }

    let mut req = client
        .post(url)
        .header("Authorization", format!("Bearer {}", token))
        .header("content-type", "application/json")
        .header("originator", "agiworkforce");

    if let Some(aid) = account_id {
        req = req.header("ChatGPT-Account-Id", aid);
    }

    let resp = req
        .json(&body)
        .send()
        .await
        .map_err(|e| CliError::network(url, e.to_string()))?;

    if !resp.status().is_success() {
        let status = resp.status();
        let retry_after = resp.headers().get(reqwest::header::RETRY_AFTER).cloned();
        let text = resp.text().await.unwrap_or_default();
        if looks_like_context_overflow(&text) {
            return Err(CliError::context_overflow(model, 0, 0).into());
        }
        return Err(classify_http_error("chatgpt", status, retry_after.as_ref(), &text).into());
    }

    parse_openai_sse_stream(resp, on_chunk).await
}

// ---------------------------------------------------------------------------
// Shared SSE parser for OpenAI-compatible streaming responses
// ---------------------------------------------------------------------------

/// Parse an OpenAI-compatible SSE stream into a CompletionResult.
/// Used by `stream_openai_compatible`, `stream_copilot_api`, and
/// `stream_chatgpt_codex` to avoid duplicating the SSE parsing logic.
async fn parse_openai_sse_stream(
    resp: reqwest::Response,
    on_chunk: &mut StreamCallback,
) -> Result<CompletionResult> {
    let mut full_text = String::new();
    let mut input_tokens: u32 = 0;
    let mut output_tokens: u32 = 0;
    let mut stream = resp.bytes_stream();
    let mut buffer = String::new();

    // Tool call tracking
    let mut tool_call_buffers: HashMap<usize, (String, String, String)> = HashMap::new();
    let mut stop_reason: Option<String> = None;

    loop {
        let chunk = tokio::time::timeout(STREAM_IDLE_TIMEOUT, stream.next()).await;
        let chunk = match chunk {
            Err(_) => bail!("Streaming timed out: no data received for 5 minutes"),
            Ok(None) => break,
            Ok(Some(result)) => result,
        };
        let bytes = chunk.context("Error reading stream")?;
        buffer.push_str(&String::from_utf8_lossy(&bytes));

        while let Some(line_end) = buffer.find('\n') {
            let line = buffer[..line_end].trim_end().to_string();
            buffer = buffer[line_end + 1..].to_string();

            if let Some(data) = line.strip_prefix("data: ") {
                if data == "[DONE]" {
                    continue;
                }
                if let Ok(event) = serde_json::from_str::<Value>(data) {
                    if let Some(choices) = event.get("choices").and_then(|c| c.as_array()) {
                        if let Some(choice) = choices.first() {
                            // Text content delta
                            if let Some(text) = choice
                                .get("delta")
                                .and_then(|d| d.get("content"))
                                .and_then(|c| c.as_str())
                            {
                                full_text.push_str(text);
                                on_chunk(text);
                            }

                            // Tool call deltas
                            if let Some(tc_array) = choice
                                .get("delta")
                                .and_then(|d| d.get("tool_calls"))
                                .and_then(|t| t.as_array())
                            {
                                for tc in tc_array {
                                    let index =
                                        tc.get("index").and_then(|i| i.as_u64()).unwrap_or(0)
                                            as usize;
                                    let entry =
                                        tool_call_buffers.entry(index).or_insert_with(|| {
                                            (String::new(), String::new(), String::new())
                                        });

                                    if let Some(id) = tc.get("id").and_then(|i| i.as_str()) {
                                        entry.0 = id.to_string();
                                    }
                                    if let Some(func) = tc.get("function") {
                                        if let Some(name) =
                                            func.get("name").and_then(|n| n.as_str())
                                        {
                                            entry.1 = name.to_string();
                                        }
                                        if let Some(args) =
                                            func.get("arguments").and_then(|a| a.as_str())
                                        {
                                            entry.2.push_str(args);
                                        }
                                    }
                                }
                            }

                            // Finish reason
                            if let Some(reason) =
                                choice.get("finish_reason").and_then(|r| r.as_str())
                            {
                                if !reason.is_empty() && reason != "null" {
                                    stop_reason = Some(reason.to_string());
                                }
                            }
                        }
                    }
                    if let Some(usage) = event.get("usage") {
                        input_tokens = usage
                            .get("prompt_tokens")
                            .and_then(|v| v.as_u64())
                            .unwrap_or(0) as u32;
                        output_tokens = usage
                            .get("completion_tokens")
                            .and_then(|v| v.as_u64())
                            .unwrap_or(0) as u32;
                    }
                }
            }
        }
    }

    // Convert tool call buffers to ToolCallResponse
    let mut tool_calls: Vec<ToolCallResponse> = Vec::new();
    let mut sorted_indices: Vec<usize> = tool_call_buffers.keys().copied().collect();
    sorted_indices.sort();
    for idx in sorted_indices {
        if let Some((id, name, args_json)) = tool_call_buffers.remove(&idx) {
            if !name.is_empty() {
                let arguments = serde_json::from_str(&args_json)
                    .unwrap_or(serde_json::Value::Object(serde_json::Map::new()));
                tool_calls.push(ToolCallResponse {
                    id,
                    name,
                    arguments,
                });
            }
        }
    }

    Ok(CompletionResult {
        text: full_text,
        tool_calls,
        input_tokens,
        output_tokens,
        cache_read_input_tokens: 0,
        cache_creation_input_tokens: 0,
        via_subscription: false,
        stop_reason,
    })
}

/// Convert an internal Message to OpenAI-compatible API JSON format.
/// Returns a Vec because tool result messages expand into multiple API messages.
fn convert_message_to_openai(m: &Message) -> Vec<Value> {
    match &m.content {
        MessageContent::Text(t) => vec![serde_json::json!({
            "role": m.role,
            "content": t,
        })],
        MessageContent::Blocks(blocks) => {
            // Check if this is an assistant message with tool_use blocks
            if m.role == "assistant" {
                let mut text_parts = Vec::new();
                let mut tc_array = Vec::new();

                for block in blocks {
                    match block {
                        ContentBlock::Text { text } => {
                            text_parts.push(text.clone());
                        }
                        ContentBlock::ToolUse { id, name, input } => {
                            tc_array.push(serde_json::json!({
                                "id": id,
                                "type": "function",
                                "function": {
                                    "name": name,
                                    "arguments": input.to_string(),
                                }
                            }));
                        }
                        _ => {}
                    }
                }

                let combined_text = text_parts.join("");
                let mut msg = serde_json::json!({ "role": "assistant" });
                if !combined_text.is_empty() {
                    msg["content"] = serde_json::json!(combined_text);
                }
                if !tc_array.is_empty() {
                    msg["tool_calls"] = serde_json::json!(tc_array);
                }
                vec![msg]
            } else {
                // For user/tool messages — tool results become separate "tool" role messages
                let mut msgs = Vec::new();
                let mut text_parts = Vec::new();

                for block in blocks {
                    match block {
                        ContentBlock::ToolResult {
                            tool_use_id,
                            content,
                            ..
                        } => {
                            // Flush accumulated text first
                            if !text_parts.is_empty() {
                                msgs.push(serde_json::json!({
                                    "role": m.role,
                                    "content": text_parts.join(""),
                                }));
                                text_parts.clear();
                            }
                            msgs.push(serde_json::json!({
                                "role": "tool",
                                "tool_call_id": tool_use_id,
                                "content": content,
                            }));
                        }
                        ContentBlock::Text { text } => {
                            text_parts.push(text.clone());
                        }
                        _ => {}
                    }
                }

                // Flush remaining text
                if !text_parts.is_empty() {
                    msgs.push(serde_json::json!({
                        "role": m.role,
                        "content": text_parts.join(""),
                    }));
                }

                if msgs.is_empty() {
                    // Fallback: empty content
                    msgs.push(serde_json::json!({
                        "role": m.role,
                        "content": "",
                    }));
                }

                msgs
            }
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_provider_detection() {
        assert_eq!(detect_provider("claude-opus-4-6"), Provider::Anthropic);
        assert_eq!(
            detect_provider("claude-sonnet-4-20250514"),
            Provider::Anthropic
        );
        assert_eq!(provider_name(&detect_provider("gpt-5.5")), "openai");
        assert_eq!(provider_name(&detect_provider("gpt-5.4-turbo")), "openai");
        assert_eq!(provider_name(&detect_provider("o3-mini")), "openai");
        assert_eq!(detect_provider("gemini-3-flash-preview"), Provider::Google);
        assert_eq!(detect_provider("models/gemini-pro"), Provider::Google);
        assert_eq!(
            detect_provider("llama3.1:8b"),
            Provider::Ollama(OllamaMode::Local)
        );
        // Mistral / Codestral now route through OpenAICompatible (no native variant).
        assert_eq!(provider_name(&detect_provider("mistral-large")), "mistral");
        assert_eq!(
            provider_name(&detect_provider("codestral-latest")),
            "mistral"
        );
        assert_eq!(provider_name(&detect_provider("grok-4.1")), "xai");
        assert_eq!(provider_name(&detect_provider("grok-beta")), "xai");
        assert_eq!(provider_name(&detect_provider("deepseek-chat")), "deepseek");
        assert_eq!(
            provider_name(&detect_provider("deepseek-reasoner")),
            "deepseek"
        );
        assert_eq!(provider_name(&detect_provider("qwen2.5")), "qwen");
        assert_eq!(provider_name(&detect_provider("kimi-k2")), "moonshot");
        assert_eq!(provider_name(&detect_provider("glm-4.6")), "zhipu");
        assert_eq!(
            detect_provider("unknown-model"),
            Provider::Ollama(OllamaMode::Local)
        );
    }

    #[test]
    fn test_provider_from_name_canonical_names() {
        assert!(matches!(
            provider_from_name("anthropic"),
            Some(Provider::Anthropic)
        ));
        assert_eq!(provider_name(&provider_from_name("openai").unwrap()), "openai");
        assert_eq!(provider_name(&provider_from_name("xai").unwrap()), "xai");
        assert_eq!(
            provider_name(&provider_from_name("deepseek").unwrap()),
            "deepseek"
        );
        assert_eq!(
            provider_name(&provider_from_name("perplexity").unwrap()),
            "perplexity"
        );
        assert_eq!(
            provider_name(&provider_from_name("qwen").unwrap()),
            "qwen"
        );
        assert_eq!(
            provider_name(&provider_from_name("moonshot").unwrap()),
            "moonshot"
        );
        assert_eq!(
            provider_name(&provider_from_name("zhipu").unwrap()),
            "zhipu"
        );
        assert_eq!(
            provider_name(&provider_from_name("lmstudio").unwrap()),
            "lmstudio"
        );
        // Aliases
        assert_eq!(provider_name(&provider_from_name("grok").unwrap()), "xai");
        assert_eq!(provider_name(&provider_from_name("kimi").unwrap()), "moonshot");
        assert_eq!(provider_name(&provider_from_name("glm").unwrap()), "zhipu");
        assert_eq!(
            provider_name(&provider_from_name("dashscope").unwrap()),
            "qwen"
        );
        // Ollama modes
        assert!(matches!(
            provider_from_name("ollama"),
            Some(Provider::Ollama(OllamaMode::Local))
        ));
        assert!(matches!(
            provider_from_name("ollama-cloud"),
            Some(Provider::Ollama(OllamaMode::Cloud))
        ));
        // Unknown returns None (and no custom registered)
        assert!(provider_from_name("definitely-not-a-provider").is_none());
    }

    #[test]
    fn test_lmstudio_no_api_key_required() {
        let provider = lmstudio_provider();
        let Provider::OpenAICompatible {
            name, api_key_env, ..
        } = &provider
        else {
            panic!("Expected OpenAICompatible");
        };
        assert_eq!(*name, "lmstudio");
        assert!(api_key_env.is_none(), "LM Studio is keyless local");
    }

    #[test]
    fn mistral_provider_resolved_from_name() {
        assert_eq!(
            provider_name(&provider_from_name("mistral").unwrap()),
            "mistral"
        );
        assert_eq!(
            provider_name(&provider_from_name("mistral-ai").unwrap()),
            "mistral"
        );
        assert_eq!(
            provider_name(&provider_from_name("mistralai").unwrap()),
            "mistral"
        );
        // Verify MISTRAL_API_KEY is wired
        let p = provider_from_name("mistral").unwrap();
        let Provider::OpenAICompatible { api_key_env, .. } = &p else {
            panic!("Expected OpenAICompatible");
        };
        assert_eq!(*api_key_env, Some("MISTRAL_API_KEY"));
    }

    #[test]
    fn test_register_custom_providers_skips_reserved() {
        let mut config = CliConfig::default();
        // Try to register a "fake-anthropic" override and a real custom one
        config.providers.insert(
            "anthropic".to_string(),
            crate::config::ProviderConfig {
                api_key_env: Some("FAKE".to_string()),
                base_url: Some("https://attacker.test/v1".to_string()),
            },
        );
        config.providers.insert(
            "openrouter-test-uniq".to_string(),
            crate::config::ProviderConfig {
                api_key_env: Some("OPENROUTER_API_KEY".to_string()),
                base_url: Some("https://openrouter.ai/api/v1".to_string()),
            },
        );
        register_custom_providers(&config);
        // anthropic must still resolve to the native handler
        assert!(matches!(
            provider_from_name("anthropic"),
            Some(Provider::Anthropic)
        ));
        // openrouter shows up as custom
        let or = provider_from_name("openrouter-test-uniq").expect("custom registered");
        match or {
            Provider::Custom {
                name,
                base_url,
                api_key_env,
            } => {
                assert_eq!(name, "openrouter-test-uniq");
                assert!(base_url.ends_with("/chat/completions"));
                assert_eq!(api_key_env.as_deref(), Some("OPENROUTER_API_KEY"));
            }
            _ => panic!("Expected Provider::Custom"),
        }
    }

    // -- Context overflow detection --

    #[test]
    fn context_overflow_detects_exceed() {
        assert!(looks_like_context_overflow(
            "This request's context exceeds the model's maximum"
        ));
    }

    #[test]
    fn context_overflow_detects_too_long() {
        assert!(looks_like_context_overflow(
            "The context is too long for this model"
        ));
    }

    #[test]
    fn context_overflow_detects_overflow() {
        assert!(looks_like_context_overflow(
            "context overflow: token limit reached"
        ));
    }

    #[test]
    fn context_overflow_detects_maximum() {
        assert!(looks_like_context_overflow(
            "context length exceeds maximum allowed"
        ));
    }

    #[test]
    fn context_overflow_ignores_unrelated() {
        assert!(!looks_like_context_overflow("invalid api key"));
        assert!(!looks_like_context_overflow("rate limited"));
        assert!(!looks_like_context_overflow("exceeded quota")); // no "context"
    }

    // -- Provider-specific error messages --

    #[test]
    fn anthropic_529_overloaded() {
        let err = classify_http_error(
            "anthropic",
            reqwest::StatusCode::from_u16(529).unwrap(),
            None,
            "overloaded",
        );
        let msg = err.to_string();
        assert!(
            msg.contains("Anthropic is overloaded"),
            "Expected overloaded message, got: {}",
            msg
        );
    }

    #[test]
    fn openai_404_model_not_found() {
        let err = classify_http_error(
            "openai",
            reqwest::StatusCode::NOT_FOUND,
            None,
            "model does not exist",
        );
        let msg = err.to_string();
        assert!(
            msg.contains("Model not found or not available"),
            "Expected model-not-found message, got: {}",
            msg
        );
    }

    #[test]
    fn google_400_bad_api_key() {
        let err = classify_http_error(
            "google",
            reqwest::StatusCode::BAD_REQUEST,
            None,
            "API key not valid. Please pass a valid API key.",
        );
        let msg = err.to_string();
        assert!(
            msg.contains("Invalid Google API key"),
            "Expected api-key message, got: {}",
            msg
        );
    }

    #[test]
    fn google_400_without_api_key_text_is_generic() {
        let err = classify_http_error(
            "google",
            reqwest::StatusCode::BAD_REQUEST,
            None,
            "some other bad request",
        );
        let msg = err.to_string();
        // Should fall through to generic API error, not the api key message
        assert!(
            !msg.contains("Invalid Google API key"),
            "Should not show api-key message for unrelated 400: {}",
            msg
        );
    }

    // -- Streaming idle timeout --

    #[tokio::test]
    async fn stream_timeout_fires_on_stall() {
        // Simulate a stream that never produces data — timeout should fire quickly
        let short_timeout = Duration::from_millis(50);
        let stream = futures_util::stream::pending::<Result<bytes::Bytes, reqwest::Error>>();
        let mut stream = Box::pin(stream);

        let result = tokio::time::timeout(short_timeout, stream.next()).await;
        assert!(result.is_err(), "Expected timeout on stalled stream");
    }

    #[tokio::test]
    async fn stream_timeout_does_not_fire_on_data() {
        // A stream that yields immediately should not time out
        let short_timeout = Duration::from_millis(500);
        let data = bytes::Bytes::from("data: {}\n\n");
        let stream = futures_util::stream::once(async move { Ok::<_, reqwest::Error>(data) });
        let mut stream = Box::pin(stream);

        let result = tokio::time::timeout(short_timeout, stream.next()).await;
        assert!(result.is_ok(), "Should not timeout when data is available");
        assert!(result.unwrap().is_some());
    }

    #[tokio::test]
    async fn stream_timeout_detects_end_of_stream() {
        let short_timeout = Duration::from_millis(500);
        let stream = futures_util::stream::empty::<Result<bytes::Bytes, reqwest::Error>>();
        let mut stream = Box::pin(stream);

        let result = tokio::time::timeout(short_timeout, stream.next()).await;
        assert!(result.is_ok(), "End-of-stream should not be a timeout");
        assert!(result.unwrap().is_none(), "Stream ended, should be None");
    }

    // -- classify_http_error standard codes --

    #[test]
    fn classify_401_as_auth() {
        let err = classify_http_error(
            "openai",
            reqwest::StatusCode::UNAUTHORIZED,
            None,
            "invalid key",
        );
        assert!(
            err.to_string().contains("Authentication failed"),
            "401 should be auth error"
        );
    }

    #[test]
    fn classify_429_as_rate_limited() {
        let err = classify_http_error(
            "anthropic",
            reqwest::StatusCode::TOO_MANY_REQUESTS,
            None,
            "rate limited",
        );
        assert!(
            err.to_string().contains("Rate limited"),
            "429 should be rate-limited"
        );
    }

    #[test]
    fn classify_500_as_api_error() {
        let err = classify_http_error(
            "google",
            reqwest::StatusCode::INTERNAL_SERVER_ERROR,
            None,
            "internal error",
        );
        assert!(
            err.to_string().contains("API error"),
            "500 should be api error"
        );
    }

    // -- Paywall detection --

    #[test]
    fn parse_paywall_body_detects_paywall_json() {
        let body = r#"{"kind":"paywall","feature":"chat","requiredTier":"hobby","reason":"Monthly token quota exceeded (150%)"}"#;
        let result = parse_paywall_body(body);
        assert!(result.is_some(), "Should parse paywall body");
        let err = result.unwrap();
        assert!(
            err.is_paywall(),
            "Should return a Paywall error variant"
        );
        // Verify the formatted message contains required tier and upgrade URL
        let msg = err.to_string();
        assert!(
            msg.contains("hobby"),
            "Message should contain required tier: {msg}"
        );
        assert!(
            msg.contains("agiworkforce.com/pricing"),
            "Message should contain pricing URL: {msg}"
        );
        assert!(
            msg.contains("Monthly token quota exceeded"),
            "Message should contain reason: {msg}"
        );
    }

    #[test]
    fn parse_paywall_body_returns_none_for_non_paywall_429() {
        // Generic rate-limit body from Anthropic
        let body = r#"{"error":{"type":"rate_limit_error","message":"Rate limit exceeded"}}"#;
        let result = parse_paywall_body(body);
        assert!(result.is_none(), "Non-paywall 429 should not parse as paywall");
    }

    #[test]
    fn parse_paywall_body_returns_none_for_empty_body() {
        assert!(parse_paywall_body("").is_none());
        assert!(parse_paywall_body("null").is_none());
    }

    #[test]
    fn classify_http_error_returns_paywall_for_managed_cloud_429() {
        let paywall_body = r#"{"kind":"paywall","feature":"chat","requiredTier":"pro","reason":"Pro features require upgrade"}"#;
        let err = classify_http_error(
            "agiworkforce",
            reqwest::StatusCode::TOO_MANY_REQUESTS,
            None,
            paywall_body,
        );
        assert!(
            err.is_paywall(),
            "classify_http_error should return Paywall for 429 + paywall body"
        );
        assert_eq!(
            err.exit_code(),
            78,
            "Paywall errors should exit with code 78 (EX_CONFIG)"
        );
    }

    #[test]
    fn classify_http_error_returns_rate_limited_for_plain_429() {
        let plain_body = r#"{"error":"rate limited"}"#;
        let err = classify_http_error(
            "agiworkforce",
            reqwest::StatusCode::TOO_MANY_REQUESTS,
            None,
            plain_body,
        );
        // Plain 429 without kind:paywall should still be RateLimited
        assert!(
            !err.is_paywall(),
            "Plain 429 should NOT be Paywall, got: {:?}", err
        );
        assert!(
            err.to_string().contains("Rate limited"),
            "Plain 429 should be rate-limited: {}", err
        );
    }

    #[test]
    fn paywall_exit_code_is_78() {
        let err = crate::errors::CliError::paywall("chat", "hobby", "quota exceeded");
        assert_eq!(err.exit_code(), 78);
    }

    #[test]
    fn non_paywall_exit_code_is_1() {
        let err = crate::errors::CliError::rate_limited("anthropic", None);
        assert_eq!(err.exit_code(), 1);
    }
}
