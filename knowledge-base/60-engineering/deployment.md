---
id: "ENG-deployment"
type: "engineering"
title: "Deployment"
basis: "code inspection and project documents"
second_reader: "not challenged"
last_reviewed: "2026-11-24"
revision: "f51d16e747"
---
# Deployment

The web app is a Next.js project on Vercel. Today the owner deploys it by hand with the pinned Vercel CLI; the automatic production and staging workflows exist but are disabled in GitHub. Migrations are applied by hand first, then code ships; the workflow only verifies the schema. Rollback moves code only, never the database. Signaling auto-deploys to Railway after green CI. Clients ship by tag.

## Purpose

This page says how the AGI Workforce web app (surface:web) and its services reach production, who does it, which environments exist, in what order migrations and code go out, and what an agent must never do without the owner.

Key idea: there are two things to keep apart.

- **Implementation status** (is the code there): full workflows for staging, production, rollback and signaling exist in `.github/workflows/`.
- **Operating status** (what is switched on): `Deploy Production Surfaces` and `Deploy Staging Web` are disabled in GitHub, so production web is deployed by hand. [requirement] (docs/development/ci-and-deploys.md:8-15), (docs/architecture/release-architecture.md:18-30). I could not read GitHub's live workflow state from the repo, so 'disabled' is a documented claim, not something I verified. [unknown]

Related pages: SYS-chat-turn-pipeline is unrelated to deploys; no other deploy page id was provided.

## Procedure

### A. What production does today (manual path)

1. Code is on `main` and CI is green for that exact commit. The required workflows are `CI`, `CodeQL analysis`, `Priority Level 1 tests`, `Security scanning`; the list is owned by `scripts/config/deploy-gates.json` (releaseReadiness.workflows). [code] (scripts/config/deploy-gates.json)
2. The owner (or an agent the owner told, in that message) takes a Neon backup branch of production, then applies pending migrations: `pnpm db:migrate -- apply --target production --confirm-production`. Then records the applied-through number in `scripts/config/production-migrations-applied.json`. [requirement] (docs/runbooks/release-rollback.md:30-41)
3. Only then build, probe and promote the code, using the pinned Vercel CLI from a clean worktree. [requirement] (docs/development/ci-and-deploys.md:8-11)
4. Check `api:GET /api/version`, which reports the commit and migration state served. [code] (apps/web/app/api/version/route.ts:1-14)

The recorded state in the repo: migrations applied through 425, recorded 2026-11-21, ledger commit 57bf292f5d. [code] (scripts/config/production-migrations-applied.json)

### B. What the disabled workflow does when enabled

`deploy-staging.yml` and `deploy-production.yml` both trigger on a completed `CI` run (`workflow_run`). Production only accepts a run that succeeded, was a push, on `main`, from this repository. [code] (.github/workflows/deploy-production.yml:3-6,114-121)

Order:

1. Staging first: applies pending migrations to the persistent staging database (`pnpm db:migrate -- apply --target staging`), deploys a preview-environment build, verifies it, records a `staging-web` commit status. [code] (.github/workflows/deploy-staging.yml:145,185)
2. Production `scope` job picks affected surfaces. `staging-gate` waits (up to 25 min per doc) for the staging verdict on the same commit. `release-gate` requires green scanning and a verified signaling relay. [code] (.github/workflows/deploy-production.yml:114,188,235)
3. `deploy-web` (environment `production-web`): check Vercel contract, reconcile env, run `pnpm db:migrate -- verify` (no mutation), pull settings, record the serving deployment, build, deploy prebuilt artifact, canary on its own URL, promote to the production domains, verify the serving path, run `pnpm db:migrate -- record --surface web`. [code] (.github/workflows/deploy-production.yml:258-514)
4. If a step fails after deploy, a step runs `vercel rollback` to the previously serving deployment. [code] (.github/workflows/deploy-production.yml:514-523)
5. `deploy-sandbox` deploys the separate artifact-sandbox origin and checks its isolation headers. [code] (.github/workflows/deploy-production.yml:600-737)
6. A daily `production-drift` job (07:00 UTC) fails if production does not serve `main` HEAD. [code] (.github/workflows/deploy-production.yml:11-12,46-86)

