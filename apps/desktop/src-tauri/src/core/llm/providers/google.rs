use crate::core::llm::sse_parser::{parse_sse_stream, StreamChunk};
use crate::core::llm::{ContentPart, ImageFormat, LLMProvider, LLMRequest, LLMResponse, ToolCall};
use futures_util::Stream;
use reqwest::Client;
use serde::{Deserialize, Serialize};
use serde_json::Value;
use std::error::Error;
use std::pin::Pin;
use std::time::Duration;

// Re-export multimodal generation types
pub use super::google_multimodal::{
    GeneratedAudio, GeneratedImage, GeneratedVideo, GoogleMultimodalProvider, ImageGenConfig,
    SafetySetting as MultimodalSafetySetting, TTSConfig, VideoGenConfig,
};

// Import RAG module for file search
use super::google_rag;

// Import grounding types for Google Search and Maps grounding
use super::google_grounding::{
    calculate_grounding_cost, parse_grounding_metadata, GoogleApiGroundingMetadata,
    GroundingMetadata, MapsGroundingConfig,
};

// Import code execution types
use super::google_code_execution::CodeExecutionResult;

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
    /// Executable code block from code execution
    ExecutableCode {
        #[serde(rename = "executableCode")]
        executable_code: GoogleExecutableCode,
    },
    /// Code execution result
    CodeExecutionResult {
        #[serde(rename = "codeExecutionResult")]
        code_execution_result: GoogleCodeExecutionResultRaw,
    },
}

/// Executable code block from Gemini API
#[derive(Debug, Clone, Serialize, Deserialize)]
struct GoogleExecutableCode {
    language: String,
    code: String,
}

