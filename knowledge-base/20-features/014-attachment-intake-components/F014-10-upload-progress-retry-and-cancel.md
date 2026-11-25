---
id: "F014-10"
type: "feature"
title: "Upload progress, retry and cancel"
aliases: ["Upload progress", "Upload retry", "Upload cancel", "Parsing progress", "Preparing, Uploading, Verifying", "S14.19", "S14.20", "S14.26", "S14.27"]
area: "14 Attachment intake components"
available_on: ["web", "desktop", "mobile"]
implementation: {web: "partial", desktop: "partial", mobile: "partial", cli: "n/a", vscode: "n/a", chrome: "n/a"}
verification: {web: "partly seen (1 of 3)", desktop: "not seen by a person", mobile: "not seen by a person", cli: "n/a", vscode: "n/a", chrome: "n/a"}
requirement_items: ["S14.19", "S14.20", "S14.26", "S14.27"]
depends_on: ["surface:web", "surface:desktop", "surface:mobile", "surface:chrome", "mode:cloud", "api:POST /api/uploads/presign", "api:POST /api/uploads/chat-attachment/complete", "file:packages/contracts/cloud-contracts/src/managed-cloud-chat-attachments-client.ts", "store:useUploadLifecycleStore", "F014-09", "F014-11", "SYS-files-artifacts-and-storage", "SYS-subscriptions-entitlements-and-usage", "SYS-execution-boundaries"]
basis: "code inspection"
second_reader: "not sampled: statements are code readings that nobody has re-checked"
last_reviewed: "2026-11-24"
revision: "f51d16e747"
---
# F014-10 Upload progress, retry and cancel

Shows an attachment's upload stage (Preparing, Uploading, Verifying), offers Retry on a failed file and cancels a running upload. On web the upload starts at send, on the phone at send too, on Chrome as soon as the file is added. Reading the content after upload has no visible stage anywhere.

