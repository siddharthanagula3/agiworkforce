# Google Live API Quick Reference

## 🚀 Quick Start

```rust
use crate::core::llm::providers::*;

// Create & connect
let provider = GoogleLiveApiProvider::new(api_key);
provider.connect(LiveSessionConfig::default()).await?;

// Get events
let mut events = provider.get_event_receiver().await;

// Send text
provider.send_text("Hello!".to_string(), true).await?;

// Process events
while let Some(event) = events.recv().await {
    match event {
        LiveApiEvent::TextContent { text, .. } => println!("{}", text),
        LiveApiEvent::AudioChunk { data, .. } => play_audio(data),
        _ => {}
    }
}
```

## 📊 Audio Specs

| Property    | Input      | Output     |
| ----------- | ---------- | ---------- |
| Format      | 16-bit PCM | 16-bit PCM |
| Sample Rate | 16kHz      | 24kHz      |
| Channels    | Mono       | Mono       |
| Encoding    | Base64     | Base64     |

## 🎤 Voices

```rust
Voice::Puck    // Friendly (default)
Voice::Charon  // Deep
Voice::Kore    // Warm
Voice::Fenrir  // Energetic
Voice::Aoede   // Calm
```

## 🌍 Languages (24 supported)

```
en es fr de it pt ja ko zh hi bn ar
ru tr vi th id nl pl sv da fi no uk
```

## 🔧 Function Calling

### Scheduling

```rust
FunctionCallingScheduling::Interrupt  // Stop now
FunctionCallingScheduling::WhenIdle   // Wait for idle
FunctionCallingScheduling::Silent     // Background
```

### Behavior

```rust
FunctionCallingBehavior::NonBlocking  // Async (recommended)
FunctionCallingBehavior::Blocking     // Sync
```

## 🎯 Modalities

```rust
Modality::Text   // Text only
Modality::Audio  // Audio streaming
Modality::Video  // Video (2-min limit)
```

## 🔄 VAD Modes

```rust
VadMode::VadAutomatic  // Auto detect speech
VadMode::VadManual     // Manual control
VadMode::VadOff        // Continuous
```

## 📦 Events

```rust
LiveApiEvent::Connected
LiveApiEvent::SetupComplete
LiveApiEvent::TextContent { text, turn_complete }
LiveApiEvent::AudioChunk { data, transcript }
LiveApiEvent::InputTranscript { text }
LiveApiEvent::OutputTranscript { text }
LiveApiEvent::FunctionCall { id, name, arguments }
LiveApiEvent::GenerationComplete
LiveApiEvent::ResumptionToken { token, expires_at }
LiveApiEvent::Error { code, message }
LiveApiEvent::Disconnected { reason }
```

## 🔌 Connection States

```rust
ConnectionState::Disconnected
ConnectionState::Connecting
ConnectionState::Connected
ConnectionState::SetupComplete
ConnectionState::Reconnecting
ConnectionState::Closing
ConnectionState::Closed
```

## ⏱️ Timeouts & Limits

| Limit                     | Duration             |
| ------------------------- | -------------------- |
| Connection timeout        | 10 minutes           |
| Audio-only session        | 15 minutes           |
| Audio+Video session       | 2 minutes            |
| Resumption token validity | 2 hours              |
| Ephemeral token TTL       | 30 minutes (default) |
| Heartbeat interval        | 30 seconds           |
| Reconnect attempts        | 3 max                |

## 💾 Context Compression

```rust
CompressionMode::SlidingWindow   // Keep recent
CompressionMode::TokenTrigger    // At threshold
CompressionMode::Disabled        // No compression
```

## 🔐 Security

```rust
// Ephemeral tokens
EphemeralTokenConfig {
    ttl: Duration::from_secs(1800),           // 30 min
    new_session_expire_time: Duration::from_secs(60), // 1 min
    lock_to_config: true,                     // Lock to config
}
```

## 🎛️ Generation Config

```rust
GenerationConfig {
    temperature: Some(0.7),
    max_output_tokens: Some(2048),
    top_p: Some(0.95),
    top_k: Some(40),
    response_mime_type: None,
    response_schema: None,
}
```

## 📞 Common Methods

```rust
// Connection
provider.connect(config).await?
provider.disconnect(reason).await?
provider.get_state().await
provider.get_event_receiver().await

// Sending
provider.send_text(text, turn_complete).await?
provider.send_audio(audio_data).await?
provider.send_function_response(id, name, result).await?

// Session management
provider.request_resumption_token().await?
provider.resume_session(token).await?
```

## 🛠️ Tool Configuration

```rust
ToolConfig {
    scheduling: Some(FunctionCallingScheduling::WhenIdle),
    behavior: Some(FunctionCallingBehavior::NonBlocking),
    enable_google_search: Some(true),
}
```

## 🌐 Environment Variables

```bash
export GOOGLE_API_KEY="your-key"
export GOOGLE_LIVE_API_BASE="wss://..."  # Optional override
```

## 📝 Model

```rust
DEFAULT_LIVE_MODEL = "gemini-2.5-flash-native-audio-preview-12-2025"
```

## ⚡ Performance Tips

1. **Audio**: Send 100-500ms chunks for low latency
2. **VAD**: Use automatic for natural flow
3. **Functions**: Use non-blocking for responsiveness
4. **Compression**: Enable for long conversations
5. **Transcription**: Enable for accessibility
6. **Reconnect**: Implement for network failures
7. **Tokens**: Request before disconnect

## 🐛 Debug

```bash
RUST_LOG=debug cargo run
```

## 📚 Full Documentation

See `GOOGLE_LIVE_API.md` for complete documentation.

## 💡 Examples

See `google_live_api_examples.rs` for 8 complete examples:

1. Text conversation
2. Audio conversation
3. Function calling
4. Session resumption
5. Google Search
6. Context compression
7. Multimodal
8. Voice/language selection

## ⚠️ Important Notes

- Always handle `Error` events
- Close sessions when done
- Use resumption tokens for recovery
- Implement timeout for functions
- Monitor session lifetime
- Enable compression for long chats
- Validate function inputs
- Use ephemeral tokens in clients

## 🎯 Minimal Example

```rust
let provider = GoogleLiveApiProvider::new(key);
provider.connect(LiveSessionConfig::default()).await?;
let mut rx = provider.get_event_receiver().await;

provider.send_text("Hi!".into(), true).await?;

while let Some(e) = rx.recv().await {
    if let LiveApiEvent::TextContent { text, .. } = e {
        println!("{}", text);
        break;
    }
}

provider.disconnect(None).await?;
```

---

**Status**: ✅ Complete | **Version**: 1.0 | **Model**: gemini-2.5-flash-native-audio-preview-12-2025
