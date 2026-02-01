/// Example usage patterns for GoogleAdvancedProvider
///
/// These examples show how to use the advanced features in real-world scenarios.
/// They are documentation examples and can be run with `cargo test --doc`.

#![allow(dead_code, unused_variables)]

use super::google_advanced::{
    CachedContent, ComputerUseConfig, GoogleAdvancedProvider, HarmBlockThreshold, HarmCategory,
    MediaResolution, SafetySetting, SafetySettings,
};
use crate::core::llm::{ChatMessage, ContentPart, ImageFormat, ImageInput, LLMRequest};

/// Example 1: Basic setup with default settings
pub async fn example_basic_setup(
    api_key: String,
) -> Result<GoogleAdvancedProvider, Box<dyn std::error::Error + Send + Sync>> {
    // Create provider with default settings
    // - Implicit caching enabled
    // - Medium media resolution
    // - Safety OFF (Gemini 2.5+ default)
    let provider = GoogleAdvancedProvider::new(api_key)?;
    Ok(provider)
}

/// Example 2: Computer Use for browser automation
pub async fn example_computer_use(
    api_key: String,
) -> Result<(), Box<dyn std::error::Error + Send + Sync>> {
    // Configure for 4K display
    let computer_config = ComputerUseConfig {
        display_width: 3840,
        display_height: 2160,
        enable_screenshots: true,
        enable_actions: true,
    };

    let provider = GoogleAdvancedProvider::new(api_key)?
        .with_computer_use(computer_config);

    // Use with a browser automation request
    let messages = vec![ChatMessage {
        role: "user".to_string(),
        content: "Navigate to example.com and click the login button".to_string(),
        tool_calls: None,
        tool_call_id: None,
        multimodal_content: None,
    }];

    let request = LLMRequest::new(messages, "gemini-2.5-computer-use".to_string());
    let response = provider.send_message(&request).await?;

    println!("Computer action response: {}", response.content);
    Ok(())
}

/// Example 3: High-resolution image analysis
pub async fn example_high_resolution_images(
    api_key: String,
) -> Result<(), Box<dyn std::error::Error + Send + Sync>> {
    // Configure for detailed image analysis
    let provider = GoogleAdvancedProvider::new(api_key)?
        .with_media_resolution(MediaResolution::MediaResolutionHigh);

    // Analyze a medical image (requires high detail)
    let image_bytes = vec![0u8; 1024]; // Placeholder
    let image_content = ContentPart::Image {
        image: ImageInput {
            data: image_bytes,
            format: ImageFormat::Png,
            detail: crate::core::llm::ImageDetail::High,
        },
    };

    let messages = vec![ChatMessage {
        role: "user".to_string(),
        content: "Analyze this X-ray for abnormalities".to_string(),
        tool_calls: None,
        tool_call_id: None,
        multimodal_content: Some(vec![image_content]),
    }];

    let request = LLMRequest::new(messages, "gemini-3-pro".to_string());
    let response = provider.send_message(&request).await?;

    // High resolution uses 1120 tokens per image
    println!("Analysis: {}", response.content);
    println!("Tokens used: {:?}", response.tokens);
    Ok(())
}

/// Example 4: Explicit caching for cost optimization
pub async fn example_explicit_caching(
    api_key: String,
) -> Result<(), Box<dyn std::error::Error + Send + Sync>> {
    let provider = GoogleAdvancedProvider::new(api_key)?.with_explicit_caching(true);

    // Create a cache for a long document
    let document_content = vec![
        // Simulate conversation history or long document
    ];

    let cache = provider
        .create_cache(
            "medical-knowledge-base".to_string(),
            "gemini-2.5-pro".to_string(),
            Some("You are a medical expert AI.".to_string()),
            document_content,
            "3600s".to_string(), // 1 hour TTL
        )
        .await?;

    println!("Created cache: {:?}", cache.name);

    // Use the cache in subsequent requests
    let messages = vec![ChatMessage {
        role: "user".to_string(),
        content: "What are the symptoms of diabetes?".to_string(),
        tool_calls: None,
        tool_call_id: None,
        multimodal_content: None,
    }];

    let mut request = LLMRequest::new(messages, "gemini-2.5-pro".to_string());
    request.conversation_id = cache.name.clone(); // Reference the cache

    let response = provider.send_message(&request).await?;

    // Check cache hit
    if let Some(cached_tokens) = response.cache_read_input_tokens {
        println!(
            "Cache hit! Saved {} tokens at 75% discount",
            cached_tokens
        );
    }

    // List all caches
    let caches = provider.list_caches().await?;
    println!("Active caches: {}", caches.len());

    // Update cache TTL to extend lifetime
    if let Some(cache_name) = cache.name {
        provider
            .update_cache(&cache_name, "7200s".to_string())
            .await?;
        println!("Extended cache to 2 hours");

        // Delete cache when done
        provider.delete_cache(&cache_name).await?;
        println!("Cache deleted");
    }

    Ok(())
}

