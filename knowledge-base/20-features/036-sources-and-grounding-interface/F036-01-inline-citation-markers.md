---
id: "F036-01"
type: "feature"
title: "Inline citation markers"
aliases: ["Citation chip", "Citation marker", "Inline citation", "Source chip", "Claim-to-source link", "Grouped citation", "[n] marker"]
area: "36 Sources and grounding interface"
available_on: ["web", "desktop", "mobile", "chrome"]
implementation: {web: "built", desktop: "built", mobile: "partial", cli: "missing", vscode: "missing", chrome: "partial"}
verification: {web: "not seen by a person", desktop: "not seen by a person", mobile: "not seen by a person", cli: "n/a", vscode: "n/a", chrome: "n/a"}
requirement_items: ["S36.01", "S36.16", "S36.17"]
depends_on: ["surface:web", "surface:desktop", "surface:mobile", "surface:chrome", "surface:cli", "surface:vscode", "SYS-chat-turn-pipeline", "SYS-shared-ui-and-design", "SYS-execution-boundaries", "file:packages/ui/unified-chat/src/components/markdown/CitationChip.tsx", "file:packages/ui/unified-chat/src/components/markdown/citationMarkers.ts", "file:apps/mobile/src/features/chat/components/MarkdownInline.tsx", "file:apps/extension/src/features/side-panel/sources.ts"]
basis: "code inspection"
second_reader: "not sampled: statements are code readings that nobody has re-checked"
last_reviewed: "2026-11-24"
revision: "f51d16e747"
---
# F036-01 Inline citation markers

Inline citation markers turn a marker such as [1] in an assistant answer into a small source chip at the claim it supports. Touching markers such as [1][2] become one grouped chip. Web, Desktop (hosted web) and the Chrome side panel draw site-name chips. Mobile draws teal [n] text. CLI and VS Code have no markers.

