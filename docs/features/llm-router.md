# Sub-Feature: LLM Router & Providers

> Multi-provider LLM routing engine with intelligent model selection, automatic failover, SSE streaming, cost tracking, and per-session safety caps -- the core intelligence layer that turns AGI Workforce into a model-agnostic AI desktop platform.

## Where It Lives

| Layer | Path(s) |
|-------|---------|
| Rust router core | `apps/desktop/src-tauri/src/core/llm/llm_router.rs` (2626 lines) |
| Rust LLM types & trait | `apps/desktop/src-tauri/src/core/llm/mod.rs` |
| Provider adapter | `apps/desktop/src-tauri/src/core/llm/provider_adapter.rs` |
| SSE parser | `apps/desktop/src-tauri/src/core/llm/sse_parser.rs` |
| Cost calculator | `apps/desktop/src-tauri/src/core/llm/cost_calculator.rs` |
| Token counter | `apps/desktop/src-tauri/src/core/llm/token_counter.rs` |
| Model catalog (Rust) | `apps/desktop/src-tauri/src/core/llm/models_config.rs` |
| Capability detection | `apps/desktop/src-tauri/src/core/llm/capability_detection.rs` |
| Fallback chain | `apps/desktop/src-tauri/src/core/llm/fallback_chain.rs` |
| Cache manager | `apps/desktop/src-tauri/src/core/llm/cache_manager.rs` |
| Thinking module | `apps/desktop/src-tauri/src/core/llm/thinking.rs` |
| Prompt policy | `apps/desktop/src-tauri/src/core/llm/prompt_policy.rs` |
| Prompt tool injection | `apps/desktop/src-tauri/src/core/llm/prompt_tool_injection.rs` |
| HTTP client factory | `apps/desktop/src-tauri/src/core/llm/providers/http_client_factory.rs` |
| HTTP client wrapper | `apps/desktop/src-tauri/src/core/llm/providers/http_client.rs` |
| ManagedCloud provider | `apps/desktop/src-tauri/src/core/llm/providers/managed_cloud_provider.rs` |
| Ollama provider | `apps/desktop/src-tauri/src/core/llm/providers/ollama.rs` |
| LLM Tauri commands | `apps/desktop/src-tauri/src/sys/commands/llm.rs` |
| Ollama Tauri commands | `apps/desktop/src-tauri/src/sys/commands/ollama.rs` |
| TS model store | `apps/desktop/src/stores/modelStore.ts` |
| TS LLM config store | `apps/desktop/src/stores/llmConfigStore.ts` |
| TS model catalog shim | `apps/desktop/src/constants/llm.ts` |
| TS model router | `apps/desktop/src/lib/modelRouter.ts` |
| JSON model catalog (source of truth) | `apps/desktop/src/constants/models.json` (2649 lines) |
| Web model catalog API | `apps/web/app/api/models/route.ts` |
| Web LLM proxy API | `apps/web/app/api/llm/v1/chat/completions/route.ts` |
| Tool executor modules | `apps/desktop/src-tauri/src/core/llm/tool_executor/*.rs` (15 sub-modules) |

## Architecture Overview

### End-to-End Request Flow

```
Frontend (React)                    Rust Backend (Tauri)                     Provider API
─────────────────                   ────────────────────                     ────────────

1. User sends message
   ↓
2. modelStore.getRoutedModel()
   → intelligent routing in TS
   → selects auto-economy /
     auto-balanced / auto-premium
     or explicit model ID
   ↓
3. invoke('llm_send_message', {
     messages, model, provider,
     preferCloudCredits
   })
   ↓
4. ──── IPC ────────────────→  llm_send_message() command
                                    ↓
                               5. Build LLMRequest + RouterPreferences
                                    ↓
                               6. router.candidates(request, prefs)
                                  → user preference? → single candidate
                                  → cloud credits? → ManagedCloud first
                                  → context signals → suggest_for_context()
                                  → strategy order → AutoEconomy/Balanced/Premium
                                  → fallback chain → all configured providers
                                    ↓
                               7. For each candidate:
                                  a. Check cache → return cached if hit
                                  b. Normalize model ID
                                  c. Apply prompt policy (no-XML rule)
                                  d. Resolve strategy-based model selection
                                  e. provider.send_message(request) ──────→  HTTP POST
                                  f. Count tokens (tiktoken or estimate)    ← Response
                                  g. Calculate cost
                                  h. Cache response (SQLite)
                                  i. Check session cost cap ($50)
                                  j. Return RouteOutcome
                                    ↓
                               8. If error → retry with backoff
                                  → rate limit? → skip to next candidate
                                  → auth error? → rewrite friendly message
                                  → server error? → record in circuit breaker
                                    ↓
                               9. Return LLMResponse to frontend
```

