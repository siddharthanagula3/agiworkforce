use crate::core::llm::sse_parser::{parse_sse_stream, StreamChunk};
use crate::core::llm::{
    ContentPart, ImageFormat, LLMProvider, LLMRequest, LLMResponse, ThinkingParameter, ToolCall,
};
use futures_util::Stream;
use reqwest::Client;
use serde::{Deserialize, Serialize};
use serde_json::Value;
use std::error::Error;
use std::pin::Pin;
use std::time::Duration;

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
    system: Option<Vec<AnthropicSystemContent>>,
    #[serde(skip_serializing_if = "Option::is_none")]
    max_tokens: Option<u32>,
    #[serde(skip_serializing_if = "Option::is_none")]
    temperature: Option<f32>,
    #[serde(skip_serializing_if = "Option::is_none")]
    top_p: Option<f32>,
    #[serde(skip_serializing_if = "Option::is_none")]
    top_k: Option<u32>,
    #[serde(skip_serializing_if = "Option::is_none")]
    stream: Option<bool>,
    #[serde(skip_serializing_if = "Option::is_none")]
    tools: Option<Vec<AnthropicTool>>,
    #[serde(skip_serializing_if = "Option::is_none")]
    thinking: Option<AnthropicThinking>,
}

/// Anthropic system content block with optional cache_control
#[derive(Debug, Clone, Serialize)]
struct AnthropicSystemContent {
    #[serde(rename = "type")]
    content_type: String,
    text: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    cache_control: Option<AnthropicCacheControl>,
}

/// Cache control for Anthropic prompt caching
#[derive(Debug, Clone, Serialize)]
struct AnthropicCacheControl {
    #[serde(rename = "type")]
    cache_type: String,
}

#[derive(Debug, Clone, Deserialize)]
struct AnthropicResponse {
    #[serde(default)]
    #[allow(dead_code)]
    id: Option<String>,
    content: Vec<AnthropicContent>,
    usage: AnthropicUsage,
    model: String,
    #[serde(default)]
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
    /// Thinking content block from extended thinking mode
    Thinking {
        thinking: String,
    },
}

#[derive(Debug, Clone, Deserialize)]
struct AnthropicUsage {
    input_tokens: u32,
    output_tokens: u32,
    /// Tokens used for cache creation (prompt caching)
    #[serde(default)]
    #[allow(dead_code)]
    cache_creation_input_tokens: Option<u32>,
    /// Tokens read from cache (prompt caching)
    #[serde(default)]
    cache_read_input_tokens: Option<u32>,
    /// Thinking tokens used in extended thinking mode
    #[serde(default)]
    thinking_tokens: Option<u32>,
}

pub struct AnthropicProvider {
    api_key: String,
    client: Client,
    base_url: String,
}