Area: [36. Sources and grounding interface](README.md). Requirement items: [S36.01](../../10-requirements/capabilities/036-sources-and-grounding-interface.md#s3601), [S36.16](../../10-requirements/capabilities/036-sources-and-grounding-interface.md#s3616), [S36.17](../../10-requirements/capabilities/036-sources-and-grounding-interface.md#s3617).

## Status

Two separate questions: is the code there, and has a person seen it work. "Seen working" comes only from results of real runs recorded in the project's ledger.

| App | In the code: this page's reading, 2026-11-24 | In the code: ledger audit, 2026-09-26 and later updates | Seen working by a person |
|---|---|---|---|
| Web | built | built | not seen by a person |
| Desktop | built | built | not seen by a person |
| Mobile | partly built | partly built | not seen by a person |
| CLI | not built | not built | n/a |
| VS Code | not built | not built | n/a |
| Chrome | partly built **(disagrees with the ledger on whether it exists)** | not built | n/a |

The first column was derived from this page's text by a second, cheaper pass and has not been validated item by item; the ledger column is the project's own record. Neither is a test result.
Where the two disagree on whether the feature exists on an app, the case is listed in [ledger corrections](../../90-meta/ledger-corrections.md).

## 1. Purpose and user value

**What it does.** Places a clickable source marker at the end of the claim it backs, so the reader can see which source supports which sentence. The shared web renderer turns the text marker into a pill with the site name, an optional +N count and a hover card (packages/ui/unified-chat/src/components/markdown/CitationChip.tsx:124-186). Mobile turns the marker into teal [n] text that opens a preview (apps/mobile/src/features/chat/components/MarkdownInline.tsx:256).

**Why it exists.** A reader cannot trust a sourced answer if sources sit only in a list at the bottom. The area brief says each claim carries a marker that identifies its source (S36.01) and sits at the claim it supports (S36.16) and that one claim can cite several sources (S36.17). docs/product/competitive-guidance.md:283 asks for each citation to connect to the correct source.

**Who uses it.** Anyone reading a web-grounded or research answer in Web, Desktop, Mobile or the Chrome side panel. Engineers and testers use it as the reference for how markers become chips.

**Problems it solves**

- The reader cannot tell which source backs which sentence.
- Raw [1] text is easy to miss and not clickable.
- Several markers in a row clutter the line.
- A marker that points to no delivered source could mislead, so it is left as plain text.

**Use cases**

- A user asks a current-events question on Web and clicks the chip after a sentence to open the first source.
- A user hovers a chip with +2 and reads all three sources in the card.
- A mobile user taps [1, 2] and picks one of two sources from a list.
- A Chrome side-panel user hovers a chip to read the source card.

## 2. User experience

**Where to find it**

- Web: inside the answer text of any assistant message that has sources (apps/web/features/chat/components/messages/MessageBubble.tsx:2035, 2887-2900).
- Desktop: the public Desktop window shows the hosted web app, so it shows the same chips (doc: AGENTS.md section 5). The retained Tauri build renders its own shared message bubble with a citation pill list (packages/ui/unified-chat/src/components/MessageBubble.tsx:846); whether Tauri also draws inline chips is unknown.
- Mobile: inside the answer text as teal [n] markers (apps/mobile/src/features/chat/components/MarkdownInline.tsx:256-280).
- Chrome side panel: inside the answer bubble (apps/extension/src/features/side-panel/bubbles.ts:402).
- CLI and VS Code: not available.

**Before you start**

- The answer must come with a delivered source list and markers in its text (or provider positions that the app turns into markers, packages/ui/unified-chat/src/components/markdown/citationMarkers.ts:138).
- Markers are linked only after streaming ends on Web (packages/ui/unified-chat/src/components/markdown/MarkdownContent.tsx:915-916).
- Web search or research must have produced sources. The route that does this for each mode is not established here.

**Screens and controls**

- Web/Desktop chip: round pill with a favicon or globe, the site name and +N when more than one source (CitationChip.tsx:150-166). It is a link to the first source with target _blank and rel noopener noreferrer (CitationChip.tsx:147-151).
- Web/Desktop hover card: lists every source for the claim (CitationChip.tsx:168-182).
- Mobile marker: teal text [n] or [n, m], role link, label 'Citation n: title' (MarkdownInline.tsx:268-279).
- Chrome chip: link showing the host, and a count label from locale key spCitationMore when grouped (apps/extension/src/features/side-panel/sources.ts:42-56).

**Journey**

1. Ask a question that triggers web search or research.
2. Read the streaming answer. Markers stay as plain text while the answer streams on Web (MarkdownContent.tsx:915-916).
3. When the answer finishes, [n] markers become chips.
4. Click the chip to open the first source in a new tab (Web, Desktop, Chrome), or hover it to see all sources.
5. On Mobile, tap the [n] marker. One source opens a native alert; several sources open a chooser first (MarkdownInline.tsx:239-253).

**What the person sees and gets**

- Chip with site name and +N count (Web, Desktop, Chrome).
- Hover card (Web, Desktop) or focus card (Chrome).
- Native alert with Cancel and Open page on Mobile (apps/mobile/src/features/chat/components/CitationChip.tsx:42-51).
- Screen reader label such as 'Source 1: site' or 'Sources 1, 2: site, site' (CitationChip.tsx:128-140).

**Settings**

- None found in the code for turning chips on or off. Web has a linkifyNumericCitations prop that callers pass (MarkdownContent.tsx:829, 915); no user setting was found for it.

## 3. Current implementation

From reading the code. Not a test result.

**Working in the code**

- Web/Desktop(hosted web): markers [n] and [n][m] are rewritten to #chat-citation-n or #chat-citations-n,m links (packages/ui/unified-chat/src/components/markdown/citationMarkers.ts:354, 323), then drawn as CitationChip (MarkdownContent.tsx:277-300, 366).
- Markers outside code fences and inline code are left alone (citationMarkers.ts:354-358, 4).
- A marker number above the delivered source count stays plain text (citationMarkers.ts:318-335).
- Plain links to a delivered source whose text is only a marker or the domain collapse into a chip too (MarkdownContent.tsx:293-299; citationMarkers.ts:279).
- An answer wrapped in parentheses such as ([1]) loses the parentheses (MarkdownContent.tsx:310-335).
- Providers that report citation positions as text spans get markers inserted at the sentence end, only when the text has no marker yet (citationMarkers.ts:138-150).
- Mobile: markers become CitationMarker, touching markers join into one (MarkdownInline.tsx:305-336), and a tap opens an alert (CitationChip.tsx:42).
- Chrome side panel: [n] text nodes become chips; markers separated only by spaces group into one chip (sources.ts:102-134).
- Streaming on Mobile holds back a half-written citation link (apps/mobile/src/features/chat/utils/streamingCitationLink.ts).

**Incomplete**

- Mobile draws teal [n] text and not a site-name chip with a +N count, so the draft use text for Mobile does not match the code (MarkdownInline.tsx:276-278).
- The brief marks Mobile S36.17 missing, but the code groups sources and offers a chooser (MarkdownInline.tsx:239-253, 305-336); brief and code disagree.
- The brief marks Chrome S36.01 and S36.16 missing, but the Chrome code has a chip (sources.ts:42-100); brief and code disagree.
- Chrome chip shows the URL host only, not a site name or title (sources.ts:49-51).

**Present but disconnected or switched off**

- Mobile has a pill component CitationChip with [index] and title (apps/mobile/src/features/chat/components/CitationChip.tsx:68-106). It is used only in the research sources appendix (apps/mobile/src/features/chat/components/research/ResearchSourcesAppendix.tsx:34), not in the chat answer text.

**Not available**

- CLI: no chips; the terminal shows plain text and a link list command (apps/cli/src/claude_parity.rs:1054).
- VS Code: no chips; only a collapsible source list (apps/extension-vscode/src/features/sidebar-webview/webviewContent.ts:4755).
- Tauri desktop inline chips: not established.

## 4. Required behaviour

**Established requirements**

- Claims in an answer carry an inline citation marker that identifies the source. (source: capability ledger `audit/ledger/ecosystem-capability-ledger.jsonl`, item S36.01)
- Each citation sits at the claim it supports. (source: capability ledger `audit/ledger/ecosystem-capability-ledger.jsonl`, item S36.16)
- A single claim can cite several sources and the user can see all of them. (source: capability ledger `audit/ledger/ecosystem-capability-ledger.jsonl`, item S36.17)
- A citation connects to the correct source passage, title, timestamp and an accessible destination. (source: doc: docs/product/competitive-guidance.md:283)
- Citation chip and sources disclosure are part of the web and desktop experience contract. (source: doc: docs/product/experience-contract.md:394)

**Acceptance criteria**

1. On Web, an answer with sources and text '[1]' shows a chip with the site name that links to source 1 with target _blank.
2. '[1][2]' with no words between shows one chip with +1.
3. '[7]' with only three sources stays as plain text.
4. 'rows[1]' inside a code fence or inline code is never made a chip.
5. Hovering or focusing a grouped chip shows every source in the group.
6. On Mobile, tapping a one-source marker shows an alert with Cancel and Open page; a marker whose source has no openable URL does not become a marker.
7. In the Chrome side panel, [1] [2] separated by a space become one chip.

**Inferred requirements** (not stated anywhere; reasoned from the code or from competitor parity)

- The count of sources is bounded on Chrome by 40 (apps/extension/src/features/side-panel/chat-state.ts:41) and server-side elsewhere; no plan-based limit was found [inferred from no entitlement code in the chip files].
- Markers inside a streaming answer wait until the stream ends on Web so a half marker never flashes as a link [inferred from MarkdownContent.tsx:915].

**Proposed improvements** (suggestions, not requirements)

- [proposed] Make Mobile show the site name in the marker, as Web and Chrome do, or record the decision that teal [n] is the intended Mobile form.
- [proposed] Make Chrome use the shared publisher-domain logic so redirect hosts show the real site.
- [proposed] Correct the brief rows for S36.01, S36.16, S36.17.

## 5. Implementation map

| Kind | Name | Path | Role |
|---|---|---|---|
| component | CitationChip (web) | `packages/ui/unified-chat/src/components/markdown/CitationChip.tsx` | Draws the pill, +N count, hover card and screen reader label; links to the first source. |
| component | MarkdownContent | `packages/ui/unified-chat/src/components/markdown/MarkdownContent.tsx` | Turns marker links into chips (277-300, 366), removes wrapping parentheses (310), links markers after streaming (915). |
| service | citationMarkers | `packages/ui/unified-chat/src/components/markdown/citationMarkers.ts` | Marker pattern, linkify, insert markers from provider spans, URL matching. |
| service | citationPublisher | `packages/ui/unified-chat/src/components/markdown/citationPublisher.ts` | Site name and date helpers used by the chip. |
| component | Web MessageBubble | `apps/web/features/chat/components/messages/MessageBubble.tsx` | Collects sources (2035) and passes them to the renderer (2887-2900). |
| component | Shared MessageBubble | `packages/ui/unified-chat/src/components/MessageBubble.tsx` | Renders a list of citation pills under a message (846); used by the retained Tauri build. |
| component | MarkdownInline (mobile) | `apps/mobile/src/features/chat/components/MarkdownInline.tsx` | CitationMarker, joinAdjacentCitations, previewCitedSources. |
| component | CitationChip (mobile) | `apps/mobile/src/features/chat/components/CitationChip.tsx` | previewCitation alert with Cancel and Open page; pill used in research appendix. |
| component | MessageContentRenderer (mobile) | `apps/mobile/src/features/chat/components/MessageContentRenderer.tsx` | Passes citations and linkify option into inline rendering (419-421). |
| service | streamingCitationLink | `apps/mobile/src/features/chat/utils/streamingCitationLink.ts` | Holds back an unfinished citation link while streaming. |
| service | sourceDisplay (mobile) | `apps/mobile/src/features/chat/utils/sourceDisplay.ts` | canOpenSource and openSource helpers. |
| component | Chrome sources.ts | `apps/extension/src/features/side-panel/sources.ts` | decorateCitations and buildCitationChip with hover and touch card. |
| component | Chrome bubbles.ts | `apps/extension/src/features/side-panel/bubbles.ts` | fillAnswerBubble calls decorateCitations (402); footer at 770. |
| config | MAX_MESSAGE_SOURCES | `apps/extension/src/features/side-panel/chat-state.ts` | Caps Chrome stored sources at 40 (line 41). |
| component | Web search tool | `apps/web/lib/web-search/web-search-tool.ts` | Produces search results with retrieval time (462, 488) that become the numbered source list. |
| component | CLI links command | `apps/cli/src/claude_parity.rs` | links_command lists links of the last reply as text (1054); no chip. |
| component | VS Code sources list | `apps/extension-vscode/src/features/sidebar-webview/webviewContent.ts` | collectSources and appendSources show a plain list (4746-4784). |

## 6. Execution and data flow

| Step | Runs on | Source |
|---|---|---|
| A search or research turn produces numbered sources and answer text with [n] markers. | our servers | apps/web/lib/web-search/web-search-tool.ts:462; apps/web/app/api/llm/v1/chat/completions/lib/research-loop.ts:801-823. Server routing for Local and own-key mode: unknown. |
| The client keeps the sources with the message (metadata.searchResults and metadata.citations on Web). | device | apps/web/features/chat/components/messages/MessageBubble.tsx:2025-2040 |
| When streaming ends, the renderer rewrites [n] to citation links and draws chips; markers above the source count stay text. | device | packages/ui/unified-chat/src/components/markdown/MarkdownContent.tsx:915-916; citationMarkers.ts:318-335 |
| The chip loads a favicon from a third-party favicon service for the site, falling back to a globe icon. | outside service | packages/ui/unified-chat/src/components/markdown/CitationChip.tsx:40-48, 50-72 |
| The user clicks the chip and the browser opens the first source URL in a new tab. | device | CitationChip.tsx:147-151 |
| On Mobile a tap builds a native alert and Open page opens the URL in the in-app browser after tracking parameters are removed. | device | apps/mobile/src/features/chat/components/CitationChip.tsx:42-51; apps/mobile/src/features/chat/utils/sourceDisplay.ts:24-33 |

**Data**

| What | Stored in | Synced | Kept or deleted |
|---|---|---|---|
| Source list and markers inside the message | Message metadata on the client and the saved chat; the exact table was not traced for this feature | Mobile has a test about persisting cloud chat sources (apps/mobile/__tests__/cloud-chat-sources-persistence.test.ts); sync detail unknown | Follows the chat; no separate deletion rule found |
| Chrome stored sources | Chrome side-panel chat state, at most 40 per message | unknown | unknown |

**Models and providers.** The chip is model neutral: it only reads markers and the delivered list. Some providers report citation positions as spans and the app inserts markers from them; this is described for Google grounding in packages/ui/unified-chat/src/components/markdown/citationMarkers.ts:128-137. Other providers cite inline in their own text. Exact provider list: unknown.

## 7. Access and usage rules

| Rule | What the code does |
|---|---|
| Account | The chip code asks for no account; chat itself needs sign-in per the app. none found in the code for chips. |
| Permissions | none found in the code. Links open with noopener and noreferrer (CitationChip.tsx:149-150). |
| Subscription | none found in the code. Whether web search that produces sources is gated by plan is covered by the web search and subscription features, not this one. |
| Limits and metering | none found in the code for chips. Chrome keeps at most 40 sources (chat-state.ts:41). The server-side source cap was not verified. |
| Feature flags | none found in the code for chips. |
| Model compatibility | Works with any model whose answer carries [n] markers or whose provider reports citation positions. No model name appears in the chip files. |
| Provider restrictions | Redirect hosts of one provider are replaced by the real site name (citationPublisher.ts:32-36). Other restrictions: none found. |
| Local mode | The chip code runs on the device and needs no paid plan. Whether a Local turn can produce web sources at all depends on the web search path and the privacy boundary; apps/extension-vscode/src/features/sidebar-webview/ChatStateManager.ts:284 says web search may be refused under the Local boundary. Full Local behaviour: unknown. |

## 8. States and edge cases

| State | Behaviour | Source |
|---|---|---|
| Streaming | Web leaves markers as text until streaming ends; Mobile holds back a partial citation link. | MarkdownContent.tsx:915-916; apps/mobile/src/features/chat/utils/streamingCitationLink.ts |
| Marker without a source | Left as plain text, no chip. | citationMarkers.ts:318-335; MarkdownContent.tsx:283-285 |
| Mobile source without an openable URL | It is skipped: no marker is drawn for it. | MarkdownInline.tsx:204-215 |
| Favicon fails to load | Globe icon replaces it. | CitationChip.tsx:50-72 |
| Marker in code | Not linked. | citationMarkers.ts:354-358 |
| Keyboard and screen reader | Chip has an aria-label listing source numbers and sites; Mobile marker has role link and a label. Chrome chip has aria-describedby and closes on Escape. | CitationChip.tsx:128-146; MarkdownInline.tsx:268-272; sources.ts:42-100 |
| Touch on Chrome | First touch opens the card and cancels the click; second touch follows the link. | sources.ts:68-72 |
| Offline, timeout, retry, cancel | not handled in the code for chips; opening a link depends on the browser. On Mobile a failed open shows an alert 'Check your connection and try again.' | apps/mobile/src/features/chat/utils/sourceDisplay.ts:24-33 |

## 9. Verification

What has actually been seen by a person is in the Status table above. This section lists what exists to check with.

**Existing tests**

- `packages/ui/unified-chat/src/components/markdown/citationMarkers.test.ts`: Marker linkify, grouping and URL matching (by file name; contents not opened).
- `packages/ui/unified-chat/src/components/markdown/__tests__/CitationChip.test.tsx`: Web chip rendering (by file name).
- `packages/ui/unified-chat/src/components/markdown/CitationChip.card.test.tsx`: Hover card contents (by file name).
- `apps/mobile/src/features/chat/components/__tests__/MarkdownInline.render.test.tsx`: Mobile inline marker rendering (by file name).
- `apps/mobile/src/features/chat/components/__tests__/MessageContentRenderer.inlineCitations.test.tsx`: Mobile inline citations in the renderer (by file name).
- `apps/mobile/__tests__/CloudStreamInlineCitations.test.tsx`: Inline citations from a cloud stream (by file name).
- `apps/extension/__tests__/side-panel-markdown-parity.test.ts`: At least that markers inside maths are not decorated (line 192-196).

**Test scenarios**

- **Single marker on Web**
  1. Run a search question on Web.
  2. Wait for the answer to finish.
  3. Click a chip.
  - Expected: A chip with the site name appears at the claim and the first source opens in a new tab.
- **Grouped markers**
  1. Use an answer containing [1][2].
  2. Hover the chip.
  - Expected: One chip with +1; the card lists both sources.
- **Out-of-range marker**
  1. Render an answer with [9] and 3 sources.
  - Expected: [9] stays as plain text.
- **Mobile tap**
  1. Open a sourced answer on Mobile.
  2. Tap [1].
  3. Tap Open page.
  - Expected: An alert shows title, site and snippet; Open page opens the in-app browser.
- **Chrome touch**
  1. Open the side panel with a sourced answer.
  2. Touch a chip twice.
  - Expected: First touch shows the card; second opens the link.
- **Desktop**
  1. Open the Electron Desktop and ask a sourced question.
  - Expected: Same chips as Web (doc: AGENTS.md section 5).

**Where to look when it fails**

- Check message metadata searchResults and citations on Web.
- Check the rendered anchor href '#chat-citation-n'.
- Mobile: Alert 'Could not open citation' means the in-app browser failed (CitationChip.tsx:50).

**Hands-on test plans**

- Web: [70-qa/test-plans/web/036-sources-and-grounding-interface.md](../../70-qa/test-plans/web/036-sources-and-grounding-interface.md)
- Desktop: [70-qa/test-plans/desktop/036-sources-and-grounding-interface.md](../../70-qa/test-plans/desktop/036-sources-and-grounding-interface.md)
- Mobile: [70-qa/test-plans/mobile/036-sources-and-grounding-interface.md](../../70-qa/test-plans/mobile/036-sources-and-grounding-interface.md)
- Chrome: [70-qa/test-plans/chrome/036-sources-and-grounding-interface.md](../../70-qa/test-plans/chrome/036-sources-and-grounding-interface.md)

## 10. Gaps and dependencies

- **Mobile shows [n] text, not a site chip with a count** Affects: Mobile users. Evidence: MarkdownInline.tsx:276-278. Work needed: Decide the intended form and either add the site name or document it.
- **CLI has no markers or chips** Affects: CLI users. Evidence: apps/cli/src/claude_parity.rs:1054. Work needed: Add numbered markers in the terminal answer tied to the list.
- **VS Code has no markers** Affects: VS Code users. Evidence: webviewContent.ts:4746-4784. Work needed: Draw markers in the webview.
- **Brief and code disagree on Chrome and Mobile S36.17** Affects: Anyone planning from the brief. Evidence: sources.ts:42; MarkdownInline.tsx:239. Work needed: Update the brief rows.
- **Tauri desktop inline chips not established** Affects: Tauri build. Evidence: packages/ui/unified-chat/src/components/MessageBubble.tsx:846. Work needed: Check whether MarkdownContent receives citations there.
- Not built on: CLI, VS Code (from the capability ledger).

**Depends on**

- surface:web
- surface:desktop
- surface:mobile
- surface:chrome
- surface:cli
- surface:vscode
- SYS-chat-turn-pipeline
- SYS-shared-ui-and-design
- SYS-execution-boundaries
- file:packages/ui/unified-chat/src/components/markdown/CitationChip.tsx
- file:packages/ui/unified-chat/src/components/markdown/citationMarkers.ts
- file:apps/mobile/src/features/chat/components/MarkdownInline.tsx
- file:apps/extension/src/features/side-panel/sources.ts

## Unknown

- Whether the Tauri desktop chat draws inline chips.
- Server-side cap on the number of sources and whether any plan changes it.
- Local-mode and own-key web search and which turns get sources.
- Whether provider folder names match 'google'.
- Contents of the listed tests were not opened.
