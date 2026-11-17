# Large chat file uploads

Status: In progress
Owner: Chat attachments maintainers
Last updated: 2026-11-16

Paid plans on Managed Cloud can attach chat files up to 500 MiB each and 20 per
message. A large file is never held whole in a function's memory and never sent
to a model whole. It goes up in parts straight to object storage, the scanner
pulls it from storage, a durable workflow seals it and prepares its text once,
and each turn gives the model a budgeted share: a card, an excerpt, retrieved
passages, and the original file in the code sandbox when code runs.

Files of 25 MiB or less keep today's synchronous path, byte for byte. Nothing
in the build is deployed, migrated or changed on Fly until the owner says so.
The code offers and accepts no large file until `CHAT_LARGE_FILES_ENABLED=on`
and the readiness checks pass, and none again once the flag is switched off.
The intake sweeper is the one exception: it runs whenever migration 0422 is
present, with the flag on or off, so intakes already in flight still finish
and are cleaned up after the flag is turned off (Lifecycle).

This directory holds three files:

- `spec.md`, this file: what is built, the rules that make partial deployment
  safe, the degradation matrix, and the owner decisions taken as defaults.
- `plan.md`: the deployment steps, how each part is tested locally, and the
  facts still unverified.
- `tasks.md`: the work packages, their files, waves and dependencies.

## Goal

The owner decided on 2026-11-14 that chat uploads must match the two leading
assistants.

- One states 500 MB per file, 20 files per chat, images up to 8000 by 8000
  pixels, and PDFs up to 1,000 pages with visual analysis up to 100 pages
  (`https://support.claude.com/en/articles/8241126-upload-files-to-claude`,
  read on 2026-11-14).
- The other states 512 MB per file, 2 million tokens per text or document file,
  20 MB per image and about 50 MB per spreadsheet. Its help article returned
  403 on 2026-11-14, so these figures come from the brief and cached copies.

500 MiB is 524,288,000 bytes, above both 500 MB and 512 MB, so one ceiling
matches both.

## Rules that make partial deployment safe

These four rules are requirements. Every package in `tasks.md` is checked
against them, and each has a test named in the degradation matrix.

1. **A large scan never delays or fails a small one.** Legacy `POST /scan`
   takes no part in large-scan admission; the scanner runs one large scan at a
   time and admits source bytes only within an hourly budget, which starts
   empty after every restart and refills over the first hour, because the VM's
   shared CPUs have a burst balance that back-to-back large scans could spend;
   liveness does not depend on clamd answering a probe or a signature read
   while a source scan is live, from its first byte to clamd until clamd's
   reply or its deadline (see Scanner protocol 2). Whether the budget is low
   enough is measured at deployment step 4 on a separate test app, never on the
   production scanner, and the flag is not switched on in production until that
   measurement passes.
2. **No web build reads a stored file before checking its stored size.** The
   first package to ship (`P1` in `tasks.md`) makes hydration decide from
   `media_assets.byte_size` which files it will read, and read each with a
   bound of the inline per-file limit. That build is the **rollback floor**:
   once any large file exists, the web is never rolled back below it, and
   `scripts/release/rollback.mjs` refuses such a target once the floor is
   recorded (`P20`).
3. **The prepared path is chosen by the asset's stored size, never by the
   flag.** A sealed file over the inline limit is read through its prepared
   segments in every build at or above the floor, whether the flag is on or
   off, so switching the flag off never makes a turn read a large file whole.
4. **A web build against a database without migration 0422 behaves exactly as
   today.** No existing statement's text changes to name a new table or
   column. Every path that must touch one first asks `chatFileSchemaReady(db)`
   (`apps/web/lib/server/chat-file-intake/schema.ts`, shipped by `P2`:
   `to_regclass` for both tables and `information_schema.columns` for
   `media_assets.scanned_sha256`) and does nothing new when it answers false.
   The complete list of existing paths that do so:
   - account erasure and organisation erasure (`P2`): when the schema is
     absent they skip both tables and report them deleted; erasure always
     asks uncached;
   - the data export (`P2`): the intake section in
     `apps/web/app/api/user/export/route.ts` runs only when the helper answers
     true, so a database without 0422 gets today's export with no section
     marked unavailable;
   - the `library_file` index loader, `open_file` and `search_files` (`P11`):
     only for an asset whose `byte_size` is above the inline limit;
   - the prepared resolver in hydration (`P15`): only for an asset whose
     `byte_size` is above the inline limit;
   - `/api/me` and create, through the readiness probe (`P14`);
   - the parts route, the complete route and the session `DELETE` (`P14`):
     they read or write the intake row only when the signed session's `kind`
     is `chat-large-file`. A `chat-attachment` session, which is every session
     an older client or a small file makes, issues exactly today's statements.
     `DELETE /api/files/intakes/:id`, the cancel after complete, is new code
     and runs only for an intake that exists.

   The seal inserts its media row with a statement of its own
   (`insertScannedChatFileMediaAsset` in `apps/web/lib/server/media-assets.ts`,
   `P12`). The statement text of `insertMediaAsset`, which every media insert
   uses (chat files, generated images, video), is unchanged, so no existing
   insert names `scanned_sha256`. New code (the intake routes, the workflow,
   the sweeper) runs only when readiness or the schema helper is true.

## Limits by kind

Built values for paid plans. Free stays at the inline limit (Owner decisions,
A). Every value is configuration with one owner (Limits, quotas and where each
is configured).

| Kind                                  | Per file | What is read for the model                                                                                      |
| ------------------------------------- | -------- | --------------------------------------------------------------------------------------------------------------- |
| Image (png, jpeg, gif, webp)          | 20 MiB   | Whole image after the server resize (inline path, unchanged)                                                    |
| PDF                                   | 500 MiB  | Text of up to 1,000 pages; scanned pages read by OCR only when a turn opens them, within caps                   |
| DOCX, PPTX                            | 100 MiB  | Text parts with heading or slide anchors, within the archive budget                                             |
| XLSX                                  | 50 MiB   | Profile and 200 sample rows per sheet, sheets in order within the archive budget; whole workbook in the sandbox |
| CSV, TSV                              | 500 MiB  | Header, row count, column profile and sample rows; whole file in the sandbox                                    |
| Text, code, Markdown, JSON, XML       | 500 MiB  | Text up to 8,000,000 characters                                                                                 |
| HTML                                  | 40 MiB   | As text; never rendered or fetched                                                                              |
| Notebook (.ipynb)                     | 50 MiB   | Cell text, base64 outputs dropped                                                                               |
| Archives, audio, video, legacy Office | Refused  | Not accepted in the first version                                                                               |

Per message: 20 files and 2 GiB, further bounded by the person's remaining
storage (Owner decisions, D). A PDF over 1,000 pages is accepted; pages beyond
1,000 are reported as unread and the whole file is still in the sandbox. HTML
stops at 40 MiB because clamd stops normalising HTML above `MaxHTMLNormalize`
(40M) and the first version does not accept files it scans with reduced
coverage that it can avoid.

## Where the pipeline breaks today

Checked in the repository on 2026-11-14:

- `services/upload-scanner/src/server.ts` takes the whole file in one buffered
  `POST /scan`: `MAX_SCAN_BYTES = 25 * 1024 * 1024`, `SCAN_DEADLINE_MS = 14_000`.
  The web gives up after 15 s (`apps/web/lib/security/upload-scan.ts`,
  `AbortSignal.timeout(15_000)`).
- `/health` runs an EICAR scan through clamd with a 3 s deadline, cached 30 s,
  and `watchClamd` in `src/daemons.ts` stops the process when that probe has
  not succeeded for 5 minutes. `fly.toml` checks `/health` every 30 s with a
  5 s timeout, on 2 shared CPUs and 4 GB.
- `services/upload-scanner/clamav/clamd.conf` sets no size limits, so the
  ClamAV defaults bind: `StreamMaxLength` 100M, `MaxFileSize` 100M,
  `MaxScanSize` 400M, `PCREMaxFileSize` 100M, `MaxEmbeddedPE` 40M. With
  `AlertExceedsMax yes`, a file over `MaxFileSize`, `MaxScanSize` or
  `MaxRecursion` is flagged `Heuristics.Limits.Exceeded`; the other size limits
  skip work silently. `TemporaryDirectory` is `/dev/shm`.
- `apps/web/app/api/llm/v1/chat/completions/lib/chat-attachment-hydration.ts`
  calls `readStoredMedia(asset.storagePathname)` with no byte bound, four at a
  time, keeps every result in memory, and checks
  `MAX_CHAT_ATTACHMENT_MESSAGE_BYTES` only after reading.
  `readStoredMedia(pathname, maxBytes)` already accepts a bound and throws
  `StoredObjectTooLargeError` above it.
- `apps/web/lib/server/chat-attachment-completion.ts` reads the object with
  `getBoundedPrivateObject`, scans it with `scanUploadBytes`, writes the sealed
  copy with `putPrivateObject`, and inserts `media_assets` naming its columns.
  The sealed key is `sealedChatAttachmentPathname(stagingKey)`, and
  `isOwnedChatAttachmentUploadKey` refuses the sealed suffix but accepts any
  other key under `chat-attachments/<userId>/`, so a client can write to a
  staging key it can name.
- `media_assets.conversation_id` is `on delete set null`
  (`apps/web/db/neon/0107_media_assets_web_conversation_owner.sql`), so
  deleting a conversation updates its attachment rows and leaves them counted.
- The create request and the resumable session require `checksumSha256`
  (`packages/contracts/cloud-contracts/src/resumable-uploads.ts`,
  `apps/web/app/api/files/uploads/resumable-upload.ts`), and `parseSession`
  refuses a `kind` it does not list. `RESUMABLE_PART_URL_TTL_SECONDS = 900`.
- `uploadNeedsSameOriginRelay` (`apps/web/lib/server/upload-transport.ts`)
  forces the relay for every request when `VERCEL_ENV` is not `production`,
  except on `localhost:3000` and for an origin listed in
  `UPLOAD_STORAGE_CORS_ORIGINS`, and always for the Chrome extension. A
  request without an `Origin` header is judged by the host it reached.
- The chat tool loop runs up to `DEFAULT_CHAT_TOOL_MAX_STEPS = 10` steps and
  Work mode 100 (`packages/contracts/cloud-contracts/src/tool-call-limits.ts`);
  `open_file` returns up to `MAX_OPEN_FILE_CHARS = 60_000` per call.
- Embeddings and OCR are reserved against the person's own usage ledger
  (`apps/web/lib/services/retrieval-embedding-service.ts`,
  `apps/web/lib/server/scanned-document-text.ts`, whose
  `transcribeScannedPages` sends all page images in one call with
  `MAX_OCR_OUTPUT_TOKENS = 4_000`). Retrieval chunks have a `search_vector`
  (migration 0202), so keyword search works without embeddings.
- `apps/web/lib/server/pdf-attachment-content.ts` stops at
  `MAX_TEXT_PAGES = 250` and `MAX_IMAGE_PAGES = 30`;
  `apps/web/lib/security/archive-budget.ts` allows 2,000 members, a ratio of
  120 and 200 MiB uncompressed.
- `OBJECT_STORAGE_REQUEST_TIMEOUT_MS = 10_000` is the shared store's request
  timeout (`apps/web/lib/server/object-storage-timeouts.ts`), but it is not an
  enforced deadline on every call: the SDK handler only ends a request that
  passes it when the client sets `enforceRequestTimeout`, which only the
  seal's long-deadline copy client does, and `withRequestTimeout` in
  `packages/platform/object-storage/src/adapters/s3.ts` bounds only the open
  of a `get`. A body drain that stalls without a reset therefore waits until
  the platform ends the function (known flaws).
- `presignGet` in `packages/platform/object-storage/src/adapters/s3.ts` signs
  only `ResponseContentDisposition`. The `ObjectStore` port has no object
  listing, but has `listPendingMultipartUploads(bucket, prefix)`.
- `apps/web/lib/server/object-backup.ts` `replicateObject` skips objects over
  `OBJECT_BACKUP_MAX_BYTES = 256 MiB` and reads every other object whole
  (`source.get`, which is `Body.transformToByteArray()` in
  `packages/platform/object-storage/src/adapters/s3.ts`) before one `put`. The
  hourly cron `apps/web/app/api/cron/replicate-object-backups/route.ts`
  (`maxDuration = 300`) selects every `media_assets` row with a
  `storage_pathname`, writes each source's cursor only after its whole loop,
  and answers 500 from one outer `catch` when any object throws, so one object
  that always fails stops media backups and the project-knowledge source after
  it on every run. Today the largest chat object is 25 MiB.
- `knowledgeStorageBytes` is 100 MiB on Free, 1 GiB on Basic and 10 GiB on Pro
  (`packages/contracts/types/src/billing-catalog.ts`).
- The installed e2b 2.63.0 uploads a `ReadableStream` with octet-stream and
  never buffers it; below envd 0.5.7 it throws `TemplateError` instead.
- `vercel.json` sets `git.deploymentEnabled: false`, so a merge to main does
  not deploy.
- The chat completions route has `maxDuration = 300`.

Already in place and built on (uncommitted in this worktree on 2026-11-14;
the packages build on the working tree as it is, and `tasks.md` gate G0 states
what must hold before wave 1): the 25 MiB inline policy with
images to 20 MiB re-encoded on the server, `attachment_limits` in `/api/me`,
4 MiB relay segments, the scanner's end-of-scan reply handling, and the mobile
`apps/mobile/src/features/chat/upload/attachmentLimits.ts`.

## Data flow

The example is a 480 MB PDF sent from a paid account on Managed Cloud.

1. **Limits.** The client reads `attachment_limits` from `/api/me`. The server
   offers large files only when all of these hold: the request carries
   `x-agi-client-capabilities` with the token `large-chat-files-v1`, the
   readiness probe passes, the plan's `maxChatFileBytes` is above the inline
   limit, and the request's origin can reach storage directly. Then
   `large_files_available: true` is set, the existing fields carry the
   effective large limits and `inline_message_bytes` carries today's message
   budget (The effective limit). Otherwise the answer is today's, byte for
   byte.
2. **Attach.** The client refuses before reading the file: an unsupported
   type, a file over its kind's cap in the compiled policy, a file over
   `max_file_bytes`, a message over its count or `max_message_bytes`, or files
   of 25 MiB or less (images included) that together pass
   `inline_message_bytes`.
3. **Metered network, phone only.** Above `largeFiles.cellularConfirmBytes`
   (50 MiB) on an expensive connection, the phone asks once: "Upload 480 MB
   over cellular?" with Upload and Cancel. The phone's client is `P17`, which
   is deferred until the App Store review binary is built (`tasks.md`), so
   version 0.0.1 of the phone app has no large-file client and keeps the
   25 MiB per-file limit.
4. **Hash.** The client computes the whole-file SHA-256 before create, as both
   clients already do: WebCrypto for files up to the inline limit (today's
   code), and an incremental SHA-256 in 8 MiB slices for larger files, yielding
   between slices. The shared client does not bring the hasher: its caller
   passes `createSha256`, and the client refuses a large file before any
   request when none is passed, because
   `scripts/check-cloud-contract-ownership.mjs` allows cloud-contracts only
   `@agiworkforce/types` and `zod` as production dependencies. The web passes
   `@noble/hashes` (declared in `apps/web/package.json`); mobile keeps its
   existing chunked hash.
5. **Create.** `POST /api/files/uploads` with the new kind `chat-large-file`
   for files over the inline limit, `chat-attachment` otherwise (today's
   request). The kind is chosen by size and `large_files_available`, never by
   anything else.
   - The large create has its own schema,
     `ManagedCloudChatLargeFileCreateRequestSchema` (`P6`): `kind`,
     `fileName`, `mimeType`, `byteCount` up to `CHAT_LARGE_FILE_MAX_BYTES`,
     `checksumSha256`, and optional `conversationId` and `temporary`, validated
     as on complete. The existing create union, `RESUMABLE_UPLOAD_KINDS` and
     `RESUMABLE_UPLOAD_MAX_BYTES` are not changed.
   - Create does not require the capability header. A large create is
     admitted by its kind, readiness, the plan and the request's origin.

   Admission reads no bytes and checks the kind cap, the plan's
   `maxChatFileBytes`, the daily large-file byte budget, the in-flight intake
   count, and the storage quota (`assertFileStorageAvailable` with the
   declared bytes of the person's non-terminal intakes added to used storage,
   except in temporary chats; The effective limit). It creates the multipart
   upload on a server-generated staging key
   (`uploadObjectKey('chat-attachment', ...)`, so `upload-keys.ts` is
   unchanged) under `chat-attachments/<userId>/`, inserts a
   `chat_file_intakes` row in `awaiting_parts` (with the conversation id
   `resolveTemporaryChatUpload` validated), and returns the signed session.
   - One person's large creates are serialised: the insert and the
     confirming count of in-flight intakes and in-flight bytes run in one
     transaction whose first statement is
     `pg_advisory_xact_lock(hashtextextended('agi:chat-file-intake:<userId>', 0))`
     (`apps/web/app/api/files/uploads/route.ts`). Each create therefore sees
     every earlier committed row, so of creates that overlap exactly the
     plan's `maxConcurrentChatFileIntakes` are admitted, and a refused create
     rolls its row back, aborts its multipart upload and refunds its daily
     bytes. The lock is tested with a fake that models it as a per-user
     queue, not against Postgres (known flaws).
   - Part size 8 MiB above 100 MiB (`largeFilePartBytes`), otherwise 5 MiB.
   - An old server refuses the unknown kind; a new client sends it only when
     that server offered large files, which an old server never does.

