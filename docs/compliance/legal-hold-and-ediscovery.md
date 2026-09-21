# Legal hold and eDiscovery

Status: Current
Owner: Legal/compliance
Last updated: 2026-09-20

What a legal hold does in this product, what an eDiscovery export contains, and
what neither of them can do. Every statement below is provable from the file it
cites. Where the product does not do something, this page says so rather than
leaving the reader to assume it.

## What a hold can name

A hold names stores from one list, `HOLDABLE_RESOURCES` in
`packages/contracts/types/src/resource-lifecycle.ts`. There are seven, and the
table each one means is declared beside it:

| resource type  | table                     | content this product stores |
| -------------- | ------------------------- | --------------------------- |
| `conversation` | `web_conversations`       | the row is the content      |
| `message`      | `web_messages`            | the row is the content      |
| `project`      | `user_projects`           | the row is the content      |
| `project_file` | `project_knowledge_files` | `storage_uri`               |
| `file`         | `media_assets`            | `storage_pathname`          |
| `artifact`     | `web_artifacts`           | the row is the content      |
| `work_run`     | `cloud_agent_runs`        | the row is the content      |

A hold with no resource types covers all seven. The same list is the CHECK
constraint on `legal_holds.resource_types`, so a hold cannot name a store the
deletion paths would not check, and `scripts/check-legal-hold-coverage.mjs`
fails if the migration vocabulary and the contract disagree.

Anything outside that list is not held. A connector document, an email in a
linked mailbox and a file in a customer's own storage are not copied here by
being reachable, so a hold placed in this product does not preserve them.

## What a hold does to a deletion

One SQL predicate answers the question, `legalHoldPredicate` in
`apps/web/lib/services/legal-hold-gate.ts`. It resolves all three scopes,
workspace-wide, a named member, and a custodian list, in the statement itself,
and a resource owned through a parent joins that parent, so a hold on a person
reaches the messages inside their conversations.

Every destructive statement renders that predicate INSIDE its own WHERE clause.
Nothing reads the holds, builds a list of rows, and then deletes: a hold placed
between the read and the delete has to win, and a candidate list computed
beforehand cannot let it. `scripts/check-legal-hold-coverage.mjs` enumerates
every destructive statement in `apps/web` and `packages` from the source, takes
the reach of a delete from the foreign keys in `apps/web/db/neon`, and judges
each statement individually: a predicate elsewhere in the same file does not
vouch for it. It reports 16 of 16 statements gated with an empty baseline, and
fails on a seventeenth.

Two paths refuse instead of filtering, which is the stronger answer: account
erasure (`isSubjectUnderLegalHold` in `apps/web/lib/server/account-erasure.ts`)
and workspace erasure (`isOrganizationUnderActiveLegalHold` in
`apps/web/lib/server/organization-erasure.ts`) abandon the whole erasure rather
than narrowing it, so a held subject is never partly erased. Both ask an
uncapped query, so a workspace cannot outgrow the answer.

A deletion a user asked for and a hold refused is recorded, not only refused.
`refuseHeldDeletion` in `legal-hold-gate.ts` writes a
`deletion_blocked_by_legal_hold` audit event with `outcome: 'denied'` before
throwing, and the message the user sees names the consequence and its end: the
content is preserved by a hold, and will be deleted once the hold is released.

## Retention never beats a hold

Workspace retention (`apps/web/lib/services/retention-service.ts`) and per
domain retention (`domain-retention-service.ts`) both render the exclusion
inside the statement that deletes, so the shortest applicable retention window
cannot reach a held row. The sweep reports what it preserved:
`countHeldRows` and `countUnheldRows` count with the same predicate the DELETE
excluded on, so the number reported and the rows withheld cannot disagree.

A hold also beats the temporary chat promise. Temporary chats and their
attachments are purged on age by `apps/web/app/api/cron/purge-temporary-chats`
and `apps/web/lib/server/temporary-files/purge.ts`, and both carry the
predicate: a held attachment survives its window and is purged on the first run
after the hold is released. The published copy about temporary chats needs to
carry that exception.

## What a hold does not do

- It does not stop an archive or a soft delete. `holdBlocksTransition` in the
  contract refuses only the transition to `purged`, because archive and soft
  delete are reversible and the bytes stay.
