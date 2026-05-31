# AGI Workforce LLM Caching & Cost Architecture Report

## Executive Summary

AGI Workforce operates a multi-provider LLM platform with partial prompt/token caching support. Only 9 of ~80 catalog models have accurate cache-read pricing; most providers' cache tokens go untracked or miscalculated. OpenRouter demonstrates a unified caching pattern (provider-aware routing + sticky sessions + per-provider cache pricing) that AGI should selectively adopt. Critical audit findings: (1) cost-tracker.ts omits cacheReadInputTokens from OTel total_tokens, (2) DeepSeek adapter lacks cache token extraction despite 99% cache-read discount, (3) OpenAI cache_creation is miscalculated at 1.25x when it should be 1.0x, (4) Vercel AI SDK v2 is opaque to caching entirely.

---

## 1. OpenRouter in a Nutshell

### Unified API & Model Namespacing

OpenRouter provides a single OpenAI-compatible REST endpoint (`https://openrouter.ai/api/v1`) that routes requests across 200+ models via provider-aware model IDs (format: `provider/model-name`, e.g., `anthropic/claude-opus-4.8`). Key innovations:

- **Provider object** in request enables explicit ordering (fallback chains), sort strategy (price/throughput/latency), filtering (require_parameters, data_collection, zdr), and model variants as routing shortcuts.
- **Model fallbacks** array allows transparent provider switching on error/rate-limit/moderation without code changes; pricing charged only for the model that executes.
- **Sticky routing** (session_id or x-session-id header, up to 256 chars) keeps multi-turn conversations routed to the same provider endpoint, maximizing cache hits.
- **Auto-router** (openrouter/auto via NotDiamond) selects models dynamically based on cost_quality_tradeoff parameter (0=quality, 10=cost, default 7=balanced). No additional fee.

**Reference**: https://openrouter.ai/docs/guides/routing/provider-selection, https://openrouter.ai/docs/guides/routing/model-fallbacks, https://openrouter.ai/docs/guides/routing/routers/auto-router

### Why It Matters for AGI Workforce

Your modelRouter.ts (apps/web/lib/modelRouter.ts:19–31) uses **task-based auto-routing** (auto, auto-economy, auto-balanced, auto-premium) with client-side scoring, but lacks:

1. **Provider ordering** — no explicit fallback chain forwarding to upstream
2. **Sticky routing logic** — sessionId is tracked in cost-tracker.ts but not used to enforce same-provider routing after cache establishment
3. **Model variants** — no support for `:nitro` (throughput sort) or `:floor` (price sort) syntax
4. **Cost_quality_tradeoff** parameter — your scoring is deterministic; OpenRouter's is adaptive

### What to Copy from OpenRouter

| Aspect              | OpenRouter Pattern                         | Your Current State                         | Adoption Effort |
| ------------------- | ------------------------------------------ | ------------------------------------------ | --------------- |
| Fallback chains     | `provider.order` array in request          | Hard-coded per task                        | Medium          |
| Sticky routing      | x-session-id header + provider affinity    | sessionId tracked but not used for routing | Low             |
| Model variants      | `:nitro`, `:floor`, `:max-pro` syntax      | Not supported                              | Low             |
| Cost-quality slider | cost_quality_tradeoff (0–10)               | Fixed tier mapping                         | Low             |
| Provider filtering  | require_parameters, data_collection fields | Not implemented                            | Medium          |

---

## 2. OpenRouter BYOK & Caching

### OpenRouter BYOK Billing & Passthrough

**Cost Model**: OpenRouter charges a **5% markup** on top of direct provider billing for BYOK requests. Monthly waiver covers first 1M BYOK requests free; after that, 5% fee charged to OpenRouter credits. User's provider account is billed directly for model inference.

**BYOK Key Organization**: Prioritized (attempted first) and Fallback sections allow users to maintain multiple accounts per provider and fall back transparently.

**Reference**: https://openrouter.ai/docs/guides/overview/auth/byok

### Caching via OpenRouter BYOK

OpenRouter enables prompt caching by routing requests to provider-sticky endpoints. Caching support varies by upstream:

- **Anthropic**: native cache_control with ephemeral type + TTL (5m/1h). Read 0.1x, write 1.25x–2.0x (TTL-dependent). OpenRouter passes through via system message injection.
- **Google Gemini 2.5+**: implicit + explicit caching, 0.1x read cost, storage fees on explicit caches.
- **DeepSeek V4**: disk-based KV cache, 0.003625/M cache-read (98% discount), no write surcharge.
- **OpenAI**: automatic prefix caching (1024-token threshold), up to 90% discount, no configuration.
- **Qwen, Moonshot, Grok, Groq**: provider-specific caching with varying pricing.

