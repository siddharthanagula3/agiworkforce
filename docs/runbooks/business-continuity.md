# Business continuity and disaster recovery

Status: Current
Owner: Platform lead
Last updated: 2026-09-21

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
| Object storage         | Hourly replication, 200 objects per run, off until configured  | `apps/web/app/api/cron/replicate-object-backups/route.ts`, `apps/web/lib/server/object-backup.ts` |
| Encryption keys        | Key ring resolution at the restored point in time              | Section 3 of `docs/security/security.md`                                                          |
| Serving                | One deployment, with a declared degraded mode per capability   | `apps/web/lib/server/slo/degradation.ts`, rendered on /status                                     |
| Incident handling      | Written process, severity ladder and notification duty         | `docs/runbooks/incident-response.md`, the incident section of /status                             |

## Recovery point and recovery time

**Recovery point.** For the database it is bounded by Neon's
`history_retention_seconds` on the project, which this repository does not
record; Neon's own default is 24 hours unless the project raised it. Anything
older than that window is gone, because there is no second backup underneath
Neon's retention.

For object storage there is no recovery point until the backup bucket is
provisioned. The route runs at 25 minutes past each hour, but
`isObjectBackupConfigured` reads the five `AGI_STORAGE_BACKUP_*` variables, and
with any of them unset the run answers `{"replicated":0,"reason":"unconfigured"}`
and copies nothing. Do not read the cadence below as a recovery point until
`objectBackupReadiness` reports ready in the deployment. Once it is configured,
the bound is that cadence, carrying at most 200 new objects and 200 reconciled
deletions per run, so a burst larger than that trails by more than one hour.

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

One of the two is scheduled. `.github/workflows/db-restore-drill.yml` runs
every Monday at 05:13 UTC, and on demand, and it runs the logical drill against
a throwaway `pgvector/pgvector:pg17` service container: it applies the canonical
migrations, seeds a row in every core table so an empty restore cannot pass
vacuously, and caps the run at 600 seconds. It never touches production data,
so it proves the commands and the schema, not that this deployment's data
restores.

The same workflow runs a rollback drill that resolves the deployment production
would revert to and records a `rollback_drill` row in the release audit trail
through `scripts/release/rollback.mjs --drill`. `--drill` forces a dry run, so
the only Vercel calls are a project read and a deployment listing, and nothing
is rolled back. If `AGI_DATABASE_URL` is unset the script warns and writes no
row, so the attestation is conditional on that secret being present.

`scripts/db-restore-drill.mjs`, the Neon point-in-time drill against the real
project, is in no workflow. It is run by a human and leaves no stored
attestation, and the same is true of `scripts/key-rotation-drill.mjs`. Until
those are scheduled, treat the database recovery point above as a property of
the configuration rather than a tested outcome.

## Recovery by dependency

One row per entry in `PRODUCTION_DEPENDENCIES`
(`apps/web/lib/config/dependency-readiness.ts`), which is the registry the
health endpoint and the signal-coverage report both read. The registry is the
enumeration, not this table: `scripts/check-dr-recovery-table.mjs` fails when a
dependency exists in the code with no row here, when a row names a dependency
the code does not declare, or when a "rehearsed" cell claims a drill the
repository cannot show.

"Rehearsed" means this repository holds the drill that exercises it. Where it
does not, the cell says `no recorded drill`, which is a statement about
evidence, not a claim that recovery would fail.

