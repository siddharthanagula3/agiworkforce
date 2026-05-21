# Documentation Status Ledger

Status: Current assessment
Owner: Docs/platform
Last updated: 2026-05-20

Purpose: prevent old docs from becoming accidental source of truth.

## Current Control Plane

| Path                                                     | Status                          |
| -------------------------------------------------------- | ------------------------------- |
| `AGENTS.md`                                              | Current agent entry.            |
| `AGI_WORKFORCE.md`                                       | Current platform entry.         |
| `PLAN.md`                                                | Current transition plan.        |
| `TODO.md`                                                | Current task queue.             |
| `CHANGELOG.md`                                           | Current change log.             |
| `BUILD.md`                                               | Current build/test guide.       |
| `docs/README.md`                                         | Current docs index.             |
| `docs/decisions/CURRENT_DECISIONS.md`                    | Current decision index.         |
| `docs/agent-context/`                                    | Current coding-agent maps.      |
| `docs/plans/pre-release-repo-organization-2026-05-20.md` | Current repo organization plan. |

## Current Product And Architecture Docs

| Path                     | Status                                                                      |
| ------------------------ | --------------------------------------------------------------------------- |
| `docs/PRD.md`            | Current platform PRD, but must defer to newer current decisions when noted. |
| `docs/PRD-MOBILE.md`     | Current mobile-specific PRD.                                                |
| `docs/PRD-APPENDIX-*.md` | Current appendix set.                                                       |
| `docs/ARCHITECTURE.md`   | Current architecture overview.                                              |
| `docs/surfaces/`         | Current surface guides.                                                     |
| `docs/decisions/*.md`    | Current ADRs unless explicitly superseded.                                  |

## Evidence And Audit Docs

| Path                           | Status                                                                 |
| ------------------------------ | ---------------------------------------------------------------------- |
| `audit/anthropic-apps-parity/` | Current parity evidence.                                               |
| `audit/repo-organization/`     | Current repo organization evidence.                                    |
| `docs/security/`               | Current and historical security findings; verify status before citing. |
| `docs/audit/`                  | Audit evidence; verify age/status before citing.                       |

## Historical Or Working Areas

| Path                 | Status                         | Rule                                                       |
| -------------------- | ------------------------------ | ---------------------------------------------------------- |
| `docs/archive/`      | Historical                     | Do not cite as current unless a current doc references it. |
| `docs/planning/`     | Historical planning            | Move current plans to `docs/plans/`.                       |
| `docs/superpowers/`  | Historical/working             | Promote durable decisions into current docs before citing. |
| `tasks/research/`    | Working research               | Promote durable conclusions into docs/audit.               |
| `tasks/team-status/` | Working status                 | Not source of truth.                                       |
| `reports/`           | Generated/inspection artifacts | Evidence only, not strategy.                               |

## Required Cleanup

- Add status headers to active docs that do not have them.
- Remove or annotate stale "canonical" claims in historical docs.
- Expand `docs/agent-context/doc-status.json` after this ledger is accepted.
