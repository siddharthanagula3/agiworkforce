# apps/desktop/archive

Status: Current
Owner role: Desktop lead
Last updated: 2026-07-27
Purpose: Superseded desktop implementations, kept for reference and out of the build.

## What this is

Code that was replaced but never removed. Every file here was proven unreachable
from `src/main.tsx` by an import-graph walk before it was moved.

It is **not** compiled, tested, or bundled:

- `tsconfig.json` only includes `src`, so nothing here is typechecked.
- `vite.config.ts` excludes `**/archive/**` from the test run.
- Vite bundles from the entry point, and nothing in `src` imports this tree.

## Why it was moved rather than deleted

`features/chat/` was the previous desktop shell. It shadowed the live one in a
way that misleads anyone reading the code:

| archived                                 | live                                  |
| ---------------------------------------- | ------------------------------------- |
| `features/chat/Sidebar.tsx` (1447 lines) | `features/v3/Sidebar.tsx` (856 lines) |

The dead copy was **larger and richer** than the live one. Grepping for
`Sidebar.tsx` found working-looking code, so a reader could reasonably conclude
a feature shipped when nothing rendered it — or edit it and see no change in the
app. `features/chat/AppLayout.tsx` imported that dead `Sidebar`, which made the
wiring look real; `AppLayout` had no importers either. Dead code importing dead
code reads exactly like live code.

## What is here

- `features/chat/` — the previous shell, 175 modules. Seven files stayed in
  `src/features/chat/` because the live v3 shell still imports them:
  `BrandedGreeting`, `CommandPalette`, `KeyboardShortcutsOverlay`,
  `ProjectSettingsDialog`, `SearchModal`, `ToolLabel`, `personalizationToPrompt`.
- `features/tool-calling/` — fully orphaned, and it imported
  `features/chat/MessageBubble/ToolCallCard` from the archived tree, so it could
  no longer compile once that moved.
- 19 test files whose subjects are archived. They were moved with the code they
  cover so the suite does not assert against modules the app cannot run.

## What is deliberately NOT here

Orphaned code is not automatically superseded. Most of the remaining unreachable
directories — `features/mcp/`, `features/marketplace/`, `features/scheduler/`,
`features/research/`, `features/governance/` — are **finished features with
working, registered Tauri backends that nothing mounts**. `features/mcp/` alone
is 18 components over a 1367-line store whose every IPC command is implemented
in `src-tauri/src/sys/commands/mcp_extensions.rs`.

Those are unshipped inventory, not debris. Do not archive them; wire them up.

## Restoring something

`git mv` it back under `src/`, then run `npx tsc --noEmit` — it will name every
import that drifted while the file sat here. Nothing in this tree is maintained,
so expect drift against the current stores and component APIs.
