# Specification: Single-Source-of-Truth Model Catalog

Generated: 2026-03-03T12:00:00Z

## Task Overview

Eliminate model-data duplication across TS frontend and Rust backend by extracting all model metadata into a single `models.json` file that both runtimes read at startup. Today, model IDs, pricing, context windows, provider-inference prefixes, SSE delimiters, token multipliers, canonicalization maps, and task-routing tables are scattered across 8+ files. After this migration, adding a new model means editing one JSON file.

## Team Composition

- **TS Agent** (Phases 1 + 8): Creates `models.json`, replaces `llm.ts` with a thin shim that re-exports from JSON, fixes `apps/web/constants/llm.ts`, adds path alias to `apps/web/tsconfig.json`.
- **Rust Agent** (Phases 2-7): Creates `models_config.rs` (loads + deserializes `models.json` at startup), then migrates `sse_parser.rs`, `token_counter.rs`, `llm_router.rs`, `provider_adapter.rs`, `cost_calculator.rs`, `core/llm/mod.rs`, and `sys/commands/llm.rs` to look up data from the shared config instead of hardcoding it.

---

## File Allocation

### TS Agent

**Creates:**

- `apps/desktop/src/constants/models.json` (NEW -- the single source of truth)

**Modifies:**

- `apps/desktop/src/constants/llm.ts` -- replace ~2470 lines with ~150-line shim
- `apps/web/constants/llm.ts` -- replace stub with proper re-exports from JSON
- `apps/web/tsconfig.json` -- add path alias for `@desktop-constants/*`

**DO NOT TOUCH:**

- `apps/desktop/src/types/provider.ts` -- Provider union type stays here
- `apps/desktop/src/constants/planModels.ts` -- SubscriptionTier stays here
- Any Rust files

### Rust Agent

**Creates:**

- `apps/desktop/src-tauri/src/core/llm/models_config.rs` (NEW -- JSON loader + Rust structs)

**Modifies:**

- `apps/desktop/src-tauri/src/core/llm/mod.rs` -- add `pub mod models_config;`, keep Provider enum
- `apps/desktop/src-tauri/src/core/llm/sse_parser.rs` -- replace hardcoded Ollama delimiter with config lookup
- `apps/desktop/src-tauri/src/core/llm/token_counter.rs` -- replace hardcoded multipliers with config lookup
- `apps/desktop/src-tauri/src/core/llm/llm_router.rs` -- replace `infer_provider_from_model()` with config lookup, replace hardcoded `default_model()` and `get_model_for_task()`
- `apps/desktop/src-tauri/src/core/llm/provider_adapter.rs` -- replace `canonicalize_model()` in OpenAIAdapter, AnthropicAdapter, DeepSeekAdapter with config lookup
- `apps/desktop/src-tauri/src/core/llm/cost_calculator.rs` -- replace hardcoded pricing HashMap with config lookup
- `apps/desktop/src-tauri/src/sys/commands/llm.rs` -- replace hardcoded `ModelInfo` vec in `llm_get_available_models()` with config lookup

**DO NOT TOUCH:**

- `apps/desktop/src-tauri/src/core/llm/mod.rs` Provider enum definition (lines 502-516) -- keep as-is
- `apps/desktop/src-tauri/src/lib.rs` -- entry point
- `apps/desktop/src-tauri/src/core/llm/llm_router.rs` retry logic, routing strategy, candidate selection -- only replace data lookups
- Any TypeScript files

---

## Complete Model Inventory

### Chat/Reasoning Models (37 models)

| Model ID                  | apiModelId                 | Provider      | Type       | Context | Input$/M | Output$/M | Speed     | Quality   |
| ------------------------- | -------------------------- | ------------- | ---------- | ------- | -------- | --------- | --------- | --------- |
| auto                      | (virtual)                  | managed_cloud | chat       | 128K    | 0        | 0         | fast      | excellent |
| auto-economy              | (virtual)                  | managed_cloud | chat       | 2M      | 0        | 0         | very-fast | good      |
| auto-balanced             | (virtual)                  | managed_cloud | chat       | 200K    | 0        | 0         | fast      | excellent |
| auto-premium              | (virtual)                  | managed_cloud | chat       | 400K    | 0        | 0         | medium    | excellent |
| gpt-5.2                   | gpt-5.2                    | openai        | reasoning  | 400K    | 1.75     | 14.00     | medium    | excellent |
| gpt-5.2-codex-low         | gpt-5.2-codex-low          | openai        | code       | 400K    | 1.25     | 10.00     | fast      | excellent |
| gpt-5.2-codex-medium      | gpt-5.2-codex-medium       | openai        | code       | 400K    | 1.25     | 10.00     | fast      | excellent |
| gpt-5.2-codex-high        | gpt-5.2-codex-high         | openai        | code       | 400K    | 1.25     | 10.00     | medium    | excellent |
| gpt-5.2-codex-xhigh       | gpt-5.2-codex-xhigh        | openai        | code       | 400K    | 1.25     | 10.00     | medium    | excellent |
| gpt-5-pro                 | gpt-5.2-pro                | openai        | reasoning  | 512K    | 5.00     | 30.00     | slow      | excellent |
| gpt-5-nano                | gpt-5-nano                 | openai        | chat       | 128K    | 0.05     | 0.40      | very-fast | good      |
| gpt-5.3-codex             | gpt-5.3-codex              | openai        | code       | 200K    | 3.00     | 12.00     | fast      | excellent |
| o3                        | o3                         | openai        | reasoning  | 200K    | 2.00     | 8.00      | slow      | excellent |
| claude-opus-4.6           | claude-opus-4-6            | anthropic     | reasoning  | 200K    | 5.00     | 25.00     | slow      | excellent |
| claude-sonnet-4.6         | claude-sonnet-4-6          | anthropic     | code       | 200K    | 3.00     | 15.00     | fast      | excellent |
| claude-sonnet-4.5         | claude-sonnet-4-5-20250929 | anthropic     | code       | 200K    | 3.00     | 15.00     | fast      | excellent |
| claude-haiku-4.5          | claude-haiku-4-5-20251001  | anthropic     | chat       | 200K    | 1.00     | 5.00      | very-fast | good      |
| gemini-3.1-pro-preview    | gemini-3.1-pro-preview     | google        | reasoning  | 2M      | 2.00     | 12.00     | fast      | excellent |
| gemini-3.1-flash-lite     | gemini-3.1-flash-lite      | google        | chat       | 1M      | 0.50     | 3.00      | very-fast | good      |
| gemini-3.1-flash-image    | gemini-3.1-flash-image     | google        | image      | 1M      | 0.039    | 0.00      | fast      | excellent |
| grok-4                    | grok-4-0709                | xai           | reasoning  | 256K    | 3.00     | 15.00     | fast      | excellent |
| grok-4-fast               | grok-4-fast                | xai           | chat       | 2M      | 0.20     | 0.50      | very-fast | good      |
| grok-4-fast-non-reasoning | grok-4-fast-non-reasoning  | xai           | chat       | 2M      | 0.20     | 0.50      | very-fast | fair      |
| grok-4-fast-reasoning     | grok-4-fast-reasoning      | xai           | reasoning  | 2M      | 0.20     | 0.50      | fast      | good      |
| grok-4-mini               | grok-4-mini                | xai           | chat       | 128K    | 0.10     | 0.30      | very-fast | fair      |
| deepseek-chat             | deepseek-chat              | deepseek      | code       | 128K    | 0.28     | 0.42      | fast      | excellent |
| deepseek-r1               | deepseek-reasoner          | deepseek      | reasoning  | 128K    | 0.55     | 1.68      | medium    | excellent |
| qwen-max                  | qwen-max                   | qwen          | reasoning  | 128K    | 1.20     | 6.00      | medium    | excellent |
| qwen-flash                | qwen-flash                 | qwen          | chat       | 1M      | 0.05     | 0.40      | very-fast | fair      |
| qwen-turbo                | qwen-turbo                 | qwen          | chat       | 1M      | 0.05     | 0.30      | very-fast | fair      |
| qwen-coder-flash          | qwen-coder-flash           | qwen          | code       | 1M      | 0.05     | 0.30      | very-fast | good      |
| kimi-k2.5                 | kimi-k2.5                  | moonshot      | multimodal | 256K    | 0.60     | 3.00      | medium    | excellent |
| kimi-k2.5-thinking        | kimi-k2.5-thinking         | moonshot      | reasoning  | 256K    | 0.60     | 3.00      | medium    | excellent |
| mistral-large-3           | mistral-large-3            | mistral       | reasoning  | 131K    | 0.50     | 1.50      | fast      | excellent |
| mistral-medium-3          | mistral-medium-3           | mistral       | chat       | 131K    | 0.40     | 2.00      | fast      | good      |
| codestral-2               | codestral-2                | mistral       | code       | 256K    | 0.30     | 0.90      | very-fast | good      |
| glm-4.7                   | glm-4.7                    | zhipu         | code       | 128K    | 0.14     | 0.42      | fast      | excellent |
| glm-4.6v                  | glm-4.6v                   | zhipu         | multimodal | 128K    | 0.14     | 0.42      | medium    | excellent |
| glm-4.6v-flash            | glm-4.6v-flash             | zhipu         | multimodal | 128K    | 0.00     | 0.00      | very-fast | good      |
| sonar                     | sonar                      | perplexity    | search     | 128K    | 1.00     | 1.00      | fast      | good      |
| sonar-reasoning           | sonar-reasoning            | perplexity    | search     | 128K    | 1.00     | 5.00      | medium    | good      |
| sonar-reasoning-pro       | sonar-reasoning-pro        | perplexity    | search     | 128K    | 2.00     | 8.00      | medium    | excellent |
| sonar-pro                 | sonar-pro                  | perplexity    | search     | 200K    | 3.00     | 15.00     | medium    | excellent |
| sonar-deep-research       | sonar-deep-research        | perplexity    | search     | 128K    | 2.00     | 8.00      | slow      | excellent |