6. **Parts.** Presigned PUTs go straight to storage, 4 at a time on web and 2
   on mobile, each URL valid for `RESUMABLE_PART_URL_TTL_SECONDS` (900 s); an
   expired URL is fetched again from the parts route. The relay carries only
   files of 25 MiB or less, in 4 MiB segments; an origin that needs the relay
   is never offered large files, and if a `chat-large-file` session asks the
   parts route from such an origin anyway, the route answers `409`
   `large_file_needs_direct_upload` instead of a relay URL (`P14`). A part is
   therefore never relayed through a function.
   - Resume uses the existing persisted session store of the shared client,
     keyed by kind, SHA-256 and size, and for `chat-large-file` also by the
     Temporary Chat flag and the conversation id. After a page reload the browser cannot
     reopen the file, so the person picks it again; the client hashes it,
     finds the stored session and sends only the missing parts.
   - Cancel before complete aborts open tasks and sends today's session
     `DELETE` (`managed-cloud-resumable-upload-client.ts` `abort`, about line
     390, handled by `handleAbort` in
     `apps/web/app/api/files/uploads/[uploadId]/route.ts`, about line 384).
     For a `chat-large-file` session that handler lists the uploaded parts,
     aborts the multipart upload, then calls `cancelIntakeByStagingKey`
     (`P12`'s store) with the session's key, which sets the row `cancelled`
     (`cancel_reason: client`), refunds the declared bytes minus the stored
     ones and frees the in-flight slot at once. When the row has already
     left `awaiting_parts` (the cancel raced the complete), the handler
     cancels the intake as its own `DELETE` would; when the intake has
     reached `sealing` or `sealed`, the file can no longer be stopped, so the
     handler logs it and answers `{aborted: true, intake: {id}}`
     (`ManagedCloudResumableUploadAbortResponseSchema`; `intake` is optional
     and absent in every other answer) so that a client can read that intake
     and show the file instead of leaving it in the Library unannounced. For
     a `chat-attachment` session it issues today's statements only. Cancel
     after the `202` sends `DELETE /api/files/intakes/:id`.
   - After a cancel the web reads each intake it noted once and hands a file
     that is still `checking` or `ready` to the `onKeptAfterCancel` callback
     of `uploadChatAttachments`
     (`apps/web/features/chat/services/chat-attachment-upload.ts`).
     `WebChatPage.tsx` passes that callback, which keeps the file visible in
     the composer and, for a file still checking, follows its intake until it
     is ready or refused (a refusal shows the server's reason). The web notes
     an intake from the `202` and from a session `DELETE` answer that names
     one (`watchLargeFiles`), so a file whose cancel came too late is kept
     visible in either case.
   - An upload that asks the parts route for nothing for
     `intake.awaitingPartsIdleMs` (2 h) is ended by the sweeper as
     `cancelled` (`cancel_reason: idle`). A client that comes back later finds
     its session gone and starts the file again with a new create.
7. **Complete.** `POST /api/files/uploads/:id`. The path is chosen by the
   signed session's `kind`, never by a header. For `chat-large-file` the server
   completes the multipart upload, sets `uploaded`, starts
   `chatFileIntakeWorkflow(intakeId)` and answers `202`
   `{kind:'chat-attachment-intake', intake:{id, state:'checking'}}`, parsed by
   its own `ManagedCloudChatLargeFileCompleteResponseSchema` (`P6`); the
   existing complete-response union is not changed. For
   `chat-attachment` today's synchronous completion runs and answers
   `{kind:'chat-attachment', attachment}`.
8. **Wait.** The shared upload client polls `GET /api/files/intakes/:id` every
   2 s backing off to 10 s, only while the page is visible or the app is in the
   foreground, and reports the existing `verifying` phase. It resolves with the
   attachment once the intake is `sealed`, so web and mobile composers hold the
   send exactly as they hold it for a file still verifying today.
9. **Inspect, scan, seal, prepare, index** run in the workflow (sections
   below). From `sealed` the file can be sent.
10. **Turn.** The message references `/api/files/<assetId>` as today.
    Hydration builds each file's share (What the model receives).
11. **Download** above `MAX_SERVE_BYTES` redirects to storage only for a
    browser navigation or a request carrying the token; every other request
    keeps today's `413` (Downloads).

## Intake states

`chat_file_intakes.state`: `awaiting_parts`, `uploaded`, `inspecting`,
`scanning`, `sealing`, `sealed`, `rejected`, `failed`, `cancelled`.
Preparation has its own state on `chat_file_preparations` (`preparing`,
`ready`, `ready_partial`, `prepare_failed`), because a sealed file is usable
whatever its preparation does.

- Every transition is a compare-and-set:
  `update ... where id = $1 and state = $expected returning ...`, with the
  workflow run id recorded.
- **Re-entry.** The inspect, scan and seal steps each re-enter their own
  state, by one rule: the step's compare-and-set accepts the state before it,
  or its own state when `workflow_run_id` is the same run or `lease_until` has
  passed, and a step that re-enters redoes its work from its start.
  - Inspect accepts `uploaded`, or `inspecting` under the rule. It inspects
    again from the start (the HEAD, the 256,000-byte read,
    `inspectUploadHead` and, for a text type, the credential scan of the
    rest of the file), never trusting a check an earlier run may have half
    done. The credential scan's cursor lives only in the run's directives,
    so a retried step scans the same range again and a re-dispatched run
    starts it from the first byte.
  - Scan accepts `inspecting` (after the fairness wait), or `scanning` under
    the rule. On re-entry it polls the recorded `scan_job_id` first; `unknown`
    submits a new attempt as in the retry table, and any other answer
    continues the poll.
  - Seal accepts `scanning`, or `sealing` under the rule. A re-entered seal
    runs again from its step 2; at step 5 the HEAD of the sealed key finds a
    finished copy (Seal).
- A re-dispatched run starts at the step that matches the row's state:
  `uploaded` and `inspecting` at inspect, `scanning` at the scan poll,
  `sealing` at the seal.
- A step whose compare-and-set matches nothing ends the run. It never falls
  through to the next step, so a second live run, or a second delivery while
  another run holds a live lease, does nothing.
- **Leases.** Every compare-and-set into a leased state sets
  `lease_until = now() + intake.leaseMs[state]`, and a step that holds a state
  across workflow sleeps renews it the same way on every wake (each scan poll,
  each `429` resubmit, each per-user fairness wait). The sweeper re-dispatches
  a row only when `lease_until < now()`. Built values, in the `intake` policy
  block owned by `P6`:

  | State            | `intake.leaseMs` key | Built value                      | Why it is long enough                                                                                                                                                                                                                                                                                                                                                                                      |
  | ---------------- | -------------------- | -------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
  | `awaiting_parts` | none                 | no lease                         | Ended only by the idle rule (`intake.awaitingPartsIdleMs`, 2 h)                                                                                                                                                                                                                                                                                                                                            |
  | `uploaded`       | `uploaded`           | 300000 (5 min)                   | Set by the complete route; the workflow's first step moves the row on within seconds, so a row still `uploaded` after 5 min means the start failed                                                                                                                                                                                                                                                         |
  | `inspecting`     | `inspecting`         | 300000 (5 min)                   | The inspect step is a HEAD and a 256,000-byte read; each credential-scan step of a text type renews it and reads at most 64 MiB, measured 2026-11-16 on a development laptop under load at 1.7 s for prose, 2.6 s for a digit-dense CSV and 35 s for the slowest ReDoS-test input (a run of `eyJ`); the fairness wait renews it every 30 s; after it passes, a re-dispatched run inspects again (Re-entry) |
  | `scanning`       | `scanningExtra`      | `scanGiveUpMs` + 300000 (35 min) | No single sleep is longer than `scanGiveUpMs` (30 min), so a live run always renews before the lease passes; after it passes, a re-dispatched run polls the recorded job (Re-entry)                                                                                                                                                                                                                        |
  | `sealing`        | `sealing`            | 900000 (15 min)                  | Longer than one step function's 800 s maximum, so no seal step can still be copying when its lease passes; three copies at the built 500 MiB deadline (80 s each) and the HEADs take under 5 min                                                                                                                                                                                                           |

  The copy deadline is bounded so that three copies always fit inside one
  step: `plan.md` step 4 stops if the measured deadline would pass 240 s.

- Cancel is accepted from `awaiting_parts`, `uploaded`, `inspecting` and
  `scanning`. From `sealing` on, cancel answers that the file is already being
  added; the person removes it like any attachment.
- The client sees `uploading`, `checking`, `ready`, `rejected`, `failed`,
  `cancelled`, mapped in `chat-file-intake.ts`.
- `rejected` carries `refusal_code`: `malware`, `encrypted`,
  `limits_exceeded`, `active_pdf`, `type_mismatch`, `denylist`, `dlp_blocked`,
  `checksum_mismatch`, `size_mismatch`, `changed_during_check`,
  `storage_full`.
- `failed` carries `failure_code`: `scan_unavailable` or `stalled`.
- `cancelled` carries `cancel_reason`: `client` or `idle`.

## Scan design

**Chosen:** the scanner pulls the file from storage through a presigned GET
for one object. The web submits a job and polls it from workflow steps that
sleep between polls. No function carries the file's bytes or waits on the scan.

**Rejected:** a function streaming storage into the scanner (every byte
through Vercel, a function held for the whole scan); scanning byte ranges
separately (ClamAV needs whole containers); a callback resuming a workflow hook
(a new inbound signed route, replay handling, and polling still needed as a
fallback); an NDJSON response held open (depends on the Fly proxy's idle
timeout, unverified); giving the scanner storage credentials.

### Scanner protocol 2 (`services/upload-scanner`)

- **Legacy `POST /scan` is unchanged** in code and admission: 25 MiB, buffered,
  14 s, no semaphore, no queue. Large scans cannot take capacity from it.
- **`POST /v2/scans`**, bearer token as today. Body
  `{jobId, sourceUrl, byteCount, etag, mimeType}`; `jobId` is
  `<intakeId>:<attempt>`, and a repeat returns the same scan.
  - Refused before any fetch: a non-https `sourceUrl`, a host not in
    `UPLOAD_SCAN_SOURCE_HOSTS`, an IP literal, a `byteCount` over
    `MAX_SOURCE_SCAN_BYTES`.
  - The fetch uses `redirect: 'error'` and `If-Match: <etag>`. The verdict
    carries the ETag the scanner read, so correctness does not depend on the
    store honouring the header.
  - A fetch that fails (a connection error, a `403` from a URL that expired
    while the job was queued, any other non-2xx except `412`) gives
    `incomplete` with reason `source_unavailable`. A `412` gives `incomplete`
    with reason `source_changed`.
  - Answers `202 {scanId, deadlineMs}`, where `deadlineMs` is this job's
    per-scan deadline (below) computed from its `byteCount` with the
    scanner's own `SCAN_BASE_MS` and `SCAN_MIN_BYTES_PER_SEC`, so the web
    never copies the formula. Or `429` with `Retry-After` and a body
    `{reason: 'queue_full' | 'source_budget'}`: `queue_full` when
    `SCAN_QUEUE_MAX` jobs wait, `source_budget` when the hourly source budget
    or the restart ramp has no room.
  - The source fetch is an option of `createScannerServer`
    (`fetchSource`, defaulting to the global `fetch`), as `probe` and `now`
    are today (`ScannerOptions`, `services/upload-scanner/src/server.ts`,
    lines 27 to 33). The URL rules above run before it is called, so a test
    passes an allowlisted https URL and a `fetchSource` that answers from the
    local fake source, and the rules are still exercised.
- **Admission.** `SCAN_SOURCE_CONCURRENCY` (built value 1) source scans run at
  once; `SCAN_QUEUE_MAX` (built value 20) wait in FIFO order behind them.
- **Hourly source budget.** `SCAN_SOURCE_BYTES_PER_HOUR` (built value
  2147483648, 2 GiB) in `src/config.ts`, enforced in `src/scan-queue.ts`. A new
  `jobId` is admitted only while the `byteCount` of the source scans admitted
  in the last 60 minutes, plus its own, stays within the budget; a repeated
  `jobId` is not charged again.
  - **After a restart the budget starts spent.** The window is in memory, so
    a restart (deploy, watchdog exit, clamd exit, out of memory) forgets what
    it admitted. The allowance therefore returns linearly over the first 60
    minutes of the process's uptime: a new `jobId` is admitted only while
    the bytes admitted in the last 60 minutes plus its own stay within
    `SCAN_SOURCE_BYTES_PER_HOUR x min(1, uptime / 60 min)`. At uptime 0
    nothing is admitted; at 30 minutes half the budget is. A new Machine also
    starts with almost no CPU burst balance (below), and the ramp gives it the
    hour in which an idle shared Machine accrues one. Over any hour that spans
    a restart at most twice the budget can be admitted, which the factor of
    one half in the step 4 budget formula covers.
  - Otherwise the answer is `429` with `Retry-After` set to the seconds until
    enough of the window has passed or enough of the ramp has elapsed, at
    least 60. The web's retry table treats that `429` like a full queue: no
    attempt is used.
- **Why a budget and not only a queue.** `fly.toml` runs 2 `shared` vCPUs.
  Fly's page (`https://docs.fly.io/machines/cpu-performance`, read on
  2026-11-15) says a shared vCPU's baseline quota is 5 ms per 80 ms, "Quotas
  are shared between a Machine's vCPUs" (so `shared-cpu-2x` gets 10 ms per
  80 ms in total: 12.5% of one core, 450 CPU-seconds an hour), the burst
  balance is capped at 500 s, a new shared-vCPU Machine starts with a 5 s
  balance, and "When the balance is depleted, the vCPU is limited to running at
  its baseline quota". Back-to-back large scans could therefore spend the
  balance, after which clamd, legacy scans, the EICAR probe and the signature
  read share one eighth of one core, and a legacy 25 MiB scan would pass its
  14 s deadline. How much CPU a 500 MiB scan uses is not known. The built
  budget is deliberately low; deployment step 4 measures CPU-seconds per byte
  on a separate test app, sets the budget from that measurement, and confirms
  it in an hour-long run, or stops for the VM decision (Owner decisions, H).
  Until that run passes, large files stay off in production.
- **`GET /v2/scans/:id`** answers `{status: queued | scanning | done | unknown,
deadlineMs?, verdict?}`, with `deadlineMs` (the same value the `202` gave)
  for every status but `unknown`. Jobs live in memory for 1 hour; `unknown`
  after a restart means submit again.
- **`GET /v2/capability`**, authorized, answers
  `{protocol: 2, maxSourceScanBytes, queueDepth, running}` without calling
  clamd. The web's readiness probe reads this, never `/health`.