| id                    | What is lost while it is down                               | What the code does                                                                         | Recovery step                                                                 | Who can do it       | Rehearsed                                                     |
| --------------------- | ----------------------------------------------------------- | ------------------------------------------------------------------------------------------ | ----------------------------------------------------------------------------- | ------------------- | ------------------------------------------------------------- |
| `database`            | Everything; no conversation, account or setting is readable | Readiness fails closed and `api/health` reports the database check                         | Neon point-in-time restore inside the project history window                  | Platform lead       | `scripts/db-restore-drill.mjs`, human run                     |
| `key_value`           | Rate limits, reservations and cached reads                  | Rate limiting and cached reads fail closed rather than serving unlimited                   | Re-provision Upstash, or set `AGI_KV_REDIS_URL` to any Redis-compatible store | Platform lead       | no recorded drill                                             |
| `identity`            | Sign-in; existing sessions continue until they expire       | The proxy refuses session routes rather than authenticating without an azp binding         | Vendor recovery; no product-side step exists                                  | Vendor              | no recorded drill                                             |
| `billing`             | Checkout, portal and payment method changes                 | Checkout and portal refuse; existing entitlements keep serving from the ledger             | Vendor recovery; the ledger needs no repair afterwards                        | Vendor              | no recorded drill                                             |
| `object_storage`      | Upload and download of files and media                      | Uploads and downloads refuse; nothing else in a conversation is blocked                    | Point the adapter at the replica bucket, once one is provisioned              | Platform lead       | no recorded drill                                             |
| `artifacts`           | The separate renderer origin                                | Artifacts render in a same-origin frame with the narrower policy                           | Restore the static origin, or leave the degraded frame in place               | Platform lead       | no recorded drill                                             |
| `observability`       | Traces and metrics export                                   | Spans are dropped and the request is served; nothing waits on the exporter                 | Restore the OTLP endpoint; dropped spans are not recoverable                  | Platform lead       | no recorded drill                                             |
| `code_execution`      | Running code in a sandbox                                   | Code execution refuses and the turn says so; the conversation continues                    | Vendor recovery, or raise the quota                                           | Platform lead       | no recorded drill                                             |
| `model_providers`     | One provider's models, not the product                      | Routing fails over to another provider for the same model family                           | None needed; routing treats every provider as able to fail                    | Automatic           | no recorded drill                                             |
| `local_llm`           | Local inference on one operator device                      | The surface offers the cloud models instead and says the local one is not there            | Reinstall the runtime on that device                                          | The device's owner  | no recorded drill                                             |
| `context_engine`      | Context assembly for a turn                                 | It throws into the turn that asked, which is answered as a failed turn                     | Redeploy; it is in process and has no configuration of its own                | Platform lead       | no recorded drill                                             |
| `transactional_email` | Outbound email                                              | The send is queued on the email queue and retried to its dead letter                       | Restore the vendor, then drain the dead letter                                | Platform lead       | no recorded drill                                             |
| `web_search`          | Web search inside a turn                                    | The search tool answers unavailable and the turn is told to answer without it              | Vendor recovery, or declare a second provider in `web-search-providers.json`  | Platform lead       | no recorded drill                                             |
| `push_delivery`       | Device push notifications                                   | The notification stays in the in-app inbox and the email channel still sends               | Vendor recovery; nothing is lost from the inbox                               | Vendor              | no recorded drill                                             |
| `signaling`           | Pairing a device and remote or browser actions              | A remote or browser action is refused at admission rather than held                        | Redeploy the pairing service; it is promoted on its own                       | Platform lead       | no recorded drill                                             |
| `paired_browser`      | Browser actions on one reader's device                      | A browser action is refused and says the browser was not reachable                         | Reopen the browser and its extension on that device                           | The device's owner  | no recorded drill                                             |
| `connector_providers` | One connector's tools                                       | The connector tool refuses; a revoked grant is dropped and the reader is told to reconnect | Provider recovery, then the reader reconnects if the grant was revoked        | Vendor, then reader | no recorded drill                                             |
| `marketing_analytics` | Page analytics on public pages                              | The public pages render without it; nothing signed in is affected                          | None needed                                                                   | Automatic           | no recorded drill                                             |
| Serving               | The deployment itself                                       | Degraded mode per capability, rendered on /status                                          | Roll back to the previous production deployment                               | Platform lead       | `.github/workflows/db-restore-drill.yml` weekly, resolve only |

### RPO and RTO

These are the founder's to state. The table below is what the code can support,
so a published number can be chosen against it rather than invented.

| Asset        | Founder's target | What the code supports today                                                        |
| ------------ | ---------------- | ----------------------------------------------------------------------------------- |
| Database RPO | not stated       | Neon `history_retention_seconds` on the project; this repository does not record it |
| Database RTO | not stated       | Unmeasured. No production restore has been performed and no drill is timed          |
| Object RPO   | not stated       | One hour, and longer for a burst above 200 new objects or 200 deletions per run     |
| Object RTO   | not stated       | Unmeasured. The replica exists; no drill reads from it                              |
| Serving RTO  | not stated       | A rollback resolves in one workflow run; the drill resolves without acting          |

## Backup behaviour by synced object

One row per type in `SYNC_OBJECT_TYPES`
(`packages/contracts/types/src/sync/object-semantics.ts`), the registry that
decides where each type's bytes may live and how its deletion travels. The
`Bytes` and `Deletion` cells repeat that registry's `payload` and `deletion`
values, and `scripts/check-dr-recovery-table.mjs` fails when a type has no row,
when a row names a type the registry does not declare, or when either cell
disagrees with the registry, so this table cannot describe a type the code has
since moved.

Every row of every type is a Postgres row, so every type is recovered by the
same mechanism: Neon point-in-time restore inside the project's history window.
What differs is what a restore cannot reach, and what it does to a deletion made
after the recovery point.