### Media Models (12 models)

| Model ID       | apiModelId                    | Provider          | Type  | Input$/M | Output$/M |
| -------------- | ----------------------------- | ----------------- | ----- | -------- | --------- |
| dall-e-3       | dall-e-3                      | openai            | image | 0        | 40.00     |
| gpt-image-1    | gpt-image-1                   | openai            | image | 0        | 40.00     |
| gpt-image-1.5  | gpt-image-1.5                 | openai            | image | 0        | 80.00     |
| imagen-4       | imagen-4.0-generate-001       | google            | image | 0        | 40.00     |
| imagen-4-ultra | imagen-4.0-ultra-generate-001 | google            | image | 0        | 80.00     |
| flux-1.1-pro   | flux-1.1-pro                  | black-forest-labs | image | 0        | 40.00     |
| flux-2-pro     | flux-2-pro                    | black-forest-labs | image | 0        | 60.00     |
| ideogram-2     | ideogram-2.0                  | managed_cloud     | image | 0        | 20.00     |
| sora-2         | sora-2                        | openai            | video | 0        | 100.00    |
| veo-3          | veo-3.1-generate-preview      | google            | video | 0        | 750.00    |
| tts-1          | tts-1                         | openai            | tts   | 15.00    | 0         |
| tts-1-hd       | tts-1-hd                      | openai            | tts   | 30.00    | 0         |
| whisper-1      | whisper-1                     | openai            | stt   | 0.006    | 0         |
| suno-v4        | suno-v4                       | suno              | music | 0        | 0         |
| udio           | udio                          | udio              | music | 0        | 0         |

---

## Provider Inventory (15 providers)

| Provider ID (TS)  | Provider Enum (Rust)              | Label             | SSE Delimiter | Token Multiplier (prompt/completion) | Default Model (Rust)   |
| ----------------- | --------------------------------- | ----------------- | ------------- | ------------------------------------ | ---------------------- |
| managed_cloud     | ManagedCloud                      | Managed Cloud     | `\n\n`        | 1.0 / 1.0                            | deepseek-chat          |
| openai            | OpenAI                            | OpenAI            | `\n\n`        | 1.0 / 1.0                            | gpt-5.2                |
| anthropic         | Anthropic                         | Anthropic         | `\n\n`        | 1.05 / 1.05                          | claude-sonnet-4-6      |
| google            | Google                            | Google            | `\n\n`        | 0.95 / 0.95                          | gemini-3.1-pro-preview |
| xai               | XAI                               | xAI               | `\n\n`        | 1.0 / 1.0                            | grok-4                 |
| deepseek          | DeepSeek                          | DeepSeek          | `\n\n`        | 1.05 / 1.05                          | deepseek-chat          |
| qwen              | Qwen                              | Qwen              | `\n\n`        | 1.0 / 1.0                            | qwen-max               |
| moonshot          | Moonshot                          | Moonshot AI       | `\n\n`        | 1.0 / 1.0                            | kimi-k2.5-thinking     |
| perplexity        | Perplexity                        | Perplexity        | `\n\n`        | 1.0 / 1.0                            | sonar-deep-research    |
| zhipu             | Zhipu                             | ZhipuAI           | `\n\n`        | 1.0 / 1.0                            | glm-4.7                |
| mistral           | Mistral                           | Mistral AI        | `\n\n`        | 1.0 / 1.0                            | mistral-large-3        |
| ollama            | Ollama                            | Ollama (Local)    | `\n`          | 1.10 / 1.10                          | llama4-maverick        |
| black-forest-labs | (none -- routed via ManagedCloud) | Black Forest Labs | `\n\n`        | 1.0 / 1.0                            | --                     |
| suno              | (none -- routed via ManagedCloud) | Suno              | `\n\n`        | 1.0 / 1.0                            | --                     |
| udio              | (none -- routed via ManagedCloud) | Udio              | `\n\n`        | 1.0 / 1.0                            | --                     |

