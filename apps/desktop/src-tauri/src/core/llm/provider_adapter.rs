//! Provider adapters for translating between AGI Workforce's unified format and provider-specific formats.
//!
//! This module provides adapters that handle the differences in request/response formats across
//! various LLM providers (OpenAI, Anthropic, Google, DeepSeek, etc.).

use super::{LLMRequest, LLMResponse, Provider, ToolCall};
use anyhow;
use serde::{Deserialize, Serialize};
use serde_json::Value;
use std::error::Error;

/// FIX-007 (Sprint 3): hard upper bound on `max_tokens` for any single
/// LLM request. Without this, an indirect prompt injection could request
/// `max_tokens: 1_000_000` and bleed the user's BYOK budget — there is
/// no per-request cap on the LLM provider side either. 16 384 covers
/// every legitimate code-mode response we ship today; UI flows that
/// genuinely need more still go through `clamp_max_tokens` and accept
/// the cap so the bound applies even when the request shape is exotic.
const PER_REQUEST_MAX_TOKENS_CEILING: u32 = 16_384;

/// Clamp `max_tokens` to [`PER_REQUEST_MAX_TOKENS_CEILING`] when the caller
/// supplied a value. None inputs stay None — the provider's own default
/// applies. Returns the (possibly clamped) value plus a `clamped` flag
/// for callers that want to log when the cap fired.
fn clamp_max_tokens(requested: Option<u32>) -> (Option<u32>, bool) {
    match requested {
        Some(value) if value > PER_REQUEST_MAX_TOKENS_CEILING => {
            (Some(PER_REQUEST_MAX_TOKENS_CEILING), true)
        }
        other => (other, false),
    }
}

#[cfg(test)]
#[path = "provider_adapter_tests.rs"]
mod provider_adapter_tests;

/// OpenAI server-side built-in tool types.
/// These tools are executed server-side by OpenAI's API.
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "snake_case")]
pub enum OpenAIServerTool {
    /// Web search tool for real-time internet search
    WebSearch,
    /// Code interpreter for executing Python code
    CodeInterpreter,
    /// File search for searching through uploaded files
    FileSearch,
    /// MCP (Model Context Protocol) for external integrations
    Mcp,
    /// Image generation tool (GPT Image)
    ImageGeneration,
    /// Computer use for desktop automation
    ComputerUsePreview,
    /// Shell command execution (current)
    Shell,
    /// Local shell command execution (legacy/codex-mini)
    LocalShell,
    /// Apply patch for code modifications
    ApplyPatch,
}

impl OpenAIServerTool {
    /// Convert tool to OpenAI API string representation
    pub fn as_str(&self) -> &'static str {
        match self {
            Self::WebSearch => "web_search",
            Self::CodeInterpreter => "code_interpreter",
            Self::FileSearch => "file_search",
            Self::Mcp => "mcp",
            Self::ImageGeneration => "image_generation",
            Self::ComputerUsePreview => "computer_use_preview",
            Self::Shell => "shell",
            Self::LocalShell => "local_shell",
            Self::ApplyPatch => "apply_patch",
        }
    }

    /// Parse from string
    pub fn from_str(s: &str) -> Option<Self> {
        match s {
            "web_search" => Some(Self::WebSearch),
            "code_interpreter" => Some(Self::CodeInterpreter),
            "file_search" => Some(Self::FileSearch),
            "mcp" => Some(Self::Mcp),
            "image_generation" => Some(Self::ImageGeneration),
            // Canonical current names
            "computer_use_preview" => Some(Self::ComputerUsePreview),
            "shell" => Some(Self::Shell),
            "local_shell" => Some(Self::LocalShell),
            // Backward-compatible aliases
            "computer_use" => Some(Self::ComputerUsePreview),
            "apply_patch" => Some(Self::ApplyPatch),
            _ => None,
        }
    }
}

/// Configuration for OpenAI server-side tools
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct OpenAIToolConfig {
    /// Tool type
    #[serde(rename = "type")]
    pub tool_type: String,

    /// Tool-specific configuration
    #[serde(flatten)]
    pub config: OpenAIToolParams,
}

/// Tool-specific parameters for OpenAI built-in tools
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(untagged)]
pub enum OpenAIToolParams {
    /// Web search configuration
    WebSearch {
        #[serde(skip_serializing_if = "Option::is_none")]
        max_results: Option<u32>,
        #[serde(skip_serializing_if = "Option::is_none")]
        search_depth: Option<String>, // "basic" or "advanced"
    },
    /// Code interpreter configuration
    CodeInterpreter {
        #[serde(skip_serializing_if = "Option::is_none")]
        timeout_seconds: Option<u32>,
        #[serde(skip_serializing_if = "Option::is_none")]
        packages: Option<Vec<String>>, // Python packages to pre-install
    },
    /// File search configuration
    FileSearch {
        #[serde(skip_serializing_if = "Option::is_none")]
        max_num_results: Option<u32>,
        #[serde(skip_serializing_if = "Option::is_none")]
        vector_store_ids: Option<Vec<String>>,
    },
    /// MCP configuration
    Mcp {
        #[serde(skip_serializing_if = "Option::is_none")]
        server_url: Option<String>,
        #[serde(skip_serializing_if = "Option::is_none")]
        credentials: Option<serde_json::Value>,
    },
    /// Image generation configuration
    ImageGeneration {
        #[serde(skip_serializing_if = "Option::is_none")]
        model: Option<String>, // e.g. "gpt-image-2"
        #[serde(skip_serializing_if = "Option::is_none")]
        quality: Option<String>, // "medium" or "high"
        #[serde(skip_serializing_if = "Option::is_none")]
        size: Option<String>, // "1024x1024", "1536x1024", etc.
    },
    /// Computer use configuration
    ComputerUse {
        #[serde(skip_serializing_if = "Option::is_none")]
        display_width: Option<u32>,
        #[serde(skip_serializing_if = "Option::is_none")]
        display_height: Option<u32>,
        #[serde(skip_serializing_if = "Option::is_none")]
        environment: Option<String>,
        // Legacy aliases
        #[serde(skip_serializing_if = "Option::is_none")]
        display_width_px: Option<u32>,
        #[serde(skip_serializing_if = "Option::is_none")]
        display_height_px: Option<u32>,
        #[serde(skip_serializing_if = "Option::is_none")]
        display_number: Option<u32>,
    },
    /// Shell configuration
    Shell {
        #[serde(skip_serializing_if = "Option::is_none")]
        allowed_commands: Option<Vec<String>>,
    },
    /// Apply patch configuration
    ApplyPatch {
        #[serde(skip_serializing_if = "Option::is_none")]
        validate_before_apply: Option<bool>,
    },
    /// No configuration needed
    Empty {},
}

/// Result from a server-side tool execution
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct OpenAIToolResult {
    /// Tool call ID
    pub id: String,
    /// Tool name
    pub name: String,
    /// Tool output
    pub output: serde_json::Value,
    /// Whether the tool execution resulted in an error
    #[serde(skip_serializing_if = "Option::is_none")]
    pub is_error: Option<bool>,
}

/// Error from a server-side tool execution
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct OpenAIToolError {
    /// Error type
    #[serde(rename = "type")]
    pub error_type: String,
    /// Error message
    pub message: String,
    /// Additional error details
    #[serde(skip_serializing_if = "Option::is_none")]
    pub details: Option<serde_json::Value>,
}

/// Trait for adapting between unified format and provider-specific formats.
pub trait ProviderAdapter: Send + Sync {
    /// Convert a unified LLMRequest to provider-specific request format.
    fn adapt_request(&self, request: &LLMRequest) -> Result<Value, Box<dyn Error + Send + Sync>>;

    /// Convert provider-specific response to unified LLMResponse.
    fn adapt_response(&self, response: &Value)
        -> Result<LLMResponse, Box<dyn Error + Send + Sync>>;

    /// Get the provider name.
    fn provider_name(&self) -> &str;

    /// Check if this provider supports prompt caching.
    fn supports_prompt_caching(&self) -> bool {
        false
    }

    /// Check if this provider supports extended thinking/reasoning.
    fn supports_extended_thinking(&self) -> bool {
        false
    }

    /// Check if this provider supports batch processing.
    fn supports_batch_processing(&self) -> bool {
        false
    }

    /// Check if this provider supports structured outputs.
    fn supports_structured_outputs(&self) -> bool {
        false
    }

    /// Check if this provider supports background mode.
    fn supports_background_mode(&self) -> bool {
        false
    }

    /// Check if this provider supports audio input.
    fn supports_audio_input(&self) -> bool {
        false
    }

    /// Check if this provider supports audio output (text-to-speech).
    fn supports_audio_output(&self) -> bool {
        false
    }

    /// Check if this provider supports streaming audio.
    fn supports_streaming_audio(&self) -> bool {
        false
    }
}

/// Factory for creating provider adapters.
pub struct ProviderAdapterFactory;

impl ProviderAdapterFactory {
    pub fn create_adapter(provider: Provider) -> Box<dyn ProviderAdapter> {
        match provider {
            Provider::OpenAI => Box::new(OpenAIAdapter),
            Provider::Anthropic => Box::new(AnthropicAdapter),
            Provider::Google => Box::new(GoogleAdapter),
            Provider::Ollama => Box::new(OllamaAdapter),
            Provider::Perplexity => Box::new(PerplexityAdapter), // strips tools; Perplexity doesn't support function calling
            Provider::XAI => Box::new(OpenAIAdapter),            // XAI/Grok uses OpenAI format
            Provider::DeepSeek => Box::new(DeepSeekAdapter),
            Provider::Qwen => Box::new(OpenAIAdapter), // Qwen uses OpenAI-compatible format
            Provider::Moonshot => Box::new(MoonshotAdapter),
            Provider::Minimax => Box::new(OpenAIAdapter), // MiniMax uses OpenAI-compatible format
            Provider::Zhipu => Box::new(ZhipuAdapter),
            Provider::ManagedCloud => Box::new(OpenAIAdapter), // ManagedCloud proxies OpenAI format
            // New OpenAI-compatible providers
            Provider::Together => Box::new(OpenAIAdapter),
            Provider::Fireworks => Box::new(OpenAIAdapter),
            Provider::Cerebras => Box::new(OpenAIAdapter),
            Provider::DeepInfra => Box::new(OpenAIAdapter),
            Provider::Cohere => Box::new(OpenAIAdapter), // Cohere v2 uses OpenAI-compatible format
            Provider::AI21 => Box::new(OpenAIAdapter),
            Provider::Sambanova => Box::new(OpenAIAdapter),
            Provider::Azure => Box::new(OpenAIAdapter), // Azure OpenAI uses OpenAI format
            Provider::Bedrock => Box::new(BedrockAdapter), // Bedrock Converse API format
            Provider::NvidiaNim => Box::new(OpenAIAdapter), // NVIDIA NIM uses OpenAI-compatible format
            Provider::OpenRouter => Box::new(OpenAIAdapter), // OpenRouter uses OpenAI-compatible format
            Provider::OllamaCloud => Box::new(OpenAIAdapter), // Ollama Cloud uses OpenAI-compatible format
            // LM Studio, llama.cpp, and vLLM's built-in servers all expose an
            // OpenAI-compatible /v1/chat/completions endpoint.
            Provider::LmStudio => Box::new(OpenAIAdapter),
            Provider::LlamaCpp => Box::new(OpenAIAdapter),
            Provider::Vllm => Box::new(OpenAIAdapter),
        }
    }
}

/// OpenAI/OpenAI-compatible adapter (used by XAI, Qwen, Perplexity, etc.)
///
/// Supports:
/// - Responses API (modern, gpt-5+)
/// - Chat Completions API (legacy, backward compatible)
/// - Reasoning models (o3, o4-mini, GPT-5 with reasoning.effort)
/// - Structured outputs (text.format with JSON schema, strict mode)
/// - Prompt caching (automatic for 1024+ token prefixes)
/// - Built-in tools (web_search, code_interpreter, file_search, mcp, image_generation)
/// - Vision (image inputs with detail levels)
/// - Audio (audio inputs/outputs)
/// - Streaming (text, function calls, images with semantic events)
pub(crate) struct OpenAIAdapter;

impl ProviderAdapter for OpenAIAdapter {
    fn adapt_request(&self, request: &LLMRequest) -> Result<Value, Box<dyn Error + Send + Sync>> {
        // Determine if we should use Responses API (for gpt-5+) or Chat Completions API
        let use_responses_api = super::models_config::model_uses_responses_api(&request.model);

        if use_responses_api {
            if Self::responses_crate_expressible(request) {
                Self::adapt_responses_via_crate(request)
            } else {
                self.adapt_to_responses_api(request)
            }
        } else if Self::chat_crate_expressible(request) {
            Self::adapt_chat_via_crate(request)
        } else {
            self.adapt_to_chat_completions_api(request)
        }
    }

    fn adapt_response(
        &self,
        response: &Value,
    ) -> Result<LLMResponse, Box<dyn Error + Send + Sync>> {
        // Check if this is a Responses API response or Chat Completions API response
        let is_responses_api = response.get("output").is_some()
            || response.get("object").and_then(Value::as_str) == Some("response")
            || (response.get("status").is_some() && response.get("choices").is_none());

        if is_responses_api {
            self.adapt_from_responses_api(response)
        } else {
            self.adapt_from_chat_completions_api(response)
        }
    }

    fn provider_name(&self) -> &str {
        "OpenAI"
    }

    fn supports_prompt_caching(&self) -> bool {
        // OpenAI supports automatic prompt caching for 1024+ token prefixes
        true
    }

    fn supports_extended_thinking(&self) -> bool {
        // GPT-5 and reasoning models support reasoning.effort
        true
    }

    fn supports_batch_processing(&self) -> bool {
        true
    }

    fn supports_structured_outputs(&self) -> bool {
        true
    }

    fn supports_background_mode(&self) -> bool {
        // OpenAI supports background mode for GPT-5+ and reasoning models
        true
    }

    fn supports_audio_input(&self) -> bool {
        // OpenAI supports audio input in chat completions
        true
    }

    fn supports_audio_output(&self) -> bool {
        // OpenAI supports TTS via dedicated API and inline audio responses
        true
    }

    fn supports_streaming_audio(&self) -> bool {
        // OpenAI supports streaming audio output
        true
    }
}

impl OpenAIAdapter {
    /// c3 switch predicate for the CHAT COMPLETIONS arm (Responses routing is
    /// untouched): can the shared crate serializer express this request
    /// byte-faithfully? Fallbacks (no silent drops):
    /// - structured outputs / response_format / audio have no crate shape;
    /// - OpenAI SERVER tools (web_search, code_interpreter, ...) use typed
    ///   builtin definitions the crate `ToolDefinition` cannot express;
    /// - multimodal is crate-expressible only as Text/Image parts with the
    ///   default `detail: auto` and at least one Image (the legacy arm sends
    ///   `image_url.detail` and an always-array content; the crate omits
    ///   `detail` — wire-equivalent for `auto` only — and downgrades a lone
    ///   text part to a plain string).
    fn chat_crate_expressible(request: &LLMRequest) -> bool {
        let no_desktop_only_fields = request.output_config.is_none()
            && request.response_format.is_none()
            && request.audio_output.is_none();
        let no_server_tools = request.tools.as_ref().map_or(true, |tools| {
            tools
                .iter()
                .all(|tool| OpenAIServerTool::from_str(&tool.name).is_none())
        });
        let multimodal_expressible = request.messages.iter().all(|message| {
            message.multimodal_content.as_ref().map_or(true, |parts| {
                let simple = parts.iter().all(|part| match part {
                    super::ContentPart::Text { .. } => true,
                    super::ContentPart::Image { image } => image.detail == super::ImageDetail::Auto,
                    _ => false,
                });
                let has_image = parts
                    .iter()
                    .any(|part| matches!(part, super::ContentPart::Image { .. }));
                simple && has_image
            })
        });
        no_desktop_only_fields && no_server_tools && multimodal_expressible
    }

