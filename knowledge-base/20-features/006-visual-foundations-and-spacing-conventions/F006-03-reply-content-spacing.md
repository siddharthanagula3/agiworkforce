---
id: "F006-03"
type: "feature"
title: "Reply content spacing"
aliases: ["Reply content spacing", "Paragraph spacing", "List indentation", "Code-block padding", "Table-cell padding", "message-text rhythm", "Wrap long code lines"]
area: "6 Visual foundations and spacing conventions"
available_on: ["web", "desktop", "mobile", "cli", "vscode", "chrome"]
implementation: {web: "built", desktop: "built", mobile: "built", cli: "built", vscode: "built", chrome: "built"}
verification: {web: "not seen by a person", desktop: "not seen by a person", mobile: "not seen by a person", cli: "not seen by a person", vscode: "not seen by a person", chrome: "not seen by a person"}
requirement_items: ["S6.13", "S6.14", "S6.15", "S6.16"]
depends_on: ["SYS-shared-ui-and-design", "SYS-chat-turn-pipeline", "surface:web", "surface:desktop", "surface:mobile", "surface:cli", "surface:vscode", "surface:chrome", "mode:local", "F006-02"]
basis: "code inspection"
second_reader: "not sampled: statements are code readings that nobody has re-checked"
last_reviewed: "2026-11-24"
revision: "f51d16e747"
---
# F006-03 Reply content spacing

Sets the gaps inside a rendered reply: space between paragraphs, how far lists indent, padding inside code blocks and table cells. Web has a Wrap long code lines switch; every other app uses fixed values in its own renderer.

