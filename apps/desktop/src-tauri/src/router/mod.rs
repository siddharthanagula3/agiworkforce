pub mod cache_manager;
pub mod cost_calculator;
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

#[derive(Debug, Clone, Copy, Serialize, Deserialize, PartialEq, Eq, Hash)]
pub enum Provider {
    OpenAI,
    Anthropic,
    Google,
    Ollama,
}

impl Provider {
    #[allow(clippy::should_implement_trait)]
    pub fn as_string(&self) -> &'static str {
        match self {
            Provider::OpenAI => "openai",
            Provider::Anthropic => "anthropic",
            Provider::Google => "google",
            Provider::Ollama => "ollama",
        }
    }

    #[allow(clippy::should_implement_trait)]
    pub fn from_string(value: &str) -> Option<Self> {
        match value.to_lowercase().as_str() {
            "openai" => Some(Provider::OpenAI),
            "anthropic" => Some(Provider::Anthropic),
            "google" => Some(Provider::Google),
            "ollama" => Some(Provider::Ollama),
            _ => None,
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
}

pub use llm_router::{LLMRouter, RouteCandidate, RouteOutcome, RouterPreferences, RoutingStrategy};
