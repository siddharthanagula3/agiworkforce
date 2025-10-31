use crate::router::{LLMProvider, LLMRequest, LLMResponse};
use reqwest::Client;
use serde::{Deserialize, Serialize};
use std::error::Error;

#[derive(Debug, Clone, Serialize)]
struct AnthropicMessage {
    role: String,
    content: String,
}

#[derive(Debug, Clone, Serialize)]
struct AnthropicRequest {
    model: String,
    messages: Vec<AnthropicMessage>,
    #[serde(skip_serializing_if = "Option::is_none")]
    max_tokens: Option<u32>,
    #[serde(skip_serializing_if = "Option::is_none")]
    temperature: Option<f32>,
    #[serde(skip_serializing_if = "Option::is_none")]
    stream: Option<bool>,
}

#[derive(Debug, Clone, Deserialize)]
struct AnthropicResponse {
    id: String,
    content: Vec<AnthropicContent>,
    usage: AnthropicUsage,
    model: String,
}

#[derive(Debug, Clone, Deserialize)]
struct AnthropicContent {
    #[serde(rename = "type")]
    content_type: String,
    text: String,
}

#[derive(Debug, Clone, Deserialize)]
struct AnthropicUsage {
    input_tokens: u32,
    output_tokens: u32,
}

pub struct AnthropicProvider {
    api_key: String,
    client: Client,
    base_url: String,
}

impl AnthropicProvider {
    pub fn new(api_key: String) -> Self {
        Self {
            api_key,
            client: Client::new(),
            base_url: "https://api.anthropic.com/v1".to_string(),
        }
    }

    /// Calculate cost based on model and tokens
    fn calculate_cost(model: &str, input_tokens: u32, output_tokens: u32) -> f64 {
        // Pricing as of 2025 (per 1M tokens)
        let (input_cost, output_cost) = match model {
            "claude-3-opus-20240229" => (15.0, 75.0),
            "claude-3-sonnet-20240229" => (3.0, 15.0),
            "claude-3-haiku-20240307" => (0.25, 1.25),
            "claude-3-5-sonnet-20241022" => (3.0, 15.0),
            _ => (3.0, 15.0), // Default to sonnet pricing
        };

        let input = (input_tokens as f64 / 1_000_000.0) * input_cost;
        let output = (output_tokens as f64 / 1_000_000.0) * output_cost;
        input + output
    }
}

#[async_trait::async_trait]
impl LLMProvider for AnthropicProvider {
    async fn send_message(
        &self,
        request: &LLMRequest,
    ) -> Result<LLMResponse, Box<dyn Error + Send + Sync>> {
        let anthropic_request = AnthropicRequest {
            model: request.model.clone(),
            messages: request
                .messages
                .iter()
                .map(|m| AnthropicMessage {
                    role: m.role.clone(),
                    content: m.content.clone(),
                })
                .collect(),
            max_tokens: request.max_tokens.or(Some(4096)),
            temperature: request.temperature,
            stream: if request.stream { Some(false) } else { None },
        };

        let response = self
            .client
            .post(format!("{}/messages", self.base_url))
            .header("x-api-key", &self.api_key)
            .header("anthropic-version", "2023-06-01")
            .header("Content-Type", "application/json")
            .json(&anthropic_request)
            .send()
            .await?;

        if !response.status().is_success() {
            let status = response.status();
            let error_text = response
                .text()
                .await
                .unwrap_or_else(|_| "Unknown error".to_string());
            return Err(format!("Anthropic API error {}: {}", status, error_text).into());
        }

        let anthropic_response: AnthropicResponse = response.json().await?;

        let content = anthropic_response
            .content
            .first()
            .map(|c| c.text.clone())
            .unwrap_or_default();

        let cost = Self::calculate_cost(
            &anthropic_response.model,
            anthropic_response.usage.input_tokens,
            anthropic_response.usage.output_tokens,
        );

        let total_tokens =
            anthropic_response.usage.input_tokens + anthropic_response.usage.output_tokens;

        Ok(LLMResponse {
            content,
            tokens: Some(total_tokens),
            prompt_tokens: Some(anthropic_response.usage.input_tokens),
            completion_tokens: Some(anthropic_response.usage.output_tokens),
            cost: Some(cost),
            model: anthropic_response.model,
            ..LLMResponse::default()
        })
    }

    fn is_configured(&self) -> bool {
        !self.api_key.is_empty() && self.api_key != "your-api-key-here"
    }

    fn name(&self) -> &str {
        "Anthropic"
    }
}
