# Model Catalog + Routing + Tier/Trust — Executable Architecture Spec

Status: **authoritative** (2026-05-29). **Supersedes** `MODEL_SSOT_PLAN.md` and
`MODEL_CATALOG_MAINTENANCE.md`. Basis: design+synthesis workflow (`w06ps1x3w`) + adversarial
review + source verification on this branch (`hardening/execution-2026-05-28`).

## Executive summary

Three coupled problems, one coherent design:

1. **Catalog data drifts** — prices/context are hand-typed into the dual-consumed `models.json`
   (`deepseek-v4-pro` was priced like `v4-flash`). → Split into a hand-edited **curation overlay** +
   an **upstream sync** (models.dev) that _generates_ the committed `models.json`, with a
   **`costOverride` escape hatch** so synthetic (`gpt-5.x`) / per-image / per-second models are never
   nulled to $0.
2. **Three divergent routers** — (a) `apps/desktop/src/lib/modelRouter.ts` (the LIVE benchmark+cost+
   complexity ranker, keyed on auto-economy/balanced/premium), (b) `model-catalog.ts` SLOT_REGISTRY
   (tier×task→slot), (c) `packages/routing/three-tier-router.ts` (QualityTier table — **dead**, routes
   to the **removed** `claude-opus-4.7`, zero non-test callers). → Collapse to **one** shared router.
3. **🔴 LIVE trust-boundary bug** — `resolveAutoModeModel` defaults to `auto-balanced`, its no-task
   path returns **all-cloud** slots, and `SLOT_REGISTRY` has **zero local entries**, so a **Local turn
   can be silently routed to a cloud model** — a direct violation of the locked
   _never-silently-route-Local→cloud_ rule. → Make the resolver **trust-aware** (privacyMode-first;
   Local branch returns `null`, never a cloud fallback).

## Critical findings (verified against source)

