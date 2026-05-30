# Inventory Audit — TS LLM Runtime Slice

Slice: `packages/llm-runtime` + `packages/routing` + `packages/local-llm` + `packages/runtime`
Auditor: inventory recon (read-only)
Date: 2026-05-29
Method: anchor-doc read → systematic Grep (panic/TODO/security/egress) → targeted Read of every non-test module → consumer/alive-dead grep → type-existence verification. Builds NOT run (forbidden); tests NOT executed.

---

## Verdict (TL;DR)

This is **the strongest TS slice I have audited in this repo**: ~6,743 LOC of production source across 43 non-test files, ~491 declared test cases (counted, not executed), **zero `as any`, zero non-null assertions, zero `TODO/FIXME/HACK`, zero `eval`/`exec`/`spawn`, zero hardcoded secrets** in production code. Every imported `@agiworkforce/types` symbol resolves (no hallucinated APIs). All four packages are ALIVE and heavily consumed by shipping surfaces.

The material findings are narrow:

1. **`buildFallbackChain` (llm-runtime/src/fallback.ts) is a DEAD/ORPHAN export** — zero non-test callers. It is also the ONE module that, *if* wired, would emit cloud/`managed_cloud` fallback targets for a Local (`ollama`/`lmstudio`) source model **with no trust-tier gate** — a latent PRIVACY-01 (silent Local→cloud) landmine. Today it is not a live hole because nothing calls it. This mirrors the already-deleted dead `three-tier-router`. (P1)
2. **Local inference cannot be cancelled on tier2/tier3** — tier2 exposes `interrupt()` but never calls it; tier3 has a `const aborted = false` that can never flip. "Stop generation" is a no-op on the two downloadable-model tiers. Mobile is the lead surface. (P2)
3. Minor: JWT in `localStorage` + central `accessToken` state (P2/P3), stale `command.ts` docstring (P3), tier2/tier3 + command/desktop-command code duplication (P3), offline-sync stale-`queuedCount` race (P3).

---

## Purpose & Architecture

| Package | Purpose | Entry | Runtime target |
| --- | --- | --- | --- |
| `@agiworkforce/llm-runtime` | Cross-provider execution infra: error classifier (16 branches), retry generator w/ sticky `RetryContext`, stream idle watchdog, latched session headers, gateway fingerprint, fallback chain, message-history repair. | `src/index.ts` | Server (api-gateway), web routes, Tauri, all provider adapters |
| `@agiworkforce/routing` | Pure heuristic task classifier, Indic-script detector, pricing/promo/deprecation/tokenizer-drift helpers over `models.json`. Zero side effects. | `src/index.ts` | Universal (web/desktop) |
| `@agiworkforce/local-llm` | On-device tiered inference (Tier1 = Apple FM / Gemini Nano AICore; Tier2 = react-native-executorch; Tier3 = llama.rn). On-device model catalog. | `src/index.ts` | Mobile (react-native) only |
| `@agiworkforce/runtime` | Runtime env detect, capability-aware command dispatch (cloud/desktop-preferred/desktop-only tiers), event bus, central `createStore` + `onChangeAppState` fan-out choke-point, priority send queue, offline queue + sync. | `src/index.ts` (universal), `src/node.ts` (node-only AsyncLocalStorage), `src/desktop-index.ts` (Tauri static-invoke) | Web / desktop / mobile / extensions / packages/api |

Architecture is clean and well-documented; nearly every module carries a research-citation header (`tasks/research/deep/m8-services-api.md`, gap-matrix docs, Anthropic reference line refs).

---

## Alive vs Dead

All four packages are imported by shipping surfaces (verified via consumer grep):

- **llm-runtime** → consumed by `packages/providers/{anthropic,openai,google,deepseek,lmstudio,ollama,perplexity,xai}` and `services/api-gateway/src/routes/providerStream.ts`. ALIVE.
- **routing** → `apps/desktop/src/lib/modelRouter.ts`, `apps/web/app/api/llm/v1/chat/completions/lib/request-processor.ts`. ALIVE.
- **local-llm** → ~17 files in `apps/mobile` (onboarding, model-picker, performance, vision, chat stores). ALIVE.
- **runtime** → `apps/{web,desktop,mobile,extension,extension-vscode}`, `packages/api` (50+ files), `packages/unified-chat`, `packages/stores`. ALIVE.

### Dead / orphan EXPORTS within live packages

