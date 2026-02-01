# Google Advanced Provider Integration Guide

## Overview

This guide explains how to integrate the new `GoogleAdvancedProvider` into the AGI Workforce application to enable Computer Use, Media Resolution, Context Caching, and Safety Settings.

## Features

### 1. Computer Use (Preview)

- Browser automation and screen interaction
- Screenshot capture and analysis
- Action execution (clicks, keyboard input)
- Configurable display dimensions

### 2. Media Resolution

- 4 levels: LOW (280 tokens), MEDIUM (560), HIGH (1120), ULTRA_HIGH (2240)
- Global resolution setting for all media
- Per-part resolution for Gemini 3 (v1alpha)
- Significant cost savings by choosing appropriate resolution

### 3. Context Caching

- **Implicit caching**: Automatic, zero-config (default)
- **Explicit caching**: Full control with cache management API
- 75% discount on cached input tokens
- Minimum 4096 tokens for caching
- TTL-based cache lifecycle

### 4. Safety Settings

- 4 harm categories: Harassment, Hate Speech, Sexually Explicit, Dangerous
- 5 thresholds: OFF, BLOCK_NONE, BLOCK_ONLY_HIGH, BLOCK_MEDIUM_AND_ABOVE, BLOCK_LOW_AND_ABOVE
- Default: OFF for Gemini 2.5+ (maximum flexibility)
- Per-request safety configuration

## Installation

The provider is already included in the `llm/providers` module. No additional dependencies required.

## Basic Usage

### Step 1: Import the Provider

```rust
use crate::core::llm::providers::{
    GoogleAdvancedProvider,
    ComputerUseConfig,
    MediaResolution,
    SafetySettings,
};
use crate::core::llm::{LLMProvider, LLMRequest, ChatMessage};
```

### Step 2: Create Provider Instance

```rust
// Basic setup
let provider = GoogleAdvancedProvider::new(api_key)?;

// With advanced features
let provider = GoogleAdvancedProvider::new(api_key)?
    .with_computer_use(ComputerUseConfig::default())
    .with_media_resolution(MediaResolution::MediaResolutionMedium)
    .with_safety_settings(SafetySettings::default())
    .with_explicit_caching(true);
```

### Step 3: Make Requests

```rust
let messages = vec![ChatMessage {
    role: "user".to_string(),
    content: "Analyze this image".to_string(),
    tool_calls: None,
    tool_call_id: None,
    multimodal_content: Some(vec![/* image content */]),
}];

let request = LLMRequest::new(messages, "gemini-2.5-pro".to_string());
let response = provider.send_message(&request).await?;
```

## Integration Points

### A. LLM Router Integration

Add Google Advanced as a provider option in the LLM router:

```rust
// In llm_router.rs
use crate::core::llm::providers::GoogleAdvancedProvider;

impl LLMRouter {
    pub fn create_google_advanced_provider(
        &self,
        api_key: String,
        config: GoogleAdvancedConfig,
    ) -> Result<Box<dyn LLMProvider>, Box<dyn Error + Send + Sync>> {
        let provider = GoogleAdvancedProvider::new(api_key)?
            .with_media_resolution(config.media_resolution)
            .with_safety_settings(config.safety_settings);

        if config.enable_computer_use {
            provider = provider.with_computer_use(config.computer_config);
        }

        if config.enable_explicit_caching {
            provider = provider.with_explicit_caching(true);
        }

        Ok(Box::new(provider))
    }
}
```

### B. Settings Store Integration

Add configuration options to the settings store:

```rust
// In settings store
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct GoogleAdvancedSettings {
    pub media_resolution: String, // "low", "medium", "high", "ultra_high"
    pub enable_computer_use: bool,
    pub computer_use_width: u32,
    pub computer_use_height: u32,
    pub enable_explicit_caching: bool,
    pub cache_ttl_seconds: u32,
    pub safety_harassment: String, // "off", "block_none", etc.
    pub safety_hate_speech: String,
    pub safety_sexually_explicit: String,
    pub safety_dangerous: String,
}

impl Default for GoogleAdvancedSettings {
    fn default() -> Self {
        Self {
            media_resolution: "medium".to_string(),
            enable_computer_use: false,
            computer_use_width: 1920,
            computer_use_height: 1080,
            enable_explicit_caching: false,
            cache_ttl_seconds: 3600,
            safety_harassment: "off".to_string(),
            safety_hate_speech: "off".to_string(),
            safety_sexually_explicit: "off".to_string(),
            safety_dangerous: "off".to_string(),
        }
    }
}
```

