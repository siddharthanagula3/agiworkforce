# Model Catalog & Free-Tier Routing — informed by the LLM Architecture Gallery

Status: PROPOSED (plan only — no code changes). Plan-only per founder.
Owner: Platform
Last updated: 2026-05-30
Reference: Sebastian Raschka, "LLM Architecture Gallery" (pub. 2026-03-14) —
https://sebastianraschka.com/llm-architecture-gallery/ and
https://sebastianraschka.com/blog/2026/llm-architecture-gallery.html
(72 modern open-model architectures; diagrams + fact sheets + config.json/tech-report links).
NOTE: referenced WITHOUT the personal `mcp_token` in the original URL — that token is a credential; rotate it.

## Context

Founder chose: use the gallery to **inform model catalog / routing** (not to build a UI). The gallery is the
current, community-maintained map of which open-weight models exist in 2026 and _why their architecture makes
them cheap/fast/long-context_ — exactly the signal needed to (a) keep `packages/types/src/models.json` honest
and complete, and (b) pick the **founder-funded free-tier models** for the invite-gated cloud alpha (small
budget, hard caps; per the cloud-alpha decisions). The catalog is the locked SSOT — no hardcoded model IDs
anywhere else — so improving it improves every surface's routing at once.

## Verified ground truth (from repo, 2026-05-30)

- Catalog: `packages/types/src/models.json` (~66 model entries). Per-entry fields:
  `id, apiModelId, provider, displayName, contextWindow, maxOutput, pricing, capabilities, releaseStatus,
modelFamily, knowledgeCutoff, defaultFor, routeType, tierAccess`.
- Providers declared (24): anthropic, openai, google, xai, deepseek, qwen, moonshot, zhipu, mistral, **groq,
  cerebras, openrouter, together, fireworks, deepinfra**, cohere, ai21, sambanova, azure, bedrock, ollama,
  perplexity, meta, amazon. (Audit earlier flagged ~10 are provider-shells with **0 model entries** — gap.)
- Open-weight entries already present incl.: `gpt-oss-120b` (on groq), `deepseek-v4{,-flash,-pro}`,
  `deepseek-r1`, `qwen-3.6-plus`/`qwen-flash`, `kimi-k2.6`, `glm-5`, `mistral-large-3`,
  `gemini-3.1-flash-lite` (free-ish hosted), etc.
- Generation pipeline (per project memory): `models.json` is generated from `models.curation.json` +
  `models.synced.json` via `scripts/sync-models.mjs`. **→ Edits go to the curation source, not models.json directly.**
- Routing: `auto / auto-economy / auto-balanced / auto-premium` pseudo-IDs select a real model per tier
  (seen in desktop `QuickModelSelector`); economy tier is where free-tier picks live.
- (CONFIRM at execution — buffering blocked final reads): exact `tierAccess`/`routeType` vocab, and the precise
  file that maps `auto-economy` → concrete model (likely `packages/types/src/model-catalog.ts` + gateway
  routing in `services/api-gateway/src`).

## What the gallery changes about our thinking (architecture → routing policy)

The gallery's value is **architecture traits that predict cost/latency/context**, which should drive tiering:

1. **MoE (sparse) models are the free-tier sweet spot** — DeepSeek V3/V4, Qwen3-MoE, GLM-4.5/5, gpt-oss,
   Mistral Large 3: huge quality per active-param, so cheap/fast on Groq/Cerebras/DeepInfra free or low tiers.
   → prefer these for `auto-economy`.
2. **Sliding-window / linear-attention hybrids** (Gemma 3, Qwen3-Next, Kimi Linear, Mamba-2 hybrids) → cheap
   long-context. → tag for long-context economy routing.
3. **MLA (Multi-head Latent Attention)** (DeepSeek line) → small KV cache → cheaper long sessions → good for
   high-volume alpha chat.
