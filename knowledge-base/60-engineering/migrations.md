---
id: "ENG-migrations"
type: "engineering"
title: "Database migrations"
basis: "code inspection and project documents"
second_reader: "not challenged"
last_reviewed: "2026-11-24"
revision: "f51d16e747"
---
# Database migrations

Web database changes are numbered SQL files in apps/web/db/neon, applied by scripts/neon-migrate.mjs. Each file is checksummed (SHA-256) into a ledger table; an edited applied file is drift and blocks deploys. Guards check naming, destructive statements, expand/contract, transactions, grants and down files. CI applies to empty databases and staging; production is applied by hand with --confirm-production, and the deploy workflow only verifies.

## Purpose

The Web app (surface:web) keeps its Postgres schema on Neon. Every schema change is a numbered SQL file in `apps/web/db/neon/`. This page says how to write one, check it, apply it, and what is different in production. Desktop (Electron) loads the hosted web app, so it shares this database; the other apps reach it only through web APIs. [code] (AGENTS.md section 5; scripts/lib/neon-migrations.mjs:8)

Implementation status: the runner, guards, CI steps and workflows exist and are wired [code]. Verification status: no document in the repo records a run by me; I ran nothing. Recorded production state is `appliedThrough: 425` dated 2026-11-21 [code] (scripts/config/production-migrations-applied.json:3). The newest file is `0425_adult_eligibility.sql` [code] (directory listing).

## Procedure

**Write a migration**
1. Take the next number. Files must be named `NNNN_lower_snake_case.sql` and numbers must be contiguous from 0001 with no gaps; the loader throws otherwise. [code] (scripts/lib/neon-migrations.mjs:13, 62-70)
2. Do not add `BEGIN`/`COMMIT` yourself unless one block wraps the whole file. The runner wraps each file in one transaction with `lock_timeout 10s` and `statement_timeout 120s`. [code] (neon-migrations.mjs:181-185; scripts/check-neon-migrations.mjs:537-575)
3. Make the change in two steps (expand, then contract). The guard refuses a column rename, a table rename, `ADD COLUMN ... NOT NULL` with no default on an existing table, and adding and dropping columns on one table in one file. [code] (check-neon-migrations.mjs:~385-440)
4. If the file drops, truncates, deletes rows, retypes a column, sets NOT NULL on an existing table, or drops a policy/constraint/function/index it does not re-create, add a comment line `-- destructive: <why>`. A marker on a file that is not destructive is also an error. [code] (check-neon-migrations.mjs:~296-345)
5. Do not use `GRANT ... ON ALL TABLES IN SCHEMA public`; only 0037 may. Grant table by table. [code] (check-neon-migrations.mjs:~440-455)
6. New tables start with full rights for role `app_rls` (0037 default privileges). The privileges guard requires each new table above the applied watermark to name every privilege `app_rls` ends up with, and to have row-level security plus a policy, or a reason in `scripts/config/migration-table-privileges.json`. [code] (scripts/check-migration-table-privileges.mjs:1-45)
7. From 0097 on, add `down/<same name>.down.sql`: begin/commit, undo every object the up file touches, and end with `delete from public.schema_migrations where filename = '<up file>'`. [code] (apps/web/db/neon/down/README.md; check-neon-migrations.mjs:12, 140-215)
8. If web code reads the new table or column, the dependency guard fails until `scripts/config/migration-dependency-allowlist.json` names the file and migration number. [code] (docs/runbooks/release-rollback.md:43-46; scripts/check-migration-dependencies.mjs)

**Check:** run `pnpm check:neon-migrations`, `pnpm check:migration-dependencies`, `pnpm check:migration-table-privileges`, then `pnpm db:migrate -- inventory`.

**Apply locally:** export `AGI_DATABASE_URL` (or `DATABASE_URL` or `NEON_DATABASE_URL`) for a local database, then `pnpm db:migrate -- apply`. A localhost host infers target `local`. [code] (scripts/neon-migrate.mjs:86-120)

**Apply to production (by hand):** take a Neon backup branch, run `pnpm db:migrate -- apply --target production --confirm-production`, record the new number in `scripts/config/production-migrations-applied.json`, only then build and promote code. [requirement] (docs/runbooks/release-rollback.md:30-48)

**Fix a mistake in an applied file:** never edit it. Add a new migration. Prose corrections go in `apps/web/db/neon/CORRECTIONS.md`. [requirement] (CORRECTIONS.md:1-12)

## Commands