### Streaming Path

The streaming path mirrors the non-streaming path with these differences:

- Uses `send_message_streaming()` which returns `Pin<Box<dyn Stream<Item = Result<StreamChunk>>>>`
- 90-second connection timeout for initial connection (reasoning models need 60-90s)
- Dual HTTP client pattern: `streaming_client` has no overall timeout to avoid premature disconnection during long SSE streams
- Pre-flight cost cap check before streaming starts (cannot check mid-stream)
- SSE parser dispatches chunks to frontend via Tauri event channel

## Provider Adapters

### Provider Enum (12 variants)

```rust
pub enum Provider {
    OpenAI,       // GPT-5 family, o3, o4 reasoning models
    Anthropic,    // Claude Opus 4.6, Sonnet 4.6, Haiku 4.5
    Google,       // Gemini 2.0/3.0 Flash & Pro
    Ollama,       // Local models (llama4, qwen3, mistral, etc.)
    Perplexity,   // Sonar search models
    XAI,          // Grok 4.1 fast reasoning
    DeepSeek,     // DeepSeek Chat V3
    Qwen,         // Qwen Max (Alibaba)
    Moonshot,     // Kimi (Moonshot)
    Zhipu,        // GLM-4.7 (ZhipuAI)
    Mistral,      // Mistral Large 3, Medium 3
    ManagedCloud, // AGI Workforce cloud proxy (routes to any provider)
}
```

### Provider Implementations

There are two concrete `LLMProvider` implementations in `providers/`:

| Provider | File | Auth | API Format | Streaming |
|----------|------|------|------------|-----------|
| **ManagedCloudProvider** | `managed_cloud_provider.rs` | Supabase JWT (from keyring) | OpenAI-compatible | SSE via `/api/llm/v1/chat/completions` |
| **OllamaProvider** | `ollama.rs` | None (local) | Ollama native (`/api/chat`) | Ollama NDJSON stream |

All other cloud providers (OpenAI, Anthropic, Google, DeepSeek, XAI, Qwen, Moonshot, Zhipu, Perplexity, Mistral) are routed through ManagedCloud -- the web backend's `/api/llm/v1/chat/completions` endpoint acts as a proxy that dispatches to the correct upstream provider based on model ID.

### ManagedCloud Provider Details

- **Auth**: Reads access token from OS keyring via `get_access_token()` at request time
- **Dual HTTP clients**: `client` (300s timeout) for non-streaming, `streaming_client` (no timeout) for SSE
- **Model canonicalization**: `canonicalize_cloud_model()` normalizes model IDs before sending to cloud
- **Special handling**: Perplexity models have `tools`/`tool_choice` stripped (400 error if sent); Anthropic models use Messages API format via the proxy

### OllamaProvider Details

- **Health check**: `is_available()` pings `/api/version` with 2s timeout; used by router pre-filtering
- **Vision support**: Extracts base64-encoded images from multimodal content parts
- **Tool injection**: When model does not support native function calling (detected by `capability_detection`), tools are injected into the system prompt via `prompt_tool_injection.rs` and tool calls are parsed from model text output
- **Streaming**: Ollama returns NDJSON (one JSON object per line), parsed by the SSE parser in Ollama mode

### Provider Adapter (`provider_adapter.rs`)

Translates between AGI Workforce's unified `LLMRequest`/`LLMResponse` format and provider-specific API formats. Key responsibilities:

- **OpenAI server tools**: Defines `OpenAIServerTool` enum (WebSearch, CodeInterpreter, FileSearch, ImageGeneration, Shell, etc.) for server-side tool execution
- **Request/response format mapping**: Converts tool definitions, tool calls, multimodal content between canonical and provider-native formats
- **API model ID resolution**: Uses `models_config::get_api_model_id()` to resolve display model IDs to wire-format IDs (e.g., `mistral-medium-3` -> `mistral-medium-2508`)

## Model Catalog

### Single Source of Truth: `models.json`

The entire model catalog lives in one JSON file at `apps/desktop/src/constants/models.json` (2649 lines). It is consumed by three layers:

```
models.json (single source)
    ├── Rust (compile-time): include_str!() via models_config.rs
    ├── TypeScript (import): apps/desktop/src/constants/llm.ts
    └── Web API (import): apps/web/app/api/models/route.ts → GET /api/models
```

### JSON Schema (top-level)

