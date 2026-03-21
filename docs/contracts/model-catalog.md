# Model Catalog Contract

> Canonical contract for how model metadata is defined, shared, and consumed
> across all surfaces of the AGI Workforce platform.

## Overview

The platform supports 20+ LLM providers and 50+ models across five surfaces:
Desktop (Tauri), Web (Next.js), Mobile (Expo), CLI (Rust), and API Gateway.
This contract defines how model metadata flows from a single source of truth
to each surface.

---

## Source of Truth

### Canonical Types: `packages/types/src/model-catalog.ts`

All surfaces MUST use the types defined in this file for model metadata:

| Type                | Purpose                                                                                                                            |
| ------------------- | ---------------------------------------------------------------------------------------------------------------------------------- |
| `Provider`          | Union type of all provider identifiers (22 providers)                                                                              |
| `ModelMetadata`     | Full model entry: id, name, provider, contextWindow, costs, capabilities, benchmarks, speed, quality                               |
| `ModelCapabilities` | Boolean flags: streaming, tools, vision, json, thinking, computerUse, agentic, imageGen, videoGen, search, research, codeExecution |
| `ProviderConfig`    | Per-provider configuration: label, SSE delimiter, token multipliers, default pricing, task routing                                 |
| `ModelsCatalog`     | Top-level schema for the `models.json` data file                                                                                   |
| `ModelType`         | Category: chat, code, reasoning, multimodal, image, video, search, tts, stt, music                                                 |
| `ModelQualityTier`  | Routing tier: fast, balanced, best                                                                                                 |

### Canonical Data: `apps/web/constants/models.json`

The raw model data is stored in a JSON file that is:

- Consumed directly by the web app
- Imported by the desktop app via `apps/desktop/src/constants/llm.ts`
- Embedded in the Rust desktop binary via `include_str!`
- Served to the mobile app via API responses

### Supplementary Types

| File                            | Purpose                                                                            | Scope            |
| ------------------------------- | ---------------------------------------------------------------------------------- | ---------------- |
| `packages/types/src/model.ts`   | Simplified types for UI components: `ModelProvider`, `ModelConfig`, `ModelPricing` | All surfaces     |
| `packages/types/src/pairing.ts` | Device info types used during model negotiation                                    | Mobile + Desktop |

---

## Surface-Specific Implementations

### Desktop (`apps/desktop/`)

| File                                      | Role                                                                                                |
| ----------------------------------------- | --------------------------------------------------------------------------------------------------- |
| `src/constants/llm.ts`                    | Imports `models.json`, exports lookup functions (`getAllModels`, `getModelMetadata`, etc.)          |
| `src/constants/planModels.ts`             | Subscription tier features and message limits (does NOT define models)                              |
| `src/stores/modelStore.ts`                | Zustand store: model selection, favorites, provider status, Ollama management, intelligent routing  |
| `src/types/provider.ts`                   | `Provider` type re-export for desktop-specific code                                                 |
| `src-tauri/src/core/llm/models_config.rs` | Rust mirror: embeds `models.json` via `include_str!`, provides `model_catalog()` and `find_model()` |

### Mobile (`apps/mobile/`)

| File            | Role                                                             |
| --------------- | ---------------------------------------------------------------- |
| `lib/models.ts` | Standalone model catalog with `ModelDef` and `ProviderDef` types |

**Migration note**: `apps/mobile/lib/models.ts` currently defines its own `ModelDef` interface.
This should be migrated to import from `@agiworkforce/types` using the canonical `ModelMetadata`
type, or a lightweight subset thereof. The mobile catalog is a filtered view (no Ollama,
no image/video-only models) of the canonical catalog.

### CLI (`apps/cli/`)

| File              | Role                                                                                        |
| ----------------- | ------------------------------------------------------------------------------------------- |
| `src/provider.rs` | Rust `ModelInfo` struct with capabilities and pricing; `model_catalog()` returns all models |

**Migration note**: The CLI's `ModelInfo` struct has a different field set than the canonical
`ModelMetadata`. Fields like `supports_audio_input`, `supports_audio_output`, `supports_pdf`,
`status`, and `release_date` exist only in the CLI. These should be added to the canonical
type as optional fields.

### Web (`apps/web/`)

| File                          | Role                                     |
| ----------------------------- | ---------------------------------------- |
| `constants/models.json`       | Raw data source (authoritative)          |
| Various store/component files | Consume types from `@agiworkforce/types` |

