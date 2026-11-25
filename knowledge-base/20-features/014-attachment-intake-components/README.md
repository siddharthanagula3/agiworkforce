---
id: "AREA-014"
type: "area"
title: "Attachment intake components"
features: ["F014-01", "F014-02", "F014-03", "F014-04", "F014-05", "F014-06", "F014-07", "F014-08", "F014-09", "F014-10", "F014-11", "F014-12"]
basis: "code inspection"
last_reviewed: "2026-11-24"
revision: "f51d16e747"
---
# 14. Attachment intake components

A person adds a file, picture, screenshot or web page to the message they are writing, sees it as a small chip, and the assistant reads it when the message is sent. Without this, the assistant cannot work with the user's own documents or what is on their screen. Each app offers the subset of ways to add context that fits that app, and every app tells the person when a file is refused, cut short or cannot be read.

**Who uses it.** Every signed-in user of the web app, the desktop shell (which runs the same web composer) and the phone app. Phone camera use is gated by a capability flag. Large files (above the 25 MiB inline limit) are offered only when the server says the plan allows them and the server switch CHAT_LARGE_FILES_ENABLED is on. Developers and local users of the CLI, VS Code extension and Chrome side panel use the local variants (paths, pages, pasted images). No admin-only path was found in this area.

## Features in this area

| ID | Feature | Web | Desktop | Mobile | CLI | VS Code | Chrome |
|---|---|---|---|---|---|---|---|
| [F014-01](F014-01-pick-files-from-the-device.md) | Pick files from the device | built | built | built | built | built | built |
| [F014-02](F014-02-drag-drop-and-paste-into-the-composer.md) | Drag, drop and paste into the composer | built | built | partly | built | built | built |
| [F014-03](F014-03-take-a-photo-with-the-camera.md) | Take a photo with the camera | no | no | built | n/a | n/a | no |
| [F014-04](F014-04-choose-photos-from-the-photo-library.md) | Choose photos from the photo library | built | built | built | n/a | n/a | built |
| [F014-05](F014-05-screenshot-and-window-capture.md) | Screenshot and window capture | no | built | n/a | no | no | built |
| [F014-06](F014-06-attach-a-web-page-by-its-link.md) | Attach a web page by its link | n/a | n/a | n/a | built | built | built |
| [F014-07](F014-07-attach-from-the-library-a-repository-or-a-folder.md) | Attach from the Library, a repository or a folder | built | built | partly | partly | no | no |
| [F014-08](F014-08-cloud-drives-audio-and-video.md) | Cloud drives, audio and video | no | no | no | no | no | no |
| [F014-09](F014-09-see-preview-remove-and-replace-attachments.md) | See, preview, remove and replace attachments | partly | partly | partly | partly | partly | partly |
| [F014-10](F014-10-upload-progress-retry-and-cancel.md) | Upload progress, retry and cancel | partly | partly | partly | n/a | n/a | n/a |
| [F014-11](F014-11-limits-duplicates-and-refusals.md) | Limits, duplicates and refusals | built | built | built | built | partly | partly |
| [F014-12](F014-12-retention-and-model-fit.md) | Retention and model fit | built | built | partly | partly | no | partly |

Requirement items for this area: [10-requirements/capabilities/014-attachment-intake-components.md](../../10-requirements/capabilities/014-attachment-intake-components.md).

## How this area works in the code

