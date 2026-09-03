# Guardian phase 3: plan

Status: Active
Owner: Guardian
Last updated: 2026-08-28

The two maps below are file-path-level design for work that is not written yet.
They were verified against the tree on 2026-08-09; re-verify before relying on a
path, because nothing regenerates them.

## Phase 3 integration map (billing/entitlement/router, verified 2026-08-09)

Concrete attachment points so Phase 3 starts from file paths, not re-mapping:

- **Capability gate**: add a Guardian key (or reuse `agi_work`, Pro+) to
  `BillingPlanCapability` + `BILLING_PLAN_CAPABILITY_TIERS` in
  `packages/contracts/types/src/billing-catalog.ts`. Gate server-side in two
  steps, both required: `effectivePlanTier(planTier, status)`
  (`packages/contracts/types/src/subscription-entitlement.ts`; entitled
  statuses are `active`/`trialing`, `plan_tier` alone lies after
  cancellation) then `canUseBillingPlanCapability`. Worked example:
  `resolveTeamAdminAccess` in
  `apps/web/app/api/settings/team/team-admin-access.ts`.
- **Quotas**: add numeric limits (repos watched, reviews/period) to
  `BillingPlanProductLimits` + `BILLING_PLAN_PRODUCT_LIMITS` with an accessor
  built on `toEnforceableBillingPlanLimit` (import the canonical converter.
  local copies have drifted before and zeroed Enterprise). Plan tiers:
  `local-only, byok, free, basic, pro, max, max_15x, team, enterprise`.
- **Metering**: wrap each managed-inference review run in the existing
  reservation lifecycle, `reserveManagedUsageRequest` →
  `finalizeManagedUsageRequest`
  (`apps/web/lib/services/managed-usage-request-service.ts`, backed by
  migrations 0055/0056/0066); do NOT build a separate Guardian ledger. Note
  the free tier draws a different (micro-USD) ledger than paid tiers. Refuse
  with existing `MANAGED_QUOTA_BLOCKS` codes (`plan_upgrade_required`) so the
  standard paywall UI renders.
- **Model routing**: `resolveAutoRoute` in `packages/ai/routing/src/auto.ts`
  (task classification + tier-clamped profiles). Its `budgetRemainingCents`
  is ADVISORY (biases slot order; `workhorse_general` is exempt), the hard
  cost cutoff must be the reservation ledger, not the router. Billing-grade
  cost math: `LLMCostCalculator`
  (`apps/web/lib/services/llm-cost-calculator.ts`). Model ids only via
  `packages/contracts/types/src/models.json` accessors
  (`getModelMetadataById`, `getAllowedModelsForTier`), the file is generated;
  never hand-edit.
- **Cron ceiling**: scheduled Guardian audits sharing the platform sweep are
  bounded by `PLATFORM_SCHEDULE_RUNS_PER_SWEEP = 50` rows per invocation
  (guarded by `schedule-cadence.test.ts`); oversizing quotas backs up as a
  silent FIFO backlog, not an error. Also: any sub-daily `vercel.json` cron
  silently blocks Vercel Hobby deploys, schedule Guardian crons daily+.
- **Catalog guards**: `billing-catalog.test.ts` enforces catalog invariants;
  run it after any capability/limit addition.

## Phase 2/3 platform conventions map (verified 2026-08-09)

- **Durable run state**: there is no queue infrastructure in the repo. The
  canonical pattern for work that must survive a request is a DB-backed job
  table drained by a reconcile cron, copy
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
  AND outbound shapes; errors via `withErrorHandler`/`createError.*`, a
  user-facing Guardian error code must be added to `SAFE_TO_EXPOSE_CODES`
  deliberately or its message is genericized; new rate-limit keys registered
  in `rateLimitConfigs` (`apps/web/lib/rate-limit.ts`); webhooks are
  CSRF-exempt (HMAC is the authentication) and fail open on Redis loss.
- **GitHub client**: no octokit anywhere, extend the hand-rolled
  `apps/web/lib/github-app.ts` (fetch + node:crypto RS256, SSRF/path-segment
  guards, envelope-encrypted installation tokens that fail closed in prod
  without `GITHUB_TOKEN_ENCRYPTION_KEY`). Do not add an octokit dependency.
- **Hardening follow-up (pre-existing)**: `apps/web/proxy.ts` excludes only
  `api/stripe-webhook` from the middleware matcher and that route pins
  `runtime='nodejs'` + `dynamic='force-dynamic'`; `api/github/webhook` has
  neither. It works today (handlers default to the Node runtime), but mirror
  the stripe-webhook treatment when next touching the route.
- **Lane contract**: Guardian spans migrations,
  `packages/` contracts, and workflow files, integrator-path changes, not a
  single web feature lane. Run `pnpm check:structure-conventions` and
  `pnpm check:service-layer` alongside the web filter checks.