The workflow never applies a production migration. It only verifies the ledger and records state. [requirement] (docs/runbooks/release-rollback.md:32-35); [code] (.github/workflows/deploy-production.yml:329 is `verify`, 511 is `record`; no `apply` for production)

### C. Signaling server (services/signaling-server)

`Deploy Signaling Server` is active. After a green push CI on `main` it tests, builds a container to GHCR and deploys to Railway (`deploy-railway`, environment `production-railway`). The Fly.io job (`deploy-fly`) runs only on manual `workflow_dispatch` with `deploy_target` fly or both. [code] (.github/workflows/deploy-signaling-server.yml:14-17,224-243,292-309). The web release gate requires a verified relay (`production-relay` context from the Fly job). [code] (scripts/config/deploy-gates.json releaseReadiness.relay)

### D. Background workers

No separate worker deployable. Every scheduled job is a cron route in the one Next.js service, scheduled in `vercel.json` `crons` (about 47 entries). Each is registered in `apps/web/app/api/cron/deployable-components.json`, and a test in CI fails on an unregistered route. [code] (vercel.json), [requirement] (docs/development/ci-and-deploys.md:131-153)

### E. Client apps

Released by tag, independently of web, and cannot be rolled back (only a new version). Tags: CLI `v-cli-*`, public Desktop (Electron) `v-cloud-desktop-*`, retained Tauri `v-desktop-*` (workflow disabled), mobile `v-mobile-*`, VS Code `v-vscode-*`, Chrome `v-ext-*`. [requirement] (docs/architecture/release-architecture.md:34-46). Workflow files exist for each. [code] (.github/workflows/release-*.yml)

## Commands

| Purpose | Command | Basis |
| --- | --- | --- |
| Check migration ledger (no change) | `pnpm db:migrate -- verify` | [code] (.github/workflows/deploy-production.yml:329) |
| Apply to staging | `pnpm db:migrate -- apply --target staging` | [code] (.github/workflows/deploy-staging.yml:145) |
| Apply to production | `pnpm db:migrate -- apply --target production --confirm-production` | [requirement] (docs/runbooks/release-rollback.md:37-39); refuses without the flag [code] (scripts/neon-migrate.mjs:117-119) |
| Record deployed state | `pnpm db:migrate -- record --surface web --commit <sha>` | [code] (.github/workflows/deploy-production.yml:511) |
| Valid migration targets | local, ci, branch, staging, production | [code] (scripts/lib/neon-migrations.mjs:16) |
| Rollback (Actions) | Run workflow `Deploy Production Surfaces` with `rollback: true` and `rollback_reason`; optional `rollback_to` | [code] (.github/workflows/deploy-production.yml:13-26,819-865) |
| Rollback (laptop) | `node scripts/release/rollback.mjs --reason "..."` with `VERCEL_TOKEN`, `VERCEL_ORG_ID`, `VERCEL_PROJECT_ID`, `AGI_DATABASE_URL` set; `--dry-run`, `--to dpl_...` | [requirement] (docs/runbooks/release-rollback.md:95-104) |
| Test the deploy contract | `pnpm check:ci-guardrails` (also rejects re-enabled Vercel main auto-deploy) | [requirement] (docs/development/ci-and-deploys.md:101-103); script exists [code] (scripts/check-ci-guardrails.mjs) |
| Gate check of the workflow | `scripts/check-deploy-gates.mjs` reads `scripts/config/deploy-gates.json` | [code] |
| Migration dependency guard | `pnpm check:migration-dependencies`, `pnpm check:neon-migrations` | [requirement]/[code] (package.json:201) |
| Pre-push gate | `.husky/pre-push` runs `pnpm check:llm-operability`, `turbo run lint typecheck --affected` in a clean worktree | [requirement] (docs/development/ci-and-deploys.md) |
| Heavy local jobs | wrap in `scripts/dev/heavy-job.sh` | [requirement] (CLAUDE.md) |

