use crate::router::sse_parser::{parse_sse_stream, StreamChunk};
use crate::router::{LLMProvider, LLMRequest, LLMResponse, ToolCall, ToolChoice, ToolDefinition};
use futures_util::Stream;
use reqwest::Client;
use serde::{Deserialize, Serialize};
use std::error::Error;
use std::pin::Pin;

#[derive(Debug, Clone, Serialize, Deserialize)]
struct OpenAIMessage {
    role: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    content: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    tool_calls: Option<Vec<OpenAIToolCall>>,
    #[serde(skip_serializing_if = "Option::is_none")]
    tool_call_id: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    name: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
struct OpenAIToolCall {
    id: String,
    #[serde(rename = "type")]
    call_type: String, // "function"
    function: OpenAIFunctionCall,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
struct OpenAIFunctionCall {
    name: String,
    arguments: String, // JSON string
}

#[derive(Debug, Clone, Serialize)]
struct OpenAITool {
    #[serde(rename = "type")]
    tool_type: String, // "function"
    function: OpenAIFunction,
}

#[derive(Debug, Clone, Serialize)]
struct OpenAIFunction {
    name: String,
    description: String,
    parameters: serde_json::Value,
}

#[derive(Debug, Clone, Serialize)]
#[serde(untagged)]
enum OpenAIToolChoiceValue {
    String(String), // "auto", "required", "none"
    Specific {
        #[serde(rename = "type")]
        choice_type: String,
        function: OpenAIToolChoiceFunctionName,
    },
}

#[derive(Debug, Clone, Serialize)]
struct OpenAIToolChoiceFunctionName {
    name: String,
}

#[derive(Debug, Clone, Serialize)]
struct OpenAIRequest {
    model: String,
    messages: Vec<OpenAIMessage>,
    #[serde(skip_serializing_if = "Option::is_none")]
    temperature: Option<f32>,
    #[serde(skip_serializing_if = "Option::is_none")]
    max_tokens: Option<u32>,
    #[serde(skip_serializing_if = "Option::is_none")]
    stream: Option<bool>,
    #[serde(skip_serializing_if = "Option::is_none")]
    tools: Option<Vec<OpenAITool>>,
    #[serde(skip_serializing_if = "Option::is_none")]
    tool_choice: Option<OpenAIToolChoiceValue>,
}

#[derive(Debug, Clone, Deserialize)]
struct OpenAIResponse {
    _id: String,
    choices: Vec<OpenAIChoice>,
    usage: OpenAIUsage,
    model: String,
}

#[derive(Debug, Clone, Deserialize)]
struct OpenAIChoice {
    message: OpenAIMessage,
    finish_reason: Option<String>,
}

#[derive(Debug, Clone, Deserialize)]
struct OpenAIUsage {
    prompt_tokens: u32,
    completion_tokens: u32,
    total_tokens: u32,
}

pub struct OpenAIProvider {
    api_key: String,
    client: Client,
    base_url: String,
}

impl OpenAIProvider {
    pub fn new(api_key: String) -> Self {
        Self {
            api_key,
            client: Client::new(),
            base_url: "https://api.openai.com/v1".to_string(),
        }
    }

    /// Calculate cost based on model and tokens
    fn calculate_cost(model: &str, prompt_tokens: u32, completion_tokens: u32) -> f64 {
        // Pricing as of November 2025 (per 1M tokens)
        let (input_cost, output_cost) = match model {
            // 2025 Latest Models
            "gpt-5" => (15.0, 45.0),                    // GPT-5 flagship
            "gpt-5-codex" => (10.0, 30.0),              // GPT-5 Codex for coding
            "gpt-5-mini" => (2.0, 6.0),                 // GPT-5 Mini
            "o3" | "o3-mini" => (15.0, 60.0),           // o3 reasoning model

            // Previous Generation
            "gpt-4-turbo" | "gpt-4-turbo-preview" => (10.0, 30.0),
            "gpt-4" => (30.0, 60.0),
            "gpt-3.5-turbo" => (0.5, 1.5),
            "gpt-4o" => (5.0, 15.0),
            "gpt-4o-mini" => (0.15, 0.6),
            _ => (0.5, 1.5), // Default to gpt-3.5-turbo pricing
        };

        let input = (prompt_tokens as f64 / 1_000_000.0) * input_cost;
        let output = (completion_tokens as f64 / 1_000_000.0) * output_cost;
        input + output
    }

    /// Convert ToolDefinition to OpenAI format
    fn convert_tools(tools: &[ToolDefinition]) -> Vec<OpenAITool> {
        tools
            .iter()
            .map(|tool| OpenAITool {
                tool_type: "function".to_string(),
                function: OpenAIFunction {
                    name: tool.name.clone(),
                    description: tool.description.clone(),
                    parameters: tool.parameters.clone(),
                },
            })
            .collect()
    }

