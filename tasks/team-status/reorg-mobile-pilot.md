# Mobile Pilot Reorg — Team Status

**Branch:** `claude/reorg-mobile-pilot-2026-05-18`
**Worktree:** `/Users/siddhartha/Desktop/agiworkforce-reorg-mobile-pilot`
**Owner:** Reorg supervisor (Claude)
**Status:** complete — awaiting founder review
**Started:** 2026-05-18
**Completed:** 2026-05-18

## Why this exists

Mobile is on launch crunch (target 2026-08-16). ~17 engineers are actively writing to `apps/mobile/` in parallel.
This file is the coordination point for the structural-reorg work so we don't collide with teammate edits.

## In-flight scope (Phase 3, pilot)

Single feature: **`waitlist`**. Chosen because it is stable (Wave 0 task #14 complete) and unlikely to be re-edited during the pilot window.

### Files this branch touched

| Action  | Old path                                                  | New path                                                       |
| ------- | --------------------------------------------------------- | -------------------------------------------------------------- |
| move    | `apps/mobile/services/waitlist.ts`                        | `apps/mobile/src/features/waitlist/service.ts`                 |
| move    | `apps/mobile/stores/waitlistStore.ts`                     | `apps/mobile/src/features/waitlist/store.ts`                   |
| move    | `apps/mobile/components/waitlist/CloudWaitlistSheet.tsx`  | `apps/mobile/src/features/waitlist/CloudWaitlistSheet.tsx`     |
| barrel  | `apps/mobile/services/waitlist.ts`                        | re-exports from `@/src/features/waitlist/service`              |
| barrel  | `apps/mobile/stores/waitlistStore.ts`                     | re-exports from `@/src/features/waitlist/store`                |
| barrel  | `apps/mobile/components/waitlist/CloudWaitlistSheet.tsx`  | re-exports from `@/src/features/waitlist/CloudWaitlistSheet`   |
| add     | `apps/mobile/src/features/waitlist/index.ts`              | public feature barrel                                          |

Plus the bootstrap scaffolding for `apps/mobile/src/{entry,core,features,platform,integrations,storage,ui}/` (one placeholder `index.ts` per layer + `apps/mobile/src/README.md` describing the layer map and migration pattern + `apps/mobile/src/.eslint-import-boundaries.example.json` documenting future hard-enforce rules).

### Internal-import normalization on the moved files

Two import-path edits inside the moved files, made so the new module graph doesn't round-trip through the legacy aliases. These are NOT call-site rewrites — they're 1-line corrections inside the implementation files we just moved:

- `apps/mobile/src/features/waitlist/service.ts`: line 1, `from './supabase'` → `from '@/services/supabase'` (the original relative was relative to the old location).
- `apps/mobile/src/features/waitlist/store.ts`: line 4, `from '@/services/waitlist'` → `from './service'` (avoid round-trip through the temp barrel).

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

We also did NOT touch the 2 call sites that consume waitlist symbols. They continue to import through the legacy paths, which now route through the barrels:
- `apps/mobile/app/(app)/chat/[id].tsx` — 3 imports (`@/components/waitlist/CloudWaitlistSheet`, `@/stores/waitlistStore`, `@/services/waitlist`)
- `apps/mobile/__tests__/waitlist.test.ts` — 2 relative imports
- `apps/mobile/__tests__/waitlist-sheet-rank.test.tsx` — 1 alias import

## Gate results

| Stage                              | Command                                                            | Result   | Commit       |
| ---------------------------------- | ------------------------------------------------------------------ | -------- | ------------ |
| Step 1: bootstrap                  | n/a (filesystem only)                                              | PASS     | `4c7151033`  |
| Step 2: mobile code index          | n/a (generator script + output)                                    | PASS     | `fe0e0c615`  |
| Step 3: skeleton                   | `pnpm --filter @agiworkforce/mobile typecheck`                     | PASS \*  | `f37a29a3f`  |
| Step 4: waitlist move (typecheck)  | `pnpm --filter @agiworkforce/mobile typecheck`                     | PASS \*  | `c18f16d74`  |
| Step 4: waitlist move (test)       | `pnpm --filter @agiworkforce/mobile test -- --testPathPattern waitlist` | PASS 24/24 | `c18f16d74`  |
| Step 5: verifier                   | independent diff review (6 invariants)                             | PASS     | n/a          |

\* "PASS" for typecheck = no NEW errors vs the pre-change baseline. The mobile tsc baseline has 30 pre-existing errors caused by uncommitted teammate files (`storage/db`, `PerformanceChip`, `ModeToggle`, `ModeSwitchModal`, `complianceLedger`, `healthKitPermission`, plus 2 casing-mismatch import bugs in `chat[id].tsx` and `model-picker/ModelPickerSheet.tsx`, plus 1 route-type issue with `/(public)/age-gate`). None of these are caused by, or affected by, this reorg. Diff between baseline and final error sets: 0.

## Mitigations applied

1. Work runs in an isolated `git worktree` (`/Users/siddhartha/Desktop/agiworkforce-reorg-mobile-pilot`). Original tree at `/Users/siddhartha/Desktop/agiworkforce` is not touched.
2. All commits use explicit paths only — no `git add -A`, no `git add .`, no `git commit -a`. Verified across all 4 reorg commits.
3. Lint-staged race risk: zero, because the worktree starts clean and we commit one logical change at a time.
4. Barrels at old paths preserve the public contract — active teammates' imports keep resolving (manual verification via grep + typecheck + test pass).
5. The dirty `pnpm-lock.yaml` in the working tree (modified by `pnpm install --filter`) was NEVER staged. The committed `pnpm-lock.yaml` matches the source-branch state exactly.
6. Pre-existing stashes (3, owned by founder) preserved.
7. Rebased onto latest source-branch tip (`a3c836998`) after `pnpm install` lockfile drift was detected — final reorg HEAD `c18f16d74` is up-to-date with `claude/refine-local-plan-yhjFU`.

## Recommended next pilot feature

Out of the four founder-shortlist options (`models`, `compare`, `account`, `feedback`), **`feedback`** is the safest next move:

| Candidate | Files | Owner | Risk |
|---|---|---|---|
| `account` | `app/(app)/account.tsx` | cloud-mode-gate | High — gated for v1, status uncertain |
| `compare` | `app/(app)/compare.tsx` | compare-engineer | Low-Medium — single file, isolated screen, owner appears inactive |
| `models` | `app/(app)/models.tsx`, `components/model-picker/*`, `lib/models.ts`, `services/modelCatalog.ts`, `stores/modelStore.ts` | model-catalog-engineer | **HIGH — model-picker is in the founder's banned list and engineer is active** |
| `feedback` | `app/(app)/feedback.tsx` | TL | Low — single file, TL-owned (stable), no other consumers |

Recommendation: **`feedback`** for the next single-feature migration. It is 1 file owned by TL with no parallel teammate edits. After that, `compare` is the next-safest.

## Communication protocol

- Subagents append a row to the "Files this branch will touch" table before opening any file.
- Subagents update the "Gate results" table with command output (PASS/FAIL + summary line) after each gate.
- If a gate fails, the delegate STOPs and reports — does not retry blindly.
- Supervisor sends a SendMessage update every 30 min while delegates are working.

## Verifier verdict

PASS (6/6 invariants). See parent-agent final report for details. Recommend founder review on the branch, then approve/request expansion to the next pilot feature.