    /// Convert the desktop request's system + messages into crate wire
    /// messages for the OpenAI-compatible dialect. Unlike the legacy chat
    /// arm — which DROPS assistant `tool_calls` and the tool message's
    /// `tool_call_id` (a real bug: replayed tool conversations 400 on
    /// OpenAI) — the crate serializer emits correct tool history; that fix
    /// is pinned in `tests/c2c_request_oracle.rs`. Mirroring the legacy arm,
    /// a multimodal message serializes its parts only (plain `content` is
    /// not appended).
    fn openai_wire_messages(request: &LLMRequest) -> Vec<agiworkforce_llm::Message> {
        use agiworkforce_llm::{ContentBlock, Message};
        use base64::{engine::general_purpose::STANDARD, Engine as _};

        let mut out = Vec::with_capacity(request.messages.len() + 1);
        if let Some(system) = &request.system {
            out.push(Message::text("system", system.clone()));
        }
        for msg in &request.messages {
            if let Some(parts) = &msg.multimodal_content {
                let blocks: Vec<ContentBlock> = parts
                    .iter()
                    .filter_map(|part| match part {
                        super::ContentPart::Text { text } => {
                            Some(ContentBlock::Text { text: text.clone() })
                        }
                        super::ContentPart::Image { image } => Some(ContentBlock::Image {
                            mime: image.format.mime_type().to_string(),
                            data_b64: STANDARD.encode(&image.data),
                        }),
                        _ => None,
                    })
                    .collect();
                out.push(Message::blocks(&msg.role, blocks));
            } else if msg.role == "tool" {
                out.push(Message::blocks(
                    "user",
                    vec![ContentBlock::ToolResult {
                        tool_use_id: msg.tool_call_id.clone().unwrap_or_default(),
                        content: msg.content.clone(),
                        is_error: false,
                    }],
                ));
            } else if let Some(tool_calls) = &msg.tool_calls {
                let mut blocks: Vec<ContentBlock> = Vec::new();
                if !msg.content.is_empty() {
                    blocks.push(ContentBlock::Text {
                        text: msg.content.clone(),
                    });
                }
                for tc in tool_calls {
                    blocks.push(ContentBlock::ToolUse {
                        id: tc.id.clone(),
                        name: tc.name.clone(),
                        input: serde_json::from_str(&tc.arguments)
                            .unwrap_or_else(|_| serde_json::json!({})),
                    });
                }
                out.push(Message::blocks("assistant", blocks));
            } else {
                out.push(Message::text(&msg.role, msg.content.clone()));
            }
        }
        out
    }

    /// c3 (2026-07-16): build the Chat Completions body through the shared
    /// `agiworkforce-llm` serializer. Desktop-side policy stays here: catalog
    /// model-id mapping, the FIX-007 max-tokens clamp, and the catalog-based
    /// `max_completion_tokens`-vs-`max_tokens` field choice (the crate's own
    /// URL-based `OpenAiOpts::for_url` heuristic is not consulted — the
    /// desktop knows the provider from its catalog).
    pub(crate) fn adapt_chat_via_crate(
        request: &LLMRequest,
    ) -> Result<Value, Box<dyn Error + Send + Sync>> {
        let wire_model = super::models_config::get_api_model_id(&request.model);
        let messages = Self::openai_wire_messages(request);
        let tools = request.tools.as_deref().map(to_crate_tool_definitions);
        let req = agiworkforce_llm::ChatRequest {
            model: &wire_model,
            messages: &messages,
            // FIX-007 clamp; None → 0 → the crate omits the cap field.
            max_tokens: clamp_max_tokens(request.max_tokens).0.unwrap_or(0),
            temperature: request.temperature,
            tools: tools.as_deref(),
            tool_choice: request
                .tool_choice
                .as_ref()
                .map(AnthropicAdapter::map_tool_choice),
            thinking_budget: None,
            anthropic_thinking: None,
            effort: None,
            top_p: request.top_p,
            top_k: None,
            metadata: None,
            reasoning_effort: None,
            gemini_thinking_budget: None,
            num_ctx: None,
            ollama_think: None,
            idle_timeout: std::time::Duration::from_secs(0),
        };
        let opts = agiworkforce_llm::OpenAiOpts {
            use_max_completion_tokens: super::models_config::get_provider_for_model(&request.model)
                == Some(Provider::OpenAI),
        };
        let mut body = agiworkforce_llm::build_openai_compat_request_body(&req, &opts);
        // The crate engine is streaming-only; the desktop's blocking send
        // path omits `stream` — and `stream_options` is only valid WITH
        // `stream` (OpenAI 400s it otherwise).
        if !request.stream {
            if let Some(obj) = body.as_object_mut() {
                obj.remove("stream");
                obj.remove("stream_options");
            }
        }
        Ok(body)
    }

    /// Resolve the Responses `reasoning.effort` for thinking-capable OpenAI
    /// models. Shared by the legacy Responses arm and the c3 crate path.
    /// Checking capabilities.thinking on the catalog entry is sufficient —
    /// every thinking-capable OpenAI model accepts the reasoning_effort
    /// param; no hardcoded model-family prefixes per the locked rule.
    /// temperature/top_p are ONLY allowed when the resolved effort is unset.
    fn resolve_responses_reasoning_effort(request: &LLMRequest) -> Option<String> {
        let codex_effort_override = Self::codex_model_effort_override(&request.model);
        if !super::thinking::ThinkingConfig::model_supports_thinking(&request.model) {
            return None;
        }
        use super::ThinkingParameter;
        let raw_effort: Option<&str> = if let Some(thinking) = &request.thinking {
            match thinking {
                ThinkingParameter::Budget { budget_tokens, .. } => {
                    let e = if *budget_tokens < 1000 {
                        "low"
                    } else if *budget_tokens < 5000 {
                        "medium"
                    } else {
                        "high"
                    };
                    Some(e)
                }
                ThinkingParameter::Level { level, .. } => Some(match level.as_str() {
                    "low" => "low",
                    "medium" => "medium",
                    "high" => "high",
                    // xhigh is natively supported in GPT-5.4
                    "extreme" | "xhigh" => "xhigh",
                    _ => "medium",
                }),
                ThinkingParameter::Enabled(true) => Some("medium"),
                // Disabled → leave unset so temperature/top_p are allowed
                ThinkingParameter::Enabled(false) => None,
                ThinkingParameter::Adaptive { .. } => Some("medium"),
            }
        } else {
            None
        };
        raw_effort
            .map(|e| codex_effort_override.unwrap_or(e).to_string())
            .or_else(|| codex_effort_override.map(|e| e.to_string()))
    }

    /// c3 switch predicate for the RESPONSES arm: can the shared crate
    /// serializer express this request byte-faithfully? Fallbacks (no silent
    /// drops): structured outputs / response_format / audio / background /
    /// conversation continuity have no crate shape; server tools and
    /// per-tool `strict` cannot be expressed by the crate `ToolDefinition`;
    /// multimodal input stays on the legacy arm entirely (its typed
    /// input-part shapes have not been parity-audited yet).
    fn responses_crate_expressible(request: &LLMRequest) -> bool {
        let no_desktop_only_fields = request.output_config.is_none()
            && request.response_format.is_none()
            && request.audio_output.is_none()
            && request.background.is_none()
            && request.previous_response_id.is_none()
            && request.conversation_id.is_none();
        let tools_expressible = request.tools.as_ref().map_or(true, |tools| {
            tools.iter().all(|tool| {
                OpenAIServerTool::from_str(&tool.name).is_none() && tool.strict.is_none()
            })
        });
        let no_multimodal = request
            .messages
            .iter()
            .all(|message| message.multimodal_content.is_none());
        no_desktop_only_fields && tools_expressible && no_multimodal
    }

    /// Convert the desktop request's system + messages into crate wire
    /// messages for the Responses dialect. Assistant tool-call turns split
    /// into a plain TEXT message (when content is non-empty) followed by a
    /// ToolUse blocks message so the crate emits the legacy arm's exact item
    /// shapes: a string-content assistant message plus flat `function_call`
    /// items (typed `input_text` parts are for USER input, not assistant
    /// history).
    fn responses_wire_messages(request: &LLMRequest) -> Vec<agiworkforce_llm::Message> {
        use agiworkforce_llm::{ContentBlock, Message};

        let mut out = Vec::with_capacity(request.messages.len() + 1);
        if let Some(system) = &request.system {
            out.push(Message::text("system", system.clone()));
        }
        for msg in &request.messages {
            if msg.role == "tool" {
                out.push(Message::blocks(
                    "user",
                    vec![ContentBlock::ToolResult {
                        tool_use_id: msg.tool_call_id.clone().unwrap_or_default(),
                        content: msg.content.clone(),
                        is_error: false,
                    }],
                ));
            } else if let Some(tool_calls) = &msg.tool_calls {
                if !msg.content.is_empty() {
                    out.push(Message::text(&msg.role, msg.content.clone()));
                }
                let blocks: Vec<ContentBlock> = tool_calls
                    .iter()
                    .map(|tc| ContentBlock::ToolUse {
                        id: tc.id.clone(),
                        name: tc.name.clone(),
                        input: serde_json::from_str(&tc.arguments)
                            .unwrap_or_else(|_| serde_json::json!({})),
                    })
                    .collect();
                out.push(Message::blocks(&msg.role, blocks));
            } else {
                out.push(Message::text(&msg.role, msg.content.clone()));
            }
        }
        out
    }

    /// c3 (2026-07-16): build the Responses body through the shared
    /// `agiworkforce-llm` serializer. Desktop-side policy stays here: model
    /// canonicalization, the FIX-007 max-tokens clamp, and the catalog-driven
    /// reasoning-effort resolution (thinking capability + codex suffix
    /// override). Intentional delta vs the legacy arm (oracle-pinned): a
    /// single text-only user turn is sent as one typed input item instead of
    /// the compact string form — wire-equivalent per the Responses API.
    pub(crate) fn adapt_responses_via_crate(
        request: &LLMRequest,
    ) -> Result<Value, Box<dyn Error + Send + Sync>> {
        let canonical_model = Self::canonicalize_model(&request.model);
        let messages = Self::responses_wire_messages(request);
        let tools = request.tools.as_deref().map(to_crate_tool_definitions);
        let effort = Self::resolve_responses_reasoning_effort(request);
        let req = agiworkforce_llm::ChatRequest {
            model: &canonical_model,
            messages: &messages,
            // FIX-007 clamp; None → 0 → the crate omits max_output_tokens.
            max_tokens: clamp_max_tokens(request.max_tokens).0.unwrap_or(0),
            temperature: request.temperature,
            tools: tools.as_deref(),
            tool_choice: request
                .tool_choice
                .as_ref()
                .map(AnthropicAdapter::map_tool_choice),
            thinking_budget: None,
            anthropic_thinking: None,
            effort: None,
            top_p: request.top_p,
            top_k: None,
            metadata: request.metadata.as_ref(),
            reasoning_effort: effort.as_deref(),
            gemini_thinking_budget: None,
            num_ctx: None,
            ollama_think: None,
            idle_timeout: std::time::Duration::from_secs(0),
        };
        let mut body = agiworkforce_llm::build_openai_responses_body(&req);
        // The crate engine is streaming-only; the desktop's blocking send
        // path omits `stream`.
        if !request.stream {
            if let Some(obj) = body.as_object_mut() {
                obj.remove("stream");
            }
        }
        Ok(body)
    }

