---
id: "ENG-recovery"
type: "engineering"
title: "Recovery"
basis: "code inspection and project documents"
second_reader: "not challenged"
last_reviewed: "2026-11-24"
revision: "f51d16e747"
---
# Recovery

Recovery in AGI Workforce is a set of runbooks plus code. Web rollback re-points Vercel to an older deployment (scripts/release/rollback.mjs); it never reverts the database. The database is restored with Neon point-in-time branches, then the erasure ledger is replayed before promotion. Incidents page through one dispatcher. Breach notice clocks are in a draft runbook. Users can restore soft-deleted chats, media and memories within 30 days.

## Purpose

This page tells an engineer or an LLM how AGI Workforce recovers from six kinds of trouble, and which code and documents back each one. Every claim has a basis tag. [code] means a file line was opened. [requirement] means a project document states it. [inferred] means reasoned from code. [unknown] means not established.

Important scope fact: almost all recovery is a **web server and cloud database** matter. The six apps (surface:web, surface:desktop, surface:mobile, surface:cli, surface:vscode, surface:chrome) talk to one hosted backend, so the web rollback and database restore reach every app on the next request [requirement] (docs/runbooks/release-rollback.md:164). Data held only on a device (mode:local) is outside every server mechanism [requirement] (docs/runbooks/business-continuity.md, section 'Backup behaviour by synced object'). Local mode data never reaches the servers, which narrows breach scope [requirement] (docs/runbooks/personal-data-breach.md, section 3).

Implementation status and verification status are kept apart. Code exists for most paths. Real runs recorded in documents are few: one Neon drill (2026-09-19), one local logical drill (2026-09-05), and weekly CI drills that touch no production data [requirement] (docs/runbooks/database-backup-restore.md:513-521). No production restore has ever been performed [requirement] (docs/runbooks/business-continuity.md, 'Recovery time').

## Procedure

### 1. Roll back a release (web)
1. Look at `/admin/releases` (platform operators only) or `GET /api/admin/releases`. It shows the serving commit, the migration ledger match, `public.release_events` and the audit hash chain [requirement] (docs/runbooks/release-rollback.md:22-35). Route files exist: apps/web/app/admin/releases/page.tsx and apps/web/app/api/admin/releases/route.ts [code].
2. Dispatch the workflow **Deploy Production Surfaces** with `rollback` true and a `rollback_reason`. `rollback_to` is optional; empty picks the newest READY production deployment created before the one now serving [code] (.github/workflows/deploy-production.yml:15-25; scripts/release/rollback.mjs:162-207). Approve the `production-web` environment [requirement] (release-rollback.md:73-74).
3. The job builds nothing. It calls Vercel `POST /v1/projects/{projectId}/rollback/{deploymentId}` [code] (scripts/release/rollback.mjs:219), appends a `rolled_back` row via `public.append_release_event` [code] (rollback.mjs:231), then re-runs `scripts/verify-deployment.mjs` against the apex [requirement] (release-rollback.md:76-81).
4. If GitHub Actions is down, or the workflow is disabled, run `node scripts/release/rollback.mjs --reason "..."` from a laptop with the Vercel and database variables set. Without `AGI_DATABASE_URL` the act is not audited [requirement] (release-rollback.md:102-111). `--reason` is required [code] (rollback.mjs:44).
5. The runbook says the workflow has been disabled in GitHub Actions since 2026-11-11 and production is deployed by hand with the Vercel CLI, so it must be enabled first [requirement] (release-rollback.md:61-63). Whether it is enabled now is [unknown].
6. The rollback does not revert the database, and the daily `production-drift` alarm stays red until a fix lands on main [requirement] (release-rollback.md:113-121).

**Deploying by hand:** apply migrations first (Neon backup branch, then `pnpm db:migrate -- apply --target production --confirm-production`, record the number in `scripts/config/production-migrations-applied.json`), and only then promote code [requirement] (release-rollback.md:37-55).

**Mobile and extensions:** a shipped mobile binary cannot be rolled back. Use, fastest first: web rollback; a kill switch (`apps/web/lib/feature-flags/kill-switches.ts`); a version disable (`apps/web/lib/feature-flags/version-disable.ts`); an over-the-air JavaScript update via `expo-updates`; a new store binary; or a raised minimum contract version. That last lever shows a generic error on mobile, not an update prompt, so prefer a version disable [requirement] (release-rollback.md:156-178). Both flag files exist [code].

