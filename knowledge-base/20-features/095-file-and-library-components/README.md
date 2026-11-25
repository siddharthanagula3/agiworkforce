---
id: "AREA-095"
type: "area"
title: "File and Library components"
features: ["F095-01", "F095-02", "F095-03", "F095-04", "F095-05", "F095-06", "F095-07", "F095-08", "F095-09"]
basis: "code inspection"
last_reviewed: "2026-11-24"
revision: "f51d16e747"
---
# 95. File and Library components

This area lets a person add files to AGI Workforce (in chat, in a project, or to their library), keeps those files safe, and lets them find, reuse, restore and download them later. The model can read the text of a file, so a PDF or an office document can answer questions. Uploads go through two steps and a safety check, so a bad file is refused before it is kept.

**Who uses it.** Signed-in users. Every upload route calls getUserScopedDb and a CSRF check first (apps/web/app/api/uploads/presign/route.ts:60-64), so anonymous requests are refused. Storage use is limited by plan tier (apps/web/lib/server/file-storage.ts:38-73). Sharing a project with an organisation needs the content.share permission (apps/web/lib/services/org-sharing-service.ts:264-266). Developers reach the audio transcription route through the /api/llm/v1 API (apps/web/app/api/llm/v1/audio/transcriptions/route.ts). Paid-only gates were not established from the code opened.

## Features in this area

| ID | Feature | Web | Desktop | Mobile | CLI | VS Code | Chrome |
|---|---|---|---|---|---|---|---|
| [F095-01](F095-01-upload-a-file-two-steps-resumable-for-large-files.md) | Upload a file (two steps, resumable for large files) | n/a | n/a | n/a | n/a | n/a | n/a |
| [F095-02](F095-02-safety-checks-on-uploads-content-inspection-and-ma.md) | Safety checks on uploads (content inspection and malware scan) | n/a | n/a | n/a | n/a | n/a | n/a |
| [F095-03](F095-03-reading-files-for-the-model-text-scanned-pages-pic.md) | Reading files for the model (text, scanned pages, pictures) | n/a | n/a | n/a | n/a | n/a | n/a |
| [F095-04](F095-04-audio-and-video.md) | Audio and video | n/a | n/a | n/a | n/a | n/a | n/a |
| [F095-05](F095-05-library-catalog-and-storage-use.md) | Library catalog and storage use | n/a | n/a | n/a | n/a | n/a | n/a |
| [F095-06](F095-06-folders-and-connected-sources.md) | Folders and connected sources | n/a | n/a | n/a | n/a | n/a | n/a |
| [F095-07](F095-07-versions-sharing-and-access.md) | Versions, sharing and access | n/a | n/a | n/a | n/a | n/a | n/a |
| [F095-08](F095-08-delete-trash-and-restore.md) | Delete, trash and restore | n/a | n/a | n/a | n/a | n/a | n/a |
| [F095-09](F095-09-download-and-export.md) | Download and export | n/a | n/a | n/a | n/a | n/a | n/a |

Requirement items for this area: [10-requirements/capabilities/095-file-and-library-components.md](../../10-requirements/capabilities/095-file-and-library-components.md).

## How this area works in the code

1. **Presign (phase one).** The client asks for a place to upload. The server checks the request, CSRF token, rate limit, file name, type and size, checks that object storage is set up, and returns an upload target. No record is written yet. (`apps/web/app/api/uploads/presign/route.ts:60-64 (user scope, CSRF)`, `apps/web/app/api/uploads/presign/route.ts:66-93 (rate limit, schema, checksum rule, storage check, validation)`, `apps/web/app/api/uploads/presign/route.ts:94-110 (chat type and avatar rules)`)
2. **Resumable parts.** For a large file the client sends parts. The server lists pending parts so an interrupted upload can continue. (`apps/web/app/api/files/uploads/[uploadId]/route.ts:97 (list pending multipart uploads)`, `apps/web/app/api/files/uploads/[uploadId]/route.ts:127-136 (parts already stored)`)
3. **Complete (phase two).** The client tells the server the upload is done. The route checks CSRF, rate limit and private storage, parses the request, and hands it to the completion code. (`apps/web/app/api/uploads/chat-attachment/complete/route.ts:24-57`)
4. **Content scan and refusal.** The completion code reads the stored bytes and runs the scan. A refused file is purged from storage and the user gets a message. (`apps/web/lib/server/chat-attachment-completion.ts:397-417`)
5. **Byte inspection.** Structural checks and a credential scan run on the bytes. Credential detections that name a format refuse the file. (`apps/web/lib/security/upload-scan.ts:601-611 (scanUploadBytes)`, `apps/web/lib/security/upload-scan.ts:201-224 (credential scan, filename checks)`, `apps/web/lib/security/upload-scan.ts:185-192 (declared type helpers)`)
6. **External virus scan.** The web app sends the bytes to the scanner service with a bearer token. The service streams them to the virus engine and answers clean, infected, or unavailable. (`apps/web/lib/security/source-scan-client.ts:93-109 (scanner URL and token)`, `services/upload-scanner/src/server.ts:90-97 (bearer check)`, `services/upload-scanner/src/server.ts:103-148 (scan, size cap, deadline, verdict)`, `services/upload-scanner/src/server.ts:188-200 (health and signature freshness)`)
7. **Thumbnail and library list.** Pictures get a small webp thumbnail on request. The library list adds a thumbnail link only for pictures that qualify. (`apps/web/lib/server/library-thumbnail.ts:1-60`, `apps/web/app/api/files/[id]/thumbnail/route.ts:1-40`, `apps/web/app/api/library/route.ts:76`)
8. **Stored record and quota.** The file gets one media_assets row. Plan storage is checked before a new file is accepted. (`apps/web/lib/server/media-assets.ts:69 (row insert)`, `apps/web/lib/server/media-assets.ts:396-433 (library list, trash rules)`, `apps/web/lib/server/file-storage.ts:61-73 (plan allowance check)`)
9. **Delete and restore.** Delete sets a deleted time by default. Permanent delete is a separate flag. The daily job later removes the stored bytes. (`apps/web/app/api/media/route.ts:45-60 (delete, permanent flag)`, `apps/web/app/api/cron/purge-deleted-media/route.ts:84 (delete objects under prefix)`, `vercel.json:82 (daily schedule)`)
10. **Download.** The download route checks access for each request and sends the bytes with safe headers. (`apps/web/app/api/files/[id]/route.ts:302-307 (headers including nosniff)`, `apps/web/app/api/files/[id]/route.ts:342-345 (buffered response headers)`)