- **Liveness.** `/health` keeps its shape. Today `health()` answers 503 when
  either half of the probe fails, the EICAR scan or the signature read
  (`services/upload-scanner/src/server.ts`, `probeClamd` and `health`).
  `scanStream` in `src/clamd.ts` writes every chunk, sends the end marker and
  only then waits for the reply, and clamd scans after the stream ends, so the
  CPU-heavy phase of a large scan is the wait after the last byte, not the
  writes.
  - **A live source scan** runs from the first byte written to clamd's socket
    until the first of: clamd's reply, the socket closing, or the scan's
    per-scan deadline. It does not depend on recent socket writes, so the
    whole scan phase is covered.
  - While a source scan is live, the EICAR half counts as alive even if the
    probe timed out, and a signature read that failed or timed out is replaced
    by the last good signature status the process read, with freshness still
    judged from that value's `publishedAt`; with no good value ever read, the
    answer is 503 as today. `watchClamd` uses the same rule. A probe asked
    while a source scan is live keeps the exemption when its answer arrives
    after the scan ended, and the cached probe result is dropped when the
    last live scan ends and at every deadline (`livenessProbe` and
    `clamdProbe` in `src/server.ts`), so a cached answer never outlives the
    scan it was taken during.
  - **A hung clamd is not masked for long.** When a source scan ends at its
    deadline with no reply from clamd, the exemption is withheld from every
    later source scan until a probe succeeds again. A clamd that accepts
    streams but never answers therefore gets at most one per-scan deadline
    (130 s at the built values for 500 MiB) of exemption before `/health` and
    the watchdog behave exactly as today.

  Outside a live source scan both halves behave exactly as today. With one
  machine, a failing `/health` stops Fly routing to it
  (`services/upload-scanner/README.md`, about line 53), which is why the
  exemption covers the whole scan. A large scan that clamd answers within its
  deadline therefore never makes the watchdog restart the process or Fly's
  check fail.

- **Logs never carry the source URL.** The scanner logs the job id, the
  source host, the byte count and the outcome. It never logs `sourceUrl`, its
  path or its query (a presigned read of an unscanned file for 30 minutes),
  and a fetch error is logged by class and status code, never by its message
  text, which can contain the URL.
- **One pass over the stream:** a SHA-256 and byte counter; for PDFs a
  sliding-window token scan for `/JavaScript`, `/JS`, `/Launch` and
  `/EmbeddedFile` over the bytes outside stream bodies (it skips from a
  `>> stream` opener to the next `endstream`, so an object placed inside a
  stream body is not seen by it; known flaws); then clamd INSTREAM through
  the existing `scanStream`, which reads every byte. A byte count that
  differs from `byteCount` gives `size_mismatch`.
- **Verdict:** `{jobId, outcome, reason?, sha256, bytes, etag, ms}` with
  `outcome` one of `clean`, `infected`, `incomplete`. For `infected`, `reason`
  is `encrypted` for `Heuristics.Encrypted.*`, `limits_exceeded` for
  `Heuristics.Limits.Exceeded*`, `active_pdf` or `size_mismatch`; for
  `incomplete` it is `deadline`, `source_unavailable`, `source_changed` or
  `scan_failed` (clamd unreachable, an early or unparseable reply, a run that
  crashed). The web retries every `incomplete` reason but `source_changed`
  (`apps/web/lib/security/source-scan-client.ts`). The
  signature name stays in logs. Every verdict shape is pinned in
  `services/upload-scanner/__tests__/fixtures/protocol-2.json` (`P3`), which
  the web's verdict parser test also reads (`P12`).
- **Per-scan deadline:** `SCAN_BASE_MS + bytes / SCAN_MIN_BYTES_PER_SEC`,
  built 30 s plus 2 s per 10 MiB, reset from the deployment step 4 measurement.
  It is carried as `deadlineMs` in the `202` and poll answers, and every
  shape that carries it is pinned in `fixtures/protocol-2.json`. A deadline
  gives `incomplete: deadline`, which is retried, never treated as safe or as
  a rejection.

### clamd settings (`services/upload-scanner/src/config.ts`)

Defaults checked in
`https://raw.githubusercontent.com/Cisco-Talos/clamav/main/etc/clamd.conf.sample`
on 2026-11-14. The settings live in `CLAMD_SOURCE_SCAN_SETTINGS` in
`src/config.ts`. When protocol 2 is on (`UPLOAD_SCAN_SOURCE_HOSTS` is set),
`src/index.ts` writes them over the shipped `clamav/clamd.conf` into
`/var/tmp/upload-scanner/clamd.conf` (`writeSourceScanClamdConfig` in
`src/daemons.ts`) and starts clamd with that file; with protocol 2 off clamd
starts with the shipped file, which is unchanged. Every size-gated setting is
written explicitly, and `__tests__/clamd-config.test.ts` pins each value.

| Setting              | Default | Built            | Why                                                            |
| -------------------- | ------- | ---------------- | -------------------------------------------------------------- |
| `StreamMaxLength`    | 100M    | 520M             | INSTREAM closes the stream above it                            |
| `MaxFileSize`        | 100M    | 520M             | Above it the file is not scanned (alerted)                     |
| `MaxScanSize`        | 400M    | 1024M            | Room for unpacked OOXML; reset from the step 4 corpus          |
| `PCREMaxFileSize`    | 100M    | 520M             | Above it PCRE subsignatures are skipped silently               |
| `MaxEmbeddedPE`      | 40M     | 520M             | Above it embedded-PE analysis is skipped silently              |
| `MaxHTMLNormalize`   | 40M     | 40M, pinned      | HTML is capped at 40 MiB instead                               |
| `MaxHTMLNoTags`      | 8M      | 8M, pinned       | Known reduced coverage, listed in known flaws                  |
| `MaxScriptNormalize` | 20M     | 20M, pinned      | Known reduced coverage for scripts over 20 MiB, in known flaws |
| `MaxZipTypeRcg`      | 1M      | 1M, pinned       | Unchanged                                                      |
| `MaxRecursion`       | 17      | 17, pinned       | Unchanged                                                      |
| `MaxFiles`           | 10000   | 10000, pinned    | Reset from the step 4 corpus                                   |
| `MaxScanTime`        | 120000  | 600000           | The sample says this version applies it to ZIP archives only   |
| `ReadTimeout`        | 120     | 300              | A slow storage fetch                                           |
| `AlertExceedsMax`    | no      | yes, kept        | Over-limit files are refused with their own copy               |
| `AlertEncrypted`     | no      | yes, kept        | Encrypted files are refused                                    |
| `TemporaryDirectory` | system  | `/var/tmp/clamd` | Out of RAM; the Dockerfile creates it                          |

These settings are global to clamd, so with protocol 2 on they also apply to
legacy `POST /scan`: a 25 MiB file that inflates past 400 MiB, refused quickly today
as `Heuristics.Limits.Exceeded`, can after the change keep clamd working up to
`MaxScanSize` after the 14 s legacy deadline has answered `503`, and
`TemporaryDirectory` moves legacy spooling from memory to disk. Deployment
step 4 measures that case on the test app and lowers `MaxScanSize`, or keeps
`MaxScanTime` at its default, if it costs too much (`plan.md`).

The sample documents `AlertExceedsMax` only for `MaxFileSize`, `MaxScanSize`
and `MaxRecursion`; whether exceeding `MaxFiles` is alerted is measured at
deployment step 4. No Fly volume is used, because "The `bluegreen` strategy
cannot be used for Machines with attached volumes"
(`https://docs.fly.io/reference/configuration/`) and `fly.toml` deploys
bluegreen. The rootfs size is measured at step 4; the fallback is `/dev/shm` on
an 8 GB VM with 4 shared CPUs, which is an owner cost decision.

### Web side of the scan

- `apps/web/lib/security/source-scan-client.ts` (new, `P12`, so that it
  merges with its first importer): `submitSourceScan`, `readSourceScan`,
  `readScannerCapability` (1,500 ms timeout; any error means protocol 1).
- `inspectUploadHead(bytes, mime, filename)` in `upload-scan.ts` runs the
  structural, credential, filename and DLP checks `scanUploadBytes` runs today,
  on the first `UPLOAD_INSPECTION_BYTES` (256,000), without the external scan.
- The credential detectors read a large file as text when its declared type
  is one they read (`credentialScanReadsContent`: `text/*`, JSON, XML, YAML,
  shell, JavaScript, PHP, SQL), or when its kind by the declared type or by
  its name alone is text, delimited, HTML or notebook
  (`credentialScanMimeType`), because chat accepts a file by its name and
  preparation and the sandbox read a `.txt` as text whatever type the client
  declared. The structural checks keep the declared type. For such a file the
  credential detectors read the head and then every byte after it before
  anything is submitted
  (`apps/web/lib/server/chat-file-intake/full-inspection.ts`): one ranged read
  of at most `kinds.text.bytesPerStep` (64 MiB) per workflow step, scanned in
  windows no larger than the head, each answering for the matches that start
  in it and reading `CREDENTIAL_SCAN_GUARD_BYTES` (16,384) either side, so a
  match across a window or step edge is found once. Every step holds the
  object to the entity tag the head was read under (`changed_during_check`
  otherwise); a short read throws and the run is retried or re-dispatched,
  never submitted. A finding that refuses a small file refuses the large one
  (`dlp_blocked`); the rest go with the head's findings to the workspace data
  policy, which decides as it does for a small file. A whitespace run of more
  than about 16,000 bytes between a keyword and its value, across a window
  edge, is not matched. PDF, Office and XLSX files, by declared type and by
  name, are not read by the credential detectors at any size, large or inline.
- `matchDenylistedSha256` in `hash-denylist.ts` matches a hash against the
  existing denylist.

Polling while queued or scanning: sleep 5 s, 10 s, 20 s, then every 30 s
(`intake.scanPollScheduleMs`). An attempt's deadline is the `deadlineMs` of
the scanner's latest answer for that job (the `202` or a poll) plus 60 s,
counted from the first poll that sees `scanning`; time spent `queued` does not
count against it. The web never computes the scanner's deadline itself, so
when deployment step 4 raises it the web follows without a change.

`first_submitted_at` is set by the first submit of the intake and never
changes. `intake.scanGiveUpMs` (30 min) is measured from it, less the time the
intake spent waiting on `429 source_budget`:

- every sleep after a `429` whose reason is `source_budget` adds its length to
  the intake's `scan_budget_wait_ms`, up to `intake.budgetWaitMaxMs` (built
  7200000, 2 h); waiting beyond that cap counts toward `scanGiveUpMs` as
  usual;
- time spent on `429 queue_full`, on `queued` polls and on errors counts as
  today;
- no single sleep is longer than `scanGiveUpMs`, whatever `Retry-After` says;
  a longer `Retry-After` is honoured by sleeping again, renewing the lease on
  each wake.

2 h covers the restart ramp at the lowest budget step 4 allows (a 500 MiB
file is admitted at 60 minutes of uptime when the budget is 524288000 bytes;
at 2 GiB it is 14.6 minutes, at 1 GiB 29.3 minutes) plus a window spent by
other files, so a file admitted at create waits in `checking` through a
restart instead of ending `scan_unavailable` after its bytes were uploaded.

Per-user fairness: the submit step waits (workflow sleep, 30 s) while another
intake of the same user is in `scanning`, so one person's files are scanned one
at a time.

| Condition                                                                                                                                           | Attempt used | Action                                                                                                                                               |
| --------------------------------------------------------------------------------------------------------------------------------------------------- | ------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------- |
| `429` on submit (`queue_full` or `source_budget`), or `queued` on poll                                                                              | No           | Submit again after `Retry-After`, or poll again on the schedule, until `scanGiveUpMs` (net of `source_budget` waits up to `budgetWaitMaxMs`, above)  |
| Scanner unreachable, 5xx, `unknown`, `incomplete: deadline`, `incomplete: source_unavailable`, `incomplete: scan_failed`, or the attempt's deadline | Yes          | New attempt after 10 s, 30 s, 60 s, 120 s, with a new presigned URL                                                                                  |
| `intake.maxScanAttempts` (4) used, or `scanGiveUpMs` passed                                                                                         |              | `failed: scan_unavailable`, staging purged; daily bytes refunded within the per-person cap of 3 refunds a rolling day, whatever the cause (Counters) |
| `incomplete: source_changed`                                                                                                                        |              | `rejected: changed_during_check`, staging purged; final                                                                                              |
| `infected`, `encrypted`, `active_pdf`, `size_mismatch`, checksum mismatch                                                                           |              | `rejected` with its code, staging purged; final                                                                                                      |
| `limits_exceeded`                                                                                                                                   |              | `rejected: limits_exceeded`, staging purged; final                                                                                                   |

A full queue therefore keeps a file in `checking` until `scanGiveUpMs`, and a
spent hourly budget until `scanGiveUpMs` plus at most `budgetWaitMaxMs`;
neither uses up attempts.

Copy, from `uploadRefusalMessage` in `upload-scan.ts`:

- `failed: scan_unavailable`: "We couldn't check this file for safety. Try
  again later."
- `rejected: limits_exceeded`: "This file is too complex for us to check for
  safety, so it wasn't added. Try a smaller or simpler file."
- `rejected: storage_full`: "There isn't enough storage left for this file.
  Delete files in your Library to make room."
- `rejected: changed_during_check`: "This file changed while we were checking
  it. Upload it again."
- Every other refusal: the existing copy for its finding.

## Seal

The seal step is the only code that creates a media row for a large file. It
builds its clearance from the scanner's answer, never from a stored row or a
step's output, because a TypeScript brand does not survive step serialisation
and the workflow writes the intake row through the same user-scoped role as
the routes.

In one step, `sealChatFile(intakeId)`:

1. CAS to `sealing` with this run's id and a lease (Intake states: from
   `scanning`, or re-entering `sealing` for the same run or after the lease
   has passed). A CAS that matches nothing ends the step.
2. `GET /v2/scans/<jobId>` from the scanner. Anything but `done` with
   `outcome: clean` stops the seal; `unknown` sends the run back to submit a
   new attempt.
3. HEAD the staging key. Require `verdict.etag` equal to the HEAD ETag,
   `verdict.bytes` equal to `byte_count`, and `verdict.sha256` equal to the
   declared SHA-256. A mismatch gives `changed_during_check` or
   `checksum_mismatch`.
4. Check `matchDenylistedSha256(verdict.sha256)` (`denylist`), the storage
   quota outside temporary chats (`storage_full`) and dedupe
   (`getMediaAssetByContentHash`).
5. Copy the staging key to `sealedChatAttachmentPathname(stagingKey)`
   (exported by `apps/web/lib/server/media-storage.ts`) with
   `copyPrivateObjectIfUnchanged` and `verdict.etag`, through the long-deadline
   store (deadline `30 s + 1 s per 10 MiB`). The copy is needed because a
   client can write to a staging key it can name. On a timeout, HEAD the sealed
   key: a sealed key is written only by this copy, and CopyObject is atomic, so
   an object there with `byte_count` bytes means the copy finished. Otherwise
   retry the copy, at most 3 times.
6. In one transaction: insert `media_assets` through
   `insertScannedChatFileMediaAsset` with `content_sha256` and
   `scanned_sha256` both set to `verdict.sha256`, set the intake's
   `media_asset_id`, CAS `sealing` to `sealed`.
7. Delete the staging key and set `objects_purged_at`.

A crash between 5 and 6 leaves a sealed object with no row; the retried step
re-enters `sealing` (step 1) and finds the copy at step 5. If step 6 finds no
intake row (the account or organisation was erased while the copy ran), the
step deletes the sealed key it wrote and ends. When all three copies fail,
the step reads the row again: a row that is gone or that ended unsealed has
its sealed key deleted (`row_gone`, `superseded`), and a row still `sealing`
keeps it (`copy_unfinished`) for the retried step. A run that never recovers
is set to `failed: stalled` by the sweeper after 24 h.

One case is not closed inside the step: when the row is erased during the
copy and a `CopyObject` the storage host had already accepted lands after the
seal's last delete, an object stays under the sealed key with no intake row
and no media row. Closing it needs a bucket lifecycle rule on sealed keys
without a media row, or an erasure-time record that the sweeper deletes
again; both are storage or retention decisions for the owner (known flaws).

The step 1 compare-and-set also sets `sealing_entered_at` when it is null.
**Every terminal transition other than `sealed` of a row whose
`sealing_entered_at` is set deletes the deterministic sealed key**, with the
staging key, before `objects_purged_at` is set. This covers a re-entered seal
whose step 2 answered `unknown`, went back to submit after its step 5 copy had
finished, and then ran out of attempts (`failed: scan_unavailable`), as well as
`rejected` and `failed: stalled`. Storage cannot be listed, so this is the only
way such an object is found; the key is deterministic, and deleting a key that
was never written succeeds.

### What keeps unscanned bytes unusable

1. Unscanned bytes live only under staging keys. Nothing serves, presigns,
   stages or indexes a staging key except the scanner's presigned GET.
2. Every reader resolves `media_assets` rows only. An intake that is not sealed
   has no row.
