# OmniRoute learnings: cost reduction and free-inference techniques

Status: Current
Owner: Fable (architect)
Last updated: 2026-09-05

Read-only extraction from the local clone at `/Users/siddhartha/Desktop/omni-router`
(MIT licence, copyright 2026 diegosouzapw, upstream
`https://github.com/diegosouzapw/OmniRoute`). No OmniRoute file was modified,
built, or tested. Model families are referenced generically; no display name
or model ID from either catalog appears below.

## 1. Free model catalog

`open-sse/config/freeModelCatalog.ts:12-40` types each entry with `freeType`
(nine regimes: recurring-daily/monthly/credit/uncapped, one-time-initial,
keyless, discontinued), `poolKey`, a ToS verdict, and two hand-curated
booleans left `undefined` rather than defaulted true when unverified.
`FREE_REGIME_TRAITS` (`freeModelCatalog.ts:104-144`) exhaustively maps every
regime to a totals bucket, so a new regime will not compile until classified.
`dedupedSum` (`freeModelCatalog.ts:190-203`) sums by `poolKey` max, so many
models sharing one quota pool count once.

**Counting vs deciding** (`docs/reference/FREE_TIERS.md:52-66`): display can
read a live Radar feed overlay over the shipped baseline; deciding (`auto`
routing, model import) reads only the release-baked `FREE_MODEL_BUDGETS`
plus local heuristics, never the feed, so the answer matches server and
browser and stays testable offline. **ToS attention**:
`freeTierCatalog.ts:39-55` hand-lists 17 avoid/caution providers, and an
"avoid" verdict is still routed by default unless `excludeTosAvoid` is set.

**Our side**: `apps/web/config/free-pools.json` (2 entries) plus
`docs/research/free-inference-tos-workbook-2026-09-01.md:20-33` model a
stricter five-fact gate (`isFreeEligibilityValid`,
`packages/ai/routing/src/runtime-state.ts:227`, plus a separately-checked
`hardStopsBeforePaid` at `free-auto.ts:205`). Every entry ships
`verifiedAtMs: null`, ineligible by construction. No pool-dedup or
counting/deciding split exists yet because there is nothing to count.

**Verdict**: adapt. Pool-key dedup and the exhaustive regime-trait table are
pure data modeling with no ToS exposure; port the shape into
`packages/ai/routing`. Copy the counting/deciding split once we exceed 2
pools, a live-count overlay must never touch `isFreeEligibilityValid`.
Reject copying any "avoid"-verdict entry: our workbook already treats
`hardStopsBeforePaid` and proxying-forbidden as launch blockers.

## 2. Compression engines

`docs/compression/COMPRESSION_ENGINES.md` documents 8 modes over a shared
engine contract registered in
`open-sse/services/compression/engines/registry.ts`. Caveman (prose
condensation) publishes ~46% input savings; RTK (49 structured
command/tool-output filters under `engines/rtk/filters/`) publishes 60-90%;
the default `rtk -> caveman` stack compounds to 78-95%. CCR replaces
repeated large blocks with content-addressed hash references; `session-dedup`
elides text already seen earlier in the session. OmniGlyph profiles are a
**ceiling, not a floor**: `mergeCompressionProfileOptions` refuses a
per-step override that would reopen a lane the profile closed. A separate
MCP accessibility-tree filter (`engines/mcpAccessibility/index.ts`) collapses
repeated structural lines in browser/computer-use tool results (60-80%
savings), independent of the prompt path. Compression sits in
`open-sse/handlers/chatCore.ts:1319-1323`, ahead of dispatch, gated by an
exclusion list first.

**Our side**: no compression package exists. `.../tool-loop.ts:226-231` only
bounds tool-result history (`MAX_TOOL_RESULT_HISTORY_CHARS = 200_000`), and
`trimToolResultHistory` (`:997-1022`) blindly drops old tool results past a
`keepRecent` window rather than compressing them. Lossy deletion, not
compression.

**Verdict**: adopt, highest-leverage item here. Port RTK-style structured
filtering and an MCP tool-result collapse (pattern matching, license-clean
to reimplement from documented behavior). Adapt Caveman-style condensation
behind our own compaction path rather than a second system. Copy the
profile-as-ceiling invariant verbatim as a design rule.

## 3. Quota telemetry

`quotaPreflight.ts:35-58` types a `QuotaInfo` with canonical structural
windows (`window5h`, `window7d`, `windowWeekly`, `windowMonthly`) so a scorer
does not need each provider's own key naming. `quotaMonitor.ts:21-25` polls
adaptively: 60s normal, 15s above an 80% warn threshold, alerts deduped per
session over 5 minutes. Header mappings are bespoke per provider across
dozens of files; source priority is "registered provider fetcher, else
generic fallback" (`quotaMonitor.ts:14-16`).

