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

/// Default DeepSeek API base URL - can be overridden via DEEPSEEK_API_BASE environment variable
const DEEPSEEK_API_BASE_DEFAULT: &str = "https://api.deepseek.com/v1";

pub struct DeepSeekProvider {
    api_key: Option<String>,
    client: Client,
    base_url: String,
}

impl DeepSeekProvider {
    pub fn new(api_key: Option<String>) -> Self {
        let client = Client::builder()
            .connect_timeout(Duration::from_secs(30))
            .timeout(Duration::from_secs(300))
            .build()
            .expect("Failed to create HTTP client");
        // Use environment variable for base URL, defaulting to official DeepSeek API
        let base_url = std::env::var("DEEPSEEK_API_BASE")
            .unwrap_or_else(|_| DEEPSEEK_API_BASE_DEFAULT.to_string());
        Self {
            api_key,
            client,
            base_url,
        }
    }

    fn get_api_key(&self) -> Result<&str, Box<dyn Error + Send + Sync>> {
        self.api_key
            .as_deref()
            .ok_or_else(|| "DeepSeek API key not configured".into())
    }

    fn convert_tools(tools: &[ToolDefinition]) -> Vec<DeepSeekTool> {
        tools
            .iter()
            .map(|tool| DeepSeekTool {
                tool_type: "function".to_string(),
                function: DeepSeekFunction {
                    name: tool.name.clone(),
                    description: tool.description.clone(),
                    parameters: tool.parameters.clone(),
                },
            })
            .collect()
    }

    fn convert_tool_choice(choice: &ToolChoice) -> Option<DeepSeekToolChoiceValue> {
        match choice {
            ToolChoice::Auto => Some(DeepSeekToolChoiceValue::String("auto".to_string())),
            ToolChoice::Required => Some(DeepSeekToolChoiceValue::String("required".to_string())),
            ToolChoice::None => Some(DeepSeekToolChoiceValue::String("none".to_string())),
            ToolChoice::Specific(name) => Some(DeepSeekToolChoiceValue::Specific {
                choice_type: "function".to_string(),
                function: DeepSeekToolChoiceFunctionName { name: name.clone() },
            }),
        }
    }

    fn convert_tool_calls(deepseek_calls: &[DeepSeekToolCall]) -> Vec<ToolCall> {
        deepseek_calls
            .iter()
            .map(|call| ToolCall {
                id: call.id.clone(),
                name: call.function.name.clone(),
                arguments: call.function.arguments.clone(),
            })
            .collect()
    }

    fn calculate_cost(model: &str, input_tokens: u32, output_tokens: u32) -> f64 {
        let (input_cost, output_cost) = match model {
            "deepseek-reasoner" => (0.55, 2.19),
            "deepseek-chat" | "deepseek-v3" => (0.14, 0.28),
            _ => (0.14, 0.28),
        };

        let input = (input_tokens as f64 / 1_000_000.0) * input_cost;
        let output = (output_tokens as f64 / 1_000_000.0) * output_cost;
        input + output
    }
}

#[derive(Debug, Clone, Serialize)]
struct DeepSeekTool {
    #[serde(rename = "type")]
    tool_type: String,
    function: DeepSeekFunction,
}

#[derive(Debug, Clone, Serialize)]
struct DeepSeekFunction {
    name: String,
    description: String,
    parameters: serde_json::Value,
}

#[derive(Debug, Clone, Serialize)]
#[serde(untagged)]
enum DeepSeekToolChoiceValue {
    String(String),
    Specific {
        #[serde(rename = "type")]
        choice_type: String,
        function: DeepSeekToolChoiceFunctionName,
    },
}

