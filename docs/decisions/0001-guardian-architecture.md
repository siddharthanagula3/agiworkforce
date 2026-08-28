# ADR-001: AGI Guardian architecture

Status: Current
Owner: Platform lead
Last updated: 2026-08-09

## Decision

Build AGI Guardian — the automated repository reviewer — as a two-plane system
that reuses the repository's existing infrastructure instead of introducing a
parallel stack:

1. **Core logic as workspace packages** (`packages/guardian/core`,
   `packages/guardian/github`): pure, network-free, fixture-tested. Finding
   schema, fingerprints, config, verification, dedup, ranking, policy,
   scanner adapters, webhook security, event normalization, `/agi` command
   parsing, and Checks/PR payload builders all live here so every execution
   surface (Actions workflow, web control plane, future workers) shares one
   implementation.
2. **Execution surface #1 — GitHub Actions** (`.github/workflows/guardian.yml`):
   the authoritative push/PR reviewer today. Runs the deterministic scan via
   `pnpm --filter @agiworkforce/guardian-github scan`, publishes per-category
   Check Runs on the exact reviewed SHA, and maintains one editable PR summary
   comment. Requires no external credentials beyond `GITHUB_TOKEN`.
3. **Execution surface #2 — web control plane** (`apps/web/app/api/github/*`):
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
- `merge_group`, `release`, and richer `/agi` commands are normalized by
  `guardian-github/events.ts` and activate as the control-plane pipeline lands.
- ci.yml lanes (semgrep 1.172.0, CodeQL, clippy, audits, tests) are read, not
  re-run. Guardian adds the layer CI lacks: normalization, fingerprints,
  verification, dedup, baselining, policy, and single-comment publishing.

## Safety invariants (enforced in code, tested)

- HMAC verification on raw bytes, constant-time compare; unauthenticated
  payloads never touch parsing (`guardian-github/webhook.ts`).
- Delivery-ID replay protection via unique constraint
  (`github_webhook_deliveries`, fail-open with logged degradation).
- A run may publish only against its own head SHA (`shouldPublish` + workflow
  stale-head re-check before every publish).
- Scanner failure ≠ clean: `ScannerRun.status` distinguishes
  `clean|findings|scanner-failed|timeout|skipped`, and blocking mode fails on
  scanner failure.
- No LLM finding publishes without verification (path/line existence at head,
  diff relevance, dedup, confidence threshold, concrete failure scenario);
  an LLM finding can never block without deterministic corroboration.
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
Blocking is gated on demonstrated precision (see the evaluation plan in
`IMPLEMENTATION_STATUS.md`). During shadow, the only required check candidate
is "AGI Guardian / Final Policy", and it concludes neutral.
