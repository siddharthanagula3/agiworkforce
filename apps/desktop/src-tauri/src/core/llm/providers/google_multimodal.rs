use reqwest::Client;
use serde::{Deserialize, Serialize};
use std::error::Error;
use std::time::Duration;

/// Google Multimodal Generation API client
/// Supports image generation (Nano Banana, Imagen 4), video generation (Veo 3.1),
/// and text-to-speech (Gemini 2.5 Flash TTS)
pub struct GoogleMultimodalProvider {
    api_key: String,
    client: Client,
    base_url: String,
}

impl GoogleMultimodalProvider {
    /// Create a new GoogleMultimodalProvider
    pub fn new(api_key: String) -> Result<Self, Box<dyn std::error::Error + Send + Sync>> {
        let client = Client::builder()
            .connect_timeout(Duration::from_secs(30))
            .timeout(Duration::from_secs(600)) // Longer timeout for video/image generation
            .build()
            .map_err(|e| Box::new(e) as Box<dyn std::error::Error + Send + Sync>)?;

        // Use Google AI Studio API endpoint for multimodal generation
        let base_url = std::env::var("GOOGLE_MULTIMODAL_API_BASE")
            .unwrap_or_else(|_| "https://generativelanguage.googleapis.com/v1beta".to_string());

        Ok(Self {
            api_key,
            client,
            base_url,
        })
    }

    /// Generate an image using Nano Banana or Imagen 4
    pub async fn generate_image(
        &self,
        config: ImageGenConfig,
    ) -> Result<GeneratedImage, Box<dyn Error + Send + Sync>> {
        let request = ImageGenRequest {
            prompt: config.prompt.clone(),
            model: config.model.clone(),
            aspect_ratio: config.aspect_ratio.clone(),
            safety_settings: config.safety_settings.clone(),
            number_of_images: config.number_of_images.unwrap_or(1),
        };

        let url = format!(
            "{}/models/{}:generateImage?key={}",
            self.base_url, config.model, self.api_key
        );

        tracing::debug!("Generating image with model: {}", config.model);

        let response = self
            .client
            .post(&url)
            .header("Content-Type", "application/json")
            .json(&request)
            .send()
            .await?;

        if !response.status().is_success() {
            let error_msg = Self::handle_error(response).await;
            return Err(error_msg.into());
        }

        let image_response: ImageGenResponse = response.json().await?;

        if let Some(first_image) = image_response.images.first() {
            // Calculate cost: $0.04 per image
            let cost = 0.04 * config.number_of_images.unwrap_or(1) as f64;

            Ok(GeneratedImage {
                uri: first_image.uri.clone(),
                mime_type: first_image.mime_type.clone(),
                prompt: config.prompt,
                model: config.model,
                aspect_ratio: config.aspect_ratio,
                cost: Some(cost),
            })
        } else {
            Err("No images generated in response".into())
        }
    }

    /// Generate a video using Veo 3.1
    pub async fn generate_video(
        &self,
        config: VideoGenConfig,
    ) -> Result<GeneratedVideo, Box<dyn Error + Send + Sync>> {
        let request = VideoGenRequest {
            prompt: config.prompt.clone(),
            model: config.model.clone(),
            duration: config.duration,
            aspect_ratio: config.aspect_ratio.clone(),
            safety_settings: config.safety_settings.clone(),
        };

        let url = format!(
            "{}/models/{}:generateVideo?key={}",
            self.base_url, config.model, self.api_key
        );

        tracing::debug!(
            "Generating video with model: {}, duration: {}s",
            config.model,
            config.duration
        );

        let response = self
            .client
            .post(&url)
            .header("Content-Type", "application/json")
            .json(&request)
            .send()
            .await?;

        if !response.status().is_success() {
            let error_msg = Self::handle_error(response).await;
            return Err(error_msg.into());
        }

        let video_response: VideoGenResponse = response.json().await?;

        // Calculate cost based on duration
        // $0.13 for 2s, $1.30 for 20s (linear interpolation)
        let cost = if config.duration <= 2 {
            0.13
        } else if config.duration >= 20 {
            1.30
        } else {
            // Linear interpolation: $0.13 + (duration - 2) * ($1.17 / 18)
            0.13 + ((config.duration - 2) as f64 * 0.065)
        };

        Ok(GeneratedVideo {
            uri: video_response.video_uri,
            duration: config.duration,
            prompt: config.prompt,
            model: config.model,
            aspect_ratio: config.aspect_ratio,
            mime_type: video_response
                .mime_type
                .unwrap_or_else(|| "video/mp4".to_string()),
            cost: Some(cost),
        })
    }

