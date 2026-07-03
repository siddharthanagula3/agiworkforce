# AGI Runtime — Volume 14 — Model Router

Status: Draft spec
Owner: Founder + platform lead
Last updated: 2026-07-01

Authority: `AGENTS.md`; `docs/current/source-of-truth.md`; `docs/products/README.md`; `apps/mobile/AGENTS.md` (active surface); grounded in `packages/types/src/models.json`, `packages/types/src/model-catalog.ts`, `packages/llm-runtime/src/fallback.ts`, `packages/llm-runtime/src/retry.ts`, `apps/web/app/api/llm/completion/route.ts`, `packages/unified-chat/src/stores/modelStore.ts`.

## Overview & stance

The Model Router is the AGI Runtime component that turns "run this request" into "run it on _this_ model, from _this_ provider, over _this_ trust boundary." It is not a user surface and not a daemon — it is shared TypeScript catalog logic (`packages/types/src/model-catalog.ts`) plus per-call resolution at each entry point (the Web LLM route today; Desktop/CLI hosts later). Its single source of routing metadata is `packages/types/src/models.json`: `capabilities`, `contextWindow`, `inputCost`/`outputCost`, `speed`, `qualityTier`, per-provider `taskRouting`, `providersInOrder`, and `tierAllowedModels`. Model IDs are never hardcoded — every decision reads the catalog.

The trust boundary is the router's outer constraint, checked _before_ any capability, cost, or latency scoring:

- **Local** — resolve only within on-device / local-runtime models (`MODEL_ENVIRONMENTS = ['e2b','local-runtime']`, `evaluateModelEnvironment`). A Local failure must **never** silently fall back to BYOK or Cloud. Fallback stays inside the Local pool or surfaces an error the user can act on.
- **BYOK** (Desktop/CLI/VS Code only) — the candidate set is exactly the user's configured providers/keys. No managed-cloud model may enter the chain.
- **Managed Cloud** — candidates are gated by plan via `getAllowedModelsForTier` + `SLOT_REGISTRY`. Never fed Local/BYOK context.
- Mobile = Local + Cloud only (no BYOK); Web = Cloud only.

Cross-boundary routing is a category error the router must refuse. Everything below operates _within_ one resolved boundary.

## Capability Matching — choose capable models

The router filters candidates to those whose `capabilities` flags in `models.json` satisfy the request's demands: `tools`, `vision`, `json`, `thinking`, `computerUse`, `agentic`, `search`, `research`, `codeExecution`, `caching`. A tool-calling agent request must exclude models lacking `tools`; a screenshot request must require `vision`; a computer-use task must require `computerUse`.

- ✅ Built: the capability schema and per-model flags exist (`packages/types/src/model-catalog.ts` `ModelCapabilities`; `packages/types/src/models.json`). Consumers already read them — `packages/unified-chat/src/stores/modelStore.ts` derives `supportsThinking`/`supportsVision`/`supportsTools` from `metadata.capabilities`.
- 🟡 Partial: task→slot mapping exists via `SLOT_REGISTRY` and `getTaskModelForProvider` (per-provider `taskRouting`), but a general capability-predicate filter (`requireTools`, `requireVision`) is only wired into fallback selection (`packages/llm-runtime/src/fallback.ts` `FallbackChainOptions.requireTools`), not into first-choice resolution on every surface.
- 🔭 Planned: a single `selectCapableModel(request, boundary)` entry that all six surfaces call, rejecting incapable models before dispatch.

Requirement: no request is dispatched to a model whose catalog `capabilities` do not cover its declared needs.

## Cost Optimization — optimize request cost

Cost scoring reads `inputCost`/`outputCost` (USD per million tokens) from `models.json`, never a hardcoded price. The router prefers the cheapest candidate that still passes capability and context checks.

- ✅ Built: `apps/web/app/api/llm/completion/route.ts` picks the cheapest economy fallback that is strictly cheaper than the current model, iterating `getEconomyFallbackModels()` and comparing `LLMCostCalculator.estimateCost`. `getModelCostRates` (`model-catalog.ts`) exposes per-model rates.
- 🟡 Partial: cost optimization currently fires as a fallback/degrade step, not as the primary objective for a fresh request. The `tierAllowedModels.economy` list and `getEconomyFallbackModels` are the cost floor.
- 🔭 Planned: budget-aware routing (per-request or per-plan spend ceiling) that selects the cheapest capable model up front and records projected spend against the metered usage system.

Requirement: given two capable candidates, the router never picks the costlier one without a recorded quality/latency reason. It never invents a price — absent catalog cost data, the model is not eligible for cost-ranked selection.

## Context Window Matching

The router must not route a request whose token estimate exceeds a model's `contextWindow`. Windows vary widely across the catalog (200K to ~1M+), read via `contextWindow` / `getModelContextLimits`.

- ✅ Built: `contextWindow` per model and `getModelContextLimits(modelIds)` (`model-catalog.ts`) provide the data; `packages/unified-chat/src/stores/modelStore.ts` surfaces per-model `contextWindow`.
- 🟡 Partial: overflow handling is **reactive** — `packages/llm-runtime/src/retry.ts` recovers from context-overflow by shrinking `maxTokensOverride`/disabling thinking on retry (`FLOOR_OUTPUT_TOKENS`), rather than pre-selecting a larger-window model.
- 🔭 Planned: predictive context matching — estimate prompt tokens, filter candidates to `contextWindow >= estimate + headroom`, and prefer a larger-window sibling (e.g., long-context slot) before dispatch instead of after failure.

