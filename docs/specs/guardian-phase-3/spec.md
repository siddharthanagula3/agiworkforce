# Guardian phase 3 — spec

Status: Active
Owner: Guardian
Last updated: 2026-08-28

## Problem

Guardian ships a deterministic analyzer surface through GitHub Actions, but
findings do not survive a run. Without persistence there is no baseline, so
existing findings flood every new pull request, fixed findings never close, and
suppressions cannot expire. The control plane only routes `issue_comment`
mentions, so pushes and pull requests never open a review run.

## Requirements

1. Findings persist across runs, so baselining, closure and suppression expiry
   are durable.
2. Push, pull_request and merge_group events open review runs through the
   existing GitHub App installation and entitlement path.
3. LLM specialist reviewers are provider-neutral, run behind the model router
   with per-run cost budgets, and enter the same verify to dedupe to rank to
   policy pipeline every other finding source uses.
4. Promotion out of shadow mode is gated on measured precision and recall, not
   on judgement.

## Acceptance criteria

- A second run over an unchanged branch reports zero new findings.
- A fixed finding closes without human action.
- `/agi suppress` survives a run and expires on schedule.
- No reviewer can emit a finding that bypasses the corroboration rule the
  schema already enforces.

## Non-goals

- Autofix write access. `/agi fix` stays disabled until the write-phase rollout.
- Making "AGI Guardian / Final Policy" a required check. That is a repository
  administration action and is deliberately deferred until shadow-mode
  precision has been reviewed.

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

## Blockers requiring external action

- GitHub App registration/installation and `GITHUB_WEBHOOK_SECRET` /
  `GITHUB_APP_*` production credentials are operator-owned; the in-repo
  interfaces are fixture-tested. The existing `/api/github/webhook` route
  documents its env expectations in `apps/web/lib/github-app.ts`.
- Branch-protection / required-check changes (making
  "AGI Guardian / Final Policy" required) are repository-administration
  actions; recommended only after shadow-mode precision review.
