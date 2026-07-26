# Volume 08 — Model Layer

Status: Canonical (expands `docs/spec/AGI_CODE_MASTER_SPEC.md` Vol 8)
Authority: `packages/ai/model-registry/`, `packages/ai/routing/src/auto.ts`; `packages/contracts/types/src/models.json` and `model-catalog.ts` are migration compatibility surfaces

## Philosophy & Cloud/Local stance

The model registry is the single source of truth for model identity, provider routes, intrinsic modalities, lifecycle, limits, pricing, benchmarks, evidence, harness support, and Auto policy. Every surface must consume generated registry artifacts—never training-data memory or a private model list. Provider-native support and AGI implementation status are separate fields: a model accepting tools does not prove that web search, MCP, memory, code execution, or computer use is wired in a given AGI harness.

Cloud/Local stance: auto-routing tiers (`auto`, `auto-economy`, `auto-balanced`, `auto-premium`) are `managed_cloud` constructs that pick the best concrete model for a task within cost/latency targets. They apply to Managed. In **BYOK**, the user's selected model is respected within the BYOK boundary; routing never silently swaps to a different provider. In **Local**, model selection is constrained to locally available runtimes (Vol 6 tier ladder); the layer must surface install/upgrade guidance rather than escalate to cloud. Routing must explain its choice and never cross a trust boundary (Vol 3, Vol 6).

A real, honest gap to record: the registry currently has chat/code/reasoning/image/multimodal/search/stt/tts/video model types but **no embedding, reranker, or dedicated safety/moderation model entries**. Treat embeddings/rerankers/moderation as a tracked registry gap (Vol 35), not an implied capability.

## Binding rules

1. **Read every model ID from the generated registry.** `packages/contracts/types/src/models.json` remains generated only for unmigrated consumers. Never invent, guess, or hardcode an ID.
2. **Separate capability layers.** Intrinsic input/output modalities belong in `registry.capabilities`; web search, memory, MCP, tool discovery, sandbox execution, and computer use belong in `registry.harnesses`. A route is eligible only when both layers and its trust mode pass.
3. **Auto-routing reads `catalog/routing-policies.json` through `resolveAutoRoute`.** Auto aliases are policies, never models. Task→slot and slot→model assignments must not be recreated in an application.
4. **Default casual traffic to economy.** Route simple/quick tasks to `auto-economy`/fast-tier models for cost/latency (Vol 31).
5. **Respect the user-preferred model within the active trust boundary.** Routing may optimize, but never cross Local/BYOK/Managed silently.
6. **Honor tokenizer drift only when declared.** Re-baseline cost/latency using `tokenizerDriftFactor`/`ESTIMATE_INFLATION`; never carry a predecessor's drift factor onto a replacement model without verified metadata.
7. **Honor deprecation/promo metadata.** Use `isDeprecated`/`isPromoExpired` and `effectiveInputPrice`/`effectiveOutputPrice`; never serve a deprecated ID as current.
8. **Embeddings/rerankers/moderation are registry-gated.** No such capability is assumed until it has a registry entry and an implemented harness.

## Repository map

- `packages/ai/model-registry/catalog/models.curation.json` — curated identity, lifecycle, provider data, and evidence-backed overrides.
- `packages/ai/model-registry/catalog/models.synced.json` — upstream-derived model facts.
- `packages/ai/model-registry/catalog/harnesses.json` — API families, adapters, trust modes, and provider-support versus implementation truth.
- `packages/ai/model-registry/catalog/routing-policies.json` — Auto aliases, profiles, task requirements, continuity policy, and slots.
- `packages/ai/model-registry/schema/registry.schema.json` — normalized machine contract.
- `packages/ai/model-registry/generated/registry.{json,ts}` — canonical TypeScript artifact.
- `crates/agiworkforce-protocol/src/generated/model_registry.{json,rs}` — identical Rust artifact.
- `packages/contracts/types/src/models.json` and `model-catalog.ts` — generated compatibility catalog and legacy accessors during migration.
- `packages/contracts/types/src/capabilities.ts`, `model.ts`, `customModel.ts` — capability + model contracts.
- `packages/ai/routing/src/` — `auto.ts` (registry-backed trust/capability resolver), `classify.ts` (heuristic task taxonomy), `indic.ts` (language gate), `pricing.ts` (compatibility pricing helpers), `index.ts` (public API).
- `packages/contracts/types/src/__tests__/model-catalog.test.ts` — catalog invariants.