1. **1. The person adds a file (pick, drop, paste, camera, capture or Library).** On web and desktop the plus menu, the hidden file input and the drop overlay all call the same handler that adds files to the draft. A paste is first sorted into text or files before it reaches the handler. (`apps/web/features/chat/components/Composer/ChatComposerNew.tsx:7011-7021`, `apps/web/features/chat/components/Composer/ChatComposerNew.tsx:2301-2303`, `apps/web/features/chat/components/Composer/ChatComposerNew.tsx:4893`, `apps/web/features/chat/components/Composer/ChatComposerNew.tsx:2376-2397`, `apps/web/features/chat/components/Composer/DragDropOverlay.tsx:55`, `apps/web/features/chat/components/Composer/ComposerPlusMenu.tsx:147`)
2. **2. The draft checks each file in one place.** useAttachments.admitFiles checks, in order: duplicate, slot count, empty, size for the plan, supported type, image size, large-file offer, message budget. Each refused file gets one reason; the notice is built from all of them. (`apps/web/features/chat/hooks/use-attachments.ts:332-445`, `apps/web/features/chat/hooks/use-attachments.ts:222-240`, `apps/web/features/chat/hooks/use-attachments.ts:161-191`, `apps/web/features/chat/hooks/use-attachments.ts:268-274`)
3. **3. Pictures get their location and camera details removed.** Files that carry picture metadata are cleaned before they are accepted. While this runs the draft shows a preparing state. A file that cannot be cleaned is refused with its own notice. (`apps/web/features/chat/hooks/use-attachments.ts:466-508`, `apps/web/features/chat/hooks/use-attachments.ts:279`, `apps/web/features/chat/hooks/use-attachments.ts:308-330`)
4. **4. The chip is drawn and can be removed.** Each accepted file gets an object URL for its thumbnail, then a chip with icon, name, size and upload status. Removing a chip revokes its URL and drops it from the draft. (`apps/web/features/chat/components/Composer/AttachmentPreview.tsx:95-131`, `apps/web/features/chat/components/Composer/AttachmentPreview.tsx:132-186`, `apps/web/features/chat/components/Composer/AttachmentPreview.tsx:188-200`, `apps/web/features/chat/hooks/use-attachments.ts:531-547`)
5. **5. On send the files upload to private storage.** WebChatPage starts the upload for the message's files. The upload service prepares files and calls the managed-cloud client, which asks the server for an upload address, sends the bytes, then asks the server to complete. Phases are preparing, uploading, verifying, complete or failed. (`apps/web/features/chat/pages/WebChatPage.tsx:2685-2690`, `apps/web/features/chat/services/chat-attachment-upload.ts:574-600`, `packages/contracts/cloud-contracts/src/managed-cloud-chat-attachments-client.ts:71-72`, `packages/contracts/cloud-contracts/src/managed-cloud-chat-attachments-client.ts:329-436`)
6. **6. The server checks and stores the file.** The presign route issues the address. The complete route checks the owner, the type and the size, then the storage quota (not for temporary chats), malware scan, and the workspace data-loss check, then writes the file and creates the attachment record. Failed checks delete the uploaded copy. (`apps/web/app/api/uploads/presign/route.ts:271-272`, `apps/web/app/api/uploads/chat-attachment/complete/route.ts:21-53`, `apps/web/lib/server/chat-attachment-completion.ts:302-345`, `apps/web/lib/server/chat-attachment-completion.ts:397-419`, `apps/web/lib/server/chat-attachment-completion.ts:461-480`)
7. **7. The server tells the client its limits.** For each plan the server computes the per-file, per-image and per-message limits. For a large-file offer it also computes the storage left and the inline budget. If the large-file check is not ready, the inline limits are sent instead. (`apps/web/lib/server/attachment-allowance.ts:88-100`, `apps/web/lib/server/attachment-allowance.ts:273-310`, `apps/web/features/chat/services/chat-attachment-upload.ts:139`, `packages/contracts/cloud-contracts/src/chat-attachment-policy.json:1-16`)
8. **8. The chat request reads the attachments and drops what does not fit.** The chat request carries file parts that name an asset. The server looks up each asset, reads its text or pages within the turn budget, and records which files were cut short or left out. (`apps/web/app/api/llm/v1/chat/completions/lib/chat-attachment-hydration.ts:200-226`, `apps/web/app/api/llm/v1/chat/completions/lib/chat-attachment-hydration.ts:486-500`, `apps/web/app/api/llm/v1/chat/completions/lib/request-processor.ts:4160-4167`)
9. **9. The client shows the partial-read notice.** The server sends the cut-short file names in a response header. The stream code stores them on the user message, and the message bubble shows a notice naming the files. (`apps/web/lib/hooks/useChatStream.ts:4701-4705`, `apps/web/features/chat/components/messages/MessageBubble.tsx:846-849`)

## Files to know

