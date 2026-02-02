#![allow(dead_code)]

use crate::core::llm::sse_parser::{parse_sse_stream, StreamChunk};
use crate::core::llm::{
    AudioFormat, ContentPart, ImageFormat, LLMProvider, LLMRequest, LLMResponse, ThinkingParameter,
    ToolCall,
};
use futures_util::Stream;
use reqwest::Client;
use serde::{Deserialize, Serialize};
use serde_json::Value;
use std::error::Error;
use std::pin::Pin;
use std::time::Duration;

/// Computer Use configuration for browser automation and screen control
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ComputerUseConfig {
    /// Display width in pixels (e.g., 1920)
    pub display_width: u32,
    /// Display height in pixels (e.g., 1080)
    pub display_height: u32,
    /// Enable screenshot capturing
    #[serde(default = "default_true")]
    pub enable_screenshots: bool,
    /// Enable action execution (clicks, keyboard)
    #[serde(default = "default_true")]
    pub enable_actions: bool,
}

fn default_true() -> bool {
    true
}

impl Default for ComputerUseConfig {
    fn default() -> Self {
        Self {
            display_width: 1920,
            display_height: 1080,
            enable_screenshots: true,
            enable_actions: true,
        }
    }
}

/// Media resolution levels for Gemini 3 (v1alpha API)
#[derive(Debug, Clone, Copy, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "SCREAMING_SNAKE_CASE")]
#[derive(Default)]
pub enum MediaResolution {
    /// Low resolution - 280 tokens per image
    MediaResolutionLow,
    /// Medium resolution - 560 tokens per image (default)
    #[default]
    MediaResolutionMedium,
    /// High resolution - 1120 tokens per image
    MediaResolutionHigh,
    /// Ultra high resolution - 2240 tokens per image
    MediaResolutionUltraHigh,
}

impl MediaResolution {
    /// Get the token count for this resolution
    pub fn token_count(&self) -> u32 {
        match self {
            MediaResolution::MediaResolutionLow => 280,
            MediaResolution::MediaResolutionMedium => 560,
            MediaResolution::MediaResolutionHigh => 1120,
            MediaResolution::MediaResolutionUltraHigh => 2240,
        }
    }

    /// Get the string representation for API
    pub fn as_str(&self) -> &'static str {
        match self {
            MediaResolution::MediaResolutionLow => "MEDIA_RESOLUTION_LOW",
            MediaResolution::MediaResolutionMedium => "MEDIA_RESOLUTION_MEDIUM",
            MediaResolution::MediaResolutionHigh => "MEDIA_RESOLUTION_HIGH",
            MediaResolution::MediaResolutionUltraHigh => "MEDIA_RESOLUTION_ULTRA_HIGH",
        }
    }
}

/// Safety settings for content filtering
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SafetySettings {
    pub settings: Vec<SafetySetting>,
}

