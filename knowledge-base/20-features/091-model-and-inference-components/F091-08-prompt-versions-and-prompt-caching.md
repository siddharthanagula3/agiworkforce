---
id: "F091-08"
type: "feature"
title: "Prompt versions and prompt caching"
aliases: ["Prompt registry", "Prompt manifest", "Prompt versions", "Prompt caching", "Cache diagnostics", "S91.27", "S91.28", "S91.29", "prompt stamp"]
area: "91 Model and inference components"
available_on: []
implementation: {web: "n/a", desktop: "n/a", mobile: "n/a", cli: "n/a", vscode: "n/a", chrome: "n/a"}
verification: {web: "n/a", desktop: "n/a", mobile: "n/a", cli: "n/a", vscode: "n/a", chrome: "n/a"}
requirement_items: ["S91.27", "S91.28", "S91.29"]
depends_on: ["surface:web", "mode:cloud", "SYS-model-catalog-and-routing", "SYS-chat-turn-pipeline", "SYS-inference-providers", "SYS-memory-projects-and-context", "table:provider_cost_events", "table:routing_decision_traces", "provider:anthropic", "provider:openai", "F091-07"]
basis: "code inspection"
second_reader: "not sampled: statements are code readings that nobody has re-checked"
last_reviewed: "2026-11-24"
revision: "f51d16e747"
---
# F091-08 Prompt versions and prompt caching

Server prompts live in code as a versioned manifest resolved by id. A flag can pick a version for a person; the release ledger gates it. Prompt caching is applied on routes that support it and refused for Temporary Chat and zero-retention turns. Operators read cache hit rates in the admin Costs tab.

