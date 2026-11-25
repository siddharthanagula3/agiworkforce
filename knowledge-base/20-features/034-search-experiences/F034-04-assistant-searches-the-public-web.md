---
id: "F034-04"
type: "feature"
title: "Assistant searches the public web"
aliases: ["Web search", "Public web search", "Search the web", "web_search tool", "/search", "Agentic search", "Set up web search", "Allow and deny domains", "research_sources", "S34.07", "S34.08", "S34.18", "S34.31"]
area: "34 Search experiences"
available_on: ["web", "desktop", "mobile", "cli", "vscode", "chrome"]
implementation: {web: "built", desktop: "built", mobile: "built", cli: "partial", vscode: "partial", chrome: "partial"}
verification: {web: "not seen by a person", desktop: "not seen by a person", mobile: "not seen by a person", cli: "not seen by a person", vscode: "not seen by a person", chrome: "not seen by a person"}
requirement_items: ["S34.07", "S34.08", "S34.18", "S34.31"]
depends_on: ["surface:web", "surface:desktop", "surface:mobile", "surface:cli", "surface:vscode", "surface:chrome", "mode:cloud", "mode:own-key", "provider:perplexity", "SYS-model-catalog-and-routing", "SYS-subscriptions-entitlements-and-usage", "SYS-chat-turn-pipeline", "SYS-security-and-privacy", "SYS-execution-boundaries"]
basis: "code inspection"
second_reader: "not sampled: statements are code readings that nobody has re-checked"
last_reviewed: "2026-11-24"
revision: "f51d16e747"
---
# F034-04 Assistant searches the public web

A chat can look up current information on the internet and answer with cited sources. Web, Desktop, Mobile and Chrome use the Cloud service, which turns search on by itself when the model has a search route. The CLI and VS Code need the user's own search key outside Cloud. The API accepts allowed and denied sites.

