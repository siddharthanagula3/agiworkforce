# Provider Full-Capability Fix: Anthropic / OpenAI / Google

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Fix all broken integrations in the desktop app for Claude 4.5/4.6, GPT-5 nano/5.2/5.2-pro, and Gemini 3 Flash/Pro — covering chat, extended thinking, tool calling, agentic loop, image gen, and video gen.

**Architecture:** Three parallel workstreams: (A) TypeScript model catalog correctness, (B) TypeScript router logic fixes, (C) Rust backend specs. Agent A and B modify TypeScript only. Agent C writes to docs/rust-fixes-needed.md only (no Rust files modified directly per CLAUDE.md rule).

**Tech Stack:** TypeScript (Vite + React 19 + Zustand v5), Tauri v2, `src/constants/llm.ts`, `src/lib/modelRouter.ts`, `src/lib/multiModalRouter.ts`, `docs/rust-fixes-needed.md`

**Constraint:** NEVER modify Rust files directly. All Rust changes must be written as specs to `docs/rust-fixes-needed.md`.

---

## Context: What's Broken and Why

### Providers Targeted
| Provider | Models | Priority |
|---|---|---|
| Anthropic | claude-sonnet-4-6, claude-opus-4-6, claude-sonnet-4-5, claude-haiku-4-5 | P0 |
| OpenAI | gpt-5-nano, gpt-5.2, gpt-5.2-pro | P0 |
| Google | gemini-3-pro-preview, gemini-3-flash-preview | P0 |

### Known Broken Items
1. **Model IDs**: Some model IDs in `llm.ts` may not match exact provider API strings
2. **Thinking flags**: `THINKING_MODEL_VARIANTS` is empty; `thinkingModeEnabled` in store exists but thinking params never sent to Rust backend
3. **Agent mode bypass**: `detect_agentic_intent()` in Rust overrides explicit model selection — sends users into slow agent orchestrator
4. **Image gen provider IDs**: `google_imagen` → should be `google`, `dalle` → should be `openai` (causes 400 errors)
5. **Streaming timeout**: 30s kills long thinking responses (needs 90s+)
6. **OpenAI reasoning_effort**: GPT-5.2 never receives `reasoning_effort` parameter — behaves like basic chat
7. **Gemini thinking_config**: Gemini 3 Pro never receives `thinking_config` — deep think disabled
8. **Claude thinking**: `thinking: {type: "adaptive"}` never injected for Claude 4.5/4.6

---

## Agent Team Structure

| Agent | Zone | Files Owned | Work |
|---|---|---|---|
| **catalog-agent** | A | `src/constants/llm.ts` | Fix model IDs, capability flags, MODEL_PRESETS, tier access |
| **router-agent** | A | `src/lib/modelRouter.ts`, `src/lib/multiModalRouter.ts` | Fix routing pools, image/video routing, thinking model routing |
| **rust-spec-agent** | F | `docs/rust-fixes-needed.md` | Write all 5 Rust backend fix specs |

Agents A and B work in parallel. Agent C is independent. All 3 can run simultaneously.

---

## Task 1 (catalog-agent): Fix Anthropic Model Catalog

**Files:**
- Modify: `apps/desktop/src/constants/llm.ts` — Anthropic section of MODEL_METADATA

**What to fix:**

Verify and correct each of these 4 Claude models in MODEL_METADATA:

```typescript
// VERIFY these apiModelId values match Anthropic's actual API (Feb 2026):
// claude-opus-4.6   → apiModelId: 'claude-opus-4-6'      ✓ (confirmed)
// claude-sonnet-4.6 → apiModelId: 'claude-sonnet-4-6'    ✓ (confirmed)
// claude-sonnet-4.5 → apiModelId: 'claude-sonnet-4-5-20250929'
// claude-haiku-4.5  → apiModelId: 'claude-haiku-4-5-20251001'
```