Area: [91. Model and inference components](README.md). Requirement items: [S91.27](../../10-requirements/capabilities/091-model-and-inference-components.md#s9127), [S91.28](../../10-requirements/capabilities/091-model-and-inference-components.md#s9128), [S91.29](../../10-requirements/capabilities/091-model-and-inference-components.md#s9129).

## Status

Two separate questions: is the code there, and has a person seen it work. "Seen working" comes only from results of real runs recorded in the project's ledger.

| App | In the code: this page's reading, 2026-11-24 | In the code: ledger audit, 2026-09-26 and later updates | Seen working by a person |
|---|---|---|---|
| Web | does not apply | does not apply | n/a |
| Desktop | does not apply | does not apply | n/a |
| Mobile | does not apply | does not apply | n/a |
| CLI | does not apply | does not apply | n/a |
| VS Code | does not apply | does not apply | n/a |
| Chrome | does not apply | does not apply | n/a |

The first column was derived from this page's text by a second, cheaper pass and has not been validated item by item; the ledger column is the project's own record. Neither is a test result.

## 1. Purpose and user value

**What it does.** Resolves each server prompt by id and version, stamps the used version on cost and routing rows, builds a tenant-scoped prompt cache plan per turn, and lets operators read cache hit rates and cache tokens by route, model, user or tenant. (apps/web/lib/prompts/prompt-registry.ts:75; packages/contracts/types/src/prompt-cache-plan.ts:142; apps/web/lib/services/route-cache-observability-service.ts:143)

**Why it exists.** Prompts need identity, A/B selection and rollback without a database, and repeat turns should be faster and cheaper without leaking cached content across tenants or out of private turns. (apps/web/lib/prompts/prompt-manifest.ts:18-33; apps/web/app/api/llm/v1/chat/completions/lib/request-processor.ts:2815-2822)

**Who uses it.** The chat pipeline on every Cloud turn; engineers who add prompt versions; operators who watch cache numbers. People see only faster, cheaper repeat turns.

**Problems it solves**

- A shipped prompt is never rewritten, so a stamped ledger row always means one text (apps/web/lib/prompts/prompt-manifest.ts:32).
- A stale flag cannot take a surface down: an unknown version falls back to the pinned one (apps/web/lib/prompts/prompt-registry.ts:55-56).
- A Temporary Chat or zero-retention workspace never leaves a cached prefix (apps/web/app/api/llm/v1/chat/completions/lib/request-processor.ts:2829-2836).
- Two workspaces never share a cache key because the key folds in organization, user, prompt version and toolset (packages/contracts/types/src/prompt-cache-plan.ts:152-170).

**Use cases**

- An engineer adds version 2 of the chat system prompt, opens flag prompt.<id> variant v2 to staff first, and rolls back by moving the pin.
- A user in a long chat sends a follow-up and the stable system prefix is read from cache.
- A user in Temporary Chat sends a turn and no cache control is attached.
- An operator opens the Costs tab by route and sees the cache hit rate drop after a prompt change.

## 2. User experience

**Where to find it**

- Web: no person-facing screen. Operators: admin tab 'costs', column 'Cache hit', and the 'Explain one request' item 'Cache read / write tokens' (apps/web/features/admin/components/OperatorCostsPanel.tsx:238,326).
- Other apps: no screen found; prompt resolution and caching are server-side so the other apps see only the result [inferred].

**Before you start**

- Cloud mode on web chat endpoint [inferred].
- Operator view needs a platform admin.

**Screens and controls**

- Costs panel tabs route, model, user, tenant; Cache hit column is cache-hit requests divided by requests (apps/web/lib/services/route-cache-observability-service.ts:131).
- Temporary chat flag on a conversation; no cache control in the UI.

**Journey**

1. Engineer adds a prompt version to the manifest and a release record.
2. Flag prompt.<id> with variant vN selects it for a subject if the release ledger admits it.
3. User sends a turn; the server resolves the prompt and stamps id@version.
4. Server decides cache use from surface, Temporary Chat and zero-retention.
5. Provider reports cache tokens; operator reads them later.

**What the person sees and gets**

- Operator table columns and explain fields (Cache hit, Cache read / write tokens).
- Log warning '[prompt-flags] a prompt flag selected a version the release ledger does not open to this subject; serving the pinned version' (apps/web/lib/prompts/prompt-variants.ts:17).

**Settings**

- Flag key prefix 'prompt.' with variants named v<number> (apps/web/lib/prompts/prompt-flags.ts:21-24).
- Environment name AGIWORKFORCE_CACHE_RETENTION ('long' enables 1h cache on eligible hosts) (packages/ai/provider-protocol/src/anthropic-payload-policy.ts:107).
- Request field use of prompt cache: default on for non-API surfaces, off for API unless asked (apps/web/app/api/llm/v1/chat/completions/lib/request-processor.ts:2834).

## 3. Current implementation

From reading the code. Not a test result.

**Working in the code**

- Registry resolves by id with pinned, variant or rollout selection and never throws on an unknown variant (apps/web/lib/prompts/prompt-registry.ts:75-100).
- Flag-selected variants checked against the release ledger and audience (internal staff) (apps/web/lib/prompts/prompt-flags.ts:60-75; apps/web/lib/prompts/prompt-release.ts:16-28).
- Stamp 'id@version' stored in prompt_ids on provider_cost_events and routing_decision_traces (apps/web/db/neon/0214_prompt_manifest_stamps.sql:24-32; apps/web/lib/prompts/prompt-stamp.ts:12).
- Cache plan: Temporary Chat outranks zero retention; either makes the turn non-cacheable (packages/contracts/types/src/prompt-cache-plan.ts:94-100,142-150).
- Turn-level decision combines the request flag and the privacy class (apps/web/app/api/llm/v1/chat/completions/lib/request-processor.ts:2829).
- Anthropic adapter applies ephemeral cache control to the system blocks, with 1h only on eligible hosts (packages/ai/provider-protocol/src/anthropic-payload-policy.ts:103-125).
- Cache hit rates, cache read/write tokens, fallback counts and latency per route, model, user, tenant, last 24 hours by default (apps/web/lib/services/route-cache-observability-service.ts:143; apps/web/app/api/admin/observability/route.ts:44).
- A shadow mirror (extra copy of a turn to a candidate model) is refused for the same private turns (apps/web/app/api/llm/v1/chat/completions/lib/request-processor.ts:2851).

**Incomplete**

- The staged-rollout path 'rollouts' in resolvePrompt is only exercised by its test; no production caller passes 'rollouts' (grep over apps/web found only prompt-registry.ts and prompt-rollout.test.ts).

**Present but disconnected or switched off**

- Staged prompt rollout by traffic fraction exists but is not connected to a caller (apps/web/lib/prompts/prompt-registry.ts:37-47,63-72).

**Not available**

- Cache numbers on non-web apps: none found. Cache behaviour for OpenAI-type routes is in packages/ai/providers/openai/src/translate.ts (referenced, not read in detail): unknown.

## 4. Required behaviour

**Established requirements**

- Prompts are versioned in a registry and resolved by id and version. (source: S91.27)
- Prompt caching is applied where routes support it and suppressed for private turns. (source: S91.28)
- Operators can see cache hit rates and cache token usage per route, model and tenant. (source: S91.29)
- A staged rollout can select a newer version for a share of requests. (source: Brief 'Should' for F091-08)
- Prompts stay in code; a shipped version is never rewritten. (source: apps/web/lib/prompts/prompt-manifest.ts:18-33)

**Acceptance criteria**

1. resolvePrompt with no variant returns the pinned version and stamp id@pinned.
2. A flag variant v2 returns version 2 only if the release ledger admits it; otherwise pinned and a warning is logged.
3. A variant naming a missing version serves the pinned version.
4. A turn in a Temporary Chat has usePromptCache false and no cache control reaches the provider.
5. A zero-retention workspace turn has usePromptCache false.
6. With a rollout fraction f and a request id, the same request id always lands on the same side, and about f of ids get the new version.
7. The Costs tab shows non-zero Cache hit for a route that served repeat turns.

**Inferred requirements** (not stated anywhere; reasoned from the code or from competitor parity)

- The temporary chat flag also stops saving the chat; the brief states this but the code reviewed here only shows its effect on caching and shadow mirroring [inferred].

**Proposed improvements** (suggestions, not requirements)

- [proposed] Connect staged rollouts to the release ledger canary record so a fraction rollout of a prompt can run in production.
- [proposed] Show cache hit rate per prompt stamp, since stamps are already stored.

## 5. Implementation map

| Kind | Name | Path | Role |
|---|---|---|---|
| service | Prompt registry | `apps/web/lib/prompts/prompt-registry.ts` | resolvePrompt, stamps, rollout bucket. |
| config | Prompt manifest | `apps/web/lib/prompts/prompt-manifest.ts` | Every prompt with id, kind, pinned version and versions. |
| service | Prompt flags | `apps/web/lib/prompts/prompt-flags.ts` | Maps prompt.<id> flags to versions and applies the release gate. |
| service | Prompt release | `apps/web/lib/prompts/prompt-release.ts` | Reads release ledger channel for a prompt version. |
| service | Prompt variants | `apps/web/lib/prompts/prompt-variants.ts` | Evaluates prompt flags for a subject. |
| service | Prompt stamp | `apps/web/lib/prompts/prompt-stamp.ts` | Validates and normalizes id@version stamps. |
| service | Chat system prompt | `apps/web/lib/prompts/chat-system-prompt.ts` | Chat prompt versions and cache boundary. |
| service | Capability preamble | `apps/web/app/api/llm/v1/chat/completions/lib/capability-preamble.ts` | Resolves the chat prompt for a turn. |
| service | Request processor cache decision | `apps/web/app/api/llm/v1/chat/completions/lib/request-processor.ts` | resolveTurnPromptCache and turnMayBeShadowMirrored. |
| config | Prompt cache plan | `packages/contracts/types/src/prompt-cache-plan.ts` | Privacy class, skip reasons and tenant-scoped key material. |
| service | Anthropic payload policy | `packages/ai/provider-protocol/src/anthropic-payload-policy.ts` | Applies ephemeral cache control and 1h retention. |
| service | Anthropic translate | `packages/ai/providers/anthropic/src/translate.ts` | Uses the cache plan for the provider wire format. |
| service | OpenAI translate | `packages/ai/providers/openai/src/translate.ts` | Uses the cache plan (prompt cache key). |
| schema | Prompt stamps migration | `apps/web/db/neon/0214_prompt_manifest_stamps.sql` | prompt_ids columns and indexes. |
| service | Route cache observability | `apps/web/lib/services/route-cache-observability-service.ts` | Cache hit rate and token queries. |
| endpoint | Admin observability | `apps/web/app/api/admin/observability/route.ts` | Serves the breakdown. |
| component | OperatorCostsPanel | `apps/web/features/admin/components/OperatorCostsPanel.tsx` | Operator view of cache numbers. |
| service | Flag evaluation | `apps/web/lib/feature-flags/flag-evaluation-service.ts` | Evaluates prompt flags (referenced by prompt-variants.ts). |

## 6. Execution and data flow

| Step | Runs on | Source |
|---|---|---|
| Prompt flags evaluated for the subject; versions the release ledger does not admit are withheld. | our servers | apps/web/lib/prompts/prompt-variants.ts:9-22 |
| Prompts resolved by id and version; stamps collected. | our servers | apps/web/app/api/llm/v1/chat/completions/lib/request-processor.ts:2497 |
| Cache decision: surface default, request flag, then privacy class. | our servers | apps/web/app/api/llm/v1/chat/completions/lib/request-processor.ts:2829 |
| Adapter marks the stable prefix for caching and sends to the provider. | outside service | packages/ai/provider-protocol/src/anthropic-payload-policy.ts:103 |
| Provider returns cache read/write tokens, which settle into the cost event. | our servers | apps/web/app/api/llm/v1/chat/completions/lib/stream-transform.ts:340 |
| Operator query aggregates cache units by dimension. | our servers | apps/web/lib/services/route-cache-observability-service.ts:143 |

**Data**

| What | Stored in | Synced | Kept or deleted |
|---|---|---|---|
| Prompt texts and versions | source code (manifest), not a database | shipped with the build | Git history |
| Prompt stamps | prompt_ids on provider_cost_events and routing_decision_traces | server only | as those tables |
| Cached prompt prefix | at the provider, scoped by the plan key | no | provider TTL, short or 1h (packages/ai/provider-protocol/src/anthropic-payload-policy.ts:120) |
| Cache read/write units | provider_cost_events | server only | unknown |

**Models and providers.** Caching is a route feature, not a model feature. Anthropic uses ephemeral cache control; 1h only on eligible hosts from the registry; OpenAI uses a namespaced key built from the plan (packages/contracts/types/src/prompt-cache-plan.ts:137-142). Route cache class comes from the provider-route registry (apps/web/app/api/llm/v1/chat/completions/lib/response-builder.ts:530).

## 7. Access and usage rules

| Rule | What the code does |
|---|---|
| Account | Signed-in managed Cloud turns; operator views need a platform admin. |
| Permissions | Admin endpoint: requirePlatformAdmin plus 'admin-operator' rate limit (apps/web/app/api/admin/observability/route.ts:30-33). Internal-channel prompt versions only for internal staff (apps/web/lib/prompts/prompt-release.ts:25-28). |
| Subscription | No plan gate on prompt caching found. A developer API key must opt in because a cache write is billed above input price (apps/web/app/api/llm/v1/chat/completions/lib/request-processor.ts:2815). |
| Limits and metering | Max 4 cache breakpoints; at most 16 prompt stamps per row (packages/contracts/types/src/prompt-cache-plan.ts:58; apps/web/lib/prompts/prompt-stamp.ts:10). Breakdown limited to 50 rows (apps/web/lib/services/route-cache-observability-service.ts:8). |
| Feature flags | Per-prompt flags 'prompt.<id>' (variants v<number>); AGIWORKFORCE_CACHE_RETENTION environment setting. |
| Model compatibility | Only models and routes whose cache class and host rules allow it; a turn with no stable prefix gets skip reason 'no_stable_prefix'; no tenant gets 'unscoped_tenant' (packages/contracts/types/src/prompt-cache-plan.ts:165-168). |
| Provider restrictions | 1h retention only for hosts marked longTtlPromptCache in the registry (packages/ai/provider-protocol/src/anthropic-payload-policy.ts:93-100). |
| Local mode | Not applicable to this server code; on-device prompt versioning or caching was not read: unknown. |

## 8. States and edge cases

| State | Behaviour | Source |
|---|---|---|
| Unknown prompt variant | Pinned version served. | apps/web/lib/prompts/prompt-registry.ts:55-60 |
| Version not admitted by release ledger | Withheld, warning logged, pinned served. | apps/web/lib/prompts/prompt-variants.ts:17 |
| Pinned version missing from manifest | Throws an error naming the prompt. | apps/web/lib/prompts/prompt-registry.ts:62-66 |
| Temporary Chat | No cache; skip reason temporary_chat. | packages/contracts/types/src/prompt-cache-plan.ts:94-100 |
| Zero-retention workspace | No cache; skip reason zero_data_retention. | packages/contracts/types/src/prompt-cache-plan.ts:117 |
| No cache-hit data in the last 24 hours | Empty-state text in the Costs panel. | apps/web/features/admin/components/OperatorCostsPanel.tsx:219 |
| Breakdown load error | Alert 'Could not load the cost breakdown.' | apps/web/features/admin/components/OperatorCostsPanel.tsx:128 |
| Request without id for a rollout | No rollout served. | apps/web/lib/prompts/prompt-registry.ts:69 |

## 9. Verification

What has actually been seen by a person is in the Status table above. This section lists what exists to check with.

**Existing tests**

- `apps/web/lib/prompts/__tests__/prompt-registry.test.ts`: Resolution by id and version.
- `apps/web/lib/prompts/__tests__/prompt-rollout.test.ts`: Fraction split and determinism.
- `apps/web/lib/prompts/__tests__/prompt-flags.test.ts`: Flag to version mapping.
- `apps/web/lib/prompts/__tests__/prompt-release-ledger.test.ts`: Release ledger gate.
- `apps/web/lib/prompts/__tests__/prompt-immutability.test.ts`: Shipped versions unchanged.
- `apps/web/lib/prompts/__tests__/prompt-eval-linkage.test.ts`: Eval linkage to prompt ids.
- `apps/web/app/api/llm/v1/chat/completions/lib/__tests__/request-processor.prompt-cache.test.ts`: Turn prompt-cache decision.
- `apps/web/lib/services/__tests__/zero-data-retention-provider-overrides.test.ts`: Zero retention overrides.
- `apps/web/app/api/admin/observability/route.test.ts`: Observability endpoint.
- `apps/web/db/neon/prompt-manifest-stamps-migration.test.ts`: Stamps migration.

**Test scenarios**

- **Temporary Chat refuses cache**
  1. Create a Temporary Chat
  2. Send two identical turns
  3. Inspect the provider payload or cost event
  - Expected: No cache control; cache read units are 0.
- **Normal chat reuses prefix**
  1. Send two turns in a saved chat on a cache-capable route
  2. Open admin Costs by route
  - Expected: Second turn shows cache read tokens; Cache hit above 0%.
- **Flag selects version**
  1. Enable flag prompt.<id> variant v2 for a staff test subject
  2. Send a turn
  3. Read prompt_ids on the cost event
  - Expected: Stamp id@2 for staff, id@pinned for others.
- **Stale flag**
  1. Set a variant naming a withdrawn version
  2. Send a turn
  - Expected: Pinned version served, no error.
- **Tenant isolation**
  1. Build cache plans for two organizations with the same prompt
  - Expected: Different keyMaterial.

**Where to look when it fails**

- Log '[prompt-flags] a prompt flag selected a version the release ledger does not open…'.
- Tables provider_cost_events (cache_read_units, cache_write_units, prompt_ids) and routing_decision_traces.prompt_ids.
- Plan field skipReason.

**Hands-on test plans**

- none: not built on any app

## 10. Gaps and dependencies

- **Traffic-fraction prompt rollout has no production caller.** Affects: Operators on web. Evidence: apps/web/lib/prompts/prompt-registry.ts:37-47 vs no non-test caller. Work needed: Wire release-ledger canary records into resolvePrompt options, or remove the unused path.
- **Cache diagnostics are only in the admin Costs tab, last 24 hours by default.** Affects: Operators. Evidence: apps/web/lib/services/route-cache-observability-service.ts:6. Work needed: Optional longer windows and per-prompt-stamp view.
- **Cache behaviour on non-web apps and Local mode not established.** Affects: Desktop, Mobile, CLI, VS Code, Chrome. Evidence: Not read. Work needed: Read each app's request builder.

**Depends on**

- surface:web
- mode:cloud
- SYS-model-catalog-and-routing
- SYS-chat-turn-pipeline
- SYS-inference-providers
- SYS-memory-projects-and-context
- table:provider_cost_events
- table:routing_decision_traces
- provider:anthropic
- provider:openai
- F091-07

## Unknown

- Whether any production flag currently selects a non-pinned prompt version.
- Prompt cache behaviour in Desktop, Mobile, CLI, VS Code, Chrome and in Local and own-key modes.
- Exact OpenAI cache key handling (translate.ts not read in detail).
- How the temporary-chat flag stops saving, beyond caching.