    /// Generate speech using Gemini 2.5 Flash TTS
    pub async fn generate_speech(
        &self,
        config: TTSConfig,
    ) -> Result<GeneratedAudio, Box<dyn Error + Send + Sync>> {
        let request = TTSRequest {
            text: config.text.clone(),
            voice: config.voice.clone(),
            language: config.language.clone(),
            speaking_rate: config.speaking_rate.unwrap_or(1.0),
            audio_format: config
                .audio_format
                .clone()
                .unwrap_or_else(|| "mp3".to_string()),
        };

        let url = format!(
            "{}/models/gemini-2.5-flash-tts:generateSpeech?key={}",
            self.base_url, self.api_key
        );

        tracing::debug!(
            "Generating speech with voice: {}, language: {}",
            config.voice,
            config.language.as_deref().unwrap_or("en-US")
        );

        let response = self
            .client
            .post(&url)
            .header("Content-Type", "application/json")
            .json(&request)
            .send()
            .await?;

        if !response.status().is_success() {
            let error_msg = Self::handle_error(response).await;
            return Err(error_msg.into());
        }

        let tts_response: TTSResponse = response.json().await?;

        // Decode base64 audio data
        let audio_bytes = base64::Engine::decode(
            &base64::engine::general_purpose::STANDARD,
            &tts_response.audio_content,
        )?;

        // Calculate cost: $10 per 1M characters
        let char_count = config.text.chars().count() as f64;
        let cost = (char_count / 1_000_000.0) * 10.0;

        Ok(GeneratedAudio {
            audio_data: audio_bytes,
            format: config.audio_format.unwrap_or_else(|| "mp3".to_string()),
            voice: config.voice,
            language: config.language,
            text: config.text,
            duration_seconds: tts_response.duration_seconds,
            cost: Some(cost),
        })
    }

    /// Handle API error responses
    async fn handle_error(response: reqwest::Response) -> String {
        let status = response.status();
        let error_text = response
            .text()
            .await
            .unwrap_or_else(|_| "Unknown error".to_string());

        if let Ok(json_error) = serde_json::from_str::<GoogleErrorResponse>(&error_text) {
            return format!(
                "Google Multimodal API Error {}: {} ({})",
                json_error.error.code, json_error.error.message, json_error.error.status
            );
        }

        if status.as_u16() == 429 {
            return "Google API Rate Limit Exceeded. Please try again later.".to_string();
        }

        format!("Google Multimodal API error {}: {}", status, error_text)
    }
}

// ============================================================================
// Image Generation Types
// ============================================================================

/// Configuration for image generation
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ImageGenConfig {
    /// Text prompt describing the desired image
    pub prompt: String,

    /// Model to use: "nano-banana" or "imagen-4"
    #[serde(default = "default_image_model")]
    pub model: String,

    /// Aspect ratio (e.g., "1:1", "16:9", "9:16", "4:3", "3:4")
    #[serde(skip_serializing_if = "Option::is_none")]
    pub aspect_ratio: Option<String>,

    /// Safety settings for content filtering
    #[serde(skip_serializing_if = "Option::is_none")]
    pub safety_settings: Option<Vec<SafetySetting>>,

    /// Number of images to generate (1-4)
    #[serde(skip_serializing_if = "Option::is_none")]
    pub number_of_images: Option<u32>,
}

