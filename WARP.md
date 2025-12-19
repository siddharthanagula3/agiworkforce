# WARP.md

This file provides guidance to WARP (warp.dev) when working with code in this repository.

## Repo basics

- This is a pnpm workspace monorepo (`pnpm-workspace.yaml`). The primary product is the Tauri desktop app in `apps/desktop`.
- Toolchain pins:
  - Node: see root `package.json` `engines` (Node 20.x)
  - pnpm: see root `package.json` `packageManager` (pnpm 9.x)
  - Rust: pinned via `rust-toolchain.toml` (used by `apps/desktop/src-tauri`)

## Common commands (run from repo root)

### Install

```bash
pnpm install
```

### Desktop app (Tauri + Vite)

```bash
pnpm dev:desktop
pnpm build:desktop
```

Frontend-only loop (no Tauri):

```bash
pnpm --filter @agiworkforce/desktop dev:vite
```

### Tests

Run all workspace tests:

```bash
pnpm test
```

Desktop unit tests (Vitest):

```bash
pnpm --filter @agiworkforce/desktop test
pnpm --filter @agiworkforce/desktop test:ui
pnpm --filter @agiworkforce/desktop test:coverage
```

Run a single Vitest test file:

```bash
pnpm --filter @agiworkforce/desktop test -- src/stores/__tests__/unifiedChatStore.test.ts
```

Desktop E2E (Playwright):

```bash
pnpm --filter @agiworkforce/desktop test:e2e
pnpm --filter @agiworkforce/desktop test:e2e:ui
pnpm --filter @agiworkforce/desktop test:smoke
```

### Lint / format / typecheck

```bash
pnpm lint
pnpm format
pnpm typecheck
pnpm typecheck:all
```

### Rust checks (desktop backend)

From `apps/desktop/src-tauri`:

```bash
cargo fmt
cargo clippy
cargo test
```

### Build everything except the desktop app

```bash
pnpm build:all
```

### Other workspaces (when needed)

Marketing site (Next.js) in `apps/web`:

```bash
pnpm --filter web dev
pnpm --filter web build
pnpm --filter web start
```

Node services:

```bash
pnpm --filter @agiworkforce/api-gateway dev
pnpm --filter @agiworkforce/signaling-server dev
```

## Project structure (big picture)

### Workspaces

- `apps/desktop`: main desktop app (Vite + React UI) + `src-tauri` (Rust backend, Tauri commands)
- `apps/web`: Next.js marketing/auth site
- `apps/extension`: minimal extension build (Vite)
- `packages/types`, `packages/utils`: shared TS code imported by the desktop app (and potentially other workspaces)
- `services/*`: Node backends (gateway/signaling)

### Desktop app architecture (`apps/desktop`)

#### UI entry points

- `apps/desktop/src/main.tsx`: mounts the React app and global providers.
- `apps/desktop/src/App.tsx`: main shell.
  - Loads the primary UI (`components/UnifiedAgenticChat`) and overlays.
  - Checks onboarding state via a Tauri command (`invoke('get_onboarding_status')`).
  - Initializes global listeners (e.g. agent status events) and app-level stores.

#### State management (Zustand)

- Most UI state and domain state lives in `apps/desktop/src/stores/*`.
- `apps/desktop/src/stores/unifiedChatStore.ts` is the “hub” store for the agentic chat UI:
  - conversations + messages
  - action/operation logs (filesystem, terminal, tool executions)
  - approvals/trust (safe-mode workflow signatures)
  - agent status (bootstrapped via `refresh_agent_status` and live-updated via Tauri events)

#### Frontend → backend boundary (Tauri invoke)

- The frontend uses `invoke(...)` extensively to call Rust Tauri commands.
- Calls are typically wrapped in `apps/desktop/src/api/*` modules (e.g. `api/orchestrator.ts`, `api/automation.ts`).
- `apps/desktop/src/lib/tauri-mock.ts` provides a “web development mode” fallback when not running inside Tauri (`isTauri`); some APIs are mocked so parts of the UI can run via `dev:vite`.

#### “Services” layer

- `apps/desktop/src/services/*` contains orchestration/helpers that sit above the low-level API wrappers and stores (e.g., auth, analytics, error tracking, websocket client).

#### Tests

- Unit/integration tests are colocated under `apps/desktop/src/**/__tests__` (Vitest).
- Playwright E2E lives under `apps/desktop/e2e` (and related Playwright config under `apps/desktop/playwright`).
- `apps/desktop/future_scope/` contains archived/disabled modules and is excluded from builds/lint/typecheck.

### Rust backend architecture (`apps/desktop/src-tauri`)

#### Core entry and command registration

- `apps/desktop/src-tauri/src/main.rs` delegates to `agiworkforce_desktop::run()`.
- `apps/desktop/src-tauri/src/lib.rs`:
  - initializes core services/state via `app.manage(...)` (DB connection, approval controller, auth manager, etc.)
  - registers the Tauri command surface with `tauri::generate_handler![ ... ]`

When adding a new Tauri command:

1. implement it under `apps/desktop/src-tauri/src/commands/<domain>.rs`
2. export it from `apps/desktop/src-tauri/src/commands/mod.rs`
3. add it to the `tauri::generate_handler![ ... ]` list in `apps/desktop/src-tauri/src/lib.rs`
4. call it from TS via `invoke('<command_name>', payload)` (often via a small wrapper in `apps/desktop/src/api/*`)

#### Domain modules

Rust code is organized into domain modules under `apps/desktop/src-tauri/src/` (e.g. `automation/`, `agent/`, `filesystem/`, `terminal/`, `workflows/`). These typically have a corresponding command surface in `apps/desktop/src-tauri/src/commands/`.

#### Persistence

- The app uses a local SQLite DB in the Tauri app data directory (`agiworkforce.db`).
- DB migrations run during app setup via `db::migrations` (see `apps/desktop/src-tauri/src/db`).

#### Approvals / “safe mode”

- The Rust side initializes an `ApprovalController` early in `run()` and exposes commands used by the UI to approve/reject risky actions.
- The UI tracks pending approvals and trusted workflows primarily via `stores/unifiedChatStore.ts`.

## Path aliases to know

- TS base aliases are defined in `tsconfig.base.json` (and `apps/desktop/vite.config.ts` also defines Vite aliases).
- Common ones:
  - `@/*` / `@desktop/*` → `apps/desktop/src/*`
  - `@types/*` → `packages/types/src/*`
  - `@utils/*` / `@agiworkforce/utils` → `packages/utils/src/*`

## Environment/config files (desktop)

- Copy `apps/desktop/.env.example` → `apps/desktop/.env` for local provider keys.
- MCP servers can be configured via `apps/desktop/mcp-servers-config.example.json`.