Area: [6. Visual foundations and spacing conventions](README.md). Requirement items: [S6.13](../../10-requirements/capabilities/006-visual-foundations-and-spacing-conventions.md#s613), [S6.14](../../10-requirements/capabilities/006-visual-foundations-and-spacing-conventions.md#s614), [S6.15](../../10-requirements/capabilities/006-visual-foundations-and-spacing-conventions.md#s615), [S6.16](../../10-requirements/capabilities/006-visual-foundations-and-spacing-conventions.md#s616).

## Status

Two separate questions: is the code there, and has a person seen it work. "Seen working" comes only from results of real runs recorded in the project's ledger.

| App | In the code: this page's reading, 2026-11-24 | In the code: ledger audit, 2026-09-26 and later updates | Seen working by a person |
|---|---|---|---|
| Web | built | built | not seen by a person |
| Desktop | built | built | not seen by a person |
| Mobile | built | built | not seen by a person |
| CLI | built | built | not seen by a person |
| VS Code | built | built | not seen by a person |
| Chrome | built | built | not seen by a person |

The first column was derived from this page's text by a second, cheaper pass and has not been validated item by item; the ledger column is the project's own record. Neither is a test result.

## 1. Purpose and user value

**What it does.** Gives rendered replies a steady rhythm. On web one unlayered rule sets block spacing (apps/web/app/globals.css:1109-1111), paragraphs (:1117), lists (:1142-1147) and a code-block padding rule (:912-913); table cells have their own padding in the shared markdown component (packages/ui/unified-chat/src/components/markdown/MarkdownContent.tsx:562,584).

**Why it exists.** Replies are the main thing people read. Even gaps and padding make long answers scannable and stop code and tables from looking cramped.

**Who uses it.** Everyone who reads a reply; engineers who touch the markdown renderers.

**Problems it solves**

- Walls of text with no gaps
- Code blocks with text touching the edge
- Tables whose cells touch
- Long code lines pushing the page wide

**Use cases**

- Read a long answer with lists and headings.
- Read a reply with a Markdown table.
- Copy code from a block that wraps or scrolls.
- Read a reply in the terminal CLI.

## 2. User experience

**Where to find it**

- Web and desktop: any reply in chat; the only control is Settings > Appearance > 'Wrap long code lines' switch (AppearanceSection.tsx:235-240).
- Mobile: replies in chat (apps/mobile/src/features/chat/components/MessageContentRenderer.tsx).
- CLI: replies in the terminal (apps/cli/src/tui/markdown_renderer.rs).
- VS Code: replies in the sidebar (webviewContent.ts:1412-1438).
- Chrome: assistant replies in the side panel (apps/extension/src/side_panel.ts:2964).

**Before you start**

- None.

**Screens and controls**

- Web: a switch labelled 'Wrap long code lines' (off by default, web-settings-store.ts:131).
- No other control on any app.

**Journey**

1. Send a message and wait for the reply.
2. Read it; paragraphs, lists, code and tables follow the spacing rules.
3. On web, turn on Wrap long code lines to wrap code instead of scrolling sideways.

**What the person sees and gets**

- Wrapped code on web (white-space pre-wrap, break-word) (globals.css:979-984).
- A scroll bar on long code lines when wrap is off (globals.css:912-913 overflow-x-auto).

**Settings**

- codeBlockWrap, stamped as data-code-block-wrap=on (AppearancePreferences.tsx:22-26).
- Mobile code settings include 'Wrap long lines' (apps/mobile/src/features/settings/code/index.tsx:400).

## 3. Current implementation

From reading the code. Not a test result.

**Working in the code**

- Web paragraphs: every direct child of .message-text gets top margin 0.75rem, first child none (globals.css:1109-1115); p has the same margin (:1117); headings h1 mt-6 mb-4, h2 mt-5 mb-3, h3 mt-4 mb-2 (:1126-1136).
- Web lists: ul and ol pl-7, list items mt-1 apart (globals.css:1142-1148).
- Web code blocks: padding p-4 and 13px text (globals.css:912-921).
- Web tables: cells px-3 py-2 with border, header sticky (MarkdownContent.tsx:562,584).
- Web wrap switch changes pre to pre-wrap (globals.css:979-984).
- Mobile: heading margins 8 and 4 (MessageContentRenderer.tsx:1095-1096), list wrapper margin 4 with gap 2 and item padding 4 plus 16 per depth (:1207,1214-1215), table row padding 8 vertical (:456-457).
- CLI: blank line between blocks (markdown_renderer.rs:352-355,584-589), list indent 4 plus 2 per nesting level (:306), table with box borders, columns 8 to 40 wide inside a 96 budget (:452-455,482).
- VS Code: pre padding 12px and margin 8px 0 (webviewContent.ts:1417), th and td 4px 10px (:1436), list margin-left 16px (:1438), heading margin 8px 0 4px (:1423).
- Chrome: paragraph gap token 0.75em applied as p + p (side_panel.css:43; side_panel.ts:2964).

**Incomplete**

- Web has two paragraph rules: .prose p margin 0.75em in a layer (globals.css:813) and .message-text p unlayered (:1117); the comment says unlayered wins, so the first is likely redundant for replies [inferred].
- Mobile code block padding was not located; MessageBubble.tsx:714 cited by the brief was not confirmed.
- Mobile and VS Code spacing values are literal numbers in components, not shared tokens (MessageContentRenderer.tsx:1095; webviewContent.ts:1417).

**Present but disconnected or switched off**

- docs.css table padding cited by the brief (apps/web/features/docs/docs.css:729) was not opened.

**Not available**

- Wrap long code lines control on VS Code, Chrome and CLI (none found); CLI wraps by terminal width.

## 4. Required behaviour

**Established requirements**

- Rendered paragraphs are separated by a defined vertical gap set in one rule. (source: S6.13 (brief))
- Lists use a defined indentation and nesting step. (source: S6.14 (brief))
- Code blocks have defined internal padding set in one shared rule. (source: S6.15 (brief))
- Table cells in rendered content and data tables have defined consistent padding. (source: S6.16 (brief))

**Acceptance criteria**

1. In a web reply, two consecutive paragraphs are 12px (0.75rem) apart.
2. A nested list on web indents by 1.75rem per level.
3. A code block has 16px padding on web and 12px in VS Code.
4. Table cells in web replies have 12px horizontal and 8px vertical padding.
5. With Wrap long code lines on, a 300-character line wraps on web; with it off, it scrolls sideways.
6. In the CLI, a paragraph followed by a list has one blank line between them.

**Inferred requirements** (not stated anywhere; reasoned from the code or from competitor parity)

- One unified padding value across apps is not required; each app's measure follows its own units [inferred from different renderers].

**Proposed improvements** (suggestions, not requirements)

- [proposed] Remove the redundant .prose p rule if replies never use it alone.
- [proposed] Move mobile and VS Code spacing constants into tokens.

## 5. Implementation map

| Kind | Name | Path | Role |
|---|---|---|---|
| config | web reply rhythm rules | `apps/web/app/globals.css` | Paragraph, heading, list rules (:1109-1148) and code block padding (:912-921) |
| component | MarkdownContent | `packages/ui/unified-chat/src/components/markdown/MarkdownContent.tsx` | Shared markdown renderer with table cell padding (:562,584) |
| component | MessageBubble | `apps/web/features/chat/components/messages/MessageBubble.tsx` | Applies prose classes to reply text (:2842) |
| component | AppearanceSection wrap switch | `apps/web/features/settings/sections/AppearanceSection.tsx` | Wrap long code lines switch (:235-240) |
| component | AppearancePreferences | `apps/web/shared/components/AppearancePreferences.tsx` | Stamps data-code-block-wrap |
| component | mobile MessageContentRenderer | `apps/mobile/src/features/chat/components/MessageContentRenderer.tsx` | Headings, lists and tables on mobile |
| screen | mobile code settings | `apps/mobile/src/features/settings/code/index.tsx` | Wrap long lines switch (:400) |
| component | CLI markdown renderer | `apps/cli/src/tui/markdown_renderer.rs` | Blocks, lists, tables for the terminal |
| component | VS Code webview styles | `apps/extension-vscode/src/features/sidebar-webview/webviewContent.ts` | pre, th, td, li and heading spacing (:1412-1438) |
| config | Chrome paragraph gap | `apps/extension/src/side_panel.css` | --paragraph-gap token (:43) |
| component | Chrome side panel bubble styles | `apps/extension/src/side_panel.ts` | p + p rule (:2964) |
| store | web settings store | `apps/web/shared/stores/web-settings-store.ts` | codeBlockWrap (:131,173) |
| test | CLI markdown tests | `apps/cli/src/tui/markdown_renderer.rs` | Unit tests for escape stripping, tasks and tables (:659-722) |
| test | AppearanceSection test | `apps/web/features/settings/sections/AppearanceSection.test.tsx` | Appearance controls including code controls |

## 6. Execution and data flow

| Step | Runs on | Source |
|---|---|---|
| The reply text streams in and the shared markdown component renders paragraphs, lists, code and tables. | device | packages/ui/unified-chat/src/components/markdown/MarkdownContent.tsx |
| CSS rules on .message-text and .code-block-body set gaps and padding. | device | apps/web/app/globals.css:1109-1148,912-921 |
| If the person turned on Wrap long code lines, html gets data-code-block-wrap=on and pre wraps. | device | AppearancePreferences.tsx:22-26; globals.css:979-984 |
| The reply content itself comes from the model through the chat turn pipeline; spacing does not depend on it. | our servers | [inferred] chat replies in Cloud mode come from the managed service; not traced for this feature |

**Data**

| What | Stored in | Synced | Kept or deleted |
|---|---|---|---|
| codeBlockWrap | Browser localStorage and account (user_settings) when signed in | Yes when signed in | As in F006-01 |

**Models and providers.** The reply text can come from any model or provider; spacing is applied after the text arrives and does not vary by model.

## 7. Access and usage rules

| Rule | What the code does |
|---|---|
| Account | None needed. |
| Permissions | none found in the code |
| Subscription | none found in the code |
| Limits and metering | none found in the code |
| Feature flags | none found in the code |
| Model compatibility | Not model dependent. |
| Provider restrictions | none found in the code |
| Local mode | Spacing applies to Local-mode replies the same way; no sign-in or payment needed. |

## 8. States and edge cases

| State | Behaviour | Source |
|---|---|---|
| Streaming reply (web) | Hidden trailing span while streaming | apps/web/app/globals.css:1151-1153 |
| First child of a reply | No top margin | globals.css:1113-1115 |
| Paragraph inside list item or quote | First paragraph has no top margin | globals.css:1121-1124 |
| Wide table (mobile) | Scrolls sideways with minimum column width | MessageContentRenderer.tsx scrolledTableWidths (:205-211 region) |
| Wide table (CLI) | Cells wrapped to the column cap; CJK text aligned | markdown_renderer.rs:452-455,722 |
| Right-to-left text (mobile) | List padding mirrored | MessageContentRenderer.tsx:1214 |
| Loading, error, offline | not handled in the code for spacing | none found in the files read |

## 9. Verification

What has actually been seen by a person is in the Status table above. This section lists what exists to check with.

**Existing tests**

- `apps/cli/src/tui/markdown_renderer.rs`: Renders checked tasks, GFM table with borders, CJK alignment, escape stripping
- `apps/web/features/settings/sections/AppearanceSection.test.tsx`: Appearance code controls (detail not read)
- `apps/web/features/chat/components/messages/MessageBubble.math.test.tsx`: Math rendering inside .message-text (spacing not covered)

**Test scenarios**

- **Paragraph gap**
  1. Send a prompt that returns three paragraphs
  2. Measure the gap between paragraphs in devtools
  - Expected: 12px on web
- **Nested list**
  1. Ask for a three-level list
  2. Inspect left padding
  - Expected: 1.75rem per level on web; 16px steps on mobile
- **Wrap code**
  1. Turn on Wrap long code lines
  2. Ask for a one-line 300-character command
  - Expected: The line wraps; no sideways scroll bar
- **Table padding**
  1. Ask for a four-column table
  2. Inspect a cell
  - Expected: 12px by 8px padding on web
- **CLI blocks**
  1. Run a CLI chat that returns paragraph, list and table
  - Expected: One blank line between blocks; table drawn with box borders

**Where to look when it fails**

- Devtools computed styles on .message-text children.
- Attribute data-code-block-wrap on html.
- CLI: run markdown_renderer unit tests locally (not run by me).

**Hands-on test plans**

- Web: [70-qa/test-plans/web/006-visual-foundations-and-spacing-conventions.md](../../70-qa/test-plans/web/006-visual-foundations-and-spacing-conventions.md)
- Desktop: [70-qa/test-plans/desktop/006-visual-foundations-and-spacing-conventions.md](../../70-qa/test-plans/desktop/006-visual-foundations-and-spacing-conventions.md)
- Mobile: [70-qa/test-plans/mobile/006-visual-foundations-and-spacing-conventions.md](../../70-qa/test-plans/mobile/006-visual-foundations-and-spacing-conventions.md)
- CLI: [70-qa/test-plans/cli/006-visual-foundations-and-spacing-conventions.md](../../70-qa/test-plans/cli/006-visual-foundations-and-spacing-conventions.md)
- VS Code: [70-qa/test-plans/vscode/006-visual-foundations-and-spacing-conventions.md](../../70-qa/test-plans/vscode/006-visual-foundations-and-spacing-conventions.md)
- Chrome: [70-qa/test-plans/chrome/006-visual-foundations-and-spacing-conventions.md](../../70-qa/test-plans/chrome/006-visual-foundations-and-spacing-conventions.md)

## 10. Gaps and dependencies

- **Duplicate paragraph rules on web** Affects: Web, desktop. Evidence: globals.css:813 and :1117. Work needed: Remove or merge so one rule owns paragraph gaps
- **Spacing constants are literals on mobile and VS Code** Affects: Mobile, VS Code. Evidence: MessageContentRenderer.tsx:1095,1207; webviewContent.ts:1417,1436. Work needed: Name them in the shared tokens or a local constants file
- **No tests assert paragraph, list, code padding or table padding values** Affects: All apps except CLI table output. Evidence: Search of tests in apps/web/shared/components/__tests__ listed none for these rules. Work needed: Add computed-style tests

**Depends on**

- SYS-shared-ui-and-design
- SYS-chat-turn-pipeline
- surface:web
- surface:desktop
- surface:mobile
- surface:cli
- surface:vscode
- surface:chrome
- mode:local
- F006-02

## Unknown

- Mobile code block padding (brief cites MessageBubble.tsx:714; I did not confirm).
- Where docs.css table padding applies and its value.
- Whether any tests measure web spacing values.
- The line-level behaviour of VS Code paragraph spacing: .message uses pre-wrap, so paragraph gaps may come from newlines; not confirmed.
- How Chrome renders lists and tables in replies.
