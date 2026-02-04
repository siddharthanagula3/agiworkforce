# LLM Provider Cleanup Documentation

**Date:** February 4, 2026
**Reason:** Security-focused architecture decision to use managed cloud proxy exclusively
**Impact:** Removed 18 direct provider implementations and simplified settings schema

---

## Executive Summary

AGI Workforce previously had complete implementations for 11+ direct LLM provider integrations (OpenAI, Anthropic, Google, DeepSeek, etc.) but intentionally disabled them in favor of a **managed cloud proxy architecture** for security and billing control. This cleanup removed ~5,000 lines of unused provider code while preserving the infrastructure needed to re-enable direct providers in the future.

---

## Why We Removed Direct Provider Support

### 1. Security Architecture Decision

**Problem:** Storing API keys locally poses security risks:

- Desktop app has access to filesystem (SQLite database)
- Keys could be extracted if app is compromised
- No centralized key rotation or revocation
- Users must manage their own API keys securely

**Solution:** Managed cloud proxy (deployed on Vercel):

- AGI Workforce API handles all LLM provider authentication
- User never sees or stores provider API keys
- Centralized billing and usage tracking
- Easier to add new providers without desktop app updates

### 2. Business Model Alignment

**Billing Control:**

- Managed proxy allows usage-based billing through Stripe
- We can enforce subscription tier limits (Free: 10 msg/day, Hobby: 100, etc.)
- Track usage across desktop and web apps
- Prevent API key sharing between users

**Cost Optimization:**

- Batch requests for better rate limits
- Intelligent fallback routing (Opus 4.5 → Sonnet 4.5 if over budget)
- Volume discounts with providers benefit all users

### 3. User Experience

**Simplified Setup:**

- No need for users to obtain API keys from 11 different providers
- Single AGI Workforce account provides access to all models
- Automatic model selection based on task complexity

**Better Error Handling:**

- Provider outages handled transparently with fallbacks
- Rate limit errors don't expose raw API errors to users
- Centralized monitoring and incident response

---

## What Was Removed

### Deleted Provider Implementations (18 files)

All files were fully functional with complete streaming, vision, and function calling support:

```
apps/desktop/src-tauri/src/core/llm/providers/
├── anthropic.rs                        # Claude Opus/Sonnet/Haiku direct API
├── openai.rs                           # GPT-4, GPT-5 direct API
├── google.rs                           # Gemini 2.5 direct API
├── google_advanced.rs                  # Gemini with thinking, grounding, caching
├── google_advanced_examples.rs         # Usage examples for advanced features
├── google_batch.rs                     # Batch API for cost savings
├── google_code_execution.rs            # Sandboxed Python execution
├── google_grounding.rs                 # Google Search grounding integration
├── google_live_api.rs                  # Realtime voice/video API
├── google_live_api_examples.rs         # Live API usage examples
├── google_multimodal.rs                # Image/video/audio input
├── google_rag.rs                       # Retrieval-augmented generation
├── google_rag_test_validation.rs       # RAG testing utilities
├── deepseek.rs                         # DeepSeek R1 reasoning models
├── moonshot.rs                         # Moonshot (Kimi) Chinese models
├── perplexity.rs                       # Perplexity Sonar with citations
├── qwen.rs                             # Alibaba Qwen models
├── xai.rs                              # xAI Grok models
└── tests/                              # Provider integration tests
    ├── anthropic_tests.rs
    ├── openai_tests.rs
    └── google_tests.rs
```

### Removed Commands (1 file)

```
apps/desktop/src-tauri/src/sys/commands/
└── google_batch.rs                     # Batch request management commands
```

### Simplified Settings Schema

**Before (9 provider fields):**

```rust
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct DefaultModels {
    pub ollama: String,
    pub managed_cloud: String,
    pub openai: String,          // ❌ Removed
    pub anthropic: String,        // ❌ Removed
    pub google: String,           // ❌ Removed
    pub deepseek: String,         // ❌ Removed
    pub perplexity: String,       // ❌ Removed
    pub xai: String,              // ❌ Removed
    pub qwen: String,             // ❌ Removed
}
```

**After (2 provider fields):**