**OpenRouter Cache Control**: Pass `X-OpenRouter-Cache: true` header for response-level caching (identical requests return zero tokens billed). Session_id or x-session-id ensures sticky routing.

**Reference**: https://openrouter.ai/docs/guides/best-practices/prompt-caching

### Mapping to AGI Workforce Desktop/CLI + Cloud Alpha

Your multi-path architecture:

| Path                    | Current BYOK State                                                                                              | Caching Coverage                                                                                                                         |
| ----------------------- | --------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------- |
| **Desktop BYOK**        | Direct provider keys (ANTHROPIC_API_KEY, OPENAI_API_KEY, OPENROUTER_API_KEY) via apps/web/lib/byok-providers.ts | OpenRouter adapter (openrouter.ts:74–95) correctly injects Anthropic cache_control on system messages; non-Anthropic routes do NOT cache |
| **CLI BYOK**            | Same desktop providers, custom adapter paths                                                                    | Presumed same as desktop                                                                                                                 |
| **Cloud Alpha Gateway** | Managed keys (anthropic, openai, google) via services/api-gateway/src/routes/llm.ts:39–41                       | No caching pass-through; gateway proxies directly. Cache control decisions delegated to individual adapters                              |

**Gap**: Cloud alpha gateway (llm.ts) does not implement OpenRouter as an aggregation option. If OpenRouter BYOK becomes primary, the gateway should emit provider.order and x-session-id headers to OpenRouter to maximize cache hits.

**Opportunity**: Treat OpenRouter as a unified backend aggregator (similar to how you proxy anthropic/openai/google), wiring session affinity and cache_control at the gateway layer.

---

## 3. Provider Caching Matrix

| Provider                              | Trigger                                     | TTL                                                                 | Write Cost                                                  | Read Cost                                                              | Min Prefix                                   | Usage Reporting                                                                 | Notes                                                                                                                                                     |
| ------------------------------------- | ------------------------------------------- | ------------------------------------------------------------------- | ----------------------------------------------------------- | ---------------------------------------------------------------------- | -------------------------------------------- | ------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Anthropic**                         | Explicit cache_control                      | 5m (default, silent regression Mar 2026) / 1h extended              | 1.25x–2.0x input                                            | 0.1x input (90% discount)                                              | 1024 tokens (Sonnet/Haiku), 4096 (Opus 4.7+) | cache_read_input_tokens, cache_creation_input_tokens in usage                   | https://platform.claude.com/docs/en/build-with-claude/prompt-caching; https://github.com/anthropics/claude-code/issues/46829                              |
| **OpenAI**                            | Automatic (no config)                       | Dynamic (model load-based, no TTL param)                            | 1.0x input (no surcharge)                                   | 0.1x–0.9x input (varies by model)                                      | 1024 tokens                                  | cached_tokens in prompt_tokens_details.cached_tokens                            | https://developers.openai.com/api/docs/guides/prompt-caching                                                                                              |
| **Google Gemini 2.5+**                | Implicit + explicit cache_control           | Implicit: model-dependent; explicit: 60m default, user-configurable | 1.0x input + storage (5min–24h tiers)                       | 0.1x input (90% discount)                                              | 1024 tokens                                  | cachedContentTokenCount in GenerateContentResponseUsageMetadata                 | https://ai.google.dev/gemini-api/docs/caching; https://docs.cloud.google.com/gemini-enterprise-agent-platform/models/context-cache/context-cache-overview |
| **DeepSeek V4**                       | Automatic (no config)                       | Persistent (no TTL)                                                 | 1.0x input (no write surcharge, permanent since 2026-05-22) | V4-Flash: 0.0028/M (98% discount); V4-Pro: 0.003625/M (98.2% discount) | Not documented (presumed <1024)              | usage.cache_compression_ratio + implicit token accounting                       | https://api-docs.deepseek.com/guides/kv_cache; https://tokenmix.ai/blog/deepseek-cache-hit-pricing                                                        |
| **xAI Grok**                          | Automatic (server affinity required)        | Multi-hour implicit                                                 | 1.0x input                                                  | 0.05/M (75% discount)                                                  | Not documented                               | Implicit (no separate usage field)                                              | Requires x-grok-conv-id header for sticky routing; regression bug fixed May 2026. https://docs.x.ai/developers/advanced-api-usage/prompt-caching          |
| **Groq**                              | Automatic (no config)                       | Few hours implicit                                                  | Not specified                                               | 0.5x input (50% discount)                                              | Not documented                               | Implicit, cached tokens don't count toward rate limits                          | https://console.groq.com/docs/prompt-caching                                                                                                              |
| **OpenRouter (unified)**              | Provider-native + X-OpenRouter-Cache header | Provider-dependent (5m–1h for Anthropic, dynamic for others)        | Provider-dependent (passed through)                         | Provider-dependent (passed through)                                    | Provider-dependent                           | upstream provider's native fields (cache_read_input_tokens for Anthropic, etc.) | https://openrouter.ai/docs/guides/best-practices/prompt-caching; https://openrouter.ai/announcements/response-caching                                     |
| **Mistral AI**                        | Not supported (as of May 2026)              | N/A                                                                 | N/A                                                         | N/A                                                                    | N/A                                          | No caching feature                                                              | https://docs.mistral.ai/api                                                                                                                               |
| **Alibaba Qwen 3.6+**                 | Implicit (20%) + explicit (10%)             | N/A for implicit; user-configurable for explicit                    | 1.0x input (surcharge only for explicit)                    | 0.05–0.25/M (90% discount)                                             | Not documented                               | usage.cache_creation_input_tokens implicit                                      | https://www.alibabacloud.com/help/en/model-studio/context-cache                                                                                           |
| **Moonshot Kimi K2.6+**               | Automatic (implicit)                        | Model-dependent                                                     | 1.0x input                                                  | Variable per model                                                     | Not documented                               | usage.cache_tokens or similar                                                   | Presumed; vendor docs limited                                                                                                                             |
| **Amazon Bedrock** (Anthropic models) | Explicit cache_control                      | 5m–1h (TTL GA for Sonnet 4.5, Haiku 4.5, Opus 4.5 as of Jan 2026)   | 1.25x–2.0x input                                            | 0.1x input                                                             | Provider-dependent                           | Anthropic usage fields passed through                                           | https://docs.aws.amazon.com/bedrock/latest/userguide/prompt-caching.html                                                                                  |

