# Audit Evidence Index

Status: Current
Owner: Platform lead
Last updated: 2026-06-05
Purpose: Compact map of audit evidence that can be used without treating dated reports as current product truth.

## Current Audit Evidence

| Path                                              | Status       | Use                                                                                                                          |
| ------------------------------------------------- | ------------ | ---------------------------------------------------------------------------------------------------------------------------- |
| `audit/tool-parity/desktop-tool-parity-ledger.md` | Active       | Desktop model-callable tool parity against local Claude Code, Codex, Hermes, OpenClaw, Claw Code, and Gemini CLI references. |
| `audit/desktop-ui-computer-use/README.md`         | In progress  | Real packaged Desktop UI and computer-use verification evidence.                                                             |
| `audit/reports/README.md`                         | Current root | Policy for future raw automated audit reports.                                                                               |

## Archived Audit Inputs

The May 2026 audit corpus was archived during the June 5 documentation reset because several files still used `Status: Current` while describing code that has since changed.

| Original path                                            | Archived path                                                                |
| -------------------------------------------------------- | ---------------------------------------------------------------------------- |
| `audit/AUDIT-INDEX.md`                                   | `docs/archive/2026-06-05-doc-reset/audit/root/AUDIT-INDEX.md`                |
| `audit/GAPS.md`                                          | `docs/archive/2026-06-05-doc-reset/audit/root/GAPS.md`                       |
| `audit/FLAWS.md`                                         | `docs/archive/2026-06-05-doc-reset/audit/root/FLAWS.md`                      |
| `audit/COVERAGE.md`                                      | `docs/archive/2026-06-05-doc-reset/audit/root/COVERAGE.md`                   |
| `audit/CROSS-SURFACE-SYNTHESIS.md`                       | `docs/archive/2026-06-05-doc-reset/audit/CROSS-SURFACE-SYNTHESIS.md`         |
| `audit/honesty/*.md`                                     | `docs/archive/2026-06-05-doc-reset/audit/honesty/`                           |
| `audit/codequality.md` and related cross-cutting reports | `docs/archive/2026-06-05-doc-reset/audit/`                                   |
| `audit/consolidated/*.md`                                | `docs/archive/2026-06-05-doc-reset/audit/consolidated/`                      |
| `docs/audit/*` and `docs/audit/r26-parity-*`             | `docs/archive/2026-06-05-doc-reset/docs/audit/`                              |
| `audit/repo-organization/reference-index/`               | `docs/archive/2026-06-05-doc-reset/audit/repo-organization/reference-index/` |

## Verification Rule

Do not cite an archived audit finding as current without reopening the implementation file, confirming the behavior against current code, and updating a current audit ledger or source-of-truth doc with fresh evidence.
