//! LLM routing, provider adapters, SSE streaming, cost tracking, and model management.
//!
//! Central module for all LLM interactions. The [`llm_router`] handles multi-provider
//! routing with automatic failover. [`sse_parser`] processes Server-Sent Events from
//! streaming providers. [`provider_adapter`] normalizes API formats across 22+ providers.

pub mod background_manager;
pub mod cache_manager;
pub mod capability_detection;
pub mod cost_calculator;
pub mod fallback_chain;
pub mod function_executor;
pub mod job_autofill_runtime;
pub mod llm_router;
pub mod memory_integration;
pub mod models_config;
pub mod prompt_policy;
pub mod prompt_tool_injection;
pub mod provider_adapter;
pub mod providers;
pub mod server_tools;
pub mod sse_parser;
pub mod thinking;
pub mod token_counter;
pub mod tool_executor;

#[cfg(test)]
mod tests;

use serde::{Deserialize, Serialize};
use std::error::Error;
use std::pin::Pin;

/// Default Ollama base URL used across the codebase.
pub const OLLAMA_DEFAULT_BASE_URL: &str = "http://localhost:11434";

#[derive(Debug, Clone, Serialize, Deserialize, Default)]
pub struct LLMRequest {
    pub messages: Vec<ChatMessage>,
    pub model: String,
    pub temperature: Option<f32>,
    pub max_tokens: Option<u32>,
    pub stream: bool,

    // Sampling parameters
    #[serde(skip_serializing_if = "Option::is_none")]
    pub top_p: Option<f32>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub top_k: Option<u32>,

    // System prompt
    #[serde(skip_serializing_if = "Option::is_none")]
    pub system: Option<String>,

    // Tools
    #[serde(skip_serializing_if = "Option::is_none")]
    pub tools: Option<Vec<ToolDefinition>>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub tool_choice: Option<ToolChoice>,

    // Extended thinking (Anthropic Claude 4.x)
    #[serde(skip_serializing_if = "Option::is_none")]
    pub thinking_mode: Option<bool>,

    // Thinking/reasoning configuration (cross-provider)
    #[serde(skip_serializing_if = "Option::is_none")]
    pub thinking: Option<ThinkingParameter>,

    // Google Gemini 3 thinking level (0-4 scale)
    /// Thinking level for Gemini 3 models (0=none, 1=low, 2=medium, 3=high, 4=extreme)
    #[serde(skip_serializing_if = "Option::is_none")]
    pub thinking_level: Option<u8>,

    // Response format (structured outputs)
    #[serde(skip_serializing_if = "Option::is_none")]
    pub response_format: Option<ResponseFormat>,

    // Prompt caching (Anthropic, OpenAI)
    #[serde(skip_serializing_if = "Option::is_none")]
    pub cache_control: Option<CacheControl>,

    // Audio output configuration (OpenAI TTS)
    #[serde(skip_serializing_if = "Option::is_none")]
    pub audio_output: Option<AudioOutput>,

    // Background mode (OpenAI GPT-5+)
    #[serde(skip_serializing_if = "Option::is_none")]
    pub background: Option<bool>,

    // Conversation continuity (OpenAI Responses API)
    #[serde(skip_serializing_if = "Option::is_none")]
    pub previous_response_id: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub conversation_id: Option<String>,

    // Effort parameter (Anthropic Claude Opus 4.6+ – controls thinking depth)
    // Values: "low", "medium", "high"
    #[serde(skip_serializing_if = "Option::is_none")]
    pub effort: Option<String>,

    // Request metadata
    #[serde(skip_serializing_if = "Option::is_none")]
    pub metadata: Option<serde_json::Value>,
}

impl LLMRequest {
    /// Create a new LLMRequest with minimal required fields
    pub fn new(messages: Vec<ChatMessage>, model: String) -> Self {
        Self {
            messages,
            model,
            ..Default::default()
        }
    }
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
    Audio { audio: AudioInput },
    Document { document: DocumentInput },
    ToolUse { tool_use: ToolUseInput },
    ToolResult { tool_result: ToolResultInput },
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AudioInput {
    pub data: AudioData,
    pub format: AudioFormat,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub duration_secs: Option<f64>,
}

/// Audio format for input and output
#[derive(Debug, Clone, Copy, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "lowercase")]
pub enum AudioFormat {
    Mp3,
    Wav,
    Ogg,
    Flac,
    Aac,
    Opus,
    M4a,
    Webm,
}

impl AudioFormat {
    /// Returns the file extension for this audio format
    pub fn extension(&self) -> &'static str {
        match self {
            AudioFormat::Mp3 => "mp3",
            AudioFormat::Wav => "wav",
            AudioFormat::Ogg => "ogg",
            AudioFormat::Flac => "flac",
            AudioFormat::Aac => "aac",
            AudioFormat::Opus => "opus",
            AudioFormat::M4a => "m4a",
            AudioFormat::Webm => "webm",
        }
    }

