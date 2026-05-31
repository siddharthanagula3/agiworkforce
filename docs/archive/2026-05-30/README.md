# Archived Documentation — 2026-05-30

This directory holds documentation archived during the 2026-05-30 audit consolidation + cleanup.
**Nothing was deleted** — every file was moved here via `git mv` (or `mv` for untracked files),
preserving its original relative path under this folder. All moves are fully reversible.

## Why
A full honesty audit (2026-05-30) produced a current, evidence-locked audit suite under `audit/`
(see `audit/CROSS-SURFACE-SYNTHESIS.md` + `audit/consolidated/MASTER-AUDIT-REGISTER.md`). The 22+
historical audit docs and ~280 dated snapshot/sprint/parity/report files were verified against current
code (126 still-live findings, 0 net-new criticals vs the new suite) and classified SUPERSEDED/STALE.
They are kept here as evidence, not in the active tree.

## What's here (299 files)
| Source area | Files |
|---|---|
| `audit/anthropic-apps-parity` | 41 |
| `audit/reports` | 35 |
| `docs/archive` | 34 |
| `audit/repo-organization` | 34 |
| `docs/audit` | 20 |
| `reports/audit` | 18 |
| `docs/visual-verification` | 18 |
| `reports/frontend-parity-r1` | 17 |
| `audit/reference-cli-deep-audit` | 14 |
| `reports/root-scratch-archive` | 12 |
| `docs/security` | 11 |
| `tasks/research` | 10 |
| `docs/launch` | 3 |
| `docs/design` | 3 |
| `audit/qa-readiness` | 2 |
| `tasks/team-status` | 1 |
| `tasks/launch-readiness-wave2-plan.md` | 1 |
| `tasks/launch-checklist-2026-07-18.md` | 1 |
| `reports/frontend-reference-comparison` | 1 |
| `REMEDIATION_LOG.md` | 1 |
| `REMEDIATION_BRIEF.md` | 1 |
| `docs/plans` | 1 |
| `audit/pricing-report.json` | 1 |
| `audit/audit-log.md` | 1 |
| `audit/2026-05-15-full-defect-inventory.md` | 1 |
| `audit-report.md` | 1 |

## How to restore a file
```sh
git mv docs/archive/2026-05-30/<path> <path>     # tracked files
# or: mv docs/archive/2026-05-30/<path> <path>   # untracked
```

## What was KEPT in place (not archived)
- `docs/current/**`, `docs/agent-context/**` (canon + known-flaws)
- Root control docs (AGENTS, CLAUDE, README, PLAN, TODO, CHANGELOG, CONTRIBUTING, ONBOARDING, BUILD, THIRD_PARTY_LICENSES)
- The new audit suite: `audit/CROSS-SURFACE-SYNTHESIS.md`, `audit/honesty/**`, `audit/*.md`, `audit/consolidated/**`
- `docs/security/SECURITY-SUMMARY-2026-05-30.md` (the 11 detailed red-team files are archived under `docs/security/` here; still-open findings preserved in the summary) + `auth-role-service-role-body-checks.md`
- `apps/web/db/neon/**` (32 live migrations)

## Provenance
- Archive manifest: `audit/consolidated/DOC-CLEANUP-MANIFEST.md`
- Move log: see git history (renames into this folder)
