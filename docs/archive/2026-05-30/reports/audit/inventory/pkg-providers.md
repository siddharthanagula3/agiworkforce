# Inventory Audit — `packages/providers/*` (TS provider adapters)

Auditor slice: TS provider adapters. Paths covered: `packages/providers/**` (all 8 leaf adapters + package READMEs/AGENTS). RECON, read-only.
Date: 2026-05-29. Method: anchor docs read first, systematic Grep signal collection, targeted Read of every non-test source module, reachability checks into `services/`/`apps/`/`packages/`.

Anchor docs read: `docs/current/byok-open-model-provider-strategy.md`, `docs/current/provider-capability-matrix.md`. Their claims (xAI/DeepSeek/Perplexity/LMStudio are planned/claimable providers; OpenAI-compatible routes use Chat Completions; header-only key transport; privacy defaults) are consistent with the code, with the caveat noted below that 4 of those claimed providers are not yet wired into the running gateway.

## Purpose & Architecture

`packages/providers` holds 8 provider leaf packages, each implementing the shared `ProviderAdapter` contract from `@agiworkforce/types` (an async `stream(req, signal): AsyncIterable<StreamChunk>` plus `catalog()` and optional `buildReplayPolicy()`). Adapters translate AGI's canonical `ChatRequest`/`StreamChunk` to/from each vendor wire and map errors via shared `@agiworkforce/llm-runtime` (`classifyError`, `withStreamIdleWatchdog`, `parseRetryAfterFromError`). Payload policy (cache_control, store, service_tier, strict tools) is delegated to `@agiworkforce/llm-normalize`, not hand-rolled per adapter.

Two transport families:
- **SDK-backed**: anthropic (`@anthropic-ai/sdk`), openai (`openai` v6) — and the 4 OpenAI-compatible leaves (deepseek, xai, perplexity, lmstudio) that reuse `openai` SDK + re-export `@agiworkforce/providers-openai`'s `translateChatRequest`/`translateOpenAIStream`.
- **Raw fetch**: google (Gemini `generativelanguage` v1beta, SSE) and ollama (`/api/chat`, NDJSON) — no vendor SDK, hand-rolled stream parsers.

Catalogs: anthropic/openai/google/deepseek/xai/perplexity all derive their model list at module load by filtering `@agiworkforce/types`'s `modelsCatalogJson` by `provider===...` (compliant with the LOCKED "never hardcode model IDs" rule — `catalog.ts` files are pure projections of `models.json`). ollama and lmstudio have no static catalog — they query the running daemon (`/api/tags`, `/v1/models`) dynamically.

OpenAI adapter additionally implements a Responses API path (`/v1/responses`) gated by `shouldUseOpenAIResponsesApi()` (native-route + model-metadata capability check), with a separate translate (`translate-responses.ts`) and stream translator (`stream-responses.ts`), plus a Code-Interpreter container-file → `GeneratedFile`/`ArtifactManifest` adapter (`generated-files.ts`).

Note (per openai/src/index.ts docstring): the web app has a *separate* fetch-based provider layer at `apps/web/lib/llm-providers/openai.ts` (BaseLLMProvider contract) that does NOT import these packages. So "alive" below means "reachable from the api-gateway provider route," not "the only provider path in the product."

## Alive vs Dead

Reachability traced end-to-end:
`apps`/web has its own layer → these packages are consumed only by `services/api-gateway`.
- `services/api-gateway/src/lib/providerAdapters.ts` imports and wires exactly 4: **anthropic, openai, ollama, google** (`ProviderId = 'anthropic' | 'openai' | 'ollama' | 'google'`, line 22).
- `providerAdapters.ts` is consumed by `services/api-gateway/src/routes/providerStream.ts` (`buildProviderAdapter`, `listProviderAvailability`, `isSupportedProviderId`), which is mounted as `app.use('/api/v1/providers', providerStreamRouter)` in `services/api-gateway/src/index.ts:127` — a real Express app (helmet, CSRF, content-type validation) with `start`/`dev`/`build` scripts and a built `dist/`. **The edge is live, not a stub.**

| Adapter | Status | Evidence |
|---|---|---|
| anthropic | ALIVE | wired in `providerAdapters.ts:73`, route mounted |
| openai | ALIVE | wired `:88` |
| ollama | ALIVE | wired `:98` |
| google | ALIVE | wired `:107` |
| **deepseek** | **DEAD / orphaned** | zero importers outside its own package (grep across apps/services/packages = no match) |
| **xai** | **DEAD / orphaned** | same — no external consumer |
| **perplexity** | **DEAD / orphaned** | same |
| **lmstudio** | **DEAD / orphaned** | same |

