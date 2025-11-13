use crate::router::sse_parser::{parse_sse_stream, StreamChunk};
use crate::router::{ContentPart, ImageFormat, LLMProvider, LLMRequest, LLMResponse, ToolCall};
use futures_util::Stream;
use reqwest::Client;
use serde::{Deserialize, Serialize};
use serde_json::Value;
use std::error::Error;
use std::pin::Pin;

#[derive(Debug, Clone, Serialize, Deserialize)]
struct GoogleContent {
    role: String,
    parts: Vec<GooglePart>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(untagged)]
enum GooglePart {
    Text {
        text: String,
    },
    InlineData {
        #[serde(rename = "inline_data")]
        inline_data: GoogleInlineData,
    },
    FunctionCall {
        #[serde(rename = "functionCall")]
        function_call: GoogleFunctionCall,
    },
    FunctionResponse {
        #[serde(rename = "functionResponse")]
        function_response: GoogleFunctionResponse,
    },
}

#[derive(Debug, Clone, Serialize, Deserialize)]
struct GoogleInlineData {
    mime_type: String,
    data: String, // base64 encoded
}

#[derive(Debug, Clone, Serialize, Deserialize)]
struct GoogleFunctionCall {
    name: String,
    args: Value,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
struct GoogleFunctionResponse {
    name: String,
    response: Value,
}

#[derive(Debug, Clone, Serialize)]
struct GoogleTool {
    #[serde(rename = "function_declarations")]
    function_declarations: Vec<GoogleFunctionDeclaration>,
}

#[derive(Debug, Clone, Serialize)]
struct GoogleFunctionDeclaration {
    name: String,
    description: String,
    parameters: Value,
}

#[derive(Debug, Clone, Serialize)]
struct GoogleRequest {
    contents: Vec<GoogleContent>,
    #[serde(skip_serializing_if = "Option::is_none")]
    generation_config: Option<GoogleGenerationConfig>,
    #[serde(skip_serializing_if = "Option::is_none")]
    tools: Option<Vec<GoogleTool>>,
}

#[derive(Debug, Clone, Serialize)]
struct GoogleGenerationConfig {
    #[serde(skip_serializing_if = "Option::is_none")]
    temperature: Option<f32>,
    #[serde(skip_serializing_if = "Option::is_none")]
    max_output_tokens: Option<u32>,
}

#[derive(Debug, Clone, Deserialize)]
struct GoogleResponse {
    candidates: Vec<GoogleCandidate>,
    #[serde(rename = "usageMetadata")]
    usage_metadata: Option<GoogleUsageMetadata>,
}

#[derive(Debug, Clone, Deserialize)]
struct GoogleCandidate {
    content: GoogleContent,
}

#[derive(Debug, Clone, Deserialize)]
struct GoogleUsageMetadata {
    #[serde(rename = "promptTokenCount")]
    prompt_token_count: Option<u32>,
    #[serde(rename = "candidatesTokenCount")]
    candidates_token_count: Option<u32>,
    #[serde(rename = "totalTokenCount")]
    total_token_count: Option<u32>,
}

pub struct GoogleProvider {
    api_key: String,
    client: Client,
    base_url: String,
}

impl GoogleProvider {
    pub fn new(api_key: String) -> Self {
        Self {
            api_key,
            client: Client::new(),
            base_url: "https://generativelanguage.googleapis.com/v1beta".to_string(),
        }
    }

