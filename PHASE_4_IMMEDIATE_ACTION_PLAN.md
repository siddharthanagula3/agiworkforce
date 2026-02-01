# Phase 4 - Immediate Action Plan

**Date:** 2026-02-01
**Priority:** 🔴 CRITICAL
**Estimated Time:** 14 hours total (can be parallelized)

---

## Problem Summary

Phase 4 Google provider implementation has **created all the modules** but **failed to integrate them** with the main LLM API. Users cannot access any new features because:

1. **Missing Parameters:** LLMRequest is missing 10/11 Phase 4 parameters
2. **No Integration:** GoogleProvider.send_message() doesn't call any Phase 4 modules
3. **Broken Promises:** code_execution parameter exists but is ignored

**Impact:** 1000+ lines of orphaned code, features advertised but inaccessible

---

## Quick Fix Priority List

### 🔥 PRIORITY 1: Fix code_execution (1 hour)

**Why First:** Parameter already exists, easiest win, shows pattern

**File:** `/apps/desktop/src-tauri/src/core/llm/providers/google.rs`

**Changes Needed:**

1. Update GoogleRequest struct to include tool_config:

```rust
#[derive(Debug, Clone, Serialize)]
struct GoogleRequest {
    contents: Vec<GoogleContent>,
    #[serde(skip_serializing_if = "Option::is_none")]
    generation_config: Option<GoogleGenerationConfig>,
    #[serde(skip_serializing_if = "Option::is_none")]
    tools: Option<Vec<GoogleTool>>,
    // ADD THIS:
    #[serde(skip_serializing_if = "Option::is_none")]
    tool_config: Option<GoogleToolConfig>,
}

#[derive(Debug, Clone, Serialize)]
struct GoogleToolConfig {
    #[serde(skip_serializing_if = "Option::is_none")]
    code_execution_config: Option<CodeExecutionConfig>,
}
```

2. In send_message() method (around line 324):

```rust
let google_request = GoogleRequest {
    contents: ...,
    generation_config: ...,
    tools: google_tools,
    // ADD THIS:
    tool_config: request.code_execution.and_then(|enabled| {
        if enabled {
            Some(GoogleToolConfig {
                code_execution_config: Some(CodeExecutionConfig { enabled: true }),
            })
        } else {
            None
        }
    }),
};
```

3. Parse code execution results from response (around line 358):

```rust
// In the response parsing section, extract execution results
if let Some(candidate) = google_response.candidates.first() {
    for part in &candidate.content.parts {
        match part {
            GooglePart::Text { text } => { ... }
            GooglePart::ExecutableCode { code } => {
                // Parse and store code execution results
            }
            GooglePart::CodeExecutionResult { result } => {
                // Store in LLMResponse.code_execution_results
            }
            ...
        }
    }
}
```

**Test:**

```bash
cd apps/desktop/src-tauri && cargo test code_execution
```

---

### 🔥 PRIORITY 2: Add Core Parameters (3 hours)

**File:** `/apps/desktop/src-tauri/src/core/llm/mod.rs`

**Add to LLMRequest (after line 83):**

```rust
// Google Gemini Advanced Features (Phase 4)

// Gemini 3 Thinking (0-4 scale, more precise than thinking: ThinkingParameter)
#[serde(skip_serializing_if = "Option::is_none")]
pub thinking_level: Option<u8>, // 0 = disabled, 1-4 = increasing depth

// Google Search Grounding ($35 per 1000 queries)
#[serde(skip_serializing_if = "Option::is_none")]
pub google_search: Option<bool>,

// URL Context Grounding (free, but requires fetching)
#[serde(skip_serializing_if = "Option::is_none")]
pub url_context: Option<Vec<String>>,

// File Search RAG ($0.039 per 1000 queries)
#[serde(skip_serializing_if = "Option::is_none")]
pub file_search_config: Option<serde_json::Value>, // Use Value to avoid circular deps
```

**Update LLMRequest::new() (around line 115):**

```rust
impl LLMRequest {
    pub fn new(messages: Vec<ChatMessage>, model: String) -> Self {
        Self {
            // ... existing fields
            code_execution: None,
            thinking_level: None,
            google_search: None,
            url_context: None,
            file_search_config: None,
            metadata: None,
        }
    }
}
```

**Add to LLMResponse (after line 622):**

```rust
// Grounding metadata (Google Search, Maps citations)
#[serde(skip_serializing_if = "Option::is_none")]
pub grounding_metadata: Option<serde_json::Value>,

// File search results (RAG)
#[serde(skip_serializing_if = "Option::is_none")]
pub file_search_results: Option<Vec<serde_json::Value>>,
```

---

### 🔥 PRIORITY 3: Integrate RAG & Grounding (2 hours)