## Files to know

| File | Role |
|---|---|
| `apps/web/app/api/uploads/presign/route.ts` | Step one of an upload: checks the request and returns an upload target. |
| `apps/web/lib/server/chat-attachment-completion.ts` | Step two of a chat upload: scans the bytes, purges refused files and writes the record. |
| `apps/web/lib/security/upload-scan.ts` | Byte inspection, credential scan and the call to the external scanner. |
| `apps/web/lib/security/source-scan-client.ts` | Web-side client that reads the scanner URL and token and calls the scanner. |
| `services/upload-scanner/src/server.ts` | Separate HTTP service that streams uploads to the virus engine and answers clean, infected or unavailable. |
| `apps/web/app/api/files/uploads/[uploadId]/route.ts` | Resumable multipart session: lists stored parts so an upload can continue. |
| `apps/web/lib/server/media-assets.ts` | Owns the media_assets table: insert, library list, soft delete and the 30-day trash rule. |
| `apps/web/lib/server/file-storage.ts` | Plan storage allowance and the check that refuses an upload over it. |
| `apps/web/lib/server/library-thumbnail.ts` | Picture thumbnail rules and rendering with sharp. |
| `apps/web/app/api/files/[id]/route.ts` | Per-request authorised download with safe headers. |
| `apps/web/app/api/cron/purge-deleted-media/route.ts` | Daily purge of expired trash and its stored objects. |
| `packages/ui/unified-chat/src/components/library/LibraryView.tsx` | Shared library screen, with optional folder hooks the hosts may supply. |

## What is stored

- Upload bytes for chat attachments (private storage; purged when refused): Object storage via apps/web/lib/server/object-storage (private bucket); purge in apps/web/lib/server/chat-attachment-completion.ts:414
- File records: owner, type, byte size, storage location, metadata, conversation, deleted_at: media_assets table, apps/web/lib/server/media-assets.ts:69, 178-183, 391-395
- Project knowledge file rows: user_projects and project knowledge tables, apps/web/app/api/uploads/presign/route.ts:116-119 (user_projects lookup)
- File lineage and retrieval index rows linked to a media asset: file_lineage and retrieval documents, apps/web/lib/resources/deletion-policies.ts:244-249
- Pending multipart upload sessions and stored parts: Object storage multipart state, apps/web/app/api/files/uploads/[uploadId]/route.ts:97-136
- Thumbnails for pictures: Generated on request with sharp, apps/web/lib/server/library-thumbnail.ts; whether they are stored was not established
- Scanner input: Held in memory while scanning; the scanner code (services/upload-scanner/src/server.ts) shows no write of the file. The legal subprocessor copy (apps/web/content/legal/policy-archive/subprocessors/2026-11-13.json:141) says the same

## Switches

Plan gates, flags and settings that turn parts of this area on or off.

