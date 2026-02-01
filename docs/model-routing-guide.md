# Model Routing System - Complete Developer Guide

> A comprehensive guide to understanding and extending the model routing system in AGI Workforce.

---

## Table of Contents

1. [Overview](#1-overview)
2. [How Routing Decisions Are Made](#2-how-routing-decisions-are-made)
3. [The Routing Pipeline](#3-the-routing-pipeline)
4. [Benchmark-Based Selection](#4-benchmark-based-selection)
5. [Adding New Models (Step-by-Step)](#5-adding-new-models-step-by-step)
6. [Key Files Reference](#6-key-files-reference)
7. [Architecture Diagrams](#7-architecture-diagrams)

---

## 1. Overview

The model routing system selects the optimal AI model for each user request based on:

| Factor               | Description                                     |
| -------------------- | ----------------------------------------------- |
| **Task Type**        | coding, reasoning, general, agentic, multimodal |
| **Benchmark Scores** | SWE-bench, MMLU, GPQA, AIME, HumanEval          |
| **Capabilities**     | vision, tools, thinking, computerUse, agentic   |
| **Cost**             | Input/output token pricing                      |
| **User Tier**        | hobby, pro, max, enterprise                     |
| **Complexity**       | simple (70%), moderate (20%), complex (10%)     |

### Core Principle: Benchmark-First Routing

**Quality always wins.** The system prioritizes benchmark performance:

```
Primary Sort:  BENCHMARK SCORE (highest wins)
Tiebreaker:    COST (lowest wins when benchmarks within 0.5%)
```

### Supported Providers (11)

| Provider         | Models                             | Specialty                |
| ---------------- | ---------------------------------- | ------------------------ |
| **OpenAI**       | GPT-5.2, GPT-5-Pro, GPT-5-Nano, o3 | Reasoning, Agentic       |
| **Anthropic**    | Claude Opus/Sonnet/Haiku 4.5       | Coding, Computer Use     |
| **Google**       | Gemini 3 Ultra/Pro/Flash           | Long Context, Multimodal |
| **xAI**          | Grok 4.1, 4.1-Fast-Reasoning       | Real-time Data           |
| **DeepSeek**     | V3.2, R1                           | Budget Coding            |
| **Qwen**         | Qwen3-Max, Coder-Plus/Flash        | Multilingual             |
| **Moonshot**     | Kimi K2.5, K2.5-Thinking           | Math, Swarms             |
| **Perplexity**   | Sonar, Sonar-Deep-Research         | Web Search               |
| **ZhipuAI**      | GLM-4.7, GLM-4.6V                  | Open-Weight Coding       |
| **Ollama**       | llama4-maverick                    | Local/Privacy            |
| **ManagedCloud** | All via proxy                      | Subscription Billing     |

---

## 2. How Routing Decisions Are Made

### 2.1 Auto Modes (User-Facing)

Users select one of three auto modes:

| Mode            | Tier           | Strategy                                            |
| --------------- | -------------- | --------------------------------------------------- |
| `auto-economy`  | Hobby          | Cheapest viable models, 70/20/10 complexity routing |
| `auto-balanced` | Pro            | Quality/cost balance, task-specific preferences     |
| `auto-premium`  | Max/Enterprise | Best benchmarks regardless of cost                  |

### 2.2 Decision Flow

```
USER MESSAGE
    │
    ├─1─► Intent Classification
    │     ├─ Local keyword matching (free, <1ms)
    │     │   • High confidence (≥3 points) → skip LLM
    │     │   • Low confidence → call Gemini Flash
    │     └─ Returns: chat, coding, image-gen, video-gen, search, agentic, multimodal
    │
    ├─2─► Detect Special Inputs
    │     ├─ Has images? → Force multimodal
    │     ├─ Has audio? → Route to audio models
    │     └─ Has video? → Route to video models
    │
    ├─3─► Capability Check (HARD REQUIREMENTS)
    │     ├─ Multimodal → MUST have vision: true
    │     ├─ Agentic → MUST have tools: true AND agentic: true
    │     └─ Coding → SHOULD have tools: true (soft)
    │
    ├─4─► Select From Model Pool
    │     ├─ Filter by tier-allowed models
    │     ├─ Filter by capability requirements
    │     ├─ Filter by benchmark thresholds
    │     ├─ Sort by BENCHMARK (primary)
    │     └─ Sort by COST (tiebreaker)
    │
    └─5─► Return Selected Model + Reasoning
```

### 2.3 Task Type Keywords (Local Classification)

The system first tries fast keyword matching before using an LLM:

```typescript
coding: ['write code', 'implement', 'debug', 'refactor', 'unit test', 'git', ...]
reasoning: ['explain why', 'analyze', 'compare', 'pros and cons', 'solve', ...]
general: ['what is', 'tell me about', 'explain', 'summarize', 'translate', ...]
agentic: ['browse the web', 'click', 'navigate', 'fill form', 'automate', ...]
multimodal: ['look at this image', 'screenshot', 'describe this image', ...]
```

High-confidence keywords (3 points each) allow skipping LLM classification.

---

## 3. The Routing Pipeline

### 3.1 Frontend Router (TypeScript)

**File:** `apps/desktop/src/lib/modelRouter.ts`

```typescript
// Main entry point for intelligent routing
async function routeIntelligently(
  message: string,
  autoMode: AutoMode,
  options: {
    hasImages?: boolean;
    hasAudio?: boolean;
    hasVideo?: boolean;
    conversationContext?: string;
    availableMcpTools?: McpTool[];
    userPreferences?: {...};
  },
  llmClassify?: (prompt: string) => Promise<string>
): Promise<IntelligentRoutingResult>

// Synchronous version (local classification only)
function routeIntelligentlySync(...): IntelligentRoutingResult

// Simple routing (legacy)
function routeMessage(message, autoMode, hasImages): RoutingResult
```

### 3.2 Backend Router (Rust)

**File:** `apps/desktop/src-tauri/src/core/llm/llm_router.rs`

The Rust backend receives routing context from the frontend and:

1. Generates ordered candidate list
2. Tries each candidate with retries
3. Handles fallbacks on rate limits/failures

```rust
pub struct LLMRouter {
    providers: HashMap<Provider, Box<dyn LLMProvider>>,
    cost_calculator: CostCalculator,
    cache_manager: Option<CacheManager>,
}

impl LLMRouter {
    // Generate candidates in priority order
    pub fn candidates(&self, request: &LLMRequest, preferences: &RouterPreferences) -> Vec<RouteCandidate>;

    // Execute with automatic fallback
    pub async fn route_with_retry(&self, request: &LLMRequest, ...) -> Result<RouteOutcome>;
}
```

### 3.3 Fallback Chain

**File:** `apps/desktop/src-tauri/src/core/llm/fallback_chain.rs`

When the primary model fails:

```
Candidate 1 (Primary)
    │
    ├── Rate limited? → Skip, track cooldown
    ├── Success? → Return result
    └── Fail? → Try next
    │
Candidate 2 (Fallback)
    │
    ├── Retry with exponential backoff (500ms → 1s → 2s → ... → 30s max)
    └── ...
    │
Candidate N
    │
    └── All failed → Return error with suggestions
```

**Retry Configuration:**

- Max retries per candidate: 3
- Initial delay: 500ms
- Max delay: 10 seconds (global), 30 seconds (within chain)
- Backoff multiplier: 2.0

---

## 4. Benchmark-Based Selection

### 4.1 Benchmark Weights by Task Type

```typescript
coding:     SWE-bench (70%) + HumanEval (30%)
reasoning:  GPQA Diamond (50%) + AIME (50%)
general:    MMLU (100%)
agentic:    SWE-bench (50%) + MMLU (50%) + agentic_flag_boost
multimodal: MMLU (100%) + vision_required
```

### 4.2 January 2026 Benchmark Leaders

| Task           | #1 Model        | Score           | #2 Model        | Score |
| -------------- | --------------- | --------------- | --------------- | ----- |
| **Coding**     | Claude Opus 4.5 | 80.9% SWE-bench | GPT-5.2         | 80.0% |
| **Reasoning**  | GPT-5.2         | 100% AIME       | Claude Opus 4.5 | 93%   |
| **General**    | GPT-5.2         | 93.2% MMLU      | Gemini 3 Ultra  | 90.1% |
| **Agentic**    | GPT-5.2         | 97% τ²-bench    | Claude Opus 4.5 | -     |
| **Multimodal** | Gemini 3 Ultra  | Native Video    | GPT-5.2         | -     |

### 4.3 Minimum Thresholds (Economy Mode)

```typescript
BENCHMARK_THRESHOLDS = {
  coding: { metric: 'swebench', minimum: 50 },
  reasoning: { metric: 'gpqa', minimum: 55 },
  general: { metric: 'mmlu', minimum: 80 },
  agentic: { metric: 'swebench', minimum: 40 },
  multimodal: { metric: 'mmlu', minimum: 75 },
};
```

Models below these thresholds are excluded from economy routing.

### 4.4 Complexity-Based Routing (70/20/10)

For economy mode, traffic is distributed by estimated complexity:

| Complexity   | % Traffic | Models Used                                 |
| ------------ | --------- | ------------------------------------------- |
| **Simple**   | 70%       | DeepSeek V3.2, GLM-4.6V-Flash, Qwen-Flash   |
| **Moderate** | 20%       | Gemini 3 Flash, GLM-4.7, Kimi K2.5-Thinking |
| **Complex**  | 10%       | GPT-5.2, Claude Sonnet 4.5, Gemini 3 Pro    |

Complexity is estimated from:

- Message length (>200 words = +2)
- Pattern matching (research, thesis, refactor = +2)
- Question count (≥3 = +2)
- Code blocks (+1)
- Attachments (+1)

---

## 5. Adding New Models (Step-by-Step)

### Step 1: Add Model Metadata (Frontend)

**File:** `apps/desktop/src/constants/llm.ts`

```typescript
export const MODEL_METADATA: Record<string, ModelMetadata> = {
  // Add your new model:
  'claude-5-opus': {
    id: 'claude-5-opus',
    apiModelId: 'claude-5-opus-20260601', // Actual API ID
    name: 'Claude 5 Opus',
    provider: 'anthropic',
    modelType: 'reasoning', // chat | code | reasoning | multimodal | image | video | search
    contextWindow: 500_000,
    inputCost: 10.0, // $ per 1M tokens
    outputCost: 50.0, // $ per 1M tokens
    capabilities: {
      streaming: true,
      tools: true,
      vision: true,
      json: true,
      thinking: true,
      computerUse: true,
      agentic: true,
      imageGen: false,
      videoGen: false,
      search: false,
      research: false,
      codeExecution: false,
    },
    benchmarks: {
      swebench: 85.0, // Get from swebench.com
      humaneval: 99.0, // Get from provider
      mmlu: 95.0, // Get from lmarena.ai
      gpqa: 92.0, // GPQA Diamond
      aime: 96.0, // AIME 2025/2026
    },
    speed: 'slow', // very-fast | fast | medium | slow
    quality: 'excellent', // excellent | good | fair
    qualityTier: 'best', // fast | balanced | best
    bestFor: ['Complex Coding', 'Research', 'Multi-step Reasoning'],
    released: 'June 2026',
  },
  // ... existing models
};
```

### Step 2: Add Context Window

**File:** `apps/desktop/src/constants/llm.ts`

```typescript
export const MODEL_CONTEXT_WINDOWS: Record<string, number> = {
  // Add:
  'claude-5-opus': 500_000,
  // ... existing
};
```

### Step 3: Add to Tier Access Lists

**File:** `apps/desktop/src/constants/llm.ts`

```typescript
export const TIER_ALLOWED_MODELS: Record<SubscriptionTier, string[]> = {
  free: [
    // Economy models only
  ],
  hobby: [
    // Same as free
  ],
  pro: [
    'claude-5-opus', // Add to pro if mid-tier
    // ... existing
  ],
  max: [
    'claude-5-opus', // Add to max (flagship)
    // ... existing
  ],
  enterprise: [
    'claude-5-opus', // Same as max
    // ... existing
  ],
};
```

### Step 4: Add to Model Pools

**File:** `apps/desktop/src/lib/modelRouter.ts`

```typescript
export const MODEL_POOLS: Record<AutoMode, string[]> = {
  'auto-economy': [
    // Only if very cheap (< $1/1M output)
  ],
  'auto-balanced': [
    'claude-5-opus', // Add if $1-15/1M output
    // ... existing
  ],
  'auto-premium': [
    'claude-5-opus', // Always add flagships here
    // ... existing (ordered by benchmark!)
  ],
};
```

### Step 5: Add to Task Preferences (Optional)

If the model is a leader in a specific task type:

**File:** `apps/desktop/src/lib/modelRouter.ts`

```typescript
export const TASK_MODEL_PREFERENCES: Record<TaskType, string[]> = {
  coding: [
    'claude-5-opus', // If it's the new coding leader
    'claude-opus-4.5',
    // ...
  ],
  // ...
};
```

### Step 6: Add Pricing (Backend)

**File:** `apps/desktop/src-tauri/src/core/llm/cost_calculator.rs`

```rust
impl CostCalculator {
    pub fn new() -> Self {
        let mut pricing = HashMap::new();

        // Add new model pricing:
        pricing.insert(
            (Provider::Anthropic, "claude-5-opus"),
            Pricing {
                input_per_million: 10.0,
                output_per_million: 50.0,
            },
        );

        // ... existing
    }
}
```

### Step 7: Add Provider Implementation (If New Provider)

**File:** `apps/desktop/src-tauri/src/core/llm/providers/new_provider.rs`

```rust
pub struct NewProviderProvider {
    api_key: String,
    base_url: String,
}

#[async_trait::async_trait]
impl LLMProvider for NewProviderProvider {
    async fn send_message(&self, request: &LLMRequest)
        -> Result<LLMResponse, Box<dyn Error + Send + Sync>>
    {
        // Convert request to provider's API format
        // Make HTTP request
        // Parse response
        // Return LLMResponse
    }

    fn is_configured(&self) -> bool {
        !self.api_key.is_empty()
    }

    fn name(&self) -> &str { "new_provider" }
    fn supports_vision(&self) -> bool { true }
    fn supports_function_calling(&self) -> bool { true }
}
```

Register in `apps/desktop/src-tauri/src/core/llm/providers/mod.rs`:

```rust
pub mod new_provider;
pub use new_provider::NewProviderProvider;
```

### Step 8: Add Provider Enum (If New Provider)

**File:** `apps/desktop/src-tauri/src/core/llm/mod.rs`

```rust
#[derive(Debug, Clone, Copy, Serialize, Deserialize, PartialEq, Eq, Hash)]
pub enum Provider {
    // ... existing
    NewProvider,
}

impl Provider {
    pub fn as_string(&self) -> &'static str {
        match self {
            // ... existing
            Provider::NewProvider => "new_provider",
        }
    }

    pub fn from_string(value: &str) -> Option<Self> {
        match value.to_lowercase().as_str() {
            // ... existing
            "new_provider" | "newprovider" => Some(Provider::NewProvider),
            _ => None,
        }
    }

    pub fn default_model(&self) -> &'static str {
        match self {
            // ... existing
            Provider::NewProvider => "new-model-default",
        }
    }
}
```

### Step 9: Add to UI Presets (Optional)

**File:** `apps/desktop/src/constants/llm.ts`

```typescript
export const MODEL_PRESETS: Record<Provider, Array<{ value: string; label: string }>> = {
  // ... existing
  new_provider: [
    { value: 'new-model-1', label: 'New Model 1' },
    { value: 'new-model-2', label: 'New Model 2' },
  ],
};
```

### Step 10: Add to Web LLM Proxy (If Needed)

**File:** `apps/web/lib/llm-providers/factory.ts`

```typescript
// Add model ID mapping
const MODEL_ID_TO_API_ID: Record<string, string> = {
  'claude-5-opus': 'claude-5-opus-20260601',
  // ... existing
};

// Add provider detection
function getProviderFromModel(model: string): string {
  // ... existing
  if (modelLower.includes('new-provider')) return 'new_provider';
}

// Add provider instantiation
function createProvider(provider: string, apiKey: string): LLMProvider {
  switch (provider) {
    // ... existing
    case 'new_provider':
      return new NewProviderProvider(apiKey);
  }
}
```

---

## 6. Key Files Reference

### Frontend (TypeScript)

| File                                       | Purpose                                            |
| ------------------------------------------ | -------------------------------------------------- |
| `apps/desktop/src/lib/modelRouter.ts`      | Main routing logic, model pools, benchmark scoring |
| `apps/desktop/src/lib/intentClassifier.ts` | Intent classification (coding, search, etc.)       |
| `apps/desktop/src/lib/multiModalRouter.ts` | Image/video/audio model routing                    |
| `apps/desktop/src/lib/toolMatcher.ts`      | MCP tool matching for intents                      |
| `apps/desktop/src/constants/llm.ts`        | Model metadata, benchmarks, capabilities, pricing  |

### Backend (Rust)

| File                                                     | Purpose                                 |
| -------------------------------------------------------- | --------------------------------------- |
| `apps/desktop/src-tauri/src/core/llm/mod.rs`             | Provider enum, LLMProvider trait, types |
| `apps/desktop/src-tauri/src/core/llm/llm_router.rs`      | Backend routing, candidate generation   |
| `apps/desktop/src-tauri/src/core/llm/fallback_chain.rs`  | Retry logic, rate limit tracking        |
| `apps/desktop/src-tauri/src/core/llm/cost_calculator.rs` | Token cost calculation                  |
| `apps/desktop/src-tauri/src/core/llm/providers/*.rs`     | Provider implementations                |

### Web App (TypeScript)

| File                                                | Purpose                         |
| --------------------------------------------------- | ------------------------------- |
| `apps/web/lib/llm-providers/factory.ts`             | Provider factory, model mapping |
| `apps/web/app/api/llm/v1/chat/completions/route.ts` | OpenAI-compatible API proxy     |

---

## 7. Architecture Diagrams

### 7.1 Complete Routing Flow

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                              USER REQUEST                                    │
│                                                                              │
│  "Write a Python function to sort a list"    [auto-balanced] [no images]    │
└─────────────────────────────────────────────────────────────────────────────┘
                                      │
                                      ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│                         FRONTEND ROUTER (TypeScript)                         │
│                                                                              │
│  1. INTENT CLASSIFICATION                                                    │
│     ├─ Local keywords: "function", "Python" → coding (score: 4)             │
│     └─ Confidence ≥ 0.7 → Skip LLM classification                           │
│                                                                              │
│  2. CAPABILITY CHECK                                                         │
│     └─ coding → tools: true required (soft)                                 │
│                                                                              │
│  3. MODEL POOL SELECTION                                                     │
│     └─ auto-balanced → MODEL_POOLS['auto-balanced']                         │
│        ['gpt-5.2', 'claude-sonnet-4.5', 'gemini-3-flash', ...]             │
│                                                                              │
│  4. BENCHMARK SCORING (coding task)                                          │
│     ├─ gpt-5.2:          80.0% SWE + 98.5% HumanEval → 85.55                │
│     ├─ claude-sonnet-4.5: 77.2% SWE + 95.8% HumanEval → 82.78               │
│     ├─ gemini-3-flash:   76.2% SWE + 91.0% HumanEval → 80.74                │
│     └─ ...                                                                   │
│                                                                              │
│  5. SELECTION                                                                │
│     └─ Highest benchmark: gpt-5.2 (85.55)                                   │
│                                                                              │
│  RESULT: { model: 'gpt-5.2', reason: 'coding task → GPT-5.2 (public #1)' }  │
└─────────────────────────────────────────────────────────────────────────────┘
                                      │
                                      ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│                          BACKEND ROUTER (Rust)                               │
│                                                                              │
│  1. RECEIVE CONTEXT                                                          │
│     └─ { selected_model: 'gpt-5.2', intent_type: 'coding', ... }            │
│                                                                              │
│  2. GENERATE CANDIDATES                                                      │
│     ├─ #1: ManagedCloud 'gpt-5.2' (from frontend)                           │
│     ├─ #2: OpenAI 'gpt-5.2' (direct fallback)                               │
│     ├─ #3: ManagedCloud 'claude-sonnet-4.5'                                 │
│     └─ #4: Anthropic 'claude-sonnet-4.5'                                    │
│                                                                              │
│  3. EXECUTE WITH RETRY                                                       │
│     ├─ Try #1: ManagedCloud gpt-5.2 → SUCCESS                               │
│     └─ Return response                                                       │
│                                                                              │
│  (If #1 failed due to rate limit:)                                          │
│     ├─ Record rate limit, 60s cooldown                                      │
│     ├─ Try #2: OpenAI gpt-5.2 → (retry if needed)                           │
│     └─ ... continue down candidates                                          │
└─────────────────────────────────────────────────────────────────────────────┘
                                      │
                                      ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│                            LLM PROVIDER API                                  │
│                                                                              │
│  POST https://api.openai.com/v1/chat/completions                            │
│  {                                                                           │
│    "model": "gpt-5.2-2026-01",                                              │
│    "messages": [{"role": "user", "content": "Write a Python..."}],          │
│    "tools": [...],                                                           │
│    "stream": true                                                            │
│  }                                                                           │
└─────────────────────────────────────────────────────────────────────────────┘
```

### 7.2 Model Capability Matrix

```
                        │ vision │ tools │ thinking │ computerUse │ agentic │ search │
──────────────────────────────────────────────────────────────────────────────────────
claude-opus-4.5         │   ✓    │   ✓   │    ✓     │      ✓      │    ✓    │   ✗    │
claude-sonnet-4.5       │   ✓    │   ✓   │    ✓     │      ✓      │    ✓    │   ✗    │
claude-haiku-4.5        │   ✓    │   ✓   │    ✗     │      ✗      │    ✓    │   ✗    │
gpt-5.2                 │   ✓    │   ✓   │    ✓     │      ✓      │    ✓    │   ✓    │
gpt-5-nano              │   ✓    │   ✓   │    ✗     │      ✗      │    ✗    │   ✗    │
gemini-3-ultra          │   ✓    │   ✓   │    ✓     │      ✗      │    ✓    │   ✓    │
gemini-3-flash          │   ✓    │   ✓   │    ✗     │      ✗      │    ✓    │   ✓    │
deepseek-v3.2           │   ✗    │   ✓   │    ✓     │      ✗      │    ✓    │   ✗    │
grok-4.1                │   ✗    │   ✓   │    ✓     │      ✗      │    ✓    │   ✓    │
glm-4.7                 │   ✗    │   ✓   │    ✓     │      ✗      │    ✓    │   ✗    │
glm-4.6v                │   ✓    │   ✓   │    ✓     │      ✗      │    ✓    │   ✗    │
glm-4.6v-flash (FREE!)  │   ✓    │   ✓   │    ✗     │      ✗      │    ✗    │   ✗    │
kimi-k2.5-thinking      │   ✓    │   ✓   │    ✓     │      ✗      │    ✓    │   ✗    │
```

### 7.3 Cost vs Quality Quadrant

```
                              HIGH QUALITY
                                   │
         claude-opus-4.5 (80.9%)   │   gpt-5-pro (75.4%)
              $30/1M               │      $35/1M
                  ●                │         ●
                                   │
                 claude-sonnet-4.5 │  gemini-3-ultra (76.2%)
                      (77.2%)      │      $17.50/1M
                     $18/1M        │         ●
                        ●          │
 LOW COST ─────────────────────────┼─────────────────────── HIGH COST
                                   │
      deepseek-v3.2 (68.8%)        │
           $1.52/1M                │
              ●                    │
                                   │
      glm-4.6v-flash (45%)         │
           FREE!                   │
              ●                    │
                                   │
                              LOW QUALITY

Best Value Leaders (January 2026):
• FREE: glm-4.6v-flash (vision + tools!)
• Budget: deepseek-v3.2 ($0.70/1M)
• Balanced: gemini-3-flash ($3.50/1M)
• Premium: claude-opus-4.5 ($30/1M)
```

---

## Summary

The model routing system in AGI Workforce is designed for:

1. **Quality First** - Benchmark scores determine selection, not cost
2. **Capability Matching** - Hard requirements (vision, tools) are enforced
3. **Tier Respect** - Users get models appropriate to their subscription
4. **Resilience** - Multi-candidate fallback with rate limit awareness
5. **Extensibility** - Adding new models requires ~10 changes across 5-7 files

When benchmarks change or new models are released, update:

1. `MODEL_METADATA` with accurate benchmarks
2. `MODEL_POOLS` ordered by benchmark
3. `TASK_MODEL_PREFERENCES` if there's a new leader
4. `cost_calculator.rs` with pricing

The system will automatically start routing to better models as soon as their metadata is updated.
