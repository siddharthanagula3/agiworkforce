---
id: "F007-05"
type: "feature"
title: "Composer at the bottom, growing and full-screen editing"
aliases: ["Persistent bottom composer", "Composer expansion for long prompts", "Full-screen editor", "Scrollable transcript independent from side panels", "S7.15", "S7.20", "S7.21", "S7.22"]
area: "7 Layout systems"
available_on: ["web", "desktop", "mobile", "cli", "vscode", "chrome"]
implementation: {web: "built", desktop: "built", mobile: "built", cli: "built", vscode: "built", chrome: "built"}
verification: {web: "partly seen (1 of 4)", desktop: "not seen by a person", mobile: "not seen by a person", cli: "not seen by a person", vscode: "not seen by a person", chrome: "not seen by a person"}
requirement_items: ["S7.15", "S7.20", "S7.21", "S7.22"]
depends_on: ["surface:web", "surface:desktop", "surface:mobile", "surface:cli", "surface:vscode", "surface:chrome", "SYS-chat-turn-pipeline", "SYS-voice-and-media", "file:apps/web/features/chat/components/Composer/ChatComposerNew.tsx", "file:apps/mobile/src/features/chat/components/ChatInput.tsx"]
basis: "code inspection"
second_reader: "not sampled: statements are code readings that nobody has re-checked"
last_reviewed: "2026-11-24"
revision: "f51d16e747"
---
# F007-05 Composer at the bottom, growing and full-screen editing

The message box stays at the bottom while the transcript scrolls in its own area. The box grows with long text up to a limit. Web expands it in place (not full screen), mobile opens a true full-screen editor, the CLI hands the draft to an external editor, and VS Code and Chrome only grow the box to a set height.

