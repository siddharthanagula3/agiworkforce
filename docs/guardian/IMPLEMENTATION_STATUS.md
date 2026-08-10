# AGI Guardian — implementation status ledger

Status: Current
Owner: Platform lead
Last updated: 2026-08-09

This is the resume point for Guardian work. Read it before restarting design
from zero. Current phase: **Phase 1 (internal read-only MVP) — core shipped,
control-plane orchestration pending.**

## Completed (with evidence)

### Phase 0 — audit, ADR, licensing

- Repository audit: existing `/agi` bot (`.github/workflows/agiworkforce-bot.yml`,
  filename-level heuristics only), ci.yml lanes (semgrep 1.172.0 pinned,
  CodeQL, clippy, audits, ~50 repo-owned `check:*` gates), knip configured,
  pre-push local-only. A GitHub App control plane already exists at
  `apps/web/app/api/github/*` (HMAC, rate limit, installation tokens,
  `github_installations`, spend caps, prompt-injection fences) — Guardian
  extends it rather than duplicating it.
- `docs/guardian/ADR-001-architecture.md` — two-plane architecture, event
  model, safety invariants, rollout.
- `docs/guardian/LICENSING.md` — component inventory + commercial assessments.

### Phase 1 — shipped this iteration

- `packages/guardian/core` (`@agiworkforce/guardian-core`): versioned finding
  schema v1 (zod), stable SHA-excluded fingerprints, `.agi-guardian.yml`
  schema with fail-closed parsing, verification gate (path/line existence at
  head, diff relevance, dedup, confidence, no-speculative-LLM rule),
  dedup/reconciliation (fixed-finding recognition), deterministic ranking +
  inline budgets, final-policy engine (shadow/advisory/blocking; scanner
  failure ≠ clean; expired suppressions surface; LLM findings cannot block
  without deterministic corroboration), scanner adapters (eslint, knip,
  gitleaks with secret stripping, semgrep, generic repo-check) and secret
  redaction. Evidence: `pnpm --filter @agiworkforce/guardian-core test` →
  67 tests green; `typecheck` clean.
- `packages/guardian/github` (`@agiworkforce/guardian-github`): webhook HMAC
  verification (raw-body, constant-time), delivery-store interface, event
  normalization for push / pull_request (fork + draft detection) /
  issue_comment `/agi` commands / merge_group / installation, allowlisted
  command parser (suppress/unsuppress/fix arg validation), Check Run payload
  builders with 50-annotation batching, single-marker PR summary builder,
  stale-head guard, and the scan CLI (`pnpm --filter
@agiworkforce/guardian-github scan`). Evidence: 40 tests green; `typecheck`
  clean; live scan against this repo produced `guardian-report.json`,
  `guardian-checks.json`, `guardian-summary.md`, correctly recorded a
  timed-out check as `scanner-failed` (not clean) and one real advisory
  finding (`check:hardcoded-endpoints` failing on the current working tree).
- `.github/workflows/guardian.yml`: push(main) + PR
  opened/reopened/synchronize/ready_for_review + nightly deep lane +
  workflow_dispatch; per-PR concurrency cancellation; publishes 4 category
  Check Runs + "AGI Guardian / Final Policy" on the exact reviewed SHA;
  stale-head re-check before publish; one editable summary comment per PR;
  fork PRs degrade to artifact-only (read-only token); draft PRs skipped.
  Passes `scripts/check-action-pins.sh` and `check:ci-guardrails` tests.
- `.agi-guardian.yml` (repo root): shadow mode, main-branch pushes, PR
  actions, blocking matrix staged for later promotion.
- Webhook replay protection: migration
  `apps/web/db/neon/0106_github_webhook_deliveries.sql` (+ transactional
  reversal), `delivery-dedup.ts` wired into
  `apps/web/app/api/github/webhook/route.ts` after HMAC + ignored/ping
  short-circuits; fail-open with logged degradation. Evidence:
  `check:neon-migrations` green; delivery-dedup + migration-shape + existing
  webhook-router tests green (15 tests).

## Acceptance-criteria status (mission numbering)