impl Default for SafetySettings {
    fn default() -> Self {
        // Gemini 2.5 and 3 default to OFF for all categories
        Self {
            settings: vec![
                SafetySetting {
                    category: HarmCategory::HarmCategoryHarassment,
                    threshold: HarmBlockThreshold::Off,
                },
                SafetySetting {
                    category: HarmCategory::HarmCategoryHateSpeech,
                    threshold: HarmBlockThreshold::Off,
                },
                SafetySetting {
                    category: HarmCategory::HarmCategorySexuallyExplicit,
                    threshold: HarmBlockThreshold::Off,
                },
                SafetySetting {
                    category: HarmCategory::HarmCategoryDangerous,
                    threshold: HarmBlockThreshold::Off,
                },
            ],
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SafetySetting {
    pub category: HarmCategory,
    pub threshold: HarmBlockThreshold,
}

#[derive(Debug, Clone, Copy, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "SCREAMING_SNAKE_CASE")]
pub enum HarmCategory {
    HarmCategoryHarassment,
    HarmCategoryHateSpeech,
    HarmCategorySexuallyExplicit,
    HarmCategoryDangerous,
}

#[derive(Debug, Clone, Copy, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "SCREAMING_SNAKE_CASE")]
pub enum HarmBlockThreshold {
    /// No filtering
    Off,
    /// Block nothing
    BlockNone,
    /// Block only high probability harmful content
    BlockOnlyHigh,
    /// Block medium and high probability harmful content
    BlockMediumAndAbove,
    /// Block low, medium, and high probability harmful content
    BlockLowAndAbove,
}

/// Context caching configuration (Gemini 2.5+)
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CachedContent {
    /// Cache resource name
    #[serde(skip_serializing_if = "Option::is_none")]
    pub name: Option<String>,
    /// Display name for the cache
    #[serde(skip_serializing_if = "Option::is_none")]
    pub display_name: Option<String>,
    /// Model name
    pub model: String,
    /// System instruction
    #[serde(skip_serializing_if = "Option::is_none")]
    pub system_instruction: Option<GoogleSystemInstruction>,
    /// Cached contents
    #[serde(skip_serializing_if = "Option::is_none")]
    pub contents: Option<Vec<GoogleContent>>,
    /// Time-to-live (ISO 8601 duration, e.g., "3600s")
    #[serde(skip_serializing_if = "Option::is_none")]
    pub ttl: Option<String>,
    /// Expiration time (ISO 8601 timestamp)
    #[serde(skip_serializing_if = "Option::is_none")]
    pub expire_time: Option<String>,
    /// Creation time
    #[serde(skip_serializing_if = "Option::is_none")]
    pub create_time: Option<String>,
    /// Last update time
    #[serde(skip_serializing_if = "Option::is_none")]
    pub update_time: Option<String>,
    /// Token usage metadata
    #[serde(skip_serializing_if = "Option::is_none")]
    pub usage_metadata: Option<CacheUsageMetadata>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CacheUsageMetadata {
    /// Total token count in the cache
    pub total_token_count: u32,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct GoogleContent {
    pub role: String,
    pub parts: Vec<GooglePart>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(untagged)]
pub enum GooglePart {
    Text {
        text: String,
    },
    InlineData {
        #[serde(rename = "inline_data")]
        inline_data: GoogleInlineData,
        /// Per-part media resolution (Gemini 3 only, v1alpha API)
        #[serde(skip_serializing_if = "Option::is_none")]
        media_resolution: Option<String>,
    },
    FileData {
        #[serde(rename = "file_data")]
        file_data: GoogleFileData,
        /// Per-part media resolution (Gemini 3 only, v1alpha API)
        #[serde(skip_serializing_if = "Option::is_none")]
        media_resolution: Option<String>,
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
pub struct GoogleInlineData {
    pub mime_type: String,
    pub data: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct GoogleFileData {
    pub mime_type: String,
    pub file_uri: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct GoogleFunctionCall {
    pub name: String,
    pub args: Value,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct GoogleFunctionResponse {
    pub name: String,
    pub response: Value,
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
    #[serde(skip_serializing_if = "Option::is_none")]
    system_instruction: Option<GoogleSystemInstruction>,
    /// Cached content reference (for reusing cached context)
    #[serde(skip_serializing_if = "Option::is_none")]
    cached_content: Option<String>,
    /// Safety settings for content filtering
    #[serde(skip_serializing_if = "Option::is_none")]
    safety_settings: Option<Vec<SafetySetting>>,
    /// Gemini 3 thought signature for multi-turn consistency
    #[serde(skip_serializing_if = "Option::is_none")]
    thought_signature: Option<String>,
}

#[derive(Debug, Clone, Serialize)]
struct GoogleGenerationConfig {
    #[serde(skip_serializing_if = "Option::is_none")]
    temperature: Option<f32>,
    #[serde(skip_serializing_if = "Option::is_none")]
    max_output_tokens: Option<u32>,
    #[serde(skip_serializing_if = "Option::is_none")]
    top_p: Option<f32>,
    #[serde(skip_serializing_if = "Option::is_none")]
    top_k: Option<u32>,
    #[serde(skip_serializing_if = "Option::is_none")]
    response_mime_type: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    response_schema: Option<Value>,

    /// Gemini 3 thinking level (none, low, medium, high, extreme)
    #[serde(skip_serializing_if = "Option::is_none")]
    thinking_level: Option<String>,

    /// Global media resolution (Gemini 3)
    #[serde(skip_serializing_if = "Option::is_none")]
    media_resolution: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct GoogleSystemInstruction {
    parts: Vec<GooglePart>,
}

#[derive(Debug, Clone, Deserialize)]
struct GoogleResponse {
    candidates: Vec<GoogleCandidate>,
    #[serde(rename = "usageMetadata")]
    usage_metadata: Option<GoogleUsageMetadata>,
    #[serde(rename = "modelVersion")]
    model_version: Option<String>,

    /// Gemini 3 thought signature for next turn
    #[serde(rename = "thoughtSignature")]
    thought_signature: Option<String>,

    /// Gemini 3 thought summary (condensed reasoning)
    #[serde(rename = "thoughtSummary")]
    thought_summary: Option<String>,

    /// Safety feedback
    #[serde(rename = "promptFeedback")]
    prompt_feedback: Option<PromptFeedback>,
}

#[derive(Debug, Clone, Deserialize)]
struct PromptFeedback {
    #[serde(rename = "safetyRatings")]
    safety_ratings: Option<Vec<SafetyRating>>,
    #[serde(rename = "blockReason")]
    block_reason: Option<String>,
}

#[derive(Debug, Clone, Deserialize)]
struct SafetyRating {
    category: HarmCategory,
    probability: String,
    #[serde(default)]
    blocked: bool,
}

#[derive(Debug, Clone, Deserialize)]
struct GoogleCandidate {
    content: GoogleContent,
    #[serde(rename = "finishReason")]
    finish_reason: Option<String>,
    /// Safety ratings for the candidate
    #[serde(rename = "safetyRatings")]
    safety_ratings: Option<Vec<SafetyRating>>,
}

#[derive(Debug, Clone, Deserialize)]
struct GoogleUsageMetadata {
    #[serde(rename = "promptTokenCount")]
    prompt_token_count: Option<u32>,
    #[serde(rename = "candidatesTokenCount")]
    candidates_token_count: Option<u32>,
    #[serde(rename = "totalTokenCount")]
    total_token_count: Option<u32>,
    /// Cached content token count (reduced pricing)
    #[serde(rename = "cachedContentTokenCount")]
    cached_content_token_count: Option<u32>,
    /// Gemini 3 thinking token count
    #[serde(rename = "thinkingTokenCount")]
    thinking_token_count: Option<u32>,
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

/// Advanced Google provider with Computer Use, Media Resolution, Context Caching, and Safety Settings
pub struct GoogleAdvancedProvider {
    api_key: String,
    client: Client,
    base_url: String,
    /// Computer use configuration
    computer_use: Option<ComputerUseConfig>,
    /// Default media resolution for all media
    default_media_resolution: MediaResolution,
    /// Safety settings
    safety_settings: SafetySettings,
    /// Enable explicit caching (default: implicit only)
    enable_explicit_caching: bool,
}

impl GoogleAdvancedProvider {
    pub fn new(api_key: String) -> Result<Self, Box<dyn std::error::Error + Send + Sync>> {
        let client = Client::builder()
            .connect_timeout(Duration::from_secs(30))
            .timeout(Duration::from_secs(300))
            .build()
            .map_err(|e| Box::new(e) as Box<dyn std::error::Error + Send + Sync>)?;

        // Use v1beta for most features, v1alpha for Gemini 3 media resolution
        let base_url = std::env::var("GOOGLE_API_BASE")
            .unwrap_or_else(|_| "https://generativelanguage.googleapis.com/v1beta".to_string());

        Ok(Self {
            api_key,
            client,
            base_url,
            computer_use: None,
            default_media_resolution: MediaResolution::default(),
            safety_settings: SafetySettings::default(),
            enable_explicit_caching: false,
        })
    }

    /// Enable Computer Use with display configuration
    pub fn with_computer_use(mut self, config: ComputerUseConfig) -> Self {
        self.computer_use = Some(config);
        self
    }

    /// Set default media resolution for all media content
    pub fn with_media_resolution(mut self, resolution: MediaResolution) -> Self {
        self.default_media_resolution = resolution;
        self
    }

    /// Set safety settings for content filtering
    pub fn with_safety_settings(mut self, settings: SafetySettings) -> Self {
        self.safety_settings = settings;
        self
    }

    /// Enable explicit caching (requires cache management)
    pub fn with_explicit_caching(mut self, enable: bool) -> Self {
        self.enable_explicit_caching = enable;
        self
    }

    /// Create a new cache for context reuse
    pub async fn create_cache(
        &self,
        display_name: String,
        model: String,
        system_instruction: Option<String>,
        contents: Vec<GoogleContent>,
        ttl: String,
    ) -> Result<CachedContent, Box<dyn Error + Send + Sync>> {
        let url = format!("{}/cachedContents?key={}", self.base_url, self.api_key);

        let request_body = serde_json::json!({
            "display_name": display_name,
            "model": model,
            "system_instruction": system_instruction.map(|s| GoogleSystemInstruction {
                parts: vec![GooglePart::Text { text: s }],
            }),
            "contents": contents,
            "ttl": ttl,
        });

        let response = self
            .client
            .post(&url)
            .header("Content-Type", "application/json")
            .json(&request_body)
            .send()
            .await?;

        if !response.status().is_success() {
            let error_msg = Self::handle_error(response).await;
            return Err(error_msg.into());
        }

        let cached_content: CachedContent = response.json().await?;
        Ok(cached_content)
    }

    /// Get existing cache by name
    pub async fn get_cache(
        &self,
        cache_name: &str,
    ) -> Result<CachedContent, Box<dyn Error + Send + Sync>> {
        let url = format!("{}/{}?key={}", self.base_url, cache_name, self.api_key);

        let response = self.client.get(&url).send().await?;

        if !response.status().is_success() {
            let error_msg = Self::handle_error(response).await;
            return Err(error_msg.into());
        }

        let cached_content: CachedContent = response.json().await?;
        Ok(cached_content)
    }

    /// List all caches
    pub async fn list_caches(&self) -> Result<Vec<CachedContent>, Box<dyn Error + Send + Sync>> {
        let url = format!("{}/cachedContents?key={}", self.base_url, self.api_key);

        let response = self.client.get(&url).send().await?;

        if !response.status().is_success() {
            let error_msg = Self::handle_error(response).await;
            return Err(error_msg.into());
        }

        #[derive(Deserialize)]
        struct ListResponse {
            #[serde(default)]
            cached_contents: Vec<CachedContent>,
        }

        let list: ListResponse = response.json().await?;
        Ok(list.cached_contents)
    }

    /// Update cache TTL
    pub async fn update_cache(
        &self,
        cache_name: &str,
        ttl: String,
    ) -> Result<CachedContent, Box<dyn Error + Send + Sync>> {
        let url = format!(
            "{}/{}?key={}&updateMask=ttl",
            self.base_url, cache_name, self.api_key
        );

        let request_body = serde_json::json!({
            "ttl": ttl,
        });

        let response = self
            .client
            .patch(&url)
            .header("Content-Type", "application/json")
            .json(&request_body)
            .send()
            .await?;

        if !response.status().is_success() {
            let error_msg = Self::handle_error(response).await;
            return Err(error_msg.into());
        }

        let cached_content: CachedContent = response.json().await?;
        Ok(cached_content)
    }

    /// Delete a cache
    pub async fn delete_cache(&self, cache_name: &str) -> Result<(), Box<dyn Error + Send + Sync>> {
        let url = format!("{}/{}?key={}", self.base_url, cache_name, self.api_key);

        let response = self.client.delete(&url).send().await?;

        if !response.status().is_success() {
            let error_msg = Self::handle_error(response).await;
            return Err(error_msg.into());
        }

        Ok(())
    }

    /// Calculate cost with cache token pricing and thinking tokens
    fn calculate_cost(
        model: &str,
        input_tokens: u32,
        output_tokens: u32,
        cached_tokens: u32,
        thinking_tokens: u32,
    ) -> f64 {
        // Get pricing per 1M tokens (input, output, thinking)
        let (input_cost, output_cost, thinking_cost, cache_discount) = match model {
            // Gemini 3 models (Latest - 2026)
            "gemini-3-pro-preview" | "gemini-3-pro" => (1.25, 5.0, 2.5, 0.75),
            "gemini-3-flash-preview" | "gemini-3-flash" => (0.1, 0.4, 0.2, 0.75),
            "gemini-3-deep-think" => (2.0, 8.0, 4.0, 0.75),

            // Gemini 2.5 models (Latest - 2025)
            "gemini-2.5-pro" | "gemini-2-5-pro" => (1.25, 5.0, 0.0, 0.75),
            "gemini-2.5-flash" | "gemini-2-5-flash" => (0.075, 0.3, 0.0, 0.75),
            "gemini-2.5-computer-use" => (1.25, 5.0, 0.0, 0.75),

            // Gemini 2 models
            "gemini-2-flash" | "gemini-2.0-flash" | "gemini-2-0-flash" => (0.1, 0.4, 0.0, 0.75),
            "gemini-2.0-pro-exp-02-05" => (1.25, 5.0, 0.0, 0.75),

            _ => (0.5, 1.5, 0.0, 0.75),
        };

        // Calculate uncached token cost
        let uncached_tokens = input_tokens.saturating_sub(cached_tokens);
        let input = (uncached_tokens as f64 / 1_000_000.0) * input_cost;

        // Cached tokens get discount (default 75%)
        let cached_cost =
            (cached_tokens as f64 / 1_000_000.0) * input_cost * (1.0 - cache_discount);

        let output = (output_tokens as f64 / 1_000_000.0) * output_cost;

        // Thinking tokens cost
        let thinking = (thinking_tokens as f64 / 1_000_000.0) * thinking_cost;

        input + cached_cost + output + thinking
    }

    fn convert_role(role: &str) -> String {
        match role {
            "assistant" => "model".to_string(),
            _ => role.to_string(),
        }
    }

    fn convert_content(
        text: &str,
        multimodal: Option<&Vec<ContentPart>>,
        media_resolution: MediaResolution,
    ) -> Vec<GooglePart> {
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
                            // Per-part media resolution for Gemini 3
                            media_resolution: Some(media_resolution.as_str().to_string()),
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
                                    media_resolution: Some(media_resolution.as_str().to_string()),
                                });
                            }
                            VideoData::Uri(uri) => {
                                parts.push(GooglePart::FileData {
                                    file_data: GoogleFileData {
                                        mime_type: mime_type.to_string(),
                                        file_uri: uri.clone(),
                                    },
                                    media_resolution: Some(media_resolution.as_str().to_string()),
                                });
                            }
                        }
                    }
                    ContentPart::Audio { audio } => {
                        let mime_type = match audio.format {
                            AudioFormat::Wav => "audio/wav",
                            AudioFormat::Mp3 => "audio/mpeg",
                            AudioFormat::Opus => "audio/ogg",
                            AudioFormat::M4a => "audio/mp4",
                            AudioFormat::Flac => "audio/flac",
                            AudioFormat::Webm => "audio/webm",
                            AudioFormat::Ogg => "audio/ogg",
                            AudioFormat::Aac => "audio/aac",
                        };

                        // AudioInput stores raw bytes directly, encode to base64
                        let base64_data = base64::Engine::encode(
                            &base64::engine::general_purpose::STANDARD,
                            &audio.data,
                        );
                        parts.push(GooglePart::InlineData {
                            inline_data: GoogleInlineData {
                                mime_type: mime_type.to_string(),
                                data: base64_data,
                            },
                            media_resolution: None, // Audio doesn't use media resolution
                        });
                    }
                    ContentPart::Document { .. } => {
                        tracing::warn!("Document content not yet implemented for Google provider");
                    }
                    ContentPart::ToolUse { .. } => {
                        // Tool use is handled separately
                    }
                    ContentPart::ToolResult { .. } => {
                        // Tool result is handled separately
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

    /// Process thinking parameter for Gemini 3 thinking_level
    /// Returns (thinking_level, max_output_tokens)
    fn process_thinking_config(
        thinking: &ThinkingParameter,
        max_tokens: Option<u32>,
    ) -> (Option<String>, Option<u32>) {
        match thinking {
            ThinkingParameter::Level { level, .. } => {
                // Gemini 3 thinking levels with corresponding token budgets
                let thinking_tokens = match level.as_str() {
                    "none" => 0,
                    "low" => 2000,
                    "medium" => 4000,
                    "high" => 8000,
                    "extreme" => 16000,
                    _ => {
                        tracing::warn!("Unknown thinking level: {}, using medium", level);
                        4000
                    }
                };

                let base_tokens = max_tokens.unwrap_or(2048);
                let total_tokens = if thinking_tokens > 0 {
                    (base_tokens + thinking_tokens).min(65536) // Gemini 3 supports up to 64K output
                } else {
                    base_tokens
                };

                (Some(level.clone()), Some(total_tokens))
            }
            ThinkingParameter::Budget { budget_tokens, .. } => {
                let thinking_tokens = *budget_tokens;
                let base_tokens = max_tokens.unwrap_or(2048);
                (None, Some((base_tokens + thinking_tokens).min(8192)))
            }
            ThinkingParameter::Enabled(true) => {
                let base_tokens = max_tokens.unwrap_or(2048);
                (
                    Some("medium".to_string()),
                    Some((base_tokens + 4000).min(65536)),
                )
            }
            ThinkingParameter::Enabled(false) => (None, max_tokens),
        }
    }

    /// Get minimum token requirements for caching per model
    fn get_cache_minimum_tokens(model: &str) -> u32 {
        match model {
            // Gemini 3 models - 4K minimum
            m if m.starts_with("gemini-3") => 4096,
            // Gemini 2.5 models - 4K minimum
            m if m.starts_with("gemini-2.5") || m.starts_with("gemini-2-5") => 4096,
            // Gemini 2.0 models - 4K minimum
            m if m.starts_with("gemini-2") => 4096,
            // Default 4K
            _ => 4096,
        }
    }
}

#[async_trait::async_trait]
impl LLMProvider for GoogleAdvancedProvider {
    async fn send_message(
        &self,
        request: &LLMRequest,
    ) -> Result<LLMResponse, Box<dyn Error + Send + Sync>> {
        let google_tools = request.tools.as_ref().map(|tools| {
            vec![GoogleTool {
                function_declarations: tools
                    .iter()
                    .map(|tool| GoogleFunctionDeclaration {
                        name: tool.name().to_string(),
                        description: tool.description().to_string(),
                        parameters: tool.parameters().clone(),
                    })
                    .collect(),
            }]
        });

        // Process thinking parameter for extended reasoning
        let (thinking_level, max_output_tokens) = if let Some(thinking) = &request.thinking {
            Self::process_thinking_config(thinking, request.max_tokens)
        } else {
            (None, request.max_tokens)
        };

        // Process response format for structured outputs
        let (response_mime_type, response_schema) = if let Some(format) = &request.response_format {
            let format_type = &format.format_type;
            if format_type == "json_object" || format_type == "json_schema" {
                (
                    Some("application/json".to_string()),
                    format.json_schema.clone(),
                )
            } else {
                (None, None)
            }
        } else {
            (None, None)
        };

        // Check if we should use cached content
        let cached_content = if self.enable_explicit_caching {
            // Use conversation_id as cache reference if available
            request
                .conversation_id
                .as_ref()
                .map(|id| format!("cachedContents/{}", id))
        } else {
            None
        };

        // Build generation config with media resolution
        let generation_config = GoogleGenerationConfig {
            temperature: request.temperature,
            max_output_tokens,
            top_p: request.top_p,
            top_k: request.top_k,
            response_mime_type,
            response_schema,
            thinking_level,
            // Global media resolution for all media in this request
            media_resolution: Some(self.default_media_resolution.as_str().to_string()),
        };

        // Build system instruction if present
        let system_instruction = request.system.as_ref().map(|sys| GoogleSystemInstruction {
            parts: vec![GooglePart::Text { text: sys.clone() }],
        });

        let google_request = GoogleRequest {
            contents: request
                .messages
                .iter()
                .map(|m| GoogleContent {
                    role: Self::convert_role(&m.role),
                    parts: Self::convert_content(
                        &m.content,
                        m.multimodal_content.as_ref(),
                        self.default_media_resolution,
                    ),
                })
                .collect(),
            generation_config: Some(generation_config),
            tools: google_tools,
            system_instruction,
            cached_content,
            safety_settings: Some(self.safety_settings.settings.clone()),
            thought_signature: None, // Will be populated from previous response in multi-turn
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

        // Check for safety blocks
        if let Some(feedback) = &google_response.prompt_feedback {
            if let Some(block_reason) = &feedback.block_reason {
                return Err(format!("Content blocked: {}", block_reason).into());
            }
        }

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

        let (tokens, prompt_tokens, completion_tokens, cache_read_tokens, thinking_tokens, cost) =
            if let Some(usage) = google_response.usage_metadata {
                let input_tokens = usage.prompt_token_count.unwrap_or(0);
                let output_tokens = usage.candidates_token_count.unwrap_or(0);
                let total_tokens = usage
                    .total_token_count
                    .unwrap_or(input_tokens + output_tokens);
                let cached_tokens = usage.cached_content_token_count.unwrap_or(0);
                let think_tokens = usage.thinking_token_count.unwrap_or(0);

                // Calculate cost with cache discount and thinking tokens
                let cost = Self::calculate_cost(
                    &request.model,
                    input_tokens,
                    output_tokens,
                    cached_tokens,
                    think_tokens,
                );

                (
                    Some(total_tokens),
                    Some(input_tokens),
                    Some(output_tokens),
                    if cached_tokens > 0 {
                        Some(cached_tokens)
                    } else {
                        None
                    },
                    if think_tokens > 0 {
                        Some(think_tokens)
                    } else {
                        None
                    },
                    Some(cost),
                )
            } else {
                (None, None, None, None, None, None)
            };

        // Map finish reason to standard format
        let finish_reason = if !tool_calls.is_empty() {
            Some("tool_calls".to_string())
        } else if let Some(candidate) = google_response.candidates.first() {
            candidate.finish_reason.clone()
        } else {
            Some("stop".to_string())
        };

        // Extract model version for response tracking
        let model_version = google_response
            .model_version
            .unwrap_or_else(|| request.model.clone());

        // Extract thought summary as reasoning content for Gemini 3
        let reasoning_content = google_response.thought_summary;

        Ok(LLMResponse {
            content: text_content,
            tokens,
            prompt_tokens,
            completion_tokens,
            cache_read_input_tokens: cache_read_tokens,
            thinking_tokens,
            reasoning_content,
            cost,
            model: model_version,
            cached: cache_read_tokens.is_some(),
            tool_calls: if tool_calls.is_empty() {
                None
            } else {
                Some(tool_calls)
            },
            finish_reason,
            ..LLMResponse::default()
        })
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
                        name: tool.name().to_string(),
                        description: tool.description().to_string(),
                        parameters: tool.parameters().clone(),
                    })
                    .collect(),
            }]
        });

        // Process thinking parameter for extended reasoning
        let (thinking_level, max_output_tokens) = if let Some(thinking) = &request.thinking {
            Self::process_thinking_config(thinking, request.max_tokens)
        } else {
            (None, request.max_tokens)
        };

        // Process response format for structured outputs
        let (response_mime_type, response_schema) = if let Some(format) = &request.response_format {
            let format_type = &format.format_type;
            if format_type == "json_object" || format_type == "json_schema" {
                (
                    Some("application/json".to_string()),
                    format.json_schema.clone(),
                )
            } else {
                (None, None)
            }
        } else {
            (None, None)
        };

        // Check if we should use cached content
        let cached_content = if self.enable_explicit_caching {
            request
                .conversation_id
                .as_ref()
                .map(|id| format!("cachedContents/{}", id))
        } else {
            None
        };

        // Build generation config with media resolution
        let generation_config = GoogleGenerationConfig {
            temperature: request.temperature,
            max_output_tokens,
            top_p: request.top_p,
            top_k: request.top_k,
            response_mime_type,
            response_schema,
            thinking_level,
            media_resolution: Some(self.default_media_resolution.as_str().to_string()),
        };

        // Build system instruction if present
        let system_instruction = request.system.as_ref().map(|sys| GoogleSystemInstruction {
            parts: vec![GooglePart::Text { text: sys.clone() }],
        });

        let google_request = GoogleRequest {
            contents: request
                .messages
                .iter()
                .map(|m| GoogleContent {
                    role: Self::convert_role(&m.role),
                    parts: Self::convert_content(
                        &m.content,
                        m.multimodal_content.as_ref(),
                        self.default_media_resolution,
                    ),
                })
                .collect(),
            generation_config: Some(generation_config),
            tools: google_tools,
            system_instruction,
            cached_content,
            safety_settings: Some(self.safety_settings.settings.clone()),
            thought_signature: None,
        };

        tracing::debug!(
            "Starting Google Advanced streaming request for model: {}",
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

        tracing::debug!("Google Advanced streaming response received, starting SSE parsing");

        Ok(Box::pin(parse_sse_stream(
            response,
            crate::core::llm::Provider::Google,
        )))
    }

    fn is_configured(&self) -> bool {
        !self.api_key.is_empty() && self.api_key != "your-api-key-here"
    }

    fn name(&self) -> &str {
        "Google Advanced"
    }

    fn supports_vision(&self) -> bool {
        true
    }

    fn supports_function_calling(&self) -> bool {
        true
    }

    fn supports_audio_input(&self) -> bool {
        true
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_media_resolution_token_counts() {
        assert_eq!(MediaResolution::MediaResolutionLow.token_count(), 280);
        assert_eq!(MediaResolution::MediaResolutionMedium.token_count(), 560);
        assert_eq!(MediaResolution::MediaResolutionHigh.token_count(), 1120);
        assert_eq!(
            MediaResolution::MediaResolutionUltraHigh.token_count(),
            2240
        );
    }

    #[test]
    fn test_safety_settings_default() {
        let settings = SafetySettings::default();
        assert_eq!(settings.settings.len(), 4);

        // All should be OFF by default for Gemini 2.5+
        for setting in &settings.settings {
            assert_eq!(setting.threshold, HarmBlockThreshold::Off);
        }
    }

    #[test]
    fn test_computer_use_default() {
        let config = ComputerUseConfig::default();
        assert_eq!(config.display_width, 1920);
        assert_eq!(config.display_height, 1080);
        assert!(config.enable_screenshots);
        assert!(config.enable_actions);
    }

    #[test]
    fn test_calculate_cost_with_cache() {
        // Test Gemini 3 Pro with caching (75% discount)
        let cost = GoogleAdvancedProvider::calculate_cost(
            "gemini-3-pro",
            1_000_000,
            1_000_000,
            500_000,
            0,
        );
        // 500K uncached at $1.25 + 500K cached at $0.3125 (75% off) + 1M output at $5
        // = 0.625 + 0.15625 + 5.0 = 5.78125
        assert!((cost - 5.78125).abs() < 0.001);
    }

    #[test]
    fn test_calculate_cost_with_thinking() {
        // Test Gemini 3 Deep Think with thinking tokens
        let cost = GoogleAdvancedProvider::calculate_cost(
            "gemini-3-deep-think",
            1_000_000,
            1_000_000,
            0,
            500_000, // 500K thinking tokens
        );
        // 1M input at $2.0 + 1M output at $8.0 + 500K thinking at $4.0
        // = 2.0 + 8.0 + 2.0 = 12.0
        assert_eq!(cost, 12.0);
    }

    #[test]
    fn test_process_thinking_config() {
        // Test level mode
        let thinking = ThinkingParameter::Level {
            level: "high".to_string(),
            max_thinking_tokens: None,
        };
        let (level, tokens) =
            GoogleAdvancedProvider::process_thinking_config(&thinking, Some(2048));
        assert_eq!(level, Some("high".to_string()));
        assert_eq!(tokens, Some(10048)); // 2048 + 8000

        // Test extreme level
        let thinking_extreme = ThinkingParameter::Level {
            level: "extreme".to_string(),
            max_thinking_tokens: None,
        };
        let (level_extreme, tokens_extreme) =
            GoogleAdvancedProvider::process_thinking_config(&thinking_extreme, Some(2048));
        assert_eq!(level_extreme, Some("extreme".to_string()));
        assert_eq!(tokens_extreme, Some(18048)); // 2048 + 16000
    }

    #[test]
    fn test_cache_minimum_tokens() {
        assert_eq!(
            GoogleAdvancedProvider::get_cache_minimum_tokens("gemini-3-pro"),
            4096
        );
        assert_eq!(
            GoogleAdvancedProvider::get_cache_minimum_tokens("gemini-2.5-flash"),
            4096
        );
        assert_eq!(
            GoogleAdvancedProvider::get_cache_minimum_tokens("gemini-2-flash"),
            4096
        );
        assert_eq!(
            GoogleAdvancedProvider::get_cache_minimum_tokens("unknown-model"),
            4096
        );
    }

    #[test]
    fn test_convert_role() {
        assert_eq!(GoogleAdvancedProvider::convert_role("user"), "user");
        assert_eq!(GoogleAdvancedProvider::convert_role("assistant"), "model");
        assert_eq!(GoogleAdvancedProvider::convert_role("system"), "system");
    }
}
