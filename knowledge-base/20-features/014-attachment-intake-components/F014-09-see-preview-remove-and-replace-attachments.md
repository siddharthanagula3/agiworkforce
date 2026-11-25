---
id: "F014-09"
type: "feature"
title: "See, preview, remove and replace attachments"
aliases: ["Attachment chip", "Attachment thumbnail", "File-type icon", "Remove attachment", "Attachment preview", "Attachment replacement", "S14.16", "S14.17", "S14.18", "S14.22", "S14.28", "S14.29", "S14.30"]
area: "14 Attachment intake components"
available_on: ["web", "desktop", "mobile", "cli", "vscode", "chrome"]
implementation: {web: "partial", desktop: "partial", mobile: "partial", cli: "partial", vscode: "partial", chrome: "partial"}
verification: {web: "partly seen (3 of 5)", desktop: "not seen by a person", mobile: "not seen by a person", cli: "not seen by a person", vscode: "not seen by a person", chrome: "not seen by a person"}
requirement_items: ["S14.16", "S14.17", "S14.18", "S14.22", "S14.28", "S14.29", "S14.30"]
depends_on: ["surface:web", "surface:desktop", "surface:mobile", "surface:cli", "surface:vscode", "surface:chrome", "file:apps/web/features/chat/hooks/use-attachments.ts", "F014-10", "F014-11", "F014-12", "SYS-shared-ui-and-design", "SYS-files-artifacts-and-storage"]
basis: "code inspection"
second_reader: "5 of 12 sampled statements were correct; the others were corrected on this page"
last_reviewed: "2026-11-24"
revision: "f51d16e747"
---
# F014-09 See, preview, remove and replace attachments

Shows each attachment before sending as a chip: a thumbnail for images, an icon with kind and size for documents, and a remove control. Web and desktop, phone, VS Code and Chrome have chips; the CLI lists staged items in text. Only the phone opens an image full screen. No app replaces a file in place.

