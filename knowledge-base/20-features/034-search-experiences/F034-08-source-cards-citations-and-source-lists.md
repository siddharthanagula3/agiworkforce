---
id: "F034-08"
type: "feature"
title: "Source cards, citations and source lists"
aliases: ["Source cards", "Citation chips", "Citation hover card", "Sources panel", "Research sources", "Sources footer", "Source list", "Open sources panel", "Open original source", "S34.24 to S34.27"]
area: "34 Search experiences"
available_on: ["web", "desktop", "mobile", "cli", "vscode", "chrome"]
implementation: {web: "built", desktop: "built", mobile: "built", cli: "partial", vscode: "partial", chrome: "partial"}
verification: {web: "not seen by a person", desktop: "not seen by a person", mobile: "not seen by a person", cli: "not seen by a person", vscode: "not seen by a person", chrome: "not seen by a person"}
requirement_items: ["S34.24", "S34.25", "S34.26", "S34.27"]
depends_on: ["surface:web", "surface:desktop", "surface:mobile", "surface:cli", "surface:vscode", "surface:chrome", "mode:cloud", "mode:own-key", "file:packages/ui/unified-chat/src/components/markdown/CitationChip.tsx", "file:apps/web/features/chat/components/research/ResearchPanel.tsx", "file:apps/cli/src/sources.rs", "provider:perplexity", "table:web_messages", "SYS-chat-turn-pipeline", "SYS-shared-ui-and-design", "SYS-inference-providers", "SYS-subscriptions-entitlements-and-usage", "SYS-execution-boundaries", "F034-07", "F034-09"]
basis: "code inspection"
second_reader: "not sampled: statements are code readings that nobody has re-checked"
last_reviewed: "2026-11-24"
revision: "f51d16e747"
---
# F034-08 Source cards, citations and source lists

Shows where an answer came from. Web and Desktop show site-name citation chips with a hover card and a side panel listing 'Citations' and 'More' as cards. Mobile shows tappable [n] citations with a preview and a 'Sources' sheet. The Chrome side panel has hover cards and a Sources list. CLI prints a text footer. VS Code has a link list.