| File | Role |
|---|---|
| `apps/web/features/chat/hooks/use-attachments.ts` | Web intake rules: duplicate, size, type, budget and refusal notices for each draft. |
| `apps/web/features/chat/components/Composer/ChatComposerNew.tsx` | Web composer: wires the file input, drop, paste, Library and clipboard into the draft, and shows the model-fit warning. |
| `apps/web/features/chat/components/Composer/ComposerPlusMenu.tsx` | The plus menu: Add photos and files, Add from library, desktop-only rows and the retention note. |
| `apps/web/features/chat/components/Composer/AttachmentPreview.tsx` | Web chips: thumbnails, icons, name and size, upload phase labels, Retry and cancel-or-remove. |
| `apps/web/features/chat/services/chat-attachment-upload.ts` | Web upload service: prepares files, runs the managed upload, keeps large-file sessions in browser storage. |
| `apps/web/lib/server/chat-attachment-completion.ts` | Server: checks an upload is complete, scans and checks content, stores it and creates the attachment record. |
| `apps/web/app/api/llm/v1/chat/completions/lib/chat-attachment-hydration.ts` | Server: reads each attachment into the model request inside the turn budget and reports cut-short files. |
| `packages/contracts/cloud-contracts/src/chat-attachment-policy.json` | Shared numbers: per-file, per-image and per-message sizes, file count, accepted types and large-file settings. |
| `apps/mobile/src/features/chat/components/AddToChatSheet.tsx` | Phone attach sheet: Camera, Photos, Paste image, File and Library cards, with the retention note. |
| `apps/mobile/src/features/chat/components/AttachmentPreview.tsx` | Phone chips: thumbnails, icons, progress bar, Retry, cancel and full-screen image view. |
| `apps/desktop/electron/screenshot.ts` | Desktop capture: screen and window capture, clipboard handoff, paste into the composer, clipboard restore. |
| `apps/cli/src/tui/tui_app.rs` | CLI /attach, staged list, Ctrl+V image paste, image and document staging with model checks. |
| `apps/cli/src/agent/mod.rs` | CLI /files reader: text-only, per-file and total character budgets, duplicate and failure reporting. |
| `apps/extension-vscode/src/features/sidebar-webview/webviewContent.ts` | VS Code webview: drop, paste, file reading, chips and the attachment acknowledgement. |
| `apps/extension-vscode/src/features/sidebar-webview/ChatStateManager.ts` | VS Code host: decodes files, applies the 10 MB and text limits, returns the acknowledgement. |
| `apps/extension/src/side_panel.ts` | Chrome side panel: attach menu, screenshot, link, upload, drop and paste intake and chips. |

## What is stored

- Attachment records for files kept in the Library (not temporary chats): Database table public.media_assets, written by apps/web/lib/server/media-assets.ts (insert at lines 75 and 140) from apps/web/lib/server/chat-attachment-completion.ts:461.
- Uploaded bytes for a chat file, in private object storage, deleted again when a check fails: Private object storage through putPrivateObject (apps/web/lib/server/chat-attachment-completion.ts:around 440-460); purged by purgeChatAttachmentUpload (chat-attachment-completion.ts:141).
- Temporary-chat flag on each attachment (decides whether it is kept in the Library): Read from the conversation row (is_temporary) in apps/web/lib/server/chat-attachment-completion.ts:92-112.
- Resumable large-file upload session records: Browser localStorage under a key built from the owner id and file fingerprint (apps/web/features/chat/services/chat-attachment-upload.ts:212-236).
- Thumbnail object URLs and the File objects of the unsent draft: Browser memory; URLs are created in apps/web/features/chat/hooks/use-attachments.ts:323 and revoked on remove or clear.
- Upload phase and per-file status of a phone attachment: Phone upload lifecycle store (useUploadLifecycleStore) used by apps/mobile/src/features/chat/components/AttachmentPreview.tsx:181-191.
- Phone draft attachments kept with the typed text: Phone draft store via setDraft in apps/mobile/src/features/chat/components/ChatInput.tsx:770-780.
- Document text parsed on the phone in local mode: Read into the phone's JavaScript memory by services/docParser (described at apps/mobile/src/features/chat/utils/attachmentValidation.ts:9-12); not stored by this code.
- VS Code pending attachments (images as data URLs, text as strings) until sent, consumed or released: Extension host memory: _pendingAttachments and _pushTextAttachment in apps/extension-vscode/src/features/sidebar-webview/ChatStateManager.ts:2176-2236.
- CLI staged images and documents, and /files text: Session memory: pending_image_blocks and staged_images (apps/cli/src/tui/tui_app.rs:832-915) and attached_context_files (apps/cli/src/agent/mod.rs:1462-1530).
- Chrome side panel pending documents and attachment state: Side panel memory (composer attachment intakes, pendingDocuments) in apps/extension/src/side_panel.ts:1181-1187; persistence after the panel closes was not established.

## Switches

Plan gates, flags and settings that turn parts of this area on or off.

