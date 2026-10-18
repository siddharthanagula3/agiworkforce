# ADR-001: AGI Guardian architecture

Status: Current
Owner: Platform lead
Last updated: 2026-10-18

## Decision

Build AGI Guardian, the automated repository reviewer, as a two-plane system
that reuses the repository's existing infrastructure instead of introducing a
parallel stack:

1. **Core logic as workspace packages** (`packages/guardian/core`,
   `packages/guardian/github`): pure, network-free, fixture-tested. Finding
   schema, fingerprints, config, dedup, ranking, policy, the repo-check
   adapter that turns a `check:*` script's result into findings, and the
   Checks/PR payload builders all live here so every execution surface
   (Actions workflow, web control plane, future workers) shares one
   implementation.
2. **Execution surface #1, GitHub Actions** (`.github/workflows/guardian.yml`):
   the authoritative push/PR reviewer today. Runs the deterministic scan via
   `pnpm --filter @agiworkforce/guardian-github scan`, publishes per-category
   Check Runs on the exact reviewed SHA, and maintains one editable PR summary
   comment. Requires no external credentials beyond `GITHUB_TOKEN`.
3. **Execution surface #2, web control plane** (`apps/web/app/api/github/*`):
   the pre-existing GitHub App webhook (HMAC verification, rate limiting,
   installation auth, spend caps) now hardened with delivery-ID replay
   protection (migration 0106). Guardian review-run orchestration attaches
   here in Phase 3 (product integration), reusing `github_installations`,
   the entitlement system, and the model router.

## Why not a standalone service or Probot app

- `services/` is for deployable server boundaries, but the repo already runs a
  GitHub App webhook inside `apps/web` with Neon, rate limiting, logging,
  spans, and billing adjacency. A second webhook host would duplicate
  installation state, secrets handling, and observability (violates "no
  parallel sources of truth").
- Probot would add a framework where Octokit-over-existing-Next.js already
  works; the pure builders in `guardian-github` keep us framework-neutral.

## Event model

- Push to `main` and PR `opened|reopened|synchronize|ready_for_review` run the
  fast deterministic lane (seconds): curated repo-owned `check:*` scripts that
  are not already in ci.yml's fast path, normalized into the finding schema.
- Nightly schedule and `workflow_dispatch --deep` add heavy checks
  (`check:trust-boundaries`, `check:knip:production`).
- `merge_group`, `release`, `/agi` commands and a Guardian GitHub App webhook
  are not implemented.
- ci.yml lanes (semgrep 1.172.0, CodeQL, clippy, audits, tests) are read, not
  re-run. Guardian adds the layer CI lacks: normalization, fingerprints,
  dedup, baselining, policy, and single-comment publishing.

## Safety invariants (enforced in code, tested)

- A run may publish only against its own head SHA (the workflow re-checks the
  head before every publish). Webhook HMAC verification and delivery replay
  protection are not implemented, because Guardian runs only as a CI scan.
- Scanner failure ≠ clean: `ScannerRun.status` distinguishes
  `clean|findings|scanner-failed|timeout|skipped`, and blocking mode fails on
  scanner failure.
- An LLM finding can never block without deterministic corroboration or a
  confirmed failure scenario (`isBlockingEligible` in `policy.ts`). The scan
  runs only repository checks today, so it produces no LLM findings.
- Shadow mode structurally cannot fail a check (`evaluatePolicy`).
- Fork PRs run under the read-only token; publishing degrades to an artifact.
- All repository-controlled text is bounded and secret-redacted before it
  reaches findings, logs, or models.

## Finding identity

Fingerprint = SHA-256 over (repository id, rule id, normalized path, symbol,
normalized evidence, root-cause bucket). Commit SHAs, line numbers, and run
ids are excluded so a finding survives rebases and does not repost per commit;
SHA history lives on the finding record (`first_seen_sha`/`last_seen_sha`).

## Rollout

shadow → advisory → blocking, controlled solely by `.agi-guardian.yml`.
Blocking is gated on demonstrated precision (see the evaluation corpus in
`docs/specs/guardian-phase-3/tasks.md`). During shadow, the only required check candidate
is "AGI Guardian / Final Policy", and it concludes neutral.
