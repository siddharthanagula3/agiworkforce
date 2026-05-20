# Squad: desktop-fe

**Surface:** apps/desktop/src/ | **Subagent:** desktop-engineer

## Baseline (cited from plan)

- `: any` in `apps/desktop/src`: **25 lines / 8 files**
- `describe.skip / it.skip / test.skip` in `apps/desktop/src`: **15 instances**
- `pnpm typecheck` against `apps/desktop` is currently GREEN on this checkout
- App ~700 .rs files (squad #1's domain) + ~430 .tsx files + 84 stores + 38 hooks (yours)

## Checker output (source of truth)

- **typecheck**: PASS — `pnpm --filter desktop typecheck` exits 0, no output (clean)
- **lint**: PASS — `pnpm --filter desktop lint` exits 0, no output (clean)
- **test**: PASS — 130 test files, 1666 passed | 1 skipped (1667 total). Duration 123s. The 1 skipped is the Radix UI Select jsdom issue in `ResearchPanel.test.tsx` (expected/tracked).

## Findings

| #   | Severity | File:line                                                                        | Category                                              | Checker-cited?                | Effort (hrs) | Note                                                                                                                                                                                                                                                                                                                                         |
| --- | -------- | -------------------------------------------------------------------------------- | ----------------------------------------------------- | ----------------------------- | ------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | P2       | `src/__tests__/e2e/windows.spec.ts:1001,1036,1076`                               | `.skip(true, ...)` hardcoded                          | No (e2e, not vitest)          | 0.5          | Three tests in `Web: Download Page — Windows Detection` unconditionally skip because `PLAYWRIGHT_WEB_BASE_URL` localhost:3000 is not running in CI. These will never self-recover in the e2e runner without the web app present. Low risk but masks coverage.                                                                                |
| 2   | P2       | `src/stores/chat/chatExecutionStore.ts:190,285,473,527` + `toolStore.ts:929,998` | `no-require-imports` — circular dep workaround        | No (lint disabled)            | 1.0          | Dynamic `require()` calls inside store actions to avoid circular import graph (`settingsStore`, `sonner`). Workaround is functional but brittle; should be refactored to lazy import or dependency injection.                                                                                                                                |
| 3   | P2       | `src/hooks/useTerminal.ts:100` + `src/hooks/useBackgroundTasks.ts:338`           | `react-hooks/exhaustive-deps` suppressed              | No (lint disabled)            | 1.0          | Two hooks have intentionally incomplete dep arrays. Missing deps could cause stale-closure bugs under fast state churn.                                                                                                                                                                                                                      |
| 4   | P3       | `src/hooks/useSessionPersistence.ts:48`                                          | `@typescript-eslint/no-empty-object-type`             | No (lint disabled)            | 0.5          | Empty interface — lint disabled. Should be `Record<string, never>` or an actual type.                                                                                                                                                                                                                                                        |
| 5   | P3       | `src/components/UnifiedAgenticChat/Widgets/` (6 files)                           | `React.ComponentType<any>` — intentional polymorphism | No (lint disabled, annotated) | 1.0          | Widget registry stores heterogeneous component types. All 6 instances carry a `-- intentional` comment. Could be improved with a discriminated-union `WidgetProps` but not a launch blocker.                                                                                                                                                 |
| 6   | P3       | `src/features/experimental/MessagingPanel.tsx:1`                                 | Uses `@/lib/tauri-mock` not `@tauri-apps/api/core`    | No                            | 0.5          | All other API files import from `@tauri-apps/api/core` directly or via named api modules. MessagingPanel is the only component-level file that imports from the internal `tauri-mock` routing layer. Not a bug — `tauri-mock` passes through to Tauri in non-cloud environments — but inconsistent with the rest of the codebase convention. |

## :any line-by-line triage (all 25)

All 25 `: any` occurrences are in test infrastructure or widget registration. There are **zero** in business-logic production code.

| File:line                                                               | Hole or escape?                      | Proposed type                          | Effort |
| ----------------------------------------------------------------------- | ------------------------------------ | -------------------------------------- | ------ |
| `test/test-utils.tsx:8`                                                 | Escape (test mock: children wrapper) | `React.ReactNode`                      | 0.25h  |
| `test/test-utils.tsx:31`                                                | Escape (test mock: Tauri event data) | `TauriEvent<unknown>`                  | 0.25h  |
| `test/test-utils.tsx:35`                                                | Escape (test mock: event handler)    | `(data: unknown) => void`              | 0.25h  |
| `test/test-utils.tsx:45`                                                | Escape (test mock: emit data)        | `unknown`                              | 0.25h  |
| `features/layout/__tests__/TitleBar.test.tsx:10`                        | Escape (framer-motion proxy mock)    | `HTMLAttributes<HTMLElement>`          | 0.5h   |
| `features/layout/__tests__/TitleBar.test.tsx:12`                        | Escape (framer-motion proxy mock)    | `HTMLAttributes<HTMLDivElement>`       | 0.5h   |
| `features/layout/__tests__/TitleBar.test.tsx:14`                        | Escape (framer-motion proxy mock)    | `HTMLAttributes<HTMLHeadingElement>`   | 0.5h   |
| `features/layout/__tests__/TitleBar.test.tsx:16`                        | Escape (framer-motion proxy mock)    | `HTMLAttributes<HTMLParagraphElement>` | 0.5h   |
| `features/layout/__tests__/TitleBar.test.tsx:22`                        | Escape (partial window state mock)   | Typed partial of actual store type     | 0.5h   |
| `hooks/__tests__/useWindowManager.test.ts:143`                          | Escape (Tauri listen mock callback)  | `TauriEvent<WindowStatePayload>`       | 0.5h   |
| `hooks/__tests__/useWindowManager.test.ts:145`                          | Escape (vi.mocked listen impl)       | `TauriEvent<WindowStatePayload>`       | 0.5h   |
| `hooks/__tests__/useWindowManager.test.ts:178`                          | Escape (same pattern)                | `TauriEvent<WindowStatePayload>`       | 0.5h   |
| `hooks/__tests__/useWindowManager.test.ts:180`                          | Escape (same pattern)                | `TauriEvent<WindowStatePayload>`       | 0.5h   |
| `hooks/__tests__/useWindowManager.test.ts:226`                          | Escape (type alias for mock)         | `TauriEvent<WindowStatePayload>`       | 0.25h  |
| `hooks/__tests__/useWindowManager.test.ts:262`                          | Escape (same pattern)                | `TauriEvent<WindowStatePayload>`       | 0.25h  |
| `hooks/__tests__/useWindowManager.test.ts:264`                          | Escape (same pattern)                | `TauriEvent<WindowStatePayload>`       | 0.25h  |
| `hooks/__tests__/useWindowManager.test.ts:319`                          | Escape (same pattern)                | `TauriEvent<WindowStatePayload>`       | 0.25h  |
| `hooks/__tests__/useWindowManager.test.ts:321`                          | Escape (same pattern)                | `TauriEvent<WindowStatePayload>`       | 0.25h  |
| `components/UnifiedAgenticChat/__tests__/ToolLabel.test.tsx:20`         | Escape (framer-motion proxy)         | `HTMLAttributes<HTMLDivElement>`       | 0.25h  |
| `components/UnifiedAgenticChat/__tests__/ThinkingBlock.test.tsx:7`      | Escape (framer-motion proxy)         | `HTMLAttributes<HTMLDivElement>`       | 0.25h  |
| `components/UnifiedAgenticChat/__tests__/ActionLogTimeline.test.tsx:28` | Escape (test mock)                   | `HTMLAttributes<HTMLDivElement>`       | 0.25h  |
| `components/UnifiedAgenticChat/__tests__/ActionLogTimeline.test.tsx:30` | Escape (test mock)                   | `HTMLAttributes<HTMLPreElement>`       | 0.25h  |
| `components/UnifiedAgenticChat/__tests__/ChatStream.test.tsx:45`        | Escape (framer-motion proxy)         | `HTMLAttributes<HTMLDivElement>`       | 0.25h  |
| `components/UnifiedAgenticChat/__tests__/ChatStream.test.tsx:47`        | Escape (framer-motion proxy)         | `HTMLAttributes<HTMLButtonElement>`    | 0.25h  |
| `components/UnifiedAgenticChat/__tests__/ToolTimeline.test.tsx:24`      | Escape (framer-motion proxy)         | `HTMLAttributes<HTMLDivElement>`       | 0.25h  |

**Verdict**: All 25 are intentional test-environment escape hatches. The framer-motion proxy pattern (10 instances) is the most common: framer-motion's `motion.*` components have complex typed props that don't reduce cleanly when shimmed in jsdom. Zero type holes in production code.

## Tauri IPC surface drift

**Clean** — all 285 FE-side `invoke('...')` calls resolve to registered BE handlers in `lib.rs`. The apparent gap in the naive grep diff was caused by some commands being registered under non-`sys::commands` module paths (`crate::sys::account::*`, `crate::sys::billing::*`, `crate::core::agent::triggers::*`, `crate::sys::commands::messaging::*`, `crate::sys::commands::realtime::*`). After tracing all module paths in the `generate_handler![]` block, every FE invocation has a matching BE handler.

One observation: `src/features/experimental/MessagingPanel.tsx` imports `invoke` from `@/lib/tauri-mock` rather than the standard `@tauri-apps/api/core`. This is not a bug (tauri-mock passes through correctly) but is the only component file to do so; all others use either direct tauri imports or named API layer modules. Flag for style alignment, not functional risk.

## Skipped tests (all 15)

| File:line                                                 | Reason                                                                   | Action                                                                                                                    |
| --------------------------------------------------------- | ------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------- |
| `__tests__/e2e/windows.spec.ts:13`                        | Doc comment only (block comment, not live code)                          | No action; line 13 is inside a `/* */` comment block                                                                      |
| `__tests__/e2e/windows.spec.ts:146`                       | Platform guard: Windows-only title bar tests                             | Keep; appropriate conditional skip                                                                                        |
| `__tests__/e2e/windows.spec.ts:201`                       | Platform guard: Windows-only system tray tests                           | Keep; appropriate conditional skip                                                                                        |
| `__tests__/e2e/windows.spec.ts:238`                       | Platform guard: Windows-only file dialog tests                           | Keep; appropriate conditional skip                                                                                        |
| `__tests__/e2e/windows.spec.ts:418`                       | Platform guard: Windows-only clipboard tests                             | Keep; appropriate conditional skip                                                                                        |
| `__tests__/e2e/windows.spec.ts:446`                       | Platform guard: Windows-only clipboard tests                             | Keep; appropriate conditional skip                                                                                        |
| `__tests__/e2e/windows.spec.ts:474`                       | Platform guard: Windows-only resize constraint tests                     | Keep; appropriate conditional skip                                                                                        |
| `__tests__/e2e/windows.spec.ts:604`                       | Platform guard: Windows-only terminal tests                              | Keep; appropriate conditional skip                                                                                        |
| `__tests__/e2e/windows.spec.ts:715`                       | Platform guard: Windows-only notification command test                   | Keep; appropriate conditional skip                                                                                        |
| `__tests__/e2e/windows.spec.ts:749`                       | Platform guard: Windows-only deep-link tests                             | Keep; appropriate conditional skip                                                                                        |
| `__tests__/e2e/windows.spec.ts:940`                       | Platform guard: Windows-only theme rapid-toggle crash test               | Keep; appropriate conditional skip                                                                                        |
| `__tests__/e2e/windows.spec.ts:1001`                      | **Unconditional**: web server not available (localhost:3000 not running) | P2 — needs CI environment variable `PLAYWRIGHT_WEB_BASE_URL` wired or test should be moved to web surface CI              |
| `__tests__/e2e/windows.spec.ts:1036`                      | **Unconditional**: web server not available                              | P2 — same as above                                                                                                        |
| `__tests__/e2e/windows.spec.ts:1076`                      | **Unconditional**: web server not available                              | P2 — same as above                                                                                                        |
| `components/Research/__tests__/ResearchPanel.test.tsx:79` | Radix UI `<Select>` portal doesn't render in jsdom                       | P3 — comment documents reason; consider `@testing-library/user-event` with `jest-dom` portal support or mock the combobox |

Note: line 13 skip counts in the baseline (15 instances) because the grep matched the comment text. The effective live-code skip count is 14: 11 platform-conditional (correct), 3 unconditional (P2), 1 jsdom limitation (P3).

## eslint-disable hotspots

| Dir                              | Count  | Top rule disabled                                                                                                                                                                                 |
| -------------------------------- | ------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `components/UnifiedAgenticChat/` | 19     | `@typescript-eslint/no-explicit-any` (14), `react-hooks/exhaustive-deps` (4), `@typescript-eslint/no-require-imports` (1)                                                                         |
| `stores/chat/`                   | 7      | `@typescript-eslint/no-require-imports` (6), `@typescript-eslint/no-explicit-any` (1)                                                                                                             |
| `test/` (test-utils + setup)     | 6      | `@typescript-eslint/no-explicit-any` (5), `@typescript-eslint/no-explicit-any` (1)                                                                                                                |
| `features/layout/__tests__/`     | 5      | `@typescript-eslint/no-explicit-any` (5)                                                                                                                                                          |
| `components/v3/`                 | 4      | `react-hooks/exhaustive-deps` (4)                                                                                                                                                                 |
| `hooks/`                         | 4      | `react-hooks/exhaustive-deps` (2), `@typescript-eslint/no-explicit-any` (1), `@typescript-eslint/no-empty-object-type` (1)                                                                        |
| `api/`                           | 1      | `no-control-regex` (1) — legitimate: stripping ANSI/control chars in `embeddings.ts`                                                                                                              |
| Other                            | 7      | Various                                                                                                                                                                                           |
| **Total**                        | **53** | `@typescript-eslint/no-explicit-any` (26), `react-hooks/exhaustive-deps` (15), `@typescript-eslint/no-require-imports` (8), `no-control-regex` (3), `@typescript-eslint/no-empty-object-type` (1) |

All 53 disable comments carry either an `-- intentional` annotation or a description of why the rule is suppressed. None are bare (no-reason) disables. Density is healthy for a codebase this size.

## Out-of-scope observations

**UnifiedAgenticChat peripheral status** (awareness only, per scope instructions — do NOT delete):
`App.tsx` actively lazy-imports and renders `CommandPalette` (line 101) and `SearchModal` (line 96) from `components/UnifiedAgenticChat/`. Both are live-rendered at runtime (`isSearchModalOpen` state, `commandPaletteOpen` state). `KeyboardShortcutsOverlay` and `ToolLabel` do NOT appear in `App.tsx` imports or renders. The parent `UnifiedAgenticChat` component itself is commented out per CLAUDE.md, but `CommandPalette` and `SearchModal` are still active peripherals. Flagging only — not proposing deletion.

**`stores/chat/chatExecutionStore.ts` circular import strategy**: The 4 dynamic `require()` calls in this file avoid circular dependency errors at module init time. This is a well-known Zustand pattern but creates hidden coupling. A proper refactor would extract the dependency into a stable event bus or a separate singleton. Estimated P2, 2-3h.

## False-positive watchlist

- The FE-BE IPC diff showed 18+ "missing" commands when grepping only `crate::sys::commands::` module paths. This is a false positive — those commands are registered under `crate::sys::account::`, `crate::sys::billing::`, `crate::core::agent::triggers::`, etc. Do not re-derive the IPC surface from `--filter commands` alone.
- The baseline count of 25 `: any` lines includes test-infrastructure files. Zero are in production business logic. Any tooling that reports "25 type holes" is over-counting.
- `windows.spec.ts:13` is inside a block comment (`/* */`) and is not a live `test.skip()` call. Grep-based counting inflates the skip count by 1.
