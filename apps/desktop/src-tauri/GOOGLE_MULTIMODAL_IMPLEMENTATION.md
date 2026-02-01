# Google Multimodal Generation Implementation

## Overview

Implemented comprehensive multimodal generation capabilities for the Google provider using the latest model versions:
- **Image Generation**: Nano Banana, Imagen 4
- **Video Generation**: Veo 3.1
- **Text-to-Speech**: Gemini 2.5 Flash TTS

## File Structure

### New Files Created
- `src/core/llm/providers/google_multimodal.rs` - Complete multimodal generation implementation

### Modified Files
- `src/core/llm/providers/mod.rs` - Added module exports
- `src/core/llm/providers/google.rs` - Integrated multimodal provider

## Features Implemented

### 1. Image Generation (Nano Banana, Imagen 4)

**Configuration Options:**
- Model selection: `nano-banana` (faster) or `imagen-4` (higher quality)
- Aspect ratios: 1:1, 16:9, 9:16, 4:3, 3:4
- Safety settings for content filtering
- Multiple images (1-4 per request)

**Pricing:**
- $0.04 per image (both models)

**Example Usage:**
```rust
use crate::core::llm::providers::google_multimodal::{ImageGenConfig, GoogleMultimodalProvider};

let provider = GoogleMultimodalProvider::new(api_key)?;

// Simple usage
let config = ImageGenConfig::new("A beautiful sunset over mountains".to_string())
    .with_imagen_4()
    .with_aspect_ratio("16:9".to_string())
    .with_count(2);

let result = provider.generate_image(config).await?;
println!("Image URI: {}", result.uri);
println!("Cost: ${:.4}", result.cost.unwrap_or(0.0));
```

**Response Fields:**
```rust
pub struct GeneratedImage {
    pub uri: String,              // Google Cloud Storage URL
    pub mime_type: String,        // e.g., "image/png"
    pub prompt: String,           // Original prompt
    pub model: String,            // Model used
    pub aspect_ratio: Option<String>,
    pub cost: Option<f64>,        // Cost in USD
}
```

### 2. Video Generation (Veo 3.1)

**Configuration Options:**
- Duration: 2-20 seconds (automatically clamped)
- Aspect ratios: 16:9, 9:16, 1:1
- Safety settings for content filtering

**Pricing:**
- $0.13 for 2 seconds
- $1.30 for 20 seconds
- Linear interpolation for intermediate durations

**Example Usage:**
```rust
use crate::core::llm::providers::google_multimodal::{VideoGenConfig, GoogleMultimodalProvider};

let provider = GoogleMultimodalProvider::new(api_key)?;

// Generate 10-second video
let config = VideoGenConfig::new("A cat playing piano".to_string())
    .with_duration(10)
    .with_aspect_ratio("16:9".to_string());

let result = provider.generate_video(config).await?;
println!("Video URI: {}", result.uri);
println!("Duration: {}s", result.duration);
println!("Cost: ${:.4}", result.cost.unwrap_or(0.0));
```

**Response Fields:**
```rust
pub struct GeneratedVideo {
    pub uri: String,              // Google Cloud Storage URL
    pub duration: u32,            // Duration in seconds
    pub prompt: String,           // Original prompt
    pub model: String,            // Model used ("veo-3.1")
    pub aspect_ratio: Option<String>,
    pub mime_type: String,        // e.g., "video/mp4"
    pub cost: Option<f64>,        // Cost in USD
}
```

### 3. Text-to-Speech (Gemini 2.5 Flash TTS)

**Configuration Options:**
- Voice selection (provider-specific voice IDs)
- Language codes (e.g., "en-US", "es-ES", "ja-JP")
- Speaking rate: 0.25 to 4.0 (default 1.0)
- Audio formats: mp3, wav, opus

**Pricing:**
- $10 per 1 million characters

**Example Usage:**
```rust
use crate::core::llm::providers::google_multimodal::{TTSConfig, GoogleMultimodalProvider};

let provider = GoogleMultimodalProvider::new(api_key)?;

// Generate speech
let config = TTSConfig::new("Hello, world! This is a test.".to_string())
    .with_voice("en-US-Wavenet-A".to_string())
    .with_language("en-US".to_string())
    .with_speaking_rate(1.2)
    .with_format("mp3".to_string());

let result = provider.generate_speech(config).await?;
println!("Audio size: {} bytes", result.audio_data.len());
println!("Format: {}", result.format);
println!("Cost: ${:.6}", result.cost.unwrap_or(0.0));

// Save audio to file
std::fs::write("output.mp3", &result.audio_data)?;
```

**Response Fields:**
```rust
pub struct GeneratedAudio {
    pub audio_data: Vec<u8>,      // Raw audio bytes
    pub format: String,            // e.g., "mp3"
    pub voice: String,             // Voice used
    pub language: Option<String>,  // Language code
    pub text: String,              // Original text
    pub duration_seconds: Option<f64>,
    pub cost: Option<f64>,         // Cost in USD
}
```

## Integration with GoogleProvider

The main `GoogleProvider` struct now includes multimodal capabilities:

```rust
pub struct GoogleProvider {
    api_key: String,
    client: Client,
    base_url: String,
    multimodal: Option<GoogleMultimodalProvider>,
}

impl GoogleProvider {
    // Access multimodal provider
    pub fn multimodal(&self) -> Option<&GoogleMultimodalProvider>;

    // Convenience methods
    pub async fn generate_image(&self, config: ImageGenConfig) -> Result<GeneratedImage>;
    pub async fn generate_video(&self, config: VideoGenConfig) -> Result<GeneratedVideo>;
    pub async fn generate_speech(&self, config: TTSConfig) -> Result<GeneratedAudio>;
}
```

