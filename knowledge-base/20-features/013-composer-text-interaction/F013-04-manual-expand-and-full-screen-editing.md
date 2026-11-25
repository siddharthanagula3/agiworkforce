---
id: "F013-04"
type: "feature"
title: "Manual expand and full-screen editing"
aliases: ["Expand message input", "Collapse message input", "Expand message", "Collapse editor", "Expanded message input", "External editor", "Full-screen prompt editing", "Manual expansion", "S13.04", "S13.05"]
area: "13 Composer text interaction"
available_on: ["web", "desktop", "mobile", "cli"]
implementation: {web: "built", desktop: "built", mobile: "built", cli: "partial", vscode: "missing", chrome: "missing"}
verification: {web: "not seen by a person", desktop: "not seen by a person", mobile: "not seen by a person", cli: "not seen by a person", vscode: "n/a", chrome: "n/a"}
requirement_items: ["S13.04", "S13.05"]
depends_on: ["surface:web", "surface:desktop", "surface:mobile", "surface:cli", "mode:local", "mode:own-key", "mode:cloud", "SYS-shared-ui-and-design", "F013-01", "F013-05"]
basis: "code inspection"
second_reader: "not sampled: statements are code readings that nobody has re-checked"
last_reviewed: "2026-11-24"
revision: "f51d16e747"
---
# F013-04 Manual expand and full-screen editing

A control to enlarge the message box beyond its automatic height. Web and Desktop have an expand arrow (taller box, up to 60% of the window or 40rem). Mobile opens a full-screen editor with its own Send. The CLI opens your text editor with Ctrl+E or Ctrl+G. VS Code and Chrome have none.

