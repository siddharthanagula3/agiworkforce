//! Provider adapters for translating between AGI Workforce's unified format and provider-specific formats.
//!
//! This module provides adapters that handle the differences in request/response formats across
//! various LLM providers (OpenAI, Anthropic, Google, DeepSeek, etc.).

use super::{LLMRequest, LLMResponse, Provider, ToolCall};
use anyhow;
use serde::{Deserialize, Serialize};
use serde_json::Value;
use std::error::Error;

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
    /// Image generation tool (DALL-E)
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
        model: Option<String>, // "dall-e-2" or "dall-e-3"
        #[serde(skip_serializing_if = "Option::is_none")]
        quality: Option<String>, // "standard" or "hd"
        #[serde(skip_serializing_if = "Option::is_none")]
        size: Option<String>, // "1024x1024", "1792x1024", etc.
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
            Provider::Perplexity => Box::new(OpenAIAdapter), // Perplexity uses OpenAI format
            Provider::XAI => Box::new(OpenAIAdapter),        // XAI/Grok uses OpenAI format
            Provider::DeepSeek => Box::new(DeepSeekAdapter),
            Provider::Qwen => Box::new(OpenAIAdapter), // Qwen uses OpenAI-compatible format
            Provider::Moonshot => Box::new(MoonshotAdapter),
            Provider::Zhipu => Box::new(ZhipuAdapter),
            Provider::ManagedCloud => Box::new(OpenAIAdapter), // ManagedCloud proxies OpenAI format
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
struct OpenAIAdapter;

impl ProviderAdapter for OpenAIAdapter {
    fn adapt_request(&self, request: &LLMRequest) -> Result<Value, Box<dyn Error + Send + Sync>> {
        // Determine if we should use Responses API (for gpt-5+) or Chat Completions API
        let use_responses_api = request.model.starts_with("gpt-5")
            || request.model.starts_with("o3")
            || request.model.starts_with("o4");

        if use_responses_api {
            self.adapt_to_responses_api(request)
        } else {
            self.adapt_to_chat_completions_api(request)
        }
    }