Area: [34. Search experiences](README.md). Requirement items: [S34.24](../../10-requirements/capabilities/034-search-experiences.md#s3424), [S34.25](../../10-requirements/capabilities/034-search-experiences.md#s3425), [S34.26](../../10-requirements/capabilities/034-search-experiences.md#s3426), [S34.27](../../10-requirements/capabilities/034-search-experiences.md#s3427).

## Status

Two separate questions: is the code there, and has a person seen it work. "Seen working" comes only from results of real runs recorded in the project's ledger.

| App | In the code: this page's reading, 2026-11-24 | In the code: ledger audit, 2026-09-26 and later updates | Seen working by a person |
|---|---|---|---|
| Web | built | built | not seen by a person |
| Desktop | built | built | not seen by a person |
| Mobile | built | built | not seen by a person |
| CLI | partly built | partly built | not seen by a person |
| VS Code | partly built | partly built | not seen by a person |
| Chrome | built (this page lists unfinished parts) | partly built | not seen by a person |

The first column was derived from this page's text by a second, cheaper pass and has not been validated item by item; the ledger column is the project's own record. Neither is a test result.

## 1. Purpose and user value

**What it does.** Turns the pages an answer used into visible, clickable sources: inline citation chips, a compact 'Sources' control, a full list, and links that open the original page.

**Why it exists.** People must be able to check an answer. Claude and ChatGPT show cited sources next to answers; the experience contract lists 'Citation chip and sources disclosure' and 'Search and citations' as required parts (doc: docs/product/experience-contract.md:394,457).

**Who uses it.** Anyone who gets a web-searched or researched answer on any of the six apps.

**Problems it solves**

- Trust: the reader can see and open each source.
- Context: a hover or tap preview shows title, site, date and a snippet without leaving the answer.
- Clutter: many sources fold into one compact control.

**Use cases**

- Hover a citation on Web to read a snippet, click to open the page in a new tab.
- Open the sources panel to see which pages were cited and which were only searched.
- On a phone, tap [2] in the text to see a preview, then 'Open page'.
- In the CLI, read the numbered 'Sources' list under the answer.

## 2. User experience

**Where to find it**

- Web and Desktop (hosted web app): inline citation chips in the answer; a 'Sources' pill under the answer labelled 'View N sources' for screen readers; a globe button 'Open sources panel' (title 'Research sources') in the chat header menu; the side panel tab 'Sources' with headings 'Citations' and 'More' (apps/web/features/chat/components/research/ResearchPanel.tsx:306-318,351-352,429).
- Mobile: a pill 'Sources' (or 'Sources so far' while a run waits or after a stop) under the answer opens a sheet with headings 'Citations' and 'More'; inline [n] citations are tappable (apps/mobile/src/features/chat/components/CollapsibleSources.tsx:156-160,246-256).
- Mobile tool timeline: web result rows (WebSearchResultCard) inside the agent activity (apps/mobile/src/features/chat/components/AgentActivityTimeline.tsx:687).
- CLI: a block headed 'Sources' with lines like ' [1] Title https://...' printed after the answer (apps/cli/src/sources.rs:91-103).
- Chrome side panel: citation chips like 'site +N' and a collapsible '$COUNT$ sources' list labelled 'Sources used for this answer' (apps/extension/_locales/en/messages.json:1318,1332,1352).
- VS Code chat view: a collapsible 'Sources' details list with numbered links and host names (apps/extension-vscode/src/features/sidebar-webview/webviewContent.ts:4755-4785).

**Before you start**

- The answer must have search results or citations in its metadata (web search ran, research, or native grounding).
- Web: the Sources pill appears only after the reply finishes and only when sources exist (apps/web/features/chat/components/messages/MessageBubble.tsx:3590).
- CLI: the turn must have called web search (or the managed route sent search results); in own-key mode a Brave or Tavily key must be configured (apps/cli/src/features/exec/tools/web/mod.rs:431-435).

**Screens and controls**

- Citation chip (link): shows favicon or globe, site name, '+N' for grouped sources; hover or keyboard focus opens a card with title, site, published date, 'Retrieved <date>' and a 180-character snippet (packages/ui/unified-chat/src/components/markdown/CitationChip.tsx:109-186; citationPublisher.ts:89-115).
- Source card in the panel: number badge, favicon, title, site and dates, snippet, external-link mark; the whole card is a link (ResearchPanel.tsx:103-196).
- Panel tabs: Sources, Report, Library; close button 'Close sources panel'; source count badge.
- Mobile source row: letter mark, site and date, title, snippet, external-link mark; pressable only when the URL is a valid http(s) link (CollapsibleSources.tsx:120-141).
- Mobile preview alert: buttons 'Cancel' and 'Open page' (CitationChip.tsx:50-52).

**Journey**

1. 1. Ask something that needs the web; the answer streams with [n] markers.
2. 2. When it ends, markers become citation chips (Web) or tappable [n] (Mobile); a Sources control appears.
3. 3. Hover, focus or tap a citation to preview title, site, date and snippet.
4. 4. Click the chip or choose 'Open page' to open the original page (new tab without referrer on Web and Chrome; in-app browser on Mobile).
5. 5. Open the whole list: Web pill or globe button, Mobile pill, Chrome or VS Code details, CLI footer.
6. 6. Click or tap a card to open its page.

**What the person sees and gets**

- Preview cards show title, site, 'Retrieved' date and snippet.
- Empty panel: 'No sources yet' with 'Web pages and memories an answer used will appear here' (ResearchPanel.tsx:198-206).
- Mobile shows an alert 'Could not open source' with 'Check your connection and try again.' if the page cannot open (apps/mobile/src/features/chat/utils/sourceDisplay.ts:33).
- Web panel also lists 'Memory' items the answer used, with 'Manage memory' (ResearchPanel.tsx:153-190).

**Settings**

- None found specific to sources.
- Memory settings section is opened from the panel's 'Manage memory' button (ResearchPanel.tsx:182).

## 3. Current implementation

From reading the code. Not a test result.

**Working in the code**

- Web and Desktop: inline citation chips with hover card, the 'Sources' pill, the side panel with 'Citations' and 'More', numbering by citation order, dedupe by URL, and memory sources (packages/ui/unified-chat/src/components/markdown/CitationChip.tsx:109; apps/web/features/chat/components/messages/MessageBubble.tsx:2442-2450,3590-3600; packages/ui/unified-chat/src/lib/message-sources.ts:186).
- Links open with target _blank and rel noopener noreferrer (CitationChip.tsx:150-152; ResearchPanel.tsx:100-102).
- Mobile: Sources pill and sheet, section headings, tap-to-preview inline citations, open in the in-app browser with tracking parameters stripped, non-openable links not pressable (CollapsibleSources.tsx; CitationChip.tsx:42-53; sourceDisplay.ts:21-35).
- Chrome side panel: hover or focus citation card that also opens on touch, and a collapsible sources list with snippet and date (apps/extension/src/features/side-panel/sources.ts:42-151). The brief marks the Chrome preview as missing; the code has it.
- CLI: numbered 'Sources' footer from web search results with a 300-character snippet kept internally (apps/cli/src/sources.rs:9-103), printed in both the plain REPL and the TUI (apps/cli/src/repl/mod.rs:833; apps/cli/src/tui/tui_app.rs:8665).
- VS Code: collapsible Sources list with only http(s) links as anchors and host names (webviewContent.ts:4737-4785).

**Incomplete**

- Mobile cards show a coloured first-letter mark, not the site icon, by design (CollapsibleSources.tsx:41-44).
- Mobile inline preview is a system alert, not a floating card (CitationChip.tsx:42-53).
- CLI prints text only: no cards, no preview, no open command; the person must click or copy the link from the terminal. The brief marks 'open original' as done for CLI; this is text only. [inferred]
- VS Code list shows title and host only; no snippet, date or preview. Opening the link depends on the webview's link handling, which was not traced.
- Mobile 'Sources' sheet shows no 'No sources yet' message; with zero sources the control is simply not rendered (CollapsibleSources.tsx:150).

**Present but disconnected or switched off**

- Mobile CitationChip component (the pill version) is only used in the research report appendix; chat answers use the inline [n] preview path instead (apps/mobile/src/features/chat/components/research/ResearchSourcesAppendix.tsx:34; MarkdownInline.tsx:36).

**Not available**

- Source cards or hover previews on CLI.
- Snippet, date and preview on VS Code.
- Adding, removing or saving a source (see F034-09).
- Local-mode source cards on public Desktop and Mobile from a local model with no search tool: no source is produced because search needs the cloud or a key [inferred].

## 4. Required behaviour

**Established requirements**

- Sources behind an answer are shown as cards with at least title, site and link. (source: S34.24)
- Hovering or tapping a citation shows a preview (title, site, snippet) without leaving the answer. (source: S34.25)
- A compact source summary can be expanded to the full list of sources used and consulted. (source: S34.26)
- From a citation or source card the user can open the original page or document. (source: S34.27)
- Each card shows the site icon, title, site, date, snippet and an external-link mark (Web panel). (source: capability ledger `audit/ledger/ecosystem-capability-ledger.jsonl`, item S34.24, S34.25, S34.26, S34.27)
- Links open in a new tab without referrer; only openable links are pressable on mobile; with no sources the panel says 'No sources yet'. (source: S34.27; apps/mobile/src/features/chat/components/CollapsibleSources.tsx:104; ResearchPanel.tsx:198-206)
- Citation chip and sources disclosure and search and citations are required transcript components. (source: doc: docs/product/experience-contract.md:394,457)

**Acceptance criteria**

1. On Web, an answer with three searched pages shows a 'Sources · 3' style pill only after streaming ends.
2. Hovering or keyboard-focusing a citation chip shows title, site, published and retrieved dates and a snippet of at most 180 characters.
3. Clicking a chip opens the first source in a new tab; the link has rel noopener noreferrer.
4. The panel lists cited pages under 'Citations' numbered by citation order and the rest under 'More'; an empty panel says 'No sources yet'.
5. On Mobile, tapping [n] in the answer shows an alert with Cancel and 'Open page'; a source with an invalid URL is not pressable.
6. On Mobile, the 'Sources' pill reads 'Sources so far' when a run is waiting for approval or ended early.
7. In the CLI, a turn with web results prints 'Sources' and one numbered line per distinct URL; a turn with none prints nothing.
8. On Chrome, the 'N sources' details list has an accessible label and each item opens in a new tab.

**Inferred requirements** (not stated anywhere; reasoned from the code or from competitor parity)

- A source whose host is a routing redirect should show its real publisher, not the router (citationPublisher.ts:63-80). [inferred from the code comment]
- Opening a source should never load a third-party favicon on Mobile without the person asking (CollapsibleSources.tsx:41-44). [inferred]

**Proposed improvements** (suggestions, not requirements)

- [proposed] Add an 'open source' action in the CLI TUI using the same list.
- [proposed] Show snippet and date in the VS Code list.
- [proposed] Add an empty 'No sources yet' state on Mobile and Chrome to match Web.

## 5. Implementation map

| Kind | Name | Path | Role |
|---|---|---|---|
| component | CitationChip | `packages/ui/unified-chat/src/components/markdown/CitationChip.tsx` | Inline chip and hover card shared by web, desktop and other surfaces that use the shared markdown. |
| other | citationPublisher helpers | `packages/ui/unified-chat/src/components/markdown/citationPublisher.ts` | Publisher domain, snippet clip (180), published and retrieved labels. |
| component | MarkdownContent citation handling | `packages/ui/unified-chat/src/components/markdown/MarkdownContent.tsx` | Turns [n] and group links into chips (citationChipItems, line 275). |
| other | citationMarkers | `packages/ui/unified-chat/src/components/markdown/citationMarkers.ts` | Marker patterns and tracking-parameter stripping used by web and mobile. |
| other | message-sources | `packages/ui/unified-chat/src/lib/message-sources.ts` | collectMessageResearchSources, dedupe, orderSourcesByCitation, hides opaque encrypted snippets. |
| component | ResearchPanel, SourcesControl, ResearchToggleButton | `apps/web/features/chat/components/research/ResearchPanel.tsx` | Side panel, source cards, 'Sources' pill, globe toggle, empty state, memory list. |
| store | useResearchPanelStore | `apps/web/features/chat/stores/research-panel-store.ts` | Open state and the cited and more lists for the active conversation. |
| component | MessageBubble (web) | `apps/web/features/chat/components/messages/MessageBubble.tsx` | Collects sources, splits cited and more, mounts SourcesControl (lines 2035, 2442, 3590). |
| screen | WebChatPage header controls | `apps/web/features/chat/pages/WebChatPage.tsx` | Mounts ResearchToggleButton and the panel (lines 7479, 7518). |
| component | CollapsibleSources (mobile) | `apps/mobile/src/features/chat/components/CollapsibleSources.tsx` | Sources pill and sheet with Citations and More. |
| component | CitationChip and previewCitation (mobile) | `apps/mobile/src/features/chat/components/CitationChip.tsx` | Preview alert with 'Open page'; chip used in the research appendix. |
| component | MarkdownInline (mobile) | `apps/mobile/src/features/chat/components/MarkdownInline.tsx` | Makes inline [n] tappable and calls previewCitation (lines 211-251). |
| component | WebSearchResultCard (mobile) | `apps/mobile/src/features/chat/components/WebSearchResultCard.tsx` | Result row in the agent timeline and research appendix. |
| other | sourceDisplay | `apps/mobile/src/features/chat/utils/sourceDisplay.ts` | canOpenSource, openSource through the in-app browser, publisher and snippet helpers. |
| other | messageSources (mobile) | `apps/mobile/src/features/chat/utils/messageSources.ts` | Builds the source list from search results and citations. |
| component | side-panel sources (Chrome) | `apps/extension/src/features/side-panel/sources.ts` | decorateCitations, buildCitationChip with hover card, buildSourcesFooter. |
| component | bubbles (Chrome) | `apps/extension/src/features/side-panel/bubbles.ts` | Calls decorateCitations and buildSourcesFooter (lines 402, 770). |
| service | CLI sources module | `apps/cli/src/sources.rs` | Collects sources per turn, dedupes by URL, renders the 'Sources' footer. |
| service | CLI web search tool | `apps/cli/src/features/exec/tools/web/mod.rs` | Runs the search on the device and records sources (lines 420-492). |
| service | CLI stream hook | `apps/cli/src/models/streaming.rs` | Records managed-route x_search_results events as sources (line 924). |
| component | VS Code appendSources | `apps/extension-vscode/src/features/sidebar-webview/webviewContent.ts` | Builds the Sources details list at the end of a turn (lines 4746-4785, 7884). |
| service | VS Code source_list event | `apps/extension-vscode/src/features/sidebar-webview/ChatStateManager.ts` | Posts sourceList (url, title) to the webview (line 6653). |
| service | Web search tool | `apps/web/lib/web-search/web-search-tool.ts` | Server search call returning title, URL, snippet and date for the model and sources. |
| table | web_messages | `apps/web/app/api/chat/conversations/[id]/messages/route.ts` | Stores searchResults and citations in message metadata (read path in message-sources.ts). |

## 6. Execution and data flow

| Step | Runs on | Source |
|---|---|---|
| A searching turn runs the web search tool on the server, which calls a search provider and returns up to 5 results (title, URL, snippet, date). | our servers | apps/web/lib/web-search/web-search-tool.ts:56,298-311 |
| Results and citations are stored in the message metadata and sent to the client. | our servers | apps/web/features/chat/components/messages/MessageBubble.tsx:2025-2038 |
| The client builds the source list, removes duplicates, links [n] markers, and splits cited from more. | device | packages/ui/unified-chat/src/lib/message-sources.ts:89-186; MessageBubble.tsx:2442 |
| Hover or tap shows the preview from data already on the device; no request is made for the preview. | device | CitationChip.tsx:75-107 |
| The browser may fetch the site's icon from a public favicon service (Web and Chrome side panel use google favicons URL; Mobile does not). | outside service | CitationChip.tsx:39; apps/mobile/src/features/chat/components/CollapsibleSources.tsx:41-44 |
| Clicking opens the original page in a new tab, or in the in-app browser on Mobile. | device | CitationChip.tsx:150-152; apps/mobile/src/features/chat/utils/sourceDisplay.ts:27 |
| CLI own-key: the device calls the Brave or Tavily search service directly with the user's saved key; in Managed mode the cloud runs the search and streams result events. | outside service | apps/cli/src/features/exec/tools/web/mod.rs:431-450; apps/cli/src/models/streaming.rs:924 |
| The CLI renders the footer after the turn ends. | device | apps/cli/src/repl/mod.rs:833 |

**Data**

| What | Stored in | Synced | Kept or deleted |
|---|---|---|---|
| Search results and citations (URL, title, snippet, dates, favicon) | Message metadata (searchResults, citations) in table web_messages; Mobile keeps message citations locally | Yes with the conversation (Cloud) | With the message; reopened chats restore them (apps/mobile/__tests__/cloud-chat-sources-persistence.test.ts by name). |
| Open panel state and the active sources | In memory, store useResearchPanelStore | No | Lost on reload. |
| CLI turn sources | Task-local memory for one turn | No | Dropped after the footer prints (apps/cli/src/sources.rs:16-25). |

**Models and providers.** The model decides what to cite; the search itself runs on a search provider, not the chat model: the server uses Perplexity search with a key set in environment configuration named PERPLEXITY_API_KEY (apps/web/lib/web-search/web-search-providers.json), and some turns use native search of the answering model (message-sources.ts comments). The CLI own-key mode uses Brave or Tavily. Viewing sources uses no model.

## 7. Access and usage rules

| Rule | What the code does |
|---|---|
| Account | Sources are shown for any answer that has them. Producing them needs the managed chat service (account) or, on the CLI, a search key. Viewing them needs no extra account. |
| Permissions | Workspace site rules can drop results: the CLI filters results the workspace administrator does not allow (apps/cli/src/features/exec/tools/web/mod.rs:462-471); the server applies allow and deny domain lists to results (web-search-tool.ts:458). |
| Subscription | No gate on viewing sources found. Searching is metered: each search is charged as Agentic search (apps/web/public/openapi.json:762). Plan limits on search: see apps/web/lib/web-search/search-allowance.ts (not read). |
| Limits and metering | At most 5 results per search and 3 searches per turn (10 in AGI Work) (web-search-tool.ts:54-56). Snippet clip 180 characters in hover cards and 300 in the CLI. |
| Feature flags | None found for the display. |
| Model compatibility | Display works for any model that returns citations or whose turn ran the search tool. |
| Provider restrictions | Search provider is fixed per route (Perplexity on the server; Brave or Tavily on CLI own-key). |
| Local mode | No source cards come from local inference by itself. On Mobile Local mode no search tool was found in the paths read; unknown. On the CLI the web_search tool runs on the device but calls an outside search service, so it is not offline; whether Local mode blocks it is unknown. |

## 8. States and edge cases

| State | Behaviour | Source |
|---|---|---|
| No sources | Web panel shows 'No sources yet'; Mobile and Web pill are not rendered; CLI prints nothing. | ResearchPanel.tsx:198; CollapsibleSources.tsx:150; apps/cli/src/sources.rs:92 |
| Streaming | Web shows the Sources pill only after the message stops streaming; Mobile holds a link while streaming. | MessageBubble.tsx:3590; apps/mobile/src/features/chat/utils/streamingCitationLink.ts (import at MessageContentRenderer.tsx:71) |
| Run stopped or waiting for approval | Mobile title becomes 'Sources so far'; Web shows 'Sources so far' beside the pill while awaiting approval. | CollapsibleSources.tsx:155; MessageBubble.tsx:3592 |
| Broken favicon | Falls back to a globe icon. | CitationChip.tsx:60-62 |
| Invalid or non-web URL | Mobile row is not pressable and has role text; VS Code shows plain text instead of a link. | CollapsibleSources.tsx:104-110; webviewContent.ts:4777 |
| Open failure (Mobile) | Alert 'Could not open source'. | apps/mobile/src/features/chat/utils/sourceDisplay.ts:33 |
| Redirect hosts | Publisher taken from site name or title instead of the routing host. | citationPublisher.ts:63-80 |
| Terminal control characters in titles | CLI sanitises them before printing. | apps/cli/src/sources.rs:99-100 |
| Accessibility | Web chip has an aria-label listing sources; panel is a dialog when it covers the page; Mobile rows have link roles and hints; Chrome list has an accessible name. | CitationChip.tsx:117-130; ResearchPanel.tsx:393; CollapsibleSources.tsx:103-109 |
| Offline or reconnect | Not handled in the code for the display; stored sources show from local message data. | not handled in the code (searched the files listed) |

## 9. Verification

What has actually been seen by a person is in the Status table above. This section lists what exists to check with.

**Existing tests**

- `packages/ui/unified-chat/src/components/markdown/CitationChip.card.test.tsx`: Hover card content for the citation chip.
- `packages/ui/unified-chat/src/components/markdown/citationMarkers.test.ts`: Citation marker parsing.
- apps/web/features/chat/components/research/__tests__/ResearchPanel.sourcesNumbering.test.tsx (not found) (not found): Numbering of sources in the panel.
- apps/web/features/chat/components/research/__tests__/ResearchPanel.sourceTitle.test.ts (not found) (not found): Title fallback for sources.
- apps/web/features/chat/components/research/__tests__/ResearchPanel.memorySources.test.tsx (not found) (not found): Memory list in the panel.
- `apps/mobile/__tests__/SourceControls.test.tsx`: Mobile Sources sheet (CollapsibleSources).
- `apps/mobile/__tests__/cloud-chat-sources-persistence.test.ts`: Sources kept after reopening a chat (by file name).
- `apps/mobile/src/features/chat/components/__tests__/MessageContentRenderer.inlineCitations.test.tsx`: Inline citation rendering on Mobile.
- `apps/mobile/__tests__/AssistantLinkOpening.test.tsx`: Opening links from answers.
- `apps/extension/__tests__/side-panel-markdown-parity.test.ts`: Side-panel markdown including citations and sources (matched by the sources imports).
- `apps/extension-vscode/src/__tests__/__snapshots__/webviewContent.snapshot.test.ts.snap`: Snapshot that contains the message-sources markup.

**Test scenarios**

- **Hover card on Web**
  1. Ask a question that needs a search.
  2. Hover a citation chip, then focus it with the keyboard.
  - Expected: Card shows title, site, dates and snippet; click opens a new tab with no referrer.
- **Sources panel**
  1. Press the globe button 'Open sources panel'.
  2. Scroll the lists.
  - Expected: 'Citations' and 'More' lists of cards with number badges; count badge on the button.
- **Empty panel**
  1. Open the panel in a chat with no searched answer.
  - Expected: 'No sources yet' text.
- **Mobile preview and open**
  1. On Mobile (Cloud) ask a searched question.
  2. Tap [1], choose 'Open page'.
  3. Open the 'Sources' pill.
  - Expected: Alert with site and snippet; page opens in the in-app browser; sheet shows Citations and More.
- **CLI footer**
  1. In the CLI configure a search key or use Managed mode.
  2. Ask a current-events question.
  - Expected: After the answer a 'Sources' block lists '[n] title url'.
- **Chrome and VS Code lists**
  1. Ask a searched question in the Chrome side panel and in the VS Code chat.
  - Expected: Chrome chips show a card on hover and a 'N sources' list; VS Code shows a collapsible Sources list with links.

**Where to look when it fails**

- CLI web search errors: 'Web search not configured...', 'Web search is unavailable: <backend> answered HTTP <code>' (apps/cli/src/features/exec/tools/web/mod.rs:431-453).
- Server web search error codes: invalid_tool_input, not_configured, rate_limited, upstream_error, cancelled, timeout (web-search-tool.ts:112-118).
- Message metadata keys searchResults and citations in web_messages.
- Browser console for favicon image errors (non-fatal).

**Hands-on test plans**

- Web: [70-qa/test-plans/web/034-search-experiences.md](../../70-qa/test-plans/web/034-search-experiences.md)
- Desktop: [70-qa/test-plans/desktop/034-search-experiences.md](../../70-qa/test-plans/desktop/034-search-experiences.md)
- Mobile: [70-qa/test-plans/mobile/034-search-experiences.md](../../70-qa/test-plans/mobile/034-search-experiences.md)
- CLI: [70-qa/test-plans/cli/034-search-experiences.md](../../70-qa/test-plans/cli/034-search-experiences.md)
- VS Code: [70-qa/test-plans/vscode/034-search-experiences.md](../../70-qa/test-plans/vscode/034-search-experiences.md)
- Chrome: [70-qa/test-plans/chrome/034-search-experiences.md](../../70-qa/test-plans/chrome/034-search-experiences.md)

## 10. Gaps and dependencies

- **CLI shows a text footer only; no preview and no open action.** Affects: CLI. Evidence: apps/cli/src/sources.rs:91-103. Work needed: Decide on a TUI preview and an open-in-browser key.
- **VS Code list lacks snippet, date and preview.** Affects: VS Code. Evidence: webviewContent.ts:4755-4785. Work needed: Send snippet and date in the sourceList event and render them.
- **Brief marks Chrome citation preview as missing; code has it.** Affects: Brief accuracy. Evidence: apps/extension/src/features/side-panel/sources.ts:42-95. Work needed: Correct the brief.
- **Mobile uses a letter mark and an alert instead of site icon and floating card.** Affects: Mobile. Evidence: CollapsibleSources.tsx:41-44; CitationChip.tsx:42. Work needed: Design decision; confirm it is intended.
- **No 'No sources yet' state on Mobile, Chrome, CLI, VS Code.** Affects: those apps. Evidence: CollapsibleSources.tsx:150; sources.rs:92. Work needed: Add or accept silence.
- **Public Desktop in Local mode and Mobile Local mode have no source producer found.** Affects: Local users. Evidence: no search tool found in local paths read. Work needed: Confirm and, if needed, add a local search or a clear message.

**Depends on**

- surface:web
- surface:desktop
- surface:mobile
- surface:cli
- surface:vscode
- surface:chrome
- mode:cloud
- mode:own-key
- file:packages/ui/unified-chat/src/components/markdown/CitationChip.tsx
- file:apps/web/features/chat/components/research/ResearchPanel.tsx
- file:apps/cli/src/sources.rs
- provider:perplexity
- table:web_messages
- SYS-chat-turn-pipeline
- SYS-shared-ui-and-design
- SYS-inference-providers
- SYS-subscriptions-entitlements-and-usage
- SYS-execution-boundaries
- F034-07
- F034-09

## Unknown

- How VS Code opens a clicked link inside the webview; not traced.
- Whether Local mode on Mobile or Desktop ever produces sources (project knowledge or a local search tool); the Tauri build notes in docs/decisions/wire-or-cut.md:646 describe sources on Local turns for internal code only.
- Plan limits on search counts, in apps/web/lib/web-search/search-allowance.ts (not read).
- Contents of the Chrome, VS Code and CLI tests; only file names were checked and no CLI test for render_footer was located.
- Why the brief lists CLI tui_app.rs:6207 and repl/mod.rs:701 for opening a source; those lines hold other code.