Fix capability flags:
```typescript
// claude-opus-4.6 capabilities:
capabilities: {
  streaming: true,
  tools: true,          // function calling ✓
  vision: true,         // image input ✓
  json: true,
  thinking: true,       // extended thinking + adaptive ✓
  computerUse: true,    // BEST computer use ✓
  agentic: true,
  imageGen: false,
  videoGen: false,
  search: false,
  research: true,
  codeExecution: false, // uses MCP tools instead
}

// claude-sonnet-4.6 capabilities:
capabilities: {
  streaming: true,
  tools: true,
  vision: true,
  json: true,
  thinking: true,       // adaptive thinking ✓
  computerUse: true,    // ✓
  agentic: true,
  imageGen: false,
  videoGen: false,
  search: false,
  research: true,
  codeExecution: false,
}

// claude-sonnet-4.5 capabilities: same as 4.6 minus computerUse if not confirmed
// claude-haiku-4.5: thinking: false, computerUse: false (economy model)
```

**Step 1:** Read the current Anthropic section in llm.ts (search for `claude-opus-4.6`)
**Step 2:** Compare each model's current capability flags against the spec above
**Step 3:** Fix any flags that are wrong
**Step 4:** Verify MODEL_PRESETS has all 4 Anthropic models with correct labels
**Step 5:** Commit: `fix(desktop): correct anthropic model capability flags in llm.ts`

---

## Task 2 (catalog-agent): Fix OpenAI Model Catalog

**Files:**
- Modify: `apps/desktop/src/constants/llm.ts` — OpenAI section of MODEL_METADATA

**What to fix:**

OpenAI GPT-5 family API model IDs (verify against OpenAI API Feb 2026):
```typescript
// gpt-5-nano    → apiModelId: 'gpt-5-nano'    (128K context, vision, tools, NO thinking)
// gpt-5.2       → apiModelId: 'gpt-5.2'       (400K context, vision, tools, thinking via reasoning_effort)
// gpt-5.2-pro   → apiModelId: 'gpt-5.2-pro'   (512K context, reasoning_effort: xhigh available)
```

Capability flags for GPT-5 family:
```typescript
// gpt-5-nano:
capabilities: {
  streaming: true,
  tools: true,          // function calling ✓
  vision: true,         // ✓
  json: true,
  thinking: false,      // no reasoning mode ✗
  computerUse: false,
  agentic: false,       // economy, not optimized for agentic
  imageGen: false,
  videoGen: false,
  search: false,
  research: false,
  codeExecution: true,  // code interpreter sandbox ✓
}

// gpt-5.2:
capabilities: {
  streaming: true,
  tools: true,
  vision: true,
  json: true,
  thinking: true,       // reasoning_effort parameter ✓
  computerUse: false,
  agentic: true,        // excellent for agentic ✓
  imageGen: false,
  videoGen: false,
  search: false,
  research: true,
  codeExecution: true,
}

// gpt-5.2-pro: same as gpt-5.2 but qualityTier: 'best', outputCost: ~30
```

**Step 1:** Read current OpenAI entries in MODEL_METADATA
**Step 2:** Fix apiModelId strings (must match exactly what OpenAI API accepts)
**Step 3:** Fix capability flags per spec above
**Step 4:** Ensure gpt-5-nano is in ECONOMY tier, gpt-5.2 in BALANCED, gpt-5.2-pro in PREMIUM
**Step 5:** Commit: `fix(desktop): correct openai gpt-5 model IDs and capability flags`

---

## Task 3 (catalog-agent): Fix Google Model Catalog

**Files:**
- Modify: `apps/desktop/src/constants/llm.ts` — Google section of MODEL_METADATA

**What to fix:**

Google Gemini 3 API model IDs (verify against Google AI API Feb 2026):
```typescript
// gemini-3-pro-preview   → apiModelId: 'gemini-3-pro-preview'
// gemini-3-flash-preview → apiModelId: 'gemini-3-flash-preview'
```