**Key Insight**: Most providers support caching; pricing varies wildly. DeepSeek V4-Pro (0.003625/M cache-read) is best-in-class by ~100x vs. OpenAI (~0.05/M inferred) and 2x vs. Anthropic (0.1x = ~0.02–0.03/M). AGI's cost-tracker must track provider-specific rates.

---

## 4. Your Caching Today: Wired vs. Missing

### Cost-Tracker Audit: The OTel Bug

**File**: apps/web/lib/cost-tracker.ts, lines 253–257

```typescript
// BUG: toOtelAttributes() omits cacheReadInputTokens from total
const total =
  (usage.inputTokens ?? 0) +
  (usage.outputTokens ?? 0) +
  (usage.reasoningOutputTokens ?? 0) +
  (usage.cacheCreationInputTokens ?? 0); // MISSING: + (usage.cacheReadInputTokens ?? 0)
```

**Impact**: OTel `codex.usage.total_tokens` metric underounts cache hits. The attribute `gen_ai.usage.cache_read.input_tokens` is correctly emitted (line 244), but not summed into the total. This breaks cost-attribution reconciliation for observability pipelines that rely on total_tokens as the denominator.

**Fix Required**: Line 257 should sum all token streams:

```typescript
const total =
  (usage.inputTokens ?? 0) +
  (usage.cacheReadInputTokens ?? 0) +
  (usage.outputTokens ?? 0) +
  (usage.reasoningOutputTokens ?? 0) +
  (usage.cacheCreationInputTokens ?? 0);
```

**Caveat**: Cost calculation (lines 106–112) already includes cacheRead in final costUsd, so billing is correct; only observability is broken.

---

### Adapter-by-Adapter Cache Token Coverage

