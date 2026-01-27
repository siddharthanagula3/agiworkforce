use crate::core::llm::sse_parser::{parse_sse_stream, StreamChunk};
use crate::core::llm::{ContentPart, ImageFormat, LLMProvider, LLMRequest, LLMResponse, ToolCall};
use futures_util::Stream;
use reqwest::Client;
use serde::{Deserialize, Serialize};
use serde_json::Value;
use std::error::Error;
use std::pin::Pin;
use std::time::Duration;

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
    FileData {
        #[serde(rename = "file_data")]
        file_data: GoogleFileData,
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
    data: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
struct GoogleFileData {
    mime_type: String,
    file_uri: String,
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

#[derive(Debug, Deserialize)]
struct GoogleErrorResponse {
    error: GoogleError,
}

#[derive(Debug, Deserialize)]
struct GoogleError {
    code: i32,
    message: String,
    status: String,
}

pub struct GoogleProvider {
    api_key: String,
    client: Client,
    base_url: String,
}

impl GoogleProvider {
    pub fn new(api_key: String) -> Result<Self, Box<dyn std::error::Error + Send + Sync>> {
        let client = Client::builder()
            .connect_timeout(Duration::from_secs(30))
            .timeout(Duration::from_secs(300))
            .build()
            .map_err(|e| Box::new(e) as Box<dyn std::error::Error + Send + Sync>)?;
        // Use environment variable for base URL, defaulting to official Google Generative AI API
        let base_url = std::env::var("GOOGLE_API_BASE")
            .unwrap_or_else(|_| "https://generativelanguage.googleapis.com/v1beta".to_string());
        Ok(Self {
            api_key,
            client,
            base_url,
        })
    }

    fn calculate_cost(model: &str, input_tokens: u32, output_tokens: u32) -> f64 {
        let (input_cost, output_cost) = match model {
            // Gemini 3 models (Latest - 2025)
            "gemini-3-pro" => (1.5, 6.0),
            "gemini-3-flash" => (0.075, 0.3),
            "gemini-3-deep-think" => (2.0, 8.0),

            // Gemini 2 models
            "gemini-2-flash" | "gemini-2.0-flash" | "gemini-2-0-flash" => (0.1, 0.4),
            "gemini-2.5-pro" | "gemini-2-5-pro" => (1.25, 5.0),
            "gemini-2.5-flash" | "gemini-2-5-flash" => (0.075, 0.3),
            "gemini-2.5-computer-use" => (1.25, 5.0),
            "gemini-2.0-pro-exp-02-05" => (1.25, 5.0),
            "gemini-exp-1206" => (1.25, 5.0),
            "gemini-2.0-flash-thinking-exp-1219" => (0.075, 0.3),

            _ => (0.5, 1.5),
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

    fn convert_content(text: &str, multimodal: Option<&Vec<ContentPart>>) -> Vec<GooglePart> {
        use crate::core::llm::{VideoData, VideoFormat};

        let mut parts = Vec::new();

        if !text.is_empty() {
            parts.push(GooglePart::Text {
                text: text.to_string(),
            });
        }

        if let Some(content_parts) = multimodal {
            for part in content_parts {
                match part {
                    ContentPart::Text { text } => {
                        parts.push(GooglePart::Text { text: text.clone() });
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
                    ContentPart::Video { video } => {
                        let mime_type = match video.format {
                            VideoFormat::Mp4 => "video/mp4",
                            VideoFormat::Webm => "video/webm",
                            VideoFormat::Mov => "video/quicktime",
                            VideoFormat::Avi => "video/x-msvideo",
                            VideoFormat::Mkv => "video/x-matroska",
                        };
                        match &video.data {
                            VideoData::Bytes(bytes) => {
                                let base64_data = base64::Engine::encode(
                                    &base64::engine::general_purpose::STANDARD,
                                    bytes,
                                );
                                parts.push(GooglePart::InlineData {
                                    inline_data: GoogleInlineData {
                                        mime_type: mime_type.to_string(),
                                        data: base64_data,
                                    },
                                });
                            }
                            VideoData::Uri(uri) => {
                                parts.push(GooglePart::FileData {
                                    file_data: GoogleFileData {
                                        mime_type: mime_type.to_string(),
                                        file_uri: uri.clone(),
                                    },
                                });
                            }
                        }
                    }
                }
            }
        }

        if parts.is_empty() {
            parts.push(GooglePart::Text {
                text: String::new(),
            });
        }

        parts
    }

    async fn handle_error(response: reqwest::Response) -> String {
        let status = response.status();
        let error_text = response
            .text()
            .await
            .unwrap_or_else(|_| "Unknown error".to_string());

        if let Ok(json_error) = serde_json::from_str::<GoogleErrorResponse>(&error_text) {
            return format!(
                "Google API Error {}: {} ({})",
                json_error.error.code, json_error.error.message, json_error.error.status
            );
        }

        if status.as_u16() == 429 {
            return "Google API Rate Limit Exceeded. Please try again later or upgrade your plan."
                .to_string();
        }

        format!("Google API error {}: {}", status, error_text)
    }
}

#[async_trait::async_trait]
impl LLMProvider for GoogleProvider {
    async fn send_message(
        &self,
        request: &LLMRequest,
    ) -> Result<LLMResponse, Box<dyn Error + Send + Sync>> {
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
            let error_msg = Self::handle_error(response).await;
            return Err(error_msg.into());
        }

        let google_response: GoogleResponse = response.json().await?;

        let mut text_content = String::new();
        let mut tool_calls = Vec::new();

        if let Some(candidate) = google_response.candidates.first() {
            for part in &candidate.content.parts {
                match part {
                    GooglePart::Text { text } => {
                        text_content.push_str(text);
                    }
                    GooglePart::InlineData { .. } => {}
                    GooglePart::FunctionCall { function_call } => {
                        let call_id = format!("call_{}", &uuid::Uuid::new_v4().to_string()[..8]);
                        tool_calls.push(ToolCall {
                            id: call_id,
                            name: function_call.name.clone(),
                            arguments: serde_json::to_string(&function_call.args)
                                .unwrap_or_default(),
                        });
                    }
                    GooglePart::FunctionResponse { .. } => {}
                    GooglePart::FileData { .. } => {}
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
            let error_msg = Self::handle_error(response).await;
            return Err(error_msg.into());
        }

        tracing::debug!("Google streaming response received, starting SSE parsing");

        Ok(Box::pin(parse_sse_stream(
            response,
            crate::core::llm::Provider::Google,
        )))
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_calculate_cost() {
        let cost = GoogleProvider::calculate_cost("gemini-2.5-pro", 1_000_000, 1_000_000);
        assert_eq!(cost, 6.25);

        // gemini-1.5-flash uses default pricing: (0.5, 1.5) per 1M tokens
        let cost = GoogleProvider::calculate_cost("gemini-1.5-flash", 1_000_000, 1_000_000);
        assert_eq!(cost, 2.0);
    }

    #[test]
    fn test_convert_role() {
        assert_eq!(GoogleProvider::convert_role("user"), "user");
        assert_eq!(GoogleProvider::convert_role("assistant"), "model");
        assert_eq!(GoogleProvider::convert_role("system"), "system");
    }

    #[test]
    fn test_convert_content_text() {
        let parts = GoogleProvider::convert_content("Hello world", None);
        assert_eq!(parts.len(), 1);
        if let GooglePart::Text { text } = &parts[0] {
            assert_eq!(text, "Hello world");
        } else {
            panic!("Expected Text part");
        }
    }
}
