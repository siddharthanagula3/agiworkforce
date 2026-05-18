# Mobile Pilot Reorg — Team Status

**Branch:** `claude/reorg-mobile-pilot-2026-05-18`
**Worktree:** `/Users/siddhartha/Desktop/agiworkforce-reorg-mobile-pilot`
**Owner:** Reorg supervisor (Claude)
**Status:** waitlist + feedback + compare migrated — awaiting founder review
**Started:** 2026-05-18
**Last update:** 2026-05-18 (after expansion to feedback + compare)

## Why this exists

Mobile is on launch crunch (target 2026-08-16). ~17 engineers are actively writing to `apps/mobile/` in parallel.
This file is the coordination point for the structural-reorg work so we don't collide with teammate edits.

## In-flight scope (Phase 3, pilot)

Three features migrated to the canonical layer-map. All single-feature, low-risk targets that exercised the temp-barrel pattern + the Expo route-wrapper pattern.

### Files this branch touched (cumulative)

#### Migration 1 — waitlist (commit `c18f16d74`)

| Action  | Old path                                                  | New path                                                       |
| ------- | --------------------------------------------------------- | -------------------------------------------------------------- |
| move    | `apps/mobile/services/waitlist.ts`                        | `apps/mobile/src/features/waitlist/service.ts`                 |
| move    | `apps/mobile/stores/waitlistStore.ts`                     | `apps/mobile/src/features/waitlist/store.ts`                   |
| move    | `apps/mobile/components/waitlist/CloudWaitlistSheet.tsx`  | `apps/mobile/src/features/waitlist/CloudWaitlistSheet.tsx`     |
| barrel  | `apps/mobile/services/waitlist.ts`                        | `export * from '@/src/features/waitlist/service'`              |
| barrel  | `apps/mobile/stores/waitlistStore.ts`                     | `export * from '@/src/features/waitlist/store'`                |
| barrel  | `apps/mobile/components/waitlist/CloudWaitlistSheet.tsx`  | `export * from '@/src/features/waitlist/CloudWaitlistSheet'`   |
| add     | `apps/mobile/src/features/waitlist/index.ts`              | public feature barrel                                          |

Internal-import normalization on moved files:
- `service.ts` line 1: `from './supabase'` → `from '@/services/supabase'`
- `store.ts` line 4: `from '@/services/waitlist'` → `from './service'`

#### Migration 2 — feedback (commit `4a6aeb810`)

| Action     | Old path                                | New path                                       |
| ---------- | --------------------------------------- | ---------------------------------------------- |
| move       | `apps/mobile/app/(app)/feedback.tsx`    | `apps/mobile/src/features/feedback/index.tsx`  |
| wrapper    | `apps/mobile/app/(app)/feedback.tsx`    | `export { default } from '@/src/features/feedback'` |

#### Migration 3 — compare (commit `d156c53d9`)

| Action     | Old path                                | New path                                       |
| ---------- | --------------------------------------- | ---------------------------------------------- |
| move       | `apps/mobile/app/(app)/compare.tsx`     | `apps/mobile/src/features/compare/index.tsx`   |
| wrapper    | `apps/mobile/app/(app)/compare.tsx`     | `export { default } from '@/src/features/compare'` |

Plus the bootstrap scaffolding for `apps/mobile/src/{entry,core,features,platform,integrations,storage,ui}/` from commit `f37a29a3f`.

## Active-edit zones we are AVOIDING (per founder directive)

