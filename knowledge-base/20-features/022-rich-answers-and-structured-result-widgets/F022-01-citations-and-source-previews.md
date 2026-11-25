---
id: "F022-01"
type: "feature"
title: "Citations and source previews"
aliases: ["Citation chips", "Source chips", "Source preview card", "Sources control", "Sources panel", "Research sources panel", "Search results list", "CollapsibleSources", "S22.01", "S22.02", "S22.03"]
area: "22 Rich answers and structured result widgets"
available_on: ["web", "desktop", "mobile", "vscode", "chrome"]
implementation: {web: "built", desktop: "built", mobile: "built", cli: "missing", vscode: "partial", chrome: "built"}
verification: {web: "not seen by a person", desktop: "not seen by a person", mobile: "not seen by a person", cli: "n/a", vscode: "n/a", chrome: "not seen by a person"}
requirement_items: ["S22.01", "S22.02", "S22.03"]
depends_on: ["SYS-chat-turn-pipeline", "SYS-execution-boundaries", "SYS-subscriptions-entitlements-and-usage", "SYS-security-and-privacy", "SYS-shared-ui-and-design", "surface:web", "surface:desktop", "surface:mobile", "surface:chrome", "surface:vscode", "surface:cli", "mode:cloud", "file:apps/web/lib/web-search/web-search-tool.ts"]
basis: "code inspection"
second_reader: "not sampled: statements are code readings that nobody has re-checked"
last_reviewed: "2026-11-24"
revision: "f51d16e747"
---
# F022-01 Citations and source previews

Shows where an answer's facts came from. A small chip in the text names the source site and opens it. On Web, Desktop and Chrome a preview card shows title, site and dates before opening; on Mobile a tap shows an alert first. A Sources control lists every result. CLI has no chips; VS Code has a plain list.

