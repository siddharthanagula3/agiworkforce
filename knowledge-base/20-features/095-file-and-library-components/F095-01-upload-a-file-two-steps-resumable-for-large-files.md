---
id: "F095-01"
type: "feature"
title: "Upload a file (two steps, resumable for large files)"
aliases: ["Presign and complete", "Chat attachment upload", "Project source upload", "Resumable upload", "Multipart upload", "Large file upload", "chat-large-file", "uploads-presign (rate-limit key)", "New menu, Add to the library (Library upload)"]
area: "95 File and Library components"
available_on: []
implementation: {web: "n/a", desktop: "n/a", mobile: "n/a", cli: "n/a", vscode: "n/a", chrome: "n/a"}
verification: {web: "n/a", desktop: "n/a", mobile: "n/a", cli: "n/a", vscode: "n/a", chrome: "n/a"}
requirement_items: ["S95.01", "S95.02"]
depends_on: ["SYS-files-artifacts-and-storage", "SYS-subscriptions-entitlements-and-usage", "SYS-authentication-and-identity", "SYS-execution-boundaries", "SYS-api-and-contracts", "F095-02", "F095-05", "mode:cloud", "surface:web", "surface:desktop", "surface:mobile", "surface:cli", "surface:chrome"]
basis: "code inspection"
second_reader: "not sampled: statements are code readings that nobody has re-checked"
last_reviewed: "2026-11-24"
revision: "f51d16e747"
---
# F095-01 Upload a file (two steps, resumable for large files)

Sends a file to private storage on our servers and creates its record only after the server has re-read and checked the bytes. A file over 4 MiB goes up in parts that resume after a dropped connection. A chat file over 25 MiB goes through a separate checked intake. Web, desktop, mobile, CLI and Chrome call the same routes.