fn default_image_model() -> String {
    "nano-banana".to_string()
}

/// Internal request structure for image generation
#[derive(Debug, Serialize)]
struct ImageGenRequest {
    prompt: String,
    model: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    aspect_ratio: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    safety_settings: Option<Vec<SafetySetting>>,
    number_of_images: u32,
}

/// Internal response structure for image generation
#[derive(Debug, Deserialize)]
struct ImageGenResponse {
    images: Vec<ImageResult>,
}

#[derive(Debug, Deserialize)]
struct ImageResult {
    uri: String,
    mime_type: String,
}

/// Generated image result
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct GeneratedImage {
    /// URI to the generated image (Google Cloud Storage URL)
    pub uri: String,

    /// MIME type of the image (e.g., "image/png")
    pub mime_type: String,

    /// Original prompt used for generation
    pub prompt: String,

    /// Model used for generation
    pub model: String,

    /// Aspect ratio of the generated image
    pub aspect_ratio: Option<String>,

    /// Cost in USD for generating this image
    pub cost: Option<f64>,
}

// ============================================================================
// Video Generation Types
// ============================================================================

/// Configuration for video generation
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct VideoGenConfig {
    /// Text prompt describing the desired video
    pub prompt: String,

    /// Model to use (currently "veo-3.1")
    #[serde(default = "default_video_model")]
    pub model: String,

    /// Duration in seconds (2-20 seconds)
    #[serde(default = "default_video_duration")]
    pub duration: u32,

    /// Aspect ratio (e.g., "16:9", "9:16", "1:1")
    #[serde(skip_serializing_if = "Option::is_none")]
    pub aspect_ratio: Option<String>,

    /// Safety settings for content filtering
    #[serde(skip_serializing_if = "Option::is_none")]
    pub safety_settings: Option<Vec<SafetySetting>>,
}

fn default_video_model() -> String {
    "veo-3.1".to_string()
}

fn default_video_duration() -> u32 {
    5 // 5 seconds default
}

/// Internal request structure for video generation
#[derive(Debug, Serialize)]
struct VideoGenRequest {
    prompt: String,
    model: String,
    duration: u32,
    #[serde(skip_serializing_if = "Option::is_none")]
    aspect_ratio: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    safety_settings: Option<Vec<SafetySetting>>,
}

/// Internal response structure for video generation
#[derive(Debug, Deserialize)]
struct VideoGenResponse {
    video_uri: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    mime_type: Option<String>,
}

/// Generated video result
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct GeneratedVideo {
    /// URI to the generated video (Google Cloud Storage URL)
    pub uri: String,

    /// Duration of the video in seconds
    pub duration: u32,

    /// Original prompt used for generation
    pub prompt: String,

    /// Model used for generation
    pub model: String,

    /// Aspect ratio of the generated video
    pub aspect_ratio: Option<String>,

    /// MIME type of the video (e.g., "video/mp4")
    pub mime_type: String,

    /// Cost in USD for generating this video
    pub cost: Option<f64>,
}

// ============================================================================
// Text-to-Speech Types
// ============================================================================

/// Configuration for text-to-speech generation
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct TTSConfig {
    /// Text to convert to speech
    pub text: String,

    /// Voice identifier (provider-specific)
    #[serde(default = "default_voice")]
    pub voice: String,

    /// Language code (e.g., "en-US", "es-ES", "ja-JP")
    #[serde(skip_serializing_if = "Option::is_none")]
    pub language: Option<String>,

    /// Speaking rate (0.25 to 4.0, default 1.0)
    #[serde(skip_serializing_if = "Option::is_none")]
    pub speaking_rate: Option<f32>,

    /// Audio format (e.g., "mp3", "wav", "opus")
    #[serde(skip_serializing_if = "Option::is_none")]
    pub audio_format: Option<String>,
}

fn default_voice() -> String {
    "default".to_string()
}