/// Example 5: Custom safety settings for production
pub async fn example_safety_settings(
    api_key: String,
) -> Result<(), Box<dyn std::error::Error + Send + Sync>> {
    // Configure strict safety for a customer-facing chatbot
    let safety = SafetySettings {
        settings: vec![
            SafetySetting {
                category: HarmCategory::HarmCategoryHarassment,
                threshold: HarmBlockThreshold::BlockMediumAndAbove,
            },
            SafetySetting {
                category: HarmCategory::HarmCategoryHateSpeech,
                threshold: HarmBlockThreshold::BlockMediumAndAbove,
            },
            SafetySetting {
                category: HarmCategory::HarmCategorySexuallyExplicit,
                threshold: HarmBlockThreshold::BlockMediumAndAbove,
            },
            SafetySetting {
                category: HarmCategory::HarmCategoryDangerous,
                threshold: HarmBlockThreshold::BlockLowAndAbove, // Strictest for dangerous content
            },
        ],
    };

    let provider = GoogleAdvancedProvider::new(api_key)?.with_safety_settings(safety);

    let messages = vec![ChatMessage {
        role: "user".to_string(),
        content: "Tell me about safety features".to_string(),
        tool_calls: None,
        tool_call_id: None,
        multimodal_content: None,
    }];

    let request = LLMRequest::new(messages, "gemini-2.5-pro".to_string());

    match provider.send_message(&request).await {
        Ok(response) => {
            println!("Safe response: {}", response.content);
        }
        Err(e) => {
            // Handle blocked content
            if e.to_string().contains("Content blocked") {
                println!("Request was blocked by safety filters");
            }
        }
    }

    Ok(())
}

/// Example 6: Combining all features
pub async fn example_full_featured(
    api_key: String,
) -> Result<(), Box<dyn std::error::Error + Send + Sync>> {
    // Production-ready configuration with all advanced features
    let provider = GoogleAdvancedProvider::new(api_key)?
        .with_computer_use(ComputerUseConfig::default())
        .with_media_resolution(MediaResolution::MediaResolutionMedium)
        .with_safety_settings(SafetySettings::default())
        .with_explicit_caching(true);

    // Multi-modal request with caching
    let messages = vec![ChatMessage {
        role: "user".to_string(),
        content: "Analyze this screenshot and suggest improvements".to_string(),
        tool_calls: None,
        tool_call_id: None,
        multimodal_content: Some(vec![ContentPart::Image {
            image: ImageInput {
                data: vec![0u8; 2048], // Screenshot data
                format: ImageFormat::Png,
                detail: crate::core::llm::ImageDetail::Auto,
            },
        }]),
    }];

    let mut request = LLMRequest::new(messages, "gemini-2.5-pro".to_string());
    request.max_tokens = Some(4096);

    let response = provider.send_message(&request).await?;

    // Inspect response metadata
    println!("Response: {}", response.content);
    println!("Total tokens: {:?}", response.tokens);
    println!("Cached tokens: {:?}", response.cache_read_input_tokens);
    println!("Cost: ${:.4}", response.cost.unwrap_or(0.0));

    Ok(())
}

/// Example 7: Cost optimization with variable resolution
pub async fn example_cost_optimization(
    api_key: String,
) -> Result<(), Box<dyn std::error::Error + Send + Sync>> {
    // Strategy: Use low resolution for thumbnails, high for detailed analysis

    // Phase 1: Quick classification with LOW resolution (280 tokens/image)
    let classifier = GoogleAdvancedProvider::new(api_key.clone())?
        .with_media_resolution(MediaResolution::MediaResolutionLow);

    let quick_scan_messages = vec![
        // 10 images at LOW resolution = 2,800 tokens
    ];

    // Phase 2: Detailed analysis only on flagged images
    let analyzer = GoogleAdvancedProvider::new(api_key)?
        .with_media_resolution(MediaResolution::MediaResolutionHigh);

    let detailed_analysis_messages = vec![
        // 2 flagged images at HIGH resolution = 2,240 tokens
    ];

    // Total: 5,040 tokens vs 11,200 tokens (50% savings)
    println!("Cost optimized workflow saves ~50% on tokens");

    Ok(())
}

