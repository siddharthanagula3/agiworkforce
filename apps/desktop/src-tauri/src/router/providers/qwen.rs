/**
 * Qwen Provider (Alibaba Cloud - Qwen2.5-Max, Qwen3-Coder)
 * OpenAI-compatible API at https://dashscope-intl.aliyuncs.com/compatible-mode/v1
 */
use crate::router::{LLMProvider, LLMRequest, LLMResponse, ToolCall, ToolChoice, ToolDefinition};
use async_trait::async_trait;
use reqwest::Client;
use serde::{Deserialize, Serialize};
use std::error::Error;

const QWEN_API_BASE: &str = "https://dashscope-intl.aliyuncs.com/compatible-mode/v1";

pub struct QwenProvider {
    api_key: Option<String>,
    client: Client,
}

impl QwenProvider {
    pub fn new(api_key: Option<String>) -> Self {
        Self {
            api_key,
            client: Client::new(),
        }
    }

    fn get_api_key(&self) -> Result<&str, Box<dyn Error + Send + Sync>> {
        self.api_key
            .as_deref()
            .ok_or_else(|| "Qwen API key not configured".into())
    }

    /// Convert ToolDefinition to Qwen format (OpenAI-compatible)
    fn convert_tools(tools: &[ToolDefinition]) -> Vec<QwenTool> {
        tools
            .iter()
            .map(|tool| QwenTool {
                tool_type: "function".to_string(),
                function: QwenFunction {
                    name: tool.name.clone(),
                    description: tool.description.clone(),
                    parameters: tool.parameters.clone(),
                },
            })
            .collect()
    }

    /// Convert ToolChoice to Qwen format
    fn convert_tool_choice(choice: &ToolChoice) -> Option<QwenToolChoiceValue> {
        match choice {
            ToolChoice::Auto => Some(QwenToolChoiceValue::String("auto".to_string())),
            ToolChoice::Required => Some(QwenToolChoiceValue::String("required".to_string())),
            ToolChoice::None => Some(QwenToolChoiceValue::String("none".to_string())),
            ToolChoice::Specific(name) => Some(QwenToolChoiceValue::Specific {
                choice_type: "function".to_string(),
                function: QwenToolChoiceFunctionName { name: name.clone() },
            }),
        }
    }

    /// Convert Qwen tool calls to our format
    fn convert_tool_calls(qwen_calls: &[QwenToolCall]) -> Vec<ToolCall> {
        qwen_calls
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
struct QwenTool {
    #[serde(rename = "type")]
    tool_type: String, // "function"
    function: QwenFunction,
}

#[derive(Debug, Clone, Serialize)]
struct QwenFunction {
    name: String,
    description: String,
    parameters: serde_json::Value,
}

#[derive(Debug, Clone, Serialize)]
#[serde(untagged)]
enum QwenToolChoiceValue {
    String(String), // "auto", "required", "none"
    Specific {
        #[serde(rename = "type")]
        choice_type: String,
        function: QwenToolChoiceFunctionName,
    },
}

#[derive(Debug, Clone, Serialize)]
struct QwenToolChoiceFunctionName {
    name: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
struct QwenToolCall {
    id: String,
    #[serde(rename = "type")]
    call_type: String, // "function"
    function: QwenFunctionCall,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
struct QwenFunctionCall {
    name: String,
    arguments: String, // JSON string
}

#[derive(Debug, Serialize)]
struct QwenRequest {
    model: String,
    messages: Vec<QwenMessage>,
    #[serde(skip_serializing_if = "Option::is_none")]
    temperature: Option<f32>,
    #[serde(skip_serializing_if = "Option::is_none")]
    max_tokens: Option<u32>,
    #[serde(skip_serializing_if = "Option::is_none")]
    tools: Option<Vec<QwenTool>>,
    #[serde(skip_serializing_if = "Option::is_none")]
    tool_choice: Option<QwenToolChoiceValue>,
    stream: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
struct QwenMessage {
    role: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    content: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    tool_calls: Option<Vec<QwenToolCall>>,
    #[serde(skip_serializing_if = "Option::is_none")]
    tool_call_id: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    name: Option<String>,
}

#[derive(Debug, Deserialize)]
struct QwenResponse {
    choices: Vec<QwenChoice>,
    usage: QwenUsage,
    model: String,
}

#[derive(Debug, Deserialize)]
struct QwenChoice {
    message: QwenMessage,
    finish_reason: Option<String>,
}

#[derive(Debug, Deserialize)]
struct QwenUsage {
    prompt_tokens: u32,
    completion_tokens: u32,
    total_tokens: u32,
}

#[async_trait]
impl LLMProvider for QwenProvider {
    async fn send_message(
        &self,
        request: &LLMRequest,
    ) -> Result<LLMResponse, Box<dyn Error + Send + Sync>> {
        let api_key = self.get_api_key()?;

        let messages: Vec<QwenMessage> = request
            .messages
            .iter()
            .map(|m| {
                let mut msg = QwenMessage {
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
                            .map(|call| QwenToolCall {
                                id: call.id.clone(),
                                call_type: "function".to_string(),
                                function: QwenFunctionCall {
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

        let qwen_request = QwenRequest {
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
            .post(format!("{}/chat/completions", QWEN_API_BASE))
            .header("Authorization", format!("Bearer {}", api_key))
            .header("Content-Type", "application/json")
            .json(&qwen_request)
            .send()
            .await?;

        if !response.status().is_success() {
            let error_text = response.text().await?;
            return Err(format!("Qwen API error: {}", error_text).into());
        }

        let qwen_response: QwenResponse = response.json().await?;

        let choice = qwen_response
            .choices
            .first()
            .ok_or("No choices in Qwen response")?;

        let content = choice.message.content.clone().unwrap_or_default();

        let tool_calls = choice
            .message
            .tool_calls
            .as_ref()
            .map(|calls| Self::convert_tool_calls(calls));

        // Calculate cost (estimated $0.40/$1.20 per million tokens for Qwen2.5-Max)
        let cost = (qwen_response.usage.prompt_tokens as f64 * 0.0000004)
            + (qwen_response.usage.completion_tokens as f64 * 0.0000012);

        Ok(LLMResponse {
            content,
            tokens: Some(qwen_response.usage.total_tokens),
            prompt_tokens: Some(qwen_response.usage.prompt_tokens),
            completion_tokens: Some(qwen_response.usage.completion_tokens),
            cost: Some(cost),
            model: qwen_response.model,
            cached: false,
            tool_calls,
            finish_reason: choice.finish_reason.clone(),
        })
    }

    fn is_configured(&self) -> bool {
        self.api_key.is_some()
    }

    fn name(&self) -> &str {
        "qwen"
    }

    fn supports_function_calling(&self) -> bool {
        true // Qwen supports function calling via OpenAI-compatible API
    }
}
