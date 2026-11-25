---
id: "F093-08"
type: "feature"
title: "Reading a web page"
aliases: ["Reading a web page", "url_fetch tool", "page reader", "web fetch", "Web-fetch service (S93.10)", "Safe URL resolver (S93.11)", "Page-content extraction (S93.12)", "guardedFetch"]
area: "93 Search, retrieval, and context components"
available_on: []
implementation: {web: "n/a", desktop: "n/a", mobile: "n/a", cli: "n/a", vscode: "n/a", chrome: "n/a"}
verification: {web: "n/a", desktop: "n/a", mobile: "n/a", cli: "n/a", vscode: "n/a", chrome: "n/a"}
requirement_items: ["S93.10", "S93.11", "S93.12"]
depends_on: ["SYS-security-and-privacy", "SYS-execution-boundaries", "SYS-chat-turn-pipeline", "SYS-files-artifacts-and-storage", "mode:cloud", "file:apps/web/lib/url-fetch/guarded-fetch.ts", "file:apps/web/lib/egress-policy.ts", "F093-07", "F093-11"]
basis: "code inspection"
second_reader: "not sampled: statements are code readings that nobody has re-checked"
last_reviewed: "2026-11-24"
revision: "f51d16e747"
---
# F093-08 Reading a web page

Reading a web page lets the assistant fetch one public http or https address and return its readable text, title, description and date, with HTML, PDF and Office files supported. Every hop is checked so private or internal addresses are refused. Pages are cut at a size limit, fenced as untrusted, and capped per turn.

