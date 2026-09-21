# Legal hold operations

Status: Current
Owner: Legal/compliance
Last updated: 2026-09-20

How to place, verify, export and release a legal hold, and what to check when
something looks wrong. The mechanics and their limits are in
`docs/compliance/legal-hold-and-ediscovery.md`; this page is the procedure.

Every call below needs a caller the enterprise authorization contract grants
`content.govern` in the workspace. There is no separate compliance role.

## Place a hold

`POST /api/settings/organization/legal-holds` with a name, the scope, and
optionally the resource types and custodians.

- `organization` preserves the whole workspace.
- `member` preserves one named subject.
- `custodian` preserves a list of people. This is the shape to use for a matter
  with several custodians; do not place one member-scoped hold per person and
  expect the console to read as one matter.

Omit `resourceTypes` to cover all seven stores. Naming them narrows the hold,
and a narrowed hold also narrows what an export of it can reach.

The creation is audited as `legal_hold_created` at critical severity.

## Verify it is preserving something

`GET /api/settings/organization/legal-holds/{holdId}/preservation`.

Read three fields:

- `stores` gives a per-store count, computed with the same predicate the
  deletions exclude on.
- `preservesNothing` is true when the hold is active and selects nothing. An
  active hold that preserves nothing is the failure mode with no other symptom:
  it reads as protection in the console and stops no deletion. The usual causes
  are a custodian list with an id that does not match the subject column, or a
  resource-type list that names stores this workspace has no rows in.
- `referenceOnly` counts rows whose bytes this product never stored, which the
  export will carry as metadata only. If `preserved` equals `referenceOnly`, the
  hold is preserving no content at all.

Do this immediately after placing a hold. Do not wait for a deletion to be
refused to discover that the scope was wrong.

## Export

`GET /api/settings/organization/legal-holds/{holdId}/export`, optionally with
`resourceTypes`, `custodians`, `from` and `to` as query parameters. `from` is
inclusive and `to` is exclusive, so two adjacent windows neither overlap nor
leave a gap.

The response is newline-delimited JSON, streamed. Keep the whole file: the last
two lines are the manifest and the custody record, and a file truncated before
them cannot be verified.

To verify a received export:

1. Take every line except the last two, in order, with their trailing newlines.
2. SHA-256 those bytes and compare with `sha256` in the manifest.
3. Compare each store's count and digest with the matching manifest entry.
4. Compare the custody line's `entryHash` with the row in `ediscovery_exports`.

An entry with `records: 0` is a store the hold put in scope that produced
nothing. That is a statement, not an omission. An entry with a non-zero
`referenceOnly` means some of those records are metadata for content held
somewhere this product cannot reach.

A failed export still writes a custody row with `outcome: 'failed'` and the
error, because the bytes already sent are in somebody's hands. Do not re-run an
export and report only the successful run.

## Release

`DELETE /api/settings/organization/legal-holds` with the hold id.

Release sets `released_at` and `released_by_user_id`. It destroys nothing. What
the hold was preserving becomes eligible for the next retention sweep and the
next purge run, so releasing a hold over content that has been soft-deleted or
is past a retention window will lead to it being destroyed, on a schedule, not
at the moment of release. Confirm with counsel before releasing.

The release is audited as `legal_hold_released` at critical severity. A release
that matches no active hold returns the same answer as a release against another
workspace's hold.

## Amend a matter

There is no amend. To change a live hold's custodians or resource types, place a
new hold with the corrected scope first, confirm through the preservation
endpoint that the new hold is preserving what the old one did, and only then
release the old one. Releasing first leaves a window in which a sweep can run.

## When a deletion was refused

A user who tries to delete held content is refused with a plain sentence and the
refusal is recorded as `deletion_blocked_by_legal_hold` with `outcome: 'denied'`
and the resource. To answer "did anybody try to destroy this", query the audit
events for that type and workspace. The absence of such an event is not proof
that nothing was attempted through a path outside the product.

## When an erasure was refused

Account and workspace erasure refuse whole rather than partially. The erasure
report comes back with the hold recorded and nothing deleted. Do not retry the
erasure until the hold is released; a retry will make the same refusal.

## Checks to run after changing any of this

- `node scripts/check-legal-hold-coverage.mjs` and its self-test. It enumerates
  every destructive statement and fails on one that does not carry the
  predicate inside the statement.
- `node scripts/check-retention-graph.mjs` and its self-test. It enumerates
  every live table from the migrations and fails on one holding a subject
  reference that no erasure rule reaches.