    /// Returns the MIME type for this audio format
    pub fn mime_type(&self) -> &'static str {
        match self {
            AudioFormat::Mp3 => "audio/mpeg",
            AudioFormat::Wav => "audio/wav",
            AudioFormat::Ogg => "audio/ogg",
            AudioFormat::Flac => "audio/flac",
            AudioFormat::Aac => "audio/aac",
            AudioFormat::Opus => "audio/opus",
            AudioFormat::M4a => "audio/mp4",
            AudioFormat::Webm => "audio/webm",
        }
    }
}

/// Voice options for text-to-speech audio output
#[derive(Debug, Clone, Copy, Serialize, Deserialize, PartialEq, Eq, Default)]
#[serde(rename_all = "lowercase")]
pub enum AudioVoice {
    #[default]
    Alloy,
    Echo,
    Fable,
    Onyx,
    Nova,
    Shimmer,
    Ash,
    Ballad,
    Coral,
    Sage,
    Verse,
}

/// Configuration for audio output (text-to-speech)
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AudioOutput {
    /// Voice to use for speech synthesis
    pub voice: AudioVoice,
    /// Audio format for the output
    pub format: AudioFormat,
    /// Speech speed multiplier (0.25 to 4.0, default 1.0)
    #[serde(skip_serializing_if = "Option::is_none")]
    pub speed: Option<f32>,
    /// Sample rate in Hz (e.g., 24000, 44100, 48000)
    #[serde(skip_serializing_if = "Option::is_none")]
    pub sample_rate: Option<u32>,
}

