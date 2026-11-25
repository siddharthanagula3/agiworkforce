---
id: "F008-08"
type: "feature"
title: "Files and drop areas"
aliases: ["File input", "Upload from device", "Attach files", "Drop zone", "Upload dropzone", "Drop files here", "File upload", "S8.29", "S8.30"]
area: "8 Basic interactive elements"
available_on: ["web", "desktop", "mobile", "cli", "vscode", "chrome"]
implementation: {web: "built", desktop: "built", mobile: "built", cli: "built", vscode: "built", chrome: "built"}
verification: {web: "not seen by a person", desktop: "not seen by a person", mobile: "not seen by a person", cli: "not seen by a person", vscode: "not seen by a person", chrome: "not seen by a person"}
requirement_items: ["S8.29", "S8.30"]
depends_on: ["surface:web", "surface:mobile", "surface:cli", "surface:vscode", "surface:chrome", "SYS-files-artifacts-and-storage", "SYS-chat-turn-pipeline", "SYS-model-catalog-and-routing", "SYS-subscriptions-entitlements-and-usage", "SYS-api-and-contracts", "file:packages/contracts/cloud-contracts/src/chat-attachments.ts"]
basis: "code inspection"
second_reader: "not sampled: statements are code readings that nobody has re-checked"
last_reviewed: "2026-11-24"
revision: "f51d16e747"
---
# F008-08 Files and drop areas

Lets a person attach files to a chat message by choosing them from the device or dragging them onto the chat. Web shows a full-window 'Drop files here' overlay. VS Code and Chrome highlight the composer while files are over it. Mobile uses a picker sheet. The CLI uses an @ file list.