| type               | Bytes             | Deletion           | What a restore cannot reach                                                 | A deletion made after the recovery point                                                      |
| ------------------ | ----------------- | ------------------ | --------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------- |
| `conversation`     | `cloud`           | `tombstone`        | Nothing beyond the database; attached files are replicated objects          | Comes back live; an erased account's conversations are re-erased by the erasure ledger replay |
| `message`          | `cloud`           | `tombstone`        | Nothing beyond the database; attached files are replicated objects          | Comes back live; an erased account's messages are re-erased by the erasure ledger replay      |
| `artifact`         | `cloud-or-device` | `tombstone`        | A copy held only on a device; the product copies device bytes nowhere       | Comes back live; an erased account's artifacts are re-erased by the erasure ledger replay     |
| `project`          | `cloud`           | `tombstone`        | Nothing beyond the database; knowledge files are replicated objects         | Comes back live; an erased account's projects are re-erased by the erasure ledger replay      |
| `project-metadata` | `cloud`           | `tombstone`        | Nothing beyond the database                                                 | Comes back live with its project                                                              |
| `memory`           | `cloud`           | `tombstone`        | Nothing beyond the database                                                 | Comes back live; an erased account's memories are re-erased by the erasure ledger replay      |
| `memory-controls`  | `cloud`           | `document-replace` | Nothing beyond the database                                                 | The document returns to its state at the recovery point                                       |
| `settings`         | `cloud`           | `document-replace` | Nothing beyond the database                                                 | The document returns to its state at the recovery point                                       |
| `task`             | `cloud`           | `tombstone`        | Nothing beyond the database                                                 | Comes back live                                                                               |
| `notification`     | `cloud`           | `server-expiry`    | Nothing beyond the database                                                 | Comes back until the server expires it again                                                  |
| `connector`        | `cloud`           | `hard-delete`      | The grant at the provider, which may have been revoked since                | The connection comes back; a revoked grant fails on use and the reader is told to reconnect   |
| `skill`            | `cloud-or-device` | `tombstone`        | A skill installed only on a device; the product copies device bytes nowhere | Comes back live                                                                               |
| `device`           | `cloud`           | `server-expiry`    | The device itself, which is not in the database                             | Comes back until the server expires it again                                                  |

Two things follow from the last column and are stated rather than covered.
A deletion a reader made after the recovery point is undone by a restore for
every `tombstone` type: the only deletions replayed after a restore are account
erasures, through `replayErasureTombstones`
(`apps/web/lib/server/erasure-tombstones.ts`), because the erasure ledger is the
only deletion record kept outside the Postgres timeline. And bytes that live
only on a device are outside every mechanism in this document; recovering them
is recovering that device.

## Vendor recovery is not product recovery

Every vendor in the table above publishes its own durability and availability
material. None of it is evidence about this product. A provider that serves from
many regions makes the provider resilient; it says nothing about whether this
deployment can be brought back, because recovery here depends on configuration,
credentials and dependency state that the provider does not hold.

Three things a restore needs beyond data, and where each one lives:

| Needed        | Where it lives                                                                 | What happens if it is lost                                      |
| ------------- | ------------------------------------------------------------------------------ | --------------------------------------------------------------- |
| Configuration | Deployment environment variables, classified in `apps/web/lib/validate-env.ts` | The deployment boots and core readiness fails closed            |
| Credentials   | The same environment, never the database and never this repository             | Each dependency reports unconfigured; nothing silently degrades |
| Dependencies  | `PRODUCTION_DEPENDENCIES`, with the keys each one requires                     | `unreadyCoreDependencies` names exactly what is missing         |

The recovery order that follows from this is data last, not first: restore the
environment, confirm `resolveDependencyReadiness` reports every core dependency
ready, and only then promote a restored database. A restored database promoted
into a deployment with missing credentials is an outage with a second cause.

## Who owns an incident

Incident ownership is the on-call responder at the time, resolved by
`responderAt` from `AGI_ONCALL_ROTATION`, escalating through
`primary`, `secondary` and `everyone` on elapsed minutes. The full process,
including severity and customer notice, is `docs/runbooks/incident-response.md`;
the four communication paths and what each depends on are
`docs/runbooks/incident-communication.md`.

This is a one-person operation. Both runbooks are written to be followed by
somebody who was not the author, because there is no second responder to ask,
and every environment variable an incident step needs is named in the step
rather than assumed.

## Known gaps, stated rather than covered

- No declared RPO or RTO commitment, for the reasons above.
- The scheduled restore test is the host-neutral one, against a fresh container.
  Neon point-in-time recovery on the real project has no scheduled test and no
  dated evidence.
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
