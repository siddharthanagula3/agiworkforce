use crate::core::router::sse_parser::{parse_sse_stream, StreamChunk};
use crate::core::router::{
    ContentPart, ImageFormat, LLMProvider, LLMRequest, LLMResponse, ToolCall,
};
use futures_util::Stream;
use reqwest::Client;
use serde::{Deserialize, Serialize};
use serde_json::Value;
use std::error::Error;
use std::pin::Pin;

#[derive(Debug, Clone, Serialize)]
struct AnthropicMessage {
    role: String,
    content: AnthropicMessageContent,
}

#[derive(Debug, Clone, Serialize)]
#[serde(untagged)]
enum AnthropicMessageContent {
    Text(String),
    Multimodal(Vec<AnthropicContentPart>),
}

#[derive(Debug, Clone, Serialize)]
#[serde(tag = "type", rename_all = "snake_case")]
enum AnthropicContentPart {
    Text { text: String },
    Image { source: AnthropicImageSource },
}

#[derive(Debug, Clone, Serialize)]
struct AnthropicImageSource {
    #[serde(rename = "type")]
    source_type: String,
    media_type: String,
    data: String,
}

#[derive(Debug, Clone, Serialize)]
struct AnthropicTool {
    name: String,
    description: String,
    input_schema: Value,
}

#[derive(Debug, Clone, Serialize)]
struct AnthropicThinking {
    #[serde(rename = "type")]
    thinking_type: String,
    budget_tokens: u32,
}