The 4 orphaned leaves are fully built, typecheck-clean, export factories, and (mostly) have tests, but are not in any shipping import closure. The provider-strategy doc lists xAI/DeepSeek/Perplexity/LM Studio as intended providers (lines 17, 56, 195), so the most likely reading is **built ahead of gateway registration**, not abandoned slop. That is an inference from the strategy doc, not a proven fact. Wiring them in is a 4-line `ProviderId` union + switch extension in `providerAdapters.ts`.

Within each orphaned package, all modules are internally reachable from `index.ts` (no dead sub-modules detected). lmstudio additionally exports `lmstudioAdapterFactory` and `LMSTUDIO_DEFAULT_BASE_URL_VALUE`; the package compiles but ships nowhere.

## Test Coverage

Inferred from test-file presence and case counts only — tests were NOT executed (per RECON constraints). Per-file `it()/test()` counts:

| Package | Unit cases | Files | Stream-translation tested? |
|---|---|---|---|
| openai | 35 (+2 live) | catalog(4), retry-after(14), translate-responses(7), generated-files(4), responses-routing(6) | Responses translate yes; **Chat Completions `translateOpenAIStream` — NO direct test** |
| anthropic | 21 (+2 live) | catalog(4), retry-after(14), stream-truncation(3) | truncation tail yes; happy-path event mapping thin |
| ollama | 11 (+2 live) | stream-truncation(3), tool-result-split(6) | yes (truncation + tool-result) |
| google | 10 | catalog(3), api-key-header(3), tool-result-name(4) | **NO stream-parse test** (sentinel/SSE-frame logic untested) |
| xai | 7 | catalog(4), adapter(3) | no |
| deepseek | 3 | catalog(3) | no |
| perplexity | 3 | catalog(3) | no |
| lmstudio | **0** | none | none |

Gaps that matter: (1) the most-used stream path in the product — OpenAI Chat Completions `translateOpenAIStream` (also reused by all 4 OpenAI-compatible leaves) — has no dedicated translation test; (2) google's hand-rolled SSE frame parser + `PARSE_ERROR_SENTINEL` is untested; (3) perplexity's `withCitationFooter` (the only non-trivial leaf-specific logic, with a documented prior crash, see P2 below) is untested; (4) lmstudio has zero tests. `retry-after.test.ts` in anthropic/openai is testing a re-exported shared shim (`retry-after.ts` is now a 1-line re-export from `@agiworkforce/llm-runtime`), so those 28 cases over-state adapter-specific coverage.

Live tests (`*.live.test.ts`) are correctly opt-in (gated behind `AGIWORKFORCE_LIVE_TEST` per package README/AGENTS contract).

Modules NOT exhaustively line-read (scoped honestly): `openai/src/types.ts`, `google/src/types.ts` were sampled, not fully read; `ollama/src/types.ts` was read for wire-field shape. `responses-types.ts` was read and is clean. No hallucinated wire fields found in what was read, but I did not exhaustively verify every field in the two `types.ts` files against live vendor specs.

## Panic / Crash Sites

No Rust here. TS `throw` sites in non-test source — only 5 total, all on invariant/config-error paths, none on the streaming hot path:

- `google/src/index.ts:73` — `throw new Error('Google Vertex AI / gcp-adc adapter is not implemented yet…')`. Fail-fast guard when caller passes `authMethod:'gcp-adc'` or `useVertex:true`. Correct fail-closed; the catalog only advertises the api-key method so normal callers never hit it. (Genuine "not implemented" boundary, not a user-reachable crash.)
- `openai/src/generated-files.ts:163,169,172` — privacy/storage-scope invariant guards (`providerMode`↔`privacyMode` mismatch; BYOK must use `direct_byok_provider`; managed must use `managed_compute`). These are fail-closed security invariants on a trust boundary; throwing on mismatch is correct. Caller-supplied programmer errors, not stream input.
- `openai/src/generated-files.ts:192` — `Missing materialized file metadata for OpenAI file …`. Thrown when a citation references a file the caller did not materialize. Caller-contract violation; correct.

**Unguarded `await res.json()` (real, minor crash path)**: `google/src/catalog.ts:84`. The surrounding `try` wraps only the `fetch` call; `if (!res.ok) return curated`, then `const json = (await res.json()) as ListModelsResponse` runs unguarded. A 200 response with a malformed/non-JSON body throws, and the throw propagates out of `fetchGoogleCatalog` → out of `adapter.catalog()` (`google/src/index.ts:92` does `return fetchGoogleCatalog(...)` with no try/catch). This is a catalog-listing path, not the chat stream, so it degrades model discovery rather than a chat turn — P2. Fix: wrap the json parse and fall back to `GOOGLE_MODEL_CATALOG`.

