use serde::{Deserialize, Serialize};

pub mod provider_dispatch;
pub mod serialization;
pub mod streaming;

pub use provider_dispatch::{
    detect_provider, provider_from_name, provider_name, register_custom_providers,
};
pub use streaming::{parse_paywall_body, stream_completion};

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
