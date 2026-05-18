# Mobile Pilot Reorg — Team Status

**Branch:** `claude/reorg-mobile-pilot-2026-05-18`
**Worktree:** `/Users/siddhartha/Desktop/agiworkforce-reorg-mobile-pilot`
**Owner:** Reorg supervisor (Claude) + delegated subagents
**Status:** in progress
**Started:** 2026-05-18

## Why this exists

Mobile is on launch crunch (target 2026-08-16). ~17 engineers are actively writing to `apps/mobile/` in parallel.
This file is the coordination point for the structural-reorg work so we don't collide with teammate edits.

## In-flight scope (Phase 3, pilot)

Single feature: **`waitlist`**. Chosen because it is stable (Wave 0 task #14 complete) and unlikely to be re-edited during the pilot window.

### Files this branch will touch

| Action | Old path                                              | New path                                                       |
| ------ | ----------------------------------------------------- | -------------------------------------------------------------- |
| move   | `apps/mobile/services/waitlist.ts`                    | `apps/mobile/src/features/waitlist/service.ts`                 |
| move   | `apps/mobile/stores/waitlistStore.ts`                 | `apps/mobile/src/features/waitlist/store.ts`                   |
| move   | `apps/mobile/components/waitlist/CloudWaitlistSheet.tsx` | `apps/mobile/src/features/waitlist/CloudWaitlistSheet.tsx`     |
| add    | barrel at each old path                                | re-exports from new path                                       |
| add    | `apps/mobile/src/features/waitlist/index.ts`          | public barrel for the feature                                  |

Plus the bootstrap scaffolding for `apps/mobile/src/{entry,core,features,platform,integrations,storage,ui}/` (empty placeholder `index.ts` in each).

## Active-edit zones we are AVOIDING (per founder directive)

Do **not** touch:
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

If a delegate finds an unavoidable dependency on one of these, STOP and surface to the supervisor.

## Gate results

| Stage                              | Command                                                  | Result        | Commit  |
| ---------------------------------- | -------------------------------------------------------- | ------------- | ------- |
| Step 1: bootstrap                  | n/a                                                      | (pending)     |         |
| Step 2: mobile code index          | n/a                                                      | (pending)     |         |
| Step 3: skeleton                   | `pnpm --filter @agiworkforce/mobile typecheck`           | (pending)     |         |
| Step 4: waitlist move              | `pnpm --filter @agiworkforce/mobile typecheck`           | (pending)     |         |
| Step 4: waitlist move              | `pnpm --filter @agiworkforce/mobile test`                | (pending)     |         |
| Step 5: verifier                   | independent diff review                                  | (pending)     |         |

## Mitigations applied

1. Work runs in an isolated `git worktree` (`/Users/siddhartha/Desktop/agiworkforce-reorg-mobile-pilot`). Original tree at `/Users/siddhartha/Desktop/agiworkforce` is not touched.
2. All delegates are required to commit with explicit paths only — no `git add -A`, no `git add .`, no `git commit -a`.
3. Lint-staged race risk: zero, because the worktree starts clean and we commit one logical change at a time.
4. Barrels at old paths preserve the public contract — active teammates' imports keep resolving.

## Communication protocol

- Subagents append a row to the "Files this branch will touch" table before opening any file.
- Subagents update the "Gate results" table with command output (PASS/FAIL + summary line) after each gate.
- If a gate fails, the delegate STOPs and reports — does not retry blindly.
- Supervisor sends a SendMessage update every 30 min while delegates are working.