Vercel build settings (pnpm version, build via `apps/web/scripts/build-with-chat.sh`, output apps/web/.next (not found)): [code] (vercel.json). Vercel `git.deploymentEnabled` is false, so a push never deploys by itself. [code] (vercel.json)

## Rules and traps

**Never without the owner saying so in that message** [requirement] (memory deploy-and-release, owner instruction; AGENTS.md §9 for irreversible actions):

- Deploy to production or staging (Vercel CLI, workflow dispatch, rollback).
- Apply a production migration. The runner needs `--confirm-production`.
- Deploy or change Fly or the relay. Owner instruction: no Fly or relay deploy until told. [requirement] (owner memory no-fly-until-told). Note the web release gate wants a verified relay, so this can block an enabled production workflow. [inferred] from deploy-gates.json.
- Push with `SKIP_PRE_PUSH=1` without disclosing it. [requirement] (docs/development/ci-and-deploys.md)
- Hand-edit lockfiles or edit an applied migration. [requirement] (AGENTS.md §5, §12)

**Traps**

1. The workflows being present does not mean they run. They are disabled; production is manual. [requirement] (docs/development/ci-and-deploys.md:8-15)
2. Migrations first, then code. Code reading a column not yet applied breaks routes; rollback does not undo a migration. `check:migration-dependencies` and `scripts/config/migration-dependency-allowlist.json` guard this. [requirement] (docs/runbooks/release-rollback.md:43-48)
3. Database is never rolled back. Forward-fix with a new numbered migration; destructive changes are a two-release sequence. [requirement] (docs/architecture/release-architecture.md:106-118,230-235)
4. Rollback picks the newest READY deployment created before the serving one, not simply the newest READY. A rollback reason is required. [requirement] (docs/runbooks/release-rollback.md:61-65)
5. `scripts/config/rollback-floor.json` is `{"web": null}` now, so no floor is enforced. [code]
6. The daily drift alarm stays red after a rollback by design. [requirement] (docs/runbooks/release-rollback.md:111-114)
7. Production concurrency group is `production-surfaces` with no cancel, so a cancelled run cannot skip the rollback step. [code] (.github/workflows/deploy-production.yml:28-34)
8. Staging is a preview build in the same Vercel project with its own Neon database, never a branch of production, and its own Clerk dev keys, Stripe test keys and Redis. `OPENROUTER_API_KEY` is Production only. Do not mark `NEXT_PUBLIC_*` values Sensitive. [requirement] (docs/development/ci-and-deploys.md). Nothing in the migrate tool checks that the staging database is not production. [requirement] (same file)
9. A commit trailer `Deployment: hold` runs CI but blocks automatic deploys. Unknown directives fail closed. [requirement] (docs/development/ci-and-deploys.md); implemented in `scripts/production-deploy-scope.mjs --automatic-deployment` [requirement]
10. There is no path that skips CI; a hotfix is a normal commit. Emergency levers are rollback, feature kill switches (`/api/admin/feature-flags/kill-switches`), or the laptop rollback script. [requirement] (docs/architecture/release-architecture.md:189-204)
11. Build must happen before migrating (owner memory), so the migration is not applied for code that does not build. [requirement] (owner memory deploy-and-release)
12. Vercel author-email block: a commit whose author email Vercel does not accept can be refused; the owner's memory records a fix. Details [unknown] from the repo.
13. `vercel-ignore-build.sh` skips builds for docs, `.github`, other apps, `crates`, `services` etc. and fails open. It only matters if Git deployments are on, and `git.deploymentEnabled` is false. [code] (vercel-ignore-build.sh, vercel.json)
14. Web-only coupling: the public Desktop shows the hosted web app, so a web deploy changes Desktop's renderer at once; mobile and extensions are older than the server for as long as users do not update. [requirement] (AGENTS.md §5; docs/architecture/release-architecture.md:130-139)
15. Mobile rollback levers: server rollback, kill switch, version disable, `expo-updates` OTA, new store binary, raising minimum contract version (mobile does not show the update message; recorded gap). [requirement] (docs/runbooks/release-rollback.md:149-171)
16. Secrets live in GitHub environments (`production-web`, `staging-web`, `production-railway`) and Vercel; none in the repo. Names: `VERCEL_TOKEN`, `VERCEL_ORG_ID`, `VERCEL_PROJECT_ID`, `VERCEL_AUTOMATION_BYPASS_SECRET`, `AGI_DATABASE_URL`, `AGI_STAGING_DATABASE_URL`, `PAGER_WEBHOOK_URL`. Environment protection rules from `.github/rulesets/environments.json` may not be applied. [requirement] (docs/development/ci-and-deploys.md)

