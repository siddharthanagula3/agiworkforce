use crate::core::llm::sse_parser::{parse_sse_stream, StreamChunk};
use crate::core::llm::{
    LLMProvider, LLMRequest, LLMResponse, ToolCall, ToolChoice, ToolDefinition,
};
use futures_util::Stream;
use reqwest::Client;
use serde::{Deserialize, Serialize};
use std::error::Error;
use std::pin::Pin;
use std::time::Duration;

/// Moonshot AI (Kimi) provider - uses OpenAI-compatible API format
///
/// Moonshot's Kimi K2 models are advanced reasoning models with long context support.
/// API documentation: https://platform.moonshot.cn/docs

#[derive(Debug, Clone, Serialize, Deserialize)]
struct MoonshotMessage {
    role: String,
    content: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    tool_calls: Option<Vec<MoonshotToolCall>>,
    #[serde(skip_serializing_if = "Option::is_none")]
    tool_call_id: Option<String>,
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
#[serde(untagged)]
enum MoonshotToolChoiceValue {
    String(String),
    Specific {
        #[serde(rename = "type")]
        choice_type: String,
        function: MoonshotToolChoiceFunctionName,
    },
}

#[derive(Debug, Clone, Serialize)]
struct MoonshotToolChoiceFunctionName {
    name: String,
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
    tool_choice: Option<MoonshotToolChoiceValue>,
}

#[derive(Debug, Clone, Deserialize)]
struct MoonshotResponse {
    _id: String,
    model: String,
    choices: Vec<MoonshotChoice>,
    usage: MoonshotUsage,
}

#[derive(Debug, Clone, Deserialize)]
struct MoonshotChoice {
    message: MoonshotMessage,
    finish_reason: Option<String>,
    _index: u32,
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
        let client = Client::builder()
            .connect_timeout(Duration::from_secs(30))
            .timeout(Duration::from_secs(300))
            .build()
            .expect("Failed to create HTTP client");

        // Moonshot API base URL
        let base_url = std::env::var("MOONSHOT_API_BASE")
            .unwrap_or_else(|_| "https://api.moonshot.cn/v1".to_string());

        Self {
            api_key,
            client,
            base_url,
        }
    }

    /// Calculate cost for Moonshot models (per million tokens)
    fn calculate_cost(model: &str, prompt_tokens: u32, completion_tokens: u32) -> f64 {
        let (input_cost, output_cost) = match model {
            // Kimi K2 models (Updated 2026-01-01)
            "kimi-k2" => (0.5, 2.0),                // Base model
            "kimi-k2-thinking" => (1.0, 4.0),       // Extended thinking
            "kimi-k2-thinking-turbo" => (0.5, 2.0), // Fast thinking
            // Legacy moonshot models
            "moonshot-v1-8k" => (0.5, 0.5),
            "moonshot-v1-32k" => (1.0, 1.0),
            "moonshot-v1-128k" => (2.0, 2.0),
            // Default fallback
            _ => (1.0, 4.0),
        };

        let input = (prompt_tokens as f64 / 1_000_000.0) * input_cost;
        let output = (completion_tokens as f64 / 1_000_000.0) * output_cost;
        input + output
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

    fn convert_tool_choice(choice: &ToolChoice) -> Option<MoonshotToolChoiceValue> {
        match choice {
            ToolChoice::Auto => Some(MoonshotToolChoiceValue::String("auto".to_string())),
            ToolChoice::Required => Some(MoonshotToolChoiceValue::String("required".to_string())),
            ToolChoice::None => Some(MoonshotToolChoiceValue::String("none".to_string())),
            ToolChoice::Specific(name) => Some(MoonshotToolChoiceValue::Specific {
                choice_type: "function".to_string(),
                function: MoonshotToolChoiceFunctionName { name: name.clone() },
            }),
        }
    }

    fn convert_tool_calls(moonshot_calls: &[MoonshotToolCall]) -> Vec<ToolCall> {
        moonshot_calls
            .iter()
            .map(|call| ToolCall {
                id: call.id.clone(),
                name: call.function.name.clone(),
                arguments: call.function.arguments.clone(),
            })
            .collect()
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
            messages: request
                .messages
                .iter()
                .map(|m| {
                    let mut msg = MoonshotMessage {
                        role: m.role.clone(),
                        content: m.content.clone(),
                        tool_calls: None,
                        tool_call_id: m.tool_call_id.clone(),
                    };

                    if let Some(calls) = &m.tool_calls {
                        msg.tool_calls = Some(
                            calls
                                .iter()
                                .map(|call| MoonshotToolCall {
                                    id: call.id.clone(),
                                    call_type: "function".to_string(),
                                    function: MoonshotFunctionCall {
                                        name: call.name.clone(),
                                        arguments: call.arguments.clone(),
                                    },
                                })
                                .collect(),
                        );
                    }

                    msg
                })
                .collect(),
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

        let response_text = response.text().await?;
        tracing::debug!("Moonshot response body: {}", response_text);

        let moonshot_response: MoonshotResponse =
            serde_json::from_str(&response_text).map_err(|e| {
                format!(
                    "Failed to parse Moonshot response: {}. Body: {}",
                    e, response_text
                )
            })?;

        let choice = moonshot_response
            .choices
            .first()
            .ok_or("No choices in response")?;

        let tool_calls = choice
            .message
            .tool_calls
            .as_ref()
            .map(|calls| Self::convert_tool_calls(calls));

        let cost = Self::calculate_cost(
            &moonshot_response.model,
            moonshot_response.usage.prompt_tokens,
            moonshot_response.usage.completion_tokens,
        );

        Ok(LLMResponse {
            content: choice.message.content.clone(),
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

    fn is_configured(&self) -> bool {
        !self.api_key.is_empty() && self.api_key != "your-api-key-here"
    }

    fn name(&self) -> &str {
        "Moonshot"
    }

    fn supports_vision(&self) -> bool {
        // Moonshot Kimi models do not currently support vision/image inputs
        false
    }

    fn supports_function_calling(&self) -> bool {
        // Moonshot supports function calling in OpenAI-compatible format
        true
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
            messages: request
                .messages
                .iter()
                .map(|m| MoonshotMessage {
                    role: m.role.clone(),
                    content: m.content.clone(),
                    tool_calls: None,
                    tool_call_id: None,
                })
                .collect(),
            temperature: request.temperature,
            max_tokens: request.max_tokens,
            stream: Some(true),
            tools: request.tools.as_ref().map(|t| Self::convert_tools(t)),
            tool_choice: request
                .tool_choice
                .as_ref()
                .and_then(Self::convert_tool_choice),
        };

        tracing::debug!(
            "Starting Moonshot streaming request for model: {}",
            request.model
        );

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

        tracing::debug!("Moonshot streaming response received, starting SSE parsing");

        // Moonshot uses OpenAI-compatible SSE format
        Ok(Box::pin(parse_sse_stream(
            response,
            crate::core::llm::Provider::Moonshot,
        )))
    }
}
