# Large chat file uploads: tasks

Status: In progress
Owner: Chat attachments maintainers
Last updated: 2026-11-15

Work packages for `spec.md`. Each package is one engineer's work and one pull
request. Rules for the list:

- Every file the feature changes is owned by exactly one package and listed
  there in full; `(new)` marks a file the package creates. A file marked
  "only if" is owned by that package and changed only when the named guard
  asks for it. There are two stated exceptions, each written by packages in
  different waves:
  - the surface reachability allowlist (`P8` adds an entry, `P12` removes it;
    see `P8`);
  - the migration dependency allowlist,
    `scripts/config/migration-dependency-allowlist.json`. Its guard
    (`scripts/check-migration-dependencies.mjs`, in the `check:llm-operability`
    chain) fails every non-test `.ts` or `.tsx` file under `apps/web` that names
    a table or column of a migration above `appliedThrough` (421) in
    `scripts/config/production-migrations-applied.json`, unless the allowlist
    holds an entry for that file and migration; it also fails a stale entry.
    `P2` (wave 1), `P8` (wave 2) and `P12` (wave 4) each add one entry per
    non-test file of their own that the guard names, with the reason the
    guard's history uses ("This code ships with 0422_chat_file_intakes.sql: a
    manual production deploy applies pending migrations before the new code is
    promoted (docs/runbooks/release-rollback.md, \"Deploying by hand:
    migrations first\")."). Every other package (`P11`, `P13`, `P14`, `P15`
    and the client packages) names no new table or column in a non-test file:
    they go through `schema.ts` and `erasure.ts` (`P2`), `P8`'s readers and
    progress store, and `P12`'s store. `plan.md` step 3 deletes the 0422
    entries once 0422 is applied.
- Files changed at deployment, not by a package: `plan.md` step 3 sets
  `appliedThrough` to 422 in `scripts/config/production-migrations-applied.json`,
  records the checksum in `scripts/config/applied-migration-checksums.json` and
  deletes the 0422 entries from the migration dependency allowlist, in one
  commit; `plan.md` step 5 writes the floor deployment into
  `scripts/config/rollback-floor.json` (created empty by `P20`).
- **Generated indexes.** `docs/agent-context/generated/**` is compared byte
  for byte with a fresh render by `check:agent-context-indexes`, so most
  packages drift it. No package regenerates it. The person closing a wave runs
  `pnpm generate:agent-context-indexes` once, after every package of the wave
  is in the tree and before the next wave starts, then runs the full
  `check:llm-operability` chain once for the wave. A package runs its named
  guards individually (the chain is `&&` and would stop at the drifted
  indexes), never the chain.
- A package starts only when every package it depends on has merged. Nothing
  depends on work in flight: gate G0 comes first, and the packages build on
  the working tree as it is.
- No two packages in the same wave write the same file.
- A package merges green: its tests, the guards it names, and the guards of
  the chain that read the files it touches, each run on its own (`check:surface-reachability` for
  every new module under `apps/web`). No package adds a module that has no
  importer when it merges, except under the `P8` exception.
- Files the chat renderer workstream is editing (`packages/ui/unified-chat`,
  `packages/ui/i18n`, `apps/web/features/chat`, most of
  `apps/mobile/src/features/chat/components`, the mobile chat stores, composer
  and chat screens) are avoided. The two packages that must touch that area,
  `P16` and `P17`, are in the last wave and name each such file.
- Every package is tested locally with the instruments in `plan.md` (Testing
  without a deployment); none needs a deployment.
- Load `.agents/skills/agiworkforce-design` before `P16` and `P17`.

Status values: `todo`, `doing`, `built` (in the working tree, uncommitted,
with its scoped tests passing as its package reported them), `partly built`
(in the tree with named work open), `deferred` (waiting on a recorded
precondition), `done` (with the commit that landed it). On 2026-11-15 no
package is committed, so none is `done`.

## Build order

| Wave     | Packages                                   | Each depends on                                                                                    |
| -------- | ------------------------------------------ | -------------------------------------------------------------------------------------------------- |
| G0       | Gate                                       | Nothing                                                                                            |
| 1        | `P1`, `P2`, `P4`, `P5`, `P6`, `P19`, `P20` | G0                                                                                                 |
| 2        | `P3`, `P7`, `P8`, `P9`, `P10`, `P13`       | `P3`, `P7`, `P9`, `P10`: `P6`. `P8`: `P2`, `P5`, `P6`. `P13`: `P5`, `P6`                           |
| 3        | `P11`                                      | `P2`, `P6`, `P8`                                                                                   |
| 4        | `P12`, `P15`                               | `P12`: `P2`, `P3`, `P4`, `P5`, `P6`, `P7`, `P8`, `P11`. `P15`: `P1`, `P2`, `P6`, `P8`, `P9`, `P11` |
| 5        | `P14`                                      | `P2`, `P4`, `P6`, `P12`                                                                            |
| 6 (last) | `P16`, `P17`                               | `P16`: `P10`, `P14`. `P17`: `P10`, `P14` and the 0.0.1 build recorded under Records                |
| After    | `P18` (documentation only)                 | Waves 1 to 6 merged                                                                                |

## Gate G0: no other writer, and a green tree

Status: todo. Neither item is recorded under Records; the packages were built
on the working tree without it.

G0 asks for no commit; commits are the owner's decision. It holds when both
of these are recorded by the person running the build, with the date:

1. No other workstream is writing any path named in this file. The renderer
   workstream's area is listed in the rules above; its owner confirms that none
   of the paths here is open in that work, and that it adds no dependency
   (so does not change `pnpm-lock.yaml`) while `P16` is open, because
   `docs/agent-context/shared-files.md` lets the lockfile change only once,
   after implementation lanes finish, and `P16` is the one package here that
   changes it (`@noble/hashes` in `apps/web/package.json`; the lockfile in
   the tree on 2026-11-15 also carries another workstream's change).
2. The tree as it is passes the mobile, shared-package and web typechecks and
   their test suites (the commands in `docs/agent-context/commands.json`, run
   one at a time through `scripts/dev/heavy-job.sh`), with any failure that
   predates this work recorded rather than fixed here.

The packages build on the working tree as it is, including the upload work of
2026-11-14 that is uncommitted today. On 2026-11-15 that work touches, among
others: the cloud-contracts policy, chat attachment, client, `me`, resumable
upload and upload contract files and their tests; `apps/web/app/api/files/uploads/`;
`apps/web/app/api/me/route.ts`; `chat-attachment-hydration.ts`,
`model-image.ts`, `request-processor.ts`, `tool-loop.ts` and
`apps/web/app/api/llm/v1/chat/completions/route.ts`;
`apps/web/app/api/user/export/route.ts`; `apps/web/lib/chat-attachment-policy.ts`,
`attachment-allowance.ts`, `chat-attachment-completion.ts`,
`upload-transport.ts`; `use-attachments.ts`, `composer-attachment-limits.ts`,
`web-auth-store.ts`; the mobile `services/api.ts`, `lib/v1FeatureFlags.ts`,
`src/features/chat/upload/` and `attachmentValidation.ts`; `pnpm-lock.yaml`
and `audit/registers/known-flaws.md`. A package that edits one of these edits
the file as it stands in the tree.

## Records

Filled in by the person running the build; nothing here is a commit.

- G0 item 1 confirmed (date, by whom): not yet.
- G0 item 2 commands and results (date): not yet.
- Mobile 0.0.1 binary: the EAS build id, the date, and the state of the tree
  it was built from (a commit if the owner made one, otherwise the list of
  packages present in the tree): not yet. `P17` does not start until this line
  is filled.
- Wave closes (date, generated indexes regenerated, chain result): not
  recorded for any wave. Waves 1 to 6 are built in the working tree; no wave
  close is recorded as running the guard chain or `pnpm typecheck:all`, and
  nothing is committed (checked on 2026-11-15).

## Wave 1

### P1 Hydration decides from stored size (the rollback floor)

Status: built, uncommitted. Size S. Depends on: G0.

Files:

- `apps/web/app/api/llm/v1/chat/completions/lib/chat-attachment-hydration.ts`
- `apps/web/app/api/llm/v1/chat/completions/lib/chat-attachment-hydration.test.ts`

Delivers:

- Two phases: look up every slot's row with no bytes, apply the count and the
  inline message budget by `byte_size` in today's order, then read only
  admitted files with `readStoredMedia(pathname, inlinePerFileLimit)`. A null
  `byte_size` is read with the bound and charged its real size;
  `StoredObjectTooLargeError` counts as over budget.
- A file found unreadable after admission (the `unreadable` outcomes at about
  lines 292 to 296: no object, or a length other than `byte_size`) gives its
  charge back, and the files after it that were held over budget are charged
  again in order and read if they now fit, because today an unreadable file
  is never charged (the charge at about lines 414 to 425 follows the read).
  This keeps `spec.md`'s "Outcomes are unchanged" true.
- An exported `OversizeAttachmentResolver` type with the signature in
  `spec.md` (Hydration decides before it reads): async; input `{slot, asset,
turn: 'live' | 'history', reason}`; output `refuse`, `note` or `parts`.
  `AttachmentSlot`, `ResolvedMediaAsset` and `AttachmentReferencePart` are
  exported under their current names. `hydrateChatAttachments` takes the
  resolver as an optional trailing option. The default resolver, exported as
  `defaultOversizeAttachmentResolver`, gives today's outcomes: 413
  `attachment_context_too_large` for the current turn, the `over_budget` note
  for history; `P15` hands files back to it.
- `request-processor.ts` and `apps/web/lib/server/free-quota-turn.ts`, the two
  callers, are not touched; both get the default resolver. `P15` later passes
  the prepared resolver from `request-processor.ts`; no later package edits
  `chat-attachment-hydration.ts`.

Tested locally (vitest in `apps/web` through its package script):

- the existing hydration cases unchanged;
- a storage spy proves no read of an asset whose `byte_size` is over the
  inline limit, in the current turn and in history;
- twenty history files over the budget are not read;
- a null `byte_size` object over the bound degrades without holding it;
- "an admitted file found unreadable gives its charge back, so a later file
  that fits without it is sent as today", for a missing object and for a
  size mismatch, in the current turn and in history;
- an injected resolver receives `{slot, asset, turn, reason}` for each
  oversize file and its `refuse`, `note` and `parts` answers are applied.

### P2 Schema 0422, the schema helper and chat-file erasure

Status: built, uncommitted; 0422 not applied anywhere but local throwaway
databases (`appliedThrough` 421). It also holds
`listScannedChatFileAssets` in `media-assets.ts`, the reader that keeps the
scan-hash check. Size M. Depends on: G0.

Files:

- `apps/web/db/neon/0422_chat_file_intakes.sql` (new; 0421 is the highest
  today, recheck before merging and before applying)
- `apps/web/db/neon/down/0422_chat_file_intakes.down.sql` (new)
- `apps/web/db/neon/chat-file-intakes-migration.test.ts` (new)
- `apps/web/db/neon/chat-file-intakes-migration.live.test.ts` (new)
- `apps/web/lib/server/chat-file-intake/schema.ts` (new)
- `apps/web/lib/server/chat-file-intake/erasure.ts` (new)
- `apps/web/lib/server/chat-file-intake/__tests__/schema.test.ts` (new)
- `apps/web/lib/server/chat-file-intake/__tests__/erasure.test.ts` (new)
- `apps/web/lib/server/chat-file-intake/__tests__/schema-absent-db.ts` (new;
  the shared test instrument other packages' tests import)
- `apps/web/lib/server/account-erasure.ts`
- `apps/web/lib/server/account-erasure.test.ts`
- `apps/web/lib/server/organization-erasure.ts`
- `apps/web/lib/server/organization-erasure.test.ts`
- `apps/web/lib/server/workspace-scope/switch-surfaces.ts` (a registry
  entry only; `__tests__/switch-surfaces.test.ts` reads the migrations and
  needs no edit)
- `scripts/lib/db-isolation-tables.mjs`
- `packages/contracts/types/src/concept-registry.json` (two
  `tableDispositions` and two `columnExemptions` entries; below)
- `apps/web/lib/services/deletion-manifest.ts`
- `docs/architecture/RETENTION_MATRIX.md`
- `apps/web/app/api/user/export/route.ts`
- `apps/web/app/api/user/export/__tests__/route.completeness.test.ts`
- `scripts/config/migration-dependency-allowlist.json` (shared exception
  above: one entry for migration 422 per non-test file of this package that
  the guard names, which on this design is at least `schema.ts`,
  `erasure.ts`, `account-erasure.ts`, `organization-erasure.ts`,
  `switch-surfaces.ts`, `deletion-manifest.ts` and `export/route.ts`; the
  guard's own output is the list)

Delivers:

- `chat_file_intakes`: `id` (uuid primary key), `user_id`,
  `organization_id`, `conversation_id` (`on delete set null`),
  `temporary_chat`, `file_name`, `mime_type`, `byte_count`,
  `declared_sha256`, `staging_key` (unique), `multipart_upload_id`,
  `part_bytes`, `state` (check constraint over the states in `spec.md`),
  `refusal_code`, `failure_code`, `cancel_reason`, `attempts`,
  `first_submitted_at`, `scan_budget_wait_ms` (integer not null default 0;
  the `source_budget` wait that does not count toward `scanGiveUpMs`,
  `spec.md` Web side of the scan), `sealing_entered_at`, `scan_job_id`,
  `workflow_run_id`, `etag`,
  `media_asset_id` (`on delete set null`), `daily_bytes_charged`,
  `bytes_refunded_at`, `lease_until`, `last_part_request_at`,
  `state_changed_at`, `objects_purged_at`, `created_at` and `updated_at`
  (both `timestamptz not null default now()`). Indexes on `(user_id, state)`,
  `(organization_id)` and `(state, state_changed_at)`. No `deleted_at`.
- `chat_file_preparations`: `id` (uuid primary key), `media_asset_id`
  (unique, `on delete set null`), `user_id`, `organization_id`, `kind`,
  `state`, `preparer_version`, `cursor` jsonb, `segments_ready`,
  `pages_read`, `page_count`, `sheet_count`, `token_estimate`,
  `indexed_chars`, `derived_keys` text array, `coverage` jsonb, `error`,
  `created_at`, `updated_at`.
- `media_assets.scanned_sha256` (nullable text).
- The insert-only trigger from `spec.md` (What keeps unscanned bytes unusable,
  item 4), with the inline limit 26214400 written in the SQL.
- Forced RLS on both tables with the tenant-scoped owner policy
  `app_row_is_visible(user_id, organization_id)`, and every privilege `app_rls`
  ends up with named in the migration, as `check:migration-table-privileges`
  requires.
- `chatFileSchemaReady(db, {cached})` in `schema.ts`: `to_regclass` for both
  tables and `information_schema.columns` for `scanned_sha256`; true only when
  all three exist; the per-instance cache (5 minutes true, 60 s false) only
  when `cached` is set.
- `eraseChatFiles(db, scope)` in `erasure.ts`, the routine in `spec.md`
  (Lifecycle, account and organisation erasure), for a user or an
  organisation, always uncached; the sealed key is deleted for a row whose
  `sealing_entered_at` is set and that is not `sealed`.
- The export (`spec.md`, Lifecycle, Export): an `ADDITIONAL_EXPORT_SECTIONS`
  entry `chat_file_intakes` whose `sql:` selects name, type, size, state and
  dates `from chat_file_intakes where user_id = $1`, with `acrossWorkspaces:
true` (the table's policy is the tenant-scoped form below, which a
  personal-scope connection reads only for rows without an organisation;
  `route.ts` explains this above `queryExportRowsAcrossWorkspaces`), and the
  new optional field
  `requiresChatFileSchema: true` on that list's type; the section loop skips
  such an entry when `chatFileSchemaReady(db)` (uncached) answers false.
  `chat_file_preparations` in `UNEXPORTED_USER_TABLES` with its reason.
- The retention matrix: `chat_file_intakes` in `OPERATIONAL_RECORD`,
  `chat_file_preparations` in `DERIVED_CONTENT`, and a `NON_TABLE_STORES`
  entry "chat file staging and derived objects" (object store, customer
  content, erased with subject and tenant, deletion path
  `lib/server/chat-file-intake/erasure.ts eraseChatFiles`), with the rows
  `renderRetentionMatrixMarkdown` renders copied into
  `docs/architecture/RETENTION_MATRIX.md`.
- `USER_SCOPED_TABLES` and `ORGANIZATION_SCOPED_TABLES` entries for both
  tables; both erasures take the two tables' results from `eraseChatFiles`,
  the way organisation erasure already takes `media_assets` from
  `eraseOrganizationMedia`; the switch registry entry for `chat_file_intakes`;
  the isolation table list.
- The concept registry. Adding both tables to `USER_OWNED_TABLES` makes
  `scripts/check-concept-registry.mjs` require, for each, an owning concept
  or a `tableDispositions` entry (about lines 1000 to 1006), and, because
  both are created after migration 239, the contract columns of
  `missingContractColumns` (owner, created and updated times, `created_by`,
  `server_version`; about lines 485 to 488 and 596 to 620). Entries:
  - `tableDispositions`: `chat_file_intakes`, disposition `operational`, why
    "the system record of one chat file's upload, scan and seal; the file
    itself is the media asset it produces"; `chat_file_preparations`,
    disposition `operational`, why "derived text and progress for a sealed
    chat file, rebuildable from the file";
  - `columnExemptions`: both tables with `exempt: ["createdBy", "version"]`,
    why "written only by the server for the uploading account, so its
    creator is always its owner, and no client edits it under an If-Match
    precondition; every change is a server compare-and-set on its state"
    (intakes) and "written only by the preparation steps for the file's
    owner; no client edits it" (preparations). Both tables have `user_id`,
    `created_at` and `updated_at`, so nothing else is exempted, and
    `deleted_at` is not a required role.
- `schema-absent-db.ts`: a database adapter that answers the `to_regclass`
  and `information_schema.columns` probes with "absent" and throws on any
  other SQL that names `chat_file_` or `scanned_sha256`; otherwise it
  delegates to the adapter a test gives it.

Tested locally:

- the live test (local Postgres required; `plan.md`): the trigger passes a
  26214400-byte chat row without `scanned_sha256`, refuses a 26214401-byte
  one, passes it with matching hashes; a soft delete and a conversation delete
  of a legacy row pass; RLS as `app_rls` denies another user's rows in both
  tables; an invalid state is refused. Its output goes in the pull request;
- the text test: the SQL's limit equals the policy's `maxBytes`;
- `schema.test.ts`: true, false for each missing piece, and the cache only
  when asked;
- `erasure.test.ts` with the memory store: a user, and an organisation, with
  intakes in every state and a preparation leave no row and no staging,
  sealed or derived object; an object delete that fails keeps the rows and
  reports `retainedForRetry`;
- `account-erasure.test.ts` and `organization-erasure.test.ts`: the inventory
  cases pass with both tables registered; with the schema-absent database
  erasure completes and reports both tables deleted; "an organisation with an
  uploaded intake leaves no object";
- unchanged and green: `apps/web/app/api/user/export/__tests__/export-matches-erasure-inventory.test.ts`
  (both tables read or withheld), `export-covers-personal-data.test.ts` (the
  new section scoped to the user and selecting no credential column) and
  `apps/web/lib/services/__tests__/deletion-manifest.test.ts` ("classifies
  every one of them" and the published matrix equal to the rendered one);
- `route.completeness.test.ts` gains: "with the chat file schema absent the
  export is complete and has no chat_file_intakes section" and "with the
  schema present the intake rows are exported";
- guards: `check:rls-boundary`, `check:db-isolation`, `check:concept-registry`
  (with the four entries above), `check:migration-table-privileges`, `check:resource-metadata` (both tables
  have `created_at` and `updated_at`, so
  `packages/contracts/types/src/resource-metadata-contract.json` is not
  changed), `check:time-semantics` (if it flags a column, the column is
  changed, not the contract), `check:legal-hold-coverage` with its baseline
  left empty, `check:neon-migrations`, `check:migration-dependencies` with
  this package's entries and no stale one, the checksum chain and
  `pnpm db:migrate -- status` against the local database.

### P4 Plan fields in the billing catalog

Status: built, uncommitted. Size S. Depends on: G0.

Files:

- `packages/contracts/types/src/billing-catalog.ts`
- `packages/contracts/types/src/__tests__/billing-catalog.test.ts`

Delivers: `maxChatFileBytes`, `dailyChatFileUploadBytes` and
`maxConcurrentChatFileIntakes` on every tier with the built values in
`spec.md`, getters for each, and `MAX_PLAN_CHAT_FILE_BYTES`. Existing fields
untouched.

Tested locally: every tier defines every field; Free, BYOK and Local equal the
inline limit with zero budget and intakes; no paid tier is below Free;
`maxAttachmentBytes` pinned unchanged.

### P5 Storage port: download content type and long-deadline copy

Status: partly built, uncommitted.
`packages/platform/object-storage/src/__tests__/s3-adapter.test.ts` still
imports `@aws-sdk/client-s3` directly, which `check:boundaries` refuses (wave
6 review; not re-run here). Size S. Depends on: G0.

Files:

- `packages/platform/object-storage/src/types.ts`
- `packages/platform/object-storage/src/presign.ts`
- `packages/platform/object-storage/src/adapters/s3.ts`
- `packages/platform/object-storage/src/adapters/memory.ts`
- `packages/platform/object-storage/src/__tests__/presign.test.ts`
- `packages/platform/object-storage/src/__tests__/s3-adapter.test.ts`
- `packages/platform/object-storage/src/__tests__/memory-adapter.test.ts`
- `packages/platform/object-storage/src/retry.ts`,
  `packages/platform/object-storage/src/index.ts` and
  `packages/platform/object-storage/src/__tests__/retry.test.ts` (changed for
  the bounded read retry, beyond the list as first written)
- `apps/web/lib/server/object-storage.ts`
- `apps/web/lib/server/object-storage-timeouts.ts`
- `apps/web/lib/server/__tests__/object-storage.test.ts`
- `apps/web/lib/server/object-storage-bounded-read.test.ts` (changed, beyond
  the list as first written)

Delivers:

- `PresignGetInput.contentType`, signed as `ResponseContentType`;
  `getPresignedPrivateDownloadUrl` passes it.
- A long-deadline store for the seal's copy (`copyPrivateObjectIfUnchanged`
  with a `timeoutMs`, built on a client whose request timeout is the
  size-scaled deadline, without the retrying wrapper) and the deadline
  constants in `object-storage-timeouts.ts`.
- New exports are reached from existing importers of `object-storage.ts`, so
  no new module is added under `apps/web`.

Tested locally: the signed URL carries the content type (fake S3 endpoint);
the memory adapter records it; the long-deadline copy is not cut at 10 s by a
delaying fake endpoint; existing callers unchanged.

### P6 Shared contract

Status: built, uncommitted. Size M. Depends on: G0.

Files:

- `packages/contracts/cloud-contracts/src/chat-attachment-policy.json`
- `packages/contracts/cloud-contracts/src/chat-attachments.ts`
- `packages/contracts/cloud-contracts/src/chat-file-intake.ts` (new)
- `packages/contracts/cloud-contracts/src/resumable-uploads.ts`
- `packages/contracts/cloud-contracts/src/upload-contract.json`
- `packages/contracts/cloud-contracts/src/header-names.ts`
- `packages/contracts/cloud-contracts/src/client-handshake.ts`
- `packages/contracts/cloud-contracts/src/me.ts`
- `packages/contracts/cloud-contracts/src/index.ts`
- `apps/web/lib/chat-attachment-policy.ts`
- `packages/contracts/cloud-contracts/src/__tests__/chat-attachment-limits.test.ts`
- `packages/contracts/cloud-contracts/src/__tests__/chat-file-intake.test.ts` (new)
- `packages/contracts/cloud-contracts/src/__tests__/resumable-uploads.test.ts` (new)
- `packages/contracts/cloud-contracts/src/__tests__/client-handshake.test.ts`
- `packages/contracts/cloud-contracts/src/__tests__/header-names.test.ts`
- `packages/contracts/cloud-contracts/src/__tests__/me.test.ts`

Delivers, all as **new names**; no existing export changes value or type:

- Policy blocks `largeFiles`, `kinds`, `preparation`, `turnBudget`, `intake`
  with the built values (including `kinds.pdf.rangeLoading` true,
  `preparation.stallMs` 7200000, `intake.scanUnavailableRefundsPerDay` 3,
  `intake.budgetWaitMaxMs` 7200000 and `intake.leaseMs` `{uploaded 300000,
inspecting 300000, scanningExtra 300000, sealing 900000}`), exported as
  `CHAT_LARGE_FILE_POLICY`; `maxBytes`,
  `maxMessageBytes`, `maxImageBytes` and `maxCount` unchanged. Upload contract
  `largeFilePartBytes`, `largeFileThresholdBytes`, `partConcurrencyWeb`,
  `partConcurrencyMobile`.
- In `resumable-uploads.ts`: `CHAT_LARGE_FILE_UPLOAD_KIND`
  (`'chat-large-file'`), `CHAT_LARGE_FILE_MAX_BYTES` (`largeFiles.maxBytes`),
  `ManagedCloudChatLargeFileCreateRequestSchema` (the fields of the
  `chat-attachment` create plus optional `conversationId` and `temporary`,
  validated as on complete) and `ManagedCloudChatLargeFileCompleteResponseSchema`
  (`{kind:'chat-attachment-intake', intake}`). `RESUMABLE_UPLOAD_KINDS`,
  `RESUMABLE_UPLOAD_MAX_BYTES`, the create union and the complete-response
  union are unchanged, so `apps/web/app/api/files/uploads/route.ts`,
  `apps/web/lib/server/upload-keys.ts`, `attachment-allowance.ts` and
  `services/upload-scanner/__tests__/limits.test.ts` keep compiling and
  passing unchanged.
- In `chat-file-intake.ts`: intake states, client states and the mapping;
  the status schema; path helpers for `/api/files/intakes/:id`; the refusal,
  failure and cancel codes, `storage_full` included.
- `CLIENT_CAPABILITIES_REQUEST_HEADER` and the token `large-chat-files-v1`;
  `clientHandshakeHeaders` takes an optional `capabilities` list and sends the
  header only when given one; `hasClientCapability(headerValue, token)` in
  `client-handshake.ts` is the one parser of that header, used by `P13`'s
  download route and `P14`'s `/api/me`. `API_CONTRACT_VERSION` unchanged.
- Optional wire fields `large_files_available`, `storage_remaining_bytes` and
  `inline_message_bytes`; optional `largeFilesAvailable`,
  `storageRemainingBytes` and `inlineMessageBytes` on `ChatAttachmentLimits`.

Tested locally (cloud-contracts vitest through `light-job.sh`): inline values
and every existing export pinned unchanged; every kind cap at most
`largeFiles.maxBytes`; a payload from an old server parses to today's limits;
`clientHandshakeHeaders` without capabilities returns exactly today's headers;
`hasClientCapability` finds the token in a comma list with spaces and refuses
a missing header, an empty value and a token that only contains it as a
prefix;
a `chat-attachment` complete response still parses with the existing union;
the large create accepts `conversationId` and `temporary` and refuses a
`byteCount` over `CHAT_LARGE_FILE_MAX_BYTES`; `intake.leaseMs.sealing` is
above 800,000 ms (one step function's maximum).

### P19 Backups never read a large chat file

Status: built, uncommitted. Size S. Depends on: G0. Wave 1 because it must be in the
first web deploy (deployment step 5), before any large file exists; the
chosen fix needs no new storage port, so it does not wait for `P5` (the
assessor's alternative, a streamed copy, would; Owner decisions, L).

Files:

- `apps/web/lib/server/object-backup.ts`
- `apps/web/lib/server/__tests__/object-backup.test.ts`
- `apps/web/app/api/cron/replicate-object-backups/route.ts`
- `apps/web/app/api/cron/replicate-object-backups/route.test.ts`

Delivers (`spec.md`, Lifecycle, Backups):

- `replicateObject` answers `{outcome: 'too-large'}` after the HEAD and before
  any `get`, for a key under `chat-attachments/` whose `contentLength` is
  above the inline per-file limit (`MAX_CHAT_ATTACHMENT_BYTES` from the
  cloud-contracts policy). Every other key keeps today's
  `OBJECT_BACKUP_MAX_BYTES` rule.
- The cron route (`route.ts`, lines 169 to 198: the cursor variable is set
  before each row's copy at line 181 and written after the loop at line 197)
  sets the cursor only after a row completes (its copy and replica record
  finished, or it was counted `unreadable`). On a throw from `replicateObject`
  or `recordBackupReplica` for a row, it stops that source's loop, writes the
  cursor at the last row that completed, never at or past the row that threw
  (no row completed: the stored cursor is left as it was), counts the throw in
  a new `failed` field of the response and the log, and goes on to the next
  source, so the next run retries the row that threw and the
  project-knowledge source runs after a media failure. The response status is
  500 when `failed` is above zero, as for a failed reconcile. A query failure
  still answers today's 500 without leaking detail. With no throw, the
  statements, the cursor written and the response are today's, plus
  `failed: 0`.

Tested locally (web vitest through the package script, the memory store):
"a chat-attachments key above the inline limit is too-large and never read"
(a store spy sees no `get`); "a chat-attachments key at the inline limit is
copied"; "a 200 MiB generated-media key is still copied"; in the route
test, "a throwing object is counted, the cursor stops before it, the next run
retries it, and the knowledge source still runs" (the second row of three
throws: the written media cursor is the first row's, a second run starts from
the second row, and the knowledge source's rows are copied in the first run),
and "a throw on the first row leaves the stored cursor unchanged"; every
existing case unchanged, "answers 500 without leaking
the failure to the scheduler body" included. No file of this package names a
table or column of 0422.

### P20 Rollback floor in the release tooling

Status: built, uncommitted; `scripts/config/rollback-floor.json` holds
`{"web": null}` until deployment step 5. Size S. Depends on: G0.

Files:

- `scripts/release/rollback.mjs`
- `scripts/release/rollback.test.mjs`
- `scripts/config/rollback-floor.json` (new; `{"web": null}` until
  deployment step 5 writes `{"web": {"deploymentId", "createdAt",
"reason"}}`)
- `docs/runbooks/release-rollback.md` (one paragraph: what the floor is and
  that it is written at the deploy that first carries a stored-size check)

Delivers: `chooseRollbackTarget` (about line 102) takes the floor and
refuses a requested target whose `createdAt` is older than the floor's, and
in automatic choice skips such deployments and refuses when none is left,
with a message naming the floor deployment and its reason; `runRollback`
reads the floor from the file. With `web` null the choice is exactly today's.
A dry run and `--drill` report the floor.

Tested locally: `node --test scripts/release/rollback.test.mjs`: "refuses a
requested target older than the floor", "automatic choice skips deployments
older than the floor and refuses when none is left", "with no floor
recorded the choice is today's"; every existing case unchanged;
`check:runbook-commands` and `check:script-tests` on their own.

## Wave 2

### P3 Scanner protocol 2

Status: built, uncommitted; not deployed to Fly. Size L. Depends on: P6 (the new limits test reads
`CHAT_LARGE_FILE_MAX_BYTES`).

Files:

- `services/upload-scanner/src/server.ts`
- `services/upload-scanner/src/source-scan.ts` (new)
- `services/upload-scanner/src/source-fetch.ts` (new)
- `services/upload-scanner/src/scan-queue.ts` (new)
- `services/upload-scanner/src/clamd.ts`
- `services/upload-scanner/src/daemons.ts`
- `services/upload-scanner/src/config.ts`
- `services/upload-scanner/src/index.ts`
- `services/upload-scanner/clamav/clamd.conf` (left unchanged: with protocol
  2 on, `src/index.ts` writes the settings held in `src/config.ts` to
  `/var/tmp/upload-scanner/clamd.conf` through `writeSourceScanClamdConfig`
  (`src/daemons.ts`) instead)
- `services/upload-scanner/Dockerfile`
- `services/upload-scanner/.env.example`
- `services/upload-scanner/README.md`
- `services/upload-scanner/__tests__/clamd-config.test.ts`
- `services/upload-scanner/__tests__/config.test.ts`
- `services/upload-scanner/__tests__/watchdog.test.ts`
- `services/upload-scanner/__tests__/daemons.test.ts`
- `services/upload-scanner/__tests__/fake-clamd.ts` (gains two optional
  behaviours: `replyAfterMs`, a delay before the INSTREAM reply, and
  `versionReply: 'hang'`, never answering VERSION; with neither set it
  behaves exactly as today, so `server.test.ts`, which imports it, stays
  green unedited)
- `services/upload-scanner/__tests__/fake-source.ts` (new)
- `services/upload-scanner/__tests__/fixtures/protocol-2.json` (new)
- `services/upload-scanner/__tests__/source-scan.test.ts` (new)
- `services/upload-scanner/__tests__/source-scan-limits.test.ts` (new)
- `services/upload-scanner/__tests__/scan-queue.test.ts` (new)
- `services/upload-scanner/__tests__/server-v2.test.ts` (new)
- `docs/security/upload-scanning.md`

Delivers: `/v2/scans`, `/v2/scans/:id`, `/v2/capability`; the fetch rules,
including `incomplete: source_unavailable` for a failed fetch and
`incomplete: source_changed` for a `412`; the one stream pass; admission with
`SCAN_SOURCE_CONCURRENCY` 1 and a FIFO queue with `429`; the hourly source
budget `SCAN_SOURCE_BYTES_PER_HOUR` (built 2147483648) read in `config.ts`
and enforced in `scan-queue.ts` over a rolling 60-minute window of admitted
`byteCount`, scaled by `min(1, uptime / 60 min)` so that after a restart the
allowance starts at zero and returns linearly over the first hour, a repeated
`jobId` not charged again, `429` with `Retry-After` when spent or not yet
ramped; liveness by the live-source-scan rule of `spec.md` (Liveness): a
source scan is live from the first byte written to clamd's socket until
clamd's reply, the socket closing or the per-scan deadline, and while one is
live `health()` and `watchClamd` count the EICAR half alive and use the last
good signature status; after a deadline with no reply the exemption is
withheld until a probe succeeds; the health deadline, health cache and
watchdog interval and limit become options of `createScannerServer` and
`watchClamd` (`watchClamd` already takes the last two) so tests can scale
them; the source fetch as a `fetchSource` option of `createScannerServer`
(`ScannerOptions`, `server.ts` lines 27 to 33, beside `probe` and `now`),
defaulting to the global `fetch`, with the URL rules applied before it is
called; logs that carry the job id, source host, bytes and outcome and never
`sourceUrl`, its path or query, or a fetch error's message text;
verdict reasons; the size-scaled
deadline giving `incomplete: deadline`, carried as `deadlineMs` in the `202`
answer and in every poll answer but `unknown`; the `429` body
`{reason: 'queue_full' | 'source_budget'}`; the clamd settings table;
`/var/tmp/clamd` created in the Dockerfile; the new variables in
`.env.example`; `fixtures/protocol-2.json` holding one example of every
request and answer shape, `deadlineMs` in the `202` and poll answers and both
`429` reasons included, which `server-v2.test.ts` asserts the server
produces. Legacy `POST /scan`, `MAX_SCAN_BYTES`, `server.test.ts` and
`limits.test.ts` are unchanged. `fly.toml` is not changed.

Tested locally (scanner vitest, fake clamd, and the fake source reached
through an injected `fetchSource`): clean, EICAR, early reply; SHA-256 equals
the bytes; size mismatch; redirect, disallowed host and IP literal refused
before any fetch (the injected `fetchSource` is never called); the `202` and
each poll answer carry the `deadlineMs` the formula gives for the job's
`byteCount`; a full queue answers `429 queue_full` and a spent budget
`429 source_budget`; an expired URL and a `412` give their
`incomplete` reasons; a full queue answers `429`; a repeated `jobId` returns
the same scan; deadline gives `incomplete: deadline`; restart gives `unknown`;
authorization required; a held v2 scan does not slow 20 legacy scans;
`server-v2.test.ts` with scaled times (per-scan deadline 9 s, held reply
6 s, health deadline 300 ms, watchdog interval 200 ms and limit 2 s): "fake
clamd accepts the whole stream and holds the reply past the watchdog limit
while the EICAR probe and VERSION hang: /health 200 throughout and no
watchdog exit", "the same scan reaching its deadline with no reply: the next
/health is 503 and the watchdog fires after its limit, as today", "a source
scan started after such a deadline gets no exemption until a probe
succeeds", and "no log line contains the source URL, its path or its
query" (a capturing logger, a source URL with a marker query, and a fetch
that fails with an error whose message contains the URL);
`scan-queue.test.ts` with a fake clock: "a job submitted at uptime 0 gets
429 with Retry-After; half the budget is available at 30 minutes", a job
past the hourly budget gets `429` and a `Retry-After` of the seconds until
the window frees enough, at least 60, a repeated `jobId` is not charged, and
the window rolls; `server-v2.test.ts` "a signature read that
times out during a source scan uses the last good value" and "outside a
source scan a failed signature read answers 503 as today"; these use a fake
clamd that uses no CPU, so they prove admission and liveness only, and CPU is
proved by `plan.md` step 4; clamd-config pins every value;
`source-scan-limits.test.ts`: the default `MAX_SOURCE_SCAN_BYTES` is at least
`CHAT_LARGE_FILE_MAX_BYTES`; `server.test.ts` and `limits.test.ts` green and
unedited; `check:env-contract`.

### P7 Head inspection and hash denylist

Status: partly built, uncommitted. `apps/web/lib/security/upload-scan.test.ts`
line 768 writes the em dash as a Unicode escape in a string literal, which fails
`check:em-dash-in-copy` (exit 1 on 2026-11-15). Size S. Depends on: P6.

Files:

- `apps/web/lib/security/upload-scan.ts`
- `apps/web/lib/security/upload-scan.test.ts`
- `apps/web/lib/moderation/__tests__/hash-denylist.test.ts`

Delivers: `inspectUploadHead`; a test for `matchDenylistedSha256`, which is
already present and exported in the working tree
(`apps/web/lib/moderation/hash-denylist.ts`, line 65), so that file is not
changed; the refusal copy for
`limits_exceeded`, `scan_unavailable`, `storage_full` and
`changed_during_check` in `uploadRefusalMessage`. `scanUploadBytes`
behaviour unchanged. Both files are already reachable, so the new exports add
no module. The scanner client moved to `P12`, so that it merges with its
first importer.

Tested locally: `inspectUploadHead` gives the same findings as
`inspectUploadBytes` on the same prefixes; `matchDenylistedSha256` agrees
with `matchDenylistedUpload`; the copy for each new code; the
upload-inspection guard's required patterns still match.

### P8 Preparation by kind

Status: built, uncommitted. The stated-maximum test is written but has not
run (`plan.md`, step 2). Size L. Depends on: P2, P5, P6.

Files:

- `apps/web/lib/server/chat-file-preparation/index.ts` (new)
- `apps/web/lib/server/chat-file-preparation/progress-store.ts` (new)
- `apps/web/lib/server/chat-file-preparation/derived-keys.ts` (new)
- `apps/web/lib/server/chat-file-preparation/readers.ts` (new)
- `apps/web/lib/server/chat-file-preparation/pdf.ts` (new)
- `apps/web/lib/server/chat-file-preparation/pdf-range-source.ts` (new)
- `apps/web/lib/server/chat-file-preparation/office.ts` (new)
- `apps/web/lib/server/chat-file-preparation/spreadsheet.ts` (new)
- `apps/web/lib/server/chat-file-preparation/delimited.ts` (new)
- `apps/web/lib/server/chat-file-preparation/text-stream.ts` (new)
- `apps/web/lib/server/chat-file-preparation/__tests__/pdf.test.ts` (new)
- `apps/web/lib/server/chat-file-preparation/__tests__/office.test.ts` (new)
- `apps/web/lib/server/chat-file-preparation/__tests__/spreadsheet.test.ts` (new)
- `apps/web/lib/server/chat-file-preparation/__tests__/delimited.test.ts` (new)
- `apps/web/lib/server/chat-file-preparation/__tests__/text-stream.test.ts` (new)
- `apps/web/lib/server/chat-file-preparation/__tests__/progress-store.test.ts` (new)
- `apps/web/lib/server/pdf-attachment-content.ts`
- `apps/web/lib/server/pdf-attachment-content.test.ts`
- `apps/web/lib/server/office-document-text.ts`
- `apps/web/lib/server/office-document-text.test.ts`
- `scripts/config/surface-reachability-allowlist.json` (adds one
  `web.intentional` entry; a stated exception to single ownership, below)
- `scripts/config/migration-dependency-allowlist.json` (shared exception in
  the rules: one entry for migration 422 per file of this package the guard
  names, at least `progress-store.ts` and `readers.ts`)

Delivers: `prepareChatFileStep(assetId)` advancing one bounded batch per call
with progress in `chat_file_preparations`; deterministic derived keys appended
to `derived_keys`; readers `readPreparedCard`,
`readPreparedText(assetId, {startChar, maxChars})` and
`readPreparedPage(assetId, page)` that trust only `segments_ready` and answer
"no preparation" when there is no row; `savePreparedPageText` for OCR
results; `sumIndexedCharsForUser(userId)` for `P11`'s per-user cap, so `P11`
names no new table; every cursor compare-and-set sets `updated_at = now()`
(the sweeper's stall rule reads it); the PDF path chosen by
`kinds.pdf.rangeLoading` (range loading when true; the buffered path up to
`bufferedMaxBytes`, else `prepare_failed`, when false); the kind rules in
`spec.md`. Every SQL statement naming `chat_file_preparations` is in
`progress-store.ts` or `readers.ts`. The page caps of
`pdf-attachment-content.ts` and `MAX_SLIDES` and `MAX_SHEET_ROWS` become
parameters with today's defaults, so project knowledge is unchanged.

The reachability exception: `check:surface-reachability` fails a module under
`apps/web/lib` with no import path from a route, and these modules have no
importer until `P11` (the readers, wave 3) and `P12` (`prepareChatFileStep`,
wave 4). `P8` adds a `web.intentional` entry with `pathPrefix`
`apps/web/lib/server/chat-file-preparation/` and the reason "Chat file
preparation merges before the intake workflow that imports it; removed by the
intake engine package". `P12` removes it in the pull request that adds the
importer. The two packages are in different waves, so they never write the
file at the same time. The alternative, merging `P8`, `P11` and `P12` as one
train, was rejected because it would make one pull request of about sixty
files.

Tested locally (memory store): a range-loaded PDF gives the buffer path's text
while fetching fewer bytes; 1,200 pages give `ready_partial` 1 to 1,000; a
malformed PDF gives `prepare_failed`; with `rangeLoading` false a 300 MiB PDF
gives `prepare_failed` without a full read and a 150 MiB PDF is read buffered;
each cursor advance moves `updated_at`; a high-ratio DOCX is refused before
inflation; a PPTX whose media exceed the budget but text does not is read; an
XLSX whose sheets exceed the budget profiles the first sheets and reports the
rest; a retried CSV step resumes at its cursor; invalid UTF-8 is refused; a
retried half-written step gives the same keys; one test per kind at its stated
maximum, generated at test time from a seeded generator and run on its own;
the project-knowledge and `pdf-attachment-content` suites stay green;
`check:surface-reachability` passes with the entry;
`check:migration-dependencies` passes with this package's entries.

### P9 Sandbox staging from storage

Status: built, uncommitted. Size S. Depends on: P6.

Files:

- `apps/web/lib/e2b/attachment-staging.ts`
- `apps/web/lib/e2b/session-store.ts`
- `apps/web/lib/e2b/types.ts`
- `apps/web/lib/e2b/runtime.ts`
- `apps/web/lib/e2b/__tests__/attachment-staging.test.ts`
- `apps/web/lib/e2b/__tests__/write-file-stream.test.ts` (new)

Delivers: `StorageTurnFile`; `stageStorageFiles(executor, files, options)`
streaming `getPrivateObjectStream` into the new optional
`E2BExecutor.writeFileStream`, implemented in `runtime.ts` with
`sandbox.files.write(path, ReadableStream)`; `TemplateError` reported as not
staged; the per-sandbox total `largeFiles.sandboxStagedBytesMax`, remembered
in the session store. `TurnAttachment` and `stageTurnAttachments` unchanged.
All new code is in already-reachable files.

Tested locally: a memory executor receives exactly the streamed bytes; a
second turn does not restage; the per-sandbox total is enforced; a
`TemplateError` and a stream error report not staged; inline staging
unchanged.

### P10 Shared upload client

Status: built, uncommitted. Size M. Depends on: P6.

Files:

- `packages/contracts/cloud-contracts/src/managed-cloud-resumable-upload-client.ts`
- `packages/contracts/cloud-contracts/src/managed-cloud-chat-attachments-client.ts`
- `packages/contracts/cloud-contracts/src/file-digest.ts`
- `packages/contracts/cloud-contracts/src/__tests__/managed-cloud-resumable-upload-client.test.ts`
- `packages/contracts/cloud-contracts/src/__tests__/managed-cloud-chat-attachments-client.test.ts`
- `packages/contracts/cloud-contracts/src/__tests__/file-digest.test.ts` (new)

Delivers: a `largeFiles` option; with it, a file over the inline limit is
checked against its compiled kind cap, hashed in 8 MiB slices with an
incremental SHA-256 the caller supplies (`createSha256`), refusing a large
file before any request when none is supplied (the package takes no new
dependency, since `check-cloud-contract-ownership` allows it only its
existing ones), created as `chat-large-file` through the large create schema
(with `conversationId` and `temporary` when the caller has them), sent with
the part concurrency from the upload contract, and on `202` polled through
the intake status route (2 s to 10 s, only while visible, reporting
`verifying`) until it resolves to the attachment or the server's refusal
copy. Without the option, behaviour is exactly today's. Resume uses the
existing session store and fingerprint.

Limits in `managed-cloud-chat-attachments-client.ts` (about lines 204 to
209, which throw above `MAX_CHAT_ATTACHMENT_COUNT` files and above
`MAX_CHAT_ATTACHMENT_MESSAGE_BYTES` in total): without `largeFiles` those
checks and their messages are unchanged. With it, the count ceiling is
`largeFiles.maxCount`, the total ceiling is `largeFiles.maxMessageBytes`, and
the files at or under the inline per-file limit together must stay within
`MAX_CHAT_ATTACHMENT_MESSAGE_BYTES`, refused with today's message-size copy.
The composer applies the handshake's lower values before this.

Cancel: before the `202`, today's `abort` (session `DELETE`); after it,
`DELETE /api/files/intakes/:id`.

Tested locally: without `largeFiles`, 5 MiB and 30 MiB files give today's
request sequence against fixtures with and without the new fields; resume
after a simulated drop sends only missing parts; cancel aborts and sends
`DELETE`; a `202` polls until sealed, rejected or failed; a hidden page stops
polling; the chunked hash equals WebCrypto's on the same bytes; "cancel
before the 202 sends the session DELETE, after it the intake DELETE"; with
`largeFiles`, 20 files pass and 21 are refused, and three 10 MiB files are
refused with today's message-size copy; run unchanged and green (they test
the callers of this client):
`apps/mobile/src/features/chat/upload/__tests__/partedChatUpload.test.ts`,
`apps/mobile/__tests__/api-upload-parts.test.ts` (mobile Jest, in chunks)
and `apps/web/features/chat/services/chat-attachment-upload.test.ts`.

### P13 Downloads

Status: built, uncommitted. Size S. Depends on: P5, P6 (the capability header name, the
token and `hasClientCapability`).

Files:

- `apps/web/app/api/files/[id]/route.ts`
- `apps/web/app/api/files/[id]/__tests__/route.test.ts`

Delivers: the `302` above `MAX_SERVE_BYTES` with the allowance check and
egress record, octet-stream and attachment disposition, 300 s, owner only,
and only when both hold (`spec.md`, Downloads): the request is a browser
navigation (`Sec-Fetch-Mode: navigate`) or carries `large-chat-files-v1` in
`x-agi-client-capabilities` (read with `P6`'s `hasClientCapability`), and the
asset's `metadata.source` is `'chat-attachment'`, its `byte_size` is above
the inline per-file limit and its `storage_pathname` is a sealed private chat
key (`chat-attachments/` prefix, `.scanned` suffix). Every other request for
such an asset, and every request for any other asset above the limit, keeps
today's 413 (the branch at lines 129 to 131 of the route), so the shipped
mobile app, which reads a download whole into memory, and the web's
fetch-based Library readers never meet a redirect; `preview_too_large` for PDF
preview of such an asset, decided before the request condition. The intake rows in the export
moved to `P2`, because the export completeness test reads
`apps/web/app/api/user/export/route.ts`, not `data-export-archive.ts`. No file
of this package names a table or column of 0422.

Tested locally: the redirect goes only to the owner, is charged, and carries
the content type and disposition; preview above the limit answers 413 with the
copy; files at or under 30 MiB are served as today, whatever the request
headers; each with the flag unset and set: "a navigation to a sealed
chat-attachment asset above the inline limit is redirected", "a request
carrying large-chat-files-v1 is redirected", "a request with neither gets
413, flag on and off" (a fetch with `Sec-Fetch-Mode: cors`, and a native
request with no `Sec-Fetch-Mode` and an `Authorization` header), and "keeps
413 for a 40 MiB generated asset, a public-bucket asset and a local-prefix
asset, even for a navigation".

## Wave 3

### P11 Keyword index and file tools over prepared files

Status: partly built, uncommitted. OCR for scanned pages is not wired: the
tool loop passes `scannedPages: null`, so a page with no text layer answers
that it could not be read (known flaws). Size M. Depends on: P2, P6, P8.

Files:

- `apps/web/lib/services/retrieval-index-service.ts`
- `apps/web/lib/services/retrieval-search-service.ts`
- `apps/web/lib/services/__tests__/retrieval-index-service.test.ts`
- `apps/web/lib/services/__tests__/retrieval-search-service.test.ts`
- `apps/web/lib/server/tools/file-search-tool.ts`
- `apps/web/lib/server/tools/file-search-tool.test.ts`
- `apps/web/lib/server/tools/scanned-page-reader.ts` (new; imported by
  `file-search-tool.ts` in this package)
- `apps/web/lib/server/tools/__tests__/scanned-page-reader.test.ts` (new)

Delivers:

- The `library_file` loader selects `byte_size` with the fields it reads
  today. Only for an asset above the inline limit, and only when
  `chatFileSchemaReady(db, {cached: true})` answers true, it reads prepared
  segments (no preparation row: today's title-only text), up to
  `maxIndexedChars`, with page anchors. Every other asset is indexed exactly
  as today, and no statement on that path names a new table.
- Source and chunk caps per source kind; a keyword-only embedding policy for
  chat files that settles as succeeded and treats an unchanged digest as a
  no-op; the per-user indexed character cap through `P8`'s
  `sumIndexedCharsForUser`; `requestMediaAssetReindex`. No file of this
  package names a table or column of 0422 (`check:migration-dependencies`
  passes with no entry for it).
- `search_files` scoped to this conversation's attachment ids, ranking by
  keyword only for that scope (no query embedding).
- `open_file` reading a prepared offset or page for large assets the caller
  owns in the current conversation, temporary chats included; every other
  file is read as today.
- A `FileReadingBudget` interface the tools charge before returning text.
- `scanned-page-reader.ts`: OCR of pages without a text layer through
  `transcribeScannedPages` in batches of 4, with the per-turn and per-file
  caps, saved through `savePreparedPageText`.

Tested locally: 2,000,000 characters give about 1,670 chunks and nothing past
the cap; no embedding call for a chat file; an unchanged digest is a no-op; the
per-user cap stops indexing; `open_file` returns the slice and flags
truncation; another conversation's or user's asset is refused; a spent budget
returns the budget note; OCR stops at its caps and a refused OCR route answers
that the page could not be read; generated-media `library_file` unchanged;
with the schema-absent database, "a small library_file indexes exactly as
today" and "open_file and search_files read a small file exactly as today".

## Wave 4

### P12 Intake engine: states, scanner client, workflow, seal, sweeper

Status: built, uncommitted. The sweeper is gated on the schema only and runs
with the flag off. Size L (the largest package; it cannot be split without
merging modules that nothing imports). Depends on: P2, P3 (the protocol
fixture), P4, P5, P6, P7, P8, P11 (its reindex request).

Files:

- `apps/web/lib/security/source-scan-client.ts` (new)
- `apps/web/lib/security/__tests__/source-scan-client.test.ts` (new)
- `apps/web/lib/server/media-assets.ts`
- `apps/web/lib/server/__tests__/media-assets.test.ts` (new)
- `apps/web/lib/server/chat-file-intake/store.ts` (new)
- `apps/web/lib/server/chat-file-intake/transitions.ts` (new)
- `apps/web/lib/server/chat-file-intake/steps.ts` (new)
- `apps/web/lib/server/chat-file-intake/seal.ts` (new)
- `apps/web/lib/server/chat-file-intake/quotas.ts` (new; imported by the
  sweeper's refund, so reachable in this package)
- `apps/web/lib/server/chat-file-intake/__tests__/inline-executor.ts` (new)
- `apps/web/lib/server/chat-file-intake/__tests__/fake-scanner.ts` (new)
- `apps/web/lib/server/chat-file-intake/__tests__/transitions.test.ts` (new)
- `apps/web/lib/server/chat-file-intake/__tests__/seal.test.ts` (new)
- `apps/web/lib/server/chat-file-intake/__tests__/quotas.test.ts` (new)
- `apps/web/lib/server/chat-file-intake/__tests__/schema-absent.test.ts` (new)
- `apps/web/lib/workflows/chat-file-intake-workflow.ts` (new)
- `apps/web/lib/workflows/start-chat-file-intake-workflow.ts` (new)
- `apps/web/lib/workflows/steps/chat-file-intake.ts` (new)
- `apps/web/lib/workflows/__tests__/chat-file-intake-workflow.test.ts` (new)
- `apps/web/app/api/cron/sweep-chat-file-intakes/route.ts` (new)
- `apps/web/app/api/cron/sweep-chat-file-intakes/__tests__/route.test.ts` (new)
- `apps/web/app/api/cron/deployable-components.json`
- `apps/web/__tests__/cron-schedule-coverage.test.ts` (adds
  `/api/cron/sweep-chat-file-intakes` to `PRODUCT_CADENCE_CRONS`, the set
  its "keeps every housekeeping schedule daily or less frequent" case reads;
  the reason, by the set's own test: the cadence is a promise to the person,
  because a stuck file check is re-dispatched and an abandoned upload's slot
  is freed within minutes)
- `vercel.json` (one cron entry; takes effect only on a deploy)
- `packages/contracts/types/src/route-authentication.json` (the cron's
  `machine` entry, as every cron route has)
- `scripts/config/rls-boundary-allowlist.json` (only if `check:rls-boundary`
  asks for the cross-user sweeper, as it does for five cron routes)
- `scripts/config/cron-contract.json` (only if `check:cron-contract` asks for
  an entry)
- `scripts/check-upload-inspection-coverage.mjs`
- `scripts/check-upload-inspection-coverage.test.mjs`
- `scripts/config/surface-reachability-allowlist.json` (removes `P8`'s entry)
- `scripts/config/migration-dependency-allowlist.json` (shared exception in
  the rules: one entry for migration 422 per file of this package the guard
  names, at least `media-assets.ts`, `store.ts`, `transitions.ts`, `seal.ts`,
  `quotas.ts` and the sweeper route)

Delivers:

- `source-scan-client.ts`: `submitSourceScan`, `readSourceScan`,
  `readScannerCapability` (1,500 ms timeout, failure means protocol 1), the
  `/v2` URL derived from `UPLOAD_SCAN_WEBHOOK_URL`, the verdict parser, and
  the parsing of `deadlineMs` from the `202` and poll answers and of the
  `429` reason. The poll step sets an attempt's deadline to the latest
  `deadlineMs` plus 60 s and never computes the scanner's formula.
- `store.ts`: every statement naming `chat_file_intakes`, including the ones
  `P14`'s routes call, so `P14` names no new table: `insertIntake`,
  `touchPartRequest` (sets `last_part_request_at`), `markUploaded`,
  `readIntakeStatus`, `cancelIntake` (by intake id),
  `cancelIntakeByStagingKey` (for the session `DELETE`; refunds the declared
  bytes minus the stored ones it is given and frees the slot),
  `countInFlightIntakes` and `sumInFlightIntakeBytes` (the declared
  `byte_count` of the user's non-terminal rows, for create and the effective
  limit).
- Leases: every compare-and-set into a leased state sets `lease_until` from
  `intake.leaseMs` (`spec.md`, Intake states, Leases), and the scan poll,
  the `429` resubmit and the fairness wait renew it on each wake; the
  sweeper re-dispatches only rows whose `lease_until` has passed.
- Re-entry (`spec.md`, Intake states, Re-entry): the inspect, scan and seal
  steps each accept their own state when `workflow_run_id` is the same run
  or `lease_until` has passed, as the seal does, and redo the step from its
  start: inspect again (HEAD, 256,000-byte read, `inspectUploadHead`); for
  `scanning`, poll the recorded `scan_job_id` and resubmit a new attempt on
  `unknown`. A re-dispatched run starts at the step matching the row's state.
  A step whose compare-and-set matches nothing ends the run and never falls
  through to the next step.
- The give-up rule: `scanGiveUpMs` from `first_submitted_at`, less
  `scan_budget_wait_ms`, which each sleep after a `429 source_budget` adds to
  up to `intake.budgetWaitMaxMs`; no single sleep longer than
  `scanGiveUpMs`.
- `insertScannedChatFileMediaAsset` in `media-assets.ts`: a separate
  statement naming `scanned_sha256`, used only by `seal.ts`. The statement
  text of `insertMediaAsset` is unchanged.
- Compare-and-set transitions keyed on the run id, the re-entry rule of the
  inspect, scan and seal steps (`spec.md`, Intake states); workflow steps
  inspect (HEAD plus a
  256,000-byte ranged read through `inspectUploadHead`), submit with per-user
  fairness and `first_submitted_at`, poll on the schedule with the attempt
  rules of the retry table, seal (`spec.md`, Seal, including the row-gone
  case), prepare (loops `P8`), index (`P11`'s reindex request), finish; the
  30-minute presign for the scanner; daily-bytes and in-flight quotas with
  every refund rule in Counters, including the key-value counter that caps
  `scan_unavailable` refunds at `intake.scanUnavailableRefundsPerDay` per
  person per rolling 24 hours; `sealing_entered_at` set by the seal's first
  compare-and-set, and every terminal transition other than `sealed` of a row
  with it set deleting the deterministic sealed key before
  `objects_purged_at` (`spec.md`, Seal); the sweeper (re-dispatch with the two
  membership predicates, idle cancel, stall, orphaned preparations, a
  preparation in `preparing` with `updated_at` older than
  `preparation.stallMs` set to `prepare_failed: stalled` through `P8`'s
  progress store, prune), which does nothing unless `chatFileSchemaReady`
  answers true.
- The guard gains the intake steps as a completing file, fails any file other
  than `chat-attachment-completion.ts` and `seal.ts` that passes
  `source: 'chat-attachment'` to `insertMediaAsset`, and any file but
  `seal.ts` that calls `insertScannedChatFileMediaAsset`.
- The synchronous completion file is not edited; `seal.ts` imports
  `sealedChatAttachmentPathname` from `apps/web/lib/server/media-storage.ts`.

Tested locally (the inline executor, the memory store, the fake scanner
answering with `P3`'s fixture shapes, a fake clock):

- the transition table; idempotent double delivery; the seal re-entering
  `sealing` for the same run and after an expired lease, and not for another
  live run; `transitions.test.ts` "a re-dispatched run for an inspecting row
  inspects again before it submits" (a spy sees the HEAD, the ranged read and
  `inspectUploadHead` before `submitSourceScan`), "a re-dispatched run for a
  scanning row polls the recorded job" (the first scanner call is
  `readSourceScan` with the row's `scan_job_id`; `unknown` then submits a new
  attempt) and "a second live run ends without doing the next step" (for
  inspecting, scanning and sealing rows);
- seal with ETag mismatch, checksum mismatch, infected, clean twice giving one
  row, duplicate hash, `storage_full`, copy timeout, and "row gone at step 6"
  deleting the sealed key;
- `429 queue_full` for 25 minutes then clean seals with no attempt used;
  `429 queue_full` past `scanGiveUpMs` gives `scan_unavailable` with the
  bytes refunded; `429 source_budget` for 70 minutes then clean seals with no
  attempt used and `scan_budget_wait_ms` recorded; `429 source_budget` past
  `budgetWaitMaxMs` plus `scanGiveUpMs` gives `scan_unavailable`; a
  `Retry-After` of 3,600 s is slept in parts no longer than `scanGiveUpMs`,
  each renewing the lease; with a `deadlineMs` of 200 s in the `202`, a scan
  still `scanning` 230 s after the first poll that saw `scanning` is inside
  its attempt and one 261 s after it starts a new attempt;
  `incomplete: deadline` retried and ending `scan_unavailable` with a refund
  within the cap; `quotas.test.ts` "the fourth scan_unavailable in 24 hours
  is not refunded and the first one a day later is"; `transitions.test.ts`
  "a sealing row is not re-dispatched before lease_until and is after it"
  and "each scan poll and fairness wake renews the lease";
  `cancelIntakeByStagingKey` on an `awaiting_parts` row refunds the unstored
  bytes once and frees the slot, and on any other state does nothing; `incomplete: source_unavailable` retried; `source_changed` gives
  `changed_during_check`; `unknown` then resubmit; cancel during scan;
- the sweeper: re-dispatch, an owner who may not run unattended is not
  re-dispatched, idle cancel with refund, stall, orphaned preparations, a
  preparation stalled for 2 h becomes `prepare_failed` and one advanced 1 h
  ago is left alone, prune only with `objects_purged_at`;
- `seal.test.ts` "a re-entered seal that ends scan_unavailable deletes the
  sealed key"; `transitions.test.ts` "every terminal state but sealed deletes
  the sealed key when sealing_entered_at is set";
- `source-scan-client.test.ts` parses every shape in `P3`'s fixture;
- `media-assets.test.ts`: `insertMediaAsset`'s SQL text is unchanged and
  names no new column; the new statement names `scanned_sha256`;
- `schema-absent.test.ts` with the schema-absent database: the synchronous
  completion through the real `insertMediaAsset` stores a small file as
  today, and the sweeper does nothing;
- the guard fails a planted violation; `check:surface-reachability` passes
  with `P8`'s entry removed; `check:membership-unattended-work` with its
  baseline unchanged; `check:legal-hold-coverage` with its baseline empty;
  `check:route-account-gate`; `check:cron-contract`; `check:rls-boundary`;
  `check:mock-exports`; `check:migration-dependencies` with this package's
  entries and no stale one; `cron-schedule-coverage.test.ts` green with the
  new entry.

### P15 Using large files in a turn

Status: built, uncommitted. Research turns charge the ledger per call and a
resume restores the file tools; the research change sits in
`research-loop.ts`, outside this package's list as first written. Size
L. Depends on: P1, P2, P6, P8, P9, P11.

Files:

- `apps/web/app/api/llm/v1/chat/completions/lib/prepared-attachments.ts` (new)
- `apps/web/app/api/llm/v1/chat/completions/lib/prepared-attachments.test.ts` (new)
- `apps/web/app/api/llm/v1/chat/completions/lib/attachment-turn-budget.ts` (new)
- `apps/web/app/api/llm/v1/chat/completions/lib/attachment-turn-budget.test.ts` (new)
- `apps/web/app/api/llm/v1/chat/completions/lib/request-processor.ts`
- `apps/web/app/api/llm/v1/chat/completions/lib/request-processor.large-file.test.ts` (new)
- `apps/web/app/api/llm/v1/chat/completions/lib/tool-loop.ts`
- `apps/web/app/api/llm/v1/chat/completions/lib/tool-loop.attachment-staging.test.ts`
- `apps/web/app/api/llm/v1/chat/completions/lib/approval-checkpoint-request.ts`
- `apps/web/app/api/llm/v1/chat/completions/lib/approval-checkpoint-request.test.ts`
- `apps/web/app/api/llm/v1/chat/completions/lib/tool-loop.large-file.test.ts` (new)
- `apps/web/app/api/llm/v1/chat/completions/lib/research-loop.ts` and
  `apps/web/app/api/llm/v1/chat/completions/lib/research-loop.large-file.test.ts`
  (new) (changed for the per-call research ledger, beyond the list as first
  written)
- `apps/web/app/api/llm/v1/chat/completions/route.ts`
- `apps/web/lib/workflows/start-cloud-agent-workflow.ts`
- `apps/web/lib/workflows/steps/execute-cloud-agent-invocation.ts`
- `apps/web/lib/workflows/__tests__/large-file-turn-continuation.test.ts` (new)

Delivers: the prepared resolver, an `OversizeAttachmentResolver` (`P1`'s
type) passed by `request-processor.ts` as the option `P1` added to
`hydrateChatAttachments`, so this package does not edit
`chat-attachment-hydration.ts`; it takes only assets whose `byte_size` is
above the inline limit (whatever the flag says) and hands every other file
back to `defaultOversizeAttachmentResolver`; the share per state (preparation row,
preparing, `prepare_failed` or no row: card only); cards, excerpts, keyword
passages and the tool note; `onTruncated` for partial reads;
`processed.largeFileTurn` (type in `request-processor.ts`) set only when
hydration resolved a file above the inline limit, so a turn without one has
no ledger and runs exactly as today; the turn ledger with rules 1 to 7 of
`spec.md` (The turn ledger), where reading closes when 2K passes R: one-line
cards, no prepared block, earlier file-tool results replaced by the stub, and
`open_file` and `search_files` withdrawn with `toolGovernor.withdraw(name,
'budget')`, every other tool and the loop continuing under `maxSteps` (the
step-limit path at about `tool-loop.ts` lines 7556 to 7626 is not touched);
`StorageTurnFile` lists carried to the tool loop and staged on the first
code-execution call; `CHECKPOINT_LARGE_FILE_TURN_KEY` holding the asset ids
and the ledger's `{charged, readingClosed}`, written by
`buildApprovalCheckpointRequest` from a new trailing argument that
`route.ts`, `start-cloud-agent-workflow.ts` and
`execute-cloud-agent-invocation.ts` pass as `processed.largeFileTurn`,
restored by `restoreCheckpointedTurn` with the owner check on the asset ids,
and copied into the wall-clock continuation by `workflowContinuation`. It asks `chatFileSchemaReady(db, {cached: true})` before reading any
preparation. No system prompt module changes; the partial-read instruction is
in the card.

Tested locally:

- `attachment-turn-budget.test.ts`: the ledger never passes T over 10 chat
  steps, and over 100 Work steps with file tools the loop reaches step 100;
  "step 3 of a tool loop still carries document text"; when 2K passes R
  reading closes and never reopens, cards become one line, earlier file
  results become stubs, and the out-of-ledger tokens per step stay under
  3,000;
  20 files on the expensive catalog fixture shrink to one-line cards within a
  quarter of T; later-turn caps never above the step's share; the cents cap
  binds on the expensive fixture and the context share on a small window;
- `prepared-attachments.test.ts`: chooses the prepared path by size with the
  flag off; with only small files and a history over the inline budget, the
  provider messages equal the default resolver's; a history image over the
  inline budget gets today's `over_budget` note; a current-turn small file
  over the inline budget gets today's 413; `prepare_failed` and a missing
  preparation row give the card only; a turn with only small files against
  the schema-absent database is today's;
- `tool-loop.large-file.test.ts`: "a Work turn with one large CSV still offers
  code execution at step 30"; after reading closes a call to `open_file`
  returns the withdrawn-tool message and the step's tool list is unchanged;
  "a turn with no large file runs open_file and the tool loop as today, flag on
  and off" (same provider requests and tool results as a build without the
  feature);
- `approval-checkpoint-request.test.ts` "saves and restores largeFileTurn"
  and "a checkpoint without the key resumes with no ledger";
  `large-file-turn-continuation.test.ts` "a continuation carries
  largeFileTurn through parseCloudAgentWorkflowInput";
- a small PDF still goes native on the routes that admit it; failover uses the
  built text parts; a storage spy shows no full read of a large asset; the
  truncation header fires for a partial read; a temporary chat never searches
  outside the conversation; the routing tests stay green;
  `check:migration-dependencies` passes with no entry for this package.

## Wave 5

### P14 Upload and intake routes, admission, readiness, handshake

Status: built, uncommitted. Large creates are serialised per person by an
advisory lock, tested against a fake database only. Size M. Depends on: P2, P4, P6, P12.

Files:

- `apps/web/app/api/files/uploads/route.ts`
- `apps/web/app/api/files/uploads/resumable-upload.ts`
- `apps/web/app/api/files/uploads/[uploadId]/route.ts`
- `apps/web/app/api/files/uploads/[uploadId]/route.test.ts`
- `apps/web/app/api/files/uploads/[uploadId]/parts/route.ts`
- `apps/web/app/api/files/uploads/[uploadId]/parts/__tests__/route.test.ts`
- `apps/web/app/api/files/uploads/__tests__/route.test.ts`
- `apps/web/app/api/files/intakes/[intakeId]/route.ts` (new)
- `apps/web/app/api/files/intakes/[intakeId]/__tests__/route.test.ts` (new)
- `apps/web/lib/server/chat-file-intake/readiness.ts` (new)
- `apps/web/lib/server/chat-file-intake/__tests__/readiness.test.ts` (new)
- `apps/web/lib/server/attachment-allowance.ts`
- `apps/web/lib/server/__tests__/attachment-allowance.test.ts`
- `apps/web/app/api/me/route.ts`
- `apps/web/app/api/me/__tests__/route.contract.test.ts`
- `apps/web/lib/rate-limit.ts`
- `apps/web/lib/__tests__/rate-limit.test.ts`
- `apps/web/lib/server/upload-transport.ts`
- `apps/web/lib/server/__tests__/upload-transport.test.ts`
- `apps/web/.env.example` (`CHAT_LARGE_FILES_ENABLED`,
  `UPLOAD_STORAGE_CORS_ORIGINS`)
- `apps/web/.env.local.example` (only if `check:env-contract` asks for it)
- `apps/web/lib/validate-env.ts`
- `apps/web/lib/__tests__/validate-env.test.ts`

Delivers: readiness in the order `spec.md` gives (flag first, then plan, then
origin, then the schema through `P2`'s helper with its cache, then the scanner
capability through `P12`'s client), so with the flag unset no query and no
fetch is made; `storageReachableForLargeFiles(request)` in
`upload-transport.ts` (`spec.md`, The effective limit: with `Origin`, the
relay rule or `UPLOAD_STORAGE_CORS_ORIGINS`; without `Origin` but with
`Sec-Fetch-Site`, the request URL's own origin; with neither, native and
reachable); the effective-limit resolver
used by create and `/api/me`, with `inline_message_bytes`; the create route
parsing `chat-large-file` with the large create schema beside the unchanged
union, and admission through a new `admitChatLargeFileUpload` (the existing
`AttachmentUploadKind` union and `upload-keys.ts` unchanged); create not
requiring the capability header; part size at create; the intake row at
create; the parts route and the complete route touch the intake row only when
the signed session's `kind` is `chat-large-file` (`touchPartRequest` and
`markUploaded` from `P12`'s store), so a `chat-attachment` session issues
exactly today's statements; complete choosing its path by the session's kind;
the session `DELETE` (`handleAbort`, about line 384 of
`[uploadId]/route.ts`): for a `chat-large-file` session it lists the
uploaded parts, aborts the multipart upload and then calls
`cancelIntakeByStagingKey` with the session's key and the stored byte count,
so the row is `cancelled: client`, the unstored bytes are refunded and the
slot is freed at once; for a `chat-attachment` session it issues today's
statements only; `GET` status and `DELETE` cancel on the intake route (the
cancel after the `202`) with the refund; the `uploads-intake-status` bucket;
`uploadNeedsSameOriginRelay` returning false for an `Origin` listed in
`UPLOAD_STORAGE_CORS_ORIGINS` and unchanged with the variable unset; the
parts route answering `409` `large_file_needs_direct_upload` instead of a
relay URL for a `chat-large-file` session whenever the relay would be used;
create refusing a `chat-large-file` whose `byteCount` plus
`sumInFlightIntakeBytes` passes the storage quota (outside temporary chats),
and the effective limit's remaining storage net of the same sum; no large
offer to an origin that needs the relay; both variables validated and in the
example. The presign route is not
changed. Authenticated user routes are the default in
`route-authentication.json`, so the intake route needs no entry there.

Tested locally: no token gives today's `attachment_limits` byte for byte; the
token with scanner protocol 1, with the schema-absent database, or with the
flag off gives today's limits; with everything ready it gives the plan's large
limits folded with remaining storage, never below today's, plus
`inline_message_bytes`; Free gets today's; a large create without the header
is admitted when everything else holds; daily bytes exhausted gives `429` and
the refund rules hold; the concurrency cap gives `429`; a `chat-large-file`
session completes with `202` and starts the workflow (mocked); a
`chat-attachment` session completes synchronously; the intake route refuses
another user and cancel is idempotent; a relay-only origin is never offered
large files; `readiness.test.ts` false when any condition is missing, and
"with the flag set to %s no query and no fetch is made" (database and fetch spies
see nothing), and Free stops before the schema; with the schema-absent
database, the parts route, the complete route and the session `DELETE` for
a `chat-attachment` session succeed and "issue no statement naming a new
table"; "aborting a chat-large-file session sets the row cancelled: client,
refunds unstored bytes and frees the slot" (a fourth create is then
admitted on Basic); "a chat-large-file session from a relay origin gets 409,
never a relay URL" and "a listed origin gets presigned URLs"; a large
create whose bytes plus two in-flight 500 MiB intakes pass the quota is
refused with the storage copy;
`upload-transport.test.ts` "uploadNeedsSameOriginRelay is false for a listed
preview origin and unchanged with the variable unset", and, with the `me`
route test, the headers a browser sends: on a preview URL without `UPLOAD_STORAGE_CORS_ORIGINS`, a GET with
`Sec-Fetch-Site: same-origin` and no `Origin` is not offered large files and a
create POST with `Origin` is refused; with the origin listed, both are
allowed; a request with neither header (native) is offered; production is
unchanged; `check:env-contract`; `check:migration-dependencies` passes with no
entry for this package.

## Wave 6 (last wave)

### P16 Web: handshake token and upload path

Status: built, uncommitted; the Playwright spec has not run. The token is
sent on `/api/me` (`apps/web/shared/services/me-request.ts`) and the composer
keeps a file whose cancel came too late visible, whether the intake was
noted from the `202` or from the session `DELETE` answer. Size S. Depends
on: P10, P14.

Touches the renderer workstream's area: `use-attachments.ts` and
`chat-attachment-upload.ts` are under `apps/web/features/chat`, which is why
this package is in the last wave. No renderer, card, composer layout or
`packages/ui` file is changed: the composer's existing `verifying` phase and
held send cover checking, and `use-attachments.ts` reads
`inlineMessageBytes` from the auth store itself, so `ChatComposerNew.tsx`,
`AttachmentPreview.tsx` and `composer-attachment-limits.ts` are untouched.

Files:

- `apps/web/shared/stores/web-auth-store.ts`
- `apps/web/shared/stores/__tests__/web-auth-store.attachment-limits.test.ts`
- `apps/web/features/chat/services/chat-attachment-upload.ts`
- `apps/web/features/chat/services/chat-attachment-upload.test.ts`
- `apps/web/features/chat/hooks/use-attachments.ts`
- `apps/web/features/chat/hooks/__tests__/useAttachments.refusals.test.tsx`
- `apps/web/e2e/large-chat-file-upload.spec.ts` (new)
- `apps/web/package.json` (adds `@noble/hashes` `^1.8.0`, the incremental
  SHA-256 the web passes to the shared client) and `pnpm-lock.yaml` (through
  `pnpm install`), moved here from `P10`

Changed beyond this list by work in the tree: the token is sent from
`apps/web/shared/services/me-request.ts`, and the composer receiver for a
file kept after a late cancel is in
`apps/web/features/chat/pages/WebChatPage.tsx`.

Delivers: the token on the `/api/me` request; `largeFilesAvailable`,
`storageRemainingBytes` and `inlineMessageBytes` kept in the store;
`largeFiles: true` and the conversation and temporary flags passed to the
shared client only when the handshake offered large files; files of 25 MiB or
less held to `inlineMessageBytes` together, with today's message-size copy;
the storage refusal copy ("You have 312 MB of storage left. Delete files in
your Library to make room.") when remaining storage is what binds.

Tested locally: component and store tests, including three 10 MiB images
refused at the third under an offering handshake; the Playwright spec for the
client flow only (`plan.md`, Browser): every server answer stubbed with
`page.route` (`/api/me` with an offering handshake, create, the parts route,
the part `PUT` URLs, complete and intake status) for checking, ready and send,
rejected, cancel, and resume after reload; no storage adapter and no scanner
are involved.

### P17 Mobile: token, upload path, cellular confirmation

Status: deferred. Not started: the 0.0.1 build is not recorded under
Records, and the phone keeps the 25 MiB limit. Size M. Depends on: P10, P14 and the 0.0.1 build recorded
under Records (the binary for App Store review is built before this package
starts, so nothing from it can be in that binary).

Touches the composer area through
`src/features/chat/utils/attachmentValidation.ts` only, which is why this
package is in the last wave. `ChatInput.tsx`, `AttachmentPreview.tsx`, the
chat stores and the chat screens are untouched: the existing `verifying`
phase and held send cover checking.

Files:

- `apps/mobile/lib/v1FeatureFlags.ts` (adds `largeChatFiles: false`)
- `apps/mobile/src/platform/platformHeaders.ts`
- `apps/mobile/services/api.ts`
- `apps/mobile/src/features/chat/upload/partedChatUpload.ts`
- `apps/mobile/src/features/chat/upload/cellularConfirm.ts` (new)
- `apps/mobile/src/features/chat/utils/attachmentValidation.ts`
- `apps/mobile/services/fileCreation.ts` (the download reader; not in the
  renderer workstream's area)
- `apps/mobile/__tests__/generated-file-download.test.ts` (the existing test
  of `downloadGeneratedFile`)
- `apps/mobile/__tests__/platformHeaders.test.ts` (new)
- `apps/mobile/__tests__/api-upload-parts.test.ts`
- `apps/mobile/src/features/chat/upload/__tests__/partedChatUpload.test.ts`
- `apps/mobile/src/features/chat/upload/__tests__/cellularConfirm.test.ts` (new)
- `apps/mobile/src/features/chat/utils/__tests__/attachmentValidation.storage.test.ts` (new)

Delivers: the capability token only when `FEATURES.largeChatFiles` is true;
`largeFiles: true` to the shared client only when the handshake offered it;
8 MiB parts and 2 at a time above 100 MiB; files of 25 MiB or less held to
`inlineMessageBytes` together; the cellular question above 50 MiB when NetInfo
reports an expensive connection (Upload or Cancel); the storage refusal copy.
Local mode and the share extension unchanged.

Downloads (`spec.md`, Downloads). `fetchGeneratedFileBytes` in
`fileCreation.ts` reads every `/api/files/:id` download
whole (`res.blob()`, then `blobToBase64`) for the chat file viewer, sent
attachments and the Library. The stated size is the server's
`MAX_SERVE_BYTES` (30 MiB), signalled by its `413`: above it the app refuses
with copy and never builds a blob, and it never downloads such a file. A
`413` already throws `FileDownloadError` before `res.blob()`, so
the change is the copy: `FileDownloadError` for `413` says "This file is too
large to open on your phone. Open it on the web.", and `downloadFailureMessage`
passes it through as it passes 401, 403, 404 and 410. The file request keeps
sending `getAuthHeaders()` only, never `platformRequestHeaders()`, so the
capability token never reaches a file request and no native client is sent
the redirect, with `FEATURES.largeChatFiles` true or false. A disk download
through the file system download API with the token was rejected for the
first version: the pinned transport refuses a response from an unpinned
storage host, and React Native replays the request's credentials on the
second hop before that check runs (`services/secureFetch.ts`,
`redirectVerdict` and `checkResponseOrigin`). Callers that
show fixed copy instead of the error's (the Library's share alert,
`features/library/index.tsx`, the "Could not open this file" alert) are not changed; `P18` records
it in known flaws. No request in `services/api.ts`, which carries
`platformRequestHeaders()`, names `/api/files/:id` (checked on 2026-11-15).

Tested locally (Jest in chunks): no capability header with the flag false;
with the flag false a 30 MiB file is refused at attach with today's copy and a
5 MiB file takes today's request sequence; with the flag true and an offering
handshake, a `202` polls to the attachment and a rejection keeps the file out
of the send; the cellular question appears only above the threshold on an
expensive connection; cancel deletes temp parts and the server session;
`generated-file-download.test.ts`: "a 413 gives the too-large copy and builds
no blob" (the response's `blob` is a spy that is never called) and "no file
request carries x-agi-client-capabilities, with FEATURES.largeChatFiles true
or false", with every existing case unchanged.

## After wave 6

### P18 Records and canonical documentation

Status: built, uncommitted (2026-11-15), against waves 1 to 6 as they stand
in the working tree rather than merged. Size S. Depends on: waves 1 to 6 merged. It changes no code.

Files:

- `docs/architecture/overview.md`
- `audit/registers/known-flaws.md`
- `docs/specs/large-file-uploads/spec.md`, `plan.md`, `tasks.md` (deleted once
  deployment step 8 has run)

Delivers: the upload pipeline, scanner protocol 2, the rollback floor and the
degradation rules in their canonical home; known-flaws rows for: scanner
throughput unmeasured until step 4; HTML and script normalisation limits;
DLP limited to the first 256,000 bytes; native admission capped at 25 MiB;
small history files over the inline budget not excerpted; chat files over
25 MiB without a backup replica (Owner decisions, L); the temporary-chat storage exposure;
attach-from-Library (`ComposerFilesMenu.tsx` `libraryItemToFile`) answering
`413` for a chat file above 30 MiB, with a message only on the Library page's
handoffs (`readLibraryItemFile`) and the generic could-not-be-added copy from
the composer, because it fetches the file and only a navigation is redirected; a chat file above 30 MiB not opening on the phone,
with the Library's share alert keeping its fixed "Try again" copy; and the
existing harness page cap of 600 for the Anthropic messages route, where the
provider's page says 100 when the request's context window is under 1M tokens
(`https://platform.claude.com/docs/en/build-with-claude/pdf-support`, as
quoted by the assessment, not re-read here).

Tested locally: `node scripts/check-doc-registry.mjs`,
`node scripts/check-structure-conventions.mjs` and
`node scripts/check-em-dash-in-copy.mjs`.

## Files read and deliberately left unchanged

- `apps/web/lib/server/chat-attachment-completion.ts`: the synchronous path is
  unchanged.
- `apps/web/lib/server/data-export-archive.ts`: unchanged; it streams originals
  (`getPrivateObjectStream`), and the intake section is in the export route
  (`P2`).
- `apps/web/lib/workflows/cloud-agent-workflow-input.ts`: unchanged;
  `ProcessedRequestSchema` is `passthrough`, so `largeFileTurn` survives the
  continuation (`P15`'s continuation test proves it).
- `apps/web/lib/services/scheduled-agent-executor.ts`: unchanged; scheduled
  runs carry no chat attachments, so they never hold a ledger.
- `apps/web/app/api/llm/v1/chat/completions/lib/tool-turn-governor.ts`:
  unchanged; `P15` uses its existing `withdraw(name, 'budget')`.
- `apps/web/app/api/user/export/__tests__/export-matches-erasure-inventory.test.ts`,
  `export-covers-personal-data.test.ts` and
  `apps/web/lib/services/__tests__/deletion-manifest.test.ts`: unchanged, and
  green with `P2`.
- `apps/web/lib/server/upload-keys.ts`: a large file's staging key is
  `uploadObjectKey('chat-attachment', ...)`.
- `services/upload-scanner/__tests__/limits.test.ts` and `server.test.ts`:
  unchanged, and must stay green (degradation row 6).
- `apps/web/app/api/uploads/presign/route.ts`,
  `apps/web/app/api/uploads/chat-attachment/` routes: small files only.
- `apps/web/lib/cors.ts`: no cross-origin client sends the token in the first
  version (web is same-origin, mobile is native). A client that adopts it
  later adds the header to the allow list.
- `apps/web/lib/resources/deletion-policies.ts`,
  `apps/web/lib/server/temporary-files/purge.ts`,
  `apps/web/lib/services/domain-retention-service.ts`, the purge crons: they
  delete media rows as today; derived objects follow through the orphaned
  preparation rows and the sweeper.
- `apps/web/lib/services/ediscovery-export-service.ts`: unchanged. Checked on
  2026-11-15: it only selects media rows (`storage_pathname is not null as
content_preserved`, about lines 101 to 103) and reads no object.
- `apps/web/lib/moderation/hash-denylist.ts`: `matchDenylistedSha256` is
  already exported (line 65); `P7` adds its test only.
- `apps/web/lib/server/free-quota-turn.ts`: unchanged; it calls
  `hydrateChatAttachments` (about line 989) without a resolver, so Free turns
  get the default one.
- `apps/web/lib/server/file-storage.ts`: unchanged; the index is bounded by
  the per-user cap instead (Owner decisions, J).
- `packages/contracts/cloud-contracts/src/chat-attachment-truncation.ts`: the
  existing header carries partial reads.
- `packages/contracts/types/src/resource-metadata-contract.json`,
  `scripts/config/migration-table-privileges.json`,
  `scripts/config/membership-unattended-work-baseline.json`,
  `scripts/check-legal-hold-coverage.baseline.json`: unchanged; `P2` and `P12`
  satisfy those guards in the SQL and statements themselves.
- `apps/web/features/chat/components/Composer/ComposerFilesMenu.tsx`
  (`libraryItemToFile`) reads a file with `fetch` and `res.blob()`; a fetch
  sends `Sec-Fetch-Mode: cors` and no capability token (`P16` sends the token
  on the `/api/me` request only), so `P13` answers it today's `413` for a
  large file, exactly as for any asset above 30 MiB today. Attach-from-Library
  therefore still refuses a large file: the Library page's handoffs (Use in
  chat, remix, Add to project, through `readLibraryItemFile` in
  `apps/web/features/library/lib/library-chat-handoff.ts`) say so with a
  message, the composer's Files menu does not, and the gap is a known-flaws
  row (`P18`). The Library's download button
  (`packages/ui/unified-chat/src/components/library/LibraryView.tsx`,
  `handleDownload`) no longer fetches an uploaded file above the inline limit:
  it saves it through a browser download, an anchor navigation that the files
  route redirects to storage and charges once.
- `apps/mobile/src/features/chat/components/artifact-viewers/useLocalFileCopy.ts`,
  `apps/mobile/src/features/chat/utils/sentAttachment.ts` and
  `apps/mobile/src/features/library/index.tsx`: unchanged; they reach a
  download only through `fileCreation.ts` (`P17`), which keeps the `413`.
- `apps/mobile/services/secureFetch.ts` and `apps/mobile/lib/egressGuard.ts`:
  unchanged; no native client is sent the redirect.
- `apps/web/features/chat/components/**` (other than the file named above),
  `apps/web/features/chat/lib/composer-attachment-limits.ts`,
  `packages/ui/**`, `apps/mobile/src/features/chat/components/**`, mobile chat
  stores: untouched.
- `services/upload-scanner/fly.toml`: unchanged; VM size is an owner decision.
- `apps/desktop`, `apps/cli`, the extensions: no token, current limits.
