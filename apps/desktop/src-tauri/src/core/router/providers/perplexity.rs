use crate::core::router::sse_parser::{parse_sse_stream, StreamChunk};
use crate::core::router::{LLMProvider, LLMRequest, LLMResponse};
use futures_util::Stream;
use reqwest::Client;
use serde::{Deserialize, Serialize};
use std::error::Error;
use std::pin::Pin;
use std::time::Duration;

/// Perplexity API provider - uses OpenAI-compatible format with search capabilities
///
/// Perplexity Sonar models include built-in web search and citation capabilities.
/// API documentation: https://docs.perplexity.ai/

#[derive(Debug, Clone, Serialize, Deserialize)]
struct PerplexityMessage {
    role: String,
    content: String,
}

#[derive(Debug, Clone, Serialize)]
struct PerplexityRequest {
    model: String,
    messages: Vec<PerplexityMessage>,
    #[serde(skip_serializing_if = "Option::is_none")]
    temperature: Option<f32>,
    #[serde(skip_serializing_if = "Option::is_none")]
    max_tokens: Option<u32>,
    #[serde(skip_serializing_if = "Option::is_none")]
    stream: Option<bool>,
    /// Whether to return citations in the response
    #[serde(skip_serializing_if = "Option::is_none")]
    return_citations: Option<bool>,
    /// Whether to return images in the response (for supported models)
    #[serde(skip_serializing_if = "Option::is_none")]
    return_images: Option<bool>,
}

#[derive(Debug, Clone, Deserialize)]
struct PerplexityResponse {
    _id: String,
    model: String,
    choices: Vec<PerplexityChoice>,
    usage: PerplexityUsage,
    #[serde(default)]
    citations: Option<Vec<String>>,
}

#[derive(Debug, Clone, Deserialize)]
struct PerplexityChoice {
    message: PerplexityMessage,
    finish_reason: Option<String>,
    _index: u32,
}

#[derive(Debug, Clone, Deserialize)]
struct PerplexityUsage {
    prompt_tokens: u32,
    completion_tokens: u32,
    total_tokens: u32,
}

pub struct PerplexityProvider {
    api_key: String,
    client: Client,
    base_url: String,
}

impl PerplexityProvider {
    pub fn new(api_key: String) -> Self {
        let client = Client::builder()
            .connect_timeout(Duration::from_secs(30))
            .timeout(Duration::from_secs(300))
            .build()
            .expect("Failed to create HTTP client");

        // Perplexity API base URL
        let base_url = std::env::var("PERPLEXITY_API_BASE")
            .unwrap_or_else(|_| "https://api.perplexity.ai".to_string());

        Self {
            api_key,
            client,
            base_url,
        }
    }

    /// Calculate cost for Perplexity models (per million tokens)
    /// Note: Perplexity also charges per-search fees which are not calculated here
    fn calculate_cost(model: &str, prompt_tokens: u32, completion_tokens: u32) -> f64 {
        let (input_cost, output_cost) = match model {
            // Sonar models (Updated 2026-01-01)
            "sonar" | "sonar-small-online" => (1.0, 1.0),
            "sonar-pro" | "sonar-medium-online" => (3.0, 15.0),
            "sonar-deep-research" => (5.0, 8.0), // Research-focused model
            "sonar-reasoning" | "sonar-reasoning-pro" => (3.0, 15.0),
            // Legacy models
            "pplx-7b-online" | "pplx-70b-online" => (1.0, 1.0),
            "pplx-7b-chat" | "pplx-70b-chat" => (0.2, 0.2),
            // Default fallback
            _ => (1.0, 1.0),
        };

        let input = (prompt_tokens as f64 / 1_000_000.0) * input_cost;
        let output = (completion_tokens as f64 / 1_000_000.0) * output_cost;
        input + output
    }
}