## Where the canonical document is

| Question | Canonical file | Note |
| --- | --- | --- |
| CI gate policy, staging tier, config names | `docs/development/ci-and-deploys.md` | Current state section says workflows are disabled |
| Shape of the whole release system, tags, artifacts, secrets | `docs/architecture/release-architecture.md` | Section 1 table is partly wrong on signaling (see gaps) |
| Rollback, manual deploy order, drill, audit trail | `docs/runbooks/release-rollback.md` | |
| The gates a production promotion must keep | `scripts/config/deploy-gates.json` | Measured by `scripts/check-deploy-gates.mjs` |
| What production's migrations are at | `scripts/config/production-migrations-applied.json` | |
| Actual workflow behavior (wins over prose) | `.github/workflows/deploy-production.yml`, `deploy-staging.yml`, `deploy-signaling-server.yml` | Rank 2/3 in AGENTS.md §2 |
| Scheduled jobs | `vercel.json` `crons` plus `apps/web/app/api/cron/deployable-components.json` | |
| Migration tool targets | `scripts/lib/neon-migrations.mjs` | |
| Other release runbooks | `docs/runbooks/cli-release.md`, `desktop-electron-macos-release.md`, `desktop-macos-release.md`, `mobile-store-first-release.md` | Not read in depth |
| Backup and restore | `docs/runbooks/database-backup-restore.md` | Cited by the rollback runbook; not opened |

## Gaps in the documents

- `docs/architecture/release-architecture.md` says signaling's artifact is 'A Fly.io deployment'. The code deploys Railway automatically after CI and Fly only by manual dispatch. [code] (.github/workflows/deploy-signaling-server.yml:224-243,292-309)
- `scripts/neon-migrate.mjs` error message and help text list targets `local|ci|branch|production` and omit `staging`, but the allowed list includes staging. [code] (scripts/neon-migrate.mjs:111,126 vs scripts/lib/neon-migrations.mjs:16)
- `docs/runbooks/release-rollback.md` says the rollback is 'approved' through the `production-web` environment; the architecture doc says approval is only 'where configured'. Whether any reviewer rule is actually applied is [unknown].
- No document states who may deploy beyond 'a release operator'; the owner-only rule is in owner memory, not in a repo document.
- The 'executed' state is not recorded in the repo: no document records a real run of the staging gate, the canary, or the rollback drill result, so none of it is verified here.
- Whether the `Deploy Production Surfaces` disable date is 2026-11-11 (runbook) or a different one (ci-and-deploys says only 'disabled_manually') is a minor inconsistency in dating.

## Key facts

