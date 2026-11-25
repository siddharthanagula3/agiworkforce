---
id: "F036-02"
type: "feature"
title: "Source card details"
aliases: ["Source card", "Citation hover card", "Citation card", "Source details", "Citation preview", "Source preview"]
area: "36 Sources and grounding interface"
available_on: ["web", "desktop", "mobile", "chrome"]
implementation: {web: "built", desktop: "built", mobile: "built", cli: "missing", vscode: "missing", chrome: "partial"}
verification: {web: "not seen by a person", desktop: "not seen by a person", mobile: "not seen by a person", cli: "n/a", vscode: "n/a", chrome: "not seen by a person"}
requirement_items: ["S36.02", "S36.03", "S36.05", "S36.06", "S36.08"]
depends_on: ["surface:web", "surface:desktop", "surface:mobile", "surface:chrome", "surface:cli", "surface:vscode", "F036-01", "SYS-chat-turn-pipeline", "SYS-shared-ui-and-design", "file:packages/ui/unified-chat/src/components/markdown/citationPublisher.ts"]
basis: "code inspection"
second_reader: "not sampled: statements are code readings that nobody has re-checked"
last_reviewed: "2026-11-24"
revision: "f51d16e747"
---
# F036-02 Source card details

The source card shows what a source is: title, site, published date, retrieved date and the supporting excerpt. Web and Desktop show it as a hover or focus card. Mobile shows it in a native alert and in the sources list. The Chrome side panel shows a card with title, host, snippet and a raw date. CLI and VS Code do not.