#[async_trait::async_trait]
impl LLMProvider for PerplexityProvider {
    async fn send_message(
        &self,
        request: &LLMRequest,
    ) -> Result<LLMResponse, Box<dyn Error + Send + Sync>> {
        let perplexity_request = PerplexityRequest {
            model: request.model.clone(),
            messages: request
                .messages
                .iter()
                .map(|m| PerplexityMessage {
                    role: m.role.clone(),
                    content: m.content.clone(),
                })
                .collect(),
            temperature: request.temperature,
            max_tokens: request.max_tokens,
            stream: Some(false),
            return_citations: Some(true), // Enable citations by default
            return_images: None,
        };

        let response = self
            .client
            .post(format!("{}/chat/completions", self.base_url))
            .header("Authorization", format!("Bearer {}", self.api_key))
            .header("Content-Type", "application/json")
            .json(&perplexity_request)
            .send()
            .await?;

        if !response.status().is_success() {
            let status = response.status();
            let error_text = response
                .text()
                .await
                .unwrap_or_else(|_| "Unknown error".to_string());
            return Err(format!("Perplexity API error {}: {}", status, error_text).into());
        }

        let response_text = response.text().await?;
        tracing::debug!("Perplexity response body: {}", response_text);

        let perplexity_response: PerplexityResponse = serde_json::from_str(&response_text)
            .map_err(|e| {
                format!(
                    "Failed to parse Perplexity response: {}. Body: {}",
                    e, response_text
                )
            })?;

        let choice = perplexity_response
            .choices
            .first()
            .ok_or("No choices in response")?;

        // Append citations to content if available
        let mut content = choice.message.content.clone();
        if let Some(citations) = &perplexity_response.citations {
            if !citations.is_empty() {
                content.push_str("\n\n**Sources:**\n");
                for (i, citation) in citations.iter().enumerate() {
                    content.push_str(&format!("{}. {}\n", i + 1, citation));
                }
            }
        }

        let cost = Self::calculate_cost(
            &perplexity_response.model,
            perplexity_response.usage.prompt_tokens,
            perplexity_response.usage.completion_tokens,
        );

        Ok(LLMResponse {
            content,
            tokens: Some(perplexity_response.usage.total_tokens),
            prompt_tokens: Some(perplexity_response.usage.prompt_tokens),
            completion_tokens: Some(perplexity_response.usage.completion_tokens),
            cost: Some(cost),
            model: perplexity_response.model,
            tool_calls: None,
            finish_reason: choice.finish_reason.clone(),
            ..LLMResponse::default()
        })
    }

    fn is_configured(&self) -> bool {
        !self.api_key.is_empty() && self.api_key != "your-api-key-here"
    }

    fn name(&self) -> &str {
        "Perplexity"
    }

    fn supports_vision(&self) -> bool {
        // Perplexity Sonar models do not currently support vision/image inputs
        false
    }

    fn supports_function_calling(&self) -> bool {
        // Perplexity does not support function calling
        false
    }

    async fn send_message_streaming(
        &self,
        request: &LLMRequest,
    ) -> Result<
        Pin<Box<dyn Stream<Item = Result<StreamChunk, Box<dyn Error + Send + Sync>>> + Send>>,
        Box<dyn Error + Send + Sync>,
    > {
        let perplexity_request = PerplexityRequest {
            model: request.model.clone(),
            messages: request
                .messages
                .iter()
                .map(|m| PerplexityMessage {
                    role: m.role.clone(),
                    content: m.content.clone(),
                })
                .collect(),
            temperature: request.temperature,
            max_tokens: request.max_tokens,
            stream: Some(true),
            return_citations: Some(true),
            return_images: None,
        };

        tracing::debug!(
            "Starting Perplexity streaming request for model: {}",
            request.model
        );

        let response = self
            .client
            .post(format!("{}/chat/completions", self.base_url))
            .header("Authorization", format!("Bearer {}", self.api_key))
            .header("Content-Type", "application/json")
            .json(&perplexity_request)
            .send()
            .await?;

        if !response.status().is_success() {
            let status = response.status();
            let error_text = response
                .text()
                .await
                .unwrap_or_else(|_| "Unknown error".to_string());
            return Err(format!("Perplexity API error {}: {}", status, error_text).into());
        }

        tracing::debug!("Perplexity streaming response received, starting SSE parsing");

        // Perplexity uses OpenAI-compatible SSE format
        Ok(Box::pin(parse_sse_stream(
            response,
            crate::core::router::Provider::Perplexity,
        )))
    }
}
