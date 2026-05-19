---
archived: 2026-05-16
reason: Superseded by Wave 4 frontend rebuild (PR #366 + `agi-frontend-v3-rebuild` team work)
new_ssot: ~/.claude/plans/robust-whistling-crane.md
---

# Pre-v3 archive — 2026-05-16

These plan and verification docs were superseded by the Wave 4 frontend rebuild
(PR #366 plus the `agi-frontend-v3-rebuild` team work, 2026-05-16). The new
single source of truth plan is `~/.claude/plans/robust-whistling-crane.md`.

Each file is preserved here for historical reference. Git history is preserved
because the files were moved via `git mv`.

## Index — what replaced each archived file

| Archived file                | Why archived                                                                                                                                                                                                                           | Replaced by                                                                                                   |
| ---------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------- |
| `UNIFIED_LAUNCH_PLAN.md`     | Pre-v3 launch plan covering waves 1–3 (P0/P1 remediation, public MVP, Hobby tier). All wave 1+2 work shipped; wave 3 partial. Wave 4 rebuilds the frontend layer entirely, so the unified plan no longer reflects the active strategy. | `~/.claude/plans/robust-whistling-crane.md` (new SSOT plan)                                                   |
| `SHIP_RUNBOOK.md`            | Operational runbook for the pre-v3 launch sequence (cargo audit, signing, notarization, Vercel deploy, Supabase migration apply). Steps remain referenceable but the surface order and gating changes under Wave 4.                    | New runbook to be authored alongside `robust-whistling-crane.md` once Wave 4 surfaces are ready to ship.      |
| `DESIGN.md`                  | Top-level design overview written pre-rebrand and pre-v3 component library. Superseded by the brand mark proposals + design tokens work landed 2026-05-15 and the Wave 4 component spec.                                               | `docs/design/design-spec-2026-05-15.md` and `docs/design/brand-mark-proposals/` (preview + 3 SVG directions). |
| `SURFACE_VERIFICATION.md`    | Cross-surface "are we live" verification matrix from 2026-05-08. Surface inventory captured here is now stale (mobile drawer pivot, Pro+ wiring, packages/data-layer all landed after).                                                | `scripts/launch-verify.sh` (executable verification harness) and `scripts/verify-surfaces.sh`.                |
| `VERIFICATION_2026-05-08.md` | One-shot verification snapshot from 2026-05-08 autonomous session. Superseded by the later launch-readiness verification on 2026-05-15.                                                                                                | `memory/launch-readiness-2026-05-15.md` (auto-memory snapshot) and the active `scripts/launch-verify.sh`.     |

## Note on missing files

The task list also mentioned `docs/plans/wave2-desktop-v1.md`,
`docs/plans/wave3-mobile-extensions-web.md`,
`docs/plans/master-remediation.md`, and `docs/plans/sprint1-vault-rewire.md`.
Those files were previously archived under different filenames in
`docs/archive/` (see `2026-05-14-wave2-desktop-v1.md`,
`2026-05-14-wave3-mobile-extensions-web.md`,
`2026-05-02-master-remediation.md`, `2026-05-02-sprint1-vault-rewire.md`).
No move was needed for those — they were already out of the active plan tree.
