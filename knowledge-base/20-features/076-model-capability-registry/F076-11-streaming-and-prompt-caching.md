---
id: "F076-11"
type: "feature"
title: "Streaming and prompt caching"
aliases: ["Streaming and prompt caching", "Streaming", "SSE", "stream: true", "Prompt cache", "Cache class", "use_prompt_cache", "S76.31", "S76.32", "cachePolicy", "promptCacheMinimumTokens"]
area: "76 Model-capability registry"
available_on: ["web", "desktop", "mobile", "cli", "vscode", "chrome"]
implementation: {web: "built", desktop: "built", mobile: "built", cli: "built", vscode: "built", chrome: "built"}
verification: {web: "not seen by a person", desktop: "not seen by a person", mobile: "not seen by a person", cli: "not seen by a person", vscode: "not seen by a person", chrome: "not seen by a person"}
requirement_items: ["S76.31", "S76.32"]
depends_on: ["SYS-chat-turn-pipeline", "SYS-model-catalog-and-routing", "SYS-inference-providers", "SYS-subscriptions-entitlements-and-usage", "SYS-security-and-privacy", "SYS-execution-boundaries", "api:POST /api/llm/v1/chat/completions", "provider:anthropic", "provider:openai", "mode:cloud", "surface:web", "surface:mobile", "surface:cli", "surface:vscode", "surface:chrome"]
basis: "code inspection"
second_reader: "not sampled: statements are code readings that nobody has re-checked"
last_reviewed: "2026-11-24"
revision: "f51d16e747"
---
# F076-11 Streaming and prompt caching

Streaming sends a reply as it is written; every app does this for chat. Prompt caching lets the provider reuse the unchanged start of a long prompt to cut cost and wait. The server turns it on by default for the apps, off for plain API calls, and off for temporary chats and zero-retention workspaces.