Area: [8. Basic interactive elements](README.md). Requirement items: [S8.29](../../10-requirements/capabilities/008-basic-interactive-elements.md#s829), [S8.30](../../10-requirements/capabilities/008-basic-interactive-elements.md#s830).

## Status

Two separate questions: is the code there, and has a person seen it work. "Seen working" comes only from results of real runs recorded in the project's ledger.

| App | In the code: this page's reading, 2026-11-24 | In the code: ledger audit, 2026-09-26 and later updates | Seen working by a person |
|---|---|---|---|
| Web | built | built | not seen by a person |
| Desktop | built | built | not seen by a person |
| Mobile | built | built | not seen by a person |
| CLI | partly built (this page lists unfinished parts) | built | not seen by a person |
| VS Code | built | built | not seen by a person |
| Chrome | built | built | not seen by a person |

The first column was derived from this page's text by a second, cheaper pass and has not been validated item by item; the ledger column is the project's own record. Neither is a test result.

## 1. Purpose and user value

**What it does.** Gives every app a way to bring files into a message: a file chooser button, and on web, VS Code and Chrome a drop area with a drag-over state.

**Why it exists.** Chat is more useful with documents and images attached, and people expect both a button and drag and drop (doc: knowledge-base/data/area-briefs/008-basic-interactive-elements.md S8.29, S8.30).

**Who uses it.** Anyone attaching a document, image or code file to a message.

**Problems it solves**

- Attaching without hunting for a hidden control.
- Seeing that a drop will be accepted before releasing.
- Being told when files are over the limit rather than losing them silently.

**Use cases**

- Drag two PDFs onto the web chat and send a question about them.
- On mobile, tap the add control and pick Photos or File.
- In VS Code, drop a screenshot onto the composer.
- In the CLI, type @ to insert a workspace file path.

## 2. User experience

**Where to find it**

- Web: composer plus menu item 'Upload from device' (apps/web/features/chat/components/Composer/ComposerFilesMenu.tsx:33), keyboard shortcut 'composer-add-files' (ChatComposerNew.tsx:4627), whole-window drop (DragDropOverlay.tsx).
- Desktop: the public Electron window shows the hosted web app, so the web behaviour applies (doc: AGENTS.md section 5). Retained Tauri code has other drop handling in ProjectSettingsDialog.tsx and CodeWorkspace.tsx; a chat drop zone there: unknown.
- Mobile: add-to-chat sheet with rows 'Camera', 'Photos', 'Paste image', 'File' (apps/mobile/src/features/chat/components/AddToChatSheet.tsx:696-760; document picker at apps/mobile/app/(app)/chat/[id].tsx:1606).
- CLI: typing @ opens the file picker popup (apps/cli/src/tui/widgets/mention_popup.rs:1; opened at tui_app.rs:4591-4602).
- VS Code: composer drop and a command dialog 'Attach Workspace Files to Chat' with button 'Attach' (apps/extension-vscode/src/features/sidebar-webview/ChatStateManager.ts:3982-3989).
- Chrome: attach menu item with an 'Upload from device' label and a drop on the composer shell (apps/extension/src/side_panel.ts:14670-14690, 15808-15823).

**Before you start**

- Web: input is disabled while the composer is disabled or on a restricted free chat (ChatComposerNew.tsx:7014).
- Chrome: the managed Cloud chat must be ready and the capability 'canUploadFiles' allowed (side_panel.ts:10007-10013).
- VS Code: a trusted workspace for the workspace-file dialog (ChatStateManager.ts:3989).

**Screens and controls**

- Web drop overlay: dashed card with an upload icon, 'Drop files here', 'Release to attach to your message', and 'Up to N files' (DragDropOverlay.tsx:100-108).
- Web hidden input labelled 'File upload', multiple, with an accept list (ChatComposerNew.tsx:7010-7024).
- VS Code composer card gets a 'dragover' class while files are over (webviewContent.ts:7708-7725).
- Chrome composer shell gets a 'dragover' class (side_panel.ts:15808-15823).

**Journey**

1. Choose the attach control, or drag files over the window or composer.
2. The drag-over state appears (web overlay, VS Code and Chrome highlight).
3. Release or confirm the choice.
4. Chips appear for each file (VS Code shows uploading and failed chips).
5. Send the message with the attachments.

**What the person sees and gets**

- Web: overlay disappears on drop; refused files are named by the attachment hook (DragDropOverlay.tsx:50-52 comment; use-attachments.ts:181,210 messages such as 'Maximum N files allowed.').
- VS Code: failed chip '<name> (too large)' for files over the byte limit (webviewContent.ts:7660-7663).
- Mobile: not established beyond picker rows.

**Settings**

- Limits come from a shared contract: count, bytes per file, bytes per message (packages/contracts/cloud-contracts/src/chat-attachments.ts:21-23).

## 3. Current implementation

From reading the code. Not a test result.

**Working in the code**

- Web file input with multiple files and an accept list, reset after choosing (ChatComposerNew.tsx:7010-7022).
- Web window-level drag handling with a depth counter so the overlay does not flicker (DragDropOverlay.tsx:21-56).
- Web drop passes all files to the attachment hook which enforces limits (DragDropOverlay.tsx:50-52; ChatComposerNew.tsx:2301-2303).
- VS Code drop and paste handler read files as data URLs and post them to the extension host (webviewContent.ts:7648-7745).
- Chrome drop and file input call one intake function and respect the upload capability (side_panel.ts:10343, 15818-15823).
- Mobile document picker and Photos, Camera, Paste image rows exist (AddToChatSheet.tsx; chat/[id].tsx:1606).
- CLI @ mention popup ranks workspace files and inserts the chosen path (mention_popup.rs:1-9).

**Incomplete**

- CLI @ file popup lists workspace files and agents, not a device file chooser; no binary file attach was found in the CLI files read.
- Mobile has no drag drop target (not applicable to touch), brief shows no status.

**Present but disconnected or switched off**

- Web input is disabled in composerDisabled or restricted free chat unless a promotional vision chat is on (ChatComposerNew.tsx:7014).

**Not available**

- Mobile and CLI drop zones: none found; the brief gives no status for them.
- Retained desktop chat composer drop zone: unknown.

## 4. Required behaviour

**Established requirements**

- A file input (choose files from the device) is used in shipped UI on web, desktop, mobile, CLI, VS Code and Chrome. (source: capability ledger `audit/ledger/ecosystem-capability-ledger.jsonl`, item S8.29)
- An upload drop zone accepts files dragged onto it and shows a drag-over state (web, desktop, VS Code, Chrome). (source: S8.30 in the same brief)

**Acceptance criteria**

1. On web, dragging a file over the window shows 'Drop files here' and moving it out hides the overlay.
2. On web, dropping more files than the limit attaches up to the limit and names the refused ones.
3. On web, the Upload from device item opens the system file chooser and the same file can be chosen twice in a row.
4. In VS Code, dropping a file over the composer adds the dragover class and a chip, dropping an oversized file shows '(too large)'.
5. In Chrome, dropping a file with the upload capability off adds no chip.
6. On mobile, File opens the document picker and the chosen file appears as an attachment.
7. In the CLI, typing @ then Enter inserts the file path into the composer.

**Inferred requirements** (not stated anywhere; reasoned from the code or from competitor parity)

- Refusals must be visible, not silent [inferred from the comment at DragDropOverlay.tsx:50-52].
- Dropped files must follow the same limits as chosen files on each app [inferred from both paths calling one handler: ChatComposerNew.tsx:2301].

**Proposed improvements** (suggestions, not requirements)

- [proposed] Show a drop-state description for screen readers on web, since the overlay has no live-region role (DragDropOverlay.tsx:75-109 has no role).
- [proposed] Add the missing status for mobile and CLI to the brief as n/a (touch and terminal).

## 5. Implementation map

| Kind | Name | Path | Role |
|---|---|---|---|
| component | DragDropOverlay | `apps/web/features/chat/components/Composer/DragDropOverlay.tsx` | Window-level drag listeners and overlay |
| component | ChatComposerNew file input | `apps/web/features/chat/components/Composer/ChatComposerNew.tsx` | Hidden input, handleFileDrop, shortcut |
| hook | useAttachments | `apps/web/features/chat/hooks/use-attachments.ts` | Accept list, limits, refusals |
| component | ComposerFilesMenu | `apps/web/features/chat/components/Composer/ComposerFilesMenu.tsx` | Menu item 'Upload from device' |
| config | chat-attachments contract | `packages/contracts/cloud-contracts/src/chat-attachments.ts` | Max count, bytes per file, bytes per message |
| component | AddToChatSheet | `apps/mobile/src/features/chat/components/AddToChatSheet.tsx` | Camera, Photos, Paste image, File rows |
| service | runComposerAttachmentPick | `apps/mobile/src/features/chat/utils/runComposerAttachmentPick.ts` | Runs a pick and converts documents to attachments |
| screen | Mobile chat screen | `apps/mobile/app/(app)/chat/[id].tsx` | Calls the document picker (line 1606) |
| component | MentionPopup | `apps/cli/src/tui/widgets/mention_popup.rs` | @ file picker |
| service | mentions module | `apps/cli/src/mentions.rs` | Ranks workspace files (rank_mention_candidates); path inferred from the import in mention_popup.rs:10 |
| component | VS Code webview composer | `apps/extension-vscode/src/features/sidebar-webview/webviewContent.ts` | Drag handlers, acceptIncomingFiles, paste |
| service | ChatStateManager attach dialog | `apps/extension-vscode/src/features/sidebar-webview/ChatStateManager.ts` | showOpenDialog 'Attach Workspace Files to Chat' |
| component | Chrome side panel composer | `apps/extension/src/side_panel.ts` | File input, drag handlers, intake gate |
| test | DragDropOverlay.test | `apps/web/features/chat/components/Composer/DragDropOverlay.test.tsx` | Web overlay tests |
| test | webviewAttachFiles.test | `apps/extension-vscode/src/__tests__/webviewAttachFiles.test.ts` | VS Code attach messages |
| test | webviewAttachmentCap.test | `apps/extension-vscode/src/__tests__/webviewAttachmentCap.test.ts` | VS Code attachment cap |

## 6. Execution and data flow

| Step | Runs on | Source |
|---|---|---|
| Browser or webview raises dragenter, dragover, drop or file input change. | device | DragDropOverlay.tsx:21-56; webviewContent.ts:7708-7725; side_panel.ts:15808-15823 |
| Files go to one intake function that checks count, size and type. | device | ChatComposerNew.tsx:2301; use-attachments.ts:258-420; side_panel.ts:10343 |
| VS Code reads each file to a data URL and posts 'attachFiles' to the extension host, which acknowledges with 'attachFilesAck'. | device | webviewContent.ts:7671-7703,8476 |
| On send, attachments travel with the message to the chosen mode's backend (Cloud, own key or Local); the exact upload endpoint was not opened. | device and our servers | unknown; ChatComposerNew.tsx send path not traced |

**Data**

| What | Stored in | Synced | Kept or deleted |
|---|---|---|---|
| Attached file bytes and names | Composer draft in memory, then message attachments | With the conversation in Cloud mode (not traced) | Chrome shows an attachment retention notice (side_panel.ts:10786 'sp-attachment-retention'); other rules: unknown |

**Models and providers.** The composer checks attachment kinds against the selected model for free models (freeModelHandoffReason with attachments, ChatComposerNew.tsx:3676-3689). Which model families accept which file types comes from the model catalog (SYS-model-catalog-and-routing).

## 7. Access and usage rules

| Rule | What the code does |
|---|---|
| Account | Web composer is part of the signed-in chat; Chrome needs a ready managed Cloud chat (side_panel.ts:10007). |
| Permissions | Chrome: capability canUploadFiles (side_panel.ts:10013). Mobile Camera row checks canUseCamera (AddToChatSheet.tsx:202). VS Code: trusted workspace for the workspace dialog (ChatStateManager.ts:3989). |
| Subscription | Free chat restricts attachments on web (restrictedFreeChat, ChatComposerNew.tsx:7014); exact plan table: unknown. |
| Limits and metering | Count, per-file bytes, per-message bytes and image bytes from the shared contract (use-attachments.ts:5-8,25-28). VS Code has its own batch and byte limits (webviewContent.ts:7477, MAX_COMPOSER_ATTACHMENT_BATCH). |
| Feature flags | Web shortcut matched by matchesComposerShortcut('composer-add-files'); no feature flag found. |
| Model compatibility | Free-model handoff considers attachment kinds (ChatComposerNew.tsx:3676-3689). |
| Provider restrictions | None found in the picker code. |
| Local mode | Choosing and dropping files is on the device. Whether a Local model accepts attachments is not established here (unknown). |

## 8. States and edge cases

| State | Behaviour | Source |
|---|---|---|
| Too many files | Attachment hook refuses extras and names them | use-attachments.ts:181,210 |
| File too large | VS Code shows a failed chip '(too large)' | webviewContent.ts:7660 |
| Read failure | VS Code marks the batch chips failed | webviewContent.ts:7688-7697 |
| Conversation changed during upload | VS Code removes stale chips | webviewContent.ts:7678-7686 |
| Drag of non-files | Web counts only drags whose types include Files; VS Code and Chrome check the same | DragDropOverlay.tsx:27; webviewContent.ts:7710 |
| Disabled composer | Input disabled | ChatComposerNew.tsx:7014 |
| Accessibility of the drop state | Web overlay has no role or live text; announcement: not handled in the code | DragDropOverlay.tsx:75-109 |
| Offline or retry on upload | Not traced in this feature | not opened |

## 9. Verification

What has actually been seen by a person is in the Status table above. This section lists what exists to check with.

**Existing tests**

- `apps/web/features/chat/components/Composer/DragDropOverlay.test.tsx`: Web overlay behaviour
- `apps/web/features/chat/components/Composer/ChatComposerNew.localAttachments.test.tsx`: Composer local attachments
- `apps/web/features/chat/components/Composer/ChatComposerNew.attachmentPending.test.tsx`: Pending attachment state
- `apps/extension-vscode/src/__tests__/webviewAttachFiles.test.ts`: VS Code attachFiles flow
- `apps/extension-vscode/src/__tests__/webviewAttachmentCap.test.ts`: VS Code attachment cap
- `apps/mobile/__tests__/attachment-validation.test.ts`: Mobile attachment validation

**Test scenarios**

- **Web drag over**
  1. Open web chat.
  2. Drag a file over the window without releasing.
  - Expected: Overlay with 'Drop files here' appears; leaving hides it.
- **Limit refusal**
  1. Drop more files than the limit.
  - Expected: Files up to the limit attach and refused ones are named.
- **VS Code oversize**
  1. Drop a file larger than the limit on the composer.
  - Expected: Red chip '<name> (too large)'.
- **Mobile file row**
  1. Open the add sheet.
  2. Tap File.
  3. Pick a document.
  - Expected: Attachment chip appears in the composer.
- **CLI mention**
  1. Type @ in the composer.
  2. Type part of a file name.
  3. Press Enter.
  - Expected: Path inserted; Esc dismisses without insertion.
- **Chrome without capability**
  1. Use an account where canUploadFiles is off.
  2. Drop a file.
  - Expected: No upload starts.

**Where to look when it fails**

- Web: refusal text from use-attachments.ts.
- VS Code: attachFilesAck message in the webview.
- Chrome: attachment-retention status element.

**Hands-on test plans**

- Web: [70-qa/test-plans/web/008-basic-interactive-elements.md](../../70-qa/test-plans/web/008-basic-interactive-elements.md)
- Desktop: [70-qa/test-plans/desktop/008-basic-interactive-elements.md](../../70-qa/test-plans/desktop/008-basic-interactive-elements.md)
- Mobile: [70-qa/test-plans/mobile/008-basic-interactive-elements.md](../../70-qa/test-plans/mobile/008-basic-interactive-elements.md)
- CLI: [70-qa/test-plans/cli/008-basic-interactive-elements.md](../../70-qa/test-plans/cli/008-basic-interactive-elements.md)
- VS Code: [70-qa/test-plans/vscode/008-basic-interactive-elements.md](../../70-qa/test-plans/vscode/008-basic-interactive-elements.md)
- Chrome: [70-qa/test-plans/chrome/008-basic-interactive-elements.md](../../70-qa/test-plans/chrome/008-basic-interactive-elements.md)

## 10. Gaps and dependencies

- **Web drop overlay is not announced to assistive technology.** Affects: Web screen reader users. Evidence: DragDropOverlay.tsx:75-109 has no role or aria. Work needed: Add a status or dialog role and label.
- **CLI has no device file chooser, only a workspace @ list.** Affects: CLI. Evidence: mention_popup.rs:1-9. Work needed: Confirm that is the intended design and document it.
- **Brief code line references are stale (for example tui_app.rs:2830 is unrelated; ChatComposerNew.tsx:5230 is not the input).** Affects: Documentation. Evidence: tui_app.rs:2820-2840; ChatComposerNew.tsx:5222-5245. Work needed: Update the brief.
- **Retained desktop composer drop zone not established.** Affects: Desktop Tauri code. Evidence: only ProjectSettingsDialog.tsx and CodeWorkspace.tsx matched a drop search. Work needed: Verify or mark n/a.

**Depends on**

- surface:web
- surface:mobile
- surface:cli
- surface:vscode
- surface:chrome
- SYS-files-artifacts-and-storage
- SYS-chat-turn-pipeline
- SYS-model-catalog-and-routing
- SYS-subscriptions-entitlements-and-usage
- SYS-api-and-contracts
- file:packages/contracts/cloud-contracts/src/chat-attachments.ts

## Unknown

- Upload endpoint and storage rules for attached files.
- Whether a Local model accepts attachments.
- Whether the retained desktop chat has a drop zone.
- What the mobile attachment limits are.
- Exact plan table for attachments on free chat.