/// Internal request structure for TTS
#[derive(Debug, Serialize)]
struct TTSRequest {
    text: String,
    voice: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    language: Option<String>,
    speaking_rate: f32,
    audio_format: String,
}

/// Internal response structure for TTS
#[derive(Debug, Deserialize)]
struct TTSResponse {
    /// Base64 encoded audio content
    audio_content: String,
    /// Duration in seconds (optional)
    #[serde(skip_serializing_if = "Option::is_none")]
    duration_seconds: Option<f64>,
}

/// Generated audio result
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct GeneratedAudio {
    /// Raw audio bytes
    pub audio_data: Vec<u8>,

    /// Audio format (e.g., "mp3", "wav")
    pub format: String,

    /// Voice used for generation
    pub voice: String,

    /// Language of the speech
    pub language: Option<String>,

    /// Original text
    pub text: String,

    /// Duration in seconds (if available)
    pub duration_seconds: Option<f64>,

    /// Cost in USD for generating this audio
    pub cost: Option<f64>,
}

// ============================================================================
// Common Types
// ============================================================================

/// Safety setting for content filtering
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SafetySetting {
    /// Safety category (e.g., "HARM_CATEGORY_DANGEROUS_CONTENT")
    pub category: String,

    /// Threshold level (e.g., "BLOCK_MEDIUM_AND_ABOVE")
    pub threshold: String,
}

impl SafetySetting {
    /// Create a new safety setting
    pub fn new(category: String, threshold: String) -> Self {
        Self {
            category,
            threshold,
        }
    }

    /// Create default safety settings (block harmful content)
    pub fn default_settings() -> Vec<Self> {
        vec![
            Self::new(
                "HARM_CATEGORY_HATE_SPEECH".to_string(),
                "BLOCK_MEDIUM_AND_ABOVE".to_string(),
            ),
            Self::new(
                "HARM_CATEGORY_DANGEROUS_CONTENT".to_string(),
                "BLOCK_MEDIUM_AND_ABOVE".to_string(),
            ),
            Self::new(
                "HARM_CATEGORY_SEXUALLY_EXPLICIT".to_string(),
                "BLOCK_MEDIUM_AND_ABOVE".to_string(),
            ),
            Self::new(
                "HARM_CATEGORY_HARASSMENT".to_string(),
                "BLOCK_MEDIUM_AND_ABOVE".to_string(),
            ),
        ]
    }
}

/// Google API error response
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

// ============================================================================
// Helper Functions
// ============================================================================

impl ImageGenConfig {
    /// Create a new image generation config with default settings
    pub fn new(prompt: String) -> Self {
        Self {
            prompt,
            model: default_image_model(),
            aspect_ratio: Some("1:1".to_string()),
            safety_settings: Some(SafetySetting::default_settings()),
            number_of_images: Some(1),
        }
    }

    /// Use Nano Banana model (faster, cheaper)
    pub fn with_nano_banana(mut self) -> Self {
        self.model = "nano-banana".to_string();
        self
    }

    /// Use Imagen 4 model (higher quality)
    pub fn with_imagen_4(mut self) -> Self {
        self.model = "imagen-4".to_string();
        self
    }

    /// Set aspect ratio
    pub fn with_aspect_ratio(mut self, aspect_ratio: String) -> Self {
        self.aspect_ratio = Some(aspect_ratio);
        self
    }

    /// Set number of images to generate
    pub fn with_count(mut self, count: u32) -> Self {
        self.number_of_images = Some(count.clamp(1, 4));
        self
    }
}

impl VideoGenConfig {
    /// Create a new video generation config with default settings
    pub fn new(prompt: String) -> Self {
        Self {
            prompt,
            model: default_video_model(),
            duration: default_video_duration(),
            aspect_ratio: Some("16:9".to_string()),
            safety_settings: Some(SafetySetting::default_settings()),
        }
    }

    /// Set video duration (2-20 seconds)
    pub fn with_duration(mut self, duration: u32) -> Self {
        self.duration = duration.clamp(2, 20);
        self
    }

