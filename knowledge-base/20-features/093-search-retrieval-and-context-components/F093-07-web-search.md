---
id: "F093-07"
type: "feature"
title: "Web search"
aliases: ["Web search", "web_search tool", "generic web search", "search backend", "Search mode (/search)", "Public-search adapters (S93.09)", "Search-query planner (S93.13)", "Search-result normalization (S93.14)", "required search"]
area: "93 Search, retrieval, and context components"
available_on: []
implementation: {web: "n/a", desktop: "n/a", mobile: "n/a", cli: "n/a", vscode: "n/a", chrome: "n/a"}
verification: {web: "n/a", desktop: "n/a", mobile: "n/a", cli: "n/a", vscode: "n/a", chrome: "n/a"}
requirement_items: ["S93.09", "S93.13", "S93.14"]
depends_on: ["SYS-chat-turn-pipeline", "SYS-subscriptions-entitlements-and-usage", "SYS-model-catalog-and-routing", "SYS-execution-boundaries", "SYS-security-and-privacy", "SYS-agents-tools-and-automation", "mode:cloud", "file:apps/web/lib/web-search/web-search-tool.ts", "file:apps/web/lib/web-search/search-budget.ts", "F093-08", "F093-09", "F093-10"]
basis: "code inspection"
second_reader: "not sampled: statements are code readings that nobody has re-checked"
last_reviewed: "2026-11-24"
revision: "f51d16e747"
---
# F093-07 Web search

Web search lets the AGI Workforce assistant look up current facts on the public web during a chat turn. On the web app it is ambient: on whenever the chosen model has a search route. The server decides when a search is required, runs it through one configured provider, caps and meters the calls, and returns numbered sources.