### 2. Restore the database
The mechanism is a Neon point-in-time branch. There is no `pg_dump` schedule and no backup under Neon's history window [requirement] (docs/runbooks/database-backup-restore.md:185-212).
1. Check `history_retention_seconds` in the Neon console or API. The repository does not record it. One drill saw 21,600 seconds; Neon's default is 86,400 [requirement] (database-backup-restore.md:199-208, 519-521).
2. Pick the last known-good time in RFC 3339 form.
3. Make a disposable branch with `scripts/db-restore-drill.mjs --at=<time> --keep`. It only creates branches and never prints a connection string [requirement] (database-backup-restore.md:231-244).
4. Point ONE preview deployment at the branch via `AGI_DATABASE_URL`. Remove `RESEND_API_KEY` from that preview so no real email is sent. Run `node scripts/verify-deployment.mjs <preview url>` [requirement] (database-backup-restore.md:246-270).
5. Run `node scripts/neon-migrate.mjs status` against the branch to find a migration gap.
6. Replay the erasure ledger: call `/api/cron/purge-deleted-accounts` then `/api/cron/drain-background-jobs` on the preview with the object backup variables set. Do not promote until a purge run re-arms nothing and reports `resurrected` 0. This is `isSafeToPromote` [code] (apps/web/lib/server/erasure-tombstones.ts:328) and the step gates promotion [requirement] (database-backup-restore.md:283-335).
7. Promote with the in-place restore `POST /projects/{id}/branches/{id}/restore` and `preserve_under_name` set. Connection strings do not change. Never run the in-place restore as a first attempt [requirement] (database-backup-restore.md:337-355).
8. On production, run `/api/cron/reconcile-billed-plans` and `/api/cron/reconcile-credits`. They report divergence from the payment provider and do not heal it [requirement] (database-backup-restore.md:357-379).
9. Encrypted rows need the old key: put it in `<NAME>_RETIRED` and run the `scripts/reencrypt.mjs` sweep. Otherwise `connector_oauth_grants`, `user_custom_connectors`, `github_installations` and `user_two_factor` rows stay unreadable [requirement] (database-backup-restore.md:381-391).

**Host swap:** `AGI_DATABASE_PROVIDER` chooses `neon` (default) or `postgres`; the logical drill `scripts/db-restore-drill-logical.mjs` proves the dump and restore path [requirement] (database-backup-restore.md:393-505).

### 3. Respond to an incident
1. Detection: `/api/cron/health-probe` every 10 minutes (pages after two consecutive misses, so up to 20 minutes), `evaluate-slo-burn` at :05 and :35, `page-security-anomalies` every 30 minutes, `reconcile-credits` daily, `remind-free-quota-renewal` hourly [requirement] (incident-response.md:14-41). Schedules for health-probe, evaluate-slo-burn and others match vercel.json [code] (vercel.json:110,114).
2. Alert path: `apps/web/lib/server/incident/dispatch.ts` sends email (Resend), then the `PAGER_WEBHOOK_URL` webhook, then the `INCIDENT_CHANNEL_WEBHOOK_URL` webhook. With none delivered, the probe returns HTTP 500 [requirement] (incident-response.md:44-70). Files in apps/web/lib/server/incident/ exist: dispatch.ts, on-call.ts, pager.ts, out-of-band.ts [code].
3. Escalation: level 1 on-call, level 2 after `AGI_ONCALL_ESCALATE_AFTER_MINUTES` (15), level 3 everyone after twice that [requirement] (incident-response.md:72-90).
4. Triage by failing check: database, cache, search/vector, environment, stripe, probe_failed, credit settlement drift [requirement] (incident-response.md:155-285). Database and cache outages page as CRITICAL; Stripe and retrieval are WARNING only.
5. If the release caused it, revert first (procedure 1).
6. Update `/status` (apps/web/app/status/page.tsx [code]) and send the availability notice from the template in incident-response.md:104-125.
7. Do not call it resolved until the reconcilers that apply have run clean (see Commands).
8. Blameless postmortem within five working days from `docs/runbooks/incident-postmortem-template.md`. Each follow-up becomes a row in `audit/prior-audits/active-issues-register.md` or `audit/registers/known-flaws.md`. A repeat cause needs a decision record under `docs/decisions/` [requirement] (incident-response.md:330-355).

