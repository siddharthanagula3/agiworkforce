pub mod cache_manager;
pub mod cost_calculator;
pub mod function_executor;
pub mod llm_router;
pub mod providers;
pub mod sse_parser;
pub mod token_counter;
pub mod tool_executor;

#[cfg(test)]
mod tests;

use serde::{Deserialize, Serialize};
use std::error::Error;
use std::pin::Pin;

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct LLMRequest {
    pub messages: Vec<ChatMessage>,
    pub model: String,
    pub temperature: Option<f32>,
    pub max_tokens: Option<u32>,
    pub stream: bool,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub tools: Option<Vec<ToolDefinition>>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub tool_choice: Option<ToolChoice>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ChatMessage {
    pub role: String,
    pub content: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub tool_calls: Option<Vec<ToolCall>>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub tool_call_id: Option<String>,
    /// Optional multimodal content (for vision support)
    #[serde(skip_serializing_if = "Option::is_none")]
    pub multimodal_content: Option<Vec<ContentPart>>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(tag = "type", rename_all = "snake_case")]
pub enum ContentPart {
    Text { text: String },
    Image { image: ImageInput },
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ImageInput {
    /// Raw image bytes (PNG, JPEG, WEBP)
    pub data: Vec<u8>,
    /// Image format
    pub format: ImageFormat,
    /// Detail level for vision models
    #[serde(default = "default_image_detail")]
    pub detail: ImageDetail,
}

#[derive(Debug, Clone, Copy, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "lowercase")]
pub enum ImageFormat {
    Png,
    Jpeg,
    Webp,
}

#[derive(Debug, Clone, Copy, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "lowercase")]
pub enum ImageDetail {
    Low,
    High,
    Auto,
}

fn default_image_detail() -> ImageDetail {
    ImageDetail::Auto
}

#[derive(Debug, Clone, Serialize, Deserialize, Default)]
pub struct LLMResponse {
    pub content: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub tokens: Option<u32>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub prompt_tokens: Option<u32>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub completion_tokens: Option<u32>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub cost: Option<f64>,
    pub model: String,
    #[serde(default)]
    pub cached: bool,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub tool_calls: Option<Vec<ToolCall>>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub finish_reason: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ToolDefinition {
    pub name: String,
    pub description: String,
    pub parameters: serde_json::Value, // JSON Schema
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
#[derive(Default)]
pub enum ToolChoice {
    #[default]
    Auto,
    Required,
    #[serde(rename = "none")]
    None,
    Specific(String),
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ToolCall {
    pub id: String,
    pub name: String,
    pub arguments: String, // JSON string
}

/// Task types for intelligent model routing
#[derive(Debug, Clone, Copy, Serialize, Deserialize, PartialEq, Eq)]
pub enum TaskType {
    FastCompletion,
    CodeGeneration,
    ComplexReasoning,
    Chat,
    Vision,
    LongContext,
}

#[derive(Debug, Clone, Copy, Serialize, Deserialize, PartialEq, Eq, Hash)]
pub enum Provider {
    // Existing providers
    OpenAI,
    Anthropic,
    Google,
    Ollama,
    // NEW: 2025 frontier providers
    XAI,      // Grok 4, Grok 3
    DeepSeek, // DeepSeek-V3, DeepSeek-Coder-V2
    Qwen,     // Qwen2.5-Max, Qwen3-Coder (Alibaba)
    Mistral,  // Mistral Large 2, Codestral
    Moonshot, // Kimi K2 Thinking (November 2025)
}

impl Provider {
    #[allow(clippy::should_implement_trait)]
    pub fn as_string(&self) -> &'static str {
        match self {
            Provider::OpenAI => "openai",
            Provider::Anthropic => "anthropic",
            Provider::Google => "google",
            Provider::Ollama => "ollama",
            Provider::XAI => "xai",
            Provider::DeepSeek => "deepseek",
            Provider::Qwen => "qwen",
            Provider::Mistral => "mistral",
            Provider::Moonshot => "moonshot",
        }
    }

    #[allow(clippy::should_implement_trait)]
    pub fn from_string(value: &str) -> Option<Self> {
        match value.to_lowercase().as_str() {
            "openai" => Some(Provider::OpenAI),
            "anthropic" => Some(Provider::Anthropic),
            "google" => Some(Provider::Google),
            "ollama" => Some(Provider::Ollama),
            "xai" | "grok" => Some(Provider::XAI),
            "deepseek" => Some(Provider::DeepSeek),
            "qwen" | "alibaba" => Some(Provider::Qwen),
            "mistral" | "mistralai" => Some(Provider::Mistral),
            "moonshot" | "kimi" => Some(Provider::Moonshot),
            _ => None,
        }
    }

    /// Get the default model for this provider
    pub fn default_model(&self) -> &'static str {
        match self {
            Provider::OpenAI => "gpt-5",
            Provider::Anthropic => "claude-sonnet-4-5",
            Provider::Google => "gemini-2.5-pro",
            Provider::Ollama => "llama3.1",
            Provider::XAI => "grok-4",
            Provider::DeepSeek => "deepseek-chat",
            Provider::Qwen => "qwen-max-2025-01-25",
            Provider::Mistral => "mistral-large-2",
            Provider::Moonshot => "kimi-k2-thinking",
        }
    }

    /// Get recommended model for specific task type
    pub fn get_model_for_task(&self, task: TaskType) -> &'static str {
        match (self, task) {
            // OpenAI routing
            (Provider::OpenAI, TaskType::FastCompletion) => "gpt-5-mini",
            (Provider::OpenAI, TaskType::CodeGeneration) => "gpt-5-codex",
            (Provider::OpenAI, TaskType::ComplexReasoning) => "o3",
            (Provider::OpenAI, TaskType::Chat) => "gpt-5",
            (Provider::OpenAI, TaskType::Vision) => "gpt-5-vision",
            (Provider::OpenAI, TaskType::LongContext) => "gpt-5",

            // Anthropic routing
            (Provider::Anthropic, TaskType::FastCompletion) => "claude-haiku-4-5",
            (Provider::Anthropic, TaskType::CodeGeneration) => "claude-sonnet-4-5",
            (Provider::Anthropic, TaskType::ComplexReasoning) => "claude-opus-4-1",
            (Provider::Anthropic, _) => "claude-sonnet-4-5",

            // Google routing
            (Provider::Google, TaskType::FastCompletion) => "gemini-2.5-flash",
            (Provider::Google, TaskType::CodeGeneration) => "gemini-2.5-pro",
            (Provider::Google, TaskType::Vision) => "gemini-2.5-computer-use",
            (Provider::Google, TaskType::LongContext) => "gemini-2.5-pro",
            (Provider::Google, _) => "gemini-2.5-flash",

            // XAI routing
            (Provider::XAI, TaskType::FastCompletion) => "grok-3",
            (Provider::XAI, _) => "grok-4",

            // DeepSeek routing
            (Provider::DeepSeek, TaskType::CodeGeneration) => "deepseek-coder",
            (Provider::DeepSeek, TaskType::ComplexReasoning) => "deepseek-reasoner",
            (Provider::DeepSeek, _) => "deepseek-chat",

            // Qwen routing
            (Provider::Qwen, TaskType::CodeGeneration) => "qwen3-coder",
            (Provider::Qwen, _) => "qwen-max-2025-01-25",

            // Mistral routing
            (Provider::Mistral, TaskType::CodeGeneration) => "codestral-latest",
            (Provider::Mistral, _) => "mistral-large-2",

            // Ollama defaults
            (Provider::Ollama, TaskType::CodeGeneration) => "codellama",
            (Provider::Ollama, _) => "llama3.1",

            // Moonshot routing
            (Provider::Moonshot, TaskType::ComplexReasoning) => "kimi-k2-thinking",
            (Provider::Moonshot, _) => "kimi-k2-thinking",
        }
    }
}

/// Trait that all LLM providers must implement
#[async_trait::async_trait]
pub trait LLMProvider: Send + Sync {
    /// Send a message to the LLM and get a response
    async fn send_message(
        &self,
        request: &LLMRequest,
    ) -> Result<LLMResponse, Box<dyn Error + Send + Sync>>;

    /// Send a message with streaming support
    /// Returns a stream of chunks
    async fn send_message_streaming(
        &self,
        request: &LLMRequest,
    ) -> Result<
        Pin<
            Box<
                dyn futures_util::Stream<
                        Item = Result<sse_parser::StreamChunk, Box<dyn Error + Send + Sync>>,
                    > + Send,
            >,
        >,
        Box<dyn Error + Send + Sync>,
    > {
        // Default implementation: fallback to non-streaming
        let response = self.send_message(request).await?;
        Ok(Box::pin(tokio_stream::iter(vec![Ok(
            sse_parser::StreamChunk {
                content: response.content,
                done: true,
                finish_reason: None,
                model: Some(response.model),
                usage: Some(sse_parser::TokenUsage {
                    prompt_tokens: response.prompt_tokens,
                    completion_tokens: response.completion_tokens,
                    total_tokens: response.tokens,
                }),
            },
        )])))
    }

    /// Check if the provider is configured with valid API keys
    fn is_configured(&self) -> bool;

    /// Get the provider name
    fn name(&self) -> &str;

    /// Check if this provider supports vision (image inputs)
    fn supports_vision(&self) -> bool {
        false // Default: no vision support
    }

    /// Check if this provider supports function calling
    fn supports_function_calling(&self) -> bool {
        false // Default: no function calling
    }
}

pub use llm_router::{
    CostPriority, LLMRouter, RouteCandidate, RouteOutcome, RouterContext, RouterPreferences,
    RouterSuggestion, RoutingStrategy,
};