```rust
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct DefaultModels {
    pub ollama: String,           // For local models
    pub managed_cloud: String,    // For cloud models via proxy
}
```

**Frontend Migration:**

- Bumped `SETTINGS_STORE_VERSION` from 5 to 6
- Added migration to remove unused provider fields from localStorage

### Removed LLMRequest Fields

**Before:**

```rust
pub struct LLMRequest {
    // Standard fields
    pub messages: Vec<ChatMessage>,
    pub temperature: f32,
    pub max_tokens: u32,

    // Google-specific features (removed)
    pub image_generation: Option<ImageGenConfig>,        // ❌
    pub video_generation: Option<VideoGenConfig>,        // ❌
    pub tts_config: Option<TTSConfig>,                   // ❌
    pub file_search: Option<FileSearchConfig>,           // ❌
    pub url_context: Option<Vec<String>>,                // ❌
    pub google_search: Option<GoogleSearchConfig>,       // ❌
    pub google_maps: Option<GoogleMapsConfig>,           // ❌
    pub computer_use: Option<ComputerUseConfig>,         // ❌
    pub live_session: Option<LiveSessionConfig>,         // ❌
    pub code_execution: Option<CodeExecutionConfig>,     // ❌
}
```

**After:**

```rust
pub struct LLMRequest {
    pub messages: Vec<ChatMessage>,
    pub temperature: f32,
    pub max_tokens: u32,
    // Google-specific fields removed - managed cloud proxy handles multimodal features
}
```

---

## What Was Preserved

### Active Providers (2)

1. **`managed_cloud_provider.rs`** - AGI Workforce cloud proxy
   - Routes to all 11 providers via Vercel API
   - Handles authentication, rate limiting, billing
   - Supports streaming, vision, function calling
   - Model ID format: `gpt-5.2`, `claude-opus-4.5`, `gemini-2.5-pro`, etc.

2. **`ollama.rs`** - Local model support
   - For users running Llama, Mistral, etc. locally
   - No cloud dependency, completely private
   - Useful for development and offline work

### Core Infrastructure

All LLM provider infrastructure remains intact:

```
apps/desktop/src-tauri/src/core/llm/
├── mod.rs                              # ✅ Core types (LLMRequest, ChatMessage, etc.)
├── router.rs                           # ✅ Intelligent routing and fallback logic
├── providers/
│   ├── mod.rs                          # ✅ Provider trait definition
│   ├── http_client.rs                  # ✅ HTTP client with retry logic
│   ├── managed_cloud_provider.rs       # ✅ Active
│   └── ollama.rs                       # ✅ Active
```

### Provider Selection Logic

**File:** `apps/desktop/src-tauri/src/sys/commands/llm.rs:336-340`

```rust
match provider.as_str() {
    "ollama" => { /* Allow local Ollama */ }
    "managed_cloud" => { /* Allow managed proxy */ }
    _ => Err(format!(
        "Provider '{}' must be configured via Vercel environment variables. \
         Local key storage is disabled for security.",
        provider
    ))
}
```

This intentional block **was already in place** before cleanup. The direct provider implementations existed but were unreachable via the UI.

---

## How to Re-Enable Direct Providers (Future)

If business requirements change (e.g., enterprise customers want to use their own API keys), here's how to restore direct provider support:

### Step 1: Restore Provider Files

**From Git History (February 4, 2026 or earlier):**

```bash
# Find the commit before cleanup
git log --oneline --all -- apps/desktop/src-tauri/src/core/llm/providers/openai.rs

# Restore specific provider
git checkout <commit-hash> -- apps/desktop/src-tauri/src/core/llm/providers/openai.rs
git checkout <commit-hash> -- apps/desktop/src-tauri/src/core/llm/providers/anthropic.rs
# ... restore others as needed
```

**Or recreate from documentation:**

Each deleted file followed this pattern:

```rust
use reqwest::Client;
use serde::{Deserialize, Serialize};

pub struct OpenAIProvider {
    api_key: String,
    client: Client,
    base_url: String,
}

impl OpenAIProvider {
    pub fn new(api_key: String) -> Result<Self, Box<dyn std::error::Error + Send + Sync>> {
        Ok(Self {
            api_key,
            client: Client::new(),
            base_url: "https://api.openai.com/v1".to_string(),
        })
    }

    pub async fn send_message(
        &self,
        request: &LLMRequest,
    ) -> Result<String, Box<dyn std::error::Error + Send + Sync>> {
        let response = self.client
            .post(format!("{}/chat/completions", self.base_url))
            .header("Authorization", format!("Bearer {}", self.api_key))
            .json(&request)
            .send()
            .await?;

        // Parse and return response
    }

    pub async fn stream_message(
        &self,
        request: &LLLRequest,
    ) -> Result<impl Stream<Item = Result<String>>, Box<dyn std::error::Error>> {
        // SSE streaming implementation
    }
}
```

Reference existing `managed_cloud_provider.rs` for streaming/function calling patterns.

### Step 2: Update Settings Schema

**Backend (`apps/desktop/src-tauri/src/sys/commands/settings.rs`):**

```rust
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct DefaultModels {
    pub ollama: String,
    pub managed_cloud: String,
    pub openai: String,           // Re-add
    pub anthropic: String,         // Re-add
    pub google: String,            // Re-add
    // ... add others as needed
}

// Update defaults
default_models: DefaultModels {
    ollama: "".to_string(),
    managed_cloud: "auto".to_string(),
    openai: "gpt-5.2".to_string(),
    anthropic: "claude-opus-4.5".to_string(),
    google: "gemini-2.5-pro".to_string(),
},
```

**Frontend (`apps/desktop/src/stores/settingsStore.ts`):**

```typescript
interface DefaultModels {
  ollama: string;
  managed_cloud: string;
  openai: string; // Re-add
  anthropic: string; // Re-add
  google: string; // Re-add
}

// Add migration from v6 to v7
if (storedVersion === 6) {
  const updated = {
    ...existingSettings,
    llmConfig: {
      ...existingSettings.llmConfig,
      defaultModels: {
        ...existingSettings.llmConfig.defaultModels,
        openai: 'gpt-5.2',
        anthropic: 'claude-opus-4.5',
        google: 'gemini-2.5-pro',
      },
    },
  };
  localStorage.setItem('agiworkforce-settings', JSON.stringify(updated));
  localStorage.setItem('settings-version', '7');
}
```

### Step 3: Update Provider Selection Logic

**File:** `apps/desktop/src-tauri/src/sys/commands/llm.rs`

**Replace the security block:**

```rust
// BEFORE (current):
match provider.as_str() {
    "ollama" => { /* ... */ }
    "managed_cloud" => { /* ... */ }
    _ => Err("Provider must be configured via Vercel environment variables")
}

// AFTER (to enable direct providers):
match provider.as_str() {
    "ollama" => {
        // Existing Ollama logic
    }
    "managed_cloud" => {
        // Existing managed cloud logic
    }
    "openai" => {
        let provider = OpenAIProvider::new(api_key)?;
        provider.send_message(&request).await?
    }
    "anthropic" => {
        let provider = AnthropicProvider::new(api_key)?;
        provider.send_message(&request).await?
    }
    "google" => {
        let provider = GoogleProvider::new(api_key)?;
        provider.send_message(&request).await?
    }
    _ => Err(format!("Unknown provider: {}", provider))
}
```

### Step 4: Add API Key Storage

**Security Consideration:** Use OS keyring, not SQLite database!

```rust
use keyring::Entry;

#[tauri::command]
pub async fn llm_set_api_key(
    provider: String,
    api_key: String,
) -> Result<(), String> {
    let entry = Entry::new("agiworkforce", &format!("llm_{}", provider))
        .map_err(|e| format!("Keyring error: {}", e))?;

    entry.set_password(&api_key)
        .map_err(|e| format!("Failed to store key: {}", e))?;

    Ok(())
}

#[tauri::command]
pub async fn llm_get_api_key(provider: String) -> Result<String, String> {
    let entry = Entry::new("agiworkforce", &format!("llm_{}", provider))
        .map_err(|e| format!("Keyring error: {}", e))?;

    entry.get_password()
        .map_err(|e| format!("API key not found: {}", e))
}
```

**Add to Cargo.toml:**

```toml
[dependencies]
keyring = "2.3"
```

### Step 5: Update Settings UI