3. Two code paths insert chat-attachment rows: today's synchronous completion
   (which scans the bytes it hashes) through `insertMediaAsset`, and
   `sealChatFile` through `insertScannedChatFileMediaAsset`.
   `scripts/check-upload-inspection-coverage.mjs` fails any other file that
   passes `source: 'chat-attachment'` to `insertMediaAsset`, and any file but
   `seal.ts` that calls `insertScannedChatFileMediaAsset`. It matches source
   text, so it is a guard against mistakes, not a proof; the trigger in item 4
   is the database's own check.
4. Migration 0422 adds an insert-only trigger on `media_assets`: a
   chat-attachment row whose `byte_size` is above the inline limit is refused
   unless `scanned_sha256` is set and equals `content_sha256`. It fires on
   insert only, so updates of legacy rows (soft delete, the conversation
   foreign key set to null) are never checked, and an older web, which inserts
   only rows of 25 MiB or less, is unaffected. Production's inline limit is
   12582912 at HEAD and 26214400 in the working tree the packages build on, both at or under the
   trigger's threshold. These cases are executed against a real Postgres by
   `P2`'s live test, not only read as SQL text (`plan.md`, Testing without a
   deployment).
5. The turn checks the scan again when it stages a large file in the
   sandbox. `listScannedChatFileAssets` in
   `apps/web/lib/server/media-assets.ts` returns only the caller's rows
   (owner and workspace, not deleted, chat-file source or key) whose
   `scanned_sha256` equals `content_sha256`, and `resolveLargeFileStorageFiles`
   in `prepared-attachments.ts` stages only what it returns. The column is
   named only in `media-assets.ts`, which the migration dependency allowlist
   already holds for 0422, so no file of `P15` names a 0422 column.

## Preparation by kind

Preparation runs only for files sealed by the intake workflow. Files of 25 MiB
or less are not prepared or indexed, as today.

**Where it runs.** Workflow steps are ordinary functions: on Pro at most 800 s
and 4 GB, 2 GB by default (`https://vercel.com/docs/functions/limitations`,
last updated 2026-08-24). Each step handles one bounded batch.

**Progress lives in `chat_file_preparations`**, not in a manifest file: `state`,
`cursor` (a small JSON cursor per kind), `segments_ready`, `pages_read`,
`page_count`, `derived_keys`, `indexed_chars`, `coverage`, `error`. A step
writes its segment objects first, then advances the row with a compare-and-set
on the cursor. A reader trusts only segments numbered up to `segments_ready`,
so a file still preparing contributes exactly what is finished, and a retried
step overwrites the same deterministic keys.

**Derived objects** go under `chat-derived/<userId>/<assetId>/v<preparerVersion>/`
(`text/0001.txt` onwards, each at most `preparation.segmentBytes`, 4 MiB;
`pages.json`; `outline.json`), and every key written is appended to
`derived_keys`, so deletion never needs to list storage.

**Step payloads** are ids and counts, never bytes.

**By kind:**

- **PDF.** pdfjs with `PDFDataRangeTransport` over ranged private-object GETs
  (`rangeChunkSize` 1 MiB, `disableAutoFetch`, `disableStream`,
  `isEvalSupported: false`). Text of `kinds.pdf.pagesPerStep` (100) pages per
  step, up to `maxTextPages` (1,000). Pages with no text layer are marked in
  `pages.json` and are not transcribed at upload. Over 1,000 pages gives
  `ready_partial`. If range loading proves not to work in the function
  runtime, the whole buffer is loaded only up to `kinds.pdf.bufferedMaxBytes`
  (200 MiB); a larger PDF is then `prepare_failed` (not readable as text,
  usable in the sandbox). Which path runs is the policy switch
  `kinds.pdf.rangeLoading` (built `true`), so the code is safe either way and
  the switch is set from the deployment step 6 measurement (`plan.md`); the
  preparer never decides it by itself at run time. `pdf-attachment-content.ts` keeps its buffer API for
  project knowledge; its page caps become parameters with today's defaults.
- **DOCX, PPTX.** Before inflating, sum the central directory's uncompressed
  sizes of the text-bearing parts only (document, slides, notes); media
  members are not inflated and not counted. Within the existing archive budget
  the text is extracted with `extractOfficeDocumentText`; above it,
  `prepare_failed` with the reason. `MAX_SLIDES` and `MAX_SHEET_ROWS` become
  parameters with today's defaults.
- **XLSX.** Sheets are profiled in workbook order (name, dimensions, header,
  column types from the first 1,000 rows, `sampleRows` rows as CSV, row count)
  while the inflated sheet XML fits the archive budget. Sheets beyond it are
  listed by name as not profiled, giving `ready_partial`. Formulas are not
  evaluated; external links are ignored. A number appears as its cell format
  shows it (ISO dates, 24-hour times, percentages, thousands separators, fixed
  decimals, in the workbook's 1900 or 1904 date system) through the same
  number-format module as the workbook viewer, and as its stored value for a
  format that module cannot show faithfully or when the styles part is
  missing, malformed or over the archive budget. The styles part shares that
  budget and is read only once the first sheet has been read, so it cannot
  crowd that sheet out. A date column is typed as dates.
- **CSV, TSV.** A streaming line reader over ranged GETs of
  `kinds.delimited.bytesPerStep` (64 MiB) per step, carrying the byte cursor,
  the partial last line, the type-inference state (first 10,000 rows), the row
  count, the first 200 rows and a 200-row reservoir in `cursor`, bounded to
  1 MiB. A retry resumes at the cursor.
- **Text and code.** A streaming UTF-8 decoder (fatal, BOM stripped, CRLF
  normalised) over 64 MiB ranges per step with the byte cursor and decoder
  state in `cursor`, writing segments up to `preparation.maxTextChars`
  (8,000,000); beyond that `ready_partial`. HTML is text.
- **Notebooks.** `extractNotebookText` in one step (50 MiB cap).
- **Images** never take this path (20 MiB inline limit).

A malformed file gives `prepare_failed`; the file stays sealed, attached and
usable in the sandbox, and the model is told it could not be read as text.

## Index

The seal's media row insert already enqueues a title-only `library_file`
retrieval document through the trigger from migration 0202, as every media
row does today. After preparation, outside temporary chats, the index step
asks for that document to be rebuilt from the prepared segments:

- up to `preparation.maxIndexedChars` (2,000,000) characters per file, with page
  anchors in chunk metadata;
- **keyword only**: chunks are stored with their `search_vector` and no
  embedding. The document settles as succeeded with `embedding_model` null, and
  an unchanged digest is a no-op for such a document. Nothing is spent against
  the person's allowance;
- not at all once the person's prepared chat files already hold
  `preparation.maxIndexedCharsPerUser` (200,000,000) indexed characters; such a
  file is still read through its card, excerpt and `open_file`, and its card
  says it is not searchable.

`preparation.embedChatFiles` (false) is the switch for embeddings; turning it
on is out of the first version and needs per-plan caps first (Owner decisions,
C).

## What the model receives

### Hydration decides before it reads (rollback floor)

`hydrateChatAttachments` works in two phases, with one rule for a file that
proves unreadable:

1. Look up every slot's row (owner, workspace, deleted, type, `byte_size`) with
   no bytes read.
2. In the existing order (current turn first, then history), charge each file
   against the count and the inline message budget by `byte_size`. A file
   whose `byte_size` is null is read with the inline per-file bound and charged
   its real size. Only admitted files are read, each with
   `readStoredMedia(pathname, inlinePerFileLimit)`; `StoredObjectTooLargeError`
   counts as over budget.
3. A file found unreadable after admission (no object, or a length that
   differs from `byte_size`: the `unreadable` outcomes at about lines 292 to
   296 of `chat-attachment-hydration.ts`) gives its charge back, and the files
   after it in the order that were held over budget are charged again, in
   order, and read if they now fit. Today an unreadable file is never charged
   (the charge, about lines 414 to 425, follows the read), so a later file
   that fits only without it is still sent; the two phases keep that
   outcome.

A file that is over the inline per-file limit, or that does not fit the inline
message budget, goes to an injected **oversize resolver**. The default
resolver, which is all the floor build has, does what today's code does after
reading: the current turn answers 413 `attachment_context_too_large` with
today's copy, and history gets today's `over_budget` note. Outcomes are
unchanged for every readable file; only the reads stop. Three knowing
exceptions:

- A file that is over the inline per-file limit or the message budget by its
  recorded `byte_size` is reported over budget (the `413` in the current
  turn, the `over_budget` note in history) even when its object is also
  missing, where today it got the "could not be loaded" note, because
  hydration decides before it reads and never reads it.
- A bounded read (`getBoundedObject`, `getBoundedPrivateObject` in
  `apps/web/lib/server/object-storage.ts`) now retries a fault in the middle
  of the body with the shared store's retry policy, reopening the stream; it
  never retries `StoredObjectTooLargeError`. A small file whose body read
  failed once today can now succeed on a later attempt.
- Outside hydration, with the flag off: `mergeStagedStorage` in
  `apps/web/lib/e2b/runtime.ts` reads the stored sandbox session once on every
  `persistSession` (and on the staging `load`) for every sandbox user, so the
  staged-file record the run keeps is merged with the one already stored for
  the same sandbox. Outcomes are
  unchanged, but it is one more session-store read per persist that does not
  wait for the flag, a departure from "inert until the flag is on" that is
  the owner's to accept or to gate (known flaws,
  `WEB-LARGE-FILE-SESSION-READ-FLAG-OFF-01`).

The resolver's type, exported by `P1` from `chat-attachment-hydration.ts`:

```ts
type OversizeAttachmentResolver = (input: {
  slot: AttachmentSlot;
  asset: ResolvedMediaAsset;
  turn: 'live' | 'history';
  reason: 'over_file_limit' | 'over_message_budget';
}) => Promise<
  | { kind: 'refuse' }
  | { kind: 'note'; reason: ChatAttachmentUnavailableReason }
  | { kind: 'parts'; parts: AttachmentReferencePart[] }
>;
```

`AttachmentSlot` (about line 199), `ResolvedMediaAsset` (about line 232, the
row `getMediaAssetById` returns) and `AttachmentReferencePart` (about line 37)
are file-local types today, and `P1` exports them under those names;
`ChatAttachmentUnavailableReason` is already imported from
`@/lib/chat-attachment-policy`. `refuse` gives the 413 for a live slot, `note`
gives `unavailableChatAttachmentNote` with that reason, `parts` replaces the
slot's content. `hydrateChatAttachments` takes it as an optional trailing
option; its two callers are `request-processor.ts` (about line 4317, which
`P15` changes to pass the prepared resolver) and
`apps/web/lib/server/free-quota-turn.ts` (about line 989, unchanged, so a Free
turn always gets the default resolver; a Free account that once held a paid
plan's large file gets today's outcome for it, without a read).
`chat-attachment-hydration.ts` is changed by `P1` only.

### The inline path, unchanged

When every file of a message is within the inline per-file limit and the
message is within the inline budget (25 MiB), the files go inline exactly as
today: native PDF admission through `nativeDocumentAdmission()` and
`harnesses.json` `mediaInput`, or text and image parts. 25 MiB is below the
caps checked on every first-party route (50 MB per file and combined on the
OpenAI routes, 50 MB per PDF inline on the Google route, 128 MB per request on
the Anthropic route).

### The prepared path

The prepared resolver (`prepared-attachments.ts`, new) replaces the default
one in builds with the feature, whatever the flag says. It takes **only files
whose `byte_size` is above the inline per-file limit**. It hands every other
file back to the default resolver, so in every build:

- a file of 25 MiB or less of the current turn that does not fit the inline
  message budget gets today's 413;
- such a file in history, an image included, gets today's `over_budget` note.
  Excerpting small history files is not in the first version; this is a known
  limit, recorded in known flaws by `P18`;
- a turn with no file above the inline limit sends exactly the provider
  messages the default resolver builds, flag on or off.

A compiled client never sends a current turn whose small files pass the inline
budget: when large files are offered, the handshake gives
`inline_message_bytes` and the composer holds the files of 25 MiB or less of a
message, images included, to it (The effective limit). Three 10 MiB images are
refused at attach with today's message-size copy, as today.

For each file above the inline limit:

- sealed, with a preparation row: its share, below;
- `preparing`: its finished segments plus "still reading pages N to M";
- `prepare_failed`, or no preparation row at all (never written, or the schema
  helper answers absent): the card only, with "This file could not be read as
  text."

Each file's share, in order:

1. **A card**, at most `turnBudget.cardMaxTokens` (1,500): name, type, size,
   pages or sheets, what was read ("text read for pages 1 to 1,000 of 1,240"),
   whether it is searchable, its sandbox path, the outline (up to 100 anchors)
   or sheet names, columns and row counts, and for a partial read the line
   "Tell the person your answer is based on part of this file."
2. **Text**: the whole prepared text if it fits the file's share, otherwise the
   first slice plus the top keyword passages for the user's message (at most 10
   windows of 1,400 characters), fenced with `untrustedDocumentText`.
3. **A tool note** for `search_files` (scoped to this conversation's
   attachments) and `open_file(id, offset or page)`.

A current-turn file is passed to `onTruncated`, so every client, old ones
included, shows the existing line "Only part of report.pdf was read because
it is too long to read in full.", only when part of its text was read: the
file is readable and has text but was not sent whole, or its preparation is
still running (with or without text so far). A file that could not be read
(`prepare_failed`, no preparation row, a read error) or that finished
preparing with no text raises no header; its card says what happened ("This
file could not be read as text." or "Text read: 0 characters."). Each file
raises it at most once per turn. No new header is added.

Later turns: a large file from an earlier turn contributes its card plus top
passages, within the caps in The turn ledger, rule 6.

### The turn ledger

**Scope.** A ledger exists only in a turn where hydration resolved at least one
file above the inline per-file limit, in the current turn or an earlier one;
hydration then sets `processed.largeFileTurn` (`P15`). In every other turn
there is no ledger: `open_file`, `search_files` and the tool loop behave
exactly as today, flag on or off. In a turn with a ledger it counts
**attachment-derived tokens only**: the cards, the prepared text and the
results of `open_file` and `search_files`, whatever file they read. The
person's message, the conversation's history text, other tools' results and
inline-path files are outside it and bounded as today.

T = min( `turnBudget.maxAttachmentTokensPerTurn` (120,000),
`turnBudget.contextShare` (0.25) times the model's context window,
`turnBudget.maxInputCentsPerTurn` (10 cents) divided by the route's uncached
input price per token )

The window and price come from the generated model catalog, so a model swap
needs no code change.

Before each step, R is the ledger's remainder (T minus everything charged so
far) and K is what that step must resend: the cards and every file-tool
result already in context. B is the step's prepared block, a marked content
part of the current user message that the ledger rewrites before each step.

1. **Every send is charged while reading is open.** Cards, the prepared block
   and each file-tool result are charged on every step that sends them,
   including the step that returned the result. The ledger never passes T.
2. **Cards.** When the cards of all large files together exceed
   `turnBudget.cardsShare` (0.25) of T, each card shrinks to one line: name,
   type, size and id. If the one-line cards still exceed it, the list keeps
   the current turn's files first, then the most recent earlier ones, and ends
   with "and N more files".
3. **Reading closes; the loop does not.** Reading is open on a step only while
   2K is at most R. The first step where 2K exceeds R closes reading for the
   rest of the turn (`readingClosed`, which never reopens). From that step on:
   - the cards are sent as one-line cards and no prepared block is sent;
   - every earlier `open_file` and `search_files` result in the messages is
     replaced by the stub "Earlier file reading was removed to stay within this
     turn's reading budget.";
   - `open_file` and `search_files` are withdrawn through the loop's existing
     governor, `toolGovernor.withdraw(name, 'budget')`
     (`apps/web/app/api/llm/v1/chat/completions/lib/tool-turn-governor.ts`;
     `tool-loop.ts` already withdraws search tools this way, about lines 5251
     to 5304). The step's tool list is not changed, because `tool-loop.ts`
     keeps it constant for the cached prompt prefix (about line 6474), and a
     call to a withdrawn tool returns the existing `withdrawnToolMessage`
     (about line 5209);
   - every other tool, code execution included, stays offered, and the loop
     continues under its own `maxSteps` and turn tool-call cap, unchanged.

   The one-line cards and stubs sent after reading closes are outside the
   ledger. They are bounded: at most 20 one-line cards of about 30 tokens, and
   one stub of about 20 tokens per file-tool call, which the turn tool-call cap
   bounds (`CHAT_TURN_TOOL_CALL_CAP` 16, `AGI_WORK_TURN_TOOL_CALL_CAP` 120), so
   at most about 3,000 tokens per step. The loop's step-limit path
   (`tool-loop.ts`, about lines 7556 to 7626, which pauses in `awaiting_input`
   or ends with `max_agent_steps_reached`) is not used by the ledger and not
   changed.

