# Phase 4 Implementation Plan: Advanced Google/Gemini Capabilities

**Date:** 2026-02-01
**Status:** 🔄 IN PROGRESS
**Based on:** 20 Google AI Studio documentation pieces

## Overview

Phase 4 extends the Google provider with advanced Gemini capabilities documented in the complete Google AI Studio documentation suite.

## Documentation Summary

**Received Documentation (20 pieces):**

1. Gemini 3 Text Models (Pro, Flash)
2. Nano Banana Image Generation
3. Gemini 2.5 TTS
4. Veo 3.1 Video Generation
5. Imagen 4
6. Rate Limits & Usage Tiers
7. Text Generation API
8. Thinking API (thinking_level, thinking_budget)
9. Thought Signatures
10. Structured Outputs
11. Function Calling
12. Long Context (1M+ tokens)
13. Deep Research Agent
14. Grounding with Google Search
15. Grounding with Google Maps
16. Code Execution
17. URL Context
18. Computer Use (Preview)
19. File Search
20. Live API

## Implementation Objectives

### Primary Goals

1. **Gemini 3 Model Support**
   - Gemini 3 Pro (2M context)
   - Gemini 3 Flash (1M context)
   - Thinking capabilities (thinking_level 0-4)

2. **Multimodal Generation**
   - Image: Nano Banana, Imagen 4
   - Video: Veo 3.1
   - Audio: TTS (Gemini 2.5), Live API native audio

3. **Advanced Thinking**
   - thinking_level (Gemini 3): 0-4 scale
   - thinking_budget (Gemini 2.5): token-based
   - Thought signatures for function calling
   - Thought summaries

4. **RAG & Knowledge**
   - File Search with embeddings
   - URL Context
   - Long context (1M+ tokens)

5. **Grounding**
   - Google Search integration
   - Google Maps integration

6. **Code Execution**
   - Python execution environment
   - Library support (NumPy, Pandas, etc.)
   - Image generation (PIL)

7. **Computer Use** (Preview)
   - Browser automation
   - GUI interaction

8. **Live API**
   - Real-time bidirectional communication
   - Native audio streaming
   - Voice Activity Detection (VAD)

### Secondary Goals

- Rate limit handling by usage tier
- Deep Research Agent integration
- Enhanced structured outputs
- Advanced function calling with thought signatures

## Architecture Changes

### New Request Parameters

```rust
pub struct GoogleRequest {
    // Existing fields...

    // Gemini 3 Thinking
    pub thinking_level: Option<u8>, // 0-4

    // Multimodal generation
    pub image_generation: Option<ImageGenConfig>,
    pub video_generation: Option<VideoGenConfig>,
    pub tts_config: Option<TTSConfig>,

    // RAG
    pub file_search: Option<FileSearchConfig>,
    pub url_context: Option<Vec<String>>,

    // Grounding
    pub google_search: Option<bool>,
    pub google_maps: Option<GoogleMapsConfig>,

    // Code execution
    pub code_execution: Option<bool>,

    // Computer use
    pub computer_use: Option<ComputerUseConfig>,

    // Live API
    pub live_session: Option<LiveSessionConfig>,
}

pub struct ImageGenConfig {
    pub model: String, // "nano-banana" or "imagen-4"
    pub aspect_ratio: Option<String>,
    pub safety_settings: Option<Vec<SafetySetting>>,
}

pub struct VideoGenConfig {
    pub model: String, // "veo-3.1"
    pub duration: Option<f32>, // 2s-20s
    pub aspect_ratio: Option<String>,
}

pub struct TTSConfig {
    pub voice: String,
    pub language: Option<String>,
}

pub struct FileSearchConfig {
    pub files: Vec<String>, // File IDs
    pub semantic_threshold: Option<f32>,
}

pub struct GoogleMapsConfig {
    pub place_id: Option<String>,
    pub location: Option<(f64, f64)>, // lat, lng
}

pub struct ComputerUseConfig {
    pub display_width: u32,
    pub display_height: u32,
}

pub struct LiveSessionConfig {
    pub modalities: Vec<String>, // ["TEXT", "AUDIO", "VIDEO"]
    pub voice: Option<String>,
    pub speech_config: Option<SpeechConfig>,
}
```

### Response Extensions

```rust
pub struct GoogleResponse {
    // Existing fields...

    // Thinking
    pub thinking_tokens: Option<u32>,
    pub thought_summary: Option<String>,

    // Multimodal outputs
    pub generated_images: Option<Vec<GeneratedImage>>,
    pub generated_video: Option<GeneratedVideo>,
    pub audio_output: Option<Vec<u8>>, // Audio bytes

    // Code execution
    pub code_execution_result: Option<CodeExecutionResult>,

    // Grounding citations
    pub grounding_metadata: Option<GroundingMetadata>,
}

pub struct GeneratedImage {
    pub uri: String,
    pub mime_type: String,
}

pub struct GeneratedVideo {
    pub uri: String,
    pub duration: f32,
}

pub struct CodeExecutionResult {
    pub stdout: String,
    pub stderr: String,
    pub output_images: Vec<GeneratedImage>,
}

pub struct GroundingMetadata {
    pub search_results: Vec<SearchResult>,
    pub map_results: Vec<MapResult>,
    pub url_citations: Vec<UrlCitation>,
}
```

## Implementation Strategy

### Phase 4.1: Gemini 3 Models & Thinking

**Priority:** HIGH
**Files:** `apps/desktop/src-tauri/src/core/llm/providers/google.rs`

