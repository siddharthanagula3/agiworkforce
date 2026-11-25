---
id: "F007-01"
type: "feature"
title: "Start view and reading column"
aliases: ["Centered new-chat layout", "Reading-width conversation layout", "Full-width data-analysis layout", "Sticky table headers", "Empty state / start view", "GreetingBanner", "S7.01", "S7.02", "S7.03", "S7.24"]
area: "7 Layout systems"
available_on: ["web", "desktop", "mobile", "cli", "vscode", "chrome"]
implementation: {web: "built", desktop: "built", mobile: "partial", cli: "built", vscode: "partial", chrome: "partial"}
verification: {web: "partly seen (1 of 4)", desktop: "not seen by a person", mobile: "not seen by a person", cli: "not seen by a person", vscode: "not seen by a person", chrome: "not seen by a person"}
requirement_items: ["S7.01", "S7.02", "S7.03", "S7.24"]
depends_on: ["surface:web", "surface:desktop", "surface:mobile", "surface:cli", "surface:vscode", "surface:chrome", "SYS-shared-ui-and-design", "SYS-chat-turn-pipeline", "file:packages/ui/unified-chat/src/components/markdown/MarkdownTable.tsx", "file:apps/mobile/src/shared/layout/contentColumn.ts"]
basis: "code inspection"
second_reader: "not sampled: statements are code readings that nobody has re-checked"
last_reviewed: "2026-11-24"
revision: "f51d16e747"
---
# F007-01 Start view and reading column

What an empty chat looks like and how wide the conversation reads. On web and desktop an empty chat shows a greeting with a centred composer; messages then sit in a narrow centred column. Mobile caps the reading column at 720 points. Tables keep a pinned header row and can open in a larger dialog.