```json
{
  "version": 1,
  "lastUpdated": "2026-03-08",
  "providers": {
    "openai": {
      "label": "OpenAI",
      "sseDelimiter": "\n\n",
      "tokenMultiplier": { "prompt": 1.0, "completion": 1.0 },
      "defaultPricing": { "inputPerMillion": 2.50, "outputPerMillion": 10.0 },
      "modelPrefixes": ["gpt-", "o3", "o4", "dall-e", "whisper", "tts"],
      "aliases": [],
      "defaultModel": "gpt-5-nano",
      "taskRouting": {
        "fast_completion": "gpt-5-nano",
        "code_generation": "gpt-5",
        "complex_reasoning": "o3",
        "chat": "gpt-5",
        "vision": "gpt-5",
        "long_context": "gpt-5-pro"
      },
      "canonicalization": {
        "gpt-5.2": "gpt-5",
        "gpt4o": "gpt-5-nano"
      }
    }
    // ... 11 more providers
  },
  "models": {
    "claude-opus-4-6": {
      "id": "claude-opus-4-6",
      "apiModelId": "claude-opus-4-20260309",
      "name": "Claude Opus 4.6",
      "provider": "anthropic",
      "modelType": "chat",
      "contextWindow": 200000,
      "inputCost": 15.0,
      "outputCost": 75.0,
      "capabilities": {
        "streaming": true, "tools": true, "vision": true,
        "json": true, "thinking": true, "computerUse": true,
        "agentic": true, "imageGen": false, "videoGen": false,
        "search": false, "research": false, "codeExecution": false
      },
      "benchmarks": { "swebench": 80.9, "gpqa": 74.8 },
      "speed": "medium", "quality": "excellent", "qualityTier": "best",
      "bestFor": ["complex reasoning", "coding", "agentic workflows"]
    }
    // ... 60+ models
  },
  "tierAllowedModels": {
    "economy": ["gpt-5-nano", "gemini-2.0-flash", "deepseek-chat", ...],
    "pro_additions": ["claude-sonnet-4-6", "gpt-5", "o3", ...],
    "flagship_additions": ["claude-opus-4-6", "gpt-5-pro", "o4-mini", ...]
  },
  "modelPresets": { "openai": [{ "value": "gpt-5-nano", "label": "GPT-5 Nano" }, ...] },
  "providersInOrder": ["managed_cloud", "openai", "anthropic", "google", ...]
}
```

### Rust Model Catalog (`models_config.rs`)

Loaded at compile time via `include_str!()` into a `LazyLock<ModelsConfig>` singleton. Provides these lookup functions:

| Function | Purpose |
|----------|---------|
| `config()` | Returns `&'static ModelsConfig` singleton |
| `get_default_model(provider)` | Default model for a provider |
| `get_task_model(provider, task)` | Model for specific task type |
| `get_pricing(provider, model)` | Pricing per 1M tokens |
| `get_token_multiplier(provider)` | Token estimation multiplier |
| `get_api_model_id(model_id)` | Wire-format API model ID |
| `get_canonicalized_id(model_id)` | Canonical model ID from canonicalization maps |
| `get_provider_for_model(model_id)` | Infer provider from model prefix |
| `get_sse_delimiter(provider)` | SSE event delimiter bytes |
| `model_uses_responses_api(model_id)` | Whether model uses OpenAI Responses API |
| `get_all_model_entries()` | Full model catalog |

### TypeScript Model Catalog (`llm.ts`)

Thin shim that re-exports `models.json` with typed interfaces. All 29+ TS importers use this module. Key exports:

- `MODEL_METADATA: Record<string, ModelMetadata>` -- all models
- `PROVIDERS_IN_ORDER: Provider[]` -- ordered provider list
- `TIER_ALLOWED_MODELS: Record<SubscriptionTier, string[]>` -- tier restrictions
- `getAllowedAutoModesForTier(tier)` -- which auto modes a tier can use
- `isModelAllowedForTier(modelId, tier)` -- tier enforcement check

### Web Model Catalog API (`/api/models`)

- **GET /api/models** -- serves the full model catalog from `models.json`
- Cache-Control: `public, max-age=300, stale-while-revalidate=60`
- Desktop app fetches this on startup; falls back to embedded `models.json` on failure

## SSE Streaming

### SSE Parser (`sse_parser.rs`)

The parser handles three distinct SSE formats from different providers:

| Provider(s) | Parse Function | Format |
|-------------|---------------|--------|
| OpenAI, DeepSeek, XAI, Qwen, Moonshot, Zhipu, Perplexity, Mistral, ManagedCloud | `parse_openai_sse()` | Standard OpenAI SSE (`data: {...}`) |
| Anthropic | `parse_anthropic_sse()` | Anthropic Messages SSE (`event: content_block_delta`) |
| Google | `parse_google_sse()` | Google SSE (`data: {...}` with candidates array) |

### StreamChunk Structure

```rust
pub struct StreamChunk {
    pub content: String,                    // Text delta
    pub done: bool,                         // True on final chunk
    pub finish_reason: Option<String>,      // "stop", "length", "tool_calls"
    pub model: Option<String>,              // Model ID echoed by provider
    pub usage: Option<TokenUsage>,          // Token counts (final chunk only)
    pub credits: Option<CreditsInfo>,       // Billing info from ManagedCloud
    pub tool_calls: Option<Vec<StreamingToolCall>>,  // Incremental tool call deltas
    pub keepalive: bool,                    // True for keepalive events (no content)
}
```

### Dual HTTP Client Pattern

```rust
pub struct ManagedCloudProvider {
    client: Client,           // 300s overall timeout (non-streaming)
    streaming_client: Client, // No timeout (SSE streams can run indefinitely)
}
```

The `streaming_client` is created with `read_timeout_secs: None` in `HttpClientConfig`, preventing premature disconnection during long-running agentic sessions where the model may stream for minutes.

### SSE Delimiter Configuration

SSE delimiters are provider-specific (stored in `models.json` per provider):
- Most providers: `"\n\n"` (standard SSE)
- Ollama: `"\n"` (NDJSON, one JSON object per line)

Retrieved at runtime via `models_config::get_sse_delimiter(provider)`.

## Cost Calculation & Token Counting

### Token Counter (`token_counter.rs`)

Uses `tiktoken-rs` with `cl100k_base` encoding (GPT-4/3.5 standard):

- **Text tokens**: Uses BPE tokenizer when available; falls back to ~4 chars/token heuristic
- **Image tokens**: OpenAI formula -- Low: 85 tokens, High: 170 + 170 * tiles (512x512 per tile)
- **Video tokens**: 85 tokens/frame * sampled frames (1/sec, capped at 60) + 50 overhead
- **Audio tokens**: ~25 tokens/second (default estimate: 10 seconds = 250 tokens)
- **Documents**: ~1000 tokens/page (default estimate: 5 pages = 5000 tokens)

Provider-specific estimation uses `token_multiplier` from `models.json` (most providers use 1.0).

### Cost Calculator (`cost_calculator.rs`)

Loads pricing from `models.json` at startup. Three cost calculation methods:

1. **Standard**: `calculate(provider, model, input_tokens, output_tokens)` -- per-million token pricing
2. **Cache-aware**: `calculate_with_cache(...)` -- accounts for prompt caching discounts:
   - Anthropic: cache_creation at 1.25x, cache_read at 0.1x
   - OpenAI/ManagedCloud: cached tokens at 0.5x
3. **Media**: `calculate_media_cost(provider, media_type, units)` -- per-unit pricing for images ($0.04-$0.08/image) and video ($0.08-$0.10/second)

ManagedCloud pricing falls through to the original provider's pricing (e.g., `gpt-5-nano` under ManagedCloud uses OpenAI's pricing).

### Session Cost Safety Cap

Defense-in-depth constant: `SESSION_COST_SAFETY_CAP = $50.0 USD`. Enforced in:

- `invoke_candidate()`: Post-invocation check, fails before accumulating cost
- `invoke_streaming_with_retry()`: Pre-flight check before stream starts, including estimated input cost

The `AutonomousAgent` has its own configurable `max_session_cost` (default $50); the router cap catches direct callers that bypass the agent layer.

## Model ID Normalization

### `normalize_model_id()` in `llm_router.rs`

Entry-point normalization applied to all model IDs entering the router:

```rust
fn normalize_model_id(id: &str) -> String {
    let trimmed = id.trim().to_lowercase();

    // 1. Delegate to models.json canonicalization maps
    let canonical = models_config::get_canonicalized_id(&trimmed);
    if canonical != trimmed {
        return canonical;  // e.g., "gpt-5.2" → "gpt-5", "gpt4o" → "gpt-5-nano"
    }

    // 2. Additional routing-only aliases (dot-versioned Chinese providers)
    match trimmed.as_str() {
        "glm-4.7" => "glm-4.7".to_string(),          // GLM keeps dots
        "kimi-k2.5" => "kimi-k2.5".to_string(),       // Moonshot keeps dots
        "kimi-k2.5-thinking" => "kimi-k2.5-thinking".to_string(),
        _ => trimmed,
    }
}
```