**File:** `/apps/desktop/src-tauri/src/core/llm/providers/google.rs`

**Refactor send_message() to route features:**

```rust
async fn send_message(
    &self,
    request: &LLMRequest,
) -> Result<LLMResponse, Box<dyn Error + Send + Sync>> {
    // Route to specialized handlers based on request params

    // Check for File Search RAG
    if let Some(file_search_config) = &request.file_search_config {
        let config: FileSearchConfig = serde_json::from_value(file_search_config.clone())?;
        return self.send_message_with_file_search(request, &config).await;
    }

    // Check for URL Context
    if let Some(urls) = &request.url_context {
        if !urls.is_empty() {
            let config = URLContextConfig {
                urls: urls.clone(),
                ..Default::default()
            };
            return self.send_message_with_url_context(request, &config).await;
        }
    }

    // Check for Google Search Grounding
    let mut google_request = GoogleRequest {
        contents: ...,
        generation_config: Some(GoogleGenerationConfig {
            temperature: request.temperature,
            max_output_tokens: request.max_tokens,
            // ADD thinking_level support:
            thinking_level: request.thinking_level,
        }),
        tools: google_tools,
        tool_config: build_tool_config(request), // code_execution + others
        // ADD grounding:
        grounding_config: request.google_search.and_then(|enabled| {
            if enabled {
                Some(GroundingConfig {
                    search: Some(SearchGroundingConfig {
                        enabled: true,
                        ..Default::default()
                    }),
                    ..Default::default()
                })
            } else {
                None
            }
        }),
    };

    // Continue with existing flow...
}
```

**Helper function:**

```rust
fn build_tool_config(request: &LLMRequest) -> Option<GoogleToolConfig> {
    let mut config = GoogleToolConfig::default();
    let mut has_config = false;

    if let Some(true) = request.code_execution {
        config.code_execution_config = Some(CodeExecutionConfig { enabled: true });
        has_config = true;
    }

    if has_config {
        Some(config)
    } else {
        None
    }
}
```

---

### 🔥 PRIORITY 4: Multimodal Generation (4 hours)

**File:** `/apps/desktop/src-tauri/src/core/llm/mod.rs`

**Add to LLMRequest:**

```rust
// Multimodal Generation (separate API calls, merged results)
#[serde(skip_serializing_if = "Option::is_none")]
pub image_generation: Option<serde_json::Value>, // ImageGenConfig

#[serde(skip_serializing_if = "Option::is_none")]
pub video_generation: Option<serde_json::Value>, // VideoGenConfig

#[serde(skip_serializing_if = "Option::is_none")]
pub tts_config: Option<serde_json::Value>, // TTSConfig
```

**Add to LLMResponse:**

```rust
// Generated images (from Nano Banana, Imagen 4)
#[serde(skip_serializing_if = "Option::is_none")]
pub generated_images: Option<Vec<serde_json::Value>>,

// Generated videos (from Veo 3.1)
#[serde(skip_serializing_if = "Option::is_none")]
pub generated_videos: Option<Vec<serde_json::Value>>,
```

**File:** `/apps/desktop/src-tauri/src/core/llm/providers/google.rs`

**Add multimodal handler:**

```rust
impl GoogleProvider {
    async fn send_message(
        &self,
        request: &LLMRequest,
    ) -> Result<LLMResponse, Box<dyn Error + Send + Sync>> {
        // Handle multimodal generation BEFORE text generation
        let mut response = self.handle_text_generation(request).await?;

        // Generate images if requested
        if let Some(image_config) = &request.image_generation {
            let config: ImageGenConfig = serde_json::from_value(image_config.clone())?;
            let multimodal = GoogleMultimodalProvider::new(self.api_key.clone())?;
            let image = multimodal.generate_image(config).await?;
            response.generated_images = Some(vec![serde_json::to_value(image)?]);
            response.cost = Some(response.cost.unwrap_or(0.0) + image.cost.unwrap_or(0.0));
        }

        // Generate videos if requested
        if let Some(video_config) = &request.video_generation {
            let config: VideoGenConfig = serde_json::from_value(video_config.clone())?;
            let multimodal = GoogleMultimodalProvider::new(self.api_key.clone())?;
            let video = multimodal.generate_video(config).await?;
            response.generated_videos = Some(vec![serde_json::to_value(video)?]);
            response.cost = Some(response.cost.unwrap_or(0.0) + video.cost.unwrap_or(0.0));
        }

        Ok(response)
    }

    // Renamed from send_message
    async fn handle_text_generation(
        &self,
        request: &LLMRequest,
    ) -> Result<LLMResponse, Box<dyn Error + Send + Sync>> {
        // Existing send_message logic here
        ...
    }
}
```

