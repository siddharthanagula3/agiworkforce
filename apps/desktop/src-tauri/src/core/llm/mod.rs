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
    #[serde(skip_serializing_if = "Option::is_none")]
    pub thinking_mode: Option<bool>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ChatMessage {
    pub role: String,
    pub content: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub tool_calls: Option<Vec<ToolCall>>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub tool_call_id: Option<String>,

    #[serde(skip_serializing_if = "Option::is_none")]
    pub multimodal_content: Option<Vec<ContentPart>>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(tag = "type", rename_all = "snake_case")]
pub enum ContentPart {
    Text { text: String },
    Image { image: ImageInput },
    Video { video: VideoInput },
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ImageInput {
    pub data: Vec<u8>,

    pub format: ImageFormat,

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

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct VideoInput {
    pub data: VideoData,

    pub format: VideoFormat,

    #[serde(skip_serializing_if = "Option::is_none")]
    pub duration_secs: Option<f64>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(untagged)]
pub enum VideoData {
    Bytes(Vec<u8>),

    Uri(String),
}

#[derive(Debug, Clone, Copy, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "lowercase")]
pub enum VideoFormat {
    Mp4,
    Webm,
    Mov,
    Avi,
    Mkv,
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
    #[serde(skip_serializing_if = "Option::is_none")]
    pub credits: Option<CreditsInfo>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CreditsInfo {
    pub cost_cents: f64,
    pub remaining_cents: f64,
    pub daily_limit: Option<f64>,
    pub daily_used: Option<f64>,
    pub daily_remaining: Option<f64>,
    pub daily_reset_at: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ToolDefinition {
    pub name: String,
    pub description: String,
    pub parameters: serde_json::Value,
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
    pub arguments: String,
}

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
    OpenAI,
    Anthropic,
    Google,
    Ollama,
    Perplexity,
    XAI,
    DeepSeek,
    Qwen,
    Moonshot,
    Zhipu,
    ManagedCloud,
}

impl Provider {
    #[allow(clippy::should_implement_trait)]
    pub fn as_string(&self) -> &'static str {
        match self {
            Provider::OpenAI => "openai",
            Provider::Anthropic => "anthropic",
            Provider::Google => "google",
            Provider::Ollama => "ollama",
            Provider::Perplexity => "perplexity",
            Provider::XAI => "xai",
            Provider::DeepSeek => "deepseek",
            Provider::Qwen => "qwen",
            Provider::Moonshot => "moonshot",
            Provider::Zhipu => "zhipu",
            Provider::ManagedCloud => "managed_cloud",
        }
    }

    #[allow(clippy::should_implement_trait)]
    pub fn from_string(value: &str) -> Option<Self> {
        match value.to_lowercase().as_str() {
            "openai" => Some(Provider::OpenAI),
            "anthropic" => Some(Provider::Anthropic),
            "google" => Some(Provider::Google),
            "ollama" => Some(Provider::Ollama),
            "perplexity" | "pplx" => Some(Provider::Perplexity),
            "xai" | "grok" => Some(Provider::XAI),
            "deepseek" => Some(Provider::DeepSeek),
            "qwen" | "alibaba" => Some(Provider::Qwen),
            "moonshot" | "kimi" => Some(Provider::Moonshot),
            "zhipu" | "zhipuai" | "bigmodel" | "glm" => Some(Provider::Zhipu),
            "managed_cloud" | "managedcloud" | "cloud" => Some(Provider::ManagedCloud),
            _ => None,
        }
    }

    pub fn default_model(&self) -> &'static str {
        match self {
            Provider::OpenAI => "gpt-5.2",
            Provider::Anthropic => "claude-sonnet-4-5",
            Provider::Google => "gemini-3-pro",
            Provider::Ollama => "llama4-maverick",
            Provider::Perplexity => "sonar-deep-research",
            Provider::XAI => "grok-4.1",
            Provider::DeepSeek => "deepseek-v3",
            Provider::Qwen => "qwen3-max",
            Provider::Moonshot => "kimi-k2-thinking",
            Provider::Zhipu => "glm-4.7", // GLM-4.7 is the flagship coding model
            Provider::ManagedCloud => "deepseek-v3", // Default to budget king via cloud
        }
    }

    pub fn get_model_for_task(&self, task: TaskType) -> &'static str {
        match (self, task) {
            (Provider::OpenAI, TaskType::FastCompletion) => "gpt-5-nano",
            (Provider::OpenAI, TaskType::CodeGeneration) => "gpt-5.2-codex",
            (Provider::OpenAI, TaskType::ComplexReasoning) => "o3",
            (Provider::OpenAI, TaskType::Chat) => "gpt-5.2",
            (Provider::OpenAI, TaskType::Vision) => "gpt-5.2",
            (Provider::OpenAI, TaskType::LongContext) => "gpt-5.2",

            (Provider::Anthropic, TaskType::FastCompletion) => "claude-haiku-4-5",
            (Provider::Anthropic, TaskType::CodeGeneration) => "claude-sonnet-4-5",
            (Provider::Anthropic, TaskType::ComplexReasoning) => "claude-opus-4-5",
            (Provider::Anthropic, _) => "claude-sonnet-4-5",

            (Provider::Google, TaskType::FastCompletion) => "gemini-3-flash",
            (Provider::Google, TaskType::CodeGeneration) => "gemini-3-pro",
            (Provider::Google, TaskType::ComplexReasoning) => "gemini-3-deep-think",
            (Provider::Google, TaskType::Vision) => "gemini-3-pro",
            (Provider::Google, TaskType::LongContext) => "gemini-3-pro",
            (Provider::Google, _) => "gemini-3-flash",

            (Provider::XAI, TaskType::FastCompletion) => "grok-4.1-fast",
            (Provider::XAI, TaskType::ComplexReasoning) => "grok-4.1-fast-reasoning",
            (Provider::XAI, _) => "grok-4.1",

            (Provider::DeepSeek, TaskType::CodeGeneration) => "deepseek-coder",
            (Provider::DeepSeek, TaskType::ComplexReasoning) => "deepseek-reasoner",
            (Provider::DeepSeek, _) => "deepseek-v3",

            (Provider::Qwen, TaskType::CodeGeneration) => "qwen3-coder",
            (Provider::Qwen, _) => "qwen3-max",

            (Provider::Ollama, TaskType::CodeGeneration) => "llama4-maverick",
            (Provider::Ollama, _) => "llama4-maverick",

            (Provider::Moonshot, TaskType::ComplexReasoning) => "kimi-k2-thinking",
            (Provider::Moonshot, _) => "kimi-k2-thinking",

            (Provider::Perplexity, _) => "sonar-deep-research",

            // ZhipuAI - GLM-4.7 for coding (73.8% SWE-bench), GLM-4.6V for vision
            (Provider::Zhipu, TaskType::FastCompletion) => "glm-4.6v-flash",
            (Provider::Zhipu, TaskType::CodeGeneration) => "glm-4.7",
            (Provider::Zhipu, TaskType::ComplexReasoning) => "glm-4.7",
            (Provider::Zhipu, TaskType::Vision) => "glm-4.6v",
            (Provider::Zhipu, _) => "glm-4.7",

            (Provider::ManagedCloud, TaskType::FastCompletion) => "gpt-5-nano",
            (Provider::ManagedCloud, TaskType::CodeGeneration) => "deepseek-coder",
            (Provider::ManagedCloud, TaskType::ComplexReasoning) => "deepseek-reasoner",
            (Provider::ManagedCloud, TaskType::Chat) => "deepseek-v3",
            (Provider::ManagedCloud, TaskType::Vision) => "gemini-3-flash", // Best budget vision
            (Provider::ManagedCloud, TaskType::LongContext) => "deepseek-v3",
        }
    }
}

#[async_trait::async_trait]
pub trait LLMProvider: Send + Sync {
    async fn send_message(
        &self,
        request: &LLMRequest,
    ) -> Result<LLMResponse, Box<dyn Error + Send + Sync>>;

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
                credits: None,
            },
        )])))
    }

    fn is_configured(&self) -> bool;

    fn name(&self) -> &str;

    fn supports_vision(&self) -> bool {
        false
    }

    fn supports_function_calling(&self) -> bool {
        false
    }
}

pub use llm_router::{
    CostPriority, LLMRouter, RouteCandidate, RouteOutcome, RouterContext, RouterPreferences,
    RouterSuggestion, RoutingStrategy,
};