Area: [14. Attachment intake components](README.md). Requirement items: [S14.16](../../10-requirements/capabilities/014-attachment-intake-components.md#s1416), [S14.17](../../10-requirements/capabilities/014-attachment-intake-components.md#s1417), [S14.18](../../10-requirements/capabilities/014-attachment-intake-components.md#s1418), [S14.22](../../10-requirements/capabilities/014-attachment-intake-components.md#s1422), [S14.28](../../10-requirements/capabilities/014-attachment-intake-components.md#s1428), [S14.29](../../10-requirements/capabilities/014-attachment-intake-components.md#s1429), [S14.30](../../10-requirements/capabilities/014-attachment-intake-components.md#s1430).

## Status

Two separate questions: is the code there, and has a person seen it work. "Seen working" comes only from results of real runs recorded in the project's ledger.

| App | In the code: this page's reading, 2026-11-24 | In the code: ledger audit, 2026-09-26 and later updates | Seen working by a person |
|---|---|---|---|
| Web | partly built | partly built | partly seen (3 of 5) |
| Desktop | partly built | partly built | not seen by a person |
| Mobile | partly built | partly built | not seen by a person |
| CLI | partly built | partly built | not seen by a person |
| VS Code | partly built | partly built | not seen by a person |
| Chrome | partly built | partly built | not seen by a person |

The first column was derived from this page's text by a second, cheaper pass and has not been validated item by item; the ledger column is the project's own record. Neither is a test result.

## 1. Purpose and user value

**What it does.** Lets the person see what is attached, tell files apart, and take one out before the message goes.

**Why it exists.** A person must be sure the right files go to the model and must be able to undo a mistake. Brief items S14.16 to S14.18, S14.22, S14.28 to S14.30.

**Who uses it.** Everyone who attaches files on any app.

**Problems it solves**

- Sending the wrong file
- Not knowing whether a file is still uploading or ready
- Telling several files with similar names apart

**Use cases**

- Drop two pictures on web, see two thumbnails numbered in image-edit mode, remove one.
- Phone: tap a picture chip to look at it full screen, then remove it.
- CLI: run /attach list to see what is staged, /attach remove 2 to drop one.
- VS Code: drag a file in, see its icon and size, press the X.

## 2. User experience

**Where to find it**

- Web and desktop: row of chips above the text box in the composer (apps/web/features/chat/components/Composer/ChatComposerNew.tsx:5781; apps/web/features/chat/components/Composer/AttachmentPreview.tsx).
- Phone: horizontal strip labelled 'Attached files' above the input (apps/mobile/src/features/chat/components/AttachmentPreview.tsx:579).
- CLI: '/attach list', '/attach remove [n|all]' (alias 'rm') and a chip line starting with a paperclip (apps/cli/src/tui/tui_app.rs:6215-6250, :3278). The list and removal cover staged images only; the command also accepts local file paths, not just images [tui_app.rs:6222-6250, :943].
- VS Code: attachment strip in the sidebar chat (apps/extension-vscode/src/features/sidebar-webview/webviewContent.ts:7568).
- Chrome: chips in the side panel composer (apps/extension/src/side_panel.ts:10416).

**Before you start**

- At least one file added to the draft.

**Screens and controls**

- Web image chip: 56 px square thumbnail, tooltip with name and size, a corner X with label 'Remove {name}'; images may carry a number 'Image N' in image-edit or video-reference mode (AttachmentPreview.tsx:188-247).
- Web document chip: icon, name shortened to 20 characters, and 'Kind · size' where Kind is PDF, Spreadsheet, Code, Document, Text, Presentation or File (AttachmentPreview.tsx:31-83, :249-295).
- Web: after 4 document chips a toggle 'Show all attachments' / 'Show fewer attachments'; images are never hidden (AttachmentPreview.tsx:85-86, :313-380).
- Phone image tile 72 px, document tile 96 px wide with icon, name, 'Kind · size'; tap an image to open it full screen (accessibility hint 'Shows the picture full screen'); X labelled 'Remove {name}' (AttachmentPreview.tsx:187-260).
- Phone overlays: 'No longer available' when the source file is gone (line 385).
- CLI staged label: 'path (size)' or 'path (size, full resolution)' (tui_app.rs:871-876).
- VS Code chip: icon by extension or image thumbnail, name, size (only when the file object is known), x labelled 'Remove attachment {name}' (webviewContent.ts:7544-7627).
- Chrome chip: 48 px thumbnail or icon, file name, a status line and an x labelled 'Remove {file}' (side_panel.ts:10416-10470); no size shown.

**Journey**

1. Add one or more files.
2. A chip appears for each.
3. Check name, kind and size; on phone tap an image to view it.
4. Press the X (or /attach remove) on any chip to take it out.
5. Send; removed files are not sent.

**What the person sees and gets**

- A ready draft chip shows no progress text on web (AttachmentPreview.tsx:147 returns nothing for 'ready' or 'complete').
- Phone ready chip shows no overlay.
- CLI: 'Removed {label}.' or 'Removed N staged image(s).' or 'Nothing staged for the next turn.' (tui_app.rs:943-962, :6223).

**Settings**

- none found

## 3. Current implementation

From reading the code. Not a test result.

**Working in the code**

- Web/desktop chips with thumbnails, kind icons, size, remove, collapse and image numbering (apps/web/features/chat/components/Composer/AttachmentPreview.tsx).
- Removal releases the preview URL and frees the file count and byte budget (apps/web/features/chat/hooks/use-attachments.ts:531-547).
- Phone chips with thumbnails, kind icons, size, remove and full-screen image view (apps/mobile/src/features/chat/components/AttachmentPreview.tsx:187-260, :609).
- CLI staged-image list with sizes and removal by number or all (apps/cli/src/tui/tui_app.rs:6222-6250, :943); the list holds staged images only, the error for a bad number reads 'Not a staged image number', and 'rm' works as an alias for remove.
- VS Code chips with icon, name, size and remove; removal of a not-yet-acknowledged chip is deferred until the host assigns an id (webviewContent.ts:7594-7612).
- Chrome chips with thumbnail or icon, name and remove, which also aborts an upload in flight (apps/extension/src/side_panel.ts:10312-10319).

**Incomplete**

- Web image chips show size only in a tooltip, not as visible text (AttachmentPreview.tsx:222).
- Chrome chips show no size (side_panel.ts:10416-10470).
- CLI has no thumbnail or icon; files added with /files appear as a path list in /files with no sizes and no per-file remove command was found (apps/cli/src/claude_parity.rs:416-433).
- VS Code size is shown only for files with a size known to the page, which is the drag, drop and paste path; picker-added files go through a different message (ChatStateManager.ts:3976-4040) [inferred].

**Present but disconnected or switched off**

- none found

**Not available**

- Replace in place: no app (brief S14.29; no code found).
- Preview of a document or full content before sending: all apps.
- Image full-screen preview: web, desktop, CLI, VS Code, Chrome (phone only).
- File-type icons in the CLI.

## 4. Required behaviour

**Established requirements**

- An attached image shows a small thumbnail in the composer before sending. (source: brief S14.16)
- Each non-image attachment shows an icon matching its type (PDF, spreadsheet, code, other). (source: brief S14.17)
- Each attachment shows its name and size before sending. (source: brief S14.18)
- The composer makes clear when an attachment is ready and the message can be sent. (source: brief S14.22)
- Each attachment can be removed before sending and a removed file is not sent. (source: brief S14.28)
- An attached file can be replaced in place keeping its position. (source: brief S14.29)
- Before sending the user can open an attachment to view it at full size or read its content. (source: brief S14.30)
- Attachment-ready controls with honest unavailable states. (source: doc: docs/product/requirements.md (line ~808))

**Acceptance criteria**

1. Each image on web and phone shows a thumbnail; each document shows an icon, name and size.
2. Pressing X removes exactly that chip; the removed file is absent from the sent message.
3. On web, with 5 documents attached, 4 show and 'Show all attachments' reveals the fifth; images stay visible.
4. On the phone, tapping an image chip opens it full screen and closing returns to the draft.
5. CLI '/attach list' numbers staged images and '/attach remove 1' removes the first.
6. Chrome and VS Code chips each have a remove control with a name in its accessible label.

**Inferred requirements** (not stated anywhere; reasoned from the code or from competitor parity)

- Replace and preview are not required by any decision record found; the brief marks them missing, not built [inferred].

**Proposed improvements** (suggestions, not requirements)

- [proposed] Show size as visible text on web image chips and on Chrome chips.
- [proposed] Add a document preview before send, starting with images and text on web.
- [proposed] Add 'Replace' to the chip menu on web and phone.

## 5. Implementation map

| Kind | Name | Path | Role |
|---|---|---|---|
| component | AttachmentPreview (web) | `apps/web/features/chat/components/Composer/AttachmentPreview.tsx` | Image thumbnail, document chip, remove button, upload status and collapse toggle. |
| hook | useAttachments | `apps/web/features/chat/hooks/use-attachments.ts` | Holds files and preview URLs; removeFile (531) and clearAll (549). |
| component | ChatComposerNew | `apps/web/features/chat/components/Composer/ChatComposerNew.tsx` | Mounts the chip rows (5769, 5781), defers send while an attachment is being prepared (deferredSendRef, 3596-3600), and blocks send when a local model is selected with any attachment (localAttachmentConflict, 1589, 3596, banner 5333-5345). |
| component | AttachmentPreview (phone) | `apps/mobile/src/features/chat/components/AttachmentPreview.tsx` | Tiles, overlays, remove and image viewer. |
| component | ImageFullScreen | `apps/mobile/src/features/chat/components/ImageFullScreen.tsx` | Full-screen image view opened from a chip. |
| component | ChatInput (phone) | `apps/mobile/src/features/chat/components/ChatInput.tsx` | Owns the attachment list and the missing-file alert (line 869). |
| service | formatAttachmentSize | `apps/mobile/src/features/chat/utils/attachmentSize.ts` | Size text on phone chips. |
| command | /attach list and remove | `apps/cli/src/tui/tui_app.rs` | Staged-image list (labels at 871-876), chip line and removal (6215-6250, 943, 3278); alias 'rm'. |
| component | makeAttachmentChip | `apps/extension-vscode/src/features/sidebar-webview/webviewContent.ts` | VS Code chip builder with icon table (7544-7627). |
| service | removePendingAttachment handler | `apps/extension-vscode/src/features/sidebar-webview/ChatStateManager.ts` | Host side removal of a pending attachment from the in-memory pending list and from in-flight, queued and steering sends; deletes no file (2239-2248). |
| component | renderComposerDocumentChip | `apps/extension/src/side_panel.ts` | Chrome chip with thumbnail, name, status and remove (10416). |
| test | AttachmentPreview tests (web) | `apps/web/features/chat/components/Composer/AttachmentPreview.test.tsx` | Chip behaviour tests. |
| test | AttachmentPreviewStates (phone) | `apps/mobile/__tests__/AttachmentPreviewStates.test.tsx` | Phone chip state tests. |
| test | AttachmentPreviewViewer (phone) | `apps/mobile/__tests__/AttachmentPreviewViewer.test.tsx` | Phone image viewer tests. |

## 6. Execution and data flow

| Step | Runs on | Source |
|---|---|---|
| A file is admitted and a preview URL is created from the File object. | device | apps/web/features/chat/hooks/use-attachments.ts:~318-331 (admit) |
| The chip renders thumbnail or icon, name and size from the File. | device | apps/web/features/chat/components/Composer/AttachmentPreview.tsx:188-295 |
| Remove revokes the preview URL and removes the file from the lists. | device | use-attachments.ts:531-547 |
| Phone tap on an image opens a local full-screen viewer. | device | apps/mobile/src/features/chat/components/AttachmentPreview.tsx:609 |
| VS Code removal posts removePendingAttachment to the extension host (not the webview), which drops the attachment from its in-memory pending list and from queued or in-flight sends; it does not delete a file. | device | webviewContent.ts:7594-7612; ChatStateManager.ts:2239-2248 |
| On web, send is deferred while an attachment is being prepared (deferredSendRef; attachmentPreparing is generic, not only location-data cleaning). | device | ChatComposerNew.tsx:3596-3600 |

**Data**

| What | Stored in | Synced | Kept or deleted |
|---|---|---|---|
| Draft files and preview URLs | Memory of the web page or phone app until send | No (phone keeps a draft store; see ChatInput.draftAttachments.test.tsx) | Removed on X, on clear, or at send |

**Models and providers.** No model is involved in showing or removing chips.

## 7. Access and usage rules

| Rule | What the code does |
|---|---|
| Account | none found in the code for the chip display itself. |
| Permissions | none found in the code |
| Subscription | none found in the code |
| Limits and metering | Web collapses documents after 4 (AttachmentPreview.tsx:85). No other limit belongs to the chip. |
| Feature flags | none found in the code |
| Model compatibility | Chip display is independent of the model; the model warning is F014-12. |
| Provider restrictions | none found in the code |
| Local mode | Chips work the same in Local mode on phone (local files are listed as chips). On web, attaching any file while an on-device model is selected shows a refusal banner (with a 'switch to cloud' button) and blocks sending until the person leaves the local model or removes the files: localAttachmentConflict is true whenever a local model is selected and any attachment is present, and the send early return stops it (ChatComposerNew.tsx:1589, :3596, :5333-5345). |

## 8. States and edge cases

| State | Behaviour | Source |
|---|---|---|
| No attachments | Component returns nothing. On phone this happens only when attachments and preparing are both empty. | AttachmentPreview.tsx:320 (web); AttachmentPreview.tsx:564 (phone) |
| Remove while uploading | Label becomes 'Cancel upload of {name}' (web, for the preparing, uploading and verifying phases). | web AttachmentPreview.tsx:132-136; phone AttachmentPreview.tsx:476 |
| Source file gone (phone) | Overlay 'No longer available'; send blocked with alert 'File no longer available'. | phone AttachmentPreview.tsx:385; ChatInput.tsx:869 |
| Attachment still being prepared, such as a picture being cleaned of location data (web) | Send waits until preparation ends; the deferral applies to any attachment being prepared (attachmentPreparing), not only location-data cleaning. | ChatComposerNew.tsx:3596-3600 |
| Local (on-device) model selected with any attachment (web) | Refusal banner with a 'switch to cloud' button; send is blocked until the person switches model or removes the files. | ChatComposerNew.tsx:1589, :3596, :5333-5345 |
| Accessibility | Web remove target is enlarged to about 40 px with a pseudo-element; phone chips carry spoken labels with name, kind, size and destination. | AttachmentPreview.tsx:108-122; phone AttachmentPreview.tsx:213-236 |
| Remove an unsent upload in VS Code before the host answers | Removal is held and applied when the host assigns an id. | webviewContent.ts:7604-7609, :8515-8520 |
| Preview or replace | not handled in the code | no code found |

## 9. Verification

What has actually been seen by a person is in the Status table above. This section lists what exists to check with.

**Existing tests**

- `apps/web/features/chat/components/Composer/AttachmentPreview.test.tsx`: Unique keys, remove by index, staged files of every kind, indeterminate phase, retry from chip, kind beside size, Office naming, image numbering, collapse toggle, images never hidden.
- `apps/mobile/__tests__/AttachmentPreviewStates.test.tsx`: Retry and Not sent overlays, Remove beside Retry, Verifying, image numbering.
- `apps/mobile/__tests__/AttachmentPreviewViewer.test.tsx`: Phone image viewer (titles not read in full).
- `apps/web/features/chat/hooks/__tests__/useAttachments.reset.test.tsx`: Draft reset behaviour (titles not read in full).
- `apps/extension-vscode/src/__tests__/attachmentGeneration.webview.test.ts`: Webview attachment generation handling (titles not read in full).

**Test scenarios**

- **Remove one of three**
  1. Attach three files on web.
  2. Press X on the second.
  - Expected: Two chips remain; sending includes only those two.
- **Collapse documents**
  1. Attach five documents on web.
  - Expected: Four chips and 'Show all attachments'; pressing it shows five and the label changes.
- **Phone image view**
  1. Attach a photo on phone.
  2. Tap the tile.
  - Expected: The picture opens full screen; closing returns to the draft.
- **CLI staged list**
  1. /attach a.png then /attach b.png (the list holds staged images only).
  2. /attach list then /attach remove 1.
  - Expected: List shows two numbered rows; after removal one remains.
- **Chrome size missing**
  1. Attach a PDF in the Chrome side panel.
  - Expected: Chip shows name and status; no size text (known gap).

**Where to look when it fails**

- Web test ids: attachment-order.
- Phone test ids: attachment-view-, attachment-remove-, attachment-cancel-.

**Hands-on test plans**

- Web: [70-qa/test-plans/web/014-attachment-intake-components.md](../../70-qa/test-plans/web/014-attachment-intake-components.md)
- Desktop: [70-qa/test-plans/desktop/014-attachment-intake-components.md](../../70-qa/test-plans/desktop/014-attachment-intake-components.md)
- Mobile: [70-qa/test-plans/mobile/014-attachment-intake-components.md](../../70-qa/test-plans/mobile/014-attachment-intake-components.md)
- CLI: [70-qa/test-plans/cli/014-attachment-intake-components.md](../../70-qa/test-plans/cli/014-attachment-intake-components.md)
- VS Code: [70-qa/test-plans/vscode/014-attachment-intake-components.md](../../70-qa/test-plans/vscode/014-attachment-intake-components.md)
- Chrome: [70-qa/test-plans/chrome/014-attachment-intake-components.md](../../70-qa/test-plans/chrome/014-attachment-intake-components.md)

## 10. Gaps and dependencies

- **No replace-in-place on any app.** Affects: All. Evidence: brief S14.29; no code found. Work needed: Design a replace control and keep order.
- **No preview of document content or full-size image outside the phone.** Affects: Web, desktop, CLI, VS Code, Chrome. Evidence: brief S14.30. Work needed: Add a viewer.
- **Chrome chips show no size.** Affects: Chrome. Evidence: side_panel.ts:10416-10470; brief S14.18. Work needed: Render a size label.
- **CLI has no icons or thumbnails and no per-file remove for /files items.** Affects: CLI. Evidence: claude_parity.rs:416-433. Work needed: Add a remove option for context files.
- **Web image chips show size only in a tooltip.** Affects: Web, desktop. Evidence: AttachmentPreview.tsx:222. Work needed: Show visible size text.

**Depends on**

- surface:web
- surface:desktop
- surface:mobile
- surface:cli
- surface:vscode
- surface:chrome
- file:apps/web/features/chat/hooks/use-attachments.ts
- F014-10
- F014-11
- F014-12
- SYS-shared-ui-and-design
- SYS-files-artifacts-and-storage

## Unknown

- Whether VS Code picker-added files show size; the picker path posts contextAttached and its chip builder was not read.
- Where CLI users remove a file added with /files; no command found in the code read.
- The web draft preview for the desktop Tauri build was not read.
- Whether any record shows the chip looks right to a human; no such record found.

## Second reader's check

A second reader checked 12 statements of this page against the code: 5 correct, 6 wrong or partly wrong, 1 could not be checked. The statements found wrong were corrected on this page; they are listed here for the record.

- **Partly wrong (section 2/3):** "Web: a ready draft chip shows no progress text (AttachmentPreview.tsx:138-143 returns nothing for 'ready' or 'complete')." The code shows: Behaviour is right, line is wrong. The ready/complete check is at line 147. Lines 138-143 are the UploadStatus props. (apps/web/features/chat/components/Composer/AttachmentPreview.tsx:147). **Corrected:** Cite :147 for the ready/complete early return.
- **Partly wrong (section 8):** "No attachments: component returns nothing. Web AttachmentPreview.tsx:300; phone :556." The code shows: Web returns null at 320. Phone returns null at 564, and only when there are no attachments and nothing preparing. (AttachmentPreview.tsx:320 (web); apps/mobile/src/features/chat/components/AttachmentPreview.tsx:564). **Corrected:** Web :320; phone :564, when attachments and preparing are both empty.
- **Partly wrong (section 7):** "Local mode: on web, an on-device model shows the conflict banner next to the chips (ChatComposerNew.tsx:5336)." The code shows: The banner exists at 5333-5345, with a 'switch to cloud' button. localAttachmentConflict is true whenever a local model is selected and any attachment is present (line 1589). Send is then blocked: the early return at ~3596 (`if (localAttachmentConflict) return;`) stops it. So on web, attachments cannot be sent with an on-device model. The page does not say this. (ChatComposerNew.tsx:1589, :3596, :5333-5345). **Corrected:** On web, attaching any file while an on-device model is selected shows a refusal banner and blocks sending until the person leaves the local model or removes the files.
- **Partly wrong (section 2/8):** "Remove while uploading: label becomes 'Cancel upload of {name}' (web :132-136; phone :187-198)." The code shows: Web is correct: the label changes for the preparing, uploading and verifying phases (:132-136). Phone builds the label at line 476, not 187-198. (web AttachmentPreview.tsx:132-136; mobile AttachmentPreview.tsx:476). **Corrected:** Phone citation is :476.
- **Partly wrong (section 2/3):** "CLI: '/attach list', '/attach remove [n|all]'; staged label 'path (size)'; messages 'Removed {label}.' / 'Removed N staged image(s).' / 'Nothing staged for the next turn.'" The code shows: The commands and messages match (tui_app.rs:6222-6250, :943-962). But the list holds staged images only (staged_images; the error reads 'Not a staged image number'). The label is 'path (size)' or 'path (size, full resolution)' (:871-876). The page implies all attachments are listed. The command also accepts the alias 'rm'. (apps/cli/src/tui/tui_app.rs:871-876, :6222-6250, :943-962). **Corrected:** /attach list and /attach remove cover staged images only. Labels are 'path (size)' or 'path (size, full resolution)'.
- **Partly wrong (section 3/6):** "VS Code removal posts removePendingAttachment to the host, which deletes the pending file; removal of an un-acked chip is deferred (webviewContent.ts:7594-7612; ChatStateManager.ts:2239)." The code shows: The post and the deferral are correct (data-remove-requested). The host handler at ChatStateManager.ts:2239 only splices the entry from the in-memory _pendingAttachments list and removes it from in-flight, queued and steering sends. It does not delete a file. The page also labels this step 'device', but it runs in the extension host. (apps/extension-vscode/src/features/sidebar-webview/ChatStateManager.ts:2239-2248; webviewContent.ts:7594-7612). **Corrected:** The host drops the attachment from its pending list and from queued or in-flight sends. It does not delete a file.

**Facts the page missed**

- On web, an on-device (Local) model refuses attachments entirely. localAttachmentConflict (ChatComposerNew.tsx:1589) blocks send (~:3596) until the person switches to cloud or removes the files. The page mentions only a banner.
- The CLI /attach list and /attach remove act on staged images only (tui_app.rs:6222-6250, :943). The CLI also accepts 'rm' as an alias and local file paths, not just images.
- The web send path defers send while an attachment is being prepared, via deferredSendRef (ChatComposerNew.tsx:3596-3600). The page ties this only to location-data cleaning, but attachmentPreparing is generic.