#[derive(Debug, Clone, Serialize)]
struct DeepSeekToolChoiceFunctionName {
    name: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
struct DeepSeekToolCall {
    id: String,
    #[serde(rename = "type")]
    call_type: String,
    function: DeepSeekFunctionCall,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
struct DeepSeekFunctionCall {
    name: String,
    arguments: String,
}

#[derive(Debug, Serialize)]
struct DeepSeekRequest {
    model: String,
    messages: Vec<DeepSeekMessage>,
    #[serde(skip_serializing_if = "Option::is_none")]
    temperature: Option<f32>,
    #[serde(skip_serializing_if = "Option::is_none")]
    max_tokens: Option<u32>,
    #[serde(skip_serializing_if = "Option::is_none")]
    tools: Option<Vec<DeepSeekTool>>,
    #[serde(skip_serializing_if = "Option::is_none")]
    tool_choice: Option<DeepSeekToolChoiceValue>,
    stream: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
struct DeepSeekMessage {
    role: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    content: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    tool_calls: Option<Vec<DeepSeekToolCall>>,
    #[serde(skip_serializing_if = "Option::is_none")]
    tool_call_id: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    name: Option<String>,
}

#[derive(Debug, Deserialize)]
struct DeepSeekResponse {
    choices: Vec<DeepSeekChoice>,
    usage: DeepSeekUsage,
    model: String,
}

#[derive(Debug, Deserialize)]
struct DeepSeekChoice {
    message: DeepSeekMessage,
    finish_reason: Option<String>,
}

#[derive(Debug, Deserialize)]
struct DeepSeekUsage {
    prompt_tokens: u32,
    completion_tokens: u32,
    total_tokens: u32,
}

#[async_trait]
impl LLMProvider for DeepSeekProvider {
    async fn send_message(
        &self,
        request: &LLMRequest,
    ) -> Result<LLMResponse, Box<dyn Error + Send + Sync>> {
        let api_key = self.get_api_key()?;

        let messages: Vec<DeepSeekMessage> = request
            .messages
            .iter()
            .map(|m| {
                let mut msg = DeepSeekMessage {
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
                            .map(|call| DeepSeekToolCall {
                                id: call.id.clone(),
                                call_type: "function".to_string(),
                                function: DeepSeekFunctionCall {
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

        let deepseek_request = DeepSeekRequest {
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
            .json(&deepseek_request)
            .send()
            .await?;

        if !response.status().is_success() {
            let status = response.status();
            let error_text = response
                .text()
                .await
                .unwrap_or_else(|_| "Unknown error".to_string());
            return Err(format!("DeepSeek API error {}: {}", status, error_text).into());
        }

        let deepseek_response: DeepSeekResponse = response.json().await?;

        let choice = deepseek_response
            .choices
            .first()
            .ok_or("No choices in DeepSeek response")?;

        let content = choice.message.content.clone().unwrap_or_default();

        let tool_calls = choice
            .message
            .tool_calls
            .as_ref()
            .map(|calls| Self::convert_tool_calls(calls));

        let cost = Self::calculate_cost(
            &deepseek_response.model,
            deepseek_response.usage.prompt_tokens,
            deepseek_response.usage.completion_tokens,
        );

        Ok(LLMResponse {
            content,
            tokens: Some(deepseek_response.usage.total_tokens),
            prompt_tokens: Some(deepseek_response.usage.prompt_tokens),
            completion_tokens: Some(deepseek_response.usage.completion_tokens),
            cost: Some(cost),
            model: deepseek_response.model,
            cached: false,
            tool_calls,
            finish_reason: choice.finish_reason.clone(),
            credits: None,
        })
    }

    fn is_configured(&self) -> bool {
        self.api_key.is_some()
    }

    fn name(&self) -> &str {
        "deepseek"
    }

    fn supports_vision(&self) -> bool {
        // DeepSeek does not currently support vision/image inputs
        false
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

        let messages: Vec<DeepSeekMessage> = request
            .messages
            .iter()
            .map(|m| {
                let mut msg = DeepSeekMessage {
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
                            .map(|call| DeepSeekToolCall {
                                id: call.id.clone(),
                                call_type: "function".to_string(),
                                function: DeepSeekFunctionCall {
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

        let deepseek_request = DeepSeekRequest {
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
            "Starting DeepSeek streaming request for model: {}",
            request.model
        );

        let response = self
            .client
            .post(format!("{}/chat/completions", self.base_url))
            .header("Authorization", format!("Bearer {}", api_key))
            .header("Content-Type", "application/json")
            .json(&deepseek_request)
            .send()
            .await?;

        if !response.status().is_success() {
            let status = response.status();
            let error_text = response
                .text()
                .await
                .unwrap_or_else(|_| "Unknown error".to_string());
            return Err(format!("DeepSeek API error {}: {}", status, error_text).into());
        }

        tracing::debug!("DeepSeek streaming response received, starting SSE parsing");

        Ok(Box::pin(parse_sse_stream(
            response,
            crate::core::llm::Provider::DeepSeek,
        )))
    }
}