**Our side**: `runtime-state-service.ts:56-71` meters only `requests` and
`tokens` from a settled turn, refusing to guess an unmeterable pool as
empty, and has no adaptive polling or per-provider header parsing because we
call no live provider quota endpoint yet.

**Verdict**: adapt selectively. Add the canonical structural-window shape
once we add a second metered unit or pool; adaptive polling waits until we
call upstream quota endpoints.

## 4. Resilience: three scopes

**Provider breaker** (`circuitBreaker.ts:98-118`): CLOSED to DEGRADED to
OPEN to HALF_OPEN, per-failure-kind thresholds, with carve-outs so a local
stream or execution error never trips a remote breaker. Three profiles
(`constants.ts:244-283`): `oauth` (8-failure threshold, 15-min window, 5-min
cooldown), `apikey` (12-failure, 30-min window, 10-min cooldown), `local`
(2-failure, 5-min window, 1-min cooldown). **Connection cooldown**
(`providerCooldownTracker.ts:1-9,33-46`): per-connection exponential backoff
plus a separate provider-wide window gate independent of any one
connection's state. **Model lockout**
(`modelLockoutSettings.ts:11-18`): triggered by `403/404/429/502/503/504`,
exponential from a 120s base to a 30-minute cap, 10 backoff steps, off by
default. Recovery is lazy everywhere, the next request past `resetAt` is
what transitions state.

**Our side**: `runtime-state-service.ts:44-46` has one flat scope
(`CIRCUIT_FAILURE_THRESHOLD = 3`, 30s to 10min backoff) for every credential
type, and `route-health-store.ts:60-70` defines a second, also
single-profile, route breaker; neither distinguishes local execution
failure from upstream. **Verdict**: adapt. Splitting by credential class
(OAuth-session vs static-key) is a real reliability win, a numeric-threshold
pattern, not literal code. Two profiles, not three: we have no
local-inference routing lane today.

## 5. Routing policy and combo strategies

`autoCombo/scoring.ts:52-79` scores each candidate on 15 weighted factors
(quota, health, inverse cost, inverse latency, task fit, stability, tier
priority/affinity, specificity, context/cache/session/reset-window affinity,
connection density, optional quality/reliability), weights sum to 1.0 and
are renormalized when user-supplied (`scoring.ts:84-94`). `combo.ts:1-6`
names 16 selectable strategies. The route preview contract is `POST
/api/omniroute/route/preview` (`route.ts:1-36`): a Zod-validated array of up
to 100 synthetic candidates is deterministically ranked and returned with
`liveRequestExecuted: false`, never calling upstream.

**Our side**: `auto.ts:838` (`rankRoutes`) admits then ranks by
registry-declared cost/health/capability, one strategy plus canary/shadow
routing (`:602-650`), not a configurable weighted model, and no preview
endpoint exists. **Verdict**: adapt the preview endpoint, a pure function
over synthetic candidates that closes a real debugging gap. Reject the
16-strategy surface: most exist to let an end user steer a personal proxy;
our routing is a platform decision, not a per-user dial.

## 6. Allocation pools

No `hard`/`soft`/`burst` pool taxonomy was found anywhere in OmniRoute
(searched engine, config, and every doc under `docs/`). The nearest real
mechanisms: pool-key dedup (item 1); `X-OmniRoute-Budget-Fallback:
strict|hard` vs `cheapest|soft` (`requestControls.ts:87-96`), a per-request
choice between blocking and falling back to the cheapest viable candidate;
and a three-level concurrency semaphore hierarchy, global/provider/account
(`accountSemaphore.ts:1-9`). Reporting this as unverified rather than
inventing a pool system absent from the source.

**Our side**: `auto.ts:1126-1128` (`isAffordable`) is a single hard gate
against `budgetRemainingCents`, no strict/cheapest distinction, no
concurrency hierarchy. **Verdict**: adapt the strict-vs-cheapest
budget-fallback distinction only; no pool taxonomy to adopt because none
exists upstream.

## 7. Modality bridge

`modalityBridgeDefaults.ts:17-38` bridges vision, audio, and video into text
for a target model lacking native multimodal support, each toggle spending
provider credit on the operator's behalf, so audio transcription over video
defaults off with an explicit "never spend by default" comment. Bridge
outputs are cached (`bridgeCache.ts:30-63`), LRU+TTL, keyed by
`sha256(contentRef + prompt + model + policy/version fields)`, so
re-describing the same media within the TTL is a cache hit.

