# Phase 4 Supervisor — Live Status

| Step             | State       | When       | Notes                                                                                                                                                                                                                                                                                          |
| ---------------- | ----------- | ---------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1. Bootstrap     | DONE        | 2026-05-18 | Worktree created off `claude/refine-local-plan-yhjFU @ 005299e55`; deps installed; baseline recorded in `tasks/team-status/phase4-baseline.md`. Web + mobile baseline RED (pre-existing, see baseline doc). All 4 anchors + 8 providers + desktop + vscode-extension + chrome-extension GREEN. |
| 2. Inventory     | DISPATCHING | 2026-05-18 | About to spawn `contracts-inventory-agent`.                                                                                                                                                                                                                                                    |
| 3. Plan          | PENDING     | —          | Awaits inventory results.                                                                                                                                                                                                                                                                      |
| 4. Execute       | PENDING     | —          | Sequential batches, each ≤5 files.                                                                                                                                                                                                                                                             |
| 5. Runtime split | PENDING     | —          | Final structural change.                                                                                                                                                                                                                                                                       |
| 6. Final report  | PENDING     | —          | Includes mobile bundle + web build verification.                                                                                                                                                                                                                                               |

## Strict gates for every batch

After each batch commit, the following must hold:

- The 4 anchor packages typecheck + test + build GREEN.
- All 8 provider packages typecheck + test + build GREEN.
- `apps/desktop` and `apps/extension-vscode` typecheck GREEN.
- `apps/extension` build GREEN.
- `apps/web` and `apps/mobile` typecheck no-worse-than-baseline (error set unchanged).

If any of these regresses, the batch is reverted.

## Open questions for founder (none yet)

—