Area: [7. Layout systems](README.md). Requirement items: [S7.01](../../10-requirements/capabilities/007-layout-systems.md#s701), [S7.02](../../10-requirements/capabilities/007-layout-systems.md#s702), [S7.03](../../10-requirements/capabilities/007-layout-systems.md#s703), [S7.24](../../10-requirements/capabilities/007-layout-systems.md#s724).

## Status

Two separate questions: is the code there, and has a person seen it work. "Seen working" comes only from results of real runs recorded in the project's ledger.

| App | In the code: this page's reading, 2026-11-24 | In the code: ledger audit, 2026-09-26 and later updates | Seen working by a person |
|---|---|---|---|
| Web | partly built (this page lists unfinished parts) | built | partly seen (1 of 4) |
| Desktop | partly built (this page lists unfinished parts) | built | not seen by a person |
| Mobile | partly built | partly built | not seen by a person |
| CLI | partly built (this page lists unfinished parts) | built | not seen by a person |
| VS Code | partly built | partly built | not seen by a person |
| Chrome | partly built | partly built | not seen by a person |

The first column was derived from this page's text by a second, cheaper pass and has not been validated item by item; the ledger column is the project's own record. Neither is a test result.

## 1. Purpose and user value

**What it does.** Shows a start view when a chat has no messages, keeps message text to a readable centred width on wide windows, and lets tables scroll inside the column with a pinned header row or open in a larger dialog (web). Brief status per app is a separate record (doc: knowledge-base/data/area-briefs/007-layout-systems.md).

**Why it exists.** Long lines are hard to read and an empty transcript looks broken. The product contract asks for a transcript with a sticky composer and for dense tables to stay usable (doc: docs/product/experience-contract.md:184, docs/product/experience-contract.md:199).

**Who uses it.** Every person who opens a chat on any of the six apps, and people reading long tables in answers.

**Problems it solves**

- Text running edge to edge on a wide monitor.
- A blank screen at the start of a chat.
- Losing column names while scrolling a long table.

**Use cases**

- Open a new chat on web and type the first message from the centred composer.
- Read a long answer on a wide desktop window with text kept to one column.
- Scroll a 100-row table in an answer and still see the column names.
- Open a wide table in the expanded dialog to read all columns.

## 2. User experience

**Where to find it**

- Web and Desktop (hosted web app): the new chat page. Empty state shows when there is no conversation or no messages (apps/web/features/chat/pages/WebChatPage.tsx:6651, apps/web/features/chat/pages/WebChatPage.tsx:7635).
- Mobile: the empty chat shows ChatEmptyState inside the message list (apps/mobile/src/features/chat/components/MessageList.tsx:457).
- CLI: the start view is the first screen of the terminal chat, headed 'Welcome to AGI' (apps/cli/src/tui/tui_app.rs:2773).
- VS Code: the sidebar chat shows 'Start a conversation' (apps/extension-vscode/src/features/sidebar-webview/webviewContent.ts:172).
- Chrome: the side panel empty block #sp-empty (apps/extension/src/side_panel.ts:2282).
- Tables: any markdown table in an answer; the button is labelled 'Expand table' on web (packages/ui/unified-chat/src/components/markdown/MarkdownTable.tsx:136).

**Before you start**

- Web and Desktop: an empty chat with the page not in compact embed mode and not in voice mode for the greeting to show (apps/web/features/chat/pages/WebChatPage.tsx:7646).
- No setting turns the reading width on or off; none found in the code.

**Screens and controls**

- Web start view: GreetingBanner, notices, then the composer inside a 'mx-auto max-w-3xl' block (apps/web/features/chat/pages/WebChatPage.tsx:7646).
- Web table: a hover or focus action strip with Copy, Download CSV and 'Expand table'; the table region is scrollable and keyboard focusable (packages/ui/unified-chat/src/components/markdown/MarkdownTable.tsx:146, packages/ui/unified-chat/src/components/markdown/MarkdownTable.tsx:148).
- Web expanded table: a dialog with a close button labelled 'Close expanded table' (packages/ui/unified-chat/src/components/markdown/MarkdownTable.tsx:182).
- Mobile: greeting headline from a shared greeting helper, plus an optional desktop pairing banner (apps/mobile/src/features/chat/components/ChatEmptyState.tsx:59).

**Journey**

1. Open a new chat.
2. See the start view: greeting and composer centred (web), greeting only with the composer at the bottom (mobile).
3. Send a message; the start view is replaced by the transcript.
4. Read the answer in the centred column.
5. If the answer has a table, scroll it inside its frame; the header row stays pinned.
6. Choose 'Expand table' to read it in a larger dialog; close it to return.

**What the person sees and gets**

- Greeting text and notices (usage banner, free plan notices) on the web start view (apps/web/features/chat/pages/WebChatPage.tsx:7660).
- Copy shows copied or failed state for 2 or 4 seconds (packages/ui/unified-chat/src/components/markdown/MarkdownTable.tsx:91).

**Settings**

- None found in the code for reading width. Mobile column widths are constants (apps/mobile/src/shared/layout/contentColumn.ts:5).

## 3. Current implementation

From reading the code. Not a test result.

**Working in the code**

- Web: empty-state branch with greeting and centred composer, replaced by ChatMessageList once messages exist (apps/web/features/chat/pages/WebChatPage.tsx:7635, apps/web/features/chat/pages/WebChatPage.tsx:7729).
- Web: message rows use the 'message-inner' class, max-w-3xl and mx-auto (apps/web/app/globals.css:842); notices and follow-ups use the same width (apps/web/features/chat/components/messages/ChatMessageList.tsx:1939, apps/web/features/chat/components/messages/ChatMessageList.tsx:2015); user bubbles cap at 75 percent of the row (apps/web/features/chat/components/messages/MessageBubble.tsx:2600).
- Web: table header cells are 'sticky top-0' (packages/ui/unified-chat/src/components/markdown/MarkdownContent.tsx:584) inside a frame limited to min(70vh, 40rem) with its own scroll (packages/ui/unified-chat/src/components/markdown/MarkdownTable.tsx:146).
- Web: 'Expand table' opens a dialog 4 units from every window edge with the same table and a copy and download strip (packages/ui/unified-chat/src/components/markdown/MarkdownTable.tsx:136).
- Mobile: contentColumn('reading') gives width 100 percent, max 720, centred (apps/mobile/src/shared/layout/contentColumn.ts:5, apps/mobile/src/shared/layout/contentColumn.ts:26); every list row uses it (apps/mobile/src/features/chat/components/MessageList.tsx:367) and so does the empty state container (apps/mobile/src/features/chat/components/MessageList.tsx:457).
- CLI: start view lists welcome line, model, access mode, folder and recent activity when the transcript is empty and not loading (apps/cli/src/tui/tui_app.rs:2753).
- VS Code: --conversation-width is 768px and the messages area pads itself to centre that width (apps/extension-vscode/src/features/sidebar-webview/webviewContent.ts:248, apps/extension-vscode/src/features/sidebar-webview/webviewContent.ts:592); the empty state is centred (apps/extension-vscode/src/features/sidebar-webview/webviewContent.ts:2147).
- Chrome: the empty block is centred in the side panel (apps/extension/src/side_panel.ts:2282).

**Incomplete**

- Mobile: the composer is not centred with the greeting; the empty state is inside the list and the composer stays at the bottom (apps/mobile/src/features/chat/components/MessageList.tsx:458, apps/mobile/app/(app)/chat/[id].tsx:2577).
- CLI: start view is built as left-indented lines in one paragraph, not centred (apps/cli/src/tui/tui_app.rs:2773, apps/cli/src/tui/tui_app.rs:3057). The brief marks it done (doc: knowledge-base/data/area-briefs/007-layout-systems.md).
- Web: a table does not become wider than the reading column inline. It scrolls inside the column, and the wider view is the 'Expand table' dialog (packages/ui/unified-chat/src/components/markdown/MarkdownTable.tsx:146). A full-width data layout for charts or spreadsheets was not found [inferred from the reads].
- Chrome: messages use max-width 88 percent of the panel, there is no centred column (apps/extension/src/side_panel.ts:2328). The panel width is set by the browser, not the extension [inferred from the manifest side_panel entry (apps/extension/manifest.json:83)].

**Present but disconnected or switched off**

- Nothing disconnected or switched off was found for this feature.

**Not available**

- Sticky table headers on mobile, VS Code and Chrome: the brief marks them missing (doc: knowledge-base/data/area-briefs/007-layout-systems.md). I found a horizontally scrolling table wrapper in VS Code with no sticky rule (apps/extension-vscode/src/features/sidebar-webview/webviewContent.ts:1433).
- CLI has no reading-width setting; the brief does not list it.

## 4. Required behaviour

**Established requirements**

- An empty new chat shows its start view (greeting, prompt entry or suggestions) centred rather than an empty transcript (S7.01). (source: capability ledger `audit/ledger/ecosystem-capability-ledger.jsonl`, item S7.01)
- Message text is limited to a readable column that stays centred when the window is wide (S7.02). (source: capability ledger `audit/ledger/ecosystem-capability-ledger.jsonl`, item S7.02)
- Data work (tables, charts, spreadsheets) can be viewed in a layout that uses the full window width (S7.03). (source: capability ledger `audit/ledger/ecosystem-capability-ledger.jsonl`, item S7.03)
- Table headers stay pinned while a long table scrolls (S7.24). (source: capability ledger `audit/ledger/ecosystem-capability-ledger.jsonl`, item S7.24)
- Dense tables become cards or horizontally scrollable semantic tables. (source: doc: docs/product/experience-contract.md:199)
- A conversation layout is a transcript plus a sticky composer. (source: doc: docs/product/experience-contract.md:184)

**Acceptance criteria**

1. On web, with no messages, the greeting and the composer are visible and centred on a 1440 pixel window; after sending, the transcript replaces them.
2. On web, at 1920 pixels wide, assistant text never exceeds the 48rem column and stays centred.
3. On mobile, on a tablet-width window, rows never exceed 720 points and are centred.
4. On web, scrolling a table taller than 70 percent of the window keeps the header row visible.
5. 'Expand table' opens a dialog; Escape or the close button returns to the chat with the same scroll position.
6. On a 320 point wide phone the column is never narrower than the window (apps/mobile/__tests__/content-column.test.ts).
7. On mobile, CLI, VS Code and Chrome the gaps listed in this page are shown as missing, not as done.

**Inferred requirements** (not stated anywhere; reasoned from the code or from competitor parity)

- The reading column on web (48rem) and VS Code (768px) are intentionally the same size [inferred from max-w-3xl and --conversation-width].
- Mobile 720 points is chosen for about 80 characters per line (apps/mobile/src/shared/layout/contentColumn.ts:3).

**Proposed improvements** (suggestions, not requirements)

- [proposed] Centre the CLI start view or change the brief status to partial.
- [proposed] Add sticky table headers on mobile, VS Code and Chrome, or record why not.
- [proposed] Keep the greeting and composer together on mobile, or record the owner decision that they are separate.

## 5. Implementation map

| Kind | Name | Path | Role |
|---|---|---|---|
| screen | WebChatPage empty state | `apps/web/features/chat/pages/WebChatPage.tsx` | Decides isEmptyChat (line 6651) and renders greeting, notices and centred composer (lines 7635-7700) or the transcript. |
| component | GreetingBanner | `apps/web/features/chat/components/GreetingBanner/GreetingBanner.tsx` | Greeting heading on the web start view. |
| component | ChatMessageList | `apps/web/features/chat/components/messages/ChatMessageList.tsx` | Transcript list; notices and follow-ups use max-w-3xl (lines 1939, 2015); role=log region at 2112. |
| config | message-inner style | `apps/web/app/globals.css` | Sets max-w-3xl mx-auto for each message row (line 842). |
| component | MessageBubble | `apps/web/features/chat/components/messages/MessageBubble.tsx` | User bubble 75 percent cap and assistant flat column (line 2600). |
| component | MarkdownTable | `packages/ui/unified-chat/src/components/markdown/MarkdownTable.tsx` | Scroll frame, copy, CSV download and the 'Expand table' dialog; shared by web and desktop. |
| component | MarkdownTableHeader | `packages/ui/unified-chat/src/components/markdown/MarkdownContent.tsx` | th cells with 'sticky top-0' (line 584). |
| config | contentColumn | `apps/mobile/src/shared/layout/contentColumn.ts` | Reading (720), form (440) and grid column limits and helpers. |
| component | MessageList (mobile) | `apps/mobile/src/features/chat/components/MessageList.tsx` | Applies contentColumn('reading') to rows, empty state and jump control. |
| component | ChatEmptyState | `apps/mobile/src/features/chat/components/ChatEmptyState.tsx` | Mobile greeting, pairing banner and Cloud-only connector suggestions. |
| hook | useResponsiveLayout | `apps/mobile/src/shared/hooks/useResponsiveLayout.ts` | Defines MAX_GRID_CONTENT_WIDTH used by the grid column. |
| screen | TUI start view | `apps/cli/src/tui/tui_app.rs` | render_chat draws the welcome lines when start_view is true (lines 2737-2830). |
| component | Sidebar webview CSS | `apps/extension-vscode/src/features/sidebar-webview/webviewContent.ts` | --conversation-width, #messages padding and .empty-state for VS Code. |
| component | Side panel empty block | `apps/extension/src/side_panel.ts` | #sp-empty and message width CSS for Chrome. |
| test | content-column test | `apps/mobile/__tests__/content-column.test.ts` | Tests the column limits. |
| test | MessageList reading column test | `apps/mobile/src/features/chat/components/__tests__/MessageList.readingColumn.test.tsx` | Tests that only rows are capped on a wide pane. |
| test | emptyStateOrder test | `apps/web/features/chat/pages/__tests__/WebChatPage.emptyStateOrder.test.tsx` | Tests the order of greeting, suggestions and composer on the web start view. |

## 6. Execution and data flow

| Step | Runs on | Source |
|---|---|---|
| The page decides the chat is empty from the conversation id and message count. | device | (apps/web/features/chat/pages/WebChatPage.tsx:6651) |
| The greeting, usage and plan notices and the composer render inside a centred max-w-3xl block. | device | (apps/web/features/chat/pages/WebChatPage.tsx:7646) |
| Once messages exist the ChatMessageList renders rows with the centred column class. | device | (apps/web/app/globals.css:842) |
| A markdown table renders with sticky header cells inside a scroll frame; Expand opens a dialog holding the same children. | device | (packages/ui/unified-chat/src/components/markdown/MarkdownTable.tsx:146) |
| Mobile computes a column style from constants and applies it to each row. | device | (apps/mobile/src/shared/layout/contentColumn.ts:26) |

**Data**

| What | Stored in | Synced | Kept or deleted |
|---|---|---|---|
| No data is created by layout. Notices on the start view come from other features. | not stored | no | not applicable |
| Copied table text (TSV) and downloaded table.csv | system clipboard, the download folder | no | The app does not delete them (packages/ui/unified-chat/src/components/markdown/MarkdownTable.tsx:91) |

**Models and providers.** Layout does not depend on the model or provider. The start view may show model or plan notices (CLI shows the model name and access mode: apps/cli/src/tui/tui_app.rs:2753); nothing in the layout code routes to a model.

## 7. Access and usage rules

| Rule | What the code does |
|---|---|
| Account | The layout needs no account. Whether an empty chat can be opened without sign-in is decided by the page, which was not read in full: unknown. |
| Permissions | none found in the code |
| Subscription | Web start view shows usage and free plan notices from the subscription system (apps/web/features/chat/pages/WebChatPage.tsx:7660); mobile connector suggestions need Cloud mode, sign-in, the connectors flag and the connectors capability (apps/mobile/src/features/chat/components/ChatEmptyState.tsx:36). Reading width has no entitlement. |
| Limits and metering | none found in the code for layout. The composer length cap on web comes from a managed-cloud constant (apps/web/features/chat/components/Composer/ChatComposerNew.tsx:294); it belongs to F007-05. |
| Feature flags | Mobile: the connectors feature flag and the companion flag decide extra start items (apps/mobile/src/features/chat/components/ChatEmptyState.tsx:36). No flag for the column. |
| Model compatibility | none found in the code |
| Provider restrictions | none found in the code |
| Local mode | Layout is the same in Local, own key and Cloud. Only extra start items differ: CLI shows the access mode word in the start view (apps/cli/src/tui/tui_app.rs:2753) and mobile hides connector suggestions outside Cloud (apps/mobile/src/features/chat/components/ChatEmptyState.tsx:36). |

## 8. States and edge cases

| State | Behaviour | Source |
|---|---|---|
| Loading transcript | Web shows a loading state instead of the greeting while a transcript is pending. | (apps/web/features/chat/pages/WebChatPage.tsx:7630) |
| Voice mode | Web hides the greeting banner and shows the voice surface in the same block. | (apps/web/features/chat/pages/WebChatPage.tsx:7646) |
| Compact embed | Greeting is hidden when the page is rendered compact. | (apps/web/features/chat/pages/WebChatPage.tsx:7646) |
| Narrow phone width (web) | Suggestion extras move above the composer so the composer stays last. | (apps/web/features/chat/pages/__tests__/WebChatPage.emptyStateOrder.test.tsx:281) |
| Very narrow mobile window | Column width is a ceiling, never a floor. | (apps/mobile/src/shared/layout/contentColumn.ts:25) |
| Copy fails | Copy shows a failed state for 4 seconds. | (packages/ui/unified-chat/src/components/markdown/MarkdownTable.tsx:91) |
| Touch device | Table action strip is always visible when hover is not available. | (packages/ui/unified-chat/src/components/markdown/MarkdownTable.tsx:128) |
| Offline, retry, timeout | not handled in the code for this layout; it renders from local state | Layout files read contain no network or retry logic (apps/mobile/src/shared/layout/contentColumn.ts:26) |

## 9. Verification

What has actually been seen by a person is in the Status table above. This section lists what exists to check with.

**Existing tests**

- `apps/mobile/__tests__/content-column.test.ts`: Column never narrows a phone window; reading and form widths hold on tablet; the centring margin.
- `apps/mobile/src/features/chat/components/__tests__/MessageList.readingColumn.test.tsx`: Scroll surface is the whole pane, only rows are capped, follow-up strip and empty state use the same column.
- `apps/web/features/chat/pages/__tests__/WebChatPage.emptyStateOrder.test.tsx`: Order of connector suggestions, greeting and composer on phone and wide screens.
- `apps/mobile/__tests__/MarkdownTableFit.test.tsx`: Mobile table fit (title only read; detail unknown).
- `apps/mobile/src/features/chat/components/__tests__/MessageContentRenderer.tables.test.tsx`: Mobile table rendering (title only read).

**Test scenarios**

- **Web start view**
  1. Sign in on web at 1440 wide.
  2. Open a new chat.
  3. Measure the composer position.
  - Expected: Greeting and composer are centred in the content area; sending a message swaps in the transcript.
- **Reading column on a wide window**
  1. Open a long conversation at 1920 wide.
  2. Inspect an assistant row.
  - Expected: Text width stops at 48rem and the column stays centred.
- **Sticky header**
  1. Ask for a table with 80 rows.
  2. Scroll inside the table frame.
  - Expected: The header row stays pinned at the top of the frame.
- **Expanded table**
  1. Hover the table.
  2. Choose 'Expand table'.
  3. Press Escape.
  - Expected: Dialog opens with the table and closes back to the same place.
- **Mobile tablet column**
  1. Open a chat on a 1024 wide tablet window.
  2. Check message widths.
  - Expected: Rows are 720 points or less and centred.

**Where to look when it fails**

- Check isEmptyChat in WebChatPage when the greeting is missing.
- Mobile: render the contentColumn style in a snapshot.
- No log lines or error names exist for this layout; none found in the code.

**Hands-on test plans**

- Web: [70-qa/test-plans/web/007-layout-systems.md](../../70-qa/test-plans/web/007-layout-systems.md)
- Desktop: [70-qa/test-plans/desktop/007-layout-systems.md](../../70-qa/test-plans/desktop/007-layout-systems.md)
- Mobile: [70-qa/test-plans/mobile/007-layout-systems.md](../../70-qa/test-plans/mobile/007-layout-systems.md)
- CLI: [70-qa/test-plans/cli/007-layout-systems.md](../../70-qa/test-plans/cli/007-layout-systems.md)
- VS Code: [70-qa/test-plans/vscode/007-layout-systems.md](../../70-qa/test-plans/vscode/007-layout-systems.md)
- Chrome: [70-qa/test-plans/chrome/007-layout-systems.md](../../70-qa/test-plans/chrome/007-layout-systems.md)

## 10. Gaps and dependencies

- **No centred composer with the greeting on mobile.** Affects: Mobile users. Evidence: (apps/mobile/src/features/chat/components/MessageList.tsx:458). Work needed: Decide whether the brief's S7.01 needs the composer centred; update the brief or the screen.
- **CLI start view is left aligned although marked done.** Affects: CLI users. Evidence: (apps/cli/src/tui/tui_app.rs:3057). Work needed: Centre it or correct the brief status.
- **Sticky table headers missing on mobile, VS Code, Chrome.** Affects: Those three apps. Evidence: (doc: knowledge-base/data/area-briefs/007-layout-systems.md). Work needed: Add sticky headers or record the reason.
- **No full-width data layout found; only the expanded dialog on web.** Affects: Web and Desktop users reading wide tables or charts. Evidence: (packages/ui/unified-chat/src/components/markdown/MarkdownTable.tsx:136). Work needed: Confirm S7.03 is met by the dialog, or build a wide layout.
- **No tests found for the web column width or sticky header.** Affects: Regression risk on web. Evidence: search of apps/web and packages/ui test folders found none by name. Work needed: Add a rendering test.

**Depends on**

- surface:web
- surface:desktop
- surface:mobile
- surface:cli
- surface:vscode
- surface:chrome
- SYS-shared-ui-and-design
- SYS-chat-turn-pipeline
- file:packages/ui/unified-chat/src/components/markdown/MarkdownTable.tsx
- file:apps/mobile/src/shared/layout/contentColumn.ts

## Unknown

- Whether the web empty state needs sign-in.
- Whether Chrome and VS Code tables have any sticky header.
- What the expected full-width data layout is beyond the expanded dialog.
- Exact mobile table behaviour (only test titles read).
- Brief line numbers for the web start view did not match the current file; the current lines are used here.