- It does not preserve bytes this product never stored. A
  `project_knowledge_files` row with a null `storage_uri`, or a `media_assets`
  row with a null `storage_pathname`, is a reference to content held somewhere
  else. The preservation endpoint and the export manifest both count those rows
  separately as `referenceOnly` rather than claiming them as preserved.
- It is not amendable. The API creates a hold (POST) and releases it (DELETE);
  there is no route that edits a live hold's custodians or resource types, so
  narrowing or widening a matter means releasing the hold and placing a new one.
  The released row stays as matter history.

## Placing, reading and releasing

`apps/web/app/api/settings/organization/legal-holds/route.ts` carries all three:

- `POST` creates a hold and writes a `legal_hold_created` audit event at
  critical severity.
- `GET` lists the workspace's holds.
- `DELETE` releases one. Release is an UPDATE that sets `released_at` and
  `released_by_user_id` (`releaseLegalHold` in `retention-service.ts`); it
  destroys nothing by itself. What the hold was preserving becomes eligible for
  the next retention sweep or purge run. A released hold can be re-placed by
  creating a new one. A release that matches no active hold and a release
  against another workspace's hold return the same answer, so the endpoint
  cannot be used to learn which hold ids exist elsewhere.

`GET .../legal-holds/[holdId]/preservation` answers what a hold is preserving
right now, per store, through the same predicate the deletions exclude on. It
reports `preservesNothing` for a hold that is active and selects nothing, which
an administrator has no other way to see, and `referenceOnly` for rows whose
bytes live outside this product.

## What an export contains

`GET .../legal-holds/[holdId]/export` streams newline-delimited JSON:

1. the hold itself,
2. the records, per store, in the order the contract declares,
3. a manifest,
4. a chain-of-custody line.

The scope is the hold's, narrowed by the filter and never widened by it. A
filter naming a store the hold does not cover exports nothing from that store;
a custodian filter is intersected with the people the hold preserves, and an
intersection that came out empty exports nothing rather than falling back to the
whole workspace (`exportedResourceTypes` and `exportedCustodians` in
`apps/web/lib/services/ediscovery-export-service.ts`).

The export reads one source per holdable store, and the sources are checked
against the contract: a store a hold can name that the export has no source for
would make the manifest claim evidence nobody received, so the iterator refuses
rather than omitting it silently.

The manifest carries a per-store record count, byte count and SHA-256, plus the
same three for the whole file. It is the last line rather than the first,
because the digests cover bytes that do not exist until the stream has produced
them. Every store the hold put in scope has an entry even when it produced
nothing, so a store that yielded no records states a zero rather than being
absent. `referenceOnly` on an entry counts records whose content this product
never stored.

## Chain of custody

Every export attempt writes one row to `ediscovery_exports`, whether it finished
or failed part way, because bytes already sent are in somebody's hands
(`recordEdiscoveryExport`). Each row carries who asked, through which surface,
the filter, the manifest, the record and byte counts, the content digest, the
start and completion times, and a hash chained to the previous row for that
workspace. Editing any of those fields in place breaks the link to every later
row. The table is append-only for the application role, which holds SELECT
alone: a custody log the exporting workspace can edit is not custody.

Access is the enterprise authorization contract's, not a separate one. Both the
export and the preservation endpoints resolve the caller through
`resolveComplianceCaller(request, 'content.govern', ...)`, so the permission
that governs content governs the evidence about it. Every export is additionally
recorded as an `ediscovery_export` audit event at critical severity, and admin
data access is logged for the preservation read.

## The purge that is off

`apps/web/app/api/cron/purge-soft-deleted-resources` ends the recovery window
for the six soft-deletable stores that had no purge at all before it existed. It
is gated on `SOFT_DELETED_RESOURCE_PURGE_ENABLED` and that variable is **not set
by default**, so on a deployment that has not set it to `true` the route does
nothing and soft-deleted conversations, messages, artifacts, projects and
knowledge files keep their rows past the published recovery window. The switch
is documented in `apps/web/.env.example`. Until it is turned on, the thirty day
recovery promise is honoured for `media_assets` alone, through
`apps/web/app/api/cron/purge-deleted-media`.

## Related

- `docs/architecture/RETENTION_MATRIX.md` renders every store, its data class,
  what erases it and how long it may live.
- `docs/runbooks/legal-hold.md` is the operator procedure.
- `docs/security/security.md` carries the security posture these controls sit in.