We did NOT touch any of:
- `apps/mobile/components/chat/**`
- `apps/mobile/components/vision/**`
- `apps/mobile/services/voice*`, voice-related files
- translate / translation feature files
- memory feature files
- onboarding/** files
- compliance/** files
- healthkit/** + native iOS modules (`apps/mobile/native/ios/AGIAppIntents/`)
- skills/** files
- projects/** files
- model-picker/** files
- performance/** files

Note: `compare.tsx` **reads** from `@/components/chat/ChatInput` and `@/components/model-picker/ModelPickerSheet`. This is allowed — the rule is about *editing* banned-zone files, not about consumers that import from them. After moving compare to `src/features/compare/`, those imports continue to resolve unchanged.

## Patterns proven

| Pattern                                  | Used for                              | Notes                                                                  |
| ---------------------------------------- | ------------------------------------- | ---------------------------------------------------------------------- |
| `export * from '<new-path>'`             | waitlist (services, stores, components) | Re-exports named exports. Use when old path has no default export, or the default is not Expo-route-significant. |
| `export { default } from '<new-path>'`   | feedback, compare (Expo routes)       | Required for Expo route wrappers so the router picks up the screen.    |
| `git mv` + leave wrapper at OLD path     | all three                             | History tracks rename; consumers keep working through wrapper.         |
| One-feature-per-commit                   | all three                             | Reviewable diff. Easy to revert.                                       |

## Gate results

| Stage                              | Command                                                                | Result        | Commit       |
| ---------------------------------- | ---------------------------------------------------------------------- | ------------- | ------------ |
| Step 1: bootstrap                  | n/a (filesystem only)                                                  | PASS          | `4c7151033`  |
| Step 2: mobile code index          | n/a (generator script + output)                                        | PASS          | `fe0e0c615`  |
| Step 3: skeleton                   | `pnpm --filter @agiworkforce/mobile typecheck`                         | PASS \*       | `f37a29a3f`  |
| Step 4: waitlist (typecheck)       | `pnpm --filter @agiworkforce/mobile typecheck`                         | PASS \*       | `c18f16d74`  |
| Step 4: waitlist (test)            | `pnpm --filter @agiworkforce/mobile test -- --testPathPattern waitlist` | PASS 24/24    | `c18f16d74`  |
| Step 5: verifier                   | independent diff review (6 invariants)                                 | PASS          | n/a          |
| Step 6: status doc finalize        | n/a                                                                    | PASS          | `3b947d563`  |
| Expansion: feedback (typecheck)    | `pnpm --filter @agiworkforce/mobile typecheck`                         | PASS \*       | `4a6aeb810`  |
| Expansion: feedback (test, full)   | `pnpm --filter @agiworkforce/mobile test`                              | PASS \*\*     | `4a6aeb810`  |
| Expansion: compare (typecheck)     | `pnpm --filter @agiworkforce/mobile typecheck`                         | PASS \*       | `d156c53d9`  |
| Expansion: compare (test, full)    | `pnpm --filter @agiworkforce/mobile test`                              | PASS \*\*     | `d156c53d9`  |

\* "PASS" for typecheck = no NEW errors vs the pre-change baseline. The mobile tsc baseline has 30 pre-existing errors caused by uncommitted teammate files (`storage/db`, `PerformanceChip`, `ModeToggle`, `ModeSwitchModal`, `complianceLedger`, `healthKitPermission`), plus 2 casing-mismatch bugs in tracked code, plus 1 route-typing issue. None caused by, or affected by, this reorg. Diff between baseline and final error sets: 0 across all three migrations.

\*\* "PASS" for full test = 48 suites pass / 9 fail / 878 tests pass / 0 individual failures — identical failed-suite SET to pre-change baseline. The 9 failing suites are pre-existing baseline failures from the same uncommitted-storage issues blocking typecheck (`storage/db` chain triggers cascading failures in chatStore, drawer-content, doc-qa, tool-access-selector, onboarding, style-selector, add-to-chat, chat-store-additions, healthkit).

## Mitigations applied

1. Work runs in an isolated `git worktree` (`/Users/siddhartha/Desktop/agiworkforce-reorg-mobile-pilot`). Original tree at `/Users/siddhartha/Desktop/agiworkforce` is not touched.
2. All commits use explicit paths only — no `git add -A`, no `git add .`, no `git commit -a`. Verified across all 7 reorg commits.
3. Lint-staged race risk: zero, because the worktree starts clean and we commit one logical change at a time.
4. Barrels at old paths preserve the public contract — active teammates' imports keep resolving (manual verification via grep + typecheck + test pass).
5. The dirty `pnpm-lock.yaml` in the working tree (modified by filtered `pnpm install`) was NEVER staged. The committed `pnpm-lock.yaml` matches the source-branch state exactly.
6. Pre-existing stashes (3, owned by founder) preserved.
7. Rebased onto latest source-branch tip when needed to stay current.

## Recommended next pilot feature

Out of the remaining route-leaf candidates, the safest target is **`share-preview`** — `apps/mobile/app/(app)/share-preview.tsx`. TL-owned, route leaf, 9 outgoing imports (modest), no active-edit dependencies expected. Single-file migration with the proven Expo-route-wrapper pattern.

### Second-best alternatives (in order of safety)

1. `widget-setup.tsx` — TL-owned, 8 imports, but marked "(defer)" in the orchestration plan. Half-built; migration might surface awkward imports.
2. `+error.tsx` — TL-owned, 6 imports. **Special caution**: Expo treats `+error.tsx` as a special-named route for error boundaries. The wrapper pattern should work (Expo resolves by filename, not content), but worth a careful read of Expo router docs before the move. Defer until needed.
3. `settings/personalization.tsx` — TL-owned, 10 imports. Settings sub-route. Safe but slightly higher dependency surface than share-preview.

### Definitely AVOID

- All `_layout.tsx` files — they are Expo's route-container files, cannot be moved without breaking the router contract.
- All `cloud-mode-gate` owned files (79 files) — they are gated/dead-code for v1 per the locked v1-local-only directive. Moving them adds friction with no value until cloud is enabled.
- All active-edit-zone files (chat, vision, voice, translate, memory, onboarding, compliance, healthkit, skills, projects, model-picker, performance).
- All `services/*` files with high incoming-import counts (e.g. `services/supabase.ts` has 17 incoming) until the consumer migration is planned.

## Communication protocol

- Subagents append a row to the "Files this branch will touch" table before opening any file.
- Subagents update the "Gate results" table with command output (PASS/FAIL + summary line) after each gate.
- If a gate fails, the delegate STOPs and reports — does not retry blindly.
- Supervisor sends a SendMessage update every 30 min while delegates are working.

## Verifier verdict (post-expansion)

Both expansion migrations applied the same proven pattern with zero regression. Each commit:
- Single file moved + single wrapper created
- Identical exported component (default), identical implementation
- Typecheck: 30 errors → 30 errors (no diff)
- Test: 48p/9f → 48p/9f (identical failed-suite set)
- Public route URL unchanged (`/feedback`, `/compare`)
- Commit touches only the 2 paths it owns

Recommend founder review on the branch, then approve or request changes.