    fn codex_model_effort_override(model: &str) -> Option<&'static str> {
        if model.ends_with("-low") {
            Some("low")
        } else if model.ends_with("-medium") {
            Some("medium")
        } else if model.ends_with("-high") {
            Some("high")
        } else if model.ends_with("-xhigh") {
            // GPT-5.4 supports xhigh natively (added in GPT-5.4, not available in GPT-5.2)
            Some("xhigh")
        } else {
            None
        }
    }

    fn canonicalize_model(model: &str) -> String {
        super::models_config::get_canonicalized_id(model)
    }

    /// Calculate token count for an image based on dimensions and detail level
    ///
    /// OpenAI's vision token calculation:
    /// - Low detail: 85 tokens (fixed)
    /// - High/Auto detail: Image scaled to fit 2048x2048, divided into 512px tiles
    ///   Formula: (tiles_wide * tiles_high * 170) + 85
    fn calculate_image_tokens(width: u32, height: u32, detail: super::ImageDetail) -> u32 {
        use super::ImageDetail;

        match detail {
            ImageDetail::Low => 85,
            ImageDetail::High | ImageDetail::Auto => {
                // High detail: scale image to fit within 2048x2048, then count 512px tiles
                let max_dim = 2048.0;
                let scale = if width > height {
                    (max_dim / width as f64).min(1.0)
                } else {
                    (max_dim / height as f64).min(1.0)
                };

                let scaled_width = (width as f64 * scale).ceil() as u32;
                let scaled_height = (height as f64 * scale).ceil() as u32;

                // Count 512px tiles
                let tiles_wide = ((scaled_width as f64 / 512.0).ceil() as u32).max(1);
                let tiles_high = ((scaled_height as f64 / 512.0).ceil() as u32).max(1);
                let num_tiles = tiles_wide * tiles_high;

                // Each tile is 170 tokens, plus 85 base tokens
                (num_tiles * 170) + 85
            }
        }
    }

    /// Convert image data to base64 data URL
    fn image_to_base64_url(
        data: &[u8],
        format: super::ImageFormat,
    ) -> Result<String, Box<dyn Error + Send + Sync>> {
        use base64::{engine::general_purpose::STANDARD, Engine as _};

        let base64_data = STANDARD.encode(data);
        let mime_type = match format {
            super::ImageFormat::Png => "image/png",
            super::ImageFormat::Jpeg => "image/jpeg",
            super::ImageFormat::Webp => "image/webp",
        };

        Ok(format!("data:{};base64,{}", mime_type, base64_data))
    }

    /// Process multimodal content for Responses API format
    fn process_multimodal_content_responses(
        &self,
        content_parts: &[super::ContentPart],
    ) -> Result<(Vec<Value>, Vec<Value>, u32), Box<dyn Error + Send + Sync>> {
        let mut message_parts = Vec::new();
        let mut input_items = Vec::new();
        let mut total_image_tokens = 0u32;

        for part in content_parts {
            match part {
                super::ContentPart::Text { text } => {
                    message_parts.push(serde_json::json!({
                        "type": "input_text",
                        "text": text
                    }));
                }
                super::ContentPart::Image { image } => {
                    let image_url = Self::image_to_base64_url(&image.data, image.format)?;
                    let img = image::load_from_memory(&image.data)
                        .map_err(|e| format!("Failed to decode image: {}", e))?;
                    let (width, height) = (img.width(), img.height());
                    let image_tokens = Self::calculate_image_tokens(width, height, image.detail);
                    total_image_tokens += image_tokens;

                    tracing::debug!(
                        "Vision image: {}x{} px, detail={:?}, {} tokens",
                        width,
                        height,
                        image.detail,
                        image_tokens
                    );

                    let detail_str = match image.detail {
                        super::ImageDetail::Low => "low",
                        super::ImageDetail::High => "high",
                        super::ImageDetail::Auto => "auto",
                    };

                    message_parts.push(serde_json::json!({
                        "type": "input_image",
                        "image_url": image_url,
                        "detail": detail_str
                    }));
                }
                super::ContentPart::ToolUse { tool_use } => {
                    input_items.push(serde_json::json!({
                        "type": "function_call",
                        "call_id": tool_use.id,
                        "name": tool_use.name,
                        "arguments": serde_json::to_string(&tool_use.input)?
                    }));
                }
                super::ContentPart::ToolResult { tool_result } => {
                    input_items.push(serde_json::json!({
                        "type": "function_call_output",
                        "call_id": tool_result.tool_use_id,
                        "output": tool_result.content
                    }));
                }
                _ => {
                    tracing::warn!("Unsupported content type in Responses API multimodal content");
                }
            }
        }

        Ok((message_parts, input_items, total_image_tokens))
    }

    /// Convert Desktop's message/history shape into Responses API input Items.
    /// Function calls and their outputs are top-level Items, not message
    /// content blocks and not Chat Completions `tool` messages.
    fn adapt_messages_to_responses_input(
        &self,
        messages: &[super::ChatMessage],
    ) -> Result<Vec<Value>, Box<dyn Error + Send + Sync>> {
        let mut input = Vec::new();
        let mut emitted_call_ids = std::collections::HashSet::new();

        for message in messages {
            let mut message_content = None;
            let mut side_items = Vec::new();

            if let Some(multimodal) = &message.multimodal_content {
                let (parts, items, _image_tokens) =
                    self.process_multimodal_content_responses(multimodal)?;
                if !parts.is_empty() {
                    message_content = Some(serde_json::json!(parts));
                }
                side_items = items;
            } else if !message.content.is_empty() {
                message_content = Some(serde_json::json!(message.content));
            }

            if message.role == "tool" {
                let has_typed_output = side_items.iter().any(|item| {
                    item.get("type").and_then(Value::as_str) == Some("function_call_output")
                });
                if !has_typed_output {
                    let call_id = message.tool_call_id.as_deref().ok_or_else(|| {
                        "OpenAI Responses tool-result message is missing tool_call_id".to_string()
                    })?;
                    side_items.push(serde_json::json!({
                        "type": "function_call_output",
                        "call_id": call_id,
                        "output": message.content,
                    }));
                }
            } else {
                let has_tool_calls = message
                    .tool_calls
                    .as_ref()
                    .is_some_and(|calls| !calls.is_empty())
                    || side_items.iter().any(|item| {
                        item.get("type").and_then(Value::as_str) == Some("function_call")
                    });
                if let Some(content) = message_content {
                    input.push(serde_json::json!({
                        "role": message.role,
                        "content": content,
                    }));
                } else if !has_tool_calls {
                    input.push(serde_json::json!({
                        "role": message.role,
                        "content": "",
                    }));
                }

                if let Some(tool_calls) = &message.tool_calls {
                    for tool_call in tool_calls {
                        if emitted_call_ids.insert(tool_call.id.clone()) {
                            input.push(serde_json::json!({
                                "type": "function_call",
                                "call_id": tool_call.id,
                                "name": tool_call.name,
                                "arguments": tool_call.arguments,
                            }));
                        }
                    }
                }
            }

            for item in side_items {
                let is_function_call =
                    item.get("type").and_then(Value::as_str) == Some("function_call");
                let call_id = item.get("call_id").and_then(Value::as_str);
                if is_function_call
                    && call_id.is_some_and(|call_id| !emitted_call_ids.insert(call_id.to_string()))
                {
                    continue;
                }
                input.push(item);
            }
        }

        Ok(input)
    }

    /// Process multimodal content for Chat Completions API format
    fn process_multimodal_content_chat(
        &self,
        content_parts: &[super::ContentPart],
    ) -> Result<(Value, u32), Box<dyn Error + Send + Sync>> {
        let mut processed_parts = Vec::new();
        let mut total_image_tokens = 0u32;

        for part in content_parts {
            match part {
                super::ContentPart::Text { text } => {
                    processed_parts.push(serde_json::json!({
                        "type": "text",
                        "text": text
                    }));
                }
                super::ContentPart::Image { image } => {
                    let image_url = Self::image_to_base64_url(&image.data, image.format)?;
                    let img = image::load_from_memory(&image.data)
                        .map_err(|e| format!("Failed to decode image: {}", e))?;
                    let (width, height) = (img.width(), img.height());
                    let image_tokens = Self::calculate_image_tokens(width, height, image.detail);
                    total_image_tokens += image_tokens;

                    tracing::debug!(
                        "Vision image: {}x{} px, detail={:?}, {} tokens",
                        width,
                        height,
                        image.detail,
                        image_tokens
                    );

                    let detail_str = match image.detail {
                        super::ImageDetail::Low => "low",
                        super::ImageDetail::High => "high",
                        super::ImageDetail::Auto => "auto",
                    };

                    processed_parts.push(serde_json::json!({
                        "type": "image_url",
                        "image_url": {
                            "url": image_url,
                            "detail": detail_str
                        }
                    }));
                }
                _ => {
                    tracing::warn!(
                        "Unsupported content type in Chat Completions API multimodal content"
                    );
                }
            }
        }

        Ok((serde_json::json!(processed_parts), total_image_tokens))
    }

    /// Adapt request to modern Responses API format (gpt-5+, o3, o4-mini).
    ///
    /// LEGACY TWIN since c3 (2026-07-16) — the FALLBACK for request shapes
    /// [`Self::responses_crate_expressible`] cannot route to the shared crate
    /// serializer (structured outputs, server tools, per-tool `strict`,
    /// multimodal input, audio/background/continuity). Slated for the
    /// founder-gated twin-deletion; pub(crate) so the c2c oracle can call it
    /// directly as its OLD side.
    pub(crate) fn adapt_to_responses_api(
        &self,
        request: &LLMRequest,
    ) -> Result<Value, Box<dyn Error + Send + Sync>> {
        let canonical_model = Self::canonicalize_model(&request.model);

        let mut api_request = serde_json::json!({
            "model": canonical_model,
        });

        // Add previous_response_id for conversation continuity
        if let Some(prev_response_id) = &request.previous_response_id {
            api_request["previous_response_id"] = serde_json::json!(prev_response_id);
        }

        // A single text-only user turn can use the compact string form. Every
        // multimodal/history/tool turn uses typed input Items.
        if request.messages.len() == 1
            && request.messages[0].role == "user"
            && request.messages[0].multimodal_content.is_none()
            && request.messages[0].tool_calls.is_none()
            && request.messages[0].tool_call_id.is_none()
        {
            api_request["input"] = serde_json::json!(request.messages[0].content.clone());
        } else {
            api_request["input"] =
                serde_json::json!(self.adapt_messages_to_responses_input(&request.messages)?);
        }

        // Add instructions (system prompt)
        if let Some(system) = &request.system {
            api_request["instructions"] = serde_json::json!(system);
        }

        // Determine reasoning effort for thinking-capable OpenAI models
        // (shared with the c3 crate path — see the helper).
        let resolved_reasoning_effort = Self::resolve_responses_reasoning_effort(request);

        if let Some(ref effort) = resolved_reasoning_effort {
            api_request["reasoning"] = serde_json::json!({ "effort": effort });
        }
        // temperature, top_p, logprobs are forbidden for GPT-5 when any reasoning effort is set
        let suppress_sampling_params = resolved_reasoning_effort.is_some();

        // Add response format (structured outputs)
        // Priority: output_config (new typed API) > response_format (legacy)
        if let Some(oc) = &request.output_config {
            use super::OutputFormat;
            match &oc.format {
                OutputFormat::JsonSchema {
                    name,
                    schema,
                    description,
                } => {
                    let mut format = serde_json::json!({
                        "type": "json_schema",
                        "name": name,
                        "schema": schema,
                        "strict": true,
                    });
                    if let Some(desc) = description {
                        format["description"] = serde_json::json!(desc);
                    }
                    api_request["text"] = serde_json::json!({ "format": format });
                    tracing::info!(
                        schema_name = %name,
                        "OpenAI Responses API structured output requested (json_schema)"
                    );
                }
                OutputFormat::Text => {
                    // Text is the default for Responses API; no action needed.
                }
            }
        } else if let Some(format) = &request.response_format {
            match format.format_type.as_str() {
                "json_schema" => {
                    if let Some(json_schema) = &format.json_schema {
                        api_request["text"] = serde_json::json!({
                            "format": {
                                "type": "json_schema",
                                "name": "response",
                                "schema": json_schema,
                                "strict": true,
                            }
                        });
                    }
                }
                "json_object" => {
                    api_request["text"] = serde_json::json!({
                        "format": { "type": "json_object" }
                    });
                }
                _ => {}
            }
        }

        // temperature and top_p are forbidden for GPT-5/o-series when reasoning effort is set.
        // When effort is unset (default "none"), sampling params are allowed.
        if !suppress_sampling_params {
            if let Some(temp) = request.temperature {
                api_request["temperature"] = serde_json::json!(temp);
            }
            if let Some(top_p) = request.top_p {
                api_request["top_p"] = serde_json::json!(top_p);
            }
        }

        // Responses API uses max_output_tokens (not max_tokens). FIX-007:
        // clamp through PER_REQUEST_MAX_TOKENS_CEILING.
        let (max_tokens, clamped) = clamp_max_tokens(request.max_tokens);
        if let Some(max_tokens) = max_tokens {
            if clamped {
                tracing::warn!(
                    requested = request.max_tokens,
                    capped_at = max_tokens,
                    "max_output_tokens clamped to per-request ceiling (FIX-007)"
                );
            }
            api_request["max_output_tokens"] = serde_json::json!(max_tokens);
        }

        // Add tools in Responses' flat custom-function format.
        if let Some(tools) = &request.tools {
            api_request["tools"] = self.adapt_tools_to_responses_format(tools)?;
        }

        // Add tool_choice
        if let Some(tool_choice) = &request.tool_choice {
            api_request["tool_choice"] = Self::adapt_tool_choice_to_responses(tool_choice);
        }

        // Add streaming
        if request.stream {
            api_request["stream"] = serde_json::json!(true);
        }

        // Add metadata
        if let Some(metadata) = &request.metadata {
            api_request["metadata"] = metadata.clone();
        }

        // Add background mode
        if let Some(background) = request.background {
            if background {
                api_request["background"] = serde_json::json!(true);
            }
        }

        // Add audio output configuration
        if let Some(audio_output) = &request.audio_output {
            api_request["audio"] = self.adapt_audio_output(audio_output)?;
        }

        Ok(api_request)
    }

    /// Adapt request to legacy Chat Completions API format.
    ///
    /// LEGACY TWIN since c3 (2026-07-16) — the FALLBACK for request shapes
    /// [`Self::chat_crate_expressible`] cannot route to the shared crate
    /// serializer (structured outputs, server tools, non-auto image detail,
    /// audio). KNOWN BUGS preserved verbatim here (fixed on the crate path):
    /// assistant `tool_calls` and tool `tool_call_id` are dropped. Slated for
    /// the founder-gated twin-deletion; pub(crate) so the c2c oracle can call
    /// it directly as its OLD side.
    pub(crate) fn adapt_to_chat_completions_api(
        &self,
        request: &LLMRequest,
    ) -> Result<Value, Box<dyn Error + Send + Sync>> {
        // Resolve the wire API model ID: catalog keys like "minimax-m3" must be
        // translated to the actual API string ("MiniMax-M3") before being sent
        // to the provider.  get_api_model_id returns the apiModelId from models.json when
        // set, otherwise returns the model string unchanged.
        let wire_model = super::models_config::get_api_model_id(&request.model);

        // Process messages for multimodal content (vision)
        let mut processed_messages = Vec::new();
        for msg in &request.messages {
            if let Some(multimodal_content) = &msg.multimodal_content {
                let (processed_content, _image_tokens) =
                    self.process_multimodal_content_chat(multimodal_content)?;
                processed_messages.push(serde_json::json!({
                    "role": msg.role,
                    "content": processed_content
                }));
            } else {
                // Regular text message
                processed_messages.push(serde_json::json!({
                    "role": msg.role,
                    "content": msg.content
                }));
            }
        }

        let mut api_request = serde_json::json!({
            "model": wire_model,
            "messages": processed_messages,
        });

        // Add system message if present
        if let Some(system) = &request.system {
            // Prepend system message to messages array
            if let Some(messages) = api_request["messages"].as_array_mut() {
                messages.insert(
                    0,
                    serde_json::json!({
                        "role": "system",
                        "content": system
                    }),
                );
            }
        }

        // Add temperature
        if let Some(temp) = request.temperature {
            api_request["temperature"] = serde_json::json!(temp);
        }

        // Add max_tokens (FIX-007: clamp through PER_REQUEST_MAX_TOKENS_CEILING)
        let (max_tokens, clamped) = clamp_max_tokens(request.max_tokens);
        if let Some(max_tokens) = max_tokens {
            if clamped {
                tracing::warn!(
                    requested = request.max_tokens,
                    capped_at = max_tokens,
                    "max_tokens clamped to per-request ceiling (FIX-007)"
                );
            }
            // OpenAI-managed `/chat/completions` deprecated `max_tokens` and
            // rejects it outright for gpt-5/o-series with a 400 ("Unsupported
            // parameter: 'max_tokens' is not supported with this model. Use
            // 'max_completion_tokens' instead."). Third-party OpenAI-compatible
            // providers (xAI, Qwen, DeepSeek, Moonshot, local runtimes, …) that
            // share this adapter still expect `max_tokens`, so only rename the
            // field for OpenAI itself. Mirrors the crate's URL-based
            // `OpenAiOpts::for_url` distinction (`crates/agiworkforce-llm/src/spec.rs`).
            let max_tokens_field = if super::models_config::get_provider_for_model(&request.model)
                == Some(Provider::OpenAI)
            {
                "max_completion_tokens"
            } else {
                "max_tokens"
            };
            api_request[max_tokens_field] = serde_json::json!(max_tokens);
        }

        // Add tools (nested format for OpenAI)
        if let Some(tools) = &request.tools {
            api_request["tools"] = self.adapt_tools_to_chat_completions_format(tools)?;
        }

        // Add tool_choice
        if let Some(tool_choice) = &request.tool_choice {
            api_request["tool_choice"] = serde_json::to_value(tool_choice)?;
        }

        // Add streaming
        if request.stream {
            api_request["stream"] = serde_json::json!(true);
        }

        // Add top_p
        if let Some(top_p) = request.top_p {
            api_request["top_p"] = serde_json::json!(top_p);
        }

        // Add response_format for structured outputs
        // Priority: output_config (new typed API) > response_format (legacy)
        if let Some(oc) = &request.output_config {
            use super::OutputFormat;
            match &oc.format {
                OutputFormat::JsonSchema {
                    name,
                    schema,
                    description,
                } => {
                    let mut schema_obj = serde_json::json!({
                        "name": name,
                        "schema": schema,
                        "strict": true,
                    });
                    if let Some(desc) = description {
                        schema_obj["description"] = serde_json::json!(desc);
                    }
                    api_request["response_format"] = serde_json::json!({
                        "type": "json_schema",
                        "json_schema": schema_obj,
                    });
                    tracing::info!(
                        schema_name = %name,
                        "OpenAI Chat Completions structured output requested (json_schema)"
                    );
                }
                OutputFormat::Text => {
                    api_request["response_format"] = serde_json::json!({
                        "type": "text"
                    });
                }
            }
        } else if let Some(format) = &request.response_format {
            api_request["response_format"] = serde_json::to_value(format)?;
        }

        // Add audio output configuration (for audio responses)
        if let Some(audio_output) = &request.audio_output {
            api_request["audio"] = self.adapt_audio_output(audio_output)?;
        }

        Ok(api_request)
    }

    /// Convert tools to OpenAI Chat Completions' nested function format.
    /// Detects and handles built-in server-side tools (web_search, code_interpreter, etc.)
    fn adapt_tools_to_chat_completions_format(
        &self,
        tools: &[super::ToolDefinition],
    ) -> Result<Value, Box<dyn Error + Send + Sync>> {
        let nested_tools: Vec<Value> = tools
            .iter()
            .map(|tool| {
                let tool_name = &tool.name;

                // Check if this is a built-in server-side tool
                if let Some(server_tool) = OpenAIServerTool::from_str(tool_name) {
                    // Handle built-in tool with configuration
                    self.create_builtin_tool_definition(server_tool, tool)
                } else {
                    let normalized_parameters =
                        Self::normalize_array_items_in_schema(&tool.parameters);

                    // Handle regular function tool (ToolDefinition is a struct)
                    serde_json::json!({
                        "type": "function",
                        "function": {
                            "name": tool.name,
                            "description": tool.description,
                            "parameters": normalized_parameters
                        }
                    })
                }
            })
            .collect();

        Ok(serde_json::json!(nested_tools))
    }

    /// Convert tools to the Responses API's flat function format.
    fn adapt_tools_to_responses_format(
        &self,
        tools: &[super::ToolDefinition],
    ) -> Result<Value, Box<dyn Error + Send + Sync>> {
        let response_tools = tools
            .iter()
            .map(|tool| {
                if let Some(server_tool) = OpenAIServerTool::from_str(&tool.name) {
                    return self.create_builtin_tool_definition(server_tool, tool);
                }

                let mut definition = serde_json::json!({
                    "type": "function",
                    "name": tool.name,
                    "description": tool.description,
                    "parameters": Self::normalize_array_items_in_schema(&tool.parameters),
                });
                if let Some(strict) = tool.strict {
                    definition["strict"] = serde_json::json!(strict);
                }
                definition
            })
            .collect::<Vec<_>>();
        Ok(serde_json::json!(response_tools))
    }

    fn adapt_tool_choice_to_responses(tool_choice: &super::ToolChoice) -> Value {
        match tool_choice {
            super::ToolChoice::Auto => serde_json::json!("auto"),
            super::ToolChoice::Required => serde_json::json!("required"),
            super::ToolChoice::None => serde_json::json!("none"),
            super::ToolChoice::Specific(name) => serde_json::json!({
                "type": "function",
                "name": name,
            }),
        }
    }

    /// OpenAI-compatible tool schemas require `items` for any array schema.
    /// Some local tool definitions only declare `type: "array"`, which causes
    /// request rejection (`invalid_function_parameters`).
    fn normalize_array_items_in_schema(schema: &Value) -> Value {
        let mut normalized = schema.clone();
        Self::normalize_array_items_in_schema_mut(&mut normalized);
        normalized
    }

    fn normalize_array_items_in_schema_mut(schema: &mut Value) {
        match schema {
            Value::Object(map) => {
                let is_array = map.get("type").and_then(Value::as_str) == Some("array");
                if is_array && !map.contains_key("items") {
                    map.insert("items".to_string(), serde_json::json!({}));
                }

                for value in map.values_mut() {
                    Self::normalize_array_items_in_schema_mut(value);
                }
            }
            Value::Array(items) => {
                for item in items {
                    Self::normalize_array_items_in_schema_mut(item);
                }
            }
            _ => {}
        }
    }

    /// Create a built-in tool definition with configuration
    fn create_builtin_tool_definition(
        &self,
        server_tool: OpenAIServerTool,
        tool: &super::ToolDefinition,
    ) -> Value {
        let tool_type = server_tool.as_str();

        // Extract configuration from tool parameters if present
        let normalized_params = Self::normalize_array_items_in_schema(&tool.parameters);
        let params = &normalized_params;

        let mut tool_def = serde_json::json!({
            "type": tool_type,
        });

        // Add tool-specific configuration based on parameters
        match server_tool {
            OpenAIServerTool::WebSearch => {}
            OpenAIServerTool::CodeInterpreter => {}
            OpenAIServerTool::FileSearch => {
                if let Some(max_results) = params.get("max_num_results") {
                    tool_def["max_num_results"] = max_results.clone();
                }
                if let Some(vector_stores) = params.get("vector_store_ids") {
                    tool_def["vector_store_ids"] = vector_stores.clone();
                }
            }
            OpenAIServerTool::Mcp => {
                // Forward MCP fields transparently to avoid tight coupling to evolving API fields.
            }
            OpenAIServerTool::ImageGeneration => {
                if let Some(model) = params.get("model") {
                    tool_def["model"] = model.clone();
                }
                if let Some(quality) = params.get("quality") {
                    tool_def["quality"] = quality.clone();
                }
                if let Some(size) = params.get("size") {
                    tool_def["size"] = size.clone();
                }
            }
            OpenAIServerTool::ComputerUsePreview => {
                // Computer use requires display dimensions. Prefer modern keys and support legacy aliases.
                let width = params
                    .get("display_width")
                    .and_then(|v| v.as_u64())
                    .or_else(|| params.get("display_width_px").and_then(|v| v.as_u64()))
                    .unwrap_or(1024) as u32;
                let height = params
                    .get("display_height")
                    .and_then(|v| v.as_u64())
                    .or_else(|| params.get("display_height_px").and_then(|v| v.as_u64()))
                    .unwrap_or(768) as u32;

                tool_def["display_width"] = serde_json::json!(width);
                tool_def["display_height"] = serde_json::json!(height);
                tool_def["environment"] = params
                    .get("environment")
                    .cloned()
                    .unwrap_or_else(|| serde_json::json!("browser"));

                if let Some(display_num) = params.get("display_number") {
                    tool_def["display_number"] = display_num.clone();
                }
            }
            OpenAIServerTool::Shell | OpenAIServerTool::LocalShell => {
                if let Some(allowed) = params.get("allowed_commands") {
                    tool_def["allowed_commands"] = allowed.clone();
                }
            }
            OpenAIServerTool::ApplyPatch => {}
        }

        // Forward all declared parameters (except "type") so newly introduced provider
        // fields keep working without requiring immediate adapter code changes.
        if let Some(obj) = params.as_object() {
            for (key, value) in obj {
                // `validate_before_apply` is non-standard and causes compatibility
                // issues on some OpenAI-compatible endpoints; keep it client-side only.
                if key != "type" && key != "validate_before_apply" {
                    tool_def[key] = value.clone();
                }
            }
        }

        tool_def
    }

    /// Adapt audio output configuration
    fn adapt_audio_output(
        &self,
        audio_output: &super::AudioOutput,
    ) -> Result<Value, Box<dyn Error + Send + Sync>> {
        use super::{AudioFormat, AudioVoice};

        let voice = match audio_output.voice {
            AudioVoice::Alloy => "alloy",
            AudioVoice::Echo => "echo",
            AudioVoice::Fable => "fable",
            AudioVoice::Onyx => "onyx",
            AudioVoice::Nova => "nova",
            AudioVoice::Shimmer => "shimmer",
            AudioVoice::Ash => "ash",
            AudioVoice::Ballad => "ballad",
            AudioVoice::Coral => "coral",
            AudioVoice::Sage => "sage",
            AudioVoice::Verse => "verse",
        };

        let format = match audio_output.format {
            AudioFormat::Mp3 => "mp3",
            AudioFormat::Opus => "opus",
            AudioFormat::Ogg => "ogg",
            AudioFormat::M4a => "m4a",
            AudioFormat::Aac => "aac",
            AudioFormat::Flac => "flac",
            AudioFormat::Wav => "wav",
            AudioFormat::Webm => "webm",
        };

        let mut audio_config = serde_json::json!({
            "voice": voice,
            "format": format,
        });

        if let Some(speed) = audio_output.speed {
            audio_config["speed"] = serde_json::json!(speed);
        }

        Ok(audio_config)
    }

    /// Process multimodal content and extract audio inputs
    // Used by: audio-capable model support (e.g., GPT-4o audio, Gemini audio)
    fn _process_audio_content(
        &self,
        content_parts: &[super::ContentPart],
    ) -> Result<Vec<Value>, Box<dyn Error + Send + Sync>> {
        use super::ContentPart;
        use base64::{engine::general_purpose::STANDARD, Engine as _};

        let mut processed_parts = Vec::new();

        for part in content_parts {
            match part {
                ContentPart::Text { text } => {
                    processed_parts.push(serde_json::json!({
                        "type": "text",
                        "text": text
                    }));
                }
                ContentPart::Audio { audio } => {
                    // Convert audio to OpenAI format
                    let audio_part = match &audio.data {
                        super::AudioData::Base64(base64_str) => {
                            serde_json::json!({
                                "type": "input_audio",
                                "input_audio": {
                                    "data": base64_str,
                                    "format": audio.format.extension()
                                }
                            })
                        }
                        super::AudioData::Bytes(bytes) => {
                            let base64_str = STANDARD.encode(bytes);
                            serde_json::json!({
                                "type": "input_audio",
                                "input_audio": {
                                    "data": base64_str,
                                    "format": audio.format.extension()
                                }
                            })
                        }
                        super::AudioData::Uri(uri) => {
                            serde_json::json!({
                                "type": "input_audio",
                                "input_audio": {
                                    "url": uri,
                                    "format": audio.format.extension()
                                }
                            })
                        }
                    };
                    processed_parts.push(audio_part);
                }
                ContentPart::Image { image } => {
                    use base64::{engine::general_purpose::STANDARD, Engine as _};
                    let base64_str = STANDARD.encode(&image.data);
                    let data_url =
                        format!("data:{};base64,{}", image.format.mime_type(), base64_str);
                    processed_parts.push(serde_json::json!({
                        "type": "image_url",
                        "image_url": {
                            "url": data_url,
                            "detail": format!("{:?}", image.detail).to_lowercase()
                        }
                    }));
                }
                ContentPart::Video { video } => {
                    use super::VideoData;
                    use base64::{engine::general_purpose::STANDARD, Engine as _};

                    let video_url = match &video.data {
                        VideoData::Bytes(bytes) => {
                            let base64_str = STANDARD.encode(bytes);
                            format!("data:{};base64,{}", video.format.mime_type(), base64_str)
                        }
                        VideoData::Uri(uri) => uri.clone(),
                    };

                    processed_parts.push(serde_json::json!({
                        "type": "video_url",
                        "video_url": {
                            "url": video_url
                        }
                    }));
                }
                ContentPart::Document { document } => {
                    processed_parts.push(serde_json::json!({
                        "type": "document",
                        "document": document
                    }));
                }
                ContentPart::ToolUse { tool_use } => {
                    processed_parts.push(serde_json::json!({
                        "type": "tool_use",
                        "id": tool_use.id,
                        "name": tool_use.name,
                        "input": tool_use.input
                    }));
                }
                ContentPart::ToolResult { tool_result } => {
                    processed_parts.push(serde_json::json!({
                        "type": "tool_result",
                        "tool_use_id": tool_result.tool_use_id,
                        "content": tool_result.content,
                        "is_error": tool_result.is_error
                    }));
                }
            }
        }

        Ok(processed_parts)
    }

    fn append_output_text(content: &mut String, text: &str) {
        if text.is_empty() {
            return;
        }
        if !content.is_empty() {
            content.push('\n');
        }
        content.push_str(text);
    }

    fn responses_server_tool_name_from_output_type(output_type: &str) -> Option<String> {
        let canonical = match output_type {
            // Known Responses API output item types for built-in tools
            "local_shell_call" => "local_shell",
            "shell_call" => "shell",
            "web_search_call" => "web_search",
            "code_interpreter_call" => "code_interpreter",
            "file_search_call" => "file_search",
            "image_generation_call" => "image_generation",
            "mcp_call" => "mcp",
            "apply_patch_call" => "apply_patch",
            // Computer-use call item can surface as "computer_call" in output.
            "computer_call" | "computer_use_call" => "computer_use_preview",
            other => {
                if let Some(stripped) = other.strip_suffix("_call") {
                    if stripped == "computer" {
                        "computer_use_preview"
                    } else if OpenAIServerTool::from_str(stripped).is_some() {
                        stripped
                    } else {
                        return None;
                    }
                } else if OpenAIServerTool::from_str(other).is_some() {
                    other
                } else {
                    return None;
                }
            }
        };
        Some(canonical.to_string())
    }

    fn parse_responses_output_tool_call(&self, value: &Value) -> Option<ToolCall> {
        let output_type = value.get("type").and_then(Value::as_str)?;

        if output_type == "function_call" {
            let id = value
                .get("call_id")
                .and_then(Value::as_str)
                .or_else(|| value.get("id").and_then(Value::as_str))
                .map(ToString::to_string)
                .unwrap_or_else(|| format!("call_{}", uuid::Uuid::new_v4()));
            let name = value.get("name").and_then(Value::as_str)?.to_string();
            let arguments = value
                .get("arguments")
                .and_then(Value::as_str)
                .filter(|s| !s.is_empty())
                .map(ToString::to_string)
                .or_else(|| {
                    value.get("input").map(|input| {
                        serde_json::to_string(input).unwrap_or_else(|_| "{}".to_string())
                    })
                })
                .unwrap_or_else(|| "{}".to_string());

            return Some(ToolCall {
                id,
                name,
                arguments,
            });
        }

        let server_tool = Self::responses_server_tool_name_from_output_type(output_type)?;
        let id = value
            .get("id")
            .and_then(Value::as_str)
            .or_else(|| value.get("call_id").and_then(Value::as_str))
            .or_else(|| value.get("tool_call_id").and_then(Value::as_str))
            .map(ToString::to_string)
            .unwrap_or_else(|| format!("call_{}", uuid::Uuid::new_v4()));

        // Built-in tools are executed server-side by the provider.
        // Prefix them so the chat loop skips local execution.
        let arguments = value
            .get("arguments")
            .and_then(Value::as_str)
            .filter(|s| !s.is_empty())
            .map(ToString::to_string)
            .or_else(|| {
                value
                    .get("input")
                    .or_else(|| value.get("output"))
                    .map(|payload| {
                        serde_json::to_string(payload).unwrap_or_else(|_| "{}".to_string())
                    })
            })
            .unwrap_or_else(|| "{}".to_string());

        Some(ToolCall {
            id,
            name: format!("__server__{}", server_tool),
            arguments,
        })
    }

    /// Adapt response from Responses API format
    fn adapt_from_responses_api(
        &self,
        response: &Value,
    ) -> Result<LLMResponse, Box<dyn Error + Send + Sync>> {
        let status = response.get("status").and_then(Value::as_str);
        let error = response.get("error").filter(|error| !error.is_null());
        if status == Some("failed") || error.is_some() {
            let error = error.unwrap_or(&Value::Null);
            let code = error
                .get("code")
                .and_then(Value::as_str)
                .map(|code| format!(" ({code})"))
                .unwrap_or_default();
            let message = error
                .get("message")
                .and_then(Value::as_str)
                .unwrap_or("The OpenAI Responses request failed without an error message.");

            return Err(std::io::Error::other(format!(
                "OpenAI Responses API error{code}: {message}"
            ))
            .into());
        }

        // Extract text from output array
        let mut content = String::new();
        let mut reasoning_parts = Vec::new();
        let mut tool_calls = Vec::new();

        if let Some(output) = response["output"].as_array() {
            for item in output {
                // Top-level output items can carry tool calls directly (Responses API)
                if let Some(tool_call) = self.parse_responses_output_tool_call(item) {
                    tool_calls.push(tool_call);
                }

                if let Some(item_type) = item.get("type").and_then(Value::as_str) {
                    if item_type == "output_text" {
                        if let Some(text) = item.get("text").and_then(Value::as_str) {
                            Self::append_output_text(&mut content, text);
                        }
                    } else if item_type == "reasoning" {
                        if let Some(summary) = item.get("summary").and_then(Value::as_array) {
                            reasoning_parts.extend(summary.iter().filter_map(|part| {
                                (part.get("type").and_then(Value::as_str) == Some("summary_text"))
                                    .then(|| part.get("text").and_then(Value::as_str))
                                    .flatten()
                                    .map(ToString::to_string)
                            }));
                        }
                    } else if item_type == "message" {
                        // Message text is usually nested in content blocks.
                        if let Some(text) = item.get("text").and_then(Value::as_str) {
                            Self::append_output_text(&mut content, text);
                        }
                    }
                }

                // Content blocks within message items
                if let Some(output_content) = item["content"].as_array() {
                    for part in output_content {
                        if let Some(part_type) = part.get("type").and_then(Value::as_str) {
                            if (part_type == "output_text" || part_type == "text")
                                && part.get("text").and_then(Value::as_str).is_some()
                            {
                                if let Some(text) = part.get("text").and_then(Value::as_str) {
                                    Self::append_output_text(&mut content, text);
                                }
                            }
                        }

                        if let Some(tool_call) = self.parse_responses_output_tool_call(part) {
                            tool_calls.push(tool_call);
                        }
                    }
                }
            }
        }

        // Extract token usage with reasoning tokens
        let usage = &response["usage"];
        let prompt_tokens = usage["input_tokens"].as_u64().map(|v| v as u32);
        let completion_tokens = usage["output_tokens"].as_u64().map(|v| v as u32);
        let total_tokens = usage["total_tokens"].as_u64().map(|v| v as u32);

        // Extract reasoning tokens (for o3, o4-mini, GPT-5)
        let reasoning_tokens = usage["output_tokens_details"]["reasoning_tokens"]
            .as_u64()
            .map(|v| v as u32);
        let cache_read_input_tokens = usage["input_tokens_details"]["cached_tokens"]
            .as_u64()
            .map(|v| v as u32);

        let finish_reason = response["incomplete_details"]["reason"]
            .as_str()
            .or(status)
            .map(ToString::to_string);
        let response_id = response["id"].as_str().map(|s| s.to_string());
        let reasoning_content = if reasoning_parts.is_empty() {
            None
        } else {
            Some(reasoning_parts.join("\n"))
        };

        Ok(LLMResponse {
            content,
            tokens: total_tokens,
            prompt_tokens,
            completion_tokens,
            cache_read_input_tokens,
            reasoning_tokens,
            reasoning_content,
            model: response["model"].as_str().unwrap_or("").to_string(),
            tool_calls: if tool_calls.is_empty() {
                None
            } else {
                Some(tool_calls)
            },
            finish_reason,
            response_id,
            ..LLMResponse::default()
        })
    }

    /// Adapt response from Chat Completions API format
    fn adapt_from_chat_completions_api(
        &self,
        response: &Value,
    ) -> Result<LLMResponse, Box<dyn Error + Send + Sync>> {
        let content = response["choices"][0]["message"]["content"]
            .as_str()
            .unwrap_or("")
            .to_string();

        let usage = &response["usage"];
        let prompt_tokens = usage["prompt_tokens"].as_u64().map(|v| v as u32);
        let completion_tokens = usage["completion_tokens"].as_u64().map(|v| v as u32);
        let total_tokens = usage["total_tokens"].as_u64().map(|v| v as u32);

        // Extract prompt cache tokens if present
        let cache_read_input_tokens = usage["prompt_tokens_details"]["cached_tokens"]
            .as_u64()
            .map(|v| v as u32);

        // Extract reasoning tokens if present
        let reasoning_tokens = usage["completion_tokens_details"]["reasoning_tokens"]
            .as_u64()
            .map(|v| v as u32);

        // Extract tool calls (both regular and built-in tools)
        let tool_calls = response["choices"][0]["message"]["tool_calls"]
            .as_array()
            .map(|calls| {
                calls
                    .iter()
                    .filter_map(|call| self.parse_tool_call(call))
                    .collect::<Vec<_>>()
            })
            .filter(|calls| !calls.is_empty());

        let finish_reason = response["choices"][0]["finish_reason"]
            .as_str()
            .map(|s| s.to_string());
        let response_id = response["id"].as_str().map(|s| s.to_string());

        // Extract audio data if present (for audio responses)
        let (audio_data, audio_format, audio_transcript) =
            self.extract_audio_from_response(response);

        Ok(LLMResponse {
            content,
            tokens: total_tokens,
            prompt_tokens,
            completion_tokens,
            cache_read_input_tokens,
            reasoning_tokens,
            model: response["model"].as_str().unwrap_or("").to_string(),
            tool_calls,
            finish_reason,
            response_id,
            audio_data,
            audio_format,
            audio_transcript,
            ..LLMResponse::default()
        })
    }

    /// Parse a tool call from response, handling both regular and built-in tools
    fn parse_tool_call(&self, call: &Value) -> Option<ToolCall> {
        let id = call["id"].as_str()?.to_string();
        let call_type = call["type"].as_str().unwrap_or("function");

        // Check if this is a built-in tool
        if let Some(server_tool) = OpenAIServerTool::from_str(call_type) {
            // Built-in tool result
            let payload = call
                .get("input")
                .or_else(|| call.get("output"))
                .cloned()
                .unwrap_or_else(|| serde_json::json!({}));
            let canonical_name = server_tool.as_str();
            // Built-in tools are server-side; prefix to prevent local re-execution.
            Some(ToolCall {
                id,
                name: format!("__server__{}", canonical_name),
                arguments: serde_json::to_string(&payload).unwrap_or_else(|_| "{}".to_string()),
            })
        } else {
            // Regular function call
            let name = call["function"]["name"].as_str()?.to_string();
            let arguments = call["function"]["arguments"]
                .as_str()
                .filter(|s| !s.is_empty()) // Filter empty strings
                .unwrap_or("{}")
                .to_string();
            Some(ToolCall {
                id,
                name,
                arguments,
            })
        }
    }

    /// Extract audio output from OpenAI response
    fn extract_audio_from_response(
        &self,
        response: &Value,
    ) -> (Option<Vec<u8>>, Option<super::AudioFormat>, Option<String>) {
        use base64::{engine::general_purpose::STANDARD, Engine as _};

        // Check for audio in message content
        if let Some(audio_obj) = response["choices"][0]["message"]["audio"].as_object() {
            // Extract audio data (base64 encoded)
            let audio_data = audio_obj
                .get("data")
                .and_then(|d| d.as_str())
                .and_then(|base64_str| STANDARD.decode(base64_str).ok());

            // Extract audio format
            let audio_format =
                audio_obj
                    .get("format")
                    .and_then(|f| f.as_str())
                    .and_then(|format_str| match format_str {
                        "wav" => Some(super::AudioFormat::Wav),
                        "mp3" => Some(super::AudioFormat::Mp3),
                        "opus" => Some(super::AudioFormat::Opus),
                        "ogg" => Some(super::AudioFormat::Ogg),
                        "m4a" => Some(super::AudioFormat::M4a),
                        "aac" => Some(super::AudioFormat::Aac),
                        "flac" => Some(super::AudioFormat::Flac),
                        "webm" => Some(super::AudioFormat::Webm),
                        _ => None,
                    });

            // Extract transcript if available
            let audio_transcript = audio_obj
                .get("transcript")
                .and_then(|t| t.as_str())
                .map(|s| s.to_string());

            return (audio_data, audio_format, audio_transcript);
        }

        // Check for audio transcript in input (when audio input was provided)
        let transcript = response["choices"][0]["message"]["audio_transcript"]
            .as_str()
            .map(|s| s.to_string());

        (None, None, transcript)
    }
}