    /// Calculate cost based on model and tokens
    fn calculate_cost(model: &str, input_tokens: u32, output_tokens: u32) -> f64 {
        // Pricing as of November 2025 (per 1M tokens)
        let (input_cost, output_cost) = match model {
            // 2025 Gemini 2.5 Generation (Latest)
            "gemini-2.5-pro" | "gemini-2-5-pro" => (1.25, 5.0), // Most capable
            "gemini-2.5-flash" | "gemini-2-5-flash" => (0.075, 0.3), // Fast & affordable
            "gemini-2.5-computer-use" => (1.25, 5.0),           // UI automation specialist

            // Gemini 1.5 Generation (Previous)
            "gemini-1.5-pro" => (1.25, 5.0),
            "gemini-1.5-flash" => (0.075, 0.3),
            "gemini-1.0-pro" => (0.5, 1.5),

            _ => (0.5, 1.5), // Default pricing
        };

        let input = (input_tokens as f64 / 1_000_000.0) * input_cost;
        let output = (output_tokens as f64 / 1_000_000.0) * output_cost;
        input + output
    }

    fn convert_role(role: &str) -> String {
        match role {
            "assistant" => "model".to_string(),
            _ => role.to_string(),
        }
    }

    /// Convert multimodal content to Google format
    fn convert_content(text: &str, multimodal: Option<&Vec<ContentPart>>) -> Vec<GooglePart> {
        let mut parts = Vec::new();

        // Add text first if not empty
        if !text.is_empty() {
            parts.push(GooglePart::Text {
                text: text.to_string(),
            });
        }

        // Add multimodal content if present
        if let Some(content_parts) = multimodal {
            for part in content_parts {
                match part {
                    ContentPart::Text { text } => {
                        parts.push(GooglePart::Text {
                            text: text.clone(),
                        });
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
                        parts.push(GooglePart::InlineData {
                            inline_data: GoogleInlineData {
                                mime_type: mime_type.to_string(),
                                data: base64_data,
                            },
                        });
                    }
                }
            }
        }

        // If no parts were added, add an empty text part
        if parts.is_empty() {
            parts.push(GooglePart::Text {
                text: String::new(),
            });
        }

        parts
    }
}

#[async_trait::async_trait]
impl LLMProvider for GoogleProvider {
    async fn send_message(
        &self,
        request: &LLMRequest,
    ) -> Result<LLMResponse, Box<dyn Error + Send + Sync>> {
        // ✅ Convert ToolDefinition to Google format
        let google_tools = request.tools.as_ref().map(|tools| {
            vec![GoogleTool {
                function_declarations: tools
                    .iter()
                    .map(|tool| GoogleFunctionDeclaration {
                        name: tool.name.clone(),
                        description: tool.description.clone(),
                        parameters: tool.parameters.clone(),
                    })
                    .collect(),
            }]
        });

        let google_request = GoogleRequest {
            contents: request
                .messages
                .iter()
                .map(|m| GoogleContent {
                    role: Self::convert_role(&m.role),
                    parts: Self::convert_content(&m.content, m.multimodal_content.as_ref()),
                })
                .collect(),
            generation_config: Some(GoogleGenerationConfig {
                temperature: request.temperature,
                max_output_tokens: request.max_tokens,
            }),
            tools: google_tools,
        };

        let url = format!(
            "{}/models/{}:generateContent?key={}",
            self.base_url, request.model, self.api_key
        );

        let response = self
            .client
            .post(&url)
            .header("Content-Type", "application/json")
            .json(&google_request)
            .send()
            .await?;

        if !response.status().is_success() {
            let status = response.status();
            let error_text = response
                .text()
                .await
                .unwrap_or_else(|_| "Unknown error".to_string());
            return Err(format!("Google API error {}: {}", status, error_text).into());
        }

        let google_response: GoogleResponse = response.json().await?;

        // ✅ Parse parts (text and functionCall)
        let mut text_content = String::new();
        let mut tool_calls = Vec::new();

        if let Some(candidate) = google_response.candidates.first() {
            for part in &candidate.content.parts {
                match part {
                    GooglePart::Text { text } => {
                        text_content.push_str(text);
                    }
                    GooglePart::InlineData { .. } => {
                        // Skip inline data in responses (images)
                    }
                    GooglePart::FunctionCall { function_call } => {
                        // Generate unique ID for function call
                        let call_id = format!("call_{}", &uuid::Uuid::new_v4().to_string()[..8]);
                        tool_calls.push(ToolCall {
                            id: call_id,
                            name: function_call.name.clone(),
                            arguments: serde_json::to_string(&function_call.args)
                                .unwrap_or_default(),
                        });
                    }
                    GooglePart::FunctionResponse { .. } => {
                        // Skip function responses (used in follow-up messages)
                    }
                }
            }
        }

        let (tokens, prompt_tokens, completion_tokens, cost) =
            if let Some(usage) = google_response.usage_metadata {
                let input_tokens = usage.prompt_token_count.unwrap_or(0);
                let output_tokens = usage.candidates_token_count.unwrap_or(0);
                let total_tokens = usage
                    .total_token_count
                    .unwrap_or(input_tokens + output_tokens);
                let cost = Self::calculate_cost(&request.model, input_tokens, output_tokens);
                (
                    Some(total_tokens),
                    Some(input_tokens),
                    Some(output_tokens),
                    Some(cost),
                )
            } else {
                (None, None, None, None)
            };

        // ✅ Determine finish_reason based on presence of function calls
        let finish_reason = if !tool_calls.is_empty() {
            Some("tool_calls".to_string())
        } else {
            Some("stop".to_string())
        };

        Ok(LLMResponse {
            content: text_content,
            tokens,
            prompt_tokens,
            completion_tokens,
            cost,
            model: request.model.clone(),
            tool_calls: if tool_calls.is_empty() {
                None
            } else {
                Some(tool_calls)
            },
            finish_reason,
            ..LLMResponse::default()
        })
    }