Capability flags:
```typescript
// gemini-3-pro-preview:
capabilities: {
  streaming: true,
  tools: true,          // function calling ✓
  vision: true,         // images, video, audio, PDF ✓
  json: true,
  thinking: true,       // Deep Think mode (thinking_config) ✓
  computerUse: false,
  agentic: true,        // great for agentic ✓
  imageGen: false,
  videoGen: false,
  search: true,         // built-in search grounding ✓
  research: true,       // 2M context + search ✓
  codeExecution: true,  // code execution sandbox ✓
}

// gemini-3-flash-preview:
capabilities: {
  streaming: true,
  tools: true,
  vision: true,
  json: true,
  thinking: false,      // flash uses thinking_level not Deep Think
  computerUse: false,
  agentic: true,
  imageGen: false,
  videoGen: false,
  search: true,         // built-in ✓
  research: false,
  codeExecution: true,
}
```

Context windows:
- gemini-3-pro: 2,000,000 tokens (2M!) — set correctly
- gemini-3-flash: 1,000,000 tokens (1M)

**Step 1:** Read current Google entries in MODEL_METADATA
**Step 2:** Fix contextWindow for both models (2M and 1M)
**Step 3:** Fix capability flags, especially search: true for both
**Step 4:** Fix search: true in model (Google has native search grounding)
**Step 5:** Commit: `fix(desktop): correct google gemini-3 model capabilities and context window`

---

## Task 4 (router-agent): Fix Model Routing Pools

**Files:**
- Modify: `apps/desktop/src/lib/modelRouter.ts` — MODEL_POOLS section

**What to fix:**

Ensure all 3 providers' models are in the correct routing tier:

```typescript
// auto-economy pool: Add gpt-5-nano and gemini-3-flash
// (these should already be there — verify and add if missing)
const ECONOMY_MODELS = [
  'gpt-5-nano',              // OpenAI cheapest ($0.05/$0.40)
  'gemini-3-flash-preview',  // Google cheapest ($0.50/$3.00)
  'claude-haiku-4.5',        // Anthropic cheapest ($1.00/$5.00)
  // ... other economy models
];

// auto-balanced pool: Add gpt-5.2 and gemini-3-pro
const BALANCED_MODELS = [
  'claude-sonnet-4.6',       // Anthropic balanced
  'claude-sonnet-4.5',       // Anthropic balanced (older)
  'gpt-5.2',                 // OpenAI balanced ($1.75/$14.00)
  'gemini-3-pro-preview',    // Google balanced ($2.00/$12.00)
  // ... other balanced models
];

// auto-premium pool: Add gpt-5.2-pro and claude-opus-4.6
const PREMIUM_MODELS = [
  'claude-opus-4.6',         // Anthropic flagship
  'gpt-5.2-pro',             // OpenAI flagship ($5.00/$30.00)
  // ... other premium models
];
```

**Step 1:** Read modelRouter.ts MODEL_POOLS (or equivalent structure)
**Step 2:** Check each pool for the 8 target models (4 Anthropic + 3 OpenAI + 2 Google)
**Step 3:** Add any missing models to correct pool
**Step 4:** Verify thinking-capable models (claude-sonnet-4.6, gpt-5.2, gemini-3-pro) are in balanced/premium
**Step 5:** Commit: `fix(desktop): add gpt-5 and gemini-3 models to correct routing pools`

---

## Task 5 (router-agent): Fix Thinking Mode Routing

**Files:**
- Modify: `apps/desktop/src/lib/modelRouter.ts`
- Modify: `apps/desktop/src/stores/modelStore.ts`

**What to fix:**

Currently `thinkingModeEnabled` exists in modelStore but is never passed to the Rust invoke call. The TypeScript side needs to:
1. Read `thinkingModeEnabled` from modelStore
2. Pass it as a parameter in the chat request to Tauri
3. The router must include it in the invoke payload

Find the chat send function (likely in a chat store or component that calls `invoke('chat_send_message', ...)`) and add:

```typescript
// In the invoke call for chat_send_message, add:
const thinkingEnabled = useModelStore.getState().thinkingModeEnabled;
const selectedModel = useModelStore.getState().selectedModel;

await invoke('chat_send_message', {
  // ... existing params ...
  enableThinking: thinkingEnabled,
  modelOverride: selectedModel,    // explicit model = bypass agent routing
  isExplicitModelSelection: !selectedModel?.startsWith('auto'),
});
```

**Step 1:** Grep for `invoke('chat_send_message'` or `invoke("chat_send_message"` to find the call site
**Step 2:** Read the full invoke call and its TypeScript type
**Step 3:** Add `enableThinking` and `isExplicitModelSelection` to the payload if not present
**Step 4:** Commit: `fix(desktop): pass thinking mode and explicit model flag to rust backend`

---

## Task 6 (router-agent): Fix Image + Video Generation Routing

**Files:**
- Modify: `apps/desktop/src/lib/multiModalRouter.ts`

**What to fix:**

The multiModalRouter selects image/video models but uses wrong provider IDs that cause 400 errors in the Rust backend:

Current (broken):
```typescript
provider: 'google_imagen'  // ❌ wrong
provider: 'dalle'          // ❌ wrong
```

Correct:
```typescript
provider: 'google'    // ✓ for Imagen 4
provider: 'openai'   // ✓ for DALL-E 3 / gpt-image-1.5
```

Also verify:
- `imagen-4.0-generate-001` for Google image gen
- `gpt-image-1.5` for OpenAI image gen
- `veo-3.1-generate-preview` for Google video gen

**Step 1:** Read multiModalRouter.ts fully (find IMAGE_MODELS and VIDEO_MODELS entries)
**Step 2:** Find every entry where provider is `'google_imagen'` or `'dalle'`
**Step 3:** Replace `'google_imagen'` → `'google'` and `'dalle'` → `'openai'` everywhere
**Step 4:** Verify model IDs for Imagen 4 and gpt-image-1.5 are correct
**Step 5:** Commit: `fix(desktop): correct image/video generation provider IDs in multiModalRouter`

---

## Task 7 (rust-spec-agent): Write Rust Spec — Thinking Parameter Injection

**Files:**
- Modify: `docs/rust-fixes-needed.md` — append new section

**What to write:**

Add a new spec section titled "## Provider Thinking Parameter Injection" with the following content:

```markdown
## Provider Thinking Parameter Injection

### Why
Three providers require specific API parameters to activate extended reasoning.
Without these parameters, models with thinking capability behave as basic chat.
The TypeScript side now passes `enable_thinking: bool` from the frontend.

### File
`apps/desktop/src-tauri/src/core/llm/provider_adapter.rs`

### Change: Anthropic (Claude 4.5, 4.6)
In the Anthropic request builder, when `enable_thinking == true` AND model supports thinking:

```rust
// Add to request body for claude-sonnet-4-6, claude-opus-4-6, claude-sonnet-4-5:
"thinking": {
    "type": "adaptive"
}
// Budget: let the model decide (adaptive mode)
// For claude-opus-4.6 only, can also use:
// "thinking": { "type": "enabled", "budget_tokens": 16000 }
```

Models that support thinking: claude-opus-4-6, claude-sonnet-4-6, claude-sonnet-4-5
Models that do NOT: claude-haiku-4-5 (skip silently)

### Change: OpenAI (GPT-5.2, GPT-5.2-pro)
In the OpenAI request builder, when `enable_thinking == true` AND model is gpt-5.2 or gpt-5.2-pro:

```rust
// Add to request body:
"reasoning_effort": "high"
// For gpt-5.2-pro when user explicitly asks for best:
// "reasoning_effort": "xhigh"
```

Models that support reasoning_effort: gpt-5.2, gpt-5.2-pro
Models that do NOT: gpt-5-nano (skip silently)

### Change: Google (Gemini 3 Pro)
In the Google request builder, when model is gemini-3-pro-preview:

```rust
// Add to request body:
"generationConfig": {
    "thinking_config": {
        "thinking_budget": 8192
    }
}
```

Only for gemini-3-pro-preview. Skip for gemini-3-flash-preview (uses thinking_level not thinking_config).

### Validation
1. Select claude-sonnet-4-6, enable thinking, send "solve this step by step: 47 * 83"
   Expected: Response includes <antml_thinking> block showing reasoning steps
2. Select gpt-5.2, enable thinking, same prompt
   Expected: Response has reasoning chain visible
3. Select gemini-3-pro-preview, enable thinking, same prompt
   Expected: Extended response with reasoning
```