### Provider Model Prefixes (for infer_provider)

These prefixes are used by `llm_router.rs::infer_provider_from_model()` to determine which provider owns a model ID:

| Provider      | Prefixes                                                                   |
| ------------- | -------------------------------------------------------------------------- |
| openai        | `gpt-`, `o1`, `o3`, `o4`, `dall-e`, `tts-`, `whisper`, `sora`, `gpt-image` |
| anthropic     | `claude`                                                                   |
| google        | `gemini`, `imagen`, `veo`                                                  |
| deepseek      | `deepseek`                                                                 |
| xai           | `grok`                                                                     |
| perplexity    | `sonar`                                                                    |
| qwen          | `qwen`                                                                     |
| moonshot      | `kimi`, `moonshot`                                                         |
| zhipu         | `glm`                                                                      |
| mistral       | `mistral`, `codestral`, `pixtral`                                          |
| managed_cloud | `flux`, `ideogram` (fallback for unrecognized)                             |

### Provider Aliases (for Provider::from_string)

| Provider      | Aliases                                  |
| ------------- | ---------------------------------------- |
| perplexity    | `perplexity`, `pplx`, `sonar`            |
| xai           | `xai`, `grok`                            |
| qwen          | `qwen`, `alibaba`                        |
| moonshot      | `moonshot`, `kimi`                       |
| zhipu         | `zhipu`, `zhipuai`, `bigmodel`, `glm`    |
| mistral       | `mistral`, `mistral-ai`, `mistral_ai`    |
| managed_cloud | `managed_cloud`, `managedcloud`, `cloud` |

### Model Canonicalization Maps (provider_adapter.rs)

These are per-adapter normalizations of user-facing IDs to API-expected IDs:

**OpenAIAdapter::canonicalize_model:**
| Input | Output |
|---|---|
| `gpt-5.2-codex-*` (any effort suffix) | `gpt-5.2-codex` |
| `gpt-5.2-codex` | `gpt-5.2-codex` |
| `gpt-5-codex` | `gpt-5.2-codex` |
| `gpt-5.3-codex-*` | `gpt-5.3-codex` |
| `gpt-5-pro`, `gpt-5-pro-2026-01` | `gpt-5.2-pro` |
| `grok-4` | `grok-4-0709` |

**AnthropicAdapter::canonicalize_model:**
| Input | Output |
|---|---|
| `claude-haiku-4.5` | `claude-haiku-4-5` |
| `claude-sonnet-4.5` | `claude-sonnet-4-5` |
| `claude-sonnet-4.6` | `claude-sonnet-4-6` |
| `claude-opus-4.6` | `claude-opus-4-6` |

**DeepSeekAdapter::canonicalize_model:**
| Input | Output |
|---|---|
| `deepseek-r1` | `deepseek-reasoner` |
| `deepseek-r1-zero` | `deepseek-reasoner` |

### Codex Effort Override (OpenAIAdapter)

| Model suffix | reasoning.effort |
| ------------ | ---------------- |
| `-low`       | `low`            |
| `-medium`    | `medium`         |
| `-high`      | `high`           |
| `-xhigh`     | `high`           |

### Task Routing (Provider::get_model_for_task in mod.rs)

Current hardcoded per-provider task routing. This will move into `models.json` under `providers[].taskRouting`:

```json
{
  "openai": {
    "fast_completion": "gpt-5-nano",
    "code_generation": "gpt-5.2-codex-medium",
    "complex_reasoning": "o3",
    "chat": "gpt-5.2",
    "vision": "gpt-5.2",
    "long_context": "gpt-5.2"
  },
  "anthropic": {
    "fast_completion": "claude-haiku-4-5",
    "code_generation": "claude-sonnet-4-6",
    "complex_reasoning": "claude-opus-4-6",
    "chat": "claude-sonnet-4-6",
    "vision": "claude-sonnet-4-6",
    "long_context": "claude-sonnet-4-6"
  },
  "google": {
    "fast_completion": "gemini-3-flash-preview",
    "code_generation": "gemini-3-pro-preview",
    "complex_reasoning": "gemini-2.5-pro",
    "chat": "gemini-3-flash-preview",
    "vision": "gemini-3-pro-preview",
    "long_context": "gemini-3-pro-preview"
  },
  "xai": {
    "fast_completion": "grok-4-fast",
    "code_generation": "grok-4",
    "complex_reasoning": "grok-4-fast-reasoning",
    "chat": "grok-4",
    "vision": "grok-4",
    "long_context": "grok-4"
  },
  "deepseek": {
    "fast_completion": "deepseek-chat",
    "code_generation": "deepseek-chat",
    "complex_reasoning": "deepseek-reasoner",
    "chat": "deepseek-chat",
    "vision": "deepseek-chat",
    "long_context": "deepseek-chat"
  },
  "qwen": {
    "fast_completion": "qwen-max",
    "code_generation": "qwen-coder-plus",
    "complex_reasoning": "qwen-max",
    "chat": "qwen-max",
    "vision": "qwen-max",
    "long_context": "qwen-max"
  },
  "moonshot": {
    "fast_completion": "kimi-k2.5-thinking",
    "code_generation": "kimi-k2.5-thinking",
    "complex_reasoning": "kimi-k2.5-thinking",
    "chat": "kimi-k2.5-thinking",
    "vision": "kimi-k2.5-thinking",
    "long_context": "kimi-k2.5-thinking"
  },
  "ollama": {
    "fast_completion": "llama4-maverick",
    "code_generation": "llama4-maverick",
    "complex_reasoning": "llama4-maverick",
    "chat": "llama4-maverick",
    "vision": "llama4-maverick",
    "long_context": "llama4-maverick"
  },
  "perplexity": {
    "fast_completion": "sonar-deep-research",
    "code_generation": "sonar-deep-research",
    "complex_reasoning": "sonar-deep-research",
    "chat": "sonar-deep-research",
    "vision": "sonar-deep-research",
    "long_context": "sonar-deep-research"
  },
  "zhipu": {
    "fast_completion": "glm-4.6v-flash",
    "code_generation": "glm-4.7",
    "complex_reasoning": "glm-4.7",
    "chat": "glm-4.7",
    "vision": "glm-4.6v",
    "long_context": "glm-4.7"
  },
  "mistral": {
    "fast_completion": "mistral-medium-3",
    "code_generation": "codestral-2",
    "complex_reasoning": "mistral-large-3",
    "chat": "mistral-large-3",
    "vision": "mistral-large-3",
    "long_context": "mistral-large-3"
  },
  "managed_cloud": {
    "fast_completion": "gpt-5-nano",
    "code_generation": "deepseek-chat",
    "complex_reasoning": "deepseek-reasoner",
    "chat": "deepseek-chat",
    "vision": "gemini-3-flash-preview",
    "long_context": "deepseek-chat"
  }
}
```

---

## JSON Schema for models.json

