# Desktop Audit — 2026-05-20

Scope: `apps/desktop/` (Tauri v2 + React, ~1,917 source files, ~683k LOC).
Method: tool-driven sweep — `pnpm typecheck`, `pnpm lint` (root and scoped), `pnpm exec eslint apps/desktop/src`, grep patterns for hardcoded model IDs / URLs / secrets / unsafe casts / suppressed lints / debug logs / TODOs / dead code markers, plus targeted file reads. Full line-by-line audit of 683k LOC is not feasible in a single session; this is the high-leverage pass.

## Tool results

| Check                                                       | Scope                                                   | Result                                                                                                                        |
| ----------------------------------------------------------- | ------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------- |
| `pnpm typecheck` (desktop)                                  | `apps/desktop/src`                                      | ✅ pass — `tsc --noEmit` clean                                                                                                |
| `pnpm exec eslint apps/desktop/src --max-warnings=0`        | desktop only                                            | ✅ pass — zero issues                                                                                                         |
| `pnpm lint` (root)                                          | repo-wide                                               | ❌ 15 errors — all out-of-desktop-scope (see P2-1)                                                                            |
| Hardcoded model IDs in `src/**/*.ts(x)`                     | model-string regex, excluding tests/mocks/`models.json` | ✅ 0 matches — CLAUDE.md rule respected                                                                                       |
| Hardcoded API URLs in `src`                                 | provider hostnames                                      | 26 matches — all legitimate (BYOK provider presets in `CustomModelsSettings.tsx`, MSW test setup, the marketing download URL) |
| Secret-literal scan in `src`                                | `sk-…`, `api_key=…`, etc.                               | ✅ 0 matches (the one hit was an HTML `<label htmlFor="password">`)                                                           |
| `as any` casts in `src`                                     | grep                                                    | 6 occurrences (low)                                                                                                           |
| `@ts-ignore` / `eslint-disable` in `src`                    | grep                                                    | 55 occurrences                                                                                                                |
| `console.log(` in `src`                                     | grep                                                    | 21 occurrences (10 files) — likely some debug noise                                                                           |
| `TODO`/`FIXME`/`HACK`/`XXX` in `src`                        | grep                                                    | 56 occurrences                                                                                                                |
| `unsafe {` in `src-tauri/src`                               | grep                                                    | ~10 — all platform-specific FFI (`AXIsProcessTrusted`, `libc::kill`, Windows / macOS power, native messaging). Expected.      |
| `.unwrap()`/`.expect(`/`panic!` in `src-tauri/src` non-test | grep                                                    | 2,228 — high; needs targeted review (see P2-2)                                                                                |

## Findings

### P0 — none found in this pass.

### P1

**P1-1 (DEAD) — `apps/desktop/e2e/tests/agi-workflow.spec.ts` is orphaned dead/fake test code.**

- 284 lines, ~50 `data-testid` selectors used (`agi-nav-link`, `create-goal-button`, `goal-description-input`, `outcome-card`, `knowledge-nav-link`, …).
- **0 of those selectors exist in `apps/desktop/src`** — verified by grep against the full src tree.
- The "AGI Workspace" feature it tests doesn't exist (`grep -rn "AGI Workspace"` against `src` returns 0 matches).
- No `testMatch` pattern in `apps/desktop/playwright.config.ts` matches `**/tests/agi-workflow.spec.ts` (project `agi` matches `**/agi.spec.ts`, a different existing file).
- Zero references to it anywhere else in the repo.
- Added in `495af43d3 fix: resolve file corruption, syntax errors, and type issues` — looks like a file recovered from corruption, but the underlying feature was never built.
- **Action:** delete `apps/desktop/e2e/tests/agi-workflow.spec.ts`.

**P1-2 (DEAD) — `apps/desktop/e2e/comprehensive-flows.spec.ts` likely also dead.**

- 80 `data-testid` references; sampled `chat-input`, `send-message`, `message-item`, `model-selector` — **all 0 matches in `apps/desktop/src`**.
- Also orphaned (no `testMatch` pattern matches `**/comprehensive-flows.spec.ts`).
- Self-described as "COMPREHENSIVE END-TO-END TEST SUITE" but never executes.
- **Action:** verify the remaining 76 selectors, then delete (or rewrite against real selectors if the testing intent is still valid).

### P2

**P2-1 — Root `pnpm lint` fails on 2 mobile mock files + 1 local-only stray file (15 errors total).**

- `apps/mobile/__mocks__/expo-sqlite.js` and `apps/mobile/__mocks__/@kingstinct/react-native-healthkit.js` use `jest.fn()` / `module.exports` without an ESLint env config for jest/commonjs. 14 of the 15 errors.
- `.remember/tmp/last-ndc.ts` is an untracked local-tooling artifact (single-line file: `1779294356;`). Not in git, not in `.gitignore`, but ESLint walks it. Causes 1 local-only error.
- Out-of-desktop scope; root lint failure persists. Fix paths: add jest globals to ESLint config for the mock files (or rewrite as ESM), and add `.remember/` to the root `.eslintignore`.