- **Plan limits: per-file size, per-message size, per-message file count, daily upload and concurrent large-file counts**: Set the caps each plan gets. The numbers are in the billing catalog; the functions only read them. (packages/contracts/types/src/billing-catalog.ts:757-790 (getPlanMaxAttachmentBytes, getPlanMaxChatFileBytes, getPlanMaxAttachmentsPerMessage and the daily and concurrent getters); used by apps/web/lib/server/attachment-allowance.ts:88-100.)
- **CHAT_LARGE_FILES_ENABLED (environment, values on or off, default off)**: When off, files over the inline limit are refused; when on, the server may offer large files once readiness checks pass. (Published in apps/web/lib/validate-env.ts:1571-1578; read by chatLargeFilesFlagOn in apps/web/lib/server/chat-file-intake/readiness.ts:41-43 and checked at readiness.ts:180-183.)
- **Large-file readiness (scanner capability and schema check)**: If not ready, the client gets today's inline limits only. (apps/web/lib/server/chat-file-intake/readiness.ts:180-183; apps/web/lib/server/attachment-allowance.ts:273-290.)
- **Server-offered limits (largeFilesAvailable, inlineMessageBytes, storageRemainingBytes)**: Changes what the composer allows: the large-file path, the inline budget and remaining storage. (apps/web/features/chat/hooks/use-attachments.ts:268-274; apps/web/features/chat/services/chat-attachment-upload.ts:139.)
- **Restricted free chat (disables the file input and attach rows)**: The hidden file input is disabled, and attachments are unavailable in image or video modes where the model cannot take them. (apps/web/features/chat/components/Composer/ChatComposerNew.tsx:1580-1583 and 7015.)
- **Desktop host present (shows desktop-only rows: Attach clipboard, Use this computer, local folder)**: Adds desktop-only rows to the plus menu. (apps/web/features/chat/components/Composer/ComposerPlusMenu.tsx:1287-1290; apps/web/features/chat/components/Composer/ChatComposerNew.tsx:6014-6019.)
- **Screenshot and window shortcuts (desktop)**: Bind the capture actions to keys and menu items. (apps/desktop/electron/shortcuts.ts:100; apps/desktop/electron/tray.ts:180-181; apps/desktop/electron/main.ts:1937-1938.)
- **Phone camera capability (canUseCamera)**: Shows or hides the Camera card. (apps/mobile/src/features/chat/components/AddToChatSheet.tsx:202 and 694.)
- **Phone app mode (cloud or local)**: Cloud mode shows the File card and uses the cloud limits; local mode parses documents on the phone with the device limit. (apps/mobile/src/features/chat/components/AddToChatSheet.tsx:719; apps/mobile/src/features/chat/utils/attachmentValidation.ts:34-45.)
- **Phone photo selection count (per plan)**: Caps how many photos one pick can select. (apps/mobile/src/features/media/photo-picker.ts (selectionLimit); apps/mobile/src/features/chat/utils/photoSelectionLimit.ts:3-5.)
- **Phone upload retry count (2)**: Number of extra upload attempts after a failure. (apps/mobile/src/features/chat/upload/uploadAttachment.ts:15.)
- **VS Code limits (10 MB per file, 8 files per batch, 40,000 text characters)**: Refuses larger files, limits batch size, and cuts long text. (apps/extension-vscode/src/protocol/webviewMessages.ts:171-172; apps/extension-vscode/src/features/sidebar-webview/ChatStateManager.ts:275.)
- **Chrome attachment count (5) and per-file size**: Caps the number of managed-cloud attachments in the side panel. (apps/extension/src/features/cloud-bridge/freeTrialClient.ts:103-104; apps/extension/src/side_panel.ts:14286.)
- **CLI /files budgets (120,000 characters total, 40,000 per file)**: Cuts large text files and reports them as truncated. (apps/cli/src/agent/mod.rs:1467-1468.)
- **CLI image original size flag (--full)**: Attaches the image without scaling it down. (apps/cli/src/tui/tui_app.rs:836-870 (PromptImageMode) and the help text in the ADD_CONTEXT_MENU constant.)

## Shared between apps

Shared: the upload contract and limits in packages/contracts/cloud-contracts (chat-attachments.ts, managed-cloud-chat-attachments-client.ts, chat-attachment-policy.json), used by the web app, desktop and phone (phone also reads the shared MAX_ATTACHMENT_BYTES from packages/contracts/types/src/chat.ts:93) and Chrome (apps/extension/src/side_panel.ts imports the managed client). The server routes and completion logic in apps/web are shared by web, desktop, phone and Chrome. The web composer (apps/web/features/chat/components/Composer, use-attachments) is shared by web and desktop, since the desktop window shows the hosted web app; desktop adds its own capture code in apps/desktop/electron/screenshot.ts. Separate per app: phone components in apps/mobile/src/features/chat, the VS Code webview and host (apps/extension-vscode, the webview is an HTML string inside TypeScript), the Chrome side panel (apps/extension/src/side_panel.ts), and the CLI in Rust (apps/cli). The paste helper filesFromDataTransfer (packages/utils composer-paste) is used by Chrome.

## Looks wrong in the code

From reading only; not confirmed in the running app. Each line is also in the gap register.

