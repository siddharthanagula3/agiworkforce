//! Moonshot (Kimi) Provider
//!
//! Moonshot AI's Kimi models use an OpenAI-compatible API format.
//! This provider supports Kimi K2 Thinking and other Moonshot models.

use crate::router::sse_parser::{parse_sse_stream, StreamChunk};
use crate::router::{
    ContentPart, ImageFormat, LLMProvider, LLMRequest, LLMResponse, ToolCall, ToolChoice,
    ToolDefinition,
};
use futures_util::Stream;
use reqwest::Client;
use serde::{Deserialize, Serialize};
use std::error::Error;
use std::pin::Pin;

// Re-use OpenAI-compatible message format
#[derive(Debug, Clone, Serialize, Deserialize)]
struct MoonshotMessage {
    role: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    content: Option<MoonshotContent>,
    #[serde(skip_serializing_if = "Option::is_none")]
    tool_calls: Option<Vec<MoonshotToolCall>>,
    #[serde(skip_serializing_if = "Option::is_none")]
    tool_call_id: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    name: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(untagged)]
enum MoonshotContent {
    Text(String),
    Multimodal(Vec<MoonshotContentPart>),
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(tag = "type", rename_all = "snake_case")]
enum MoonshotContentPart {
    Text { text: String },
    ImageUrl { image_url: MoonshotImageUrl },
}

#[derive(Debug, Clone, Serialize, Deserialize)]
struct MoonshotImageUrl {
    url: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
struct MoonshotToolCall {
    id: String,
    #[serde(rename = "type")]
    call_type: String,
    function: MoonshotFunctionCall,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
struct MoonshotFunctionCall {
    name: String,
    arguments: String,
}

#[derive(Debug, Clone, Serialize)]
struct MoonshotTool {
    #[serde(rename = "type")]
    tool_type: String,
    function: MoonshotFunction,
}

#[derive(Debug, Clone, Serialize)]
struct MoonshotFunction {
    name: String,
    description: String,
    parameters: serde_json::Value,
}

#[derive(Debug, Clone, Serialize)]
struct MoonshotRequest {
    model: String,
    messages: Vec<MoonshotMessage>,
    #[serde(skip_serializing_if = "Option::is_none")]
    temperature: Option<f32>,
    #[serde(skip_serializing_if = "Option::is_none")]
    max_tokens: Option<u32>,
    #[serde(skip_serializing_if = "Option::is_none")]
    stream: Option<bool>,
    #[serde(skip_serializing_if = "Option::is_none")]
    tools: Option<Vec<MoonshotTool>>,
    #[serde(skip_serializing_if = "Option::is_none")]
    tool_choice: Option<String>,
}

#[derive(Debug, Clone, Deserialize)]
struct MoonshotResponse {
    choices: Vec<MoonshotChoice>,
    usage: MoonshotUsage,
    model: String,
}

#[derive(Debug, Clone, Deserialize)]
struct MoonshotChoice {
    message: MoonshotMessage,
    finish_reason: Option<String>,
}

#[derive(Debug, Clone, Deserialize)]
struct MoonshotUsage {
    prompt_tokens: u32,
    completion_tokens: u32,
    total_tokens: u32,
}

pub struct MoonshotProvider {
    api_key: String,
    client: Client,
    base_url: String,
}

impl MoonshotProvider {
    pub fn new(api_key: String) -> Self {
        Self {
            api_key,
            client: Client::new(),
            base_url: "https://api.moonshot.cn/v1".to_string(),
        }
    }

    /// Calculate cost based on model and tokens
    fn calculate_cost(model: &str, input_tokens: u32, output_tokens: u32) -> f64 {
        // Moonshot pricing (approximate, per 1M tokens)
        let (input_cost, output_cost) = match model {
            "kimi-k2-thinking" | "moonshot-v1-128k" => (12.0, 12.0),
            "moonshot-v1-32k" => (8.0, 8.0),
            "moonshot-v1-8k" => (4.0, 4.0),
            _ => (8.0, 8.0), // Default pricing
        };

        let input = (input_tokens as f64 / 1_000_000.0) * input_cost;
        let output = (output_tokens as f64 / 1_000_000.0) * output_cost;
        input + output
    }