- **`buildFallbackChain`** + `FallbackStrategy` + `FallbackChainOptions` (`packages/llm-runtime/src/fallback.ts:62`): **ZERO non-test callers.** Only references are the index re-export (`index.ts:73`) and `__tests__/fallback.test.ts`. The live fallback path in shipping code (`apps/web/app/api/llm/v1/chat/completions/lib/request-processor.ts:779`, `apps/web/app/api/llm/completion/route.ts:286`) uses `getEconomyFallbackModels()` + a local `findCheaperFallbackModel` instead. `fallback.ts` is well-built and well-tested but unwired — same failure mode as the deleted `three-tier-router` (see `known-flaws.md`-adjacent history and `routing/src/index.ts:11` note). See P1 below for the trust-boundary implication.

No other dead modules found — every other exported symbol traces to a live consumer.

---

## Test Coverage

Counted (NOT executed — builds forbidden) `it(`/`test(` declarations:

| Package | Test files | Declared cases | Non-test src files |
| --- | --- | --- | --- |
| llm-runtime | 8 | 102 | 9 |
| routing | 2 | 220 | 5 |
| local-llm | 2 | 26 | 8 |
| runtime | 7 | 143 | 21 |

Caveat (honesty): these are declaration counts, not measured line/branch coverage, and were not run. Distribution is uneven: routing classify/pricing are very heavily tested; local-llm has the thinnest ratio (26 cases for tier selection + 3 native-bridge tiers — tier1/tier2/tier3 native paths are hard to unit-test in Node and appear lightly covered). `fallback.ts` has tests (8 cases) but is dead in production. `headers.ts`, `watchdog.ts`, `errors.ts`, `retry.ts`, `history.ts` each have dedicated test files.

---

## Panic / Crash sites

38 `throw new` sites in production source. Categorized by reachability:

- **Genuine invariants (not common-path crashes):**
  - `local-llm/src/catalog.ts:179` `getDefaultModel()` throws "catalog is corrupted" if no `role:'default'` model. Currently unreachable (qwen3-4b has `role:'default'`); becomes reachable only if the hardcoded catalog is edited to remove the default. Acceptable invariant.
  - `llm-runtime/src/retry.ts:307` final `throw` documented as unreachable terminus for TS flow analysis.
- **Expected user-facing error surfaces (caught upstream / surfaced as UI banners):**
  - `local-llm/src/selector.ts:37,57,122,155,158` — thermal-throttle and "no local runtime / download a model or add a cloud key" errors. These are the trust-boundary-correct behavior: when local can't run, it tells the user to act — it does NOT silently route to cloud.
  - tier1/tier2/tier3 "native module not available" / "not installed" throws — expected on unsupported platforms.
  - `runtime/src/command.ts` / `desktop-command.ts` — `DesktopRequiredError` for desktop-only commands in web; test-mode throws.
  - `runtime/src/queue/messageQueueManager.ts` — `QueueFullError` / `QueueDequeueRaceError` (race-defended, see audit-fix comments at lines 286-339).
  - `runtime/src/offline-queue/index.ts:166,184` — input validation throws.

No `panic`/`unwrap`/`expect`/`todo!`/`unimplemented!` — those are Rust idioms; this is a TS slice. No crash-on-common-path found.

---

## TODO / FIXME / HACK

**Zero** TODO/FIXME/HACK/XXX/`unimplemented`/"not implemented" in production source across all four packages. (Grep clean.)

Two "VERIFICATION REQUIRED" prose notes in `local-llm/src/catalog.ts:9-12,54-57` flag Qwen2.5-VL-3B license uncertainty (Apache-2.0 vs Qwen License) as a Wave-0 action item. These are honest forward-looking notes, not code debt — but the model `qwen2.5-vl-3b-instruct` has `shipsInV1: true` while its license string is literally `'Apache-2.0 (verify checkpoint — see Wave 0 action item)'`, so a license-unverified model is currently marked shippable (P3 — product/legal, not code correctness).

---

## Security-sensitive code

Clean overall. No `eval`, no `new Function`, no `child_process`/`spawn`/`exec`, no shell-out, no hardcoded keys/tokens. Network egress is confined and explicit.

Concrete notes:

1. **JWT in `localStorage`** — `runtime/src/http.ts:24-27` reads the auth token from `window.localStorage.getItem('agi-auth-token')` and sends it as `Authorization: Bearer`. localStorage is XSS-readable. Combined with `AppStateStore.ts:47` holding `accessToken: string | null` in central app state, the JWT lives in two JS-readable places. This is a known web-transport tradeoff, not unique to this slice, but worth flagging. (P2)
2. **`routeToCloud` egress** (`http.ts:34-65`) — single explicit POST to the configured API gateway (`NEXT_PUBLIC_API_URL` → `<meta api-base-url>` → `http://localhost:3001/api`). Only fires for `cloud`/`desktop-preferred` capability tiers via `command()`; `desktop-only` throws instead. Trust-boundary correct — no silent local-to-cloud.
3. **`Math.random` for IDs** — `offline-queue/index.ts:99-103`, `queue/messageQueueManager.ts:88-93` — explicitly annotated as non-security local IDs (queue uses `crypto.randomUUID()` when available, RNG fallback only). Correctly NOT a finding (calibration false-positive class).
4. **localStorage queue rehydration** (`messageQueueManager.ts:443-477`, `createKvStorageAdapter:490`) — JSON.parse of persisted queue with a minimal shape-validation filter (id+mode string check). Defensive enough for local data; not a deserialization-of-untrusted-input vector.
5. **ReDoS** — `errors.ts:246` `CONTEXT_OVERFLOW_REGEX` and `classify.ts:75` `RE_CREATIVE_WRITING` both carry `AUDIT-FIX` comments bounding wildcard/whitespace/digit runs (alert-448/457/458). Already hardened.

---

## AI-slop

Very little. The code is consistent, named-export disciplined, and citation-heavy. The few items:

1. **Code duplication: `command.ts` vs `desktop-command.ts`** (`runtime/src/`) — near-identical dispatchers; the only difference is dynamic `import('@tauri-apps/api/core')` (universal) vs static top-level `import { invoke }` (desktop bundle, re-exported by `desktop-index.ts:3`). Intentional bundle-split, but the bodies drift independently. (P3 — dedup risk)
2. **Code duplication: tier2 vs tier3 generate/load/release** (`local-llm/src/tier2.ts`, `tier3.ts`) — same module-singleton load/cache/release pattern copy-pasted. Acceptable given different native module shapes, but a shared helper would reduce drift. (P3)
3. **Stale docstring** — `command.ts:1-9` header says "Returns mock data in test environments" but the body (line 42-46) THROWS in test mode. `registry.ts` doc is accurate. (P3)
4. **`history.ts:191-217` `buildSyntheticToolResultMessage`** — a long, slightly meandering comment block debating OpenAI multi-orphan shape; the implementation is correct but the comment reads like an unresolved internal monologue. Cosmetic. (P3)
5. **`fallback.ts` index docstring drift** — `index.ts` once referenced `getAllowedModelsForTier` in prose; `fallback.ts` actually imports `getEconomyFallbackModels`/`getModelMetadataById`/`getModelsForProvider` (all verified to exist). No hallucinated API, just doc/code name drift. (P3)

No fabricated/hardcoded data rendered to users in non-test paths. The `local-llm/catalog.ts` hardcoded on-device model list is the legitimate canonical SSOT for on-device models (distinct from the cloud `models.json` rule, which it does not violate).

---

## Broken / half-built features

1. **`buildFallbackChain` unwired** (`fallback.ts:62`) — full feature, tested, never called from shipping code. See Alive/Dead + P1.
2. **Local generation cannot be cancelled (tier2 + tier3)** — `tier2.ts:24` declares `interrupt: () => void` on the module interface but `tier2Generate` (line 89) never calls it and always returns `aborted: false` (line 116-117). `tier3.ts:66` declares `const aborted = false` then checks `if (!aborted)` in the onToken closure (line 69) — the flag can never change, so the guard is dead and `tier3Generate` always returns `aborted: false` (line 72-73). Only Tier 1 honors a real abort signal (native `event.aborted`, `tier1.ts:16,33`). Net: pressing "stop" during on-device generation on the two downloadable tiers does nothing. Mobile is the lead surface. (P2)
3. **Offline-sync stale `queuedCount` edge** (`offline-sync/index.ts:243-254`) — `triggerSync()` early-returns when `managerState.queuedCount === 0`. `queuedCount` is only refreshed via `updateQueuedCount()` on the queue-change subscription, but `offline-queue/index.ts:54-55` documents that the DEFAULT `onStorageChange` is a no-op for in-process mutators. If a surface enqueues a message offline without wiring `onStorageChange`, then comes online, `handleOnline()→triggerSync()` may see a stale `0` and skip the sync until `initialize()`/another event refreshes the count. Reliability edge, surface-config-dependent. (P3)

