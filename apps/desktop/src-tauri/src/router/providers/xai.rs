/**
 * xAI Provider (Grok 4, Grok 3)
 * OpenAI-compatible API at https://api.x.ai/v1
 * With full function calling support
 */
use crate::router::sse_parser::{parse_sse_stream, StreamChunk};
use crate::router::{LLMProvider, LLMRequest, LLMResponse, ToolCall, ToolChoice, ToolDefinition};
use async_trait::async_trait;
use futures_util::Stream;
use reqwest::Client;
use serde::{Deserialize, Serialize};
use std::error::Error;
use std::pin::Pin;

const XAI_API_BASE: &str = "https://api.x.ai/v1";

pub struct XAIProvider {
    api_key: Option<String>,
    client: Client,
}

impl XAIProvider {
    pub fn new(api_key: Option<String>) -> Self {
        Self {
            api_key,
            client: Client::new(),
        }
    }

    fn get_api_key(&self) -> Result<&str, Box<dyn Error + Send + Sync>> {
        self.api_key
            .as_deref()
            .ok_or_else(|| "XAI API key not configured".into())
    }

    /// Convert ToolDefinition to XAI format (OpenAI-compatible)
    fn convert_tools(tools: &[ToolDefinition]) -> Vec<XAITool> {
        tools
            .iter()
            .map(|tool| XAITool {
                tool_type: "function".to_string(),
                function: XAIFunction {
                    name: tool.name.clone(),
                    description: tool.description.clone(),
                    parameters: tool.parameters.clone(),
                },
            })
            .collect()
    }

    /// Convert ToolChoice to XAI format
    fn convert_tool_choice(choice: &ToolChoice) -> Option<XAIToolChoiceValue> {
        match choice {
            ToolChoice::Auto => Some(XAIToolChoiceValue::String("auto".to_string())),
            ToolChoice::Required => Some(XAIToolChoiceValue::String("required".to_string())),
            ToolChoice::None => Some(XAIToolChoiceValue::String("none".to_string())),
            ToolChoice::Specific(name) => Some(XAIToolChoiceValue::Specific {
                choice_type: "function".to_string(),
                function: XAIToolChoiceFunctionName { name: name.clone() },
            }),
        }
    }

    /// Convert XAI tool calls to our format
    fn convert_tool_calls(xai_calls: &[XAIToolCall]) -> Vec<ToolCall> {
        xai_calls
            .iter()
            .map(|call| ToolCall {
                id: call.id.clone(),
                name: call.function.name.clone(),
                arguments: call.function.arguments.clone(),
            })
            .collect()
    }
}

#[derive(Debug, Clone, Serialize)]
struct XAITool {
    #[serde(rename = "type")]
    tool_type: String, // "function"
    function: XAIFunction,
}

#[derive(Debug, Clone, Serialize)]
struct XAIFunction {
    name: String,
    description: String,
    parameters: serde_json::Value,
}

#[derive(Debug, Clone, Serialize)]
#[serde(untagged)]
enum XAIToolChoiceValue {
    String(String), // "auto", "required", "none"
    Specific {
        #[serde(rename = "type")]
        choice_type: String,
        function: XAIToolChoiceFunctionName,
    },
}

#[derive(Debug, Clone, Serialize)]
struct XAIToolChoiceFunctionName {
    name: String,
}