Area: [95. File and Library components](README.md). Requirement items: [S95.01](../../10-requirements/capabilities/095-file-and-library-components.md#s9501), [S95.02](../../10-requirements/capabilities/095-file-and-library-components.md#s9502).

## Status

Two separate questions: is the code there, and has a person seen it work. "Seen working" comes only from results of real runs recorded in the project's ledger.

| App | In the code: this page's reading, 2026-11-24 | In the code: ledger audit, 2026-09-26 and later updates | Seen working by a person |
|---|---|---|---|
| Web | does not apply | does not apply | n/a |
| Desktop | does not apply | does not apply | n/a |
| Mobile | does not apply | does not apply | n/a |
| CLI | does not apply | does not apply | n/a |
| VS Code | does not apply | does not apply | n/a |
| Chrome | does not apply | does not apply | n/a |

The first column was derived from this page's text by a second, cheaper pass and has not been validated item by item; the ledger column is the project's own record. Neither is a test result.

## 1. Purpose and user value

**What it does.** Moves a chosen file from the device into private object storage, then registers it as a chat attachment (a media_assets row) or a project source (a project_knowledge_files row). No row exists until the server has read the stored bytes back and finished its checks (apps/web/lib/server/chat-attachment-completion.ts:302; apps/web/lib/server/project-knowledge-files.ts:299).

**Why it exists.** A client cannot be trusted to say what a file is or how big it is. Splitting the upload from the registration lets the server verify size, type, checksum, plan limits and safety before the file can be listed, searched or sent to a model [inferred from the route flow]. Part uploads exist so large files survive weak networks (test: apps/web/app/api/files/uploads/__tests__/resumable-upload-interruption.test.ts).

**Who uses it.** Any signed-in person who attaches a file to chat, adds a source to a project, or uploads from the Library. The CLI also uses the same routes (apps/cli/src/cloud/attachments.rs:11-12).

**Problems it solves**

- A mislabelled or oversized file never becomes a record, because the row is written last (apps/web/lib/server/chat-attachment-completion.ts:461).
- A dropped connection does not lose a big upload: the client asks which parts are stored and sends only the rest (apps/web/app/api/files/uploads/[uploadId]/route.ts:121-129).
- Plan size, daily-count and storage limits are enforced on the server before any byte is accepted (apps/web/app/api/uploads/presign/route.ts:132; apps/web/lib/server/attachment-allowance.ts:169).

**Use cases**

- Attach a PDF to a chat message.
- Add a spreadsheet as a project source (the checksum is required).
- Upload a 300 MiB document to chat on a phone over a weak network and resume after a drop.
- Drop a file into the Library on the web app.

## 2. User experience

**Where to find it**

- Web: chat composer attachments (the control label was not read) and the Library page, New menu labelled 'Add to the library' (packages/ui/unified-chat/src/components/library/LibraryView.tsx:2010; apps/web/app/chat/library/page.tsx:17). Library uploads call uploadChatAttachments with declineLargeFiles (apps/web/features/library/components/LibraryView.tsx:180).
- Desktop: chat attachments use the shared client (apps/desktop/src/services/desktopCloudAttachments.ts:30). The desktop Library passes no uploadFiles, so no upload entry there (apps/desktop/src/features/library/DesktopLibrary.tsx:157-210).
- Mobile: chat attachments via its own client (apps/mobile/services/api.ts:695-702, 822) and parted upload (apps/mobile/src/features/chat/upload/partedChatUpload.ts:153).
- CLI: chat attachments and project sources (apps/cli/src/cloud/attachments.rs:11-12; apps/cli/src/cloud/knowledge.rs:12).
- Chrome extension: side panel and computer-use file upload use the shared client (apps/extension/src/side_panel.ts:10283; apps/extension/src/features/computer-use/userFileUpload.ts:217).
- VS Code extension: no call to these upload routes found.

**Before you start**

- A signed-in Cloud account. The Chrome side panel shows a sign-in message when there is no managed-cloud owner (apps/extension/src/side_panel.ts:10270-10278).
- Object storage configured on the server, or the route fails (apps/web/app/api/uploads/presign/route.ts:87).
- A supported file type: images, PDFs, Word, Excel, PowerPoint, text or code (apps/web/app/api/uploads/presign/route.ts:95-99).

**Screens and controls**

- Composer attachment picker (web, desktop, mobile, Chrome): labels not read.
- Library 'New' button opening the 'Add to the library' menu (packages/ui/unified-chat/src/components/library/LibraryView.tsx:2010).
- Upload error text under the Library toolbar, default 'That upload did not finish.' (packages/ui/unified-chat/src/components/library/LibraryView.tsx:839).
- CLI: attach by path in a chat; labels not read.

**Journey**

1. 1. The person picks or drops a file.
2. 2. The client computes a SHA-256 checksum (apps/web/features/chat/services/chat-attachment-upload.ts:509; packages/contracts/cloud-contracts/src/managed-cloud-chat-attachments-client.ts:193).
3. 3. Up to 4 MiB: the client asks POST /api/uploads/presign for a place to put the bytes, PUTs the bytes, then calls POST /api/uploads/chat-attachment/complete (or the project register route).
4. 4. Over 4 MiB: the client opens a part session with POST /api/files/uploads, sends 5 MiB parts, and calls complete on the session (packages/contracts/cloud-contracts/src/resumable-uploads.ts:79; packages/contracts/cloud-contracts/src/upload-contract.json:3-4).
5. 5. After a drop the client calls GET on the session; the server lists stored parts and the client sends the missing ones.
6. 6. Over 25 MiB in chat (up to 500 MiB): the client opens a chat-large-file session; complete returns an intake that the server checks in the background (apps/web/app/api/files/uploads/[uploadId]/route.ts:385-410).
7. 7. The client receives the attachment (id, name, type, url) or a refusal message.

**What the person sees and gets**

- Attachment object {id, name, mimeType, byteCount, type, url '/api/files/<id>'} (apps/web/lib/server/chat-attachment-completion.ts:262-275).
- Refusals are validation errors with fixed text, for example 'Uploaded file size does not match the selected file.' (apps/web/lib/server/chat-attachment-completion.ts:343).
- A closed session answers 'This upload is no longer open. Start it again to finish the file.' (apps/web/app/api/files/uploads/[uploadId]/route.ts:104).
- An old project client gets 409 UPLOAD_PROTOCOL_UPGRADE_REQUIRED (apps/web/app/api/uploads/presign/route.ts:77).

**Settings**

- None found for the upload itself. Plan limits come from the billing catalog (packages/contracts/types/src/billing-catalog.ts:564-710).

## 3. Current implementation

From reading the code. Not a test result.

**Working in the code**

- Presign validates kind (avatar, knowledge-file, chat-attachment), name, type and size, then returns a private upload URL valid 300 seconds, or a same-origin relay URL when direct upload is not allowed (apps/web/app/api/uploads/presign/route.ts:38, 95, 192).
- Complete re-reads the stored bytes under the declared size, checks type and checksum, reuses an identical file the user already holds, checks storage, scans, runs the workspace data policy, re-seals the bytes and only then inserts the row (apps/web/lib/server/chat-attachment-completion.ts:302-470).
- Resumable sessions: create (apps/web/app/api/files/uploads/route.ts:218), progress/list parts (apps/web/app/api/files/uploads/[uploadId]/route.ts:121), sign parts (apps/web/app/api/files/uploads/[uploadId]/parts/route.ts:33), relay parts in 4 MiB segments (apps/web/app/api/files/uploads/[uploadId]/route.ts:204), complete (:425), abort (:552).
- Chat large files: admission, an intake row written under a per-user lock, daily large-file bytes refunded on failure, and a workflow started on complete (apps/web/app/api/files/uploads/route.ts:74-215; apps/web/app/api/files/uploads/[uploadId]/route.ts:385-410). A sweeper cron exists (vercel.json:66).
- Shared client picks parts above the relay segment size and falls back to presign when resumable upload is unavailable (packages/contracts/cloud-contracts/src/managed-cloud-chat-attachments-client.ts:193-215).

**Incomplete**

- Project sources: the 'second step' is the register route, not the chat complete route (apps/web/app/api/projects/[id]/knowledge-files/route.ts:68) or finishKnowledgeFile for parts (apps/web/app/api/files/uploads/[uploadId]/route.ts:343). The brief names only the chat complete route.

**Present but disconnected or switched off**

- Large chat files need a client with a hasher and a server that offers them; otherwise the client throws or the server answers 'Files this large aren't available yet.' (packages/contracts/cloud-contracts/src/managed-cloud-chat-attachments-client.ts:226-233; apps/web/lib/server/attachment-allowance.ts:50). The Library declines large files (apps/web/features/library/components/LibraryView.tsx:180).

**Not available**

- VS Code: no upload client found.
- Local (on-device) uploads: no on-device equivalent found in the code opened; the routes are our managed service.

## 4. Required behaviour

**Established requirements**

- Uploads run as a two-phase session: presign a private object, then complete it server-side with checks before a record exists. (source: capability ledger `audit/ledger/ecosystem-capability-ledger.jsonl`, item S95.01)
- Large uploads can be sent in resumable parts and resumed after interruption. (source: capability ledger `audit/ledger/ecosystem-capability-ledger.jsonl`, item S95.02)
- Duplicate project sources are refused by checksum and total storage is bounded. (source: doc: docs/decisions/wire-or-cut.md:373-379)

**Acceptance criteria**

1. A file with an unsupported type is refused at presign with 'Chat supports images, PDFs, Word, Excel, PowerPoint, and text or code files.'
2. A project-source presign without a checksum returns 409 UPLOAD_PROTOCOL_UPGRADE_REQUIRED.
3. If the byte count stored differs from the declared count, the stored object is deleted and no row is created.
4. A 12 MiB file interrupted after two parts resumes by sending only the missing parts, and finishes with one attachment.
5. Calling complete twice for the same file returns the same attachment and creates one row.
6. A request that would exceed plan storage is refused before the row is written.
7. Cancelling a part session leaves no stored object and no row.

**Inferred requirements** (not stated anywhere; reasoned from the code or from competitor parity)

- Every app that attaches files should apply the same limits as the server; the CLI does not receive server-announced limits and uses compiled ones (apps/cli/src/cloud/attachments.rs:26).

**Proposed improvements** (suggestions, not requirements)

- [proposed] Record in one place which app screens trigger each upload path, so testers can map gestures to routes.
- [proposed] Fix the brief's line anchors, several do not match the files.

## 5. Implementation map

| Kind | Name | Path | Role |
|---|---|---|---|
| endpoint | POST/DELETE /api/uploads/presign | `apps/web/app/api/uploads/presign/route.ts` | Step one: validates and returns a storage URL; DELETE removes an unregistered project upload. |
| endpoint | POST /api/uploads/chat-attachment/complete | `apps/web/app/api/uploads/chat-attachment/complete/route.ts` | Step two for chat: calls completeChatAttachmentUpload. |
| service | completeChatAttachmentUpload | `apps/web/lib/server/chat-attachment-completion.ts` | Checks, scan, data policy, seal, media_assets insert. |
| endpoint | POST /api/projects/[id]/knowledge-files | `apps/web/app/api/projects/[id]/knowledge-files/route.ts` | Step two for project sources. |
| service | registerProjectKnowledgeFile | `apps/web/lib/server/project-knowledge-files.ts` | Capacity, extraction, seal, versioned insert. |
| endpoint | POST /api/files/uploads | `apps/web/app/api/files/uploads/route.ts` | Opens a part session; large chat files create an intake. |
| endpoint | GET/POST/DELETE /api/files/uploads/[uploadId] | `apps/web/app/api/files/uploads/[uploadId]/route.ts` | List stored parts, complete, abort. |
| endpoint | POST /api/files/uploads/[uploadId]/parts | `apps/web/app/api/files/uploads/[uploadId]/parts/route.ts` | Signs part URLs. |
| service | admitAttachmentUpload / admitChatLargeFileUpload | `apps/web/lib/server/attachment-allowance.ts` | Plan size, daily count and large-file admission. |
| service | chat-file-intake | `apps/web/lib/server/chat-file-intake/steps.ts` | Background checks and seal for chat-large-file. |
| table | chat_file_intakes | `apps/web/lib/server/chat-file-intake/store.ts` | Intake rows for large chat files. |
| table | media_assets | `apps/web/lib/server/media-assets.ts` | Chat attachment record. |
| table | project_knowledge_files | `apps/web/lib/server/project-knowledge-files.ts` | Project source record. |
| config | upload-contract.json | `packages/contracts/cloud-contracts/src/upload-contract.json` | Part size 5 MiB, relay segment 4 MiB, large part 8 MiB, concurrency web 4 mobile 2. |
| config | chat-attachment-policy.json | `packages/contracts/cloud-contracts/src/chat-attachment-policy.json` | Types, inline 25 MiB cap, large file 500 MiB cap, counts. |
| service | createManagedCloudResumableUploadClient | `packages/contracts/cloud-contracts/src/managed-cloud-resumable-upload-client.ts` | Shared part-upload client with resume. |
| service | createManagedCloudChatAttachmentsClient | `packages/contracts/cloud-contracts/src/managed-cloud-chat-attachments-client.ts` | Shared chat upload client (web, desktop, Chrome). |
| service | uploadChatAttachments | `apps/web/features/chat/services/chat-attachment-upload.ts` | Web wrapper. |
| service | desktopCloudAttachments | `apps/desktop/src/services/desktopCloudAttachments.ts` | Desktop wrapper bound to the signed-in account. |
| service | mobile upload | `apps/mobile/services/api.ts` | Mobile presign/complete and parts. |
| service | partedChatUpload | `apps/mobile/src/features/chat/upload/partedChatUpload.ts` | Mobile part upload using the shared client. |
| service | CLI attachments | `apps/cli/src/cloud/attachments.rs` | CLI presign, complete and part sessions. |
| service | Chrome upload | `apps/extension/src/features/computer-use/userFileUpload.ts` | Chrome extension uploads. |

## 6. Execution and data flow

| Step | Runs on | Source |
|---|---|---|
| Client hashes the file and picks the path by size (over 4 MiB: parts). | device | packages/contracts/cloud-contracts/src/resumable-uploads.ts:79 |
| Presign or session create: auth, CSRF, rate limit, type and size check, plan admission, storage URL. | our servers | apps/web/app/api/uploads/presign/route.ts:66-132 |
| Bytes are sent to private object storage, directly or through a same-origin relay route. | outside service | apps/web/app/api/uploads/presign/route.ts:192 (storage provider name not read) |
| Complete re-reads stored bytes, verifies size, type and checksum, scans, seals, inserts the row, deletes the staging object. | our servers | apps/web/lib/server/chat-attachment-completion.ts:302-470 |
| Large chat file: complete starts an intake workflow; the sweeper cron retries stuck ones. | our servers | apps/web/app/api/files/uploads/[uploadId]/route.ts:400; vercel.json:66 |

**Data**

| What | Stored in | Synced | Kept or deleted |
|---|---|---|---|
| Uploaded bytes (staging object, then sealed copy) | private object storage bucket | Server-side only | Staging key deleted after sealing or on refusal (apps/web/lib/server/chat-attachment-completion.ts:141); trash purge by cron (vercel.json:82). |
| Attachment record | table:media_assets | Every app reads it through the server | Soft delete, 30-day recovery (apps/web/lib/server/media-assets.ts:432). |
| Project source record and extracted text | table:project_knowledge_files | Via server | Newer upload of same name supersedes older (apps/web/lib/server/project-knowledge-files.ts:393). |
| Large-file intake state | table:chat_file_intakes | Via server | Cancel and sweep rules in apps/web/lib/server/chat-file-intake/store.ts; details not read. |
| Part-session token | device session store (browser web storage by default; mobile in-memory map) | No | Lives until expiry; see apps/mobile/src/features/chat/upload/partedChatUpload.ts and managed-cloud-resumable-upload-client.ts:332. |

**Models and providers.** No model takes part in the upload. Storage is an object-storage adapter (packages/platform/object-storage); the bucket vendor was not read.

## 7. Access and usage rules

| Rule | What the code does |
|---|---|
| Account | Signed-in account required; routes use getUserScopedDb (apps/web/app/api/uploads/presign/route.ts:62). CSRF token required. |
| Permissions | Project sources need an owned or editor-shared, non-archived project (apps/web/lib/server/project-knowledge-files.ts:200-235). Chat uploads must use a storage key owned by the user (apps/web/lib/server/chat-attachment-completion.ts:152). |
| Subscription | Per-file size, files per day (Free only per test title) and total storage depend on the plan (apps/web/lib/server/attachment-allowance.ts:78,169; test: apps/web/lib/server/__tests__/attachment-allowance.test.ts). |
| Limits and metering | Inline 25 MiB, large chat file 500 MiB, 20 files per message (packages/contracts/cloud-contracts/src/chat-attachment-policy.json:2-5, 66-69). Rate limit key uploads-presign. Storage counted by sumFileStorageBytes (apps/web/lib/server/file-storage.ts:30). |
| Feature flags | Large files are offered only when the server says so and the client has a hasher (packages/contracts/cloud-contracts/src/chat-attachments.ts; client :226). Other flags: none found. |
| Model compatibility | Not applicable to the upload. |
| Provider restrictions | None found in the upload code. |
| Local mode | These routes belong to the managed cloud service. Whether a Local-mode chat attaches files without them is not shown in the code opened: unknown. |

## 8. States and edge cases

| State | Behaviour | Source |
|---|---|---|
| Offline or dropped connection | Client resumes by listing stored parts and sending the rest. | apps/web/app/api/files/uploads/__tests__/resumable-upload-interruption.test.ts; apps/web/app/api/files/uploads/[uploadId]/route.ts:121 |
| Session expired or closed | 404 telling the person to start again; nothing recorded. | apps/web/app/api/files/uploads/[uploadId]/route.ts:104 |
| Complete called twice | Returns the finished attachment. | apps/web/lib/server/chat-attachment-completion.ts:262 |
| Same bytes already held | Staging copy deleted and the earlier attachment reused. | apps/web/lib/server/chat-attachment-completion.ts:370 |
| Bytes changed after the check | Refused with 'This file changed ... Upload it again.' when no entity tag. | apps/web/lib/server/chat-attachment-completion.ts:454 |
| Cancel | Aborts parts; large files also cancel the intake and refund unused daily bytes. | apps/web/app/api/files/uploads/[uploadId]/route.ts:507-552 |
| Temporary chat | Row is flagged temporary and kept out of the Library. | apps/web/lib/server/chat-attachment-completion.ts:302-310; apps/web/lib/server/media-assets.ts:69 |
| Accessibility | Library menu has role menu and an aria-label; picker labels not read. | packages/ui/unified-chat/src/components/library/LibraryView.tsx:2010 |

## 9. Verification

What has actually been seen by a person is in the Status table above. This section lists what exists to check with.

**Existing tests**

- `apps/web/app/api/uploads/__tests__/presign-upload-policy.test.ts`: Presign type policy, private bucket, relay, refusal of version 1 shape.
- `apps/web/app/api/uploads/__tests__/chat-attachment-moderation.test.ts`: Complete route: denylist, ETag, size mismatch, sealed write failure.
- `apps/web/app/api/uploads/__tests__/chat-attachment-temporary-chat.test.ts`: Temporary chat uploads (title not read).
- `apps/web/app/api/files/uploads/__tests__/route.test.ts`: Opening sessions, plan admission, refusals, part signing.
- `apps/web/app/api/files/uploads/__tests__/resumable-upload-interruption.test.ts`: Resume, repeated part, retried complete, cancel, closed session.
- `apps/web/app/api/files/uploads/[uploadId]/route.test.ts`: Relayed parts and segments.
- `packages/contracts/cloud-contracts/src/__tests__/managed-cloud-resumable-upload-client.test.ts`: Shared part client (titles not read).
- `apps/web/lib/server/__tests__/attachment-allowance.test.ts`: Per-plan limits, daily count, unknown plan.
- `apps/mobile/__tests__/api-upload-parts.test.ts`: Mobile part upload.
- `apps/web/features/chat/services/chat-attachment-upload.test.ts`: Web upload service.

**Test scenarios**

- **Resume a large upload**
  1. Sign in on web with a plan that allows the size.
  2. Upload a 30 MiB PDF in a chat and cut the network after two parts.
  3. Restore the network.
  - Expected: Only missing parts are sent; one attachment appears; one media_assets row exists.
- **Refuse a wrong type**
  1. Try to attach an executable renamed to .pdf.
  - Expected: Refused with a safety-check message; no row; staging object gone.
- **Project source without checksum**
  1. POST /api/uploads/presign kind knowledge-file with no checksumSha256.
  - Expected: 409 UPLOAD_PROTOCOL_UPGRADE_REQUIRED.
- **Cancel mid-upload**
  1. Start a part upload and cancel.
  - Expected: Session aborted, no row, large-file daily bytes refunded.
- **CLI attach**
  1. Attach a small file from the CLI in a Cloud chat.
  - Expected: Presign and complete succeed; the attachment url is /api/files/<id>.

**Where to look when it fails**

- Log text '[uploads] rejected ...' in apps/web/lib/server/chat-attachment-completion.ts.
- Log '[chat-files] ...' in apps/web/app/api/files/uploads/[uploadId]/route.ts.
- Rows in media_assets, project_knowledge_files and chat_file_intakes.
- Error code UPLOAD_PROTOCOL_UPGRADE_REQUIRED.

**Hands-on test plans**

- none: not built on any app

## 10. Gaps and dependencies

- **The brief gives one platform status and no per-app lines; per-app screens that call the routes are only partly mapped.** Affects: All apps. Evidence: knowledge-base/data/area-briefs/095-file-and-library-components.md:3-13. Work needed: Map each app's attach gesture to its route and add per-app status.
- **No upload client exists in VS Code.** Affects: surface:vscode. Evidence: search of apps/extension-vscode found no upload route call. Work needed: Decide whether VS Code needs attachments.
- **Local mode attach path is undocumented.** Affects: surface:desktop, surface:mobile. Evidence: No on-device upload code in the files read. Work needed: Trace Local chat attachments and record the boundary.
- **Brief line anchors are stale.** Affects: Maintainers. Evidence: complete/route.ts has 57 lines but the brief cites :246 and :318. Work needed: Regenerate the brief anchors.

**Depends on**

- SYS-files-artifacts-and-storage
- SYS-subscriptions-entitlements-and-usage
- SYS-authentication-and-identity
- SYS-execution-boundaries
- SYS-api-and-contracts
- F095-02
- F095-05
- mode:cloud
- surface:web
- surface:desktop
- surface:mobile
- surface:cli
- surface:chrome

## Unknown

- Labels and gestures of the chat attach control on each app.
- Which storage vendor holds the bucket.
- Whether Local-mode chats on desktop and mobile attach files without these routes.
- What happens to chat_file_intakes rows at the end of their life (store.ts not fully read).
- Whether the VS Code extension is meant to upload files.
