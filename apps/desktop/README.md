# apps/desktop

Status: Current
Owner: Desktop surface maintainers
Last updated: 2026-09-17

Two desktop applications build from this directory over one React renderer. The
repository-wide map is in `ARCHITECTURE.md`; the rules that govern changing any
of it are in `AGENTS.md`.

## The two shells

| Shell    | Host process              | Renderer it shows                                    |
| -------- | ------------------------- | ---------------------------------------------------- |
| Tauri    | `src-tauri` (Rust)        | the Vite app in `src`                                |
| Electron | `electron` (Node)         | the hosted web app, or `src` on an explicit opt-out  |

`electron/config.ts` sets `RENDERER_MODE` to `remote` unless
`AGI_CLOUD_RENDERER=bundled` is set. The Electron window therefore shows the
deployed web application by default, which is why a change to `src` can be
invisible there, and why a capability written as a Tauri command is not reachable
from it.

## Commands

| Task                      | Command                                                     |
| ------------------------- | ----------------------------------------------------------- |
| Tauri dev                 | `pnpm --filter @agiworkforce/desktop dev`                   |
| Renderer only             | `pnpm --filter @agiworkforce/desktop dev:vite`              |
| Tauri release build       | `pnpm --filter @agiworkforce/desktop build`                 |
| Tauri unsigned build      | `pnpm --filter @agiworkforce/desktop build:local`           |
| Electron dev shell        | `pnpm --filter @agiworkforce/desktop dev:electron`          |
| Electron installer        | `pnpm --filter @agiworkforce/desktop dist:electron`         |
| Unit tests                | `pnpm --filter @agiworkforce/desktop test`                  |
| Typecheck (renderer)      | `pnpm --filter @agiworkforce/desktop typecheck`             |
| Typecheck (Electron main) | `pnpm --filter @agiworkforce/desktop typecheck:electron`    |
| Rust tests                | `cargo test -p agiworkforce-desktop --lib`                  |
| WebdriverIO end to end    | `pnpm --filter @agiworkforce/desktop test:e2e`              |

`docs/agent-context/commands.json` is the machine-readable inventory; read it
rather than guessing a filter.

## The seam each shell enforces

**Tauri.** `src` reaches `src-tauri` only through registered Tauri commands.
`check-wiring.sh` fails both directions of drift: a command the Rust side
registers and nothing calls, and a call with no registration. `wiring-allowlist.json`
records the reviewed exceptions. `pnpm check:tauri-wiring` runs it, and it is
part of the guard chain.

**Electron.** `electron/preload.ts` exposes exactly one object on the window,
`agiHost`, whose contract is `src/lib/tauri-electron/bridgeContract.ts`.
Privileged work is dispatched by `electron/runtime/dispatcher.ts`, which refuses
any call whose capability has not been granted in
`electron/runtime/permissionManager.ts`, and every filesystem path is contained
by `electron/runtime/pathGuard.ts`. Local coding sessions are served by
`electron/runtime/developerSessionService.ts`, remote control by
`electron/remote`, and computer use by `electron/runtime/computerUseService.ts`.

Egress from the renderer funnels through `src/lib/egressGuard.ts`, and Rust
transports use the host-owned egress policy. `pnpm check:rust-egress-boundary`
enforces the second half.

## Two operational facts that cost time

`electron/dist/main.cjs` is one build artifact shared by the whole working tree,
not one per running shell. A running shell keeps the code it loaded, so a rebuild
looks harmless until the next restart of somebody else's shell runs it. When two
people work on the desktop at once, only the one driving rebuilds.

A capability grant the Electron shell has not been given does not fail loudly: a
dispatcher call waits on the native consent sheet instead. When a local coding
session never starts, check the grant store before suspecting the code.

## Release

`docs/qa` holds the per-release checks and `docs/macos-release-runbook.md` the
macOS signing and notarisation procedure. The release workflows themselves are
`.github/workflows/release-desktop.yml`,
`.github/workflows/release-desktop-cloud.yml` and
`.github/workflows/build-windows-release.yml`.