/// Example 8: Streaming with advanced features
pub async fn example_streaming(
    api_key: String,
) -> Result<(), Box<dyn std::error::Error + Send + Sync>> {
    use futures_util::StreamExt;

    let provider = GoogleAdvancedProvider::new(api_key)?
        .with_media_resolution(MediaResolution::MediaResolutionMedium)
        .with_safety_settings(SafetySettings::default());

    let messages = vec![ChatMessage {
        role: "user".to_string(),
        content: "Write a long essay about AI safety".to_string(),
        tool_calls: None,
        tool_call_id: None,
        multimodal_content: None,
    }];

    let mut request = LLMRequest::new(messages, "gemini-2.5-pro".to_string());
    request.stream = true;

    let mut stream = provider.send_message_streaming(&request).await?;

    // Process chunks as they arrive
    while let Some(chunk) = stream.next().await {
        match chunk {
            Ok(chunk) => {
                print!("{}", chunk.content); // Stream to UI
                if chunk.done {
                    if let Some(usage) = chunk.usage {
                        println!(
                            "\n\nTotal tokens: {:?}",
                            usage.total_tokens
                        );
                        println!(
                            "Cached tokens: {:?}",
                            usage.cached_content_token_count
                        );
                    }
                }
            }
            Err(e) => {
                eprintln!("Stream error: {}", e);
                break;
            }
        }
    }

    Ok(())
}

/// Example 9: Cache management for multi-user system
pub async fn example_cache_management(
    api_key: String,
) -> Result<(), Box<dyn std::error::Error + Send + Sync>> {
    let provider = GoogleAdvancedProvider::new(api_key)?.with_explicit_caching(true);

    // Create user-specific caches
    let user_caches = vec![
        ("user1", "User 1's conversation history"),
        ("user2", "User 2's conversation history"),
        ("user3", "User 3's conversation history"),
    ];

    for (user_id, _history) in &user_caches {
        let cache = provider
            .create_cache(
                format!("cache-{}", user_id),
                "gemini-2.5-pro".to_string(),
                Some("You are a helpful assistant.".to_string()),
                vec![],
                "1800s".to_string(), // 30 minutes
            )
            .await?;

        println!("Created cache for {}: {:?}", user_id, cache.name);
    }

    // List all active caches
    let caches = provider.list_caches().await?;
    println!("Total active caches: {}", caches.len());

    // Monitor and clean up expired caches
    for cache in caches {
        if let Some(ref name) = cache.name {
            if let Some(ref expire_time) = cache.expire_time {
                println!("Cache {} expires at {}", name, expire_time);

                // Optionally delete if needed
                // provider.delete_cache(name).await?;
            }
        }
    }

    Ok(())
}

/// Example 10: Thinking levels with Gemini 3
pub async fn example_thinking_levels(
    api_key: String,
) -> Result<(), Box<dyn std::error::Error + Send + Sync>> {
    let provider = GoogleAdvancedProvider::new(api_key)?;

    let messages = vec![ChatMessage {
        role: "user".to_string(),
        content: "Solve this complex mathematical proof...".to_string(),
        tool_calls: None,
        tool_call_id: None,
        multimodal_content: None,
    }];

    let mut request = LLMRequest::new(messages, "gemini-3-deep-think".to_string());

    // Enable extreme thinking level for complex reasoning
    request.thinking = Some(crate::core::llm::ThinkingParameter::Level {
        level: "extreme".to_string(), // 16K thinking tokens
        max_thinking_tokens: None,
    });

    let response = provider.send_message(&request).await?;

    println!("Response: {}", response.content);
    if let Some(thinking_tokens) = response.thinking_tokens {
        println!("Thinking tokens used: {}", thinking_tokens);
    }
    if let Some(reasoning) = response.reasoning_content {
        println!("Reasoning process: {}", reasoning);
    }

    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[tokio::test]
    #[ignore] // Requires API key
    async fn test_examples_compile() {
        // These examples are primarily for documentation
        // They require a valid API key to run
        let api_key = std::env::var("GOOGLE_API_KEY").unwrap_or_default();
        if api_key.is_empty() {
            println!("Skipping integration tests (no API key)");
            return;
        }

        // Verify examples compile
        let _ = example_basic_setup(api_key.clone()).await;
        // Other examples would require more complex setup
    }
}