```json
{
  "$schema": "http://json-schema.org/draft-07/schema#",
  "type": "object",
  "required": ["version", "lastUpdated", "providers", "models"],
  "properties": {
    "version": { "type": "integer", "description": "Schema version for migration" },
    "lastUpdated": { "type": "string", "format": "date", "description": "ISO date of last update" },
    "providers": {
      "type": "object",
      "description": "Provider metadata keyed by provider ID string",
      "additionalProperties": {
        "type": "object",
        "required": ["label", "sseDelimiter", "tokenMultiplier", "defaultPricing"],
        "properties": {
          "label": { "type": "string" },
          "sseDelimiter": {
            "type": "string",
            "description": "SSE event delimiter: '\\n\\n' or '\\n'"
          },
          "tokenMultiplier": {
            "type": "object",
            "required": ["prompt", "completion"],
            "properties": {
              "prompt": { "type": "number" },
              "completion": { "type": "number" }
            }
          },
          "defaultPricing": {
            "type": "object",
            "required": ["inputPerMillion", "outputPerMillion"],
            "properties": {
              "inputPerMillion": { "type": "number" },
              "outputPerMillion": { "type": "number" }
            }
          },
          "modelPrefixes": {
            "type": "array",
            "items": { "type": "string" },
            "description": "Prefixes for inferring provider from model ID"
          },
          "aliases": {
            "type": "array",
            "items": { "type": "string" },
            "description": "Alternative strings for Provider::from_string()"
          },
          "defaultModel": { "type": "string", "description": "Default model ID for this provider" },
          "taskRouting": {
            "type": "object",
            "description": "Model ID to use for each task type",
            "properties": {
              "fast_completion": { "type": "string" },
              "code_generation": { "type": "string" },
              "complex_reasoning": { "type": "string" },
              "chat": { "type": "string" },
              "vision": { "type": "string" },
              "long_context": { "type": "string" }
            }
          },
          "canonicalization": {
            "type": "object",
            "description": "Map of user-facing model ID -> API model ID for this provider",
            "additionalProperties": { "type": "string" }
          }
        }
      }
    },
    "models": {
      "type": "object",
      "description": "Model metadata keyed by model ID",
      "additionalProperties": {
        "type": "object",
        "required": [
          "id",
          "name",
          "provider",
          "modelType",
          "contextWindow",
          "inputCost",
          "outputCost",
          "capabilities",
          "speed",
          "quality",
          "qualityTier",
          "bestFor"
        ],
        "properties": {
          "id": { "type": "string" },
          "apiModelId": { "type": "string", "description": "If omitted, same as id" },
          "name": { "type": "string" },
          "provider": { "type": "string" },
          "modelType": {
            "type": "string",
            "enum": [
              "chat",
              "code",
              "reasoning",
              "multimodal",
              "image",
              "video",
              "search",
              "tts",
              "stt",
              "music"
            ]
          },
          "contextWindow": { "type": "integer" },
          "inputCost": { "type": "number", "description": "Price per 1M input tokens" },
          "outputCost": { "type": "number", "description": "Price per 1M output tokens" },
          "capabilities": {
            "type": "object",
            "required": [
              "streaming",
              "tools",
              "vision",
              "json",
              "thinking",
              "computerUse",
              "agentic",
              "imageGen",
              "videoGen",
              "search",
              "research",
              "codeExecution"
            ],
            "properties": {
              "streaming": { "type": "boolean" },
              "tools": { "type": "boolean" },
              "vision": { "type": "boolean" },
              "json": { "type": "boolean" },
              "thinking": { "type": "boolean" },
              "computerUse": { "type": "boolean" },
              "agentic": { "type": "boolean" },
              "imageGen": { "type": "boolean" },
              "videoGen": { "type": "boolean" },
              "search": { "type": "boolean" },
              "research": { "type": "boolean" },
              "codeExecution": { "type": "boolean" }
            }
          },
          "benchmarks": {
            "type": "object",
            "properties": {
              "swebench": { "type": "number" },
              "humaneval": { "type": "number" },
              "mmlu": { "type": "number" },
              "gpqa": { "type": "number" },
              "aime": { "type": "number" },
              "sweBenchPro": { "type": "number" },
              "terminalBench2": { "type": "number" },
              "osWorldVerified": { "type": "number" },
              "gdpvalWinsOrTies": { "type": "number" },
              "ctfChallenges": { "type": "number" },
              "sweLancerIcDiamond": { "type": "number" },
              "aiderPolyglot": { "type": "number" },
              "tau2Telecom": { "type": "number" }
            }
          },
          "speed": { "type": "string", "enum": ["very-fast", "fast", "medium", "slow"] },
          "quality": { "type": "string", "enum": ["excellent", "good", "fair"] },
          "qualityTier": { "type": "string", "enum": ["fast", "balanced", "best"] },
          "bestFor": { "type": "array", "items": { "type": "string" } },
          "released": { "type": "string" }
        }
      }
    },
    "tierAllowedModels": {
      "type": "object",
      "description": "Subscription tier to allowed model IDs",
      "properties": {
        "economy": { "type": "array", "items": { "type": "string" } },
        "pro_additions": { "type": "array", "items": { "type": "string" } },
        "flagship_additions": { "type": "array", "items": { "type": "string" } }
      }
    },
    "modelPresets": {
      "type": "object",
      "description": "Provider -> QuickModelSelector preset options",
      "additionalProperties": {
        "type": "array",
        "items": {
          "type": "object",
          "required": ["value", "label"],
          "properties": {
            "value": { "type": "string" },
            "label": { "type": "string" }
          }
        }
      }
    },
    "providersInOrder": {
      "type": "array",
      "items": { "type": "string" },
      "description": "Ordered list of provider IDs for UI display"
    }
  }
}
```

---

## Rust Structs for models_config.rs

