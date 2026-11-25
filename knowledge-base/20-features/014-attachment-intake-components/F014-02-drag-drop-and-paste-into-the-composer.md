---
id: "F014-02"
type: "feature"
title: "Drag, drop and paste into the composer"
aliases: ["Drag-and-drop intake (S14.02)", "Paste-image intake (S14.03)", "Drop files here overlay", "Attach clipboard (desktop row)", "Paste image (phone card)", "Ctrl+V image paste (CLI)", "Pasted text.txt (large paste)"]
area: "14 Attachment intake components"
available_on: ["web", "desktop", "mobile", "cli", "vscode", "chrome"]
implementation: {web: "built", desktop: "built", mobile: "partial", cli: "built", vscode: "built", chrome: "built"}
verification: {web: "not seen by a person", desktop: "not seen by a person", mobile: "n/a", cli: "not seen by a person", vscode: "not seen by a person", chrome: "not seen by a person"}
requirement_items: ["S14.02", "S14.03"]
depends_on: ["SYS-files-artifacts-and-storage", "SYS-shared-ui-and-design", "SYS-execution-boundaries", "SYS-security-and-privacy", "F014-01", "F014-05", "surface:web", "surface:desktop", "surface:mobile", "surface:cli", "surface:vscode", "surface:chrome", "mode:local", "file:packages/platform/utils/src/composerPaste.ts"]
basis: "code inspection"
second_reader: "not sampled: statements are code readings that nobody has re-checked"
last_reviewed: "2026-11-24"
revision: "f51d16e747"
---
# F014-02 Drag, drop and paste into the composer

Lets a person drop files on the chat or paste a copied image or file into the message. Web and desktop show a full-window 'Drop files here' overlay; VS Code and Chrome take drops on the composer; the CLI pastes a clipboard image with Ctrl+V; the phone has a 'Paste image' card but no drop.