#[derive(Debug, Serialize)]
struct XAIRequest {
    model: String,
    messages: Vec<XAIMessage>,
    #[serde(skip_serializing_if = "Option::is_none")]
    temperature: Option<f32>,
    #[serde(skip_serializing_if = "Option::is_none")]
    max_tokens: Option<u32>,
    #[serde(skip_serializing_if = "Option::is_none")]
    tools: Option<Vec<XAITool>>,
    #[serde(skip_serializing_if = "Option::is_none")]
    tool_choice: Option<XAIToolChoiceValue>,
    stream: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
struct XAIMessage {
    role: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    content: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    tool_calls: Option<Vec<XAIToolCall>>,
    #[serde(skip_serializing_if = "Option::is_none")]
    tool_call_id: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    name: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
struct XAIToolCall {
    id: String,
    #[serde(rename = "type")]
    call_type: String, // "function"
    function: XAIFunctionCall,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
struct XAIFunctionCall {
    name: String,
    arguments: String, // JSON string
}

#[derive(Debug, Deserialize)]
struct XAIResponse {
    choices: Vec<XAIChoice>,
    usage: XAIUsage,
    model: String,
}

#[derive(Debug, Deserialize)]
struct XAIChoice {
    message: XAIMessage,
    finish_reason: Option<String>,
}

#[derive(Debug, Deserialize)]
struct XAIUsage {
    prompt_tokens: u32,
    completion_tokens: u32,
    total_tokens: u32,
}

#[async_trait]
impl LLMProvider for XAIProvider {
    async fn send_message(
        &self,
        request: &LLMRequest,
    ) -> Result<LLMResponse, Box<dyn Error + Send + Sync>> {
        let api_key = self.get_api_key()?;

        let messages: Vec<XAIMessage> = request
            .messages
            .iter()
            .map(|m| {
                let mut msg = XAIMessage {
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
                            .map(|call| XAIToolCall {
                                id: call.id.clone(),
                                call_type: "function".to_string(),
                                function: XAIFunctionCall {
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
            .collect();

        let xai_request = XAIRequest {
            model: request.model.clone(),
            messages,
            temperature: request.temperature,
            max_tokens: request.max_tokens,
            tools: request.tools.as_ref().map(|t| Self::convert_tools(t)),
            tool_choice: request
                .tool_choice
                .as_ref()
                .and_then(Self::convert_tool_choice),
            stream: false,
        };

        let response = self
            .client
            .post(format!("{}/chat/completions", XAI_API_BASE))
            .header("Authorization", format!("Bearer {}", api_key))
            .header("Content-Type", "application/json")
            .json(&xai_request)
            .send()
            .await?;

        if !response.status().is_success() {
            let error_text = response.text().await?;
            return Err(format!("XAI API error: {}", error_text).into());
        }

        let xai_response: XAIResponse = response.json().await?;

        let choice = xai_response
            .choices
            .first()
            .ok_or("No choices in XAI response")?;

        let content = choice.message.content.clone().unwrap_or_default();

        let tool_calls = choice
            .message
            .tool_calls
            .as_ref()
            .map(|calls| Self::convert_tool_calls(calls));

        // Calculate cost ($3/$15 per million tokens)
        let cost = (xai_response.usage.prompt_tokens as f64 * 0.000003)
            + (xai_response.usage.completion_tokens as f64 * 0.000015);

        Ok(LLMResponse {
            content,
            tokens: Some(xai_response.usage.total_tokens),
            prompt_tokens: Some(xai_response.usage.prompt_tokens),
            completion_tokens: Some(xai_response.usage.completion_tokens),
            cost: Some(cost),
            model: xai_response.model,
            cached: false,
            tool_calls,
            finish_reason: choice.finish_reason.clone(),
        })
    }

    fn is_configured(&self) -> bool {
        self.api_key.is_some()
    }

    fn name(&self) -> &str {
        "xai"
    }

    fn supports_vision(&self) -> bool {
        true // Grok models support vision
    }

    fn supports_function_calling(&self) -> bool {
        true // XAI supports function calling
    }

    async fn send_message_streaming(
        &self,
        request: &LLMRequest,
    ) -> Result<
        Pin<Box<dyn Stream<Item = Result<StreamChunk, Box<dyn Error + Send + Sync>>> + Send>>,
        Box<dyn Error + Send + Sync>,
    > {
        let api_key = self.get_api_key()?;

        let messages: Vec<XAIMessage> = request
            .messages
            .iter()
            .map(|m| {
                let mut msg = XAIMessage {
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
                            .map(|call| XAIToolCall {
                                id: call.id.clone(),
                                call_type: "function".to_string(),
                                function: XAIFunctionCall {
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
            .collect();

        let xai_request = XAIRequest {
            model: request.model.clone(),
            messages,
            temperature: request.temperature,
            max_tokens: request.max_tokens,
            tools: request.tools.as_ref().map(|t| Self::convert_tools(t)),
            tool_choice: request
                .tool_choice
                .as_ref()
                .and_then(Self::convert_tool_choice),
            stream: true,
        };

        tracing::debug!(
            "Starting XAI streaming request for model: {}",
            request.model
        );

        let response = self
            .client
            .post(format!("{}/chat/completions", XAI_API_BASE))
            .header("Authorization", format!("Bearer {}", api_key))
            .header("Content-Type", "application/json")
            .json(&xai_request)
            .send()
            .await?;

        if !response.status().is_success() {
            let status = response.status();
            let error_text = response
                .text()
                .await
                .unwrap_or_else(|_| "Unknown error".to_string());
            return Err(format!("XAI API error {}: {}", status, error_text).into());
        }

        tracing::debug!("XAI streaming response received, starting SSE parsing");

        Ok(Box::pin(parse_sse_stream(
            response,
            crate::router::Provider::XAI,
        )))
    }
}