impl AnthropicProvider {
    /// Create a new Anthropic provider with the given API key.
    ///
    /// # Panics
    /// Returns error if the HTTP client cannot be created (TLS initialization failure).
    pub fn new(api_key: String) -> Result<Self, Box<dyn std::error::Error + Send + Sync>> {
        let client = Client::builder()
            .connect_timeout(Duration::from_secs(30))
            .timeout(Duration::from_secs(300))
            .build()
            .map_err(|e| Box::new(e) as Box<dyn std::error::Error + Send + Sync>)?;
        // Use environment variable for base URL, defaulting to official Anthropic API
        let base_url = std::env::var("ANTHROPIC_API_BASE")
            .unwrap_or_else(|_| "https://api.anthropic.com/v1".to_string());
        Ok(Self {
            api_key,
            client,
            base_url,
        })
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
                    // Video, audio, documents, tool use/result not yet supported by Anthropic multimodal
                    ContentPart::Video { .. }
                    | ContentPart::Audio { .. }
                    | ContentPart::Document { .. }
                    | ContentPart::ToolUse { .. }
                    | ContentPart::ToolResult { .. } => {
                        // Skip unsupported content types for now
                    }
                }
            }

            AnthropicMessageContent::Multimodal(anthropic_parts)
        } else {
            AnthropicMessageContent::Text(text.to_string())
        }
    }

    fn calculate_cost(model: &str, input_tokens: u32, output_tokens: u32) -> f64 {
        let (input_cost, output_cost) = match model {
            // Claude 4.5 models (Current pricing as of 2025)
            "claude-sonnet-4-5" | "claude-4.5-sonnet" => (3.0, 15.0), // ≤200K tokens: $3/$15
            "claude-haiku-4-5" | "claude-4.5-haiku" => (1.0, 5.0),
            "claude-opus-4-5" | "claude-4.5-opus" => (5.0, 25.0),

            "claude-opus-4" | "claude-4-opus" => (5.0, 25.0),

            // Claude 3.5 models
            "claude-3-5-sonnet-20241022" | "claude-3-5-sonnet-latest" => (3.0, 15.0),
            "claude-3-5-haiku-20241022" | "claude-3-5-haiku-latest" => (0.80, 4.0),

            // Claude 3 models (legacy pricing)
            "claude-3-opus-20240229" => (15.0, 75.0), // Legacy pricing
            "claude-3-sonnet-20240229" => (3.0, 15.0),
            "claude-3-haiku-20240307" => (0.25, 1.25), // Legacy pricing

            _ => (3.0, 15.0), // Default to Sonnet pricing
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

        // Build system message with optional cache_control
        let system_messages: Vec<String> = request
            .messages
            .iter()
            .filter(|m| m.role == "system")
            .map(|m| m.content.clone())
            .collect();

        let system_param = if system_messages.is_empty() {
            None
        } else {
            let combined_system = system_messages.join("\n\n");
            // Apply cache_control if specified
            let cache_control = request
                .cache_control
                .as_ref()
                .map(|cc| AnthropicCacheControl {
                    cache_type: cc.cache_type.clone(),
                });
            Some(vec![AnthropicSystemContent {
                content_type: "text".to_string(),
                text: combined_system,
                cache_control,
            }])
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

        // Process thinking configuration with full ThinkingParameter support
        let (thinking_config, adjusted_temp, adjusted_max) =
            if let Some(thinking) = &request.thinking {
                match thinking {
                    ThinkingParameter::Budget {
                        budget_tokens,
                        thinking_type,
                    } => (
                        Some(AnthropicThinking {
                            thinking_type: thinking_type
                                .clone()
                                .unwrap_or_else(|| "enabled".to_string()),
                            budget_tokens: *budget_tokens,
                        }),
                        None, // Temperature must be None when thinking is enabled
                        request.max_tokens.or(Some(128000)),
                    ),
                    ThinkingParameter::Enabled(true) => (
                        Some(AnthropicThinking {
                            thinking_type: "enabled".to_string(),
                            budget_tokens: 32000, // Default budget
                        }),
                        None,
                        request.max_tokens.or(Some(128000)),
                    ),
                    ThinkingParameter::Enabled(false) => (
                        None,
                        request.temperature,
                        request.max_tokens.or(Some(16384)),
                    ),
                    ThinkingParameter::Level {
                        level,
                        max_thinking_tokens,
                    } => {
                        // Map level string to budget tokens
                        let budget = max_thinking_tokens.unwrap_or_else(|| match level.as_str() {
                            "low" => 8000,
                            "medium" => 16000,
                            "high" => 32000,
                            "extreme" => 64000,
                            _ => 16000,
                        });
                        (
                            Some(AnthropicThinking {
                                thinking_type: "enabled".to_string(),
                                budget_tokens: budget,
                            }),
                            None,
                            request.max_tokens.or(Some(128000)),
                        )
                    }
                }
            } else if request.thinking_mode == Some(true) {
                // Fallback to legacy thinking_mode bool
                (
                    Some(AnthropicThinking {
                        thinking_type: "enabled".to_string(),
                        budget_tokens: 32000,
                    }),
                    None,
                    request.max_tokens.or(Some(128000)),
                )
            } else {
                // Standard mode: 16K default for quality responses
                (
                    None,
                    request.temperature,
                    request.max_tokens.or(Some(16384)),
                )
            };

        let anthropic_request = AnthropicRequest {
            model: request.model.clone(),
            messages,
            system: system_param,
            max_tokens: adjusted_max,
            temperature: adjusted_temp,
            top_p: request.top_p,
            top_k: request.top_k,
            stream: if request.stream { Some(false) } else { None },
            tools: anthropic_tools,
            thinking: thinking_config,
        };

        let response = self
            .client
            .post(format!("{}/messages", self.base_url))
            .header("x-api-key", &self.api_key)
            .header("anthropic-version", "2024-10-22")
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
        let mut reasoning_content = String::new();

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
                AnthropicContent::Thinking { thinking } => {
                    if !reasoning_content.is_empty() {
                        reasoning_content.push_str("\n\n");
                    }
                    reasoning_content.push_str(thinking);
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

        // Extract thinking tokens from usage
        let thinking_tokens = anthropic_response.usage.thinking_tokens;

        // Extract cache read tokens for reporting
        let cache_read_input_tokens = anthropic_response.usage.cache_read_input_tokens;

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
            thinking_tokens,
            cache_read_input_tokens,
            reasoning_content: if reasoning_content.is_empty() {
                None
            } else {
                Some(reasoning_content)
            },
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

        // Build system message with optional cache_control
        let system_messages: Vec<String> = request
            .messages
            .iter()
            .filter(|m| m.role == "system")
            .map(|m| m.content.clone())
            .collect();

        let system_param = if system_messages.is_empty() {
            None
        } else {
            let combined_system = system_messages.join("\n\n");
            // Apply cache_control if specified
            let cache_control = request
                .cache_control
                .as_ref()
                .map(|cc| AnthropicCacheControl {
                    cache_type: cc.cache_type.clone(),
                });
            Some(vec![AnthropicSystemContent {
                content_type: "text".to_string(),
                text: combined_system,
                cache_control,
            }])
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

        // Process thinking configuration with full ThinkingParameter support
        let (thinking_config, adjusted_temp, adjusted_max) =
            if let Some(thinking) = &request.thinking {
                match thinking {
                    ThinkingParameter::Budget {
                        budget_tokens,
                        thinking_type,
                    } => (
                        Some(AnthropicThinking {
                            thinking_type: thinking_type
                                .clone()
                                .unwrap_or_else(|| "enabled".to_string()),
                            budget_tokens: *budget_tokens,
                        }),
                        None, // Temperature must be None when thinking is enabled
                        request.max_tokens.or(Some(128000)),
                    ),
                    ThinkingParameter::Enabled(true) => (
                        Some(AnthropicThinking {
                            thinking_type: "enabled".to_string(),
                            budget_tokens: 32000, // Default budget
                        }),
                        None,
                        request.max_tokens.or(Some(128000)),
                    ),
                    ThinkingParameter::Enabled(false) => (
                        None,
                        request.temperature,
                        request.max_tokens.or(Some(16384)),
                    ),
                    ThinkingParameter::Level {
                        level,
                        max_thinking_tokens,
                    } => {
                        // Map level string to budget tokens
                        let budget = max_thinking_tokens.unwrap_or_else(|| match level.as_str() {
                            "low" => 8000,
                            "medium" => 16000,
                            "high" => 32000,
                            "extreme" => 64000,
                            _ => 16000,
                        });
                        (
                            Some(AnthropicThinking {
                                thinking_type: "enabled".to_string(),
                                budget_tokens: budget,
                            }),
                            None,
                            request.max_tokens.or(Some(128000)),
                        )
                    }
                }
            } else if request.thinking_mode == Some(true) {
                // Fallback to legacy thinking_mode bool
                (
                    Some(AnthropicThinking {
                        thinking_type: "enabled".to_string(),
                        budget_tokens: 32000,
                    }),
                    None,
                    request.max_tokens.or(Some(128000)),
                )
            } else {
                // Standard mode: 16K default for quality responses
                (
                    None,
                    request.temperature,
                    request.max_tokens.or(Some(16384)),
                )
            };

        let anthropic_request = AnthropicRequest {
            model: request.model.clone(),
            messages,
            system: system_param,
            max_tokens: adjusted_max,
            temperature: adjusted_temp,
            top_p: request.top_p,
            top_k: request.top_k,
            stream: Some(true),
            tools: anthropic_tools,
            thinking: thinking_config,
        };

        tracing::debug!(
            "Starting Anthropic streaming request for model: {}",
            request.model
        );

        let response = self
            .client
            .post(format!("{}/messages", self.base_url))
            .header("x-api-key", &self.api_key)
            .header("anthropic-version", "2024-10-22")
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
            crate::core::llm::Provider::Anthropic,
        )))
    }
}