### 4. Handle a personal data breach
The runbook is a draft, not reviewed by counsel (`Legal review: pending-counsel`) [requirement] (personal-data-breach.md header).
1. Start the clock at first awareness, not at confirmation. Declare in writing with a timestamp and name one owner (the founder by default) [requirement] (personal-data-breach.md section 1-2).
2. Preserve evidence BEFORE remediating: Vercel logs, a `security_audit_logs` snapshot (purged at 90 days), a Neon dump or branch, the deployment SHA and migration head. Then contain.
3. Scope the breach with the questions in section 3.
4. Notify the Data Protection Board 'without delay' and each affected person 'without delay'; the detailed Board report is due within 72 hours. Neither notice waits for legal review. GDPR has its own 72-hour clock where it applies.
5. Mail reality: single-account mail exists. `sendBulkTransactionalEmail` exists as a tested primitive with no production caller and no operator entry point, so a bulk notice is a script an engineer writes on the day. No in-product notice to a set of users exists. Do not promise users an email [requirement] (personal-data-breach.md section 5).
6. Review within five working days; record durable defects in `audit/registers/known-flaws.md`.

### 5. Continue the business through an outage
The continuity page lists, for each production dependency, what is lost, what the code does and who recovers it. Order: restore environment and credentials first, confirm every core dependency is ready, and promote a restored database last [requirement] (business-continuity.md, 'Recovery by dependency' and 'Vendor recovery is not product recovery'). Key degraded behaviours: model provider outage fails over to another provider for the same family; billing outage keeps serving entitlements from the ledger; cache outage fails closed so turns refuse; object storage outage refuses uploads and downloads only; local inference on a device is unaffected by our servers [requirement] (same table). This is a one-person operation with no 24/7 rotation, no declared RPO or RTO and no second region [requirement] (business-continuity.md, 'Known gaps').

### 6. Restore a user's deleted data (where the product allows it)
| Thing | How it comes back | Window | Basis |
| --- | --- | --- | --- |
| Chat conversation | `POST /api/chat/conversations/{id}/restore` sets `deleted_at` to null for the caller's own row | 30-day recovery window is the policy value | [code] (apps/web/app/api/chat/conversations/[id]/restore/route.ts; apps/web/lib/resources/deletion-policies.ts:12) |
| Media asset | `restoreMediaAsset`, via the `/api/media` route | Only if deleted within 30 days | [code] (apps/web/lib/server/media-assets.ts:711-723; apps/web/app/api/media/route.ts:82) |
| Memory | `/api/memory/{id}/restore` | not read | [code] route exists (apps/web/app/api/memory/[id]/restore/route.ts); window [unknown] |
| Custom agent | `/api/custom-agents/{id}/restore` | not read | [code] route exists; window [unknown] |
| Account scheduled for deletion | Cancel via `/api/user/delete-account/cancel` or `/cancel-schedule` before the deadline. Deletion is scheduled 24 hours ahead | 24 hours | [code] (apps/web/app/api/user/delete-account/route.ts:481; cancel routes listed) |
| Workspace scheduled for deletion | `/api/settings/organization/deletion/cancel` | before the deadline | [code] route exists |
| Erased account | Not recoverable. The erasure ledger exists to keep it erased, even after a database restore | none | [requirement] (database-backup-restore.md:286-336) |

The web UI for deleted chats is apps/web/features/settings/sections/DeletedChatsSection.tsx [code]. Whether desktop, mobile and the extensions show a restore control: only a string match in apps/desktop/src/stores/chat/chatStore.ts and apps/extension/src/features/privacy/dataHandling.ts was seen; [unknown].

An operator cannot restore a single user's rows from Neon in place: a database restore returns every user's tombstoned deletions to live [requirement] (business-continuity.md, synced-object table). A per-user restore from a branch is [proposed], not documented.

### 7. Operator access during recovery (break-glass)
Holding credentials is not access. Reading one workspace needs a grant requested through `POST /api/admin/support-access` (`action: request`, at least a 20 character reason, scopes, ticket) and approved by a DIFFERENT platform operator. A grant lasts at most eight hours and defaults to one hour, enforced by a check constraint. Every transition and every refused read lands in the append-only, hash-chained `support_access_events` [requirement] (break-glass-production-access.md). The route exists [code] (apps/web/app/api/admin/support-access/route.ts).