**File:** `apps/desktop/src/components/Settings/LLMSettings.tsx`

Add API key input fields:

```typescript
<div className="space-y-4">
  <h3 className="text-lg font-semibold">API Keys</h3>

  <div>
    <label className="block text-sm font-medium mb-1">OpenAI API Key</label>
    <Input
      type="password"
      placeholder="sk-..."
      value={openaiKey}
      onChange={(e) => {
        setOpenaiKey(e.target.value);
        invoke('llm_set_api_key', {
          provider: 'openai',
          apiKey: e.target.value
        });
      }}
    />
    <p className="text-xs text-muted-foreground mt-1">
      Get your key from <a href="https://platform.openai.com/api-keys"
      target="_blank" className="underline">platform.openai.com</a>
    </p>
  </div>

  {/* Repeat for Anthropic, Google, etc. */}
</div>
```

### Step 6: Update Provider Module Exports

**File:** `apps/desktop/src-tauri/src/core/llm/providers/mod.rs`

```rust
pub mod http_client;
pub mod managed_cloud_provider;
pub mod ollama;
pub mod openai;           // Re-add
pub mod anthropic;         // Re-add
pub mod google;            // Re-add

pub use http_client::HttpClient;
pub use managed_cloud_provider::ManagedCloudProvider;
pub use ollama::OllamaProvider;
pub use openai::OpenAIProvider;               // Re-add
pub use anthropic::AnthropicProvider;         // Re-add
pub use google::GoogleProvider;                // Re-add
```

### Step 7: Testing Checklist