---

### 📋 PRIORITY 5: Update GoogleGenerationConfig

**File:** `/apps/desktop/src-tauri/src/core/llm/providers/google.rs`

**Update struct (around line 96):**

```rust
#[derive(Debug, Clone, Serialize)]
struct GoogleGenerationConfig {
    #[serde(skip_serializing_if = "Option::is_none")]
    temperature: Option<f32>,
    #[serde(skip_serializing_if = "Option::is_none")]
    max_output_tokens: Option<u32>,
    // ADD THESE:
    #[serde(skip_serializing_if = "Option::is_none")]
    thinking_level: Option<u8>, // 0-4 for Gemini 3
}
```

**Add grounding structs:**

```rust
#[derive(Debug, Clone, Serialize)]
struct GoogleGroundingConfig {
    #[serde(skip_serializing_if = "Option::is_none")]
    search: Option<GoogleSearchGrounding>,
}

#[derive(Debug, Clone, Serialize)]
struct GoogleSearchGrounding {
    #[serde(rename = "dynamicRetrievalConfig")]
    dynamic_retrieval_config: Option<GoogleDynamicRetrieval>,
}

#[derive(Debug, Clone, Serialize)]
struct GoogleDynamicRetrieval {
    mode: String, // "MODE_DYNAMIC"
    #[serde(skip_serializing_if = "Option::is_none")]
    dynamic_threshold: Option<f32>,
}
```

---

### 📋 PRIORITY 6: Add Integration Tests (2 hours)

**New File:** `/apps/desktop/src-tauri/src/core/llm/tests/google_phase4_tests.rs`

```rust
#[cfg(test)]
mod google_phase4_integration_tests {
    use super::*;
    use crate::core::llm::providers::google::GoogleProvider;
    use crate::core::llm::{LLMProvider, LLMRequest, ChatMessage};

    #[tokio::test]
    async fn test_code_execution_integration() {
        let api_key = std::env::var("GOOGLE_API_KEY").unwrap_or_default();
        if api_key.is_empty() {
            return; // Skip if no API key
        }

        let provider = GoogleProvider::new(api_key).unwrap();
        let request = LLMRequest {
            messages: vec![ChatMessage {
                role: "user".to_string(),
                content: "Calculate 2 + 2 using Python".to_string(),
                ..Default::default()
            }],
            model: "gemini-3-flash".to_string(),
            code_execution: Some(true),
            ..LLMRequest::new(vec![], "".to_string())
        };

        let response = provider.send_message(&request).await.unwrap();

        assert!(response.code_execution_results.is_some());
        assert!(response.content.contains("4"));
    }

    #[tokio::test]
    async fn test_thinking_level_integration() {
        let api_key = std::env::var("GOOGLE_API_KEY").unwrap_or_default();
        if api_key.is_empty() {
            return;
        }

        let provider = GoogleProvider::new(api_key).unwrap();
        let request = LLMRequest {
            messages: vec![ChatMessage {
                role: "user".to_string(),
                content: "Solve: If x^2 = 16, what is x?".to_string(),
                ..Default::default()
            }],
            model: "gemini-3-pro".to_string(),
            thinking_level: Some(3), // Deep thinking
            ..LLMRequest::new(vec![], "".to_string())
        };

        let response = provider.send_message(&request).await.unwrap();

        assert!(response.thinking_tokens.is_some());
        assert!(response.thinking_tokens.unwrap() > 0);
    }

    #[tokio::test]
    async fn test_google_search_grounding() {
        // Test that google_search parameter enables grounding
        let api_key = std::env::var("GOOGLE_API_KEY").unwrap_or_default();
        if api_key.is_empty() {
            return;
        }

        let provider = GoogleProvider::new(api_key).unwrap();
        let request = LLMRequest {
            messages: vec![ChatMessage {
                role: "user".to_string(),
                content: "What are the latest developments in quantum computing?".to_string(),
                ..Default::default()
            }],
            model: "gemini-3-flash".to_string(),
            google_search: Some(true),
            ..LLMRequest::new(vec![], "".to_string())
        };

        let response = provider.send_message(&request).await.unwrap();

        assert!(response.grounding_metadata.is_some());
    }
}
```

**Add to mod.rs:**

```rust
#[cfg(test)]
mod google_phase4_tests;
```

---

### 📋 PRIORITY 7: Update Documentation (1 hour)

**File:** `/docs/LLM_PROVIDER_API_REFERENCE.md`

Add section:

````markdown
## Google Gemini Phase 4 Features

### Thinking Levels (Gemini 3)

```typescript
const request = {
  model: "gemini-3-pro",
  thinking_level: 3, // 0 = off, 1 = basic, 2 = medium, 3 = deep, 4 = extreme
  messages: [...]
};
```
````