**Step 1:** Open `docs/rust-fixes-needed.md`
**Step 2:** Append the full thinking parameter injection spec above
**Step 3:** Commit: `docs: add rust spec for provider thinking parameter injection`

---

## Task 8 (rust-spec-agent): Write Rust Spec — Agent Mode Bypass Fix

**Files:**
- Modify: `docs/rust-fixes-needed.md` — append new section

**What to write:**

Add a spec section titled "## Agent Mode Bypass for Explicit Model Selection":

```markdown
## Agent Mode Bypass for Explicit Model Selection

### Why
When a user explicitly selects claude-sonnet-4-6 or gpt-5.2, the Rust backend
still runs detect_agentic_intent() and may route to the agent orchestrator.
This causes delayed responses, "Executing agent plan..." for normal chat, and
mismatch between selected model UX and actual execution.

### File
`apps/desktop/src-tauri/src/sys/commands/chat/mod.rs` (lines ~218 and ~2753)

### Change

Add helper function:
```rust
fn is_explicit_model_selection(model_override: Option<&str>) -> bool {
    matches!(
        model_override.map(str::trim),
        Some(model) if !model.is_empty()
            && model != "auto"
            && !model.starts_with("auto-")
    )
}
```

Change agent mode detection:
```rust
// Before:
let agent_mode = detect_agent_mode(request.enable_agent_mode, &request.content, &app_handle);

// After:
let explicit_model = is_explicit_model_selection(request.model_override.as_deref());
let agent_mode = if explicit_model {
    // Explicit model: only use agent mode if user explicitly enabled it
    request.enable_agent_mode == Some(true)
} else {
    // Auto mode: use intent detection as before
    detect_agent_mode(request.enable_agent_mode, &request.content, &app_handle)
};
```

Also check: the frontend now sends `is_explicit_model_selection: bool` in the request.
Use that flag as an additional signal if present.

### Validation
1. Select gpt-5.2 explicitly, send "find the issue in this repo"
   Expected: Normal chat response, no agent plan execution
2. Select auto-balanced, send same prompt
   Expected: Agent mode triggered (existing behavior preserved)
3. Select claude-sonnet-4-6 + enable agent mode toggle, send any prompt
   Expected: Agent mode runs (user explicitly enabled it)
```

**Step 1:** Append this spec to `docs/rust-fixes-needed.md`
**Step 2:** Commit: `docs: add rust spec for agent mode bypass on explicit model selection`

---

## Task 9 (rust-spec-agent): Write Rust Spec — Streaming Timeout + Provider ID Fix

**Files:**
- Modify: `docs/rust-fixes-needed.md` — append two new sections

**What to write — Section A: Streaming Timeout:**

```markdown
## Streaming Timeout: 30s → 90s for Thinking Models

### Why
Extended thinking responses (Claude 4.5/4.6, GPT-5.2, Gemini 3 Pro) can take
60-120 seconds to generate. The current 30s streaming timeout kills these before
they complete.

### File
`apps/desktop/src-tauri/src/core/llm/llm_router.rs`

### Change
Find the streaming HTTP client timeout configuration:
```rust
// Current (broken for thinking models):
.timeout(Duration::from_secs(30))

// Change to:
// Use 90s for models with thinking enabled, 30s otherwise
let timeout = if request.enable_thinking.unwrap_or(false) {
    Duration::from_secs(90)
} else {
    Duration::from_secs(30)
};
streaming_client.timeout(timeout)
```

### Validation
Select claude-sonnet-4-6 + enable thinking, send a hard math problem.
Expected: Response completes within 90s without timeout error.
```