Area: [14. Attachment intake components](README.md). Requirement items: [S14.19](../../10-requirements/capabilities/014-attachment-intake-components.md#s1419), [S14.20](../../10-requirements/capabilities/014-attachment-intake-components.md#s1420), [S14.26](../../10-requirements/capabilities/014-attachment-intake-components.md#s1426), [S14.27](../../10-requirements/capabilities/014-attachment-intake-components.md#s1427).

## Status

Two separate questions: is the code there, and has a person seen it work. "Seen working" comes only from results of real runs recorded in the project's ledger.

| App | In the code: this page's reading, 2026-11-24 | In the code: ledger audit, 2026-09-26 and later updates | Seen working by a person |
|---|---|---|---|
| Web | partly built | partly built | partly seen (1 of 3) |
| Desktop | partly built | partly built | not seen by a person |
| Mobile | partly built | partly built | not seen by a person |
| CLI | does not apply | does not apply | n/a |
| VS Code | does not apply | does not apply | n/a |
| Chrome | does not apply | does not apply | n/a |

The first column was derived from this page's text by a second, cheaper pass and has not been validated item by item; the ledger column is the project's own record. Neither is a test result.

## 1. Purpose and user value

**What it does.** Tells the person where each file is in the upload, lets them try again after a failure, and lets them stop an upload still running.

**Why it exists.** Large files and weak networks fail or stall. People need to see that, fix it, or give up without losing the message. Brief S14.19, S14.20, S14.26, S14.27; test row W04 says failed uploads preserve the draft and do not send a partial set without a decision (doc: docs/product/requirements.md).

**Who uses it.** Web, desktop, phone and Chrome users who attach files in Cloud mode.

**Problems it solves**

- A silent hang while a file uploads
- A failed file blocking the whole message with no way to retry
- Sending a message missing a file

**Use cases**

- Send a 5 MB PDF on web; the chip says Uploading then Verifying then the message sends.
- Phone upload fails on a weak signal; the chip shows Retry.
- Cancel a slow upload and keep writing.
- Chrome: add a PDF; it uploads at once and says 'Ready to send'.

## 2. User experience

**Where to find it**

- Web and desktop: after Send, a second chip row shows the upload attempt with status text under each file (apps/web/features/chat/components/Composer/ChatComposerNew.tsx:5769; apps/web/features/chat/components/Composer/AttachmentPreview.tsx:138-186).
- Phone: on the chip, a thin progress bar, then 'Verifying', then a 'Retry' tile on failure (apps/mobile/src/features/chat/components/AttachmentPreview.tsx:330-440).
- Chrome: status line on the chip at attach time (apps/extension/src/side_panel.ts:10402-10456).
- CLI, VS Code: no network upload status; VS Code shows a dimmed 'uploading' chip while the file is read for the host (webviewContent.ts:7576, :7660).

**Before you start**

- Cloud mode with a signed-in account. Chrome says 'Sign in to AGI Cloud to upload files.' when not signed in (apps/extension/_locales/en/messages.json:379).

**Screens and controls**

- Web status words: 'Preparing…', 'Uploading…', 'Verifying…'; failed shows 'Upload failed' (or the exact reason when retrying cannot help) and a 'Retry' link with label 'Retry upload for {name}' (AttachmentPreview.tsx:138-186).
- Web X label 'Cancel upload of {name}' while in flight (AttachmentPreview.tsx:132-136).
- Phone bar with spoken percentage 'Uploading N%'; 'Verifying' overlay; 'Upload failed', 'Upload canceled' or 'Upload stopped in the background' in the Retry tile's label; X label 'Cancel upload of {name}' (uploadLifecycle.ts:42-57).
- Chrome: 'Uploading…', 'Checking file…', 'Ready to send', failure text, 'Retry', x 'Remove {file}' (messages.json:343-369).

**Journey**

1. Web: write a message, attach files, press Send.
2. The composer shows each file as Preparing, Uploading, Verifying.
3. On success the message sends and the chips clear.
4. On failure that can be retried, press Retry; the whole attempt runs again with the same text.
5. To cancel, press X on a chip while it is in flight; remaining files return to the draft.
6. Phone: press Send; files without a Cloud copy upload together; if any fails, nothing is sent and the chip shows Retry; remove or retry then send again.
7. Chrome: add a file; it uploads at once; Send is available when all are ready.

**What the person sees and gets**

- Phone failure message: 'did not finish uploading, so nothing was sent. Tap Retry on the file, or remove it and send again.' (apps/mobile/src/features/chat/upload/uploadAttachment.ts:37-42; the store builds its own wording at chatExecutionStore.ts:~2520 via unsentUploadsMessage).
- Web: a toast or notice for kept large files after cancel (apps/web/features/chat/pages/WebChatPage.tsx:1440-1452).

**Settings**

- Phone asks for consent before the first Cloud upload (ensureCloudSendConsent, uploadAttachment.ts:75; confirmCloudUpload at chatExecutionStore.ts:2489).

## 3. Current implementation

From reading the code. Not a test result.

**Working in the code**

- Web: upload client reports preparing, uploading, verifying, complete or failed per file, with a retryable flag (packages/contracts/cloud-contracts/src/managed-cloud-chat-attachments-client.ts:71-81, :341-443).
- Web: Retry re-sends the same content and files and marks every file preparing (apps/web/features/chat/pages/WebChatPage.tsx:2866-2886); the composer refuses a retry when the draft changed (ChatComposerNew.tsx:3458-3475).
- Web: cancel aborts the upload; files not yet uploaded return to the draft (WebChatPage.tsx:2888-2930).
- Web: a large file whose copy the server already holds can be kept after a late cancel and shown as a kept attachment with ready or failed (WebChatPage.tsx:514-580, :1415-1460; apps/web/features/chat/services/chat-attachment-upload.ts:37-75).
- Phone: progress bar, Verifying when all bytes are sent, cancel, retry up to 2 more times with 1 s and 2 s waits, no retry for a refusal such as a 4xx other than 408 or 429, daily-limit message (uploadAttachment.ts:15-134; uploadLifecycle.ts).
- Phone: send is held while an upload is in flight and the app marks uploads interrupted when sent to the background (ChatInput.tsx:853-880; uploadLifecycle.ts:25, :32).
- Chrome: upload at attach time with phases, Retry and abort on remove (apps/extension/src/side_panel.ts:10269-10319).

**Incomplete**

- Parsing progress does not exist: after upload the server reads the file at send time and no chip stage shows it (apps/web/app/api/llm/v1/chat/completions/lib/chat-attachment-hydration.ts; no UI state found).
- Web draft chips carry no status; statuses appear only after Send (ChatComposerNew.tsx:5781 has no statuses prop).
- Web has no percentage; the progress element is deliberately indeterminate (apps/web/features/chat/components/Composer/AttachmentPreview.test.tsx 'announces an indeterminate phase').
- Phone percent is in the spoken label, not visible text (phone AttachmentPreview.tsx:330-335).

**Present but disconnected or switched off**

- none found

**Not available**

- CLI and VS Code network upload status: the CLI reads local files and VS Code passes data to the host; no upload stage exists (apps/cli/src/agent/mod.rs:1462; ChatStateManager.ts:2176).
- Parsing or extraction stage (S14.20): web, desktop, phone.

## 4. Required behaviour

**Established requirements**

- While a file uploads, its chip shows that the upload is in progress. (source: brief S14.19)
- After upload, the attachment shows that its content is being read until it is ready. (source: brief S14.20)
- A failed upload offers Retry on that file. (source: brief S14.26)
- While uploading, the user can cancel that upload. (source: brief S14.27)
- Failed uploads preserve the draft and do not send a partial attachment set without an explicit decision. (source: doc: docs/product/requirements.md (test row W04))
- Switching conversations during upload never attaches a result to the wrong conversation. (source: doc: docs/product/requirements.md (test row W02))

**Acceptance criteria**

1. On web, a file in flight shows Preparing, Uploading or Verifying under its name; a retryable failure shows 'Upload failed' and Retry.
2. Pressing Retry on web re-runs the attempt with the same text and files.
3. A refusal that cannot succeed (for example an unsupported type) shows the reason and no Retry on web.
4. On phone, cancelling during upload leaves the chip with a Retry control and nothing is sent.
5. On phone, a failed upload blocks send and names the files that did not upload.
6. On Chrome, a failed upload shows Retry and Send stays unavailable until the file is ready or removed.
7. No stage after upload says the content is being read (known gap).

**Inferred requirements** (not stated anywhere; reasoned from the code or from competitor parity)

- Web retries the whole attempt, not the single file, because handleRetryAttachmentUpload re-sends all attempt files (WebChatPage.tsx:2866-2886) [inferred].

**Proposed improvements** (suggestions, not requirements)

- [proposed] Add a 'Reading' stage fed by the intake status endpoint for web files, and a matching phone label.
- [proposed] Show a visible percentage on web for large files.
- [proposed] Record in the brief that Chrome has upload status, so the n/a mark is corrected.

## 5. Implementation map

| Kind | Name | Path | Role |
|---|---|---|---|
| service | createManagedCloudChatAttachmentsClient | `packages/contracts/cloud-contracts/src/managed-cloud-chat-attachments-client.ts` | Per-file presign, put, verify with status callbacks; retryable test (line 123). |
| service | uploadChatAttachments | `apps/web/features/chat/services/chat-attachment-upload.ts` | Web wrapper with large-file intake, kept copies and signals (line 574). |
| component | WebChatPage send flow | `apps/web/features/chat/pages/WebChatPage.tsx` | Starts the upload at send (2684), Retry (2866), remove or cancel (2888), kept attachments (514). |
| component | AttachmentPreview UploadStatus | `apps/web/features/chat/components/Composer/AttachmentPreview.tsx` | Status text, alert and Retry link (138-186). |
| component | ChatComposerNew upload handlers | `apps/web/features/chat/components/Composer/ChatComposerNew.tsx` | handleRetryAttachmentUpload and handleRemoveAttachmentUpload (3447-3475). |
| endpoint | POST /api/uploads/presign | `apps/web/app/api/uploads/presign/route.ts` | Issues the upload URL; CSRF and rate limit 'uploads-presign' (lines 63-67). |
| endpoint | POST /api/uploads/chat-attachment/complete | `apps/web/app/api/uploads/chat-attachment/complete` | Verifies the stored object and records the attachment. |
| endpoint | GET /api/files/intakes/{intakeId} | `apps/web/app/api/files/intakes` | Large-file intake status read by the upload client [inferred from managedCloudChatFileIntakePath import]. |
| store | useUploadLifecycleStore | `apps/mobile/src/features/chat/upload/uploadLifecycle.ts` | Phone per-file phase, progress, cancel, backgrounded. |
| service | uploadWithRetry | `apps/mobile/src/features/chat/upload/uploadAttachment.ts` | Phone upload with 2 retries, backoff and refusal rules (line 59). |
| service | chatExecutionStore upload step | `apps/mobile/stores/chat/chatExecutionStore.ts` | Uploads attachments lacking an asset id at send and stops the send on failure (2478-2530). |
| component | AttachmentPreview (phone) | `apps/mobile/src/features/chat/components/AttachmentPreview.tsx` | Progress bar, Verifying overlay, Retry tile, cancel on X. |
| service | Chrome composer upload | `apps/extension/src/side_panel.ts` | uploadComposerDocument with phases and abort (10269-10319). |
| config | chat-attachment-policy.json largeFiles | `packages/contracts/cloud-contracts/src/chat-attachment-policy.json` | Large-file ceilings: 500 MiB each, 20 files, 2 GiB per message, 50 MiB cellular confirm (line 66). |
| test | managed-cloud-chat-attachments-client tests | `packages/contracts/cloud-contracts/src/__tests__/managed-cloud-chat-attachments-client.test.ts` | Upload client tests. |
| test | uploadLifecycle tests | `apps/mobile/src/features/chat/upload/__tests__/uploadLifecycle.test.ts` | Phone lifecycle tests. |

## 6. Execution and data flow

| Step | Runs on | Source |
|---|---|---|
| Web: at Send an attempt is created and each file is reported as preparing. | device | apps/web/features/chat/pages/WebChatPage.tsx:4481-4500; managed-cloud-chat-attachments-client.ts:341 |
| The client asks for an upload URL for the file name, type and size. | our servers | managed-cloud-chat-attachments-client.ts:366-381 (path /api/uploads/presign, chat-attachments.ts:18) |
| The file bytes are sent to storage with the signed URL; status becomes uploading. | outside service | managed-cloud-chat-attachments-client.ts:384-405 (uploadFetchImpl to presign.uploadUrl) [object storage vendor not read] |
| The client calls the complete endpoint; status becomes verifying and the server checks the stored file. | our servers | managed-cloud-chat-attachments-client.ts:415-436; chat-attachments.ts:19 |
| Files over the inline limit use a resumable large-file path when the account's handshake offers it. | device and our servers | managed-cloud-chat-attachments-client.ts:355-363; apps/web/features/chat/services/chat-attachment-upload.ts:574 |
| A cancel aborts the request; if the server already has a large file's copy it is shown as kept. | device and our servers | WebChatPage.tsx:2888-2930, :525-530 |
| Phone: send waits for consent, uploads in parallel with up to 3 attempts each, and stops the send if any fail. | device and our servers | chatExecutionStore.ts:2489-2523; uploadAttachment.ts:15-134 |
| Chrome: on add, the file is uploaded with the same client and the chip tracks the phase. | device and our servers | apps/extension/src/side_panel.ts:10269-10310 |

**Data**

| What | Stored in | Synced | Kept or deleted |
|---|---|---|---|
| Uploaded attachment (bytes and record) | Object storage plus an asset record; Library unless the chat is temporary | Account scoped | Kept in the Library until deleted, 30 days to restore; temporary chat files are kept out of the Library and deleted with the chat (apps/web/features/chat/components/Composer/ComposerPlusMenu.tsx:156-158) |
| Large-file upload session | Browser storage under the prefix 'agi.chat-large-file-upload.' [store type not confirmed] | No | unknown |
| Phone upload state | In-memory store | No | Cleared per attachment |

**Models and providers.** The upload itself uses no model. Storage is an outside service; its vendor is not named in the files read. Models read the file later at send (see F014-12).

## 7. Access and usage rules

| Rule | What the code does |
|---|---|
| Account | Cloud upload needs sign-in; Chrome states it; phone needs a Cloud credential and says 'account unconfirmed' otherwise (uploadAttachment.ts:101-106). |
| Permissions | Cloud consent before first upload on phone. Upload routes use CSRF and a rate limit (presign/route.ts:63-67). |
| Subscription | Plan limits shape size and count; free accounts hit a daily upload limit with its own message (uploadAttachment.ts:108-112, failureCopy dailyUploadLimitMessage). |
| Limits and metering | Retries: phone 2 retries with 1 s and 2 s waits. Retryable errors: 5xx, 408, 425, 429 and network errors (managed-cloud-chat-attachments-client.ts:119-137). Large files: 500 MiB each and 50 MiB cellular confirm (policy file line 66). |
| Feature flags | Large-file upload is available only if the account's handshake offers it (apps/web/features/chat/hooks/use-attachments.ts:277-283). |
| Model compatibility | not applicable to the upload step. |
| Provider restrictions | none found in the code |
| Local mode | No upload happens. Phone Local mode parses files on the device (apps/mobile/services/attachmentContext.ts), so no upload stage exists. Web on-device model refuses attachments. |

## 8. States and edge cases

| State | Behaviour | Source |
|---|---|---|
| Loading | Preparing, Uploading, Verifying text on web; bar and Verifying on phone. | AttachmentPreview.tsx:166-186; phone AttachmentPreview.tsx:330, :436 |
| Failure that can retry | 'Upload failed' and Retry. | AttachmentPreview.tsx:146-166 |
| Failure that cannot succeed | Reason shown, no Retry. | AttachmentPreview.tsx:151; managed-cloud-chat-attachments-client.ts:123-137 |
| Cancel (web) | Remaining files return to the draft; a kept large copy shows as a kept attachment. | WebChatPage.tsx:2888-2930 |
| Cancel (phone) | Phase becomes canceled; the chip stays with Retry. | uploadLifecycle.ts:106-115; phone AttachmentPreview.tsx:187-198, :390-405 |
| App backgrounded (phone) | Uploads marked interrupted; label 'Upload stopped in the background'. | uploadLifecycle.ts:50-52 |
| Offline | Network error is treated as retryable; web also blocks send with an offline notice. | managed-cloud-chat-attachments-client.ts:136; ChatComposerNew.tsx:3585-3592 |
| Timeout | not handled in the code as a separate state found. | no timeout constant found in the files read |
| Draft changed before Retry (web) | Notice 'This draft changed. Send it normally to use the updated text and files.' | ChatComposerNew.tsx:3462-3466 |
| Account switched mid-upload (phone) | Result dropped silently. | uploadAttachment.ts:60-66, :84-86 |

## 9. Verification

What has actually been seen by a person is in the Status table above. This section lists what exists to check with.

**Existing tests**

- `packages/contracts/cloud-contracts/src/__tests__/managed-cloud-chat-attachments-client.test.ts`: Upload client (titles not read in full).
- `apps/web/features/chat/services/chat-attachment-upload.test.ts`: Web upload service (titles not read in full).
- `apps/web/features/chat/pages/__tests__/WebChatPage.concurrent-attachment-send.test.tsx`: Concurrent attachment sends (titles not read in full).
- `apps/web/features/chat/components/Composer/AttachmentPreview.test.tsx`: Indeterminate phase, retry from chip, no retry for a refusal.
- `apps/mobile/src/features/chat/upload/__tests__/uploadLifecycle.test.ts`: Verifying at full bar, ignored late readings, cancel and background, settle.
- `apps/mobile/__tests__/FileUploadLifecycle.test.tsx`: Bar never moves backwards, accessible percentage, consent declined, cancel without retry, X becomes cancel.
- `apps/mobile/src/features/chat/upload/__tests__/uploadAttachment.dailyLimit.test.ts`: Daily limit message (titles not read in full).
- `apps/extension/__tests__/side_panel-attachment-caps.test.ts`: Picked images upload, send blocked until a failed upload is retried or removed.
- `apps/web/e2e/large-chat-file-upload.spec.ts`: Large file upload end to end (spec exists; no run record found).

**Test scenarios**

- **Web upload stages**
  1. Attach a 3 MB PDF on web and press Send.
  2. Watch the chip.
  - Expected: Preparing, Uploading, Verifying, then the message sends.
- **Web retry**
  1. Cut the network after Uploading starts.
  2. Press Retry after the failure.
  - Expected: 'Upload failed' with Retry; Retry re-runs the attempt and the message sends.
- **Web cancel**
  1. Start a slow upload.
  2. Press the X labelled Cancel upload.
  - Expected: Upload stops; other files return to the draft; nothing sent.
- **Phone retry and cancel**
  1. Cloud mode, attach a file, send on a weak network.
  2. Tap X during upload, then tap Retry.
  - Expected: Chip shows Upload canceled with Retry; Retry uploads again, then send works.
- **Chrome status**
  1. Sign in; add a PDF in the side panel.
  - Expected: 'Uploading…', 'Checking file…', then 'Ready to send'.
- **Parsing stage absent**
  1. Attach a large PDF and send.
  - Expected: No visible 'reading' stage between Verifying and the reply (known gap).

**Where to look when it fails**

- Phone: uploads map in useUploadLifecycleStore; error text in entry.error.
- Web: managed-cloud chat attachment errors with status; ManagedCloudChatAttachmentHttpError name.
- Server: logger lines in /api/uploads routes; table chat_file_intakes appears in db tests (apps/web/db/neon/chat-file-intakes-migration.test.ts).

**Hands-on test plans**

- Web: [70-qa/test-plans/web/014-attachment-intake-components.md](../../70-qa/test-plans/web/014-attachment-intake-components.md)
- Desktop: [70-qa/test-plans/desktop/014-attachment-intake-components.md](../../70-qa/test-plans/desktop/014-attachment-intake-components.md)
- Mobile: [70-qa/test-plans/mobile/014-attachment-intake-components.md](../../70-qa/test-plans/mobile/014-attachment-intake-components.md)

## 10. Gaps and dependencies

- **No parsing or reading stage after upload.** Affects: Web, desktop, phone. Evidence: brief S14.20; no UI state. Work needed: Expose intake status as a chip stage.
- **Web draft chips show no status until Send; upload does not start at attach.** Affects: Web, desktop. Evidence: ChatComposerNew.tsx:5781; WebChatPage.tsx:2684. Work needed: Decide whether to upload at attach time as Chrome does.
- **Brief marks Chrome n/a for upload status but code has phases, Retry and abort.** Affects: Chrome (documentation). Evidence: apps/extension/src/side_panel.ts:10269-10456. Work needed: Correct the brief.
- **Web Retry reruns the whole attempt, not just the failed file.** Affects: Web, desktop. Evidence: WebChatPage.tsx:2866-2886. Work needed: Optional per-file retry.
- **No visible percentage on web or on the phone chip.** Affects: Web, phone. Evidence: AttachmentPreview.tsx:166-186; phone AttachmentPreview.tsx:330. Work needed: Show text if wanted.

**Depends on**

- surface:web
- surface:desktop
- surface:mobile
- surface:chrome
- mode:cloud
- api:POST /api/uploads/presign
- api:POST /api/uploads/chat-attachment/complete
- file:packages/contracts/cloud-contracts/src/managed-cloud-chat-attachments-client.ts
- store:useUploadLifecycleStore
- F014-09
- F014-11
- SYS-files-artifacts-and-storage
- SYS-subscriptions-entitlements-and-usage
- SYS-execution-boundaries

## Unknown

- Which storage vendor the presigned URL targets.
- Whether a time limit stops a stalled upload on web or phone.
- Whether the large-file session store is session or local browser storage.
- How the retry in web behaves for a file the server already accepted.
- Whether the Tauri desktop build has its own upload path; desktopCloudAttachments.test.ts exists in apps/desktop/src/services/__tests__ but was not read.