4. **Text shrinks instead of vanishing.** B is at most (R minus 2K) divided by 2. With no file-tool results, step 1 carries up to about T/2 of text, step
   2 about T/4 and step 3 about T/8.
5. **File-tool results are bounded.** The file-tool results of one step
   together get at most (R minus 2K minus B) divided by 2 tokens; a tool that
   would pass it returns what fits and says "The reading budget for this turn
   is used; answer from what you have." So 2K + B + results is at most R on
   every step where reading is open, and the step that closes reading charges
   nothing.
6. **Earlier turns.** Files from earlier turns share B: together at most
   min(`turnBudget.laterTurnTotalTokens` (20,000), B/2), each at most
   min(`turnBudget.laterTurnFileTokens` (5,000), that total). The current
   turn's files take the rest.
7. Inline-path files are outside the ledger, exactly as today.

**The ledger survives a turn's checkpoints.** A turn can span several
invocations (approval, input, device, pause and step-budget checkpoints, and
the wall-clock continuation). The ledger's state, `{charged, readingClosed}`,
lives on `processed.largeFileTurn` beside the large files' asset ids, and:

- every checkpoint request is built by `buildApprovalCheckpointRequest` in
  `approval-checkpoint-request.ts`, which saves `processed.largeFileTurn` under
  one new optional key, `CHECKPOINT_LARGE_FILE_TURN_KEY`. Its callers,
  `apps/web/app/api/llm/v1/chat/completions/route.ts`,
  `apps/web/lib/workflows/start-cloud-agent-workflow.ts` and
  `apps/web/lib/workflows/steps/execute-cloud-agent-invocation.ts`, pass it as
  a new trailing argument;
- every resume restores it through `restoreCheckpointedTurn`, the one restore
  the approve, resume-input and `runs/[runId]/resume` routes and
  `tool-result-resume.ts` call;
- the wall-clock continuation carries it in `processed`: `workflowContinuation`
  in `cloud-agent-workflow-continuation.ts` copies `serving.largeFileTurn` into
  the continuation, and `ProcessedRequestSchema` in
  `apps/web/lib/workflows/cloud-agent-workflow-input.ts` is `passthrough`, so
  that file is not changed.

A resumed or continued turn starts from the saved charged total and closed
state, never from a fresh ledger. A checkpoint without the key (every
checkpoint saved by a build without the feature) resumes with no ledger, as
today. Scheduled agent runs (`scheduled-agent-executor.ts`) carry no chat
attachments, so they never hold a ledger and are not changed.

**A resume restores the file tools.** A resume rebuilds the request from the
checkpoint, whose messages carry no file part, so hydration finds no large
file and does not add `open_file` and `search_files`. `restoreCheckpointedTurn`
therefore calls `restoreLargeFileTools`
(`approval-checkpoint-request.ts`): when the restored ledger has
`fileToolsOffered` true, the request's tools become the rebuilt list without
any file tool plus `fileSearchToolDefinitions({ largeFileTurn: true })`, so a
file-tool call approved before the pause runs and the tool list matches the
paused turn. When the resumed turn refuses every tool, `fileToolsOffered` is
set false so the cards stop naming the tools.

**Research turns.** `runResearchLoop` resends the thread, prepared block
included, on every provider call, so every research call is a step of the
same ledger (`chargeLargeFileStep` in `research-loop.ts`): the planning call,
each gathering call and each tool pass inside a gathering round, and the
report call. The first call sends the step `processRequest` already charged.
The step is applied to the thread without the call's own directives, so the
"and N more files" count stays on a message every later call resends. Because
rule 4 halves the text each step, the shares fall in call order: the planning
call, which only returns queries, gets the largest block (about T/2), the
gathering calls about T/4, T/8 and so on, and the report call little or no
file text once reading has closed. When reading has closed, or a card is
marked partial, the report call's directive asks the report to say that it
is based on part of the attached files. Whether research should save its
largest block for the report call is an open owner decision (`plan.md`,
Risks). One-line cards sent after reading closes stay outside the ledger on
every research call, as they do across tool-loop steps.

**Tool call ids.** Every tool call id already used in a turn's messages is
reserved: a call whose id the provider has already used in the turn is given
a fresh one, used on the wire, in agent events, in the
approval request, in the tool message and in the checkpoint
(`toolCallIdsIn` and `collectProviderStream` in `tool-loop.ts`, and
`collectTurn` in `research-loop.ts`). A durable research run that hands off
between rounds carries its own ids, those not already in the carried thread,
in the checkpoint's optional `toolCallIds`
(`ResearchCheckpointSchema` in `apps/web/lib/workflows/cloud-agent-workflow-input.ts`,
at most 192 ids of at most 256 characters). A checkpoint without the field,
saved by an older build, still parses. The schema is `strict`, so a
checkpoint that carries the field cannot be resumed by a build that predates
it: deploy when no durable research run is in flight, or accept that those
runs end.

On the expensive-route example in `plan.md` (T about 6,700 tokens), 20 large
files give 20 one-line cards of about 30 tokens each, inside the quarter of T
that rule 2 allows.

### Scanned pages

OCR never runs at upload. When `open_file` asks for a page with no text layer,
in an entitled managed context, the tool transcribes it through
`transcribeScannedPages` in batches of `kinds.pdf.ocrBatchPages` (4) pages, so
each page gets about 1,000 of the call's 4,000 output tokens; at most
`kinds.pdf.ocrPagesPerTurn` (8) pages per turn, and at most
`kinds.pdf.maxOcrPagesPerFile` (100) per file over its life. Each transcribed
page is saved as a derived segment, so it is paid for once. The spend is part
of the turn the person asked for and is billed through the existing path. The
transcribed text is a file-tool result for the ledger (rule 5).

OCR needs the page rendered from the stored PDF by range, so it is available
only while `kinds.pdf.rangeLoading` is true. When it is false, `open_file` on
a page without a text layer answers "This page has no text layer and can't be
read here. The whole file is in the code sandbox." and spends nothing.

### Per route

Only native visual reading differs, and only on the inline path. Large files
take the prepared path on every route; a model without tool calling gets the
card and excerpt only, and its card says the rest was not read. A turn that
fails over uses the text parts already built.

### Code sandbox

Staging is lazy: a large file is staged only when a code-execution tool call
runs, never on every turn.

- Large files travel as a separate list, `StorageTurnFile {assetId, filename,
mimeType, byteSize, key}`, beside the unchanged base64 `TurnAttachment`, so
  the approval checkpoint schema, the managed Office paths and every other
  consumer of `TurnAttachment` are untouched. The checkpoint stores asset ids
  only, in `processed.largeFileTurn` under `CHECKPOINT_LARGE_FILE_TURN_KEY`
  (The turn ledger), and resolves them again on resume with the owner check.
- `stageStorageFiles` streams `getPrivateObjectStream(key)` into a new optional
  `E2BExecutor.writeFileStream`, implemented with `sandbox.files.write(path,
ReadableStream)`. A `TemplateError` (envd older than 0.5.7) reports the file
  as not staged; nothing is buffered. A file that is not staged gets
  `storageNotStagedNote` (`apps/web/lib/e2b/attachment-staging.ts`), which
  names the reason: the sandbox cannot take large files, it is full, the
  stored file was not found, or the copy failed.
- At most `largeFiles.sandboxStagedBytesMax` (1 GiB) per sandbox in total; what
  was staged is remembered for the conversation's sandbox, and a file over the
  remaining room is reported as not staged. No eviction in the first version.
  The total is the bytes the workspace holds now: before staging, the
  remembered record is reconciled with a listing of the workspace, a deleted
  file stops counting, and a staged file the code rewrote or moved is copied
  again on the next call while its rewritten bytes keep counting at their
  listed size. The total therefore counts bytes present, not bytes copied
  over the sandbox's life (known flaws). When the workspace cannot be listed,
  nothing new is copied.
- The bytes pass through the chat function during staging, inside the route's
  300 s. The sandbox network policy is unchanged.

## Downloads

`GET /api/files/:id` answers 413 today for any non-video asset above
`MAX_SERVE_BYTES` (30 MiB) (`apps/web/app/api/files/[id]/route.ts`, lines 129
to 131). The redirect below replaces that 413 only for a request and an asset
that meet both conditions:

- **the request** is a browser navigation (`Sec-Fetch-Mode: navigate`) that
  carries no `Sec-Purpose` header, so a prefetch or prerender keeps the 413
  and spends nothing, or carries `x-agi-client-capabilities` with the token
  `large-chat-files-v1` (read with `P6`'s parser; `acceptsLargeFileRedirect`
  in `apps/web/app/api/files/[id]/route.ts`);
- **the asset** has `metadata.source` `'chat-attachment'`, `byte_size` above
  the inline per-file limit, and a `storage_pathname` that is a sealed private
  chat key (`chat-attachments/` prefix and the `.scanned` suffix of
  `sealedChatAttachmentPathname`).

Every other request for a sealed large chat file, and every request for any
other asset above the limit (local prefix, public bucket, generated media, any
other source), keeps today's 413, flag on or off. This keeps every client that
reads a download whole into memory on today's answer:

- the mobile app (0.0.1 and later) reads `/api/files/:id` through
  `fetchGeneratedFileBytes` in `apps/mobile/services/fileCreation.ts` (`guardedFetch`
  with no redirect option, then `res.blob()` and `blobToBase64`), used by the chat file viewer
  (`artifact-viewers/useLocalFileCopy.ts`, line 25), sent attachments
  (`chat/utils/sentAttachment.ts`, line 59) and the Library
  (`features/library/index.tsx`, the share action whose failure shows the
  "Could not open this file" alert). It sends no `Sec-Fetch-Mode`, and
  it adds only `getAuthHeaders()` to a file request, never
  `platformRequestHeaders()`, so it never sends the token there. A native
  client is never sent the redirect in the first version: its pinned
  transport refuses a response from an unpinned storage host and React Native
  replays the request's credentials on the second hop before that check runs
  (`apps/mobile/services/secureFetch.ts`, `redirectVerdict` and
  `checkResponseOrigin`), and the app has no configured storage host to hold
  the second hop to. The phone keeps the 413 and says "This file is too large
  to open on this device.": `FileDownloadError` for a 413 carries that
  sentence, `downloadFailureMessage` and `toUserMessage` pass it through, so
  the file viewer, the share buttons, the chat's download alerts, the
  Library's share alert and a cloud task's or a voice session's file row show
  it, and none of them builds a blob
  (`apps/mobile/__tests__/generated-file-download.test.ts`, "a 413 gives the
  too-large copy and builds no blob";
  `apps/mobile/__tests__/file-download-wire-headers.test.ts`, which reads the
  headers as they leave `secureFetch`; `LibraryActionMenus.test.tsx`;
  `GeneratedFileRowsRefusal.test.tsx`). The viewer offers no Retry for a 413,
  because asking again gets the same answer (`useLocalFileCopy.ts`,
  `retryable`);
- the web's fetch-based readers still get today's 413 for a large file:
  `libraryItemToFile` in
  `apps/web/features/chat/components/Composer/ComposerFilesMenu.tsx` (attach
  from the Library) sends `Sec-Fetch-Mode: cors` and no token, so attach from
  the Library refuses a file above the direct-serve limit; the Library page's
  handoffs (`readLibraryItemFile`) say so, the composer does not (known flaws,
  `P18`). The Library's download button (`handleDownload` in
  `packages/ui/unified-chat/src/components/library/LibraryView.tsx`) no longer
  fetches an uploaded file above the inline limit: it saves it through a
  browser download, an anchor navigation that the files route redirects to
  storage and charges once. A link or a typed URL is a navigation and is
  redirected.

A browser too old to send `Sec-Fetch-Mode` gets today's 413. For a request and
asset that meet both conditions, for the owner only, the route:

- checks the object's size with a HEAD against the asset's `byte_size`, then
  checks `monthlyDownloadBytes` when the download spends the allowance, and
  records the egress once per redirect without waiting for the write. The
  check reads the recorded total and the record lands afterwards, so
  concurrent redirects can each pass the check: the allowance is advisory
  under concurrency, as it is for video today;
- answers `302` to a 300-second presigned GET signed with
  `ResponseContentType: application/octet-stream` and an attachment
  disposition, so a browser never renders the stored type; a navigation
  needs no CORS rule on the bucket;
- `?preview=pdf` above the limit answers 413 `preview_too_large`: "This PDF is
  too large to preview. Download it to open it.", before the request
  condition is read.

The URL can be fetched again within its 300 s without a second charge; storage
egress is free, so that is accepted.

## Limits, quotas and where each is configured

`packages/contracts/cloud-contracts/src/chat-attachment-policy.json`:

- Unchanged: `maxBytes` 26214400, `maxMessageBytes` 26214400, `maxImageBytes`
  20971520, `maxCount` 10. These stay the inline ceilings that every compiled
  client uses, so nothing changes for a client without the token.
- `largeFiles` {`maxBytes` 524288000, `maxCount` 20, `maxMessageBytes`
  2147483648, `cellularConfirmBytes` 52428800, `sandboxStagedBytesMax`
  1073741824}
- `kinds` {`pdf` {maxBytes 524288000, maxTextPages 1000, pagesPerStep 100,
  maxOcrPagesPerFile 100, ocrPagesPerTurn 8, ocrBatchPages 4, bufferedMaxBytes
  209715200, rangeLoading true}, `office` {maxBytes 104857600, maxSlides 200}, `spreadsheet`
  {maxBytes 52428800, sampleRows 200}, `delimited` {maxBytes 524288000,
  sampleRows 200, typeInferenceRows 10000, bytesPerStep 67108864}, `text`
  {maxBytes 524288000, bytesPerStep 67108864}, `html` {maxBytes 41943040},
  `notebook` {maxBytes 52428800}}
- `preparation` {maxTextChars 8000000, segmentBytes 4194304, maxIndexedChars
  2000000, maxIndexedCharsPerUser 200000000, embedChatFiles false,
  preparerVersion 1, stallMs 7200000}
- `turnBudget` {maxAttachmentTokensPerTurn 120000, contextShare 0.25,
  maxInputCentsPerTurn 10, cardsShare 0.25, laterTurnFileTokens 5000,
  laterTurnTotalTokens 20000, cardMaxTokens 1500, passageWindows 10,
  passageChars 1400}
- `intake` {maxScanAttempts 4, scanGiveUpMs 1800000, scanPollScheduleMs
  [5000, 10000, 20000, 30000], awaitingPartsIdleMs 7200000, abandonAfterMs
  86400000, terminalRetentionMs 604800000, statusPollMinMs 2000,
  statusPollMaxMs 10000, scanUnavailableRefundsPerDay 3, budgetWaitMaxMs
  7200000, leaseMs {uploaded 300000, inspecting 300000, scanningExtra 300000,
  sealing 900000}}

These blocks are new keys in the policy file. `P6` exports them under new
names (`CHAT_LARGE_FILE_POLICY`, `CHAT_LARGE_FILE_MAX_BYTES` and the kind
constant `CHAT_LARGE_FILE_UPLOAD_KIND`); no existing export changes value or
type.

`packages/contracts/cloud-contracts/src/upload-contract.json` gains
`largeFilePartBytes` 8388608 above `largeFileThresholdBytes` 104857600, and
`partConcurrencyWeb` 4, `partConcurrencyMobile` 2. `partBytes` and
`relaySegmentBytes` are unchanged. The part URL TTL keeps its one owner,
`RESUMABLE_PART_URL_TTL_SECONDS` (900) in `resumable-upload.ts`.

`packages/contracts/types/src/billing-catalog.ts`, new fields per plan (built
values; see Owner decisions):

| Field                          | Free, BYOK, Local | Basic   | Pro     | Max, Team, Team Premium | Max 15x | Enterprise |
| ------------------------------ | ----------------- | ------- | ------- | ----------------------- | ------- | ---------- |
| `maxChatFileBytes`             | 25 MiB (inline)   | 500 MiB | 500 MiB | 500 MiB                 | 500 MiB | 500 MiB    |
| `dailyChatFileUploadBytes`     | 0                 | 2 GiB   | 10 GiB  | 25 GiB                  | 50 GiB  | 50 GiB     |
| `maxConcurrentChatFileIntakes` | 0                 | 3       | 3       | 5                       | 5       | 5          |