---

## Severity-ranked issues

### P1
- **`buildFallbackChain` is dead AND a latent Local→cloud trust-boundary hole if revived** — `packages/llm-runtime/src/fallback.ts:107` (`economyTierFallback`) filters only by `exclude`/`requireTools`; `:125-148` (`crossProviderFallback`) iterates a provider list that mixes `managed_cloud`, `ollama`, `lmstudio` with cloud/BYOK providers and emits the highest-quality option from each OTHER provider. Nothing in the module gates the source model's trust tier. For a Local current model (`ollama`/`lmstudio`), the chain would include `managed_cloud`/`anthropic`/etc. with no consent/disclosure — exactly the PRIVACY-01 silent Local→cloud route the locks forbid. It is NOT a live hole today (zero non-test callers; live fallback uses a different, credit-gated, web-only path). Fix hint: either delete the dead export (consistent with the prior three-tier-router removal) OR, before any caller is added, add an explicit trust-tier gate so a Local/BYOK source can never silently produce a `managed_cloud`/cloud fallback target, and require the explicit-fork consent path. Add a test asserting `buildFallbackChain('ollama-*', 'cross-provider')` excludes cloud providers.

### P2
- **Local inference uncancellable on tier2/tier3** — `packages/local-llm/src/tier2.ts:89-117` (never calls `interrupt()`), `packages/local-llm/src/tier3.ts:66-73` (`const aborted = false` dead guard). Fix hint: thread an `AbortSignal` through `GenerateOptions`; call `instance.interrupt()` (tier2) and the llama.rn context's stop/release (tier3) on abort; set `aborted` truthfully in `onDone`/`GenerateResult`.
- **JWT in `localStorage` + central state** — `packages/runtime/src/http.ts:24-27`, `packages/runtime/src/state/AppStateStore.ts:47`. XSS-readable token. Fix hint: prefer httpOnly cookie or in-memory-only token for the gateway transport; if localStorage is required, document the threat model and pair with strict CSP.

### P3
- License-unverified model marked shippable — `packages/local-llm/src/catalog.ts:54-59` (`qwen2.5-vl-3b-instruct`, `shipsInV1: true`, license string literally says "verify checkpoint"). Fix hint: gate `shipsInV1` on a verified license, or flip to `false` until Wave-0 verification lands.
- `command.ts` vs `desktop-command.ts` duplication — `packages/runtime/src/`. Fix hint: extract shared dispatch core, parameterize the invoke loader.
- tier2/tier3 load/generate/release duplication — `packages/local-llm/src/tier2.ts`, `tier3.ts`.
- Stale `command.ts:1-9` docstring ("returns mock data" — actually throws).
- Offline-sync stale `queuedCount` early-return edge — `packages/runtime/src/offline-sync/index.ts:248`.
- Doc/code name drift in `fallback.ts`/`index.ts` helper names.

### P0
- None.

---

## Open questions / uncertainty

1. **Was `buildFallbackChain` ever wired, or built ahead of a caller?** Given the deleted `three-tier-router` precedent, this looks like a second speculative router. Confirm with git history / the chat-orchestration layer owner whether a caller is planned. If not, it should be deleted, not kept as a tested-but-dead export.
2. **Tests not executed** — all coverage figures are declaration counts. Actual pass/fail and branch coverage are unverified (builds forbidden). local-llm native tiers are the lowest-confidence area.
3. **`onChangeAppState` channels vs persistence** — `AppStateStore.ts:19-26` calls full persistence "deferred to follow-on task"; `registerPersistenceHandler` is the only wiring point. I did not verify which surfaces actually register a handler, so whether settings/planTier persistence is live per-surface is unconfirmed (out of slice).
4. **Files read but not line-by-line deep-read:** `runtime/src/errors.ts`, `routing/src/types.ts`, `local-llm/src/types.ts`, `runtime/src/state/createStore.ts` (read fully), `runtime/src/desktop-index.ts` (grep-confirmed). I read `AppStateStore.ts` fully on a second pass for the security section. No surprises in the grep-only files (pure type/error-class definitions).
5. **`fallback.ts` provider list hardcodes 13 provider names** (`fallback.ts:134-148`) — not model IDs (allowed), but a static provider enumeration that could drift from the catalog's provider set. Low risk while dead; would need a catalog-derived list if revived.