Area: [76. Model-capability registry](README.md). Requirement items: [S76.31](../../10-requirements/capabilities/076-model-capability-registry.md#s7631), [S76.32](../../10-requirements/capabilities/076-model-capability-registry.md#s7632).

## Status

Two separate questions: is the code there, and has a person seen it work. "Seen working" comes only from results of real runs recorded in the project's ledger.

| App | In the code: this page's reading, 2026-11-24 | In the code: ledger audit, 2026-09-26 and later updates | Seen working by a person |
|---|---|---|---|
| Web | built | built | not seen by a person |
| Desktop | built | built | not seen by a person |
| Mobile | built | built | not seen by a person |
| CLI | built | built | not seen by a person |
| VS Code | built | built | not seen by a person |
| Chrome | partly built (this page lists unfinished parts) | built | not seen by a person |

The first column was derived from this page's text by a second, cheaper pass and has not been validated item by item; the ledger column is the project's own record. Neither is a test result.

## 1. Purpose and user value

**What it does.** Streaming: the chat route returns server-sent events when stream is true (apps/web/app/api/llm/v1/chat/completions/lib/request-processor.ts:635). Caching: the server decides whether a turn may be cached and under whose scope, and adapters mark cacheable parts (request-processor.ts:2822-2843, 6685-6692).

**Why it exists.** Streaming lets people read while the model writes. Caching lowers the cost of resending the same long prefix on every turn. First-party apps resend the whole conversation, so caching is on by default for them (request-processor.ts:2808-2818).

**Who uses it.** Everyone who chats on Web, Desktop, Mobile, CLI, VS Code; the Chrome extension for browser actions; developers using the API.

**Problems it solves**

- Long waits before any text appears.
- Paying full input price for repeated prefixes.
- Cached prefixes leaking across users: the cache key is scoped to organization and user (packages/contracts/types/src/prompt-cache-plan.ts:26-33, 103-110).
- Cache kept where privacy forbids it: temporary chat and zero-retention turns never cache (request-processor.ts:2830-2837).

**Use cases**

- A person watches a reply appear on Web.
- A long coding chat reuses its cached system prompt and tools turn after turn.
- A developer calls the API with stream true to get events, or leaves it false to get one JSON body.
- A user opens a temporary chat; nothing is left in a cache.

## 2. User experience

**Where to find it**

- All apps: replies appear as they are written; no switch. Web: apps/web/lib/hooks/useChatStream.ts; Mobile: apps/mobile/services/streaming.ts; VS Code: apps/extension-vscode/src/utils/api.ts; CLI: stream defaults to true in config (apps/cli/src/config.rs:182-185, 284-286); Chrome browser actions request streaming (apps/extension/src/features/computer-use/cloudAgentClient.ts:324).
- Caching: no user control. Model rows hold the numbers; none is shown in pickers (searched ModelCatalogue.tsx and the Mobile row).
- API: 'stream' and 'use_prompt_cache' request fields (request-processor.ts:635, 807).

**Before you start**

- A chat model. Cloud for server caching rules.

**Screens and controls**

- Stop button during a stream (handled by the chat turn pipeline; not read here).
- CLI: config key stream (default true).

**Journey**

1. 1. The person sends a message.
2. 2. The app sends stream true (apps) and use_prompt_cache true (Web, Desktop).
3. 3. The server decides cache use from privacy class and surface.
4. 4. The provider streams tokens; the server relays events.
5. 5. The app renders text as it arrives.
6. 6. On the next turn the same prefix is a cache hit and costs less.

**What the person sees and gets**

- Incremental text.
- API error for streamed JSON: "response_format type 'json_object' requires stream: false. A streamed response is delivered before it can be validated as JSON, so the guarantee could not be kept." (request-processor.ts:867-875).
- Office creation without streaming: 'Office file creation requires a streaming chat request.' (request-processor.ts:5461-5470).
- Web search on some providers without streaming: 'Web search on this provider requires a streaming chat request. Set stream: true.' (request-processor.ts:5691-5698).
- Usage and cost reports include cached tokens (not read in detail).

**Settings**

- API fields stream (default false) and use_prompt_cache (request-processor.ts:635, 807).
- Web and Desktop send use_prompt_cache true (apps/web/lib/hooks/useChatStream.ts:4680, 5032; apps/desktop/src/api/cloudApi.ts:895).
- Temporary chat and organization zero-retention setting turn caching off (request-processor.ts:2830-2837).

## 3. Current implementation

From reading the code. Not a test result.

**Working in the code**

- Streaming transport in Web, Mobile, VS Code, CLI (grep hits for text/event-stream and stream true in each app's client).
- The chat route's default stream is false; work mode 'agiwork' forces stream true (request-processor.ts:635, 1467).
- Prompt cache decision: first-party surfaces default to cached, API keys must opt in, privacy classes 'temporary' and 'zero_retention' always disable (request-processor.ts:2822-2843; packages/contracts/types/src/prompt-cache-plan.ts:94-101).
- A cache plan builds a tenant-scoped key and records skip reasons temporary_chat, zero_data_retention, no_stable_prefix, unscoped_tenant (prompt-cache-plan.ts:18-24, 35-50).
- Provider adapters use the plan: Anthropic and OpenAI translators (packages/ai/providers/anthropic/src/translate.ts; packages/ai/providers/openai/src/translate.ts).
- Route cache class per route in the registry: provider_implicit_prompt_cache, provider_explicit_prompt_cache, gateway_prompt_cache, gateway_response_cache, no_provider_cache (packages/ai/model-registry/schema/registry.schema.json:483-491).
- Auto routing keeps a previously used route when it keeps a cache: it tolerates up to 25 percent extra cost for it, and no extra for a route with no cache (packages/ai/routing/src/auto.ts:735, 1165-1180).
- Model rows carry promptCacheMinimumTokens and cachePolicy (write multiplier, read discount, minimum life, explicit breakpoints) (packages/contracts/types/src/model-catalog.ts:717, 771-776); the registry also has a promptCaching capability (registry.schema.json:825-827).
- The Chrome browser-action client requires the model to have streaming, tools and vision (apps/extension/src/features/computer-use/cloudAgentClient.ts:98-103).

**Incomplete**

- The brief says the request path picks a transport per the streaming flag. Apart from the Chrome browser-action check, no place reads capabilities.streaming to choose transport (searched apps, packages); the apps stream regardless [inferred].
- The brief cites auto.ts:1166-1169 as 'prefers a route with a warm cache when the prefix is cache-friendly'; the code only gives a preferred (last used) route a cost allowance, with no look at the prefix (auto.ts:1165-1180).
- Local models: streaming and caching behaviour on Mobile and Desktop not established.
- Own key: caching and stream behaviour in BYOK paths not read.

**Present but disconnected or switched off**

- Cache is disabled for temporary chats, zero-retention workspaces and API calls without use_prompt_cache (request-processor.ts:2834-2836).

**Not available**

- User-visible cache controls or cache-hit readouts: not found.
- Streaming for JSON-format requests (refused by design).

## 4. Required behaviour

**Established requirements**

- The registry records streaming support per model and the request path picks a transport accordingly. (source: capability ledger `audit/ledger/ecosystem-capability-ledger.jsonl`, item S76.31)
- The registry records prompt-cache capability and route cache class, and routing and caching decisions use them. (source: capability ledger `audit/ledger/ecosystem-capability-ledger.jsonl`, item S76.32)
- Temporary chat promises nothing outlives the turn, and a zero-retention workspace promises the provider keeps nothing; neither may leave a cached prefix. (source: apps/web/app/api/llm/v1/chat/completions/lib/request-processor.ts:2812-2818)
- Route-dependent capabilities and cache class are recorded per provider route. (source: capability ledger `audit/ledger/ecosystem-capability-ledger.jsonl`, item S76.38)

**Acceptance criteria**

1. A Web reply appears in pieces, not all at once.
2. API with stream true returns events; with stream false returns one JSON body.
3. response_format json_object with stream true is refused with the stated message.
4. A temporary chat sends no cache key and no cache markers.
5. A zero-retention workspace turn is not cached.
6. An API call without use_prompt_cache is not cached; with true on a standard turn it is.
7. Auto routing with a preferred route that keeps a cache stays on it up to the cost allowance; a no-cache route gets no allowance.
8. The model row holds a minimum cacheable size and a cache policy for models that cache.

**Inferred requirements** (not stated anywhere; reasoned from the code or from competitor parity)

- Local and own-key runs should follow their own boundaries; server cache rules only cover Cloud [inferred from doc: AGENTS.md section 6].

**Proposed improvements** (suggestions, not requirements)

- [proposed] Make the transport decision read the registry streaming flag, or remove the claim.
- [proposed] Show cached-token savings in usage views.
- [proposed] Correct the brief's description of route affinity.

## 5. Implementation map

| Kind | Name | Path | Role |
|---|---|---|---|
| service | request-processor stream and cache | `apps/web/app/api/llm/v1/chat/completions/lib/request-processor.ts` | Schema stream and use_prompt_cache (635, 807), JSON refusal (867-875), cache decision (2822-2843, 6685-6692). |
| service | prompt-cache-plan | `packages/contracts/types/src/prompt-cache-plan.ts` | Privacy class, scope, key material, skip reasons. |
| service | prompt-cache-helper | `apps/web/lib/prompt-cache-helper.ts` | Web-side cache helper (tested by prompt-cache-helper.test.ts). |
| service | Anthropic translate | `packages/ai/providers/anthropic/src/translate.ts` | Applies cache markers and max_tokens. |
| service | OpenAI translate | `packages/ai/providers/openai/src/translate.ts` | Applies the cache key. |
| service | OpenAI adapter | `packages/ai/providers/openai/src/index.ts` | Streaming entry point and endpoint choice (175-200). |
| service | Auto routing | `packages/ai/routing/src/auto.ts` | Route ranking and cache-aware affinity (735, 1134-1180). |
| service | route ranking helpers | `packages/ai/routing/src/route-ranking.ts` | routeKeepsCache (72-74). |
| schema | registry routeCacheClass | `packages/ai/model-registry/schema/registry.schema.json` | Five cache classes (483-491) and promptCaching capability (825). |
| schema | ModelMetadata cache fields | `packages/contracts/types/src/model-catalog.ts` | promptCacheMinimumTokens (717), cachePolicy (771-776). |
| hook | useChatStream | `apps/web/lib/hooks/useChatStream.ts` | Web streaming client, sends use_prompt_cache. |
| service | Desktop cloudApi | `apps/desktop/src/api/cloudApi.ts` | Desktop (Tauri) request with use_prompt_cache (895). |
| service | Mobile streaming | `apps/mobile/services/streaming.ts` | SSE client (438, 538, 657, 675). |
| service | CLI streaming | `apps/cli/src/models/streaming.rs` | CLI stream handling. |
| config | CLI stream default | `apps/cli/src/config.rs` | stream default true (182-186, 284-286). |
| service | VS Code API client | `apps/extension-vscode/src/utils/api.ts` | SSE reading (784, 956, 1006). |
| service | Chrome cloud agent client | `apps/extension/src/features/computer-use/cloudAgentClient.ts` | Streaming request and streaming capability check (98-103, 324, 551). |
| test | prompt-cache request test | `apps/web/app/api/llm/v1/chat/completions/lib/__tests__/request-processor.prompt-cache.test.ts` | Cache decision tests. |

## 6. Execution and data flow

| Step | Runs on | Source |
|---|---|---|
| The app sends stream true and (Web, Desktop) use_prompt_cache true. | device | apps/web/lib/hooks/useChatStream.ts:4680; apps/desktop/src/api/cloudApi.ts:895 |
| The server computes the privacy class and whether to cache, and a scope of organization and user. | our servers | request-processor.ts:2822-2843 |
| Auto routing ranks routes; a preferred route with a cache keeps its place within a cost allowance. | our servers | packages/ai/routing/src/auto.ts:1134-1180 |
| The adapter translates the request and adds cache markers or a cache key, then calls the provider with stream on. | outside service | packages/ai/providers/anthropic/src/translate.ts; packages/ai/providers/openai/src/translate.ts |
| Tokens come back as events; the server relays them; the app renders them. | device and our servers | apps/mobile/services/streaming.ts:657; apps/extension-vscode/src/utils/api.ts:956 |

**Data**

| What | Stored in | Synced | Kept or deleted |
|---|---|---|---|
| Cache key material (tenant, user, toolset version, stable prefix) | Hashed and sent to the provider; not stored by the app (packages/contracts/types/src/prompt-cache-plan.ts:35-50) | No | Provider-side cache life; the registry records minimum life per row (model-catalog.ts:771-776); real provider deletion rules unknown |
| Streamed text | Saved with the conversation by the chat pipeline | Per chat sync | Follows the chat |

**Models and providers.** Caching differs by provider and route class. Anthropic uses explicit breakpoints (max 4, prompt-cache-plan.ts:77-78); OpenAI uses a cache key (packages/ai/providers/openai/src/__tests__/prompt-cache-key.test.ts). Gateway routes may cache at the gateway.

## 7. Access and usage rules

| Rule | What the code does |
|---|---|
| Account | Cloud chat needs sign-in; streaming and caching need nothing more. |
| Permissions | Organization zero-retention setting disables caching. |
| Subscription | No plan gate for streaming or caching found. Cached tokens change the cost the managed usage records [inferred; usage code not read]. |
| Limits and metering | Cache writes are billed above plain input price, which is why API keys must opt in (request-processor.ts:2814-2815). |
| Feature flags | use_prompt_cache request field; none server-side beyond privacy class. |
| Model compatibility | Row fields promptCacheMinimumTokens and cachePolicy; registry capability promptCaching; routes carry a cache class. |
| Provider restrictions | Anthropic caps breakpoints at 4. JSON response formats cannot stream. Some providers need streaming for web search (request-processor.ts:5691-5698). |
| Local mode | Server caching rules do not apply to Local. Whether Mobile and Desktop local runtimes stream tokens: not established in the files read. |

## 8. States and edge cases

| State | Behaviour | Source |
|---|---|---|
| JSON response format with stream | Request refused by schema | request-processor.ts:867-875 |
| Temporary chat | Cache disabled | request-processor.ts:2830-2837 |
| Zero-retention workspace | Cache disabled | prompt-cache-plan.ts:94-101 |
| No stable prefix or unscoped request | No key material; skip reason recorded | prompt-cache-plan.ts:18-24 |
| Connection lost mid-stream | Mobile has tests for connection loss and burst delivery | apps/mobile/__tests__/cloud-stream-connection-lost.test.ts |
| Cancel | Web uses an AbortController | apps/web/lib/hooks/useChatStream.ts:4682 |
| Non-streaming API request | One JSON body | request-processor.ts:635 |
| Offline | Not handled in this feature; belongs to the chat turn pipeline | not handled in the code read |

## 9. Verification

What has actually been seen by a person is in the Status table above. This section lists what exists to check with.

**Existing tests**

- `apps/web/app/api/llm/v1/chat/completions/lib/__tests__/request-processor.prompt-cache.test.ts`: Cache decision in the request processor.
- `apps/web/lib/prompt-cache-helper.test.ts`: Cache helper.
- `packages/ai/providers/anthropic/src/__tests__/prompt-cache-plan.test.ts`: Anthropic cache plan.
- `packages/ai/providers/openai/src/__tests__/prompt-cache-key.test.ts`: OpenAI cache key.
- `packages/ai/provider-protocol/src/__tests__/system-prompt-cache-boundary.test.ts`: System prompt cache boundary.
- `apps/web/lib/services/__tests__/zero-data-retention-provider-overrides.test.ts`: Zero-retention behaviour.
- `apps/mobile/__tests__/cloud-stream-connection-lost.test.ts`: Mobile stream loss.
- `apps/web/e2e/chat-live-latency.spec.ts`: Streaming latency end to end (asserts a model with streaming).

**Test scenarios**

- **Reply streams**
  1. Run Web on localhost; send a long question.
  - Expected: Text appears in pieces.
- **API non-stream vs stream**
  1. POST the chat route with stream false, then true.
  - Expected: One JSON body, then an event stream.
- **JSON with stream**
  1. POST response_format json_object with stream true.
  - Expected: Validation error stating it requires stream false.
- **Temporary chat**
  1. Open a temporary chat and send two turns.
  - Expected: No cache key in the provider request; no cache read tokens.
- **Cache hit on a long chat**
  1. Send a long system prompt and tools; send a second turn.
  - Expected: Provider usage reports cached input tokens on the second turn.
- **CLI stream default**
  1. Run the CLI with defaults and then with stream false in config.
  - Expected: Live output, then one block.

**Where to look when it fails**

- Plan skip reasons: temporary_chat, zero_data_retention, no_stable_prefix, unscoped_tenant.
- Provider usage fields for cached tokens.
- Mobile stream error tests name connection-lost and finish-reason cases.

**Hands-on test plans**

- Web: [70-qa/test-plans/web/076-model-capability-registry.md](../../70-qa/test-plans/web/076-model-capability-registry.md)
- Desktop: [70-qa/test-plans/desktop/076-model-capability-registry.md](../../70-qa/test-plans/desktop/076-model-capability-registry.md)
- Mobile: [70-qa/test-plans/mobile/076-model-capability-registry.md](../../70-qa/test-plans/mobile/076-model-capability-registry.md)
- CLI: [70-qa/test-plans/cli/076-model-capability-registry.md](../../70-qa/test-plans/cli/076-model-capability-registry.md)
- VS Code: [70-qa/test-plans/vscode/076-model-capability-registry.md](../../70-qa/test-plans/vscode/076-model-capability-registry.md)
- Chrome: [70-qa/test-plans/chrome/076-model-capability-registry.md](../../70-qa/test-plans/chrome/076-model-capability-registry.md)

## 10. Gaps and dependencies

- **Streaming support flag is not used to choose transport, except in the Chrome browser-action check.** Affects: All apps. Evidence: Only apps/extension/src/features/computer-use/cloudAgentClient.ts:98-103 reads it. Work needed: Decide: use the flag, or drop the claim.
- **Brief describes cache-aware routing as prefix-based; code is last-route affinity with a cost allowance.** Affects: Docs, routing owners. Evidence: auto.ts:1165-1180. Work needed: Fix the brief or implement prefix-aware choice.
- **Chrome is marked done for streaming and caching, but only the browser-action client was found; no cache control.** Affects: Chrome. Evidence: cloudAgentClient.ts. Work needed: Verify chat streaming in the extension side panel.
- **Local and own-key streaming and caching not documented.** Affects: Mobile, Desktop, CLI own-key. Evidence: Not read. Work needed: Trace each runtime.
- **No user-visible cache or savings readout.** Affects: All apps. Evidence: No UI found. Work needed: Proposed only.

**Depends on**

- SYS-chat-turn-pipeline
- SYS-model-catalog-and-routing
- SYS-inference-providers
- SYS-subscriptions-entitlements-and-usage
- SYS-security-and-privacy
- SYS-execution-boundaries
- api:POST /api/llm/v1/chat/completions
- provider:anthropic
- provider:openai
- mode:cloud
- surface:web
- surface:mobile
- surface:cli
- surface:vscode
- surface:chrome

## Unknown

- Whether the Tauri desktop client and Mobile local runtimes stream tokens.
- How the Chrome side panel sends chat (only the browser-action client was read).
- Real provider cache lifetimes versus the registry's minimum life numbers.
- Whether usage views show cached-token savings.
- Whether any place other than Chrome reads the streaming capability flag in Rust crates (crates/ not searched in full).
- Own-key streaming and caching behaviour.