`maxAttachmentBytes`, `MAX_PLAN_ATTACHMENT_BYTES`, the types
`attachment-policy.json`, `knowledgeStorageBytes`, `dailyAttachmentUploads` and
`monthlyDownloadBytes` are not changed. Project knowledge files, mobile Local
and the iOS share extension stay at 25 MiB.

`services/upload-scanner` environment: `MAX_SOURCE_SCAN_BYTES` (built
545259520, 520 MiB), `SCAN_SOURCE_CONCURRENCY`, `SCAN_QUEUE_MAX`,
`SCAN_SOURCE_BYTES_PER_HOUR` (built 2147483648), `SCAN_BASE_MS`,
`SCAN_MIN_BYTES_PER_SEC`, `UPLOAD_SCAN_SOURCE_HOSTS`. A scanner
test asserts the default `MAX_SOURCE_SCAN_BYTES` is at least `largeFiles.maxBytes`.

`apps/web` environment: `CHAT_LARGE_FILES_ENABLED` (`on` or unset), and
`UPLOAD_STORAGE_CORS_ORIGINS`, a comma list of browser origins the storage
bucket's CORS rule allows (used for preview deployments).
`uploadNeedsSameOriginRelay` itself returns false for a request whose `Origin`
is in that list (`P14`), so the parts route hands such an origin presigned
part URLs for every session kind, and `storageReachableForLargeFiles` reads
the same answer. There is one rule for "this origin reaches storage", not two.
With the variable unset, which is every environment today, the function
answers exactly as now.

### The effective limit

One resolver in `apps/web/lib/server/attachment-allowance.ts`, called by create
and `/api/me`:

- Large files offered (token, readiness, plan above inline, origin reaches
  storage, judged as below):
  - `max_file_bytes` = max(today's value, min(`largeFiles.maxBytes`, plan
    `maxChatFileBytes`, scanner `maxSourceScanBytes`, remaining storage));
  - `max_message_bytes` = max(today's value, min(`largeFiles.maxMessageBytes`,
    remaining storage));
  - `max_files_per_message` = min(`largeFiles.maxCount`, plan
    `maxAttachmentsPerMessage`);
  - `max_image_bytes` unchanged;
  - `inline_message_bytes` = today's `max_message_bytes` (25 MiB): the files
    of 25 MiB or less in one message, images included, together stay within
    it, so they always go inline;
  - `large_files_available: true` and `storage_remaining_bytes` (null when
    unlimited).
- Otherwise: today's answer, byte for byte, without the three new fields.

**Remaining storage** is the plan's storage quota minus `sumFileStorageBytes`
minus the declared `byte_count` of the person's non-terminal intake rows
(`sumInFlightIntakeBytes` in `P12`'s store, asked only when readiness is true,
so never against a database without 0422). Create applies the same sum: a
`chat-large-file` create is refused with `storage_full` copy when its
`byteCount` plus the in-flight declared bytes would pass the quota, outside
temporary chats. Three to five concurrent 500 MiB uploads therefore cannot
each pass create and then one fail at seal after its bytes were sent; the
seal's own storage check (Seal, step 4) stays as the final word, for files
deleted or added between create and seal.

Remaining storage only ever lowers the large part of the limit, never below
today's values, so small files behave exactly as today. The handshake is a
hint read at sign-in; create is authoritative and refuses before any byte is
sent. Create calls the resolver without the capability token (the token only
decides what `/api/me` publishes); a large create is admitted by its kind,
readiness, the plan and the origin. In a temporary chat the composer applies the same handshake limit, which
is stricter than create (temporary chats are outside the storage meter); that
is accepted for the first version.

**Whether the origin reaches storage** is decided by a new
`storageReachableForLargeFiles(request)` in
`apps/web/lib/server/upload-transport.ts`, used by `/api/me`, create and the
parts route. `uploadNeedsSameOriginRelay` judges a request without an `Origin`
header by the host it reached: no relay in production and on
`localhost:3000`, relay elsewhere. This design leaves that unchanged. A
`chat-large-file` session is decided by `storageReachableForLargeFiles`
instead, so a native client, which sends no `Origin`, gets presigned part URLs
on any host, and the parts route never relays a `chat-large-file` part. A
browser sends `Origin` on the create POST but not on a same-origin GET, so
`/api/me` cannot rely on it. The new function:

- with an `Origin` header: reachable exactly when `uploadNeedsSameOriginRelay`
  is false (which it is for an origin listed in
  `UPLOAD_STORAGE_CORS_ORIGINS`);
- without `Origin` but with a `Sec-Fetch-Site` header (any value, so a browser
  request): judged as if `Origin` were the request URL's own origin, by the
  same rules;
- with neither: a native client, reachable, as today.

A preview without `UPLOAD_STORAGE_CORS_ORIGINS` is therefore never offered large
files on `/api/me`, and create refuses `chat-large-file` from it. Production is
unaffected (`VERCEL_ENV` is `production`).

The server-side message count for hydration stays
`getPlanMaxAttachmentsPerMessage(plan)` (20 on paid plans today); clients are
held to 10 by the inline `maxCount` until large files are offered.

### Counters

- **Daily large-file bytes.** A key-value counter next to the daily upload
  count, charged at create for `chat-large-file` only. Refunds, each at most
  once per row (`bytes_refunded_at`):
  - any `awaiting_parts` row that ends, by any route (client cancel, the
    sweeper's idle cancel, `failed: stalled`, erasure), refunds the declared
    bytes minus the bytes already stored (`listUploadedParts`);
  - `failed: scan_unavailable`, whatever the cause (scanner unreachable, 5xx,
    `unknown`, a deadline, a full queue past `scanGiveUpMs`), refunds the
    declared bytes, at most `intake.scanUnavailableRefundsPerDay` (3) times
    per person in a rolling 24 hours; later ones in that window spend the
    budget. One key-value counter in `quotas.ts` (`P12`). A scanner outage
    or a CPU-throttled deadline costs a person nothing for the first three
    files of a day, while a file that crashes clamd or is slow to scan by
    design cannot loop for free: it costs four scanner attempts per upload and
    from the fourth failure its full bytes;
  - nothing else: a cancel after `uploaded` or a rejection spends the budget.

  If the store cannot be reached, create is refused. A refund that fails is
  logged and not retried.

- **In-flight intakes.** SQL count of the user's non-terminal intake rows,
  taken inside the create transaction after the per-user advisory lock and
  the new row's insert, so one person's large creates are admitted one at a
  time and exactly the plan's `maxConcurrentChatFileIntakes` are admitted
  (Data flow, step 5). The count filters by user and runs on the scoped
  database, whose row-level security limits it to the rows visible in the
  request's workspace scope, so the cap holds per person and workspace scope
  rather than per person across workspaces (read from the code, not run
  against Postgres; known flaws). The sweeper ends an `awaiting_parts` row whose `last_part_request_at` is
  older than `intake.awaitingPartsIdleMs` (2 h) as `cancelled`
  (`cancel_reason: idle`), which frees its slot. 2 h is eight times the 900 s
  part URL lifetime, so an upload still sending parts always asks the parts
  route for new URLs well within it.
- Files of 25 MiB or less use today's counters only.
- Temporary chats count against both, not against storage, as today.

Rate limits: create, parts and complete use the existing `uploads-presign` and
`uploads-resumable-part` buckets; a new `uploads-intake-status` bucket (120 per
minute) covers polling and cancel.

### Readiness probe

`apps/web/lib/server/chat-file-intake/readiness.ts` (`P14`, with its first
importers, `/api/me` and create). The checks run in this order and stop at the
first that fails, so the cheap ones guard the costly ones:

1. flag: `CHAT_LARGE_FILES_ENABLED === 'on'`; with the flag unset no query and
   no fetch is made;
2. plan: `maxChatFileBytes` above the inline limit (Free stops here);
3. origin: `storageReachableForLargeFiles(request)` (The effective limit);
4. schema: `chatFileSchemaReady(db)` from `schema.ts` (`P2`), cached per
   instance for 5 minutes when true and 60 s when false. Every other caller of
   the helper may use the same cache except erasure, which always asks
   uncached, so an instance that cached "absent" just before the migration
   cannot report rows deleted that exist;
5. scanner: `GET /v2/capability` with a 1,500 ms timeout, cached 60 s per
   instance and 60 s in the shared key-value store; any failure means not
   ready.

`/api/me` asks readiness only when the request carries the token. A cold
`/api/me` from a paid browser that can reach storage, with the flag on,
therefore waits at most 1.5 s more, and only when the shared cache is empty.

## Lifecycle

- **Sealed files** are ordinary `media_assets` rows: in the Library, counted by
  `sumFileStorageBytes`, soft-deleted and swept by the existing policy.
  Deleting a conversation does not free their storage
  (`conversation_id` is set to null); the storage refusal copy says "Delete
  files in your Library to make room."
- **Derived objects.** `chat_file_preparations.media_asset_id` is `on delete set
null`. Whatever deletes a media row (purge, domain retention, workspace
  retention, account or organisation erasure, the temporary-chat purge), the
  preparation row survives with a null asset, and the new sweeper deletes every
  key in its `derived_keys`, then the row. No existing deletion path changes.
- **Intake rows.** The cron `sweep-chat-file-intakes`, every 5 minutes, does
  nothing unless the schema helper answers true, and then, with
  `CHAT_LARGE_FILES_ENABLED` on or off (the route reads no flag):
  - re-dispatches rows past their state's lease. These are the only
    statements that pick work up, so they carry the two predicates
    `check:membership-unattended-work` requires
    (`ownerMayRunUnattendedSql` from `apps/web/lib/auth/account-lifecycle.ts`
    and `ownerIsActiveWorkspaceMemberSql` from
    `apps/web/lib/server/workspace-scope/index.ts`); a row whose owner fails
    them is not re-dispatched and ends through the stall rule;
  - ends `awaiting_parts` rows idle for `intake.awaitingPartsIdleMs` as
    `cancelled: idle`, aborting the multipart upload and refunding as in
    Counters;
  - sets rows with no progress for 24 h to `failed: stalled`, aborts the
    multipart upload, deletes the staging key and, for a row whose
    `sealing_entered_at` is set, the sealed key (Seal);
  - deletes orphaned preparations as above;
  - sets a preparation still in `preparing` whose `updated_at` is older than
    `preparation.stallMs` (2 h) to `prepare_failed` with error `stalled`.
    Every cursor compare-and-set sets `updated_at = now()`, and one step runs
    for at most the function's 800 s, so a live preparation always advances
    well within 2 h; a step that died without throwing (out of memory on a
    pathological PDF) can no longer leave a turn saying "still reading pages N
    to M" for ever. The file stays sealed and usable in the sandbox;
  - prunes terminal rows after 7 days, and only rows whose `objects_purged_at`
    is set, so no staging key loses its only pointer.

  The ending, purging and pruning statements destroy or report and are not
  subjects of that guard. Every destroying statement passes
  `check:legal-hold-coverage` with its baseline left empty. The store also
  aborts incomplete multipart uploads after 7 days.

- **Account erasure and organisation erasure** run one routine,
  `eraseChatFiles(db, scope)` in `apps/web/lib/server/chat-file-intake/erasure.ts`
  (`P2`), for a user or an organisation:
  1. ask `chatFileSchemaReady(db)` uncached; when false, report both tables
     deleted and stop;
  2. for each intake row in scope: delete its staging key, the deterministic
     sealed key for a row whose `sealing_entered_at` is set and that is not
     `sealed`, and abort its multipart upload by
     `multipart_upload_id`; for a user, also abort every pending multipart
     upload under `chat-attachments/<userId>/` (`listPendingMultipartUploads`),
     which catches uploads whose row is already gone;
  3. for each preparation row in scope: delete every key in `derived_keys`;
  4. delete the rows only when every object delete succeeded; otherwise report
     the table `{deleted: false, retainedForRetry: true}`, which keeps the
     organisation row, as a failed media delete does today.

  Account erasure lists both tables in `USER_SCOPED_TABLES`; organisation
  erasure lists both in `ORGANIZATION_SCOPED_TABLES` and, like `media_assets`,
  takes their result from the routine instead of the generic row delete.
  `chat_file_intakes` is also declared in the workspace switch registry
  (`switch-surfaces.ts`, a declaration only). A workflow step that runs after
  erasure finds no row and ends; a seal whose copy finished after erasure
  deletes its sealed key (Seal).

- **Export** (`P2`) includes the original files as today and the intake rows
  (name, type, size, state, dates). The intake section is a new entry in
  `ADDITIONAL_EXPORT_SECTIONS` in `apps/web/app/api/user/export/route.ts`,
  whose `sql:` reads `chat_file_intakes` (so
  `export-matches-erasure-inventory.test.ts` finds it), with a new optional
  field on that list's type, `requiresChatFileSchema: true`; the section loop
  skips such an entry when `chatFileSchemaReady(db)` answers false. An
  ungated section would be marked "section unavailable" on a database without
  0422 (`queryExportRows` catches the error and calls `sectionUnavailable`).
  `chat_file_preparations` is listed in `UNEXPORTED_USER_TABLES` with the
  reason "Derived text and progress for a chat file; the original file is
  exported and the text is regenerated from it." Derived text is not
  exported.
- **Retention matrix** (`P2`): `apps/web/lib/services/deletion-manifest.ts`
  classifies `chat_file_intakes` as an operational record and
  `chat_file_preparations` as derived content, and adds a non-table store,
  "chat file staging and derived objects", erased with the subject and the
  tenant by `eraseChatFiles`. `docs/architecture/RETENTION_MATRIX.md` gets the
  rows `renderRetentionMatrixMarkdown` renders, which
  `deletion-manifest.test.ts` compares.
- **Backups** (`P19`). `replicateObject` answers `too-large` without reading
  for any key under `chat-attachments/` whose HEAD `contentLength` is above the
  inline per-file limit (`MAX_CHAT_ATTACHMENT_BYTES`), so no sealed large chat
  file is read whole into the cron's memory, and chat files over 25 MiB get no
  backup replica in the first version (Owner decisions, L). Every other key
  keeps today's rule, 256 MiB included. Today each source is read forward
  from a `(created_at, id)` cursor, the cursor variable is set before the
  row's copy and written after the loop
  (`apps/web/app/api/cron/replicate-object-backups/route.ts`, lines 169 to
  198), and a throw from `replicateObject` or `recordBackupReplica` reaches
  the one outer `catch`, so the cursor stays unwritten, the next hourly run
  retries the same rows, and the sources after it do not run. Nothing else
  copies a row the cursor has passed: `reconcileBackupDeletions`
  (`object-backup.ts`, about line 329) only propagates deletions. The cron
  route therefore changes only this: on a throw for a row, it stops that
  source's loop, writes the cursor at the last row that completed (never at
  or past the row that threw; when no row completed, the cursor is left as
  it was), counts the throw in a new `failed` field of the response and the
  log, and goes on to the next source. A row completes when its copy and its
  replica record finished, or when it was counted `unreadable`. The response
  status is 500 when `failed` is above zero, as for a failed reconcile
  today. The next run retries from the row that threw, so a transient
  storage timeout delays that row's replica by an hour and never skips it,
  and one failing object no longer starves the project-knowledge source. One
  object that always throws holds back its own source's later rows and
  reports 500 on every run, as it stops all backups today. With the flag off,
  today's small files therefore behave exactly as today, except that the
  sources after a failing one still run. The `too-large` rule is safe with
  the flag off and on, and with no large file yet: today no chat object is
  above 25 MiB.

## Security

- Scan before available: see What keeps unscanned bytes unusable.
- The scanner fetches only allowlisted https hosts, no redirects, no IP
  literals, one presigned object with a 30-minute TTL.
- Decompression bombs: clamd limits with alerts; OOXML text parts are sized from
  the central directory before inflating; images keep the pixel limit.
- Type confusion: magic bytes are checked against the declared type and
  extension in `inspectUploadHead`, as today; downloads above 30 MiB are served
  as `application/octet-stream` attachments; raw bytes are opened only in the
  E2B sandbox.
- Malformed PDFs: eval off, one batch per step, a time budget per step; failure
  gives `prepare_failed` and never unseals.
- No extractor fetches anything; HTML is never rendered; SVG stays refused.
- Prepared text is fenced as untrusted document text.
- Tenant isolation: the status, cancel and file routes use the user-scoped
  database; `open_file` and scoped `search_files` resolve only assets the
  caller owns in the current conversation; both tables use forced RLS with
  owner policies.
- No user route writes `staging_key`, `etag`, `scan_job_id`, verdict fields or
  `media_asset_id`; the seal does not trust them anyway.
