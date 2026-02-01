//! Example usage patterns for Google Live API
//!
//! This module demonstrates how to use the Live API for various use cases

#![allow(dead_code)]

use super::google_live_api::*;
use serde_json::json;

/// Example 1: Basic text-only conversation
pub async fn example_text_conversation() -> Result<(), Box<dyn std::error::Error + Send + Sync>> {
    // Create provider with API key
    let provider = GoogleLiveApiProvider::new("your-api-key".to_string());

    // Configure text-only session
    let config = LiveSessionConfig {
        model: DEFAULT_LIVE_MODEL.to_string(),
        modalities: vec![Modality::Text],
        speech_config: None,
        system_instruction: Some("You are a helpful assistant.".to_string()),
        generation_config: Some(GenerationConfig {
            temperature: Some(0.7),
            max_output_tokens: Some(2048),
            ..Default::default()
        }),
        ..Default::default()
    };

    // Connect to Live API
    provider.connect(config).await?;

    // Get event receiver
    let mut event_rx = provider.get_event_receiver().await;

    // Send text message
    provider.send_text("Hello, how are you?".to_string(), true).await?;

    // Process events
    while let Some(event) = event_rx.recv().await {
        match event {
            LiveApiEvent::SetupComplete => {
                println!("Session ready");
            }
            LiveApiEvent::TextContent { text, turn_complete } => {
                println!("Response: {}", text);
                if turn_complete {
                    break;
                }
            }
            LiveApiEvent::Error { code, message } => {
                eprintln!("Error {}: {}", code, message);
                break;
            }
            _ => {}
        }
    }

    // Disconnect gracefully
    provider.disconnect(Some("Conversation complete".to_string())).await?;

    Ok(())
}

/// Example 2: Audio conversation with transcription
pub async fn example_audio_conversation() -> Result<(), Box<dyn std::error::Error + Send + Sync>> {
    let provider = GoogleLiveApiProvider::new("your-api-key".to_string());

    // Configure audio session with transcription
    let config = LiveSessionConfig {
        model: DEFAULT_LIVE_MODEL.to_string(),
        modalities: vec![Modality::Text, Modality::Audio],
        speech_config: Some(SpeechConfig {
            voice: Some(Voice::Puck),
            language_code: Some(LanguageCode::English),
            vad_mode: Some(VadMode::VadAutomatic),
            enable_input_transcription: Some(true),
            enable_output_transcription: Some(true),
            input_sample_rate: Some(16000),
            output_sample_rate: Some(24000),
        }),
        system_instruction: Some("You are a friendly voice assistant.".to_string()),
        ..Default::default()
    };

    provider.connect(config).await?;

    let mut event_rx = provider.get_event_receiver().await;

    // Send audio chunk (16-bit PCM, 16kHz)
    let audio_data = vec![0u8; 16000 * 2]; // 1 second of silence (example)
    provider.send_audio(audio_data).await?;

    // Process events
    while let Some(event) = event_rx.recv().await {
        match event {
            LiveApiEvent::AudioChunk { data, transcript } => {
                println!("Received audio chunk: {} bytes", data.len());
                if let Some(text) = transcript {
                    println!("Transcript: {}", text);
                }
            }
            LiveApiEvent::InputTranscript { text } => {
                println!("User said: {}", text);
            }
            LiveApiEvent::OutputTranscript { text } => {
                println!("Assistant said: {}", text);
            }
            LiveApiEvent::GenerationComplete => {
                println!("Response complete");
                break;
            }
            _ => {}
        }
    }

    provider.disconnect(None).await?;

    Ok(())
}

/// Example 3: Function calling with Live API
pub async fn example_function_calling() -> Result<(), Box<dyn std::error::Error + Send + Sync>> {
    let provider = GoogleLiveApiProvider::new("your-api-key".to_string());

    // Define tools
    let tools = vec![
        json!({
            "function_declarations": [{
                "name": "get_weather",
                "description": "Get the current weather for a location",
                "parameters": {
                    "type": "object",
                    "properties": {
                        "location": {
                            "type": "string",
                            "description": "The city and state, e.g. San Francisco, CA"
                        },
                        "unit": {
                            "type": "string",
                            "enum": ["celsius", "fahrenheit"],
                            "description": "Temperature unit"
                        }
                    },
                    "required": ["location"]
                }
            }]
        })
    ];

    let config = LiveSessionConfig {
        model: DEFAULT_LIVE_MODEL.to_string(),
        modalities: vec![Modality::Text],
        speech_config: None,
        tools: Some(tools),
        tool_config: Some(ToolConfig {
            scheduling: Some(FunctionCallingScheduling::WhenIdle),
            behavior: Some(FunctionCallingBehavior::NonBlocking),
            enable_google_search: Some(false),
        }),
        system_instruction: Some("You are a weather assistant.".to_string()),
        ..Default::default()
    };

    provider.connect(config).await?;

    let mut event_rx = provider.get_event_receiver().await;

    // Send query
    provider.send_text("What's the weather in San Francisco?".to_string(), true).await?;

    // Process events
    while let Some(event) = event_rx.recv().await {
        match event {
            LiveApiEvent::FunctionCall { id, name, arguments } => {
                println!("Function call: {} ({})", name, id);
                println!("Arguments: {}", arguments);

                // Execute function (mock)
                let result = json!({
                    "temperature": 72,
                    "conditions": "sunny",
                    "unit": "fahrenheit"
                });

                // Send response
                provider.send_function_response(id, name, result).await?;
            }
            LiveApiEvent::TextContent { text, turn_complete } => {
                println!("Response: {}", text);
                if turn_complete {
                    break;
                }
            }
            _ => {}
        }
    }

    provider.disconnect(None).await?;

    Ok(())
}