    fn convert_messages(messages: &[crate::router::ChatMessage]) -> Vec<MoonshotMessage> {
        messages
            .iter()
            .map(|msg| {
                // Check if there's multimodal content
                let content = if let Some(ref multimodal) = msg.multimodal_content {
                    let parts: Vec<MoonshotContentPart> = multimodal
                        .iter()
                        .filter_map(|part| match part {
                            ContentPart::Text { text } => {
                                Some(MoonshotContentPart::Text { text: text.clone() })
                            }
                            ContentPart::Image { image } => {
                                let mime_type = match image.format {
                                    ImageFormat::Png => "image/png",
                                    ImageFormat::Jpeg => "image/jpeg",
                                    ImageFormat::Webp => "image/webp",
                                };
                                let base64_data = base64::Engine::encode(
                                    &base64::engine::general_purpose::STANDARD,
                                    &image.data,
                                );
                                Some(MoonshotContentPart::ImageUrl {
                                    image_url: MoonshotImageUrl {
                                        url: format!("data:{};base64,{}", mime_type, base64_data),
                                    },
                                })
                            }
                            ContentPart::Video { .. } => {
                                // Moonshot doesn't support direct video bytes yet
                                None
                            }
                        })
                        .collect();

                    // If there's also text content, prepend it
                    let mut all_parts = if !msg.content.is_empty() {
                        vec![MoonshotContentPart::Text {
                            text: msg.content.clone(),
                        }]
                    } else {
                        vec![]
                    };
                    all_parts.extend(parts);
                    Some(MoonshotContent::Multimodal(all_parts))
                } else if !msg.content.is_empty() {
                    Some(MoonshotContent::Text(msg.content.clone()))
                } else {
                    None
                };

                // Convert tool calls if present
                let tool_calls = msg.tool_calls.as_ref().map(|calls| {
                    calls
                        .iter()
                        .map(|tc| MoonshotToolCall {
                            id: tc.id.clone(),
                            call_type: "function".to_string(),
                            function: MoonshotFunctionCall {
                                name: tc.name.clone(),
                                arguments: tc.arguments.clone(),
                            },
                        })
                        .collect()
                });

                MoonshotMessage {
                    role: msg.role.clone(),
                    content,
                    tool_calls,
                    tool_call_id: msg.tool_call_id.clone(),
                    name: None,
                }
            })
            .collect()
    }

    fn convert_tools(tools: &[ToolDefinition]) -> Vec<MoonshotTool> {
        tools
            .iter()
            .map(|tool| MoonshotTool {
                tool_type: "function".to_string(),
                function: MoonshotFunction {
                    name: tool.name.clone(),
                    description: tool.description.clone(),
                    parameters: tool.parameters.clone(),
                },
            })
            .collect()
    }