Area: [7. Layout systems](README.md). Requirement items: [S7.15](../../10-requirements/capabilities/007-layout-systems.md#s715), [S7.20](../../10-requirements/capabilities/007-layout-systems.md#s720), [S7.21](../../10-requirements/capabilities/007-layout-systems.md#s721), [S7.22](../../10-requirements/capabilities/007-layout-systems.md#s722).

## Status

Two separate questions: is the code there, and has a person seen it work. "Seen working" comes only from results of real runs recorded in the project's ledger.

| App | In the code: this page's reading, 2026-11-24 | In the code: ledger audit, 2026-09-26 and later updates | Seen working by a person |
|---|---|---|---|
| Web | partly built (this page lists unfinished parts) | built | partly seen (1 of 4) |
| Desktop | partly built (this page lists unfinished parts) | built | not seen by a person |
| Mobile | built | built | not seen by a person |
| CLI | partly built (this page lists unfinished parts) | built | not seen by a person |
| VS Code | partly built (this page lists unfinished parts) | built | not seen by a person |
| Chrome | partly built (this page lists unfinished parts) | built | not seen by a person |

The first column was derived from this page's text by a second, cheaper pass and has not been validated item by item; the ledger column is the project's own record. Neither is a test result.

## 1. Purpose and user value

**What it does.** Keeps typing controls always reachable, grows the input for long prompts, and offers a larger way to edit a long draft without losing the text.

**Why it exists.** Long prompts and pasted text need room, and a composer that scrolls away or hides is unusable. The contract requires a sticky composer and independent transcript scroll (doc: docs/product/experience-contract.md:184, doc: docs/product/experience-contract.md:511).

**Who uses it.** Everyone who writes messages, especially people pasting long text or code.

**Problems it solves**

- Composer scrolling off screen.
- A one-line box for a ten-paragraph prompt.
- Losing a long draft when changing editors.

**Use cases**

- Paste a long document into the composer and see the box grow.
- Scroll up through history while the composer stays put.
- Open the larger editor on a phone to write a long prompt.
- Press Ctrl-E in the CLI to edit a draft in the user's editor.

## 2. User experience

**Where to find it**

- Web and Desktop: the composer at the bottom of the chat; an expand button labelled 'Expand message input' (becomes 'Collapse message input') appears once text is taller than 120 pixels (apps/web/features/chat/components/Composer/ChatComposerNew.tsx:666, apps/web/features/chat/components/Composer/ChatComposerNew.tsx:4720).
- Mobile: composer at the bottom; an expand button labelled 'Expand message' appears once text wraps past about 1.5 lines (apps/mobile/src/features/chat/components/ChatInput.tsx:150, apps/mobile/src/features/chat/components/ChatInput.tsx:2149).
- CLI: composer box above the status bar; Ctrl-E or Ctrl-G opens the external editor (apps/cli/src/tui/composer_edits.rs:102).
- VS Code: composer card in the chat view (apps/extension-vscode/src/features/sidebar-webview/webviewContent.ts:1062).
- Chrome: input #sp-input in the side panel (apps/extension/src/side_panel.ts:3853).

**Before you start**

- A chat open. External editor in the CLI needs VISUAL or EDITOR set, otherwise 'vi' is tried (apps/cli/src/tui/composer_edits.rs:140).

**Screens and controls**

- Web expand button with aria-expanded; Escape collapses it when no menu is open (apps/web/features/chat/components/Composer/ChatComposerNew.tsx:4703).
- Mobile full-screen editor: control 'Collapse editor'; it has its own send button (apps/mobile/src/features/chat/components/ComposerFullScreenEditor.tsx:43).
- Web character counter shows near the limit (apps/web/features/chat/components/Composer/ChatComposerNew.tsx:294).

**Journey**

1. Type or paste text.
2. The box grows line by line to its limit, then scrolls inside.
3. Web: choose expand to make the box about 60 percent of the window height; Escape or the button collapses it.
4. Mobile: tap expand for the full-screen editor; edit; tap 'Collapse editor' to return with the text kept, or send from the editor.
5. CLI: press Ctrl-E, edit in the editor, save and quit; the text returns to the composer.

**What the person sees and gets**

- The CLI shows a status notice if the editor fails (apps/cli/src/tui/tui_app.rs:7312).
- Character counter on web with 'limit reached' text.

**Settings**

- Web composer rich editor can be chosen by a query parameter or build default (apps/web/features/chat/components/Composer/__tests__/ComposerInput.test.tsx:75). VS Code: none found.

## 3. Current implementation

From reading the code. Not a test result.

**Working in the code**

- Web composer container is sticky at the bottom on small screens and static beneath the scroll area on wide ones (apps/web/features/chat/components/Composer/ChatComposerNew.tsx:4881); the transcript is a separate log region (apps/web/features/chat/components/messages/ChatMessageList.tsx:2112).
- Web input grows to 240 pixels (apps/web/features/chat/components/Composer/ChatComposerNew.tsx:665, apps/web/features/chat/components/Composer/ChatComposerNew.tsx:2461), then scrolls; expanded height is min(60dvh, 40rem) (apps/web/features/chat/components/Composer/ComposerInput.tsx:54).
- Mobile input has a maximum height of 160 points (apps/mobile/src/features/chat/components/ChatInput.tsx:2107); the full-screen editor is a modal over the whole screen whose text state lives in the composer, so the text is kept (apps/mobile/src/features/chat/components/ChatInput.tsx:2399, apps/mobile/src/features/chat/components/ComposerFullScreenEditor.tsx:60).
- CLI input height is 2 border rows plus 1 to 8 content rows (apps/cli/src/tui/tui_app.rs:1995, apps/cli/src/tui/tui_app.rs:3309) as its own layout row beneath the chat (apps/cli/src/tui/tui_app.rs:2003); external editor writes a temp file, runs the editor and reads it back (apps/cli/src/tui/composer_edits.rs:140, apps/cli/src/tui/tui_app.rs:7300).
- VS Code: #messages is its own scroll area and the input grows to 140px (apps/extension-vscode/src/features/sidebar-webview/webviewContent.ts:592, apps/extension-vscode/src/features/sidebar-webview/webviewContent.ts:1086).
- Chrome: #sp-input grows between 52 and 120 pixels (apps/extension/src/side_panel.ts:3864).

**Incomplete**

- Web 'expand' is an in-place taller box, not a full-screen editor (apps/web/features/chat/components/Composer/ComposerInput.tsx:54). The brief lists a full-screen editor as done on web (doc: knowledge-base/data/area-briefs/007-layout-systems.md).
- CLI editing leaves the TUI and uses the user's editor; there is no in-app full-screen editor.
- VS Code: no dedicated expand control found; 'Open Chat in Editor' gives a larger surface (apps/extension-vscode/package.json:93). The brief marks VS Code full-screen editor done; I did not establish which code it means.

**Present but disconnected or switched off**

- Nothing disconnected or switched off was found for this feature.

**Not available**

- Full-screen editor on Chrome (brief: not listed; none found).

## 4. Required behaviour

**Established requirements**

- The composer stays anchored at the bottom while the transcript scrolls above it (S7.20). (source: capability ledger `audit/ledger/ecosystem-capability-ledger.jsonl`, item S7.20)
- The composer grows or opens a larger editor as a long prompt is typed (S7.21). (source: capability ledger `audit/ledger/ecosystem-capability-ledger.jsonl`, item S7.21)
- An editor can take over the whole screen for focused editing and return to the chat (S7.15). (source: capability ledger `audit/ledger/ecosystem-capability-ledger.jsonl`, item S7.15)
- The transcript scrolls in its own region without moving side panels, header or composer (S7.22). (source: capability ledger `audit/ledger/ecosystem-capability-ledger.jsonl`, item S7.22)
- Viewer contract: independent transcript and viewer scroll. (source: doc: docs/product/experience-contract.md:511)

**Acceptance criteria**

1. Scroll a 200-message chat: header and composer do not move on any app.
2. Type 20 lines on web: box grows to 240 pixels then scrolls inside.
3. On web, expand makes the box taller and Escape returns it with the text intact.
4. On mobile, expand opens a full-screen editor; collapsing keeps every character.
5. In the CLI, Ctrl-E opens the editor; saving returns the text; a failing editor shows a notice and keeps the draft.
6. In the CLI the composer never exceeds 8 content rows.
7. With the on-screen keyboard open the composer stays visible.

**Inferred requirements** (not stated anywhere; reasoned from the code or from competitor parity)

- Web expand was intended as the 'larger editor' option in S7.21 and may not satisfy S7.15 fully [inferred].
- Growth limits differ per app by design: 240 web, 160 mobile, 8 rows CLI, 140 VS Code, 120 Chrome [inferred from constants].

**Proposed improvements** (suggestions, not requirements)

- [proposed] Either call the web control 'taller input' in the brief or build a true full-screen web editor.
- [proposed] Add a test for the CLI row clamp and external editor failure.
- [proposed] Document the VS Code editor path.

## 5. Implementation map

| Kind | Name | Path | Role |
|---|---|---|---|
| component | ChatComposerNew | `apps/web/features/chat/components/Composer/ChatComposerNew.tsx` | Web composer: height limits, expand state, keyboard lift, sticky container. |
| component | ComposerInput | `apps/web/features/chat/components/Composer/ComposerInput.tsx` | Resting and expanded height classes for the textarea and rich editor. |
| component | ChatMessageList | `apps/web/features/chat/components/messages/ChatMessageList.tsx` | Independent transcript region. |
| screen | WebChatPage layout | `apps/web/features/chat/pages/WebChatPage.tsx` | Places transcript above and composer below (lines 7700-7830). |
| component | ChatInput (mobile) | `apps/mobile/src/features/chat/components/ChatInput.tsx` | Mobile composer, growth limit, expand button. |
| component | ComposerFullScreenEditor | `apps/mobile/src/features/chat/components/ComposerFullScreenEditor.tsx` | Full-screen modal editor with send. |
| component | MessageList (mobile) | `apps/mobile/src/features/chat/components/MessageList.tsx` | Independent scrolling transcript. |
| hook | useKeyboardSafeComposer | `apps/mobile/src/features/chat/chrome/keyboardSafeComposer.ts` | Keeps composer above the keyboard. |
| config | MAX_INPUT_LINES | `apps/mobile/lib/constants.ts` | Line limit constant of 6 (line 25). |
| screen | TUI input area | `apps/cli/src/tui/tui_app.rs` | input_height, composer_content_rows, render_input, OpenEditor handler. |
| service | composer_edits | `apps/cli/src/tui/composer_edits.rs` | External editor key and launch. |
| component | VS Code webview content | `apps/extension-vscode/src/features/sidebar-webview/webviewContent.ts` | #messages and #userInput styling. |
| component | Chrome side panel input | `apps/extension/src/side_panel.ts` | #sp-input sizing. |
| test | ComposerFullscreenEditor test | `apps/mobile/__tests__/ComposerFullscreenEditor.test.tsx` | Full-screen editor behaviour. |
| test | ComposerInput test | `apps/web/features/chat/components/Composer/__tests__/ComposerInput.test.tsx` | Textarea and rich editor arms, resting height. |
| test | soft-keyboard-inset test | `apps/web/features/chat/components/Composer/__tests__/soft-keyboard-inset.test.ts` | Composer lift with keyboard. |

## 6. Execution and data flow

| Step | Runs on | Source |
|---|---|---|
| Each keystroke updates the draft; an effect measures the field height and clamps it to the limit. | device | (apps/web/features/chat/components/Composer/ChatComposerNew.tsx:2461) |
| Expand toggles a state that switches the height class. | device | (apps/web/features/chat/components/Composer/ChatComposerNew.tsx:4703) |
| Mobile modal mirrors the composer text and reports every edit upward; send runs the composer's send path. | device | (apps/mobile/src/features/chat/components/ChatInput.tsx:2399) |
| CLI restores the terminal, runs the external editor on a temp file, then re-enters the TUI and removes the file. | device | (apps/cli/src/tui/composer_edits.rs:140, apps/cli/src/tui/tui_app.rs:7300) |
| Sending the message goes to the chat turn pipeline (not part of this feature). | device and our servers | (apps/web/features/chat/pages/WebChatPage.tsx:7670) onSend handler; pipeline not read here |

**Data**

| What | Stored in | Synced | Kept or deleted |
|---|---|---|---|
| Draft text | Component state in memory; CLI temp file agi-prompt-<id>.md during editing | no | CLI temp file removed after reading (apps/cli/src/tui/composer_edits.rs:140); web or mobile draft persistence not read: unknown |

**Models and providers.** Layout is model independent. The web message length cap is a managed-cloud constant (apps/web/features/chat/components/Composer/ChatComposerNew.tsx:294).

## 7. Access and usage rules

| Rule | What the code does |
|---|---|
| Account | none found in the code for the layout |
| Permissions | CLI external editor runs the program named in VISUAL or EDITOR with the user's rights (apps/cli/src/tui/composer_edits.rs:140). |
| Subscription | none found in the code for the layout; usage blocks disable sending elsewhere (apps/web/features/chat/pages/WebChatPage.tsx:7798). |
| Limits and metering | Web character cap from a managed-cloud constant (apps/web/features/chat/components/Composer/ChatComposerNew.tsx:294); whether it applies in Local mode is unknown. |
| Feature flags | Rich editor arm chosen by query parameter or build default (apps/web/features/chat/components/Composer/__tests__/ComposerInput.test.tsx:75). |
| Model compatibility | none found in the code |
| Provider restrictions | none found in the code |
| Local mode | Composer layout is identical in Local mode; the length cap in Local mode is unknown. |

## 8. States and edge cases

| State | Behaviour | Source |
|---|---|---|
| Empty field | Web holds a stable one-line height without measuring. | (apps/web/features/chat/components/Composer/ChatComposerNew.tsx:2451) |
| Escape with a menu open | Menus close first; the editor stays expanded. | (apps/web/features/chat/components/Composer/ChatComposerNew.tsx:4703) |
| Mobile editor while dictating or effort panel open | Expand button hidden. | (apps/mobile/src/features/chat/components/ChatInput.tsx:1523) |
| Editor not found or exits with error (CLI) | Status notice, draft kept. | (apps/cli/src/tui/tui_app.rs:7312, apps/cli/src/tui/composer_edits.rs:140) |
| Mobile screen blur | The full-screen editor closes when the screen loses focus. | (apps/mobile/src/features/chat/components/ComposerFullScreenEditor.tsx:60) |
| Touch targets | Web expand button grows to 44 pixels on coarse pointers. | (apps/web/features/chat/components/Composer/ChatComposerNew.tsx:5901) |
| Offline, timeout | not handled in the layout code | Composer sizing code contains no network logic (apps/web/features/chat/components/Composer/ChatComposerNew.tsx:2461) |

## 9. Verification

What has actually been seen by a person is in the Status table above. This section lists what exists to check with.

**Existing tests**

- `apps/mobile/__tests__/ComposerFullscreenEditor.test.tsx`: Closed renders nothing, shows whole text, owns no text state, collapse without sending, send state, disabled send.
- `apps/web/features/chat/components/Composer/__tests__/ComposerInput.test.tsx`: Textarea and editor arms, accessible contract, shorter resting row on small screens.
- `apps/web/features/chat/components/Composer/__tests__/soft-keyboard-inset.test.ts`: Keyboard inset and composer lift.
- `apps/mobile/__tests__/ChatInput.test.tsx`: Mobile composer (detail not read).
- `apps/extension-vscode/src/__tests__/editorUtilityDraft.webview.test.ts`: VS Code editor utility draft (detail not read).

**Test scenarios**

- **Growth limit**
  1. Paste 40 lines into the web composer.
  - Expected: Height stops at 240 pixels and the text scrolls inside.
- **Web expand**
  1. Type enough for the expand button.
  2. Click it, then press Escape.
  - Expected: Box grows to about 60 percent of the window, then returns with the text.
- **Mobile full-screen editor**
  1. Type three lines.
  2. Tap 'Expand message'.
  3. Tap 'Collapse editor'.
  - Expected: Text is identical after returning.
- **CLI editor**
  1. Set EDITOR to a known editor.
  2. Type a draft and press Ctrl-E, edit, save.
  - Expected: Edited text appears in the composer.
- **Independent scroll**
  1. Open a long chat with a panel open.
  2. Scroll the transcript.
  - Expected: Header, composer and panel stay fixed.

**Where to look when it fails**

- CLI status notice shows the editor error text.
- No named errors for web or mobile.

**Hands-on test plans**

- Web: [70-qa/test-plans/web/007-layout-systems.md](../../70-qa/test-plans/web/007-layout-systems.md)
- Desktop: [70-qa/test-plans/desktop/007-layout-systems.md](../../70-qa/test-plans/desktop/007-layout-systems.md)
- Mobile: [70-qa/test-plans/mobile/007-layout-systems.md](../../70-qa/test-plans/mobile/007-layout-systems.md)
- CLI: [70-qa/test-plans/cli/007-layout-systems.md](../../70-qa/test-plans/cli/007-layout-systems.md)
- VS Code: [70-qa/test-plans/vscode/007-layout-systems.md](../../70-qa/test-plans/vscode/007-layout-systems.md)
- Chrome: [70-qa/test-plans/chrome/007-layout-systems.md](../../70-qa/test-plans/chrome/007-layout-systems.md)

## 10. Gaps and dependencies

- **Web has no true full-screen editor.** Affects: Web and Desktop. Evidence: (apps/web/features/chat/components/Composer/ComposerInput.tsx:54). Work needed: Build one or change the requirement.
- **CLI full-screen editing leaves the TUI.** Affects: CLI. Evidence: (apps/cli/src/tui/composer_edits.rs:140). Work needed: Accept as the CLI form or build an in-TUI editor.
- **VS Code editor path unclear.** Affects: VS Code. Evidence: (apps/extension-vscode/package.json:93). Work needed: Confirm and document.
- **No CLI test found for row clamp or editor errors by name.** Affects: CLI. Evidence: search of tui_app.rs test names. Work needed: Add tests.
- **Chrome transcript scroll container not verified.** Affects: Chrome. Evidence: not read. Work needed: Read and test.

**Depends on**

- surface:web
- surface:desktop
- surface:mobile
- surface:cli
- surface:vscode
- surface:chrome
- SYS-chat-turn-pipeline
- SYS-voice-and-media
- file:apps/web/features/chat/components/Composer/ChatComposerNew.tsx
- file:apps/mobile/src/features/chat/components/ChatInput.tsx

## Unknown

- Where the web and mobile drafts are persisted across restarts.
- Which VS Code code path the brief calls the full-screen editor.
- Chrome transcript scroll container and composer growth behaviour beyond CSS limits.
- Whether the web character cap applies in Local mode.
- Exact mobile expand threshold behaviour on real devices.