Area: [36. Sources and grounding interface](README.md). Requirement items: [S36.02](../../10-requirements/capabilities/036-sources-and-grounding-interface.md#s3602), [S36.03](../../10-requirements/capabilities/036-sources-and-grounding-interface.md#s3603), [S36.05](../../10-requirements/capabilities/036-sources-and-grounding-interface.md#s3605), [S36.06](../../10-requirements/capabilities/036-sources-and-grounding-interface.md#s3606), [S36.08](../../10-requirements/capabilities/036-sources-and-grounding-interface.md#s3608).

## Status

Two separate questions: is the code there, and has a person seen it work. "Seen working" comes only from results of real runs recorded in the project's ledger.

| App | In the code: this page's reading, 2026-11-24 | In the code: ledger audit, 2026-09-26 and later updates | Seen working by a person |
|---|---|---|---|
| Web | built | built | not seen by a person |
| Desktop | built | built | not seen by a person |
| Mobile | partly built (this page lists unfinished parts) | built | not seen by a person |
| CLI | not built | not built | n/a |
| VS Code | not built | not built | n/a |
| Chrome | partly built | partly built | not seen by a person |

The first column was derived from this page's text by a second, cheaper pass and has not been validated item by item; the ledger column is the project's own record. Neither is a test result.

## 1. Purpose and user value

**What it does.** Gives the reader the facts needed to judge a source without leaving the answer: title, publisher domain, published date, retrieved date and a short excerpt (packages/ui/unified-chat/src/components/markdown/CitationChip.tsx:82-122).

**Why it exists.** Sources only build trust if the reader can see what they are. The brief requires title (S36.02), publisher (S36.03), publication date (S36.05), retrieval date (S36.06) and supporting excerpt (S36.08).

**Who uses it.** Readers checking an answer on Web, Desktop, Mobile and Chrome; testers checking source data.

**Problems it solves**

- A redirect host of a search provider showed as the site for every source (citationPublisher.ts header comment).
- Dates arrived in different shapes from different back ends.
- Long excerpts could fill the screen.

**Use cases**

- Hover a chip on Web to see the title, site, date and excerpt.
- Tap [1] on Mobile to read the same fields in an alert.
- Open the sources list under an answer on Mobile to browse all rows.
- Focus a Chrome chip with the keyboard to read its card.

## 2. User experience

**Where to find it**

- Web and Desktop: hover or focus a citation chip in the answer (CitationChip.tsx:168-182); the research panel rows in apps/web/features/chat/components/research/ResearchPanel.tsx:80-92.
- Mobile: tap an inline marker, which opens an alert (apps/mobile/src/features/chat/components/CitationChip.tsx:42-51); the sources list under the answer (apps/mobile/src/features/chat/components/CollapsibleSources.tsx); a web search result row (apps/mobile/src/features/chat/components/WebSearchResultCard.tsx).
- Chrome side panel: hover or focus a chip, or touch it once (apps/extension/src/features/side-panel/sources.ts:42-100); the sources footer 'details' list (sources.ts:136-151).
- CLI, VS Code: not available for these fields.

**Before you start**

- A source with data. Fields missing from the source are left out of the card.

**Screens and controls**

- Web card row: favicon, title (or site name when no title), host, a dot and the date, then 'Retrieved <date>', then the excerpt (CitationChip.tsx:82-122).
- Mobile alert: title or publisher as header, a line 'site · Published <date> · Retrieved <date>', blank line, excerpt; buttons Cancel and Open page (CitationChip.tsx:34-51).
- Chrome card: host with globe icon, title, snippet and raw published date (sources.ts:21-40).

**Journey**

1. Read an answer with chips.
2. Hover (mouse), focus (keyboard) or tap (Mobile, touch) a chip.
3. Read the card.
4. Click the link or Open page to leave the card and open the source.

**What the person sees and gets**

- Card text with the five fields.
- Screen reader gets 'Source n:' before the title (CitationChip.tsx:98).
- Mobile chip label includes 'published <date>' when known (CitationChip.tsx:88).

**Settings**

- none found in the code. Dates use the device locale (citationPublisher.ts:99-115).

## 3. Current implementation

From reading the code. Not a test result.

**Working in the code**

- Title falls back to site name when empty (CitationChip.tsx:83-84).
- Publisher domain is the URL host, except for two routing redirect hosts where the site name or title is used when it looks like a domain (citationPublisher.ts:32-36, 63-79).
- Published date: parsed dates are formatted by locale; an unparseable phrase shows as given only if 32 characters or fewer, otherwise it is dropped (citationPublisher.ts:82, 99-107).
- Retrieved date: shown as 'Retrieved <date>' only when it parses (citationPublisher.ts:109-114).
- Snippet: whitespace is collapsed and text over 180 characters is cut and ends with an ellipsis (citationPublisher.ts:81, 88-97).
- Retrieval time is set when a web search runs (apps/web/lib/web-search/web-search-tool.ts:462) and in the research loop (research-loop.ts:801-823).
- Mobile alert and rows use the same shared helper functions (CitationChip.tsx:15-18; sourcePublishedDate.ts).
- Web research panel shows 'Retrieved <date>' (ResearchPanel.tsx:88).

**Incomplete**

- Chrome: the card shows host, title, snippet and the raw published string; no retrieved date and no date formatting; snippet is not cut by the shared helper (sources.ts:21-40). The brief marks Chrome S36.02, S36.03 as done and S36.05, S36.06, S36.08 as missing; the code shows snippet and date present, so brief and code disagree.
- Mobile WebSearchResultCard shows title, snippet, host and published date but no retrieved date (WebSearchResultCard.tsx:66-110).
- VS Code forwards only url and title from a source list (apps/extension-vscode/src/features/sidebar-webview/ChatStateManager.ts:6654), so snippet and dates are dropped before display.

**Present but disconnected or switched off**

- none found.

**Not available**

- CLI: no card; the /links command prints label and URL only (apps/cli/src/claude_parity.rs:1054-1085).
- VS Code: the list shows title and host only (webviewContent.ts:4755-4784).

## 4. Required behaviour

**Established requirements**

- Each cited source shows its title. (source: S36.02)
- Each cited source shows its publisher or site name or domain. (source: S36.03)
- Cited sources show their publication date when known. (source: S36.05)
- Cited sources show when they were retrieved or accessed. (source: S36.06)
- A cited source shows the quoted excerpt that supports the claim. (source: S36.08)
- Citation integrity includes title and timestamp. (source: doc: docs/product/competitive-guidance.md:283)

**Acceptance criteria**

1. A source with title, URL, snippet, publishedDate and retrievedAt shows all five on Web hover.
2. A source with only a URL shows its domain and nothing else.
3. A snippet of 400 characters shows at most 180 characters plus an ellipsis.
4. A publishedDate of '2 days ago' shows as given; a 40-character phrase is omitted.
5. A source whose URL is a vertexaisearch redirect and whose title is 'example.com' shows example.com as the site.
6. On Mobile, tapping a marker shows the published and retrieved dates in the alert.
7. On Chrome, the card shows the snippet and date, and the retrieved date is absent (current).

**Inferred requirements** (not stated anywhere; reasoned from the code or from competitor parity)

- The retrieved date helps judge freshness; it is set at fetch time, not the page's own date [inferred from web-search-tool.ts:462].
- A card should read the same on every app for the same source [inferred from the shared helper reuse on Mobile].

**Proposed improvements** (suggestions, not requirements)

- [proposed] Move the Chrome card to the shared helpers and add the retrieved date.
- [proposed] Pass snippet and dates through to VS Code.
- [proposed] Show the retrieved date on the Mobile search result row.

## 5. Implementation map

| Kind | Name | Path | Role |
|---|---|---|---|
| component | TooltipSourceRow | `packages/ui/unified-chat/src/components/markdown/CitationChip.tsx` | One source in the card (82-122). |
| service | citationPublisherDomain | `packages/ui/unified-chat/src/components/markdown/citationPublisher.ts` | Chooses the site domain (63-79). |
| service | citationSnippet / citationPublishedLabel / citationRetrievedLabel | `packages/ui/unified-chat/src/components/markdown/citationPublisher.ts` | Field formatting (88-114). |
| component | ResearchPanel | `apps/web/features/chat/components/research/ResearchPanel.tsx` | Research source rows with host, date, Retrieved date, snippet (80-92). |
| service | sourceDisplay (mobile) | `apps/mobile/src/features/chat/utils/sourceDisplay.ts` | sourcePublisher and sourceSnippet. |
| service | sourcePublishedDate (mobile) | `apps/mobile/src/features/chat/utils/sourcePublishedDate.ts` | Formats the published date with the shared helper. |
| component | previewCitation (mobile) | `apps/mobile/src/features/chat/components/CitationChip.tsx` | Builds the alert text (34-51). |
| component | CollapsibleSources (mobile) | `apps/mobile/src/features/chat/components/CollapsibleSources.tsx` | Sources list under the answer with letter marks. |
| component | WebSearchResultCard (mobile) | `apps/mobile/src/features/chat/components/WebSearchResultCard.tsx` | Row with title, snippet, host, published date. |
| component | Chrome buildSourceLink | `apps/extension/src/features/side-panel/sources.ts` | Card rows and footer list (21-40). |
| service | web-search-tool | `apps/web/lib/web-search/web-search-tool.ts` | Sets retrievedAt at search time (462, 488). |
| service | research-loop | `apps/web/app/api/llm/v1/chat/completions/lib/research-loop.ts` | Keeps retrieval time per source (847-897, 986, 1008). |
| service | useChatStream | `apps/web/lib/hooks/useChatStream.ts` | Carries retrievedAt into client message data (3641). |
| component | VS Code sources list | `apps/extension-vscode/src/features/sidebar-webview/webviewContent.ts` | Shows title and host only (4755-4784). |
| service | VS Code source forwarding | `apps/extension-vscode/src/features/sidebar-webview/ChatStateManager.ts` | Sends only url and title (6654). |
| schema | AgentEventSource | `packages/contracts/types/src/generated/protocol/AgentEventSource.ts` | Protocol type: url, title, optional snippet; has no date fields. |
| component | CLI links_command | `apps/cli/src/claude_parity.rs` | Prints label and URL only (1054). |

## 6. Execution and data flow

| Step | Runs on | Source |
|---|---|---|
| A web search or research step fetches a result and stamps the retrieval time. | our servers | apps/web/lib/web-search/web-search-tool.ts:462; research-loop.ts:897. Mode differences unknown. |
| The stream delivers sources with title, snippet, dates to the client message. | our servers | useChatStream.ts:3641 |
| The client formats site, dates and excerpt with the shared helpers. | device | citationPublisher.ts:63-114 |
| The card shows when the user hovers, focuses or taps. | device | CitationChip.tsx:168-182 |

**Data**

| What | Stored in | Synced | Kept or deleted |
|---|---|---|---|
| Source fields (title, url, snippet, publishedDate, retrievedAt) | Message metadata with the chat | follows chat sync; details unknown | follows the chat |

**Models and providers.** Search back ends supply the published date in different shapes (citationPublisher.ts:95-98 comment). The model does not create these fields; they come from the search or provider result. Which providers fill snippet and date: unknown.

## 7. Access and usage rules

| Rule | What the code does |
|---|---|
| Account | none found in the code for the card. |
| Permissions | none found in the code. |
| Subscription | none found in the code for the card. |
| Limits and metering | Snippet text is cut at 180 characters on Web and Mobile (citationPublisher.ts:81). |
| Feature flags | none found in the code. |
| Model compatibility | Model neutral; the card only reads the source record. |
| Provider restrictions | Two Google grounding redirect hosts are treated as routers (citationPublisher.ts:32-36). Other routers are not covered. |
| Local mode | The card is drawn on the device. Whether Local turns produce sources: unknown. |

## 8. States and edge cases

| State | Behaviour | Source |
|---|---|---|
| Missing fields | Left out; a URL-only source shows its domain. | CitationChip.tsx:82-122; citationPublisher.ts:88-114 |
| Unparseable date | Phrase kept if 32 characters or fewer, else dropped. | citationPublisher.ts:99-107 |
| Invalid retrieved date | Left out. | citationPublisher.ts:109-114 |
| Keyboard focus | Web card opens on focus through the tooltip; Chrome opens on focusin and closes on Escape. | CitationChip.tsx:124-146; sources.ts:73-98 |
| Card near the screen edge | Chrome card shifts left to stay in view. | sources.ts:62-67 |
| Mobile source with no openable URL | No alert; press disabled. | CitationChip.tsx:26-28, 84-86 |
| Loading, offline, timeout | not handled in the code for the card itself; the card reads data already on the message. | packages/ui/unified-chat/src/components/markdown/CitationChip.tsx:82-122 (no loading or network state) |

## 9. Verification

What has actually been seen by a person is in the Status table above. This section lists what exists to check with.

**Existing tests**

- `packages/ui/unified-chat/src/components/markdown/__tests__/citationPublisher.test.ts`: Publisher, date and snippet helpers (by file name).
- `packages/ui/unified-chat/src/components/markdown/CitationChip.card.test.tsx`: Card content (by file name).
- `apps/mobile/__tests__/CollapsibleSources.test.tsx`: Mobile sources list (by file name).
- `apps/mobile/__tests__/SourceControls.test.tsx`: Mobile source controls (by file name).
- `apps/mobile/src/features/research/__tests__/ReportsScreenCitations.test.tsx`: Mobile research citation display (by file name).

**Test scenarios**

- **All fields**
  1. Render a source with every field.
  2. Hover the chip.
  - Expected: Title, host, date, Retrieved date and excerpt show.
- **URL only**
  1. Render a source with only a URL.
  - Expected: Domain shows; no empty lines.
- **Long excerpt**
  1. Use a 400 character snippet.
  - Expected: Cut at 180 characters with an ellipsis.
- **Redirect host**
  1. Use a source with a vertexaisearch redirect URL and title 'example.com'.
  - Expected: Site shows as example.com.
- **Mobile alert**
  1. Tap a marker for a source with dates and a snippet.
  - Expected: Alert shows both dates and the snippet.
- **Chrome card**
  1. Hover a Chrome chip.
  - Expected: Title, host, snippet, raw date; no retrieved date.

**Where to look when it fails**

- Inspect data-citation-retrieved and data-citation-snippet attributes in the web card (CitationChip.tsx:107-118).
- Check that metadata carries retrievedAt (useChatStream.ts:3641).

**Hands-on test plans**

- Web: [70-qa/test-plans/web/036-sources-and-grounding-interface.md](../../70-qa/test-plans/web/036-sources-and-grounding-interface.md)
- Desktop: [70-qa/test-plans/desktop/036-sources-and-grounding-interface.md](../../70-qa/test-plans/desktop/036-sources-and-grounding-interface.md)
- Mobile: [70-qa/test-plans/mobile/036-sources-and-grounding-interface.md](../../70-qa/test-plans/mobile/036-sources-and-grounding-interface.md)
- Chrome: [70-qa/test-plans/chrome/036-sources-and-grounding-interface.md](../../70-qa/test-plans/chrome/036-sources-and-grounding-interface.md)

## 10. Gaps and dependencies

- **Chrome card lacks retrieved date and shared formatting** Affects: Chrome users. Evidence: sources.ts:21-40. Work needed: Use the shared helpers.
- **VS Code drops snippet and dates** Affects: VS Code users. Evidence: ChatStateManager.ts:6654. Work needed: Forward all fields and draw them.
- **CLI shows no fields** Affects: CLI users. Evidence: claude_parity.rs:1054. Work needed: Print title, site, dates.
- **The protocol type has no date fields** Affects: All apps using AgentEventSource. Evidence: AgentEventSource.ts:3. Work needed: Add optional dates to the contract or confirm another type carries them.
- **Only two redirect hosts are known** Affects: Sources from other routers. Evidence: citationPublisher.ts:32-36. Work needed: Resolve redirects when sources are ingested (the file says this).
- Not built on: CLI, VS Code (from the capability ledger).

**Depends on**

- surface:web
- surface:desktop
- surface:mobile
- surface:chrome
- surface:cli
- surface:vscode
- F036-01
- SYS-chat-turn-pipeline
- SYS-shared-ui-and-design
- file:packages/ui/unified-chat/src/components/markdown/citationPublisher.ts

## Unknown

- Whether Tauri desktop shows the card.
- Which providers fill snippet and published date.
- Contents of tests not opened.
- Where retrievedAt is saved in the database.
