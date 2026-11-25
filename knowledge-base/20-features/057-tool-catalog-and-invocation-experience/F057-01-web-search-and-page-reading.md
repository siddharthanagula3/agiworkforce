---
id: "F057-01"
type: "feature"
title: "Web search and page reading"
aliases: ["Search tool", "web_search", "Web search", "Fetch-page tool", "url_fetch", "web_fetch", "WebSearch", "WebFetch", "Source-reader tool", "S57.01", "S57.02", "S57.03", "Deep Research (related, separate feature)"]
area: "57 Tool catalog and invocation experience"
available_on: ["web", "desktop", "mobile", "cli", "vscode", "chrome"]
implementation: {web: "partial", desktop: "partial", mobile: "partial", cli: "built", vscode: "built", chrome: "partial"}
verification: {web: "not seen by a person", desktop: "not seen by a person", mobile: "not seen by a person", cli: "not seen by a person", vscode: "not seen by a person", chrome: "not seen by a person"}
requirement_items: ["S57.01", "S57.02", "S57.03"]
depends_on: ["SYS-chat-turn-pipeline", "SYS-subscriptions-entitlements-and-usage", "SYS-inference-providers", "SYS-execution-boundaries", "SYS-security-and-privacy", "SYS-model-catalog-and-routing", "surface:web", "surface:desktop", "surface:mobile", "surface:cli", "surface:vscode", "surface:chrome", "mode:cloud", "mode:own-key", "mode:local", "file:apps/web/lib/web-search/web-search-tool.ts", "file:apps/web/lib/url-fetch/url-fetch-tool.ts"]
basis: "code inspection"
second_reader: "not sampled: statements are code readings that nobody has re-checked"
last_reviewed: "2026-11-24"
revision: "f51d16e747"
---
# F057-01 Web search and page reading

The assistant can search the web for current facts, open one page it found, and read PDF or Office files. Searches and pages show as cards with their sources. Web, Desktop, Mobile and Chrome use the AGI server; CLI and VS Code use the CLI's own search with the user's key or Managed mode.