Area: [13. Composer text interaction](README.md). Requirement items: [S13.04](../../10-requirements/capabilities/013-composer-text-interaction.md#s1304), [S13.05](../../10-requirements/capabilities/013-composer-text-interaction.md#s1305).

## Status

Two separate questions: is the code there, and has a person seen it work. "Seen working" comes only from results of real runs recorded in the project's ledger.

| App | In the code: this page's reading, 2026-11-24 | In the code: ledger audit, 2026-09-26 and later updates | Seen working by a person |
|---|---|---|---|
| Web | partly built (this page lists unfinished parts) | built | not seen by a person |
| Desktop | partly built (this page lists unfinished parts) | built | not seen by a person |
| Mobile | built | built | not seen by a person |
| CLI | partly built | partly built | not seen by a person |
| VS Code | not built | not built | n/a |
| Chrome | not built | not built | n/a |

The first column was derived from this page's text by a second, cheaper pass and has not been validated item by item; the ledger column is the project's own record. Neither is a test result.

## 1. Purpose and user value

**What it does.** Gives a person more room to write or review a long draft, and returns the text to the composer unchanged.

**Why it exists.** The automatic box caps its height (240px on web). Long prompts need a bigger area. The brief asks for manual enlargement and full-screen or external editing.

**Who uses it.** People writing long prompts on web, phone or terminal.

**Problems it solves**

- Reading and editing a long draft in a small box.
- Using a familiar editor for a long terminal prompt.

**Use cases**

- Click the expand arrows on web to see a long draft.
- Tap the expand icon on the phone to write in full screen.
- Press Ctrl+E in the CLI to write the prompt in your own editor.

## 2. User experience

**Where to find it**

- Web and Desktop: a small button at the top-right of the message box labelled 'Expand message input' or 'Collapse message input' (apps/web/features/chat/components/Composer/ChatComposerNew.tsx:4720-4726).
- Mobile: a Maximize glyph at the top-right of the text, label 'Expand message', hint 'Opens the message in a full-screen editor' (apps/mobile/src/features/chat/components/ChatInput.tsx:2150-2158).
- CLI: Ctrl+E or Ctrl+G (apps/cli/src/tui/composer_edits.rs:102-106).
- VS Code and Chrome: none found.

**Before you start**

- Web: shown only when the text is taller than 120px, or while expanded (ChatComposerNew.tsx:666, :2475, :4720).
- Mobile: shown when the text wraps beyond 1.5 lines and not while dictating (ChatInput.tsx:150, :1520-1533).
- CLI: composer idle (not in a running turn); an editor named in VISUAL or EDITOR, else vi (composer_edits.rs:140-147).

**Screens and controls**

- Web: toggle button with aria-expanded; Escape collapses (ChatComposerNew.tsx:4665-4672, :4708-4716).
- Mobile: modal 'Message' with a collapse button 'Collapse editor' (hint 'Returns to the chat composer, keeping the message'), text field 'Expanded message input', and a Send button (apps/mobile/src/features/chat/components/ComposerFullScreenEditor.tsx:35-40, :105-135).
- CLI: the terminal switches to your editor and back.

**Journey**

1. 1. Type until the text is long; the expand control appears (web, mobile).
2. 2. Activate it: the box becomes tall (web) or a full-screen editor opens (mobile); in the CLI press Ctrl+E.
3. 3. Edit.
4. 4. Collapse (click again, Escape on web, Collapse editor on mobile) or save and quit the editor (CLI).
5. 5. The text is the same in the composer; send as usual.

**What the person sees and gets**

- Web: the box height becomes min(60dvh, 40rem) (ComposerInput.tsx:54).
- Mobile: slide-up modal over the screen; sending from it closes it first (ChatInput.tsx:1623-1630).
- CLI: errors such as 'No editor is set; set VISUAL or EDITOR.' show as a status notice (composer_edits.rs:146; tui_app.rs:7312).

**Settings**

- CLI: environment variables VISUAL and EDITOR.
- No setting on web or mobile.

## 3. Current implementation

From reading the code. Not a test result.

**Working in the code**

- Web: composerExpanded state (ChatComposerNew.tsx:1899), expandable flag computed from content height (:2468-2476), toggle (:4703), collapse on send (:2140), classes for expanded height (ComposerInput.tsx:54, :70).
- Web: Escape collapses first, before it would stop a turn (ChatComposerNew.tsx:4665-4678).
- Mobile: handleExpandEditor opens the modal (ChatInput.tsx:1616); the modal edits the same text through handleChangeText, so large-paste conversion also applies (ChatInput.tsx:2400-2408); closes on screen blur (ComposerFullScreenEditor.tsx:40).
- CLI: Ctrl+E or Ctrl+G sets InputAction::OpenEditor (tui_app.rs:4054-4056); the loop leaves the terminal, runs the editor on a temporary file, trims trailing newlines, removes the file, and puts the text back with sanitising (tui_app.rs:7303-7312; composer_edits.rs:140-163).

**Incomplete**

- Web 'expand' is a taller in-place box, not a full-screen or external editor. The brief marks S13.05 done on web [inferred gap: capped at 60dvh or 40rem].
- CLI has an external editor but no resize (brief status partial).
- CLI external-editor key is handled in the idle composer; it is not in the in-turn draft editor (tui_app.rs:4650-4668).

**Present but disconnected or switched off**

- nothing found

**Not available**

- VS Code: no expand control found in webviewContent.ts (textarea capped at 140px, :5140).
- Chrome: no expand control found in side_panel.ts (textarea max-height 120px, :3865).

## 4. Required behaviour

**Established requirements**

- The user can manually enlarge the composer beyond its automatic height (S13.04). (source: capability ledger `audit/ledger/ecosystem-capability-ledger.jsonl`, item S13.04)
- The user can open the draft in a full-screen or external editor and return it to the composer (S13.05). (source: capability ledger `audit/ledger/ecosystem-capability-ledger.jsonl`, item S13.05)
- Expanded height on web is the smaller of 60% of screen height or 40rem; the text is kept on return; the control shows only when there is something to expand; changing chat collapses it. (source: capability ledger `audit/ledger/ecosystem-capability-ledger.jsonl`, item S13.04, S13.05)
- The composer must not resize or overlap badly on small devices. (source: doc: docs/product/requirements.md (section 10.7))

**Acceptance criteria**

1. Web: type 8 lines; the expand button appears; click it; the box is taller; click again or press Escape and it returns.
2. Web: the expand button does not appear for a one-line draft.
3. Web: after sending, the box is collapsed.
4. Mobile: type a long message; the expand glyph appears; the modal shows the same text; Collapse editor returns with the text unchanged.
5. Mobile: tapping Send inside the modal closes it and sends.
6. CLI: Ctrl+E opens the editor; saving returns the edited text to the composer.

**Inferred requirements** (not stated anywhere; reasoned from the code or from competitor parity)

- Changing chat should collapse the web box: a collapse happens at a draft-owner change (ChatComposerNew.tsx:4153) [inferred, not tested].

**Proposed improvements** (suggestions, not requirements)

- [proposed] Add an expand control (or open-in-editor) to VS Code and Chrome.
- [proposed] Decide whether web needs a true full-screen editor, as the brief wording says.

## 5. Implementation map

| Kind | Name | Path | Role |
|---|---|---|---|
| component | ChatComposerNew expand logic | `apps/web/features/chat/components/Composer/ChatComposerNew.tsx` | State (:1899), threshold (:666), expandable effect (:2468), toggle (:4703), Escape (:4665). |
| component | ComposerInput | `apps/web/features/chat/components/Composer/ComposerInput.tsx` | Expanded height classes for textarea (:54) and editor (:70-71). |
| component | ChatInput (mobile) | `apps/mobile/src/features/chat/components/ChatInput.tsx` | Expand glyph (:2150), handleExpandEditor (:1616), handleExpandedSend (:1623), modal mount (:2400). |
| component | ComposerFullScreenEditor | `apps/mobile/src/features/chat/components/ComposerFullScreenEditor.tsx` | Full-screen modal with collapse, text field and send. |
| hook | useFullScreenChrome | `apps/mobile/src/features/chat/chrome/fullScreenChrome.ts` | Back/close controls and request-close handling for the modal (imported at ComposerFullScreenEditor.tsx:12). |
| hook | useKeyboardSafeComposer | `apps/mobile/src/features/chat/chrome/keyboardSafeComposer.ts` | Keyboard avoidance for the modal (imported at ComposerFullScreenEditor.tsx:13). |
| hook | useDismissOnScreenBlur | `apps/mobile/src/features/artifacts/useDismissOnScreenBlur.ts` | Closes the modal when the screen loses focus. |
| service | external editor launcher | `apps/cli/src/tui/composer_edits.rs` | edit_in_external_editor (:140) and key matcher (:102). |
| component | TUI editor action | `apps/cli/src/tui/tui_app.rs` | OpenEditor action (:4054) and handler (:7303). |
| config | constants | `apps/mobile/lib/constants.ts` | MAX_INPUT_LINES (:25) used by the inline field. |
| test | mobile fullscreen test | `apps/mobile/__tests__/ComposerFullscreenEditor.test.tsx` | Modal behaviour (closed renders nothing, text whole, collapse without send, send disabled when empty, stop while streaming). |
| test | web e2e geometry | `apps/web/e2e/composer-resting-geometry.spec.ts` | Resting height only; no expand case found. |

## 6. Execution and data flow

| Step | Runs on | Source |
|---|---|---|
| Web measures the box content height and sets the expandable flag when above 120px. | device | ChatComposerNew.tsx:2468-2476 |
| Toggle flips composerExpanded and refocuses the box. | device | ChatComposerNew.tsx:4703-4706 |
| Mobile opens the modal bound to the same text state; edits flow through handleChangeText. | device | ChatInput.tsx:1616, :2400-2408 |
| CLI writes the draft to a temporary file, starts the editor and reads the file back. | device | composer_edits.rs:148-157 |

**Data**

| What | Stored in | Synced | Kept or deleted |
|---|---|---|---|
| Draft text | Same composer state as typing; CLI also a temp file agi-prompt-<id>.md | No special sync | Temp file removed after edit (composer_edits.rs:157) |

**Models and providers.** None: no model or provider is involved.

## 7. Access and usage rules

| Rule | What the code does |
|---|---|
| Account | none found in the code. |
| Permissions | CLI starts an external program from VISUAL or EDITOR (composer_edits.rs:141-148). |
| Subscription | none found in the code. |
| Limits and metering | none found in the code. |
| Feature flags | Web: none for the control. Mobile: none found. |
| Model compatibility | none found in the code. |
| Provider restrictions | none found in the code. |
| Local mode | Works fully on the device with no sign-in or plan in all modes. |

## 8. States and edge cases

| State | Behaviour | Source |
|---|---|---|
| Empty or short draft | Web control hidden when text is empty or short. | ChatComposerNew.tsx:2468-2476 |
| Menu open | Escape closes the menu first and does not collapse. | ChatComposerNew.tsx:4662-4672, :4708-4714 |
| Streaming | Escape collapses first; second Escape stops the turn. | ChatComposerNew.tsx:4665-4678 |
| Dictating on mobile | Expand glyph hidden while recording or transcribing. | ChatInput.tsx:1533 |
| Editor fails (CLI) | Status notice and draft unchanged. | tui_app.rs:7312-7314 |
| Editor exits unsaved (CLI) | Error 'exited without saving the prompt'. | composer_edits.rs:158-161 |
| Accessibility | Web aria-expanded and labels; mobile accessibilityLabel and hint; touch target 44 on coarse pointer. | ChatComposerNew.tsx:4720-4726 (labels); ChatInput.tsx:2150-2155 |
| Offline, timeout | not handled in the code read. | searched the expand code in ChatComposerNew.tsx (:2468-2476, :4703-4716) and ComposerFullScreenEditor.tsx; no offline or timeout branch found |

## 9. Verification

What has actually been seen by a person is in the Status table above. This section lists what exists to check with.

**Existing tests**

- `apps/mobile/__tests__/ComposerFullscreenEditor.test.tsx`: Renders nothing while closed, shows the text, reports edits, collapses without sending, sends without collapsing on its own, disables send when empty, mirrors Stop while streaming.

**Test scenarios**

- **Web expand**
  1. Paste 10 lines.
  2. Click 'Expand message input'.
  3. Press Escape.
  - Expected: Box grows to at most 60% of window height, then returns; text unchanged.
- **Web expand hidden**
  1. Type a short word.
  - Expected: No expand button.
- **Mobile full screen**
  1. Type a long message on the phone.
  2. Tap the expand glyph.
  3. Edit, tap Collapse editor.
  - Expected: Edits appear in the composer.
- **Mobile send from full screen**
  1. Open the editor with text.
  2. Tap Send.
  - Expected: Editor closes and the message sends.
- **CLI editor**
  1. Set EDITOR.
  2. Type text and press Ctrl+G.
  3. Save and quit.
  - Expected: Edited text returns.
- **CLI no editor**
  1. Unset VISUAL and EDITOR on a machine without vi.
  2. Press Ctrl+E.
  - Expected: Status notice with an error.

**Where to look when it fails**

- Web: aria-expanded on the expand button.
- CLI: status notice lines from composer_edits.rs errors.
- Mobile: testIDs chat.composer.expand, chat.composer.fullscreen.input, chat.composer.fullscreen.send.

**Hands-on test plans**

- Web: [70-qa/test-plans/web/013-composer-text-interaction.md](../../70-qa/test-plans/web/013-composer-text-interaction.md)
- Desktop: [70-qa/test-plans/desktop/013-composer-text-interaction.md](../../70-qa/test-plans/desktop/013-composer-text-interaction.md)
- Mobile: [70-qa/test-plans/mobile/013-composer-text-interaction.md](../../70-qa/test-plans/mobile/013-composer-text-interaction.md)
- CLI: [70-qa/test-plans/cli/013-composer-text-interaction.md](../../70-qa/test-plans/cli/013-composer-text-interaction.md)

## 10. Gaps and dependencies

- **No test found for the web expand control or the expandable threshold.** Affects: Web and Desktop testers.. Evidence: search of apps/web test and e2e files for expand control text found none. Work needed: Add a component or e2e test.
- **VS Code and Chrome have no manual expansion.** Affects: VS Code and Chrome users.. Evidence: webviewContent.ts:5140 (140px cap); side_panel.ts:3865 (120px cap). Work needed: Add an expand control or open-in-editor action.
- **Web has no full-screen editor, only a taller box.** Affects: Web and Desktop users with very long drafts.. Evidence: ComposerInput.tsx:54. Work needed: Owner decision; [inferred] from the brief wording.
- **CLI has no test for the external editor or key handling.** Affects: CLI testers.. Evidence: composer_edits.rs has no test module. Work needed: Add tests.
- Not built on: VS Code, Chrome (from the capability ledger).

**Depends on**

- surface:web
- surface:desktop
- surface:mobile
- surface:cli
- mode:local
- mode:own-key
- mode:cloud
- SYS-shared-ui-and-design
- F013-01
- F013-05

## Unknown

- Whether collapse on chat change works (only a draft-owner reset at ChatComposerNew.tsx:4153 was seen).
- Whether the full-screen modal on mobile applies the same paste conversion in every state.
- Which editors the CLI works with on Windows.