impl Default for AudioOutput {
    fn default() -> Self {
        Self {
            voice: AudioVoice::default(),
            format: AudioFormat::Mp3,
            speed: None,
            sample_rate: None,
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct DocumentInput {
    pub data: Vec<u8>,
    pub format: DocumentFormat,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub name: Option<String>,
}

#[derive(Debug, Clone, Copy, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "lowercase")]
pub enum DocumentFormat {
    Pdf,
    Docx,
    Txt,
    Html,
    Md,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ToolUseInput {
    pub id: String,
    pub name: String,
    pub input: serde_json::Value,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ToolResultInput {
    pub tool_use_id: String,
    pub content: String,
    #[serde(default)]
    pub is_error: bool,
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

impl ImageFormat {
    /// Returns the MIME type for this image format
    pub fn mime_type(&self) -> &'static str {
        match self {
            ImageFormat::Png => "image/png",
            ImageFormat::Jpeg => "image/jpeg",
            ImageFormat::Webp => "image/webp",
        }
    }
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

/// Audio data representation supporting multiple formats
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(untagged)]
pub enum AudioData {
    /// Raw audio bytes
    Bytes(Vec<u8>),
    /// Base64 encoded audio
    Base64(String),
    /// URI reference to audio file
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

impl VideoFormat {
    /// Returns the MIME type for this video format
    pub fn mime_type(&self) -> &'static str {
        match self {
            VideoFormat::Mp4 => "video/mp4",
            VideoFormat::Webm => "video/webm",
            VideoFormat::Mov => "video/quicktime",
            VideoFormat::Avi => "video/x-msvideo",
            VideoFormat::Mkv => "video/x-matroska",
        }
    }
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

/// Configuration for extended thinking/reasoning modes
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(untagged)]
pub enum ThinkingParameter {
    /// Simple enabled/disabled flag
    Enabled(bool),
    /// Thinking level (string: "low", "medium", "high", "extreme")
    Level {
        level: String,
        #[serde(skip_serializing_if = "Option::is_none")]
        max_thinking_tokens: Option<u32>,
    },
    /// Token budget for thinking (Anthropic style)
    Budget {
        #[serde(rename = "type")]
        thinking_type: String,
        budget_tokens: u32,
    },
    /// Adaptive thinking (Claude Opus 4.6+) – lets the model decide when
    /// and how deeply to think.  Recommended for tool use workflows.
    /// Serialises as `{"type": "adaptive"}`.
    Adaptive {
        #[serde(rename = "type")]
        thinking_type: String, // always "adaptive"
    },
}

/// Response format for structured outputs
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ResponseFormat {
    /// Format type: "json_object", "json_schema", "text"
    #[serde(rename = "type")]
    pub format_type: String,
    /// JSON schema for structured output (when format_type is "json_schema")
    #[serde(skip_serializing_if = "Option::is_none")]
    pub json_schema: Option<serde_json::Value>,
}

/// Cache control configuration for prompt caching
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CacheControl {
    /// Cache type: "ephemeral" for session-based caching
    #[serde(rename = "type")]
    pub cache_type: String,
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
    /// Code execution results from Google Gemini (Python sandbox)
    #[serde(skip_serializing_if = "Option::is_none")]
    pub code_execution_results: Option<Vec<serde_json::Value>>,
    /// Cached prompt tokens (OpenAI prompt caching)
    #[serde(skip_serializing_if = "Option::is_none")]
    pub cache_read_input_tokens: Option<u32>,
    /// Tokens used for reasoning/thinking (OpenAI reasoning models)
    #[serde(skip_serializing_if = "Option::is_none")]
    pub reasoning_tokens: Option<u32>,
    /// Thinking tokens (Anthropic extended thinking)
    #[serde(skip_serializing_if = "Option::is_none")]
    pub thinking_tokens: Option<u32>,
    /// Reasoning content from thinking models
    #[serde(skip_serializing_if = "Option::is_none")]
    pub reasoning_content: Option<String>,
    /// Response ID for conversation continuity (OpenAI Responses API)
    #[serde(skip_serializing_if = "Option::is_none")]
    pub response_id: Option<String>,
    /// Tokens used for prompt cache creation (Anthropic prompt caching)
    #[serde(skip_serializing_if = "Option::is_none")]
    pub cache_creation_input_tokens: Option<u32>,
    /// Audio output data bytes (OpenAI TTS / audio responses)
    #[serde(skip)]
    pub audio_data: Option<Vec<u8>>,
    /// Audio format for audio output
    #[serde(skip_serializing_if = "Option::is_none")]
    pub audio_format: Option<AudioFormat>,
    /// Transcript from audio input (OpenAI whisper / audio input)
    #[serde(skip_serializing_if = "Option::is_none")]
    pub audio_transcript: Option<String>,
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
    #[serde(default)]
    pub strict: Option<bool>,
}

/// Tool choice configuration for LLM requests.
///
/// Serializes as:
/// - `Auto`        → `"auto"`
/// - `Required`    → `"required"`
/// - `None`        → `"none"`
/// - `Specific(n)` → `{"type": "function", "function": {"name": "<n>"}}`
///
/// The `Specific` variant uses the OpenAI function-calling format.
/// Provider adapters (e.g. Google, Anthropic) convert from this canonical
/// form into their native format.
#[derive(Debug, Clone, Default)]
pub enum ToolChoice {
    #[default]
    Auto,
    Required,
    None,
    Specific(String),
}

impl serde::Serialize for ToolChoice {
    fn serialize<S: serde::Serializer>(&self, serializer: S) -> Result<S::Ok, S::Error> {
        match self {
            ToolChoice::Auto => serializer.serialize_str("auto"),
            ToolChoice::Required => serializer.serialize_str("required"),
            ToolChoice::None => serializer.serialize_str("none"),
            ToolChoice::Specific(name) => {
                use serde::ser::SerializeMap;
                let mut map = serializer.serialize_map(Some(2))?;
                map.serialize_entry("type", "function")?;
                map.serialize_entry(
                    "function",
                    &std::collections::HashMap::from([("name", name.as_str())]),
                )?;
                map.end()
            }
        }
    }
}

impl<'de> serde::Deserialize<'de> for ToolChoice {
    fn deserialize<D: serde::Deserializer<'de>>(deserializer: D) -> Result<Self, D::Error> {
        let value = serde_json::Value::deserialize(deserializer)?;
        match &value {
            serde_json::Value::String(s) => match s.as_str() {
                "auto" => Ok(ToolChoice::Auto),
                "required" => Ok(ToolChoice::Required),
                "none" => Ok(ToolChoice::None),
                other => Ok(ToolChoice::Specific(other.to_string())),
            },
            serde_json::Value::Object(map) => {
                // OpenAI format: {"type": "function", "function": {"name": "..."}}
                if let Some(func) = map.get("function") {
                    if let Some(name) = func.get("name").and_then(|n| n.as_str()) {
                        return Ok(ToolChoice::Specific(name.to_string()));
                    }
                }
                // Legacy format: {"specific": "tool_name"}
                if let Some(name) = map.get("specific").and_then(|n| n.as_str()) {
                    return Ok(ToolChoice::Specific(name.to_string()));
                }
                Err(serde::de::Error::custom(
                    "unrecognized tool_choice object format",
                ))
            }
            _ => Err(serde::de::Error::custom(
                "expected string or object for tool_choice",
            )),
        }
    }
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
    Mistral,
    ManagedCloud,
    Groq,
    Together,
    Fireworks,
    Cerebras,
    DeepInfra,
    Cohere,
    AI21,
    Sambanova,
    Azure,
    Bedrock,
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
            Provider::Mistral => "mistral",
            Provider::ManagedCloud => "managed_cloud",
            Provider::Groq => "groq",
            Provider::Together => "together",
            Provider::Fireworks => "fireworks",
            Provider::Cerebras => "cerebras",
            Provider::DeepInfra => "deepinfra",
            Provider::Cohere => "cohere",
            Provider::AI21 => "ai21",
            Provider::Sambanova => "sambanova",
            Provider::Azure => "azure",
            Provider::Bedrock => "bedrock",
        }
    }

    #[allow(clippy::should_implement_trait)]
    pub fn from_string(value: &str) -> Option<Self> {
        match value.to_lowercase().as_str() {
            "openai" => Some(Provider::OpenAI),
            "anthropic" => Some(Provider::Anthropic),
            "google" => Some(Provider::Google),
            "ollama" => Some(Provider::Ollama),
            "perplexity" | "pplx" | "sonar" => Some(Provider::Perplexity),
            "xai" | "grok" => Some(Provider::XAI),
            "deepseek" => Some(Provider::DeepSeek),
            "qwen" | "alibaba" => Some(Provider::Qwen),
            "moonshot" | "kimi" => Some(Provider::Moonshot),
            "zhipu" | "zhipuai" | "bigmodel" | "glm" => Some(Provider::Zhipu),
            "mistral" | "mistral-ai" | "mistral_ai" => Some(Provider::Mistral),
            "managed_cloud" | "managedcloud" | "cloud" => Some(Provider::ManagedCloud),
            "groq" => Some(Provider::Groq),
            "together" | "together-ai" | "together_ai" | "togetherai" => Some(Provider::Together),
            "fireworks" | "fireworks-ai" | "fireworks_ai" | "fireworksai" => {
                Some(Provider::Fireworks)
            }
            "cerebras" => Some(Provider::Cerebras),
            "deepinfra" | "deep-infra" | "deep_infra" => Some(Provider::DeepInfra),
            "cohere" => Some(Provider::Cohere),
            "ai21" | "ai21-labs" | "ai21_labs" => Some(Provider::AI21),
            "sambanova" | "samba-nova" | "samba_nova" => Some(Provider::Sambanova),
            "azure" | "azure-openai" | "azure_openai" => Some(Provider::Azure),
            "bedrock" | "aws-bedrock" | "aws_bedrock" => Some(Provider::Bedrock),
            _ => None,
        }
    }

    pub fn default_model(&self) -> &'static str {
        models_config::get_default_model(self)
    }

    pub fn get_model_for_task(&self, task: TaskType) -> &'static str {
        let task_str = match task {
            TaskType::FastCompletion => "fast_completion",
            TaskType::CodeGeneration => "code_generation",
            TaskType::ComplexReasoning => "complex_reasoning",
            TaskType::Chat => "chat",
            TaskType::Vision => "vision",
            TaskType::LongContext => "long_context",
        };
        models_config::get_task_model(self, task_str)
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
                    cache_read_input_tokens: None,
                    cache_creation_input_tokens: None,
                }),
                credits: None,
                tool_calls: None,
                reasoning: response.reasoning_content,
                keepalive: false,
            },
        )])))
    }

    fn is_configured(&self) -> bool;

    fn name(&self) -> &str;

    /// Whether this provider is currently reachable.
    ///
    /// The default returns `true` (cloud providers are assumed reachable until a network error).
    /// Local providers such as `OllamaProvider` override this with a lightweight health-ping so
    /// the router can skip them immediately when unreachable instead of burning retry budget.
    async fn is_available(&self) -> bool {
        true
    }

    fn supports_vision(&self) -> bool {
        false
    }

    fn supports_function_calling(&self) -> bool {
        false
    }

    /// Whether the provider supports audio input (e.g., speech-to-text)
    fn supports_audio_input(&self) -> bool {
        false
    }

    /// Whether the provider supports audio output (e.g., text-to-speech)
    fn supports_audio_output(&self) -> bool {
        false
    }

    /// Whether the provider supports streaming audio in real-time
    fn supports_streaming_audio(&self) -> bool {
        false
    }
}

pub use llm_router::{
    CostPriority, LLMRouter, RouteCandidate, RouteOutcome, RouterContext, RouterPreferences,
    RouterSuggestion, RoutingStrategy,
};
