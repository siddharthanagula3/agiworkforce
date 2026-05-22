# VS Code extension surface

> **Path:** `apps/extension-vscode/` · **Stack:** VS Code extension API + TypeScript · **Owner:** founder · **Status:** v0.3.0; Marketplace submission pending. **Updated:** 2026-05-18.

## Mission

The VS Code extension brings AGI's chat into the editor as a `@agi` chat participant, plus standalone sidebar webview, History tree, Context Files tree, model picker, inline completions, code lens, hover, and telemetry. Bridges to the desktop app via port 8787.

## Status at HEAD

| Item                | State                                                                                                        |
| ------------------- | ------------------------------------------------------------------------------------------------------------ |
| Version             | v0.3.0                                                                                                       |
| `out/extension.js`  | ✅ compiled                                                                                                  |
| Audit P0s           | ✅ all closed (verified 2026-05-05)                                                                          |
| Marketplace listing | ⏳ no listing yet                                                                                            |
| Description copy    | ✅ "Multi-provider AI coding assistant — 10+ providers (GPT, Claude, Gemini, and more) in VS Code"           |
| Brand name          | ⚠ `package.json:displayName` may still read "AGI Workforce"; public brand is "AGI" (V5 lock from 2026-05-15) |

## Verified codebase numbers (2026-05-17 audit)

- **50** source `.ts` files in `apps/extension-vscode/src/`
- **27** test `.ts` files
- **15,322** LOC
- **62** commands — was claimed 55-56 in older memory (understated)
- **25** configuration settings — was claimed 23 (understated)
- **13** keybindings
- **6** `@agi` chat participant slash commands: `/explain`, `/fix`, `/refactor`, `/tests`, `/docs`, `/model`
- **352** tests across **20** suites (per older audit; reverify with `pnpm --filter agi-workforce test`)

## Stack

| Item                   | Choice                                                 |
| ---------------------- | ------------------------------------------------------ |
| Language               | TypeScript                                             |
| Test runner            | Mocha + vscode-test                                    |
| Bundler                | esbuild                                                |
| Settings               | `agi-workforce.*` namespace                            |
| Bridge                 | port 8787 to desktop (`desktopBridge.enabled` setting) |
| Marketplace package id | `agi-workforce`                                        |

## File layout

```
apps/extension-vscode/
├── package.json                    ⚠ contributes.commands (62), contributes.configuration.properties (25), contributes.keybindings (13)
├── src/                            50 source files / 15,322 LOC
│   ├── extension.ts                entry; activate / deactivate
│   ├── chatParticipant.ts          @agi chat participant; 6 slash commands
│   ├── sidebar/                    webview-based sidebar
│   ├── history/                    History tree provider
│   ├── contextFiles/               Context Files tree provider
│   ├── modelPicker.ts              auto-balanced model picker (selects across 13 providers)
│   ├── inlineCompletions.ts       inline completion provider
│   ├── codeLens.ts
│   ├── hover.ts
│   ├── telemetry.ts                off by default
│   ├── desktopBridge.ts            port 8787 client
│   ├── subsystemHealth.ts          line 38: registers `agi-workforce.showSubsystemHealth` (was a ghost command per older audit — closed)
│   └── ...
├── __tests__/                      27 test files / 352 tests / 20 suites
├── out/                            esbuild output; out/extension.js is loaded by VS Code
└── README.md                       Marketplace listing copy
```

## 62 commands (high-level groups)

Per `package.json:contributes.commands`:

- Chat: open chat, new conversation, switch model, clear history, show subsystem health
- Code actions: explain, fix, refactor, write tests, write docs (mirrors chat slash commands)
- Editor: insert response, replace selection, accept diff, reject diff
- Model: switch provider, switch model, configure provider, show usage
- Sidebar: focus sidebar, toggle sidebar, refresh
- Context: add file to context, remove from context, clear context
- Plus ~40 more — full list in `package.json` (62 total per 2026-05-17 audit)

## 25 settings

Per `package.json:contributes.configuration.properties` (25 keys in `agi-workforce.*` namespace). Notable:

- `agi-workforce.desktopBridge.enabled` (port 8787 to desktop)
- `agi-workforce.telemetry.enabled` (default false)
- `agi-workforce.defaultProvider` (read from models.json)
- `agi-workforce.defaultModel`
- Plus ~21 more

## 13 keybindings

Per `package.json:contributes.keybindings`. Notable:

- `ctrl+shift+a` — dual-binding with mutually-exclusive `when` clauses (`!agi-workforce.hasDiff` for chat / `agi-workforce.hasDiff && editorTextFocus` for accept-diff). **Intentional** per audit; not a duplicate-binding bug.

## Build + test commands

```bash
# Build
pnpm --filter agi-workforce build
# Output: apps/extension-vscode/out/extension.js

# Package as .vsix
pnpm --filter agi-workforce package
# Output: apps/extension-vscode/agi-workforce-0.3.0.vsix

# Tests (Mocha + vscode-test)
pnpm --filter agi-workforce test

# Typecheck
pnpm --filter agi-workforce typecheck

# Lint
pnpm --filter agi-workforce lint
```

## Release process

1. Bump `package.json` version
2. `pnpm --filter agi-workforce package` → `.vsix`
3. Upload to VS Code Marketplace via `vsce publish` (requires Publisher account + Personal Access Token)
4. Marketplace processes (~1-24 hours)
5. Auto-updates push to users with the extension installed

## Provider integrations on VS Code ext

Same 10+ providers. Per audit, the extension knows about **13 providers** (matches CLI's 12 named + Custom). Model picker is "auto-balanced" — selects across providers based on context (file type, query type, current model usage).

## Current open work (Wave 6)

1. **W6 #14** — VS Code ext finalization (Marketplace submission package)
2. **Brand rename** — verify `package.json:displayName` reads "AGI" not "AGI Workforce" before Marketplace listing
3. **Marketplace icon** — 128×128 PNG required
4. **Marketplace screenshots** — 4-6 screenshots required
5. **Publisher account setup** — VS Code Marketplace Publisher ID + PAT (one-time founder action)

## Gotchas

- **`ctrl+shift+a` is intentionally dual-bound**, not a bug. The `when` clauses make it mutually exclusive.
- **Test count is 352 (not 314 as older docs claimed).** Verify with `pnpm --filter agi-workforce test`.
- **Description copy must read "10+ providers" not "10+ models"** per V5 §10 lock #1 expansion. Audit confirmed correct copy 2026-05-05.
- **`subsystemHealth.ts:38` registers a command** (`agi-workforce.showSubsystemHealth`) — but older `commandParity.test.ts` gave false GREEN due to module-level state pollution. Closed 2026-05-05.
- **No `GPT-5.4` hardcoded strings in production source** — only in test fixtures (`src/__tests__/extension.test.ts:182-184`). Confirmed clean.

## Current References

- [docs/current/product-suite.md](../current/product-suite.md) - six-surface product role and developer-surface sync boundary.
- [docs/current/technical-architecture.md](../current/technical-architecture.md) - provider, runtime, and contract ownership.
- [docs/current/agent-and-repo-operability.md](../current/agent-and-repo-operability.md) - current docs and agent workflow rules.
- [docs/decisions/CURRENT_DECISIONS.md](../decisions/CURRENT_DECISIONS.md) - no hardcoded model IDs and current trust-boundary rules.
- Historical extension layout details live in `docs/archive/2026-05-21-docs-consolidation/`.

## Memory references

- `memory/audits/ui-cross-surface-2026-05-05.md` — cross-surface audit findings (VS Code section)

## Operational owner

Founder. VS Code Marketplace Publisher account: pending setup.
