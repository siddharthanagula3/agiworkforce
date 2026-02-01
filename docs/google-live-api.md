# Google Gemini Live API Integration

Comprehensive implementation of Google's Gemini Live API for real-time bidirectional communication with native audio streaming.

## Overview

The Live API provides WebSocket-based real-time interaction with Gemini models, supporting:

- **Native audio streaming** (16-bit PCM, 24kHz output, 16kHz input)
- **Voice Activity Detection (VAD)** - automatic and manual modes
- **Audio transcriptions** for both input and output
- **Function calling** with asynchronous execution
- **Session management** with resumption tokens (2-hour validity)
- **Multimodal support** (text, audio, video)
- **Context compression** for long conversations

## Model

**Latest Model**: `gemini-2.5-flash-native-audio-preview-12-2025`

This model is specifically optimized for real-time audio interactions with low latency and high quality.

## Features

### 1. WebSocket Connection Management

```rust
use google_live_api::{GoogleLiveApiProvider, LiveSessionConfig};

let provider = GoogleLiveApiProvider::new("your-api-key".to_string());
let config = LiveSessionConfig::default();

// Connect to Live API
provider.connect(config).await?;

// Get event stream
let mut events = provider.get_event_receiver().await;
```

**Connection Properties:**

- 10-minute timeout per connection
- Automatic reconnection with exponential backoff (max 3 attempts)
- Heartbeat ping/pong to keep connection alive
- Graceful disconnect with GoAway messages

### 2. Native Audio Streaming

**Audio Specifications:**

- **Input**: 16-bit PCM, 16kHz sample rate
- **Output**: 16-bit PCM, 24kHz sample rate
- **Format**: Base64-encoded audio chunks
- **Streaming**: Bidirectional real-time audio

```rust
// Send audio chunk
let audio_data = vec![0u8; 16000 * 2]; // 1 second of 16kHz 16-bit PCM
provider.send_audio(audio_data).await?;

// Receive audio
while let Some(event) = events.recv().await {
    match event {
        LiveApiEvent::AudioChunk { data, transcript } => {
            // data: Vec<u8> - 24kHz 16-bit PCM
            // transcript: Option<String> - transcription if enabled
            play_audio(data);
        }
        _ => {}
    }
}
```

### 3. Voice Activity Detection (VAD)

Three VAD modes available:

```rust
use google_live_api::{VadMode, SpeechConfig};

let speech_config = SpeechConfig {
    vad_mode: Some(VadMode::VadAutomatic), // Automatic detection
    // vad_mode: Some(VadMode::VadManual),    // Manual control
    // vad_mode: Some(VadMode::VadOff),       // Disabled
    ..Default::default()
};
```

- **VadAutomatic**: Model automatically detects speech start/end
- **VadManual**: Client controls when to send audio
- **VadOff**: Continuous audio processing

### 4. Audio Transcription

Enable transcription for accessibility and logging:

```rust
let speech_config = SpeechConfig {
    enable_input_transcription: Some(true),   // Transcribe user audio
    enable_output_transcription: Some(true),  // Transcribe model audio
    ..Default::default()
};

// Events will include transcripts
LiveApiEvent::InputTranscript { text } => {
    println!("User said: {}", text);
}
LiveApiEvent::OutputTranscript { text } => {
    println!("Assistant said: {}", text);
}
```

### 5. Session Configuration

#### Modalities

```rust
use google_live_api::Modality;

let config = LiveSessionConfig {
    modalities: vec![
        Modality::Text,   // Text-based interaction
        Modality::Audio,  // Audio streaming
        Modality::Video,  // Video streaming (2-min limit)
    ],
    ..Default::default()
};
```

#### Voice Selection

Five distinct voices available:

```rust
use google_live_api::Voice;

Voice::Puck    // Friendly and conversational (default)
Voice::Charon  // Deep and authoritative
Voice::Kore    // Warm and empathetic
Voice::Fenrir  // Energetic and enthusiastic
Voice::Aoede   // Calm and soothing
```

#### Language Support

24 languages supported:

```rust
use google_live_api::LanguageCode;

LanguageCode::English     // en
LanguageCode::Spanish     // es
LanguageCode::French      // fr
LanguageCode::German      // de
LanguageCode::Italian     // it
LanguageCode::Portuguese  // pt
LanguageCode::Japanese    // ja
LanguageCode::Korean      // ko
LanguageCode::Chinese     // zh
LanguageCode::Hindi       // hi
LanguageCode::Bengali     // bn
LanguageCode::Arabic      // ar
LanguageCode::Russian     // ru
LanguageCode::Turkish     // tr
LanguageCode::Vietnamese  // vi
LanguageCode::Thai        // th
LanguageCode::Indonesian  // id
LanguageCode::Dutch       // nl
LanguageCode::Polish      // pl
LanguageCode::Swedish     // sv
LanguageCode::Danish      // da
LanguageCode::Finnish     // fi
LanguageCode::Norwegian   // no
LanguageCode::Ukrainian   // uk
```

