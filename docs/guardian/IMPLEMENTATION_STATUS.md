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