## Competitor notes

- **OpenAI** absorbed the o-series into GPT-5 and runs a continuously-trained auto-router (Instant vs Thinking) plus the GPT-5.6 "name = capability tier" scheme to escape the point-release ladder (`docs/strategy/01` §3). AGI's `auto`/`auto-economy`/`auto-balanced`/`auto-premium` tiers are the neutral, multi-provider analogue.
- **Anthropic** ships pinned snapshot IDs and shipped a tokenizer change in Opus 4.7+ costing ~35% more tokens for the same text — a real cost gotcha (`docs/strategy/01` §2). AGI encodes this as `tokenizer_drift_factor` in the catalog and `ESTIMATE_INFLATION` in routing.
- **AGI divergence:** AGI routes _across labs_ by capability/cost/latency/health within a trust boundary — incumbents cannot, being single-lab. The auto tiers are an AGI differentiator (15 providers, one catalog, `docs/strategy/02` §2), not a copy of either router.

## Checklists

### Catalog change (build)

- [ ] New/changed model verified against the official provider doc (source URL + checked date in the verification log).
- [ ] `apiModelId` matches the provider's exact served ID.
- [ ] `capabilities` object reflects real support (no aspirational flags).
- [ ] `contextWindow`, costs, `qualityTier`, `released`, and `deprecation_date` set.
- [ ] Tokenizer-drift fields set where the family re-baselined.
- [ ] `model-catalog.test.ts` invariants pass; no duplicate/orphan IDs.

### Routing review

- [ ] Task→model selection calls `resolveAutoRoute`; no application-owned model table or slot map remains.
- [ ] Casual traffic defaults to economy/fast tier.
- [ ] Routing decision is explainable and surfaced to the user.
- [ ] Routing never swaps provider across a trust boundary (Local/BYOK/Managed).
- [ ] Tokenizer drift applied to cost/latency estimates (`ESTIMATE_INFLATION`).
- [ ] Deprecated/promo-expired IDs handled (`isDeprecated`/`isPromoExpired`, `effective*Price`).

### Capability-gating review

- [ ] Reasoning/effort controls shown only for `thinking`-capable models.
- [ ] Vision/audio/video input accepted only for capable models.
- [ ] Tools/computer-use/search/research/code-execution surfaced only when the route's harness feature is marked `implemented`, not merely provider-supported.
- [ ] Embeddings/reranker/moderation features hidden until a catalog entry exists (recorded as a Vol 35 gap).

### Per-surface

- [ ] Web/Desktop/Mobile model selectors render from catalog metadata (context, modalities, tools, reasoning, pricing).
- [ ] Local mode constrains selection to available runtimes; no silent cloud escalation.
- [ ] BYOK respects the user model within the BYOK boundary.

## Definition of Done

The model layer is production-ready only when every TypeScript and Rust consumer reads generated registry contracts; legacy pseudo-models and hardcoded slot maps have no live callers; capability and harness admission tests gate every feature; Auto decisions are explainable and boundary-respecting; tokenizer drift and deprecation/promo pricing are honored; provider contract tests prove every route; and missing capability classes are recorded rather than implied. The schema, generated artifacts, and shared resolver now exist, but application and Rust consumer migration is still in progress (`AUTO-ROUTER-MIGRATION-01`).

## Anti-patterns

- Hardcoding a model ID or capability from memory instead of reading the catalog.
- Reviving a per-application model table instead of registry policy.
- Treating Auto aliases as provider model IDs.
- Treating provider documentation as proof that an AGI harness feature is implemented.
- Showing reasoning/vision/tools UI for a model whose `capabilities` do not support them.
- Ignoring declared tokenizer drift and under-budgeting long-context model cost.
- Routing that silently changes provider across a trust boundary.
- Claiming embeddings/RAG-grade retrieval or moderation models that have no `models.json` entry.
- Serving a `deprecated` ID as if it were current.