4. **Small dense edge models** (Gemma 4 270M–4B, Phi-4-mini, Llama-3.2-1B/3B) → the **on-device/local-mode**
   picks for mobile/desktop local (ties to the local-first surface), NOT cloud free-tier.
   These map cleanly onto our existing `capabilities`/`contextWindow`/`pricing` fields + the auto tiers.

## Plan (when un-paused; all edits via curation source + sync, never hand-edit models.json)

### Wave A — Catalog audit vs gallery (read-only first)

1. Cross-check every gallery open model against `models.curation.json`: present? correct `apiModelId`,
   `contextWindow`, `pricing`, `releaseStatus`, `modelFamily`? Flag **missing** (e.g. gpt-oss-20b, Qwen3-Next,
   GLM-5 variants, Gemma 3/4, OLMo 3, Nemotron-3, Kimi Linear) and **stale** (wrong ctx/price).
2. Verify each candidate's real ID/price/context from the gallery's linked `config.json`/tech-report +
   the provider's live docs (web-search; do not trust training data) — same discipline as the existing
   `model-id-drift` audit. Output a drift table (add / fix / deprecate).
3. Confirm the ~10 empty provider-shells: either populate (if we'll route to them) or mark unsupported so the
   UI never offers an uninstallable provider.

### Wave B — Free-tier picks for the cloud alpha (founder-funded, capped)

4. Choose the `auto-economy` / free-alpha model set from **MoE + cheap-hosted** options that we actually hold
   keys for (~$5/provider budget): candidates — **Groq** `gpt-oss-120b` / Llama-3.3-70B; **Gemini**
   `gemini-3.1-flash-lite`; **DeepSeek** `deepseek-v4-flash`; **Cerebras** (if keyed) for speed. Tag them with a
   `freeTierEligible` curation flag (new) + per-model `tierAccess` including the alpha/free tier.
5. Define the routing policy: alpha free tier → economy MoE/flash models only; on cap-exhaustion → **upgrade to
   next plan** (per decision), not silent stop. Wire to the gateway's managed-compute path (reuse
   `managedComputeGate` + `credit-service` reservation; no new ledger).
6. Keep it honest: `releaseStatus` must reflect reality (preview vs GA); no model shown that we can't serve.

### Wave C — Propagate + verify (catalog is SSOT → every surface benefits)

7. Run `scripts/sync-models.mjs`; run `pnpm check:model-catalog` + `sync:models:check` (lock-drift gate) so all
   six surfaces pick up the new catalog without per-surface edits.
8. Light verify (per founder bar): typecheck + the model-catalog guardrail; founder UX-tests the model picker.

## Reuse (don't rebuild)

- `packages/types/src/model-catalog.ts` helpers (`getAllModels`, `getModelMetadata`, `requireProviderDefaultModel`).
- `scripts/sync-models.mjs` + `models.curation.json`/`models.synced.json` (the real edit surface).
- `services/api-gateway/src/middleware/managedComputeGate.ts` + `apps/web/lib/services/credit-service.ts` for
  free-tier metering (no new infra).
- Prior `docs/audit/2026-05-22-model-id-drift.md` methodology (now archived) for the verify approach.

## Guardrails

- **Never hardcode model IDs** outside the catalog (locked rule). All routing reads the catalog.
- Edit `models.curation.json` + sync; do **not** hand-edit generated `models.json`.
- Web-search/gallery-confirm every ID/price/context before adding (no training-data guesses; cutoff is stale).
- Plan-only now; this is a later wave that should run AFTER the cloud-alpha auth path the founder is wiring.

## Open questions for founder

1. Which providers do you actually hold free/cheap keys for right now (Groq? Gemini? DeepSeek? Cerebras?) —
   that set bounds the `auto-economy`/free-alpha picks.
2. Free-tier model UX: a single curated "Auto (free)" entry, or let alpha users pick among 2–3 free models?
3. Should the ~10 empty provider-shells be populated now, or hidden until needed?
