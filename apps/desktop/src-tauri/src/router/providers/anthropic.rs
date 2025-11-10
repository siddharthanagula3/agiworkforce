use crate::router::sse_parser::{parse_sse_stream, StreamChunk};
use crate::router::{LLMProvider, LLMRequest, LLMResponse, ToolCall};
use futures_util::Stream;
use reqwest::Client;
use serde::{Deserialize, Serialize};
use serde_json::Value;
use std::error::Error;
use std::pin::Pin;

#[derive(Debug, Clone, Serialize)]
struct AnthropicMessage {
    role: String,
    content: String,
}

#[derive(Debug, Clone, Serialize)]
struct AnthropicTool {
    name: String,
    description: String,
    input_schema: Value,
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
    #[serde(skip_serializing_if = "Option::is_none")]
    tools: Option<Vec<AnthropicTool>>,
}

#[derive(Debug, Clone, Deserialize)]
struct AnthropicResponse {
    _id: String,
    content: Vec<AnthropicContent>,
    usage: AnthropicUsage,
    model: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    stop_reason: Option<String>,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(tag = "type", rename_all = "snake_case")]
enum AnthropicContent {
    Text {
        text: String,
    },
    ToolUse {
        id: String,
        name: String,
        input: Value,
    },
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
        // Pricing as of November 2025 (per 1M tokens)
        let (input_cost, output_cost) = match model {
            // 2025 Claude 4.x Generation (Latest)
            "claude-sonnet-4-5" | "claude-4.5-sonnet" => (3.0, 15.0),    // Best coding model
            "claude-haiku-4-5" | "claude-4.5-haiku" => (0.25, 1.25),     // Fast & affordable
            "claude-opus-4" | "claude-4-opus" => (15.0, 75.0),           // Most capable

            // Claude 3.5 Generation
            "claude-3-5-sonnet-20241022" => (3.0, 15.0),

            // Claude 3 Generation (Legacy)
            "claude-3-opus-20240229" => (15.0, 75.0),
            "claude-3-sonnet-20240229" => (3.0, 15.0),
            "claude-3-haiku-20240307" => (0.25, 1.25),

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
        // ✅ Convert ToolDefinition to Anthropic format
        let anthropic_tools = request.tools.as_ref().map(|tools| {
            tools
                .iter()
                .map(|tool| AnthropicTool {
                    name: tool.name.clone(),
                    description: tool.description.clone(),
                    input_schema: tool.parameters.clone(),
                })
                .collect()
        });

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
            tools: anthropic_tools,
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

        // ✅ Parse content blocks (text and tool_use)
        let mut text_content = String::new();
        let mut tool_calls = Vec::new();

        for content_block in &anthropic_response.content {
            match content_block {
                AnthropicContent::Text { text } => {
                    text_content.push_str(text);
                }
                AnthropicContent::ToolUse { id, name, input } => {
                    tool_calls.push(ToolCall {
                        id: id.clone(),
                        name: name.clone(),
                        arguments: serde_json::to_string(input).unwrap_or_default(),
                    });
                }
            }
        }

        let cost = Self::calculate_cost(
            &anthropic_response.model,
            anthropic_response.usage.input_tokens,
            anthropic_response.usage.output_tokens,
        );

        let total_tokens =
            anthropic_response.usage.input_tokens + anthropic_response.usage.output_tokens;

        // ✅ Map stop_reason to finish_reason
        let finish_reason =
            anthropic_response
                .stop_reason
                .as_ref()
                .map(|reason| match reason.as_str() {
                    "tool_use" => "tool_calls".to_string(),
                    "end_turn" => "stop".to_string(),
                    "max_tokens" => "length".to_string(),
                    _ => reason.clone(),
                });

        Ok(LLMResponse {
            content: text_content,
            tokens: Some(total_tokens),
            prompt_tokens: Some(anthropic_response.usage.input_tokens),
            completion_tokens: Some(anthropic_response.usage.output_tokens),
            cost: Some(cost),
            model: anthropic_response.model,
            tool_calls: if tool_calls.is_empty() {
                None
            } else {
                Some(tool_calls)
            },
            finish_reason,
            ..LLMResponse::default()
        })
    }

    fn is_configured(&self) -> bool {
        !self.api_key.is_empty() && self.api_key != "your-api-key-here"
    }

    fn name(&self) -> &str {
        "Anthropic"
    }

    async fn send_message_streaming(
        &self,
        request: &LLMRequest,
    ) -> Result<
        Pin<Box<dyn Stream<Item = Result<StreamChunk, Box<dyn Error + Send + Sync>>> + Send>>,
        Box<dyn Error + Send + Sync>,
    > {
        // ✅ Add tools support to streaming
        let anthropic_tools = request.tools.as_ref().map(|tools| {
            tools
                .iter()
                .map(|tool| AnthropicTool {
                    name: tool.name.clone(),
                    description: tool.description.clone(),
                    input_schema: tool.parameters.clone(),
                })
                .collect()
        });

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
            stream: Some(true), // Enable streaming
            tools: anthropic_tools,
        };

        tracing::debug!(
            "Starting Anthropic streaming request for model: {}",
            request.model
        );

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

        tracing::debug!("Anthropic streaming response received, starting SSE parsing");

        // Return the SSE stream parser
        Ok(Box::pin(parse_sse_stream(
            response,
            crate::router::Provider::Anthropic,
        )))
    }
}