Area: [14. Attachment intake components](README.md). Requirement items: [S14.02](../../10-requirements/capabilities/014-attachment-intake-components.md#s1402), [S14.03](../../10-requirements/capabilities/014-attachment-intake-components.md#s1403).

## Status

Two separate questions: is the code there, and has a person seen it work. "Seen working" comes only from results of real runs recorded in the project's ledger.

| App | In the code: this page's reading, 2026-11-24 | In the code: ledger audit, 2026-09-26 and later updates | Seen working by a person |
|---|---|---|---|
| Web | built | built | not seen by a person |
| Desktop | built | built | not seen by a person |
| Mobile | partly built **(disagrees with the ledger on whether it exists)** | not built | n/a |
| CLI | partly built (this page lists unfinished parts) | built | not seen by a person |
| VS Code | partly built (this page lists unfinished parts) | built | not seen by a person |
| Chrome | partly built (this page lists unfinished parts) | built | not seen by a person |

The first column was derived from this page's text by a second, cheaper pass and has not been validated item by item; the ledger column is the project's own record. Neither is a test result.
Where the two disagree on whether the feature exists on an app, the case is listed in [ledger corrections](../../90-meta/ledger-corrections.md).

## 1. Purpose and user value

**What it does.** Routes dropped and pasted files into the same intake as a picked file (web: handleFileDrop and the shared paste decision), so checks, chips and notices match. Large pasted text becomes a text file attachment and pasted code is fenced, so ordinary text still pastes as text (packages/platform/utils/src/composerPaste.ts:12,131-142; ChatComposerNew.tsx:2372-2400).

**Why it exists.** Dragging a file or pasting a screenshot is the fastest way to attach. The brief lists S14.02 and S14.03 (doc: knowledge-base/data/area-briefs/014-attachment-intake-components.md).

**Who uses it.** Desktop and browser users, developers in VS Code and Chrome, CLI users sending screenshots to a vision model, phone users with an image on the clipboard.

**Problems it solves**

- No file dialog needed for a screenshot or a file already open in a folder window.
- A huge text paste no longer floods the message box; it becomes 'Pasted text.txt' with an undo (ChatComposerNew.tsx:2358-2370).
- The same clipboard gives the same result in web, the shared editor and Chrome (composerPaste.ts header comment).

**Use cases**

- Drag three PDFs from Finder onto the web chat.
- Paste a screenshot with the paste shortcut into the Chrome side panel.
- Press Ctrl+V in the CLI to attach the clipboard image.
- On the phone copy a picture and tap 'Paste image' in the attach sheet.

## 2. User experience

**Where to find it**

- Web and desktop: drag over the page; overlay with title 'Drop files here', text 'Release to attach to your message' and 'Up to N files' (apps/web/features/chat/components/Composer/DragDropOverlay.tsx:111-117). Paste in the editor. Desktop adds the plus-menu row 'Attach clipboard' (ComposerPlusMenu.tsx:176,1123-1140).
- VS Code: drop on the composer card (class dragover) or paste into the message box (webviewContent.ts:7708-7745).
- Chrome side panel: drop on the composer shell or paste into the input (side_panel.ts:15808-15823,14584-14589).
- CLI: Ctrl+V and '/attach clipboard' (tui_app.rs:4098,6263).
- Phone: attach sheet card 'Paste image', shown only when the clipboard holds an image (AddToChatSheet.tsx:497-513,713).

**Before you start**

- Web paste and drop do nothing while the composer is disabled or the trial is used up for paste (ChatComposerNew.tsx:2373).
- Chrome and VS Code: same gates as the picker.
- CLI: a model that accepts images (tui_app.rs:916-924).
- Desktop 'Attach clipboard' appears only in the desktop host (ChatComposerNew.tsx:6019).

**Screens and controls**

- Full-window overlay (web).
- Dashed 'dragover' highlight on the composer card (VS Code) and shell (Chrome).
- Chip row under the CLI composer.
- Phone card with clipboard icon.

**Journey**

1. Drag files over the window; the overlay appears.
2. Release; files go through the same checks as a picked file.
3. Chips appear; refused files are named.
4. Or paste: image files become chips; text stays text.

**What the person sees and gets**

- Web: notices from the attachment hook; for an empty clipboard 'Your clipboard is empty, so there was nothing to attach.' and 'The clipboard could not be read.' (ChatComposerNew.tsx:2321,2335).
- Phone: alert 'Paste image' with 'There is no image on the clipboard to paste.' or 'The image on the clipboard could not be pasted. Try again.' (chat.tsx:986-1000).
- CLI: status line 'attached clipboard (WxH)' or the failure reason (tui_app.rs:4099-4103).
- Chrome: notices from admission (spAttachmentUnsupported etc.).

**Settings**

- None found for drop or paste. Desktop screenshot shortcuts are in the feature on screenshot capture.

## 3. Current implementation

From reading the code. Not a test result.

**Working in the code**

- Web overlay listens on the window for dragenter, dragleave, dragover and drop, only reacts to drags carrying Files, and hands every dropped file to the attachment hook (DragDropOverlay.tsx:22-70).
- Web editor drop and paste: ComposerEditor reads files from the transfer and calls onDropFiles / onPasteDecision (packages/ui/unified-chat/src/composer-editor/ComposerEditor.tsx:120-139).
- Paste decision: any pasted file becomes a file attachment; text of 10,000 characters or more becomes 'Pasted text.txt' (numbered if taken); multi-line code is fenced (composerPaste.ts:12,131-142,231-244).
- Desktop: folder drops show an 'Approve this folder?' prompt and leave file drops to the page (apps/desktop/electron/workspaceDrop.ts:36-60).
- VS Code: drop and paste of files read as data URLs, up to 8 per batch, posted as attachFiles (webviewContent.ts:7648-7745).
- Chrome: drop and paste read through filesFromDataTransfer and admitted with upload (side_panel.ts:14584-14589,15818-15823).
- CLI: Ctrl+V and /attach clipboard stage the clipboard bitmap (tui_app.rs:916-941,4098-4108); long text pastes collapse to '[Pasted text #N +L lines]' and the full text is sent (composer_edits.rs:137; tui_app.rs:5488).
- Phone: Paste image reads the clipboard image to a cache file and attaches it (apps/mobile/src/features/media/clipboard-image.ts:15-34).

**Incomplete**

- Phone has no drag-and-drop; the brief says 'missing' for S14.03 on the phone but the Paste image card exists in code (AddToChatSheet.tsx:713).
- Chrome and VS Code paste handlers take files only; no large-text-to-file conversion was found there (side_panel.ts:14584-14589; webviewContent.ts:7730-7745).
- VS Code drop silently keeps only the first 8 files with no notice (webviewContent.ts:7650).

**Present but disconnected or switched off**

- Web DragDropOverlay is mounted without a disabled check, so a drop while the composer is disabled still reaches the attachment hook [inferred] (ChatComposerNew.tsx:4893).

**Not available**

- Phone: drag-and-drop (no code found).
- CLI: pasting or dropping files is not handled; only a clipboard bitmap and text paste (tui_app.rs:4095-4098).
- Phone Local-model and web local-model attachment limits still apply after paste.

## 4. Required behaviour

**Established requirements**

- Dropping files onto the chat attaches them to the next message (S14.02). (source: capability ledger `audit/ledger/ecosystem-capability-ledger.jsonl`, item S14.02)
- Pasting an image from the clipboard attaches it as an image (S14.03). (source: capability ledger `audit/ledger/ecosystem-capability-ledger.jsonl`, item S14.03)
- Desktop: a screenshot is put on the clipboard and pasted; if the composer is not ready the image stays on the clipboard and the person is told (brief 'Should' lines for this feature). (source: apps/desktop/electron/screenshot.ts:109-140)

**Acceptance criteria**

1. Dragging a file over the web chat shows the 'Drop files here' overlay; releasing adds a chip.
2. Dropping 3 files adds 3 chips through the same checks as the picker.
3. Pasting a PNG into the web composer adds an image chip and inserts no text.
4. Pasting 10,000 or more characters adds a 'Pasted text.txt' chip; a 100-character paste stays in the box.
5. In the CLI, Ctrl+V with an image on the clipboard stages it; with none, a short reason shows and the chat is unchanged.
6. On the phone the 'Paste image' card is absent when the clipboard has no image.
7. Dropping a folder on the desktop window shows 'Approve this folder?' and does not attach files.

**Inferred requirements** (not stated anywhere; reasoned from the code or from competitor parity)

- Drop while composer is disabled should be ignored [inferred from paste behaviour at ChatComposerNew.tsx:2373].

**Proposed improvements** (suggestions, not requirements)

- [proposed] Show a notice when VS Code cuts a drop to 8 files.
- [proposed] Convert large text pastes to a file in Chrome and VS Code as web does.

## 5. Implementation map

| Kind | Name | Path | Role |
|---|---|---|---|
| component | DragDropOverlay | `apps/web/features/chat/components/Composer/DragDropOverlay.tsx` | Window-level drag listeners and the overlay. |
| component | ChatComposerNew paste and drop | `apps/web/features/chat/components/Composer/ChatComposerNew.tsx` | handlePaste, handleFileDrop, handleAttachClipboard, paste undo notices. |
| component | ComposerEditor | `packages/ui/unified-chat/src/composer-editor/ComposerEditor.tsx` | Editor-level drop and paste handlers. |
| service | composerPaste | `packages/platform/utils/src/composerPaste.ts` | decideComposerPaste, large paste to file, code fence, file extraction. |
| service | largePaste re-export | `packages/ui/unified-chat/src/lib/largePaste.ts` | Re-exports the shared paste policy for React composers. |
| hook | useAttachments | `apps/web/features/chat/hooks/use-attachments.ts` | Common admission for dropped and pasted files. |
| component | ComposerPlusMenu ClipboardRow | `apps/web/features/chat/components/Composer/ComposerPlusMenu.tsx` | Desktop 'Attach clipboard' row. |
| service | workspaceDrop | `apps/desktop/electron/workspaceDrop.ts` | Folder-drop grant prompt; files left to the page. |
| component | VS Code webview drop and paste | `apps/extension-vscode/src/features/sidebar-webview/webviewContent.ts` | acceptIncomingFiles, dragover, drop and paste listeners. |
| service | VS Code attachFiles handler | `apps/extension-vscode/src/features/sidebar-webview/ChatStateManager.ts` | Decodes data URLs, accepts images and text, skips binaries. |
| component | Chrome composer drop and paste | `apps/extension/src/side_panel.ts` | Drop on composer shell and paste on input. |
| command | Ctrl+V and /attach clipboard | `apps/cli/src/tui/tui_app.rs` | stage_clipboard_image through arboard. |
| service | clipboard_image_attachment | `apps/cli/src/lib.rs` | Encodes the clipboard bitmap for the prompt. |
| service | Pasted text collapse | `apps/cli/src/tui/composer_edits.rs` | '[Pasted text #N +L lines]' placeholder. |
| service | clipboard-image | `apps/mobile/src/features/media/clipboard-image.ts` | clipboardHasImage and readClipboardImageAttachment. |
| component | AddToChatSheet Paste image card | `apps/mobile/src/features/chat/components/AddToChatSheet.tsx` | Shows the card only if the clipboard holds an image. |
| screen | handleSheetPasteImage | `apps/mobile/app/(app)/(tabs)/chat.tsx` | Reads the clipboard image and shows the alerts. |
| service | Desktop screenshot paste | `apps/desktop/electron/screenshot.ts` | Pastes a capture into the composer with webContents.paste(). |

## 6. Execution and data flow

| Step | Runs on | Source |
|---|---|---|
| Browser delivers drag or paste events; web filters to drags that carry Files, reads files, and calls handleFileDrop. | device | DragDropOverlay.tsx:22-56; composerPaste.ts:92-110 |
| Paste decision: files win; else text of 10,000 characters or more becomes a file; else code is fenced; else text pastes normally. | device | composerPaste.ts:131-142; ChatComposerNew.tsx:2372-2400 |
| Files then run the same admission as picked files, including picture metadata removal. | device | use-attachments.ts:332-470 |
| Desktop 'Attach clipboard' reads the clipboard through the desktop host on click only; the shell asks permission the first time. | device | ChatComposerNew.tsx:2305-2339 |
| Chrome and VS Code read files as data URLs; Chrome uploads at once to the managed upload client, VS Code posts attachFiles to the extension host. | device and our servers | side_panel.ts:10269; webviewContent.ts:7671-7703 |
| CLI reads the clipboard bitmap with arboard and encodes it for the next turn. | device | tui_app.rs:925-941 |

**Data**

| What | Stored in | Synced | Kept or deleted |
|---|---|---|---|
| Pasted text turned into 'Pasted text.txt' | browser memory as a File, uploaded on send | after send, as any attachment | undo notice restores the text (ChatComposerNew.tsx:2358-2370) |
| Phone clipboard image file 'pasted-<time>.png' | app cache directory | no until sent | not removed by this code path; cache cleanup unknown (clipboard-image.ts:15-34) |

**Models and providers.** No provider takes part in drop or paste. Image readability depends on the model: CLI refuses when the model has no vision (tui_app.rs:916-924); web restricted free model takes images only (ChatComposerNew.tsx:2267-2285).

## 7. Access and usage rules

| Rule | What the code does |
|---|---|
| Account | Same as the picker; Chrome needs a Cloud account and canUploadFiles (side_panel.ts:10006-10017). |
| Permissions | Desktop clipboard row asks the shell for clipboard permission the first time (ChatComposerNew.tsx:2305-2309 comment). Phone clipboard read needs no prompt found in code. |
| Subscription | Same limits as the picker; no separate drop or paste limit found. |
| Limits and metering | Paste threshold 10,000 characters (composerPaste.ts:12). Drop batch cut to 8 in VS Code. Chrome 5 files. Metering of drop or paste: none found in the code. |
| Feature flags | none found in the code. |
| Model compatibility | See feature text; web blocks attachments with a local model. |
| Provider restrictions | none found in the code. |
| Local mode | Web with a local model: attachments block send (ChatComposerNew.tsx:5333). CLI and phone Local: image kept on the device; phone Local note says on-device models read the text in photos (AddToChatSheet.tsx:130-131). |

## 8. States and edge cases

| State | Behaviour | Source |
|---|---|---|
| Drag without files | Overlay does not appear because only Files drags count. | DragDropOverlay.tsx:27 |
| Empty or unreadable clipboard (desktop row) | Short notice; draft unchanged. | ChatComposerNew.tsx:2321,2335 |
| Clipboard text too long | Only the first part attached with a notice. | ChatComposerNew.tsx:2324-2328 |
| CLI no image on clipboard | Status line shows 'no image on the clipboard (...)'. | tui_app.rs:927 |
| Phone no image | Alert 'There is no image on the clipboard to paste.' | chat.tsx:993 |
| Account or draft changed during a paste read | Result ignored. | ChatComposerNew.tsx:2316-2318 |
| Drop beyond count | Web names the extra files; VS Code silently drops them; Chrome states the cap. | use-attachments.ts:381; webviewContent.ts:7650; side_panel-attachment-caps.test.ts:395 |

## 9. Verification

What has actually been seen by a person is in the Status table above. This section lists what exists to check with.

**Existing tests**

- `apps/web/features/chat/components/Composer/DragDropOverlay.test.tsx`: overlay shows the ceiling and leaves enforcement to the attachment owner
- `packages/platform/utils/src/__tests__/composerPaste.test.ts`: files regardless of type, large paste to numbered .txt, small paste left alone, drop extraction, code fence
- `apps/desktop/electron/__tests__/workspaceDrop.test.ts`: folder grant prompt, files left to the page, cancel default
- `apps/mobile/src/features/media/__tests__/clipboard-image.test.ts`: writes the copied image to a file; nothing when no image
- `apps/extension/__tests__/side_panel-attachment-caps.test.ts`: drop stops at count cap; paste beyond cap refused
- `apps/extension-vscode/src/__tests__/attachmentGeneration.webview.test.ts`: attachment batches invalidated across generations

**Test scenarios**

- **Drop three files on web**
  1. Drag three files over the chat.
  2. Release.
  - Expected: Overlay shows then hides; three chips.
- **Large paste**
  1. Paste 12,000 characters into the web composer.
  - Expected: A 'Pasted text.txt' chip and an undo notice; box text unchanged.
- **CLI image paste**
  1. Copy an image.
  2. Press Ctrl+V in the CLI with a vision model.
  3. Clear the clipboard and press Ctrl+V again.
  - Expected: First stages a chip; second shows a short reason.
- **Phone paste card**
  1. Copy a picture.
  2. Open the attach sheet.
  3. Tap Paste image.
  - Expected: Card visible and a chip appears; with an empty clipboard the card is absent.
- **VS Code drop of 10 files**
  1. Drop 10 text files on the composer card.
  - Expected: Only 8 chips; no notice (gap).

**Where to look when it fails**

- Web: local notice text; Desktop host clipboard errors via DesktopRuntimeError message.
- CLI: status_notice line.
- VS Code: skipped list in attachFilesAck.
- Chrome: composerAttachmentNotices.

**Hands-on test plans**

- Web: [70-qa/test-plans/web/014-attachment-intake-components.md](../../70-qa/test-plans/web/014-attachment-intake-components.md)
- Desktop: [70-qa/test-plans/desktop/014-attachment-intake-components.md](../../70-qa/test-plans/desktop/014-attachment-intake-components.md)
- Mobile: [70-qa/test-plans/mobile/014-attachment-intake-components.md](../../70-qa/test-plans/mobile/014-attachment-intake-components.md)
- CLI: [70-qa/test-plans/cli/014-attachment-intake-components.md](../../70-qa/test-plans/cli/014-attachment-intake-components.md)
- VS Code: [70-qa/test-plans/vscode/014-attachment-intake-components.md](../../70-qa/test-plans/vscode/014-attachment-intake-components.md)
- Chrome: [70-qa/test-plans/chrome/014-attachment-intake-components.md](../../70-qa/test-plans/chrome/014-attachment-intake-components.md)

## 10. Gaps and dependencies

- **VS Code drop silently truncated to 8 files** Affects: VS Code. Evidence: webviewContent.ts:7650. Work needed: Name the files left out.
- **No large-paste-to-file in Chrome and VS Code** Affects: Chrome, VS Code. Evidence: side_panel.ts:14584-14589; webviewContent.ts:7730-7745. Work needed: Reuse decideComposerPaste.
- **Web overlay not gated on disabled composer** Affects: Web, desktop. Evidence: ChatComposerNew.tsx:4893 vs 2373. Work needed: Verify in a browser, then pass disabled.
- **No file paste in CLI; no drop on phone** Affects: CLI, phone. Evidence: tui_app.rs:4095-4098; no phone code. Work needed: Product decision.
- **Pasted images not stripped of metadata in VS Code and Chrome** Affects: VS Code, Chrome. Evidence: no remover in their source. Work needed: Share the remover.

**Depends on**

- SYS-files-artifacts-and-storage
- SYS-shared-ui-and-design
- SYS-execution-boundaries
- SYS-security-and-privacy
- F014-01
- F014-05
- surface:web
- surface:desktop
- surface:mobile
- surface:cli
- surface:vscode
- surface:chrome
- mode:local
- file:packages/platform/utils/src/composerPaste.ts

## Unknown

- Whether the web overlay accepts a drop while the composer is disabled (inferred only).
- Whether iPad or external-keyboard drop is possible on the phone.
- Cleanup of the phone clipboard cache file.
- How the CLI treats a file path dragged into a terminal (terminal-dependent, not read).
