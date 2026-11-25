---
id: "F013-05"
type: "feature"
title: "Paste handling"
aliases: ["Paste handling", "Clipboard paste", "Pasted text.txt", "Long-prompt handling", "Code-paste formatting", "Pasted text chip", "Rich-text paste", "S13.11", "S13.12", "S13.13", "S13.14"]
area: "13 Composer text interaction"
available_on: ["web", "desktop", "mobile", "cli", "vscode", "chrome"]
implementation: {web: "built", desktop: "built", mobile: "partial", cli: "partial", vscode: "partial", chrome: "partial"}
verification: {web: "not seen by a person", desktop: "not seen by a person", mobile: "not seen by a person", cli: "not seen by a person", vscode: "not seen by a person", chrome: "not seen by a person"}
requirement_items: ["S13.11", "S13.12", "S13.13", "S13.14"]
depends_on: ["surface:web", "surface:desktop", "surface:mobile", "surface:cli", "surface:vscode", "surface:chrome", "mode:local", "mode:own-key", "mode:cloud", "SYS-files-artifacts-and-storage", "SYS-api-and-contracts", "file:packages/platform/utils/src/composerPaste.ts", "F013-01", "F013-06"]
basis: "code inspection"
second_reader: "not sampled: statements are code readings that nobody has re-checked"
last_reviewed: "2026-11-24"
revision: "f51d16e747"
---
# F013-05 Paste handling

What happens when a person pastes. Files and images become attachments. Text of 10,000 characters or more becomes a file 'Pasted text.txt' (web) or a chip (mobile). Code is wrapped in a fence with an undo link (web). The CLI collapses long pastes to a placeholder. VS Code and Chrome handle files only.