**Usage Example:**
```rust
use crate::core::llm::providers::google::GoogleProvider;
use crate::core::llm::providers::google_multimodal::ImageGenConfig;

let google_provider = GoogleProvider::new(api_key)?;

// Generate image through main provider
let image_config = ImageGenConfig::new("A futuristic city".to_string());
let image = google_provider.generate_image(image_config).await?;
```

## Safety Features

### Content Filtering

All generation methods support safety settings to filter harmful content:

```rust
use crate::core::llm::providers::google_multimodal::SafetySetting;

// Default safety settings (recommended)
let safety_settings = SafetySetting::default_settings();

// Custom safety settings
let custom_settings = vec![
    SafetySetting::new(
        "HARM_CATEGORY_HATE_SPEECH".to_string(),
        "BLOCK_MEDIUM_AND_ABOVE".to_string(),
    ),
    SafetySetting::new(
        "HARM_CATEGORY_DANGEROUS_CONTENT".to_string(),
        "BLOCK_MEDIUM_AND_ABOVE".to_string(),
    ),
];
```

### Input Validation

- **Image count**: Automatically clamped to 1-4
- **Video duration**: Automatically clamped to 2-20 seconds
- **Speaking rate**: Automatically clamped to 0.25-4.0
- **Base64 encoding**: Automatic encoding for binary data

## Error Handling

All methods return comprehensive error information:

```rust
match provider.generate_image(config).await {
    Ok(image) => println!("Success: {}", image.uri),
    Err(e) => {
        // User-friendly error messages
        eprintln!("Generation failed: {}", e);
        // Errors include:
        // - API rate limits
        // - Invalid parameters
        // - Network issues
        // - Content policy violations
    }
}
```

## Testing

The implementation includes comprehensive unit tests:

```rust
#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_image_config_builder() {
        let config = ImageGenConfig::new("Test".to_string())
            .with_imagen_4()
            .with_aspect_ratio("16:9".to_string())
            .with_count(2);

        assert_eq!(config.model, "imagen-4");
        assert_eq!(config.aspect_ratio, Some("16:9".to_string()));
        assert_eq!(config.number_of_images, Some(2));
    }

    #[test]
    fn test_video_duration_clamping() {
        let config = VideoGenConfig::new("Test".to_string()).with_duration(50);
        assert_eq!(config.duration, 20); // Clamped to max

        let config = VideoGenConfig::new("Test".to_string()).with_duration(1);
        assert_eq!(config.duration, 2); // Clamped to min
    }

    #[test]
    fn test_tts_speaking_rate_clamping() {
        let config = TTSConfig::new("Test".to_string()).with_speaking_rate(10.0);
        assert_eq!(config.speaking_rate, Some(4.0)); // Clamped to max
    }
}
```

## API Endpoints

The implementation uses Google's Generative Language API:

- **Image Generation**: `POST /v1beta/models/{model}:generateImage`
- **Video Generation**: `POST /v1beta/models/{model}:generateVideo`
- **Text-to-Speech**: `POST /v1beta/models/gemini-2.5-flash-tts:generateSpeech`

Base URL: `https://generativelanguage.googleapis.com/v1beta`

Can be customized via environment variable:
```bash
export GOOGLE_MULTIMODAL_API_BASE="https://custom-endpoint.example.com/v1beta"
```

## Performance Considerations

### Timeouts
- Connect timeout: 30 seconds
- Request timeout: 600 seconds (10 minutes for video generation)

### Recommended Usage
- **Images**: Use `nano-banana` for faster generation, `imagen-4` for higher quality
- **Videos**: Start with shorter durations (2-5s) for faster results
- **Audio**: MP3 format provides best size/quality ratio

## Cost Optimization

### Image Generation
- Both models cost $0.04 per image
- Generate multiple images in one request when possible (up to 4)
- Use appropriate aspect ratio to avoid regeneration

### Video Generation
- Cost scales linearly with duration
- 2s video = $0.13
- 10s video = $0.715 (approximately)
- 20s video = $1.30
- Plan durations carefully to minimize costs

### Text-to-Speech
- $10 per 1M characters
- 100 characters = $0.001
- 1,000 characters = $0.01
- 10,000 characters = $0.10

## Future Enhancements

Potential additions for future versions:
1. Batch generation support
2. Streaming TTS output
3. Video editing capabilities
4. Image-to-image transformations
5. Custom voice training
6. Advanced safety configuration
7. Progress callbacks for long-running operations

## Module Exports

All types and functions are properly exported:

```rust
// From google_multimodal module
pub use crate::core::llm::providers::google_multimodal::{
    GeneratedAudio,
    GeneratedImage,
    GeneratedVideo,
    GoogleMultimodalProvider,
    ImageGenConfig,
    SafetySetting,
    TTSConfig,
    VideoGenConfig,
};

// Also re-exported from google module
pub use crate::core::llm::providers::google::{
    GeneratedAudio,
    GeneratedImage,
    GeneratedVideo,
    GoogleMultimodalProvider,
    ImageGenConfig,
    SafetySetting,
    TTSConfig,
    VideoGenConfig,
};
```

## Conclusion

This implementation provides a complete, type-safe, and user-friendly interface for Google's multimodal generation capabilities. It follows Rust best practices, includes comprehensive error handling, and provides accurate cost tracking for all operations.

The builder pattern makes configuration intuitive, automatic validation prevents invalid requests, and the integration with the main GoogleProvider allows seamless usage alongside existing LLM functionality.
