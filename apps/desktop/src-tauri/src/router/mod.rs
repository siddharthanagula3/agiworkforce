pub mod cache_manager;
pub mod cost_calculator;
pub mod llm_router;
pub mod providers;
pub mod token_counter;

use serde::{Deserialize, Serialize};
use std::error::Error;

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct LLMRequest {
    pub messages: Vec<ChatMessage>,
    pub model: String,
    pub temperature: Option<f32>,
    pub max_tokens: Option<u32>,
    pub stream: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ChatMessage {
    pub role: String,
    pub content: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
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
}

impl Default for LLMResponse {
    fn default() -> Self {
        Self {
            content: String::new(),
            tokens: None,
            prompt_tokens: None,
            completion_tokens: None,
            cost: None,
            model: String::new(),
            cached: false,
        }
    }
}

#[derive(Debug, Clone, Copy, Serialize, Deserialize, PartialEq, Eq, Hash)]
pub enum Provider {
    OpenAI,
    Anthropic,
    Google,
    Ollama,
}

impl Provider {
    pub fn as_ref(&self) -> &'static str {
        match self {
            Provider::OpenAI => "openai",
            Provider::Anthropic => "anthropic",
            Provider::Google => "google",
            Provider::Ollama => "ollama",
        }
    }

    pub fn from_str(value: &str) -> Option<Self> {
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

    /// Check if the provider is configured with valid API keys
    fn is_configured(&self) -> bool;

    /// Get the provider name
    fn name(&self) -> &str;
}

pub use llm_router::{LLMRouter, RouteCandidate, RouteOutcome, RouterPreferences, RoutingStrategy};
