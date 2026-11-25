---
id: "F021-11"
type: "feature"
title: "Line numbers, line wrapping and collapsing long blocks"
aliases: ["Line numbers", "Wrap long lines", "Show more / Show less", "Expand code", "code-block-body-scroll", "Collapse long code"]
area: "21 Code blocks and executable code presentation"
available_on: ["web", "desktop", "mobile"]
implementation: {web: "partial", desktop: "partial", mobile: "partial", cli: "missing", vscode: "missing", chrome: "missing"}
verification: {web: "n/a", desktop: "n/a", mobile: "n/a", cli: "n/a", vscode: "n/a", chrome: "n/a"}
requirement_items: ["S21.05", "S21.06", "S21.07"]
depends_on: ["SYS-shared-ui-and-design", "SYS-files-artifacts-and-storage", "surface:web", "surface:desktop", "surface:mobile", "surface:cli", "surface:vscode", "surface:chrome", "file:packages/ui/unified-chat/src/components/markdown/CodeBlock.tsx", "store:code-preferences"]
basis: "code inspection"
second_reader: "not sampled: statements are code readings that nobody has re-checked"
last_reviewed: "2026-11-24"
revision: "f51d16e747"
---
# F021-11 Line numbers, line wrapping and collapsing long blocks

Reading aids for long code. Web chat code blocks have no line numbers, wrap switch or collapse; they scroll in a capped box, with an Expand code dialog. Mobile has more than the brief says: a Wrap long lines setting, Show more and Show less on blocks over 20 lines, and line numbers in the full-screen source viewer.