- **🔴 P0 (live):** the routing resolver can silently send Local content to cloud (see #3). The CLI
  already guards this (`agent/mod.rs:560 validate_privacy_boundary`); the TS resolver does not. **Must fix.**
- **The "auto = cost-efficient per task" ranker already exists** (`modelRouter.ts`: `getBenchmarkScore`,
  `estimateComplexity`, `selectModelFromPool`). Your `auto-economy` _is_ this ranker. Single-auto =
  **promote this ranker** as the one "auto"; drop the balanced/premium _pools_ (the ranker already
  escalates to premium models for complex/high-benchmark-bar tasks — that IS "cheapest that clears the bar").
- **`deepseek-v4-pro` may be an intentional promo**, not a bug: `post_promo_prices` 1.74/3.48 with
  `promo_expires_at 2026-05-31T15:59Z`. The promo-expiry pricing helper must be correct **before
  2026-05-31** regardless of migration pace. Confirm via sync-reconcile before "fixing."

## Target architecture

### A. Catalog single-source-of-truth

- `models.curation.json` (NEW, the only hand-edited file): offered ids + `{apiModelId, provider,
modelType, tier, surface, qualityTier, benchmarks, costOverride?}`, the `slots` map, `tierAllowedModels`,
  `modelPresets`, `providersInOrder`, per-provider `{defaultModel, taskRouting, canonicalization, label}`.
- `scripts/sync-models.mjs` (NEW): fetch `models.dev/api.json`, **join on `apiModelId`**, pull
  cost/context/cache/modalities/capabilities; **costOverride wins** when no upstream row or delta-gate
  fail; emit an _unverified_ report; like-for-like delta gate (ignore promo pricing); LiteLLM 2nd-source
  cross-check; deterministic key order; `--check` mode for the CI drift gate.
- `models.json` becomes a **generated, committed** artifact (shape unchanged → Rust `include_str!` + TS
  `import` keep reading one file). **Benchmarks live in the curation overlay** (models.dev has none).

### B. One trust-aware router with a single "auto"

- Promote the **benchmark+cost+complexity ranker** (from `modelRouter.ts`) into shared `packages/routing`
  as the canonical "auto". Delete the dead half of `three-tier-router.ts`; `model-catalog.ts` slot/tier
  maps define the _candidate pool_ the ranker scores within.
- `resolveAuto({tier, privacyMode, taskType?, byokProvider?, availableLocalModels?, managedBetaUnlocked?})`:
  - **privacyMode REQUIRED** (transitional default `local` — the safe default, never `managed`).
  - **Local** → rank only `availableLocalModels`; return **null** if none (never a cloud slot).
  - **BYOK** → rank models the `byokProvider` serves.
  - **Managed** → requires `managedBetaUnlocked`; rank within the tier's `allowedSlots` pool.
  - Post-resolution **sanitizer** ports `isDeprecated`/`isPromoExpired` re-pick **and** the
    quality-sensitive→Sonnet reroute (don't lose `three-tier-router`'s fallback behavior).
  - No-task default must preserve **tier escalation** (premium tiers → top general slot, not cheapest).
- Single `auto` mode (drop `auto-economy/balanced/premium`); accept the old strings as input and coerce
  (serde aliases in Rust, `normalizeAutoModeId()` in TS) for ≥1 release before the type narrows.

### C. Three orthogonal axes

`ProductTier` → managed pool (entitlement) · `PrivacyMode` → execution path (local|byok|managed) ·
`auto` → pick within (pool ∩ trust) by task. `TIER_POLICIES × SLOT_REGISTRY` govern **managed mode only**.
`allowedProviderSurfaces` is the **managed-entitlement** axis (local always available; BYOK per-surface).
Model-selector presets collapse to **Auto** (all tiers) + **Manual** (pro+ only).

## Migration sequence (independently shippable, reversible; destructive steps last)

0. Unify `ModelMetadata` (add fields the JSON already carries) + module-load drift guards.
1. **(pull forward — promo deadline)** Relocate pricing/deprecation helpers → `packages/routing/pricing.ts`.
2. Sync script + curation overlay scaffold; first run regenerates `models.json` byte-stable.
3. **Preserve the ranker** + collapse routers behind it: promote `modelRouter.ts` ranker to shared
   routing; keep `RouteResolution` shape (so `three-tier-router.test.ts` stays green) or rewrite the
   test in-step; port quality-sensitive→Sonnet reroute. _(REVISED per review — not a thin slot adapter.)_
4. Build trust-aware `resolveAuto` (Local returns null; round-trip-assert providerMode↔privacyMode).
5. Single-auto behavior: no-task → **tier-aware top slot** (preserve Max escalation); update
   `model-catalog.test.ts:90` in the same step. _(REVISED per review.)_
6. Thread `privacyMode` through all call sites; audit every `getDefaultModelFor` caller for Local safety.
7. Collapse auto-mode option _sources_ (presets → single Auto) in the curation overlay.
8. Strip dead auto-mode literals per surface (42 non-test files), one PR/surface.
9. Rust `RoutingStrategy` collapse with serde aliases.
10. Persisted-state drain (Neon migration `auto-economy|balanced|premium → auto`).
11. **(destructive, after drain)** Narrow the type/enum; make `privacyMode` required; delete the dead router.
12. Canonicalization cleanup (map-to-own-id; keep deprecated-forward redirects; drop phantom aliases).
13. **(last)** Widen CI lint to all provider-id patterns + wire `sync:models --check` + weekly cron.

## Open questions (need owner decision)

1. **Benchmark source** — models.dev has none; the lock forbids inventing data. Source `{swebench, gpqa,
mmlu, aime, humaneval}` from Artificial Analysis / vendor cards / SWE-bench leaderboard, and who curates?
   (opus-4.8 stays at the documented 4.7 floor until sourced.)
2. **v1 = Local-only vs Local+BYOK** — MEMORY locks Local-only; source-of-truth (2026-05-28) says
   Local+BYOK (mobile no BYOK). Code is identical either way (BYOK ships dark if Local-only).
3. **`deepseek-v4-pro`** — confirm it's an intentional promo (expires 2026-05-31), not a bug, before changing it.
4. **Price-delta threshold** for the sync sanity gate (proposed 25%) + the manual-override policy.
5. **Single-auto = behavior preservation, not regression** — confirm the promoted ranker (benchmark+cost+
   complexity) is the intended "auto"; dropping the balanced/premium _pools_ is acceptable (the ranker
   subsumes them).