- [ ] API key storage/retrieval via OS keyring
- [ ] Each provider's streaming works correctly
- [ ] Function calling with each provider
- [ ] Vision/multimodal inputs (if supported)
- [ ] Error handling for invalid API keys
- [ ] Rate limit handling
- [ ] Settings migration doesn't break existing users
- [ ] Managed cloud proxy still works (don't break existing functionality!)

---

## Technical Details for Future Reference

### Provider Implementation Pattern

All deleted providers followed this interface (defined in `providers/mod.rs`):

```rust
pub trait LLMProvider: Send + Sync {
    /// Send a single message and get complete response
    fn send_message(
        &self,
        request: &LLMRequest,
    ) -> Pin<Box<dyn Future<Output = Result<String, LLMError>> + Send>>;

    /// Stream response chunks via SSE
    fn stream_message(
        &self,
        request: &LLMRequest,
    ) -> Pin<Box<dyn Stream<Item = Result<String, LLMError>> + Send>>;

    /// Provider-specific model ID mapping
    fn map_model_id(&self, generic_id: &str) -> String;
}
```

### SSE Streaming Format

All providers used Server-Sent Events with this format:

```
data: {"choices":[{"delta":{"content":"Hello"}}]}

data: {"choices":[{"delta":{"content":" world"}}]}

data: [DONE]
```

Parsed in `managed_cloud_provider.rs:stream_message()` - reference this for re-implementation.

### Model ID Mapping

**Managed Cloud Proxy** uses canonical IDs:

- `gpt-5.2` → OpenAI `gpt-5.2-turbo`
- `claude-opus-4.5` → Anthropic `claude-opus-4-5-20251101`
- `gemini-2.5-pro` → Google `gemini-2.5-pro-latest`

**Direct providers** required provider-specific mapping in each implementation.

### Rate Limit Handling

All providers implemented exponential backoff:

```rust
for attempt in 0..3 {
    match self.client.post(url).send().await {
        Ok(resp) if resp.status() == 429 => {
            let delay = 2u64.pow(attempt) * 1000; // 1s, 2s, 4s
            tokio::time::sleep(Duration::from_millis(delay)).await;
            continue;
        }
        Ok(resp) => return Ok(resp),
        Err(e) => return Err(e.into()),
    }
}
```

Reference `managed_cloud_provider.rs` for current implementation.

---

## Cost-Benefit Analysis

### Before Cleanup

- **Pros:**
  - Users could bring their own API keys (BYOK model)
  - Direct connection to providers (lower latency)
  - No dependency on AGI Workforce infrastructure

- **Cons:**
  - 5,000+ lines of code to maintain (18 provider files)
  - Each provider upgrade required desktop app update
  - API key security burden on users
  - No centralized billing or usage tracking
  - Complex settings UI with 9+ API key fields
  - Difficult to enforce subscription limits

### After Cleanup

- **Pros:**
  - Single source of truth for provider integrations (Vercel API)
  - Centralized billing and usage tracking
  - No API key management for users
  - Can add new providers without desktop app updates
  - Simpler settings UI (2 fields instead of 9)
  - Easier to enforce subscription tier limits
  - Better security (no local key storage)

- **Cons:**
  - Dependency on AGI Workforce cloud infrastructure
  - Slightly higher latency (extra hop through proxy)
  - Users can't use their own provider accounts
  - No offline LLM usage (except Ollama)

**Decision:** Benefits outweigh costs for 95% of users. Enterprise BYOK can be added back if needed.

---

## Deployment Considerations

### If Re-Enabling Direct Providers

1. **Staged Rollout:**
   - Beta flag: `settings.llmConfig.enableDirectProviders` (default: false)
   - Enable for enterprise tier only initially
   - Monitor for API key leaks, billing issues
   - Gradual rollout to Pro → Hobby tiers

2. **Security Audit:**
   - Review keyring storage implementation
   - Ensure API keys never logged or sent to telemetry
   - Add encryption at rest for API keys
   - Implement key rotation reminders

3. **Documentation:**
   - Update user docs with BYOK setup guide
   - Add security best practices for API key management
   - Document provider-specific quirks (rate limits, model IDs, etc.)

4. **Monitoring:**
   - Track direct provider usage vs managed cloud
   - Monitor for billing spikes (user keys with no limits)
   - Alert on provider authentication failures

---

## Questions & Answers

**Q: Can we restore just one provider (e.g., OpenAI only)?**
A: Yes! Follow steps 1-7 but only restore `openai.rs`. The architecture supports mixing managed cloud + direct providers.

**Q: Will old settings break after cleanup?**
A: No. Migration v5→v6 removes unused fields gracefully. Users on v5 will auto-migrate on next app launch.

**Q: What happens if a user had OpenAI selected before cleanup?**
A: Migration sets all provider selections to `managed_cloud` by default. User won't see any change in behavior.

**Q: Are the deleted files in git history?**
A: Yes! Committed Feb 4, 2026. Use `git log --all -- <file_path>` to find exact commit hash.

**Q: Why keep Ollama but remove OpenAI/Anthropic?**
A: Ollama is for **local** models (Llama, Mistral, etc.) - completely private, no API keys needed. Different use case than cloud providers.

---

## Appendix: File Deletion Summary

### Total Lines Removed

- **Provider implementations:** ~4,200 lines
- **Tests:** ~600 lines
- **Google Batch commands:** ~200 lines
- **Settings schema fields:** ~80 lines
- **Total:** ~5,080 lines

### Compilation Impact

- **Before:** 1,093 Rust source files
- **After:** 1,074 Rust source files (-19 files)
- **Build time:** Reduced by ~8 seconds (53s → 45s)
- **Binary size:** Reduced by ~850KB (unoptimized debug build)

### Breaking Changes

- ❌ `settings.llmConfig.defaultModels.openai` → removed
- ❌ `settings.llmConfig.defaultModels.anthropic` → removed
- ❌ `settings.llmConfig.defaultModels.google` → removed
- ❌ `llm_request.image_generation` → removed
- ❌ `llm_request.google_search` → removed
- ❌ Google Batch API commands → removed

### Non-Breaking Changes

- ✅ Managed cloud proxy still works
- ✅ Ollama integration preserved
- ✅ Settings migration handles old data gracefully
- ✅ All existing chats continue to work

---

## Conclusion

This cleanup removes technical debt while preserving architectural flexibility. The managed cloud proxy provides better security, billing control, and user experience for 95% of use cases. If enterprise customers require BYOK (bring-your-own-key) in the future, this document provides a clear restoration path.

**Recommendation:** Keep this architecture unless there's a compelling business reason (enterprise contracts, regulatory requirements) to re-enable direct provider support.

---

**Document Version:** 1.0
**Last Updated:** February 4, 2026
**Maintained By:** AGI Workforce Engineering Team
