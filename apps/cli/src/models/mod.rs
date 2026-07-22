pub mod openrouter_models;
pub mod provider_dispatch;
pub mod streaming;

pub use provider_dispatch::{
    detect_provider, provider_from_name, provider_name, register_custom_providers,
    resolve_exec_model, resolve_selected_provider, selection_provider_override,
    try_detect_provider,
};
pub use streaming::{parse_paywall_body, stream_completion};

// Chat wire types are shared with other surfaces through the extracted
// `agiworkforce-llm` crate (Wave 5c1). Re-exported here so every existing
// `crate::models::*` path keeps working unchanged.
pub use agiworkforce_llm::ToolCall as ToolCallResponse;
pub use agiworkforce_llm::{ContentBlock, Message, MessageContent, ToolDefinition};

/// Internal marker attached to tool-call arguments when a provider streams
/// malformed function-call JSON. The agent loop turns this into a tool error
/// before any executor sees the arguments. (Defined in `agiworkforce-llm`.)
pub(crate) use agiworkforce_llm::INVALID_TOOL_ARGS_MARKER;

/// Maximum time to wait between successive stream chunks before giving up.
pub(crate) const STREAM_IDLE_TIMEOUT: std::time::Duration = std::time::Duration::from_secs(300);

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
/// Zhipu, LM Studio, MiniMax, plus any user-defined `[providers.*]` block — flows
/// through the `OpenAICompatible` variant. The variant carries the canonical
/// base URL and the env var name for the API key (or `None` for unauthenticated
/// local endpoints like LM Studio).
///
/// This enum is the CLI's provider-selection surface (config names, login
/// flows, key env vars). The transport mechanics live in `agiworkforce-llm`;
/// `streaming::stream_completion` maps each variant onto a
/// `agiworkforce_llm::ProviderSpec` at the call boundary.
#[derive(Debug, Clone, PartialEq, Eq)]
#[allow(clippy::upper_case_acronyms)]
pub enum Provider {
    /// AGI Workforce managed-cloud gateway.
    ///
    /// This is a trust and billing boundary, not an upstream model vendor.
    /// The concrete catalog model still names OpenAI, Anthropic, Google, or
    /// another upstream route, while this variant guarantees the request is
    /// authenticated and sent only to the AGI-owned gateway.
    ManagedCloud,
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

/// MiniMax — OpenAI-compatible endpoint.
pub fn minimax_provider() -> Provider {
    Provider::OpenAICompatible {
        name: "minimax",
        base_url: "https://api.minimax.io/v1/chat/completions",
        api_key_env: Some("MINIMAX_API_KEY"),
    }
}

/// OpenRouter — OpenAI-compatible aggregator endpoint.
pub fn openrouter_provider() -> Provider {
    Provider::OpenAICompatible {
        name: "openrouter",
        base_url: "https://openrouter.ai/api/v1/chat/completions",
        api_key_env: Some("OPENROUTER_API_KEY"),
    }
}

/// NVIDIA NIM — OpenAI-compatible hosted endpoint.
pub fn nvidia_provider() -> Provider {
    Provider::OpenAICompatible {
        name: "nvidia",
        base_url: "https://integrate.api.nvidia.com/v1/chat/completions",
        api_key_env: Some("NVIDIA_API_KEY"),
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
    /// Tokens generated by the model's internal reasoning pass (extended-thinking
    /// / chain-of-thought). 0 for non-reasoning models or when the provider does
    /// not report this field.
    pub reasoning_output_tokens: u32,
}