## Commands

Names only. Never put values in notes.

| Purpose | Command or call | Source |
| --- | --- | --- |
| Roll back web (laptop) | `node scripts/release/rollback.mjs --reason "<why>" [--dry-run] [--to dpl_...]` | [code] scripts/release/rollback.mjs:34-44 |
| Rollback drill (never acts) | `node scripts/release/rollback.mjs --drill` | [code] rollback.mjs:35 |
| Apply production migration | `pnpm db:migrate -- apply --target production --confirm-production` | [requirement] release-rollback.md:44-47 |
| Check migration ledger | `pnpm db:migrate -- verify`; `node scripts/neon-migrate.mjs status` | [requirement] |
| Disposable restore branch | `node scripts/db-restore-drill.mjs --at=<RFC3339> --keep` (needs `NEON_API_KEY`, `NEON_PROJECT_ID`) | [requirement] database-backup-restore.md:236-239 |
| Host-neutral drill | `node scripts/db-restore-drill-logical.mjs` (needs `AGI_RESTORE_DRILL_SOURCE_URL`, `AGI_RESTORE_DRILL_TARGET_ADMIN_URL`) | [requirement] |
| Verify a deployment | `node scripts/verify-deployment.mjs <url>` | [requirement] |
| Re-encrypt after restore | `scripts/reencrypt.mjs` sweep, old key in `<NAME>_RETIRED` | [requirement] |
| Run a reconciler | `curl -H "Authorization: Bearer $CRON_SECRET" https://<deployment>/api/cron/<name>` | [requirement] incident-response.md:268-271 |
| Alert path test | invoke `/api/cron/health-probe` twice on a preview with DB variables removed | [requirement] incident-response.md:355-385 |
| Probe logic tests | `pnpm --filter @agiworkforce/web exec vitest run app/api/cron/health-probe lib/server/incident` | [requirement] |

Reconcilers to run before closing a data incident: reconcile-credits, reconcile-billed-plans, recover-reservations, reconcile-provider-costs, purge-deleted-accounts, replicate-object-backups, drain-background-jobs [requirement] (incident-response.md:238-248). All seven exist as cron directories [code] (apps/web/app/api/cron/).

Per the project rules heavy local jobs go through `scripts/dev/heavy-job.sh`. This page ran none.

## Rules and traps

- A web rollback never undoes a migration. Code written against a new column breaks until the migration is applied, so migrations go first [requirement] (release-rollback.md:50-55).
- The rollback floor file `scripts/config/rollback-floor.json` currently holds `{"web": null}` [code], so no floor is enforced yet. Once set, rollback refuses older targets, and a floor file it cannot read stops the rollback [code] (rollback.mjs:111-207).
- 'Newest READY deployment' is the wrong target after an earlier rollback; the script picks the newest one created BEFORE the one serving [code] (rollback.mjs:162).
- `public.release_events` is append-only and hash chained; UPDATE is refused, DELETE only after 400 days [requirement] (release-rollback.md:137-147).
- Never first-attempt the in-place Neon restore. Branch, verify, then promote with `preserve_under_name`.
- Erasure ledger replay gates promotion. The ledger copy lives in the object backup bucket at `erasure-ledger/tombstones.ndjson`; an unreadable ledger fails closed, because an empty and an unreadable ledger look the same and promoting would resurrect erased accounts [requirement] (database-backup-restore.md:293-335).
- A restore undoes user deletions made after the recovery point for every tombstone type; only account erasures are replayed [requirement] (business-continuity.md).
- The preview that serves a restored branch holds real emails: drop `RESEND_API_KEY`, never use a live payment credential, scope the variable to one preview.
- Backups: object replication is off until four `AGI_STORAGE_BACKUP_*` variables are set. A second bucket on the same endpoint is a copy, not a disaster-recovery copy (`crossRegion` flag) [requirement] (database-backup-restore.md:534-550; business-continuity.md).
- Soft-delete purge is OFF unless `SOFT_DELETED_RESOURCE_PURGE_ENABLED` is true [code] (apps/web/app/api/cron/purge-soft-deleted-resources/route.ts:14-16). Media purge runs daily at 04:00 with a 30-day window [code] (vercel.json:82; apps/web/app/api/cron/purge-deleted-media/route.ts:35). Whether the flag is on in production is [unknown].
- Legal holds can preserve rows past their window [code] (purge-soft-deleted.ts imports legal-hold-gate; docs/runbooks/legal-hold.md exists, not read).
- Health pages: `degraded` (Stripe, retrieval) must not page as a platform outage; cache loss does page because limits fail closed [requirement] (incident-response.md:93-118).
- Never claim a cause, availability number or date that is unconfirmed in customer notices [requirement].
- Breach: do not rotate credentials or redeploy before logs are captured; there is no materiality threshold; loss of availability counts; legal review does not pause sending [requirement].
- Trust boundaries: recovery tools must never move Local data to BYOK or cloud. Nothing here does; no recovery path reads device-only data [inferred].
- Mobile forced-update refusal is not understood by `apps/mobile/services/api.ts` today [requirement] (release-rollback.md:172-178); not re-verified in code.