/// Raw code execution result from Gemini API
#[derive(Debug, Clone, Serialize, Deserialize)]
struct GoogleCodeExecutionResultRaw {
    outcome: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    output: Option<String>,
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

/// Google Search Retrieval tool for grounding responses with web search
/// When enabled, allows the model to search the web to ground its responses
#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
struct GoogleSearchRetrievalTool {
    google_search_retrieval: GoogleSearchRetrievalConfig,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
struct GoogleSearchRetrievalConfig {
    #[serde(skip_serializing_if = "Option::is_none")]
    dynamic_retrieval_config: Option<DynamicRetrievalConfig>,
}

/// Dynamic retrieval configuration for Google Search grounding
#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
struct DynamicRetrievalConfig {
    /// Mode for dynamic retrieval
    /// - "MODE_DYNAMIC": Dynamically decide when to use search based on query
    /// - "MODE_UNSPECIFIED": Default behavior
    mode: String,
    /// Threshold for triggering search (0.0 - 1.0)
    /// Lower values = more aggressive search usage
    /// Higher values = only search when highly confident it's needed
    dynamic_threshold: f32,
}

/// Code execution tool for running Python code in sandboxed environment
#[derive(Debug, Clone, Serialize)]
struct GoogleCodeExecutionTool {
    #[serde(rename = "codeExecution")]
    code_execution: GoogleCodeExecutionEmpty,
}

/// Empty struct signals code execution is enabled
#[derive(Debug, Clone, Serialize)]
struct GoogleCodeExecutionEmpty {}

/// Tool variant that can be function declarations, search retrieval, code execution, or other tools
#[derive(Debug, Clone, Serialize)]
#[serde(untagged)]
enum GoogleToolVariant {
    /// Function declarations tool
    Functions(GoogleTool),
    /// Google Search Retrieval tool for grounding
    SearchRetrieval(GoogleSearchRetrievalTool),
    /// Code execution tool (enabled via empty object)
    CodeExecution(GoogleCodeExecutionTool),
}

#[derive(Debug, Clone, Serialize)]
struct GoogleRequest {
    contents: Vec<GoogleContent>,
    #[serde(skip_serializing_if = "Option::is_none")]
    generation_config: Option<GoogleGenerationConfig>,
    #[serde(skip_serializing_if = "Option::is_none")]
    tools: Option<Vec<GoogleToolVariant>>,
}

/// Generation configuration for Google Gemini models
#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
struct GoogleGenerationConfig {
    #[serde(skip_serializing_if = "Option::is_none")]
    temperature: Option<f32>,
    #[serde(skip_serializing_if = "Option::is_none")]
    max_output_tokens: Option<u32>,
    /// Thinking configuration for Gemini 3 models (thinking_level 0-4)
    #[serde(skip_serializing_if = "Option::is_none")]
    thinking_config: Option<GoogleThinkingConfig>,
}

/// Thinking configuration for Gemini models
/// - Gemini 3: Uses thinking_level (0=none, 1=low, 2=medium, 3=high, 4=extreme)
#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
struct GoogleThinkingConfig {
    /// Thinking level from 0-4:
    /// 0 = disabled, 1 = low, 2 = medium (default when enabled), 3 = high, 4 = extreme
    thinking_level: u8,
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
    /// Grounding metadata from Google Search or Maps grounding
    #[serde(rename = "groundingMetadata")]
    grounding_metadata: Option<GoogleApiGroundingMetadata>,
    /// Finish reason - can be "STOP", "SAFETY", "RECITATION", "MAX_TOKENS", etc.
    #[serde(rename = "finishReason")]
    finish_reason: Option<String>,
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
                    ContentPart::Audio { .. } => {
                        // Audio not directly supported in this context, skip
                    }
                    ContentPart::Document { .. } => {
                        // Document not directly supported in this context, skip
                    }
                    ContentPart::ToolUse { .. } => {
                        // ToolUse handled separately, skip in multimodal content
                    }
                    ContentPart::ToolResult { .. } => {
                        // ToolResult handled separately, skip in multimodal content
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

    /// Build tools array with optional grounding support
    fn build_tools(request: &LLMRequest) -> Option<Vec<GoogleToolVariant>> {
        let mut all_tools: Vec<GoogleToolVariant> = Vec::new();

        // Add function declarations if present
        if let Some(tools) = &request.tools {
            if !tools.is_empty() {
                all_tools.push(GoogleToolVariant::Functions(GoogleTool {
                    function_declarations: tools
                        .iter()
                        .map(|tool| GoogleFunctionDeclaration {
                            name: tool.name().to_string(),
                            description: tool.description().to_string(),
                            parameters: tool.parameters().clone(),
                        })
                        .collect(),
                }));
            }
        }

        // Add Google Search grounding if enabled
        if request.google_search == Some(true) {
            tracing::info!("Google Search grounding enabled for request");
            all_tools.push(GoogleToolVariant::SearchRetrieval(
                GoogleSearchRetrievalTool {
                    google_search_retrieval: GoogleSearchRetrievalConfig {
                        // Use dynamic retrieval with default threshold
                        // Lower threshold = more aggressive search usage
                        dynamic_retrieval_config: Some(DynamicRetrievalConfig {
                            mode: "MODE_DYNAMIC".to_string(),
                            dynamic_threshold: 0.3, // Default to relatively aggressive search
                        }),
                    },
                },
            ));
        }

        // Add code execution tool if enabled
        if request.code_execution == Some(true) {
            tracing::info!("Code execution enabled for request");
            all_tools.push(GoogleToolVariant::CodeExecution(GoogleCodeExecutionTool {
                code_execution: GoogleCodeExecutionEmpty {},
            }));
        }

        if all_tools.is_empty() {
            None
        } else {
            Some(all_tools)
        }
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

    /// Build thinking configuration from request parameters.
    /// Uses the thinking_level field from LLMRequest for Gemini 3 models.
    fn build_thinking_config(request: &LLMRequest) -> Option<GoogleThinkingConfig> {
        // Direct thinking_level for Gemini 3 models
        if let Some(level) = request.thinking_level {
            return Some(GoogleThinkingConfig {
                thinking_level: level.min(4), // Clamp to 0-4
            });
        }

        // Check thinking_mode flag as fallback (default to moderate level 2)
        if request.thinking_mode == Some(true) {
            return Some(GoogleThinkingConfig { thinking_level: 2 });
        }

        None
    }

    /// Build generation config with all parameters including thinking
    fn build_generation_config(request: &LLMRequest) -> GoogleGenerationConfig {
        GoogleGenerationConfig {
            temperature: request.temperature,
            max_output_tokens: request.max_tokens,
            thinking_config: Self::build_thinking_config(request),
        }
    }
}

#[async_trait::async_trait]
impl LLMProvider for GoogleProvider {
    async fn send_message(
        &self,
        request: &LLMRequest,
    ) -> Result<LLMResponse, Box<dyn Error + Send + Sync>> {
        // Build tools array with grounding support
        let google_tools = Self::build_tools(request);

        // Build generation config with thinking support
        let generation_config = Self::build_generation_config(request);

        // Log thinking config if enabled
        if generation_config.thinking_config.is_some() {
            tracing::info!(
                "Google request with thinking enabled: level={}",
                generation_config
                    .thinking_config
                    .as_ref()
                    .map(|tc| tc.thinking_level)
                    .unwrap_or(0)
            );
        }

        let google_request = GoogleRequest {
            contents: request
                .messages
                .iter()
                .map(|m| GoogleContent {
                    role: Self::convert_role(&m.role),
                    parts: Self::convert_content(&m.content, m.multimodal_content.as_ref()),
                })
                .collect(),
            generation_config: Some(generation_config),
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
        let mut grounding_metadata: Option<GroundingMetadata> = None;
        let mut code_execution_results: Vec<serde_json::Value> = Vec::new();

        if let Some(candidate) = google_response.candidates.first() {
            // Check for safety filter blocking
            if let Some(ref finish_reason) = candidate.finish_reason {
                if finish_reason == "SAFETY" {
                    let error_msg = "Response was blocked by Google's safety filters. Try rephrasing your request or adjusting safety settings.";
                    tracing::warn!("Google safety filter triggered: {}", error_msg);
                    return Err(error_msg.into());
                } else if finish_reason == "RECITATION" {
                    let error_msg = "Response was blocked due to recitation concerns. Try rephrasing your request.";
                    tracing::warn!("Google recitation filter triggered: {}", error_msg);
                    return Err(error_msg.into());
                }
            }

            // Parse grounding metadata if present
            if let Some(api_metadata) = &candidate.grounding_metadata {
                let metadata = parse_grounding_metadata(api_metadata);
                if metadata.has_grounding() {
                    tracing::info!("Response grounded with {} sources", metadata.source_count());
                    grounding_metadata = Some(metadata);
                }
            }

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
                    GooglePart::ExecutableCode { executable_code } => {
                        // Store executable code information for reference
                        code_execution_results.push(serde_json::json!({
                            "type": "executable_code",
                            "language": executable_code.language,
                            "code": executable_code.code
                        }));
                    }
                    GooglePart::CodeExecutionResult {
                        code_execution_result,
                    } => {
                        // Convert Google's code execution result to our format
                        let is_success =
                            code_execution_result.outcome.to_lowercase() == "outcome_ok";
                        let result = CodeExecutionResult {
                            stdout: code_execution_result.output.clone(),
                            stderr: None,
                            output_images: None,
                            exit_code: Some(if is_success { 0 } else { 1 }),
                            status: Some(code_execution_result.outcome.clone()),
                        };
                        code_execution_results.push(serde_json::json!({
                            "type": "code_execution_result",
                            "outcome": code_execution_result.outcome,
                            "output": code_execution_result.output,
                            "is_success": result.is_success(),
                            "formatted_output": result.formatted_output()
                        }));
                    }
                }
            }
        }

        // Append grounding citations to content if present
        if let Some(ref metadata) = grounding_metadata {
            let citations = metadata.format_as_markdown();
            if !citations.is_empty() {
                text_content.push_str(&citations);
            }
        }

        let (tokens, prompt_tokens, completion_tokens, mut cost) =
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

        // Add grounding cost if search was used
        if let Some(ref metadata) = grounding_metadata {
            let grounding_cost = calculate_grounding_cost(metadata);
            if grounding_cost > 0.0 {
                tracing::debug!("Adding grounding cost: ${:.4}", grounding_cost);
                cost = Some(cost.unwrap_or(0.0) + grounding_cost);
            }
        }

        // Use the actual finish reason from Google, or default based on response content
        let finish_reason = if let Some(candidate) = google_response.candidates.first() {
            candidate.finish_reason.clone().or_else(|| {
                if !tool_calls.is_empty() {
                    Some("tool_calls".to_string())
                } else {
                    Some("stop".to_string())
                }
            })
        } else if !tool_calls.is_empty() {
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
            code_execution_results: if code_execution_results.is_empty() {
                None
            } else {
                Some(code_execution_results)
            },
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
        // Build tools array with grounding support
        let google_tools = Self::build_tools(request);

        // Build generation config with thinking support
        let generation_config = Self::build_generation_config(request);

        // Log thinking config if enabled
        if generation_config.thinking_config.is_some() {
            tracing::info!(
                "Google streaming request with thinking enabled: level={}",
                generation_config
                    .thinking_config
                    .as_ref()
                    .map(|tc| tc.thinking_level)
                    .unwrap_or(0)
            );
        }

        let google_request = GoogleRequest {
            contents: request
                .messages
                .iter()
                .map(|m| GoogleContent {
                    role: Self::convert_role(&m.role),
                    parts: Self::convert_content(&m.content, m.multimodal_content.as_ref()),
                })
                .collect(),
            generation_config: Some(generation_config),
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

impl GoogleProvider {
    /// Create a Files API client for RAG operations
    pub fn files_api(&self) -> Result<google_rag::GoogleFilesAPI, Box<dyn Error + Send + Sync>> {
        google_rag::GoogleFilesAPI::new(self.api_key.clone())
    }

    /// Send a message with file search RAG
    pub async fn send_message_with_file_search(
        &self,
        request: &LLMRequest,
        file_search_config: &google_rag::FileSearchConfig,
    ) -> Result<LLMResponse, Box<dyn Error + Send + Sync>> {
        tracing::info!(
            "Sending message with file search RAG: {} files",
            file_search_config.files.len()
        );

        // For now, this is a simplified implementation
        // In a full implementation, we would:
        // 1. Add file references to the request context
        // 2. Parse search results from the response
        // 3. Track file search queries for pricing

        // Add file URIs to the request as context
        let mut enhanced_request = request.clone();

        if !file_search_config.files.is_empty() {
            let file_context = format!(
                "\n\n[Using file search across {} uploaded files]",
                file_search_config.files.len()
            );

            if let Some(last_message) = enhanced_request.messages.last_mut() {
                last_message.content.push_str(&file_context);
            }
        }

        self.send_message(&enhanced_request).await
    }

    /// Send a message with URL context grounding
    pub async fn send_message_with_url_context(
        &self,
        request: &LLMRequest,
        url_config: &google_rag::URLContextConfig,
    ) -> Result<LLMResponse, Box<dyn Error + Send + Sync>> {
        tracing::info!(
            "Sending message with URL context: {} URLs",
            url_config.urls.len()
        );

        // Fetch URL contents
        let fetcher = google_rag::URLContentFetcher::new()?;
        let mut url_contents = Vec::new();

        for url in &url_config.urls {
            match fetcher.fetch_url(url, url_config).await {
                Ok(content) => url_contents.push(content),
                Err(e) => {
                    tracing::warn!("Failed to fetch URL {}: {}", url, e);
                }
            }
        }

        // Enhance request with URL context
        let mut enhanced_request = request.clone();

        if !url_contents.is_empty() {
            let mut context = String::from("\n\n--- URL Context ---\n");
            for url_content in &url_contents {
                context.push_str(&format!(
                    "\n[{}]\nTitle: {}\nContent: {}\n",
                    url_content.url,
                    url_content.title.as_deref().unwrap_or("Unknown"),
                    url_content.content
                ));
            }

            if let Some(last_message) = enhanced_request.messages.last_mut() {
                last_message.content.push_str(&context);
            }
        }

        self.send_message(&enhanced_request).await
    }

    /// Send a message with long context optimization
    pub async fn send_message_with_long_context(
        &self,
        request: &LLMRequest,
        long_context_config: &google_rag::LongContextConfig,
    ) -> Result<LLMResponse, Box<dyn Error + Send + Sync>> {
        // Check if context is actually long
        let total_text: String = request
            .messages
            .iter()
            .map(|m| m.content.as_str())
            .collect::<Vec<_>>()
            .join("\n");

        if !google_rag::TokenCounter::is_long_context(&total_text) {
            tracing::debug!("Context is not long enough for optimization, using standard send");
            return self.send_message(request).await;
        }

        tracing::info!("Processing long context with optimization");

        if long_context_config.enable_chunking {
            // Chunk the context
            let chunks = google_rag::TokenCounter::chunk_text(
                &total_text,
                long_context_config.chunk_size_tokens.unwrap_or(100000),
                long_context_config.chunk_overlap_tokens.unwrap_or(1000),
            );

            tracing::info!("Split long context into {} chunks", chunks.len());

            // For now, process the first chunk
            // In a full implementation, we would aggregate results from all chunks
            let mut chunked_request = request.clone();
            if let Some(last_message) = chunked_request.messages.last_mut() {
                last_message.content = chunks[0].clone();
            }

            self.send_message(&chunked_request).await
        } else {
            // Use standard send with caching if enabled
            self.send_message(request).await
        }
    }

    /// Send a message with Google Search grounding enabled
    /// This uses the native Google Search Retrieval tool for real-time web search
    /// Cost: $35 per 1000 search queries
    pub async fn send_message_with_search_grounding(
        &self,
        request: &LLMRequest,
    ) -> Result<LLMResponse, Box<dyn Error + Send + Sync>> {
        let mut grounded_request = request.clone();
        grounded_request.google_search = Some(true);
        self.send_message(&grounded_request).await
    }

    /// Send a message with Google Maps grounding for location-aware responses
    #[allow(dead_code)]
    pub async fn send_message_with_maps_grounding(
        &self,
        request: &LLMRequest,
        maps_config: &MapsGroundingConfig,
    ) -> Result<LLMResponse, Box<dyn Error + Send + Sync>> {
        let mut grounded_request = request.clone();
        grounded_request.google_maps = Some(maps_config.clone());
        self.send_message(&grounded_request).await
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

    #[test]
    fn test_dynamic_retrieval_config_serialization() {
        let config = DynamicRetrievalConfig {
            mode: "MODE_DYNAMIC".to_string(),
            dynamic_threshold: 0.5,
        };

        let json = serde_json::to_string(&config).unwrap();
        assert!(json.contains("dynamicThreshold"));
        assert!(json.contains("0.5"));
        assert!(json.contains("MODE_DYNAMIC"));
    }

    #[test]
    fn test_search_retrieval_tool_serialization() {
        let tool = GoogleSearchRetrievalTool {
            google_search_retrieval: GoogleSearchRetrievalConfig {
                dynamic_retrieval_config: Some(DynamicRetrievalConfig {
                    mode: "MODE_DYNAMIC".to_string(),
                    dynamic_threshold: 0.3,
                }),
            },
        };

        let json = serde_json::to_string(&tool).unwrap();
        assert!(json.contains("googleSearchRetrieval"));
        assert!(json.contains("dynamicRetrievalConfig"));
    }

    #[test]
    fn test_code_execution_tool_serialization() {
        let tool = GoogleCodeExecutionTool {
            code_execution: GoogleCodeExecutionEmpty {},
        };
        let json = serde_json::to_string(&tool).unwrap();
        assert_eq!(json, r#"{"codeExecution":{}}"#);
    }

    #[test]
    fn test_tool_variant_code_execution_serialization() {
        let code_exec = GoogleToolVariant::CodeExecution(GoogleCodeExecutionTool {
            code_execution: GoogleCodeExecutionEmpty {},
        });
        let json = serde_json::to_string(&code_exec).unwrap();
        assert_eq!(json, r#"{"codeExecution":{}}"#);
    }

    #[test]
    fn test_executable_code_deserialization() {
        let json = r#"{"executableCode": {"language": "python", "code": "print('hello')"}}"#;
        let part: GooglePart = serde_json::from_str(json).unwrap();
        if let GooglePart::ExecutableCode { executable_code } = part {
            assert_eq!(executable_code.language, "python");
            assert_eq!(executable_code.code, "print('hello')");
        } else {
            panic!("Expected ExecutableCode part");
        }
    }

    #[test]
    fn test_code_execution_result_deserialization() {
        let json =
            r#"{"codeExecutionResult": {"outcome": "OUTCOME_OK", "output": "hello\nworld"}}"#;
        let part: GooglePart = serde_json::from_str(json).unwrap();
        if let GooglePart::CodeExecutionResult {
            code_execution_result,
        } = part
        {
            assert_eq!(code_execution_result.outcome, "OUTCOME_OK");
            assert_eq!(
                code_execution_result.output,
                Some("hello\nworld".to_string())
            );
        } else {
            panic!("Expected CodeExecutionResult part");
        }
    }

    #[test]
    fn test_build_thinking_config_from_thinking_level() {
        use crate::core::llm::ChatMessage;

        // Test direct thinking_level (Gemini 3 style)
        let mut request = LLMRequest::new(
            vec![ChatMessage {
                role: "user".to_string(),
                content: "Hello".to_string(),
                tool_calls: None,
                tool_call_id: None,
                multimodal_content: None,
            }],
            "gemini-3-pro".to_string(),
        );
        request.thinking_level = Some(3); // High thinking

        let config = GoogleProvider::build_thinking_config(&request);
        assert!(config.is_some());
        assert_eq!(config.unwrap().thinking_level, 3);
    }

    #[test]
    fn test_build_thinking_config_from_thinking_mode() {
        use crate::core::llm::ChatMessage;

        // Test thinking_mode flag as fallback
        let mut request = LLMRequest::new(
            vec![ChatMessage {
                role: "user".to_string(),
                content: "Hello".to_string(),
                tool_calls: None,
                tool_call_id: None,
                multimodal_content: None,
            }],
            "gemini-3-flash".to_string(),
        );
        request.thinking_mode = Some(true);

        let config = GoogleProvider::build_thinking_config(&request);
        assert!(config.is_some());
        assert_eq!(config.unwrap().thinking_level, 2); // Default moderate
    }

    #[test]
    fn test_build_thinking_config_level_clamp() {
        use crate::core::llm::ChatMessage;

        // Test that thinking_level is clamped to 4
        let mut request = LLMRequest::new(
            vec![ChatMessage {
                role: "user".to_string(),
                content: "Hello".to_string(),
                tool_calls: None,
                tool_call_id: None,
                multimodal_content: None,
            }],
            "gemini-3-deep-think".to_string(),
        );
        request.thinking_level = Some(10); // Should be clamped to 4

        let config = GoogleProvider::build_thinking_config(&request);
        assert!(config.is_some());
        assert_eq!(config.unwrap().thinking_level, 4); // Clamped to max
    }

    #[test]
    fn test_thinking_config_serialization() {
        let config = GoogleThinkingConfig { thinking_level: 3 };

        let json = serde_json::to_string(&config).unwrap();
        assert!(json.contains("thinkingLevel"));
        assert!(json.contains("3"));
    }

    #[test]
    fn test_generation_config_with_thinking() {
        let config = GoogleGenerationConfig {
            temperature: Some(0.7),
            max_output_tokens: Some(1000),
            thinking_config: Some(GoogleThinkingConfig { thinking_level: 2 }),
        };

        let json = serde_json::to_string(&config).unwrap();
        assert!(json.contains("temperature"));
        assert!(json.contains("maxOutputTokens"));
        assert!(json.contains("thinkingConfig"));
        assert!(json.contains("thinkingLevel"));
    }
}