Requirement: a request is never dispatched to a model whose `contextWindow` is provably too small for the assembled prompt.

## Latency Optimization

Latency preference reads the catalog `speed` enum (`very-fast | fast | medium | slow`) and `qualityTier` (`fast | balanced | best`). Interactive turns (chat typing) prefer `very-fast`/`fast`; batch/agentic work tolerates `slow` for higher quality.

- ✅ Built: `speed` and `qualityTier` fields exist per model; `SLOT_REGISTRY` encodes `*_fast` vs `*_premium` slots that already separate low-latency from high-quality routes.
- 🔭 Planned: there is **no** measured-latency feedback loop today — no p50/p95 telemetry per model/provider, and no live signal table (`surface_heartbeats` does not exist; `apps/web/app/api/control-plane/status` is the only related stub). Latency routing is therefore static (catalog `speed`), not adaptive. Adaptive latency routing (hedged requests, provider-observed p95) is design intent only.

Requirement: interactive requests default to a `fast`/`very-fast` capable model unless the user or task explicitly opts into a slower, higher-quality tier.

## Fallback Routing — recover from failures

When an attempt is classified `fallbackable` (consecutive overload/529s, capacity off-switch, model-specific safety refusal, invalid-model-after-redirect), the retry generator emits `FallbackTriggeredError(model, fallbackModel)` and the chain module chooses the target.

- ✅ Built: `packages/llm-runtime/src/fallback.ts` builds an ordered chain via catalog helpers (`getModelMetadataById`, `getEconomyFallbackModels`, `getModelsForProvider`) with three strategies: `same-provider-cheaper` (drop a quality tier within the vendor), `economy-tier` (cheapest tools-capable economy model), `cross-provider` (another provider's flagship). Model IDs are **never** hardcoded. `packages/llm-runtime/src/retry.ts` runs exponential backoff with full jitter (`DEFAULT_MAX_RETRIES`, `MAX_OVERLOAD_RETRIES`, `BASE_DELAY_MS`, `MAX_BACKOFF_MS`).
- 🟡 Partial: `cross-provider` fallback lacks a live provider-health feed; candidate viability relies on `getProviderProbeModel` rather than real-time status.
- 🔭 Planned: health-driven pre-emptive rerouting (skip a degraded provider before the first failure).

Requirement: fallback stays inside the same trust boundary; `exclude` prevents retrying a model already tried; each hop must still pass capability and context checks. Local never falls back off-device.

## Repository map

- `packages/types/src/models.json` — routing metadata SSOT (capabilities, contextWindow, cost, speed, qualityTier, taskRouting, providersInOrder, tierAllowedModels).
- `packages/types/src/model-catalog.ts` — catalog helpers, `SLOT_REGISTRY`, `TIER_POLICIES`, `getEconomyFallbackModels`, `getModelContextLimits`, `getModelCostRates`, `getAllowedModelsForTier`, `resolveAutoModeModel`.
- `packages/llm-runtime/src/{fallback,retry,errors}.ts` — fallback chains, retry/backoff, classification.
- `apps/web/app/api/llm/completion/route.ts`; `apps/web/app/api/llm/v2/chat/route.ts` — Web dispatch + cost-fallback.
- `packages/unified-chat/src/stores/modelStore.ts` — surface-facing model selection.

## Competitor notes

Claude, ChatGPT, and Codex route within one vendor's family (e.g., a fast vs. reasoning tier of the same house). AGI's deliberate divergence: the router is **multi-provider** (managed cloud pools plus user BYOK), and every decision is boundary-scoped — Local stays on-device, BYOK stays on the user's keys, Cloud stays plan-gated. Where competitors optimize a single vendor's cost curve, AGI can fall back `cross-provider` from real catalog metadata, and it refuses the cross-boundary shortcuts a single-vendor router never has to consider. Local-first means the best route is often "no network at all."

## Acceptance / Definition of Done

The Model Router is production-ready when capability, cost, context, and latency filters run before dispatch on every surface; fallback recovers within-boundary from real catalog data; and no path can hardcode an ID or cross a trust boundary.

- [ ] Build: all four scoring stages read only `models.json` fields; a synthetic request with `requireTools`/`vision`/`computerUse` selects only capable models; context-overflow prefers a larger-window model before retry-shrink.
- [ ] Trust: unit tests prove Local never falls back to BYOK/Cloud; BYOK candidates exclude managed-cloud models; Cloud candidates respect `getAllowedModelsForTier`.
- [ ] Security: no hardcoded model IDs (guarded by the catalog-only rule); fallback `exclude` prevents infinite loops; refusals surface to the user rather than silently re-routing.

## Anti-patterns

- Hardcoding a model ID anywhere in routing — always read `models.json` via catalog helpers.
- Silently falling back Local → BYOK/Cloud, or BYOK → managed cloud, on any failure.
- Inventing latency/cost numbers, or claiming adaptive latency routing (it is 🔭 — no telemetry table exists).
- Leaning on removed tiers: `SLOT_REGISTRY` still carries `*_pro_plus` slots and `fallback.ts` comments reference "Hobby" — flag as 🟡 reconciliation debt against the Free/Basic/Pro/Max/Enterprise model; do not encode `pro_plus` or "Plus"/"Hobby" as live behavior.
- Referencing Supabase, `middleware.ts`, or credit top-ups. Auth/DB/billing is Clerk + Neon + Stripe; Next.js 16 uses `proxy.ts`.