## Where the canonical document is

| Question | Canonical document |
| --- | --- |
| Release rollback, rollback floor, drill, audit trail, mobile levers | docs/runbooks/release-rollback.md |
| Database restore, erasure replay, object backups, host swap, drill log | docs/runbooks/database-backup-restore.md |
| Detection, alerting, on-call, severity, triage, reconcilers, postmortem | docs/runbooks/incident-response.md |
| Incident communication paths | docs/runbooks/incident-communication.md (not read) |
| Postmortem template | docs/runbooks/incident-postmortem-template.md (not read) |
| Breach clocks and notice templates | docs/runbooks/personal-data-breach.md |
| Dependency recovery table, RPO and RTO status | docs/runbooks/business-continuity.md |
| Operator access and offboarding | docs/runbooks/break-glass-production-access.md |
| Legal hold | docs/runbooks/legal-hold.md (not read) |
| Encryption key restore | docs/security/security.md section 3 (not read) |
| Open gaps | audit/blockers/31-database-backup-restore-open-gaps.md, 34-business-continuity-open-gaps.md, 37-personal-data-breach-open-gaps.md (not read); audit/registers/known-flaws.md |
| Deletion policy per resource | apps/web/lib/resources/deletion-policies.ts [code] |

Related knowledge pages: not named in this task; link by id when known.

## Gaps in the documents

- No declared RPO or RTO. Database RPO depends on a Neon setting the repository does not record. No production restore has been done, and recovery time is unmeasured [requirement] (business-continuity.md).
- The Neon point-in-time drill against the real project is in no workflow, leaves no stored attestation, and ran once by hand (2026-09-19). Key rotation drill is likewise unscheduled.
- Most dependency rows say 'no recorded drill'.
- The breach runbook is unreviewed by counsel; no bulk-notice operator tool, no in-product notice, no public notice route; the breach notice drill has never run. The subprocessors page is described as incomplete.
- The DPA customer notice has no approved template.
- Release rollback: no recorded real production rollback; whether the workflow is enabled is unclear since the runbook says it is disabled.
- No documented per-user restore of deleted data from a database branch; user restore is only the product restore routes.
- Windows for memory and custom agent restore are not documented in the runbooks.
- Which apps expose restore controls is not documented in these runbooks.
- No second region or provider; no 24/7 rotation.
- Mobile app does not display a forced-update refusal (recorded gap).

## Key facts