#[derive(Debug, Clone, Serialize)]
struct AnthropicRequest {
    model: String,
    messages: Vec<AnthropicMessage>,
    #[serde(skip_serializing_if = "Option::is_none")]
    system: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    max_tokens: Option<u32>,
    #[serde(skip_serializing_if = "Option::is_none")]
    temperature: Option<f32>,
    #[serde(skip_serializing_if = "Option::is_none")]
    stream: Option<bool>,
    #[serde(skip_serializing_if = "Option::is_none")]
    tools: Option<Vec<AnthropicTool>>,
    #[serde(skip_serializing_if = "Option::is_none")]
    thinking: Option<AnthropicThinking>,
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
            base_url: "https://api.agiworkforce.com".to_string(),
        }
    }

    fn convert_content(
        text: &str,
        multimodal: Option<&Vec<ContentPart>>,
    ) -> AnthropicMessageContent {
        if let Some(parts) = multimodal {
            let mut anthropic_parts = Vec::new();

            if !text.is_empty() {
                anthropic_parts.push(AnthropicContentPart::Text {
                    text: text.to_string(),
                });
            }

            for part in parts {
                match part {
                    ContentPart::Text { text } => {
                        anthropic_parts.push(AnthropicContentPart::Text { text: text.clone() });
                    }
                    ContentPart::Image { image } => {
                        let media_type = match image.format {
                            ImageFormat::Png => "image/png",
                            ImageFormat::Jpeg => "image/jpeg",
                            ImageFormat::Webp => "image/webp",
                        };
                        let base64_data = base64::Engine::encode(
                            &base64::engine::general_purpose::STANDARD,
                            &image.data,
                        );
                        anthropic_parts.push(AnthropicContentPart::Image {
                            source: AnthropicImageSource {
                                source_type: "base64".to_string(),
                                media_type: media_type.to_string(),
                                data: base64_data,
                            },
                        });
                    }
                    ContentPart::Video { .. } => {}
                }
            }

            AnthropicMessageContent::Multimodal(anthropic_parts)
        } else {
            AnthropicMessageContent::Text(text.to_string())
        }
    }

    fn calculate_cost(model: &str, input_tokens: u32, output_tokens: u32) -> f64 {
        let (input_cost, output_cost) = match model {
            "claude-sonnet-4-5" | "claude-4.5-sonnet" => (3.0, 15.0),
            "claude-haiku-4-5" | "claude-4.5-haiku" => (0.5, 2.5),
            "claude-opus-4-5" | "claude-4.5-opus" => (12.0, 36.0),

            "claude-opus-4" | "claude-4-opus" => (15.0, 75.0),

            "claude-3-5-sonnet-20241022" | "claude-3-5-sonnet-latest" => (3.0, 15.0),
            "claude-3-5-haiku-20241022" | "claude-3-5-haiku-latest" => (0.80, 4.0),

            "claude-3-opus-20240229" => (15.0, 75.0),
            "claude-3-sonnet-20240229" => (3.0, 15.0),
            "claude-3-haiku-20240307" => (0.25, 1.25),

            _ => (3.0, 15.0),
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

        let system_message = request
            .messages
            .iter()
            .filter(|m| m.role == "system")
            .map(|m| m.content.clone())
            .collect::<Vec<String>>()
            .join("\n\n");

        let system_param = if system_message.is_empty() {
            None
        } else {
            Some(system_message)
        };

        let messages: Vec<AnthropicMessage> = request
            .messages
            .iter()
            .filter(|m| m.role != "system")
            .map(|m| AnthropicMessage {
                role: m.role.clone(),
                content: Self::convert_content(&m.content, m.multimodal_content.as_ref()),
            })
            .collect();

        let (thinking, temperature, max_tokens) = if request.thinking_mode.unwrap_or(false) {
            (
                Some(AnthropicThinking {
                    thinking_type: "enabled".to_string(),
                    budget_tokens: 16000,
                }),
                None,
                request.max_tokens.or(Some(64000)),
            )
        } else {
            (None, request.temperature, request.max_tokens.or(Some(4096)))
        };

        let anthropic_request = AnthropicRequest {
            model: request.model.clone(),
            messages,
            system: system_param,
            max_tokens,
            temperature,
            stream: if request.stream { Some(false) } else { None },
            tools: anthropic_tools,
            thinking,
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

        let response_text = response.text().await?;
        tracing::debug!("Anthropic response body: {}", response_text);

        let anthropic_response: AnthropicResponse =
            serde_json::from_str(&response_text).map_err(|e| {
                format!(
                    "Failed to parse Anthropic response: {}. Body: {}",
                    e, response_text
                )
            })?;

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

    fn supports_vision(&self) -> bool {
        true
    }

    fn supports_function_calling(&self) -> bool {
        true
    }

    async fn send_message_streaming(
        &self,
        request: &LLMRequest,
    ) -> Result<
        Pin<Box<dyn Stream<Item = Result<StreamChunk, Box<dyn Error + Send + Sync>>> + Send>>,
        Box<dyn Error + Send + Sync>,
    > {
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

        let system_message = request
            .messages
            .iter()
            .filter(|m| m.role == "system")
            .map(|m| m.content.clone())
            .collect::<Vec<String>>()
            .join("\n\n");

        let system_param = if system_message.is_empty() {
            None
        } else {
            Some(system_message)
        };

        let messages: Vec<AnthropicMessage> = request
            .messages
            .iter()
            .filter(|m| m.role != "system")
            .map(|m| AnthropicMessage {
                role: m.role.clone(),
                content: Self::convert_content(&m.content, m.multimodal_content.as_ref()),
            })
            .collect();

        let (thinking, temperature, max_tokens) = if request.thinking_mode.unwrap_or(false) {
            (
                Some(AnthropicThinking {
                    thinking_type: "enabled".to_string(),
                    budget_tokens: 16000,
                }),
                None,
                request.max_tokens.or(Some(64000)),
            )
        } else {
            (None, request.temperature, request.max_tokens.or(Some(4096)))
        };

        let anthropic_request = AnthropicRequest {
            model: request.model.clone(),
            messages,
            system: system_param,
            max_tokens,
            temperature,
            stream: Some(true),
            tools: anthropic_tools,
            thinking,
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

        Ok(Box::pin(parse_sse_stream(
            response,
            crate::core::router::Provider::Anthropic,
        )))
    }
}