### 6. Tool Use / Function Calling

#### Configuration

```rust
use google_live_api::{ToolConfig, FunctionCallingScheduling, FunctionCallingBehavior};

let tool_config = ToolConfig {
    scheduling: Some(FunctionCallingScheduling::WhenIdle),  // INTERRUPT, WHEN_IDLE, SILENT
    behavior: Some(FunctionCallingBehavior::NonBlocking),   // NON_BLOCKING, BLOCKING
    enable_google_search: Some(true),                       // Enable Google Search grounding
};
```

#### Function Calling Modes

**Scheduling:**

- `INTERRUPT`: Stop current generation to call function immediately
- `WHEN_IDLE`: Call function when model is not generating
- `SILENT`: Execute function without affecting generation

**Behavior:**

- `NON_BLOCKING`: Asynchronous function execution (recommended)
- `BLOCKING`: Wait for function response before continuing

#### Example

```rust
// Define tools
let tools = vec![
    json!({
        "function_declarations": [{
            "name": "get_weather",
            "description": "Get current weather",
            "parameters": {
                "type": "object",
                "properties": {
                    "location": { "type": "string" }
                }
            }
        }]
    })
];

let config = LiveSessionConfig {
    tools: Some(tools),
    tool_config: Some(ToolConfig::default()),
    ..Default::default()
};

// Handle function calls
match event {
    LiveApiEvent::FunctionCall { id, name, arguments } => {
        let result = execute_function(name, arguments);
        provider.send_function_response(id, name, result).await?;
    }
    _ => {}
}
```

### 7. Google Search Grounding

Enable real-time web search for up-to-date information:

```rust
let tool_config = ToolConfig {
    enable_google_search: Some(true),
    ..Default::default()
};

// Model can now search Google for current information
provider.send_text("What are today's top news headlines?".to_string(), true).await?;
```

### 8. Session Management

#### Session Lifetime

- **Audio-only**: 15 minutes maximum
- **Audio + Video**: 2 minutes maximum
- **Connection timeout**: 10 minutes idle

#### Resumption Tokens

Resume sessions across disconnections:

```rust
// Request token before disconnecting
provider.request_resumption_token().await?;

// Listen for token
match event {
    LiveApiEvent::ResumptionToken { token, expires_at } => {
        // Token valid for 2 hours
        save_token(token);
    }
    _ => {}
}

// Resume session later
let provider2 = GoogleLiveApiProvider::new(api_key);
provider2.connect(config).await?;
provider2.resume_session(token).await?;
```

### 9. Context Window Compression

Automatic compression for long conversations:

```rust
use google_live_api::CompressionMode;

let config = LiveSessionConfig {
    compression_mode: Some(CompressionMode::SlidingWindow),  // SLIDING_WINDOW, TOKEN_TRIGGER, DISABLED
    compression_trigger_tokens: Some(32000),  // Compress at 32K tokens
    ..Default::default()
};
```

**Compression Modes:**

- `SlidingWindow`: Keep recent context, compress older messages
- `TokenTrigger`: Compress when hitting token threshold
- `Disabled`: No compression (may hit context limits)

### 10. Ephemeral Tokens

Client-side security with short-lived tokens:

```rust
use google_live_api::EphemeralTokenConfig;

let ephemeral_config = EphemeralTokenConfig {
    ttl: Duration::from_secs(1800),          // 30 minutes
    new_session_expire_time: Duration::from_secs(60), // 1 minute
    lock_to_config: true,                    // Lock to specific config
};
```

**Use Cases:**

- Client-side web/mobile apps
- Temporary access grants
- Multi-tenant security

## Event Types

```rust
pub enum LiveApiEvent {
    Connected,
    SetupComplete,
    TextContent { text: String, turn_complete: bool },
    AudioChunk { data: Vec<u8>, transcript: Option<String> },
    InputTranscript { text: String },
    OutputTranscript { text: String },
    FunctionCall { id: String, name: String, arguments: Value },
    FunctionCallsCanceled { ids: Vec<String> },
    GenerationComplete,
    ResumptionToken { token: String, expires_at: SystemTime },
    Error { code: String, message: String },
    Disconnected { reason: Option<String> },
}
```

## Connection States

```rust
pub enum ConnectionState {
    Disconnected,
    Connecting,
    Connected,
    SetupComplete,
    Reconnecting,
    Closing,
    Closed,
}

// Check current state
let state = provider.get_state().await;
```

## Complete Example