Stream paths are robust: every adapter's `stream()` wraps SDK/fetch+iteration in try/catch and yields a structured `{type:'error'}` + `{type:'stop', reason:'error'}` instead of throwing into the consumer. Hand-rolled parsers (google, ollama) catch `JSON.parse` failures and emit a sentinel instead of throwing. Stream translators (`translateOpenAIStream`, `translateAnthropicStream`, `translateOllamaStream`) have `if (!stopEmitted)` tails / `finally` blocks so truncated streams still terminate the consumer loop. `translateOpenAIResponsesStream` and `translateGeminiStream` lack a try/finally but their `if (!stopEmitted)` / unconditional trailing `stop` tail covers normal exhaustion, and the caller's try/catch covers a mid-iteration throw.

## TODO / FIXME / HACK

No `TODO`/`FIXME`/`HACK`/`XXX`/`@ts-ignore`/`unimplemented` markers in source. The only "not implemented" string is the intentional Vertex fail-fast (google/src/index.ts:74). Several `FIX (audit 2026-05-20, §8)` and `AUDIT-FIX:` comments document prior remediations (Vertex fail-fast, perplexity bounds-check, ReDoS-bounded trailing-slash strip, Gemini/Ollama parse sentinels) — these are healed-issue annotations, not open debt.

## Security-sensitive Code

API key handling — clean across all 8:
- SDK leaves pass `apiKey` only into the SDK constructor (`...(config.apiKey ? { apiKey } : {})`); never logged. **No `console.*` anywhere in source** (grep = 0 hits).
- google sends the key via the `x-goog-api-key` **header**, with an explicit comment (and prior audit fix) forbidding the `?key=` query-string form (`google/src/index.ts:111-127`, `catalog.ts:75`). Correct — avoids key leakage via access/proxy logs.
- ollama uses `Authorization: Bearer <key>` header, only when `config.apiKey` is set (`ollama/src/index.ts:89-91`).
- api-gateway sources keys from server-side env and never echoes them to the client (`providerAdapters.ts` docstring + `listProviderAvailability` returns booleans/reasons only).

Network egress / base URL: every adapter accepts a `baseUrl` override. For BYOK that is by design (LMStudio/Ollama LAN, regional Gemini, proxied deployments) — but it means a caller-supplied `baseUrl` receives the configured API key in headers. This is the intended BYOK trust model; the risk surface (validating/labeling user-supplied base URLs) lives in routing/UI, not here. P3 note for this slice.

Privacy/retention defaults: `responsesStore` defaults `false` (stateless) on the OpenAI Responses path; anthropic cache_control is opt-in via config. `generated-files.ts` enforces privacy↔providerMode↔storageScope invariants with fail-closed throws before any file metadata is surfaced — matches the capability-matrix enforcement rules. No managed-gateway defaults are baked into Local/BYOK leaves. Consistent with `provider-capability-matrix.md` enforcement rules.

`lmstudio/src/index.ts:59` hardcodes `apiKey: config.apiKey ?? 'lm-studio'` — a placeholder sent to a local server that "doesn't require auth but the SDK requires some key." Benign (local-only sentinel), documented; P3 at most.

## AI-slop

- **Duplicated thinking→effort mapping**: `thinkingBudgetToRequestedEffort` (`openai/src/translate.ts:200`) and `thinkingBudgetToEffort` (`openai/src/translate-responses.ts:179`) are byte-identical threshold ladders under two names. P3 dedup candidate.
- **Cross-adapter `stream()` boilerplate**: deepseek/xai/perplexity/lmstudio `stream()` + `catalog()` bodies are near-identical (detect-compat → translate → SDK create → watchdog → error chunk). This is consistent (good for review) but is copy-paste that a shared `createOpenAICompatibleAdapter(...)` helper would collapse. Not a bug; P3 maintainability note. (xai docstring claims "Grok 4 Fast 2M context / Grok 4.3 reasoning_content" — those are doc claims, not code, and capability metadata lives in models.json; not verified here.)
- **Ollama context-window heuristic** (`ollama/src/catalog.ts` `estimateContextWindow`): hardcoded family-substring → context-window map (llama3.x→128k, qwen→32k, default 8192). This is fabricated-ish metadata surfaced to users as a model's contextWindow, but it is documented as best-effort, only applies to dynamically-discovered local models with no authoritative source, and is user-overridable via `num_ctx`/env. Honest given Ollama exposes no per-model context via `/api/tags`. P3.
- `anthropic/src/stream.ts:21-25` `stopReasonMap` is a dead `{} as never` placeholder kept only "to silence unused while we keep the comment" — vestigial, harmless. P3 cleanup.
- No hallucinated SDK methods found: `sdk.messages.stream`, `sdk.responses.create`, `sdk.chat.completions.create`, `sdk.models.list` are all real for the pinned SDK versions (`@anthropic-ai/sdk ^0.91.1`, `openai ^6.38.0`). Responses wire types are hand-typed (decoupled from SDK churn) and matched the documented shape in what I read.