```rust
use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use std::sync::LazyLock;

/// Top-level config loaded from models.json
#[derive(Debug, Clone, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ModelsConfig {
    pub version: u32,
    pub last_updated: String,
    pub providers: HashMap<String, ProviderConfig>,
    pub models: HashMap<String, ModelConfig>,
    pub tier_allowed_models: TierAllowedModels,
    pub model_presets: HashMap<String, Vec<PresetOption>>,
    pub providers_in_order: Vec<String>,
}

#[derive(Debug, Clone, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ProviderConfig {
    pub label: String,
    pub sse_delimiter: String,
    pub token_multiplier: TokenMultiplier,
    pub default_pricing: DefaultPricing,
    #[serde(default)]
    pub model_prefixes: Vec<String>,
    #[serde(default)]
    pub aliases: Vec<String>,
    #[serde(default)]
    pub default_model: Option<String>,
    #[serde(default)]
    pub task_routing: Option<TaskRouting>,
    #[serde(default)]
    pub canonicalization: HashMap<String, String>,
}

#[derive(Debug, Clone, Deserialize, Serialize)]
pub struct TokenMultiplier {
    pub prompt: f64,
    pub completion: f64,
}

#[derive(Debug, Clone, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct DefaultPricing {
    pub input_per_million: f64,
    pub output_per_million: f64,
}

#[derive(Debug, Clone, Deserialize, Serialize)]
#[serde(rename_all = "snake_case")]
pub struct TaskRouting {
    pub fast_completion: Option<String>,
    pub code_generation: Option<String>,
    pub complex_reasoning: Option<String>,
    pub chat: Option<String>,
    pub vision: Option<String>,
    pub long_context: Option<String>,
}

#[derive(Debug, Clone, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ModelConfig {
    pub id: String,
    #[serde(default)]
    pub api_model_id: Option<String>,
    pub name: String,
    pub provider: String,
    pub model_type: String,
    pub context_window: u64,
    pub input_cost: f64,
    pub output_cost: f64,
    pub capabilities: ModelCapabilities,
    #[serde(default)]
    pub benchmarks: Option<HashMap<String, f64>>,
    pub speed: String,
    pub quality: String,
    pub quality_tier: String,
    pub best_for: Vec<String>,
    #[serde(default)]
    pub released: Option<String>,
}

#[derive(Debug, Clone, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ModelCapabilities {
    pub streaming: bool,
    pub tools: bool,
    pub vision: bool,
    pub json: bool,
    pub thinking: bool,
    pub computer_use: bool,
    pub agentic: bool,
    pub image_gen: bool,
    pub video_gen: bool,
    pub search: bool,
    pub research: bool,
    pub code_execution: bool,
}

#[derive(Debug, Clone, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct TierAllowedModels {
    pub economy: Vec<String>,
    pub pro_additions: Vec<String>,
    pub flagship_additions: Vec<String>,
}

#[derive(Debug, Clone, Deserialize, Serialize)]
pub struct PresetOption {
    pub value: String,
    pub label: String,
}

/// Global singleton for the loaded models config.
/// Loads from the embedded JSON at compile time via include_str!.
pub static MODELS_CONFIG: LazyLock<ModelsConfig> = LazyLock::new(|| {
    let json_str = include_str!("../../../../src/constants/models.json");
    serde_json::from_str(json_str).expect("Failed to parse models.json -- check JSON syntax")
});

// ---- Helper functions ----

impl ModelsConfig {
    /// Look up a model by ID
    pub fn get_model(&self, model_id: &str) -> Option<&ModelConfig> {
        self.models.get(model_id)
    }

    /// Get pricing for a specific model, falling back to provider default
    pub fn get_pricing(&self, provider: &str, model_id: &str) -> (f64, f64) {
        if let Some(model) = self.models.get(model_id) {
            return (model.input_cost, model.output_cost);
        }
        if let Some(provider_cfg) = self.providers.get(provider) {
            return (
                provider_cfg.default_pricing.input_per_million,
                provider_cfg.default_pricing.output_per_million,
            );
        }
        (1.0, 1.0) // fallback
    }

    /// Get SSE delimiter for a provider
    pub fn get_sse_delimiter(&self, provider: &str) -> &str {
        self.providers
            .get(provider)
            .map(|p| p.sse_delimiter.as_str())
            .unwrap_or("\n\n")
    }

    /// Get token multipliers for a provider
    pub fn get_token_multiplier(&self, provider: &str) -> (f64, f64) {
        self.providers
            .get(provider)
            .map(|p| (p.token_multiplier.prompt, p.token_multiplier.completion))
            .unwrap_or((1.0, 1.0))
    }

    /// Infer provider from model ID using prefix matching
    pub fn infer_provider(&self, model_id: &str) -> Option<&str> {
        let model_lower = model_id.to_lowercase();
        for (provider_id, cfg) in &self.providers {
            for prefix in &cfg.model_prefixes {
                if model_lower.starts_with(prefix) {
                    return Some(provider_id.as_str());
                }
            }
        }
        None
    }

    /// Canonicalize a model ID for a given provider
    pub fn canonicalize(&self, provider: &str, model_id: &str) -> String {
        if let Some(provider_cfg) = self.providers.get(provider) {
            if let Some(canonical) = provider_cfg.canonicalization.get(model_id) {
                return canonical.clone();
            }
        }
        model_id.to_string()
    }

    /// Get default model for a provider
    pub fn default_model(&self, provider: &str) -> &str {
        self.providers
            .get(provider)
            .and_then(|p| p.default_model.as_deref())
            .unwrap_or("gpt-5-nano")
    }

    /// Get model for a specific task type
    pub fn model_for_task(&self, provider: &str, task: &str) -> Option<&str> {
        self.providers
            .get(provider)?
            .task_routing
            .as_ref()?
            .get_model(task)
    }

    /// Get context window for a model
    pub fn context_window(&self, model_id: &str) -> u64 {
        self.models
            .get(model_id)
            .map(|m| m.context_window)
            .unwrap_or(128_000)
    }
}

impl TaskRouting {
    fn get_model(&self, task: &str) -> Option<&str> {
        match task {
            "fast_completion" => self.fast_completion.as_deref(),
            "code_generation" => self.code_generation.as_deref(),
            "complex_reasoning" => self.complex_reasoning.as_deref(),
            "chat" => self.chat.as_deref(),
            "vision" => self.vision.as_deref(),
            "long_context" => self.long_context.as_deref(),
            _ => None,
        }
    }
}
```

**Key design decision**: The JSON is embedded at compile time via `include_str!()`. The path `../../../../src/constants/models.json` resolves from `src-tauri/src/core/llm/` up to the repo root then into `apps/desktop/src/constants/`. This means both Rust and TS read the same file, and the Rust binary bundles it -- no runtime file I/O needed.

---

## What Each Rust File Currently Does (and What Changes)

### 1. `sse_parser.rs` (line 103-106)

**Current**: Hardcoded SSE delimiter selection:

```rust
let delimiter: &[u8] = match self.provider {
    crate::core::llm::Provider::Ollama => b"\n",
    _ => b"\n\n",
};
```

**After**: Look up from config:

```rust
let provider_str = self.provider.as_string();
let delimiter_str = MODELS_CONFIG.get_sse_delimiter(provider_str);
let delimiter: &[u8] = delimiter_str.as_bytes();
```

### 2. `token_counter.rs` (lines 216-229)

**Current**: Hardcoded per-provider multipliers:

```rust
let (prompt_multiplier, completion_multiplier) = match provider {
    Provider::OpenAI => (1.0, 1.0),
    Provider::Anthropic => (1.05, 1.05),
    Provider::Google => (0.95, 0.95),
    Provider::Ollama => (1.10, 1.10),
    // ... 8 more arms
};
```

**After**: Look up from config:

```rust
let (prompt_multiplier, completion_multiplier) =
    MODELS_CONFIG.get_token_multiplier(provider.as_string());
```

### 3. `llm_router.rs` (lines 548-614)

**Current**: `infer_provider_from_model()` -- 60 lines of hardcoded prefix matching.

