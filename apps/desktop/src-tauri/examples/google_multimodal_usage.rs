// Example usage of Google Multimodal Generation API
// This file demonstrates how to use image, video, and audio generation

use agiworkforce::core::llm::providers::google_multimodal::{
    GeneratedAudio, GeneratedImage, GeneratedVideo, GoogleMultimodalProvider, ImageGenConfig,
    TTSConfig, VideoGenConfig,
};
use std::error::Error;

#[tokio::main]
async fn main() -> Result<(), Box<dyn Error>> {
    // Initialize the multimodal provider with your API key
    let api_key = std::env::var("GOOGLE_API_KEY").expect("GOOGLE_API_KEY must be set");
    let provider = GoogleMultimodalProvider::new(api_key)?;

    println!("=== Google Multimodal Generation Examples ===\n");

    // Example 1: Generate an image using Nano Banana
    println!("1. Generating image with Nano Banana...");
    let image_config =
        ImageGenConfig::new("A serene Japanese garden with cherry blossoms".to_string())
            .with_nano_banana()
            .with_aspect_ratio("16:9".to_string());

    match provider.generate_image(image_config).await {
        Ok(image) => {
            println!("   ✓ Image generated successfully!");
            println!("   - URI: {}", image.uri);
            println!("   - Model: {}", image.model);
            println!("   - Cost: ${:.4}", image.cost.unwrap_or(0.0));
        }
        Err(e) => println!("   ✗ Error: {}", e),
    }
    println!();

    // Example 2: Generate a higher quality image with Imagen 4
    println!("2. Generating high-quality image with Imagen 4...");
    let hq_image_config = ImageGenConfig::new(
        "A photorealistic portrait of a cyberpunk character in neon-lit city".to_string(),
    )
    .with_imagen_4()
    .with_aspect_ratio("1:1".to_string());

    match provider.generate_image(hq_image_config).await {
        Ok(image) => {
            println!("   ✓ High-quality image generated!");
            println!("   - URI: {}", image.uri);
            println!("   - Aspect ratio: {:?}", image.aspect_ratio);
            println!("   - Cost: ${:.4}", image.cost.unwrap_or(0.0));
        }
        Err(e) => println!("   ✗ Error: {}", e),
    }
    println!();

    // Example 3: Generate multiple images
    println!("3. Generating multiple images...");
    let batch_config =
        ImageGenConfig::new("Abstract geometric patterns in vibrant colors".to_string())
            .with_count(3)
            .with_aspect_ratio("4:3".to_string());

    match provider.generate_image(batch_config).await {
        Ok(image) => {
            println!("   ✓ Images generated!");
            println!("   - First image URI: {}", image.uri);
            println!("   - Total cost: ${:.4}", image.cost.unwrap_or(0.0));
        }
        Err(e) => println!("   ✗ Error: {}", e),
    }
    println!();

    // Example 4: Generate a short video with Veo 3.1
    println!("4. Generating 5-second video with Veo 3.1...");
    let video_config =
        VideoGenConfig::new("A butterfly landing on a flower in slow motion".to_string())
            .with_duration(5)
            .with_aspect_ratio("16:9".to_string());

    match provider.generate_video(video_config).await {
        Ok(video) => {
            println!("   ✓ Video generated successfully!");
            println!("   - URI: {}", video.uri);
            println!("   - Duration: {}s", video.duration);
            println!("   - MIME type: {}", video.mime_type);
            println!("   - Cost: ${:.4}", video.cost.unwrap_or(0.0));
        }
        Err(e) => println!("   ✗ Error: {}", e),
    }
    println!();

    // Example 5: Generate a longer video
    println!("5. Generating 15-second video...");
    let long_video_config =
        VideoGenConfig::new("A time-lapse of sunset over a mountain range".to_string())
            .with_duration(15);

    match provider.generate_video(long_video_config).await {
        Ok(video) => {
            println!("   ✓ Longer video generated!");
            println!("   - Duration: {}s", video.duration);
            println!("   - Cost: ${:.4}", video.cost.unwrap_or(0.0));
        }
        Err(e) => println!("   ✗ Error: {}", e),
    }
    println!();

    // Example 6: Generate speech with default settings
    println!("6. Generating speech with Gemini 2.5 Flash TTS...");
    let tts_config = TTSConfig::new(
        "Welcome to the world of artificial intelligence and multimodal generation.".to_string(),
    );

    match provider.generate_speech(tts_config).await {
        Ok(audio) => {
            println!("   ✓ Speech generated successfully!");
            println!("   - Audio size: {} bytes", audio.audio_data.len());
            println!("   - Format: {}", audio.format);
            println!("   - Voice: {}", audio.voice);
            println!("   - Cost: ${:.6}", audio.cost.unwrap_or(0.0));

            // Save to file
            if let Err(e) = std::fs::write("output_default.mp3", &audio.audio_data) {
                println!("   ✗ Failed to save audio: {}", e);
            } else {
                println!("   ✓ Audio saved to output_default.mp3");
            }
        }
        Err(e) => println!("   ✗ Error: {}", e),
    }
    println!();

    // Example 7: Generate speech with custom voice and rate
    println!("7. Generating speech with custom settings...");
    let custom_tts_config = TTSConfig::new(
        "This is an example of faster speech with a different voice configuration.".to_string(),
    )
    .with_voice("en-US-Wavenet-A".to_string())
    .with_language("en-US".to_string())
    .with_speaking_rate(1.5)
    .with_format("wav".to_string());

    match provider.generate_speech(custom_tts_config).await {
        Ok(audio) => {
            println!("   ✓ Custom speech generated!");
            println!("   - Format: {}", audio.format);
            println!("   - Speaking rate: 1.5x");
            println!("   - Cost: ${:.6}", audio.cost.unwrap_or(0.0));

            if let Err(e) = std::fs::write("output_custom.wav", &audio.audio_data) {
                println!("   ✗ Failed to save audio: {}", e);
            } else {
                println!("   ✓ Audio saved to output_custom.wav");
            }
        }
        Err(e) => println!("   ✗ Error: {}", e),
    }
    println!();

    // Example 8: Generate slow speech for clarity
    println!("8. Generating slow, clear speech...");
    let slow_tts_config = TTSConfig::new(
        "Speaking slowly and clearly helps with comprehension and accessibility.".to_string(),
    )
    .with_speaking_rate(0.75);

    match provider.generate_speech(slow_tts_config).await {
        Ok(audio) => {
            println!("   ✓ Slow speech generated!");
            println!("   - Speaking rate: 0.75x");
            if let Some(duration) = audio.duration_seconds {
                println!("   - Duration: {:.2}s", duration);
            }
            println!("   - Cost: ${:.6}", audio.cost.unwrap_or(0.0));
        }
        Err(e) => println!("   ✗ Error: {}", e),
    }
    println!();

    // Example 9: Cost estimation for different operations
    println!("9. Cost Estimation Examples:");
    println!("   - Single image: $0.04");
    println!("   - 4 images: $0.16");
    println!("   - 2s video: $0.13");
    println!("   - 10s video: ~$0.72");
    println!("   - 20s video: $1.30");
    println!("   - 100 characters TTS: $0.001");
    println!("   - 1,000 characters TTS: $0.01");
    println!("   - 10,000 characters TTS: $0.10");
    println!();

    println!("=== Examples Complete ===");

    Ok(())
}

// Helper function to demonstrate error handling
async fn generate_with_error_handling(
    provider: &GoogleMultimodalProvider,
) -> Result<(), Box<dyn Error>> {
    // Example with comprehensive error handling
    let config = ImageGenConfig::new("A test image".to_string());

    match provider.generate_image(config).await {
        Ok(image) => {
            println!("Success! Image URI: {}", image.uri);
            // Process the generated image
            Ok(())
        }
        Err(e) => {
            // Handle different types of errors
            let error_message = e.to_string();

            if error_message.contains("rate limit") {
                println!("Rate limit exceeded. Please wait and try again.");
            } else if error_message.contains("safety") {
                println!("Content filtered due to safety policies.");
            } else if error_message.contains("authentication") {
                println!("Invalid API key. Please check your credentials.");
            } else {
                println!("Generation failed: {}", error_message);
            }

            Err(e)
        }
    }
}