Area: [93. Search, retrieval, and context components](README.md). Requirement items: [S93.10](../../10-requirements/capabilities/093-search-retrieval-and-context-components.md#s9310), [S93.11](../../10-requirements/capabilities/093-search-retrieval-and-context-components.md#s9311), [S93.12](../../10-requirements/capabilities/093-search-retrieval-and-context-components.md#s9312).

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

**What it does.** url_fetch downloads one public URL, reduces it to text, and returns title, text, a short description and a date when the page declares them [apps/web/lib/url-fetch/url-fetch-tool.ts:486-684].

**Why it exists.** Search snippets are short. The model needs the page itself to quote or check a claim, and a fetch from a server must not become a way to reach internal networks [apps/web/lib/url-fetch/guarded-fetch.ts:91-100; apps/web/lib/egress-policy.ts:289-300].

**Who uses it.** The model (tool call) on Cloud turns, the Deep Research loop, and the title and redirect helpers that reuse the guarded fetch [apps/web/app/api/llm/v1/chat/completions/lib/tool-loop.ts:2730-2751; research-loop.url-fetch.test.ts; web-search-tool.ts:803-830].

**Problems it solves**

- Server-side request forgery to private addresses
- Redirect chains that end somewhere unsafe
- Huge or binary responses
- Page text trying to instruct the model

**Use cases**

- A user pastes a link and asks for a summary
- The model follows a search result to read the full article
- A Deep Research run reads a PDF report
- A project domain rule limits reading to approved sites

## 2. User experience

**Where to find it**

- No dedicated screen. The user pastes a link or asks to read a page; the explicit-fetch phrasing turns web_fetch on [apps/web/app/api/llm/v1/chat/completions/lib/request-processor.ts:988-990].
- The page appears as a source chip on the answer (url_fetch sources carry a tool tag) [tool-loop.ts:1458-1470 comment].
- Mobile and Chrome: web_fetch flag sent to the managed route [apps/extension/src/features/cloud-bridge/freeTrialClient.ts:1604].
- CLI has its own web_fetch tool [apps/cli/src/features/exec/tools/web/mod.rs:536].

**Before you start**

- Cloud mode with web search or web fetch allowed for the turn (the same capability gate clears both) [request-processor.ts:5249-5252].
- A streaming request: url_fetch is offered only when the request streams [request-processor.ts:2634].

**Screens and controls**

- No control of its own; follows the web search gate and the per-chat site rules (research domain policy).

**Journey**

1. 1. The user pastes a URL or asks to read a page.
2. 2. The model calls url_fetch with the address.
3. 3. The server checks the address and every redirect, then downloads within limits.
4. 4. Text is extracted and fenced as untrusted content.
5. 5. The model answers; the page shows as a source.

**What the person sees and gets**

- On success: 'Fetched <url>', title and text inside an untrusted-content fence [url-fetch-tool.ts:705-720].
- On failure: 'Fetch failed (<code>): <message>' to the model [tool-loop.ts:2737-2740].
- Truncation note: '[Content truncated: showing the first 20,000 of N extracted characters.]' [url-fetch-tool.ts:673-681].
- Budget text when the turn has fetched its allowed pages [url-fetch-tool.ts:32-37].

**Settings**

- Per-chat allowed or denied sites from the Deep Research plan card or workspace rules (domain policy) [url-fetch-tool.ts:560-570].

## 3. Current implementation

From reading the code. Not a test result.

**Working in the code**

- Only http and https; embedded user name or password is refused; cookie and authorization headers are never sent [apps/web/lib/url-fetch/guarded-fetch.ts:67, 91-95].
- Each hop is resolved and checked as public before the request; redirects are followed manually up to 5, each re-checked [guarded-fetch.ts:107-205].
- Private and internal addresses refused by the egress policy, which also pins the checked addresses for the request [apps/web/lib/egress-policy.ts:271-300].
- Limits: 10 s, 1.5 MB (10 MB for documents), 20,000 characters returned, 5 redirects; 5 reads per chat turn, 15 per AGI Work turn [url-fetch-tool.ts:30-46; tool-loop.ts:4673-4677].
- Content types: HTML, XHTML, plain text, Markdown, JSON; PDF and Word, Excel or PowerPoint files go through a document reader [url-fetch-tool.ts:46-55, 499-512, 601-628].
- Title, description and publication date are read from the page's own metadata for HTML [url-fetch-tool.ts:684-700].
- Domain policy: a URL outside allowed sites is refused, and a redirect that leaves the allowed sites is refused with a clear message [url-fetch-tool.ts:560-570, 588-600].
- Character set check: an undecodable declared encoding returns unsupported_content_type [url-fetch-tool.ts:650-658].
- Page text is fenced, with '<' escaped so it cannot close the fence [url-fetch-tool.ts:705-720].

**Incomplete**

- The same extraction helpers are used for titles in search results, but a failed metadata fetch silently leaves the field empty [web-search-tool.ts:733-775].

**Present but disconnected or switched off**

- Where the provider has its own fetch tool (Anthropic route), the platform can attach that native tool instead of url_fetch; the provider then reads the page outside our address checks [request-processor.ts:2603-2620].
- url_fetch is not offered on non-streaming requests [request-processor.ts:2634].

**Not available**

- No per-call charge for url_fetch was found in the tool loop (none found).
- Internal Tauri build has a separate scrape and fetch implementation (not traced) [apps/desktop/src-tauri/src/core/llm/tool_executor/search_tools.rs:439].

## 4. Required behaviour

**Established requirements**

- A web-fetch service reads a given URL and returns its text for the model. (source: brief S93.10)
- URLs are resolved safely: only public http(s) hosts, no credentials, redirects re-checked, private or internal addresses refused. (source: brief S93.11)
- Fetched pages are reduced to readable text with title, description and date extracted. (source: brief S93.12)
- Security behavior fails closed; desktop and server egress go through the egress policy. (source: doc: AGENTS.md section 6)

**Acceptance criteria**

1. A URL with a user name or password is refused.
2. A hostname that resolves to a private address is refused after lookup.
3. A redirect to a private address is refused even when the first URL is public.
4. A page over the character cap returns the first 20,000 characters and a truncation note.
5. A page with no readable text returns an error naming the address.
6. The sixth page read in one chat turn is refused with the budget message.
7. A PDF under the document cap returns its text.

**Inferred requirements** (not stated anywhere; reasoned from the code or from competitor parity)

- Per-call spend is not charged because no charge code was found; confirm this is intended [inferred from absence in tool-loop.ts:2730-2751].

**Proposed improvements** (suggestions, not requirements)

- [proposed] Apply the same address checks when a provider-native fetch tool is used, or state that the provider does the reading.
- [proposed] Add per-call limits for documents to the same turn ledger as pages.

## 5. Implementation map

| Kind | Name | Path | Role |
|---|---|---|---|
| service | url-fetch-tool | `apps/web/lib/url-fetch/url-fetch-tool.ts` | Tool definition, limits, executeUrlFetch, extraction, fencing |
| service | guarded-fetch | `apps/web/lib/url-fetch/guarded-fetch.ts` | Hop-by-hop checked fetch, redirect handling, deadline, capped body read |
| service | decode-response-text | `apps/web/lib/url-fetch/decode-response-text.ts` | Character set decoding |
| service | egress-policy | `apps/web/lib/egress-policy.ts` | assertResolvedPublicHostname and pinned public fetch |
| service | tool-loop url_fetch branch | `apps/web/app/api/llm/v1/chat/completions/lib/tool-loop.ts` | Runs url_fetch, per-turn budget, source events |
| service | request-processor web fetch | `apps/web/app/api/llm/v1/chat/completions/lib/request-processor.ts` | resolveWebFetchTools and explicit-fetch intent |
| service | research-sources | `apps/web/app/api/llm/v1/chat/completions/lib/research-sources.ts` | Domain policy used by the reader |
| service | research-loop | `apps/web/app/api/llm/v1/chat/completions/lib/research-loop.ts` | Reads pages inside Deep Research rounds |
| service | pdf-attachment-content | `apps/web/lib/server/pdf-attachment-content.ts` | PDF text extraction (loaded on demand) |
| service | office-document-text | `apps/web/lib/server/office-document-text.ts` | Office file text extraction |
| service | CLI web fetch | `apps/cli/src/features/exec/tools/web/mod.rs` | CLI fetch with private-address checks and pinned hops |
| service | Chrome managed client | `apps/extension/src/features/cloud-bridge/freeTrialClient.ts` | Sends web_fetch flag |

## 6. Execution and data flow

| Step | Runs on | Source |
|---|---|---|
| The model or the user's explicit request triggers url_fetch with an address. | our servers | tool-loop.ts:2730-2734; request-processor.ts:988-990 |
| The address is checked for scheme, credentials, length and the site policy. | our servers | url-fetch-tool.ts:520-570; guarded-fetch.ts:91-95 |
| The host is resolved and checked public, then fetched with redirect handling set to manual. | our servers | guarded-fetch.ts:119-141; egress-policy.ts:289-300 |
| The page is downloaded from the public site. | outside service | guarded-fetch.ts:138-145 |
| Text is extracted, cut, fenced and returned; the page joins the turn's sources. | our servers | url-fetch-tool.ts:630-720; tool-loop.ts:2743-2751 |

**Data**

| What | Stored in | Synced | Kept or deleted |
|---|---|---|---|
| Fetched page text | Not stored by the fetch code; lives in the turn's tool result | no | Sent to the model provider as part of the turn |
| Source entry (url, title, snippet, date) | Assistant message metadata | yes with the conversation | Follows the conversation |

**Models and providers.** Fetching is platform-run and independent of the model, except that an Anthropic route may use the provider's own fetch tool [request-processor.ts:2603-2620]. The page text is passed to whichever model serves the turn.

## 7. Access and usage rules

| Rule | What the code does |
|---|---|
| Account | Signed-in Cloud account. |
| Permissions | Same gate as web search (canUseWebSearch clears web_fetch) and the tool-approval policy [request-processor.ts:5249-5252; doc: docs/decisions/2026-09-10-managed-gateway-routes.md:44-51]. |
| Subscription | none found in the code for fetch itself; the voice tools offer url_fetch only when the tier policy allows search [apps/web/lib/voice/live-voice-tools.ts:398]. |
| Limits and metering | 5 per chat turn, 15 per AGI Work turn; 10 s; 1.5 MB or 10 MB for documents; 20,000 characters; 5 redirects [url-fetch-tool.ts:30-46]. No metering found. |
| Feature flags | web_fetch request flag, kill switch shared with web search [request-processor.ts:710, 5249-5252]. |
| Model compatibility | Needs a tools-capable model and a streaming request [request-processor.ts:2625-2634]. |
| Provider restrictions | none found in the code besides the native-fetch substitution above. |
| Local mode | Local and own-key turns do not reach this route [request-processor.ts:4876 comment]. The CLI fetches on the device with its own checks [cli mod.rs:39-300]. Web Local-mode fetch: unknown. |

## 8. States and edge cases

| State | Behaviour | Source |
|---|---|---|
| Blocked host or credentials | url_not_allowed with a plain message | url-fetch-tool.ts:541-552 |
| Timeout | timeout error naming the address | url-fetch-tool.ts:577-580 |
| Cancelled | cancelled; read in flight is stopped | url-fetch-tool.ts:572-574; research-loop.url-fetch.test.ts title |
| Empty text | url_not_accessible 'No readable text content at <url>.' | url-fetch-tool.ts:669-671 |
| Too large | response_too_large from the declared length or while reading | url-fetch-tool.ts:617-640 |
| Unsupported type | unsupported_content_type listing what is supported | url-fetch-tool.ts:601-612 |
| Unreadable document | unreadable_document | url-fetch-tool.ts:660-664 |
| HTTP error | url_not_accessible with the status | url-fetch-tool.ts:590-594 |
| Offline | unreachable maps to url_not_accessible | guarded-fetch.ts:147-152; url-fetch-tool.ts:541-552 |
| Accessibility | not traced | unknown |

## 9. Verification

What has actually been seen by a person is in the Status table above. This section lists what exists to check with.

**Existing tests**

- `apps/web/lib/url-fetch/url-fetch-tool.test.ts`: 46 cases: tool definition, private-address DNS block, extraction, limits, truncation
- `apps/web/lib/url-fetch/guarded-fetch.test.ts`: 16 cases: redirect credentials, redirect bound, loops
- `apps/web/lib/url-fetch/url-fetch-egress.test.ts`: 25 cases: refusal of internal address forms before and after lookup
- `apps/web/lib/url-fetch/url-fetch-tool.redos.test.ts`: extraction does not hang on hostile input
- `apps/web/app/api/llm/v1/chat/completions/lib/tool-loop.url-fetch.test.ts`: 4 cases: end-to-end fetch, SSRF refusal, cumulative sources
- `apps/web/app/api/llm/v1/chat/completions/lib/research-loop.url-fetch.test.ts`: 9 cases: fetch inside research rounds, blocked URLs, cancellation
- `apps/web/lib/web-search/page-metadata-egress.test.ts`: metadata fetch honours the egress rules

**Test scenarios**

- **Private address**
  1. Ask the assistant to read an internal address
  2. Ask again with a public name that points to a private address
  - Expected: Both refused with a not-allowed message; nothing is fetched.
- **Redirect to internal**
  1. Use a test server that redirects to a private address
  - Expected: Refused at the second hop.
- **Long page**
  1. Read a page over 20,000 characters
  - Expected: First 20,000 characters and a truncation note.
- **PDF**
  1. Read a public PDF under 10 MB
  - Expected: Readable text and a title from the file name.
- **Fetch cap**
  1. Ask for six pages in one chat turn
  - Expected: The sixth is refused with the fetch-budget text.

**Where to look when it fails**

- Error codes url_not_allowed, url_not_accessible, invalid_tool_input, too_many_redirects, timeout, cancelled, unsupported_content_type, response_too_large, unreadable_document [url-fetch-tool.ts:541-552].
- The model-visible prefix 'Fetch failed (<code>)' in the turn transcript [tool-loop.ts:2737].

**Hands-on test plans**

- none: not built on any app

## 10. Gaps and dependencies

- **Provider-native fetch bypasses the platform address checks.** Affects: Cloud turns on routes with native fetch. Evidence: request-processor.ts:2603-2620. Work needed: Decide policy and test; document that the provider reads the page.
- **No fetch metering or document-specific limit found.** Affects: Cost on Cloud. Evidence: tool-loop.ts:2730-2751. Work needed: Confirm intended; add a meter if a cost exists.
- **Web Local-mode page reading is undefined.** Affects: Local users. Evidence: request-processor.ts:4876 comment. Work needed: Trace the local runtime.
- **Three separate fetch stacks (server, CLI, internal Tauri) with separate address rules.** Affects: Security review. Evidence: cli mod.rs:39-300; search_tools.rs:439. Work needed: Shared test vectors for the address rules.

**Depends on**

- SYS-security-and-privacy
- SYS-execution-boundaries
- SYS-chat-turn-pipeline
- SYS-files-artifacts-and-storage
- mode:cloud
- file:apps/web/lib/url-fetch/guarded-fetch.ts
- file:apps/web/lib/egress-policy.ts
- F093-07
- F093-11

## Unknown

- Whether the 262,144-character extraction cap constant is applied in extractHtmlText (declared at url-fetch-tool.ts:42).
- Mobile and Chrome display of fetch failures.
- Whether the Electron desktop shows fetch sources identically (shows the web app).
- Cost of fetch to the account.
