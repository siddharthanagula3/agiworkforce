# Google Advanced Provider - Feature Documentation

## Overview

The `GoogleAdvancedProvider` extends the standard Google provider with four advanced features:

1. **Computer Use (Preview)** - Browser automation and screen control
2. **Media Resolution** - Configurable image/video token consumption
3. **Context Caching** - Explicit and implicit prompt caching
4. **Safety Settings** - Granular content filtering controls

## 1. Computer Use (Preview)

### Overview
Computer Use enables the model to interact with a computer interface through screenshots and actions. This is particularly useful for browser automation, UI testing, and screen interaction tasks.

### Configuration

```rust
use crate::core::llm::providers::{GoogleAdvancedProvider, ComputerUseConfig};

let config = ComputerUseConfig {
    display_width: 1920,
    display_height: 1080,
    enable_screenshots: true,
    enable_actions: true,
};

let provider = GoogleAdvancedProvider::new(api_key)?
    .with_computer_use(config);
```

### Default Settings
- Display: 1920x1080 (configurable)
- Screenshots: Enabled
- Actions (clicks, keyboard): Enabled

### Use Cases
- Browser automation testing
- UI interaction workflows
- Screen recording analysis
- Application control

### Preview Note
This feature requires the preview API endpoint and may have usage limits. Check the latest Gemini API documentation for availability.

## 2. Media Resolution

### Overview
Media Resolution controls the token consumption for images, videos, and PDFs. Higher resolution means better quality understanding but higher token costs.

### Resolution Levels

| Resolution | Tokens per Image | Use Case |
|-----------|------------------|----------|
| LOW | 280 | Quick classification, simple object detection |
| MEDIUM | 560 | General purpose (default) |
| HIGH | 1120 | Detailed analysis, OCR, fine-grained recognition |
| ULTRA_HIGH | 2240 | Extremely detailed analysis, medical imaging |

### Configuration

#### Global Resolution (All Media)
```rust
use crate::core::llm::providers::{GoogleAdvancedProvider, MediaResolution};

let provider = GoogleAdvancedProvider::new(api_key)?
    .with_media_resolution(MediaResolution::MediaResolutionHigh);
```

#### Per-Part Resolution (Gemini 3 Only, v1alpha API)
Per-part resolution is automatically applied when converting content parts. Each image/video part receives the configured media resolution setting.

### API Versions
- **Global resolution**: Available in v1beta and v1alpha
- **Per-part resolution**: Gemini 3 only, v1alpha API required

### Token Costs Example
For a request with 3 images at HIGH resolution:
- Token cost: 3 × 1120 = 3360 tokens
- At MEDIUM (default): 3 × 560 = 1680 tokens
- Savings of 50% by using MEDIUM instead of HIGH

### Best Practices
1. Use LOW for simple classification tasks
2. Use MEDIUM for general purpose (default)
3. Use HIGH only when detail is critical
4. Use ULTRA_HIGH sparingly for specialized tasks

## 3. Context Caching

### Overview
Context caching reduces costs and latency for repeated prompts by caching common context (system instructions, conversation history, documents).

### Caching Modes

#### Implicit Caching (Default, Automatic)
Gemini automatically caches frequently repeated content. No code changes required.

```rust
let provider = GoogleAdvancedProvider::new(api_key)?;
// Implicit caching is enabled by default
```

Benefits:
- Zero configuration
- Automatic optimization
- No cache management overhead

#### Explicit Caching (Advanced)
Manually create and manage caches for maximum control.

```rust
let provider = GoogleAdvancedProvider::new(api_key)?
    .with_explicit_caching(true);

// Create a cache
let cache = provider.create_cache(
    "my-conversation-cache".to_string(),
    "gemini-2.5-pro".to_string(),
    Some("You are a helpful assistant.".to_string()),
    vec![/* conversation history */],
    "3600s".to_string(), // 1 hour TTL
).await?;

// Use the cache in requests
let mut request = LLMRequest::new(messages, "gemini-2.5-pro".to_string());
request.conversation_id = Some(cache.name.unwrap());
let response = provider.send_message(&request).await?;
```

### Cache Operations

#### Create Cache
```rust
let cache = provider.create_cache(
    display_name,
    model,
    system_instruction,
    contents,
    ttl, // "3600s" = 1 hour
).await?;
```

#### Get Cache
```rust
let cache = provider.get_cache("cachedContents/abc123").await?;
```

#### List Caches
```rust
let caches = provider.list_caches().await?;
```

#### Update Cache TTL
```rust
let updated = provider.update_cache(
    "cachedContents/abc123",
    "7200s".to_string(), // Extend to 2 hours
).await?;
```

#### Delete Cache
```rust
provider.delete_cache("cachedContents/abc123").await?;
```

### Cache Minimum Token Requirements

| Model Family | Minimum Tokens |
|-------------|---------------|
| Gemini 3.x | 4096 |
| Gemini 2.5.x | 4096 |
| Gemini 2.x | 4096 |

### Cache Pricing
Cached tokens receive a **75% discount** on input token costs:
- Uncached input: $1.25 per 1M tokens (Gemini 2.5 Pro)
- Cached input: $0.3125 per 1M tokens (75% off)

### Cost Example
Request with 1M input tokens, 500K cached:
- Uncached: 500K × $1.25/1M = $0.625
- Cached: 500K × $0.3125/1M = $0.15625
- Output: 1M × $5.00/1M = $5.00
- **Total: $5.78** (vs $6.25 without caching)

### Best Practices
1. Use implicit caching for most applications
2. Use explicit caching for:
   - Large documents reused across conversations
   - System prompts with extensive examples
   - Long conversation histories