/// Convert desktop tool definitions to the shared crate's wire type. Only
/// `name`/`description`/`input_schema` ever reach a provider payload — the
/// crate's serializers pick API-bound fields by name, so the executor
/// metadata stays client-side by construction. Shared by every c2c/c3
/// crate-serializer switch (ollama, anthropic, ...).
pub(crate) fn to_crate_tool_definitions(
    tools: &[super::ToolDefinition],
) -> Vec<agiworkforce_llm::ToolDefinition> {
    tools
        .iter()
        .map(|tool| agiworkforce_llm::ToolDefinition {
            name: tool.name.clone(),
            description: tool.description.clone(),
            input_schema: tool.parameters.clone(),
            is_read_only: false,
            is_concurrency_safe: false,
            max_result_size_chars: None,
            should_defer: false,
            aliases: Vec::new(),
            owner: String::new(),
            permission_class: String::new(),
            diagnostic_tags: Vec::new(),
        })
        .collect()
}

/// Anthropic Claude adapter
pub(crate) struct AnthropicAdapter;

impl AnthropicAdapter {
    /// c3 switch predicate: can the shared crate serializer express this
    /// request byte-faithfully? Anything outside this shape falls back to the
    /// legacy adapter arm below (no silent field drops):
    /// - structured outputs / response formats / audio / background /
    ///   conversation continuity have no crate representation yet;
    /// - `cache_control` requests the legacy single-block system caching,
    ///   whose bytes differ from the crate's env-split caching;
    /// - Anthropic SERVER tools use a typed definition format the crate
    ///   `ToolDefinition` cannot express;
    /// - multimodal parts beyond Text/Image/ToolUse/ToolResult (Document,
    ///   Audio, Video) have no crate `ContentBlock`.
    fn crate_expressible(request: &LLMRequest) -> bool {
        use crate::core::llm::server_tools;

        let no_desktop_only_fields = request.output_config.is_none()
            && request.response_format.is_none()
            && request.cache_control.is_none()
            && request.audio_output.is_none()
            && request.background.is_none()
            && request.previous_response_id.is_none()
            && request.conversation_id.is_none();
        let no_server_tools = request.tools.as_ref().map_or(true, |tools| {
            tools
                .iter()
                .all(|tool| !server_tools::is_anthropic_server_tool(&tool.name))
        });
        let multimodal_expressible = request.messages.iter().all(|message| {
            message.multimodal_content.as_ref().map_or(true, |parts| {
                parts.iter().all(|part| {
                    matches!(
                        part,
                        super::ContentPart::Text { .. }
                            | super::ContentPart::Image { .. }
                            | super::ContentPart::ToolUse { .. }
                            | super::ContentPart::ToolResult { .. }
                    )
                })
            })
        });
        no_desktop_only_fields && no_server_tools && multimodal_expressible
    }

