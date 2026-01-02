use crate::core::router::sse_parser::{parse_sse_stream, StreamChunk};
use crate::core::router::{
    ContentPart, ImageDetail, ImageFormat, LLMProvider, LLMRequest, LLMResponse, ToolCall,
    ToolChoice, ToolDefinition,
};
use futures_util::Stream;
use reqwest::Client;
use serde::{Deserialize, Serialize};
use std::error::Error;
use std::pin::Pin;
use std::time::Duration;

#[derive(Debug, Clone, Serialize, Deserialize)]
struct OpenAIMessage {
    role: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    content: Option<OpenAIContent>,
    #[serde(skip_serializing_if = "Option::is_none")]
    tool_calls: Option<Vec<OpenAIToolCall>>,
    #[serde(skip_serializing_if = "Option::is_none")]
    tool_call_id: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    name: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(untagged)]
enum OpenAIContent {
    Text(String),
    Multimodal(Vec<OpenAIContentPart>),
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(tag = "type", rename_all = "snake_case")]
enum OpenAIContentPart {
    Text { text: String },
    ImageUrl { image_url: OpenAIImageUrl },
}

#[derive(Debug, Clone, Serialize, Deserialize)]
struct OpenAIImageUrl {
    url: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    detail: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
struct OpenAIToolCall {
    id: String,
    #[serde(rename = "type")]
    call_type: String,
    function: OpenAIFunctionCall,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
struct OpenAIFunctionCall {
    name: String,
    arguments: String,
}

#[derive(Debug, Clone, Serialize)]
struct OpenAITool {
    #[serde(rename = "type")]
    tool_type: String,
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
    String(String),
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
    max_completion_tokens: Option<u32>,
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
        let client = Client::builder()
            .connect_timeout(Duration::from_secs(30))
            .timeout(Duration::from_secs(300))
            .build()
            .expect("Failed to create HTTP client");
        // Use environment variable for base URL, defaulting to official OpenAI API
        let base_url = std::env::var("OPENAI_API_BASE")
            .unwrap_or_else(|_| "https://api.openai.com/v1".to_string());
        Self {
            api_key,
            client,
            base_url,
        }
    }

    fn uses_max_completion_tokens(model: &str) -> bool {
        model.starts_with("gpt-5")
            || model.starts_with("o3")
            || model.starts_with("o1")
            || model == "gpt-4-turbo-2024-04-09"
    }

    fn image_to_data_url(
        data: &[u8],
        format: ImageFormat,
        detail: ImageDetail,
    ) -> (String, Option<String>) {
        let mime_type = match format {
            ImageFormat::Png => "image/png",
            ImageFormat::Jpeg => "image/jpeg",
            ImageFormat::Webp => "image/webp",
        };
        let base64_data = base64::Engine::encode(&base64::engine::general_purpose::STANDARD, data);
        let data_url = format!("data:{};base64,{}", mime_type, base64_data);
        let detail_str = match detail {
            ImageDetail::Low => Some("low".to_string()),
            ImageDetail::High => Some("high".to_string()),
            ImageDetail::Auto => Some("auto".to_string()),
        };
        (data_url, detail_str)
    }

    fn convert_content(text: &str, multimodal: Option<&Vec<ContentPart>>) -> Option<OpenAIContent> {
        if let Some(parts) = multimodal {
            let mut openai_parts = Vec::new();

            if !text.is_empty() {
                openai_parts.push(OpenAIContentPart::Text {
                    text: text.to_string(),
                });
            }

            for part in parts {
                match part {
                    ContentPart::Text { text } => {
                        openai_parts.push(OpenAIContentPart::Text { text: text.clone() });
                    }
                    ContentPart::Image { image } => {
                        let (data_url, detail) =
                            Self::image_to_data_url(&image.data, image.format, image.detail);
                        openai_parts.push(OpenAIContentPart::ImageUrl {
                            image_url: OpenAIImageUrl {
                                url: data_url,
                                detail,
                            },
                        });
                    }
                    ContentPart::Video { .. } => {}
                }
            }

            Some(OpenAIContent::Multimodal(openai_parts))
        } else if !text.is_empty() {
            Some(OpenAIContent::Text(text.to_string()))
        } else {
            None
        }
    }

