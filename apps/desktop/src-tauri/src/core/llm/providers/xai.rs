use crate::core::llm::sse_parser::{parse_sse_stream, StreamChunk};
use crate::core::llm::{
    LLMProvider, LLMRequest, LLMResponse, ToolCall, ToolChoice, ToolDefinition,
};
use async_trait::async_trait;
use futures_util::Stream;
use reqwest::Client;
use serde::{Deserialize, Serialize};
use std::error::Error;
use std::pin::Pin;
use std::time::Duration;

/// Default XAI API base URL - can be overridden via XAI_API_BASE environment variable
const XAI_API_BASE_DEFAULT: &str = "https://api.x.ai/v1";

pub struct XAIProvider {
    api_key: Option<String>,
    client: Client,
    base_url: String,
}

impl XAIProvider {
    /// Create a new XAI provider with the given optional API key.
    ///
    /// Returns error if the HTTP client cannot be created (TLS initialization failure).
    pub fn new(api_key: Option<String>) -> Result<Self, Box<dyn std::error::Error + Send + Sync>> {
        let client = Client::builder()
            .connect_timeout(Duration::from_secs(30))
            .timeout(Duration::from_secs(300))
            .build()
            .map_err(|e| Box::new(e) as Box<dyn std::error::Error + Send + Sync>)?;
        // Use environment variable for base URL, defaulting to official xAI API
        let base_url =
            std::env::var("XAI_API_BASE").unwrap_or_else(|_| XAI_API_BASE_DEFAULT.to_string());
        Ok(Self {
            api_key,
            client,
            base_url,
        })
    }

    fn calculate_cost(model: &str, input_tokens: u32, output_tokens: u32) -> f64 {
        let (input_cost, output_cost) = match model {
            "grok-4.1" => (5.5, 16.5),
            "grok-4.1-fast" | "grok-4.1-fast-reasoning" => (0.1, 0.4), // Same price for reasoning and non-reasoning
            _ => (3.0, 15.0), // Default to Grok Beta pricing or similar
        };

        let input = (input_tokens as f64 / 1_000_000.0) * input_cost;
        let output = (output_tokens as f64 / 1_000_000.0) * output_cost;
        input + output
    }

    fn get_api_key(&self) -> Result<&str, Box<dyn Error + Send + Sync>> {
        self.api_key
            .as_deref()
            .ok_or_else(|| "XAI API key not configured".into())
    }

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
    tool_type: String,
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
    String(String),
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
    call_type: String,
    function: XAIFunctionCall,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
struct XAIFunctionCall {
    name: String,
    arguments: String,
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
            .post(format!("{}/chat/completions", self.base_url))
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

        let cost = Self::calculate_cost(
            &xai_response.model,
            xai_response.usage.prompt_tokens,
            xai_response.usage.completion_tokens,
        );

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
            credits: None,
            ..Default::default()
        })
    }

    fn is_configured(&self) -> bool {
        self.api_key.is_some()
    }

    fn name(&self) -> &str {
        "xai"
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
            .post(format!("{}/chat/completions", self.base_url))
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
            crate::core::llm::Provider::XAI,
        )))
    }
}