```rust
use google_live_api::*;

async fn voice_assistant() -> Result<(), Box<dyn std::error::Error>> {
    // 1. Create provider
    let provider = GoogleLiveApiProvider::new(
        std::env::var("GOOGLE_API_KEY")?
    );

    // 2. Configure session
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
        system_instruction: Some(
            "You are a helpful voice assistant.".to_string()
        ),
        generation_config: Some(GenerationConfig {
            temperature: Some(0.8),
            max_output_tokens: Some(2048),
            ..Default::default()
        }),
        tool_config: Some(ToolConfig {
            scheduling: Some(FunctionCallingScheduling::WhenIdle),
            behavior: Some(FunctionCallingBehavior::NonBlocking),
            enable_google_search: Some(true),
        }),
        ..Default::default()
    };

    // 3. Connect
    provider.connect(config).await?;

    // 4. Get event receiver
    let mut events = provider.get_event_receiver().await;

    // 5. Send audio/text
    provider.send_text("Hello!".to_string(), true).await?;

    // 6. Process events
    while let Some(event) = events.recv().await {
        match event {
            LiveApiEvent::SetupComplete => {
                println!("✓ Session ready");
            }

            LiveApiEvent::AudioChunk { data, transcript } => {
                // Play audio through speakers
                play_audio(&data)?;

                if let Some(text) = transcript {
                    println!("🔊 {}", text);
                }
            }

            LiveApiEvent::InputTranscript { text } => {
                println!("👤 You: {}", text);
            }

            LiveApiEvent::FunctionCall { id, name, arguments } => {
                println!("🔧 Calling: {}", name);
                let result = execute_function(&name, &arguments)?;
                provider.send_function_response(id, name, result).await?;
            }

            LiveApiEvent::GenerationComplete => {
                println!("✓ Response complete");
                break;
            }

            LiveApiEvent::Error { code, message } => {
                eprintln!("❌ Error {}: {}", code, message);
                break;
            }

            LiveApiEvent::Disconnected { reason } => {
                println!("⚠ Disconnected: {:?}", reason);
                break;
            }

            _ => {}
        }
    }

    // 7. Disconnect gracefully
    provider.disconnect(Some("Session complete".to_string())).await?;

    Ok(())
}
```

## Best Practices

### 1. Audio Quality

- Use **16kHz 16-bit PCM** for input (optimal quality/bandwidth)
- Expect **24kHz 16-bit PCM** for output (high quality)
- Send audio in chunks of 100-500ms for low latency

### 2. Error Handling

- Always handle `LiveApiEvent::Error` events
- Implement reconnection logic for network failures
- Use resumption tokens for graceful recovery

### 3. Resource Management

- Close sessions when done to free resources
- Use ephemeral tokens in client-side apps
- Monitor session lifetime limits

### 4. Function Calling

- Use `NonBlocking` behavior for better responsiveness
- Implement timeout for function execution
- Handle `FunctionCallsCanceled` events

### 5. Transcription

- Enable transcription for accessibility
- Use transcripts for logging/analytics
- Consider privacy implications

### 6. Context Management

- Enable compression for long conversations
- Use sliding window for chat-like interactions
- Monitor token usage

### 7. Performance

- Use VAD automatic mode for natural conversation flow
- Implement audio buffering to prevent stuttering
- Consider network latency in UI feedback

## Troubleshooting

### Connection Issues

```rust
// Check provider configuration
if !provider.is_configured() {
    return Err("Invalid API key".into());
}

// Monitor connection state
let state = provider.get_state().await;
if state != ConnectionState::SetupComplete {
    // Handle connection failure
}
```

### Audio Issues

- Verify audio format (16-bit PCM)
- Check sample rates (16kHz input, 24kHz output)
- Ensure base64 encoding is correct

### Function Calling Issues

- Validate function schema
- Handle asynchronous calls properly
- Respond to all function calls

### Session Timeout

- Monitor session lifetime
- Request resumption token proactively
- Implement auto-reconnect

## API Reference

See `google_live_api.rs` for complete type definitions and `google_live_api_examples.rs` for more examples.

## Environment Variables

```bash
# Optional: Override Live API endpoint
export GOOGLE_LIVE_API_BASE="wss://custom-endpoint.googleapis.com/..."

# Required: API key
export GOOGLE_API_KEY="your-api-key-here"
```

## Security Considerations

1. **API Key Protection**: Never expose API keys in client-side code
2. **Ephemeral Tokens**: Use for client-side applications
3. **Audio Privacy**: Be mindful of recording/storing audio
4. **Function Execution**: Validate and sanitize function inputs
5. **Rate Limiting**: Implement client-side rate limiting

## Performance Metrics

- **Latency**: ~200-500ms round-trip (network dependent)
- **Audio Quality**: 24kHz 16-bit PCM (high quality)
- **Throughput**: ~50-100 audio chunks/second
- **Session Limit**: 15 minutes (audio-only), 2 minutes (audio+video)

## References

- [Google AI Multimodal Live API Documentation](https://ai.google.dev/api/multimodal-live)
- [Gemini 2.5 Flash Native Audio Model](https://ai.google.dev/gemini-api/docs/models/gemini)
- [WebSocket Protocol](https://datatracker.ietf.org/doc/html/rfc6455)

## Support

For issues or questions:

1. Check the examples in `google_live_api_examples.rs`
2. Review error messages in `LiveApiEvent::Error`
3. Enable debug logging with `RUST_LOG=debug`