- Credentials and DLP read every byte of a large file the product reads as
  text, whatever type the client declared, before it is submitted or sealed
  (Web side of the scan); PDF, Office and XLSX files keep today's scope,
  which reads no content for credentials.

## Local and bring-your-own-key

Managed Cloud only. Local on the phone keeps the device limit (25 MiB); BYOK
requests never reach the chat route; a Local-to-Cloud fork re-uploads through
this pipeline with the consent the trust rules require. Registry membership
never routes a Local file here. Desktop Tauri, the CLI, the extension and
VS Code send no token and stay on their current limits.

## Degradation matrix

Every row is a state the product can be in, and every row names the test that
proves it; package keys refer to `tasks.md`. "The schema-absent database" is
the fake in `apps/web/lib/server/chat-file-intake/__tests__/schema-absent-db.ts`
(`P2`): it answers the `to_regclass` and `information_schema.columns` probes
with "absent" and throws on any other SQL that names `chat_file_` or
`scanned_sha256`.

| #   | Situation                                                                                                                                   | Behaviour                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                            | Test                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                         |
| --- | ------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| 1   | Floor build (`P1` only) against today's database and scanner                                                                                | Identical outcomes to today; no stored file is read without a bound                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                  | `chat-attachment-hydration.test.ts`: the existing cases unchanged, plus "degrades a 500 MiB asset without reading it, in the current turn" and "degrades a 500 MiB asset without reading it, in history", where the first asserts the storage read is never called, and "an admitted file found unreadable gives its charge back, so a later file that fits without it is sent as today ($failure, $turn)" (`P1`)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                            |
| 2   | Web rolled back to any build at or above the floor while sealed large files exist                                                           | History large file: today's `over_budget` note; current-turn large file: today's 413; nothing read. The index loader and `open_file` of such a build read index rows, not storage                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                    | `chat-attachment-hydration.test.ts` "degrades a 500 MiB asset without reading it", current turn and history (`P1`)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                           |
| 3   | Web rolled back below the floor                                                                                                             | Refused by the release tooling once the floor is recorded: `scripts/release/rollback.mjs` reads `scripts/config/rollback-floor.json` (`P20`) and refuses a target created before the floor deployment, whether named with `--to` or chosen automatically; with no floor recorded (every state before deployment step 5) it behaves as today                                                                                                                                                                                                                                                                                                                                                                                                                                                                          | `scripts/release/rollback.test.mjs` "refuses a requested target older than the floor", "automatic choice skips deployments older than the floor and refuses when none is left" and "with no floor recorded the choice is today's" (`P20`); the floor is written at `plan.md` step 5                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                          |
| 4   | Any build against a database without 0422 (a preview or local database; production gets 0422 before the first web deploy, `plan.md` step 3) | Synchronous completion, every media insert, `/api/me`, create, the parts and complete routes for a `chat-attachment` session, hydration, the index loader, `open_file`, `search_files`, the export, account erasure and organisation erasure behave as today; readiness false; the sweeper does nothing                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                              | With the schema-absent database: `account-erasure.test.ts` and `organization-erasure.test.ts` "with the schema absent, completes and reports both chat file tables deleted", and `user/export/__tests__/route.completeness.test.ts` "with the chat file schema absent the export is complete and has no chat_file_intakes section" (`P2`); `retrieval-index-service.test.ts` "a small library_file indexes exactly as today" and `file-search-tool.test.ts` "open_file and search_files read a small file exactly as today" (`P11`); `schema-absent.test.ts` for synchronous completion through the real `insertMediaAsset`, and `sweep-chat-file-intakes/__tests__/route.test.ts` "does nothing on a database without migration 0422 while the flag is %s" for the sweeper (`P12`); `readiness.test.ts`, `me/__tests__/route.contract.test.ts`, and the parts route test "signs a chat-attachment session on a database without the intake tables without naming them", and the complete and abort route tests in `[uploadId]/route.test.ts`, "completes synchronously and issues no statement naming a new table" and "aborts and issues no statement naming a new table" (`P14`); `prepared-attachments.test.ts` for a turn with only small files (`P15`) |
| 5   | 0422 applied, scanner still protocol 1                                                                                                      | `/v2/capability` is 404, so inline only; create refuses `chat-large-file`                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                            | `readiness.test.ts`; `uploads/__tests__/route.test.ts` "refuses a large create while the scanner speaks protocol 1" (`P14`)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                  |
| 6   | New scanner, old web                                                                                                                        | Legacy `/scan` unchanged; `/v2` unused                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                               | `services/upload-scanner/__tests__/server.test.ts` and `limits.test.ts`, both unchanged and green (`P3`)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                     |
| 7   | Large scans running while small uploads arrive                                                                                              | Legacy scans are not queued; source bytes are admitted only within the hourly budget, otherwise `429` with no attempt used; `/health` stays 200 for the whole of a live source scan (first byte to reply or deadline), the scan phase after the last byte included, even when the EICAR probe and the signature read both hang; the watchdog does not restart; after a deadline with no reply the exemption is withheld until a probe succeeds. Whether CPU throttling can still slow legacy scans is not provable with a fake: until the step 4 measurement and confirmation run pass, large files stay off in production                                                                                                                                                                                           | `scan-queue.test.ts` "refuses a new job past SCAN_SOURCE_BYTES_PER_HOUR with Retry-After until the window frees enough" and "returns the same job for a repeated jobId and does not charge it again"; `server-v2.test.ts` (`P3`, with the fake clamd's held reply and hanging VERSION): "fake clamd accepts the whole stream and holds the reply past the watchdog limit while the EICAR probe and VERSION hang: /health 200 throughout and no watchdog exit", "the same scan reaching its deadline with no reply: the next /health is 503 and the watchdog fires after its limit, as today", "a held v2 scan does not slow 20 legacy scans", "a signature read that times out during a source scan uses the last good value"; these prove admission and liveness only, because the fake clamd uses no CPU. CPU: `plan.md` step 4 on the test app                                                                                                                                                                                                                                                                                                                                                                                                            |
| 8   | Everything deployed, flag off                                                                                                               | Inline limits offered; readiness makes no query and no fetch; create refuses `chat-large-file` with "Files this large aren't available yet"; sealed large files keep the prepared path; intakes in flight finish and the sweeper keeps running, since it is gated on the schema only; a turn with no file over the inline limit gets today's provider messages                                                                                                                                                                                                                                                                                                                                                                                                                                                       | `readiness.test.ts` "with the flag set to %s no query and no fetch is made" and `uploads/__tests__/route.test.ts` flag-off case (`P14`); `prepared-attachments.test.ts` "chooses the prepared path by size with the flag off, and never reads the large object", "with only small files and a history over the inline budget, the provider messages equal the default resolver" and "a history image over the inline budget gets today's over_budget note" (`P15`)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                           |
| 9   | Workflow start fails or its region is down                                                                                                  | Row stays `uploaded`; the sweeper re-dispatches; after 24 h `failed: stalled` with objects purged                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                    | `sweep-chat-file-intakes/__tests__/route.test.ts` (`P12`)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                    |
| 10  | Scanner down, saturated or slow                                                                                                             | A full queue keeps the file in `checking` without using attempts; a spent hourly budget or restart ramp keeps it there too, with that wait not counted toward `scanGiveUpMs` up to `budgetWaitMaxMs` (2 h); errors use attempts; then `failed: scan_unavailable`, never `rejected`, with the daily bytes refunded for at most 3 such failures per person a rolling day, whatever the cause; an attempt's deadline is the scanner's `deadlineMs` plus 60 s; nothing usable                                                                                                                                                                                                                                                                                                                                            | `chat-file-intake-workflow.test.ts` with the fake scanner: 5xx, `429 queue_full` for 25 minutes then clean (sealed, four attempts unused), `429 queue_full` past 30 minutes (`scan_unavailable`, refunded), `429 source_budget` for 70 minutes then clean (sealed, no attempt used), `429 source_budget` past `budgetWaitMaxMs` plus `scanGiveUpMs` (`scan_unavailable`), a `deadlineMs` of 200 s in the `202` keeps a scan still `scanning` 230 s after the first `scanning` poll inside its attempt, `incomplete: source_unavailable`, `incomplete: deadline` (refunded within the cap); `quotas.test.ts` "refunds the first three scan_unavailable endings in 24 hours, not the fourth, and again a day later" (`P12`)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                    |
| 11  | Scanner restarts during a scan                                                                                                              | Poll sees `unknown`; a new attempt is submitted                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                      | Same file, restart case (`P12`)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                              |
| 12  | Seal copy outlives the client deadline                                                                                                      | HEAD of the sealed key decides; at most 3 copies; exactly one row                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                    | `seal.test.ts` with a memory store that delays the copy (`P12`)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                              |
| 13  | Preparation fails, or a large asset has no preparation row                                                                                  | `prepare_failed` or no row: card only, "could not be read as text"; file attached and in the sandbox                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                 | `chat-file-preparation/__tests__/pdf.test.ts` malformed case (`P8`); `prepared-attachments.test.ts` both cases (`P15`)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                       |
| 14  | E2B unavailable, plan without a sandbox, or envd below 0.5.7                                                                                | Card and excerpt; not staged; no buffering                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                           | `attachment-staging.test.ts` TemplateError and unavailable cases (`P9`)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                      |
| 15  | Old app, or stale web tab, against the new server                                                                                           | No token: today's limits and response shapes; the intake shape is never sent                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                         | `me/__tests__/route.contract.test.ts` "hands a build without the token today’s limits byte for byte and asks nothing more" and `[uploadId]/route.test.ts` "completes synchronously and issues no statement naming a new table" (`P14`)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                       |
| 16  | New app against an old server                                                                                                               | The old server ignores the header and sends today's limits; the client never sends `chat-large-file` or a newer API version                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                          | `managed-cloud-resumable-upload-client.test.ts` old-server fixture: the same request sequence as today (`P10`)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                               |
| 17  | Mobile 0.0.1 against any server                                                                                                             | Sends no token; today's behaviour                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                    | What ships in the mobile 0.0.1 binary                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                        |
| 18  | Any app opening a conversation or the Library with a 500 MiB file; any other asset above 30 MiB                                             | Chip from name and size. A sealed large chat file is redirected only for a browser navigation or a request carrying the token; every other request for it, which is every mobile download (0.0.1 and later, none sends the token on a file request) and the web's fetch-based readers, gets today's `413`, flag on or off. The web Library's download button saves a large uploaded file through a browser download, which is a navigation and is redirected, while attach-from-Library keeps `413` for it, with a message from the Library page's handoffs and the generic could-not-be-added copy from the composer (known flaws, `P18`); on the phone the `413` gets its own copy. Every other asset above 30 MiB (other source, local prefix, public bucket, unsealed key) keeps today's `413` for every request | `files/[id]/__tests__/route.test.ts` (`P13`), each with the flag unset and set: "a navigation to a sealed chat-attachment asset above the inline limit is redirected", "a request carrying large-chat-files-v1 is redirected", "a request with neither gets 413: %s" (nine request shapes, in both flag states) and "keeps 413 for %s, even for a navigation or the token" (a 40 MiB generated asset, a public-bucket asset and a local-prefix asset); the two phone cases "a 413 gives the too-large copy and builds no blob" and "no file request carries x-agi-client-capabilities" (`apps/mobile/__tests__/generated-file-download.test.ts`); the flag half of the second case waits for `FEATURES.largeChatFiles`, which P17 adds after the App Store review binary is built (`tasks.md`), and the 0.0.1 phone app keeps the 25 MiB per-file limit                                                                                                                                                                                                                                                                                                                                                                                                      |
| 19  | Browser origin that needs the relay (preview without `UPLOAD_STORAGE_CORS_ORIGINS`, the Chrome extension); a preview origin that is listed  | Unlisted: never offered large files, including on a same-origin `/api/me` GET that carries no `Origin`; create refuses `chat-large-file`; the parts route answers `409` for a `chat-large-file` session instead of a relay URL. Listed: `uploadNeedsSameOriginRelay` is false, so parts go straight to storage for every session kind and no part is relayed                                                                                                                                                                                                                                                                                                                                                                                                                                                         | `upload-transport.test.ts` with the headers a browser sends: `uploadNeedsSameOriginRelay` is false for a listed preview origin ("sends a listed preview page straight to storage") unchanged with the variable unset ("relays a request with no Origin on a preview deployment, as before large files") and for a page the list does not name ("still relays a preview page the list does not name"); `storageReachableForLargeFiles`: a same-origin GET with `Sec-Fetch-Site: same-origin` and no `Origin` on a preview URL is not reachable ("judges a same-origin browser GET without an Origin by the page it came from"); a create POST with `Origin` on the same preview is not reachable ("refuses a preview page that sends its Origin"); with the origin listed both are ("accepts a preview page the storage CORS rule lists, with or without an Origin"); no `Origin` and no `Sec-Fetch-Site` (native) is reachable ("accepts a native client, which sends neither header"); `parts/__tests__/route.test.ts` "answers 409 from a relay origin, never a relay URL" and "presigns straight to storage from an origin the storage CORS rule lists"; and the `me` route test with the same headers (`P14`)                                            |
| 20  | 0422 applied and an older web inserts small chat rows                                                                                       | The trigger passes rows of 25 MiB or less; updates and conversation deletion of legacy rows pass                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                     | `chat-file-intakes-migration.live.test.ts` against a local Postgres: an insert at 26214400 bytes without `scanned_sha256` passes, at 26214401 fails, with matching hashes passes; soft delete and conversation delete of a legacy row pass; RLS denies another user. `chat-file-intakes-migration.test.ts` pins the 26214400 literal to the policy (`P2`)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                    |
| 21  | Embedding or OCR route refused                                                                                                              | No effect at upload (neither runs); OCR in a turn answers that the page could not be read                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                            | `file-search-tool.test.ts` OCR-refused case (`P11`)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                          |
| 22  | Desktop Tauri, CLI, extension, VS Code                                                                                                      | No token; current limits                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                             | Covered by row 15's tests                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                    |
| 23  | Account or organisation erased with uploads in flight                                                                                       | No intake row and no staging, sealed or derived object is left; a seal finishing after erasure deletes its sealed object; a failed object delete keeps the organisation row for retry                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                | `erasure.test.ts` with the memory store, user and organisation scope, including a row with `sealing_entered_at` set (`P2`); `organization-erasure.test.ts` "an organisation with an uploaded intake leaves no object" (`P2`); `seal.test.ts` "deletes its sealed copy when the intake row is gone by the time it commits" (`P12`)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                            |
| 24  | Upload abandoned (tab closed, network lost)                                                                                                 | After 2 h without a parts request: `cancelled: idle`, multipart aborted, unstored bytes refunded, the in-flight slot freed                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                           | `sweep-chat-file-intakes/__tests__/route.test.ts` idle case (`P12`)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                          |
| 25  | Long tool loop over large files                                                                                                             | Attachment-derived tokens stay within T on every step where reading is open; text shrinks per step; once 2K passes R, reading closes, `open_file` and `search_files` are withdrawn, and every other tool and the loop carry on under `maxSteps`                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                      | `attachment-turn-budget.test.ts`: "step 3 of a tool loop still carries document text", 20 files on the expensive catalog fixture, "over 100 Work steps with file tools the loop reaches step 100 under the ceiling", "after closing, 20 cards and 16 stubbed results stay under the out-of-ledger ceiling"; `tool-loop.large-file.test.ts` "a Work turn with one large CSV still offers code execution at step 30" (`P15`)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                   |
| 26  | A turn with no large file, flag on or off                                                                                                   | No ledger; `open_file`, `search_files` and the tool loop exactly as today                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                            | `tool-loop.large-file.test.ts` "a turn with no large file runs open_file and the tool loop as today, flag %s" (flag unset and on, `P15`)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                     |
| 27  | A turn resumed after an approval, a pause, a step-budget pause or a wall-clock continuation                                                 | The ledger resumes from its saved charged total and closed state                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                     | `approval-checkpoint-request.test.ts` "saves and restores largeFileTurn" and `large-file-turn-continuation.test.ts` "a continuation carries largeFileTurn through parseCloudAgentWorkflowInput" (`P15`)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                      |
| 28  | A preparation step dies without throwing                                                                                                    | After `preparation.stallMs` (2 h) without a cursor advance: `prepare_failed: stalled`; card only; file usable in the sandbox                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                         | `sweep-chat-file-intakes/__tests__/route.test.ts` stalled-preparation case (`P12`)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                           |
| 29  | A re-entered seal ends `failed: scan_unavailable` after its copy had finished                                                               | The sealed key is deleted with the staging key before `objects_purged_at` is set; no object is left                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                  | `seal.test.ts` "a re-entered seal that ends scan_unavailable deletes the sealed key" and `transitions.test.ts` "deletes the sealed key when a row that entered sealing ends %s" (rejected, failed and cancelled, `P12`)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                      |
| 30  | Hourly backup cron while sealed large chat files exist                                                                                      | A chat key above 25 MiB is `too-large` without a read; every other object as today; an object that throws is counted in `failed`, its source's cursor is written at the last row that completed and never past the row that threw, the next run retries that row, and the project-knowledge source still runs                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                        | `apps/web/lib/server/__tests__/object-backup.test.ts` "a chat-attachments key above the inline limit is too-large and never read" (a store spy sees no `get`) and "a 200 MiB generated-media key is still copied"; `replicate-object-backups/route.test.ts` "a throwing object is counted, the cursor stops before it, the next run retries it, and the knowledge source still runs" (`P19`)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                 |
| 31  | Person cancels a large file mid-upload                                                                                                      | Session `DELETE` sets the intake `cancelled: client`, refunds unstored bytes and frees the in-flight slot at once; a `chat-attachment` session's `DELETE` issues today's statements                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                  | `[uploadId]/route.test.ts` "aborts the upload, then cancels the intake with the bytes the parts stored" and, against the database without the intake tables, "aborts and issues no statement naming a new table" (`P14`); `transitions.test.ts` "refunds the bytes the parts never stored, once", in the `cancelIntakeByStagingKey` suite, and `store.live.test.ts` for the `cancelled: client` row. `uploads/__tests__/route.test.ts` "frees the slot when a large session is aborted, so a fourth create is admitted on Basic" (`P14`) holds the freed slot through the real create and `DELETE` routes over an in-memory intake store, while the real `countInFlightIntakes` statement is run only before a cancel, in `store.live.test.ts`; `managed-cloud-resumable-upload-client.test.ts` "cancel before the 202 sends the session DELETE, after it the intake DELETE" (`P10`)                                                                                                                                                                                                                                                                                                                                                                         |
| 32  | Scanner restarted (deploy, watchdog, clamd exit, out of memory)                                                                             | The hourly allowance starts at zero and returns linearly over the first hour; queued work waits in `checking` without using attempts                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                 | `scan-queue.test.ts` "a job submitted at uptime 0 gets 429 with Retry-After; half the budget is available at 30 minutes" (`P3`)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                              |
| 33  | A seal step dies mid-copy; a run dies while inspecting or scanning                                                                          | Its lease (15 min) outlives any step (800 s), so no second run enters the seal while the first can still copy; after the lease the sweeper re-dispatches and the HEAD decides. An `inspecting` row is inspected again from the start before any submit; a `scanning` row polls its recorded job; a second live run ends at its compare-and-set without doing the next step                                                                                                                                                                                                                                                                                                                                                                                                                                           | `transitions.test.ts` "a sealing row is not re-dispatched before lease_until and is after it", "each scan poll renews the lease from the time of the poll", "waits its turn while another intake of the person is scanning, renewing its lease at each wake", "a re-dispatched run for an inspecting row inspects again before it submits", "a re-dispatched run for a scanning row polls the recorded job, then starts a new attempt" and "a second live run ends without doing the next step when the row is %s" (`P12`)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                   |

## What ships in the mobile 0.0.1 binary

0.0.1 goes to App Store review this week and is expected to be cut before any
package here merges, in which case it ships none of this. If the binary is cut
from a branch that already holds some packages, it can contain:

- from `P6` and `P10` (shared contracts): the new policy blocks and their new
  export names, the large create and complete schemas, the intake status
  schema, the optional wire fields (`large_files_available`,
  `storage_remaining_bytes`, `inline_message_bytes`), and the shared client's
  large branch and intake waiter. No existing export, schema or default value
  changes, so the code 0.0.1 already calls is unchanged;
- nothing from `P17`: the mobile package is in the last wave, and it cannot
  start until the 0.0.1 binary has been built and its build id and source
  state are recorded in `tasks.md` (Records), because all work happens in one
  working tree where no branch keeps it out.

`P10` rewrites `managed-cloud-resumable-upload-client.ts`, which every mobile
chat upload uses (`apps/mobile/src/features/chat/upload/partedChatUpload.ts`,
about line 154), so `P10` runs the mobile upload tests unchanged:
`apps/mobile/src/features/chat/upload/__tests__/partedChatUpload.test.ts` and
`apps/mobile/__tests__/api-upload-parts.test.ts`, with the web
`apps/web/features/chat/services/chat-attachment-upload.test.ts`.

That code is inert in 0.0.1 for two independent reasons:

1. 0.0.1 sends no `x-agi-client-capabilities` header, because
   `platformHeaders.ts` adds it only from `P17`, and only when
   `FEATURES.largeChatFiles` is true. Without the token every server answers
   today's limits, without the new fields.
2. The shared client enters the large branch only when its caller passes
   `largeFiles: true`, which only `P17` and `P16` do, from
   `large_files_available` in the handshake.

Proof: `managed-cloud-resumable-upload-client.test.ts` and
`managed-cloud-chat-attachments-client.test.ts` (`P10`) assert that without
`largeFiles` a 30 MiB file and a 5 MiB file produce exactly today's request
sequence and errors, against both a server fixture without the new fields and
one with them, and the two mobile upload suites above stay green unedited; `apps/mobile/__tests__/platformHeaders.test.ts` (`P17`) would assert
no capability header while `FEATURES.largeChatFiles` is false; that file is
not written, because `P17` is deferred until the App Store review binary is
built (`tasks.md`), and version 0.0.1 of the phone app keeps the 25 MiB
per-file limit. A mobile build
that sends the token is made only at deployment step 8.

## Owner decisions

The owner was not available before the build. Each default below is the built
value; changing one is a configuration change unless stated.

| Key | Decision                             | Built default                                                                                                                                                                                                                                                                                                                                                                    | Alternatives                                                                                                                     | What changing it involves                                                                                                                                                                                                                                                                                              |
| --- | ------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| A   | What Free gets                       | Inline only: 25 MiB per file, 10 per message, no large path (`maxChatFileBytes` inline, daily 0, intakes 0)                                                                                                                                                                                                                                                                      | 50 or 100 MiB through the large path                                                                                             | Plan fields in `billing-catalog.ts`; Free storage is 100 MiB, so it also needs a storage decision                                                                                                                                                                                                                      |
| B   | Paid per-file and per-message        | 500 MiB per file, 20 files, 2 GiB per message, by kind as in Limits by kind                                                                                                                                                                                                                                                                                                      | 512 MiB; per-plan lower caps                                                                                                     | Policy `largeFiles` and plan `maxChatFileBytes`; `MAX_SOURCE_SCAN_BYTES` and clamd limits must stay above it                                                                                                                                                                                                           |
| C   | Spend at upload                      | None: no embeddings, no OCR; keyword index only; OCR only for pages a turn opens, 4 per batch, 8 per turn, 100 per file                                                                                                                                                                                                                                                          | Embeddings to a per-plan cap; OCR at upload                                                                                      | Set `preparation.embedChatFiles`; add per-plan embedding caps and a visible usage line first; a migration is not needed                                                                                                                                                                                                |
| D   | Storage                              | Quotas unchanged; the handshake folds remaining storage into the large limit; deleting a chat does not free its files                                                                                                                                                                                                                                                            | Raise paid storage; give chat files their own retention outside the meter                                                        | Billing catalog values, or a new meter and purge; both change cost                                                                                                                                                                                                                                                     |
| E   | Turn budget                          | One ledger per turn across tool steps (The turn ledger): 120,000 tokens, a quarter of the window, 10 cents uncached input; each step's text at most half of what remains after resends; cards a quarter of T; later files 5,000 each and 20,000 in all, never above the step's share                                                                                             | Higher cents cap for expensive routes; per-request budget                                                                        | Policy `turnBudget`; an evaluation set of long documents should set these before production (`plan.md`)                                                                                                                                                                                                                |
| F   | Deployment                           | Every step needs the owner's go-ahead in his own words; nothing in the build needs a deployment to be tested                                                                                                                                                                                                                                                                     | None                                                                                                                             | `plan.md`                                                                                                                                                                                                                                                                                                              |
| G   | Daily bytes and concurrency per plan | Basic 2 GiB and 3, Pro 10 GiB and 3, Max and Team 25 GiB and 5, Max 15x and Enterprise 50 GiB and 5                                                                                                                                                                                                                                                                              | Other values                                                                                                                     | Plan fields                                                                                                                                                                                                                                                                                                            |
| H   | Scanner size                         | Today's VM (4 GB, 2 shared CPUs, 1 machine), one large scan at a time                                                                                                                                                                                                                                                                                                            | `performance` CPUs, which have no burst balance to spend; 8 GB with 4 shared CPUs; more machines after verifying request pinning | `fly.toml` and money; decided when the step 4 confirmation run on the test app fails at every budget that still admits one 500 MiB file an hour                                                                                                                                                                        |
| I   | HTML and script coverage             | HTML capped at 40 MiB; scripts over 20 MiB scanned without normalisation, listed in known flaws                                                                                                                                                                                                                                                                                  | Raise the normalisation limits                                                                                                   | `clamd.conf` and memory on the VM                                                                                                                                                                                                                                                                                      |
| J   | Per-user index cap                   | 200,000,000 indexed characters across a person's prepared chat files                                                                                                                                                                                                                                                                                                             | Count index bytes in storage                                                                                                     | Policy value, or a change to `sumFileStorageBytes`                                                                                                                                                                                                                                                                     |
| K   | Temporary chats                      | Large files allowed; outside the storage meter for up to 30 days (worst case about 1.5 TB and about $22 a month for one Max 15x account at full daily use)                                                                                                                                                                                                                       | Count temporary large files against storage; refuse large files in temporary chats                                               | Create admission and the meter                                                                                                                                                                                                                                                                                         |
| L   | Backups                              | Chat files over 25 MiB get no backup replica in the first version; the cron never reads one (`P19`)                                                                                                                                                                                                                                                                              | Replicas for large chat files                                                                                                    | Copy by stream (`getPrivateObjectStream` into `put` with `contentLength`) through `P5`'s long-deadline client with a per-run byte cap, a change to `object-backup.ts` and its tests, plus a `plan.md` step 6 check that a 256 MiB file replicates within one run under half the function's memory; backup storage cost |
| M   | Export                               | Intake rows exported; derived text not exported                                                                                                                                                                                                                                                                                                                                  | Export derived text                                                                                                              | A section in `apps/web/app/api/user/export/route.ts` and removing `chat_file_preparations` from `UNEXPORTED_USER_TABLES`                                                                                                                                                                                               |
| N   | Phone on cellular                    | Ask once above 50 MiB, Upload or Cancel                                                                                                                                                                                                                                                                                                                                          | A queued Wait for Wi-Fi                                                                                                          | A persisted queue in the mobile upload layer                                                                                                                                                                                                                                                                           |
| O   | Per-sandbox staging                  | 1 GiB in total, no eviction                                                                                                                                                                                                                                                                                                                                                      | Larger after the E2B disk and memory check                                                                                       | Policy value                                                                                                                                                                                                                                                                                                           |
| P   | Scanner hourly source budget         | `SCAN_SOURCE_BYTES_PER_HOUR` 2 GiB, about four 500 MiB files an hour across all users, until step 4 sets it from the measured CPU-seconds per byte (never above 2 GiB without a second confirmation run). No per-person share: one account can take the whole hour's budget (four 500 MiB files at 2 GiB), and per-user fairness only scans one person's own files one at a time | The measured value; a larger VM (H); a per-person share of the hourly budget                                                     | A scanner environment value; raising it needs a new step 4 confirmation run on the test app. A per-person share is a key-value counter beside the refund counter in `quotas.ts` (`P12`) and a submit wait, and makes other people's files wait less while one account uploads many                                     |
| Q   | PDF range loading                    | `kinds.pdf.rangeLoading` on; off means PDFs above 200 MiB are not read as text and OCR is unavailable                                                                                                                                                                                                                                                                            | Off                                                                                                                              | Policy value, set from the step 6 measurement                                                                                                                                                                                                                                                                          |
| R   | Refunds for scanner failures         | `failed: scan_unavailable` refunds the daily bytes at most 3 times per person per rolling day, whatever the cause                                                                                                                                                                                                                                                                | Unlimited refunds for outages only; no refunds                                                                                   | Policy `intake.scanUnavailableRefundsPerDay`                                                                                                                                                                                                                                                                           |
| S   | Scanner measurement                  | Step 4 measures on a second Fly app with the production image and VM, destroyed afterwards (a few cents, owner go-ahead)                                                                                                                                                                                                                                                         | Measure on the production scanner                                                                                                | Never chosen: the production scanner serves every live upload, fail closed                                                                                                                                                                                                                                             |
| T   | Rollback floor                       | Enforced by `scripts/release/rollback.mjs` from `scripts/config/rollback-floor.json` (`P20`)                                                                                                                                                                                                                                                                                     | Prose in `plan.md` only                                                                                                          | Removing the floor file entry re-allows older targets; only after no large file exists                                                                                                                                                                                                                                 |

## Not in the first version

- Provider Files APIs (workspace-scoped files, 48-hour expiry, PDF-only
  `file_id` on one route; none lowers token cost).
- Native document admission above 25 MiB per route.
- Archives, audio, video and legacy `.doc`, `.xls`, `.ppt`.
- Preparation and indexing of files of 25 MiB or less, and excerpts of small
  history files that no longer fit the inline budget (they keep today's
  `over_budget` note).
- Embeddings for chat files; OCR at upload.
- A coverage line under the answer; the truncation line and the model's own
  statement cover it.
- A queued send beyond today's held send.
- Per-part `Content-MD5`; the whole-file SHA-256 and the scanner's hash cover
  integrity.
- Push notification when a file is ready; resuming on another device; Android
  foreground-service uploads.
- Large files in Local mode, BYOK, the iOS share extension, desktop Tauri, the
  CLI, the extension and VS Code.
- Large project knowledge files.
- Credential and DLP scanning of the content of binary types (PDF, Office,
  XLSX, notebooks), large or inline, and of inline files beyond their first
  256,000 bytes (known flaws).
- Scanning across several machines.
- A web PDF preview above 30 MiB.
- Downloading or attaching a file above 30 MiB from the web Library's
  fetch-based readers, and opening one on the phone: both keep today's `413`
  (Downloads); a browser navigation downloads it.

## Cost controls

Unit prices from `https://developers.cloudflare.com/r2/pricing/` and
`https://vercel.com/docs/workflows/pricing`, as read by the design run on
2026-11-14 (not re-read here): R2 storage $0.015 per GB-month, Class A $4.50 and
Class B $0.36 per million, egress free; Workflow $0.02 per 1,000 events and
$0.50 per GB written.

One 480 MB PDF: storage about $0.0075 a month; about 65 Class A operations;
about 80 Workflow events; no embedding or OCR spend at upload; keyword index
rows for at most 2,000,000 characters.

What bounds each cost:

- **Model input from files per turn:** at most T tokens of cards, prepared
  text and file-tool results, counted on every step that sends them, the last
  step included, while reading is open (The turn ledger). After reading
  closes, one-line cards and stubs of at most about 3,000 tokens per step are
  sent outside the ledger. Not bounded by T: the person's message, history
  text, other tools' results and inline-path files, which stay bounded as
  today by the context window and `maxSteps`.
- **Model spend at upload:** none.
- **OCR:** 8 pages per turn and 100 per file, paid once per page.
- **Scanner:** one large scan at a time globally and one per person, and at
  most `SCAN_SOURCE_BYTES_PER_HOUR` (2 GiB) of source bytes admitted an hour,
  ramping up from zero over the first hour after a restart. Daily bytes are
  refunded only for bytes never stored and for at most three
  `scan_unavailable` failures per person a day, so a cancel, reject or
  failing-file loop spends the person's budget.
- **Index rows:** 2,000,000 characters per file and 200,000,000 per person.
- **Storage:** the storage meter, except temporary chats and soft-deleted files
  (Owner decisions, K).
- **Function bytes:** none on upload, scan, download, preparation or backup
  (the backup cron skips chat files over 25 MiB without reading them); sandbox
  staging passes through the chat function, and the intake workflow reads a
  large text file once from storage for its credential scan. Whether Vercel bills a function's
  inbound bytes, and Fly's bandwidth price, are unknown.