**What to write — Section B: Image/Video Provider ID Fix:**

```markdown
## Image/Video Generation: Fix Provider ID Mapping

### Why
`media.rs` uses wrong provider IDs causing 400 errors on all image/video generation.

### File
`apps/desktop/src-tauri/src/core/llm/media.rs`

### Change
Find all occurrences of provider ID strings and replace:
```rust
// WRONG (causes 400):
"google_imagen" → "google"
"dalle"         → "openai"

// Video providers (verify these are correct):
"google_veo"    → "google"  (if this pattern exists)
```

Also verify model ID strings match exactly:
- Imagen 4: `"imagen-4.0-generate-001"`
- DALL-E 3: `"dall-e-3"`
- gpt-image-1.5: `"gpt-image-1.5"`
- Veo 3.1: `"veo-3.1-generate-preview"`

### Validation
1. Ask "generate an image of a sunset" → expect image displayed (not 400 error)
2. Ask "generate a video of ocean waves" → expect video URL (not 400 error)
```

**Step 1:** Append both sections to `docs/rust-fixes-needed.md`
**Step 2:** Commit: `docs: add rust specs for streaming timeout and image/video provider IDs`

---

## Summary of All Changes

### TypeScript changes (direct, mergeable immediately):
| File | What changes |
|---|---|
| `src/constants/llm.ts` | Correct model IDs, capability flags for 9 models across 3 providers |
| `src/lib/modelRouter.ts` | Correct routing pool assignments, thinking model handling |
| `src/lib/multiModalRouter.ts` | Fix provider IDs: google_imagen→google, dalle→openai |
| `src/stores/modelStore.ts` (if needed) | Pass thinkingModeEnabled + isExplicitModel to invoke |

### Rust specs (written to docs, applied manually):
| Spec | File to change | Impact |
|---|---|---|
| Thinking parameter injection | `core/llm/provider_adapter.rs` | Unlocks extended reasoning for all 3 providers |
| Agent mode bypass | `sys/commands/chat/mod.rs` | Fixes explicit model being overridden by agent orchestrator |
| Streaming timeout | `core/llm/llm_router.rs` | Prevents thinking responses from timing out |
| Image/video provider IDs | `core/llm/media.rs` | Fixes all image and video generation |

### Expected outcome after all fixes:
- Claude 4.5/4.6: Chat, tools, extended thinking, computer use all work
- GPT-5 nano: Fast chat + tools (no thinking — correct)
- GPT-5.2/pro: Chat, tools, reasoning_effort thinking all work
- Gemini 3 Flash: Fast chat, tools, search grounding, code execution
- Gemini 3 Pro: Chat, tools, Deep Think, search grounding, 2M context
- Image gen: Google Imagen 4 + OpenAI gpt-image-1.5 both work
- Video gen: Google Veo 3.1 works
- Agentic loop: Explicit model selection bypasses agent orchestrator

---

## Commit Order

1. catalog-agent: Anthropic fixes → `fix(desktop): correct anthropic claude 4.x model capability flags`
2. catalog-agent: OpenAI fixes → `fix(desktop): correct openai gpt-5 model IDs and capability flags`
3. catalog-agent: Google fixes → `fix(desktop): correct google gemini-3 context windows and capabilities`
4. router-agent: Pool fixes → `fix(desktop): add gpt-5 and gemini-3 to correct routing pools`
5. router-agent: Thinking routing → `fix(desktop): pass thinking mode to rust backend invoke`
6. router-agent: Image/video provider IDs → `fix(desktop): correct image video generation provider IDs`
7. rust-spec-agent: Thinking params → `docs: rust spec for provider thinking parameter injection`
8. rust-spec-agent: Agent bypass → `docs: rust spec for agent mode bypass on explicit model selection`
9. rust-spec-agent: Timeout + image fix → `docs: rust specs for streaming timeout and image provider IDs`