/// Example 4: Session resumption with token
pub async fn example_session_resumption() -> Result<(), Box<dyn std::error::Error + Send + Sync>> {
    let provider = GoogleLiveApiProvider::new("your-api-key".to_string());

    // Initial session
    let config = LiveSessionConfig::default();
    provider.connect(config).await?;

    let mut event_rx = provider.get_event_receiver().await;

    // Request resumption token
    provider.request_resumption_token().await?;

    let mut resumption_token: Option<String> = None;

    // Wait for token
    while let Some(event) = event_rx.recv().await {
        if let LiveApiEvent::ResumptionToken { token, expires_at } = event {
            println!("Resumption token received (expires: {:?})", expires_at);
            resumption_token = Some(token);
            break;
        }
    }

    // Disconnect
    provider.disconnect(Some("Getting resumption token".to_string())).await?;

    // Resume session later
    if let Some(token) = resumption_token {
        let provider2 = GoogleLiveApiProvider::new("your-api-key".to_string());

        // Connect and resume
        let config2 = LiveSessionConfig::default();
        provider2.connect(config2).await?;
        provider2.resume_session(token).await?;

        println!("Session resumed successfully");

        provider2.disconnect(None).await?;
    }

    Ok(())
}

/// Example 5: Google Search grounding
pub async fn example_google_search_grounding() -> Result<(), Box<dyn std::error::Error + Send + Sync>> {
    let provider = GoogleLiveApiProvider::new("your-api-key".to_string());

    let config = LiveSessionConfig {
        model: DEFAULT_LIVE_MODEL.to_string(),
        modalities: vec![Modality::Text],
        speech_config: None,
        tool_config: Some(ToolConfig {
            scheduling: Some(FunctionCallingScheduling::WhenIdle),
            behavior: Some(FunctionCallingBehavior::NonBlocking),
            enable_google_search: Some(true), // Enable Google Search grounding
        }),
        system_instruction: Some("You are a research assistant. Use Google Search for current information.".to_string()),
        ..Default::default()
    };

    provider.connect(config).await?;

    let mut event_rx = provider.get_event_receiver().await;

    // Ask question requiring real-time data
    provider.send_text("What are the latest AI research breakthroughs?".to_string(), true).await?;

    while let Some(event) = event_rx.recv().await {
        match event {
            LiveApiEvent::TextContent { text, turn_complete } => {
                println!("Response: {}", text);
                if turn_complete {
                    break;
                }
            }
            _ => {}
        }
    }

    provider.disconnect(None).await?;

    Ok(())
}

/// Example 6: Context window compression
pub async fn example_context_compression() -> Result<(), Box<dyn std::error::Error + Send + Sync>> {
    let provider = GoogleLiveApiProvider::new("your-api-key".to_string());

    let config = LiveSessionConfig {
        model: DEFAULT_LIVE_MODEL.to_string(),
        modalities: vec![Modality::Text],
        speech_config: None,
        compression_mode: Some(CompressionMode::TokenTrigger),
        compression_trigger_tokens: Some(16000), // Compress when reaching 16K tokens
        system_instruction: Some("You are a helpful assistant for long conversations.".to_string()),
        ..Default::default()
    };

    provider.connect(config).await?;

    let mut event_rx = provider.get_event_receiver().await;

    // Simulate long conversation
    for i in 1..=10 {
        provider.send_text(
            format!("This is message {} in a long conversation. Please respond briefly.", i),
            true
        ).await?;

        // Wait for response
        while let Some(event) = event_rx.recv().await {
            if let LiveApiEvent::TextContent { text, turn_complete } = event {
                println!("Turn {}: {}", i, text);
                if turn_complete {
                    break;
                }
            }
        }
    }

    provider.disconnect(None).await?;

    Ok(())
}