| Command | What it does | Source |
|---|---|---|
| `pnpm db:migrate -- inventory` | Counts files and prints first and latest. No database needed. | [code] (scripts/neon-migrate.mjs:196-207) |
| `pnpm db:migrate -- status` (default) | Prints applied, pending, drift counts. Read only. `--json` available. | [code] (neon-migrate.mjs:241) |
| `pnpm db:migrate -- apply --target T` | Takes a session advisory lock, creates the ledger if missing, refuses on drift, applies each pending file in its own transaction and inserts a ledger row in that transaction. | [code] (neon-migrations.mjs:172-218) |
| `pnpm db:migrate -- verify` | Fails on drift or any pending migration. No writes to the ledger. | [code] (neon-migrations.mjs:314-324) |
| `pnpm db:migrate -- record --surface web\|gateway --commit SHA --target T` | Runs verify, then upserts a row in `schema_migration_deployments` (head file, checksum, applied count, ledger digest). | [code] (neon-migrations.mjs:372-417) |
| `pnpm db:migrate -- deployments` | Lists recent deployment records (default limit 20). | [code] (neon-migrations.mjs:18; neon-migrate.mjs:260) |
| `pnpm db:migrate -- baseline --through N --reason --evidence --target branch\|production --confirm-baseline` | Marks files 1..N as applied without running them, only if the ledger is empty and every table those files create exists. | [code] (neon-migrations.mjs:259-312) |

Targets in the code are `local, ci, branch, staging, production`. `apply` and `baseline` swap a Neon `-pooler` host for the direct host, because a pooled connection cannot hold the advisory lock. [code] (neon-migrations.mjs:16; neon-migrate.mjs:31, 86-100)