**After**: Single call to `MODELS_CONFIG.infer_provider(model)` then convert string to Provider enum.

### 4. `provider_adapter.rs`

**Current**: Three separate `canonicalize_model()` functions (OpenAI lines 359-376, Anthropic lines 1709-1719, DeepSeek lines 2157-2164).

**After**: Each adapter's `canonicalize_model()` becomes:

```rust
fn canonicalize_model(model: &str) -> String {
    MODELS_CONFIG.canonicalize("openai", model) // or "anthropic", "deepseek"
}
```

The `canonicalization` object in providers.json captures all the input->output mappings currently hardcoded. For OpenAI this includes the regex-like codex suffix stripping -- the JSON will enumerate every known variant explicitly (e.g., `"gpt-5.2-codex-low": "gpt-5.2-codex"`, `"gpt-5.2-codex-medium": "gpt-5.2-codex"`, etc.).

**Note**: The `codex_model_effort_override()` function (lines 346-357) is NOT moved to JSON because it returns a `reasoning.effort` parameter, not a model ID. It stays in OpenAIAdapter.

### 5. `cost_calculator.rs` (all 913 lines)

**Current**: 100+ hardcoded `pricing.insert()` calls and 12 `provider_defaults.insert()` calls.

**After**: Constructor builds the pricing HashMap by iterating `MODELS_CONFIG.models` and `MODELS_CONFIG.providers`:

```rust
pub fn new() -> Self {
    let config = &*MODELS_CONFIG;
    let mut pricing = HashMap::new();
    for (model_id, model) in &config.models {
        if let Some(provider) = Provider::from_string(&model.provider) {
            pricing.insert(
                (provider, model_id.as_str()),
                Pricing {
                    input_per_million: model.input_cost,
                    output_per_million: model.output_cost,
                },
            );
        }
    }
    // ... provider_defaults from config.providers
    // ... media_pricing stays hardcoded (not in JSON)
}
```

**Important**: Media pricing (`MediaType::ImageStandard`, etc.) stays hardcoded in cost_calculator.rs since it uses a different pricing model (per-unit) and is not part of the standard model catalog.

### 6. `core/llm/mod.rs` (lines 556-631)

**Current**: `Provider::default_model()` and `Provider::get_model_for_task()` -- hardcoded match arms.

**After**: Delegate to config:

```rust
pub fn default_model(&self) -> &str {
    MODELS_CONFIG.default_model(self.as_string())
}

pub fn get_model_for_task(&self, task: TaskType) -> &str {
    let task_str = match task {
        TaskType::FastCompletion => "fast_completion",
        TaskType::CodeGeneration => "code_generation",
        TaskType::ComplexReasoning => "complex_reasoning",
        TaskType::Chat => "chat",
        TaskType::Vision => "vision",
        TaskType::LongContext => "long_context",
    };
    MODELS_CONFIG
        .model_for_task(self.as_string(), task_str)
        .unwrap_or_else(|| MODELS_CONFIG.default_model(self.as_string()))
}
```

### 7. `sys/commands/llm.rs` (lines 438-725)

**Current**: `llm_get_available_models()` has ~290 lines of hardcoded `ModelInfo` structs in a `vec![]`.

**After**: Build from config:

```rust
let all_models: Vec<ModelInfo> = MODELS_CONFIG
    .models
    .values()
    .filter(|m| !["image", "video", "tts", "stt", "music"].contains(&m.model_type.as_str()))
    .map(|m| ModelInfo {
        id: m.id.clone(),
        name: m.name.clone(),
        provider: m.provider.clone(),
        available: false,
    })
    .collect();
```

---

## Interface Contracts

### TS Agent -> Rust Agent

**Contract**: `apps/desktop/src/constants/models.json`

- TS Agent creates this file first (Phase 1).
- Rust Agent consumes it via `include_str!()` in models_config.rs (Phase 2).
- The JSON must conform to the schema defined above.
- Field naming uses camelCase (JavaScript convention) -- Rust structs use `#[serde(rename_all = "camelCase")]`.

### Shared Types That Stay in Place

**TS side** (`apps/desktop/src/types/provider.ts`):

```typescript
export type Provider =
  | 'openai'
  | 'anthropic'
  | 'google'
  | 'ollama'
  | 'xai'
  | 'deepseek'
  | 'qwen'
  | 'moonshot'
  | 'perplexity'
  | 'zhipu'
  | 'managed_cloud'
  | 'black-forest-labs'
  | 'suno'
  | 'udio'
  | 'mistral';
```

This union type is NOT moved into models.json. It stays in provider.ts. The TS shim continues to import it.

**Rust side** (`core/llm/mod.rs`):

```rust
pub enum Provider {
    OpenAI, Anthropic, Google, Ollama, Perplexity,
    XAI, DeepSeek, Qwen, Moonshot, Zhipu, Mistral, ManagedCloud,
}
```

This enum stays in mod.rs. It does NOT include `BlackForestLabs`, `Suno`, or `Udio` (those route via ManagedCloud).

### TS Shim Exports (llm.ts after replacement)

The new llm.ts (~150 lines) must re-export everything that the 29 TS importers currently consume. From the grep of all importers, the required exports are:

| Export                             | Type                                     | Used by (count)                               |
| ---------------------------------- | ---------------------------------------- | --------------------------------------------- |
| `MODEL_METADATA`                   | `Record<string, ModelMetadata>`          | 5 files                                       |
| `ModelMetadata` (type)             | interface                                | 8 files                                       |
| `ModelCapabilities` (type)         | interface                                | 0 direct, re-exported for consumers           |
| `getModelMetadata(id)`             | function                                 | 7 files                                       |
| `getAllModels()`                   | function                                 | 2 files                                       |
| `getProviderModels(provider)`      | function                                 | 1 file                                        |
| `formatCost(input, output)`        | function                                 | 2 files                                       |
| `PROVIDER_LABELS`                  | `Record<Provider, string>`               | 4 files                                       |
| `PROVIDERS_IN_ORDER`               | `Provider[]`                             | 2 files                                       |
| `MODEL_PRESETS`                    | `Record<Provider, Array<{value,label}>>` | 3 files                                       |
| `THINKING_MODEL_VARIANTS`          | `Record<string, string>`                 | 2 files                                       |
| `MODEL_CONTEXT_WINDOWS`            | `Record<string, number>`                 | 0 direct (accessed via getModelContextWindow) |
| `getModelContextWindow(id)`        | function                                 | 1 file                                        |
| `isModelAllowedForTier(id, tier)`  | function                                 | 2 files                                       |
| `getAllowedModelsForTier(tier)`    | function                                 | 1 file                                        |
| `normalizeSubscriptionTier(tier)`  | function                                 | 1 file                                        |
| `getAllowedAutoModesForTier(tier)` | function                                 | 1 file                                        |
| `getBestAutoModeForTier(tier)`     | function                                 | 1 file                                        |
| `TIER_ALLOWED_MODELS`              | `Record<SubscriptionTier, string[]>`     | 1 file                                        |