Area: [34. Search experiences](README.md). Requirement items: [S34.07](../../10-requirements/capabilities/034-search-experiences.md#s3407), [S34.08](../../10-requirements/capabilities/034-search-experiences.md#s3408), [S34.18](../../10-requirements/capabilities/034-search-experiences.md#s3418), [S34.31](../../10-requirements/capabilities/034-search-experiences.md#s3431).

## Status

Two separate questions: is the code there, and has a person seen it work. "Seen working" comes only from results of real runs recorded in the project's ledger.

| App | In the code: this page's reading, 2026-11-24 | In the code: ledger audit, 2026-09-26 and later updates | Seen working by a person |
|---|---|---|---|
| Web | built | built | not seen by a person |
| Desktop | partly built (this page lists unfinished parts) | built | not seen by a person |
| Mobile | partly built (this page lists unfinished parts) | built | not seen by a person |
| CLI | partly built | partly built | not seen by a person |
| VS Code | partly built | partly built | not seen by a person |
| Chrome | built (this page lists unfinished parts) | partly built | not seen by a person |

The first column was derived from this page's text by a second, cheaper pass and has not been validated item by item; the ledger column is the project's own record. Neither is a test result.

## 1. Purpose and user value

**What it does.** Gives the model a web_search tool (or the provider's own search). The service runs the search, returns up to five results with title, link, snippet and dates, and the answer cites them. Search can be required for a turn when the question asks for it or is time-bound.

**Why it exists.** Models do not know recent facts. ChatGPT and Claude search automatically and the founders decided the same (doc: docs/decisions/2026-09-15-founder-decisions.md D-2026-09-15-01).

**Who uses it.** Everyone asking about current events, prices, versions or facts; developers using the API who need to limit sites.

**Problems it solves**

- Answers from stale training data
- Answers with no sources
- Unwanted or unsafe sites as sources

**Use cases**

- Ask 'who is the current president of India' and get a cited answer
- CLI user runs /search to force a search for one question
- API caller sends allow_domains=['nature.com'] so only that site is used

## 2. User experience

**Where to find it**

- Web, Desktop, Mobile, Chrome: nothing to press; search is automatic when available. The composer shows 'Web search' among active tools (apps/web/features/chat/components/Composer/ChatComposerNew.tsx:3409).
- Mobile: Settings > capabilities, group 'AGI Cloud', row 'Web search' with a switch and the text 'Let Cloud models search the web for current information.' (apps/mobile/src/features/settings/capabilities/index.tsx:211-218).
- CLI: '/search <question>' (apps/cli/src/tui/tui_app.rs:6418; apps/cli/src/repl/slash_commands.rs:352); key saved with 'agi login brave' or 'agi login tavily' (apps/cli/src/features/exec/tools/web/mod.rs:432).
- VS Code: the plus menu item 'Set up web search' (apps/extension-vscode/src/features/sidebar-webview/webviewContent.ts:3274).
- Web Deep Research plan card: 'Only this site' and 'Never this site' (apps/web/features/chat/components/research/ResearchActivity.tsx:198-203).
- API: research_sources.allow_domains and deny_domains on the chat request (apps/web/public/openapi.json:769-794).

**Before you start**

- Cloud (managed) route with the web search capability on the plan, or a model with a native search route; or in CLI/VS Code outside Cloud, the user's own Brave Search or Tavily key.
- Free plan: unused allowance of the 20 searches per 30 days.

**Screens and controls**

- Composer: no search switch on Web; the tool toggles on its own (ChatComposerNew.tsx:1692-1698).
- Composer notice when the Free allowance is used: 'Your Free plan has used its <limit> web searches in the last <days> days. You can keep chatting without web search or try again ...' (ChatComposerNew.tsx:5364-5372).
- Mobile switch 'Web search'.
- CLI /search and VS Code 'Set up web search' key picker (Brave Search or Tavily).

**Journey**

1. Ask a question. Say 'search the web for ...' or use time words such as 'this year' to make search required for that turn.
2. The service runs up to three searches (ten for AGI Work), reads the results and writes the answer with citations.
3. Citations show site, title, snippet and the publication or retrieval date when known; open the source from the chip or card.
4. If search is unavailable the answer says so instead of inventing sources.
5. CLI: type /search question; if no key is saved it prints how to save one.

**What the person sees and gets**

- Cited answer with source cards.
- CLI refusal texts: 'Web search is not available on this account right now.', '/search needs a model that can search the web...', or '/search needs a web search key in this session...' (apps/cli/src/agent/chat.rs:838-862).
- CLI after a failed call: 'Web search is unavailable: <service> answered HTTP <n>. Nothing was found, so do not cite web sources for this.' (web/mod.rs:462-466).
- Nothing found: tool text says the search found nothing and to answer without web sources (web/mod.rs:495-503).

**Settings**

- Mobile 'Web search' switch (turns web_search false in requests when off, chatExecutionStore.ts:3388-3391).
- CLI: BRAVE_SEARCH_API_KEY, TAVILY_API_KEY, SEARCH_API_KEY environment names or saved login (web/mod.rs:340-362).
- Workspace administrators can set allowed and blocked sites (request-processor.ts:5262-5280).

## 3. Current implementation

From reading the code. Not a test result.

**Working in the code**

- Server tool: 5 results, 3 calls per normal turn, 10 per AGI Work turn, query cut at 400 characters, 15 second timeout, 1 retry after 400 ms on rate limit or server error (apps/web/lib/web-search/web-search-tool.ts:54-58, :39, :159-160).
- Search service is configured from web-search-providers.json: one provider entry, api.perplexity.ai, key name PERPLEXITY_API_KEY, delivery 'indexed' (apps/web/lib/web-search/web-search-providers.json; web-search-tool.ts:37).
- Results become canonical sources with publication, index and retrieval times (apps/web/lib/web-search/search-provider.ts:150-180).
- Domain policy: workspace, agent and request rules are combined; rules are capped at 32; deny wins over allow; up to 20 allow rules (or deny rules as '-domain') go to the search service and every result is re-checked before the model sees it (apps/web/app/api/llm/v1/chat/completions/lib/research-sources.ts:19-60; web-search-tool.ts:144-155; request-processor.ts:5262-5290).
- Required search: explicit mode, work mode, explicit words, freshness phrases and research tasks make search mandatory (apps/web/lib/web-search/required-search.ts:218-232).
- Composer keeps search on whenever the model or Cloud has a search route; Free sends are blocked when the allowance is checking or exhausted (ChatComposerNew.tsx:1596-1698).
- Budget: Free interactive turns draw on the 20 per 30 days allowance; paid plans and automated callers (api, cli, vscode, AGI Work, research, scheduled) are charged credits (apps/web/lib/web-search/search-budget.ts:32-33, :54-100, :133-142).
- Mobile sends web_search, web_fetch and search_requested to Cloud (apps/mobile/stores/chat/chatExecutionStore.ts:3251-3262, :3388-3394).
- CLI: Brave Search or Tavily with 5 default results, 15 second timeout, untrusted-content wrapping and workspace site rules (apps/cli/src/features/exec/tools/web/mod.rs:330-362, :391-525).
- VS Code: 'Set up web search' runs the provider sign-in command; a gate message appears when the account lacks the capability (ChatStateManager.ts:2365-2377, :2442-2459).
- Chrome: managed chat turns on web search and fetch when the routed model searches (apps/extension/src/features/cloud-bridge/managedChatHandler.ts:781-782); the side panel renders source cards with site, title, snippet and published date (apps/extension/src/features/side-panel/sources.ts:36-45).
- Deep Research plan card on Web lets the user choose 'Only this site' and 'Never this site'; they are sent as research_sources (ResearchActivity.tsx:198-203; apps/web/lib/hooks/useChatStream.ts:4605).

**Incomplete**

- CLI has no domain allow or deny control and no freshness dates on results (web/mod.rs:365-390) [inferred: dates not carried by WebSource in the code read].
- The CLI search path shows no retry on a rate limit (web/mod.rs:441-470).
- Domain limits reach people only through the Deep Research plan card and the API, not an ordinary chat control.

**Present but disconnected or switched off**

- none found. The old composer search switch was replaced by automatic behaviour (comment at ChatComposerNew.tsx:1690-1693).

**Not available**

- Mobile Local mode: no on-device web search route found; the search flags are part of the Cloud request body (chatExecutionStore.ts:3388).
- Local privacy mode refusal of network access: established only as a prompt sentence in VS Code (ChatStateManager.ts:284); no enforcing code was confirmed for search specifically.

## 4. Required behaviour

**Established requirements**

- A chat can search the public web and answer from the results. (source: capability ledger `audit/ledger/ecosystem-capability-ledger.jsonl`, item S34.07)
- The user can restrict a web search to named sites; include and exclude domains are respected; allowed and denied sites up to 32 each; denied wins. (source: capability ledger `audit/ledger/ecosystem-capability-ledger.jsonl`, item S34.08, S34.18)
- Results and sources show how fresh they are. (source: capability ledger `audit/ledger/ecosystem-capability-ledger.jsonl`, item S34.31)
- Free keeps 20 searches per 30 days; paid plans include no free searches and every search is charged in credits at provider cost, shown as 'Agentic search'. (source: doc: docs/decisions/2026-09-15-founder-decisions.md D-2026-09-15-16)
- Web search, page fetch and read run without asking in the default read-only mode. (source: doc: docs/decisions/2026-09-15-founder-decisions.md D-2026-09-15-01)
- If search is unavailable the answer must say so and not invent sources. (source: apps/cli/src/features/exec/tools/web/mod.rs:462-466; apps/extension-vscode/src/features/sidebar-webview/ChatStateManager.ts:283-284)
- Web search and memory are provider-route or harness features, never described as intrinsic model abilities. (source: doc: AGENTS.md section 4)

**Acceptance criteria**

1. Asking 'search the web for <topic>' on Web returns a cited answer with at most 5 sources per search and no more than 3 searches.
2. A question with 'this year' triggers a search without the words 'search the web'.
3. With a Free account that has used 20 searches in 30 days, an explicit search request cannot be sent and the composer shows the allowance message.
4. A request with deny_domains ['example.com'] never returns a result from example.com, even if the provider returns one.
5. A request with the same domain in allow and deny never reads that domain.
6. With no search route, the answer says search is unavailable and lists no invented sources.
7. CLI /search without a saved key prints the key instructions and sends nothing.
8. Mobile switch 'Web search' off sends web_search false.

**Inferred requirements** (not stated anywhere; reasoned from the code or from competitor parity)

- Freshness dates should appear in CLI and VS Code too [inferred from S34.31 and Web behaviour].
- Local privacy mode must never call a search service unless the user gave a key and consent [inferred from doc: AGENTS.md section 6].

**Proposed improvements** (suggestions, not requirements)

- [proposed] Offer a domain control for ordinary chats, not only Deep Research and the API.
- [proposed] Add a rate-limit retry to the CLI search path to match the server.
- [proposed] Show dates in CLI results.

## 5. Implementation map

| Kind | Name | Path | Role |
|---|---|---|---|
| service | web_search tool | `apps/web/lib/web-search/web-search-tool.ts` | Tool definition, limits, provider call, retries, domain filter, result checks. |
| service | search provider registry | `apps/web/lib/web-search/search-provider.ts` | Provider interface, configured providers, canonical sources with dates and delivery tag. |
| config | web-search-providers.json | `apps/web/lib/web-search/web-search-providers.json` | Declares the search service host and key name. |
| service | required-search | `apps/web/lib/web-search/required-search.ts` | Decides when search is mandatory; offer policy for Free; native search tool classification and substitution. |
| service | search-budget | `apps/web/lib/web-search/search-budget.ts` | Free allowance, caller kind, charge reservation and settlement. |
| service | research-sources domain policy | `apps/web/app/api/llm/v1/chat/completions/lib/research-sources.ts` | Domain allow/deny normalisation, cap 32, narrowing, directive text. |
| endpoint | POST chat completions | `apps/web/app/api/llm/v1/chat/completions/lib/request-processor.ts` | Accepts research_sources (line 730), narrows domain policy (5262-5290), builds tools. |
| config | openapi research_sources | `apps/web/public/openapi.json` | Public description of allow_domains and deny_domains (lines 769-794). |
| component | ChatComposerNew (search logic) | `apps/web/features/chat/components/Composer/ChatComposerNew.tsx` | Automatic search toggle, Free allowance block and notice (1596-1698, 5364). |
| hook | useChatStream | `apps/web/lib/hooks/useChatStream.ts` | Sends research_sources and web flags. |
| component | ResearchActivity plan card | `apps/web/features/chat/components/research/ResearchActivity.tsx` | 'Only this site' and 'Never this site' controls. |
| component | CitationChip / ResearchPanel | `packages/ui/unified-chat/src/components/markdown/CitationChip.tsx` | Shows source site, snippet and date on Web and Desktop. |
| store | chatExecutionStore | `apps/mobile/stores/chat/chatExecutionStore.ts` | Mobile web search flags in the Cloud request. |
| screen | Mobile capabilities | `apps/mobile/src/features/settings/capabilities/index.tsx` | 'Web search' switch. |
| component | WebSearchResultCard | `apps/mobile/src/features/chat/components/WebSearchResultCard.tsx` | Mobile result card. |
| command | execute_web_search | `apps/cli/src/features/exec/tools/web/mod.rs` | CLI search against Brave Search or Tavily. |
| command | /search and search_refusal | `apps/cli/src/agent/chat.rs` | search_next_turn and refusal sentences (lines 838-862, 1148). |
| service | VS Code web search setup | `apps/extension-vscode/src/features/sidebar-webview/ChatStateManager.ts` | Gate, setup picker, request prompt. |
| service | Chrome managed chat handler | `apps/extension/src/features/cloud-bridge/managedChatHandler.ts` | Turns on webSearch and webFetch for routed models that search. |
| component | Chrome source cards | `apps/extension/src/features/side-panel/sources.ts` | Source card with site, title, snippet and published date. |
| test | web-search tests | `apps/web/lib/web-search/web-search-tool.test.ts` | Tool tests. |

## 6. Execution and data flow

| Step | Runs on | Source |
|---|---|---|
| Composer or app decides search is available and sets web_search on the request (Web: automatic; Mobile: switch; Chrome: managed handler). | device | ChatComposerNew.tsx:1692-1698; chatExecutionStore.ts:3388; managedChatHandler.ts:781 |
| The Cloud chat service classifies whether search is required, merges workspace, agent and request domain rules, and offers the search tool. | our servers | required-search.ts:218-248; request-processor.ts:5262-5290 |
| Before each search the budget is checked (Free window or credit reservation). | our servers | search-budget.ts:133-142 |
| The service calls the search provider with the query and domain filter and retries once on 429 or 5xx. | outside service | web-search-tool.ts:37, :159-162 |
| Results are filtered by the domain policy, wrapped as untrusted web results and given to the model. | our servers | web-search-tool.ts:493 (untrusted tag) |
| The model writes the answer; the app shows citations and cards. | device and our servers | CitationChip.tsx; sources.ts |
| CLI outside Cloud: the tool calls Brave Search or Tavily directly from the machine with the user's key. | outside service | apps/cli/src/features/exec/tools/web/mod.rs:441-470 |

**Data**

| What | Stored in | Synced | Kept or deleted |
|---|---|---|---|
| Search query text and results | Sent to the search provider; sources saved in the assistant message metadata | With the conversation | Follows the chat; provider retention unknown |
| Search call usage and charges | Rate card feature usage in the billing store (web_search_perplexity, web_search_grounding) | Server-side | Counted over a rolling 30 days (search-budget.ts:33) |
| CLI search key | Saved login on the machine or environment variable | No | Until the user removes it |

**Models and providers.** Search runs through the platform's search provider (Perplexity search API per web-search-providers.json) or, for some models, the model provider's own search tool; four tool shapes are recognised (generic function, OpenAI hosted, Anthropic server, Google built-in) (required-search.ts:260-295). The model must accept tools; a model without tools gets single-turn handling (route.ts:792-794). CLI uses Brave Search or Tavily.

## 7. Access and usage rules

| Rule | What the code does |
|---|---|
| Account | Cloud search needs a signed-in account. CLI outside Cloud needs only a search key. VS Code needs a key for Local or own-key use. |
| Permissions | Capability canUseWebSearch decides access (ChatComposerNew.tsx:1599; ChatStateManager.ts:2358). Workspace policy can block sites. Tool approval default lets search run unasked (doc: docs/decisions/2026-09-15-founder-decisions.md D-2026-09-15-01). |
| Subscription | Free: 20 included calls per 30 days; paid: no included calls, charged in credits (doc: docs/decisions/2026-09-15-founder-decisions.md D-2026-09-15-16; search-budget.ts:66-68, :133-142). API, CLI, VS Code, AGI Work, research and scheduled runs are charged to credits even on Free. |
| Limits and metering | 5 results per call; 3 calls per turn (10 for AGI Work); 400-character query; 15 second timeout; up to 32 domain rules, 20 forwarded to the provider. |
| Feature flags | generic_web_search billing flag (ChatComposerNew.tsx:1596); FEATURES.webSearch on Mobile (apps/mobile/lib/v1FeatureFlags.ts:22); kill switch for capabilities. |
| Model compatibility | Needs a model with native search, or tools plus the generic backend; Auto uses the generic backend flag (ChatComposerNew.tsx:1602-1616). Free plan on its own model is offered search only when required (required-search.ts:236-246). |
| Provider restrictions | Native search shapes depend on the model's provider route; the platform search needs PERPLEXITY_API_KEY configured (name only). |
| Local mode | Local mode on a phone or desktop does not use the Cloud search route; no on-device search was found. CLI Local needs the user's own Brave or Tavily key and sends the query to that service; whether Local privacy mode blocks it is unknown. |

## 8. States and edge cases

| State | Behaviour | Source |
|---|---|---|
| Search unavailable | Answer must state it; client shows 'unavailable web search' state from agent activity (ChatMessageList.tsx:1489). | apps/web/features/chat/components/messages/ChatMessageList.tsx:1489-1491 |
| Rate limited or server error | One retry after 400 ms then an error outcome. | web-search-tool.ts:159-162 |
| Timeout / cancel | Timeout code after 15 seconds; cancelled code on user cancel. | web-search-tool.ts:39, :156 |
| Free allowance exhausted | Composer shows message and blocks explicit search sends; unknown state shows a separate notice. | ChatComposerNew.tsx:3595, :5364-5390 |
| All results on denied sites | CLI says every result was on a site the workspace does not allow. | web/mod.rs:482-493 |
| No key (CLI) | Instructions to save a key. | web/mod.rs:431-434 |
| Domain conflict across workspace and request | Request refused with 403. | request-processor.ts:5282-5297 |
| Long query | Cut to 400 characters and flagged queryTruncated. | web-search-tool.ts:58, :108 |
| Offline | not handled in the code beyond failure outcomes. | apps/cli/src/features/exec/tools/web/mod.rs:441-447 (request failure message only) |
| Accessibility of citations | Chrome citation links describe their card with aria-describedby. | sources.ts:48-52 |

## 9. Verification

What has actually been seen by a person is in the Status table above. This section lists what exists to check with.

**Existing tests**

- `apps/web/lib/web-search/web-search-tool.test.ts`: Search tool behaviour (large file; contents not read).
- `apps/web/lib/web-search/required-search.test.ts`: Required-search classification (contents not read).
- `apps/web/lib/web-search/search-budget.test.ts`: Free allowance and charging (contents not read).
- `apps/web/lib/web-search/search-provider.test.ts`: Provider registry and sources.
- `apps/web/app/api/llm/v1/chat/completions/lib/request-processor.web-domain-rules.test.ts`: Domain rules on the chat request (contents not read).
- `apps/web/lib/web-search-support.test.ts`: Which models and routes can search.
- `apps/web/__tests__/web-search-model-coverage.test.ts`: Model coverage for web search.
- `apps/web/lib/web-search/page-metadata-egress.test.ts`: Metadata fetch egress rules.
- `apps/cli/src/features/exec/tools/web/mod.rs`: In-file tests for fetch safety and the Tavily request body; no test of execute_web_search itself found.

**Test scenarios**

- **Freshness phrase**
  1. Web, signed in on a plan with search: ask 'what happened last week in AI?'
  - Expected: A search runs and sources are cited without saying 'search'.
- **Deny list**
  1. Send an API request with research_sources.deny_domains ['example.com'] and a question that example.com ranks for.
  - Expected: No example.com source in the answer or the tool result.
- **Free allowance**
  1. Use a Free test account with 20 searches in 30 days and send 'search the web for x'.
  - Expected: Send is blocked and the allowance message shows.
- **CLI without key**
  1. Unset search keys; run /search question.
  - Expected: Refusal text naming agi login brave or tavily; no request sent.
- **Mobile switch off**
  1. Turn 'Web search' off in Settings and ask a news question.
  - Expected: Request carries web_search false; answer has no search sources.
- **Provider outage**
  1. Make the search provider return 500.
  - Expected: One retry, then the answer says search was unavailable.

**Where to look when it fails**

- Span attributes web_search.required and web_search.source (required-search.ts:221-225).
- Log events search_budget_count_invalid / search_budget_count_unreadable (search-budget.ts).
- Error codes not_configured, rate_limited, upstream_error, cancelled, timeout (web-search-tool.ts:126-132).
- Response header X-Quota-Warning.

**Hands-on test plans**

- Web: [70-qa/test-plans/web/034-search-experiences.md](../../70-qa/test-plans/web/034-search-experiences.md)
- Desktop: [70-qa/test-plans/desktop/034-search-experiences.md](../../70-qa/test-plans/desktop/034-search-experiences.md)
- Mobile: [70-qa/test-plans/mobile/034-search-experiences.md](../../70-qa/test-plans/mobile/034-search-experiences.md)
- CLI: [70-qa/test-plans/cli/034-search-experiences.md](../../70-qa/test-plans/cli/034-search-experiences.md)
- VS Code: [70-qa/test-plans/vscode/034-search-experiences.md](../../70-qa/test-plans/vscode/034-search-experiences.md)
- Chrome: [70-qa/test-plans/chrome/034-search-experiences.md](../../70-qa/test-plans/chrome/034-search-experiences.md)

## 10. Gaps and dependencies

- **Brief says no app screen exposes domain limits; Web's Deep Research plan card does.** Affects: Documentation accuracy. Evidence: ResearchActivity.tsx:198-203; WebChatPage.tsx:6270. Work needed: Correct the brief; decide whether ordinary chats need the control.
- **CLI results carry no dates and no domain restriction control.** Affects: CLI users. Evidence: apps/cli/src/features/exec/tools/web/mod.rs:365-390. Work needed: Carry date fields and pass site rules.
- **No enforcing code confirmed for 'Local privacy mode refuses network access' for search.** Affects: Local mode on CLI and VS Code. Evidence: Only a prompt sentence at ChatStateManager.ts:284. Work needed: Verify and test the privacy boundary on search; document it.
- **Mobile and Desktop Local modes have no web search route.** Affects: Local mode users. Evidence: chatExecutionStore.ts:3388. Work needed: Decide whether Local mode may use an own-key search service.
- **Brief says Chrome shows no freshness; the side panel renders publishedDate.** Affects: Documentation accuracy. Evidence: sources.ts:42-44. Work needed: Correct the brief.

**Depends on**

- surface:web
- surface:desktop
- surface:mobile
- surface:cli
- surface:vscode
- surface:chrome
- mode:cloud
- mode:own-key
- provider:perplexity
- SYS-model-catalog-and-routing
- SYS-subscriptions-entitlements-and-usage
- SYS-chat-turn-pipeline
- SYS-security-and-privacy
- SYS-execution-boundaries

## Unknown

- Whether the Perplexity search folder under packages/ai/providers is the code behind web-search-providers.json.
- Whether Local privacy mode blocks web search in CLI.
- Which models count as search capable at a given time (catalog-driven).
- Contents of most web-search tests (names only).
- Whether the desktop Tauri build has its own search path.
- Provider data retention for search queries.