### C. Tauri Commands

Add commands for feature control:

```rust
// In sys/commands/settings.rs

#[tauri::command]
pub async fn google_set_media_resolution(
    resolution: String,
) -> Result<(), String> {
    // Convert string to MediaResolution enum
    let res = match resolution.as_str() {
        "low" => MediaResolution::MediaResolutionLow,
        "medium" => MediaResolution::MediaResolutionMedium,
        "high" => MediaResolution::MediaResolutionHigh,
        "ultra_high" => MediaResolution::MediaResolutionUltraHigh,
        _ => return Err("Invalid resolution".into()),
    };

    // Update settings
    // settings.google_advanced.media_resolution = resolution;
    Ok(())
}

#[tauri::command]
pub async fn google_enable_computer_use(
    enable: bool,
    width: u32,
    height: u32,
) -> Result<(), String> {
    // Update settings
    Ok(())
}

#[tauri::command]
pub async fn google_create_cache(
    display_name: String,
    model: String,
    system_instruction: Option<String>,
    ttl_seconds: u32,
) -> Result<String, String> {
    // Create cache and return cache name
    Ok("cachedContents/abc123".to_string())
}

#[tauri::command]
pub async fn google_list_caches() -> Result<Vec<CacheInfo>, String> {
    // List all active caches
    Ok(vec![])
}

#[tauri::command]
pub async fn google_delete_cache(
    cache_name: String,
) -> Result<(), String> {
    // Delete cache
    Ok(())
}
```

### D. Frontend Integration (React)

Add settings UI components:

```typescript
// In SettingsPanel.tsx

import { invoke } from '@tauri-apps/api/core';

interface GoogleAdvancedSettings {
  mediaResolution: 'low' | 'medium' | 'high' | 'ultra_high';
  enableComputerUse: boolean;
  computerUseWidth: number;
  computerUseHeight: number;
  enableExplicitCaching: boolean;
  cacheTtlSeconds: number;
  safetyHarassment: string;
  safetyHateSpeech: string;
  safetySexuallyExplicit: string;
  safetyDangerous: string;
}

function GoogleAdvancedSettings() {
  const [settings, setSettings] = useState<GoogleAdvancedSettings>({
    mediaResolution: 'medium',
    enableComputerUse: false,
    computerUseWidth: 1920,
    computerUseHeight: 1080,
    enableExplicitCaching: false,
    cacheTtlSeconds: 3600,
    safetyHarassment: 'off',
    safetyHateSpeech: 'off',
    safetySexuallyExplicit: 'off',
    safetyDangerous: 'off',
  });

  const handleMediaResolutionChange = async (resolution: string) => {
    await invoke('google_set_media_resolution', { resolution });
    setSettings({ ...settings, mediaResolution: resolution as any });
  };

  const handleComputerUseToggle = async (enable: boolean) => {
    await invoke('google_enable_computer_use', {
      enable,
      width: settings.computerUseWidth,
      height: settings.computerUseHeight,
    });
    setSettings({ ...settings, enableComputerUse: enable });
  };

  return (
    <div className="google-advanced-settings">
      <h3>Google Gemini Advanced Features</h3>

      {/* Media Resolution */}
      <div className="setting-group">
        <label>Media Resolution</label>
        <select
          value={settings.mediaResolution}
          onChange={(e) => handleMediaResolutionChange(e.target.value)}
        >
          <option value="low">Low (280 tokens/image)</option>
          <option value="medium">Medium (560 tokens/image)</option>
          <option value="high">High (1120 tokens/image)</option>
          <option value="ultra_high">Ultra High (2240 tokens/image)</option>
        </select>
        <p className="help-text">
          Higher resolution = better quality but more tokens/cost
        </p>
      </div>

      {/* Computer Use */}
      <div className="setting-group">
        <label>
          <input
            type="checkbox"
            checked={settings.enableComputerUse}
            onChange={(e) => handleComputerUseToggle(e.target.checked)}
          />
          Enable Computer Use (Browser Automation)
        </label>
        {settings.enableComputerUse && (
          <div className="sub-settings">
            <input
              type="number"
              placeholder="Width"
              value={settings.computerUseWidth}
              onChange={(e) =>
                setSettings({ ...settings, computerUseWidth: parseInt(e.target.value) })
              }
            />
            <input
              type="number"
              placeholder="Height"
              value={settings.computerUseHeight}
              onChange={(e) =>
                setSettings({ ...settings, computerUseHeight: parseInt(e.target.value) })
              }
            />
          </div>
        )}
      </div>

      {/* Caching */}
      <div className="setting-group">
        <label>
          <input
            type="checkbox"
            checked={settings.enableExplicitCaching}
            onChange={(e) =>
              setSettings({ ...settings, enableExplicitCaching: e.target.checked })
            }
          />
          Enable Explicit Caching (75% discount on repeated content)
        </label>
      </div>

      {/* Safety Settings */}
      <div className="setting-group">
        <h4>Safety Settings</h4>
        <SafetySettingControl
          label="Harassment"
          value={settings.safetyHarassment}
          onChange={(v) => setSettings({ ...settings, safetyHarassment: v })}
        />
        <SafetySettingControl
          label="Hate Speech"
          value={settings.safetyHateSpeech}
          onChange={(v) => setSettings({ ...settings, safetyHateSpeech: v })}
        />
        <SafetySettingControl
          label="Sexually Explicit"
          value={settings.safetySexuallyExplicit}
          onChange={(v) => setSettings({ ...settings, safetySexuallyExplicit: v })}
        />
        <SafetySettingControl
          label="Dangerous"
          value={settings.safetyDangerous}
          onChange={(v) => setSettings({ ...settings, safetyDangerous: v })}
        />
      </div>
    </div>
  );
}

function SafetySettingControl({ label, value, onChange }) {
  return (
    <div className="safety-control">
      <label>{label}</label>
      <select value={value} onChange={(e) => onChange(e.target.value)}>
        <option value="off">Off (No filtering)</option>
        <option value="block_none">Block None</option>
        <option value="block_only_high">Block Only High</option>
        <option value="block_medium_and_above">Block Medium+</option>
        <option value="block_low_and_above">Block Low+ (Strictest)</option>
      </select>
    </div>
  );
}
```