- **UPLOAD_SCAN_REQUIRED**: Whether the external upload scan is required. (apps/web/lib/validate-env.ts:1548)
- **UPLOAD_SCAN_WEBHOOK_URL**: Address of the malware scanner service. Without it the external scan cannot run. (apps/web/lib/validate-env.ts:1556; read in apps/web/lib/security/source-scan-client.ts:93)
- **UPLOAD_SCAN_WEBHOOK_TOKEN**: Bearer token sent to the scanner; the scanner rejects other callers. (apps/web/lib/validate-env.ts:1564; read in apps/web/lib/security/source-scan-client.ts:109; checked in services/upload-scanner/src/server.ts:90-97)
- **Object storage configured checks**: Uploads are refused with an internal error when the matching storage is not set up. (apps/web/app/api/uploads/presign/route.ts:80-88; apps/web/app/api/uploads/chat-attachment/complete/route.ts:37-39; apps/web/app/api/files/[id]/thumbnail/route.ts (isMediaStorageConfigured))
- **Plan storage allowance**: Byte limit per plan tier; null means no limit. (apps/web/lib/server/file-storage.ts:38-73)
- **Rate limits**: Per-request limits on uploads ('uploads-presign') and chat-related routes ('chat-conversation'). (apps/web/app/api/uploads/presign/route.ts:66; apps/web/app/api/media/route.ts:55)
- **Scanner size cap and deadline**: Files over the cap get 413 and are not scanned; a scan past the deadline gets 503. (services/upload-scanner/src/server.ts:107-123 (maxBytes and deadlineMs parameters))
- **Thumbnail source limits**: 30 MiB and 8192 x 8192 pixel maximum; only jpeg, png, webp and gif qualify. (apps/web/lib/server/library-thumbnail.ts:8-9, 11-21)
- **Trash window**: Deleted files stay in trash for 30 days before the purge job may remove them. (apps/web/lib/server/media-assets.ts:432-433)
- **Purge schedule**: Daily purge of deleted media at 04:00. (vercel.json:82)
- **Chat inspection byte window**: The first 256000 bytes are read for inspection. (apps/web/lib/server/chat-attachment-completion.ts:51)

## Shared between apps

Shared: the library screen packages/ui/unified-chat/src/components/library/LibraryView.tsx, which AGENTS.md says desktop, web, Chrome and VS Code all use. The wire contracts in packages/contracts/cloud-contracts (resumable-uploads.ts, managed-cloud-resumable-upload-client.ts, managed-cloud-chat-attachments-client.ts) are shared by clients. All server logic is in apps/web and is shared by every client that calls its routes. The upload scanner is its own service in services/upload-scanner. Separate per app: the desktop cloud storage panel (apps/desktop/src/features/cloud/CloudStoragePanel.tsx and apps/desktop/src/stores/cloudStore.ts) is a different feature that was not checked against this brief.

## Looks wrong in the code

From reading only; not confirmed in the running app. Each line is also in the gap register.

- Brief cites lines 246 and 318 in the chat-attachment complete route, but that file is 57 lines. The completion and scan logic is in apps/web/lib/server/chat-attachment-completion.ts (scan at 397-417). (apps/web/app/api/uploads/chat-attachment/complete/route.ts:1-57)
- Brief marks thumbnails (S95.13) missing, but picture thumbnails are generated and served, and the library list links them. (apps/web/lib/server/library-thumbnail.ts:1-60; apps/web/app/api/files/[id]/thumbnail/route.ts; apps/web/app/api/library/route.ts:76)
- Brief cites lines 430, 502 and 540 in the project knowledge-files route, but that file is 113 lines. The registration logic is in apps/web/lib/server/project-knowledge-files.ts:298. (apps/web/app/api/projects/[id]/knowledge-files/route.ts:1-113)
- Brief cites vercel.json:49 for the purge job. The purge schedule is at line 82. (vercel.json:82)
- Folder UI exists in the shared library view, but no app or package in the search passes listFolders, so no folder rows appear. The brief's 'missing' is consistent with that, but the UI code is not dead by design. (packages/ui/unified-chat/src/components/library/LibraryView.tsx:274-278, 530-545)
- Rejected files are purged from storage with no quarantine copy. The brief says the same, which matches the code. Reported as a limit, not a defect. (apps/web/lib/server/chat-attachment-completion.ts:414)
- Image preprocessing is missing beyond the thumbnail: no step strips metadata or normalises stored originals in the code opened. The thumbnail path uses autoOrient only. (apps/web/lib/server/library-thumbnail.ts:44-60)

## Not established

- Brief items not opened: S95.03 (only the line cited in media-assets was partly read), S95.04 object-storage-runtime.ts, S95.07 and S95.14 extraction logic, S95.08 OCR, S95.15 version logic, S95.21 export archive writer, S95.22 conversion, S95.23 LibraryView.tsx:866, S95.27 project sharing route, S95.28 source-deletion beyond the policy file. Line citations for these are unverified.
- User gestures for upload, drag, download, search, sort and restore were not seen in any UI file opened, so how_people_use_it steps are general.
- Empty, loading and failure texts in the library view and the chat composer were not verified.
- Which hosts mount LibraryView, and in which app each feature is live, was not checked beyond AGENTS.md's statement. The brief gives only one platform status, not per-app status.
- Plan gates: the plan tier names and which tiers may upload were not verified beyond the storage allowance function.
- Whether the object-storage bucket for chat attachments is private was not verified (the brief says private and public buckets exist).
- Whether video frame or transcript extraction exists anywhere: a search found none in lib/server, but the search was not exhaustive.
- Whether the scanner's rejected-file handling beyond purgeChatAttachmentUpload has any other path (for example knowledge-file uploads) was not checked.
- Whether the upload scan is required in every environment depends on UPLOAD_SCAN_REQUIRED's use, which was not traced.
- No builds, tests or servers were run, per the task rules. Nothing in the project folder was edited.