Area: [21. Code blocks and executable code presentation](README.md). Requirement items: [S21.05](../../10-requirements/capabilities/021-code-blocks-and-executable-code-presentation.md#s2105), [S21.06](../../10-requirements/capabilities/021-code-blocks-and-executable-code-presentation.md#s2106), [S21.07](../../10-requirements/capabilities/021-code-blocks-and-executable-code-presentation.md#s2107).

## Status

Two separate questions: is the code there, and has a person seen it work. "Seen working" comes only from results of real runs recorded in the project's ledger.

| App | In the code: this page's reading, 2026-11-24 | In the code: ledger audit, 2026-09-26 and later updates | Seen working by a person |
|---|---|---|---|
| Web | partly built **(disagrees with the ledger on whether it exists)** | not built | n/a |
| Desktop | partly built **(disagrees with the ledger on whether it exists)** | not built | n/a |
| Mobile | partly built **(disagrees with the ledger on whether it exists)** | not built | n/a |
| CLI | not built | not built | n/a |
| VS Code | not built | not built | n/a |
| Chrome | not built | not built | n/a |

The first column was derived from this page's text by a second, cheaper pass and has not been validated item by item; the ledger column is the project's own record. Neither is a test result.
Where the two disagree on whether the feature exists on an app, the case is listed in [ledger corrections](../../90-meta/ledger-corrections.md).

## 1. Purpose and user value

**What it does.** Helps people read long code: numbered lines, a choice between wrapping and sideways scrolling, and collapsing long blocks. Web chat code blocks use a fixed-height scroll box and an Expand code dialog (packages/ui/unified-chat/src/components/markdown/codeBlock.css:8-11, :44-49; packages/ui/unified-chat/src/components/markdown/CodeBlock.tsx:199-202).

**Why it exists.** Long code is hard to read and to refer to by line. [inferred]

**Who uses it.** Anyone reading code in chat, especially on phones.

**Problems it solves**

- Sideways scrolling on small screens.
- Long blocks pushing the chat away.
- Pointing to a line.

**Use cases**

- Read a 200-line script on a phone with wrapping on.
- Collapse a long block to keep reading the answer.
- Open the artifact viewer to see numbered lines.
- Open Expand code on web to see more at once.

## 2. User experience

**Where to find it**

- Web chat code block: header has Copy, Download <file name>, Edit this code beside the chat and Expand code buttons (CodeBlock.tsx:129-135, :199-202). No line numbers, wrap switch or collapse control.
- Web Canvas editor opened from a code block: line numbers are on in the editor (apps/web/features/chat/components/artifacts/ArtifactCodeEditor.tsx:131).
- Mobile: Settings, Code, switch Wrap long lines with the text Wrap code and diffs instead of scrolling sideways. (apps/mobile/src/features/settings/code/index.tsx:398-405).
- Mobile chat code card: Show more or Show less under blocks over 20 lines (apps/mobile/src/features/chat/components/CodeCard.tsx:165, :417, :550-575).
- Mobile full-screen source view: numbered lines (apps/mobile/src/features/chat/components/ArtifactFullScreen.tsx:161-181, :1851-1884).
- CLI and VS Code: none found.
- Chrome: none found.

**Before you start**

- Mobile collapse needs a finished (not streaming) block over 20 lines (CodeCard.tsx:417).

**Screens and controls**

- Web: Expand code button opens a full-size dialog (CodeBlock.tsx:199-202, :240-269).
- Mobile: Wrap long lines switch; Show more or Show less button with expanded state (CodeCard.tsx:550-575).
- Mobile: Expand code icon button opens the full-screen view (CodeCard.tsx:538-546).

**Journey**

1. Web: read the block; long blocks scroll inside the box; press Expand code for a larger dialog.
2. Mobile: read a block; if over 20 lines it is capped with a fade; tap Show more to see all; tap Show less to cap again; turn on Wrap long lines in Settings to wrap.

**What the person sees and gets**

- Mobile cap shows a fade at the bottom (apps/mobile/src/features/settings/code/CodeLinesScroller.tsx:68-76).
- Mobile Show more or Show less state is announced as expanded (CodeCard.tsx:555-556).

**Settings**

- Mobile: Wrap long lines (apps/mobile/src/features/settings/code/store.ts:20-21, :45).
- Product requirement: Appearance settings include code wrapping (doc: docs/product/definition.md:279; docs/product/requirements.md:1277).

## 3. Current implementation

From reading the code. Not a test result.

**Working in the code**

- Web scroll box with max-height 28rem and overflow auto; the code pre has its own max-height and scroll (codeBlock.css:8-11, :44-49).
- Web Expand code dialog (CodeBlock.tsx:240-269).
- Web Canvas editor with line numbers (ArtifactCodeEditor.tsx:131).
- Mobile Wrap long lines setting applies to code cards, diffs and the full-screen viewer (CodeLinesScroller.tsx:54-60; ArtifactFullScreen.tsx:1851-1884).
- Mobile collapse to 20 lines with Show more or Show less (CodeCard.tsx:165, :417-427, :550-575); plain text blocks always wrap (CodeCard.tsx:395-396).
- Mobile line numbers in the full-screen source view (ArtifactFullScreen.tsx:161-181).

**Incomplete**

- Mobile line numbers appear only in the full-screen artifact viewer, not in the inline code card (no line-number code in CodeCard.tsx lines read).
- The wrap setting sits on the Code settings screen and is one global preference, not per block (index.tsx:394-405).

**Present but disconnected or switched off**

- none found

**Not available**

- Web and desktop chat blocks: no line numbers, no wrap switch, no collapse (CodeBlock.tsx and codeBlock.css contain none; a search for lineNumbers found only the editor).
- CLI: no line numbers, wrap switch or collapse in the markdown renderer (apps/cli/src/tui/markdown_renderer.rs searched).
- VS Code: code blocks have Copy, Explain, Apply only (apps/extension-vscode/src/webview/render.ts:44-49).
- Chrome: no code block controls found.

## 4. Required behaviour

**Established requirements**

- Code blocks can show line numbers. (source: brief S21.05)
- The reader can toggle long code lines between wrapping and horizontal scroll. (source: brief S21.06)
- Long code blocks are collapsed with a control to expand and collapse them. (source: brief S21.07)
- Appearance settings must include code wrapping. (source: doc: docs/product/definition.md:279)

**Acceptance criteria**

1. A code block over the cap shows a visible control to expand and collapse it.
2. The reader can switch between wrapping and sideways scroll without changing the code text.
3. Line numbers can be turned on and are not copied when the code is copied.
4. Mobile: a block of 21 lines shows Show more; 20 lines does not.
5. Mobile: turning on Wrap long lines wraps code, diffs and the full-screen view.
6. Line numbers are hidden from screen readers (mobile does this).

**Inferred requirements** (not stated anywhere; reasoned from the code or from competitor parity)

- Copy must still copy exactly the code, without numbers [inferred from brief S21.03].

**Proposed improvements** (suggestions, not requirements)

- [proposed] Add a per-block wrap toggle and a collapse control on web, using the shared CodeBlock so desktop and Chrome gain it.
- [proposed] Add optional line numbers in web and mobile chat blocks.
- [proposed] Offer the wrap setting on the Appearance page as required by the product definition.

## 5. Implementation map

| Kind | Name | Path | Role |
|---|---|---|---|
| component | CodeBlock (shared) | `packages/ui/unified-chat/src/components/markdown/CodeBlock.tsx` | Web and desktop fenced block with header buttons |
| config | codeBlock.css | `packages/ui/unified-chat/src/components/markdown/codeBlock.css` | Scroll caps and layout |
| component | HighlightedCode | `packages/ui/unified-chat/src/components/markdown/HighlightedCode.tsx` | Highlighted code body |
| component | ArtifactCodeEditor | `apps/web/features/chat/components/artifacts/ArtifactCodeEditor.tsx` | Editor with line numbers (line 131) |
| component | CodeCard (mobile) | `apps/mobile/src/features/chat/components/CodeCard.tsx` | Cap, Show more or less, wrap flag, Expand code |
| component | CodeLinesScroller | `apps/mobile/src/features/settings/code/CodeLinesScroller.tsx` | Wrap or side scroll and cap fade |
| store | code preferences | `apps/mobile/src/features/settings/code/store.ts` | wrapLongLines persisted preference |
| screen | Code settings | `apps/mobile/src/features/settings/code/index.tsx` | Wrap long lines switch |
| component | ArtifactFullScreen | `apps/mobile/src/features/chat/components/ArtifactFullScreen.tsx` | Source view with line numbers |
| component | CodeFullScreen | `apps/mobile/src/features/chat/components/CodeFullScreen.tsx` | Full-screen code (by import in CodeCard.tsx:35) |
| component | MessageContentRenderer | `apps/mobile/src/features/chat/components/MessageContentRenderer.tsx` | Renders code cards |
| service | CLI markdown renderer | `apps/cli/src/tui/markdown_renderer.rs` | Terminal code blocks (no controls) |
| service | VS Code render | `apps/extension-vscode/src/webview/render.ts` | Code block with Copy, Explain, Apply |
| test | CodeWrapLongLines test | `apps/mobile/__tests__/CodeWrapLongLines.test.tsx` | Wrap setting behaviour |
| test | CodeCard tests | `apps/mobile/src/features/chat/components/__tests__/MessageContentRenderer.codeCard.test.tsx` | Code card behaviour |

## 6. Execution and data flow

| Step | Runs on | Source |
|---|---|---|
| The renderer receives the fenced code and draws it with highlighting. | device | CodeBlock.tsx:223-238 |
| Web: the body scrolls in a capped box; Expand code opens a dialog. | device | codeBlock.css:8-11; CodeBlock.tsx:240-269 |
| Mobile: the card counts lines, caps over 20 with a fade, and wraps if the setting is on. | device | CodeCard.tsx:417-427; CodeLinesScroller.tsx:54-76 |

**Data**

| What | Stored in | Synced | Kept or deleted |
|---|---|---|---|
| Wrap long lines preference | Mobile persisted store named code-preferences | no sync found | kept on the phone (store.ts:44-48 persist with name code-preferences) |
| Show more state per block | Answer draft store keyed by message and block | no | reset on Show less (CodeCard.tsx:377-380, :553) |

**Models and providers.** No model or provider involvement.

## 7. Access and usage rules

| Rule | What the code does |
|---|---|
| Account | none found in the code. |
| Permissions | none found in the code. |
| Subscription | none found in the code: not tied to a plan. |
| Limits and metering | Mobile cap is 20 lines (CodeCard.tsx:165). Web box cap 28rem and 32rem (codeBlock.css:9, :46). |
| Feature flags | none found in the code. |
| Model compatibility | none found in the code. |
| Provider restrictions | none found in the code. |
| Local mode | Works the same offline and in Local mode: pure display. |

## 8. States and edge cases

| State | Behaviour | Source |
|---|---|---|
| Streaming block | Mobile does not cap or offer Expand while streaming | CodeCard.tsx:417, :538 |
| Plain text block (mobile) | Always wraps | CodeCard.tsx:395-396 |
| Touch devices (web) | Header buttons are 44px high on coarse pointers | codeBlock.css:20-25; CodeBlock.tsx:62-69 |
| Accessibility | Mobile line numbers hidden from accessibility; Show more has expanded state; web buttons have labels | ArtifactFullScreen.tsx:166-168; CodeCard.tsx:555-556; CodeBlock.tsx:129-131 |
| Empty code | Expand and collapse controls are hidden when there is no code | CodeCard.tsx:538 |
| Very long single line (web) | Scrolls sideways; no wrap alternative | codeBlock.css:44-49 |

## 9. Verification

What has actually been seen by a person is in the Status table above. This section lists what exists to check with.

**Existing tests**

- `apps/mobile/__tests__/CodeWrapLongLines.test.tsx`: Wrap long lines setting (file name and first lines; full cases not read)
- `apps/mobile/__tests__/CodeCardAppearance.test.tsx`: Code card appearance (by file name)
- `apps/mobile/src/features/chat/components/__tests__/MessageContentRenderer.codeCard.test.tsx`: Code card including Show more text (matched by search)
- `apps/mobile/src/features/chat/components/__tests__/ArtifactFullScreen.viewing.test.tsx`: Full-screen viewing including line numbers (matched by search)
- `packages/ui/unified-chat/src/components/markdown/MarkdownContent.test.tsx`: Markdown rendering (by file name)
- `apps/mobile/__tests__/CodeBlockHeader.test.tsx`: Code block header (by file name)

**Test scenarios**

- **Web long block**
  1. Ask for a 200-line script on web.
  2. Scroll the block.
  3. Press Expand code.
  - Expected: Block scrolls in a capped box; the dialog shows a larger view; no line numbers, wrap switch or collapse.
- **Mobile collapse**
  1. Ask for a 40-line script on mobile.
  2. Tap Show more, then Show less.
  - Expected: Capped at 20 lines with a fade; all lines after Show more; capped again.
- **Mobile wrap**
  1. Settings, Code: turn on Wrap long lines.
  2. Open a block with a long line.
  - Expected: Line wraps, no sideways scroll.
- **Mobile line numbers**
  1. Open a code block full screen.
  - Expected: Numbered lines at left; screen reader skips them.
- **Copy exactness**
  1. Copy a block on web.
  - Expected: Clipboard equals the code only.
- **CLI and VS Code check**
  1. Open a long block in each.
  - Expected: No line numbers, wrap switch or collapse (documents the gap).

**Where to look when it fails**

- Mobile: testID code-cap (CodeLinesScroller.tsx:68).
- Web: class code-block-body-scroll in the DOM.
- Mobile persisted store key code-preferences.

**Hands-on test plans**

- Web: [70-qa/test-plans/web/021-code-blocks-and-executable-code-presentation.md](../../70-qa/test-plans/web/021-code-blocks-and-executable-code-presentation.md)
- Desktop: [70-qa/test-plans/desktop/021-code-blocks-and-executable-code-presentation.md](../../70-qa/test-plans/desktop/021-code-blocks-and-executable-code-presentation.md)
- Mobile: [70-qa/test-plans/mobile/021-code-blocks-and-executable-code-presentation.md](../../70-qa/test-plans/mobile/021-code-blocks-and-executable-code-presentation.md)

## 10. Gaps and dependencies

- **No line numbers, wrap switch or collapse in web and desktop chat blocks** Affects: Web, desktop. Evidence: CodeBlock.tsx; codeBlock.css. Work needed: Add to the shared CodeBlock.
- **Line numbers only in the mobile full-screen viewer** Affects: Mobile. Evidence: ArtifactFullScreen.tsx:161-181; CodeCard.tsx. Work needed: Optional inline line numbers.
- **No wrap setting on web; the product definition lists code wrapping under Appearance** Affects: Web, desktop. Evidence: docs/product/definition.md:279. Work needed: Add to the Appearance page.
- **CLI, VS Code and Chrome have none** Affects: CLI, VS Code, Chrome. Evidence: markdown_renderer.rs; render.ts:44-49. Work needed: Decide per surface.
- **Brief says mobile missing for all three items, but wrap, collapse and full-screen line numbers exist** Affects: Documentation. Evidence: CodeCard.tsx:417-575; store.ts:20. Work needed: Correct the brief rows.
- Not built on: CLI, VS Code, Chrome (from the capability ledger).

**Depends on**

- SYS-shared-ui-and-design
- SYS-files-artifacts-and-storage
- surface:web
- surface:desktop
- surface:mobile
- surface:cli
- surface:vscode
- surface:chrome
- file:packages/ui/unified-chat/src/components/markdown/CodeBlock.tsx
- store:code-preferences

## Unknown

- Full contents of mobile wrap tests.
- Whether web Canvas line numbers are always on or a setting.
- Whether the Chrome side panel has any code block controls beyond copy: not searched in depth.
- Whether the Tauri desktop build differs for code blocks.