### API Gateway (`services/api-gateway/`)

Does not define model metadata directly. Forwards model selection from clients.

---

## Provider Registry

Current providers (22 total, defined in `packages/types/src/model-catalog.ts`):

| Provider ID     | Name          | Category                |
| --------------- | ------------- | ----------------------- |
| `openai`        | OpenAI        | Cloud                   |
| `anthropic`     | Anthropic     | Cloud                   |
| `google`        | Google        | Cloud                   |
| `xai`           | xAI           | Cloud                   |
| `deepseek`      | DeepSeek      | Cloud                   |
| `moonshot`      | Moonshot      | Cloud                   |
| `qwen`          | Qwen          | Cloud                   |
| `zhipu`         | ZhipuAI       | Cloud                   |
| `perplexity`    | Perplexity    | Cloud                   |
| `mistral`       | Mistral       | Cloud                   |
| `groq`          | Groq          | Cloud (inference)       |
| `together`      | Together      | Cloud (inference)       |
| `fireworks`     | Fireworks     | Cloud (inference)       |
| `cerebras`      | Cerebras      | Cloud (inference)       |
| `deepinfra`     | DeepInfra     | Cloud (inference)       |
| `cohere`        | Cohere        | Cloud                   |
| `ai21`          | AI21          | Cloud                   |
| `sambanova`     | SambaNova     | Cloud                   |
| `azure`         | Azure OpenAI  | Cloud (enterprise)      |
| `bedrock`       | AWS Bedrock   | Cloud (enterprise)      |
| `ollama`        | Ollama        | Local                   |
| `managed_cloud` | Managed Cloud | Platform (auto-routing) |

---

## How to Add a New Model

### Step 1: Add to `models.json`

Add an entry to `apps/web/constants/models.json` under the `models` key:

```json
{
  "new-model-id": {
    "id": "new-model-id",
    "name": "New Model",
    "provider": "provider-id",
    "modelType": "chat",
    "contextWindow": 128000,
    "inputCost": 1.0,
    "outputCost": 3.0,
    "capabilities": {
      "streaming": true,
      "tools": true,
      "vision": false,
      "json": true,
      "thinking": false,
      "computerUse": false,
      "agentic": false,
      "imageGen": false,
      "videoGen": false,
      "search": false,
      "research": false,
      "codeExecution": false
    },
    "speed": "fast",
    "quality": "good",
    "qualityTier": "balanced",
    "bestFor": ["general chat", "code generation"],
    "released": "2026-03"
  }
}
```

### Step 2: Add to tier visibility (if applicable)

In the `tierAllowedModels` section of `models.json`, add the model ID to the
appropriate tier array:

- `economy`: Available to all tiers (free, hobby, pro, max, enterprise)
- `pro_additions`: Available to pro, max, enterprise
- `flagship_additions`: Available to max, enterprise only

### Step 3: Update CLI catalog (if the model is relevant for CLI)

Add a `ModelInfo` entry in `apps/cli/src/provider.rs` `model_catalog()` function.

### Step 4: Update mobile catalog (if the model is relevant for mobile)

Add a `ModelDef` entry in `apps/mobile/lib/models.ts` `MODEL_LIST` array.
(This step will be removed once mobile migrates to the shared catalog.)

### Step 5: Rebuild

- Desktop: Rust binary re-embeds `models.json` on next `cargo build`
- Web: Next.js picks up JSON changes on next build
- Mobile: Manual update required until catalog sharing is implemented

---

## How to Add a New Provider

### Step 1: Add to the `Provider` union type

Edit `packages/types/src/model-catalog.ts` and add the new provider ID:

```typescript
export type Provider =
  | 'openai'
  // ... existing providers ...
  | 'new_provider';
```

### Step 2: Add provider config to `models.json`

Add an entry under the `providers` key:

```json
{
  "new_provider": {
    "label": "New Provider",
    "defaultPricing": {
      "inputPerMillion": 1.0,
      "outputPerMillion": 3.0
    },
    "modelPrefixes": ["newprov-"],
    "defaultModel": "newprov-base"
  }
}
```

### Step 3: Add provider UI metadata (mobile)

Add to `apps/mobile/lib/models.ts` `PROVIDERS` array:

```typescript
{ id: 'new_provider', name: 'New Provider', icon: 'Sparkles', color: '#ff6600' }
```