| Fact | Basis | Source |
|---|---|---|
| Web rollback is a workflow dispatch or a laptop script that re-points Vercel to an earlier READY deployment; it builds nothing and does not revert the database. | read in the code | `scripts/release/rollback.mjs:219`; `docs/runbooks/release-rollback.md:76-81,113-117`; `.github/workflows/deploy-production.yml:15-25` |
| Rollback requires a reason (--reason) and records a rolled_back row in public.release_events via append_release_event; without AGI_DATABASE_URL the act is not audited. | read in the code | `scripts/release/rollback.mjs:44,231`; `docs/runbooks/release-rollback.md:102-111` |
| The rollback floor file currently holds {"web": null}, so no floor is enforced; once written, older targets are refused. | read in the code | `scripts/config/rollback-floor.json`; `scripts/release/rollback.mjs:111-207` |
| The runbook says Deploy Production Surfaces has been disabled in GitHub Actions since 2026-11-11 and production is deployed by hand with the Vercel CLI; current state of the workflow is unknown. | stated requirement | `docs/runbooks/release-rollback.md:61-63` |
| A weekly Recovery Drills workflow runs a logical restore drill (Mondays 05:13 UTC) and a rollback drill that only resolves the target; the drill flags stale after 35 days in /admin/releases. | stated requirement | `docs/runbooks/release-rollback.md:123-133`; `docs/runbooks/database-backup-restore.md:444-451`; `.github/workflows/db-restore-drill.yml:5,16,87` |
| Database recovery is Neon point-in-time branching; no pg_dump schedule and no backup beneath Neon's history window; the repository does not record the window. | stated requirement | `docs/runbooks/database-backup-restore.md:185-212`; `docs/runbooks/business-continuity.md` |
| Production restore uses the in-place Neon branch restore with preserve_under_name only after a disposable branch has been verified; connection strings do not change. | stated requirement | `docs/runbooks/database-backup-restore.md:221-227,337-355` |
| Promotion of a restored database is gated on the erasure ledger replay: no subject re-armed and resurrected = 0 (isSafeToPromote). | read in the code | `apps/web/lib/server/erasure-tombstones.ts:328`; `docs/runbooks/database-backup-restore.md:328-335` |
| The erasure ledger is mirrored to the object backup bucket at erasure-ledger/tombstones.ndjson and replayed by /api/cron/purge-deleted-accounts (daily 04:07 UTC). | stated requirement | `docs/runbooks/database-backup-restore.md:293-299`; `vercel.json:90` |
| Only one real Neon restore drill (2026-09-19, PASS) and one local logical drill (2026-09-05) are recorded; no production restore has ever been performed; RTO is unmeasured and no RPO or RTO is declared. | stated requirement | `docs/runbooks/database-backup-restore.md:513-521`; `docs/runbooks/business-continuity.md` |
| Object storage replication to an independent backup bucket runs hourly at minute 6, 200 objects per run, and does nothing until four AGI_STORAGE_BACKUP_* variables are set. | read in the code | `vercel.json:118`; `docs/runbooks/business-continuity.md`; `apps/web/app/api/cron/replicate-object-backups/route.ts` |
| Incidents reach people only through apps/web/lib/server/incident/dispatch.ts: email via Resend, then pager webhook, then incident channel webhook; if none delivers, the probe returns HTTP 500. | stated requirement | `docs/runbooks/incident-response.md:44-70`; `apps/web/lib/server/incident/dispatch.ts exists` |
| Health probe runs every 10 minutes and pages after two consecutive misses; SLO burn evaluates at :05 and :35. | read in the code | `vercel.json:110,114`; `docs/runbooks/incident-response.md:28-35` |
| Escalation has three levels (on-call, plus next, everyone), with a 15-minute default step, held in the key-value store for six hours. | stated requirement | `docs/runbooks/incident-response.md:72-90` |
| Stripe and retrieval outages are WARNING/degraded; database, cache and probe failures are CRITICAL; a cache outage makes turns refuse because limits fail closed. | stated requirement | `docs/runbooks/incident-response.md:93-118` |
| Before closing a data incident, seven reconcilers must be run against the serving deployment; an HTTP 500 means it did not finish. | stated requirement | `docs/runbooks/incident-response.md:238-266` |
| Severity 1 and 2 incidents need a blameless postmortem within five working days; a repeat cause needs a decision record under docs/decisions/. | stated requirement | `docs/runbooks/incident-response.md:330-355` |
| The personal data breach runbook is a draft pending counsel review; the clock starts at first awareness; Board and individual notice are both 'without delay'; detailed report within 72 hours; legal review does not hold sending. | stated requirement | `docs/runbooks/personal-data-breach.md header, sections 1, 4, 5` |
| Bulk breach mail has a tested primitive (sendBulkTransactionalEmail) but no production caller or operator entry point; no in-product notice to a set of users exists; the breach drill has never been run. | stated requirement | `docs/runbooks/personal-data-breach.md section 5 and 7` |
| Local mode data never reaches our servers, so a server breach cannot expose it; BYOK keys are encrypted on-device. | stated requirement | `docs/runbooks/personal-data-breach.md section 3` |
| Operator access to a workspace needs a grant approved by a different operator, max eight hours, logged in append-only hash-chained support_access_events. | stated requirement | `docs/runbooks/break-glass-production-access.md`; `apps/web/app/api/admin/support-access/route.ts exists` |
| A user can restore a deleted chat via POST /api/chat/conversations/{id}/restore, which clears deleted_at on the caller's own row. | read in the code | `apps/web/app/api/chat/conversations/[id]/restore/route.ts` |
| Deleted media can be restored only if deleted within 30 days; the policy recovery window for soft-deletable resources is 30 days. | read in the code | `apps/web/lib/server/media-assets.ts:711-723`; `apps/web/lib/resources/deletion-policies.ts:12` |
| Hard purge of soft-deleted resources is off unless SOFT_DELETED_RESOURCE_PURGE_ENABLED is true; it runs daily at 04:10 UTC and respects legal holds. | read in the code | `apps/web/app/api/cron/purge-soft-deleted-resources/route.ts:14-16`; `vercel.json:86` |
| Account deletion is scheduled 24 hours ahead and can be cancelled before the deadline; erased accounts are not recoverable. | read in the code | `apps/web/app/api/user/delete-account/route.ts:481`; `apps/web/app/api/user/delete-account/cancel/route.ts exists` |
| A database restore returns post-recovery-point user deletions to live for tombstone types; only account erasures are replayed; device-only bytes are outside every mechanism. | stated requirement | `docs/runbooks/business-continuity.md synced-object table` |
| A shipped mobile binary cannot be rolled back; levers are kill switch, version disable, expo-updates OTA, store release, or minimum contract version, and the last gives mobile users a generic error. | stated requirement | `docs/runbooks/release-rollback.md:156-178`; `apps/web/lib/feature-flags/version-disable.ts exists` |
| Restored encrypted rows need the key active at the recovery point supplied as <NAME>_RETIRED and a reencrypt sweep, or connector grants, custom connectors, GitHub installations and 2FA rows stay unreadable. | stated requirement | `docs/runbooks/database-backup-restore.md:381-391` |
| AGI_DATABASE_PROVIDER selects neon (default) or postgres, making a host swap a configuration change; the logical drill proves dump and restore portability. | stated requirement | `docs/runbooks/database-backup-restore.md:479-486` |

