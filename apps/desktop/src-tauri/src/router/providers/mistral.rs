/**
 * Mistral AI Provider (Mistral Large 2, Codestral)
 * OpenAI-compatible API at https://api.mistral.ai/v1
 */
use crate::router::{LLMProvider, LLMRequest, LLMResponse, ToolCall, ToolChoice, ToolDefinition};
use async_trait::async_trait;
use reqwest::Client;
use serde::{Deserialize, Serialize};
use std::error::Error;

const MISTRAL_API_BASE: &str = "https://api.mistral.ai/v1";

pub struct MistralProvider {
    api_key: Option<String>,
    client: Client,
}

impl MistralProvider {
    pub fn new(api_key: Option<String>) -> Self {
        Self {
            api_key,
            client: Client::new(),
        }
    }

    fn get_api_key(&self) -> Result<&str, Box<dyn Error + Send + Sync>> {
        self.api_key
            .as_deref()
            .ok_or_else(|| "Mistral API key not configured".into())
    }

    /// Convert ToolDefinition to Mistral format (OpenAI-compatible)
    fn convert_tools(tools: &[ToolDefinition]) -> Vec<MistralTool> {
        tools
            .iter()
            .map(|tool| MistralTool {
                tool_type: "function".to_string(),
                function: MistralFunction {
                    name: tool.name.clone(),
                    description: tool.description.clone(),
                    parameters: tool.parameters.clone(),
                },
            })
            .collect()
    }

    /// Convert ToolChoice to Mistral format
    fn convert_tool_choice(choice: &ToolChoice) -> Option<MistralToolChoiceValue> {
        match choice {
            ToolChoice::Auto => Some(MistralToolChoiceValue::String("auto".to_string())),
            ToolChoice::Required => Some(MistralToolChoiceValue::String("required".to_string())),
            ToolChoice::None => Some(MistralToolChoiceValue::String("none".to_string())),
            ToolChoice::Specific(name) => Some(MistralToolChoiceValue::Specific {
                choice_type: "function".to_string(),
                function: MistralToolChoiceFunctionName { name: name.clone() },
            }),
        }
    }

    /// Convert Mistral tool calls to our format
    fn convert_tool_calls(mistral_calls: &[MistralToolCall]) -> Vec<ToolCall> {
        mistral_calls
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
struct MistralTool {
    #[serde(rename = "type")]
    tool_type: String, // "function"
    function: MistralFunction,
}

#[derive(Debug, Clone, Serialize)]
struct MistralFunction {
    name: String,
    description: String,
    parameters: serde_json::Value,
}

#[derive(Debug, Clone, Serialize)]
#[serde(untagged)]
enum MistralToolChoiceValue {
    String(String), // "auto", "required", "none"
    Specific {
        #[serde(rename = "type")]
        choice_type: String,
        function: MistralToolChoiceFunctionName,
    },
}

#[derive(Debug, Clone, Serialize)]
struct MistralToolChoiceFunctionName {
    name: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
struct MistralToolCall {
    id: String,
    #[serde(rename = "type")]
    call_type: String, // "function"
    function: MistralFunctionCall,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
struct MistralFunctionCall {
    name: String,
    arguments: String, // JSON string
}

#[derive(Debug, Serialize)]
struct MistralRequest {
    model: String,
    messages: Vec<MistralMessage>,
    #[serde(skip_serializing_if = "Option::is_none")]
    temperature: Option<f32>,
    #[serde(skip_serializing_if = "Option::is_none")]
    max_tokens: Option<u32>,
    #[serde(skip_serializing_if = "Option::is_none")]
    tools: Option<Vec<MistralTool>>,
    #[serde(skip_serializing_if = "Option::is_none")]
    tool_choice: Option<MistralToolChoiceValue>,
    stream: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
struct MistralMessage {
    role: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    content: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    tool_calls: Option<Vec<MistralToolCall>>,
    #[serde(skip_serializing_if = "Option::is_none")]
    tool_call_id: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    name: Option<String>,
}

#[derive(Debug, Deserialize)]
struct MistralResponse {
    choices: Vec<MistralChoice>,
    usage: MistralUsage,
    model: String,
}

#[derive(Debug, Deserialize)]
struct MistralChoice {
    message: MistralMessage,
    finish_reason: Option<String>,
}

#[derive(Debug, Deserialize)]
struct MistralUsage {
    prompt_tokens: u32,
    completion_tokens: u32,
    total_tokens: u32,
}

#[async_trait]
impl LLMProvider for MistralProvider {
    async fn send_message(
        &self,
        request: &LLMRequest,
    ) -> Result<LLMResponse, Box<dyn Error + Send + Sync>> {
        let api_key = self.get_api_key()?;

        let messages: Vec<MistralMessage> = request
            .messages
            .iter()
            .map(|m| {
                let mut msg = MistralMessage {
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
                            .map(|call| MistralToolCall {
                                id: call.id.clone(),
                                call_type: "function".to_string(),
                                function: MistralFunctionCall {
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

        let mistral_request = MistralRequest {
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
            .post(format!("{}/chat/completions", MISTRAL_API_BASE))
            .header("Authorization", format!("Bearer {}", api_key))
            .header("Content-Type", "application/json")
            .json(&mistral_request)
            .send()
            .await?;

        if !response.status().is_success() {
            let error_text = response.text().await?;
            return Err(format!("Mistral API error: {}", error_text).into());
        }

        let mistral_response: MistralResponse = response.json().await?;

        let choice = mistral_response
            .choices
            .first()
            .ok_or("No choices in Mistral response")?;

        let content = choice.message.content.clone().unwrap_or_default();

        let tool_calls = choice
            .message
            .tool_calls
            .as_ref()
            .map(|calls| Self::convert_tool_calls(calls));

        // Calculate cost ($2/$6 per million tokens for Mistral Large 2)
        let cost = (mistral_response.usage.prompt_tokens as f64 * 0.000002)
            + (mistral_response.usage.completion_tokens as f64 * 0.000006);

        Ok(LLMResponse {
            content,
            tokens: Some(mistral_response.usage.total_tokens),
            prompt_tokens: Some(mistral_response.usage.prompt_tokens),
            completion_tokens: Some(mistral_response.usage.completion_tokens),
            cost: Some(cost),
            model: mistral_response.model,
            cached: false,
            tool_calls,
            finish_reason: choice.finish_reason.clone(),
        })
    }

    fn is_configured(&self) -> bool {
        self.api_key.is_some()
    }

    fn name(&self) -> &str {
        "mistral"
    }

    fn supports_function_calling(&self) -> bool {
        true // Mistral supports function calling via OpenAI-compatible API
    }
}