## Model Routing Strategy

Add Google Advanced models to the router with appropriate task routing:

```rust
impl RouterContext {
    pub fn recommend_google_advanced_model(&self, task: TaskType) -> &'static str {
        match task {
            TaskType::Vision => {
                // Use high resolution for vision tasks
                "gemini-2.5-pro" // with MediaResolutionHigh
            }
            TaskType::ComplexReasoning => {
                // Use Gemini 3 with thinking
                "gemini-3-deep-think"
            }
            TaskType::Chat => {
                // Use medium resolution, caching enabled
                "gemini-2.5-flash" // with explicit caching
            }
            TaskType::CodeGeneration => {
                "gemini-3-pro"
            }
            _ => "gemini-2.5-flash",
        }
    }
}
```

## Cost Tracking

Integrate advanced cost tracking for caching and media resolution:

```rust
#[derive(Debug, Clone)]
pub struct GoogleAdvancedCostBreakdown {
    pub uncached_input_cost: f64,
    pub cached_input_cost: f64,
    pub output_cost: f64,
    pub thinking_cost: f64,
    pub total_cost: f64,
    pub tokens_saved_by_caching: u32,
    pub cost_saved_by_caching: f64,
}

impl GoogleAdvancedCostBreakdown {
    pub fn from_response(response: &LLMResponse, model: &str) -> Self {
        let input_tokens = response.prompt_tokens.unwrap_or(0);
        let output_tokens = response.completion_tokens.unwrap_or(0);
        let cached_tokens = response.cache_read_input_tokens.unwrap_or(0);
        let thinking_tokens = response.thinking_tokens.unwrap_or(0);

        // Calculate breakdown
        // ... (implementation)

        Self {
            uncached_input_cost: 0.0,
            cached_input_cost: 0.0,
            output_cost: 0.0,
            thinking_cost: 0.0,
            total_cost: response.cost.unwrap_or(0.0),
            tokens_saved_by_caching: cached_tokens,
            cost_saved_by_caching: 0.0,
        }
    }
}
```

## Migration Path

### Phase 1: Add Provider (Done ✓)