## Broken / Half-built Features

1. **4 orphaned adapters (deepseek, xai, perplexity, lmstudio)** — built, exported, (mostly) tested, but unreachable from any running surface. Not "broken" in the sense of crashing; "half-built feature" in the sense of a capability the product cannot use until `providerAdapters.ts` registers them. See Alive vs Dead.
2. **Google Vertex/gcp-adc** — advertised conceptually but explicitly unimplemented; correctly fail-fast (google/src/index.ts:69-78). Half-built but honestly gated, not silently broken.
3. **Ollama mid-stream parse-error sentinel premature-stop** (correctness wrinkle) — `PARSE_ERROR_SENTINEL` is `{ done: true, done_reason: 'stop' }` (`ollama/src/stream.ts:25`). In `translateOllamaStream` (`stream.ts:112-131`) the `chunk.done` branch emits `usage` + `stop` and sets `stopEmitted=true`, **but the `for await` loop does not break**. A malformed NDJSON line *in the middle* of a stream therefore emits a premature `stop` and then keeps yielding any subsequent valid content, ending with a second `stop`. A consumer that treats the first `stop` as terminal will truncate the message; one that doesn't will see content after stop. Google's sentinel (`finishReason:'STOP'`, empty parts, `google/src/stream.ts:32`) does NOT have this issue — it only updates `lastFinish` and the final `stop` is emitted once after the loop. P2.

## Severity-ranked Issues

**P0** — none. No ship-blocking crash, data-loss, or key-leak on a common path in this slice.

**P1**
- *(borderline / cross-slice)* Capability-vs-reality gap: `provider-capability-matrix.md` and the BYOK strategy doc present xAI/DeepSeek/Perplexity/LMStudio as supported providers, but the running gateway wires only anthropic/openai/ollama/google. If any surface advertises the 4 unwired providers as selectable, users hit "unsupported provider." This is logged as P1-risk but the advertising decision lives in routing/UI, outside `packages/providers` — see Open Questions. Within this slice the adapters themselves are fine.

**P2**
- `google/src/catalog.ts:84` — unguarded `await res.json()` on a 200 response; malformed body throws out of `adapter.catalog()` (no try around it at `index.ts:92`). Degrades model discovery. Fix: try/catch the parse, fall back to `GOOGLE_MODEL_CATALOG`.
- `ollama/src/stream.ts:25,112-131` — mid-stream parse-error sentinel emits a premature `stop` without breaking the loop; can truncate or double-terminate a message. Fix: distinguish a parse-failure sentinel from a real `done` (e.g. an `{type:'error'}` chunk or a sentinel that `break`s), or only treat the trailing sentinel as terminal.
- Test gaps: no direct test for `translateOpenAIStream` (the product's primary stream path, reused by 4 leaves); no test for google SSE parser/sentinel; no test for perplexity `withCitationFooter`; lmstudio has zero tests.

**P3**
- Duplicated `thinkingBudgetToEffort`/`thinkingBudgetToRequestedEffort` (openai translate vs translate-responses).
- 4 OpenAI-compatible leaves are copy-paste of one shape — extract a shared factory.
- `ollama/src/catalog.ts` heuristic context-window map (fabricated-but-documented metadata).
- `lmstudio/src/index.ts:59` `'lm-studio'` placeholder key (benign local sentinel).
- `anthropic/src/stream.ts:21-25` vestigial `stopReasonMap` dead placeholder.
- BYOK base-URL override carries the API key to a user-supplied host (by-design; validation belongs to routing/UI).

## Open Questions / Uncertainty

- **Are the 4 orphaned adapters intentionally pre-built or stalled?** The strategy doc lists them as planned; no tracked gap/issue link was found in this slice to confirm a registration date. Recommend the supervisor/routing auditor confirm intent and whether a surface already lists them.
- **Does any surface advertise unwired providers?** Out of this slice — needs the routing (`packages/routing`) and UI auditors to check the model/provider picker against `SUPPORTED_PROVIDER_IDS`.
- **Web provider layer divergence**: `apps/web/lib/llm-providers/openai.ts` is a second, independent OpenAI provider implementation (BaseLLMProvider). Whether it drifts from these adapters (model IDs, store defaults, error mapping) is a cross-slice consistency question.
- Tests were not executed and the two `types.ts` files (openai, google) were not exhaustively line-read against live vendor specs; field-level hallucination in those two files cannot be 100% ruled out, though nothing suspicious surfaced.
- The `withStreamIdleWatchdog` / `classifyError` / `parseRetryAfterFromError` behavior lives in `@agiworkforce/llm-runtime` (out of slice) — adapter robustness depends on that package behaving as documented (90s idle watchdog, structured classification). Not audited here.