## Open questions

- Is the Deploy Production Surfaces workflow enabled now, or is production still deployed only by hand with the Vercel CLI?
- What is the Neon history_retention_seconds of the production project today? (One drill saw 21,600 seconds on 2026-09-19.)
- Is SOFT_DELETED_RESOURCE_PURGE_ENABLED set in production, and are soft-deleted rows therefore still kept forever?
- What are the recovery windows for memory restore and custom-agent restore (routes read only by name)?
- Do desktop, mobile, CLI, VS Code and Chrome show any restore control for deleted chats, or is it web only?
- Does the account-deletion 24-hour deadline match the documented grace in the privacy pages, and is the Sign in with Apple note shown on all apps?
- Has apps/mobile/services/api.ts since started recognising CLIENT_UPDATE_REQUIRED (not re-verified)?
- Founder has not stated RPO or RTO; no second region or provider is planned in any document read.
- Is there any admin tool to restore one user's deleted rows from a Neon branch without a full restore? None found.
- Do the runbooks for legal hold, incident communication and security.md section 3 change any recovery step? Not read.
- Does the web UI on other apps expose the cancel path for a scheduled account deletion? Not checked beyond web routes.

## Project documents found out of date

- `docs/runbooks/release-rollback.md`: Nothing found contradicting code; however the statement that the rollback workflow is disabled cannot be confirmed, and the intro says the only rollback was an in-job step until 2026-09-18, while that in-job step still exists. The code says: deploy-production.yml still contains a failure() rollback step using vercel rollback, alongside the dispatch inputs and a rollback-web job. (.github/workflows/deploy-production.yml:515-525,15-25,819)
- `docs/runbooks/personal-data-breach.md`: Last updated 2026-10-03; its claims that no admin route or script calls sendBulkTransactionalEmail and that no in-product or public notice route exists were not re-verified against current code. The code says: Not re-checked in code in this pass; treat as unverified rather than wrong. (docs/runbooks/personal-data-breach.md section 5 (header date 2026-10-03))