- VS Code repository (S14.11) and folder (S14.12) are marked done, but no repository or folder context kind exists. The list of context kinds has only selection, open files, problems, git diff, terminal and url, and the workspace picker has folder selection turned off. The brief's code refs (webviewContent.ts:2710, ChatStateManager.ts:739) do not show this. (apps/extension-vscode/src/protocol/webviewMessages.ts:145-152; apps/extension-vscode/src/features/sidebar-webview/ChatStateManager.ts:3985 (canSelectFolders: false).)
- A VS Code file that fails to read in the webview is never sent, but its chip may look attached. The read step drops unread files from the payload; the acknowledgement handler then clears the uploading state on every chip whose name is not in the skipped list and gives it no host id. Matching is by name, so two files with the same name can mix up. (apps/extension-vscode/src/features/sidebar-webview/webviewContent.ts:7671-7703 (payload built, unread files dropped) and 8476-8505 (ack handler). Read-only reading, not run.)
- CLI folder attachment (S14.12) gives the model a listing of entry names, not the contents of the files in the folder. The brief says the assistant can use the files inside. (apps/cli/src/mentions.rs:344-350 (listing inserted) and 468-474 (directory_listing).)
- Phone paste-image (S14.03) is marked missing in the brief, but the attach sheet shows a Paste image card when the clipboard holds an image, and the handler exists. (apps/mobile/src/features/chat/components/AddToChatSheet.tsx:628 and 710-713; apps/mobile/app/(app)/(tabs)/chat.tsx:986-1001.)
- Phone image preview (S14.30) is marked missing in the brief, but tapping an image thumbnail opens a full-screen view. Documents still have no preview. (apps/mobile/src/features/chat/components/AttachmentPreview.tsx:233 (onViewImage), 590-613 (ImageFullScreen).)
- Phone File card (document picker, S14.01) is shown only in cloud mode, while the brief marks the phone as done without a mode note. (apps/mobile/src/features/chat/components/AddToChatSheet.tsx:719-727.)
- Chrome retention note (S14.34) is marked done, but the brief's reference (messages.json:593) is the project chip label. The only text in the composer's retention slot is the adding status. The general privacy page is the only retention wording found. (apps/extension/_locales/en/messages.json:584-600; apps/extension/src/side_panel.ts:10782-10792; apps/extension/src/features/privacy/dataHandling.ts:51.)
- Many brief code references point to unrelated lines: for example ChatComposerNew.tsx:1104 and 1952 (config and typing timer), stream-transform.ts:873 (incomplete-stream log), useChatStream.ts:3880 (research panel), request-processor.ts:3182 (workspace model default), CLI claude_parity.rs:278 (a slash-command table). The real locations are given in this guide. (apps/web/features/chat/components/Composer/ChatComposerNew.tsx:1100-1108 and 1930-1960; apps/web/app/api/llm/v1/chat/completions/lib/stream-transform.ts:866-884; apps/web/lib/hooks/useChatStream.ts:3876-3886.)
- CLI repository attachment (S14.11) cites lib.rs:417, which is the help text for the worktree launch flag, not a context attachment. No repository-as-context attach path was found in the CLI. (apps/cli/src/lib.rs:412-416.)
- Desktop and web screenshot (S14.06) in the brief points to plus-menu rows, but the plus menu has no screenshot row on plain web; the screenshot paths found run through the desktop shell bridge. (apps/web/features/chat/components/Composer/ComposerPlusMenu.tsx:1287-1290; apps/web/features/desktop-host/lib/runtime-client.ts:542 and 571-574.)

## Not established

- Exact per-plan numbers (files per message, photo count, storage, daily uploads) live in the billing catalog; only the functions that read them were opened.
- The upload storage route /api/uploads/chat-attachment/put and the object storage module were not read.
- Whether drop onto the whole chat page (WebChatPage) works as the brief says; WebChatPage only passes files down through droppedFiles (ChatComposerNew.tsx:2421-2439) and was not traced in full.
- The 'kept after cancel' behaviour on web (showKeptAttachments in WebChatPage) was seen only by name.
- Scanner and data-loss (DLP) decision rules were only called, not read.
- Whether a Chrome attachment survives closing the side panel; not established.
- Whether the desktop Local folder attach (LocalFolderRow) is part of this area; it is not in the brief's status list.
- The VS Code and Chrome acknowledgement and chip rendering were read in part; the full chip markup was not.
- Mobile local-mode document parsing (services/docParser) was not read in full.
- Whether the phone full-screen image view works for local images; only the call site was read.
- No test, build or run was done (read-only task). Nothing here was executed; all statements come from reading the code.
