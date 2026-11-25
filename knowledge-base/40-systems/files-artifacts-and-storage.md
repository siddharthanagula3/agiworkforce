---
id: "SYS-files-artifacts-and-storage"
type: "system"
title: "Files, artifacts and storage"
basis: "code inspection and project documents"
second_reader: "not challenged"
last_reviewed: "2026-11-24"
revision: "f51d16e747"
---
# Files, artifacts and storage

Files enter through four upload paths on the web API, are checked by structural, credential and ClamAV scanning (fail closed in production), and are stored in private R2-style object storage with a media_assets row. The Library lists those rows. Scripted artifacts render on a separate sandbox origin; published artifacts get a token URL. Plan limits come from one billing catalog.

## What it is and why it exists

This page covers how a person's files and artifacts are accepted, checked, stored, shown and given back, in all six apps. Basis for the overall shape is [code]; the paths are in the Implementation map section.

- **Upload**: a file is sent to our web API. Small chat files go in one request; large chat files go in parts (a resumable upload). [code] (apps/web/app/api/uploads/presign/route.ts; apps/web/app/api/files/uploads/route.ts)
- **Upload scanning**: every uploaded byte is checked before it is usable. There are three layers: file structure (executable signatures, active content in SVG and PDF), secrets in the text, and ClamAV (a malware scanner) run as our own service. [code] (apps/web/lib/security/upload-scan.ts:601; services/upload-scanner/src/server.ts) [requirement] docs/security/upload-scanning.md
- **Library**: the person's list of stored files and generated images, video and saved artifacts. It is a view over the table:media_assets table. [code] (apps/web/app/api/library/route.ts)
- **Artifact**: a model-made piece of HTML, React, SVG, Mermaid, Markdown, text or code that is shown in a side panel. Scripted kinds run inside a page on a different web origin (a different site address) so their code cannot touch the app. [code] (infrastructure/sandbox/index.html; packages/ui/unified-chat/src/lib/artifact-sandbox.ts)
- **Published site / published artifact**: an artifact turned into a link anyone (or invited people) can open. The Sites page is the owner's list of them. [code] (apps/web/app/api/artifacts/publish/route.ts; apps/web/features/sites)
- **Downloads and exports**: a stored file is served back with safe headers and counted against a monthly download allowance; account, usage and memory exports are separate routes. [code]

Why it exists: users bring files into a model chat and keep what the model makes. The product must stop malware and leaked secrets, bound storage cost per plan, and never let model-written code reach the signed-in app. These rules come from AGENTS.md section 6 (trust boundaries) and the scanning document. [requirement] AGENTS.md; docs/security/upload-scanning.md

This page is the file/artifact view. For how an attached file reaches the model see SYS-chat-turn-pipeline. For plan and quota rules see the AGI Subscription pages of this knowledge base (ids not established here: [unknown]).

## How it works today

### 1. Small chat attachment (web API, mode:cloud)

1. Client calls `api:POST /api/uploads/presign` with kind `chat-attachment`, file name, type, byte count. The route checks CSRF, a rate limit, the file type and size, then admits the upload against the plan (size limit and, on Free, a daily upload count kept in the key-value store). It returns either a presigned PUT URL (valid 300 seconds) straight to the private bucket, or, for origins the bucket's CORS does not allow (for example a Chrome extension origin), a same-origin relay URL `api:PUT /api/uploads/chat-attachment/put`. [code] (apps/web/app/api/uploads/presign/route.ts; apps/web/lib/server/upload-transport.ts; apps/web/lib/server/attachment-allowance.ts, admitAttachmentUpload)
2. Client uploads the bytes.
3. Client calls `api:POST /api/uploads/chat-attachment/complete`. The server reads the stored object (bounded to the declared size), then in order: checks stored type equals declared type; matches a hash denylist of known illegal media; checks the SHA-256 the client sent; reuses an existing identical asset if one exists; checks storage space (skipped for temporary chats); runs `scanUploadBytes`; runs a data-loss check (`inspectOutboundContent`) under the workspace secret policy; copies the object to a sealed key; inserts a table:media_assets row; deletes the staging object. Any refusal deletes the staged object. [code] (apps/web/lib/server/chat-attachment-completion.ts:302-506)
4. The file is then addressed as `/api/files/<id>`. [code] (chat-attachment-completion.ts, return value)

### 2. Large chat file (over the inline limit)

Only when the readiness check passes: flag `CHAT_LARGE_FILES_ENABLED` is `on`, the plan allows it, the caller's origin can reach storage, the intake tables exist, and the scanner answers the protocol 2 capability probe. Otherwise the API answers `chat_large_files_unavailable`. [code] (apps/web/lib/server/chat-file-intake/readiness.ts; apps/web/lib/server/attachment-allowance.ts)