    fn adapt_response(
        &self,
        response: &Value,
    ) -> Result<LLMResponse, Box<dyn Error + Send + Sync>> {
        // Check if this is a Responses API response or Chat Completions API response
        if response.get("output").is_some() {
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
    fn codex_model_effort_override(model: &str) -> Option<&'static str> {
        if model.ends_with("-low") {
            Some("low")
        } else if model.ends_with("-medium") {
            Some("medium")
        } else if model.ends_with("-high") || model.ends_with("-xhigh") {
            // OpenAI reasoning.effort does not have xhigh, map to high.
            Some("high")
        } else {
            None
        }
    }

    fn canonicalize_model(model: &str) -> String {
        // Normalize all gpt-5.2-codex effort variants and legacy gpt-5-codex alias to
        // the canonical OpenAI API model ID "gpt-5.2-codex".
        if model.starts_with("gpt-5.2-codex-") || model == "gpt-5.2-codex" || model == "gpt-5-codex"
        {
            "gpt-5.2-codex".to_string()
        } else if model == "gpt-5-pro" || model == "gpt-5-pro-2026-01" {
            // Normalize legacy/internal gpt-5-pro IDs to canonical OpenAI API model ID.
            "gpt-5.2-pro".to_string()
        } else if model == "grok-4" {
            // Normalize the generic grok-4 alias to the canonical versioned xAI model ID.
            "grok-4-0709".to_string()
        } else {
            model.to_string()
        }
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
    ) -> Result<(Value, u32), Box<dyn Error + Send + Sync>> {
        let mut processed_parts = Vec::new();
        let mut total_image_tokens = 0u32;

        for part in content_parts {
            match part {
                super::ContentPart::Text { text } => {
                    processed_parts.push(serde_json::json!({
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

                    processed_parts.push(serde_json::json!({
                        "type": "input_image",
                        "source": {
                            "type": "url",
                            "url": image_url,
                            "detail": detail_str
                        }
                    }));
                }
                super::ContentPart::ToolUse { tool_use } => {
                    processed_parts.push(serde_json::json!({
                        "type": "function_call",
                        "id": tool_use.id,
                        "name": tool_use.name,
                        "arguments": serde_json::to_string(&tool_use.input)?
                    }));
                }
                super::ContentPart::ToolResult { tool_result } => {
                    let mut tool_result_json = serde_json::json!({
                        "type": "function_result",
                        "call_id": tool_result.tool_use_id,
                        "output": tool_result.content
                    });
                    if tool_result.is_error {
                        tool_result_json["is_error"] = serde_json::json!(true);
                    }
                    processed_parts.push(tool_result_json);
                }
                _ => {
                    tracing::warn!("Unsupported content type in Responses API multimodal content");
                }
            }
        }

        Ok((serde_json::json!(processed_parts), total_image_tokens))
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

    /// Adapt request to modern Responses API format (gpt-5+, o3, o4-mini)
    fn adapt_to_responses_api(
        &self,
        request: &LLMRequest,
    ) -> Result<Value, Box<dyn Error + Send + Sync>> {
        let canonical_model = Self::canonicalize_model(&request.model);
        let codex_effort_override = Self::codex_model_effort_override(&request.model);

        let mut api_request = serde_json::json!({
            "model": canonical_model,
        });

        // Add previous_response_id for conversation continuity
        if let Some(prev_response_id) = &request.previous_response_id {
            api_request["previous_response_id"] = serde_json::json!(prev_response_id);
        }

        // Convert messages to input format with vision support
        if request.messages.len() == 1 && request.messages[0].role == "user" {
            // Check if message has multimodal content (images, etc.)
            if let Some(multimodal_content) = &request.messages[0].multimodal_content {
                let (processed_content, _image_tokens) =
                    self.process_multimodal_content_responses(multimodal_content)?;
                api_request["input"] = processed_content;
            } else {
                // Simple case: single user message with text only
                api_request["input"] = serde_json::json!(request.messages[0].content.clone());
            }
        } else {
            // Complex case: multiple messages with roles
            let mut processed_messages = Vec::new();
            for msg in &request.messages {
                if let Some(multimodal_content) = &msg.multimodal_content {
                    let (processed_content, _image_tokens) =
                        self.process_multimodal_content_responses(multimodal_content)?;
                    processed_messages.push(serde_json::json!({
                        "role": msg.role,
                        "content": processed_content
                    }));
                } else {
                    processed_messages.push(serde_json::json!({
                        "role": msg.role,
                        "content": msg.content
                    }));
                }
            }
            api_request["input"] = serde_json::json!(processed_messages);
        }

        // Add instructions (system prompt)
        if let Some(system) = &request.system {
            api_request["instructions"] = serde_json::json!(system);
        }

        // Add reasoning effort for reasoning models
        if request.model.starts_with("gpt-5") || request.model.starts_with("o") {
            if let Some(thinking) = &request.thinking {
                use super::ThinkingParameter;
                // Map our thinking parameter to reasoning.effort
                match thinking {
                    ThinkingParameter::Budget { budget_tokens, .. } => {
                        // Map budget tokens to effort level
                        let effort = if *budget_tokens < 1000 {
                            "low"
                        } else if *budget_tokens < 5000 {
                            "medium"
                        } else {
                            "high"
                        };
                        let chosen_effort = codex_effort_override.unwrap_or(effort);
                        api_request["reasoning"] = serde_json::json!({
                            "effort": chosen_effort
                        });
                    }
                    ThinkingParameter::Level { level, .. } => {
                        // Map thinking level to effort
                        let effort = match level.as_str() {
                            "low" => "low",
                            "medium" => "medium",
                            "high" | "extreme" => "high",
                            _ => "medium",
                        };
                        let chosen_effort = codex_effort_override.unwrap_or(effort);
                        api_request["reasoning"] = serde_json::json!({
                            "effort": chosen_effort
                        });
                    }
                    ThinkingParameter::Enabled(true) => {
                        let chosen_effort = codex_effort_override.unwrap_or("medium");
                        api_request["reasoning"] = serde_json::json!({
                            "effort": chosen_effort
                        });
                    }
                    ThinkingParameter::Enabled(false) => {
                        // Don't add reasoning parameter if disabled
                    }
                    ThinkingParameter::Adaptive { .. } => {
                        // OpenAI Responses API doesn't expose an "adaptive" reasoning mode.
                        // Use a balanced default unless explicitly overridden.
                        let chosen_effort = codex_effort_override.unwrap_or("medium");
                        api_request["reasoning"] = serde_json::json!({
                            "effort": chosen_effort
                        });
                    }
                }
            } else if let Some(effort) = codex_effort_override {
                api_request["reasoning"] = serde_json::json!({
                    "effort": effort
                });
            }
        }

        // Add response format (structured outputs)
        if let Some(format) = &request.response_format {
            if let Some(json_schema) = &format.json_schema {
                api_request["text"] = serde_json::json!({
                    "format": "json_schema",
                    "json_schema": json_schema
                });
            }
        }

        // Add temperature
        if let Some(temp) = request.temperature {
            api_request["temperature"] = serde_json::json!(temp);
        }

        // Add max_tokens
        if let Some(max_tokens) = request.max_tokens {
            api_request["max_tokens"] = serde_json::json!(max_tokens);
        }

        // Add tools (nested format)
        if let Some(tools) = &request.tools {
            api_request["tools"] = self.adapt_tools_to_nested_format(tools)?;
        }

        // Add streaming
        if request.stream {
            api_request["stream"] = serde_json::json!(true);
        }

        // Add top_p
        if let Some(top_p) = request.top_p {
            api_request["top_p"] = serde_json::json!(top_p);
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

    /// Adapt request to legacy Chat Completions API format
    fn adapt_to_chat_completions_api(
        &self,
        request: &LLMRequest,
    ) -> Result<Value, Box<dyn Error + Send + Sync>> {
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
            "model": request.model,
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

        // Add max_tokens
        if let Some(max_tokens) = request.max_tokens {
            api_request["max_tokens"] = serde_json::json!(max_tokens);
        }

        // Add tools (nested format for OpenAI)
        if let Some(tools) = &request.tools {
            api_request["tools"] = self.adapt_tools_to_nested_format(tools)?;
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
        if let Some(format) = &request.response_format {
            api_request["response_format"] = serde_json::to_value(format)?;
        }

        // Add audio output configuration (for audio responses)
        if let Some(audio_output) = &request.audio_output {
            api_request["audio"] = self.adapt_audio_output(audio_output)?;
        }

        Ok(api_request)
    }

    /// Convert tools to OpenAI's nested format
    /// Detects and handles built-in server-side tools (web_search, code_interpreter, etc.)
    fn adapt_tools_to_nested_format(
        &self,
        tools: &[super::ToolDefinition],
    ) -> Result<Value, Box<dyn Error + Send + Sync>> {
        let nested_tools: Vec<Value> = tools
            .iter()
            .map(|tool| {
                let tool_name = tool.name();

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
        let normalized_params = Self::normalize_array_items_in_schema(tool.parameters());
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
    #[allow(dead_code)]
    fn process_audio_content(
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
                .get("id")
                .and_then(Value::as_str)
                .or_else(|| value.get("call_id").and_then(Value::as_str))
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
        // Extract text from output array
        let mut content = String::new();
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

        let finish_reason = response["status"].as_str().map(|s| s.to_string());
        let response_id = response["id"].as_str().map(|s| s.to_string());

        Ok(LLMResponse {
            content,
            tokens: total_tokens,
            prompt_tokens,
            completion_tokens,
            reasoning_tokens,
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

/// Anthropic Claude adapter
struct AnthropicAdapter;

impl ProviderAdapter for AnthropicAdapter {
    fn adapt_request(&self, request: &LLMRequest) -> Result<Value, Box<dyn Error + Send + Sync>> {
        let canonical_model = Self::canonicalize_model(&request.model);

        // Anthropic uses Messages API format with flat tool definitions
        let mut anthropic_request = serde_json::json!({
            "model": canonical_model,
            "max_tokens": request.max_tokens.unwrap_or(4096),
            "messages": request.messages,
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
                    let tool_name = tool.name();

                    // Check if this is a known Anthropic server-side tool
                    if server_tools::is_anthropic_server_tool(tool_name) {
                        // Use the server-tool definition format
                        server_tools::build_server_tool_definition(tool_name)
                    } else {
                        // Regular client tool – flat format with input_schema
                        Some(serde_json::json!({
                            "name": tool_name,
                            "description": tool.description(),
                            "input_schema": tool.parameters()
                        }))
                    }
                })
                .collect();

            if !anthropic_tools.is_empty() {
                anthropic_request["tools"] = serde_json::json!(anthropic_tools);
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
        if let Some(thinking) = &request.thinking {
            anthropic_request["thinking"] = serde_json::to_value(thinking)?;
        }

        // ── Effort parameter (Claude Opus 4.6+, GA) ─────────────────
        if let Some(effort) = &request.effort {
            anthropic_request["effort"] = serde_json::json!(effort);
        }

        // ── Structured outputs (response_format) ─────────────────────
        if let Some(response_format) = &request.response_format {
            anthropic_request["response_format"] = serde_json::to_value(response_format)?;
        }

        // ── Metadata ─────────────────────────────────────────────────
        if let Some(metadata) = &request.metadata {
            anthropic_request["metadata"] = metadata.clone();
        }

        Ok(anthropic_request)
    }

    fn adapt_response(
        &self,
        response: &Value,
    ) -> Result<LLMResponse, Box<dyn Error + Send + Sync>> {
        // Extract content - Anthropic returns content blocks array
        let mut content = String::new();
        let mut tool_calls_vec = Vec::new();

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
                        // Extended thinking content – not included in the
                        // main response content; could be surfaced via a
                        // separate field in the future.
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
}

impl AnthropicAdapter {
    fn canonicalize_model(model: &str) -> String {
        match model {
            // Frontend uses dotted IDs; Anthropic API expects hyphenated alias IDs.
            // Snapshot-pinned IDs (e.g. claude-sonnet-4-5-20250929) are passed through as-is.
            "claude-haiku-4.5" => "claude-haiku-4-5".to_string(),
            "claude-sonnet-4.5" => "claude-sonnet-4-5".to_string(),
            "claude-sonnet-4.6" => "claude-sonnet-4-6".to_string(),
            "claude-opus-4.6" => "claude-opus-4-6".to_string(),
            _ => model.to_string(),
        }
    }
}

/// Google Gemini adapter
struct GoogleAdapter;

impl ProviderAdapter for GoogleAdapter {
    fn adapt_request(&self, request: &LLMRequest) -> Result<Value, Box<dyn Error + Send + Sync>> {
        // Google Gemini uses a different format
        let mut google_request = serde_json::json!({
            "contents": request.messages,
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
                        Self::normalize_google_tool_schema(tool.parameters());
                    let mut declaration = serde_json::json!({
                        "name": tool.name(),
                        "description": tool.description(),
                    });

                    if Self::requires_google_json_schema(tool.parameters()) {
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

        // Add system instruction if present
        if let Some(system) = &request.system {
            google_request["systemInstruction"] = serde_json::json!({
                "parts": [{
                    "text": system
                }]
            });
        }

        Ok(google_request)
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
            model: response["modelVersion"].as_str().unwrap_or("").to_string(),
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
                if is_root
                    && map
                        .get("schema")
                        .is_some_and(Self::has_google_schema_shape)
                {
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
                            "name": tool.name(),
                            "description": tool.description(),
                            "parameters": tool.parameters()
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

/// DeepSeek adapter (handles reasoning_content)
struct DeepSeekAdapter;

impl ProviderAdapter for DeepSeekAdapter {
    fn adapt_request(&self, request: &LLMRequest) -> Result<Value, Box<dyn Error + Send + Sync>> {
        // DeepSeek uses OpenAI-compatible format with nested tools
        let adapter = OpenAIAdapter;
        adapter.adapt_request(request)
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
        adapter.adapt_request(request)
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
