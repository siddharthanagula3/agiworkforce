# Parallel Agent Playbook

Status: Current
Owner: Platform lead
Last updated: 2026-05-21
Purpose: define how AGI Workforce can run 15+ coding agents at once without overlapping writes, losing context, or merging unsafe work.

## 15+ Parallel Agents

AGI Workforce should support many parallel agents, but parallelism is useful only when work is split by ownership lane.

Recommended default for a large initiative:

| Role            | Count | Responsibility                                                               |
| --------------- | ----: | ---------------------------------------------------------------------------- |
| Lead/integrator |     1 | Owns decomposition, shared files, final merge, changelog, and release notes. |
| Explorers       |   3-5 | Read-only investigation, risk discovery, reproduction, source mapping.       |
| Implementers    |  6-10 | One lane each, one worktree each, one coherent patch each.                   |
| Reviewers       |     2 | Security/privacy review and product/parity review.                           |
| Verifiers       |     2 | Run checks, reproduce fixes, capture evidence.                               |
| Release/docs    |     1 | Release notes, docs, installer/update implications.                          |

This gives 15-21 active agents without making two agents edit the same path.

## Required Inputs

Before starting a parallel wave, the lead creates a task list with:

- Lane ID from `docs/agent-context/lanes.json`.
- Goal.
- Owned write paths.
- Blocked paths.
- Required checks.
- Integration owner.
- Expected handoff summary.

Use `docs/agent-context/task-manifest.schema.json` for machine-shaped task manifests.

## Worktree Rules

- One implementation lane gets one branch and one worktree.
- Worktree name: `.worktrees/<lane-id>-<short-goal>`.
- Branch name: `work/<lane-id>-<short-goal>-YYYY-MM-DD`.
- Do not copy uncommitted files between worktrees.
- Do not regenerate lockfiles in every lane.
- Shared files are edited only by the integrator or a dedicated repo/release lane.

## Integration Order

1. Explorers finish and publish findings.
2. Implementers finish lane patches.
3. Integrator reviews each diff for lane compliance.
4. Shared contract changes land before app consumers.
5. Lockfiles and root docs update once.
6. Reviewers inspect high-risk diffs.
7. Verifiers run targeted checks, then repo-wide guardrails.
8. Integrator commits and records `CHANGELOG.md` / `TODO.md`.

## Collision Protocol

If two agents need the same path:

1. Stop the lower-priority agent.
2. Pick one owning lane.
3. Convert the second task to read-only review or move it to a different lane.
4. Merge the owner lane first.
5. Rebase/restart the second task from the new base.

## What To Automate First

- Lane validation in CI with `pnpm check:lane-ownership`.
- Task manifests for agent-created branches.
- GitHub issue labels that map to lane IDs.
- PR template checks for lane ID, owned paths, shared files, and verification.
- A dashboard showing active lanes, worktrees, PRs, blocked paths, and check status.

## What Not To Automate Yet

- Direct merge to `main` from an agent without human approval.
- Release publishing from a feedback item without a signed release gate.
- Billing, refund, provider-routing, or privacy-boundary changes without human review.
- Secret-bearing workflows in untrusted PR contexts.