    fn calculate_cost(model: &str, prompt_tokens: u32, completion_tokens: u32) -> f64 {
        let (input_cost, output_cost) = match model {
            // GPT-5 models (Latest - 2025)
            "gpt-5-nano" => (0.05, 0.4),
            "gpt-5-mini" => (0.25, 2.0),
            "gpt-5.2" => (6.0, 18.0),
            "gpt-5.2-pro" => (10.0, 30.0),
            "gpt-5.2-chat-latest" => (4.0, 12.0),
            "gpt-5.2-codex" => (8.0, 24.0),
            "gpt-5.1" => (5.5, 16.5),
            "gpt-5.1-chat-latest" => (4.0, 12.0),
            "gpt-5.1-thinking" => (7.0, 21.0),
            "gpt-5.1-codex-max" => (8.0, 24.0),
            "gpt-5" => (5.5, 16.5),
            "gpt-5-codex" => (8.0, 24.0),
            "o1" | "o1-2024-12-17" => (15.0, 60.0),
            "o1-mini" | "o1-mini-2024-09-12" => (1.1, 4.4),
            "o1-preview" | "o1-preview-2024-09-12" => (15.0, 60.0),
            "o3" | "o3-mini" => (15.0, 60.0),

            "gpt-4-turbo" | "gpt-4-turbo-preview" => (10.0, 30.0),
            "gpt-4" => (30.0, 60.0),
            "gpt-3.5-turbo" => (0.5, 1.5),
            "gpt-4o" => (5.0, 15.0),
            "gpt-4o-mini" => (0.15, 0.6),
            _ => (0.5, 1.5),
        };

        let input = (prompt_tokens as f64 / 1_000_000.0) * input_cost;
        let output = (completion_tokens as f64 / 1_000_000.0) * output_cost;
        input + output
    }

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
        let uses_new_param = Self::uses_max_completion_tokens(&request.model);

        let openai_request = OpenAIRequest {
            model: request.model.clone(),
            messages: request
                .messages
                .iter()
                .map(|m| {
                    let mut msg = OpenAIMessage {
                        role: m.role.clone(),
                        content: Self::convert_content(&m.content, m.multimodal_content.as_ref()),
                        tool_calls: None,
                        tool_call_id: m.tool_call_id.clone(),
                        name: None,
                    };

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
            max_tokens: if uses_new_param {
                None
            } else {
                request.max_tokens
            },
            max_completion_tokens: if uses_new_param {
                request.max_tokens
            } else {
                None
            },
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

        let response_text = response.text().await?;
        tracing::debug!("OpenAI response body: {}", response_text);

        let openai_response: OpenAIResponse =
            serde_json::from_str(&response_text).map_err(|e| {
                format!(
                    "Failed to parse OpenAI response: {}. Body: {}",
                    e, response_text
                )
            })?;

        let choice = openai_response
            .choices
            .first()
            .ok_or("No choices in response")?;

        let content = match &choice.message.content {
            Some(OpenAIContent::Text(text)) => text.clone(),
            Some(OpenAIContent::Multimodal(parts)) => parts
                .iter()
                .filter_map(|part| match part {
                    OpenAIContentPart::Text { text } => Some(text.as_str()),
                    _ => None,
                })
                .collect::<Vec<_>>()
                .join("\n"),
            None => String::new(),
        };

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
        let uses_new_param = Self::uses_max_completion_tokens(&request.model);

        let openai_request = OpenAIRequest {
            model: request.model.clone(),
            messages: request
                .messages
                .iter()
                .map(|m| OpenAIMessage {
                    role: m.role.clone(),
                    content: Self::convert_content(&m.content, m.multimodal_content.as_ref()),
                    tool_calls: None,
                    tool_call_id: None,
                    name: None,
                })
                .collect(),
            temperature: request.temperature,
            max_tokens: if uses_new_param {
                None
            } else {
                request.max_tokens
            },
            max_completion_tokens: if uses_new_param {
                request.max_tokens
            } else {
                None
            },
            stream: Some(true),
            tools: request.tools.as_ref().map(|t| Self::convert_tools(t)),
            tool_choice: request
                .tool_choice
                .as_ref()
                .and_then(Self::convert_tool_choice),
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
            crate::core::router::Provider::OpenAI,
        )))
    }
}
