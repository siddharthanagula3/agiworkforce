# Volume 08 — Model Layer

Status: Canonical (expands `docs/spec/AGI_CODE_MASTER_SPEC.md` Vol 8)
Authority: `packages/types/src/models.json`, `packages/types/src/model-catalog.ts`, `packages/routing/`, `tasks/auto-routing-spec.md`

## Philosophy & Cloud/Local stance

The model layer is the single source of truth for _what a model can do and what it costs_. Every surface reads capabilities, context windows, pricing, and routing from the catalog — never from training-data memory (Operating Law 2). The catalog is the discipline incumbents enforce internally (pinned snapshot IDs, deprecation calendars, tokenizer-change handling, one `models.json` read by every surface — `docs/strategy/01` §4); AGI makes it a first-party, checked artifact.

Cloud/Local stance: auto-routing tiers (`auto`, `auto-economy`, `auto-balanced`, `auto-premium`) are `managed_cloud` constructs that pick the best concrete model for a task within cost/latency targets. They apply to Managed. In **BYOK**, the user's selected model is respected within the BYOK boundary; routing never silently swaps to a different provider. In **Local**, model selection is constrained to locally available runtimes (Vol 6 tier ladder); the layer must surface install/upgrade guidance rather than escalate to cloud. Routing must explain its choice and never cross a trust boundary (Vol 3, Vol 6).

A real, honest gap to record: the catalog currently has chat/code/reasoning/image/multimodal/search/stt/tts/video model types but **no embedding, reranker, or dedicated safety/moderation model entries**. Treat embeddings/rerankers/moderation as a tracked catalog gap (Vol 35), not an implied capability — do not claim RAG-grade embeddings or moderation models until they exist in `models.json` with capability metadata.

## Binding rules

1. **Read every model ID and capability from `models.json`** (Operating Law 2). Never invent, guess, or hardcode an ID.
2. **Capabilities gate features.** Expose reasoning/thinking, vision, audio, video, tools, computer use, search, research, code execution, and caching only when the model's `capabilities` object enables them.
3. **Auto-routing tiers map to the catalog slot/tier maps**, not a stale hardcoded table. The legacy `three-tier-router` is retired; task→model selection lives in the catalog tier maps + the auto ranker (`packages/routing/src/index.ts`).
4. **Default casual traffic to economy.** Route simple/quick tasks to `auto-economy`/fast-tier models for cost/latency (Vol 31).
5. **Respect the user-preferred model within the active trust boundary.** Routing may optimize, but never cross Local/BYOK/Managed silently.
6. **Honor tokenizer drift.** Re-baseline cost/latency using `tokenizerDriftFactor`/`ESTIMATE_INFLATION` (e.g., Claude Opus 4.8 inherits the Opus 4.7 tokenizer baseline: 1.0×–1.35× tokens for the same text).
7. **Honor deprecation/promo metadata.** Use `isDeprecated`/`isPromoExpired` and `effectiveInputPrice`/`effectiveOutputPrice`; never serve a deprecated ID as current.
8. **Embeddings/rerankers/moderation are catalog-gated.** No such capability is assumed until it has a `models.json` entry.

## Repository map

- `packages/types/src/models.json` — registry: per-model `id`, `apiModelId`, `provider`, `modelType`, `contextWindow`, `inputCost`/`outputCost`/`cached_input`, `capabilities` (streaming, tools, vision, json, thinking, computerUse, agentic, imageGen, videoGen, search, research, codeExecution, caching), `benchmarks`, `speed`, `quality`, `qualityTier` (fast/balanced/best/economy), `released`, `deprecation_date`, and tokenizer-drift fields.
- `packages/types/src/model-catalog.ts` — typed accessors incl. `requireProviderDefaultModel`; resolves provider defaults from the catalog (no scattered literals).
- `packages/types/src/models.curation.json`, `models.synced.json` — curation overlay and synced source.
- `packages/types/src/capabilities.ts`, `model.ts`, `customModel.ts` — capability + model contracts.
- `packages/routing/src/` — `classify.ts` (heuristic task taxonomy), `indic.ts` (language gate), `pricing.ts` (`effective*Price`, `tokenizerDriftFactor`, `ESTIMATE_INFLATION`, `isDeprecated`, `isPromoExpired`), `index.ts` (public API).
- `packages/types/src/__tests__/model-catalog.test.ts` — catalog invariants.

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

- [ ] Task→model selection reads catalog tier maps + the auto ranker, not a hardcoded table.
- [ ] Casual traffic defaults to economy/fast tier.
- [ ] Routing decision is explainable and surfaced to the user.
- [ ] Routing never swaps provider across a trust boundary (Local/BYOK/Managed).
- [ ] Tokenizer drift applied to cost/latency estimates (`ESTIMATE_INFLATION`).
- [ ] Deprecated/promo-expired IDs handled (`isDeprecated`/`isPromoExpired`, `effective*Price`).

### Capability-gating review

- [ ] Reasoning/effort controls shown only for `thinking`-capable models.
- [ ] Vision/audio/video input accepted only for capable models.
- [ ] Tools/computer-use/search/research/code-execution surfaced only when enabled.
- [ ] Embeddings/reranker/moderation features hidden until a catalog entry exists (recorded as a Vol 35 gap).

### Per-surface

- [ ] Web/Desktop/Mobile model selectors render from catalog metadata (context, modalities, tools, reasoning, pricing).
- [ ] Local mode constrains selection to available runtimes; no silent cloud escalation.
- [ ] BYOK respects the user model within the BYOK boundary.

## Definition of Done

The model layer is "production-ready" when: all IDs/capabilities flow from `models.json`/`model-catalog.ts`; capabilities gate every feature; auto-routing reads catalog tier maps with explainable, boundary-respecting decisions; tokenizer drift and deprecation/promo pricing are honored; casual traffic defaults to economy; catalog tests pass; and any missing capability class (embeddings/rerankers/moderation) is recorded as a tracked gap rather than implied.

## Anti-patterns

- Hardcoding a model ID or capability from memory instead of reading the catalog.
- Reviving a stale per-router model table instead of the catalog tier maps.
- Showing reasoning/vision/tools UI for a model whose `capabilities` do not support them.
- Ignoring tokenizer drift and under-budgeting Opus-4.8-class context/cost.
- Routing that silently changes provider across a trust boundary.
- Claiming embeddings/RAG-grade retrieval or moderation models that have no `models.json` entry.
- Serving a `deprecated` ID as if it were current.