    /// Set aspect ratio
    pub fn with_aspect_ratio(mut self, aspect_ratio: String) -> Self {
        self.aspect_ratio = Some(aspect_ratio);
        self
    }
}

impl TTSConfig {
    /// Create a new TTS config with default settings
    pub fn new(text: String) -> Self {
        Self {
            text,
            voice: default_voice(),
            language: Some("en-US".to_string()),
            speaking_rate: Some(1.0),
            audio_format: Some("mp3".to_string()),
        }
    }

    /// Set voice
    pub fn with_voice(mut self, voice: String) -> Self {
        self.voice = voice;
        self
    }

    /// Set language
    pub fn with_language(mut self, language: String) -> Self {
        self.language = Some(language);
        self
    }

    /// Set speaking rate (0.25 to 4.0)
    pub fn with_speaking_rate(mut self, rate: f32) -> Self {
        self.speaking_rate = Some(rate.clamp(0.25, 4.0));
        self
    }

    /// Set audio format
    pub fn with_format(mut self, format: String) -> Self {
        self.audio_format = Some(format);
        self
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_image_config_builder() {
        let config = ImageGenConfig::new("A beautiful sunset".to_string())
            .with_imagen_4()
            .with_aspect_ratio("16:9".to_string())
            .with_count(2);

        assert_eq!(config.model, "imagen-4");
        assert_eq!(config.aspect_ratio, Some("16:9".to_string()));
        assert_eq!(config.number_of_images, Some(2));
    }

    #[test]
    fn test_video_config_builder() {
        let config = VideoGenConfig::new("A cat playing piano".to_string())
            .with_duration(10)
            .with_aspect_ratio("1:1".to_string());

        assert_eq!(config.model, "veo-3.1");
        assert_eq!(config.duration, 10);
        assert_eq!(config.aspect_ratio, Some("1:1".to_string()));
    }

    #[test]
    fn test_video_duration_clamping() {
        let config = VideoGenConfig::new("Test".to_string()).with_duration(50);
        assert_eq!(config.duration, 20); // Should clamp to max 20

        let config = VideoGenConfig::new("Test".to_string()).with_duration(1);
        assert_eq!(config.duration, 2); // Should clamp to min 2
    }

    #[test]
    fn test_tts_config_builder() {
        let config = TTSConfig::new("Hello world".to_string())
            .with_voice("en-US-Wavenet-A".to_string())
            .with_language("en-US".to_string())
            .with_speaking_rate(1.5)
            .with_format("wav".to_string());

        assert_eq!(config.voice, "en-US-Wavenet-A");
        assert_eq!(config.language, Some("en-US".to_string()));
        assert_eq!(config.speaking_rate, Some(1.5));
        assert_eq!(config.audio_format, Some("wav".to_string()));
    }

    #[test]
    fn test_tts_speaking_rate_clamping() {
        let config = TTSConfig::new("Test".to_string()).with_speaking_rate(10.0);
        assert_eq!(config.speaking_rate, Some(4.0)); // Should clamp to max 4.0

        let config = TTSConfig::new("Test".to_string()).with_speaking_rate(0.1);
        assert_eq!(config.speaking_rate, Some(0.25)); // Should clamp to min 0.25
    }

    #[test]
    fn test_safety_settings() {
        let settings = SafetySetting::default_settings();
        assert_eq!(settings.len(), 4);
        assert!(settings
            .iter()
            .any(|s| s.category == "HARM_CATEGORY_HATE_SPEECH"));
    }

    #[test]
    fn test_image_count_clamping() {
        let config = ImageGenConfig::new("Test".to_string()).with_count(10);
        assert_eq!(config.number_of_images, Some(4)); // Should clamp to max 4

        let config = ImageGenConfig::new("Test".to_string()).with_count(0);
        assert_eq!(config.number_of_images, Some(1)); // Should clamp to min 1
    }
}