Area: [13. Composer text interaction](README.md). Requirement items: [S13.11](../../10-requirements/capabilities/013-composer-text-interaction.md#s1311), [S13.12](../../10-requirements/capabilities/013-composer-text-interaction.md#s1312), [S13.13](../../10-requirements/capabilities/013-composer-text-interaction.md#s1313), [S13.14](../../10-requirements/capabilities/013-composer-text-interaction.md#s1314).

## Status

Two separate questions: is the code there, and has a person seen it work. "Seen working" comes only from results of real runs recorded in the project's ledger.

| App | In the code: this page's reading, 2026-11-24 | In the code: ledger audit, 2026-09-26 and later updates | Seen working by a person |
|---|---|---|---|
| Web | built | built | not seen by a person |
| Desktop | built | built | not seen by a person |
| Mobile | partly built | partly built | not seen by a person |
| CLI | partly built | partly built | not seen by a person |
| VS Code | partly built | partly built | not seen by a person |
| Chrome | partly built | partly built | not seen by a person |

The first column was derived from this page's text by a second, cheaper pass and has not been validated item by item; the ledger column is the project's own record. Neither is a test result.

## 1. Purpose and user value

**What it does.** Decides what a paste turns into: plain text in the box, attachments, a long-text file, or a fenced code block.

**Why it exists.** Huge pastes would flood the box and break the length cap; code needs a block; files should attach. The guidance lists drag, drop and paste with per-file validation and long prompts without accidental sends (doc: docs/product/competitive-guidance.md section 5.3, items 17 and 18).

**Who uses it.** Everyone who pastes text, screenshots or code.

**Problems it solves**

- A book-sized paste floods or freezes the box.
- Pasted code loses its layout in markdown.
- A copied image does not have to be saved as a file first.

**Use cases**

- Paste a screenshot to attach it.
- Paste 50,000 characters of a log; it becomes 'Pasted text.txt'.
- Paste a function; it is fenced with triple backticks and 'Paste as plain text' undoes it.
- In the CLI paste a long block; it shows [Pasted text #1 +N lines] and expands on send.

## 2. User experience

**Where to find it**

- Web and Desktop: paste in the message box; notices appear above the box: 'That paste was long, so it was attached as <name> instead of filling the message box.' with 'Put it back in the message'; and 'That paste looked like code, so it was wrapped in a code block.' with 'Paste as plain text' (apps/web/features/chat/components/Composer/ChatComposerNew.tsx:4942-4960, :4980-4996).
- Mobile: paste into the input; a 'Pasted text' chip appears among attachments (apps/mobile/src/features/chat/components/ChatInput.tsx:1256-1280).
- CLI: paste via the terminal; Ctrl+V pastes a clipboard image (apps/cli/src/tui/tui_app.rs:4097-4106).
- VS Code: pasted files go to the attachment strip (apps/extension-vscode/src/features/sidebar-webview/webviewContent.ts:7730).
- Chrome: pasted files and images are attached (apps/extension/src/side_panel.ts:14584).

**Before you start**

- Web: composer not disabled and trial not exhausted for the special handling (ChatComposerNew.tsx:2374).
- CLI: no reply running for collapse (tui_app.rs:4618); no overlay open (tui_app.rs:4621).
- Mobile: Cloud mode for converting oversized blocks to files at send (ChatInput.tsx:877-888).

**Screens and controls**

- Attachment chips or previews (see other areas).
- Web undo buttons for long and code pastes with dismiss buttons.
- Mobile chip actions: expand pasted text back into the box (ChatInput.tsx:1306).
- CLI placeholder token [Pasted text #N +M lines].

**Journey**

1. 1. Copy content and paste with Cmd/Ctrl+V.
2. 2. Files or images: they appear as attachments.
3. 3. Text under 10,000 characters: it lands as text; if it looks like code on web it is fenced with a notice.
4. 4. Text at or over 10,000 characters: web makes 'Pasted text.txt', mobile makes a chip.
5. 5. Use the undo link to put the text back, or send.

**What the person sees and gets**

- Web notices with undo (above).
- Mobile: chip 'Pasted text' name via pastedTextFileName (ChatInput.tsx:1273); failure alerts 'Pasted text not attached' and 'Pasted text not sent' (ChatInput.tsx:919, :1030).
- CLI footer: 'attached <label>' or the reason for an image paste (tui_app.rs:4099-4103).

**Settings**

- None found. Thresholds are constants: LARGE_PASTE_THRESHOLD 10,000 (packages/platform/utils/src/composerPaste.ts:12); CLI 800 characters or 3 lines (composer_edits.rs:4-5).

## 3. Current implementation

From reading the code. Not a test result.

**Working in the code**

- Shared policy: files first, then large text to a file, else text (packages/platform/utils/src/composerPaste.ts:131-145); file names 'Pasted text.txt', 'Pasted text 2.txt' (:30-45).
- Web textarea: handlePaste applies the decision and fences code (ChatComposerNew.tsx:2372-2400); undo for long paste (:2358-2368, :4942) and code paste (:4980-4996).
- Web rich editor: handlePaste uses the same decision and inserts the fenced block (packages/ui/unified-chat/src/composer-editor/ComposerEditor.tsx:120-137); drop of files handled (:138-143).
- Code detection: needs two or more populated lines with at least half looking like code, or one code line from HTML pre or code; JSON and text already containing a fence are skipped (composerPaste.ts:148-229).
- Mobile: a single change adding 10,000 characters or more becomes a chip and the box keeps the rest (ChatInput.tsx:1256-1286); at send in Cloud mode the largest chips become files first until the message fits (composerPaste.ts:63-90; ChatInput.tsx:877-888); in non-Cloud modes chips are joined inline (ChatInput.tsx:877-880, :990-996).
- CLI: idle paste collapses when over 800 characters or over 3 lines and expands on send (composer_edits.rs:113-128; tui_app.rs:4083, :4617-4633); text is sanitised for terminal escapes (tui_app.rs:4623); Ctrl+V adds a clipboard image (tui_app.rs:4097).
- Chrome and VS Code: files and images pasted are attached; Chrome reuses the shared file extraction (side_panel.ts:14584; apps/extension/__tests__/composer-paste-contract.test.ts:13).

**Incomplete**

- Mobile has no code fencing (brief), and file or image paste on mobile was not read (unknown).
- CLI paste during a running reply inserts raw text with no collapse (tui_app.rs:8485-8489).
- VS Code and Chrome do not convert long text to a file or fence code: their paste handlers act only on files (webviewContent.ts:7730-7745; side_panel.ts:14584-14589).
- Web: 'Pasting is blocked while the composer is disabled' is only partly true: handlePaste returns without calling preventDefault, so only the special handling is skipped (ChatComposerNew.tsx:2374).
- Rich-text normalisation on web: the textarea inserts plain text natively [inferred]; the editor schema has only document, paragraph and text nodes plus mentions (extensions/index.ts:15-24), so HTML formatting is dropped [inferred]. No test found.

**Present but disconnected or switched off**

- nothing found

**Not available**

- Code fencing on mobile, CLI, VS Code, Chrome.
- Long-text-to-file on VS Code and Chrome.

## 4. Required behaviour

**Established requirements**

- Pasting inserts text and turns pasted files and images into attachments (S13.11). (source: capability ledger `audit/ledger/ecosystem-capability-ledger.jsonl`, item S13.11)
- Pasting formatted text yields clean plain text (S13.12). (source: capability ledger `audit/ledger/ecosystem-capability-ledger.jsonl`, item S13.12)
- Pasted source code is recognised and wrapped in a code block with a way to paste as plain text (S13.13). (source: capability ledger `audit/ledger/ecosystem-capability-ledger.jsonl`, item S13.13)
- Very long input is turned into an attachment, collapsed, or clearly limited with feedback (S13.14). (source: capability ledger `audit/ledger/ecosystem-capability-ledger.jsonl`, item S13.14)
- Support drag and drop, paste and per-file validation for mixed attachments. (source: doc: docs/product/competitive-guidance.md (section 5.3, item 18))

**Acceptance criteria**

1. Web: paste a PNG; it appears as an attachment and no text is inserted.
2. Web: paste 10,000 characters; a file 'Pasted text.txt' attaches, the box stays empty, and 'Put it back in the message' restores the text.
3. Web: paste 9,999 characters of prose; they land in the box unchanged.
4. Web: paste a 5-line function; it is fenced and 'Paste as plain text' reverts it.
5. Web: paste a JSON document; it is not fenced.
6. Mobile: paste 10,000 characters; a chip appears and typed text stays.
7. CLI: paste 4 lines; the box shows [Pasted text #1 +4 lines] and Enter sends the full text.
8. Chrome: paste an image; it attaches.

**Inferred requirements** (not stated anywhere; reasoned from the code or from competitor parity)

- Rich-text paste should give plain text on every app [inferred from S13.12]; VS Code and Chrome rely on the browser textarea default.
- Pasted text must not be sent to a provider that the person did not choose; it travels as a normal attachment [inferred].

**Proposed improvements** (suggestions, not requirements)

- [proposed] Share the 10,000-character rule and code fencing with VS Code and Chrome through packages/platform/utils.
- [proposed] Add code fencing to mobile with an undo link.

## 5. Implementation map

| Kind | Name | Path | Role |
|---|---|---|---|
| service | composerPaste | `packages/platform/utils/src/composerPaste.ts` | Shared paste policy: threshold (:12), largePasteToFile (:45), pastedBlocksToAttach (:63), decideComposerPaste (:131), looksLikePastedCode (:212), pastedCodeFence (:231). |
| service | largePaste re-export | `packages/ui/unified-chat/src/lib/largePaste.ts` | Import path the React composers use for the shared policy. |
| component | ChatComposerNew paste | `apps/web/features/chat/components/Composer/ChatComposerNew.tsx` | applyComposerPasteDecision (:2358), handlePaste (:2372), editor callbacks (:2402-2416), undo notices (:4942, :4980). |
| component | ComposerEditor paste | `packages/ui/unified-chat/src/composer-editor/ComposerEditor.tsx` | Rich editor handlePaste and handleDrop (:120-143). |
| component | ChatInput (mobile) paste | `apps/mobile/src/features/chat/components/ChatInput.tsx` | Large-paste chip (:1256), chip expand (:1306), send-time attach (:861-1000). |
| service | mobile pasted-text files | `apps/mobile/src/features/chat/components/ChatInput.tsx` | preparePastedTextFiles and removePastedTextFiles (:195-233) turn chips into files and clean them. |
| hook | useCloudLatestMessageMaxChars | `apps/mobile/src/features/chat/upload/messageLimits.ts` | Gives mobile the newest-message cap announced by the server. |
| config | cloud message limits | `packages/contracts/cloud-contracts/src/conversations.ts` | 100,000 message cap (:19), 1,000,000 stored cap (:20), newest-message cap helper (:46-53). |
| service | PastedTexts | `apps/cli/src/tui/composer_edits.rs` | Collapse and expand of pasted blocks (:108-135). |
| component | CLI paste handlers | `apps/cli/src/tui/tui_app.rs` | handle_paste_text (:4617), Ctrl+V image (:4097), stage_clipboard_image (:916), in-turn paste (:8485). |
| component | VS Code paste handler | `apps/extension-vscode/src/features/sidebar-webview/webviewContent.ts` | File-only paste handler (:7730). |
| component | Chrome paste handler | `apps/extension/src/side_panel.ts` | File-only paste handler (:14584) using filesFromDataTransfer. |
| service | Chrome composerText | `apps/extension/src/features/side-panel/composerText.ts` | Insert helpers that keep browser undo. |
| test | composerPaste unit test | `packages/platform/utils/src/__tests__/composerPaste.test.ts` | Shared paste policy cases. |
| test | web code paste test | `apps/web/features/chat/components/Composer/ChatComposerNew.codePaste.test.tsx` | Fence, language label, prose left alone, plain-text undo. |
| test | web large paste test | `apps/web/features/chat/components/Composer/ChatComposerNew.largePaste.test.tsx` | Book-sized paste becomes an attachment; undo restores it. |

## 6. Execution and data flow

| Step | Runs on | Source |
|---|---|---|
| The browser fires a paste event with clipboard data; the composer reads files, plain text and HTML. | device | ChatComposerNew.tsx:2372-2380; ComposerEditor.tsx:120-124 |
| The shared policy returns files, a text-file attachment, or text; code detection then fences text if it looks like code. | device | composerPaste.ts:131-145, :231-246 |
| Attachments enter the normal attachment path for validation and upload when the message is sent. | device and our servers | ChatComposerNew.tsx:2358-2362 (addChatAttachments); upload route unknown, see SYS-files-artifacts-and-storage |
| Mobile at send time (Cloud) moves the largest pasted chips into files until the message fits the cap. | device | ChatInput.tsx:877-900; composerPaste.ts:63-90 |
| CLI expands placeholders and sends the full text. | device | tui_app.rs:4083 |

**Data**

| What | Stored in | Synced | Kept or deleted |
|---|---|---|---|
| Pasted text file 'Pasted text.txt' (File object) | Web: in memory attachment list; mobile: chip with text in memory, files prepared under app storage at send (location not read) | Uploaded with the message when sent (route not read) | Mobile deletes prepared pasted files after send or discard (ChatInput.tsx:195-233, :1145); web: unknown |
| Pasted clipboard image | Web and Chrome: attachment; CLI: staged attachment | With the message | unknown |

**Models and providers.** Model-neutral on the client. Whether a model can read a text-file attachment depends on the route and file handling (SYS-files-artifacts-and-storage); the web composer disables Send when an attachment conflicts with the chosen mode (ChatComposerNew.tsx:6962).

## 7. Access and usage rules

| Rule | What the code does |
|---|---|
| Account | Pasting text needs none. Uploading the resulting attachment follows the attachment rules: mobile passes the subscription tier into preparePastedTextFiles (ChatInput.tsx:906). |
| Permissions | CLI image paste reads the clipboard on Ctrl+V only (tui_app.rs:4094-4097). |
| Subscription | The paste decision has none. Attachment admission may depend on the tier on mobile (ChatInput.tsx:906); details unknown. |
| Limits and metering | 10,000-character threshold (composerPaste.ts:12); message cap 100,000 on web (ChatComposerNew.tsx:294); mobile cap from the server announcement, default 100,000 (conversations.ts:46-53; ChatInput.tsx:522, :887); CLI collapse 800 characters or 3 lines. |
| Feature flags | none found in the code. |
| Model compatibility | Attachment conflicts with the chosen mode or tools disable Send on web (ChatComposerNew.tsx:6962-6975). |
| Provider restrictions | none found in the code. |
| Local mode | Web: a local-model attachment conflict can block Send (ChatComposerNew.tsx:4817). Mobile: in Local mode pasted chips are joined into the message text and no cap check was found (ChatInput.tsx:877-880, :990-996). CLI: unchanged. |

## 8. States and edge cases

| State | Behaviour | Source |
|---|---|---|
| Composer disabled | Web skips the special paste handling and returns. | ChatComposerNew.tsx:2374 |
| Paste during a running reply (CLI) | Raw text inserted, no collapse. | tui_app.rs:8485-8489 |
| Overlay open (CLI) | Paste ignored by the composer. | tui_app.rs:4621 |
| Escape sequences in clipboard (CLI) | Sanitised before insert. | tui_app.rs:4623-4624 |
| Duplicate names | Second large paste becomes 'Pasted text 2.txt'. | composerPaste.ts:26-43 |
| Pasted file preparation fails (mobile) | Alert 'Pasted text not attached' and the message is kept. | ChatInput.tsx:915-922 |
| Code with a fence already, JSON, prose | Not fenced. | composerPaste.ts:212-229 |
| Offline | not handled in the code read for paste. | searched the paste handlers (ChatComposerNew.tsx:2358-2416; composerPaste.ts) for network checks; none found |

## 9. Verification

What has actually been seen by a person is in the Status table above. This section lists what exists to check with.

**Existing tests**

- `packages/platform/utils/src/__tests__/composerPaste.test.ts`: Shared policy (file name, threshold, code detection); exact cases not read.
- `apps/web/features/chat/components/Composer/ChatComposerNew.largePaste.test.tsx`: Large paste becomes an attachment, normal paste stays text, explanation and put-back.
- `apps/web/features/chat/components/Composer/ChatComposerNew.codePaste.test.tsx`: Fence, language, prose untouched, plain-text undo.
- `apps/web/e2e/composer-editor.spec.ts`: Editor arm: a long paste becomes an attachment and the undo puts the text back (:161).
- `apps/mobile/__tests__/ChatInput.test.tsx`: Large paste conversion: a >10k paste becomes a 'Pasted text' attachment and keeps prior text (:2701).
- `apps/mobile/__tests__/UnsentPastedTextMessage.test.ts`: Unsent pasted-text message handling (exact cases not read).
- `apps/extension/__tests__/composer-paste-contract.test.ts`: Chrome uses the shared paste module and shared file extraction.
- `apps/cli/src/tui/tui_app.rs`: Inline tests a_cleared_paste_comes_back_as_its_text_after_another_send (:10860), pasted_text_inserts_without_submitting (:11294), pasted_text_cannot_carry_escapes_into_the_composer (:12836).

**Test scenarios**

- **Web long paste**
  1. Copy 12,000 characters.
  2. Paste into the web box.
  3. Click 'Put it back in the message'.
  - Expected: A file attaches first; undo removes it and puts the text in the box.
- **Web code paste**
  1. Copy a 6-line function from an editor.
  2. Paste.
  3. Click 'Paste as plain text'.
  - Expected: Fenced block first; plain text after.
- **Image paste**
  1. Copy a screenshot.
  2. Paste in web, then Chrome, then CLI (Ctrl+V).
  - Expected: Attachment each time.
- **Mobile long paste**
  1. Paste 12,000 characters on the phone.
  2. Tap the chip action to expand it.
  - Expected: Chip first; text returns to the box on expand.
- **CLI collapse**
  1. Paste 5 lines.
  2. Press Enter.
  - Expected: Placeholder shown, full text sent.
- **Rich text**
  1. Copy bold, linked text from a web page.
  2. Paste in each app.
  - Expected: Plain text; record the result per app (unknown for VS Code and Chrome).

**Where to look when it fails**

- Web: data-testid pasted-text-undo and pasted-code-undo (ChatComposerNew.tsx:4950, :4982).
- Mobile: alerts 'Pasted text not attached' and 'Pasted text not sent'.
- CLI: status notice text for image paste failures (tui_app.rs:4099-4103).

**Hands-on test plans**

- Web: [70-qa/test-plans/web/013-composer-text-interaction.md](../../70-qa/test-plans/web/013-composer-text-interaction.md)
- Desktop: [70-qa/test-plans/desktop/013-composer-text-interaction.md](../../70-qa/test-plans/desktop/013-composer-text-interaction.md)
- Mobile: [70-qa/test-plans/mobile/013-composer-text-interaction.md](../../70-qa/test-plans/mobile/013-composer-text-interaction.md)
- CLI: [70-qa/test-plans/cli/013-composer-text-interaction.md](../../70-qa/test-plans/cli/013-composer-text-interaction.md)
- VS Code: [70-qa/test-plans/vscode/013-composer-text-interaction.md](../../70-qa/test-plans/vscode/013-composer-text-interaction.md)
- Chrome: [70-qa/test-plans/chrome/013-composer-text-interaction.md](../../70-qa/test-plans/chrome/013-composer-text-interaction.md)

## 10. Gaps and dependencies

- **VS Code and Chrome do not handle long text or code on paste.** Affects: VS Code and Chrome users.. Evidence: webviewContent.ts:7730-7745; side_panel.ts:14584-14589. Work needed: Route through the shared paste decision.
- **Mobile has no code fencing.** Affects: Mobile users.. Evidence: No code-fence logic found in ChatInput.tsx (search for pastedCodeFence returned none there). Work needed: Add and test.
- **CLI collapse does not apply while a reply is running.** Affects: CLI users pasting mid-turn.. Evidence: tui_app.rs:8485-8489. Work needed: Use the same collapse in the in-turn draft.
- **No test found for rich-text normalisation or for the paste block while disabled.** Affects: Testers.. Evidence: search of web Composer tests. Work needed: Add tests.
- **Mobile detects a large paste by the size of one text change, so any single insertion of 10,000 characters (for example a dictation result) would also become a chip [inferred].** Affects: Mobile users.. Evidence: ChatInput.tsx:1256-1286. Work needed: Verify on a device.

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
- SYS-files-artifacts-and-storage
- SYS-api-and-contracts
- file:packages/platform/utils/src/composerPaste.ts
- F013-01
- F013-06

## Unknown

- Whether mobile handles pasted files or images in the composer.
- Where mobile stores prepared pasted files.
- How uploads of the 'Pasted text.txt' attachment reach storage (route not read).
- Whether VS Code and Chrome keep formatting when HTML is pasted.
- Behaviour of the CLI image paste on each operating system.
