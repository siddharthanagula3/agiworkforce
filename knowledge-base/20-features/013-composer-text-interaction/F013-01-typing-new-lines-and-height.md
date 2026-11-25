---
id: "F013-01"
type: "feature"
title: "Typing, new lines and height"
aliases: ["Plain-text entry", "Multiline entry", "Automatic height growth", "Newline shortcut", "Message input", "Chat input", "Describe a task (VS Code)", "How can I help you today? (Chrome)", "S13.01", "S13.02", "S13.03", "S13.09"]
area: "13 Composer text interaction"
available_on: ["web", "desktop", "mobile", "cli", "vscode", "chrome"]
implementation: {web: "built", desktop: "built", mobile: "built", cli: "built", vscode: "built", chrome: "built"}
verification: {web: "partly seen (1 of 4)", desktop: "not seen by a person", mobile: "not seen by a person", cli: "not seen by a person", vscode: "not seen by a person", chrome: "not seen by a person"}
requirement_items: ["S13.01", "S13.02", "S13.03", "S13.09"]
depends_on: ["surface:web", "surface:desktop", "surface:mobile", "surface:cli", "surface:vscode", "surface:chrome", "mode:local", "mode:own-key", "mode:cloud", "file:apps/web/features/chat/components/Composer/ComposerInput.tsx", "file:packages/ui/unified-chat/src/composer-editor/ComposerEditor.tsx", "SYS-shared-ui-and-design", "SYS-chat-turn-pipeline"]
basis: "code inspection"
second_reader: "not sampled: statements are code readings that nobody has re-checked"
last_reviewed: "2026-11-24"
revision: "f51d16e747"
---
# F013-01 Typing, new lines and height

The message box in every AGI Workforce app. A person types text, adds line breaks, and sees the box grow with the text up to a cap, then scroll. Line breaks are kept in the sent message. Input-method (IME) composition never sends. Web uses a plain textarea by default; a rich editor is behind a switch.