    /// Convert ToolChoice to OpenAI format
    fn convert_tool_choice(choice: &ToolChoice) -> Option<OpenAIToolChoiceValue> {
        match choice {
            ToolChoice::Auto => Some(OpenAIToolChoiceValue::String("auto".to_string())),
            ToolChoice::Required => Some(OpenAIToolChoiceValue::String("required".to_string())),
            ToolChoice::None => Some(OpenAIToolChoiceValue::String("none".to_string())),
            ToolChoice::Specific(name) => Some(OpenAIToolChoiceValue::Specific {
                choice_type: "function".to_string(),
                function: OpenAIToolChoiceFunctionName { name: name.clone() },
            }),
        }
    }

    /// Convert OpenAI tool calls to our format
    fn convert_tool_calls(openai_calls: &[OpenAIToolCall]) -> Vec<ToolCall> {
        openai_calls
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
impl LLMProvider for OpenAIProvider {
    async fn send_message(
        &self,
        request: &LLMRequest,
    ) -> Result<LLMResponse, Box<dyn Error + Send + Sync>> {
        let openai_request = OpenAIRequest {
            model: request.model.clone(),
            messages: request
                .messages
                .iter()
                .map(|m| {
                    let mut msg = OpenAIMessage {
                        role: m.role.clone(),
                        content: if m.content.is_empty() {
                            None
                        } else {
                            Some(m.content.clone())
                        },
                        tool_calls: None,
                        tool_call_id: m.tool_call_id.clone(),
                        name: None,
                    };

                    // Convert tool calls if present
                    if let Some(calls) = &m.tool_calls {
                        msg.tool_calls = Some(
                            calls
                                .iter()
                                .map(|call| OpenAIToolCall {
                                    id: call.id.clone(),
                                    call_type: "function".to_string(),
                                    function: OpenAIFunctionCall {
                                        name: call.name.clone(),
                                        arguments: call.arguments.clone(),
                                    },
                                })
                                .collect(),
                        );
                    }

                    // If role is "tool", set name field
                    if m.role == "tool" {
                        msg.name = Some(
                            m.tool_calls
                                .as_ref()
                                .and_then(|calls| calls.first())
                                .map(|call| call.name.clone())
                                .unwrap_or_default(),
                        );
                    }

                    msg
                })
                .collect(),
            temperature: request.temperature,
            max_tokens: request.max_tokens,
            stream: if request.stream { Some(false) } else { None },
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
            .json(&openai_request)
            .send()
            .await?;

        if !response.status().is_success() {
            let status = response.status();
            let error_text = response
                .text()
                .await
                .unwrap_or_else(|_| "Unknown error".to_string());
            return Err(format!("OpenAI API error {}: {}", status, error_text).into());
        }

        let openai_response: OpenAIResponse = response.json().await?;

        let choice = openai_response
            .choices
            .first()
            .ok_or("No choices in response")?;

        let content = choice.message.content.clone().unwrap_or_default();

        let tool_calls = choice
            .message
            .tool_calls
            .as_ref()
            .map(|calls| Self::convert_tool_calls(calls));

        let cost = Self::calculate_cost(
            &openai_response.model,
            openai_response.usage.prompt_tokens,
            openai_response.usage.completion_tokens,
        );

        Ok(LLMResponse {
            content,
            tokens: Some(openai_response.usage.total_tokens),
            prompt_tokens: Some(openai_response.usage.prompt_tokens),
            completion_tokens: Some(openai_response.usage.completion_tokens),
            cost: Some(cost),
            model: openai_response.model,
            tool_calls,
            finish_reason: choice.finish_reason.clone(),
            ..LLMResponse::default()
        })
    }

    fn is_configured(&self) -> bool {
        !self.api_key.is_empty() && self.api_key != "your-api-key-here"
    }

    fn name(&self) -> &str {
        "OpenAI"
    }

    async fn send_message_streaming(
        &self,
        request: &LLMRequest,
    ) -> Result<
        Pin<Box<dyn Stream<Item = Result<StreamChunk, Box<dyn Error + Send + Sync>>> + Send>>,
        Box<dyn Error + Send + Sync>,
    > {
        let openai_request = OpenAIRequest {
            model: request.model.clone(),
            messages: request
                .messages
                .iter()
                .map(|m| OpenAIMessage {
                    role: m.role.clone(),
                    content: Some(m.content.clone()),
                    tool_calls: None,
                    tool_call_id: None,
                    name: None,
                })
                .collect(),
            temperature: request.temperature,
            max_tokens: request.max_tokens,
            stream: Some(true),
            tools: None, // Streaming with tools not yet implemented
            tool_choice: None,
        };

        tracing::debug!(
            "Starting OpenAI streaming request for model: {}",
            request.model
        );

        let response = self
            .client
            .post(format!("{}/chat/completions", self.base_url))
            .header("Authorization", format!("Bearer {}", self.api_key))
            .header("Content-Type", "application/json")
            .json(&openai_request)
            .send()
            .await?;

        if !response.status().is_success() {
            let status = response.status();
            let error_text = response
                .text()
                .await
                .unwrap_or_else(|_| "Unknown error".to_string());
            return Err(format!("OpenAI API error {}: {}", status, error_text).into());
        }

        tracing::debug!("OpenAI streaming response received, starting SSE parsing");

        Ok(Box::pin(parse_sse_stream(
            response,
            crate::router::Provider::OpenAI,
        )))
    }
}