Guards (root package.json): `check:neon-migrations` (also runs the runner's unit tests), `check:migration-dependencies`, `check:migration-table-privileges`, `test:db-migrate`. `check:neon-migrations` and the other two are inside `check:llm-operability`. [code] (package.json:201, 206, 209, 359-360, 397)

CI: the database job runs `test:db-migrate`, then `apply --target ci` twice (second run proves a re-run does nothing), then `verify`, then RLS and lease probes. [code] (.github/workflows/ci.yml:205-211)

## Rules and traps

- **The checksum chain.** Each file's SHA-256 is stored in `public.schema_migrations` (sequence, filename, checksum, mode apply or baseline). Drift means a changed filename, a changed checksum, an unknown ledger row, or a gap before an applied one. Any drift makes `apply`, `verify` and `record` throw. [code] (neon-migrations.mjs:74-115, 160-164)
- **A comment edit changes the checksum.** On 2026-08-24 a comment-only edit to 0087 blocked a deploy with nine migrations queued; the file was restored. [requirement] (apps/web/db/neon/CORRECTIONS.md)
- **Second checksum list.** `scripts/config/applied-migration-checksums.json` records the checksum of every file up to the applied watermark, so the dependency guard reports `changed after it was applied` before any database is touched. [code] (check-migration-dependencies.mjs:95-110)
- **Frozen waivers.** `UNMARKED_DESTRUCTIVE_BASELINE` (34 old files) and `STAGED_COMMIT_BASELINE` (0182, 0243, 0281) may shrink, never grow. [code] (check-neon-migrations.mjs:~300, 522-535)
- **Production is never migrated by the deploy workflow.** It runs `verify` before building and `record --target production --confirm-production` after deploy. A pending migration therefore blocks the deploy. [code] (.github/workflows/deploy-production.yml:329, 511-512; docs/runbooks/release-rollback.md:32-35)
- **Staging is migrated by workflow:** `apply --target staging` against the persistent staging database, so a migration meets real rows before production. [code] (.github/workflows/deploy-staging.yml:145)
- **Production needs `--confirm-production`;** `--target local` refuses a non-local host; baseline is only for branch or production. [code] (neon-migrate.mjs:107-120, 223-233)
- **Failure is rolled back.** A failing file rolls back its own transaction, so no partial schema and no ledger row. Files already applied in the same run stay applied. [code] (neon-migrations.mjs:179-212)
- **Down files restore the schema, never the rows.** Older than 0097 there is no reversal; undoing means a restore. The app does not run down files; the README describes the manual procedure. [code] (down/README.md; check-neon-migrations.mjs:12)
- **Non-transactional statements** (`CREATE INDEX CONCURRENTLY`, `VACUUM`, `ALTER TYPE ... ADD VALUE`) cannot sit in the runner's transaction; only down files may declare `-- non-transactional:`. [inferred] from check-neon-migrations.mjs:~100 and the runner's single transaction (neon-migrations.mjs:181)
- **Test against real Postgres.** Unit tests mock the adapter; `apps/web/db/neon/verify/README.md` gives a Docker recipe that applies each file in its own transaction, as the runner does. [requirement]
- **Recovery:** Neon point-in-time branch is the restore mechanism, no scheduled `pg_dump`. After a restore, run `status` on the restored branch; a recovery point older than the newest migration shows a gap, and you decide whether to apply forward. [requirement] (docs/runbooks/database-backup-restore.md:7, 97-102)
- **Policy:** do not add `middleware.ts`-style shortcuts; `apps/web/db/neon` is append-only and checksummed; production apply needs `--confirm-production`. [requirement] (AGENTS.md section 5)

## Where the canonical document is

| Question | Owner |
|---|---|
| Rules in short | AGENTS.md sections 5 and 12 (`pnpm db:migrate -- status`, `apply --target <env>`) |
| What the runner does | `scripts/neon-migrate.mjs` and `scripts/lib/neon-migrations.mjs` (code beats prose) |
| Static rules for new files | `scripts/check-neon-migrations.mjs` |
| Reversal files | `apps/web/db/neon/down/README.md` |
| Corrections to applied files | `apps/web/db/neon/CORRECTIONS.md` |
| Real Postgres test recipe | `apps/web/db/neon/verify/README.md` |
| Manual production deploy order | `docs/runbooks/release-rollback.md` ("Deploying by hand: migrations first") |
| Workflows | `docs/development/ci-and-deploys.md`, `.github/workflows/deploy-production.yml`, `deploy-staging.yml`, `ci.yml` |
| Backup and restore | `docs/runbooks/database-backup-restore.md` |
| Production watermark | `scripts/config/production-migrations-applied.json` |

Related knowledge pages: [unknown] I have no list of page ids; none cited.

## Gaps in the documents

- The runner help text and the runbook example list targets `local|ci|branch|production`, but the code also accepts `staging`, and the staging workflow uses it. [code] (neon-migrate.mjs:126 vs neon-migrations.mjs:16)
- `docs/architecture/overview.md:158` says migration 0422 is unapplied (`appliedThrough` 421), but the recorded watermark is 425. [code] (production-migrations-applied.json)
- `docs/development/ci-and-deploys.md:61` says the release operator must apply the chain before releasing the 0394 code; 0394 is below the 425 watermark, so this is historical.
- No document states who may run a production apply, or how the production connection string is held. [unknown]
- No document in the repo records a real production apply run or its timing. [unknown]
- The backup runbook does not say which retention window production uses; it says the repo does not record it. [requirement] (database-backup-restore.md:22)
- Whether the watermark file is updated by a script or by hand is only described as a manual step. [requirement] (release-rollback.md:39-40)

## Key facts

| Fact | Basis | Source |
|---|---|---|
| Migrations are plain SQL files in apps/web/db/neon named NNNN_lower_snake_case.sql, contiguous from 0001; the newest is 0425_adult_eligibility.sql. | read in the code | `scripts/lib/neon-migrations.mjs:13,62-70`; `apps/web/db/neon directory listing` |
| The runner is pnpm db:migrate, which runs scripts/neon-migrate.mjs; commands are inventory, status, apply, verify, baseline, record, deployments. | read in the code | `package.json:206`; `scripts/neon-migrate.mjs:20-28` |
| Each migration's SHA-256 checksum is stored in public.schema_migrations; any mismatch, renamed file, unknown row or gap is drift and stops apply, verify and record. | read in the code | `scripts/lib/neon-migrations.mjs:74-115,160-164` |
| Each pending file runs in its own transaction with lock_timeout 10s and statement_timeout 120s, and its ledger row is inserted in that same transaction. | read in the code | `scripts/lib/neon-migrations.mjs:181-200` |
| apply and baseline hold a session advisory lock and rewrite a Neon -pooler host to the direct host. | read in the code | `scripts/lib/neon-migrations.mjs:145-158`; `scripts/neon-migrate.mjs:86-100` |
| Mutating commands need --target (or AGI_MIGRATION_TARGET); production needs --confirm-production; local refuses a non-local host. | read in the code | `scripts/neon-migrate.mjs:107-120` |
| Connection string precedence is AGI_DATABASE_URL, DATABASE_URL, NEON_DATABASE_URL; the runner never prints it. | read in the code | `scripts/neon-migrate.mjs:86-88,134-137` |
| Valid targets are local, ci, branch, staging, production, but the help text omits staging. | read in the code | `scripts/lib/neon-migrations.mjs:16`; `scripts/neon-migrate.mjs:111,126` |
| The production deploy workflow only runs verify before the build and record after deploy; it never applies a migration to production. | read in the code | `.github/workflows/deploy-production.yml:329,511-512`; `docs/runbooks/release-rollback.md:32-35` |
| Staging applies pending migrations automatically against a persistent staging database before deploy. | read in the code | `.github/workflows/deploy-staging.yml:145` |
| CI applies the chain to an empty database twice (idempotence), then verifies and runs RLS and lease probes. | read in the code | `.github/workflows/ci.yml:205-211` |
| Recorded production watermark is appliedThrough 425, recorded 2026-11-21 at commit 57bf292f5d. | read in the code | `scripts/config/production-migrations-applied.json:3-5` |
| A destructive statement needs a '-- destructive: <why>' comment; 34 older files are frozen in UNMARKED_DESTRUCTIVE_BASELINE. | read in the code | `scripts/check-neon-migrations.mjs:~296-345` (not found) |
| Expand/contract is enforced: column or table rename, NOT NULL without default on an existing table, and add+drop column on one table in one file are errors. | read in the code | `scripts/check-neon-migrations.mjs:~385-440` (not found) |
| Files from 0097 on require a down file that begins with BEGIN, ends with COMMIT, undoes every object, and deletes its ledger row; 329 down files exist. | read in the code | `scripts/check-neon-migrations.mjs:12,140-215`; `apps/web/db/neon/down/README.md` |
| Only 0182, 0243 and 0281 may commit in stages; all other files must be one atomic block or have no transaction control. | read in the code | `scripts/check-neon-migrations.mjs:522-575` |
| GRANT ... ON ALL TABLES IN SCHEMA public is forbidden except in 0037; new tables must name every app_rls privilege and have RLS plus a policy. | read in the code | `scripts/check-neon-migrations.mjs:~440-455` (not found); `scripts/check-migration-table-privileges.mjs:1-45` |
| A second checksum list, applied-migration-checksums.json, lets check:migration-dependencies fail an edited applied file without a database. | read in the code | `scripts/check-migration-dependencies.mjs:95-110` |
| Web code that reads a table or column from an unapplied migration needs an entry in migration-dependency-allowlist.json (currently empty). | read in the code | `docs/runbooks/release-rollback.md:43-46`; `scripts/config/migration-dependency-allowlist.json` |
| Editing 0087 by comment only in 2026-08 caused drift that blocked a deploy; corrections to applied files go in CORRECTIONS.md. | stated requirement | `apps/web/db/neon/CORRECTIONS.md` |
| record writes public.schema_migration_deployments, unique per (surface, target, commit_sha), surfaces web and gateway. | read in the code | `scripts/lib/neon-migrations.mjs:335-353,372-417` |
| baseline needs an empty ledger, --through N, --reason, --evidence, --confirm-baseline, and every table those files create must already exist. | read in the code | `scripts/lib/neon-migrations.mjs:259-275`; `scripts/neon-migrate.mjs:223-233` |
| Restore uses Neon point-in-time branches; there is no scheduled pg_dump; after restoring, run migrate status to see gaps. | stated requirement | `docs/runbooks/database-backup-restore.md:7,97-102` |
| Manual production deploy order: backup branch, apply with --confirm-production, update the watermark file, then build and promote code. | stated requirement | `docs/runbooks/release-rollback.md:30-48` |
| A rollback of code does not undo a migration. | stated requirement | `docs/runbooks/release-rollback.md:47-48,108` |
| Real execution of any migration command by this author: none; no run is recorded in the repo for this page. | unknown | `read-only task` (not found) |

## Open questions

- Who is allowed to run a production apply, and how is the production connection string supplied? Not stated in the repo.
- Is production-migrations-applied.json updated by a script or by hand after each apply? The runbook only says to record it.
- Which Neon history retention window does production use? The runbook says the repo does not record it.
- Do non-web surfaces (gateway) have their own migrations? DEPLOYMENT_SURFACES lists gateway, but I found no separate chain.
- Non-transactional statements (CONCURRENTLY) in up files: the runner always wraps a file in a transaction, so how such a change should ship was not established.
- I ran nothing, so no command here is verified by execution.

## Project documents found out of date

- `docs/architecture/overview.md`: Line 158 says migration 0422 is unapplied (appliedThrough 421) as of 2026-11-15. The code says: The recorded production watermark is 425, recorded 2026-11-21. (scripts/config/production-migrations-applied.json:3-4)
- `scripts/neon-migrate.mjs help text (printHelp)`: Lists targets local|ci|branch|production. The code says: MIGRATION_TARGETS also includes staging, used by the staging workflow. (scripts/lib/neon-migrations.mjs:16; .github/workflows/deploy-staging.yml:145)
- `docs/development/ci-and-deploys.md`: Lines 61-62 present migration 0394 as pending work for the release operator. The code says: 0394 is below the recorded applied watermark of 425, so it is historical. (scripts/config/production-migrations-applied.json:3)