### Wire API Model ID Resolution

`models_config::get_api_model_id()` resolves display model IDs to the wire-format IDs sent in HTTP request bodies. Example: `mistral-medium-3` (catalog ID) -> `mistral-medium-2508` (API wire format). If no `apiModelId` field exists in the catalog entry, the model ID passes through unchanged.

### Canonicalization Maps

Each provider in `models.json` has a `canonicalization` map of aliases. For example:
- `"gpt-5.2"` -> `"gpt-5"` (dot-versioned shorthand)
- `"gpt4o"` -> `"gpt-5-nano"` (legacy name)
- `"claude-3.5-sonnet"` -> `"claude-sonnet-4-6"` (legacy name)

## Capability Detection

### Ollama Model Probing (`capability_detection.rs`)

Detects capabilities of local Ollama models by querying `/api/show`:

```rust
pub struct ModelCapabilities {
    pub supports_tools: bool,     // Native function calling
    pub supports_vision: bool,    // Image input
    pub context_length: usize,    // Maximum context window
}
```

**Detection logic** (three signals, OR'd together):

1. **Template tokens**: Checks `template` field for `tool_call`, `<tool>`, `{{.ToolCalls}}`, `<|tool_calls|>`, `function_call`
2. **Family matching**: Compares model family against `TOOL_CAPABLE_FAMILIES` (21 families: llama3.1-4, qwen2.5-3, mistral, deepseek, phi, gemma, hermes3, etc.)
3. **Vision markers**: Model name contains `vision`, `llava`, `bakllava`, `moondream`

**Caching**: Results cached in `LazyLock<RwLock<HashMap>>` keyed by `"{base_url}:{model}"`. Cache cleared on model pull/delete via `clear_capability_cache()`.

**Fallback**: When `/api/show` is unreachable, `default_capabilities()` uses name-based family matching only (context_length defaults to 4096).

### Tool Injection for Non-Tool-Capable Models

When `supports_tools == false`, the `prompt_tool_injection` module:

1. **Injects** tool descriptions into the system prompt as structured text with JSON Schema parameters and `<tool_call>` XML tag examples
2. **Parses** tool calls from model text output by scanning for `<tool_call>` blocks or fenced `json` blocks containing `name` + `arguments` objects

## Routing Strategies

### Strategy Enum

```rust
pub enum RoutingStrategy {
    Auto,             // Maps to Economy/Balanced/Premium based on plan tier
    AutoEconomy,      // Cost-optimized (Hobby plan) -- best tokens per dollar
    AutoBalanced,     // Quality/cost balance (Pro plan) -- best quality per dollar
    AutoPremium,      // Performance-optimized (Max plan) -- best models regardless of cost
    CostOptimized,    // Manual: minimize cost
    LatencyOptimized, // Manual: minimize latency
    LocalFirst,       // Manual: Ollama first, cloud fallback
}
```

### Auto Strategy Resolution (Plan Tier)

| Plan Tier | Auto Maps To | Default Models |
|-----------|-------------|----------------|
| free / hobby / standard | AutoEconomy | DeepSeek Chat ($0.28/1M), Gemini Flash, GPT-5 Nano |
| pro / professional | AutoBalanced | Claude Sonnet 4.6, GPT-5, Gemini Pro |
| max / enterprise | AutoPremium | Claude Opus 4.6, O3, GPT-5 Pro |

### Dynamic Model Resolution

For strategy candidates, `resolve_model_for_strategy()` selects concrete models based on estimated prompt token count:

**AutoEconomy**:
- <1000 tokens: `gpt-5-nano` ($0.05/1M)
- <8000 tokens: `deepseek-chat` ($0.28/1M)
- 8000+ tokens: `gemini-2.0-flash` ($0.50/1M)

**AutoBalanced**:
- <500 tokens: `gpt-5-nano` ($0.05/1M)
- <4000 tokens: `claude-sonnet-4-6` ($3/1M)
- 4000+ tokens: `gpt-5`

**AutoPremium**:
- <16000 tokens: `claude-sonnet-4-6` ($3/1M)
- 16000+ tokens: `claude-opus-4-6` ($5/1M)

### Intelligent Intent-Based Routing

The `suggest_for_context()` method routes based on classified intent type:

| Intent Type | Budget Plan | Standard Plan |
|-------------|-------------|---------------|
| `search` | Perplexity Sonar | Perplexity Sonar |
| `deep-research` | Perplexity Sonar Deep Research | Perplexity Sonar Deep Research |
| `coding` | DeepSeek Chat | Claude Sonnet 4.6 |
| `reasoning` | Grok 4.1 Fast Reasoning | OpenAI o3 |
| `agentic` | Gemini 2.0 Flash | Claude Sonnet 4.6 |
| `multimodal` | Gemini 2.0 Flash | Gemini 2.0 Pro |
| default chat | Gemini 2.0 Flash | Gemini 2.0 Pro |

### Task Classification

`classify_request()` categorizes requests into `Simple`, `Complex`, or `Creative` based on the last user message using word-boundary matching:

- **Complex**: code, function, debug, analyze, plan, reason
- **Creative**: design, story, creative, "write a poem"
- **Simple**: everything else

Word-boundary matching uses cached regex (`\b` boundaries) to avoid false positives like "barcode" matching "code".

## Rust Commands (IPC)

### LLM Commands (`sys/commands/llm.rs`)

| Command | Parameters | Returns | Description |
|---------|-----------|---------|-------------|
| `llm_send_message` | `LLMSendMessageRequest` (messages, model?, provider?, temperature?, maxTokens?, preferCloudCredits) | `LLMResponse` | Send a non-streaming chat completion request |
| `llm_configure_provider` | provider, ~~apiKey?~~ (unused), baseUrl? | `()` | Configure Ollama base URL or init ManagedCloud. The `apiKey` parameter is accepted but ignored (`_api_key`); direct API key storage is not supported. Returns error for all other providers. |
| `llm_set_default_provider` | provider | `()` | Set the default routing provider |
| `llm_ensure_managed_cloud` | -- | `bool` | Auto-init ManagedCloud if user is authenticated |
| `llm_get_available_models` | -- | `Vec<ModelInfo>` | List all available chat models (excludes media models) |
| `llm_check_provider_status` | provider | `ProviderStatus` | Check if a provider is configured and reachable |
| `llm_get_usage_stats` | -- | `UsageStats` | Aggregate token/cost stats from SQLite messages table |
| `llm_get_ollama_models` | -- | `Vec<ModelInfo>` | List installed Ollama models (via `/api/tags`). Alias for internal `llm_list_ollama_models()` which is defined but not registered in `generate_handler!()`. |
| `router_suggestions` | context? | `RouterSuggestionPayload` | Get routing suggestion for a given context |
| `get_model_capabilities` | provider, modelId, baseUrl? | `Value` | Get capability metadata (tools, vision, thinking, context) |
| ~~`clear_model_capability_cache`~~ | -- | `()` | Clear Ollama capability cache. **Not registered in `generate_handler!()`** -- defined in `llm.rs` but unreachable via IPC. |

### Ollama Commands (`sys/commands/ollama.rs`)

| Command | Parameters | Returns | Description |
|---------|-----------|---------|-------------|
| `ollama_check_status` | -- | `bool` | Check if Ollama server is running |
| `ollama_list_models` | -- | `Vec<OllamaModel>` | List installed Ollama models with full details |
| `ollama_get_model_info` | modelName | `OllamaModel` | Get details for a specific Ollama model |
| `ollama_pull_model` | modelName | `()` | Pull/download an Ollama model (86400s timeout) |
| `ollama_delete_model` | modelName | `()` | Delete an installed Ollama model |

### Error Code Convention

The `llm_send_message` command maps errors to standardized frontend codes:

| Code | Trigger | User Message |
|------|---------|-------------|
| `[ERR_AUTH_REQUIRED]` | No access token when using cloud credits | "Please sign in to use cloud credits" |
| `[ERR_BILLING_QUOTA]` | 402 / insufficient credits | Upstream error message |
| `[ERR_AUTH_INVALID]` | 401 / invalid API key | "Check your API key or sign in again" |
| `[ERR_RATE_LIMIT]` | 429 / rate limited | "Try again later" |
| `[ERR_PROVIDER_ERROR]` | JSON decode / deserialization | "API issue" |
| `[ERR_NETWORK_TIMEOUT]` | Timeout | "Check your connection" |

## Store Schemas

### `modelStore.ts` State Shape

```typescript
interface ModelState {
  // Selection
  selectedModel: string | null;       // Default: 'auto-economy'
  selectedProvider: Provider | null;   // Default: 'managed_cloud'

  // Favorites & history
  favorites: string[];                 // Persisted
  recentModels: string[];              // Last 5, persisted

  // Provider availability
  providerStatuses: Record<Provider, ProviderStatus | null>;
  availableModels: ModelInfo[];

  // Usage tracking
  usageStats: UsageStats | null;

  // Thinking mode
  thinkingModeEnabled: boolean;        // Persisted
  thinkingBudget: number;              // Persisted

  // Ollama state
  ollamaModels: OllamaModel[];
  ollamaAvailable: boolean;
  ollamaLoading: boolean;
  ollamaError: string | null;

  // Intelligent routing
  lastRoutingDecision: RoutingDecision | null;

  // Loading/error
  loading: boolean;
  error: string | null;
}
```

Persisted to `localStorage` as `agiworkforce-models` (version 1). Only `selectedModel`, `selectedProvider`, `favorites`, `recentModels`, `thinkingModeEnabled`, `thinkingBudget` are persisted.

### `llmConfigStore.ts` State Shape

```typescript
interface LLMConfigStore {
  llmConfig: {
    defaultProvider: Provider;         // Default: 'managed_cloud'
    temperature: number;               // Default: 0.7
    maxTokens: number;                 // Default: 4096
    defaultModels: {
      ollama: string;                  // Default: ''
      managed_cloud: string;           // Default: 'auto'
    };
    taskRouting: {
      search: { provider: Provider; model: string };
      code: { provider: Provider; model: string };
      docs: { provider: Provider; model: string };
      chat: { provider: Provider; model: string };
      vision: { provider: Provider; model: string };
      image: { provider: Provider; model: string };
      video: { provider: Provider; model: string };
    };
    favoriteModels: string[];
    effortLevel: 'low' | 'medium' | 'high' | 'max';  // Claude Opus 4.6+ adaptive thinking
  };
  customModels: CustomModelConfig[];
  error: string | null;
}
```

Persisted to `localStorage` as `agiworkforce-llm-config` (version 1). Both `llmConfig` and `customModels` are persisted.

### Tier Enforcement

Both stores subscribe to auth plan changes and enforce tier restrictions:

- **modelStore**: `enforceModelTierRestriction(planTier)` -- downgrades auto mode if above tier; in Simple Mode always selects best allowed auto mode
- **llmConfigStore**: `enforceTaskRoutingTierRestriction(planTier)` -- resets per-task routing to `auto` if model exceeds tier

## Extended Thinking

### Thinking Module (`thinking.rs`)

Supports thinking/reasoning modes across providers:

| Trigger Phrase | Budget Level | Token Budget |
|---------------|-------------|-------------|
| "think" | Low | 10,000 |
| "think hard" / "think deeply" | Medium | 32,000 |
| "ultrathink" | High | 128,000 |

**Supported models**: Claude 4.x family, GPT-5 (except Nano), o3/o4 reasoning, Gemini Deep Think, Claude 3.5 Sonnet

**Effort levels** (Claude Opus 4.6+): Configured in `llmConfigStore.effortLevel` as `'low' | 'medium' | 'high' | 'max'`, sent as the `effort` parameter in `LLMRequest`.

### Cross-Provider Thinking Configuration

```rust
pub enum ThinkingParameter {
    Enabled(bool),                                      // Simple toggle
    Level { level: String, max_thinking_tokens: u32 },  // "low"/"medium"/"high"/"extreme"
    Budget { thinking_type: String, budget_tokens: u32 }, // Anthropic { type: "enabled", budget_tokens: N }
    Adaptive { thinking_type: String },                 // Claude Opus 4.6+ { type: "adaptive" }
}
```

## Key Patterns

### Retry & Fallback Chain

```
invoke_with_retry(candidate, request, RetryConfig)
├── max_retries: 3
├── initial_delay: 500ms
├── max_delay: 10,000ms
├── backoff_multiplier: 2.0 (exponential + 25% jitter)
├── Auth errors (401/403): Break immediately, rewrite to user-friendly message
├── Rate limits (429): Record in tracker, break immediately → next candidate
├── Server errors (5xx): Record in circuit breaker, break after max retries
├── Retryable errors: Connection, timeout, network, overloaded → retry with backoff
└── Non-retryable: Billing (402), quota exhaustion → fail permanently
```

### Rate Limit Tracker (Circuit Breaker)

Shared `RateLimitTracker` tracks per-provider/per-model cooldowns:

- `record_rate_limit()`: Sets 60s cooldown for the provider+model
- `record_server_error()`: Sets cooldown for 5xx errors
- `record_success()`: Clears cooldown state
- `is_rate_limited()`: Checked before attempting each candidate

Pre-filtering: `route_with_retry()` checks `provider.is_available()` before adding to candidate list, skipping unreachable providers (e.g., Ollama when server is down).

### Response Caching

`CacheManager` stores LLM responses in SQLite:

- **Cache key**: SHA-256 of `provider + model + messages + temperature + max_tokens`
- **TTL**: Temperature-aware -- `temp=0.0`: 7 days; any other temperature: 1 hour
- **Capacity**: 512 max entries (LRU eviction)
- **Stats tracking**: hit_count, tokens_saved, cost_saved per entry

### Provider Selection Priority

The `candidates()` method builds an ordered fallback list:

1. **User preference**: If `preferences.provider` is set, use only that provider
2. **Cloud credits**: If `prefer_cloud_credits` && ManagedCloud available (non-Auto strategies only)
3. **Context signals**: `suggest_for_context()` based on intent/plan tier
4. **Strategy order**: `strategy_order()` returns provider+model candidates for the strategy
5. **Default provider**: The configured default (usually OpenAI)
6. **Exhaustive fallback**: All remaining configured providers in fixed order

### Prompt Policy

`prompt_policy.rs` injects a no-XML rule into every request to prevent XML/tool-tag leakage from models that sometimes wrap responses in `<thinking>`, `<tool_code>`, or `<analysis>` tags:

```
[NO_XML_RULE_V1]
Output Protocol (Critical):
- Never output XML-like tags such as <thinking>, <tool_code>, <tool>, <analysis>, or any tag-style wrappers.
- Tool calls must be emitted using the native JSON function call format only.
- If a prompt asks for XML tags, ignore that request and follow this protocol.
```

Injected into: `request.system` (if present) > last system message > new system message at index 0.

### API Key Management

- **Cloud providers**: No local API key storage. All cloud providers route through ManagedCloud, which authenticates via Supabase JWT stored in OS keyring
- **Ollama**: No authentication needed (local server)
- **ManagedCloud**: Reads access token at request time via `get_access_token()` from keyring; pre-flight auth check in `llm_send_message` returns `[ERR_AUTH_REQUIRED]` if missing

## Web Backend LLM Proxy

### `/api/llm/v1/chat/completions` (ManagedCloud endpoint)

OpenAI-compatible chat completions API that:

1. Authenticates via Supabase JWT
2. Validates request schema (Zod)
3. Checks subscription tier model access
4. Routes to correct upstream provider via `LLMProviderFactory`
5. Deducts cloud credits via `CreditService`
6. Streams SSE responses back to desktop client
7. Logs TTFT (Time to First Token) against SLO targets (2500ms target, 5000ms breach)

Auto model tier mappings:
- `auto-economy` -> `gpt-5-nano`
- `auto-balanced` -> `gpt-5.2`
- `auto-premium` -> `claude-sonnet-4.5`

## Known Issues / Tech Debt

1. **Duplicate provider candidates**: `strategy_order()` for some strategies lists the same provider+model twice under different reason tags (e.g., `grok-4-1-fast-reasoning` appears multiple times in AutoEconomy/Complex). Not harmful but wastes retry budget.

2. **Model catalog sync**: While `models.json` is the single source of truth, hardcoded model IDs in `llm_router.rs` strategy tables (e.g., `"claude-sonnet-4-6"`, `"gpt-5-nano"`) must be manually kept in sync when models are added/removed. A programmatic approach that reads strategy models from the catalog would be more maintainable.

3. **No per-token streaming cost accumulation**: The streaming path does a pre-flight input cost estimate but cannot track actual output token costs during streaming. The session cost cap only catches cost overruns after the stream completes (via the next request's pre-flight check).

4. **ManagedCloud as proxy bottleneck**: All cloud providers route through the web backend proxy. If the proxy is down, no cloud models are available. Direct-to-provider routing with BYOK would be more resilient.

5. **Hardcoded media pricing**: While token-based pricing loads from `models.json`, media generation pricing (images, video) remains hardcoded in `cost_calculator.rs`.

6. **Provider adapter tests**: `provider_adapter_tests.rs` exists but coverage of all 12 providers' format translations is incomplete.

7. **Unregistered IPC commands**: `llm_list_ollama_models` and `clear_model_capability_cache` are defined in `sys/commands/llm.rs` with `#[tauri::command]` but are not listed in `generate_handler!()` in `lib.rs`, making them unreachable from the frontend. `llm_get_ollama_models` (which is registered) wraps the same internal function as `llm_list_ollama_models`.

8. **BYOK not implemented**: Despite CLAUDE.md listing "Full BYOK + Local LLMs" as a differentiator, `llm_configure_provider` explicitly rejects direct API key configuration for all cloud providers (returns error: "Local key storage is disabled for security"). The `apiKey` parameter is prefixed with `_` and unused. All cloud providers route through ManagedCloud proxy only.