    fn is_configured(&self) -> bool {
        !self.api_key.is_empty() && self.api_key != "your-api-key-here"
    }

    fn name(&self) -> &str {
        "Google"
    }

    fn supports_vision(&self) -> bool {
        true // Gemini models support vision
    }

    fn supports_function_calling(&self) -> bool {
        true // Gemini models support function declarations
    }

    async fn send_message_streaming(
        &self,
        request: &LLMRequest,
    ) -> Result<
        Pin<Box<dyn Stream<Item = Result<StreamChunk, Box<dyn Error + Send + Sync>>> + Send>>,
        Box<dyn Error + Send + Sync>,
    > {
        // ✅ Add tools support to streaming
        let google_tools = request.tools.as_ref().map(|tools| {
            vec![GoogleTool {
                function_declarations: tools
                    .iter()
                    .map(|tool| GoogleFunctionDeclaration {
                        name: tool.name.clone(),
                        description: tool.description.clone(),
                        parameters: tool.parameters.clone(),
                    })
                    .collect(),
            }]
        });

        let google_request = GoogleRequest {
            contents: request
                .messages
                .iter()
                .map(|m| GoogleContent {
                    role: Self::convert_role(&m.role),
                    parts: Self::convert_content(&m.content, m.multimodal_content.as_ref()),
                })
                .collect(),
            generation_config: Some(GoogleGenerationConfig {
                temperature: request.temperature,
                max_output_tokens: request.max_tokens,
            }),
            tools: google_tools,
        };

        tracing::debug!(
            "Starting Google streaming request for model: {}",
            request.model
        );

        // Google uses streamGenerateContent endpoint for streaming
        let url = format!(
            "{}/models/{}:streamGenerateContent?key={}&alt=sse",
            self.base_url, request.model, self.api_key
        );

        let response = self
            .client
            .post(&url)
            .header("Content-Type", "application/json")
            .json(&google_request)
            .send()
            .await?;

        if !response.status().is_success() {
            let status = response.status();
            let error_text = response
                .text()
                .await
                .unwrap_or_else(|_| "Unknown error".to_string());
            return Err(format!("Google API error {}: {}", status, error_text).into());
        }

        tracing::debug!("Google streaming response received, starting SSE parsing");

        // Return the SSE stream parser
        Ok(Box::pin(parse_sse_stream(
            response,
            crate::router::Provider::Google,
        )))
    }
}