- `api:POST /api/files/uploads` opens a multipart upload; parts go in through `api:PUT /api/files/uploads/{uploadId}/parts` or the relay `api:PUT /api/files/uploads/{uploadId}`; `api:POST /api/files/uploads/{uploadId}` completes; `api:DELETE` aborts; `api:GET` reports progress. [code] (apps/web/app/api/files/uploads/[uploadId]/route.ts:573-576)
- Completion creates an intake row (table:chat_file_intakes) that a step runner advances: head inspection (`inspectUploadHead`), then a source scan (`submitSourceScan` to the scanner's `/v2/scans`), then preparation (table:chat_file_preparations) and sealing. A cron sweeps stuck intakes every 5 minutes. [code] (apps/web/lib/server/chat-file-intake/steps.ts:181,689; vercel.json:66)
- Part sizes and concurrency come from `upload-contract.json` (5 MiB parts, 8 MiB parts for files over 100 MiB, 4 parallel on web, 2 on mobile). [code] (packages/contracts/cloud-contracts/src/upload-contract.json)

### 3. Project knowledge files

Presign kind `knowledge-file` needs a SHA-256 (older clients get 409 `UPLOAD_PROTOCOL_UPGRADE_REQUIRED`) and a project the user owns. Bytes go to project-knowledge object storage (a local-signed upload URL when no private bucket exists), then `project-knowledge-extraction.ts` scans them (`scanUploadBytes`), extracts text, and seals the object. [code] (presign route; apps/web/lib/server/project-knowledge-extraction.ts:359)

### 4. The scan

`scanUploadBytes` runs, in one call: structural inspection (only for the leading bytes of an object), credential scan, then `runExternalScanner`, which POSTs the bytes with a bearer token to `UPLOAD_SCAN_WEBHOOK_URL` with a 15 second timeout. Only `{safe:true}` passes. In production the scanner is required unless `UPLOAD_SCAN_REQUIRED=false`; with no URL it returns a `scan_unavailable` finding and the upload is refused. [code] (apps/web/lib/security/upload-scan.ts:408-455,601-611) [requirement] docs/security/upload-scanning.md

### 5. Serving a file

`api:GET /api/files/{id}` loads the asset in the caller's workspace, then serves bytes with `Cache-Control: private, no-store`, `nosniff`, and `servedByteHeaders`, which forces HTML, SVG and XML types to download as `application/octet-stream` attachments. Files over 30 MiB (videos 256 MiB) are refused inline; a sealed large chat file over the limit gets a 5 minute redirect to a presigned URL, only for navigations or clients declaring the large-file capability. Video supports a single byte range. Download bytes are charged to the monthly allowance except for the owner's own AI-generated media. [code] (apps/web/app/api/files/[id]/route.ts; apps/web/lib/security/served-bytes.ts; apps/web/lib/services/tier-unit-quota-service.ts:472)

### 6. Library

`api:GET /api/library` lists media_assets (filters: kind, sort, surface, origin, search, deleted) plus storage and download meters on the first page. `api:POST /api/library` saves an artifact (up to 1,000,000 characters; html, svg, md, json, csv) as a file via `persistGeneratedFileBytes`. Delete, restore, and permanent delete go through `/api/media` (soft delete sets `deleted_at`; restore only within 30 days; a nightly cron purges after 30 days). [code] (apps/web/app/api/library/route.ts; apps/web/lib/server/media-assets.ts:693-756; apps/web/app/api/cron/purge-deleted-media/route.ts; vercel.json:82)

### 7. Artifacts and the separate origin

- The chat panel frames `NEXT_PUBLIC_SANDBOX_ORIGIN` (the app in `infrastructure/sandbox`, a static page with no build) and posts the artifact to it with `postMessage`. The sandbox page only accepts messages from an exact allowlist of parent origins and only from its actual parent window. [code] (infrastructure/sandbox/index.html:134-195,942-952; packages/ui/unified-chat/src/lib/artifact-sandbox.ts:140-230)
- The sandbox's response headers set a strict CSP: `connect-src 'none'`, scripts only from the page itself and pinned CDN hosts, no forms, and `frame-ancestors` limited to our web hosts. [code] (infrastructure/sandbox/vercel.json)
- If no sandbox origin is configured the UI falls back to a same-document `srcDoc` iframe with `sandbox="allow-scripts allow-modals"` and a CSP meta tag; React artifacts need the origin. [code] (artifact-sandbox.ts:3,buildSandboxedHtml; apps/web/features/chat/components/SandboxedIframe.tsx; packages/ui/unified-chat/src/lib/artifact-preview-capability.ts)
- Desktop (Tauri build) serves the same renderer file on an `artifact://` URI scheme compiled into the binary. [code] (apps/desktop/src-tauri/src/ui/artifact_sandbox.rs:1-40)
- Artifacts can call back to the host for AI, connectors and small storage through `postMessage` requests that the host turns into `api:POST /api/artifacts/runtime/{token}/complete`, `/connectors`, `/storage` (published) or `/api/artifacts/runtime/live/{artifactId}/...` (live). AI there only works for artifacts made in a managed-cloud chat. [code] (apps/web/app/api/artifacts/runtime/artifact-completion.ts, ownedArtifactOriginRefusal)

### 8. Publishing

`api:POST /api/artifacts/publish` takes artifactId, title, kind (html, react, svg, mermaid, markdown, text, code), content (up to 1,000,000 characters). It runs the external-sharing gate, usage-policy moderation and outbound content inspection, then inserts or updates table:published_artifacts and appends table:published_artifact_versions (unchanged content adds no version). Max 200 publications per user. The share URL is `<SITE_URL>/shared-artifact/<24-char token>`. Html, react and mermaid render in the sandbox frame; other kinds render inline. Visibility is `public` or `organization`; only `public` is readable anonymously by token, and a publication that uses connectors cannot be made public. [code] (apps/web/app/api/artifacts/publish/route.ts; apps/web/lib/services/published-artifact-service.ts:50-110,289-296,824; apps/web/app/api/artifacts/publish/[token]/route.ts)

### 9. Exports

`api:POST /api/artifacts/export/google-docs` (builds a .docx and creates a Google Doc), `api:POST /api/artifacts/save-to-drive`, `api:POST /api/artifacts/save-to-onedrive`, `api:GET /api/user/export` and `api:POST /api/user/export` (account data; media appears as authenticated download links, not inlined bytes), `api:GET /api/usage/export`, `api:GET /api/memory/export`. [code] (route files under apps/web/app/api)

## Implementation map

| Concern | Files | Basis |
|---|---|---|
| Presign, relay, complete | file:apps/web/app/api/uploads/presign/route.ts; file:apps/web/app/api/uploads/chat-attachment/put/route.ts; file:apps/web/app/api/uploads/chat-attachment/complete/route.ts; file:apps/web/app/api/uploads/knowledge-file/put/route.ts; file:apps/web/app/api/uploads/local-project-knowledge/route.ts | [code] |
| Completion logic | file:apps/web/lib/server/chat-attachment-completion.ts | [code] |
| Resumable and large files | file:apps/web/app/api/files/uploads/route.ts; file:apps/web/app/api/files/uploads/[uploadId]/route.ts; file:apps/web/app/api/files/uploads/resumable-upload.ts; file:apps/web/lib/server/chat-file-intake/ (steps, readiness, seal, store, quotas); file:apps/web/lib/server/chat-file-preparation/ | [code] |
| Plan admission | file:apps/web/lib/server/attachment-allowance.ts; file:apps/web/lib/server/file-storage.ts; file:apps/web/lib/services/free-plan-entitlements.ts; file:packages/contracts/types/src/billing-catalog.ts | [code] |
| Policy constants | file:packages/contracts/cloud-contracts/src/chat-attachment-policy.json; file:packages/contracts/cloud-contracts/src/upload-contract.json; file:packages/contracts/cloud-contracts/src/chat-attachments.ts; file:packages/contracts/cloud-contracts/src/resumable-uploads.ts | [code] |
| Scanning (web) | file:apps/web/lib/security/upload-scan.ts; file:apps/web/lib/security/source-scan-client.ts; file:apps/web/lib/security/archive-bounds.ts; file:scripts/check-upload-inspection-coverage.mjs | [code] |
| Scanner service | file:services/upload-scanner/src/server.ts (and clamd.ts, config.ts, source-scan.ts, scan-queue.ts, daemons.ts); file:services/upload-scanner/fly.toml; file:services/upload-scanner/clamav/clamd.conf | [code] |
| Object storage | file:apps/web/lib/server/object-storage.ts; file:packages/platform/object-storage/src/config.ts | [code] |
| Serving | file:apps/web/app/api/files/[id]/route.ts; file:apps/web/app/api/files/[id]/text/route.ts; file:apps/web/app/api/files/[id]/thumbnail/route.ts; file:apps/web/lib/security/served-bytes.ts | [code] |
| Library | file:apps/web/app/api/library/route.ts; file:apps/web/lib/server/media-assets.ts; file:apps/web/app/api/media/route.ts; file:apps/web/features/library/components/LibraryView.tsx; file:apps/web/app/chat/library/page.tsx | [code] |
| Artifact render | file:infrastructure/sandbox/index.html; file:infrastructure/sandbox/vercel.json; file:infrastructure/sandbox/configure.mjs; file:packages/ui/unified-chat/src/lib/artifact-sandbox.ts; file:packages/contracts/types/src/artifact-csp.ts; file:apps/web/features/chat/components/SandboxedIframe.tsx; file:apps/web/proxy.ts | [code] |
| Artifact runtime | file:apps/web/app/api/artifacts/runtime/artifact-completion.ts and its [token] and live routes | [code] |
| Publish and sites | file:apps/web/app/api/artifacts/publish/route.ts; file:apps/web/lib/services/published-artifact-service.ts; file:apps/web/app/shared-artifact/[token]/PublishedArtifactView.tsx; file:apps/web/features/sites/services/sites-service.ts; file:apps/web/app/chat/sites/page.tsx | [code] |
| Artifact store (client side) | file:packages/platform/artifacts/src/artifact-store.ts | [code] |
| Index and live | api:GET /api/artifacts/index; api:GET /api/artifacts/live; cron api:GET /api/cron/live-artifacts-refresh | [code] |
| Desktop renderer | file:apps/desktop/src-tauri/src/ui/artifact_sandbox.rs | [code] |
| Crons | api:GET /api/cron/purge-deleted-media (daily 04:00), purge-temporary-chats (daily 03:00), sweep-chat-file-intakes (every 5 minutes), live-artifacts-refresh (every 15 minutes) | [code] (vercel.json:14,26,66,82) |
| Tests (examples) | test:apps/web/lib/security/upload-scan.test.ts; test:services/upload-scanner/__tests__/server.test.ts; test:services/upload-scanner/__tests__/limits.test.ts; test:packages/ui/unified-chat/src/lib/artifact-sandbox-origin.test.ts; test:apps/web/features/chat/components/SandboxedIframe.origin.test.tsx; test:apps/web/app/api/uploads/__tests__/presign-upload-policy.test.ts; test:apps/web/app/api/library/__tests__/route.test.ts; test:apps/web/app/api/artifacts/publish/route.test.ts; test:apps/desktop/wdio/specs/artifact-sandbox-origin.spec.ts | [code] (files exist) ; [unknown] whether they pass |

Implementation status here means the code exists and is wired. No run records were found in the files read, so verification status is [unknown] for everything except what other pages record.

## Data and state

**Tables** (all [code] unless noted)

| Table | Holds | Source |
|---|---|---|
| table:media_assets | One row per Library item and chat attachment: kind, mime, byte_size, storage_pathname, content hash, source surface, `temporary_chat`, `deleted_at`, metadata (filename, origin, source) | db/neon/0036_media_assets.sql; media-assets.ts |
| table:project_knowledge_files, table:project_knowledge_objects | Project source files and their sealed objects | db/neon/0006_projects.sql; 0419_project_knowledge_object_lifecycle.sql |
| table:chat_file_intakes, table:chat_file_preparations | Large chat file pipeline state | db/neon/0422_chat_file_intakes.sql |
| table:published_artifacts | Published content, token, kind, visibility | db/neon/0095_published_artifacts.sql |
| table:published_artifact_versions | Append-only publish history | db/neon/0257_file_versions_and_lineage.sql |
| table:published_artifact_storage | Per-viewer data a published app keeps (value up to 5 MiB) | db/neon/0325_published_artifact_storage.sql |
| table:published_artifact_viewers | Invited viewers of a site | db/neon/0372_published_site_viewers.sql |
| table:organization_shared_artifacts | Workspace sharing grants | db/neon/0184_organization_shared_artifacts.sql |
| table:artifact_comments, table:live_artifacts, table:studio_library_items | Comments, live (connected) artifacts, Studio library entries (a different thing from the file Library; max 100 per kind) | db/neon/0369, 0380, 0373 |
| table:file_lineage | Provenance between files | db/neon/0257_file_versions_and_lineage.sql |

The account-wide artifact index (migration 0121) holds metadata only; an artifact's bytes live in the message that produced it and are re-derived. [code] (apps/web/app/api/artifacts/index/route.ts header comment). The table name for that index is [unknown] here.

**Object storage.** S3-compatible, default Cloudflare R2. Settings are environment names `AGI_STORAGE_PROVIDER` (s3, memory, none), `AGI_STORAGE_ENDPOINT`, `AGI_STORAGE_REGION`, `AGI_STORAGE_BUCKET`, `AGI_STORAGE_PRIVATE_BUCKET`, `AGI_STORAGE_PUBLIC_BASE_URL`, `AGI_STORAGE_ENCRYPTION`, and legacy `CLOUDFLARE_R2_*` names. The private bucket must differ from the public one. Chat attachments and project knowledge use the private bucket; avatars use the public one. [code] (packages/platform/object-storage/src/config.ts:7-24; apps/web/lib/server/object-storage.ts:29-68)

**Keys.** `chat-attachments/<userId>/<time>_<random>.<ext>` for staging, a sealed variant after scan, `knowledge-files/projects/<projectId>/...`, `avatars/<userId>/...`. [code] (apps/web/lib/server/upload-keys.ts; media-storage.ts)

**Key-value store.** Daily upload counter `agi:uploads:daily:<user>:<day>` (Free plan) and scanner capability cache `agi:chat-files:scanner-capability` (60 seconds). [code]

**Retention.** Library soft delete, 30 day recovery, nightly purge (500 assets per run); legal holds block permanent deletion. Temporary-chat files are excluded from storage totals unless larger than the inline limit and a chat attachment, and are purged on a 30 day retention cron. [code] (media-assets.ts:693-800; file-storage.ts sumFileStorageBytes; purge-temporary-chats/route.ts:24)

**Environment settings** (names only): `UPLOAD_SCAN_WEBHOOK_URL`, `UPLOAD_SCAN_WEBHOOK_TOKEN`, `UPLOAD_SCAN_REQUIRED` (web); `UPLOAD_SCAN_WEBHOOK_TOKEN_PREVIOUS`, `UPLOAD_SCAN_SOURCE_HOSTS` (scanner); `CHAT_LARGE_FILES_ENABLED`; `NEXT_PUBLIC_SANDBOX_ORIGIN` (read at build time on web); `UPLOAD_STORAGE_CORS_ORIGINS`. [code]

**Device stores.** No store:<name> device store for files or artifacts was established in this pass. [unknown] Local-mode phone attachments are parsed on the device by services/docParser (not found). [code] (apps/mobile/src/features/chat/utils/attachmentValidation.ts)

## Rules: access, plans, modes

**Access.** Every route uses the user-scoped database (row-level security) so a person reads only their own or their workspace's rows. Writes need a CSRF token and a rate limit bucket. Published content: anonymous read only for `public` visibility; owner can also be blocked from unattended publication when their account status is in a denied list. [code] (apps/web/lib/services/published-artifact-service.ts:824-840; presign route)

**Sizes** [code] (chat-attachment-policy.json; billing-catalog.ts)

| Limit | Value |
|---|---|
| Inline chat file, per file | 25 MiB (26,214,400 bytes) |
| Inline chat image | 20 MiB; models get an image re-encoded under 5,000,000 base64 bytes and 8,000 px |
| Per message | 25 MiB total, 20 files |
| Client with no handshake (for example the CLI) | 12 MiB per file, 10 files |
| Large chat file | 500 MiB per file, 20 files, 2 GiB per message (policy ceilings) |
| Avatar | 5 MiB |
| Generated or saved file persisted | 20 MiB |
| Inline serve cap | 30 MiB, video 256 MiB |
| Published content | 1,000,000 characters; 200 publications per user |

**Per plan** (plan tier ids from the billing catalog; display names may differ). [code] (packages/contracts/types/src/billing-catalog.ts:536-720)

| Plan | Daily uploads | Large chat files | Storage shared by Library and project sources | Monthly downloads |
|---|---|---|---|---|
| plan:local-only, plan:byok | unlimited | none | unlimited (counted nowhere server-side) | unlimited |
| plan:free | 5 a day | none | 500 MiB | derived from the free daily egress cap |
| plan:basic | unlimited | yes, 2 GiB a day, 3 at once | 4 GiB | 1 GiB |
| plan:pro | unlimited | yes, 10 GiB a day, 3 at once | 20 GiB | 3 GiB |
| plan:max | unlimited | yes, 25 GiB a day, 5 at once | 50 GiB | 15 GiB |
| plan:max_15x | unlimited | yes, 50 GiB a day, 5 at once | 100 GiB | 30 GiB |
| plan:team, plan:team_premium, plan:enterprise | unlimited | team yes; team_premium as max; enterprise not read | team 25 GiB; team_premium from price; enterprise custom | team and team_premium from price; enterprise custom |

Every plan's per-file inline limit is the same constant; the scanner limit is pinned to it by `limits.test.ts`, and the scanning document states `billing-catalog.test.ts` fails a plan above it. [requirement] docs/security/upload-scanning.md [code] (services/upload-scanner/__tests__/limits.test.ts exists)

Plan tier is resolved server side by `resolveEntitledPlanTier`; this is the one AGI Subscription entry used by uploads. [code] (attachment-allowance.ts)

**Modes.**
- mode:cloud: uploads go to our servers and are scanned there; plan limits apply. [code]
- mode:local: on mobile, attachments are read on the device with a device-memory ceiling and no plan count or server upload. [code] (attachmentValidation.ts, attachmentLimitsFor 'local')
- mode:own-key: uploads still use the same web API if the user is signed in to the cloud; whether a pure BYOK flow with no account can attach files without our servers is [unknown].
- AGENTS.md says a Local chat or file must never be silently routed to BYOK or managed cloud. [requirement] AGENTS.md section 6

**Artifacts and modes.** AI and connector calls from an artifact work only when the artifact was made in a managed-cloud chat. Public publications cannot use connectors. A temporary chat's files are excluded from the Library clock until the user chooses to keep them (`api:POST /api/media/keep`). [code] (artifact-completion.ts; media-assets.ts:735)

## Differences between apps

| App | What the code shows | Basis |
|---|---|---|
| surface:web | Full implementation: presign, relay, resumable large files, Library page `/chat/library`, Sites page `/chat/sites`, shared-artifact pages, artifact panel with sandbox frame. | [code] |
| surface:desktop | The public desktop (Electron) shows the hosted web app, so it uses the same web routes; changes to `apps/desktop/src` do not reach it. The retained Tauri build has its own `artifact://` renderer origin. Electron keeps previous versions of overwritten files through the OS Trash (`configurePreviousVersions`). | [requirement] AGENTS.md section 5; [code] (apps/desktop/src-tauri/src/ui/artifact_sandbox.rs; apps/desktop/electron/main.ts:2674) |
| surface:mobile | Uses the same presign and complete endpoints and uploads in parts (`uploadChatAttachmentInParts`); limits come from the sign-in handshake; has Library, artifacts, sites and shared-links feature folders. Local mode parses documents on the phone. Whether mobile large chat files are live is [unknown]. | [code] (apps/mobile/services/api.ts:50,604,701; apps/mobile/src/features) |
| surface:cli | Uses presign and complete with the compiled attachment policy and the 12 MiB no-handshake limits; reports local file errors. | [code] (apps/cli/src/cloud/attachments.rs:10-50) |
| surface:vscode | File and context attachment code exists in the sidebar chat; its upload path to the web API was not traced. | [code] present; path [unknown] |
| surface:chrome | Uses the managed chat attachment contract; its origin is a Chrome extension, so the server relays its uploads instead of giving a direct storage URL. The sandbox renderer admits a configured extension origin only after `configure.mjs` is run with the extension id. | [code] (apps/extension/src/features/cloud-bridge/managedChatHandler.ts imports; apps/web/lib/server/upload-transport.ts; infrastructure/sandbox/configure.mjs) |

The shared Library and artifact UI lives in `packages/ui/unified-chat`, which several surfaces use, so changes there affect them all. [requirement] AGENTS.md section 5

## Failure handling

All of these are [code] unless marked.

| Situation | Result |
|---|---|
| No scanner configured in production, scanner down, 401, 413, 503, timeout | Upload refused with "We couldn't check this file for safety. Try again later." (fail closed) |
| Malware or unsafe finding | Staged object deleted; message "failed a safety check" |
| Password-protected archive, PDF or Office file | Refused; asks the person to remove the password |
| Archive too deep or large | Refused as too complex to check |
| Declared size or type differs from stored object | Validation error; oversize object purged |
| Checksum mismatch | Purged; "bytes do not match the file you selected" |
| Object has no entity tag after inspection | Refused as changed during the check |
| Not enough storage | Refused with message to delete Library files; staged object purged |
| Daily upload count cannot be kept | Refused rather than counted loosely |
| Over plan size | 413 with upgrade hint when a bigger plan exists |
| Large files not ready (flag, plan, origin, schema or scanner) | `chat_large_files_unavailable`: "Files this large aren’t available yet." |
| Scanner queue full or hourly byte budget spent (protocol 2) | 429 with Retry-After; scan retried, never treated as safe |
| Abandoned multipart uploads and relay segments | Swept by the purge-deleted-media cron |
| Library storage cannot store a saved artifact | 503, nothing saved |
| Sandbox frame does not connect | UI arms a timeout and activates a fallback `srcDoc` frame; if scripts are blocked there it says so |
| Sandbox origin equals the app's own origin | `getArtifactSandboxOrigin` returns null and the fallback is used |
| Artifact AI switch off, connectors not released, concurrent-turn ceiling | 403 or 429 with a stable code |
| Publish over 200 items, content over limit, ownership or policy refusal | Conflict, validation or forbidden error |
| Scanner machine unhealthy | Fly stops routing; the service exits after 5 minutes without detecting its test string and restarts; stale signatures show as `stale` but scanning continues |
| Storage config missing | 500 "Object storage is not configured" |

## How it should work

What the project documents and the code both state as intent:

- Every route that turns user bytes into something usable must run the same scanner, and a guard enumerates the routes so a new one cannot skip it. [requirement] docs/security/upload-scanning.md; [code] (scripts/check-upload-inspection-coverage.mjs)
- Files and artifacts the agent removes or overwrites go to the OS Trash first; chats are archived, not destroyed; permanent removal needs an explicit user action naming what is lost. [requirement] AGENTS.md section 9
- A mutation that a user cannot undo asks first, through `useConfirmAction`. [requirement] AGENTS.md section 9
- Limits, plan names and model names come from the shared catalog, not literals at call sites. [requirement] AGENTS.md section 4
- Large chat files are meant to be switched on only after the scanner's raised limits are measured on a test app (deployment step 4 of the large-file plan). [requirement] docs/security/upload-scanning.md; docs/specs/large-file-uploads/plan.md (spec status: In progress)
- The web renders artifact scripts only on a different origin; the desktop uses its own compiled scheme. [code] [requirement] header of infrastructure/sandbox/index.html
- [proposed] Document one canonical page for the artifact lifecycle (draft, version, publish, unpublish) because it is spread over the artifact store, the index, publish and live tables.

## Gaps

1. **Large-file path is gated.** It works only with `CHAT_LARGE_FILES_ENABLED=on`, a scanner that speaks protocol 2, and plan eligibility. Spec status is In progress; whether it is on in production is [unknown]. The scanning document says clamd's raised limits also bind the legacy scan route and have not been measured. [code] [requirement]
2. **Sandbox switch-on not confirmed.** `NEXT_PUBLIC_SANDBOX_ORIGIN` is inlined at build time; without it the fallback frame may not run scripts. Area briefs in the repository record the redeploy and rebuild as unfinished; this pass did not check production. [code] [requirement] (knowledge-base/data/area-briefs/028-code-canvas-and-application-preview.md as quoted in repo search), verification [unknown]
3. **PDF active-content check is heuristic** (named in the scanning document); ClamAV remains the real verdict. [requirement]
4. **Public-site upload limits.** Published content is a text string capped at 1,000,000 characters; no binary assets for a published site were found. [code] [inferred]
5. **Two similar names.** `api:/api/library` (files) and `api:/api/artifacts/library` (Studio library items, max 100 per kind) are different stores. A reader can confuse them. [code]
6. **No device-side scanning.** Local-mode files on mobile and desktop are not scanned by our scanner because they never reach our servers; local safety checks were not established. [inferred] [unknown]
7. **Per-plan values for plan:enterprise attachments** and Team large-file daily limits were not fully read. [unknown]
8. **Verification status.** No run record for upload, scan, sandbox or publish was found in the files read, so none is marked executed. [unknown]

## How to verify

Read-only checks for an engineer (nothing here was run for this page):

1. Scanner policy: read `uploadScannerStatus` at apps/web/lib/security/upload-scan.ts:408 and compare with the table in docs/security/upload-scanning.md.
2. Scanner contract: `services/upload-scanner/__tests__/server.test.ts`, `clamd-config.test.ts`, `limits.test.ts`, `server-v2.test.ts`.
3. Route coverage: `node scripts/check-upload-inspection-coverage.mjs` (reads the route tree). Run through the repository's wrapper scripts per CLAUDE.md.
4. Upload policy: `apps/web/app/api/uploads/__tests__/presign-upload-policy.test.ts`, `chat-attachment-moderation.test.ts`, `chat-attachment-temporary-chat.test.ts`; large files: `apps/web/e2e/large-chat-file-upload.spec.ts`.
5. Library: `apps/web/app/api/library/__tests__/route.test.ts`, `library-item-open.test.ts`.
6. Sandbox origin: `packages/ui/unified-chat/src/lib/artifact-sandbox-origin.test.ts`, `apps/web/features/chat/components/SandboxedIframe.origin.test.tsx`, `scripts/check-embedded-frame-sandbox.mjs`, and `apps/desktop/wdio/specs/artifact-sandbox-origin.spec.ts`.
7. Publish: `apps/web/app/api/artifacts/publish/route.test.ts` and the `[token]` route tests; page behaviour in `apps/web/app/shared-artifact/[token]/PublishedArtifactView.test.tsx`.
8. Live check by a human (not done here): attach an image and a PDF; attach a harmless antivirus test file and expect refusal; open an HTML artifact and a React artifact and confirm they run on the sandbox origin; publish one and open the link signed out; delete a Library file and restore it; confirm a Free account is stopped at 5 uploads a day.
9. Environment: `scripts/env-doctor.mjs` lists `NEXT_PUBLIC_SANDBOX_ORIGIN` as required in production; `scripts/check-env-drift.test.mjs` pins that.

## Key facts

| Fact | Basis | Source |
|---|---|---|
| Chat attachments upload through api:POST /api/uploads/presign, a PUT to private storage (or a same-origin relay api:PUT /api/uploads/chat-attachment/put), then api:POST /api/uploads/chat-attachment/complete, which scans and seals the file. | read in the code | `apps/web/app/api/uploads/presign/route.ts`; `apps/web/app/api/uploads/chat-attachment/complete/route.ts`; `apps/web/lib/server/chat-attachment-completion.ts:302` |
| Upload scanning has three layers in scanUploadBytes: structural inspection, credential scan, and an external ClamAV call to UPLOAD_SCAN_WEBHOOK_URL with a 15 second timeout; only {safe:true} passes. | read in the code | `apps/web/lib/security/upload-scan.ts:419-455`; `apps/web/lib/security/upload-scan.ts:601-611` |
| In production the external scanner is required unless UPLOAD_SCAN_REQUIRED=false; an unconfigured production deployment refuses every upload (fail closed). | read in the code | `apps/web/lib/security/upload-scan.ts:408-416`; `docs/security/upload-scanning.md` |
| The scanner is our own ClamAV service (Fly.io) that streams bytes to clamd and never writes them to disk; it refuses encrypted and too-complex archives; unauthenticated calls get 401. | stated requirement | `docs/security/upload-scanning.md`; `services/upload-scanner/README.md` |
| Inline chat file ceiling is 25 MiB per file and per message, 20 MiB per image, 20 files; clients without the handshake (CLI) use 12 MiB and 10 files. | read in the code | `packages/contracts/cloud-contracts/src/chat-attachment-policy.json` |
| Large chat files (up to 500 MiB) use a resumable multipart upload under /api/files/uploads, an intake pipeline with a protocol 2 source scan, and are available only on paid plans when CHAT_LARGE_FILES_ENABLED is on and the scanner answers the capability probe. | read in the code | `apps/web/lib/server/chat-file-intake/readiness.ts`; `apps/web/lib/server/chat-file-intake/steps.ts:689`; `packages/contracts/types/src/billing-catalog.ts:551-560` |
| Free plan: 5 attachment uploads per UTC day, 500 MiB storage, no large chat files. Paid tiers: unlimited uploads, large files on, storage 4 GiB (basic) up to 100 GiB (max_15x). | read in the code | `packages/contracts/types/src/billing-catalog.ts:622-720`; `apps/web/lib/server/attachment-allowance.ts` |
| Storage used is one number shared by the Library and project knowledge files, computed over table:media_assets and table:project_knowledge_files; temporary-chat files are mostly excluded. | read in the code | `apps/web/lib/server/file-storage.ts`; `apps/web/lib/services/free-plan-entitlements.ts` |
| Files live in S3-compatible object storage, default Cloudflare R2, configured by AGI_STORAGE_* (legacy CLOUDFLARE_R2_*); the private bucket must differ from the public bucket and holds chat attachments and project knowledge. | read in the code | `packages/platform/object-storage/src/config.ts:7-24`; `apps/web/lib/server/object-storage.ts:29-68` |
| The Library is a view over table:media_assets served by api:GET /api/library; delete is a soft delete with 30 day recovery and a nightly purge cron at 04:00; permanent delete respects legal holds. | read in the code | `apps/web/app/api/library/route.ts`; `apps/web/lib/server/media-assets.ts:693-800`; `apps/web/app/api/cron/purge-deleted-media/route.ts`; `vercel.json:82` |
| api:GET /api/files/{id} serves bytes with no-store caching and nosniff; HTML, SVG and XML types are forced to download as octet-stream; files over 30 MiB (video 256 MiB) are not served inline; downloads spend the monthly allowance. | read in the code | `apps/web/app/api/files/[id]/route.ts`; `apps/web/lib/security/served-bytes.ts`; `apps/web/lib/services/tier-unit-quota-service.ts:472` |
| Scripted artifacts render in infrastructure/sandbox/index.html on the separate origin named by NEXT_PUBLIC_SANDBOX_ORIGIN; the page accepts messages only from an exact allowlist of parent origins and only from its own parent window. | read in the code | `infrastructure/sandbox/index.html:134-195`; `infrastructure/sandbox/index.html:942-952`; `packages/ui/unified-chat/src/lib/artifact-sandbox.ts:140-230` |
| The sandbox's response CSP sets connect-src 'none', no forms, scripts only from itself and pinned CDNs, and frame-ancestors limited to our web hosts. | read in the code | `infrastructure/sandbox/vercel.json` |
| Without a configured sandbox origin the web falls back to a same-document srcDoc iframe with sandbox allow-scripts allow-modals, where scripts may not run and React artifacts need the origin. | read in the code | `packages/ui/unified-chat/src/lib/artifact-sandbox.ts:3`; `apps/web/features/chat/components/SandboxedIframe.tsx`; `packages/ui/unified-chat/src/lib/artifact-preview-capability.ts` |
| The Tauri desktop build serves the same renderer from an artifact:// scheme compiled into the binary; the public Electron desktop shows the hosted web app. | read in the code | `apps/desktop/src-tauri/src/ui/artifact_sandbox.rs:1-40`; `AGENTS.md section 5` |
| Publishing uses api:POST /api/artifacts/publish; kinds html, react, svg, mermaid, markdown, text, code; content up to 1,000,000 characters; 200 publications per user; 24-character token; URL path /shared-artifact/<token>; html, react and mermaid render in the sandbox. | read in the code | `apps/web/app/api/artifacts/publish/route.ts`; `apps/web/lib/services/published-artifact-service.ts:50-110,289-296` |
| Publication runs the external-sharing gate, usage-policy moderation and outbound content inspection; a publication that uses connectors cannot be made public. | read in the code | `apps/web/lib/services/published-artifact-publication-policy.ts`; `apps/web/app/api/artifacts/publish/[token]/route.ts` |
| Anonymous read of a published artifact needs visibility public plus the token; organization visibility is limited to members with a grant row. | read in the code | `apps/web/lib/services/published-artifact-service.ts:824-840`; `apps/web/lib/services/published-artifact-service.ts:66-78` |
| AI and connector calls from artifacts go through api:POST /api/artifacts/runtime/... and are allowed only for artifacts made in a managed-cloud chat, subject to an AI switch and concurrent-turn limits. | read in the code | `apps/web/app/api/artifacts/runtime/artifact-completion.ts` |
| Project knowledge uploads require a SHA-256; older clients get 409 UPLOAD_PROTOCOL_UPGRADE_REQUIRED. | read in the code | `apps/web/app/api/uploads/presign/route.ts` |
| Chat attachments are checked against a hash denylist of known illegal media and a workspace data-loss policy before storage. | read in the code | `apps/web/lib/server/chat-attachment-completion.ts:361-450` |
| docs/security/upload-scanning.md says no web code calls the scanner's /v2 routes yet, but source-scan-client.ts and chat-file-intake/steps.ts do. | read in the code | `apps/web/lib/security/source-scan-client.ts:196-295`; `apps/web/lib/server/chat-file-intake/steps.ts:689` |
| Account export is api:GET/POST /api/user/export; media inside it is given as authenticated download links, not inline bytes. | read in the code | `apps/web/app/api/user/export/route.ts:382-387,3456-3458` |
| A guard script lists every route that stores upload bytes and the files that finish them, and requires each to inspect the bytes. | read in the code | `scripts/check-upload-inspection-coverage.mjs` |
| Mobile local mode parses documents on the phone with a device-memory ceiling and no plan count; cloud mode uses the server limits from the handshake. | read in the code | `apps/mobile/src/features/chat/utils/attachmentValidation.ts` |
| Whether production currently has the sandbox origin, the scanner and large files switched on is not established by any file read. | unknown | `no run record found` (not found) |

## Open questions

- Is the sandbox origin (NEXT_PUBLIC_SANDBOX_ORIGIN) set and the sandbox project redeployed in production? No run record was found.
- Is CHAT_LARGE_FILES_ENABLED on in production, and has the scanner been deployed with UPLOAD_SCAN_SOURCE_HOSTS and measured at the raised clamd limits?
- Do the VS Code extension and the Chrome extension upload files through the same presign and complete path in practice? Only imports and the relay rule were seen.
- Can a pure mode:own-key or mode:local user on web or desktop attach files without our servers, and where would those files be kept (no store:<name> was identified)?
- What are the exact Enterprise and Team Premium attachment and download numbers? They derive from price helpers or are marked custom.
- Which table backs the account-wide artifact index (migration 0121)?
- Product choice: should a published site be able to hold binary assets, or stay a single text document up to 1,000,000 characters?
- Product choice: should locally held files on mobile and desktop get any malware scan, given they never reach the scanner?
- Which knowledge-base page ids cover the AGI Subscription and entitlement rules? Only SYS-chat-turn-pipeline was named in the brief.

## Project documents found out of date

- `docs/security/upload-scanning.md`: Says no web code calls the scanner's POST /v2/scans yet, and that the two paths storing files are chat-attachment complete and project knowledge extraction. The code says: The web has a protocol 2 client and the large-file intake step runner submits source scans; the coverage guard lists a third finishing path, chat-file-intake/steps.ts, which must call inspectUploadHead and submitSourceScan. (apps/web/lib/security/source-scan-client.ts:196-295; apps/web/lib/server/chat-file-intake/steps.ts:181,689; scripts/check-upload-inspection-coverage.mjs (DEFERRED list))
- `docs/architecture/render-layer.md`: A Draft spec (2026-08-26) for typed response parts. It lists response-parts.ts files as new and does not describe the artifact sandbox origin, publishing or the Library. It cites artifact-store.ts line numbers that were not re-checked. The code says: packages/contracts/types/src/response-parts.ts and packages/contracts/cloud-contracts/src/response-parts.ts do not exist, so the described contract is not implemented. Artifact versioning is documented in the artifact store header (a different id with different content appends a version). (ls of both response-parts.ts paths returned no file; packages/platform/artifacts/src/artifact-store.ts:15-17)
