# Business continuity and disaster recovery

Status: Current
Owner: Platform lead
Last updated: 2026-09-18

This is the summary /trust points at. It states what the repository can prove
about recovering the product, and names what it cannot. Nothing here is a
commitment to a customer: /sla carries targets, and this document carries
mechanisms and their evidence. Where a number would be invented, this document
says so instead of inventing it.

## What recovery covers

| Asset                  | Mechanism                                                      | Evidence in this repository                                                                       |
| ---------------------- | -------------------------------------------------------------- | ------------------------------------------------------------------------------------------------- |
| Primary database       | Neon point-in-time restore inside the project's history window | `docs/runbooks/database-backup-restore.md`, `scripts/db-restore-drill.mjs`                        |
| Database, host-neutral | `pg_dump` and `pg_restore` against any Postgres host           | `scripts/db-restore-drill-logical.mjs`                                                            |
| Object storage         | Hourly replication of every stored object into a second bucket | `apps/web/app/api/cron/replicate-object-backups/route.ts`, `apps/web/lib/server/object-backup.ts` |
| Encryption keys        | Key ring resolution at the restored point in time              | Section 3 of `docs/security/security.md`                                                          |
| Serving                | One deployment, with a declared degraded mode per capability   | `apps/web/lib/server/slo/degradation.ts`, rendered on /status                                     |
| Incident handling      | Written process, severity ladder and notification duty         | `docs/runbooks/incident-response.md`, the incident section of /status                             |

## Recovery point and recovery time

**Recovery point.** For the database it is bounded by Neon's
`history_retention_seconds` on the project, which this repository does not
record; Neon's own default is 24 hours unless the project raised it. Anything
older than that window is gone, because there is no second backup underneath
Neon's retention. For object storage it is bounded by the replication cadence,
which runs at 25 minutes past each hour and carries at most 200 new objects and
200 reconciled deletions per run, so a burst larger than that trails by more
than one hour.

**Recovery time.** Not measured. The drills prove the restore path works; they
do not time a full production recovery, and no production restore has been
performed. Any recovery time figure would be a guess, so none is published.

## What the drills prove, and what they do not

`scripts/db-restore-drill.mjs` creates a disposable branch from a timestamp
through Neon's own API, verifies it, and deletes what it created. It proves
Neon's point-in-time recovery works and that the schema at that point matches
the deployed migrations. It runs only against Neon.

`scripts/db-restore-drill-logical.mjs` speaks plain Postgres, so it proves the
database is not welded to one host and that a move to another Postgres host is
a real option rather than an assumption.

Neither drill is scheduled. Both are run by a human, and the run is the
evidence: there is no automated restore test and no stored attestation of one.
Until that exists, treat the recovery point above as a property of the
configuration rather than a tested outcome.

## Known gaps, stated rather than covered

- No declared RPO or RTO commitment, for the reasons above.
- No scheduled restore test, and therefore no dated restore-test evidence.
- No second region and no second provider for serving. A provider-wide outage
  is an outage, and the trust ledger says so.
- No 24/7 on-call rotation. Response is best effort during working hours, as
  /status states.
- Object replication is bounded per run, so a large burst is not covered within
  the hour it was written.

## When this page must be re-read

Whenever any row in the table above changes mechanism, and at each /trust
review. `apps/web/app/__tests__/compliance-claim-honesty.test.ts` fails the
build when the trust ledger's review date has passed, which is the prompt to
come back here.