**Our side**: no equivalent bridge/description-cache pattern found.
**Verdict**: adapt if a non-multimodal target model ever enters our routing
pool, the content-addressed cache key is directly reusable. Not urgent.

## 8. Response caching in `handleChatCore`

`chatCore/semanticCache.ts:44-56` and `semanticCache.ts:1-13` cache
responses keyed by `sha256(model + normalized messages + temperature +
top_p)`, two-tier (in-memory LRU then SQLite), default 1-hour TTL, bypassed
by a header or a per-key bypass mode. A hit costs $0 and reports the
would-have-been cost via a saved-cost header.

**Our side**: `exact-response-cache-service.ts:20-24` already does this,
scoped to one call type (conversation-title generation) today, keyed on
exact prompt fields, 7-day TTL, Redis-backed, with a `privacyClass`
dimension OmniRoute's version lacks. **Verdict**: adapt, not adopt. Extend
the call-type union to general temperature-0 chat completions rather than
building a second cache system, and keep our stricter privacy separation.

## 9. Other token/spend reducers

Token estimation (`tokenEstimator.ts:27-29`, chars/4 with a 1.1x
over-provision) is equivalent to our own `estimateTokens`
(`@agiworkforce/routing`), no material difference. Retry/backoff
(`backoff.ts`) is a plain doubling backoff capped at 4 hours, nothing beyond
standard practice. `providerCostData.ts:11-31` hardcodes a model-pricing
fallback table with literal model-id keys and dollar amounts, exactly the
anti-pattern `AGENTS.md` §4 forbids; our `llm-cost-calculator.ts` already
resolves pricing through the generated registry and is strictly better.
Reject outright, noted only as a negative example.

**Provider header fingerprinting** (`providerHeaderProfiles.ts:1-40`):
several adapters replay a specific CLI's exact headers, user agent, and a
stable per-install device UUID to reach an entitled model catalog a
different client identity would not unlock, consumer-subscription access
via impersonated, undisclosed client identity. This is exactly what
`AGENTS.md` §6 trust boundaries and our company-pool ToS gate rule out for
a managed-cloud lane; admissible only in BYOK, where the end user supplies
their own account and consents to the client identity used against it.
Reject for the company pool.

## Adoption plan, ranked by expected user savings

| Rank | Item                                                                                                                       | Owning package                                                    | Size       |
| ---- | -------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------- | ---------- |
| 1    | RTK-style tool/command-output compression + MCP tool-result collapse, replacing blind truncation                           | `packages/ai/routing` (new `compression` module) + `tool-loop.ts` | 8 eng-days |
| 2    | Prose/context compaction engine, profile-as-ceiling invariant                                                              | `context-compaction.ts`                                           | 5 eng-days |
| 3    | Credential-class circuit-breaker profiles (OAuth vs static-key), provider-window gate separate from per-connection backoff | `route-health-store.ts`, `free-lane/runtime-state-service.ts`     | 3 eng-days |
| 4    | Extend exact-response cache to general temperature-0 chat completions                                                      | `exact-response-cache-service.ts`                                 | 3 eng-days |
| 5    | Pool-key dedup + regime-trait table for `free-pools.json`, keep the counting/deciding split                                | `free-auto.ts`, `runtime-state.ts`                                | 2 eng-days |
| 6    | Route preview debug endpoint over synthetic candidates                                                                     | new `apps/web` route + `packages/ai/routing`                      | 1 eng-day  |
| 7    | Strict-vs-cheapest budget-fallback header on `isAffordable`                                                                | `auto.ts`                                                         | 1 eng-day  |
| 8    | Content-addressed modality-bridge description cache (deferred)                                                             | `packages/ai/routing` or new bridge package                       | 2 eng-days |

Rejected: hardcoded per-model pricing fallback tables (already strictly
worse than our generated registry); provider CLI header/identity
fingerprinting to unlock consumer-subscription catalogs (violates the
company-pool ToS gate and trust-boundary rules, admissible only in a BYOK
lane with the user's own account and consent); any `hard`/`soft`/`burst`
pool taxonomy (does not exist in the source); the 16-way manual strategy
selector (a product decision, not a user dial).

## Licence attribution

Any of the above lifted into this repository requires an entry in
`THIRD_PARTY_LICENSES.md` in the existing format: upstream repository
`https://github.com/diegosouzapw/OmniRoute`, MIT licence, copyright line
`Copyright (c) 2026 diegosouzapw`, the destination package, and the
OmniRoute source files the port is derived from.