- Add Gemini 3 Pro/Flash to model enum
- Implement thinking_level parameter (0-4)
- Handle thought summaries in responses
- Update cost calculation for Gemini 3 pricing

### Phase 4.2: Multimodal Generation

**Priority:** HIGH
**Files:** `google.rs`, new `multimodal_gen.rs`

- Nano Banana image generation
- Imagen 4 support
- Veo 3.1 video generation
- TTS integration (Gemini 2.5)
- Handle generated content in responses

### Phase 4.3: Advanced Thinking

**Priority:** MEDIUM
**Files:** `google.rs`

- Thought signatures for function calling
- Enhanced thinking_budget handling
- Thinking token tracking and pricing

### Phase 4.4: RAG Capabilities

**Priority:** MEDIUM
**Files:** `google.rs`, new `rag.rs`

- File Search with embeddings
- URL Context support
- Long context optimization (1M+ tokens)

### Phase 4.5: Grounding

**Priority:** MEDIUM
**Files:** `google.rs`, new `grounding.rs`

- Google Search integration
- Google Maps integration
- Citation handling and metadata

### Phase 4.6: Code Execution

**Priority:** LOW
**Files:** `google.rs`, new `code_execution.rs`

- Python code execution
- Library support
- Image output handling

### Phase 4.7: Computer Use (Preview)

**Priority:** LOW
**Files:** `google.rs`, new `computer_use.rs`

- Browser automation support
- Screenshot/action integration
- Preview feature flags

### Phase 4.8: Live API

**Priority:** LOW
**Files:** new `live_api.rs`

- WebSocket connection management
- Native audio streaming
- VAD integration
- Real-time bidirectional communication

## Pricing Structure

### Text Models

| Model            | Input (per 1M) | Output (per 1M) | Context |
| ---------------- | -------------- | --------------- | ------- |
| Gemini 3 Pro     | $1.25          | $5.00           | 2M      |
| Gemini 3 Flash   | $0.10          | $0.40           | 1M      |
| Gemini 2.5 Pro   | $1.25          | $5.00           | 2M      |
| Gemini 2.5 Flash | $0.075         | $0.30           | 1M      |

### Multimodal Generation

| Model         | Cost per Generation |
| ------------- | ------------------- |
| Nano Banana   | $0.04/image         |
| Imagen 4      | $0.04/image         |
| Veo 3.1 (2s)  | $0.13/video         |
| Veo 3.1 (20s) | $1.30/video         |
| TTS           | $10/1M chars        |

### Thinking Tokens

- Gemini 3 Pro: $2.50/1M thinking tokens
- Gemini 3 Flash: $0.20/1M thinking tokens
- Gemini 2.5 Pro: $1.25/1M thinking tokens
- Gemini 2.5 Flash: $0.075/1M thinking tokens

### Features

- Google Search Grounding: $35/1000 queries
- File Search: $0.039/1000 queries
- Code Execution: Free

## Testing Strategy

### Unit Tests

- Gemini 3 model selection
- Thinking level parameter handling
- Multimodal request/response parsing
- Cost calculation for all new features
- Grounding metadata parsing

### Integration Tests

- End-to-end Gemini 3 text generation
- Image generation (Nano Banana, Imagen 4)
- Video generation (Veo 3.1)
- TTS output
- File Search queries
- Google Search grounding
- Code execution

### Performance Tests

- Long context handling (1M+ tokens)
- Live API latency
- Streaming performance

## Documentation Updates

- **LLM_PROVIDER_API_REFERENCE.md** - Add all new Google parameters
- **GOOGLE_ADVANCED_FEATURES.md** - New comprehensive guide
- **MULTIMODAL_GENERATION.md** - Image/video/audio generation guide
- **GROUNDING_GUIDE.md** - Search and Maps integration
- **LIVE_API_GUIDE.md** - Real-time communication setup

## Backward Compatibility

All Phase 4 changes must be:

- ✅ Fully backward compatible
- ✅ Optional (new parameters default to None)
- ✅ No breaking changes to existing API

## Success Criteria

- [ ] All Gemini 3 models supported
- [ ] Thinking levels 0-4 working
- [ ] Image generation (both models) functional
- [ ] Video generation functional
- [ ] TTS working
- [ ] File Search operational
- [ ] Google Search grounding working
- [ ] Code execution functional
- [ ] 100% test pass rate
- [ ] Documentation complete
- [ ] Production ready

## Timeline Estimate

- **Phase 4.1:** Gemini 3 & Thinking - 2 hours
- **Phase 4.2:** Multimodal Generation - 3 hours
- **Phase 4.3:** Advanced Thinking - 1 hour
- **Phase 4.4:** RAG Capabilities - 2 hours
- **Phase 4.5:** Grounding - 2 hours
- **Phase 4.6:** Code Execution - 1 hour
- **Phase 4.7:** Computer Use - 2 hours
- **Phase 4.8:** Live API - 3 hours

**Total Estimate:** 16 hours (can be parallelized)

## Execution Approach

Use **parallel agents** for maximum efficiency:

- Agent 1: Phase 4.1-4.3 (Core Gemini 3 + Thinking)
- Agent 2: Phase 4.2 (Multimodal Generation)
- Agent 3: Phase 4.4-4.5 (RAG + Grounding)
- Agent 4: Phase 4.6-4.8 (Code Execution + Computer Use + Live API)

## Next Steps

1. Begin Phase 4.1 implementation
2. Set up test infrastructure for new features
3. Create documentation framework
4. Deploy parallel agents for implementation

---

**Status:** Ready to begin implementation
**Documentation:** Complete (20 pieces received)
**Dependencies:** Phase 3 complete ✅