    /// Map the desktop thinking parameter onto the crate's Anthropic thinking
    /// mode, mirroring the legacy adapter's mapping exactly (Enabled(true) →
    /// 8192-token budget; Level → the same low/medium/high/extreme table).
    fn map_thinking(
        thinking: Option<&super::ThinkingParameter>,
    ) -> Option<agiworkforce_llm::AnthropicThinking> {
        use super::ThinkingParameter;
        use agiworkforce_llm::AnthropicThinking;
        thinking.map(|thinking| match thinking {
            ThinkingParameter::Enabled(true) => AnthropicThinking::Enabled {
                budget_tokens: 8192,
            },
            ThinkingParameter::Enabled(false) => AnthropicThinking::Disabled,
            ThinkingParameter::Level {
                level,
                max_thinking_tokens,
            } => AnthropicThinking::Enabled {
                budget_tokens: max_thinking_tokens.unwrap_or(match level.as_str() {
                    "low" => 2048,
                    "medium" => 8192,
                    "high" => 16384,
                    "extreme" => 32768,
                    _ => 8192,
                }),
            },
            ThinkingParameter::Budget { budget_tokens, .. } => AnthropicThinking::Enabled {
                budget_tokens: *budget_tokens,
            },
            ThinkingParameter::Adaptive { .. } => AnthropicThinking::Adaptive,
        })
    }

    fn map_tool_choice(tool_choice: &super::ToolChoice) -> agiworkforce_llm::ToolChoice {
        match tool_choice {
            super::ToolChoice::Auto => agiworkforce_llm::ToolChoice::Auto,
            super::ToolChoice::Required => agiworkforce_llm::ToolChoice::Required,
            super::ToolChoice::None => agiworkforce_llm::ToolChoice::None,
            super::ToolChoice::Specific(name) => {
                agiworkforce_llm::ToolChoice::Specific(name.clone())
            }
        }
    }

    /// Convert the desktop request's system + messages into crate wire
    /// messages, mirroring the legacy adapter's role normalization exactly:
    /// tool-result turns become "user" turns with ToolResult blocks (Anthropic
    /// rejects role="tool"), assistant tool_calls become ToolUse blocks, and a
    /// multimodal message appends its plain `content` as a text block only
    /// when the parts carried no Text part.
    fn wire_messages(request: &LLMRequest) -> Vec<agiworkforce_llm::Message> {
        use agiworkforce_llm::{ContentBlock, Message};
        use base64::{engine::general_purpose::STANDARD, Engine as _};

        let mut out = Vec::with_capacity(request.messages.len() + 1);
        if let Some(system) = &request.system {
            out.push(Message::text("system", system.clone()));
        }
        for msg in &request.messages {
            if let Some(parts) = &msg.multimodal_content {
                let mut blocks: Vec<ContentBlock> = Vec::new();
                let mut has_tool_result = false;
                for part in parts {
                    match part {
                        super::ContentPart::Text { text } => {
                            blocks.push(ContentBlock::Text { text: text.clone() })
                        }
                        super::ContentPart::Image { image } => blocks.push(ContentBlock::Image {
                            mime: image.format.mime_type().to_string(),
                            data_b64: STANDARD.encode(&image.data),
                        }),
                        super::ContentPart::ToolUse { tool_use } => {
                            blocks.push(ContentBlock::ToolUse {
                                id: tool_use.id.clone(),
                                name: tool_use.name.clone(),
                                input: tool_use.input.clone(),
                            });
                        }
                        super::ContentPart::ToolResult { tool_result } => {
                            has_tool_result = true;
                            blocks.push(ContentBlock::ToolResult {
                                tool_use_id: tool_result.tool_use_id.clone(),
                                content: tool_result.content.clone(),
                                is_error: tool_result.is_error,
                            });
                        }
                        _ => unreachable!("crate_expressible excludes other part kinds"),
                    }
                }
                if !msg.content.is_empty()
                    && !blocks
                        .iter()
                        .any(|b| matches!(b, ContentBlock::Text { .. }))
                {
                    blocks.push(ContentBlock::Text {
                        text: msg.content.clone(),
                    });
                }
                let role = if has_tool_result || msg.role == "tool" {
                    "user"
                } else {
                    &msg.role
                };
                out.push(Message::blocks(role, blocks));
            } else if msg.role == "tool" {
                out.push(Message::blocks(
                    "user",
                    vec![ContentBlock::ToolResult {
                        tool_use_id: msg.tool_call_id.clone().unwrap_or_else(|| {
                            tracing::warn!(
                                "[Anthropic] Tool result message missing tool_call_id; \
                                 falling back to 'unknown'."
                            );
                            "unknown".to_string()
                        }),
                        content: msg.content.clone(),
                        is_error: false,
                    }],
                ));
            } else if let Some(tool_calls) = &msg.tool_calls {
                let mut blocks: Vec<ContentBlock> = Vec::new();
                if !msg.content.is_empty() {
                    blocks.push(ContentBlock::Text {
                        text: msg.content.clone(),
                    });
                }
                for tc in tool_calls {
                    blocks.push(ContentBlock::ToolUse {
                        id: tc.id.clone(),
                        name: tc.name.clone(),
                        input: serde_json::from_str(&tc.arguments)
                            .unwrap_or_else(|_| serde_json::json!({})),
                    });
                }
                out.push(Message::blocks("assistant", blocks));
            } else {
                out.push(Message::text(&msg.role, msg.content.clone()));
            }
        }
        out
    }

    /// c3 (2026-07-16): build the Messages API body through the shared
    /// `agiworkforce-llm` serializer. Desktop-side policy stays here: catalog
    /// model-id mapping, the FIX-007 max-tokens clamp, and tool-message
    /// pairing validation. Byte-parity with the legacy arm is proven by
    /// `tests/c2c_request_oracle.rs` modulo the enumerated intentional deltas
    /// (prompt-cache breakpoints on system/tools/last-message, explicit
    /// `is_error: false` on plain-path tool results).
    pub(crate) fn adapt_request_via_crate(
        request: &LLMRequest,
    ) -> Result<Value, Box<dyn Error + Send + Sync>> {
        let wire_model = super::models_config::get_api_model_id(&request.model);
        Self::validate_tool_message_pairing(&request.messages)?;

        let messages = Self::wire_messages(request);
        let tools = request.tools.as_deref().map(to_crate_tool_definitions);
        let req = agiworkforce_llm::ChatRequest {
            model: &wire_model,
            messages: &messages,
            // FIX-007: clamp through PER_REQUEST_MAX_TOKENS_CEILING.
            max_tokens: clamp_max_tokens(Some(request.max_tokens.unwrap_or(4096)))
                .0
                .unwrap_or(4096),
            temperature: request.temperature,
            tools: tools.as_deref(),
            tool_choice: request.tool_choice.as_ref().map(Self::map_tool_choice),
            thinking_budget: None,
            anthropic_thinking: Self::map_thinking(request.thinking.as_ref()),
            effort: request.effort.as_deref(),
            top_p: request.top_p,
            top_k: request.top_k,
            metadata: request.metadata.as_ref(),
            reasoning_effort: None,
            gemini_thinking_budget: None,
            num_ctx: None,
            ollama_think: None,
            idle_timeout: std::time::Duration::from_secs(0),
        };
        let mut body = agiworkforce_llm::build_anthropic_request_body(&req);
        // The crate engine is streaming-only and hardcodes `stream: true`;
        // the desktop's blocking send path omits the field.
        if !request.stream {
            if let Some(obj) = body.as_object_mut() {
                obj.remove("stream");
            }
        }
        Ok(body)
    }