Met in-repo: 3 (concurrency cancellation), 4 (delivery dedup), 5 (stale-head
guard), 6/7 (fork PRs artifact-only; Actions surface holds no App key),
8 (annotation validity via verifier line checks), 9 (verification gate),
11–12 (policy engine + shadow mode), 15 (reconcileRuns), 16 (scanner-failed
distinct from clean, proven live), 21-partial/22/23-partial/24-partial
(webhook signature, replay, malformed/bounded payload, secret-redaction
tests), 25 (deterministic fixtures), 27/28 (existing CI untouched).
Pending: 1/2 need the workflow to run on GitHub (push this branch), 10/13/14
need the persistence layer (baselining + suppression store), 26 (seeded-bug
corpus), 29-partial, and everything Phase 3+.

## Remaining tasks (exact order)

1. **Persistence layer**: `guardian_review_runs` / `guardian_findings` /
   `guardian_suppressions` migrations following 0106's conventions, so
   baselining ("existing findings do not flood new PRs"), fixed-finding
   closure, and suppression expiry become durable across runs.
2. **Control-plane orchestration**: extend
   `apps/web/app/api/github/webhook/webhook-router.ts` to route push /
   pull_request / merge_group events into Guardian review runs via
   `guardian-github` normalization (currently only issue_comment mention flow
   is live); reuse installation tokens + entitlements; keep the Actions
   workflow as the in-repo surface.
3. **LLM specialist reviewers**: provider-neutral structured-output reviewers
   behind the existing model router with per-run cost budgets; findings enter
   the same verify → dedupe → rank → policy pipeline (schema already
   enforces the corroboration rule).
4. **Evaluation corpus** (`docs/guardian/evaluation/`): seeded mutations +
   historical defects; precision/recall tracking gates any promotion from
   shadow mode.
5. **Scanner expansion**: enable gitleaks/osv-scanner adapters with exact
   pins per LICENSING.md; SBOM lane.
6. Phases 3–5 per the mission (entitlements, dashboards, autofix, enterprise).

## Phase 3 integration map (billing/entitlement/router, verified 2026-08-09)

Concrete attachment points so Phase 3 starts from file paths, not re-mapping:

- **Capability gate**: add a Guardian key (or reuse `agi_work`, Pro+) to
  `BillingPlanCapability` + `BILLING_PLAN_CAPABILITY_TIERS` in
  `packages/contracts/types/src/billing-catalog.ts`. Gate server-side in two
  steps, both required: `effectivePlanTier(planTier, status)`
  (`packages/contracts/types/src/subscription-entitlement.ts`; entitled
  statuses are `active`/`trialing` — `plan_tier` alone lies after
  cancellation) then `canUseBillingPlanCapability`. Worked example:
  `requireManagedChatPlan` in
  `services/api-gateway/src/middleware/planGate.ts`.
- **Quotas**: add numeric limits (repos watched, reviews/period) to
  `BillingPlanProductLimits` + `BILLING_PLAN_PRODUCT_LIMITS` with an accessor
  built on `toEnforceableBillingPlanLimit` (import the canonical converter —
  local copies have drifted before and zeroed Enterprise). Plan tiers:
  `local-only, byok, free, basic, pro, max, max_15x, team, enterprise`.
- **Metering**: wrap each managed-inference review run in the existing
  reservation lifecycle — `reserveManagedUsageRequest` →
  `finalizeManagedUsageRequest`
  (`apps/web/lib/services/managed-usage-request-service.ts`, backed by
  migrations 0055/0056/0066); do NOT build a separate Guardian ledger. Note
  the free tier draws a different (micro-USD) ledger than paid tiers. Refuse
  with existing `MANAGED_QUOTA_BLOCKS` codes (`plan_upgrade_required`) so the
  standard paywall UI renders.
- **Model routing**: `resolveAutoRoute` in `packages/ai/routing/src/auto.ts`
  (task classification + tier-clamped profiles). Its `budgetRemainingCents`
  is ADVISORY (biases slot order; `workhorse_general` is exempt) — the hard
  cost cutoff must be the reservation ledger, not the router. Billing-grade
  cost math: `LLMCostCalculator`
  (`apps/web/lib/services/llm-cost-calculator.ts`). Model ids only via
  `packages/contracts/types/src/models.json` accessors
  (`getModelMetadataById`, `getAllowedModelsForTier`) — the file is generated;
  never hand-edit.
