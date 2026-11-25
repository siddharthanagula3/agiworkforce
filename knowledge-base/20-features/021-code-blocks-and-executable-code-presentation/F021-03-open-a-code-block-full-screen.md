---
id: "F021-03"
type: "feature"
title: "Open a code block full screen"
aliases: ["Expand code", "Full-screen code view", "Expanded code dialog", "Close expanded code", "S21.08", "CodeFullScreen"]
area: "21 Code blocks and executable code presentation"
available_on: ["web", "desktop"]
implementation: {web: "built", desktop: "built", mobile: "n/a", cli: "missing", vscode: "missing", chrome: "missing"}
verification: {web: "not seen by a person", desktop: "not seen by a person", mobile: "n/a", cli: "n/a", vscode: "n/a", chrome: "n/a"}
requirement_items: ["S21.08"]
depends_on: ["surface:web", "surface:desktop", "surface:mobile", "SYS-shared-ui-and-design", "F021-01", "F021-02", "file:packages/ui/unified-chat/src/components/markdown/CodeBlock.tsx"]
basis: "code inspection"
second_reader: "not sampled: statements are code readings that nobody has re-checked"
last_reviewed: "2026-11-24"
revision: "f51d16e747"
---
# F021-03 Open a code block full screen

A code block can be opened in a large view to read or copy it without the chat around it. Web and hosted Desktop open a dialog with Copy, download and Close; mobile opens a full-screen sheet from an 'Expand code' button. CLI, VS Code and Chrome have none.