| Fact | Basis | Source |
|---|---|---|
| Production web is deployed manually with the pinned Vercel CLI from a clean worktree; the production and staging workflows exist but are disabled in GitHub. | stated requirement | `docs/development/ci-and-deploys.md:8-15`; `docs/architecture/release-architecture.md:18-30` |
| vercel.json sets git.deploymentEnabled to false, so no push or merge deploys through the Vercel Git integration. | read in the code | `vercel.json:10-12` |
| Hosting is Vercel (Next.js framework, output apps/web/.next, build via apps/web/scripts/build-with-chat.sh, pnpm pinned in install and build commands). | read in the code | `vercel.json:2-9` |
| Scheduled background jobs are Vercel crons hitting /api/cron/* routes inside the one Next.js service; there is no separate worker deployable or broker. | read in the code | `vercel.json crons`; `docs/development/ci-and-deploys.md background components section` |
| Production deploy workflow triggers on a completed CI run and runs jobs only for a successful, push-triggered, main-branch, same-repository run, deploying the exact head_sha. | read in the code | `.github/workflows/deploy-production.yml:3-6,114-130`; `scripts/config/deploy-gates.json requiredConditions` |
| The production workflow never applies migrations to production; it runs 'db:migrate -- verify' before deploy and 'db:migrate -- record' after. | read in the code | `.github/workflows/deploy-production.yml:329,511` |
| Manual production order is: Neon backup branch, apply migrations with --confirm-production, record applied-through number, then build, probe and promote code. | stated requirement | `docs/runbooks/release-rollback.md:30-48` |
| The migration runner refuses production mutation without --confirm-production and accepts targets local, ci, branch, staging, production. | read in the code | `scripts/neon-migrate.mjs:117-119`; `scripts/lib/neon-migrations.mjs:16` |
| Recorded production migration state: applied through 425 on 2026-11-21 at ledger commit 57bf292f5d; latest migration file is 0425_adult_eligibility.sql. | read in the code | `scripts/config/production-migrations-applied.json`; `apps/web/db/neon/0425_adult_eligibility.sql` |
| Staging workflow applies migrations to a persistent separate staging database, deploys a preview build, verifies it and publishes a staging-web commit status that production waits for. | read in the code | `.github/workflows/deploy-staging.yml:145,185`; `.github/workflows/deploy-production.yml:188-232` |
| Production deploy canaries the new deployment on its own URL before promoting to production domains, then verifies the serving path; a failure after deploy triggers vercel rollback to the previously serving deployment. | read in the code | `.github/workflows/deploy-production.yml:418,457,490,514-523` |
| Rollback is a workflow_dispatch with rollback true and a required reason, or node scripts/release/rollback.mjs from a laptop; it reverts code only, never the database. | read in the code | `.github/workflows/deploy-production.yml:13-26,819-865`; `docs/runbooks/release-rollback.md:50-114`; `scripts/release/rollback.mjs` |
| The rollback floor file is currently {"web": null}, so no oldest-allowed deployment is enforced. | read in the code | `scripts/config/rollback-floor.json` |
| Production concurrency group production-surfaces does not cancel in progress, so a cancelled run cannot skip the rollback step. | read in the code | `.github/workflows/deploy-production.yml:28-34` |
| A daily production-drift job at 07:00 UTC fails if production does not serve main HEAD; it does not run while the workflow is disabled. | read in the code | `.github/workflows/deploy-production.yml:11-12,46-86`; `docs/architecture/release-architecture.md:26-29` |
| Signaling server auto-deploys to Railway after green CI on main; Fly.io deploy runs only on manual dispatch (deploy_target fly or both); the workflow is active. | read in the code | `.github/workflows/deploy-signaling-server.yml:14-17,224-243,292-309` |
| The web release gate requires a verified relay (production-relay context from the Fly job) in addition to green scanning and zero open alerts. | read in the code | `scripts/config/deploy-gates.json releaseReadiness`; `scripts/config/deploy-gates.json gates release-readiness` |
| A Deployment: hold git trailer lets CI run but blocks automatic staging, production and signaling deploys; unsupported directives fail closed. | stated requirement | `docs/development/ci-and-deploys.md commit-level deployment hold section` |
| Required status gates for a production mutation are CI, CodeQL analysis, Priority Level 1 tests and Security scanning on the exact commit. | read in the code | `scripts/config/deploy-gates.json releaseReadiness.workflows` |
| Client apps (CLI, Desktop Electron, mobile, VS Code, Chrome) are released by their own tags and cannot be rolled back; the only remedy is a new version, a kill switch or a version disable. | stated requirement | `docs/architecture/release-architecture.md:34-46,117-118`; `docs/runbooks/release-rollback.md:149-171` |
| The release audit trail is table public.release_events (migration 0263), append-only and hash-chained, readable at /admin/releases and GET /api/admin/releases. | stated requirement | `docs/runbooks/release-rollback.md:15-28,128-140` |
| api:GET /api/version reports the serving commit, deployment id, environment, region, migration state and a model registry digest. | read in the code | `apps/web/app/api/version/route.ts:1-45` |
| Per owner instruction, nothing is deployed unless the owner says so in that message, and no Fly or relay deploy happens until told. | stated requirement | `owner memory files deploy-and-release.md and no-fly-until-told.md (not in repo)` (not found) |
| vercel-ignore-build.sh skips builds when only docs, .github, other apps, crates, services or similar change, and builds on any doubt. | read in the code | `vercel-ignore-build.sh`; `vercel.json ignoreCommand` |
| Pre-push hook runs the guard chain and affected lint and typecheck in a detached clean worktree of HEAD; SKIP_PRE_PUSH=1 is emergency only and must be disclosed. | stated requirement | `docs/development/ci-and-deploys.md local fast gate section` |
| A separate artifact-sandbox origin is deployed by the same production workflow (deploy-sandbox) and its isolation headers are checked after promotion. | read in the code | `.github/workflows/deploy-production.yml:600-737`; `scripts/config/deploy-gates.json sandbox-isolation-headers` |

## Open questions

- Is Deploy Production Surfaces still disabled in GitHub right now? The repo records it but cannot show live GitHub state.
- Do the production-web, staging-web and production-railway environments carry required reviewers? .github/rulesets/environments.json declares intent; applied state is unknown.
- Is the Railway signaling deploy actually live, or is Fly the live relay? Docs say Fly; the workflow auto-deploys Railway and only Fly satisfies the web release gate's relay check.
- Does the manual deploy run the same gates (canary, env reconcile, release-gate) as the workflow? No document says; the manual procedure is only described in outline.
- Where is the staging origin served from, since no persistent origin or custom domain is required and the staging URL is only a hand-made alias?
- Product choice: whether to re-enable the automatic workflows or keep manual owner-run deploys is undecided in the code.
- The Vercel author-email block and fix are only in owner memory; the repo has no document for it.

## Project documents found out of date

- `docs/architecture/release-architecture.md`: Section 1 lists the signaling server artifact as 'A Fly.io deployment' triggered by its own workflow. The code says: The automatic path after green CI deploys to Railway; Fly deploys only on manual workflow_dispatch with deploy_target fly or both. (.github/workflows/deploy-signaling-server.yml:14-17,224-243,292-309)
- `scripts/neon-migrate.mjs (help and error text)`: Messages list targets local|ci|branch|production. The code says: Allowed targets also include staging, and the staging workflow uses it. (scripts/lib/neon-migrations.mjs:16; scripts/neon-migrate.mjs:111,126; .github/workflows/deploy-staging.yml:145)
- `docs/architecture/release-architecture.md (section 2 and 3 wording on staging and approvals)`: Describes staging and the staging-web status as live ordering without the caveat in its own Current state that the workflows are disabled; also says 'the identical artifact served staging' while ci-and-deploys says staging and production build separately from the same commit. The code says: deploy-staging builds with the Vercel preview environment and production builds its own artifact; they share a commit, not an artifact. (docs/development/ci-and-deploys.md staging tier section; .github/workflows/deploy-production.yml:391-401)
