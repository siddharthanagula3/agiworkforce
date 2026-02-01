# Google Provider Complete API Reference

**Version:** 1.0.0
**Date:** 2026-02-01
**Status:** Production Ready

---

## Table of Contents

1. [Overview](#overview)
2. [Models](#models)
3. [Text Generation](#text-generation)
4. [Thinking Capabilities](#thinking-capabilities)
5. [Multimodal Generation](#multimodal-generation)
6. [RAG Capabilities](#rag-capabilities)
7. [Grounding](#grounding)
8. [Code Execution](#code-execution)
9. [Computer Use](#computer-use)
10. [Batch API](#batch-api)
11. [Live API](#live-api)
12. [Advanced Features](#advanced-features)
13. [Pricing](#pricing)
14. [Best Practices](#best-practices)
15. [Integration Guide](#integration-guide)

---

## Overview

The Google Provider integrates all Gemini models with advanced capabilities including thinking, multimodal generation, RAG, grounding, code execution, computer use, batch processing, and real-time communication.

### Supported Models

| Model Family   | Latest Version                 | Context | Best For                    |
| -------------- | ------------------------------ | ------- | --------------------------- |
| **Gemini 3**   | 3-pro-preview, 3-flash-preview | 2M / 1M | Deep thinking, multimodal   |
| **Gemini 2.5** | 2.5-pro, 2.5-flash             | 2M / 1M | Speed, efficiency, Live API |
| **Gemini 2.0** | 2.0-flash                      | 1M      | Legacy support              |

### Key Features

- ✅ **Text Generation** - Up to 2M context window
- ✅ **Thinking** - 5 levels (0-4) with token tracking
- ✅ **Image Generation** - Nano Banana, Imagen 4
- ✅ **Video Generation** - Veo 3.1 (2s-20s)
- ✅ **Text-to-Speech** - 5 voices, 24 languages
- ✅ **File Search** - Semantic search with embeddings
- ✅ **URL Context** - Web grounding with citations
- ✅ **Google Search** - Real-time search grounding
- ✅ **Google Maps** - Location-based grounding
- ✅ **Code Execution** - Python sandbox (FREE)
- ✅ **Computer Use** - Browser automation (preview)
- ✅ **Batch API** - 50% cost savings
- ✅ **Live API** - Real-time audio streaming
- ✅ **Context Caching** - 75% discount
- ✅ **Safety Settings** - Configurable content filtering

---

## Models

### Gemini 3 Family

#### Gemini 3 Pro

```rust
model: "gemini-3-pro-preview"
```

**Specifications:**

- Context: 2M tokens input, 64K tokens output
- Knowledge Cutoff: January 2025
- Thinking: Levels 0-4 (all supported)
- Multimodal: Images, video, audio

**Pricing:**

- Input: $2.00 per 1M tokens (<200K), $4.00 per 1M tokens (>200K)
- Output: $8.00 per 1M tokens (<200K), $18.00 per 1M tokens (>200K)
- Thinking: $4.00 per 1M tokens

**Best For:**

- Complex reasoning tasks
- Deep thinking scenarios
- Multi-step problem solving
- Research and analysis

#### Gemini 3 Flash

```rust
model: "gemini-3-flash-preview"
```

**Specifications:**

- Context: 1M tokens input, 64K tokens output
- Knowledge Cutoff: January 2025
- Thinking: Levels 0-2 (minimal, low, medium)
- Multimodal: Images, video, audio

**Pricing:**

- Input: $0.50 per 1M tokens
- Output: $2.00 per 1M tokens
- Thinking: $0.20 per 1M tokens

**Best For:**

- Speed-critical applications
- High-volume processing
- Cost-sensitive workloads
- Quick responses

#### Gemini 3 Deep Think (Image)

```rust
model: "gemini-3-pro-image-preview"
```

**Specifications:**

- Context: 65K tokens input, 32K tokens output
- Specialized for image understanding
- Thinking: Full support

**Pricing:**

- Text: $2.00 per 1M tokens
- Images: $0.134 per image

### Gemini 2.5 Family

#### Gemini 2.5 Pro

```rust
model: "gemini-2.5-pro"
```

**Specifications:**

- Context: 2M tokens input
- Knowledge Cutoff: October 2024
- Thinking: Thinking budget (token-based)
- Multimodal: Images, video, audio

**Pricing:**

- Input: $1.25 per 1M tokens (<200K), $2.50 per 1M tokens (>200K)
- Output: $5.00 per 1M tokens (<200K), $10.00 per 1M tokens (>200K)

#### Gemini 2.5 Flash

```rust
model: "gemini-2.5-flash"
```

**Specifications:**

- Context: 1M tokens input
- Fastest model in the family
- Native audio support (Live API)

**Pricing:**

- Input: $0.075 per 1M tokens
- Output: $0.30 per 1M tokens

---

## Text Generation

### Basic Request

```rust
use crate::core::llm::{LLMRequest, LLMProvider};
use crate::core::llm::providers::google::GoogleProvider;

let provider = GoogleProvider::new(api_key)?;

let request = LLMRequest {
    model: "gemini-3-flash-preview".to_string(),
    messages: vec![
        ChatMessage {
            role: "user".to_string(),
            content: "Explain quantum computing in simple terms".to_string(),
            ..Default::default()
        }
    ],
    temperature: Some(1.0),
    max_tokens: Some(1024),
    ..Default::default()
};

let response = provider.send_message(&request).await?;
println!("{}", response.content);
```

### Streaming

```rust
let request = LLMRequest {
    stream: Some(true),
    ..Default::default()
};

let mut stream = provider.send_message_stream(&request).await?;

while let Some(chunk) = stream.next().await {
    match chunk {
        Ok(chunk) => print!("{}", chunk.content),
        Err(e) => eprintln!("Error: {}", e),
    }
}
```

### Parameters

| Parameter        | Type             | Default  | Description                                         |
| ---------------- | ---------------- | -------- | --------------------------------------------------- |
| `model`          | String           | Required | Model ID (e.g., "gemini-3-flash-preview")           |
| `messages`       | Vec<ChatMessage> | Required | Conversation history                                |
| `temperature`    | f32              | 1.0      | Randomness (0.0-2.0). **Keep at 1.0 for Gemini 3!** |
| `max_tokens`     | u32              | None     | Maximum output tokens                               |
| `top_p`          | f32              | None     | Nucleus sampling (0.0-1.0)                          |
| `top_k`          | u32              | None     | Top-k sampling                                      |
| `stop_sequences` | Vec<String>      | None     | Stop generation sequences                           |
| `stream`         | bool             | false    | Enable streaming                                    |

**Important:** For Gemini 3, keep `temperature` at the default `1.0`. Lower values may cause looping or degraded performance.

---

## Thinking Capabilities

### Thinking Levels (Gemini 3)

Gemini 3 introduces a **5-level thinking scale** (0-4):

```rust
pub enum ThinkingLevel {
    Minimal = 0,  // Flash only - matches "no thinking"
    Low = 1,      // Minimizes latency and cost
    Medium = 2,   // Flash only - balanced thinking
    High = 3,     // Default - maximizes reasoning depth
    Extreme = 4,  // Pro only - deepest reasoning
}
```

### Configuration

```rust
use crate::core::llm::ThinkingParameter;

let request = LLMRequest {
    model: "gemini-3-pro-preview".to_string(),
    thinking: Some(ThinkingParameter::Level(ThinkingLevel::Extreme)),
    messages: vec![...],
    ..Default::default()
};
```

### Model Support

| Model              | Supported Levels               |
| ------------------ | ------------------------------ |
| **Gemini 3 Pro**   | 0, 1, 3, 4 (all except Medium) |
| **Gemini 3 Flash** | 0, 1, 2 (Minimal, Low, Medium) |
| **Gemini 2.5**     | Thinking budget (token-based)  |

### Thought Summaries

```rust
let response = provider.send_message(&request).await?;

if let Some(thought_summary) = response.thought_summary {
    println!("Reasoning: {}", thought_summary);
}
println!("Answer: {}", response.content);
```

### Thought Signatures

For function calling and image generation, thought signatures are **required**:

```rust
// Include in system message or request metadata
"thoughtSignature": "context_engineering_is_the_way_to_go"
```

This ensures reasoning context is maintained across API calls for strict validation scenarios.

### Cost Impact

**Example:** 1M input tokens with EXTREME thinking

| Component | Tokens | Cost @ Gemini 3 Pro |
| --------- | ------ | ------------------- |
| Input     | 1M     | $2.00               |
| Output    | 100K   | $0.80               |
| Thinking  | 500K   | $2.00               |
| **Total** | 1.6M   | **$4.80**           |

**Optimization:** Use LOW thinking for simple tasks, reserve EXTREME for complex reasoning.

---

## Multimodal Generation

### Image Generation

#### Nano Banana (Gemini 3)

```rust
use crate::core::llm::providers::google_multimodal::{
    GoogleMultimodalProvider, ImageGenConfig
};

let provider = GoogleMultimodalProvider::new(api_key)?;

let config = ImageGenConfig {
    prompt: "A serene mountain landscape at sunset".to_string(),
    model: "nano-banana".to_string(),
    aspect_ratio: Some("16:9".to_string()),
    number_of_images: Some(1),
    safety_settings: None,
};

let image = provider.generate_image(config).await?;
// image.uri: String (GCS or data URL)
// image.cost: Some(0.04)
```

**Supported Aspect Ratios:**

- `1:1` (square)
- `3:4` (portrait)
- `4:3` (landscape)
- `9:16` (vertical)
- `16:9` (horizontal)

**Speed:** 2-3 seconds per image

#### Imagen 4

```rust
let config = ImageGenConfig {
    prompt: "Professional headshot photo".to_string(),
    model: "imagen-4".to_string(),
    ..Default::default()
};

let image = provider.generate_image(config).await?;
```

**Advantages:**

- Higher fidelity
- Photorealistic quality
- Better text rendering
- Fine-grained control

**Pricing:** $0.04 per image (same as Nano Banana)

### Video Generation

#### Veo 3.1

```rust
use crate::core::llm::providers::google_multimodal::VideoGenConfig;

let config = VideoGenConfig {
    prompt: "A cat playing piano in slow motion".to_string(),
    model: "veo-3.1".to_string(),
    duration: Some(8.0), // 2.0 to 20.0 seconds
    aspect_ratio: Some("16:9".to_string()),
    safety_settings: None,
};

let video = provider.generate_video(config).await?;
// video.uri: String (GCS URL)
// video.duration: f32
```

**Specifications:**

- Duration: 2s to 20s
- Resolution: 720p (1280x720)
- Aspect Ratios: 16:9, 9:16, 1:1

**Pricing:**

- 2s video: $0.13
- 20s video: $1.30
- Pro-rated between 2-20s

**Capabilities:**

- Text-to-video
- Image-to-video (with reference image)

### Text-to-Speech

#### Gemini 2.5 Flash TTS

```rust
use crate::core::llm::providers::google_multimodal::TTSConfig;

let config = TTSConfig {
    text: "Hello, welcome to AGI Workforce!".to_string(),
    voice: "puck".to_string(), // or charon, kore, fenrir, aoede
    language: Some("en-US".to_string()),
};

let audio = provider.text_to_speech(config).await?;
// audio.data: Vec<u8> (audio bytes)
// audio.format: AudioFormat::MP3
```

**Voices:**

- `puck` - Friendly and conversational
- `charon` - Deep and authoritative
- `kore` - Warm and empathetic
- `fenrir` - Energetic and enthusiastic
- `aoede` - Calm and soothing

**Languages:** 24 languages supported (en, es, fr, de, it, pt, ja, ko, zh, etc.)

**Pricing:** $10 per 1M characters

---

## RAG Capabilities

### File Search with Embeddings

```rust
use crate::core::llm::providers::google_rag::{FileSearchConfig, GoogleRagProvider};

let rag_provider = GoogleRagProvider::new(api_key)?;

// Upload files first
let file_id = rag_provider.upload_file("document.pdf").await?;

// Configure file search
let file_search = FileSearchConfig {
    files: vec![file_id],
    semantic_threshold: Some(0.7), // 0.0-1.0
    max_results: Some(10),
    include_full_content: false,
};

// Use in request
let request = LLMRequest {
    model: "gemini-3-flash-preview".to_string(),
    messages: vec![ChatMessage {
        role: "user".to_string(),
        content: "What are the key findings in the document?".to_string(),
        ..Default::default()
    }],
    file_search: Some(file_search),
    ..Default::default()
};

let response = provider.send_message(&request).await?;
```

**Supported Formats:** PDF, TXT, CSV, DOC, DOCX, XLS, XLSX, PPT, PPTX, MD, JSON, HTML, code files, and 100+ more

**Pricing:** $0.039 per 1,000 queries

**Semantic Threshold:**

- `0.5` - Broad matching
- `0.7` - Balanced (recommended)
- `0.9` - Strict matching

### URL Context

```rust
use crate::core::llm::providers::google_rag::URLContextConfig;

let url_context = URLContextConfig {
    urls: vec![
        "https://example.com/article".to_string(),
        "https://example.com/docs".to_string(),
    ],
    include_citations: true,
    max_content_length: Some(50000), // ~12.5K tokens
    extract_main_content: true,
};

let request = LLMRequest {
    url_context: Some(url_context),
    ..Default::default()
};
```

**Features:**

- Automatic main content extraction
- Citation support in responses
- Multi-URL aggregation
- Content length limits

**Best Practices:**

- Limit to 3-5 URLs per request
- Use `extract_main_content: true` for clean data
- Set `max_content_length` to control token usage

### Long Context Optimization

```rust
use crate::core::llm::providers::google_rag::LongContextConfig;

let long_context = LongContextConfig {
    enable_chunking: true,
    chunk_size_tokens: Some(100000), // 100K tokens per chunk
    chunk_overlap_tokens: Some(1000), // 1K token overlap
    use_caching: true,
};

let request = LLMRequest {
    long_context: Some(long_context),
    ..Default::default()
};
```

**When to Use:**

- Input >200K tokens
- Very long documents
- Large codebases
- Extensive conversation history

**Context Windows:**

- Gemini 3 Pro: 2M tokens
- Gemini 3 Flash: 1M tokens
- Gemini 2.5 Pro: 2M tokens

**Optimization:**

- Automatic chunking for >1M tokens
- Context caching (75% discount)
- Smart chunk sizing
- Overlap for continuity

---

## Grounding

### Google Search Grounding

```rust
use crate::core::llm::providers::google_grounding::SearchGroundingConfig;

let search_grounding = SearchGroundingConfig {
    enabled: true,
    dynamic_retrieval_threshold: Some(0.5), // 0.0-1.0
};

let request = LLMRequest {
    model: "gemini-3-flash-preview".to_string(),
    messages: vec![ChatMessage {
        role: "user".to_string(),
        content: "What's the latest news on AI regulation?".to_string(),
        ..Default::default()
    }],
    search_grounding: Some(search_grounding),
    ..Default::default()
};

let response = provider.send_message(&request).await?;

// Access grounding metadata
if let Some(grounding) = response.grounding_metadata {
    for result in grounding.search_results {
        println!("Source: {} - {}", result.title, result.url);
    }
}
```

**Pricing:** $35 per 1,000 search queries

**Dynamic Retrieval Threshold:**

- `0.0` - Always search
- `0.5` - Balanced (recommended)
- `1.0` - Only when highly confident

**Use Cases:**

- Current events
- Real-time data
- Fact-checking
- News summaries
- Product information

### Google Maps Grounding

```rust
use crate::core::llm::providers::google_grounding::{
    MapsGroundingConfig, GeoLocation
};

// By place ID
let maps_grounding = MapsGroundingConfig {
    place_id: Some("ChIJN1t_tDeuEmsRUsoyG83frY4".to_string()),
    location: None,
};

// By coordinates
let maps_grounding = MapsGroundingConfig {
    place_id: None,
    location: Some(GeoLocation::new(37.7749, -122.4194)?), // SF
};

let request = LLMRequest {
    maps_grounding: Some(maps_grounding),
    ..Default::default()
};
```

**Use Cases:**

- Location queries
- Business information
- Directions and navigation
- Points of interest
- "Near me" queries

**Response Metadata:**

- Place name
- Address
- Business hours
- Reviews and ratings
- Photos

---

## Code Execution

### Python Sandbox

```rust
use crate::core::llm::providers::google_code_execution::CodeExecutionConfig;

let request = LLMRequest {
    model: "gemini-3-flash-preview".to_string(),
    messages: vec![ChatMessage {
        role: "user".to_string(),
        content: "Calculate the mean and standard deviation of [1, 2, 3, 4, 5]".to_string(),
        ..Default::default()
    }],
    code_execution: Some(CodeExecutionConfig::enabled()),
    ..Default::default()
};

let response = provider.send_message(&request).await?;

if let Some(code_result) = response.code_execution_result {
    if code_result.is_success() {
        println!("Output: {}", code_result.formatted_output());

        if let Some(images) = code_result.output_images {
            for (i, img_base64) in images.iter().enumerate() {
                save_image(&format!("plot_{}.png", i), img_base64)?;
            }
        }
    }
}
```

**Available Libraries:**

- NumPy - numerical computing
- Pandas - data analysis
- Matplotlib - data visualization
- PIL/Pillow - image processing
- Standard Python libraries

**Capabilities:**

- Data analysis
- Mathematical calculations
- Chart generation (Matplotlib)
- Image manipulation (PIL)
- Text processing

**Pricing:** **FREE** - no additional cost

**Security:**

- Sandboxed execution
- No network access
- No file system access
- Memory limits
- Execution timeouts

### Result Structure

```rust
pub struct CodeExecutionResult {
    pub stdout: Option<String>,
    pub stderr: Option<String>,
    pub output_images: Option<Vec<String>>, // Base64 PNG
    pub exit_code: Option<i32>,
    pub status: Option<String>,
}
```

**Helper Methods:**

- `is_success()` - Check exit code
- `has_output()` - Check for any output
- `formatted_output()` - Combine stdout/stderr
- `image_count()` - Number of generated images

---

## Computer Use

### Browser Automation (Preview)

```rust
use crate::core::llm::providers::google_advanced::{
    GoogleAdvancedProvider, ComputerUseConfig
};

let provider = GoogleAdvancedProvider::new(api_key)?
    .with_computer_use(ComputerUseConfig {
        display_width: 1920,
        display_height: 1080,
        enable_screenshots: true,
        enable_actions: true,
    });

let request = LLMRequest {
    model: "gemini-2.5-pro".to_string(),
    messages: vec![ChatMessage {
        role: "user".to_string(),
        content: "Navigate to google.com and search for 'AI news'".to_string(),
        ..Default::default()
    }],
    ..Default::default()
};
```

**Supported Actions:**

- Mouse movements
- Click events
- Keyboard input
- Scroll operations
- Form filling
- Navigation

**Model Compatibility:**

- ✅ Gemini 2.5 Pro (full support)
- ✅ Gemini 2.5 Flash (limited)
- ❌ Gemini 3 (not yet supported)

**Limitations:**

- Preview feature
- Usage limits apply
- Explicit consent required
- Regional availability

**Safety:**

- Screenshot approval
- Action confirmation
- Sandboxed environment
- Activity logging

---

## Batch API

### Asynchronous Processing

```rust
use crate::core::llm::providers::google_batch::{
    GoogleBatchProvider, CreateBatchJobRequest, BatchJobState
};

let batch_provider = GoogleBatchProvider::new(api_key)?;

// Prepare requests
let requests = vec![
    serde_json::json!({
        "contents": [{"role": "user", "parts": [{"text": "Explain AI"}]}]
    }),
    serde_json::json!({
        "contents": [{"role": "user", "parts": [{"text": "Explain ML"}]}]
    }),
    // ... up to 10,000 requests
];

// Create batch job
let batch = CreateBatchJobRequest {
    requests: Some(requests),
    model: "gemini-3-flash-preview".to_string(),
    display_name: Some("AI Explanations".to_string()),
    ..Default::default()
};

let job = batch_provider.create_batch_job(batch).await?;
println!("Job created: {}", job.name);

// Poll for completion
loop {
    let status = batch_provider.get_batch_job(&job.name).await?;

    match status.state {
        BatchJobState::Succeeded => {
            println!("Batch completed!");
            let results = batch_provider.get_batch_results(&job.name).await?;
            break;
        }
        BatchJobState::Failed => {
            eprintln!("Batch failed: {:?}", status.error);
            break;
        }
        _ => {
            println!("Status: {:?}", status.state);
            tokio::time::sleep(Duration::from_secs(60)).await;
        }
    }
}
```

**Pricing:** 50% of standard API rates

**Limits:**

- 1,000 concurrent jobs
- 10M requests per day
- 20MB inline requests
- 2GB JSONL files

**SLO:** 24 hours (typically much faster)

### Job States

```rust
pub enum BatchJobState {
    Pending,    // Queued
    Running,    // Processing
    Succeeded,  // Complete
    Failed,     // Error
    Cancelled,  // User cancelled
    Expired,    // Timeout
}
```

### Output Options

**Inline Output:**

```rust
output_config: Some(BatchOutputConfig {
    output_type: "inline".to_string(),
    gcs_destination: None,
})
```

**File Output (GCS):**

```rust
output_config: Some(BatchOutputConfig {
    output_type: "file".to_string(),
    gcs_destination: Some("gs://my-bucket/results".to_string()),
})
```

### Best Practices

1. **Use for high-volume**: >100 requests
2. **Not time-critical**: Can wait 24 hours
3. **Batch embeddings**: Significant savings
4. **JSONL for scale**: >1,000 requests
5. **Monitor jobs**: Poll every 60s
6. **Handle failures**: Implement retry logic

---

## Live API

### Real-time Audio Streaming

```rust
use crate::core::llm::providers::google_live_api::{
    GoogleLiveApiProvider, LiveSessionConfig, Modality, Voice, VadMode
};

let provider = GoogleLiveApiProvider::new(api_key);

let config = LiveSessionConfig {
    modalities: vec![Modality::Audio, Modality::Text],
    voice: Some(Voice::Puck),
    speech_config: Some(SpeechConfig {
        vad_mode: Some(VadMode::VadAutomatic),
        enable_input_transcription: Some(true),
        enable_output_transcription: Some(true),
        ..Default::default()
    }),
    ..Default::default()
};

// Connect
provider.connect(config).await?;

// Get event receiver
let mut events = provider.get_event_receiver().await;

// Send audio (16-bit PCM, 16kHz)
let audio_data = capture_microphone(); // Vec<u8>
provider.send_audio(audio_data).await?;

// Receive events
while let Some(event) = events.recv().await {
    match event {
        LiveApiEvent::AudioChunk { data, transcript } => {
            play_audio(data); // 24kHz 16-bit PCM
            if let Some(text) = transcript {
                println!("Assistant: {}", text);
            }
        }
        LiveApiEvent::InputTranscript { text } => {
            println!("User: {}", text);
        }
        LiveApiEvent::ToolCall { call_id, name, args } => {
            let result = execute_tool(name, args).await?;
            provider.send_tool_response(call_id, result).await?;
        }
        LiveApiEvent::Disconnected { reason } => {
            println!("Disconnected: {}", reason);
            break;
        }
        _ => {}
    }
}
```

**Model:** `gemini-2.5-flash-native-audio-preview-12-2025`

**Audio Specifications:**

- Input: 16-bit PCM, 16kHz, base64
- Output: 16-bit PCM, 24kHz, base64
- Bidirectional streaming

**VAD Modes:**

- `VadAutomatic` - Model detects speech
- `VadManual` - Client controls
- `VadOff` - Continuous processing

**Voices:**

- `Puck` - Friendly (default)
- `Charon` - Deep
- `Kore` - Warm
- `Fenrir` - Energetic
- `Aoede` - Calm

**Session Limits:**

- Audio-only: 15 minutes
- Audio+video: 2 minutes
- Resumption tokens: 2 hours

**Languages:** 24 supported (en, es, fr, de, it, pt, ja, ko, zh, etc.)

---

## Advanced Features

### Media Resolution

Control image/video processing quality (Gemini 3, v1alpha API):

```rust
use crate::core::llm::providers::google_advanced::MediaResolution;

let provider = GoogleAdvancedProvider::new(api_key)?
    .with_media_resolution(MediaResolution::MediaResolutionHigh);
```

**Resolution Levels:**

| Level      | Tokens | Use Case                | Cost (100 images @ Gemini 3 Flash) |
| ---------- | ------ | ----------------------- | ---------------------------------- |
| LOW        | 280    | Thumbnails, previews    | $0.014                             |
| MEDIUM     | 560    | General use (default)   | $0.028                             |
| HIGH       | 1120   | Detailed analysis       | $0.056                             |
| ULTRA_HIGH | 2240   | Fine-grained inspection | $0.112                             |

**Savings:** Up to 87% by using LOW vs. ULTRA_HIGH

### Context Caching

Cache frequently used content for 75% savings:

```rust
use std::time::Duration;

// Create cache (must be >4096 tokens)
let cached = provider.create_cache(
    vec![ContentPart::text(large_document)],
    Duration::from_secs(3600), // 1 hour TTL
).await?;

// Use in requests
let request = LLMRequest {
    cached_content: Some(cached.name),
    messages: vec![...],
    ..Default::default()
};
```

**Pricing:**

- Uncached: Standard rates
- Cached: 25% of standard rates
- Thinking: Standard rates (no discount)

**Requirements:**

- Minimum: 4096 tokens
- TTL: 60s to 7 days
- Maximum: 1M tokens per cache

**Best For:**

- Long documents
- Repeated queries
- Multi-turn conversations
- System prompts

**Savings Example:**

- 10K token doc, 100 requests
- Without cache: $1.25
- With cache: $0.25
- **80% savings**

### Safety Settings

Configure content filtering:

```rust
use crate::core::llm::providers::google_advanced::{
    SafetySettings, SafetySetting, HarmCategory, HarmBlockThreshold
};

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
            threshold: HarmBlockThreshold::BlockMediumAndAbove,
        },
    ],
};

let provider = GoogleAdvancedProvider::new(api_key)?
    .with_safety_settings(safety);
```

**Harm Categories:**

- Harassment
- Hate Speech
- Sexually Explicit
- Dangerous Content

**Thresholds:**

- `Off` - No filtering (Gemini 2.5+ default)
- `BlockNone` - Allow all
- `BlockOnlyHigh` - Block high severity
- `BlockMediumAndAbove` - Block medium+ (recommended for production)
- `BlockLowAndAbove` - Block low+

**Default:** OFF for Gemini 2.5+ (maximum flexibility in development)

---

## Pricing

### Text Models

| Model                | Input (per 1M)               | Output (per 1M)         | Thinking (per 1M) | Context |
| -------------------- | ---------------------------- | ----------------------- | ----------------- | ------- |
| **Gemini 3 Pro**     | $2 (<200K), $4 (>200K)       | $8 (<200K), $18 (>200K) | $4                | 2M      |
| **Gemini 3 Flash**   | $0.50                        | $2.00                   | $0.20             | 1M      |
| **Gemini 2.5 Pro**   | $1.25 (<200K), $2.50 (>200K) | $5 (<200K), $10 (>200K) | $1.25             | 2M      |
| **Gemini 2.5 Flash** | $0.075                       | $0.30                   | $0.075            | 1M      |

### Multimodal Generation

| Feature                  | Cost                  |
| ------------------------ | --------------------- |
| **Image (Nano Banana)**  | $0.04 per image       |
| **Image (Imagen 4)**     | $0.04 per image       |
| **Video (Veo 3.1, 2s)**  | $0.13 per video       |
| **Video (Veo 3.1, 20s)** | $1.30 per video       |
| **TTS**                  | $10 per 1M characters |

### Advanced Features

| Feature                     | Cost                          |
| --------------------------- | ----------------------------- |
| **Google Search Grounding** | $35 per 1,000 queries         |
| **Google Maps Grounding**   | Included in text pricing      |
| **File Search**             | $0.039 per 1,000 queries      |
| **URL Context**             | Included in text pricing      |
| **Code Execution**          | **FREE**                      |
| **Computer Use**            | Included in text pricing      |
| **Context Caching**         | 75% discount on cached tokens |
| **Batch API**               | 50% of standard rates         |
| **Live API**                | Standard audio pricing        |

### Cost Optimization

**1. Model Selection (75% savings)**

```
Gemini 3 Flash vs. Gemini 3 Pro: 75% cheaper
```

**2. Thinking Level (90% savings)**

```
LOW vs. EXTREME: Up to 90% less thinking tokens
```

**3. Context Caching (75% savings)**

```
Cached vs. Uncached: 75% discount
```

**4. Batch API (50% savings)**

```
Batch vs. Real-time: 50% discount
```

**5. Media Resolution (87% savings)**

```
LOW vs. ULTRA_HIGH: 87% fewer tokens
```

**Combined Example:**

- Baseline: Gemini 3 Pro, HIGH thinking, no cache, real-time, MEDIUM res = $100
- Optimized: Gemini 3 Flash, LOW thinking, cached, batch, LOW res = **$3.25**
- **Savings: 96.75%**

---

## Best Practices

### 1. Temperature Settings

**CRITICAL:** Keep temperature at **1.0** for Gemini 3!

```rust
// ✅ GOOD
temperature: Some(1.0)

// ❌ BAD - May cause looping or degraded performance
temperature: Some(0.7)
```

### 2. Thinking Level Selection

| Task Complexity   | Recommended Level | Model        |
| ----------------- | ----------------- | ------------ |
| Simple queries    | MINIMAL or LOW    | Flash        |
| Standard tasks    | LOW or MEDIUM     | Flash        |
| Complex reasoning | HIGH              | Pro or Flash |
| Deep analysis     | EXTREME           | Pro only     |

### 3. Context Caching Strategy

**When to Cache:**

- Content >4096 tokens
- Used >2 times
- Stable (doesn't change)
- Long documents or system prompts

**TTL Selection:**

- Development: 1 hour
- Production: 24 hours
- Long-term: 7 days

### 4. Batch vs. Real-time

**Use Batch API for:**

- > 100 requests
- Non-urgent tasks
- Embeddings
- Cost-sensitive workloads

**Use Real-time API for:**

- <100 requests
- Interactive applications
- Time-critical responses
- User-facing features

### 5. Media Resolution Tuning

| Content Type    | Recommended Resolution |
| --------------- | ---------------------- |
| Thumbnails      | LOW                    |
| Screenshots     | MEDIUM                 |
| Detailed images | HIGH                   |
| Fine text OCR   | ULTRA_HIGH             |

### 6. Safety Settings

**Development:** OFF (default for Gemini 2.5+)
**Production:** BLOCK_MEDIUM_AND_ABOVE
**Strict:** BLOCK_LOW_AND_ABOVE

### 7. Error Handling

```rust
match provider.send_message(&request).await {
    Ok(response) => {
        // Success
    }
    Err(e) if e.to_string().contains("429") => {
        // Rate limit - retry with exponential backoff
    }
    Err(e) if e.to_string().contains("Content blocked") => {
        // Safety filter - adjust safety settings or rephrase
    }
    Err(e) => {
        // Other error - log and handle
    }
}
```

### 8. Streaming Best Practices

- Always handle stream errors
- Implement timeout (10s recommended)
- Buffer chunks for smooth display
- Track token usage in real-time

### 9. File Search Optimization

- Limit files to 5-10 per request
- Use semantic threshold of 0.7
- Set max_results to 10 or less
- Enable citations for transparency

### 10. Live API Session Management

- Use resumption tokens for reconnection
- Implement heartbeat monitoring
- Handle disconnection gracefully
- Limit session duration appropriately

---

## Integration Guide

### Step 1: Add Dependencies

```toml
[dependencies]
reqwest = { version = "0.11", features = ["json", "stream"] }
tokio = { version = "1", features = ["full"] }
serde = { version = "1", features = ["derive"] }
serde_json = "1"
base64 = "0.21"
futures-util = "0.3"
tokio-tungstenite = "0.20" # For Live API
```

### Step 2: Initialize Provider

```rust
use crate::core::llm::providers::google::GoogleProvider;

let api_key = std::env::var("GOOGLE_API_KEY")
    .expect("GOOGLE_API_KEY must be set");

let provider = GoogleProvider::new(api_key)?;
```

### Step 3: Basic Usage

```rust
let request = LLMRequest {
    model: "gemini-3-flash-preview".to_string(),
    messages: vec![
        ChatMessage {
            role: "user".to_string(),
            content: "Hello, Gemini!".to_string(),
            ..Default::default()
        }
    ],
    ..Default::default()
};

let response = provider.send_message(&request).await?;
println!("{}", response.content);
```

### Step 4: Advanced Features

```rust
// Use advanced provider for full features
use crate::core::llm::providers::google_advanced::GoogleAdvancedProvider;

let provider = GoogleAdvancedProvider::new(api_key)?
    .with_media_resolution(MediaResolution::MediaResolutionMedium)
    .with_safety_settings(SafetySettings::default())
    .with_explicit_caching(true);
```

### Step 5: Feature-Specific Providers

```rust
// Multimodal generation
use crate::core::llm::providers::google_multimodal::GoogleMultimodalProvider;
let multimodal = GoogleMultimodalProvider::new(api_key)?;

// RAG capabilities
use crate::core::llm::providers::google_rag::GoogleRagProvider;
let rag = GoogleRagProvider::new(api_key)?;

// Batch processing
use crate::core::llm::providers::google_batch::GoogleBatchProvider;
let batch = GoogleBatchProvider::new(api_key)?;

// Live API
use crate::core::llm::providers::google_live_api::GoogleLiveApiProvider;
let live = GoogleLiveApiProvider::new(api_key);
```

---

## Troubleshooting

### Common Errors

**1. "Content blocked: [HARM_CATEGORY]"**

- Cause: Safety filter triggered
- Solution: Adjust safety settings to OFF or less restrictive threshold

**2. "Google API Rate Limit Exceeded (429)"**

- Cause: Too many requests
- Solution: Implement exponential backoff, upgrade quota, or use Batch API

**3. "Cache must be at least 4096 tokens"**

- Cause: Cache content too small
- Solution: Increase content size or disable caching

**4. "Thinking level not supported for this model"**

- Cause: Using unsupported thinking level (e.g., EXTREME on Flash)
- Solution: Use supported levels (Flash: 0-2, Pro: 0-1, 3-4)

**5. "WebSocket connection timeout"**

- Cause: Live API session expired
- Solution: Reconnect with resumption token, reduce session duration

**6. "Thought signature required for function calling"**

- Cause: Gemini 3 strict validation
- Solution: Include dummy signature: `"thoughtSignature": "context_engineering_is_the_way_to_go"`

### Debug Mode

```rust
// Enable tracing
tracing_subscriber::fmt()
    .with_max_level(tracing::Level::DEBUG)
    .init();

// Debug requests
tracing::debug!("Request: {:?}", request);
```

### Support

- **Documentation:** https://ai.google.dev/docs
- **API Status:** https://status.cloud.google.com
- **Issue Tracker:** GitHub repository
- **Discord:** AGI Workforce community

---

## Changelog

### Version 1.0.0 (2026-02-01)

**Added:**

- ✅ Gemini 3 Pro and Flash models
- ✅ Thinking levels (0-4)
- ✅ Multimodal generation (Nano Banana, Imagen 4, Veo 3.1, TTS)
- ✅ RAG capabilities (File Search, URL Context, Long Context)
- ✅ Grounding (Google Search, Google Maps)
- ✅ Code Execution (Python sandbox)
- ✅ Computer Use (browser automation)
- ✅ Batch API (50% cost savings)
- ✅ Live API (real-time audio streaming)
- ✅ Media Resolution (4 levels)
- ✅ Context Caching (75% discount)
- ✅ Safety Settings (configurable filtering)

**Documentation:**

- Complete API reference
- Integration guides
- 20+ code examples
- Best practices guide
- Troubleshooting guide

---

## License

This documentation is part of AGI Workforce, licensed under the project license.

---

**Last Updated:** 2026-02-01
**Version:** 1.0.0
**Status:** Production Ready ✅