- **Cron ceiling**: scheduled Guardian audits sharing the platform sweep are
  bounded by `PLATFORM_SCHEDULE_RUNS_PER_SWEEP = 50` rows per invocation
  (guarded by `schedule-cadence.test.ts`); oversizing quotas backs up as a
  silent FIFO backlog, not an error. Also: any sub-daily `vercel.json` cron
  silently blocks Vercel Hobby deploys — schedule Guardian crons daily+.
- **Catalog guards**: `billing-catalog.test.ts` enforces catalog invariants;
  run it after any capability/limit addition.

## Phase 2/3 platform conventions map (verified 2026-08-09)

- **Durable run state**: there is no queue infrastructure in the repo. The
  canonical pattern for work that must survive a request is a DB-backed job
  table drained by a reconcile cron — copy
  `apps/web/db/neon/0105_durable_video_generation_jobs.sql` +
  `apps/web/lib/server/video-generation-jobs.ts` (status, `next_attempt_at`,
  claim token/expiry, `idempotency_key`, `request_hash`, `JOB_COLUMNS` +
  row-mapper module shape) for `guardian_review_runs`/`guardian_review_jobs`.
- **Cron**: routes under `apps/web/app/api/cron/*` gated by
  `verifyCronRequest` (`@/lib/server/cron-auth`, `Bearer ${CRON_SECRET}`).
  Cadence: daily+ only (sub-daily crons kill Vercel Hobby deploys silently).
- **Queries**: application-layer `where`-scoping is the active isolation
  control; RLS (`0037_rls_user_isolation.sql`, `current_app_user_id()`) is
  defense-in-depth and dormant on the `getNeonDb()` path. Scope every
  Guardian query by installation/user id explicitly (0106 does).
- **Route staples**: `import 'server-only'`; auth via `getClerkAuthUser`
  (`@/lib/api-auth`; API keys need an explicit `apiKeyScope`); zod on inbound
  AND outbound shapes; errors via `withErrorHandler`/`createError.*` — a
  user-facing Guardian error code must be added to `SAFE_TO_EXPOSE_CODES`
  deliberately or its message is genericized; new rate-limit keys registered
  in `rateLimitConfigs` (`apps/web/lib/rate-limit.ts`); webhooks are
  CSRF-exempt (HMAC is the authentication) and fail open on Redis loss.
- **GitHub client**: no octokit anywhere — extend the hand-rolled
  `apps/web/lib/github-app.ts` (fetch + node:crypto RS256, SSRF/path-segment
  guards, envelope-encrypted installation tokens that fail closed in prod
  without `GITHUB_TOKEN_ENCRYPTION_KEY`). Do not add an octokit dependency.
- **Hardening follow-up (pre-existing)**: `apps/web/proxy.ts` excludes only
  `api/stripe-webhook` from the middleware matcher and that route pins
  `runtime='nodejs'` + `dynamic='force-dynamic'`; `api/github/webhook` has
  neither. It works today (handlers default to the Node runtime), but mirror
  the stripe-webhook treatment when next touching the route.
- **Lane contract** (`apps/web/AGENTS.md`): Guardian spans migrations,
  `packages/` contracts, and workflow files — integrator-path changes, not a
  single web feature lane. Run `pnpm check:structure-conventions` and
  `pnpm check:service-layer` alongside the web filter checks.

## Blockers requiring external action

- GitHub App registration/installation and `GITHUB_WEBHOOK_SECRET` /
  `GITHUB_APP_*` production credentials are operator-owned; the in-repo
  interfaces are fixture-tested. The existing `/api/github/webhook` route
  documents its env expectations in `apps/web/lib/github-app.ts`.
- Branch-protection / required-check changes (making
  "AGI Guardian / Final Policy" required) are repository-administration
  actions; recommended only after shadow-mode precision review.

## Known limitations / risks (honest state)

- The Actions surface runs deterministic analyzers only; no LLM reviewers yet.
- Findings are not yet persisted across runs: `fixedSincePreviousRun` is
  empty and baselining is unavailable until the persistence layer lands.
- `/agi suppress|unsuppress|fix` parse and validate but have no backing
  store; `fix` stays disabled by design until the write-phase rollout.
- Delivery dedup fails open on Neon unavailability (deliberate; logged).
- `check:trust-boundaries` exceeds the fast-lane budget (~8 min observed) and
  therefore lives in the deep lane.
- Pre-existing repo state: `check:hardcoded-endpoints` currently fails on the
  uncommitted working tree (real advisory finding, evidence in scan output);
  unrelated to Guardian changes.
