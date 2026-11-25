---
id: "F014-01"
type: "feature"
title: "Pick files from the device"
aliases: ["Device file picker (S14.01)", "Multiple-file selection (S14.15)", "Add photos & files (web plus-menu row)", "File upload (hidden input label)", "File card (phone attach sheet)", "Upload from device (Chrome side panel)", "Attach workspace files (VS Code)", "/attach and /files (CLI)"]
area: "14 Attachment intake components"
available_on: ["web", "desktop", "mobile", "cli", "vscode", "chrome"]
implementation: {web: "built", desktop: "built", mobile: "built", cli: "built", vscode: "built", chrome: "built"}
verification: {web: "partly seen (1 of 2)", desktop: "not seen by a person", mobile: "not seen by a person", cli: "not seen by a person", vscode: "not seen by a person", chrome: "not seen by a person"}
requirement_items: ["S14.01", "S14.15"]
depends_on: ["SYS-files-artifacts-and-storage", "SYS-subscriptions-entitlements-and-usage", "SYS-api-and-contracts", "SYS-execution-boundaries", "SYS-local-inference", "SYS-security-and-privacy", "SYS-shared-ui-and-design", "surface:web", "surface:desktop", "surface:mobile", "surface:cli", "surface:vscode", "surface:chrome", "mode:local", "mode:cloud", "file:apps/web/features/chat/hooks/use-attachments.ts", "api:GET /api/me"]
basis: "code inspection"
second_reader: "not sampled: statements are code readings that nobody has re-checked"
last_reviewed: "2026-11-24"
revision: "f51d16e747"
---
# F014-01 Pick files from the device

Lets a person pick one or more files on their device and stage them on the next message: web and desktop composer, phone attach sheet, CLI commands, VS Code sidebar and Chrome side panel. Each app checks type, size and count first and tells the person which files were refused and why.

