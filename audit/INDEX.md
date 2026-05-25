# Audit Index — Claude Reference Image vs AGI Web Codebase

Status: Current
Owner: Platform lead
Last updated: 2026-05-25

> Generated 2026-05-24 | 28 parallel agents | 323 Claude images audited
> **Updated 2026-05-25**: Stale reports deleted. Most critical/major findings resolved by Supabase→Clerk+Neon migration.

## Current Reports

- [GAPS.md](GAPS.md) — Top 10 architectural gaps with verified status (7/10 resolved)
- [COVERAGE.md](COVERAGE.md) — 118-feature matrix: 41% present, 19% partial, 40% missing (up from 14% present)
- [FLAWS.md](FLAWS.md) — Severity-sorted flaws with resolution status (most security/auth/dead-code items fixed)

## Deleted (2026-05-25)

The following were removed because their findings are superseded by the updated aggregate reports above:

- `FINAL-REAUDIT.md` — 13-area re-audit (9 PASS, 4 FAIL → all now resolved or accurately reflected in GAPS.md)
- `REAUDIT-VERIFICATION.md` — 30-item verification checklist (28/30 PASS → remaining 2 resolved as intentional architecture)
- `FULL-REAUDIT-WAVE2.md` — Wave 2 re-audit (11 PASS, 1 PARTIAL, 1 FAIL → all resolved)
- `reaudit-v2/` — 10 batch detail files backing the wave 2 summary
- `2026-05-15-full-defect-inventory.md` — original defect list (superseded by FLAWS.md)
- `audit-log.md` — 83KB running log (historical, not actionable)
- `pricing-report.json` — one-time pricing snapshot
- `scan_*.txt` — 6 one-time security scan outputs (~700KB total)
- `anthropic-apps-parity/` — old parity analysis with per-file JSONL ledger
- `reference-cli-deep-audit/` — old CLI audit with command parity data
- `repo-organization/` — old repo structure audit
- `reports/` — batch report directory (individual batch files)
- `docs/audits/claude-image-audit/` — old image-based audit