Area: [57. Tool catalog and invocation experience](README.md). Requirement items: [S57.01](../../10-requirements/capabilities/057-tool-catalog-and-invocation-experience.md#s5701), [S57.02](../../10-requirements/capabilities/057-tool-catalog-and-invocation-experience.md#s5702), [S57.03](../../10-requirements/capabilities/057-tool-catalog-and-invocation-experience.md#s5703).

## Status

Two separate questions: is the code there, and has a person seen it work. "Seen working" comes only from results of real runs recorded in the project's ledger.

| App | In the code: this page's reading, 2026-11-24 | In the code: ledger audit, 2026-09-26 and later updates | Seen working by a person |
|---|---|---|---|
| Web | partly built | partly built | not seen by a person |
| Desktop | partly built | partly built | not seen by a person |
| Mobile | partly built | partly built | not seen by a person |
| CLI | built | built | not seen by a person |
| VS Code | built | built | not seen by a person |
| Chrome | partly built | partly built | not seen by a person |

The first column was derived from this page's text by a second, cheaper pass and has not been validated item by item; the ledger column is the project's own record. Neither is a test result.

## 1. Purpose and user value

**What it does.** Gives the model two tools. web_search returns up to 5 titled, linked snippets for a query. url_fetch (web_fetch in the CLI) downloads one page and returns its readable text. The server version also extracts text from PDF and Office files, but the prompt that tells the model so is not live yet. Results are shown as sources under the answer. [inferred from] (apps/web/lib/web-search/web-search-tool.ts:54) (apps/web/lib/url-fetch/url-fetch-tool.ts:501) (apps/web/lib/prompts/prompt-manifest.ts:282)

**Why it exists.** A model's training data is old. Looking things up lets it answer about recent events and cite what it read, so the person can check it. (doc: docs/product/definition.md)

**Who uses it.** Anyone chatting on Web, Desktop, Mobile or the Chrome extension; developers using the CLI or VS Code; API callers.

**Problems it solves**

- Stale or invented facts
- No way to check where an answer came from
- Needing to open a cited PDF or Word file by hand

**Use cases**

- Ask for today's news on a topic and see the search and its sources.
- Paste a web address and ask for a summary of that page.
- Ask the CLI to look up a library's current docs while coding.
- Ask about a cited PDF report and have the assistant read it (server code reads it; the model is not yet told it can).

## 2. User experience

**Where to find it**

- Web and Desktop: Web search is on automatically in the chat composer when the chosen model has a search path; it shows as 'Web search' in the active-tools list (apps/web/features/chat/components/Composer/ChatComposerNew.tsx:1690, :3409). Desktop shows the same hosted web app (AGENTS.md section 5).
- Web/Desktop transcript: the Tool timeline ('Toggle tool timeline', 'Expand tool details') shows each search with its sources (apps/web/features/chat/components/messages/ToolTimeline.tsx:665, :686).
- Mobile: Settings > Capabilities screen; a fetch failure reads 'Failed to fetch: <url>' on the card; a search card shows '<n> results' (apps/mobile/src/features/chat/components/ToolCallTimeline.tsx:171, :207).
- CLI: tools web_search and web_fetch appear in the terminal UI (apps/cli/src/platform/runtime/tool_catalog.rs:229-230). VS Code: tool call rows in the sidebar chat (apps/extension-vscode/src/features/sidebar-webview/ChatStateManager.ts:6680).
- Chrome extension: activity steps with a Globe icon for sources (apps/extension/src/features/side-panel/bubbles.ts:1100-1111).

**Before you start**

- Web, Desktop, Mobile, Chrome: signed in; a model that supports tools or search; the server must have a search provider key configured (PERPLEXITY_API_KEY) (apps/web/lib/web-search/web-search-providers.json).
- Free plan: 20 searches per 30 days (apps/web/lib/web-search/search-budget.ts:32).
- CLI own-key mode: a Brave or Tavily key saved with 'agi login brave|tavily' or set in the environment (apps/cli/src/features/exec/tools/web/mod.rs:420-424).
- CLI Local privacy mode: web search and fetch are refused (apps/cli/src/features/exec/tools/mod.rs:725-737).

**Screens and controls**

- Web search toggle in the composer, kept on automatically when the model can search; the person can turn it off (apps/web/features/chat/components/Composer/ChatComposerNew.tsx:1690-1696) [toggle label wording partly unknown].
- Expandable tool card: query, sources, page text.
- Mobile: a Web search switch exists in view state (apps/mobile/stores/chat/chatExecutionStore.ts:3251); the settings row label is not shown in the files read (unknown).
- Approval prompts are not required for search on the web (unknown whether any connector approvals apply).

**Journey**

1. Person types a question needing current facts.
2. The app sends the turn with web search on (Mobile sends web_search and web_fetch flags) (apps/mobile/stores/chat/chatExecutionStore.ts:3388-3393).
3. The model calls web_search; the card shows 'Running' with the query.
4. The server checks the per-turn budget and the plan allowance, then calls the search provider.
5. Results come back; sources appear under the card and the answer cites them as numbered links.
6. If the model needs more, it calls url_fetch on one result; a second card shows the page.
7. The answer streams with sources; the person can expand cards to read the page text.

**What the person sees and gets**

- Running, completed or failed state on each card with elapsed time (apps/web/features/chat/components/messages/ToolTimeline.tsx:561).
- Source list under the answer.
- Failure: the error goes to the model and appears on the card; Mobile shows 'Failed to fetch: <url>' (apps/mobile/src/features/chat/components/ToolCallTimeline.tsx:207).
- Budget used up: the model receives a plain message to answer from what it has (apps/web/app/api/llm/v1/chat/completions/lib/tool-loop.ts:5516-5538).

**Settings**

- Composer web search toggle (web).
- Workspace or organisation website allow and deny rules (research domain policy) filter which sites search and fetch may use (apps/web/lib/web-search/web-search-tool.ts:116-130).
- CLI: saved search key, workspace site rules (apps/cli/src/features/exec/tools/web/site_rules.rs).

## 3. Current implementation

From reading the code. Not a test result.

**Working in the code**

- Web server web_search: Perplexity Search call, 5 results per call ceiling, 15 second timeout (apps/web/lib/web-search/web-search-tool.ts:37-39, :54).
- Per-turn limits: 3 searches, 10 in an AGI Work turn; 5 fetches, 15 in an AGI Work turn (apps/web/lib/web-search/web-search-tool.ts:56-57) (apps/web/lib/url-fetch/url-fetch-tool.ts:30-31). Over the limit returns a not-an-error message (apps/web/app/api/llm/v1/chat/completions/lib/tool-loop.ts:5514-5538).
- Repeated identical query is withheld with a message (apps/web/app/api/llm/v1/chat/completions/lib/tool-loop.ts:5524-5531).
- url_fetch: 10 second timeout, 1.5 MiB page cap, 20,000 character content cap, up to 5 redirects, document cap 10 MiB (apps/web/lib/url-fetch/url-fetch-tool.ts:41-47).
- url_fetch has PDF and Office text extraction in code (apps/web/lib/url-fetch/url-fetch-tool.ts:501-515).
- Provider-native search (server tool use) is also collected and shown (apps/web/app/api/llm/v1/chat/completions/lib/tool-loop.ts:1901-1914).
- CLI web_search (Brave or Tavily key) with 15 second timeout, default 5 results, clamped 1 to 20; CLI web_fetch follows up to 5 redirects with SSRF checks (apps/cli/src/features/exec/tools/web/mod.rs:120-122, :391-448).
- CLI reads local PDF and Office files as text (documents.rs: pdf, docx, pptx, xlsx, ods) (apps/cli/src/documents.rs:46-55, :364-601).
- Mobile renders search and fetch cards (apps/mobile/src/features/chat/components/ToolCallTimeline.tsx:171-207).

**Incomplete**

- Source reader by reference on Web, Desktop, Mobile, Chrome and API: the code extracts PDF and Office text, but the tool description version that names these files (tool.url_fetch_description version 2) is on the internal channel and takes no traffic until a canary advance with an eval quality signal (packages/ai/model-registry/catalog/routing-policies.json:157-163) (apps/web/lib/prompts/prompt-manifest.ts:282-289, pinnedVersion 1). Effect: the model is not told it can read these files [inferred].
- CLI web_fetch: whether it extracts PDF or Office content from a URL was not established (unknown); the CLI document reader works on local files.

**Present but disconnected or switched off**

- Search needs a configured provider key; without it the call returns not_configured (apps/web/lib/web-search/web-search-tool.ts:~75 error code 'not_configured').
- CLI web_search without a saved key returns 'Web search not configured' (apps/cli/src/features/exec/tools/web/mod.rs:420-424).

**Not available**

- CLI and VS Code web search and fetch in Local privacy mode (apps/cli/src/features/exec/tools/mod.rs:725-737).
- Mobile on-device Local chat: no tool wiring found in the local system prompt file read (apps/mobile/stores/chat/localSystemPrompt.ts) (unknown beyond that).

## 4. Required behaviour

**Established requirements**

- The assistant can call a web-search tool during a turn and the searches and their sources are shown to the user (S57.01). (source: capability ledger `audit/ledger/ecosystem-capability-ledger.jsonl`, item S57.01)
- The assistant can call a tool that fetches a given page, with the fetch shown in the transcript (S57.02). (source: capability ledger `audit/ledger/ecosystem-capability-ledger.jsonl`, item S57.02)
- The assistant can open a cited source or document (PDF, Office file or page) by reference and read its text (S57.03). Web, Desktop, Mobile, Chrome and API are partial until the prompt is advanced. (source: capability ledger `audit/ledger/ecosystem-capability-ledger.jsonl`, item S57.03)
- Local never silently routes to BYOK or managed cloud; moving is an explicit consent step. (source: doc: docs/product/definition.md (modes table))
- Web search depends on a provider route or an AGI harness; it is not an intrinsic model capability. (source: doc: AGENTS.md section 4)

**Acceptance criteria**

1. On Web, a question about a recent event produces a search card showing the query and at most 5 sources.
2. A turn that tries a fourth search (non-Work) gets the budget-used message and no fourth provider call.
3. A fetch of an unreachable address shows a failed card and the model explains in text.
4. A fetch of a PDF address returns extracted text on the server (once the prompt is advanced the model should choose to do it unprompted).
5. In the CLI in Local privacy mode, web_search returns the 'unavailable in Local privacy mode' text.
6. On the Free plan, the 21st search in 30 days is refused with a plan limit message.

**Inferred requirements** (not stated anywhere; reasoned from the code or from competitor parity)

- Search should stay off for the on-device Local mode on Mobile and Desktop because network context must not leave the device [inferred from CLI rule and docs/product/definition.md].
- A result card should say 'No results' when the list is empty (brief 'Should' draft); the empty-state text was not found in code (unknown).

**Proposed improvements** (suggestions, not requirements)

- [proposed] Advance tool.url_fetch_description version 2 to canary with an eval quality signal, then to stable, so the model knows it can read PDF and Office files.
- [proposed] Show remaining Free searches next to the search toggle, without breaking the rule that Free usage screens show only Upgrade (see owner memory: Free usage = Upgrade only) [needs owner decision].

## 5. Implementation map

| Kind | Name | Path | Role |
|---|---|---|---|
| service | web_search tool | `apps/web/lib/web-search/web-search-tool.ts` | Tool definition, Perplexity call, limits (5 results, 15 s, 3 and 10 per turn). |
| config | search provider registry | `apps/web/lib/web-search/web-search-providers.json` | Names the provider id, host and the API key environment variable name. |
| service | search provider adapter | `apps/web/lib/web-search/search-provider.ts` | Registry of search providers and delivery type of sources. |
| service | search budget | `apps/web/lib/web-search/search-budget.ts` | Free plan 20 calls per 30 days, charge or block decision, automated caller kinds. |
| service | url_fetch tool | `apps/web/lib/url-fetch/url-fetch-tool.ts` | Fetch, extract text, PDF and Office readers, limits. |
| service | guarded fetch | `apps/web/lib/url-fetch/guarded-fetch.ts` | Blocks internal hosts, follows redirects safely, deadlines. |
| service | tool loop | `apps/web/app/api/llm/v1/chat/completions/lib/tool-loop.ts` | Runs tool calls, enforces per-turn budgets (4670-4676, 5514-5538), collects provider-native search (1901). |
| endpoint | POST /api/llm/v1/chat/completions | `apps/web/app/api/llm/v1/chat/completions/lib/request-processor.ts` | Request schema and tool assembly for every app that uses Cloud. |
| config | prompt manifest and routing policy | `apps/web/lib/prompts/prompt-manifest.ts` | Holds tool.url_fetch_description versions 1 and 2; version 2 is on the internal channel in packages/ai/model-registry/catalog/routing-policies.json:157-163. |
| component | ToolTimeline | `apps/web/features/chat/components/messages/ToolTimeline.tsx` | Web and Desktop transcript cards, running and failed states. |
| component | ToolCallCard | `packages/ui/unified-chat/src/components/ToolCallCard.tsx` | Shared card with arguments and result preview. |
| component | Composer | `apps/web/features/chat/components/Composer/ChatComposerNew.tsx` | Web search toggle kept in sync with model support (1690). |
| store | mobile chat execution store | `apps/mobile/stores/chat/chatExecutionStore.ts` | Decides web search availability and sends web_search and web_fetch flags (3251-3394). |
| component | mobile ToolCallTimeline | `apps/mobile/src/features/chat/components/ToolCallTimeline.tsx` | Mobile cards: result counts, fetch failure text. |
| service | CLI web tools | `apps/cli/src/features/exec/tools/web/mod.rs` | CLI web_search (Brave or Tavily) and web_fetch with SSRF pinning. |
| service | CLI document reader | `apps/cli/src/documents.rs` | Extracts text from PDF, docx, pptx and spreadsheets with size and time limits. |
| service | CLI tool dispatcher | `apps/cli/src/features/exec/tools/mod.rs` | Local privacy mode refusal of web tools (725-737). |
| service | VS Code local runtime client | `apps/extension-vscode/src/integrations/localRuntimeClient.ts` | Talks to the CLI app server; tool events shown by ChatStateManager.ts. |
| component | Chrome side panel bubbles | `apps/extension/src/features/side-panel/bubbles.ts` | Renders activity steps and sources in the Chrome extension. |

## 6. Execution and data flow

| Step | Runs on | Source |
|---|---|---|
| The app sends the chat turn to the AGI completions endpoint with web search enabled (Mobile sets web_search and web_fetch flags). | device | apps/mobile/stores/chat/chatExecutionStore.ts:3388-3393 |
| The server decides which tools to offer, then the model asks for web_search. | our servers | apps/web/app/api/llm/v1/chat/completions/lib/tool-loop.ts:5440-5530 |
| The server checks the per-turn budget (3, or 10 in AGI Work) and withholds a repeated query. | our servers | apps/web/app/api/llm/v1/chat/completions/lib/tool-loop.ts:4670-4676, :5514-5531 |
| The server decides how the call is paid: Free plan counts against 20 per 30 days; paid plans and automated callers (API, CLI, VS Code, AGI Work, research, scheduled) are charged to credits. | our servers | apps/web/lib/web-search/search-budget.ts:52-70, :133-143 |
| The server calls the search provider and gets results. | outside service | apps/web/lib/web-search/web-search-tool.ts:297 |
| Results are wrapped as untrusted content, turned into sources, and sent to the model and to the client as cards. | our servers | apps/web/lib/web-search/web-search-tool.ts:10 (fenceUntrustedContent import) |
| url_fetch downloads one page through a guarded fetch, extracts text or PDF or Office text, and returns up to 20,000 characters. | our servers | apps/web/lib/url-fetch/url-fetch-tool.ts:41-47, :501-515 |
| In the CLI, the search runs from the person's machine with their own Brave or Tavily key; in Managed mode AGI runs the search. | device and our servers | apps/cli/src/features/exec/tools/web/mod.rs:420-448 |

**Data**

| What | Stored in | Synced | Kept or deleted |
|---|---|---|---|
| Search and fetch call records and charges (usage ledger, rate card features web_search_perplexity and web_search_grounding) | our usage and cost ledger (table name not read; see search-budget.ts) | server only | unknown |
| Tool results over the cap are stored in full and replaced by a reference | server key-value store, key prefix agi-tool-result, 24 hour expiry | no | expires after 24 hours (apps/web/app/api/llm/v1/chat/completions/lib/tool-result-store.ts:14-17) |
| Transcript cards with sources | conversation message records | with the conversation across apps | follows conversation retention (unknown details) |

**Models and providers.** The search itself is done by a separate search provider (Perplexity in the registry), not by the chat model, so any model that can call tools can use it. Some providers also offer native search that the server collects and shows the same way. The Composer turns web search off when the selected model has no honest search path (apps/web/features/chat/components/Composer/ChatComposerNew.tsx:1690). In the CLI the chat model is independent of the Brave or Tavily key.

## 7. Access and usage rules

| Rule | What the code does |
|---|---|
| Account | Web, Desktop, Mobile, Chrome and API need a signed-in account to reach the server. CLI own-key mode needs no AGI account for search (own Brave or Tavily key) [inferred from mod.rs:420]. |
| Permissions | Workspace website allow and deny rules filter sources and fetches (apps/web/lib/web-search/web-search-tool.ts:116-130). CLI fetch follows only hosts the user approved for redirects (apps/cli/src/features/exec/tools/web/mod.rs:200). |
| Subscription | Free plan: 20 searches per rolling 30 days; other plans and automated callers are charged to credits (apps/web/lib/web-search/search-budget.ts:32, :133-143). Whether any paid plan name has a search ceiling: none found in the files read. |
| Limits and metering | 5 results per call, 15 s per call, 3 searches per turn (10 AGI Work), 5 fetches (15 AGI Work), 10 s per fetch, 20,000 characters of page text (cites above). Billing key space is search:<requestId>:<call> (apps/web/lib/web-search/search-budget.ts:~170). |
| Feature flags | Tool description version 2 is on the internal channel (routing-policies.json:157-163). Search kill switches: none read; a general capability gate exists (apps/web/app/api/llm/v1/chat/completions/lib/request-processor.ts:543-545) (unknown whether search is covered). |
| Model compatibility | Needs a tool-capable model for web_search, or a model with native search. The composer turns search off otherwise (ChatComposerNew.tsx:1690). |
| Provider restrictions | Server search uses one provider registered in web-search-providers.json; native search depends on the model provider. CLI supports Brave and Tavily only (mod.rs:444-448). |
| Local mode | CLI: web_search, web_fetch and browser tools are refused in Local privacy mode with a message to create an explicit BYOK or Managed continuation (apps/cli/src/features/exec/tools/mod.rs:725-737). Mobile on-device chat: no search wiring found (unknown). Desktop local models: unknown. |

## 8. States and edge cases

| State | Behaviour | Source |
|---|---|---|
| Loading | Card shows running with the query and elapsed time; Chrome shows a spinner icon. | apps/web/features/chat/components/messages/ToolTimeline.tsx:561; apps/extension/src/features/side-panel/bubbles.ts:1092-1096 |
| Empty result | The brief says the card reports no results; the specific text was not found in code. | unknown |
| Error from provider or timeout | Error codes invalid_tool_input, not_configured, rate_limited, upstream_error, cancelled, timeout go back to the model. | apps/web/lib/web-search/web-search-tool.ts:~100-108 |
| Budget exhausted | Not an error; the model gets a message to answer from what it has. Further searches are withdrawn. | apps/web/app/api/llm/v1/chat/completions/lib/tool-loop.ts:5514-5538 |
| Repeated query | The model is told the query was already run. | apps/web/app/api/llm/v1/chat/completions/lib/tool-loop.ts:5524-5531 |
| Fetch failure on Mobile | Card title becomes 'Failed to fetch: <url>'. | apps/mobile/src/features/chat/components/ToolCallTimeline.tsx:207 |
| Cancel | Cancelled code exists in the search and fetch outcomes. | apps/web/lib/url-fetch/url-fetch-tool.ts:~500 REFUSAL_CODES cancelled |
| Offline | not handled in the code for search on Mobile that was read (unknown) | unknown |
| Free allowance unreadable | A count that cannot be read refuses the call. | apps/web/lib/web-search/search-budget.ts:128-131 |

## 9. Verification

What has actually been seen by a person is in the Status table above. This section lists what exists to check with.

**Existing tests**

- `apps/web/lib/web-search/web-search-tool.test.ts`: Search tool behaviour and limits.
- `apps/web/lib/web-search/search-budget.test.ts`: Free allowance, charge and block decisions.
- `apps/web/lib/web-search/search-provider.test.ts`: Provider registry.
- `apps/web/lib/url-fetch/url-fetch-tool.test.ts`: Fetch and extraction.
- `apps/web/lib/url-fetch/guarded-fetch.test.ts`: Blocked hosts and redirects.
- `apps/web/app/api/llm/v1/chat/completions/lib/tool-loop.web-search.test.ts`: Search inside the tool loop.
- `apps/web/app/api/llm/v1/chat/completions/lib/tool-loop.url-fetch.test.ts`: Fetch inside the tool loop.
- `apps/web/app/api/llm/v1/chat/completions/lib/request-processor.web-search.test.ts`: Search request assembly.
- `apps/web/e2e/tool-approval-web-search.spec.ts`: Browser flow of a web search with approval.
- `apps/web/e2e/chat-search-stop-label.spec.ts`: Stop label while searching.
- `apps/web/features/chat/components/messages/ToolTimeline.test.tsx`: Transcript card states.
- `apps/cli/src/features/exec/tools/web/mod.rs`: 14 inline Rust tests for fetch safety.
- `apps/cli/src/documents.rs`: 18 inline Rust tests for document extraction.

**Test scenarios**

- **Search on Web**
  1. Sign in on Web with a plan that has search.
  2. Ask 'what happened in the news today about <topic>'.
  3. Expand the tool card.
  - Expected: A search card with the query, up to 5 sources, and an answer citing them.
- **Search budget**
  1. On a non-Work turn, ask a question that needs four different searches.
  - Expected: At most 3 searches run; the 4th returns the budget message and the answer says what could not be confirmed.
- **Fetch a PDF**
  1. Ask the assistant to read a public PDF address.
  2. Check the card output.
  - Expected: Extracted text up to 20,000 characters; before the prompt advance the model may not choose to do this itself.
- **CLI Local mode**
  1. Start a CLI session in Local privacy mode.
  2. Ask for a web search.
  - Expected: web_search is unavailable in Local privacy mode message.
- **Free allowance**
  1. On a Free account, use 20 searches in 30 days, then ask for another.
  - Expected: The call is refused as plan-bound.

**Where to look when it fails**

- Server log event search_budget_count_invalid and search_budget_count_unreadable (apps/web/lib/web-search/search-budget.ts:~100-115).
- Error codes not_configured, upstream_error, rate_limited, timeout on the search result.
- Mobile card text 'Failed to fetch: <url>'.

**Hands-on test plans**

- Web: [70-qa/test-plans/web/057-tool-catalog-and-invocation-experience.md](../../70-qa/test-plans/web/057-tool-catalog-and-invocation-experience.md)
- Desktop: [70-qa/test-plans/desktop/057-tool-catalog-and-invocation-experience.md](../../70-qa/test-plans/desktop/057-tool-catalog-and-invocation-experience.md)
- Mobile: [70-qa/test-plans/mobile/057-tool-catalog-and-invocation-experience.md](../../70-qa/test-plans/mobile/057-tool-catalog-and-invocation-experience.md)
- CLI: [70-qa/test-plans/cli/057-tool-catalog-and-invocation-experience.md](../../70-qa/test-plans/cli/057-tool-catalog-and-invocation-experience.md)
- VS Code: [70-qa/test-plans/vscode/057-tool-catalog-and-invocation-experience.md](../../70-qa/test-plans/vscode/057-tool-catalog-and-invocation-experience.md)
- Chrome: [70-qa/test-plans/chrome/057-tool-catalog-and-invocation-experience.md](../../70-qa/test-plans/chrome/057-tool-catalog-and-invocation-experience.md)

## 10. Gaps and dependencies

- **The model is not told it can read PDF and Office files by reference because the description version is internal only.** Affects: Web, Desktop, Mobile, Chrome, API. Evidence: packages/ai/model-registry/catalog/routing-policies.json:157-163. Work needed: Advance the prompt to canary with an eval quality signal, then stable.
- **The brief's code line references are stale: ChatComposerNew.tsx:2636 now lies in image mode code, and dispatcher.ts lines moved.** Affects: Documentation readers. Evidence: apps/web/features/chat/components/Composer/ChatComposerNew.tsx:2620-2660. Work needed: Refresh the brief's references.
- **No evidence of search or fetch in on-device Local mode on Mobile or Desktop.** Affects: Mobile and Desktop Local mode. Evidence: apps/mobile/stores/chat/localSystemPrompt.ts has no tool text. Work needed: Decide the Local rule, then wire or document it.
- **Empty-result message not found.** Affects: All apps with search. Evidence: not found in web-search-tool.ts read. Work needed: Verify by running or add an explicit no-results card text.

**Depends on**

- SYS-chat-turn-pipeline
- SYS-subscriptions-entitlements-and-usage
- SYS-inference-providers
- SYS-execution-boundaries
- SYS-security-and-privacy
- SYS-model-catalog-and-routing
- surface:web
- surface:desktop
- surface:mobile
- surface:cli
- surface:vscode
- surface:chrome
- mode:cloud
- mode:own-key
- mode:local
- file:apps/web/lib/web-search/web-search-tool.ts
- file:apps/web/lib/url-fetch/url-fetch-tool.ts

## Unknown

- Whether the provider folder under packages/ai/providers matches the name perplexity.
- Empty-result card text.
- Whether CLI web_fetch extracts PDF or Office from URLs.
- Table name of the search charge ledger and its retention.
- Mobile and Desktop on-device Local behaviour for search.
- Whether a Free-plan search count is shown to the person (owner rule says Free screens show only Upgrade).
- Whether Mobile toggles search from a settings label or the add-to-chat sheet (AddToChatSheet.tsx uses isWebSearchAvailable).