### Step 4: Implement provider in Rust backend

Add provider routing logic in `apps/desktop/src-tauri/src/core/llm/` and
register in the LLM router.

### Step 5: Update desktop model store

Add the provider to the `providerStatuses` initial state and `defaultUsageStats.byProvider`
in `apps/desktop/src/stores/modelStore.ts`.

---

## Fallback and Health Semantics

### Provider Health Status

Each provider can be in one of these states:

| Status      | Meaning                                                  | Action                        |
| ----------- | -------------------------------------------------------- | ----------------------------- |
| `connected` | API key configured and validated; provider is responding | Use normally                  |
| `error`     | API key configured but provider is returning errors      | Show error badge; allow retry |
| `unchecked` | API key may or may not be configured; status unknown     | Check on first use            |
| (null)      | Never checked                                            | Trigger health check          |

### Model Availability

Models have a lifecycle status:

| Status       | Meaning                                        |
| ------------ | ---------------------------------------------- |
| `active`     | Model is available for use                     |
| `beta`       | Model is in preview; may have limitations      |
| `deprecated` | Model is being phased out; prefer alternatives |

### Fallback Chain

When a selected model is unavailable:

1. If the model belongs to a provider that is in `error` state, show provider error to user.
2. If the model is `deprecated`, warn but allow use (do not auto-fallback).
3. If auto-mode is selected, the routing layer picks the best available model for the tier:
   - `auto-economy`: Cheapest model with acceptable quality
   - `auto-balanced`: Best quality-to-cost ratio
   - `auto-premium`: Highest capability model available
4. If all providers fail, fall back to `managed_cloud` (platform-hosted routing).
5. If `managed_cloud` fails, fall back to `ollama` (local, if available).

### Tier Enforcement

The desktop enforces tier restrictions in `modelStore.ts`:

| Tier             | Allowed Auto Modes              | Allowed Models           |
| ---------------- | ------------------------------- | ------------------------ |
| free / hobby     | `auto-economy` only             | Economy tier models only |
| pro              | `auto-economy`, `auto-balanced` | Economy + pro_additions  |
| max / enterprise | All auto modes                  | All models               |

Enforcement is triggered on:

- Model selection (guard in `selectModel`)
- Plan change (subscription via `useUnifiedAuthStore`)
- Simple mode toggle (auto-selects best allowed mode)

---

## Cross-Surface Field Mapping

| Canonical (`ModelMetadata`) | Mobile (`ModelDef`) | CLI (`ModelInfo`)       | Notes                                  |
| --------------------------- | ------------------- | ----------------------- | -------------------------------------- |
| `id`                        | `id`                | `id`                    | Exact match                            |
| `name`                      | `name`              | (derived from id)       | CLI does not store display name        |
| `provider`                  | `provider`          | `provider`              | Same semantics                         |
| `contextWindow`             | `contextWindow`     | `context_window`        | snake_case in Rust                     |
| `inputCost`                 | --                  | `input_price_per_1m`    | Mobile does not include pricing        |
| `outputCost`                | --                  | `output_price_per_1m`   | Mobile does not include pricing        |
| `capabilities.vision`       | `supportsVision`    | `supports_vision`       | Same semantics                         |
| `capabilities.thinking`     | `supportsThinking`  | `supports_reasoning`    | Different naming                       |
| `capabilities.tools`        | --                  | `supports_tools`        | Mobile does not expose                 |
| --                          | `maxOutput`         | `max_output_tokens`     | Not in canonical type; should be added |
| --                          | `tier`              | --                      | Mobile-only routing hint               |
| --                          | --                  | `status`                | CLI-only lifecycle field               |
| --                          | --                  | `release_date`          | CLI-only                               |
| --                          | --                  | `supports_audio_input`  | CLI-only                               |
| --                          | --                  | `supports_audio_output` | CLI-only                               |
| --                          | --                  | `supports_pdf`          | CLI-only                               |

### Recommended Additions to `ModelMetadata`

To unify the field set, the following optional fields should be added to the canonical
`ModelMetadata` interface in `packages/types/src/model-catalog.ts`:

- `maxOutputTokens?: number` -- Maximum output tokens (already in mobile + CLI)
- `status?: 'active' | 'beta' | 'deprecated'` -- Lifecycle status (already in CLI)
- `releasedDate?: string` -- Release date string (already in CLI as `release_date`)