Area: [22. Rich answers and structured result widgets](README.md). Requirement items: [S22.01](../../10-requirements/capabilities/022-rich-answers-and-structured-result-widgets.md#s2201), [S22.02](../../10-requirements/capabilities/022-rich-answers-and-structured-result-widgets.md#s2202), [S22.03](../../10-requirements/capabilities/022-rich-answers-and-structured-result-widgets.md#s2203).

## Status

Two separate questions: is the code there, and has a person seen it work. "Seen working" comes only from results of real runs recorded in the project's ledger.

| App | In the code: this page's reading, 2026-11-24 | In the code: ledger audit, 2026-09-26 and later updates | Seen working by a person |
|---|---|---|---|
| Web | built | built | not seen by a person |
| Desktop | built | built | not seen by a person |
| Mobile | partly built (this page lists unfinished parts) | built | not seen by a person |
| CLI | not built | not built | n/a |
| VS Code | partly built **(disagrees with the ledger on whether it exists)** | not built | n/a |
| Chrome | built | built | not seen by a person |

The first column was derived from this page's text by a second, cheaper pass and has not been validated item by item; the ledger column is the project's own record. Neither is a test result.
Where the two disagree on whether the feature exists on an app, the case is listed in [ledger corrections](../../90-meta/ledger-corrections.md).

## 1. Purpose and user value

**What it does.** Turns source references in an answer (marker numbers such as [1], or links to cited pages) into chips with the site name, groups adjacent markers into one chip with a count, shows a preview of each source, and lists all sources of the turn under the answer.

**Why it exists.** A person must be able to check a claim. Chat answers built on web search are only trustworthy if each fact points to a page the person can open. The brief requires chips, previews and result lists on every app (S22.01, S22.02, S22.03).

**Who uses it.** Anyone who asks a question that triggers web search or provider-native grounding, on Web, Desktop (Electron shows the hosted web app), Mobile and the Chrome side panel; VS Code users get a basic sources list.

**Problems it solves**

- Claims without a way to verify them.
- Several sources at one sentence cluttering the text (grouped into one chip).
- Grounded results whose link host is a routing vendor, so every source looked the same (publisher domain is read from the title instead).
- Losing the full result set when only a few sources are cited (Citations and More sections).

**Use cases**

- Ask a current-events question, read the answer and hover a chip to see the page title and snippet before opening it.
- On a phone, tap a [n] marker, read the alert with site, date and snippet, then choose Open page.
- Open the Sources control to see every page the search returned, cited ones first.
- In the Chrome side panel, tap a chip on a touch screen to open the card first, then follow the link.

## 2. User experience

**Where to find it**

- Web and Desktop (Electron hosted web app): inline chips in the answer text and a pill labelled 'Sources' (with a count above 3) under the answer, which opens the right-hand 'Research panel' with headings 'Citations' and 'More' (apps/web/features/chat/components/research/ResearchPanel.tsx:505, :517, :604; apps/web/features/chat/components/messages/MessageBubble.tsx:3595).
- Mobile: inline [n] citations in assistant text, and a pill 'Sources' (or 'Sources so far' while the turn is unfinished) that opens a page sheet with headings 'Citations' and 'More' (apps/mobile/src/features/chat/components/CollapsibleSources.tsx:160).
- Chrome side panel: chip inside the answer plus a collapsible sources footer (details element) (apps/extension/src/features/side-panel/sources.ts:136).
- VS Code: a collapsible list under the answer, summary from the localised 'sources' string (apps/extension-vscode/src/features/sidebar-webview/webviewContent.ts:4755). No chips.
- CLI: none. Links print as 'text (url)' (apps/cli/src/tui/markdown_renderer.rs:265-281).

**Before you start**

- The turn used a search or grounding route that produced sources. Web search is a Cloud (managed) tool; see access_and_usage.
- Signed in for Cloud chat on the app [inferred from web search being a server tool-loop tool].

**Screens and controls**

- Chip: pill with favicon (or globe icon), site name and '+N' for extra sources; it is a link that opens in a new tab with rel noopener noreferrer (packages/ui/unified-chat/src/components/markdown/CitationChip.tsx:145-150).
- Hover or keyboard-focus card (Web/Desktop): per source title, host, published date, retrieved date, snippet (CitationChip.tsx:80-122).
- Mobile chip: tap shows an alert with title, site, 'Published ...', retrieved label and snippet, buttons 'Cancel' and 'Open page' (apps/mobile/src/features/chat/components/CitationChip.tsx:42-50).
- Sources pill and panel or sheet: favicon stack or first-letter marks, query line, 'Citations' and 'More' sections, Close button.
- Chrome chip: hover/focus card, Escape closes, a touch pointerdown opens the card and suppresses the first click (apps/extension/src/features/side-panel/sources.ts:64-69).

**Journey**

1. Person sends a question that needs current facts.
2. The server runs web search (up to 3 calls per turn, up to 5 results each) and streams the sources with the answer.
3. The answer text carries citation markers; the app turns them into chips.
4. Person hovers, focuses or taps a chip and reads the preview.
5. Person opens the page (new tab on Web, Desktop and Chrome; in-app browser on Mobile) or opens the Sources control to see every result.

**What the person sees and gets**

- Chip with site name and '+N'.
- Preview card with title, site, dates and snippet when they exist.
- Sources list with a count; 'No sources yet' empty state in the Web panel with 'Web pages and memories an answer used will appear here' (ResearchPanel.tsx:198-205).
- Mobile shows 'Could not open citation' or 'Check your connection and try again.' if the page cannot open (apps/mobile/src/features/chat/utils/sourceDisplay.ts:24-34).

**Settings**

- None found for chips themselves. Search is requested by the options.webSearch flag in the Web chat request (apps/web/lib/hooks/useChatStream.ts:4595); the visible control label is unknown.

## 3. Current implementation

From reading the code. Not a test result.

**Working in the code**

- Web and Desktop chip, grouped chips and hover card (CitationChip.tsx:124-186; MarkdownContent.tsx:277).
- Web Sources pill and panel with Citations and More sections (ResearchPanel.tsx:505-517,604).
- Mobile chip alert preview, Sources sheet with Citations and More sections, and 'Sources so far' while streaming or after a stop or error (CitationChip.tsx:42; CollapsibleSources.tsx:144-160).
- Chrome chip, grouping of adjacent markers, card placement and footer (sources.ts:6-150).
- Publisher domain is used when the link host is a routing redirect host (packages/ui/unified-chat/src/components/markdown/citationPublisher.ts:32).
- Web search failure handling: one retry on rate limit or server error, then a plain error is sent to the model so the answer says the search did not run (apps/web/lib/web-search/web-search-tool.ts:159,185).
- VS Code collapsible sources list (webviewContent.ts:4755, called at :7884).

**Incomplete**

- VS Code shows a list but no chips or preview cards (webviewContent.ts:4755-4785); the brief says missing for all three items.
- Mobile does not show a hover-style preview; it uses a tap alert (CitationChip.tsx:42).
- Saved conversations keep grounded redirect links that can expire (citationPublisher.ts header comment).

**Present but disconnected or switched off**

- Desktop retained Tauri code emits source lists and search results (apps/desktop/src/runtime/TauriRuntime.ts:1115-1140), but the public Desktop is Electron showing hosted web (doc: docs/product/definition.md:452); whether this retained path is reachable by users is unknown.

**Not available**

- CLI: no chips, preview cards or sources list found; links print as text with the URL in parentheses, not brackets (markdown_renderer.rs:277-281).
- VS Code: chips and preview cards not found in code read.

## 4. Required behaviour

**Established requirements**

- Answers grounded in sources show citation chips that identify and open the source (web, desktop, mobile, chrome done; cli and vscode missing). (source: capability ledger `audit/ledger/ecosystem-capability-ledger.jsonl`, item S22.01)
- Hovering or tapping a citation shows a preview card (title, site, snippet/date) before opening it. (source: capability ledger `audit/ledger/ecosystem-capability-ledger.jsonl`, item S22.02)
- Web-search results are listed (title, site, link, optional snippet) and can be opened. (source: capability ledger `audit/ledger/ecosystem-capability-ledger.jsonl`, item S22.03)
- The experience contract lists 'Citation chip and sources disclosure' and 'Search and citations' as rendered families; research citations must resolve to the material supporting the claim. (source: doc: docs/product/experience-contract.md (lines 394, 457, 781))
- Several citations at one spot collapse into one chip showing the first site and a count. (source: packages/ui/unified-chat/src/components/markdown/CitationChip.tsx:124-170)

**Acceptance criteria**

1. A marker group such as [1][2] renders as one chip with the first site and '+1'.
2. Clicking the chip opens the first source in a new tab with no opener or referrer.
3. Hover or focus shows title, site, and published and retrieved dates when the source has them.
4. A marker whose number has no matching source draws no chip.
5. The Sources control lists every result with Citations before More, and shows 'No sources yet' when empty (Web).
6. When search fails, the answer tells the person the search did not run.
7. On Mobile a tap on a citation shows the alert with Cancel and Open page.

**Inferred requirements** (not stated anywhere; reasoned from the code or from competitor parity)

- A chip must be keyboard reachable and have an accessible name listing source numbers and sites [inferred from aria-label in CitationChip.tsx:128-140].
- CLI and VS Code should eventually match chips, but the brief marks them missing without a decision [inferred].

**Proposed improvements** (suggestions, not requirements)

- [proposed] Add numbered source lines to the CLI renderer when the stream carries sources.
- [proposed] Upgrade the VS Code list with preview text.
- [proposed] Resolve grounded redirect links to the real page when a result is saved.

## 5. Implementation map

| Kind | Name | Path | Role |
|---|---|---|---|
| component | CitationChip (shared) | `packages/ui/unified-chat/src/components/markdown/CitationChip.tsx` | Chip link and hover/focus preview card for Web and Desktop |
| component | MarkdownContent citation handling | `packages/ui/unified-chat/src/components/markdown/MarkdownContent.tsx` | Turns citation hrefs into chips (citationChipItems at :277); empty list when no source matches |
| service | citationMarkers | `packages/ui/unified-chat/src/components/markdown/citationMarkers.ts` | Href patterns #chat-citation-N and group form, tracking-parameter stripping |
| service | citationPublisher | `packages/ui/unified-chat/src/components/markdown/citationPublisher.ts` | Publisher domain, snippet and date labels; routing-host handling |
| component | SourcesControl and ResearchPanel | `apps/web/features/chat/components/research/ResearchPanel.tsx` | Sources pill and side panel with Citations, More, empty state |
| component | Web MessageBubble source wiring | `apps/web/features/chat/components/messages/MessageBubble.tsx` | Collects search sources, orders cited first, renders SourcesControl (:2027, :2441, :3595) |
| component | Mobile CitationChip | `apps/mobile/src/features/chat/components/CitationChip.tsx` | Chip and tap alert preview |
| component | Mobile CollapsibleSources | `apps/mobile/src/features/chat/components/CollapsibleSources.tsx` | Sources pill and page-sheet list |
| service | Mobile sourceDisplay | `apps/mobile/src/features/chat/utils/sourceDisplay.ts` | Opens sources in the in-app browser after URL validation |
| service | Mobile messageSources | `apps/mobile/src/features/chat/utils/messageSources.ts` | Orders and persists turn sources |
| component | Chrome sources.ts | `apps/extension/src/features/side-panel/sources.ts` | Chip, card and footer built by hand in the side panel |
| component | VS Code appendSources | `apps/extension-vscode/src/features/sidebar-webview/webviewContent.ts` | Plain collapsible sources list (:4755) |
| component | CLI markdown renderer | `apps/cli/src/tui/markdown_renderer.rs` | Prints links as text plus (url) |
| service | web_search tool | `apps/web/lib/web-search/web-search-tool.ts` | Search call, limits (:54-57), retries and failure text |
| service | search budget | `apps/web/lib/web-search/search-budget.ts` | Free plan cap of 20 calls in 30 days; charge rules |
| config | web-search-providers.json | `apps/web/lib/web-search/web-search-providers.json` | Single registered search provider entry with key variable name PERPLEXITY_API_KEY |
| store | research-panel-store | `apps/web/features/chat/stores/research-panel-store.ts` | Holds sources shown in the panel [inferred from import in ResearchPanel.tsx:11] |
| table | web_messages | `apps/web/db/neon/0001_mvp_chat.sql` | Holds message metadata (jsonb) where sources are saved [inferred] |
| test | CitationChip tests | `packages/ui/unified-chat/src/components/markdown/__tests__/CitationChip.test.tsx` | Chip behaviour tests |
| test | CollapsibleSources tests | `apps/mobile/__tests__/CollapsibleSources.test.tsx` | Mobile sources sheet tests |

## 6. Execution and data flow

| Step | Runs on | Source |
|---|---|---|
| Person asks a question; the client asks for streaming chat and Web search may be on. | device | apps/web/lib/hooks/useChatStream.ts:4595 |
| Server offers the web_search tool to a tool-capable model and runs the tool loop; at most 3 searches of 5 results per turn. | our servers | apps/web/lib/web-search/web-search-tool.ts:54-57; apps/web/app/api/llm/v1/chat/completions/lib/request-processor.ts:6288 |
| Search request goes to the registered search provider over HTTPS with one retry on 429 or 5xx. | outside service | apps/web/lib/web-search/web-search-tool.ts:159-250; web-search-providers.json:4-8 |
| Search budget is checked first: Free plan gets a rolling count cap, paid plans and automated surfaces are charged to managed credits. | our servers | apps/web/lib/web-search/search-budget.ts:32,52,95-115 |
| Sources and answer stream back; the client builds chips and the Sources list from them. | device | CitationChip.tsx:124; MessageBubble.tsx:2027-2050 |
| Web and Desktop chips draw favicons from a third-party favicon address unless the source carries one. | outside service | packages/ui/unified-chat/src/components/markdown/CitationChip.tsx:44-50 |
| Opening a chip opens the page in a new tab (web, Chrome) or the in-app browser (mobile). | device | CitationChip.tsx:149; apps/mobile/src/features/chat/utils/sourceDisplay.ts:24-34 |

**Data**

| What | Stored in | Synced | Kept or deleted |
|---|---|---|---|
| Turn sources (url, title, snippet, dates) | Message metadata in the chat store; web_messages.metadata on the server [inferred]; mobile persists via persistedSourcesForSync | Mobile has a sync helper (messageSources.ts:224); web is server stored. Exact sync path unknown | Follows the message; deletion rules unknown |
| Search call count for Free plan | Usage ledger read by countUserFeatureUnitsSince | Server side only | Rolling 30-day window (search-budget.ts:33) |

**Models and providers.** Search is a server tool, so any tool-capable model can call it. Provider-native grounding from some model providers also yields sources (packages/ai/providers/google/src/__tests__/grounding-sources.test.ts exists; openai citation markup tests exist). The search vendor is registered in web-search-providers.json, not tied to the chat model.

## 7. Access and usage rules

| Rule | What the code does |
|---|---|
| Account | Web search runs in Cloud chat, which needs a signed-in account [inferred]. Chips themselves need no account once the sources are in the message. |
| Permissions | No extra person permission found. Mobile opens links only if they are valid external http(s) URLs (sourceDisplay.ts:20). |
| Subscription | Free plan: 20 search calls per rolling 30 days (apps/web/lib/web-search/search-budget.ts:32-33). Paid plans: calls charged to managed credits (search-budget.ts:107-115). Result count is 5 for both (web-search-tool.ts:54-55). |
| Limits and metering | 3 calls per turn, 10 for AGI Work turns, query length 400 (web-search-tool.ts:56-58). Calls are metered under rate card features web_search_perplexity and web_search_grounding (search-budget.ts:36-39). |
| Feature flags | The search backend needs its provider key to be configured; without it the tool reports not_configured and the model is told not to retry (web-search-tool.ts:185-210). |
| Model compatibility | Needs a tool-capable model for the search tool [inferred from the toolsCapable gating pattern in request-processor.ts:1357-1425]; provider-native grounding is a separate route. |
| Provider restrictions | Single search provider entry in the repo (web-search-providers.json:4-8). |
| Local mode | Not established. Mobile Local Mode and CLI web search paths for chips were not found; the cloud tool loop is where search is wired. Local chat sources exist in retained Tauri desktop code (TauriRuntime.ts:1115) but that is internal. Chips on already-stored sources need no network except favicons on Web. |

## 8. States and edge cases

| State | Behaviour | Source |
|---|---|---|
| No matching source for a marker | No chip is drawn | packages/ui/unified-chat/src/components/markdown/MarkdownContent.tsx:277-292 |
| Grouped markers | One chip, first site plus +N; Chrome and Web both group adjacent markers | CitationChip.tsx:124-170; apps/extension/src/features/side-panel/sources.ts:102-134 |
| Favicon fails to load | Globe icon replaces it | CitationChip.tsx:56-75 |
| Search backend rate limited or down | One retry, then the model is told to say the search did not run | apps/web/lib/web-search/web-search-tool.ts:159,185-210 |
| Search not configured | Model told not to retry | web-search-tool.ts:204-205 |
| Turn stopped or errored (Mobile) | Control reads 'Sources so far' | apps/mobile/src/features/chat/components/CollapsibleSources.tsx:36-45,160 |
| Source URL not openable (Mobile) | Chip is disabled and not a link | apps/mobile/src/features/chat/components/CitationChip.tsx:61-90 |
| Open fails (Mobile) | Alert 'Check your connection and try again.' | apps/mobile/src/features/chat/utils/sourceDisplay.ts:31-33 |
| Touch in Chrome | First tap opens the card, second follows the link | apps/extension/src/features/side-panel/sources.ts:64-69 |
| Offline | not handled in the code for chips beyond a failed favicon and a failed open | none found in the files read |
| Screen reader | Chip aria-label lists source numbers and sites; hidden 'Source N:' text in card rows | CitationChip.tsx:88,128-140 |

## 9. Verification

What has actually been seen by a person is in the Status table above. This section lists what exists to check with.

**Existing tests**

- `packages/ui/unified-chat/src/components/markdown/__tests__/CitationChip.test.tsx`: Single and grouped chip, favicon fallback, 24px target, new-tab click, hover tooltip lists (test names read)
- `packages/ui/unified-chat/src/components/markdown/CitationChip.card.test.tsx`: Snippet and published date in the card, unparseable date, rows omitted when absent (test names read)
- `packages/ui/unified-chat/src/components/markdown/citationMarkers.test.ts`: Citation marker patterns (file exists; bodies not read)
- `packages/ui/unified-chat/src/components/markdown/__tests__/citationPublisher.test.ts`: Publisher domain logic (file exists; bodies not read)
- `apps/mobile/__tests__/CollapsibleSources.test.tsx`: Empty list renders nothing, one control, first-letter marks, sheet closes, domain and title shown, tap opens in-app browser (test names read)
- `apps/web/features/chat/components/research/ResearchPanel.sourcesNumbering.test.tsx`: Panel numbering (file exists; bodies not read)
- `apps/web/lib/web-search/web-search-tool.test.ts`: Search tool (file exists; bodies not read)
- `apps/web/lib/web-search/search-budget.test.ts`: Budget rules (file exists; bodies not read)
- `apps/mobile/__tests__/cloud-chat-sources-persistence.test.ts`: Mobile source persistence (file exists; bodies not read)

**Test scenarios**

- **Grouped chip on Web**
  1. Ask a question that triggers web search on Web.
  2. Find a sentence with two adjacent markers.
  3. Hover the chip.
  - Expected: One chip shows the first site and +1; the card lists both sources with title, host and dates; click opens a new tab.
- **Mobile tap preview**
  1. Open a cited answer in Mobile Cloud chat.
  2. Tap a [n] marker.
  - Expected: Alert with site, published date, snippet and buttons Cancel and Open page; Open page uses the in-app browser.
- **Sources list**
  1. Open the Sources pill under an answer on Web.
  2. Compare with the search results.
  - Expected: Citations section then More; every result present; an answer with none shows 'No sources yet'.
- **Search failure**
  1. Run a turn with the search key removed or the backend blocked.
  2. Read the answer.
  - Expected: No chips; the answer says the search did not run and names what is unconfirmed.
- **Free cap**
  1. On a Free account, use 20 search calls in 30 days, then ask another current question.
  - Expected: Search is refused as plan bound and the answer says so (expected from search-budget.ts:117-125; run to confirm the message).
- **Chrome touch card**
  1. Use a touch device with the Chrome side panel.
  2. Tap a chip once, then again.
  - Expected: First tap shows the card; second opens the page.

**Where to look when it fails**

- Log events search_budget_count_invalid and search_budget_count_unreadable from search-budget.ts.
- Error codes not_configured, rate_limited, upstream_error, timeout, cancelled in web-search-tool.ts:73-80.
- web_messages.metadata for stored sources.

**Hands-on test plans**

- Web: [70-qa/test-plans/web/022-rich-answers-and-structured-result-widgets.md](../../70-qa/test-plans/web/022-rich-answers-and-structured-result-widgets.md)
- Desktop: [70-qa/test-plans/desktop/022-rich-answers-and-structured-result-widgets.md](../../70-qa/test-plans/desktop/022-rich-answers-and-structured-result-widgets.md)
- Mobile: [70-qa/test-plans/mobile/022-rich-answers-and-structured-result-widgets.md](../../70-qa/test-plans/mobile/022-rich-answers-and-structured-result-widgets.md)
- VS Code: [70-qa/test-plans/vscode/022-rich-answers-and-structured-result-widgets.md](../../70-qa/test-plans/vscode/022-rich-answers-and-structured-result-widgets.md)
- Chrome: [70-qa/test-plans/chrome/022-rich-answers-and-structured-result-widgets.md](../../70-qa/test-plans/chrome/022-rich-answers-and-structured-result-widgets.md)

## 10. Gaps and dependencies

- **CLI has no chips, preview or sources list** Affects: CLI users. Evidence: apps/cli/src/tui/markdown_renderer.rs:265-281 only appends (url). Work needed: Decide the CLI form, render numbered sources from the stream
- **VS Code has a list but no chips or preview; the brief says missing** Affects: VS Code users; the brief is out of date. Evidence: apps/extension-vscode/src/features/sidebar-webview/webviewContent.ts:4755. Work needed: Update the brief status and decide on chips
- **Mobile preview is an alert, not a card** Affects: Mobile users. Evidence: apps/mobile/src/features/chat/components/CitationChip.tsx:42-50. Work needed: Owner decision whether an alert meets the preview requirement
- **Grounded redirect links expire in saved chats** Affects: All apps reopening old chats. Evidence: packages/ui/unified-chat/src/components/markdown/citationPublisher.ts header. Work needed: Resolve the redirect at save time on the server
- **Web chips fetch favicons from a third party** Affects: Web and Desktop privacy; Mobile avoids it by design. Evidence: CitationChip.tsx:44-50 versus the comment in CollapsibleSources.tsx. Work needed: Decide policy or proxy the icons
- **The draft's 'tap and hold' for touch is not in the code** Affects: Documentation. Evidence: Mobile uses a plain tap (CitationChip.tsx:72-90). Work needed: None; corrected here
- Not built on: CLI (from the capability ledger).

**Depends on**

- SYS-chat-turn-pipeline
- SYS-execution-boundaries
- SYS-subscriptions-entitlements-and-usage
- SYS-security-and-privacy
- SYS-shared-ui-and-design
- surface:web
- surface:desktop
- surface:mobile
- surface:chrome
- surface:vscode
- surface:cli
- mode:cloud
- file:apps/web/lib/web-search/web-search-tool.ts

## Unknown

- How the CLI streams search results and whether any CLI path prints source lists.
- Whether web search is reachable in Mobile Local mode and Desktop Local mode.
- Exact sync path of persisted sources across devices.
- Whether touch devices on Web can open the hover card.
- Test bodies of files listed as 'bodies not read'.