All of these must continue to work identically. The shim reads `models.json` and constructs these exports.

---

## TS Shim Template (llm.ts replacement)

```typescript
import type { Provider } from '../types/provider';
import type { SubscriptionTier } from './planModels';
import modelsJson from './models.json';

// ---- Types (unchanged) ----
export interface ModelCapabilities {
  /* same 12 boolean fields */
}
export interface ModelMetadata {
  /* same fields as current */
}

// ---- Derived data from JSON ----
const config = modelsJson;

export const MODEL_METADATA: Record<string, ModelMetadata> = config.models as Record<
  string,
  ModelMetadata
>;

export const PROVIDER_LABELS: Record<Provider, string> = Object.fromEntries(
  Object.entries(config.providers).map(([id, p]) => [id, p.label]),
) as Record<Provider, string>;

export const MODEL_PRESETS: Record<
  Provider,
  Array<{ value: string; label: string }>
> = config.modelPresets as Record<Provider, Array<{ value: string; label: string }>>;

export const THINKING_MODEL_VARIANTS: Record<string, string> = {};

export const PROVIDERS_IN_ORDER: Provider[] = config.providersInOrder as Provider[];

export const MODEL_CONTEXT_WINDOWS: Record<string, number> = Object.fromEntries(
  Object.entries(config.models).map(([id, m]) => [id, (m as ModelMetadata).contextWindow]),
);

// ---- Tier logic (stays in TS, reads arrays from JSON) ----
const ECONOMY_MODELS = config.tierAllowedModels.economy;
const PRO_ADDITIONS = config.tierAllowedModels.pro_additions;
const FLAGSHIP_ADDITIONS = config.tierAllowedModels.flagship_additions;

export const TIER_ALLOWED_MODELS: Record<SubscriptionTier, string[]> = {
  free: [...ECONOMY_MODELS],
  hobby: [...ECONOMY_MODELS],
  pro: [...PRO_ADDITIONS, ...ECONOMY_MODELS],
  max: [...FLAGSHIP_ADDITIONS, ...PRO_ADDITIONS, ...ECONOMY_MODELS],
  enterprise: [...FLAGSHIP_ADDITIONS, ...PRO_ADDITIONS, ...ECONOMY_MODELS],
};

// ---- Helper functions (unchanged signatures) ----
export function getModelMetadata(modelId: string): ModelMetadata | null {
  /* ... */
}
export function getAllModels(): ModelMetadata[] {
  /* ... */
}
export function getProviderModels(provider: Provider): ModelMetadata[] {
  /* ... */
}
export function getModelContextWindow(modelId: string): number {
  /* ... */
}
export function formatCost(inputCost?: number, outputCost?: number): string {
  /* ... */
}
export function isModelAllowedForTier(modelId: string, tier: SubscriptionTier): boolean {
  /* ... */
}
export function getAllowedModelsForTier(tier: SubscriptionTier): string[] {
  /* ... */
}
export function normalizeSubscriptionTier(
  tier: SubscriptionTier | string | null | undefined,
): SubscriptionTier {
  /* ... */
}
export function getAllowedAutoModesForTier(
  tier: SubscriptionTier | string | null | undefined,
): string[] {
  /* ... */
}
export function getBestAutoModeForTier(tier: SubscriptionTier | string | null | undefined): string {
  /* ... */
}
```

---

## Web App Fix (apps/web/constants/llm.ts)

**Current state**: Stub file with `export const _stub = true; export default {} as any;` and dummy `getModelMetadata` function. 5+ web components import from `@/constants/llm` and get TS2614 errors.

**Fix**: Replace with proper re-exports that read from the same `models.json`. Since the web app is in `apps/web/` and models.json is in `apps/desktop/src/constants/`, the web app needs either:

1. A tsconfig path alias pointing to the desktop constants directory, OR
2. A copy of models.json in `apps/web/constants/`, OR
3. A symlink.

**Chosen approach**: Add a tsconfig path alias. Add to `apps/web/tsconfig.json`:

```json
"paths": {
  "@/*": ["./*"],
  "@features/*": ["./features/*"],
  "@core/*": ["./core/*"],
  "@shared/*": ["./shared/*"],
  "@desktop-constants/*": ["../desktop/src/constants/*"]
}
```

Then `apps/web/constants/llm.ts` becomes:

```typescript
// Re-export model catalog from desktop (single source of truth)
export {
  MODEL_METADATA,
  getModelMetadata,
  PROVIDER_LABELS,
  PROVIDERS_IN_ORDER,
  THINKING_MODEL_VARIANTS,
  isModelAllowedForTier,
  getAllModels,
  getProviderModels,
  formatCost,
  MODEL_PRESETS,
  getModelContextWindow,
  MODEL_CONTEXT_WINDOWS,
} from '@desktop-constants/llm';
export type { ModelMetadata, ModelCapabilities } from '@desktop-constants/llm';
```

---

## DO NOT TOUCH Sections

These files/sections must NOT be modified by either agent:

| File                                                                                                     | Reason                                                       |
| -------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------ |
| `apps/desktop/src/types/provider.ts`                                                                     | Provider union type source of truth for TS -- stays separate |
| `apps/desktop/src/constants/planModels.ts`                                                               | SubscriptionTier type stays here                             |
| `apps/desktop/src-tauri/src/core/llm/mod.rs` lines 24-91 (LLMRequest)                                    | Core request struct, unrelated to model catalog              |
| `apps/desktop/src-tauri/src/core/llm/mod.rs` lines 104-491 (ChatMessage, ContentPart, etc.)              | Core message types                                           |
| `apps/desktop/src-tauri/src/core/llm/mod.rs` lines 492-516 (Provider enum)                               | Provider enum stays in Rust, NOT extracted to JSON           |
| `apps/desktop/src-tauri/src/core/llm/mod.rs` lines 517-555 (Provider::as_string, from_string)            | Provider string conversion stays in Rust                     |
| `apps/desktop/src-tauri/src/core/llm/provider_adapter.rs` lines 346-357 (codex_model_effort_override)    | Effort params are not model catalog data                     |
| `apps/desktop/src-tauri/src/core/llm/cost_calculator.rs` media pricing section (lines 767-812)           | Per-unit media pricing has different schema                  |
| `apps/desktop/src-tauri/src/core/llm/llm_router.rs` RetryConfig, is_retryable_error                      | Retry logic unrelated to model data                          |
| `apps/desktop/src-tauri/src/lib.rs`                                                                      | Entry point                                                  |
| `apps/desktop/src-tauri/src/core/llm/sse_parser.rs` everything except delimiter selection (line 103-106) | Only the delimiter match arm changes                         |
| All files in `apps/desktop/src-tauri/src/core/llm/providers/`                                            | Provider implementations are separate                        |

---

## Critical Constraints

