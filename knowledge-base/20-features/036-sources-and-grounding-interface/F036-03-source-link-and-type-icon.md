---
id: "F036-03"
type: "feature"
title: "Source link and type icon"
aliases: ["Source link", "Source URL", "Favicon", "Source icon", "Publisher badge", "Open source", "/links command"]
area: "36 Sources and grounding interface"
available_on: ["web", "desktop", "mobile", "cli", "vscode", "chrome"]
implementation: {web: "built", desktop: "built", mobile: "built", cli: "partial", vscode: "partial", chrome: "built"}
verification: {web: "not seen by a person", desktop: "not seen by a person", mobile: "not seen by a person", cli: "not seen by a person", vscode: "not seen by a person", chrome: "not seen by a person"}
requirement_items: ["S36.04", "S36.07"]
depends_on: ["surface:web", "surface:desktop", "surface:mobile", "surface:cli", "surface:vscode", "surface:chrome", "F036-01", "F036-02", "SYS-security-and-privacy", "SYS-execution-boundaries", "file:apps/mobile/src/features/chat/utils/sourceDisplay.ts"]
basis: "code inspection"
second_reader: "not sampled: statements are code readings that nobody has re-checked"
last_reviewed: "2026-11-24"
revision: "f51d16e747"
---
# F036-03 Source link and type icon

Each source has a link to its URL. Web and Desktop chips open it in a new tab with a favicon of the publisher site and a globe as fallback. Mobile shows a coloured letter badge and opens an in-app browser. Chrome shows a globe and a plain link. CLI lists links as text. VS Code lists them in a collapsible list.