**P2-2 — `2,228 .unwrap()/.expect()/.panic!` calls in `apps/desktop/src-tauri/src/` non-test code.**

- High raw count; many are legitimate (early `main()` failures, parsing constants, infallible invariants). A meaningful triage requires a structured sweep, file by file, separating "infallible by construction" from "user-input-reachable panic." Not done in this pass.
- **Action:** open a follow-up audit targeting `#[tauri::command]` handler bodies first, since those are user-input reachable and a panic there crashes the IPC handler.

**P2-3 — 6 other orphaned e2e test files in `apps/desktop/e2e/` that no `testMatch` pattern catches:**

- `advanced-integration-flows.spec.ts` — pattern `**/integration*.spec.ts` requires filename to _start_ with `integration`; this starts with `advanced-`.
- `accessibility-audit.spec.ts`
- `test-stability-runner.spec.ts`
- `browser-automation.spec.ts`
- `integration/rust-backend.spec.ts` — the `**/integration*.spec.ts` glob matches by _filename_ prefix, not by parent directory.
- **Action:** for each, verify whether the selectors target real UI; either wire into a playwright project, delete, or move under a non-test directory.

### P3

**P3-1 — `21 console.log(` calls across 10 files in `src/`.** Mostly retry logs, voice-transcription debug, storage helpers. Should migrate to a structured logger.

**P3-2 — `55 ESLint suppressions / @ts-ignore` in `src/`.** Audit each to either justify with a comment + rule scope, or remove.

**P3-3 — Legacy barrels intentionally kept:**

- `src/features/onboarding/OnboardingWelcome.tsx` re-exports `OnboardingWizard` under the legacy name (used by `src/App.tsx:1230` lazy import).
- `src/components/Onboarding/index.ts` re-exports from `src/features/onboarding/` (used by the same lazy import path).
- Both are documented and intentional, not dead. Could be flattened to a single source eventually.

**P3-4 — `HtmlArtifact.tsx:466` iframe sandbox is `"allow-scripts allow-modals"`.** Intentionally allows `alert()`/`confirm()`/`prompt()` in user-rendered HTML. Already correctly omits `allow-same-origin`, `allow-top-navigation`, `allow-forms`, `allow-popups`, `allow-pointer-lock`, `allow-downloads`, and sets `referrerPolicy="no-referrer"`. Reasonable, but worth documenting as a deliberate product decision.

## Verified non-bugs

- `apps/desktop/src-tauri/src/sys/commands/browser.rs` `open_url` (PR #374, merged) correctly enforces http/https schemes, requires HITL confirmation, uses `open::that` (no shell injection on Windows).
- Tauri capabilities (`apps/desktop/src-tauri/capabilities/default.json`) — restrictive filesystem `allow` list scoped to `$DOCUMENT`, `$DOWNLOAD`, `$APPDATA`. Acceptable for v1.
- Migrations: `CURRENT_VERSION = 63` in `apps/desktop/src-tauri/src/data/db/migrations.rs:7`; matches the PR #374 fix that landed via `87e7eca5b`.
- AUDIT-006-005, AUDIT-006-021, AUDIT-006-028 comments in `src/stores/executionStore.ts` and `src/stores/terminalStore.ts` are post-fix breadcrumbs, not unresolved findings (verified by reading the surrounding code).
- The 125-file unstaged diff that I observed earlier in the session is now safely in `git stash@{0}: wip: working-tree noise unrelated to mobile PR`. Restorable; not lost.

## Verification status

| Check                                                      | State                                          |
| ---------------------------------------------------------- | ---------------------------------------------- |
| Local `pnpm typecheck`                                     | ✅                                             |
| Local `pnpm exec eslint apps/desktop/src --max-warnings=0` | ✅                                             |
| Local `pnpm lint` (root)                                   | ❌ (15 errors, all out-of-scope — see P2-1)    |
| Local `cargo clippy --lib` (Tauri)                         | ⏳ running at audit-write time                 |
| Main CI on `6b5e9cf5c` (PR #374 merge)                     | ⏳ `check` job in progress at audit-write time |
| Previous PR #374 head-commit run `26147897803`             | ✅ all 15 checks green (proven before merge)   |

## Out-of-scope by user direction

The user constrained work to "desktop part only" earlier in the session. The following were therefore not audited here and remain open:

- `apps/cli/` (~155k LOC Rust TUI) — has a 125-file uncommitted formatter diff in `stash@{0}`.
- `apps/web/`, `apps/mobile/`, `apps/extension/`, `apps/extension-vscode/`, `packages/`, `services/`, `supabase/`.

A full repo-wide line-by-line audit at the scale demanded by the audit prompt is not achievable in a single session for this codebase (683k LOC desktop alone, ~2.5M LOC repo-wide). The findings above are the highest-leverage observations from a tool-driven and pattern-driven sweep. Subsequent passes should target one surface or one severity tier at a time.