/// Example 7: Multimodal audio + video session
pub async fn example_multimodal_session() -> Result<(), Box<dyn std::error::Error + Send + Sync>> {
    let provider = GoogleLiveApiProvider::new("your-api-key".to_string());

    let config = LiveSessionConfig {
        model: DEFAULT_LIVE_MODEL.to_string(),
        modalities: vec![Modality::Text, Modality::Audio, Modality::Video],
        speech_config: Some(SpeechConfig {
            voice: Some(Voice::Kore),
            language_code: Some(LanguageCode::English),
            vad_mode: Some(VadMode::VadAutomatic),
            enable_input_transcription: Some(true),
            enable_output_transcription: Some(true),
            input_sample_rate: Some(16000),
            output_sample_rate: Some(24000),
        }),
        system_instruction: Some("You are a multimodal assistant that can see and hear.".to_string()),
        ..Default::default()
    };

    provider.connect(config).await?;

    let mut event_rx = provider.get_event_receiver().await;

    // Note: Video streams would be sent via send_video (not shown)
    // Audio + text can be combined
    provider.send_text("What do you see in the video?".to_string(), false).await?;

    let audio_data = vec![0u8; 16000 * 2]; // Audio chunk
    provider.send_audio(audio_data).await?;

    while let Some(event) = event_rx.recv().await {
        match event {
            LiveApiEvent::TextContent { text, turn_complete } => {
                println!("Response: {}", text);
                if turn_complete {
                    break;
                }
            }
            LiveApiEvent::AudioChunk { data, transcript } => {
                println!("Audio response: {} bytes", data.len());
                if let Some(text) = transcript {
                    println!("Transcript: {}", text);
                }
            }
            _ => {}
        }
    }

    provider.disconnect(None).await?;

    Ok(())
}

/// Example 8: Different voices and languages
pub async fn example_voice_languages() -> Result<(), Box<dyn std::error::Error + Send + Sync>> {
    let voices = vec![
        (Voice::Puck, LanguageCode::English, "friendly and conversational"),
        (Voice::Charon, LanguageCode::English, "deep and authoritative"),
        (Voice::Kore, LanguageCode::Spanish, "warm and empathetic (Spanish)"),
        (Voice::Fenrir, LanguageCode::French, "energetic and enthusiastic (French)"),
        (Voice::Aoede, LanguageCode::German, "calm and soothing (German)"),
    ];

    for (voice, lang, description) in voices {
        println!("Testing voice: {:?} ({}) - {}", voice, lang.as_ref(), description);

        let provider = GoogleLiveApiProvider::new("your-api-key".to_string());

        let config = LiveSessionConfig {
            model: DEFAULT_LIVE_MODEL.to_string(),
            modalities: vec![Modality::Text, Modality::Audio],
            speech_config: Some(SpeechConfig {
                voice: Some(voice),
                language_code: Some(lang),
                vad_mode: Some(VadMode::VadAutomatic),
                enable_input_transcription: Some(true),
                enable_output_transcription: Some(true),
                input_sample_rate: Some(16000),
                output_sample_rate: Some(24000),
            }),
            ..Default::default()
        };

        provider.connect(config).await?;
        provider.send_text("Hello!".to_string(), true).await?;

        // Listen to response...
        provider.disconnect(None).await?;
    }

    Ok(())
}

/// Helper to display supported languages
pub fn list_supported_languages() {
    println!("Supported Languages (24):");
    let languages = vec![
        ("en", "English"),
        ("es", "Spanish"),
        ("fr", "French"),
        ("de", "German"),
        ("it", "Italian"),
        ("pt", "Portuguese"),
        ("ja", "Japanese"),
        ("ko", "Korean"),
        ("zh", "Chinese"),
        ("hi", "Hindi"),
        ("bn", "Bengali"),
        ("ar", "Arabic"),
        ("ru", "Russian"),
        ("tr", "Turkish"),
        ("vi", "Vietnamese"),
        ("th", "Thai"),
        ("id", "Indonesian"),
        ("nl", "Dutch"),
        ("pl", "Polish"),
        ("sv", "Swedish"),
        ("da", "Danish"),
        ("fi", "Finnish"),
        ("no", "Norwegian"),
        ("uk", "Ukrainian"),
    ];

    for (code, name) in languages {
        println!("  {} - {}", code, name);
    }
}

impl LanguageCode {
    pub fn as_ref(&self) -> &str {
        match self {
            LanguageCode::English => "en",
            LanguageCode::Spanish => "es",
            LanguageCode::French => "fr",
            LanguageCode::German => "de",
            LanguageCode::Italian => "it",
            LanguageCode::Portuguese => "pt",
            LanguageCode::Japanese => "ja",
            LanguageCode::Korean => "ko",
            LanguageCode::Chinese => "zh",
            LanguageCode::Hindi => "hi",
            LanguageCode::Bengali => "bn",
            LanguageCode::Arabic => "ar",
            LanguageCode::Russian => "ru",
            LanguageCode::Turkish => "tr",
            LanguageCode::Vietnamese => "vi",
            LanguageCode::Thai => "th",
            LanguageCode::Indonesian => "id",
            LanguageCode::Dutch => "nl",
            LanguageCode::Polish => "pl",
            LanguageCode::Swedish => "sv",
            LanguageCode::Danish => "da",
            LanguageCode::Finnish => "fi",
            LanguageCode::Norwegian => "no",
            LanguageCode::Ukrainian => "uk",
        }
    }
}