1. **No Meta provider** -- `black-forest-labs`, `suno`, `udio` exist in TS Provider union and JSON but NOT in Rust Provider enum. They route through ManagedCloud.

2. **Zero breaking changes to 29 TS importers** -- Every named export must continue to exist with the same type signature. The grep shows 24 unique import statements across 24 files.

3. **Provider enum stays in Rust** -- The Rust `Provider` enum in mod.rs (12 variants) stays as-is. JSON uses string provider IDs. Conversion between them uses the existing `Provider::from_string()` / `Provider::as_string()`.

4. **Provider type stays in TS** -- The `Provider` union type in `provider.ts` (15 variants including black-forest-labs, suno, udio) stays as-is.

5. **include_str! path** -- The Rust `include_str!()` path must be relative to the `.rs` file location. From `src-tauri/src/core/llm/models_config.rs`, the path to `src/constants/models.json` is `../../../../src/constants/models.json`.

6. **serde rename_all = camelCase** -- JSON uses camelCase (TS convention). Rust structs use snake_case with `#[serde(rename_all = "camelCase")]`.

7. **Canonicalization for grok-4** -- Currently in OpenAIAdapter::canonicalize_model() even though grok-4 is an xAI model. This is because the canonicalization happens before the request is routed. In the JSON, this mapping (`"grok-4" -> "grok-4-0709"`) should go under `providers.xai.canonicalization`, not `providers.openai.canonicalization`. The Rust agent must update the canonicalize call site to use the model's actual provider.

8. **Legacy model IDs in cost_calculator.rs** -- The cost calculator has pricing entries for legacy models like `gpt-4o`, `gpt-4o-mini`, `claude-3-5-sonnet-20241022` that are NOT in the model catalog. These should be added to the JSON under a `legacyPricing` section or as regular model entries with a `"deprecated": true` flag. The Rust agent decides.

9. **Rust models that differ from TS** -- The Rust `sys/commands/llm.rs` hardcoded model list includes models not in TS MODEL_METADATA: `claude-sonnet-4.6` (missing), `gemini-3-flash-preview`, `gemini-3-pro-preview`, `gemini-3-ultra`, `qwen-coder-plus`, `kimi-k2.5-turbo`, `mistral-small-3`, `pixtral-large`. These should all be in models.json. The TS agent must include them.

10. **models.json resolveJsonModule** -- Both `apps/desktop/tsconfig.json` and Vite handle JSON imports. The TS agent must verify `"resolveJsonModule": true` is in the desktop tsconfig (it should be via tsconfig.base.json).

---

## Verification Checklist

Before spawning agents, verify:

- [x] All file paths exist in the codebase (verified via Read tool)
- [x] All interface contracts are compatible (JSON schema + serde + TS types)
- [x] No circular dependencies between agent scopes (TS writes JSON, Rust reads JSON)
- [x] DO NOT TOUCH sections are clearly communicated
- [x] 29 TS importers documented with required exports
- [x] Complete model inventory (52 models) with all fields
- [x] Provider inventory (15 providers) with all metadata
- [x] Canonicalization maps fully enumerated
- [x] Task routing tables fully enumerated
- [x] Token multipliers for all 12 Rust providers captured

## Execution Order

1. **Phase 1 (TS Agent)**: Create `models.json` with all data from this spec. This MUST complete before Phase 2.
2. **Phases 2-7 (Rust Agent)**: Create `models_config.rs`, then migrate each Rust file one at a time.
3. **Phase 8 (TS Agent)**: Replace `llm.ts` with shim, fix `web/constants/llm.ts`, add tsconfig alias.

Phases 2-7 can proceed in any order. Phase 8 can run in parallel with Phases 2-7 since the shim reads the same JSON that Phase 1 created.

---

## Additional Rust-Only Models to Include in JSON

These models appear in Rust cost_calculator.rs and/or sys/commands/llm.rs but are missing from the TS MODEL_METADATA. The TS agent must add them to models.json:

| Model ID                   | Provider  | Notes                                               |
| -------------------------- | --------- | --------------------------------------------------- |
| gemini-3-flash-preview     | google    | In Rust task routing + llm commands                 |
| gemini-3-pro-preview       | google    | In Rust task routing + llm commands                 |
| gemini-3-ultra             | google    | In Rust llm commands                                |
| gemini-2.5-pro             | google    | In Rust task routing                                |
| gemini-2.5-flash           | google    | In Rust cost calculator                             |
| gemini-2.0-flash           | google    | In Rust cost calculator                             |
| qwen-coder-plus            | qwen      | In Rust llm commands + task routing                 |
| qwen-coder                 | qwen      | In Rust cost calculator                             |
| qwen-max-preview           | qwen      | In Rust cost calculator                             |
| kimi-k2.5-turbo            | moonshot  | In Rust llm commands + cost calculator              |
| mistral-small-3            | mistral   | In Rust llm commands + cost calculator              |
| pixtral-large              | mistral   | In Rust llm commands + cost calculator              |
| gpt-5                      | openai    | In Rust cost calculator (legacy)                    |
| gpt-5-mini                 | openai    | In Rust cost calculator (legacy)                    |
| gpt-5-codex                | openai    | In Rust cost calculator (legacy alias)              |
| gpt-5.2-codex              | openai    | In Rust cost calculator (canonical)                 |
| gpt-5.2-pro                | openai    | In Rust cost calculator (canonical for gpt-5-pro)   |
| o4-mini                    | openai    | In Rust cost calculator                             |
| grok-4-0709                | xai       | In Rust cost calculator (canonical for grok-4)      |
| grok-code-fast-1           | xai       | In Rust cost calculator                             |
| deepseek-reasoner          | deepseek  | In Rust cost calculator (canonical for deepseek-r1) |
| glm-4-plus                 | zhipu     | In Rust cost calculator                             |
| glm-4-air                  | zhipu     | In Rust cost calculator                             |
| glm-4-airx                 | zhipu     | In Rust cost calculator                             |
| glm-4-flash                | zhipu     | In Rust cost calculator                             |
| gpt-4o                     | openai    | In Rust cost calculator (legacy)                    |
| gpt-4o-mini                | openai    | In Rust cost calculator (legacy)                    |
| claude-3-5-sonnet-20241022 | anthropic | In Rust cost calculator (legacy)                    |
| claude-haiku-4-5           | anthropic | In Rust cost calculator (hyphenated variant)        |
| claude-sonnet-4-5          | anthropic | In Rust cost calculator (hyphenated variant)        |
| claude-sonnet-4-5-20250929 | anthropic | In Rust cost calculator (pinned)                    |
| claude-sonnet-4-6          | anthropic | In Rust llm commands (hyphenated)                   |
| claude-opus-4-6            | anthropic | In Rust cost calculator (hyphenated)                |

**Decision**: Include all of these in models.json. For legacy/alias models, add a `"deprecated": true` field. For hyphenated Anthropic variants, they are already covered by the dotted versions -- the canonicalization map handles the translation. But the cost calculator needs them as separate entries, so include them.