- Create `google_advanced.rs` provider
- Register in module system
- Add comprehensive tests

### Phase 2: Settings Integration (Next)

1. Add `GoogleAdvancedSettings` to settings store
2. Create Tauri commands for configuration
3. Add UI components in SettingsPanel

### Phase 3: Router Integration

1. Add Google Advanced to provider factory
2. Implement task-based model selection
3. Add cost tracking for advanced features

### Phase 4: Feature Enablement

1. Enable Computer Use for browser automation tasks
2. Configure media resolution based on task type
3. Enable explicit caching for long conversations
4. Set safety settings based on deployment mode (dev/prod)

### Phase 5: Monitoring & Optimization

1. Track cache hit rates
2. Monitor cost savings from caching
3. Analyze media resolution impact on quality/cost
4. Fine-tune safety settings based on user feedback

## Best Practices

### 1. Media Resolution

- **Default to MEDIUM** for general use (560 tokens/image)
- **Use LOW** for thumbnails, quick classification (280 tokens)
- **Use HIGH** for OCR, detailed analysis (1120 tokens)
- **Use ULTRA_HIGH** only for medical imaging, extreme detail (2240 tokens)

### 2. Caching

- **Use implicit caching** for most applications (automatic)
- **Use explicit caching** when:
  - Documents exceed 4K tokens
  - System prompts have extensive examples
  - Conversations span many turns
  - Users repeatedly ask about same content
- **Set TTLs appropriately**:
  - Short sessions: 1800s (30 min)
  - Active conversations: 3600s (1 hour)
  - Knowledge bases: 86400s (24 hours)

### 3. Safety Settings

- **Development**: Use `Off` for all categories (maximum flexibility)
- **Production**: Use `BlockMediumAndAbove` for harassment, hate speech, sexually explicit
- **High-risk applications**: Use `BlockLowAndAbove` for dangerous content
- **Monitor**: Check `finish_reason` for safety blocks and adjust thresholds

### 4. Computer Use

- **Enable only for automation tasks** (browser, UI testing)
- **Set display dimensions** to match target environment
- **Disable in production** unless explicitly needed (preview feature)

## Testing

### Unit Tests

```bash
cd apps/desktop/src-tauri
cargo test google_advanced
```

### Integration Tests

```bash
# Set API key
export GOOGLE_API_KEY=your_api_key

# Run integration tests (ignored by default)
cargo test google_advanced --ignored
```

### Manual Testing

Use the examples in `google_advanced_examples.rs` as a guide for manual testing.

## Troubleshooting

### Issue: High Token Consumption

**Solution**: Lower media resolution from HIGH to MEDIUM or LOW

### Issue: Cache Not Working

**Solution**: Ensure content exceeds minimum 4096 tokens for caching

### Issue: Content Blocked by Safety

**Solution**: Lower safety thresholds or use `Off` for development

### Issue: Computer Use Not Available

**Solution**: Verify model supports Computer Use (gemini-2.5-computer-use or gemini-3-\*)

## API Rate Limits

Gemini API has rate limits per model:

- Free tier: 15 RPM (requests per minute)
- Paid tier: Varies by plan

Monitor rate limit errors and implement exponential backoff.

## Cost Estimates

### Media Resolution Cost Impact

For 100 images:

- LOW: 28,000 tokens ≈ $0.0035 (at $0.125/1M tokens)
- MEDIUM: 56,000 tokens ≈ $0.007
- HIGH: 112,000 tokens ≈ $0.014
- ULTRA_HIGH: 224,000 tokens ≈ $0.028

### Caching Cost Savings

For a 10K token document repeated 100 times:

- Without caching: 1M tokens × $1.25 = $1.25
- With caching: 10K (first) + 990K × 0.25 = $0.25
- **Savings: $1.00 (80%)**

## Resources

- [Google Advanced Provider Documentation](./google_advanced_docs.md)
- [Example Usage Patterns](../src-tauri/src/core/llm/providers/google_advanced_examples.rs)
- [Gemini API Documentation](https://ai.google.dev/docs)
- [Context Caching Guide](https://ai.google.dev/docs/caching)

## Support

For issues or questions:

1. Check troubleshooting section above
2. Review example code in `google_advanced_examples.rs`
3. Consult Gemini API documentation
4. File an issue with reproduction steps
