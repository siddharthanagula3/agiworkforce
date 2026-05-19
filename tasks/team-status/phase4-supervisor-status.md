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

**All 5 batches executed without any regression.** Web and mobile error sets are byte-identical to the captured baselines in `phase4-baseline-{web,mobile}-errors.txt`.

## Open questions for founder

1. **Path X vs Path Y for runtime split.** I executed Path Y (state stays in universal barrel; only `agentContext` moves to `runtime/node`). Inventory proved state has no Node-built-in dependency and 2 consumers; Path X would require migrating those 2 desktop files. Path Y is lower-risk and achieves the polyfill removal. If you want pure Path X (state + context both in `node.ts`), it's a ~10 LOC follow-up. See `reference-index/phase4-runtime-split-proposal.md` § Open question.

2. **Whether to address the casing-collision blocker in mobile.** `apps/mobile/app/(app)/chat/[id].tsx:22` imports `@/components/composer/Composer` but a sibling file uses `Composer/Composer` — pre-existing baseline error, breaks the mobile bundle. Out of Phase 4 scope (apps/mobile/ source). I'd recommend a Phase 4.5 single-file fix (rename to lowercase consistently) before Phase 5 begins.

3. **Whether to address the web FormData TS2740 error** in `apps/web/app/api/llm/v1/audio/transcriptions/route.ts:118` similarly. Same flavor of blocker; gates Web's `next build`.

4. **Phase 5 start order recommendation: Web first, then Desktop, then Mobile, then Extensions, then CLI.** See final-state doc § "Recommended Phase 5 start order".