    fn convert_tool_choice(choice: &ToolChoice) -> Option<String> {
        match choice {
            ToolChoice::Auto => Some("auto".to_string()),
            ToolChoice::Required => Some("required".to_string()),
            ToolChoice::None => Some("none".to_string()),
            ToolChoice::Specific(name) => Some(name.clone()),
        }
    }
}

#[async_trait::async_trait]
impl LLMProvider for MoonshotProvider {
    async fn send_message(
        &self,
        request: &LLMRequest,
    ) -> Result<LLMResponse, Box<dyn Error + Send + Sync>> {
        let moonshot_request = MoonshotRequest {
            model: request.model.clone(),
            messages: Self::convert_messages(&request.messages),
            temperature: request.temperature,
            max_tokens: request.max_tokens,
            stream: Some(false),
            tools: request.tools.as_ref().map(|t| Self::convert_tools(t)),
            tool_choice: request
                .tool_choice
                .as_ref()
                .and_then(Self::convert_tool_choice),
        };

        let response = self
            .client
            .post(format!("{}/chat/completions", self.base_url))
            .header("Authorization", format!("Bearer {}", self.api_key))
            .header("Content-Type", "application/json")
            .json(&moonshot_request)
            .send()
            .await?;

        if !response.status().is_success() {
            let status = response.status();
            let error_text = response
                .text()
                .await
                .unwrap_or_else(|_| "Unknown error".to_string());
            return Err(format!("Moonshot API error {}: {}", status, error_text).into());
        }

        let moonshot_response: MoonshotResponse = response.json().await?;

        let choice = moonshot_response
            .choices
            .first()
            .ok_or("No response choices")?;

        // Extract content
        let content = match &choice.message.content {
            Some(MoonshotContent::Text(text)) => text.clone(),
            Some(MoonshotContent::Multimodal(parts)) => parts
                .iter()
                .filter_map(|p| match p {
                    MoonshotContentPart::Text { text } => Some(text.as_str()),
                    _ => None,
                })
                .collect::<Vec<_>>()
                .join(""),
            None => String::new(),
        };

        // Extract tool calls
        let tool_calls = choice.message.tool_calls.as_ref().map(|calls| {
            calls
                .iter()
                .map(|tc| ToolCall {
                    id: tc.id.clone(),
                    name: tc.function.name.clone(),
                    arguments: tc.function.arguments.clone(),
                })
                .collect()
        });

        let cost = Self::calculate_cost(
            &moonshot_response.model,
            moonshot_response.usage.prompt_tokens,
            moonshot_response.usage.completion_tokens,
        );

        Ok(LLMResponse {
            content,
            tokens: Some(moonshot_response.usage.total_tokens),
            prompt_tokens: Some(moonshot_response.usage.prompt_tokens),
            completion_tokens: Some(moonshot_response.usage.completion_tokens),
            cost: Some(cost),
            model: moonshot_response.model,
            tool_calls,
            finish_reason: choice.finish_reason.clone(),
            ..LLMResponse::default()
        })
    }

    async fn send_message_streaming(
        &self,
        request: &LLMRequest,
    ) -> Result<
        Pin<Box<dyn Stream<Item = Result<StreamChunk, Box<dyn Error + Send + Sync>>> + Send>>,
        Box<dyn Error + Send + Sync>,
    > {
        let moonshot_request = MoonshotRequest {
            model: request.model.clone(),
            messages: Self::convert_messages(&request.messages),
            temperature: request.temperature,
            max_tokens: request.max_tokens,
            stream: Some(true),
            tools: request.tools.as_ref().map(|t| Self::convert_tools(t)),
            tool_choice: request
                .tool_choice
                .as_ref()
                .and_then(Self::convert_tool_choice),
        };

        let response = self
            .client
            .post(format!("{}/chat/completions", self.base_url))
            .header("Authorization", format!("Bearer {}", self.api_key))
            .header("Content-Type", "application/json")
            .json(&moonshot_request)
            .send()
            .await?;

        if !response.status().is_success() {
            let status = response.status();
            let error_text = response
                .text()
                .await
                .unwrap_or_else(|_| "Unknown error".to_string());
            return Err(format!("Moonshot API error {}: {}", status, error_text).into());
        }

        // Use OpenAI-compatible SSE parser
        Ok(Box::pin(parse_sse_stream(
            response,
            crate::router::Provider::Moonshot,
        )))
    }

    fn is_configured(&self) -> bool {
        !self.api_key.is_empty() && self.api_key != "your-api-key-here"
    }

    fn name(&self) -> &str {
        "Moonshot"
    }

    fn supports_vision(&self) -> bool {
        true // Kimi K2 supports vision
    }

    fn supports_function_calling(&self) -> bool {
        true // Kimi K2 supports function calling
    }
}