    /// LEGACY TWIN — the pre-c3 request builder, now the FALLBACK for request
    /// shapes [`Self::crate_expressible`] cannot route to the shared crate
    /// serializer (structured outputs, server tools, documents, explicit
    /// cache_control, audio/background/continuity). Slated for the
    /// founder-gated twin-deletion once the crate expresses those shapes; the
    /// c2c oracle vendors nothing from here — it calls this arm directly as
    /// its OLD side.
    pub(crate) fn adapt_request_legacy(
        request: &LLMRequest,
    ) -> Result<Value, Box<dyn Error + Send + Sync>> {
        // Resolve the wire API model ID: catalog keys carrying a dotted internal
        // id (e.g. "claude-haiku-4.5") must be translated to the real Anthropic
        // API string ("claude-haiku-4-5") before being sent in the request body.
        // `get_api_model_id` returns the `apiModelId` from models.json when set
        // (and is idempotent for an already-wire id), otherwise the input
        // unchanged. Using `get_canonicalized_id` here instead would send the
        // dotted internal id on the wire and Anthropic returns a 404.
        let wire_model = super::models_config::get_api_model_id(&request.model);

        // ── Validate tool message pairing ────────────────────────────
        // Ensure every tool result message has a matching tool_use block
        // in a preceding assistant message.  Orphaned tool results would
        // cause Anthropic API errors.
        Self::validate_tool_message_pairing(&request.messages)?;

        // ── Build messages array, handling multimodal content ────────
        // Anthropic requires images encoded as content-block arrays with
        // source.type = "base64".  Plain text messages are passed through
        // as-is; messages that carry `multimodal_content` are converted
        // into the Anthropic multi-block format.
        //
        // IMPORTANT: Anthropic does NOT accept role="tool".  Tool result
        // messages must use role="user" with content blocks of type
        // "tool_result".  We detect tool-result-bearing messages in both
        // the multimodal and plain-text paths and always emit role="user".
        let messages: Vec<Value> = {
            use base64::{engine::general_purpose::STANDARD, Engine as _};
            let mut out = Vec::with_capacity(request.messages.len());
            for msg in &request.messages {
                if let Some(parts) = &msg.multimodal_content {
                    let mut content_blocks: Vec<Value> = Vec::new();
                    // Track whether this multimodal message contains any
                    // tool_result blocks so we can force role="user".
                    let mut has_tool_result = false;
                    for part in parts {
                        match part {
                            super::ContentPart::Image { image } => {
                                let base64_data = STANDARD.encode(&image.data);
                                let media_type = image.format.mime_type();
                                content_blocks.push(serde_json::json!({
                                    "type": "image",
                                    "source": {
                                        "type": "base64",
                                        "media_type": media_type,
                                        "data": base64_data
                                    }
                                }));
                            }
                            super::ContentPart::Text { text } => {
                                content_blocks.push(serde_json::json!({
                                    "type": "text",
                                    "text": text
                                }));
                            }
                            super::ContentPart::Document { document } => {
                                let base64_data = STANDARD.encode(&document.data);
                                let media_type = match document.format {
                                    super::DocumentFormat::Pdf => "application/pdf",
                                    super::DocumentFormat::Docx => {
                                        "application/vnd.openxmlformats-officedocument.wordprocessingml.document"
                                    }
                                    super::DocumentFormat::Html => "text/html",
                                    super::DocumentFormat::Md | super::DocumentFormat::Txt => {
                                        "text/plain"
                                    }
                                };
                                let mut doc_block = serde_json::json!({
                                    "type": "document",
                                    "source": {
                                        "type": "base64",
                                        "media_type": media_type,
                                        "data": base64_data
                                    }
                                });
                                if let Some(name) = &document.name {
                                    doc_block["title"] = serde_json::json!(name);
                                }
                                content_blocks.push(doc_block);
                            }
                            super::ContentPart::ToolUse { tool_use } => {
                                content_blocks.push(serde_json::json!({
                                    "type": "tool_use",
                                    "id": tool_use.id,
                                    "name": tool_use.name,
                                    "input": tool_use.input
                                }));
                            }
                            super::ContentPart::ToolResult { tool_result } => {
                                has_tool_result = true;
                                tracing::debug!(
                                    "[Anthropic] Tool message {} paired with tool_use block",
                                    tool_result.tool_use_id
                                );
                                content_blocks.push(serde_json::json!({
                                    "type": "tool_result",
                                    "tool_use_id": tool_result.tool_use_id,
                                    "content": tool_result.content,
                                    "is_error": tool_result.is_error
                                }));
                            }
                            _ => {
                                tracing::warn!(
                                    "[Anthropic] Unsupported content part type in multimodal message, skipping"
                                );
                            }
                        }
                    }
                    // If the plain text content is non-empty and no Text block
                    // was added from parts, append it so nothing is lost.
                    if !msg.content.is_empty()
                        && !content_blocks
                            .iter()
                            .any(|b| b.get("type").and_then(|t| t.as_str()) == Some("text"))
                    {
                        content_blocks.push(serde_json::json!({
                            "type": "text",
                            "text": msg.content
                        }));
                    }
                    // Determine the correct Anthropic role.
                    // - Messages with tool_result blocks MUST use role="user"
                    //   (Anthropic does not accept role="tool").
                    // - Messages with role="tool" (OpenAI style) MUST become
                    //   role="user".
                    // - Otherwise preserve the original role.
                    let anthropic_role = if has_tool_result || msg.role == "tool" {
                        "user"
                    } else {
                        &msg.role
                    };
                    out.push(serde_json::json!({
                        "role": anthropic_role,
                        "content": content_blocks
                    }));
                } else if msg.role == "tool" {
                    // Convert OpenAI-style tool result messages to Anthropic format.
                    // Anthropic expects role="user" with a tool_result content block.
                    let tool_use_id = match msg.tool_call_id.as_deref() {
                        Some(id) => id,
                        None => {
                            tracing::warn!(
                                "[Anthropic] Tool result message missing tool_call_id; falling back to 'unknown'. \
                                 This may cause API errors with Anthropic."
                            );
                            "unknown"
                        }
                    };
                    tracing::debug!(
                        "[Anthropic] Tool message {} paired with tool_use block",
                        tool_use_id
                    );
                    out.push(serde_json::json!({
                        "role": "user",
                        "content": [{
                            "type": "tool_result",
                            "tool_use_id": tool_use_id,
                            "content": msg.content
                        }]
                    }));
                } else if let Some(tool_calls) = &msg.tool_calls {
                    // Convert OpenAI-style assistant tool_calls to Anthropic format.
                    // Anthropic expects content blocks with type="tool_use".
                    let mut content_blocks: Vec<Value> = Vec::new();
                    if !msg.content.is_empty() {
                        content_blocks.push(serde_json::json!({
                            "type": "text",
                            "text": msg.content
                        }));
                    }
                    for tc in tool_calls {
                        let input: Value = serde_json::from_str(&tc.arguments)
                            .unwrap_or_else(|_| serde_json::json!({}));
                        content_blocks.push(serde_json::json!({
                            "type": "tool_use",
                            "id": tc.id,
                            "name": tc.name,
                            "input": input
                        }));
                    }
                    out.push(serde_json::json!({
                        "role": "assistant",
                        "content": content_blocks
                    }));
                } else {
                    // Plain text message – pass through verbatim
                    out.push(serde_json::json!({
                        "role": msg.role,
                        "content": msg.content
                    }));
                }
            }
            out
        };

        // Anthropic uses Messages API format with flat tool definitions
        let mut anthropic_request = serde_json::json!({
            "model": wire_model,
            // FIX-007: clamp through PER_REQUEST_MAX_TOKENS_CEILING.
            "max_tokens": clamp_max_tokens(Some(request.max_tokens.unwrap_or(4096))).0.unwrap_or(4096),
            "messages": messages,
        });

        // ── System prompt with prompt caching ────────────────────────
        // When cache_control is requested we wrap the system prompt in
        // a content-block array with a cache_control marker, which
        // enables Anthropic's prompt caching (up to 90 % cost savings).
        if let Some(system) = &request.system {
            if request.cache_control.is_some() {
                anthropic_request["system"] = serde_json::json!([
                    {
                        "type": "text",
                        "text": system,
                        "cache_control": { "type": "ephemeral" }
                    }
                ]);
            } else {
                anthropic_request["system"] = serde_json::json!(system);
            }
        }

        // ── Tools ────────────────────────────────────────────────────
        // Anthropic has two tool formats:
        //   1. Client tools  → { "name", "description", "input_schema" }
        //   2. Server tools  → { "type": "<versioned>", "name", ... }
        // We detect known server-tool names and serialise them correctly.
        if let Some(tools) = &request.tools {
            use crate::core::llm::server_tools;

            let anthropic_tools: Vec<Value> = tools
                .iter()
                .filter_map(|tool| {
                    let tool_name = &tool.name;

                    // Check if this is a known Anthropic server-side tool
                    if server_tools::is_anthropic_server_tool(tool_name) {
                        // Use the server-tool definition format
                        server_tools::build_server_tool_definition(tool_name)
                    } else {
                        // Regular client tool – flat format with input_schema
                        Some(serde_json::json!({
                            "name": tool_name,
                            "description": &tool.description,
                            "input_schema": &tool.parameters
                        }))
                    }
                })
                .collect();

            if !anthropic_tools.is_empty() {
                anthropic_request["tools"] = serde_json::json!(anthropic_tools);
            }

            // ── Tool choice (Anthropic format) ──────────────────────
            // Anthropic expects: {"type":"auto"}, {"type":"any"}, {"type":"tool","name":"..."}
            // "none" is expressed by omitting tool_choice entirely.
            if let Some(ref tool_choice) = request.tool_choice {
                use super::ToolChoice;
                match tool_choice {
                    ToolChoice::Auto => {
                        anthropic_request["tool_choice"] = serde_json::json!({"type": "auto"});
                    }
                    ToolChoice::Required => {
                        anthropic_request["tool_choice"] = serde_json::json!({"type": "any"});
                    }
                    ToolChoice::Specific(name) => {
                        anthropic_request["tool_choice"] = serde_json::json!({
                            "type": "tool",
                            "name": name
                        });
                    }
                    ToolChoice::None => {
                        // Anthropic: omitting tool_choice means no tools will be called.
                    }
                }
            }
        }

        // ── Sampling parameters ──────────────────────────────────────
        if let Some(temp) = request.temperature {
            anthropic_request["temperature"] = serde_json::json!(temp);
        }
        if let Some(top_p) = request.top_p {
            anthropic_request["top_p"] = serde_json::json!(top_p);
        }
        if let Some(top_k) = request.top_k {
            anthropic_request["top_k"] = serde_json::json!(top_k);
        }

        // ── Streaming ────────────────────────────────────────────────
        if request.stream {
            anthropic_request["stream"] = serde_json::json!(true);
        }

        // ── Extended thinking / adaptive thinking ────────────────────
        // Anthropic expects: {"type":"enabled","budget_tokens":N} or {"type":"adaptive"}.
        // The ThinkingParameter::Enabled variant serializes as a bare boolean via
        // serde(untagged), so we must map it explicitly to Anthropic's format.
        //
        // IMPORTANT constraints when thinking is enabled:
        //   1. `temperature` must be omitted (defaults to 1) — any other value
        //      causes a 400 error from the Anthropic API.
        //   2. `max_tokens` must be >= budget_tokens + 1, otherwise the API
        //      rejects the request because there are no tokens left for output.
        let mut thinking_budget_tokens: Option<u32> = None;
        if let Some(thinking) = &request.thinking {
            use super::ThinkingParameter;
            match thinking {
                ThinkingParameter::Enabled(true) => {
                    let budget = 8192u32;
                    anthropic_request["thinking"] = serde_json::json!({
                        "type": "enabled",
                        "budget_tokens": budget
                    });
                    thinking_budget_tokens = Some(budget);
                }
                ThinkingParameter::Enabled(false) => {
                    anthropic_request["thinking"] = serde_json::json!({
                        "type": "disabled"
                    });
                }
                ThinkingParameter::Level {
                    level,
                    max_thinking_tokens,
                } => {
                    let budget = max_thinking_tokens.unwrap_or(match level.as_str() {
                        "low" => 2048,
                        "medium" => 8192,
                        "high" => 16384,
                        "extreme" => 32768,
                        _ => 8192,
                    });
                    anthropic_request["thinking"] = serde_json::json!({
                        "type": "enabled",
                        "budget_tokens": budget
                    });
                    thinking_budget_tokens = Some(budget);
                }
                ThinkingParameter::Budget { budget_tokens, .. } => {
                    anthropic_request["thinking"] = serde_json::json!({
                        "type": "enabled",
                        "budget_tokens": budget_tokens
                    });
                    thinking_budget_tokens = Some(*budget_tokens);
                }
                ThinkingParameter::Adaptive { .. } => {
                    anthropic_request["thinking"] = serde_json::json!({
                        "type": "adaptive"
                    });
                    // Adaptive thinking has no fixed budget; the model decides.
                    // Still remove temperature below but no max_tokens adjustment.
                    thinking_budget_tokens = Some(0);
                }
            }
        }

        // When thinking is enabled Anthropic requires temperature to be
        // exactly 1 (the default when omitted).  Remove any explicitly set
        // temperature so the API does not reject the request.
        if let Some(budget) = thinking_budget_tokens {
            anthropic_request
                .as_object_mut()
                .map(|obj| obj.remove("temperature"));

            // Ensure max_tokens is large enough to hold both the thinking
            // budget and the actual response.  The API requires
            // max_tokens >= budget_tokens; we add a comfortable margin for
            // the actual output text.
            if budget > 0 {
                let current_max = anthropic_request["max_tokens"].as_u64().unwrap_or(4096) as u32;
                let min_required = budget + 1024; // budget + at least 1024 for output
                if current_max < min_required {
                    anthropic_request["max_tokens"] = serde_json::json!(min_required);
                    tracing::debug!(
                        budget_tokens = budget,
                        old_max_tokens = current_max,
                        new_max_tokens = min_required,
                        "Increased max_tokens to accommodate thinking budget"
                    );
                }
            }
        }

        // ── Effort parameter (Claude Opus 4.6+, GA) ─────────────────
        if let Some(effort) = &request.effort {
            anthropic_request["effort"] = serde_json::json!(effort);
        }

        // ── Structured outputs (Anthropic output_config) ──────────────
        // Anthropic does NOT support OpenAI's `response_format`.  Instead it uses
        // `output_config` with a `format` field that supports `json_schema` and `text`.
        // When `output_config` is set with a JSON schema, the API guarantees the response
        // conforms to that schema exactly.
        if let Some(oc) = &request.output_config {
            use super::OutputFormat;
            match &oc.format {
                OutputFormat::JsonSchema {
                    name,
                    schema,
                    description,
                } => {
                    let mut schema_obj = serde_json::json!({
                        "type": "json_schema",
                        "name": name,
                        "schema": schema,
                    });
                    if let Some(desc) = description {
                        schema_obj["description"] = serde_json::json!(desc);
                    }
                    anthropic_request["output_config"] = serde_json::json!({
                        "format": schema_obj
                    });
                    tracing::info!(
                        schema_name = %name,
                        "Anthropic structured output requested (json_schema)"
                    );
                }
                OutputFormat::Text => {
                    // Text is the default; no need to set output_config.
                    // But set it explicitly if the caller requested it.
                    anthropic_request["output_config"] = serde_json::json!({
                        "format": { "type": "text" }
                    });
                }
            }
        }

        // ── Metadata ─────────────────────────────────────────────────
        if let Some(metadata) = &request.metadata {
            anthropic_request["metadata"] = metadata.clone();
        }

        Ok(anthropic_request)
    }
}

impl ProviderAdapter for AnthropicAdapter {
    fn adapt_request(&self, request: &LLMRequest) -> Result<Value, Box<dyn Error + Send + Sync>> {
        if Self::crate_expressible(request) {
            Self::adapt_request_via_crate(request)
        } else {
            Self::adapt_request_legacy(request)
        }
    }

    fn adapt_response(
        &self,
        response: &Value,
    ) -> Result<LLMResponse, Box<dyn Error + Send + Sync>> {
        // Extract content - Anthropic returns content blocks array
        let mut content = String::new();
        let mut tool_calls_vec = Vec::new();
        let mut reasoning_content: Option<String> = None;

        if let Some(content_blocks) = response["content"].as_array() {
            for block in content_blocks {
                match block["type"].as_str() {
                    Some("text") => {
                        if let Some(text) = block["text"].as_str() {
                            content.push_str(text);
                        }
                    }

                    // ── Client-side tool use ─────────────────────────
                    Some("tool_use") => {
                        if let (Some(id), Some(name), Some(input)) = (
                            block["id"].as_str(),
                            block["name"].as_str(),
                            block.get("input"),
                        ) {
                            tool_calls_vec.push(ToolCall {
                                id: id.to_string(),
                                name: name.to_string(),
                                arguments: serde_json::to_string(input)
                                    .unwrap_or_else(|_| "{}".to_string()),
                            });
                        }
                    }

                    // ── Server-side tool use (web_search, web_fetch, etc.) ──
                    // Server tools are executed by Anthropic's API.  We
                    // still surface them as tool calls so the agentic loop
                    // and UI can display what happened.  The results are
                    // in subsequent `web_search_tool_result` blocks which
                    // are transparently consumed by the model.
                    Some("server_tool_use") => {
                        if let (Some(id), Some(name), Some(input)) = (
                            block["id"].as_str(),
                            block["name"].as_str(),
                            block.get("input"),
                        ) {
                            tool_calls_vec.push(ToolCall {
                                id: id.to_string(),
                                name: format!("__server__{}", name), // prefix to skip client execution
                                arguments: serde_json::to_string(input)
                                    .unwrap_or_else(|_| "{}".to_string()),
                            });
                        }
                    }

                    // ── Server tool result blocks ────────────────────
                    // These contain the search/fetch results.  We don't
                    // need to act on them (the model consumes them), but
                    // we append a note to the content for UI visibility.
                    Some("web_search_tool_result") => {
                        // Results are encrypted and consumed by the model.
                        // Count how many results were returned for logging.
                        let result_count = block
                            .get("content")
                            .and_then(|c| c.as_array())
                            .map(|a| a.len())
                            .unwrap_or(0);
                        tracing::debug!(
                            "[Anthropic] web_search_tool_result with {} results",
                            result_count
                        );
                    }
                    Some("web_fetch_tool_result") => {
                        tracing::debug!("[Anthropic] web_fetch_tool_result received");
                    }

                    // ── Thinking blocks ──────────────────────────────
                    Some("thinking") => {
                        // Capture extended thinking content into reasoning_content
                        // (same field used by DeepSeek), so callers can display
                        // or log the model's chain-of-thought.
                        if let Some(thinking_text) = block.get("thinking").and_then(|v| v.as_str())
                        {
                            if reasoning_content.is_none() {
                                reasoning_content = Some(thinking_text.to_string());
                            } else if let Some(ref mut rc) = reasoning_content {
                                rc.push_str(thinking_text);
                            }
                        }
                    }

                    _ => {}
                }
            }
        }

        // Extract token usage
        let usage = &response["usage"];
        let prompt_tokens = usage["input_tokens"].as_u64().map(|v| v as u32);
        let completion_tokens = usage["output_tokens"].as_u64().map(|v| v as u32);

        // Anthropic provides cache tokens
        let cache_creation_input_tokens = usage["cache_creation_input_tokens"]
            .as_u64()
            .map(|v| v as u32);
        let cache_read_input_tokens = usage["cache_read_input_tokens"].as_u64().map(|v| v as u32);

        // Calculate total tokens
        let total_tokens = match (prompt_tokens, completion_tokens) {
            (Some(p), Some(c)) => Some(p + c),
            _ => None,
        };

        let tool_calls = if tool_calls_vec.is_empty() {
            None
        } else {
            Some(tool_calls_vec)
        };

        let finish_reason = response["stop_reason"].as_str().map(|s| s.to_string());

        Ok(LLMResponse {
            content,
            tokens: total_tokens,
            prompt_tokens,
            completion_tokens,
            cache_creation_input_tokens,
            cache_read_input_tokens,
            model: response["model"].as_str().unwrap_or("").to_string(),
            tool_calls,
            finish_reason,
            reasoning_content,
            ..LLMResponse::default()
        })
    }

    fn provider_name(&self) -> &str {
        "Anthropic"
    }

    fn supports_prompt_caching(&self) -> bool {
        true
    }

    fn supports_extended_thinking(&self) -> bool {
        true
    }

    fn supports_batch_processing(&self) -> bool {
        true
    }

    fn supports_structured_outputs(&self) -> bool {
        true
    }
}

impl AnthropicAdapter {
    /// Validate that every tool result message has a matching tool_use block
    /// in a preceding assistant message.  Orphaned tool results would cause
    /// the Anthropic API to reject the request.
    ///
    /// We collect all tool_use IDs emitted by assistant messages (both from
    /// `tool_calls` and from multimodal `ContentPart::ToolUse` blocks), then
    /// check that every tool result references one of those IDs.
    fn validate_tool_message_pairing(
        messages: &[super::ChatMessage],
    ) -> Result<(), Box<dyn Error + Send + Sync>> {
        use std::collections::HashSet;

        let mut emitted_tool_use_ids: HashSet<String> = HashSet::new();

        for msg in messages {
            // Collect tool_use IDs from assistant messages
            if msg.role == "assistant" {
                // From OpenAI-style tool_calls
                if let Some(ref tool_calls) = msg.tool_calls {
                    for tc in tool_calls {
                        emitted_tool_use_ids.insert(tc.id.clone());
                    }
                }
                // From multimodal ToolUse content parts
                if let Some(ref parts) = msg.multimodal_content {
                    for part in parts {
                        if let super::ContentPart::ToolUse { tool_use } = part {
                            emitted_tool_use_ids.insert(tool_use.id.clone());
                        }
                    }
                }
            }

            // Validate tool result messages reference known tool_use IDs
            if msg.role == "tool" {
                if let Some(ref tool_call_id) = msg.tool_call_id {
                    if !emitted_tool_use_ids.contains(tool_call_id) {
                        tracing::error!(
                            "[Anthropic] Orphaned tool message {} has no matching tool_use block",
                            tool_call_id
                        );
                        return Err(format!(
                            "Orphaned tool message {} has no matching tool_use block in a preceding assistant message",
                            tool_call_id
                        )
                        .into());
                    }
                } else {
                    tracing::warn!(
                        "[Anthropic] Tool message with role='tool' has no tool_call_id; using fallback 'unknown'"
                    );
                }
            }

            // Validate tool results inside multimodal content parts
            if let Some(ref parts) = msg.multimodal_content {
                for part in parts {
                    if let super::ContentPart::ToolResult { tool_result } = part {
                        if !emitted_tool_use_ids.contains(&tool_result.tool_use_id) {
                            tracing::error!(
                                "[Anthropic] Orphaned tool message {} has no matching tool_use block",
                                tool_result.tool_use_id
                            );
                            return Err(format!(
                                "Orphaned tool message {} has no matching tool_use block in a preceding assistant message",
                                tool_result.tool_use_id
                            )
                            .into());
                        }
                    }
                }
            }
        }

        Ok(())
    }
}