Area: [14. Attachment intake components](README.md). Requirement items: [S14.01](../../10-requirements/capabilities/014-attachment-intake-components.md#s1401), [S14.15](../../10-requirements/capabilities/014-attachment-intake-components.md#s1415).

## Status

Two separate questions: is the code there, and has a person seen it work. "Seen working" comes only from results of real runs recorded in the project's ledger.

| App | In the code: this page's reading, 2026-11-24 | In the code: ledger audit, 2026-09-26 and later updates | Seen working by a person |
|---|---|---|---|
| Web | built | built | partly seen (1 of 2) |
| Desktop | built | built | not seen by a person |
| Mobile | partly built (this page lists unfinished parts) | built | not seen by a person |
| CLI | partly built (this page lists unfinished parts) | built | not seen by a person |
| VS Code | partly built (this page lists unfinished parts) | built | not seen by a person |
| Chrome | partly built (this page lists unfinished parts) | built | not seen by a person |

The first column was derived from this page's text by a second, cheaper pass and has not been validated item by item; the ledger column is the project's own record. Neither is a test result.

## 1. Purpose and user value

**What it does.** Opens the system file chooser (CLI: takes a path) and turns the chosen files into staged attachments that go with the next message. The web admission step checks duplicates, file count, empty files, size, type, image size and total message size, then reports 'Attached N of M files. Not attached: ...' (apps/web/features/chat/hooks/use-attachments.ts:222-246).

**Why it exists.** An assistant can only work on documents and pictures the person can hand over. The brief marks the device picker and multi-select (S14.01, S14.15) done on all six apps (doc: knowledge-base/data/area-briefs/014-attachment-intake-components.md). The requirements say a chip shows name, type and size and a removed file is not sent (doc: docs/product/requirements.md:990-993).

**Who uses it.** Anyone sending a document, spreadsheet, slide deck, image or source file to the assistant on any of the six apps.

**Problems it solves**

- Getting a local file into the conversation without copying its text by hand.
- Attaching several files in one action.
- Knowing which files were refused, so the model is not asked about a file it never received (the web draft keeps a refusal list that is turned into notes on the turn: use-attachments.ts:304-317, apps/web/features/chat/lib/attachment-metadata.ts:28-34).

**Use cases**

- Web or desktop: attach a PDF and two images to ask for a comparison.
- Phone in Cloud mode: tap File and pick a Word document to summarise.
- CLI: /attach report.pdf to ask questions about a PDF in the workspace.
- VS Code: attach three source files from the workspace before asking for a refactor.

## 2. User experience

**Where to find it**

- Web and desktop: button with aria-label 'Add attachments and tools' in the composer (apps/web/features/chat/components/Composer/ChatComposerNew.tsx:5953-5975), then the row 'Add photos & files' (apps/web/features/chat/components/Composer/ComposerPlusMenu.tsx:147,887). A keyboard shortcut 'composer-add-files' also opens the chooser (ChatComposerNew.tsx:4626). The desktop window shows the hosted web composer (doc: AGENTS.md section 5).
- Phone: attach sheet cards 'Photos' and, in Cloud mode only, 'File' (apps/mobile/src/features/chat/components/AddToChatSheet.tsx:705,719-722).
- CLI: '/attach <file>' for an image, PDF or Office file; '/files <paths>' for text files (apps/cli/src/tui/tui_app.rs:5481-5490; apps/cli/src/claude_parity.rs:223,389).
- VS Code: plus menu item 'Attach workspace files' with the hint 'Include text files in your next message' (apps/extension-vscode/src/features/sidebar-webview/webviewContent.ts:3203-3204).
- Chrome side panel: '+' button (title 'Add attachment') then 'Upload from device' (apps/extension/src/side_panel.ts:14614-14618,14676; apps/extension/_locales/en/messages.json:335).

**Before you start**

- Web: attach rows are disabled for a video or image model that cannot take a source image, and for a restricted free model that accepts text only (ChatComposerNew.tsx:1580-1584).
- Phone: File card needs Cloud mode (AddToChatSheet.tsx:719).
- CLI: the file must be inside the workspace or an added directory (tui_app.rs:842; apps/cli/src/agent/mod.rs:1485).
- VS Code: the workspace must be trusted (ChatStateManager.ts:3977 area, 'if (!vscode.workspace.isTrusted) return').
- Chrome: signed-in Cloud chat ready and the canUploadFiles capability on, otherwise a notice (side_panel.ts:10006-10017,10347).

**Screens and controls**

- Web: hidden multi-select input (aria-label 'File upload', accept built from the policy) (ChatComposerNew.tsx:7010-7021). Chips come from AttachmentPreview.
- Phone: sheet cards, then chips in ChatInput.
- CLI: a chip line under the composer ending '/attach remove to drop' (tui_app.rs:3278).
- VS Code: attachment strip with chips; failed chips read '<name> (too large)' (webviewContent.ts:7660).
- Chrome: chips in the composer strip with phases uploading, verifying, ready, failed (side_panel.ts:10440 area, composerDocumentStatusLabel).

**Journey**

1. Open the attach control and choose the file row.
2. Pick one or more files in the system chooser (CLI: type the path).
3. The app checks each file; accepted files appear as chips, refused ones are named in a notice or alert.
4. Optionally remove a chip.
5. Type the message and send; web and Chrome upload the files at that point or on admission (see execution).

**What the person sees and gets**

- Web: a local notice such as 'Attached 2 of 3 files. Not attached: "a.pdf" (empty)' (use-attachments.ts:239-243).
- Phone: alerts 'Attachment not added' / 'Some attachments not added' and 'Already attached' (ChatInput.tsx:655-668).
- CLI: 'Attached <label>. It goes with your next message; /attach remove drops it.' or 'Could not attach <path>: <reason>' (tui_app.rs:6280-6290). /files prints attached, already attached, truncated to budget or failed lines (claude_parity.rs:395-413).
- VS Code: a warning message listing skips, for example 'Choose up to 8 files at a time.' (ChatStateManager.ts:3993-4047).
- Chrome: composer notices from composerAttachmentNotices.

**Settings**

- Web and desktop: the limits come from the server through /api/me attachment_limits (apps/web/app/api/me/route.ts:345; apps/web/shared/stores/web-auth-store.ts:149).
- Phone: no setting found.
- CLI: -f flag also attaches files at launch (apps/cli/src/lib.rs:8470).

## 3. Current implementation

From reading the code. Not a test result.

**Working in the code**

- Web: multi-select input feeds handleFileDrop then addChatAttachments then admitFiles; duplicates, count, empty, size, type and message budget are refused with named reasons (ChatComposerNew.tsx:2223-2305,7010-7021; use-attachments.ts:332-470).
- Web: pictures have location and camera details stripped before they are accepted; an unreadable picture is refused (use-attachments.ts:486; attachment-metadata.ts:60-82).
- Web: limits published by the server replace the built-in ones; before they arrive the plan limits apply (composer-attachment-limits.ts:13-30).
- Phone: Photos card multi-select with order kept and a per-plan count; File card with multiple:true in Cloud mode; duplicates and over-limit files rejected with alerts (apps/mobile/app/(app)/(tabs)/chat.tsx:1003-1045; ChatInput.tsx:619-668; attachmentValidation.ts:141-175).
- CLI: /attach stages images, PDF and Office files; /files reads text into the session with 40,000 characters per file and 120,000 in total, reporting truncation (tui_app.rs:836-914; agent/mod.rs:1462-1545).
- VS Code: showOpenDialog with canSelectMany, no folders, up to 8 files, 10 MB each, text only (ChatStateManager.ts:3976-4050; protocol/webviewMessages.ts:171-172).
- Chrome: multi-select input accepting images, PDF, text and Markdown, up to 5 files, uploaded on admission (side_panel.ts:10069-10078,10210-10260,10343-10395; freeTrialClient.ts:103).

**Incomplete**

- Phone Local mode has no File card, so a person cannot pick a document in Local mode although the document handler and parser accept local types (AddToChatSheet.tsx:719 vs chat.tsx:1029-1040 and apps/mobile/services/docParser.ts:112-118).
- VS Code picker takes text files only; PDF and Office files are not accepted there (ChatStateManager.ts:4024).
- CLI /attach takes one path per command (tui_app.rs:6215-6225).

**Present but disconnected or switched off**

- Web: attach rows are switched off for some model modes (video without image input, image model without edit, restricted free model) (ChatComposerNew.tsx:1580-1584).
- Web: selecting a local on-device model with attachments present blocks send (ChatComposerNew.tsx:1589,4808-4815,5333-5339).

**Not available**

- Chrome side panel has no Office file support (accept list is images, PDF, txt, md) (side_panel.ts:10052-10078).
- VS Code and Chrome do not call the picture-metadata remover that web and phone use; not found in their source (searched apps/extension/src, apps/extension-vscode/src).

## 4. Required behaviour

**Established requirements**

- The composer opens the device file chooser and the chosen file is attached to the next message (S14.01). (source: capability ledger `audit/ledger/ecosystem-capability-ledger.jsonl`, item S14.01)
- One pick action can select several files and all are attached (S14.15). (source: capability ledger `audit/ledger/ecosystem-capability-ledger.jsonl`, item S14.15)
- A user can select a file or image when the route supports it; the chip shows name, type and size; an unsupported route shows a reason; a removed file is not in the payload. (source: doc: docs/product/requirements.md:990-993)
- Each advertised format yields usable model input or an explicit unsupported state; type, size, count and storage gates use their canonical limits; failed uploads do not send a partial set without an explicit decision. (source: doc: docs/product/experience-contract.md:777)

**Acceptance criteria**

1. Selecting 3 valid files in the web chooser shows 3 chips and no notice.
2. Selecting 1 valid and 1 empty file shows 1 chip and a notice naming the empty file.
3. Selecting more files than the account count allows attaches up to the limit and names the rest as over the limit.
4. Re-selecting a file already in the draft does not add a second chip and says it is already attached.
5. On the phone in Local mode the File card is absent; in Cloud mode it opens a multi-select document picker.
6. In the CLI, /attach on a path outside the workspace is refused and /files on a text file adds it to the session.
7. In VS Code, picking more than 8 files attaches 8 and shows 'Choose up to 8 files at a time.'

**Inferred requirements** (not stated anywhere; reasoned from the code or from competitor parity)

- The phone File card hidden in Local mode may be deliberate (the sheet shows a Local note 'On-device models read the text in photos, not the picture itself') but no document states it [inferred].

**Proposed improvements** (suggestions, not requirements)

- [proposed] Run the same picture-metadata remover in the Chrome side panel and VS Code intake paths.
- [proposed] Offer the File card in phone Local mode for the types the on-device parser reads.

## 5. Implementation map

| Kind | Name | Path | Role |
|---|---|---|---|
| component | ChatComposerNew | `apps/web/features/chat/components/Composer/ChatComposerNew.tsx` | Hosts the plus button, hidden multi-select input, addChatAttachments mode checks and notices. |
| component | ComposerPlusMenu (AttachRow) | `apps/web/features/chat/components/Composer/ComposerPlusMenu.tsx` | Menu row 'Add photos & files', limit note, retention note, unavailable badge. |
| hook | useAttachments | `apps/web/features/chat/hooks/use-attachments.ts` | Admission rules, notices, refusal list, preview URLs, picture preparation. |
| service | prepareChatAttachment | `apps/web/features/chat/lib/attachment-metadata.ts` | Removes picture location and camera details or refuses the picture. |
| service | composerAttachmentLimits | `apps/web/features/chat/lib/composer-attachment-limits.ts` | Uses server-published limits or plan limits. |
| store | web-auth-store (billing store) | `apps/web/shared/stores/web-auth-store.ts` | Holds attachmentLimits read from /api/me. |
| endpoint | GET /api/me attachment_limits | `apps/web/app/api/me/route.ts` | Publishes per-account attachment limits. |
| config | chat-attachment-policy.json | `packages/contracts/cloud-contracts/src/chat-attachment-policy.json` | Ceilings, allowed MIME types and extensions. |
| schema | chat-attachments contract | `packages/contracts/cloud-contracts/src/chat-attachments.ts` | ChatAttachmentLimits type, wire schema, upload paths, large-file offer. |
| config | Plan product limits | `packages/contracts/types/src/billing-catalog.ts` | getPlanMaxAttachmentsPerMessage and byte limits per plan. |
| service | uploadChatAttachments call | `apps/web/features/chat/pages/WebChatPage.tsx` | Uploads the draft files at send time (line 2685). |
| component | AddToChatSheet | `apps/mobile/src/features/chat/components/AddToChatSheet.tsx` | Phone attach sheet with Photos and File cards. |
| screen | Phone chat screens | `apps/mobile/app/(app)/(tabs)/chat.tsx` | handleSheetPhotos and handleSheetFile; the same handlers exist in apps/mobile/app/(app)/chat/[id].tsx. |
| service | attachmentValidation | `apps/mobile/src/features/chat/utils/attachmentValidation.ts` | Type, size, count and message-size admission for phone files. |
| hook | runComposerAttachmentPick | `apps/mobile/src/features/chat/utils/runComposerAttachmentPick.ts` | Runs a pick, shows preparing chips, adds attachments. |
| component | ChatInput addAttachments | `apps/mobile/src/features/chat/components/ChatInput.tsx` | Duplicate check and rejection alerts. |
| command | /attach | `apps/cli/src/tui/tui_app.rs` | Stages image, PDF and Office files (stage_image_path_with, stage_document). |
| command | /files and attach_context_files | `apps/cli/src/claude_parity.rs` | Command handler (handle_files); reading is in apps/cli/src/agent/mod.rs:1462. |
| service | load_document_attachment | `apps/cli/src/lib.rs` | Reads a PDF or Office file as a document block with a size cap. |
| service | _pickWorkspaceAttachments | `apps/extension-vscode/src/features/sidebar-webview/ChatStateManager.ts` | VS Code open dialog and text-file attach. |
| component | VS Code webview composer | `apps/extension-vscode/src/features/sidebar-webview/webviewContent.ts` | Plus menu item, attachment strip, chips. |
| config | Composer attachment limits | `apps/extension-vscode/src/protocol/webviewMessages.ts` | 10,000,000 byte and 8-file ceilings. |
| component | Chrome side panel attach menu | `apps/extension/src/side_panel.ts` | Upload from device, admission, upload and chips. |
| service | Chrome managed chat limits | `apps/extension/src/features/cloud-bridge/freeTrialClient.ts` | MANAGED_CHAT_MAX_ATTACHMENTS = 5 and file byte limit. |

## 6. Execution and data flow

| Step | Runs on | Source |
|---|---|---|
| Person opens the attach control and picks files in the browser chooser; handleFileDrop passes them to addChatAttachments, which refuses them in video, image or restricted-free modes where the model cannot read them. | device | ChatComposerNew.tsx:2223-2305,7010-7021 |
| admitFiles applies the rules and builds chips with object URLs; pictures are rewritten without location and camera details. | device | use-attachments.ts:332-470; attachment-metadata.ts:60-82 |
| Limits used in those rules were fetched earlier from the account endpoint. | our servers | apps/web/app/api/me/route.ts:345; web-auth-store.ts:149 |
| On send the web page uploads the files to the managed cloud upload endpoints (presign path and complete path) and sends their asset ids with the message. | our servers | WebChatPage.tsx:2685; chat-attachments.ts:15-16 |
| Phone: picker returns files, validation runs, chips show; in Cloud mode upload happens with retry; in Local mode documents are read on the phone. | device and our servers | chat.tsx:1029-1040; attachmentValidation.ts:34-47; apps/mobile/services/attachmentContext.ts:15-55; apps/mobile/src/features/chat/upload/uploadAttachment.ts:1-40 |
| CLI: file read on the computer, wrapped as a document or image block or as <attached_file> text, then sent with the next turn to whichever provider the session uses. | device | tui_app.rs:836-914; agent/mod.rs:1532-1537 |
| VS Code: file read with the editor API into pending attachments held in the extension; sent with the next message. | device | ChatStateManager.ts:4004-4033 |
| Chrome: file read in the panel, then uploaded to the managed cloud upload client on admission. | our servers | side_panel.ts:10269-10310 |

**Data**

| What | Stored in | Synced | Kept or deleted |
|---|---|---|---|
| Draft File objects and preview URLs (web) | browser memory | no | revoked on remove or clear (use-attachments.ts:531-560) |
| Uploaded attachment asset | managed cloud storage, shown in the person's Library unless the chat is temporary | yes, through the account | web copy says 'Saved to your Library until you delete them. Deleted files can be restored for N days'; temporary chats are 'Kept out of your Library and deleted with this temporary chat' (ComposerPlusMenu.tsx:156-158) |
| Phone Local-mode copy of a picked file | app documents folder, excluded from backup | no | removed when no message points at it (apps/mobile/__tests__/local-chat-attachments.test.ts:94-160) |
| VS Code pending attachments | extension memory | no | cleared on consume or removal (ChatStateManager.ts removePendingAttachment case) |

**Models and providers.** Whether the model can read a file depends on the selected model: a restricted free model takes images only (ChatComposerNew.tsx:2267-2285); a local on-device model on web cannot read attachments (packages/contracts/local-runtime/src/inference.ts:131); phone and Chrome compare the image count to the model's image limit (attachmentValidation.ts:187-203; side_panel.ts:10150-10160). The picker itself uses no provider.

## 7. Access and usage rules

| Rule | What the code does |
|---|---|
| Account | Web upload goes through authenticated upload routes; whether an anonymous web visitor can attach is unknown. Chrome needs a signed-in Cloud chat in ready state (side_panel.ts:10006-10017). Phone File card needs Cloud mode. CLI and VS Code need no account for local reads. |
| Permissions | Browser file chooser needs none. Phone Photos uses the system picker (no broad library permission requested first: apps/mobile/__tests__/photo-picker.test.ts:32). VS Code requires workspace trust. CLI is limited to workspace roots. |
| Subscription | Per-message file count and byte limits come from the plan limits table; every plan entry I read uses the same count constant of 20 (billing-catalog.ts:544,575,596). The server may lower or raise limits per account and offers large files to some accounts (chat-attachments.ts:43-55). |
| Limits and metering | Policy ceilings: 25 MiB per file and per message, 20 MiB per image, 20 files; without a handshake 12 MiB and 10 files (chat-attachment-policy.json:2-11). Chrome: 5 files. VS Code: 8 files per batch, 10 MB each. CLI: 12 MiB documents (cloud/attachments.rs:43-45), 40,000 characters per /files file. Whether picking a file is metered as usage: not found in the picker code. |
| Feature flags | Phone capability switches come from /api/me feature flags named capability.<name> (apps/mobile/src/lib/Capabilities.tsx:37-47). Chrome checks canUploadFiles. |
| Model compatibility | See models_and_providers. |
| Provider restrictions | none found in the code for the picker itself. |
| Local mode | Web: attachments with a local model selected block send and offer 'Switch to a cloud model' (ChatComposerNew.tsx:5333-5350). Phone Local: files are parsed on the phone, no count or message cap, File card hidden (attachmentValidation.ts:34-39; AddToChatSheet.tsx:719). CLI: local files read on the computer; images need a vision model (tui_app.rs:855-860). Chrome and VS Code: no local mode found. |

## 8. States and edge cases

| State | Behaviour | Source |
|---|---|---|
| Empty | No chips; send sends the typed text only. | use-attachments.ts:566 (attachments empty array) |
| Several files, some refused | Accepted files attach; the notice names each refused file with its reason. | use-attachments.ts:239-243 |
| Duplicate | Web: 'is already attached'; phone: 'Already attached' alert; CLI: 'already attached'. | use-attachments.ts:378; ChatInput.tsx:655-659; claude_parity.rs:400 |
| Cancel the chooser | Phone and web add nothing; phone returns [] when the picker is cancelled. | chat.tsx:1039 |
| Picker failure (phone) | Alert 'Failed to pick document. Please try again.' | chat.tsx:1043 |
| Account changes or chat changes mid-pick | Phone and VS Code drop the result when the scope or conversation epoch is no longer current. | runComposerAttachmentPick.ts:43-84; ChatStateManager.ts:3977-3995 |
| Offline | Not handled in the picker; upload failure shows retry on the chip (see upload progress feature). | uploadAttachment.ts (retries) |
| Accessibility | Web input has aria-label 'File upload'; menu row has aria-keyshortcuts; phone cards have accessibility labels. | ChatComposerNew.tsx:7021; ComposerPlusMenu.tsx:894 |

## 9. Verification

What has actually been seen by a person is in the Status table above. This section lists what exists to check with.

**Existing tests**

- `apps/web/features/chat/hooks/__tests__/useAttachments.refusals.test.tsx`: empty file, named refusal, size versus type, image ceiling, plan wording, 20 files on a paid plan
- `apps/web/features/chat/hooks/__tests__/useAttachments.pictures.test.tsx`: pictures held until metadata removed, refused with a sentence, slot freed, cleared drafts
- `apps/web/features/chat/hooks/__tests__/useAttachments.reset.test.tsx`: draft reset (title only read)
- `apps/mobile/__tests__/photo-selection-limit.test.ts`: photo picker count follows the plan; unknown plan gets the default, never unlimited
- `apps/mobile/__tests__/NewChatPhotoPickerLimit.test.tsx`: Cloud limit from server, never above plan; Local keeps plan limit
- `apps/mobile/__tests__/document-picker-mime-parity.test.ts`: picker types; Word offered only to Cloud chats
- `apps/mobile/src/features/chat/utils/__tests__/attachmentValidation.admit.test.ts`: phone admission (title only read)
- `apps/extension/__tests__/side_panel-attachment-caps.test.ts`: durable upload, send gated until failed upload fixed, count cap on drop and paste
- `apps/extension-vscode/src/__tests__/webviewAttachFiles.test.ts`: attachFiles message schema: names, data URLs, 8 files, 10 MB
- `apps/extension-vscode/src/__tests__/webviewAttachmentCap.test.ts`: webview ceiling at exactly and one byte above
- `apps/cli/src/agent/mod.rs`: unit test attach_context_files_adds_file_contents_to_session_context (line 4165)
- `apps/cli/src/tui/tui_app.rs`: unit tests for chip row, removal, non-image path refusal (lines 10765-10813)

**Test scenarios**

- **Web multi-select with one bad file**
  1. Open the web composer.
  2. Choose Add photos & files and select a PDF, a PNG and a zero-byte text file.
  - Expected: Two chips; a notice 'Attached 2 of 3 files. Not attached: ... (empty)'.
- **Duplicate pick**
  1. Attach report.pdf.
  2. Pick the same file again.
  - Expected: Still one chip; notice says it is already attached.
- **Phone Cloud vs Local card**
  1. Open the attach sheet in Cloud mode and note the File card.
  2. Switch to Local mode and reopen the sheet.
  - Expected: File card present in Cloud, absent in Local; Local shows the note about text in photos.
- **CLI path and scope**
  1. In the CLI run /attach on a PDF in the workspace.
  2. Run /attach on a file outside the workspace.
  3. Run /files notes.txt.
  - Expected: First stages a chip; second is refused; third reports 'attached:'.
- **VS Code batch limit**
  1. Use Attach workspace files and select 10 text files.
  - Expected: 8 attach; warning says to choose up to 8 at a time.

**Where to look when it fails**

- Web: composer notice text; browser console for upload errors.
- CLI: 'Could not attach <path>: <reason>' system message.
- VS Code: warning toast; attachFilesAck skipped reasons in the webview.
- Chrome: composerAttachmentNotices strip text; spAttachmentUploadsOff notice means intake gate closed.

**Hands-on test plans**

- Web: [70-qa/test-plans/web/014-attachment-intake-components.md](../../70-qa/test-plans/web/014-attachment-intake-components.md)
- Desktop: [70-qa/test-plans/desktop/014-attachment-intake-components.md](../../70-qa/test-plans/desktop/014-attachment-intake-components.md)
- Mobile: [70-qa/test-plans/mobile/014-attachment-intake-components.md](../../70-qa/test-plans/mobile/014-attachment-intake-components.md)
- CLI: [70-qa/test-plans/cli/014-attachment-intake-components.md](../../70-qa/test-plans/cli/014-attachment-intake-components.md)
- VS Code: [70-qa/test-plans/vscode/014-attachment-intake-components.md](../../70-qa/test-plans/vscode/014-attachment-intake-components.md)
- Chrome: [70-qa/test-plans/chrome/014-attachment-intake-components.md](../../70-qa/test-plans/chrome/014-attachment-intake-components.md)

## 10. Gaps and dependencies

- **Phone File card missing in Local mode** Affects: Phone Local mode. Evidence: AddToChatSheet.tsx:719; chat.tsx:1029-1040. Work needed: Decide whether Local documents should be attachable and, if yes, show the card for the local types.
- **No picture-metadata removal on Chrome and VS Code intake** Affects: Chrome, VS Code. Evidence: stripImageMetadata used only in web and phone sources (searched apps/extension/src, apps/extension-vscode/src); web copy promises removal before leaving the device (attachment-metadata.ts:17). Work needed: Call the shared remover and refuse unreadable pictures.
- **VS Code picker rejects PDF and Office** Affects: VS Code. Evidence: ChatStateManager.ts:4024. Work needed: Product decision on supported types.
- **Plan limits differ per app for the same account (web 20 files, Chrome 5, VS Code 8, phone plan count)** Affects: All. Evidence: freeTrialClient.ts:103; webviewMessages.ts:172; billing-catalog.ts:544. Work needed: Decide whether one count applies everywhere.

**Depends on**

- SYS-files-artifacts-and-storage
- SYS-subscriptions-entitlements-and-usage
- SYS-api-and-contracts
- SYS-execution-boundaries
- SYS-local-inference
- SYS-security-and-privacy
- SYS-shared-ui-and-design
- surface:web
- surface:desktop
- surface:mobile
- surface:cli
- surface:vscode
- surface:chrome
- mode:local
- mode:cloud
- file:apps/web/features/chat/hooks/use-attachments.ts
- api:GET /api/me

## Unknown

- Whether an anonymous web visitor can attach files.
- Whether the phone File card hiding in Local mode is intended.
- How the CLI image path treats picture location data (the image encoder crate was not opened).
- Which provider receives VS Code attachments and under which mode (the thread runtime was not opened).
- Whether picking a file is counted as usage before send.