Area: [13. Composer text interaction](README.md). Requirement items: [S13.01](../../10-requirements/capabilities/013-composer-text-interaction.md#s1301), [S13.02](../../10-requirements/capabilities/013-composer-text-interaction.md#s1302), [S13.03](../../10-requirements/capabilities/013-composer-text-interaction.md#s1303), [S13.09](../../10-requirements/capabilities/013-composer-text-interaction.md#s1309).

## Status

Two separate questions: is the code there, and has a person seen it work. "Seen working" comes only from results of real runs recorded in the project's ledger.

| App | In the code: this page's reading, 2026-11-24 | In the code: ledger audit, 2026-09-26 and later updates | Seen working by a person |
|---|---|---|---|
| Web | built | built | partly seen (1 of 4) |
| Desktop | built | built | not seen by a person |
| Mobile | built | built | not seen by a person |
| CLI | built | built | not seen by a person |
| VS Code | built | built | not seen by a person |
| Chrome | built | built | not seen by a person |

The first column was derived from this page's text by a second, cheaper pass and has not been validated item by item; the ledger column is the project's own record. Neither is a test result.

## 1. Purpose and user value

**What it does.** Lets a person write a message of one or many lines in the composer of Web, Desktop (hosted web app), Mobile, CLI, VS Code and Chrome extension. The box grows as text grows, then scrolls. Enter or a Send control submits; a separate key or control adds a line.

**Why it exists.** Writing a message is the first step of every chat turn. The leaders (ChatGPT, Claude) accept multi-line text, grow the box, and never send mid-composition; the product guidance asks for this explicitly (doc: docs/product/competitive-guidance.md section 5.3, item 17).

**Who uses it.** Every person who chats, on any of the six apps. Developers use the VS Code and CLI composers; browser users use the Chrome side panel.

**Problems it solves**

- Long or structured prompts can be typed with line breaks that survive to the model.
- An accidental send while choosing an input-method candidate (Chinese, Japanese, Korean) is blocked.
- Right-to-left text (Arabic, Hebrew) lines up correctly on the web inputs.
- The box does not swallow the screen: it caps its height and scrolls.

**Use cases**

- Type a one-line question and press Enter to send it (web).
- Write a three-paragraph prompt using Shift+Enter between paragraphs, then send.
- On a phone, type a long message; Return adds lines and the arrow button sends.
- In a terminal, press Alt+Enter or Shift+Enter (or Ctrl+J where Shift+Enter never arrives) to add a line.

## 2. User experience

**Where to find it**

- Web and Desktop (Desktop shows the hosted web app, doc: AGENTS.md section 5): the message box at the bottom of a chat, labelled 'Message input' (apps/web/features/chat/components/Composer/ComposerInput.tsx:153).
- Mobile: the chat screen input labelled 'Message input' (apps/mobile/src/features/chat/components/ChatInput.tsx:2128).
- CLI: the composer line of the terminal UI (apps/cli/src/tui/tui_app.rs:3170).
- VS Code: the sidebar chat box labelled 'Chat input' with placeholder 'Describe a task…' (apps/extension-vscode/src/features/sidebar-webview/webviewContent.ts:3344).
- Chrome extension: the side-panel box labelled 'Message AGI' with the placeholder 'How can I help you today?' (apps/extension/src/side_panel.ts:14170; apps/extension/_locales/en/messages.json:211).

**Before you start**

- Web: the box is disabled when the composer is disabled, the trial is used up or a usage block is active (apps/web/features/chat/components/Composer/ChatComposerNew.tsx:4751). It stays enabled while a reply streams so a follow-up can be typed (placeholder 'Follow up' at ChatComposerNew.tsx:349).
- Chrome: sending needs a ready managed cloud chat state and a signed-in owner (apps/extension/src/side_panel.ts:9945). Typing itself is not gated in the code read.
- VS Code: the box is disabled when a runtime block is active (webviewContent.ts:5101 setStreaming sets userInput.disabled).

**Screens and controls**

- Web textarea (default) or rich editor (switch), one visible row at rest, grows to 240px (ComposerInput.tsx:53) then scrolls.
- Web keys: Enter sends, Shift+Enter adds a line (ChatComposerNew.tsx:4651 block); Cmd/Ctrl+Enter always sends.
- Mobile TextInput: Return key adds a line (returnKeyType default, blurOnSubmit false, ChatInput.tsx:2125-2126); Send arrow sends.
- CLI: Shift+Enter or Alt+Enter or Ctrl+J add a line; plain Enter sends (tui_app.rs:4072-4112).
- VS Code: Enter sends and Shift+Enter adds a line with the default setting (webviewContent.ts:5875 keydown).
- Chrome: Enter sends and Shift+Enter adds a line (side_panel.ts:14574).

**Journey**

1. 1. Click or tap the box (web, mobile, VS Code, Chrome) or start typing (CLI).
2. 2. Type text. Press the line-break key where a new line is wanted.
3. 3. Watch the box grow; past the cap it scrolls inside.
4. 4. Press Enter (or tap the Send arrow) to send. The box clears (web clearComposerState, ChatComposerNew.tsx:4146).
5. 5. If an input-method candidate list is open, Enter picks the candidate and does not send (ChatComposerNew.tsx:4579).

**What the person sees and gets**

- The box height changes live as text grows.
- Sent text appears as a user message with its line breaks kept [inferred: the same string is passed to onSend, ChatComposerNew.tsx:3905].
- Web shows a character counter near the cap (see F013-06).
- VS Code shows 'Too long to send' above 100,000 characters (webviewContent.ts:5723 sendMessage).

**Settings**

- Web editor choice: build variable NEXT_PUBLIC_COMPOSER_EDITOR, query parameter 'composer', or browser storage key 'agi.composer-editor' (apps/web/features/chat/lib/composer-editor-gate.ts:1-2; default is the textarea, :46).
- Enter-versus-newline choice is covered in F013-03.

## 3. Current implementation

From reading the code. Not a test result.

**Working in the code**

- Web textarea: rows=1, dir=auto, maxLength set to the cloud message cap, aria-label 'Message input' (ComposerInput.tsx:137-153).
- Web autosize: height is measured from scrollHeight and clamped between a resting height and 240px (ChatComposerNew.tsx:2441-2466; constant :665).
- Web rich editor: Enter submits unless composing, Shift+Enter splits the block, Mod+Enter submits (packages/ui/unified-chat/src/composer-editor/extensions/submit-keymap.ts:42-62); dir=auto on its content (composer-editor/ComposerEditor.tsx:110); max-length filter (extensions/max-length.ts:21).
- Web IME guard: handleKeyDown checks isImeComposingKey before sending (ChatComposerNew.tsx:4579, :4658).
- Mobile: multiline TextInput, numberOfLines=6 and maxHeight 160 (ChatInput.tsx:2107, :2123); MAX_INPUT_LINES=6 (apps/mobile/lib/constants.ts:25).
- CLI: multi-line composer; Shift+Enter, Alt+Enter and Ctrl+J insert a newline; plain Enter sends (tui_app.rs:4072-4112). The same keys work in the in-turn draft (tui_app.rs:4650-4665).
- VS Code: textarea grows to 140px (webviewContent.ts:5140-5143); keydown ignores composing events (webviewContent.ts:5876).
- Chrome: textarea with field-sizing content, max-height 120px rule, Enter sends, Shift+Enter keeps the default newline, composing Enter ignored (side_panel.ts:3853-3866, :4945, :14574).

**Incomplete**

- dir=auto exists only on the two web inputs; no dir attribute was found on the VS Code textarea (webviewContent.ts:3344) or the Chrome textarea (side_panel.ts:14170). Right-to-left behaviour there is unknown.
- Mobile: no maxLength on the TextInput (ChatInput.tsx:2085-2130 read); length handling happens at send for pasted blocks only (see F013-05, F013-06).
- Mobile numberOfLines is passed but the cap that is certain in the code is maxHeight 160 (ChatInput.tsx:2107). Whether six lines or 160 points is the visible cap on each platform is unknown.

**Present but disconnected or switched off**

- Web rich editor arm is off by default; the textarea is the build default (composer-editor-gate.ts:46). Turning it on needs the env variable, query parameter or stored key.

**Not available**

- No separate multi-line mode switch exists on any app: all six use the same box for one or many lines.

## 4. Required behaviour

**Established requirements**

- The user can type a plain-text message and send it (S13.01); multi-line text keeps its line breaks (S13.02). (source: capability ledger `audit/ledger/ecosystem-capability-ledger.jsonl`, item S13.01, S13.02)
- The composer grows taller automatically up to a cap, then scrolls (S13.03). A key such as Shift+Enter inserts a newline without sending (S13.09). (source: capability ledger `audit/ledger/ecosystem-capability-ledger.jsonl`, item S13.03, S13.09)
- Handle multiline input, growing height, composition events and non-Latin keyboards without accidental sends. (source: doc: docs/product/competitive-guidance.md (section 5.3, item 17))
- Mobile text input is multi-line capable, keyboard-safe, sends on explicit action, and must not resize or overlap badly on small devices. (source: doc: docs/product/requirements.md (section 10.7))

**Acceptance criteria**

1. Web: typing 'a', Shift+Enter, 'b' leaves a two-line draft and sends nothing; Enter then sends 'a\nb'.
2. Web: the box stops growing at 240px and shows a scrollbar for longer text.
3. Web: with an IME candidate list open, Enter selects the candidate and no message is sent.
4. Web: Arabic or Hebrew text in the box is right-aligned.
5. Mobile: the Return key inserts a new line and only the arrow sends.
6. CLI: Shift+Enter, Alt+Enter and Ctrl+J each add a line; Enter sends.
7. VS Code and Chrome: Shift+Enter adds a line and Enter sends with default settings.

**Inferred requirements** (not stated anywhere; reasoned from the code or from competitor parity)

- The same text must reach the model on every app with its line breaks unchanged [inferred from the shared onSend path; not verified per app].
- Right-to-left support should apply to VS Code and Chrome inputs too [inferred from the web behaviour and the brief's 'dir=auto' note].

**Proposed improvements** (suggestions, not requirements)

- [proposed] Add dir=auto to the VS Code and Chrome textareas.
- [proposed] Record in one place the height caps per app (240px web, 160 points mobile, 140px VS Code, 120px Chrome) so they can be compared against the leaders.

## 5. Implementation map

| Kind | Name | Path | Role |
|---|---|---|---|
| component | ComposerInput | `apps/web/features/chat/components/Composer/ComposerInput.tsx` | Chooses textarea or rich editor, sets height classes, dir=auto, maxLength, aria-label. |
| config | composer-editor-gate | `apps/web/features/chat/lib/composer-editor-gate.ts` | Resolves the input arm from env, query parameter or browser storage; default is the textarea. |
| component | ChatComposerNew | `apps/web/features/chat/components/Composer/ChatComposerNew.tsx` | Owns the draft, autosize effect (:2441), key handling (:4577), send (:3581) and clearing. |
| component | ComposerEditor | `packages/ui/unified-chat/src/composer-editor/ComposerEditor.tsx` | Rich editor (Tiptap): dir=auto, aria-multiline, paste and drop handlers. |
| hook | ComposerSubmitKeymap | `packages/ui/unified-chat/src/composer-editor/extensions/submit-keymap.ts` | Enter, Shift+Enter, Mod+Enter, Mod+Shift+Enter behaviour in the rich editor; skips while composing. |
| hook | ComposerMaxLength | `packages/ui/unified-chat/src/composer-editor/extensions/max-length.ts` | Blocks edits that would grow the document past the limit. |
| service | isImeComposingKey | `packages/ui/ui/src/lib/ime-composition.ts` | Shared check for input-method composition keys (used by web, extension). |
| config | MANAGED_CLOUD_CHAT_MAX_MESSAGE_LENGTH | `packages/contracts/cloud-contracts/src/conversations.ts` | The 100,000-character message cap shared by web composer and cloud contract (:19). |
| component | ChatInput (mobile) | `apps/mobile/src/features/chat/components/ChatInput.tsx` | Multiline TextInput, height rules, send logic and paste conversion on the phone. |
| config | MAX_INPUT_LINES | `apps/mobile/lib/constants.ts` | Mobile line cap constant (6). |
| component | TUI key handler | `apps/cli/src/tui/tui_app.rs` | handle_key_event (:3877) and edit_turn_draft (:4650): newline keys and Enter send in the terminal composer. |
| component | VS Code sidebar webview | `apps/extension-vscode/src/features/sidebar-webview/webviewContent.ts` | Textarea markup (:3344), autoResize (:5140), keydown (:5875), send (:5723). |
| config | MAX_SEND_MESSAGE_CHARS | `apps/extension-vscode/src/protocol/webviewMessages.ts` | VS Code send cap of 100,000 characters (:7). |
| component | Chrome side panel composer | `apps/extension/src/side_panel.ts` | Textarea (:14170), keydown (:14574), styles (:3853, :4945). |
| test | IME composition test (web) | `apps/web/features/chat/components/Composer/ChatComposerNew.imeComposition.test.tsx` | Enter during composition does not send. |
| test | Composer editor e2e | `apps/web/e2e/composer-editor.spec.ts` | Browser test: Enter sends, Shift+Enter keeps a newline, Cmd+Enter sends. |

## 6. Execution and data flow

| Step | Runs on | Source |
|---|---|---|
| The person types; the browser, phone or terminal edits the draft text in memory. | device | apps/web/features/chat/components/Composer/ChatComposerNew.tsx:2441; apps/mobile/src/features/chat/components/ChatInput.tsx:1197; apps/cli/src/tui/tui_app.rs:4072 |
| Height is recomputed from the content height (web scrollHeight, mobile content size, VS Code scrollHeight). | device | ChatComposerNew.tsx:2441-2466; ChatInput.tsx:2118-2119 (onContentSizeChange); webviewContent.ts:5140 |
| Enter (or Send) passes the draft to onSend; the web composer clears itself after the send settles. | device | ChatComposerNew.tsx:3905-3960, :4146 |
| The send handler outside this feature then routes the turn to Local, own-key or Cloud. That routing is outside this page. | device and our servers | SYS-chat-turn-pipeline; apps/web/features/chat/pages/WebChatPage.tsx:4336 area (stop path shows Cloud calls) |

**Data**

| What | Stored in | Synced | Kept or deleted |
|---|---|---|---|
| Unsent draft text | Web: in memory plus browser storage (key prefix 'agi-composer-draft', apps/web/features/chat/components/Composer/composer-draft-storage.ts:1); mobile: draft store; Chrome: session storage (side_panel.ts:10104-10111) | Web: a conversation draft sync hook exists (apps/web/features/chat/hooks/use-conversation-draft-sync.ts per the brief); details are outside this page | Cleared on send (ChatComposerNew.tsx:4146). Draft lifetime is its own area; see the brief items S13.16-S13.18. |

**Models and providers.** The text box does not call a model. The model and provider are chosen elsewhere; the composer only supplies text, so any model or provider receives the same string [inferred].

## 7. Access and usage rules

| Rule | What the code does |
|---|---|
| Account | Typing needs no account in the code read on web, mobile, CLI and VS Code. Chrome sending needs a signed-in managed cloud owner (apps/extension/src/side_panel.ts:9945). |
| Permissions | No permission prompt for typing. The web box is disabled by a usage block or exhausted trial (ChatComposerNew.tsx:4751). |
| Subscription | No plan check on typing was found. Plan limits act at send time (usage block, trial) through props (ChatComposerNew.tsx:3602-3609). |
| Limits and metering | Web caps text at 100,000 characters (ChatComposerNew.tsx:294; ComposerInput.tsx:153). VS Code refuses over 100,000 at send (webviewMessages.ts:7; webviewContent.ts:5723). Mobile has no typing cap; Chrome none found in side_panel.ts. |
| Feature flags | Web editor arm: NEXT_PUBLIC_COMPOSER_EDITOR, query 'composer', storage key 'agi.composer-editor' (composer-editor-gate.ts:1-2). VS Code settings 'agiWorkforce.composer.enterBehavior' (see F013-03). |
| Model compatibility | None found in the code: text entry does not depend on the selected model. |
| Provider restrictions | None found in the code. |
| Local mode | Typing works the same in Local mode. The web composer also computes Local-model conflicts that disable Send, not typing (ChatComposerNew.tsx:4805-4830). CLI shows 'catalog est.' for context in Local access (tui_app.rs:3517). |

## 8. States and edge cases

| State | Behaviour | Source |
|---|---|---|
| Input-method composition | Enter does not send while composing on web textarea, web editor, VS Code and Chrome. | ChatComposerNew.tsx:4579; submit-keymap.ts:41-43; webviewContent.ts:5876; side_panel.ts:14574 |
| Empty or whitespace draft | Web submit returns without sending when there is no text and no attachment; CLI Enter does nothing when the trimmed text is empty. | ChatComposerNew.tsx:3583; tui_app.rs:4083-4086 |
| Disabled composer | Web box is disabled; Send button disabled with a reason. | ChatComposerNew.tsx:4751, :4805 |
| Streaming in progress | Web and Chrome keep the box enabled so a follow-up can be typed; CLI treats Enter as queue. | ChatComposerNew.tsx:349; side_panel.ts:9899; tui_app.rs:2064-2073 |
| Offline | Web shows 'You are offline. Your draft is saved here and can be sent after you reconnect.' on a send attempt. | ChatComposerNew.tsx:717, :3588 |
| Right-to-left text | Web aligns by first strong character; other apps unknown. | ComposerInput.tsx:137; composer-editor/ComposerEditor.tsx:110 |
| Rich editor late mount | A draft written before the editor exists is replayed into it when the handle appears. | ComposerInput.tsx:160-190 |
| Timeout or retry of typing | not handled in the code read; send failures belong to the chat turn pipeline. | searched ChatComposerNew.tsx typing paths (:2441-2476, :4577-4690); no timeout or retry for typing found |

## 9. Verification

What has actually been seen by a person is in the Status table above. This section lists what exists to check with.

**Existing tests**

- `apps/web/features/chat/components/Composer/ChatComposerNew.imeComposition.test.tsx`: Enter with the IME processing keycode or isComposing does not send; the Enter after composition does.
- `apps/web/e2e/composer-editor.spec.ts`: Editor arm: Enter sends, Shift+Enter keeps a newline, Cmd/Ctrl+Enter sends; slash and mention menus own Enter.
- `apps/web/e2e/composer-editor-ime.spec.ts`: Editor arm: composition Enter picks a candidate; composition is not cut by the character cap.
- `apps/web/e2e/composer-resting-geometry.spec.ts`: An existing chat keeps the resting composer on one line.
- `apps/web/features/chat/lib/composer-editor-gate.test.ts`: Resolution of the editor arm from build default, query and storage.
- `packages/ui/unified-chat/src/composer-editor/__tests__/submit-keymap.test.ts`: Key map of the rich editor.
- `packages/ui/unified-chat/src/composer-editor/__tests__/max-length.test.ts`: Length filter of the rich editor.
- `apps/cli/src/tui/tui_app.rs`: Inline test ctrl_j_inserts_a_newline_and_ctrl_u_kills_to_line_start (:10976) and pasted_text_inserts_without_submitting (:11294).
- `apps/extension/__tests__/composer-menu-ime.test.ts`: Chrome slash and mention menus and Send defer to the input method.
- `apps/extension-vscode/src/__tests__/followUpBehavior.webview.test.ts`: VS Code Enter, Cmd/Ctrl+Enter send keys and multi-line send behaviour (:182, :210).

**Test scenarios**

- **Multi-line send on web**
  1. Open /chat signed in.
  2. Type 'first line', press Shift+Enter, type 'second line'.
  3. Press Enter.
  - Expected: One message with two lines is sent; the box is empty.
- **Height cap**
  1. Paste or type 40 short lines.
  2. Observe the box.
  - Expected: The box stops at about 240px on web and scrolls.
- **IME Enter**
  1. Enable a Japanese input method.
  2. Type a word and press Enter to confirm a candidate.
  - Expected: The candidate is chosen and nothing is sent; a second Enter sends.
- **Mobile Return key**
  1. Open a chat on the phone app.
  2. Type text and tap Return.
  - Expected: A new line is added; the message is not sent.
- **CLI newline keys**
  1. Start the terminal UI.
  2. Type text, press Alt+Enter, type more, press Ctrl+J, then Enter.
  - Expected: A three-line message is sent.
- **Right-to-left**
  1. On web type Arabic text.
  2. Repeat on VS Code and Chrome.
  - Expected: Web aligns right; record what happens on VS Code and Chrome (unknown today).

**Where to look when it fails**

- Web: browser console and the data-composer-textarea attribute (ComposerInput.tsx:136).
- Web editor arm: check URL parameter composer=editor and storage key agi.composer-editor.
- CLI: no log line; check status notice line in the footer.
- VS Code: error text 'Too long to send (N / 100,000 characters)' in the follow-up status (webviewContent.ts:5682-5689).

**Hands-on test plans**

- Web: [70-qa/test-plans/web/013-composer-text-interaction.md](../../70-qa/test-plans/web/013-composer-text-interaction.md)
- Desktop: [70-qa/test-plans/desktop/013-composer-text-interaction.md](../../70-qa/test-plans/desktop/013-composer-text-interaction.md)
- Mobile: [70-qa/test-plans/mobile/013-composer-text-interaction.md](../../70-qa/test-plans/mobile/013-composer-text-interaction.md)
- CLI: [70-qa/test-plans/cli/013-composer-text-interaction.md](../../70-qa/test-plans/cli/013-composer-text-interaction.md)
- VS Code: [70-qa/test-plans/vscode/013-composer-text-interaction.md](../../70-qa/test-plans/vscode/013-composer-text-interaction.md)
- Chrome: [70-qa/test-plans/chrome/013-composer-text-interaction.md](../../70-qa/test-plans/chrome/013-composer-text-interaction.md)

## 10. Gaps and dependencies

- **No right-to-left attribute on VS Code and Chrome inputs.** Affects: Arabic and Hebrew users on VS Code and Chrome.. Evidence: apps/extension-vscode/src/features/sidebar-webview/webviewContent.ts:3344; apps/extension/src/side_panel.ts:14170 (no dir attribute in the code read). Work needed: Add dir=auto and test with Arabic text.
- **Mobile has no typing cap and no counter; the cap is handled only for pasted blocks in Cloud mode.** Affects: Mobile users typing very long text.. Evidence: apps/mobile/src/features/chat/components/ChatInput.tsx:2085-2130; :877-888. Work needed: Decide the mobile behaviour at the cap and show feedback.
- **No test found for newline keys on mobile, VS Code Shift+Enter (default), Chrome keydown, or web autosize growth.** Affects: Testers of those apps.. Evidence: searched apps/mobile/__tests__, apps/extension/__tests__, apps/web/features/chat/components/Composer/*.test.tsx; only IME and e2e cases found. Work needed: Add unit or e2e cases.
- **Rich editor arm is off by default, so the shared editor and its tests cover a path most users do not run.** Affects: Web and Desktop.. Evidence: apps/web/features/chat/lib/composer-editor-gate.ts:46. Work needed: Owner decision on switching the default; unknown from code.

**Depends on**

- surface:web
- surface:desktop
- surface:mobile
- surface:cli
- surface:vscode
- surface:chrome
- mode:local
- mode:own-key
- mode:cloud
- file:apps/web/features/chat/components/Composer/ComposerInput.tsx
- file:packages/ui/unified-chat/src/composer-editor/ComposerEditor.tsx
- SYS-shared-ui-and-design
- SYS-chat-turn-pipeline

## Unknown

- Whether the visible cap on mobile is six lines or 160 points on each platform.
- Right-to-left behaviour on VS Code, Chrome and mobile.
- Whether sent text keeps line breaks end to end on every app (only the composer side was read).
- Server-side enforcement of the 100,000 cap was not read.