Area: [21. Code blocks and executable code presentation](README.md). Requirement items: [S21.08](../../10-requirements/capabilities/021-code-blocks-and-executable-code-presentation.md#s2108).

## Status

Two separate questions: is the code there, and has a person seen it work. "Seen working" comes only from results of real runs recorded in the project's ledger.

| App | In the code: this page's reading, 2026-11-24 | In the code: ledger audit, 2026-09-26 and later updates | Seen working by a person |
|---|---|---|---|
| Web | built | built | not seen by a person |
| Desktop | built | built | not seen by a person |
| Mobile | does not apply | does not apply | n/a |
| CLI | not built | not built | n/a |
| VS Code | not built | not built | n/a |
| Chrome | not built | not built | n/a |

The first column was derived from this page's text by a second, cheaper pass and has not been validated item by item; the ledger column is the project's own record. Neither is a test result.

## 1. Purpose and user value

**What it does.** Opens one block in a large overlay with its own scroll area, keeping Copy and download beside it.

**Why it exists.** Brief item S21.08. The inline body is capped (web max height 28rem or 32rem; mobile 20 lines), so long code is easier to read large.

**Who uses it.** Users reading or copying long code.

**Problems it solves**

- Long code scrolls inside a small box.
- Reading code in the middle of a long chat is cramped.

**Use cases**

- Expand a 200-line block on web, scroll, copy it.
- Expand a block on a phone to read it full width.
- Download from inside the dialog.

## 2. User experience

**Where to find it**

- Web and hosted Desktop: Maximize icon button labelled 'Expand code' in the block header (CodeBlock.tsx:195-205).
- Mobile: button labelled 'Expand code' in the code card header (CodeCard.tsx:542).
- Not on CLI, VS Code or Chrome.

**Before you start**

- A code block with a language class on web (blocks without one render inline from CodeBlock, though fences without a language word get language 'text'). On mobile the block must have code and not be streaming (CodeCard.tsx:537-546).

**Screens and controls**

- Web dialog header: title '<language> code' (markdown.codeTitle), Copy, download, and a close icon labelled 'Close expanded code' (CodeBlock.tsx:247-266).
- Web body: a scroll region labelled '<language> code block' with tabIndex 0 (CodeBlock.tsx:268-275).
- Mobile: CodeFullScreen with title, download and copy actions (CodeCard.tsx:619-639).

**Journey**

1. Click the expand icon.
2. Read or scroll the code in the dialog.
3. Optionally Copy or download.
4. Press Escape or click Close expanded code.

**What the person sees and gets**

- Overlay covering the page with 16 px inset (inset-4).
- Copy shows 'Copied' in the dialog too.

**Settings**

- none found.

## 3. Current implementation

From reading the code. Not a test result.

**Working in the code**

- Web: Dialog opens on state expanded; same copyButton and downloadButton elements; highlighted code; header title; DialogClose button (CodeBlock.tsx:240-277).
- Web: the Expand button has no stream-tail guard, so it opens while the block is streaming; the dialog then shows plain text because HighlightedCode receives enabled=false for the tail (CodeBlock.tsx:166-173,195-205) [inferred].
- Web: test checks an Expand button is present on a fenced block (MarkdownContent.render.test.tsx:172-173).
- Mobile: CodeFullScreen sheet with download and copy (CodeCard.tsx:619-639).

**Incomplete**

- The first draft said mobile was not listed; code shows mobile does have it, though brief S21.08 lists no mobile status.

**Present but disconnected or switched off**

- The Edit button is not repeated inside the web dialog (CodeBlock.tsx:251-253 shows only copy, download, close).

**Not available**

- CLI, VS Code and Chrome have no full-screen code view.
- Web dialog has no Explain, diff colouring or HTML preview inside it: it renders HighlightedCode only, so a diff block is not coloured line by line there (CodeBlock.tsx:274) [inferred].

## 4. Required behaviour

**Established requirements**

- A code block can be opened in a full-screen or expanded view. (source: S21.08 brief)
- Dialog has its own focus region so keyboard users can scroll it. (source: CodeBlock.tsx:268-273)

**Acceptance criteria**

1. Clicking 'Expand code' opens a large overlay showing the same code.
2. Overlay has Copy, download and 'Close expanded code'.
3. Escape closes it and focus returns to the page [inferred from Radix dialog; verify].
4. The code region is reachable by Tab and scrolls with arrow keys.
5. On mobile the Expand button is absent while streaming.
6. Closing the dialog leaves the chat scroll position unchanged [proposed to verify].

**Inferred requirements** (not stated anywhere; reasoned from the code or from competitor parity)

- Escape closing comes from the shared Dialog component, not CodeBlock itself [inferred].

**Proposed improvements** (suggestions, not requirements)

- [proposed] Colour diff lines inside the expanded view.
- [proposed] Hide Expand during streaming on web as mobile does, or document why not.

## 5. Implementation map

| Kind | Name | Path | Role |
|---|---|---|---|
| component | FencedCodeBlock expanded Dialog | `packages/ui/unified-chat/src/components/markdown/CodeBlock.tsx` | Expand button, dialog, header and scroll region. |
| component | Dialog, DialogContent, DialogClose, DialogTitle | `packages/ui (exported from @agiworkforce/ui)` | Shared dialog primitives; exact file not opened; unknown. |
| component | HighlightedCode | `packages/ui/unified-chat/src/components/markdown/HighlightedCode.tsx` | Code body inside the dialog. |
| config | codeBlock.css | `packages/ui/unified-chat/src/components/markdown/codeBlock.css` | Header bar and body styles shared with the dialog. |
| component | CodeCard expand | `apps/mobile/src/features/chat/components/CodeCard.tsx` | Expand button and CodeFullScreen use. |
| component | CodeFullScreen | `apps/mobile/src/features/chat/components/CodeFullScreen.tsx` | Mobile full-screen sheet. |
| hook | useFullScreenChrome | `apps/mobile/src/features/chat/chrome/fullScreenChrome.ts` | Touch target size and close handling; path inferred from import. |
| test | CodeBlock tests | `packages/ui/unified-chat/src/components/markdown/__tests__/CodeBlock.test.tsx` | Header and copy tests; no dialog test found. |
| test | MarkdownContent render test | `packages/ui/unified-chat/src/components/markdown/MarkdownContent.render.test.tsx` | Asserts Expand code button exists. |
| component | MessageBubble mobile capCodeBlocks | `apps/mobile/src/features/chat/components/MessageBubble.tsx` | Passes capCodeBlocks: true at line 2116 so the card gets expand and cap. |
| component | MarkdownPre | `packages/ui/unified-chat/src/components/markdown/MarkdownContent.tsx` | Chooses which fences become CodeBlock. |
| service | useUiTranslation labels | `packages/ui (translations for markdown.expand, markdown.close, markdown.codeTitle)` | Visible label text with English defaults in CodeBlock.tsx:129-132. |

## 6. Execution and data flow

| Step | Runs on | Source |
|---|---|---|
| Click sets local state expanded=true. | device | CodeBlock.tsx:82,199 |
| Dialog renders the same code through HighlightedCode. | device | CodeBlock.tsx:274 |
| Closing sets expanded=false via Dialog onOpenChange or DialogClose. | device | CodeBlock.tsx:240,254 |

**Data**

| What | Stored in | Synced | Kept or deleted |
|---|---|---|---|
| expanded flag | component state only | no | lost on unmount |

**Models and providers.** No model or provider involved.

## 7. Access and usage rules

| Rule | What the code does |
|---|---|
| Account | none found in the code. |
| Permissions | none found in the code. |
| Subscription | none found in the code. |
| Limits and metering | none found in the code. |
| Feature flags | Mobile cap and expand depend on the capCodeBlocks option (MessageBubble.tsx:2116). No feature flag found for web. |
| Model compatibility | Independent of the model. |
| Provider restrictions | none found in the code. |
| Local mode | Fully local UI; same in all modes. |

## 8. States and edge cases

| State | Behaviour | Source |
|---|---|---|
| Streaming block, web | Dialog opens with code so far, uncoloured. | CodeBlock.tsx:166-173,199 |
| Keyboard use | Scroll region has tabIndex 0 and a visible focus ring. | CodeBlock.tsx:269-273 |
| Touch devices | Buttons 44 px high. | CodeBlock.tsx:65,69 |
| Mobile streaming | No Expand button. | CodeCard.tsx:537-546 |
| Dialog without description | aria-describedby is explicitly undefined. | CodeBlock.tsx:244 |
| Offline, timeout, retry | not handled in the code; not applicable to a local overlay. | searched CodeBlock.tsx dialog section; no network or retry logic |

## 9. Verification

What has actually been seen by a person is in the Status table above. This section lists what exists to check with.

**Existing tests**

- `packages/ui/unified-chat/src/components/markdown/MarkdownContent.render.test.tsx`: Presence of the 'Expand code' button.
- `apps/mobile/src/features/chat/components/__tests__/MessageContentRenderer.codeCardActions.test.tsx`: Mobile code card actions (title level; expand coverage not confirmed).

**Test scenarios**

- **Open and close with keyboard**
  1. Tab to Expand code and press Enter.
  2. Press Escape.
  - Expected: Dialog opens then closes; focus returns to the Expand button.
- **Copy from dialog**
  1. Open dialog.
  2. Click Copy.
  - Expected: 'Copied' shows; clipboard has the code.
- **Expand while streaming**
  1. Start a long code reply.
  2. Click Expand before the closing fence.
  - Expected: Dialog shows partial plain text; no crash.
- **Diff in dialog**
  1. Expand a diff block.
  - Expected: Observe whether lines are coloured (code suggests not).
- **Mobile expand**
  1. Open a finished block on mobile.
  2. Tap Expand code.
  - Expected: Full-screen sheet with download and copy.

**Where to look when it fails**

- No log lines tied to this feature; check browser console for dialog errors.

**Hands-on test plans**

- Web: [70-qa/test-plans/web/021-code-blocks-and-executable-code-presentation.md](../../70-qa/test-plans/web/021-code-blocks-and-executable-code-presentation.md)
- Desktop: [70-qa/test-plans/desktop/021-code-blocks-and-executable-code-presentation.md](../../70-qa/test-plans/desktop/021-code-blocks-and-executable-code-presentation.md)

## 10. Gaps and dependencies

- **No test opens the dialog on web.** Affects: Web, Desktop. Evidence: CodeBlock.test.tsx titles list no expand case. Work needed: Add a dialog open, close and focus test.
- **Diff blocks are not coloured in the expanded view.** Affects: Web, Desktop. Evidence: CodeBlock.tsx:274 renders only highlighted. Work needed: Render DiffLines in the dialog when language is diff.
- **CLI, VS Code and Chrome have no expanded view.** Affects: those apps. Evidence: brief S21.08. Work needed: Decide if needed for terminal and panel surfaces.
- Not built on: CLI, VS Code, Chrome (from the capability ledger).

**Depends on**

- surface:web
- surface:desktop
- surface:mobile
- SYS-shared-ui-and-design
- F021-01
- F021-02
- file:packages/ui/unified-chat/src/components/markdown/CodeBlock.tsx

## Unknown

- Whether Escape and focus return work as expected (relies on shared Dialog not opened).
- Whether Tauri desktop renders this dialog.
- Whether mobile Expand tests exist beyond title-level evidence.