Area: [93. Search, retrieval, and context components](README.md). Requirement items: [S93.09](../../10-requirements/capabilities/093-search-retrieval-and-context-components.md#s9309), [S93.13](../../10-requirements/capabilities/093-search-retrieval-and-context-components.md#s9313), [S93.14](../../10-requirements/capabilities/093-search-retrieval-and-context-components.md#s9314).

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

**What it does.** On Cloud turns, the server gives the model a web_search tool (or the provider's own built-in search), decides whether a search is mandatory for the message, runs the search through the configured provider adapter, and returns up to 5 results as fenced, untrusted, numbered sources [apps/web/lib/web-search/web-search-tool.ts:54-58, 493-550; apps/web/lib/web-search/required-search.ts:186-262].

**Why it exists.** Models answer from training data that goes stale. Search gives current, citable facts, and the per-call limits and charges keep the cost of a bought search call bounded [apps/web/lib/web-search/search-budget.ts:25-31 comment].

**Who uses it.** Anyone chatting with Cloud models on web, mobile, Chrome and the Desktop window that shows the web app; also automated callers (API, CLI, VS Code in Cloud mode, AGI Work, Deep Research, scheduled runs), which are billed differently [apps/web/lib/web-search/search-budget.ts:45-64].

**Problems it solves**

- Stale or invented answers on recent events
- Answers with no sources on turns whose point is current information (required search) [apps/web/lib/web-search/required-search.ts:210-216 comment]
- Unbounded provider spend from a free plan [apps/web/lib/web-search/search-budget.ts:25-31]
- Prompt injection through search snippets (results are fenced as untrusted data) [apps/web/lib/web-search/web-search-tool.ts:539-549]

**Use cases**

- Ask 'who is the current head of a company' and get a sourced answer; the office-holder pattern forces a search [apps/web/lib/web-search/required-search.ts:110-125]
- Type /search followed by a question to force a search on the web composer [apps/web/features/chat/components/Composer/ChatComposerNew.tsx:3190-3205]
- Run an AGI Work task that needs outside facts; search is mandatory there [apps/web/lib/web-search/required-search.ts:190]
- A model without built-in search still searches through the platform tool [apps/web/app/api/llm/v1/chat/completions/lib/request-processor.ts:2520-2530 comment]

## 2. User experience

**Where to find it**

- Web composer (apps/web): no Web search row exists in the + menu. The + menu row labels are listed at ComposerPlusMenu.tsx:147-200 and none is Web search; the 'Deep Research' row at ComposerPlusMenu.tsx:1305-1311 is a different feature. Web search is ambient and follows model support [apps/web/features/chat/components/Composer/ChatComposerNew.tsx:1690-1698].
- Slash command /search on the web composer; it says '/search needs a model that can search the web. Switch to Auto or a search-capable model, then try again.' when no search route exists [apps/web/features/chat/components/Composer/ChatComposerNew.tsx:3190-3199].
- Active tool label 'Web search' shows in the queued follow-up chip and send preview when search is on [apps/web/features/chat/components/Composer/ChatComposerNew.tsx:3409].
- Mobile: a search card (WebSearchToolCard.tsx) and a per-chat webSearch feature switch in the chat view store [apps/mobile/src/features/chat/components/WebSearchToolCard.tsx; apps/mobile/stores/chat/chatExecutionStore.ts:3251-3262].
- Chrome extension: sends web_search: true in the managed request body [apps/extension/src/features/cloud-bridge/freeTrialClient.ts:1603].
- VS Code extension: a 'webSearchSetup' prompt lets the user sign in a Brave Search or Tavily key for the local runtime [apps/extension-vscode/src/features/sidebar-webview/ChatStateManager.ts:2429-2460].
- CLI: its own web_search tool with a saved Brave Search or Tavily key (agi login brave / agi login tavily) [apps/cli/src/features/exec/tools/web/mod.rs:330-362, 432].

**Before you start**

- Cloud mode: signed in, the capability canUseWebSearch granted, and a search backend configured on the server (the /api/me flag generic_web_search) [apps/web/app/api/me/route.ts:283; apps/web/features/chat/components/Composer/ChatComposerNew.tsx:1596-1599].
- A model that has native search, or that supports tools when only the generic backend exists [packages/ai/search/src/web-search-support.ts:32-43].
- Free plan: fewer than 20 search calls in the last 30 days [apps/web/lib/web-search/search-budget.ts:32-33, 133-142].

**Screens and controls**

- Composer: no search toggle on web; /search command; 'Web search' label in tool summary [ChatComposerNew.tsx:3190-3205, 3409].
- Source chips and a 'Sources' tooltip button on assistant messages [apps/web/features/chat/components/messages/MessageBubble.tsx:3859].
- Free-plan send is blocked while the search allowance is 'checking' or 'exhausted' when the message asks for a search [apps/web/features/chat/components/Composer/ChatComposerNew.tsx:1685-1688].

**Journey**

1. 1. The user types a question, or /search then a question.
2. 2. The composer keeps web search on if the model has a search route [ChatComposerNew.tsx:1690-1698].
3. 3. The request goes to the chat completions route with web_search (and search_requested for /search) [apps/web/lib/hooks/useChatStream.ts:4216; request-processor.ts:6250-6260].
4. 4. The server decides if search is required and offers the tool [required-search.ts:218-262].
5. 5. The model calls web_search; the server admits or refuses the call, runs it, ranks and numbers results [tool-loop.ts:2753-2792, 5020-5075].
6. 6. The answer streams with [n] markers and source chips.

**What the person sees and gets**

- Numbered sources under or inside the answer [web-search-tool.ts:533-537].
- Plain failure text for the model to relay: rate limited, timed out, backend error, not configured, or cancelled [web-search-tool.ts:185-211].
- 'No results found for "<query>".' when the provider returns nothing [web-search-tool.ts:513-514].
- On a Free account with no searches left, the model is told the plan has no more searches this period [web-search-tool.ts:552-559].

**Settings**

- Tool-approval policy: search is classed with actions that may ask for approval; the permissive mode still asks (decision pending) [doc: docs/decisions/2026-09-10-managed-gateway-routes.md:36-58; apps/web/app/api/llm/v1/chat/completions/route.ts:588-594].
- Per-chat switch off through a user opt-out phrase in the message [required-search.ts:187-189, 248-262].
- Mobile per-chat webSearch feature switch [chatExecutionStore.ts:3251].

## 3. Current implementation

From reading the code. Not a test result.

**Working in the code**

- Provider registry: providers listed in web-search-providers.json set the order and name the key variable; only a provider with a registered adapter runs [apps/web/lib/web-search/search-provider.ts:109-143; apps/web/lib/web-search/web-search-providers.json:1-9].
- One adapter exists, for Perplexity search over HTTP, with a 15 s timeout [apps/web/lib/web-search/web-search-tool.ts:37-39, 388-397].
- Not-configured message: 'Web search is not configured on this server (no key for ...)' [web-search-tool.ts:399-402, 426].
- Every non-cancelled provider failure moves to the next configured provider; a cancelled call stops [web-search-tool.ts:436-456]. (Only one provider is declared today, so this fall-through has nothing to fall to [web-search-providers.json:1-9].)
- Limits: 5 results per call, 3 calls per chat turn, 10 per AGI Work turn, query cut at 400 characters [web-search-tool.ts:54-58; tool-loop.ts:4668-4672, 5515-5518].
- Required-search classification: explicit mode, work mode, explicit intent, research task, freshness patterns; politeness and transformation requests (write, translate...) do not force a search [required-search.ts:186-262].
- Free plan: 20 calls per rolling 30 days; automated callers and paid plans are charged; a call whose count cannot be read is refused [search-budget.ts:32-33, 133-142].
- Paid and automated calls reserve a charge before the call, then settle or release it; a refused reserve (HTTP 402 or 429) stops the call; any other hold failure lets the call run and queues the charge [search-budget.ts:199-272, 404-428; tool-loop.ts:5020-5075].
- Provider-native search is attached for providers that have it (Anthropic, Google, OpenAI routes), with a max-uses limit set by an environment value [request-processor.ts:2542-2590].
- Results are fenced as untrusted web content, with '<' escaped so the fence cannot be broken [web-search-tool.ts:493-549].
- The model is told how results arrived (for example 'from the search provider's index') [web-search-tool.ts:530-532; packages/contracts/types/src/search-provider.ts:218-232].

**Incomplete**

- The canonical SearchSource builder webSearchSources, which carries the provider delivery tag, has no production caller; only its test calls webSearchSourcesFromOutcome [apps/web/lib/web-search/web-search-tool.ts:484-491; apps/web/lib/web-search/web-search-tool.test.ts:1011]. So the delivery tag reaches the model text but not the persisted source: the persistence reader defaults delivery to 'indexed' and provider to a native-search placeholder because no code writes provider_id or delivery onto the wire [apps/web/app/api/llm/v1/chat/completions/lib/assistant-turn-sources.ts:103, 126-143].
- Only one provider adapter exists, so 'pluggable' is structural, not exercised [web-search-providers.json:1-9; web-search-tool.ts:388-397].

**Present but disconnected or switched off**

- Failover to a second search provider: code path exists, nothing to fail over to [web-search-tool.ts:436-456].
- Web search is switched off per account by a kill switch and per tier by allowSearch; both are read at request time [request-processor.ts:5199-5240; apps/web/lib/services/capability-handshake-service.ts:117].

**Not available**

- Local mode on web: Local and own-key turns do not reach this route [request-processor.ts:4876 comment]; a Local web-search path was not found (unknown).
- Internal Tauri desktop build (not the public Desktop, which shows the hosted web app [doc: AGENTS.md section 5]): has its own search_web tool using Perplexity if a key exists, then DuckDuckGo, then Brave HTML, and does not use the provider list or the meter [apps/desktop/src-tauri/src/core/llm/tool_executor/search_tools.rs:242-300; apps/desktop/src-tauri/src/core/agi/executors/search_executor.rs:3, 429-440, 616-640, 767].
- VS Code extension and CLI in local mode use the CLI's own Brave or Tavily search, not the server provider list [apps/cli/src/features/exec/tools/web/mod.rs:330-362].

## 4. Required behaviour

**Established requirements**

- Public web search goes through pluggable provider adapters selected by configuration. (source: brief S93.09)
- A query planner decides when and what to search (required-search detection, research query plan). (source: brief S93.13)
- Results from any provider are normalized into one source shape (id, url, title, provider, dates). (source: brief S93.14)
- Web search and code execution stay separately capability-, deployment-, policy- and trust-gated, and web search is not an intrinsic model capability. (source: doc: docs/decisions/README.md:135-139; AGENTS.md section 4)
- Web search and page fetches ask before running unless policy allows; the founder decision on making them read-only is pending. (source: doc: docs/decisions/2026-09-10-managed-gateway-routes.md:36-58)
- Local, own-key and Cloud stay separate; nothing routes a Local chat to Cloud silently. (source: doc: AGENTS.md section 6; docs/product/experience-contract.md:353)

**Acceptance criteria**

1. With a configured backend and a search-capable model, a question that needs current facts returns an answer with numbered sources.
2. With no search key on the server, the model is told search is not configured and the composer does not offer search [web-search-tool.ts:399-402; ChatComposerNew.tsx:1596-1608].
3. A fourth web_search call in one chat turn is refused with a budget message; an AGI Work turn allows 10 [tool-loop.ts:5515-5518].
4. A Free account that has used 20 searches in 30 days gets no further searches and the model says so [search-budget.ts:133-142; web-search-tool.ts:552-559].
5. A message asking to write, translate or reformat given text does not force a search [required-search.ts:164-184].
6. Search result text containing a fake closing tag cannot escape the untrusted fence [web-search-tool.ts:539-549].
7. A search with zero results says 'No results found for "<query>"' [web-search-tool.ts:513-514].

**Inferred requirements** (not stated anywhere; reasoned from the code or from competitor parity)

- The failure text carries no error code on purpose, so the answer can explain in plain words [web-search-tool.ts:180-184 comment]; the first draft's 'with the error code' is not what the code does.
- Persisted source provenance should record the real provider and delivery of a generic search result [inferred from assistant-turn-sources.ts:126-143 and the missing producer].

**Proposed improvements** (suggestions, not requirements)

- [proposed] Emit provider_id and delivery on the x_search_results frames so persisted provenance matches what the model was told.
- [proposed] Add a visible search control on the web composer or document that /search plus ambient search is the intended design.
- [proposed] Add a second provider adapter so the fall-through is real and testable.

## 5. Implementation map

| Kind | Name | Path | Role |
|---|---|---|---|
| service | web-search-tool | `apps/web/lib/web-search/web-search-tool.ts` | Tool definition, limits, Perplexity adapter, executeWebSearch, result formatting, failure text, title enrichment, redirect resolution |
| service | search-provider registry | `apps/web/lib/web-search/search-provider.ts` | Provider registry, configured order, delivery lookup, webSearchSources |
| config | web-search-providers.json | `apps/web/lib/web-search/web-search-providers.json` | Declares provider id, host, key variable name and delivery tag |
| service | required-search | `apps/web/lib/web-search/required-search.ts` | Decides if search is required, offer policy for Free, gated-tool substitution |
| service | search-budget | `apps/web/lib/web-search/search-budget.ts` | Free window count, caller kind, charge reservation and settlement |
| config | web-search-pricing.json | `apps/web/lib/web-search/web-search-pricing.json` | Rate card for search calls (contents not read) |
| service | search intent and support helpers | `packages/ai/search/src` | explicit-search-intent, web-search-support (which providers need the generic tool), place-intent, source-ranking |
| service | tool-loop | `apps/web/app/api/llm/v1/chat/completions/lib/tool-loop.ts` | Runs web_search calls, per-turn budget, admission, ranking, numbering, source events |
| service | request-processor | `apps/web/app/api/llm/v1/chat/completions/lib/request-processor.ts` | Capability gate, kill switch, requirement, appendWebSearchTool for native search |
| endpoint | chat completions route | `apps/web/app/api/llm/v1/chat/completions/route.ts` | Entry for web search turns; substitutes the approval-gated search tool |
| endpoint | /api/me | `apps/web/app/api/me/route.ts` | Returns generic_web_search flag the composer reads |
| component | ChatComposerNew | `apps/web/features/chat/components/Composer/ChatComposerNew.tsx` | Ambient search toggle, /search command, Free allowance block |
| hook | useChatStream | `apps/web/lib/hooks/useChatStream.ts` | Sends web_search flag with the request |
| store | mobile chat execution store | `apps/mobile/stores/chat/chatExecutionStore.ts` | Decides webSearchEnabled on mobile from capability and model support |
| component | WebSearchToolCard | `apps/mobile/src/features/chat/components/WebSearchToolCard.tsx` | Mobile search card |
| service | Chrome managed client | `apps/extension/src/features/cloud-bridge/freeTrialClient.ts` | Sends web_search in the managed request |
| service | CLI web tools | `apps/cli/src/features/exec/tools/web/mod.rs` | CLI web_search with Brave or Tavily key; web_fetch with address checks |
| service | VS Code web search setup | `apps/extension-vscode/src/features/sidebar-webview/ChatStateManager.ts` | Prompts for a search key for the local runtime |
| service | Tauri search executor | `apps/desktop/src-tauri/src/core/agi/executors/search_executor.rs` | Internal desktop search: Perplexity, DuckDuckGo, Brave fallbacks |
| service | capability handshake | `apps/web/lib/services/capability-handshake-service.ts` | Grants or removes canUseWebSearch by tier policy and catalog |
| schema | search-provider contract | `packages/contracts/types/src/search-provider.ts` | SearchSource shape, delivery labels, canonical URL |

## 6. Execution and data flow

| Step | Runs on | Source |
|---|---|---|
| The web composer keeps web search on only when the selected model has a search route, and /search marks the turn as search-requested. | device | apps/web/features/chat/components/Composer/ChatComposerNew.tsx:1595-1608, 1690-1698, 3190-3205 |
| The request carries web_search and search_requested to the chat completions route. | device and our servers | apps/web/lib/hooks/useChatStream.ts:4216; apps/web/app/api/llm/v1/chat/completions/lib/request-processor.ts:6250-6260 |
| The server checks canUseWebSearch and a kill switch; if off, web_search and web_fetch are cleared for the turn. | our servers | request-processor.ts:5199-5252 |
| The server classifies whether a search is required and offers the tool: native search for providers that have it, otherwise the platform web_search function when a backend key exists. | our servers | required-search.ts:218-262; request-processor.ts:2563-2590, 6250-6275 |
| When the model calls web_search, the loop checks the per-turn budget, then decides free window, charge or refusal, and reserves a charge. | our servers | tool-loop.ts:5020-5075, 5515-5518; search-budget.ts:133-142, 199-272 |
| executeWebSearch calls the first configured provider; on failure it tries the next. | outside service | web-search-tool.ts:409-476 |
| Results get missing titles filled by fetching the page, are ranked, numbered against the turn's source list, fenced and sent to the model; sources stream to the client. | our servers | tool-loop.ts:2767-2792; web-search-tool.ts:503-550, 733-775 |
| The call is settled against the hold; sources are collected from the stream and saved with the message. | our servers | search-budget.ts:404-428; assistant-turn-sources.ts:190-230 |

**Data**

| What | Stored in | Synced | Kept or deleted |
|---|---|---|---|
| Search query text | Sent to the search provider; not stored by the search code found | no | Provider retention unknown; not in the code |
| Search results as cited sources | Assistant message metadata, up to 20 sources per turn | yes, with the conversation | Follows the conversation; sources capped at 20 [assistant-turn-sources.ts:86] |
| Search charge and cost records | Managed usage ledger and cost ledger (table names not traced) | server only | unknown |
| Page title and description cache | In-process memory on the server, 24 hours | no | Expires after one day [web-search-tool.ts:598-601] |

**Models and providers.** The generic path uses a search provider (Perplexity over HTTP) chosen by configuration and independent of the chat model. Anthropic, Google and OpenAI routes can use the provider's own search tool instead [request-processor.ts:2563-2590]. Whether a model can search comes from the model catalog 'search' capability or the tools capability plus a configured backend [packages/ai/search/src/web-search-support.ts:32-43]. The search call does not go through packages/ai/providers/perplexity; it calls api.perplexity.ai directly [web-search-tool.ts:37, 388-397].

## 7. Access and usage rules

| Rule | What the code does |
|---|---|
| Account | Signed-in Cloud account; the server gate runs per user [request-processor.ts:5199-5240]. |
| Permissions | Capability canUseWebSearch, a kill switch, and the tool-approval policy; search and fetch are treated as actions that can send data out [request-processor.ts:5224-5238; doc: docs/decisions/2026-09-10-managed-gateway-routes.md:44-51]. |
| Subscription | Free plan can search (contract expectation: allowed) within 20 calls per 30 days; on Free the tool is offered only when the turn needs it for the plan's own model [packages/contracts/cloud-contracts/src/capability-handshake.ts:57-59; search-budget.ts:32-33; required-search.ts:229-246]. Paid plans are charged per call to managed credits [search-budget.ts:133-136]. Per-tier allowSearch values were not enumerated (unknown) [packages/contracts/types/src/model-catalog.ts:1092]. |
| Limits and metering | 5 results per call; 3 calls per chat turn, 10 per AGI Work turn; 15 s timeout; 400-character query; reservation lease 300 s; Free 20 per 30 days [web-search-tool.ts:39, 54-58; search-budget.ts:196-197, 32-33]. Provider-native search has its own max-uses and a Google grounding pool [request-processor.ts:2542-2561; apps/web/lib/web-search/grounding-pool.ts]. |
| Feature flags | generic_web_search (from /api/me), kill switch for canUseWebSearch, mobile FEATURES.webSearch, tier policy allowSearch [apps/web/app/api/me/route.ts:283; apps/mobile/stores/chat/chatExecutionStore.ts:3253]. |
| Model compatibility | A model needs native search or tools support; unknown models default to allowed on the server tool path [request-processor.ts:2630-2640 comment region; web-search-support.ts:32-43]. |
| Provider restrictions | Generic search provider needs its key variable (PERPLEXITY_API_KEY) set on the server [web-search-providers.json:5; web-search-tool.ts:392-393]. Native search exists only on providers that implement the harness feature. |
| Local mode | A Local or own-key turn does not reach the managed chat route [request-processor.ts:4876 comment], so server search does not run. Whether the web composer offers any search in Local mode: unknown. The internal Tauri build and the CLI search on the device with their own keys (Tauri: Perplexity key optional, DuckDuckGo and Brave without a key; CLI: Brave or Tavily key required) [search_executor.rs:767, 616-640; cli mod.rs:340-362, 432]. |

## 8. States and edge cases

| State | Behaviour | Source |
|---|---|---|
| No search key configured | Tool returns not_configured; the model is told not to retry; the web composer turns search off when the backend flag is false | web-search-tool.ts:204-205, 426; ChatComposerNew.tsx:1596-1608, 1690-1698 |
| Rate limited (HTTP 429) or server error | Marked retryable; one automatic transient retry with a 400 ms delay is defined; the model may try once more | web-search-tool.ts:158-162, 343-349, 192-203 |
| Timeout | Returns timeout; model told it did not answer in time | web-search-tool.ts:39, 197-198 |
| Cancelled by user | Returns cancelled and stops the provider loop | web-search-tool.ts:413, 454 |
| Empty results | 'No results found for ...' to the model; searchOutcome no_results flagged | web-search-tool.ts:513-514; tool-loop.ts:2788-2790 |
| Turn source budget full | Extra results are not shown or numbered; model told | web-search-tool.ts:516-529 |
| Self-contained request (write or render from the chat) | Search call refused with 'No web search was performed' unless search was required | tool-loop.ts:2758-2766 |
| Free plan exhausted | Call refused; model told the plan has no more searches this period | search-budget.ts:133-142; tool-loop.ts:5040-5052 |
| Charge cannot be reserved (402 or 429) | Call does not run; unaffordable message to the model | search-budget.ts:246-260 |
| Offline or reconnect | not handled in the code found for search specifically | none found |
| Accessibility | not traced for search UI | unknown |

## 9. Verification

What has actually been seen by a person is in the Status table above. This section lists what exists to check with.

**Existing tests**

- `apps/web/lib/web-search/web-search-tool.test.ts`: 66 cases: tool definition, key check, not-configured, failure messages, results formatting, fencing, provider order and fall-through, domain filter, citation numbering, redirect resolution
- `apps/web/lib/web-search/required-search.test.ts`: 47 cases: when search is offered versus forced, AGI Work, intent, freshness, transformation requests
- `apps/web/lib/web-search/search-budget.test.ts`: 27 cases: caller kind, Free count window, charge reservation and settlement
- `apps/web/lib/web-search/search-provider.test.ts`: 9 cases: provider list shape, hosts, runtime registration
- `apps/web/app/api/llm/v1/chat/completions/lib/tool-loop.web-search.test.ts`: 14 cases: end-to-end web_search call, 5-result cap on Free, per-turn source cap
- `apps/web/app/api/llm/v1/chat/completions/lib/tool-loop.required-search.test.ts`: required-search behaviour in the loop (titles only inspected by name)
- `apps/web/e2e/tool-approval-web-search.spec.ts`: approval prompt for web search in the browser (contents not read)
- `apps/web/lib/web-search/perplexity-search-cost.test.ts`: search cost computation

**Test scenarios**

- **Fresh fact forces a search**
  1. Sign in on web Cloud with Auto selected
  2. Ask who currently holds a public office
  3. Watch the tool timeline and the answer
  - Expected: A web_search runs and the answer shows numbered source chips.
- **Per-turn cap**
  1. Ask a broad multi-part question that tempts many searches
  2. Count web_search calls in the turn
  - Expected: No more than 3 calls (10 in AGI Work); later calls get a budget message.
- **Free allowance**
  1. Use a Free test account
  2. Run 20 searches in a window, then a 21st
  - Expected: The 21st is refused and the answer says the plan has no more searches this period.
- **No backend**
  1. Run a local server with no search key
  2. Open the web composer
  - Expected: Search is off; /search says it needs a search-capable model.
- **Prompt-injection snippet**
  1. Use a test provider returning a snippet with a fake closing tag
  - Expected: The fence stays intact and the model is told results are data only.

**Where to look when it fails**

- Log events search_charge_refused, search_charge_deferred, search_charge_unsettled, search_budget_count_unreadable [search-budget.ts:106-111, 240-262, 355-362].
- Error codes invalid_tool_input, not_configured, rate_limited, upstream_error, cancelled, timeout [web-search-tool.ts:102-108].
- Tracing span attributes web_search.required and web_search.source [required-search.ts:222-225].

**Hands-on test plans**

- none: not built on any app

## 10. Gaps and dependencies

- **Persisted provenance loses the real provider and delivery of generic search results.** Affects: Web, mobile, Chrome Cloud turns. Evidence: assistant-turn-sources.ts:126-143 defaults; no writer of provider_id or delivery in tool-loop.ts or research-loop.ts. Work needed: Emit provider_id and delivery on source frames or route results through webSearchSources.
- **Only one search provider adapter, so fall-through is untested in production.** Affects: All Cloud search. Evidence: web-search-providers.json:1-9. Work needed: Add a second adapter or drop the unused claim.
- **Desktop internal build, CLI and VS Code use separate search code with different providers and no shared meter.** Affects: Tauri build, CLI, VS Code in Local. Evidence: search_executor.rs:3; cli mod.rs:330-362. Work needed: Decide whether Local search should share the adapter list; document the boundary.
- **Local-mode search on web and mobile is unknown.** Affects: Local chat users. Evidence: request-processor.ts:4876 comment; no Local search path found. Work needed: Trace the local runtime and state the rule.
- **No explicit search control on the web composer.** Affects: Web users who want to switch search off for one chat. Evidence: ComposerPlusMenu.tsx:147-200 labels; ChatComposerNew.tsx:1690-1698. Work needed: Confirm the ambient design against docs/product/experience-contract.md 'Tool/research/search selector'.
- **Approval default for search is a pending founder decision.** Affects: All Cloud users. Evidence: docs/decisions/2026-09-10-managed-gateway-routes.md:36-58. Work needed: Founder decision, then copy and policy alignment.

**Depends on**

- SYS-chat-turn-pipeline
- SYS-subscriptions-entitlements-and-usage
- SYS-model-catalog-and-routing
- SYS-execution-boundaries
- SYS-security-and-privacy
- SYS-agents-tools-and-automation
- mode:cloud
- file:apps/web/lib/web-search/web-search-tool.ts
- file:apps/web/lib/web-search/search-budget.ts
- F093-08
- F093-09
- F093-10

## Unknown

- Whether the transient retry constant (1 retry, 400 ms) is applied inside the Perplexity adapter (constants at web-search-tool.ts:158-160; use site not read).
- Per-tier allowSearch values.
- Search behaviour in Local mode on web and mobile.
- Provider-side retention of queries.
- Names of the ledger tables that hold search charges.
- Mobile and Chrome rendering of search failures.