Area: [36. Sources and grounding interface](README.md). Requirement items: [S36.04](../../10-requirements/capabilities/036-sources-and-grounding-interface.md#s3604), [S36.07](../../10-requirements/capabilities/036-sources-and-grounding-interface.md#s3607).

## Status

Two separate questions: is the code there, and has a person seen it work. "Seen working" comes only from results of real runs recorded in the project's ledger.

| App | In the code: this page's reading, 2026-11-24 | In the code: ledger audit, 2026-09-26 and later updates | Seen working by a person |
|---|---|---|---|
| Web | built | built | not seen by a person |
| Desktop | built | built | not seen by a person |
| Mobile | partly built (this page lists unfinished parts) | built | not seen by a person |
| CLI | partly built | partly built | not seen by a person |
| VS Code | partly built | partly built | not seen by a person |
| Chrome | partly built (this page lists unfinished parts) | built | not seen by a person |

The first column was derived from this page's text by a second, cheaper pass and has not been validated item by item; the ledger column is the project's own record. Neither is a test result.

## 1. Purpose and user value

**What it does.** Lets the reader open the page behind a claim, and gives a small visual hint about what the source is (packages/ui/unified-chat/src/components/markdown/CitationChip.tsx:40-72, 143-166).

**Why it exists.** The brief requires that every cited source exposes its URL and can be opened (S36.04) and shows an icon for its type (S36.07).

**Who uses it.** Readers who want to verify a claim; testers checking link safety.

**Problems it solves**

- No way to reach the source from the claim.
- Every source drew the same favicon when the URL host was a search router (citationPublisher.ts header comment).
- Links with tracking parameters leaked marketing ids.

**Use cases**

- Click a chip on Web to read the source.
- Tap Open page in the Mobile alert.
- Type /links 2 in the CLI to open the second link of the last reply.
- Expand 'sources' in VS Code and click a title.

## 2. User experience

**Where to find it**

- Web and Desktop: chip link and hover card (CitationChip.tsx:143-182); the research panel.
- Mobile: the alert Open page button (apps/mobile/src/features/chat/components/CitationChip.tsx:48-50); source rows in CollapsibleSources.tsx and WebSearchResultCard.tsx.
- Chrome: chip link and a sources footer 'details' list with a globe icon (apps/extension/src/features/side-panel/sources.ts:136-151).
- CLI: command /links lists the links of the last reply; /links <number> opens one in the browser (apps/cli/src/claude_parity.rs:1054-1100).
- VS Code: a collapsible 'sources' list under the answer (apps/extension-vscode/src/features/sidebar-webview/webviewContent.ts:4755-4784).

**Before you start**

- The source needs a URL. On Mobile it needs a valid external http or https URL (apps/mobile/src/features/chat/utils/sourceDisplay.ts:20-22).

**Screens and controls**

- Web favicon image 14 px from a favicon service for the publisher domain, with globe fallback (CitationChip.tsx:40-72).
- Mobile: coloured square with the first letter of the publisher (WebSearchResultCard.tsx:25-31, 62-76) and a globe by the host (WebSearchResultCard.tsx:93-96).
- Mobile project file chip shows a FileText icon; past-chat chip shows a MessagesSquare icon (see F036-04).
- Web project file and past chat chips use their own icons (ProjectFileCitationChip.tsx:21; CitationPastChats.tsx:37).

**Journey**

1. Find a chip or a source row.
2. Click or tap it.
3. Web, Desktop, Chrome: the page opens in a new tab.
4. Mobile: read the alert, tap Open page, and the page opens in the in-app browser.
5. CLI: run /links, then /links <n>.

**What the person sees and gets**

- New browser tab (Web, Desktop, Chrome).
- In-app browser (Mobile).
- Alert 'Could not open citation' or 'Could not open source' with 'Check your connection and try again.' when opening fails (sourceDisplay.ts:24-33).

**Settings**

- none found in the code.

## 3. Current implementation

From reading the code. Not a test result.

**Working in the code**

- Web chip is an anchor with target _blank and rel noopener noreferrer to the first source (CitationChip.tsx:147-151).
- Favicon comes from the publisher domain, not the URL host, so a redirect source gets its real site's icon (CitationChip.tsx:40-48).
- Mobile opens a URL after stripping tracking parameters through an in-app browser helper (sourceDisplay.ts:24-33).
- Mobile press is disabled and role is text when the URL cannot be opened (WebSearchResultCard.tsx:35-37; CitationChip.tsx:84-98).
- Web ordinary links also have tracking parameters stripped (MarkdownContent.tsx:367).
- Chrome chip and footer links open with target _blank, noopener noreferrer (sources.ts:12-19, 48-56).
- CLI extracts markdown links and bare http URLs from a reply and lists them (apps/cli/src/markdown.rs:627-660; claude_parity.rs:1054).
- VS Code shows each source as a link when its URL parses, else as text (webviewContent.ts:4765-4780).

**Incomplete**

- Mobile has a letter badge, not a per-type icon (WebSearchResultCard.tsx:62-76).
- CLI shows link text only; it does not know which links are sources: it reads any link in the reply (claude_parity.rs:1058).
- Chrome icon is always a globe (sources.ts:26).

**Present but disconnected or switched off**

- none found.

**Not available**

- Per-type icon for connectors or other source kinds: not found in the code.
- CLI source chips: none.

## 4. Required behaviour

**Established requirements**

- Each cited source exposes its URL or resource identifier and can be opened. (source: S36.04)
- Each source shows an icon for its type (web page, file, chat, connector). (source: S36.07)
- A citation has an accessible destination. (source: doc: docs/product/competitive-guidance.md:283)

**Acceptance criteria**

1. Clicking a Web chip opens a new tab with rel noopener noreferrer.
2. A source with a redirect URL shows the favicon of the site named in its title.
3. A favicon that fails to load is replaced by a globe.
4. On Mobile, a source with a non-http URL has a disabled row.
5. On Mobile, Open page opens the URL without utm_ parameters.
6. /links in the CLI lists links and /links 2 opens the second.
7. A VS Code source with an invalid URL shows as text, not a link.

**Inferred requirements** (not stated anywhere; reasoned from the code or from competitor parity)

- Third-party favicon fetch discloses the publisher domain to the favicon service; Mobile avoids this on purpose (comment in apps/mobile/src/features/chat/components/CollapsibleSources.tsx:37-39) [inferred for Web from CitationChip.tsx:46].
- The Web chip href is the raw source URL; stripping is applied to ordinary links but not to the chip href [inferred from CitationChip.tsx:147 vs MarkdownContent.tsx:367].

**Proposed improvements** (suggestions, not requirements)

- [proposed] Strip tracking parameters in the Web chip href too.
- [proposed] Add type icons for connector sources.
- [proposed] Decide whether Web should use a first-party favicon route to avoid the third-party call.

## 5. Implementation map

| Kind | Name | Path | Role |
|---|---|---|---|
| component | CitationFavicon | `packages/ui/unified-chat/src/components/markdown/CitationChip.tsx` | Favicon with globe fallback (50-72). |
| service | citationPublisherDomain | `packages/ui/unified-chat/src/components/markdown/citationPublisher.ts` | Domain for favicon and label. |
| component | MarkdownLink | `packages/ui/unified-chat/src/components/markdown/MarkdownContent.tsx` | Chip or external link with tracking removal (366-390). |
| service | stripTrackingParams | `packages/ui/unified-chat/src/components/markdown/citationMarkers.ts` | Removes utm_, fbclid, gclid, mc_cid, mc_eid. |
| component | ResearchPanel | `apps/web/features/chat/components/research/ResearchPanel.tsx` | Web source rows with links (103). |
| service | sourceDisplay (mobile) | `apps/mobile/src/features/chat/utils/sourceDisplay.ts` | canOpenSource, openSource, sourceInitial. |
| component | WebSearchResultCard | `apps/mobile/src/features/chat/components/WebSearchResultCard.tsx` | Letter badge and globe row. |
| component | CollapsibleSources | `apps/mobile/src/features/chat/components/CollapsibleSources.tsx` | Stacked letter marks and source list. |
| component | Chrome sources.ts | `apps/extension/src/features/side-panel/sources.ts` | buildSourceLink with globe icon and footer. |
| command | /links | `apps/cli/src/claude_parity.rs` | links_command lists and opens links (1054). |
| service | web_links | `apps/cli/src/markdown.rs` | Extracts markdown and bare URLs (627). |
| component | VS Code appendSources | `apps/extension-vscode/src/features/sidebar-webview/webviewContent.ts` | Collapsible list with links (4755). |
| component | ProjectFileCitationChip | `packages/ui/unified-chat/src/components/markdown/ProjectFileCitationChip.tsx` | File icon chip (type icon for files). |
| component | CitationPastChats | `apps/web/features/chat/components/messages/CitationPastChats.tsx` | Chat icon chip (type icon for chats). |

## 6. Execution and data flow

| Step | Runs on | Source |
|---|---|---|
| The renderer builds the link from the source URL. | device | CitationChip.tsx:147 |
| The browser requests a favicon image for the publisher domain from a favicon service. | outside service | CitationChip.tsx:46 |
| On click the browser opens the source page, which is an outside site. | outside service | CitationChip.tsx:149-150 |
| On Mobile the app checks the URL, removes tracking parameters and opens the in-app browser. | device | sourceDisplay.ts:20-33 |
| CLI parses the reply text and opens a chosen link in the system browser. | device | claude_parity.rs:1054-1100 |

**Data**

| What | Stored in | Synced | Kept or deleted |
|---|---|---|---|
| No new data; the URL is part of the source record. | Message metadata | with the chat | follows the chat |

**Models and providers.** Model neutral. A routing redirect URL from a provider is shown with the real site's icon, but the link still goes to the redirect (citationPublisher.ts header comment says redirects expire).

## 7. Access and usage rules

| Rule | What the code does |
|---|---|
| Account | none found in the code for opening a source. |
| Permissions | Mobile checks http or https validity (sourceDisplay.ts:20-22). Web uses noopener and noreferrer. |
| Subscription | none found in the code. |
| Limits and metering | none found in the code. |
| Feature flags | none found in the code. |
| Model compatibility | Model neutral. |
| Provider restrictions | Redirect URLs of two Google hosts expire, leaving dead links in saved chats (citationPublisher.ts header). |
| Local mode | Opening a link works on the device with no plan. The Web favicon is fetched from an outside service, which a strict Local boundary might not allow; whether Desktop egress rules block it: unknown. |

## 8. States and edge cases

| State | Behaviour | Source |
|---|---|---|
| Favicon load error | Globe shows. | CitationChip.tsx:50-72 |
| No openable URL on Mobile | Disabled row or chip, role text. | WebSearchResultCard.tsx:35-37 |
| Open fails on Mobile | Alert with retry advice. | sourceDisplay.ts:24-33 |
| Expired redirect | not handled in the code; the link stays and may be dead. | citationPublisher.ts header |
| CLI no links | Message 'The last response has no web links.' | claude_parity.rs:1059-1061 |
| CLI no reply yet | Message 'No assistant response to take links from.' | claude_parity.rs:1055-1057 |
| Terminal injection | URLs and labels are sanitised before printing. | claude_parity.rs:1066-1074 |

## 9. Verification

What has actually been seen by a person is in the Status table above. This section lists what exists to check with.

**Existing tests**

- `apps/mobile/__tests__/AssistantLinkOpening.test.tsx`: Opening links from assistant text on Mobile (by file name).
- `apps/mobile/__tests__/InAppBrowserLinks.test.tsx`: In-app browser link opening (by file name).
- `packages/ui/unified-chat/src/components/__tests__/MarkdownContent.links.test.tsx`: Link rendering in the shared markdown (by file name).
- `apps/cli/src/markdown.rs`: Rust unit tests in this file include test_link at line 929 (by name).

**Test scenarios**

- **New tab**
  1. Click a Web chip.
  - Expected: New tab opens at the first source URL.
- **Favicon fallback**
  1. Block the favicon host in the browser.
  2. Reload the answer.
  - Expected: Globe icons show.
- **Redirect source**
  1. Render a redirect-URL source titled 'example.com'.
  - Expected: Favicon and site are example.com.
- **Mobile no URL**
  1. Render a source with url 'ftp://x'.
  - Expected: Disabled row.
- **CLI**
  1. Get a reply with two links.
  2. Run /links then /links 2.
  - Expected: List of two lines; second opens in the browser.
- **VS Code**
  1. Run a search turn in VS Code.
  2. Expand the sources list.
  - Expected: Titles link to URLs with the host beside them.

**Where to look when it fails**

- Mobile Alert titles 'Could not open citation' and 'Could not open source'.
- Network tab: requests to the favicon service for Web.
- CLI messages quoted above.

**Hands-on test plans**

- Web: [70-qa/test-plans/web/036-sources-and-grounding-interface.md](../../70-qa/test-plans/web/036-sources-and-grounding-interface.md)
- Desktop: [70-qa/test-plans/desktop/036-sources-and-grounding-interface.md](../../70-qa/test-plans/desktop/036-sources-and-grounding-interface.md)
- Mobile: [70-qa/test-plans/mobile/036-sources-and-grounding-interface.md](../../70-qa/test-plans/mobile/036-sources-and-grounding-interface.md)
- CLI: [70-qa/test-plans/cli/036-sources-and-grounding-interface.md](../../70-qa/test-plans/cli/036-sources-and-grounding-interface.md)
- VS Code: [70-qa/test-plans/vscode/036-sources-and-grounding-interface.md](../../70-qa/test-plans/vscode/036-sources-and-grounding-interface.md)
- Chrome: [70-qa/test-plans/chrome/036-sources-and-grounding-interface.md](../../70-qa/test-plans/chrome/036-sources-and-grounding-interface.md)

## 10. Gaps and dependencies

- **No per-type icon on Mobile search rows or Chrome** Affects: Mobile, Chrome users. Evidence: WebSearchResultCard.tsx:62-76; sources.ts:26. Work needed: Add icons by source kind.
- **CLI does not treat sources as sources** Affects: CLI users. Evidence: claude_parity.rs:1058. Work needed: List the delivered source list with numbers.
- **Dead redirect links in saved chats** Affects: Web, Desktop, Mobile. Evidence: citationPublisher.ts header. Work needed: Resolve redirects at ingest.
- **Brief code pointers for CLI are off** Affects: Maintainers. Evidence: apps/cli/src/tui/tui_app.rs:4444 is about rewind, not links. Work needed: Fix the brief references.
- **Web chip href is not stripped of tracking parameters** Affects: Web users. Evidence: CitationChip.tsx:147. Work needed: Apply stripTrackingParams.

**Depends on**

- surface:web
- surface:desktop
- surface:mobile
- surface:cli
- surface:vscode
- surface:chrome
- F036-01
- F036-02
- SYS-security-and-privacy
- SYS-execution-boundaries
- file:apps/mobile/src/features/chat/utils/sourceDisplay.ts

## Unknown

- Whether Desktop egress rules allow the favicon service.
- Where the CLI opens links (system browser call not read).
- Whether Tauri desktop shows type icons.
- Test contents not opened.
- The path of the mobile safeOpenURL helper was not opened.