/// Google Gemini adapter
pub(crate) struct GoogleAdapter;

impl GoogleAdapter {
    /// c3 switch predicate: can the shared crate serializer express this
    /// request byte-faithfully? Fallbacks (no silent drops):
    /// - tool schemas the legacy normalizer would CHANGE (or that require the
    ///   `parametersJsonSchema` form) — the crate passes schemas verbatim;
    /// - multimodal parts beyond Text/Image/ToolUse/ToolResult (Audio, Video,
    ///   Document) have no crate `ContentBlock`.
    /// (output_config/response_format/audio are NOT gated: the legacy gemini
    /// arm never serialized them, so dropping them is exact legacy parity.)
    fn crate_expressible(request: &LLMRequest) -> bool {
        let tools_expressible = request.tools.as_ref().map_or(true, |tools| {
            tools.iter().all(|tool| {
                !Self::requires_google_json_schema(&tool.parameters)
                    && Self::normalize_google_tool_schema(&tool.parameters) == tool.parameters
            })
        });
        let multimodal_expressible = request.messages.iter().all(|message| {
            message.multimodal_content.as_ref().map_or(true, |parts| {
                parts.iter().all(|part| {
                    matches!(
                        part,
                        super::ContentPart::Text { .. }
                            | super::ContentPart::Image { .. }
                            | super::ContentPart::ToolUse { .. }
                            | super::ContentPart::ToolResult { .. }
                    )
                })
            })
        });
        tools_expressible && multimodal_expressible
    }

    /// Resolve the Gemini thinking budget exactly as the legacy arm does:
    /// catalog-gated (`model_supports_gemini_thinking`), then the
    /// ThinkingParameter mapping, then the 0-4 `thinking_level` scale.
    fn resolve_gemini_thinking_budget(request: &LLMRequest) -> Option<u32> {
        if !super::models_config::model_supports_gemini_thinking(&request.model) {
            return None;
        }
        use super::ThinkingParameter;
        let budget = if let Some(thinking) = &request.thinking {
            match thinking {
                ThinkingParameter::Budget { budget_tokens, .. } => *budget_tokens,
                ThinkingParameter::Level { level, .. } => match level.as_str() {
                    "low" => 2048,
                    "medium" => 8192,
                    "high" => 16384,
                    "extreme" => 32768,
                    _ => 8192,
                },
                ThinkingParameter::Enabled(true) | ThinkingParameter::Adaptive { .. } => 8192,
                ThinkingParameter::Enabled(false) => 0,
            }
        } else if let Some(level) = request.thinking_level {
            match level {
                0 => 0,
                1 => 2048,
                2 => 8192,
                3 => 16384,
                _ => 32768,
            }
        } else {
            return None;
        };
        (budget > 0).then_some(budget)
    }

    /// Convert the desktop request's system + messages into crate wire
    /// messages for the Gemini dialect. Tool-result turns become "user"
    /// ToolResult blocks — the crate resolves the real FUNCTION NAME from the
    /// originating ToolUse (the legacy arm sent role "function" with the CALL
    /// ID as `functionResponse.name`, which Gemini cannot pair — a real bug
    /// the switch fixes, pinned in the oracle). Mirroring the legacy arm, a
    /// multimodal message serializes its parts only.
    fn wire_messages(request: &LLMRequest) -> Vec<agiworkforce_llm::Message> {
        use agiworkforce_llm::{ContentBlock, Message};
        use base64::{engine::general_purpose::STANDARD, Engine as _};

        let mut out = Vec::with_capacity(request.messages.len() + 1);
        if let Some(system) = &request.system {
            out.push(Message::text("system", system.clone()));
        }
        for msg in &request.messages {
            if let Some(parts) = &msg.multimodal_content {
                let blocks: Vec<ContentBlock> = parts
                    .iter()
                    .filter_map(|part| match part {
                        super::ContentPart::Text { text } => {
                            Some(ContentBlock::Text { text: text.clone() })
                        }
                        super::ContentPart::Image { image } => Some(ContentBlock::Image {
                            mime: image.format.mime_type().to_string(),
                            data_b64: STANDARD.encode(&image.data),
                        }),
                        super::ContentPart::ToolUse { tool_use } => Some(ContentBlock::ToolUse {
                            id: tool_use.id.clone(),
                            name: tool_use.name.clone(),
                            input: tool_use.input.clone(),
                        }),
                        super::ContentPart::ToolResult { tool_result } => {
                            Some(ContentBlock::ToolResult {
                                tool_use_id: tool_result.tool_use_id.clone(),
                                content: tool_result.content.clone(),
                                is_error: tool_result.is_error,
                            })
                        }
                        _ => None,
                    })
                    .collect();
                out.push(Message::blocks(&msg.role, blocks));
            } else if msg.role == "tool" {
                out.push(Message::blocks(
                    "user",
                    vec![ContentBlock::ToolResult {
                        tool_use_id: msg.tool_call_id.clone().unwrap_or_default(),
                        content: msg.content.clone(),
                        is_error: false,
                    }],
                ));
            } else if let Some(tool_calls) = &msg.tool_calls {
                let mut blocks: Vec<ContentBlock> = Vec::new();
                if !msg.content.is_empty() {
                    blocks.push(ContentBlock::Text {
                        text: msg.content.clone(),
                    });
                }
                for tc in tool_calls {
                    blocks.push(ContentBlock::ToolUse {
                        id: tc.id.clone(),
                        name: tc.name.clone(),
                        input: serde_json::from_str(&tc.arguments)
                            .unwrap_or_else(|_| serde_json::json!({})),
                    });
                }
                out.push(Message::blocks("assistant", blocks));
            } else {
                out.push(Message::text(&msg.role, msg.content.clone()));
            }
        }
        out
    }

    /// c3 (2026-07-16): build the `generateContent` body through the shared
    /// `agiworkforce-llm` serializer. Desktop-side policy stays here: the
    /// catalog-gated thinking-budget resolution. The model is URL-embedded by
    /// the HTTP layer, not body-carried, so no id mapping happens here
    /// (mirrors the legacy arm). No FIX-007 clamp either — the legacy gemini
    /// arm never clamped (legacy-parity; the clamp gap is pre-existing).
    pub(crate) fn adapt_request_via_crate(
        request: &LLMRequest,
    ) -> Result<Value, Box<dyn Error + Send + Sync>> {
        let messages = Self::wire_messages(request);
        let tools = request.tools.as_deref().map(to_crate_tool_definitions);
        let req = agiworkforce_llm::ChatRequest {
            model: &request.model,
            messages: &messages,
            max_tokens: request.max_tokens.unwrap_or(0),
            temperature: request.temperature,
            tools: tools.as_deref(),
            tool_choice: request
                .tool_choice
                .as_ref()
                .map(AnthropicAdapter::map_tool_choice),
            thinking_budget: None,
            anthropic_thinking: None,
            effort: None,
            top_p: request.top_p,
            top_k: request.top_k,
            metadata: None,
            reasoning_effort: None,
            gemini_thinking_budget: Self::resolve_gemini_thinking_budget(request),
            num_ctx: None,
            ollama_think: None,
            idle_timeout: std::time::Duration::from_secs(0),
        };
        Ok(agiworkforce_llm::build_gemini_request_body(&req))
    }
}

impl GoogleAdapter {
    /// LEGACY TWIN since c3 (2026-07-16) — see [`Self::crate_expressible`];
    /// the FALLBACK for exotic tool schemas and non-crate multimodal parts.
    /// KNOWN BUG preserved verbatim here (fixed on the crate path): tool
    /// results are sent as role "function" with the CALL ID in
    /// `functionResponse.name`. Slated for the founder-gated twin-deletion;
    /// pub(crate) so the c2c oracle can call it directly as its OLD side.
    pub(crate) fn adapt_request_legacy(
        request: &LLMRequest,
    ) -> Result<Value, Box<dyn Error + Send + Sync>> {
        // Google Gemini expects contents as [{role, parts: [{text}]}].
        // Role mapping: "assistant" -> "model", "system" is handled via systemInstruction.
        let contents: Vec<Value> = request
            .messages
            .iter()
            .filter(|msg| msg.role != "system") // system handled separately below
            .map(|msg| {
                let gemini_role = match msg.role.as_str() {
                    "assistant" => "model",
                    other => other, // "user" stays "user"
                };
                if let Some(multimodal) = &msg.multimodal_content {
                    use base64::{engine::general_purpose::STANDARD, Engine as _};
                    let parts: Vec<Value> = multimodal
                        .iter()
                        .map(|part| match part {
                            super::ContentPart::Text { text } => {
                                serde_json::json!({"text": text})
                            }
                            super::ContentPart::Image { image } => {
                                let base64_data = STANDARD.encode(&image.data);
                                let mime = image.format.mime_type();
                                serde_json::json!({
                                    "inlineData": {
                                        "mimeType": mime,
                                        "data": base64_data
                                    }
                                })
                            }
                            super::ContentPart::Audio { audio } => {
                                let base64_data = match &audio.data {
                                    super::AudioData::Bytes(bytes) => STANDARD.encode(bytes),
                                    super::AudioData::Base64(b64) => b64.clone(),
                                    super::AudioData::Uri(uri) => {
                                        // Gemini fileData for URI-based audio
                                        return serde_json::json!({
                                            "fileData": {
                                                "mimeType": audio.format.mime_type(),
                                                "fileUri": uri
                                            }
                                        });
                                    }
                                };
                                let mime = audio.format.mime_type();
                                serde_json::json!({
                                    "inlineData": {
                                        "mimeType": mime,
                                        "data": base64_data
                                    }
                                })
                            }
                            super::ContentPart::Video { video } => {
                                match &video.data {
                                    super::VideoData::Bytes(bytes) => {
                                        let base64_data = STANDARD.encode(bytes);
                                        let mime = video.format.mime_type();
                                        serde_json::json!({
                                            "inlineData": {
                                                "mimeType": mime,
                                                "data": base64_data
                                            }
                                        })
                                    }
                                    super::VideoData::Uri(uri) => {
                                        serde_json::json!({
                                            "fileData": {
                                                "mimeType": video.format.mime_type(),
                                                "fileUri": uri
                                            }
                                        })
                                    }
                                }
                            }
                            super::ContentPart::Document { document } => {
                                let base64_data = STANDARD.encode(&document.data);
                                let mime = match document.format {
                                    super::DocumentFormat::Pdf => "application/pdf",
                                    super::DocumentFormat::Docx => "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
                                    super::DocumentFormat::Txt => "text/plain",
                                    super::DocumentFormat::Html => "text/html",
                                    super::DocumentFormat::Md => "text/markdown",
                                };
                                serde_json::json!({
                                    "inlineData": {
                                        "mimeType": mime,
                                        "data": base64_data
                                    }
                                })
                            }
                            super::ContentPart::ToolUse { tool_use } => {
                                serde_json::json!({
                                    "functionCall": {
                                        "name": tool_use.name,
                                        "args": tool_use.input
                                    }
                                })
                            }
                            super::ContentPart::ToolResult { tool_result } => {
                                serde_json::json!({
                                    "functionResponse": {
                                        "name": tool_result.tool_use_id,
                                        "response": {
                                            "result": tool_result.content
                                        }
                                    }
                                })
                            }
                        })
                        .collect();
                    serde_json::json!({"role": gemini_role, "parts": parts})
                } else if msg.role == "tool" {
                    // Tool result message: convert to Gemini functionResponse
                    let fn_name = match msg.tool_call_id.as_deref() {
                        Some(id) => id,
                        None => {
                            tracing::warn!(
                                "[Gemini] Tool result message missing tool_call_id; falling back to 'unknown'. \
                                 This may cause API errors with Gemini."
                            );
                            "unknown"
                        }
                    };
                    serde_json::json!({
                        "role": "function",
                        "parts": [{
                            "functionResponse": {
                                "name": fn_name,
                                "response": {
                                    "result": msg.content
                                }
                            }
                        }]
                    })
                } else if let Some(tool_calls) = &msg.tool_calls {
                    // Assistant message with tool calls: convert to Gemini functionCall parts
                    let mut parts: Vec<Value> = Vec::new();
                    if !msg.content.is_empty() {
                        parts.push(serde_json::json!({"text": msg.content}));
                    }
                    for tc in tool_calls {
                        let args: Value = serde_json::from_str(&tc.arguments)
                            .unwrap_or_else(|_| serde_json::json!({}));
                        parts.push(serde_json::json!({
                            "functionCall": {
                                "name": tc.name,
                                "args": args
                            }
                        }));
                    }
                    serde_json::json!({"role": gemini_role, "parts": parts})
                } else {
                    serde_json::json!({
                        "role": gemini_role,
                        "parts": [{"text": msg.content}]
                    })
                }
            })
            .collect();

        let mut google_request = serde_json::json!({
            "contents": contents,
        });

        // Add generation config
        let mut generation_config = serde_json::json!({});

        if let Some(max_tokens) = request.max_tokens {
            generation_config["maxOutputTokens"] = serde_json::json!(max_tokens);
        }

        if let Some(temp) = request.temperature {
            generation_config["temperature"] = serde_json::json!(temp);
        }

        if let Some(top_p) = request.top_p {
            generation_config["topP"] = serde_json::json!(top_p);
        }

        if let Some(top_k) = request.top_k {
            generation_config["topK"] = serde_json::json!(top_k);
        }

        google_request["generationConfig"] = generation_config;

        // Google uses "tools" with "functionDeclarations" array
        if let Some(tools) = &request.tools {
            let function_declarations: Vec<Value> = tools
                .iter()
                .map(|tool| {
                    let normalized_parameters =
                        Self::normalize_google_tool_schema(&tool.parameters);
                    let mut declaration = serde_json::json!({
                        "name": &tool.name,
                        "description": &tool.description,
                    });

                    if Self::requires_google_json_schema(&tool.parameters) {
                        declaration["parametersJsonSchema"] = normalized_parameters;
                    } else {
                        declaration["parameters"] = normalized_parameters;
                    }

                    declaration
                })
                .collect();

            google_request["tools"] = serde_json::json!([{
                "functionDeclarations": function_declarations
            }]);
        }

        // Add tool_choice support for Google (toolConfig.functionCallingConfig)
        if let Some(ref tool_choice) = request.tool_choice {
            use super::ToolChoice;
            match tool_choice {
                ToolChoice::Specific(name) => {
                    google_request["toolConfig"] = serde_json::json!({
                        "functionCallingConfig": {
                            "mode": "ANY",
                            "allowedFunctionNames": [name]
                        }
                    });
                }
                ToolChoice::Auto => {
                    google_request["toolConfig"] = serde_json::json!({
                        "functionCallingConfig": { "mode": "AUTO" }
                    });
                }
                ToolChoice::Required => {
                    google_request["toolConfig"] = serde_json::json!({
                        "functionCallingConfig": { "mode": "ANY" }
                    });
                }
                ToolChoice::None => {
                    google_request["toolConfig"] = serde_json::json!({
                        "functionCallingConfig": { "mode": "NONE" }
                    });
                }
            }
        }

        // Add system instruction if present
        if let Some(system) = &request.system {
            google_request["systemInstruction"] = serde_json::json!({
                "parts": [{
                    "text": system
                }]
            });
        }

        // ── Thinking config (Gemini Pro models only) ─────────────────
        // Gemini REST API requires camelCase: thinkingConfig / thinkingBudget
        // (snake_case is silently ignored by Google's API)
        if super::models_config::model_supports_gemini_thinking(&request.model) {
            if let Some(thinking) = &request.thinking {
                use super::ThinkingParameter;
                let budget = match thinking {
                    ThinkingParameter::Budget { budget_tokens, .. } => *budget_tokens,
                    ThinkingParameter::Level { level, .. } => match level.as_str() {
                        "low" => 2048,
                        "medium" => 8192,
                        "high" => 16384,
                        "extreme" => 32768,
                        _ => 8192,
                    },
                    ThinkingParameter::Enabled(true) | ThinkingParameter::Adaptive { .. } => 8192,
                    ThinkingParameter::Enabled(false) => 0,
                };
                if budget > 0 {
                    if let Some(gen_config) = google_request.get_mut("generationConfig") {
                        gen_config["thinkingConfig"] = serde_json::json!({
                            "thinkingBudget": budget
                        });
                    }
                }
            } else if let Some(level) = request.thinking_level {
                // Map 0-4 scale to token budget
                let budget = match level {
                    0 => 0,
                    1 => 2048,
                    2 => 8192,
                    3 => 16384,
                    _ => 32768,
                };
                if budget > 0 {
                    if let Some(gen_config) = google_request.get_mut("generationConfig") {
                        gen_config["thinkingConfig"] = serde_json::json!({
                            "thinkingBudget": budget
                        });
                    }
                }
            }
        }

        Ok(google_request)
    }
}