| Provider        | File                                                  | Cache Token Extraction                                                                                                                | Status                                                           |
| --------------- | ----------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------- |
| **Anthropic**   | apps/web/lib/llm-providers/anthropic.ts:309–310       | ✅ cache_read_input_tokens + cache_creation_input_tokens extracted                                                                    | **WIRED**                                                        |
| **OpenAI**      | apps/web/lib/llm-providers/openai.ts:235–238, 256–258 | ✅ cached_tokens extracted; ⚠️ cache_creation intentionally NOT extracted (OpenAI doesn't expose it)                                  | **WIRED** with caveat                                            |
| **DeepSeek**    | apps/web/lib/llm-providers/deepseek.ts:99–111         | ❌ NO cache token extraction; response.usage parsed but cache fields ignored                                                          | **MISSING** (high impact: 0.003625 cache-read pricing invisible) |
| **Google**      | apps/web/lib/llm-providers/google.ts                  | ❌ NO cache token extraction; usageMetadata.cachedContentTokenCount ignored                                                           | **MISSING**                                                      |
| **Groq**        | apps/web/lib/llm-providers/groq.ts                    | ❌ NO cache token extraction                                                                                                          | **MISSING**                                                      |
| **xAI Grok**    | apps/web/lib/llm-providers/xai.ts                     | ❌ NO cache token extraction                                                                                                          | **MISSING**                                                      |
| **Mistral**     | apps/web/lib/llm-providers/mistral.ts                 | ❌ Provider has no caching feature                                                                                                    | N/A                                                              |
| **Moonshot**    | apps/web/lib/llm-providers/moonshot.ts                | ✅ cached_tokens extracted via usage.cached_tokens                                                                                    | **WIRED**                                                        |
| **Zhipu (GLM)** | apps/web/lib/llm-providers/zhipu.ts                   | ✅ cached_tokens extracted via usage.prompt_tokens_details.cached_tokens                                                              | **WIRED**                                                        |
| **Qwen**        | apps/web/lib/llm-providers/qwen.ts                    | ❌ NO cache token extraction                                                                                                          | **MISSING** (despite cached_input: 0.05 in catalog)              |
| **Perplexity**  | apps/web/lib/llm-providers/perplexity.ts              | ❌ NO cache token extraction                                                                                                          | **MISSING**                                                      |
| **OpenRouter**  | apps/web/lib/llm-providers/openrouter.ts:189–191      | ✅ Extracts cache_read_input_tokens + cache_creation_input_tokens for Anthropic-routed models only; non-Anthropic routes DO NOT cache | **WIRED (selective)**                                            |

---

### Cost-Tracker Pricing Logic Issues

**File**: apps/web/lib/cost-tracker.ts, lines 89–96

```typescript
// Line 91: fallback to 10% if not in catalog
const catalogCachedInput = modelMetadata?.cached_input ?? inputPerM * 0.1;

// Line 92: catalog may have cached_input (sparse)
const cacheReadPerM = catalogCachedInput;

// Line 96: cache write ALWAYS 125% (Anthropic-aligned)
const cacheCreationPerM = inputPerM * 1.25;
```

**Issues**:

1. **OpenAI cache_creation miscalculation** (line 96): OpenAI does NOT charge a separate cache-write fee (1.0x input cost), but cost-tracker applies 1.25x. **Fix**: Detect provider in recordModelUsage() and apply provider-specific multiplier.

2. **Sparse catalog coverage** (line 91): Only 9 of ~80 models have cached_input populated. DeepSeek V4-Pro should be 0.003625, not 10% of 0.435 (0.0435). **Fix**: Populate models.json with provider-published cache-read rates.

3. **No provider-specific write costs**: All cache_creation uses 1.25x, but DeepSeek, OpenAI, Google, and others have 1.0x or 0% surcharge. **Fix**: Add cacheCreationCost field to models.json or detect provider and apply multiplier.

---

### Models.json Cached Input Coverage

**File**: packages/types/src/models.json

**Populated (9 total)**:

- claude-opus-4.8: 0.5 (line 688)
- deepseek-v4-flash: 0.0028 (line 1200)
- deepseek-v4-pro: 0.003625 (line 1233)
- qwen-3.6-plus: 0.05 (line 1303)
- qwen-3.6-ultra: 0.06 (line 1310)
- kimi-k2.6: 0.16 (line 1465)
- glm-4-plus: 0.26 (line 1481)
- glm-4-long: 0.11 (line 1488)
- gpt-image-2: 2.0 (line 1710, vision model, unlikely to cache)

**Missing** (high-value models):

- gpt-5.5, gpt-5.4-mini (OpenAI): presumed ~0.05 (10% of ~0.5 input), but not specified
- gemini-2.5-pro, gemini-2.5-flash (Google): not specified, should be ~0.05 (10% of ~0.5)
- claude-sonnet-4.6 (Anthropic): not specified, should be ~0.15 (30% of ~0.5)
- grok-3, grok-4.1-vision (xAI): not specified
- moonshot-v1-auto: not specified
- All Groq, Mistral, Perplexity models: 0 (no caching support per vendor)

---

### Vercel AI SDK v2: Complete Cache Opacity

**File**: apps/web/lib/ai-sdk/event-adapter.ts, interface AiSdkUsageLike (line 8–18)

Vercel AI SDK v6 does NOT expose cache token details in the result.usage object. Your event-adapter maps `result.usage` to `AiSdkUsageLike` but:

```typescript
interface AiSdkUsageLike {
  inputTokens?: number;
  outputTokens?: number;
  cacheReadTokens?: number; // ← NOT populated by AI SDK v6
  cacheCreationTokens?: number; // ← NOT populated by AI SDK v6
  reasoningTokens?: number;
}
```

**Impact**: Any v2 routes using `streamText()` (e.g., `/api/llm/v2/chat/route.ts`) will have zero cache cost tracked, even if the underlying provider (Anthropic via AI SDK) caches the request.

**Workaround Options**:

1. Migrate v2 routes to native SDKs (Anthropic, OpenAI, Google) like v1 does.
2. Introspect AI SDK provider instances post-completion to extract cache metrics (requires SDK internals).
3. Accept v2 as cache-blind and prioritize v1 routes for cache-sensitive workloads.

---

### OpenRouter Cache Control Implementation

**File**: apps/web/lib/llm-providers/openrouter.ts, lines 26–51 (mapMessages) + 87–95 (cache_control injection)

✅ **Correctly wired for Anthropic-routed models**:

```typescript
// Line 45: Cache control ONLY on system message for Anthropic models
if (msg.role === 'system' && systemCacheControl && model.includes('anthropic/')) {
  msg.cache_control = systemCacheControl;
}
```

⚠️ **Non-Anthropic routes DO NOT receive cache_control**:

- google/_, meta-llama/_, qwen/_, mistralai/_, etc. do NOT get injected cache_control.
- This is correct per OpenRouter's capability matrix: only Anthropic upstream supports cache_control in the wire format.
- Other providers' caching happens implicitly (Google, DeepSeek) or is not supported via OpenRouter.

**Test coverage**: apps/web/lib/llm-providers/**tests**/openrouter-cache.test.ts validates system-message-only injection.

---

### Gateway & Routing: No Caching Orchestration

**File**: services/api-gateway/src/routes/llm.ts, lines 39–41

Gateway proxies directly to provider endpoints without cache control orchestration:

```typescript
const ANTHROPIC_API_URL = process.env.ANTHROPIC_API_URL || 'https://api.anthropic.com/v1';
const OPENAI_API_URL = process.env.OPENAI_API_URL || 'https://api.openai.com/v1';
const GOOGLE_API_BASE =
  process.env.GOOGLE_API_BASE || 'https://generativelanguage.googleapis.com/v1beta/models';
```

**Gap**: No x-session-id header forwarding for sticky routing, no cache_control pass-through, no provider.order enforcement. Caching decisions are entirely delegated to per-provider adapters in apps/web/lib/llm-providers/.

---

## 5. Recommendations: Prioritized Roadmap

### A. Gateway Caching Pass-Through (Medium Effort)

**Goal**: Enforce multi-turn session affinity + cache control at gateway layer to maximize cache hits.

**Scope**: services/api-gateway/src/routes/llm.ts

**Changes**:

1. **Forward x-session-id header** (Low effort)
   - Extract or generate sessionId from request.
   - Pass as x-session-id header to upstream provider (Anthropic, OpenAI, Google, OpenRouter).
   - Cost-tracker.ts already keyed by sessionId; gateway should use the same.
   - **File target**: services/api-gateway/src/routes/llm.ts, ~line 40–60 (headers section)

2. **Emit provider.order for fallback chains** (Medium effort)
   - Extend modelRouter.ts to return `providerOrder?: string[]` (fallback provider chain).
   - Forward as `provider.order` field in OpenRouter requests.
   - For direct providers (anthropic, openai, google), use providerOrder to inform retry logic.
   - **File targets**: apps/web/lib/modelRouter.ts (add providerOrder field), services/api-gateway/src/routes/llm.ts (pass provider.order)

3. **Cache control pass-through for Anthropic** (Low effort)
   - Extract cacheRetention from request (already passed by clients).
   - Call buildAnthropicCacheControl() from cache-retention.ts and inject into Anthropic requests at gateway layer.
   - Currently done per-adapter (openrouter.ts); centralize in gateway for Anthropic direct path.
   - **File target**: services/api-gateway/src/routes/llm.ts, add cache_control header before proxying to Anthropic.

4. **Validate provider health for fallback** (Low effort)
   - Integrate providerHealth.ts getFallbackRecommendation() into request routing.
   - Deprioritize unhealthy providers in fallback chain.
   - **File target**: services/api-gateway/src/routes/llm.ts, line 92–96 (provider selection logic)

**Effort**: 3–5 days. **Impact**: Sticky routing maximizes cache hit rates on multi-turn conversations; fallback chains hide provider outages.

---

### B. Cost-Tracker OTel Bug & Provider-Specific Pricing (Low-Medium Effort)

**Goal**: Fix codex.usage.total_tokens OTel omission and implement provider-aware cache pricing.

**Changes**:

1. **Fix OTel total_tokens** (Low effort, high visibility)
   - **File**: apps/web/lib/cost-tracker.ts, line 257
   - **Change**: Add cacheReadInputTokens to sum:
     ```typescript
     const total =
       (usage.inputTokens ?? 0) +
       (usage.cacheReadInputTokens ?? 0) + // ← ADD THIS
       (usage.outputTokens ?? 0) +
       (usage.reasoningOutputTokens ?? 0) +
       (usage.cacheCreationInputTokens ?? 0);
     ```
   - **Test**: Verify OTel attributes include cache_read tokens in total for cache-heavy workloads.

2. **Provider-specific cache_creation multipliers** (Medium effort)
   - **File**: apps/web/lib/cost-tracker.ts, lines 94–96
   - **Change**: Detect provider and apply correct cache_creation surcharge:
     ```typescript
     const cacheCreationMultiplier =
       {
         anthropic: 1.25, // Or 2.0 for 1h TTL
         openai: 1.0, // No surcharge
         google: 1.0, // No surcharge (storage fees separate)
         deepseek: 1.0, // No surcharge
         grok: 1.0,
         default: 1.25, // Fallback
       }[provider] ?? 1.25;
     const cacheCreationPerM = inputPerM * cacheCreationMultiplier;
     ```
   - **Pre-req**: Pass provider to recordModelUsage() or infer from modelId.

3. **Populate sparse models.json cached_input** (Low effort, high completeness)
   - **File**: packages/types/src/models.json
   - **Add entries** (values sourced from vendor docs, URLs below):
     - gpt-5.5: 0.05 (10% of ~0.5 input)
     - gpt-5.4-mini: 0.05
     - gemini-2.5-pro: 0.05 (10% of ~0.5)
     - gemini-2.5-flash: 0.03
     - claude-sonnet-4.6: 0.15 (30% of ~0.5)
     - grok-3: 0.05
     - grok-4.1-vision: 0.05
     - qwen-3.6-pure: inherit from qwen-3.6-plus (0.05)
     - All others from vendor pricing pages (see references below)
   - **Sources**: OpenAI pricing (https://openai.com/pricing), Google pricing (https://ai.google.dev/pricing), Anthropic pricing (https://www.anthropic.com/pricing), xAI pricing (https://docs.x.ai/pricing)

**Effort**: 2–3 days. **Impact**: Accurate cost attribution per provider; OTel metrics valid for SLO tracking.

---

### C. DeepSeek Cache Token Extraction (Low Effort, High Impact)

**Goal**: Wire DeepSeek's 0.003625 cache-read pricing, currently invisible.

**Changes**:

1. **Extract cache metrics from DeepSeek response** (Low effort)
   - **File**: apps/web/lib/llm-providers/deepseek.ts, lines 99–111
   - **Add**: Parse cache tokens from response.usage:
     ```typescript
     cachedInputTokens: response.usage?.cache_completion_tokens ?? 0,
     // OR inspect response.usage structure for cache-related fields
     ```
   - **Challenge**: DeepSeek docs don't explicitly name the cache field; may be implicit in token_count. Verify via API test.

2. **Test with cache-heavy payload**:
   - Send 4000+ token system prompt + 2000+ token conversation to DeepSeek V4-Pro.
   - Verify cache_read_input_tokens is populated in second request.
   - Confirm cost-tracker calculates 0.003625/M, not 0.0435/M (10% fallback).

**Effort**: 1–2 days. **Impact**: ~10x cost accuracy improvement for DeepSeek users (most cost-sensitive provider).

---

### D. Google & xAI Cache Token Extraction (Low-Medium Effort)

**Goal**: Wire Google Gemini implicit + explicit caching and xAI Grok sticky routing.

**Google Changes**:

1. **File**: apps/web/lib/llm-providers/google.ts
   - Extract usageMetadata.cachedContentTokenCount into cachedInputTokens
   - Populate in LLMProviderResponse
   - Apply 0.1x cost multiplier (90% discount)

2. **Explicit caching support** (future):
   - Expose createCache() API to callers if caching is critical for long-running contexts.

**xAI Changes**:

1. **File**: apps/web/lib/llm-providers/xai.ts
   - Forward x-grok-conv-id header for sticky routing (must be stable UUID or session ID).
   - Extract cache_read_input_tokens if present in response.
   - Apply 0.05/M pricing (75% discount from 0.2/M).

**Effort**: 1–2 days each. **Impact**: Moderate (Google and xAI are secondary providers in AGI's portfolio, but closing gaps improves observability).

---

### E. Vercel AI SDK v2 Cache Opacity (Medium-High Effort, Lower Priority)

**Goal**: Surface cache token metrics for v2 routes, or migrate to native SDKs.

**Option 1: Native SDK Migration** (Recommended)

- Migrate /api/llm/v2/chat/route.ts and related v2 routes to use native SDKs (Anthropic, OpenAI, Google) like v1 does.
- Enables full cache control + metric extraction.
- **Effort**: Medium (1–2 weeks to refactor v2 request/response mapping).
- **File targets**: apps/web/app/api/llm/v2/chat/route.ts, apps/web/lib/v2-to-v1-adapter.ts (new file to map v2 params to v1 native SDK params).

**Option 2: AI SDK Introspection Hook** (Workaround)

- Patch createAiSdkStream() to intercept provider-level usage post-completion.
- Requires examining AI SDK internals (risky for version stability).
- **Effort**: High (2–3 weeks, fragile).
- **File targets**: apps/web/lib/ai-sdk/event-adapter.ts, apps/web/app/api/llm/v2/chat/route.ts

**Recommendation**: Option 1. v2 routes are secondary; migrating to native SDKs aligns with v1 and unblocks cache cost tracking.

---

### F. OpenRouter as Unified Backend Aggregator (Medium Effort, Strategic)

**Goal**: Optionally adopt OpenRouter as the primary multi-provider gateway, replacing direct anthropic/openai/google proxying in the cloud alpha.

**Decision Point**: Should AGI Workforce become an OpenRouter reseller (5% markup on BYOK) or remain a pure multi-provider gateway?

**If YES (OpenRouter as backend)**:

1. **Extend gateway to route through OpenRouter**:
   - Send all requests to `https://openrouter.ai/api/v1` with model: `provider/model-name` format.
   - Remove per-provider endpoint branching (ANTHROPIC_API_URL, OPENAI_API_URL, GOOGLE_API_BASE).
   - Pass provider.order for fallback chains.
   - Pass x-session-id for sticky routing.
   - Pass X-OpenRouter-Cache header for response caching.

2. **Inherit OpenRouter's pricing model**:
   - Pricing becomes OpenRouter's published rates + 5% markup.
   - No need to maintain provider-specific pricing (OpenRouter handles it).
   - BYOK users supply OPENROUTER_API_KEY instead of individual provider keys.

3. **Simplifications**:
   - Single adapter (openrouter.ts) instead of 10+ per-provider adapters.
   - Automatic fallback routing.
   - Unified caching semantics.

4. **Tradeoffs**:
   - 5% cost overhead (tolerable if billing model justifies it).
   - Less direct control over provider selection (deferred to OpenRouter's load-balancer).
   - Dependency on OpenRouter's uptime.

**If NO (Status Quo)**:

- Continue direct multi-provider proxying.
- Implement recommendations A–D above to improve cache efficiency.
- Consider OpenRouter as a secondary aggregator for BYOK users only.

**Recommendation**: NO for now. Your task-based auto-router (modelRouter.ts) provides competitive advantage. OpenRouter is a good fallback/BYOK option but shouldn't be primary. Implement recommendations A–E to optimize your direct routing.

**File targets** (if pursuing OpenRouter as backend): services/api-gateway/src/routes/llm.ts (single OpenRouter endpoint), apps/web/lib/modelRouter.ts (provider.order output), deprecate per-provider adapters.

---

### G. BYOK Alignment: Desktop/CLI vs. Cloud Alpha (Low Effort, Operational)

**Goal**: Ensure BYOK cost tracking is consistent across desktop, CLI, and cloud alpha.

**Current State**:

- Desktop BYOK: apps/web/lib/byok-providers.ts instantiates provider adapters; cost tracked via cost-tracker.ts (same as cloud alpha).
- CLI BYOK: Presumed similar architecture; unclear if cost-tracker is wired.
- Cloud Alpha: Gateway (services/api-gateway/src/routes/llm.ts) only handles managed keys; BYOK bypasses gateway.

**Issues**:

1. **Cost attribution divergence**: BYOK requests (desktop/CLI) may not go through the same cost-tracker pipeline as cloud alpha requests.
2. **OpenRouter BYOK**: Currently supported via desktop adapter but not integrated into cloud alpha's plan/billing tiers.

**Changes**:

1. **Verify CLI cost tracking**:
   - Audit apps/desktop/src (assumed location) for cost-tracker usage.
   - Ensure CLI BYOK requests populate the same sessionStore as web/desktop.
   - **File targets**: Likely apps/desktop/src/lib/cost-tracker.ts or apps/desktop/src/services/

2. **Cloud Alpha BYOK support** (future, if applicable):
   - If managed cloud should accept user-supplied provider keys, extend gateway to handle BYOK path.
   - Route BYOK requests through the same cost-tracker pipeline.
   - **File targets**: services/api-gateway/src/routes/llm.ts (add BYOK path detection), cost-tracker.ts (ensure sessionStore is shared)

**Effort**: 1–2 days (audit) + optional 3–5 days (full BYOK on cloud alpha).

---

### H. Model Variants & Cost-Quality Tradeoff Parameters (Low Effort, Nice-to-Have)

**Goal**: Expose OpenRouter-style model variants (`:nitro`, `:floor`, `:max-pro`) and cost_quality_tradeoff parameter to clients.

**Changes**:

1. **Parse model variant suffix** (Low effort):
   - **File**: apps/web/lib/modelRouter.ts
   - Parse incoming model ID for `:variant` suffix (e.g., `claude-opus-4.8:floor`).
   - Map variant to provider.sort in request (nitro → throughput, floor → price, max-pro → quality).
   - Strip variant before sending to provider.

2. **Add cost_quality_tradeoff parameter** (Low effort):
   - Accept parameter in /api/llm/v1/chat/completions request body.
   - Pass to modelRouter.ts scoreModel() to weight cost vs. quality dynamically.
   - **File targets**: apps/web/app/api/llm/v1/chat/completions/route.ts (parameter extraction), apps/web/lib/modelRouter.ts (scoring adjustment)

**Effort**: 1–2 days. **Impact**: Improved user experience; aligns with OpenRouter's API surface.

---

## Summary Table: Recommendations by Priority

| #      | Recommendation                            | Effort             | Impact              | Files                              | Timeline                       |
| ------ | ----------------------------------------- | ------------------ | ------------------- | ---------------------------------- | ------------------------------ |
| **B1** | Fix OTel total_tokens                     | 1 hour             | High                | cost-tracker.ts:257                | Immediate                      |
| **C**  | DeepSeek cache extraction                 | 1–2 days           | High (10x accuracy) | deepseek.ts:99–111                 | Week 1                         |
| **A1** | x-session-id header forwarding            | 1 day              | Medium              | llm.ts:40–60                       | Week 1                         |
| **B2** | Populate models.json cached_input         | 2–3 days           | Medium              | models.json (all models)           | Week 1                         |
| **B3** | Provider-specific cache_creation          | 2 days             | Medium              | cost-tracker.ts:94–96              | Week 1                         |
| **D**  | Google + xAI cache extraction             | 1–2 days each      | Low-Medium          | google.ts, xai.ts                  | Week 2                         |
| **A2** | Provider fallback chains (provider.order) | 2–3 days           | Medium              | modelRouter.ts, llm.ts             | Week 2                         |
| **A3** | Cache control pass-through at gateway     | 2 days             | Medium              | llm.ts, cache-retention.ts         | Week 2                         |
| **G**  | CLI/BYOK cost alignment audit             | 1–2 days           | Low                 | apps/desktop/src/, cost-tracker.ts | Week 2                         |
| **E1** | v2 native SDK migration (optional)        | 1–2 weeks          | Medium              | v2/chat/route.ts + adapters        | Month 2 (backlog)              |
| **H**  | Model variants + cost_quality_tradeoff    | 1–2 days           | Low                 | modelRouter.ts, route.ts           | Backlog                        |
| **F**  | OpenRouter as backend (decision point)    | 2–3 weeks (if yes) | Strategic           | llm.ts, all adapters               | 3+ months (strategic decision) |

---

## References

### OpenRouter Documentation

- https://openrouter.ai/docs/guides/routing/provider-selection
- https://openrouter.ai/docs/guides/routing/model-fallbacks
- https://openrouter.ai/docs/guides/best-practices/prompt-caching
- https://openrouter.ai/docs/guides/routing/routers/auto-router
- https://openrouter.ai/docs/guides/overview/auth/byok
- https://openrouter.ai/announcements/response-caching

### Provider Caching & Pricing (URLs embedded in table above)

- **Anthropic**: https://platform.claude.com/docs/en/build-with-claude/prompt-caching
- **OpenAI**: https://developers.openai.com/api/docs/guides/prompt-caching
- **Google Gemini**: https://ai.google.dev/gemini-api/docs/caching, https://docs.cloud.google.com/gemini-enterprise-agent-platform/models/context-cache/context-cache-overview
- **DeepSeek**: https://api-docs.deepseek.com/guides/kv_cache
- **xAI Grok**: https://docs.x.ai/developers/advanced-api-usage/prompt-caching
- **Groq**: https://console.groq.com/docs/prompt-caching
- **Qwen**: https://www.alibabacloud.com/help/en/model-studio/context-cache
- **AWS Bedrock**: https://docs.aws.amazon.com/bedrock/latest/userguide/prompt-caching.html

### AGI Workforce Codebase (File References)

- **Cost Tracking**: /Users/siddhartha/Desktop/agiworkforce/apps/web/lib/cost-tracker.ts
- **Model Router**: /Users/siddhartha/Desktop/agiworkforce/apps/web/lib/modelRouter.ts
- **Gateway**: /Users/siddhartha/Desktop/agiworkforce/services/api-gateway/src/routes/llm.ts
- **Catalog**: /Users/siddhartha/Desktop/agiworkforce/packages/types/src/models.json
- **Adapters**: /Users/siddhartha/Desktop/agiworkforce/apps/web/lib/llm-providers/{anthropic,openai,deepseek,google,openrouter,moonshot,zhipu,groq,xai,mistral,perplexity,qwen}.ts
- **Cache Retention**: /Users/siddhartha/Desktop/agiworkforce/apps/web/lib/llm-providers/cache-retention.ts
- **AI SDK v2**: /Users/siddhartha/Desktop/agiworkforce/apps/web/lib/ai-sdk/event-adapter.ts
- **BYOK**: /Users/siddhartha/Desktop/agiworkforce/apps/web/lib/byok-providers.ts
