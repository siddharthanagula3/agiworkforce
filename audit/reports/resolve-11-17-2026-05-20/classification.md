# Resolve 11-17 Classification - 2026-05-20

Snapshot path: `/tmp/agiworkforce-resolve-11-17-20260520-140511`.

This pass started from a dirty worktree with parallel-agent output. No untracked
file was deleted. Tracked changes from the previous audit remediation were
preserved.

## Adopt

- `apps/mobile/**`
  - Product work in progress for storage, legal, model management, DSAR, and release smoke scripts.
  - Adopted for hardening in this pass where it affected active typecheck/tests.
- `audit/reports/full-repo-ai-slop-2026-05-20/**`
  - Evidence from the prior audit pass.
- `audit/reports/resolve-11-17-2026-05-20/**`
  - Evidence from this pass.

## Needs Owner Before Wiring

- `apps/cli/src/{approval_audit,path_security,provenance,tool_filters}.rs`
  - Security-oriented CLI modules produced by parallel work, but not wired from tracked CLI module declarations in this branch.
  - Keep untracked until a CLI owner integrates and runs full CLI tests.
- `_archive/2026-05-17-cleanup/**`
  - Historical restore material. Do not wire without proving it is still relevant.

## Defer As Documentation/Research

- `docs/**`, `tasks/research/**`, `reports/**`, `examples/fullstack-saas/**`
  - Useful reference/output material, but not required to close P1 runtime risks in this pass.
  - Should be committed, archived, or pruned in a separate documentation hygiene pass.

## Generated Or Audit Output

- `audit/scan_*.txt`, `audit/reports/*_scan.txt`, `audit/reports/web_routes*.tsv`
  - Generated evidence. Keep if needed for review; otherwise eligible for archival.

## Worktree Rule

If new untracked files appear while remediation is running, stop and reclassify
before editing overlapping paths.