3. Set appropriate TTLs (1-24 hours typical)
4. Monitor cache hit rates via `cached_content_token_count`

## 4. Safety Settings

### Overview
Safety Settings control content filtering across four harm categories. Gemini 2.5+ defaults to OFF (no filtering) for maximum flexibility.

### Configuration

```rust
use crate::core::llm::providers::{
    GoogleAdvancedProvider, SafetySettings, SafetySetting,
    HarmCategory, HarmBlockThreshold
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
            threshold: HarmBlockThreshold::Off,
        },
        SafetySetting {
            category: HarmCategory::HarmCategoryDangerous,
            threshold: HarmBlockThreshold::BlockOnlyHigh,
        },
    ],
};

let provider = GoogleAdvancedProvider::new(api_key)?
    .with_safety_settings(safety);
```

### Harm Categories
1. `HarmCategoryHarassment` - Harassment and bullying content
2. `HarmCategoryHateSpeech` - Hate speech and discrimination
3. `HarmCategorySexuallyExplicit` - Sexually explicit content
4. `HarmCategoryDangerous` - Dangerous activities or self-harm

### Block Thresholds

| Threshold | Behavior |
|-----------|----------|
| `Off` | No filtering (default for Gemini 2.5+) |
| `BlockNone` | Block nothing (same as Off) |
| `BlockOnlyHigh` | Block only high-probability harmful content |
| `BlockMediumAndAbove` | Block medium and high probability |
| `BlockLowAndAbove` | Block low, medium, and high probability (most strict) |

### Default Settings (Gemini 2.5+)
All categories default to `Off` for maximum flexibility. Earlier models may have different defaults.

### Safety Feedback
Responses include safety ratings even if content isn't blocked:

```rust
// In LLMResponse, check for safety information
if let Some(finish_reason) = response.finish_reason {
    if finish_reason.contains("SAFETY") {
        // Content was blocked due to safety settings
    }
}
```

### Block Handling
If content is blocked, the provider returns an error:
```rust
Err("Content blocked: HARM_CATEGORY_HARASSMENT")
```

### Best Practices
1. Use default `Off` settings for development/testing
2. Enable filtering in production based on your use case
3. Use `BlockMediumAndAbove` for general applications
4. Use `BlockLowAndAbove` only for highly sensitive applications (may cause false positives)
5. Monitor safety ratings in responses to tune thresholds

## Combining Features

All features can be used together:

```rust
use crate::core::llm::providers::{
    GoogleAdvancedProvider, ComputerUseConfig, MediaResolution, SafetySettings
};

let provider = GoogleAdvancedProvider::new(api_key)?
    .with_computer_use(ComputerUseConfig::default())
    .with_media_resolution(MediaResolution::MediaResolutionHigh)
    .with_safety_settings(SafetySettings::default())
    .with_explicit_caching(true);

// Use for advanced multimodal + automation tasks
let request = LLMRequest::new(messages, "gemini-2.5-computer-use".to_string());
let response = provider.send_message(&request).await?;
```

## Model Compatibility

| Feature | Gemini 2.0 | Gemini 2.5 | Gemini 3 |
|---------|-----------|-----------|----------|
| Computer Use | ❌ | ✅ (Preview) | ✅ |
| Media Resolution (Global) | ✅ | ✅ | ✅ |
| Media Resolution (Per-part) | ❌ | ❌ | ✅ (v1alpha) |
| Implicit Caching | ✅ | ✅ | ✅ |
| Explicit Caching | ✅ | ✅ | ✅ |
| Safety Settings | ✅ | ✅ (OFF default) | ✅ (OFF default) |
| Thinking Levels | ❌ | ❌ | ✅ |

## API Endpoints

- Standard features: `v1beta` (default)
- Gemini 3 per-part resolution: `v1alpha` (override with `GOOGLE_API_BASE` env var)

## Testing

Comprehensive tests are included in the module:

```bash
cd apps/desktop/src-tauri
cargo test google_advanced
```

Test coverage includes:
- Media resolution token counts
- Safety settings defaults
- Computer use configuration
- Cost calculation with caching
- Cost calculation with thinking tokens
- Cache minimum token requirements

## Error Handling

All methods return user-friendly errors:
- "Google API Rate Limit Exceeded..." for 429 errors
- "Content blocked: [reason]" for safety blocks
- "Google API Error [code]: [message]" for API errors

## Performance Considerations

1. **Media Resolution**: Higher resolution = more tokens = higher cost
2. **Caching**: Can reduce costs by 75% for repeated content
3. **Computer Use**: May increase latency due to screenshot processing
4. **Safety Settings**: Minimal performance impact

## Cost Optimization Tips

1. Use MEDIUM media resolution by default (560 tokens/image)
2. Enable explicit caching for:
   - Documents > 4K tokens
   - System prompts with examples
   - Long conversation histories
3. Set cache TTLs based on usage patterns (1-24 hours)
4. Monitor `cached_content_token_count` in responses
5. Use thinking tokens only when deep reasoning is required

## Migration from Standard Provider

The advanced provider is backward compatible:

```rust
// Before
let provider = GoogleProvider::new(api_key)?;

// After (with defaults)
let provider = GoogleAdvancedProvider::new(api_key)?;
// Behaves identically to standard provider

// After (with features)
let provider = GoogleAdvancedProvider::new(api_key)?
    .with_media_resolution(MediaResolution::MediaResolutionHigh)
    .with_safety_settings(SafetySettings::default());
```

## References

- [Gemini API Documentation](https://ai.google.dev/docs)
- [Context Caching Guide](https://ai.google.dev/docs/caching)
- [Safety Settings](https://ai.google.dev/docs/safety_settings)
- [Multimodal Guide](https://ai.google.dev/docs/multimodal)
