use crate::router::sse_parser::{parse_sse_stream, StreamChunk};
use crate::router::{LLMProvider, LLMRequest, LLMResponse};
use futures_util::Stream;
use reqwest::Client;
use serde::{Deserialize, Serialize};
use std::error::Error;
use std::pin::Pin;

#[derive(Debug, Clone, Serialize, Deserialize)]
struct GoogleContent {
    role: String,
    parts: Vec<GooglePart>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
struct GooglePart {
    text: String,
}

#[derive(Debug, Clone, Serialize)]
struct GoogleRequest {
    contents: Vec<GoogleContent>,
    #[serde(skip_serializing_if = "Option::is_none")]
    generation_config: Option<GoogleGenerationConfig>,
}

#[derive(Debug, Clone, Serialize)]
struct GoogleGenerationConfig {
    #[serde(skip_serializing_if = "Option::is_none")]
    temperature: Option<f32>,
    #[serde(skip_serializing_if = "Option::is_none")]
    max_output_tokens: Option<u32>,
}

#[derive(Debug, Clone, Deserialize)]
struct GoogleResponse {
    candidates: Vec<GoogleCandidate>,
    #[serde(rename = "usageMetadata")]
    usage_metadata: Option<GoogleUsageMetadata>,
}

#[derive(Debug, Clone, Deserialize)]
struct GoogleCandidate {
    content: GoogleContent,
}

#[derive(Debug, Clone, Deserialize)]
struct GoogleUsageMetadata {
    #[serde(rename = "promptTokenCount")]
    prompt_token_count: Option<u32>,
    #[serde(rename = "candidatesTokenCount")]
    candidates_token_count: Option<u32>,
    #[serde(rename = "totalTokenCount")]
    total_token_count: Option<u32>,
}

pub struct GoogleProvider {
    api_key: String,
    client: Client,
    base_url: String,
}

impl GoogleProvider {
    pub fn new(api_key: String) -> Self {
        Self {
            api_key,
            client: Client::new(),
            base_url: "https://generativelanguage.googleapis.com/v1beta".to_string(),
        }
    }

    /// Calculate cost based on model and tokens
    fn calculate_cost(model: &str, input_tokens: u32, output_tokens: u32) -> f64 {
        // Pricing as of 2025 (per 1M tokens)
        let (input_cost, output_cost) = match model {
            "gemini-1.5-pro" => (1.25, 5.0),
            "gemini-1.5-flash" => (0.075, 0.3),
            "gemini-1.0-pro" => (0.5, 1.5),
            _ => (0.5, 1.5), // Default pricing
        };

        let input = (input_tokens as f64 / 1_000_000.0) * input_cost;
        let output = (output_tokens as f64 / 1_000_000.0) * output_cost;
        input + output
    }

    fn convert_role(role: &str) -> String {
        match role {
            "assistant" => "model".to_string(),
            _ => role.to_string(),
        }
    }
}

#[async_trait::async_trait]
impl LLMProvider for GoogleProvider {
    async fn send_message(
        &self,
        request: &LLMRequest,
    ) -> Result<LLMResponse, Box<dyn Error + Send + Sync>> {
        let google_request = GoogleRequest {
            contents: request
                .messages
                .iter()
                .map(|m| GoogleContent {
                    role: Self::convert_role(&m.role),
                    parts: vec![GooglePart {
                        text: m.content.clone(),
                    }],
                })
                .collect(),
            generation_config: Some(GoogleGenerationConfig {
                temperature: request.temperature,
                max_output_tokens: request.max_tokens,
            }),
        };

        let url = format!(
            "{}/models/{}:generateContent?key={}",
            self.base_url, request.model, self.api_key
        );

        let response = self
            .client
            .post(&url)
            .header("Content-Type", "application/json")
            .json(&google_request)
            .send()
            .await?;

        if !response.status().is_success() {
            let status = response.status();
            let error_text = response
                .text()
                .await
                .unwrap_or_else(|_| "Unknown error".to_string());
            return Err(format!("Google API error {}: {}", status, error_text).into());
        }

        let google_response: GoogleResponse = response.json().await?;

        let content = google_response
            .candidates
            .first()
            .and_then(|c| c.content.parts.first())
            .map(|p| p.text.clone())
            .unwrap_or_default();

        let (tokens, prompt_tokens, completion_tokens, cost) =
            if let Some(usage) = google_response.usage_metadata {
                let input_tokens = usage.prompt_token_count.unwrap_or(0);
                let output_tokens = usage.candidates_token_count.unwrap_or(0);
                let total_tokens = usage
                    .total_token_count
                    .unwrap_or(input_tokens + output_tokens);
                let cost = Self::calculate_cost(&request.model, input_tokens, output_tokens);
                (
                    Some(total_tokens),
                    Some(input_tokens),
                    Some(output_tokens),
                    Some(cost),
                )
            } else {
                (None, None, None, None)
            };

        Ok(LLMResponse {
            content,
            tokens,
            prompt_tokens,
            completion_tokens,
            cost,
            model: request.model.clone(),
            ..LLMResponse::default()
        })
    }

    fn is_configured(&self) -> bool {
        !self.api_key.is_empty() && self.api_key != "your-api-key-here"
    }

    fn name(&self) -> &str {
        "Google"
    }

    async fn send_message_streaming(
        &self,
        request: &LLMRequest,
    ) -> Result<
        Pin<Box<dyn Stream<Item = Result<StreamChunk, Box<dyn Error + Send + Sync>>> + Send>>,
        Box<dyn Error + Send + Sync>,
    > {
        let google_request = GoogleRequest {
            contents: request
                .messages
                .iter()
                .map(|m| GoogleContent {
                    role: Self::convert_role(&m.role),
                    parts: vec![GooglePart {
                        text: m.content.clone(),
                    }],
                })
                .collect(),
            generation_config: Some(GoogleGenerationConfig {
                temperature: request.temperature,
                max_output_tokens: request.max_tokens,
            }),
        };

        tracing::debug!(
            "Starting Google streaming request for model: {}",
            request.model
        );

        // Google uses streamGenerateContent endpoint for streaming
        let url = format!(
            "{}/models/{}:streamGenerateContent?key={}&alt=sse",
            self.base_url, request.model, self.api_key
        );

        let response = self
            .client
            .post(&url)
            .header("Content-Type", "application/json")
            .json(&google_request)
            .send()
            .await?;

        if !response.status().is_success() {
            let status = response.status();
            let error_text = response
                .text()
                .await
                .unwrap_or_else(|_| "Unknown error".to_string());
            return Err(format!("Google API error {}: {}", status, error_text).into());
        }

        tracing::debug!("Google streaming response received, starting SSE parsing");

        // Return the SSE stream parser
        Ok(Box::pin(parse_sse_stream(
            response,
            crate::router::Provider::Google,
        )))
    }
}
