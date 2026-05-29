# How to maintain models with (almost) zero per-model work

Status: recommendation (2026-05-29). Basis: deep-research (`MODEL_CATALOG_RESEARCH.md`) +
context7 (LiteLLM, Vercel AI SDK) + the live `models.dev` cross-check.

## The one principle every multi-model tool follows

**The model catalog is fetched DATA from an upstream source — never hand-maintained code.**
Three proven patterns:

| Tool                              | Mechanism                                                                                                                                                                                                                                                      | "new model ships" cost                    |
| --------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------- |
| **models.dev** (opencode, AI SDK) | Community per-provider TOML → compiled to one hosted `models.dev/api.json` (cost, context, cache, modalities, capabilities). CI-validated, community PRs.                                                                                                      | 0 — it's already there; you just fetch it |
| **LiteLLM**                       | One `model_prices_and_context_window.json` on GitHub; `register_model(url=…)` loads it; `POST /reload/model_cost_map` hot-reloads with no restart; bundled `*_backup.json` offline fallback; `LITELLM_MODEL_COST_MAP_URL` to point at a fork.                  | 0 — reload pulls day-0 data               |
| **Vercel AI Gateway**             | No local catalog at all. `gateway.getAvailableModels()` / `GET https://ai-gateway.vercel.sh/v1/models` (no auth) returns every model + pricing (input/output/`cachedInputTokens`/`cacheCreationInputTokens`/tiered) + context. Use `models[0].id` dynamically. | 0 — discovered live                       |

Common thread: **prices/context/caching live upstream; the app stores only its _product decisions_ (which models it offers, tiering, routing) and pulls the rest.** Hardcoded model-id string literals appear in **none** of them — code selects by **slot / tier / capability**, never by a literal id.

## What you already have (don't rebuild)

- `packages/types/src/models.json` — single canonical catalog.
- `apps/cli/src/model_catalog.rs` — already a **4-tier cascade**: bundled JSON → 5-min disk cache → `models.dev/api.json` fetch → user config. This _is_ the LiteLLM/models.dev pattern.
- `model-catalog.ts` — `SLOT_REGISTRY`, `tierAllowedModels`, `requireProviderDefaultModel`, capability flags.
- CI lints (`check-no-hardcoded-models.sh`, ESLint `no-restricted-syntax`) — but deliberately narrow.

The reason it still feels like "change a lot of files" is that today **the prices/context are hand-typed into `models.json`** (so they drift — that's why `deepseek-v4-pro` was wrong), and **some code/tests still hardcode ids.**

## The method (5 steps → adding a model = 1 line, prices never drift)

### 1. Split the catalog into CURATION (hand-edited, tiny) + DATA (synced)

- `models.curation.json` — the **only** file you hand-edit. Per offered model, ~1 line:
  ```jsonc
  { "id": "claude-opus-4.8", "surface": "managed", "tier": "flagship" }
  ```
  Plus `slots` (routing policy: slot→id), `providerOrder`, `defaultModelPerProvider`. This is _your product decisions_ — small and stable.
- DATA (input/output/cache cost, context window, modalities, capabilities) is **not** stored by hand.

### 2. A sync script generates `models.json` from upstream

- `scripts/sync-models.mjs`: fetch `models.dev/api.json` → for each id in `models.curation.json`, pull cost/context/cache/modalities/capabilities → merge with curation → write `models.json` (the generated artifact the code consumes; commit it so Rust `include_str!` + TS import still work offline).
- `pnpm sync:models` run pre-build + on a weekly CI cron. **Prices auto-refresh** (this alone would have fixed `deepseek-v4-pro`). New model = add 1 line to curation, run sync.
- Cross-check a 2nd source (LiteLLM JSON) and **fail loud on a >X% price delta** so a bad upstream number can't land silently.

### 3. Code selects by slot / tier / capability — never by id

- No literal model ids in app code. Use `getRoutingSlotModel('coding_premium')`, `requireProviderDefaultModel('openai')`, or capability queries ("cheapest model in tier T with `supports_vision`"). Adding/removing a model touches the catalog only.
- (Already done for the `@agiworkforce/types` tests in this branch — they now assert against the slot resolver, not literals.)

### 4. CI lint forbids hardcoded model-id literals

- Widen `check-no-hardcoded-models.sh` + the ESLint rule from the narrow ghost-model gate to **any** provider id pattern, allowlisting `models.json`, the curation file, and tests. A hardcoded id can then never sneak back.

### 5. (Optional, maximal automation) runtime hot-reload / gateway discovery

- Extend the CLI's 4-tier cascade to all surfaces, or for managed-cloud route through a gateway's `/v1/models` for fully-dynamic discovery (zero local catalog, à la Vercel).

## One caveat: benchmarks aren't in models.dev

You route on **benchmarks + cost**. `models.dev`/LiteLLM carry **cost + context + capabilities** but **not benchmark scores**. So:

- **Cost / context / cache / modalities** → auto-synced (step 2). Zero maintenance.
- **Benchmarks** → keep a tiny `benchmarks` block in the curation overlay (changes rarely, ~once per model), **or** source from a benchmarks aggregator (e.g. Artificial Analysis) in the same sync. Recommend the overlay first (simple, no extra dependency).

## End state

- **Add a model:** 1 line in `models.curation.json` → `pnpm sync:models`. Price/context/caps filled from upstream.
- **Prices:** never drift — weekly cron re-syncs (auto-fixes drift like `deepseek-v4-pro`).
- **Code:** references slots/capabilities; a model swap touches no `.ts`/`.rs` files.
- **Guardrail:** CI fails on any hardcoded model id.
