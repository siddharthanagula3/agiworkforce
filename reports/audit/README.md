# reports/audit

Status: Current
Owner: Platform lead
Purpose: recon + audit ledgers — per-slice inventory, honest audit, gate baselines, and live execution state for the recon→goal mission.
Retention: Keep while the recon/goal mission is active or its findings still drive `PLAN.md`/`TODO.md`/`reports/DEFINITION_OF_DONE.md`. Summarize durable conclusions into `docs/current/` or `docs/agent-context/known-flaws.md` before archiving; archive raw per-slice files once superseded.

## Contents

- `STATE.md` — live operational state (updated every wave; canonical control doc, referenced by the goal loop).
- `AUDIT.md` — honest severity-ranked audit (Phase 3).
- `inventory/` — per-slice exhaustive inventory findings (Phase 1).
- `gate-baseline/` — raw logs + exit codes from the gate battery (build/test/lint/clippy/operability).