impl ProviderAdapter for GoogleAdapter {
    fn adapt_request(&self, request: &LLMRequest) -> Result<Value, Box<dyn Error + Send + Sync>> {
        if Self::crate_expressible(request) {
            Self::adapt_request_via_crate(request)
        } else {
            Self::adapt_request_legacy(request)
        }
    }

    fn adapt_response(
        &self,
        response: &Value,
    ) -> Result<LLMResponse, Box<dyn Error + Send + Sync>> {
        // Google response format: candidates array with content parts
        let mut content = String::new();
        let mut tool_calls_vec = Vec::new();

        if let Some(candidates) = response["candidates"].as_array() {
            if let Some(candidate) = candidates.first() {
                if let Some(parts) = candidate["content"]["parts"].as_array() {
                    for part in parts {
                        if let Some(text) = part["text"].as_str() {
                            content.push_str(text);
                        } else if let Some(function_call) = part.get("functionCall") {
                            if let (Some(name), Some(args)) =
                                (function_call["name"].as_str(), function_call.get("args"))
                            {
                                // Generate a tool call ID (Google doesn't provide one)
                                let id = format!("call_{}", uuid::Uuid::new_v4());
                                tool_calls_vec.push(ToolCall {
                                    id,
                                    name: name.to_string(),
                                    arguments: serde_json::to_string(args)
                                        .unwrap_or_else(|_| "{}".to_string()),
                                });
                            }
                        }
                    }
                }
            }
        }

        // Extract token usage
        let usage = &response["usageMetadata"];
        let prompt_tokens = usage["promptTokenCount"].as_u64().map(|v| v as u32);
        let completion_tokens = usage["candidatesTokenCount"].as_u64().map(|v| v as u32);
        let total_tokens = usage["totalTokenCount"].as_u64().map(|v| v as u32);

        // Google also provides cached content token count
        let cache_read_input_tokens = usage["cachedContentTokenCount"].as_u64().map(|v| v as u32);

        let tool_calls = if tool_calls_vec.is_empty() {
            None
        } else {
            Some(tool_calls_vec)
        };

        // Extract finish reason
        let finish_reason = response["candidates"][0]["finishReason"]
            .as_str()
            .map(|s| s.to_string());

        Ok(LLMResponse {
            content,
            tokens: total_tokens,
            prompt_tokens,
            completion_tokens,
            cache_read_input_tokens,
            model: response["model"]
                .as_str()
                .or_else(|| response["modelVersion"].as_str())
                .unwrap_or("")
                .to_string(),
            tool_calls,
            finish_reason,
            ..LLMResponse::default()
        })
    }

    fn provider_name(&self) -> &str {
        "Google"
    }
}

impl GoogleAdapter {
    fn normalize_google_tool_schema(schema: &Value) -> Value {
        let mut normalized = schema.clone();
        Self::normalize_google_tool_schema_mut(&mut normalized, true);

        if normalized.is_object() && normalized.as_object().is_some_and(|map| !map.is_empty()) {
            normalized
        } else {
            serde_json::json!({
                "type": "object",
                "properties": {}
            })
        }
    }

    fn normalize_google_tool_schema_mut(schema: &mut Value, is_root: bool) {
        match schema {
            Value::Object(map) => {
                if is_root && map.get("schema").is_some_and(Self::has_google_schema_shape) {
                    if let Some(unwrapped) = map.get("schema").cloned() {
                        *schema = unwrapped;
                        Self::normalize_google_tool_schema_mut(schema, true);
                    }
                    return;
                }

                map.remove("$schema");
                if is_root {
                    map.remove("schema");
                }

                let keys: Vec<String> = map.keys().cloned().collect();
                for key in keys {
                    if let Some(value) = map.get_mut(&key) {
                        Self::normalize_google_tool_schema_mut(value, false);
                    }
                }

                if map.get("type").and_then(Value::as_str) == Some("array")
                    && !map.contains_key("items")
                {
                    map.insert("items".to_string(), serde_json::json!({}));
                }

                if !map.contains_key("type") && map.contains_key("properties") {
                    map.insert("type".to_string(), serde_json::json!("object"));
                }
            }
            Value::Array(items) => {
                for item in items {
                    Self::normalize_google_tool_schema_mut(item, false);
                }
            }
            _ => {}
        }
    }

    fn has_google_schema_shape(value: &Value) -> bool {
        value.as_object().is_some_and(|map| {
            map.contains_key("type")
                || map.contains_key("properties")
                || map.contains_key("items")
                || map.contains_key("required")
                || map.contains_key("$defs")
                || map.contains_key("definitions")
        })
    }

    fn requires_google_json_schema(schema: &Value) -> bool {
        match schema {
            Value::Object(map) => map.iter().any(|(key, value)| {
                if key == "schema" && Self::has_google_schema_shape(value) {
                    return true;
                }

                matches!(
                    key.as_str(),
                    "$schema"
                        | "$defs"
                        | "definitions"
                        | "additionalProperties"
                        | "allOf"
                        | "anyOf"
                        | "const"
                        | "contains"
                        | "dependentRequired"
                        | "dependentSchemas"
                        | "else"
                        | "examples"
                        | "if"
                        | "not"
                        | "oneOf"
                        | "patternProperties"
                        | "prefixItems"
                        | "then"
                        | "unevaluatedItems"
                        | "unevaluatedProperties"
                ) || Self::requires_google_json_schema(value)
            }),
            Value::Array(items) => items.iter().any(Self::requires_google_json_schema),
            _ => false,
        }
    }
}

/// Ollama adapter
struct OllamaAdapter;

impl ProviderAdapter for OllamaAdapter {
    fn adapt_request(&self, request: &LLMRequest) -> Result<Value, Box<dyn Error + Send + Sync>> {
        // Ollama uses OpenAI-compatible format but with some differences
        let mut ollama_request = serde_json::json!({
            "model": request.model,
            "messages": request.messages,
        });

        // Ollama supports some OpenAI parameters
        if let Some(temp) = request.temperature {
            ollama_request["temperature"] = serde_json::json!(temp);
        }

        if let Some(top_p) = request.top_p {
            ollama_request["top_p"] = serde_json::json!(top_p);
        }

        if let Some(top_k) = request.top_k {
            ollama_request["top_k"] = serde_json::json!(top_k);
        }

        if request.stream {
            ollama_request["stream"] = serde_json::json!(true);
        }

        // Ollama supports tools in nested OpenAI format
        if let Some(tools) = &request.tools {
            let ollama_tools: Vec<Value> = tools
                .iter()
                .map(|tool| {
                    serde_json::json!({
                        "type": "function",
                        "function": {
                            "name": &tool.name,
                            "description": &tool.description,
                            "parameters": &tool.parameters
                        }
                    })
                })
                .collect();
            ollama_request["tools"] = serde_json::json!(ollama_tools);
        }

        Ok(ollama_request)
    }

    fn adapt_response(
        &self,
        response: &Value,
    ) -> Result<LLMResponse, Box<dyn Error + Send + Sync>> {
        // Ollama uses similar response format to OpenAI
        // content is optional: empty when the response contains only tool_calls.
        let content = response["message"]["content"]
            .as_str()
            .unwrap_or("")
            .to_string();

        // Ollama provides token counts
        let prompt_tokens = response["prompt_eval_count"].as_u64().map(|v| v as u32);
        let completion_tokens = response["eval_count"].as_u64().map(|v| v as u32);
        let total_tokens = match (prompt_tokens, completion_tokens) {
            (Some(p), Some(c)) => Some(p + c),
            _ => None,
        };

        // Extract tool calls if present
        let tool_calls = response["message"]["tool_calls"]
            .as_array()
            .map(|calls| {
                calls
                    .iter()
                    .filter_map(|call| {
                        let id = call["id"]
                            .as_str()
                            .map(|s| s.to_string())
                            .unwrap_or_else(|| format!("call_{}", uuid::Uuid::new_v4()));
                        let name = call["function"]["name"].as_str()?.to_string();
                        // Ollama may return arguments as a JSON object or a string
                        let arguments =
                            if let Some(args_str) = call["function"]["arguments"].as_str() {
                                args_str.to_string()
                            } else if let Some(args_val) = call["function"].get("arguments") {
                                serde_json::to_string(args_val).unwrap_or_else(|_| "{}".to_string())
                            } else {
                                "{}".to_string()
                            };
                        Some(ToolCall {
                            id,
                            name,
                            arguments,
                        })
                    })
                    .collect::<Vec<_>>()
            })
            .filter(|calls| !calls.is_empty());

        let finish_reason = response["done_reason"]
            .as_str()
            .map(|s| s.to_string())
            .or_else(|| {
                // Fallback to "done" field
                if response["done"].as_bool().unwrap_or(false) {
                    Some("stop".to_string())
                } else {
                    None
                }
            });

        // L5 fix: "model" is a required field in every Ollama response; fail with a
        // descriptive error instead of silently substituting an empty string.
        let model = response["model"]
            .as_str()
            .ok_or_else(|| anyhow::anyhow!("Missing required field: model"))?
            .to_string();

        Ok(LLMResponse {
            content,
            tokens: total_tokens,
            prompt_tokens,
            completion_tokens,
            model,
            tool_calls,
            finish_reason,
            ..LLMResponse::default()
        })
    }

    fn provider_name(&self) -> &str {
        "Ollama"
    }
}

/// Perplexity adapter
///
/// Perplexity uses the OpenAI Chat Completions wire format but does **not**
/// support function calling / tools.  Sending `tools` or `tool_choice` to the
/// Perplexity API results in an HTTP 400 error, so we strip those fields
/// before delegating to the OpenAI adapter.
struct PerplexityAdapter;

impl ProviderAdapter for PerplexityAdapter {
    fn adapt_request(&self, request: &LLMRequest) -> Result<Value, Box<dyn Error + Send + Sync>> {
        // Clone the request and strip tool-related fields
        let mut stripped = request.clone();
        stripped.tools = None;
        stripped.tool_choice = None;
        OpenAIAdapter.adapt_request(&stripped)
    }

    fn adapt_response(
        &self,
        response: &Value,
    ) -> Result<LLMResponse, Box<dyn Error + Send + Sync>> {
        OpenAIAdapter.adapt_response(response)
    }

    fn provider_name(&self) -> &str {
        "Perplexity"
    }
}

/// DeepSeek adapter (handles reasoning_content)
struct DeepSeekAdapter;

impl DeepSeekAdapter {
    /// Canonicalize DeepSeek model IDs to the API-expected identifiers.
    fn canonicalize_model(model: &str) -> String {
        super::models_config::get_canonicalized_id(model)
    }
}

impl ProviderAdapter for DeepSeekAdapter {
    fn adapt_request(&self, request: &LLMRequest) -> Result<Value, Box<dyn Error + Send + Sync>> {
        // Canonicalize the model ID before delegating to OpenAI adapter
        let canonical_model = Self::canonicalize_model(&request.model);
        let mut canonicalized_request = request.clone();
        canonicalized_request.model = canonical_model;

        let adapter = OpenAIAdapter;
        adapter.adapt_request(&canonicalized_request)
    }

    fn adapt_response(
        &self,
        response: &Value,
    ) -> Result<LLMResponse, Box<dyn Error + Send + Sync>> {
        // First get the standard OpenAI response
        let adapter = OpenAIAdapter;
        let mut llm_response = adapter.adapt_response(response)?;

        // Extract reasoning_content specific to DeepSeek
        if let Some(reasoning_content) = response["choices"][0]["message"]["reasoning_content"]
            .as_str()
            .map(|s| s.to_string())
        {
            llm_response.reasoning_content = Some(reasoning_content);
        }

        // Extract reasoning tokens
        if let Some(reasoning_tokens) = response["usage"]["reasoning_tokens"]
            .as_u64()
            .map(|v| v as u32)
        {
            llm_response.reasoning_tokens = Some(reasoning_tokens);
        }

        Ok(llm_response)
    }

    fn provider_name(&self) -> &str {
        "DeepSeek"
    }

    fn supports_extended_thinking(&self) -> bool {
        true
    }
}

/// Moonshot adapter (handles reasoning_content)
struct MoonshotAdapter;

impl ProviderAdapter for MoonshotAdapter {
    fn adapt_request(&self, request: &LLMRequest) -> Result<Value, Box<dyn Error + Send + Sync>> {
        let adapter = OpenAIAdapter;
        adapter.adapt_request(request)
    }

    fn adapt_response(
        &self,
        response: &Value,
    ) -> Result<LLMResponse, Box<dyn Error + Send + Sync>> {
        let adapter = OpenAIAdapter;
        let mut llm_response = adapter.adapt_response(response)?;

        // Extract reasoning_content specific to Moonshot
        if let Some(reasoning_content) = response["choices"][0]["message"]["reasoning_content"]
            .as_str()
            .map(|s| s.to_string())
        {
            llm_response.reasoning_content = Some(reasoning_content);
        }

        if let Some(reasoning_tokens) = response["usage"]["reasoning_tokens"]
            .as_u64()
            .map(|v| v as u32)
        {
            llm_response.reasoning_tokens = Some(reasoning_tokens);
        }

        Ok(llm_response)
    }

    fn provider_name(&self) -> &str {
        "Moonshot"
    }

    fn supports_extended_thinking(&self) -> bool {
        true
    }
}

/// Zhipu/GLM adapter (handles reasoning_content)
struct ZhipuAdapter;

impl ProviderAdapter for ZhipuAdapter {
    fn adapt_request(&self, request: &LLMRequest) -> Result<Value, Box<dyn Error + Send + Sync>> {
        let adapter = OpenAIAdapter;
        let mut payload = adapter.adapt_request(request)?;

        // Zhipu API is OpenAI-compatible but rejects unsupported parameters (error 1210).
        // Only keep the fields Zhipu actually accepts.
        if let Some(obj) = payload.as_object_mut() {
            // Whitelist: only these keys are accepted by Zhipu's /chat/completions
            let allowed_keys: std::collections::HashSet<&str> = [
                "model",
                "messages",
                "stream",
                "temperature",
                "top_p",
                "max_tokens",
                "stop",
                "tools",
                "tool_choice",
            ]
            .into_iter()
            .collect();

            let keys_to_remove: Vec<String> = obj
                .keys()
                .filter(|k| !allowed_keys.contains(k.as_str()))
                .cloned()
                .collect();

            for key in keys_to_remove {
                obj.remove(&key);
            }

            // Zhipu only supports tool_choice "auto" or "none"
            if let Some(tc) = obj.get("tool_choice") {
                if tc.is_string() {
                    let val = tc.as_str().unwrap_or("");
                    if val != "auto" && val != "none" {
                        obj.remove("tool_choice");
                    }
                }
            }

            // If tools array is empty, remove it entirely
            if let Some(tools) = obj.get("tools") {
                if tools.as_array().is_some_and(|a| a.is_empty()) {
                    obj.remove("tools");
                    obj.remove("tool_choice");
                }
            }
        }

        Ok(payload)
    }

    fn adapt_response(
        &self,
        response: &Value,
    ) -> Result<LLMResponse, Box<dyn Error + Send + Sync>> {
        let adapter = OpenAIAdapter;
        let mut llm_response = adapter.adapt_response(response)?;

        // Extract reasoning_content specific to Zhipu
        if let Some(reasoning_content) = response["choices"][0]["message"]["reasoning_content"]
            .as_str()
            .map(|s| s.to_string())
        {
            llm_response.reasoning_content = Some(reasoning_content);
        }

        if let Some(reasoning_tokens) = response["usage"]["reasoning_tokens"]
            .as_u64()
            .map(|v| v as u32)
        {
            llm_response.reasoning_tokens = Some(reasoning_tokens);
        }

        Ok(llm_response)
    }

    fn provider_name(&self) -> &str {
        "Zhipu"
    }

    fn supports_extended_thinking(&self) -> bool {
        true
    }
}

// ---------------------------------------------------------------------------
// Bedrock adapter (Converse API)
// ---------------------------------------------------------------------------

/// Adapter for AWS Bedrock Converse API format.
///
/// Note: The BedrockProvider handles its own request building and SigV4 signing
/// internally, so this adapter is primarily used when Bedrock is routed through
/// the DirectApiProvider path. In practice, the BedrockProvider uses
/// `build_converse_request()` directly. This adapter provides a consistent
/// interface for the ProviderAdapterFactory.
struct BedrockAdapter;

impl ProviderAdapter for BedrockAdapter {
    fn adapt_request(&self, request: &LLMRequest) -> Result<Value, Box<dyn Error + Send + Sync>> {
        Ok(crate::core::llm::providers::bedrock::build_converse_request_for_adapter(request))
    }

    fn adapt_response(
        &self,
        response: &Value,
    ) -> Result<LLMResponse, Box<dyn Error + Send + Sync>> {
        crate::core::llm::providers::bedrock::parse_converse_response_for_adapter(
            response,
            "bedrock-model",
        )
    }

    fn provider_name(&self) -> &str {
        "Bedrock"
    }
}