### Code Execution (FREE)

```typescript
const request = {
  model: 'gemini-3-flash',
  code_execution: true,
  messages: [{ role: 'user', content: 'Calculate fibonacci(10)' }],
};

// Response includes:
// response.code_execution_results: [{ stdout: "55", stderr: "", ... }]
```

### Google Search Grounding ($35/1000 queries)

```typescript
const request = {
  model: 'gemini-3-flash',
  google_search: true,
  messages: [{ role: 'user', content: 'Latest news on AI safety' }],
};

// Response includes:
// response.grounding_metadata: { search_results: [...], citations: [...] }
```

### File Search RAG ($0.039/1000 queries)

```typescript
const request = {
  model: "gemini-3-pro",
  file_search_config: {
    files: ["file_id_1", "file_id_2"],
    semantic_threshold: 0.7,
    max_results: 10
  },
  messages: [...]
};
```

### Image Generation ($0.04/image)

```typescript
const request = {
  model: "gemini-3-flash",
  image_generation: {
    prompt: "A sunset over mountains",
    model: "imagen-4", // or "nano-banana"
    aspect_ratio: "16:9"
  },
  messages: [...]
};

// Response includes:
// response.generated_images: [{ uri: "...", mime_type: "image/png" }]
```

### Video Generation ($0.13-$1.30/video)

```typescript
const request = {
  model: "gemini-3-flash",
  video_generation: {
    prompt: "A cat playing piano",
    model: "veo-3.1",
    duration: 5, // 2-20 seconds
    aspect_ratio: "16:9"
  },
  messages: [...]
};
```

````

---

## Implementation Order

### Sprint 1: Critical Fixes (1 day)
1. ✅ Priority 1: Fix code_execution (1h)
2. ✅ Priority 2: Add core parameters (3h)
3. ✅ Priority 5: Update GoogleGenerationConfig (1h)
4. ✅ Test: Basic integration tests (1h)

**Deliverable:** Code execution, thinking levels, Google Search work

---

### Sprint 2: RAG & Grounding (1 day)
1. ✅ Priority 3: Integrate RAG & Grounding (2h)
2. ✅ Add grounding metadata parsing (2h)
3. ✅ Test: RAG integration tests (1h)
4. ✅ Update documentation (1h)

**Deliverable:** File search, URL context, grounding work

---

### Sprint 3: Multimodal (1 day)
1. ✅ Priority 4: Multimodal generation (4h)
2. ✅ Test: Image/video generation tests (1h)
3. ✅ Update UI to display generated content (2h)

**Deliverable:** Image/video generation work

---

### Sprint 4: Polish (0.5 days)
1. ✅ Priority 6: Complete integration tests (2h)
2. ✅ Priority 7: Complete documentation (1h)
3. ✅ E2E tests (1h)

**Deliverable:** Production-ready Phase 4

---

## Success Criteria

### Before
- ❌ User-accessible Phase 4 features: 0/11
- ❌ code_execution works: NO
- ❌ Integration tests: 0

### After
- ✅ User-accessible Phase 4 features: 11/11
- ✅ code_execution works: YES
- ✅ Integration tests: 15+
- ✅ Documentation complete
- ✅ E2E tests passing

---

## Validation Commands

```bash
# After each priority:
cd apps/desktop/src-tauri

# Priority 1: Code execution
cargo test code_execution

# Priority 2: Parameters
cargo build  # Should compile with new params

# Priority 3: RAG
cargo test google_rag
cargo test google_grounding

# Priority 4: Multimodal
cargo test google_multimodal

# Priority 6: All integration
cargo test google_phase4

# Final validation
pnpm --filter @agiworkforce/desktop test:e2e
````

---

## Risk Mitigation

### Backward Compatibility

- ✅ All new parameters are `Option<T>` (default: None)
- ✅ Existing requests continue to work unchanged
- ✅ No breaking changes to API surface

### Performance

- ⚠️ Multimodal generation adds latency (image: 2-5s, video: 10-30s)
- ✅ Solution: Run in parallel, show progress indicators
- ⚠️ Google Search grounding adds cost ($35/1000 queries)
- ✅ Solution: Make opt-in, show cost warnings

### Error Handling

- ⚠️ New features may have different error responses
- ✅ Solution: Wrap all new features in try/catch, provide fallback
- ✅ Add user-friendly error messages in error_translator.rs

---

**Total Effort:** 14 hours (2 work days)
**Can Be Parallelized:** Yes (4 parallel agents)
**Risk Level:** LOW (all new code, no breaking changes)
**User Impact:** HIGH (unlocks major features)

---

**Next Step:** Execute Priority 1 (code_execution fix) to establish integration pattern
