# Repository Guidelines

## Project Structure & Module Organization

- Monorepo managed by pnpm; primary app lives in `apps/desktop` (Tauri + Vite + React + Tailwind). Browser extension work is under `apps/extension`; `apps/_future_mobile` is parked.
- Shared code sits in `packages/` (`types`, `utils`); backend pieces live in `services/` (`api-gateway`, `signaling-server`; update-server TBD). Repo-level configs live at the root (`package.json`, `tsconfig.base.json`, lint configs) and helper scripts sit in `dev-scripts/`; infra/migrations folders were removed until real assets exist.
- Tests live inside features (`apps/desktop/src/**/__tests__`) with E2E/Playwright suites under `apps/desktop/e2e` and `apps/desktop/playwright`; there's no root `tests/` directory.

## Build, Test, and Development Commands

- `pnpm dev:desktop` - run the desktop app in dev mode (Tauri + Vite).
- `pnpm build:desktop` / `pnpm build:all` - create desktop binaries or build every workspace package except the desktop app itself.
- `pnpm test` - run all workspace tests; `pnpm lint` and `pnpm typecheck` gate common CI checks.
- App-specific: `pnpm --filter @agiworkforce/desktop test` (Vitest), `... test:coverage`, `... test:e2e` (Playwright), `... dev` or `... dev:vite` for frontend-only loops.
- Use Node 20.x and pnpm 9.x (see `package.json` engines); Rust 1.90.0 is pinned via `rust-toolchain.toml` for the Tauri backend.

## Coding Style & Naming Conventions

- TypeScript-first; prefer `.tsx` for UI. Prettier enforces 2-space indentation, single quotes default, and no trailing semicolons unless inserted by tooling.
- ESLint configs live at the repo root and under `apps/desktop`; run `pnpm lint` before committing. `lint-staged` + Husky format/lint staged files automatically after `pnpm prepare`.
- Naming: React components and types use `PascalCase`, hooks `useThing.ts`, utilities `camelCase`, files and folders `kebab-case` or lower-case as in `src/hooks`, `src/stores`.

## Testing Guidelines

- Unit/integration: Vitest with `*.spec.ts(x)` in `__tests__` or colocated next to sources. Use `test:coverage` to monitor deltas; add mocks via `msw` where APIs are touched.
- E2E: Playwright specs in `apps/desktop/e2e`; use `test:smoke` for quick sanity and `test:e2e:ui` for interactive debugging. Keep selectors stable and prefer `data-testid`.
- Rust side: run `cargo fmt && cargo clippy` inside `apps/desktop/src-tauri` before shipping backend changes.

## Commit & Pull Request Guidelines

- Conventional commits enforced by commitlint (e.g., `feat(ui): add agent graph panel`, `fix(api): guard null session`). Keep subjects under ~72 characters and avoid WIP prefixes.
- For PRs: include a concise summary, linked issue/ticket, a checklist of checks you ran (`pnpm test`, `pnpm lint`, `pnpm typecheck`, relevant Playwright suites), and UI screenshots or recordings when visuals change. Keep PRs scoped; split refactors from feature work when possible.

## Security & Configuration Tips

- Use `.env.example` files (root and `apps/desktop/.env.example`) as templates; never commit real secrets. Prefer `mcp-servers-config.example.json` for MCP server setup.
- Tauri builds depend on the pinned Rust toolchain; run `rustup show` if builds fail. On Windows, the repo disables debug info in dev builds to avoid PDB limits; avoid toggling profile settings unless necessary.

## Current Layout (post-cleanup)

- Desktop: `apps/desktop/src` for UI (components/pages/services/stores), `src-tauri` for Rust commands; `p2p` placeholder removed, sidecars removed.
- Extension: `apps/extension` minimal Vite bundle; no native-messaging/popup subfolders remain.
- Mobile (parked): `apps/_future_mobile` kept for reference; empty stubs removed.
- Packages: `packages/types`, `packages/utils`; `ui-components` removed (alias dropped from `tsconfig.base.json`).
- Services: `services/api-gateway` (Node), `services/signaling-server`; `update-server` folder removed pending real implementation.
- Infra/migrations: removed empty scaffolding; add back only when populated with real IaC or schema assets.

## Desktop Architecture (Nov 2025 alignment)

- Feature-first domains under `apps/desktop/src/{components,pages,services,stores,api,lib,utils,types}`; keep shared UI primitives local to `components` until a real package exists.
- Rust core exposes only stable Tauri commands; keep modules aligned to domains (`automation`, `agent`, `billing`, `security`, `window`, `commands`), avoid empty stubs. Add new modules with tests + command registration.
- State: co-locate Zustand stores per domain; persist via `windowStatePersistence` or Rust DB only when needed. Prefer derived selectors over passing whole slices.
- Data layer: `api/` for HTTP + MCP clients, `services/` for orchestration, `stores/` for UI state, `components/` for presentation. Keep tool schemas/types in `packages/types` when shared across Rust/TS.
- Assets and configs: colocate with features; avoid cross-feature imports except via `lib/` utilities.

## Unified Agentic Chat & Automation UX

- Shell: single-pane conversational UI with right-rail tool/trace panel; session list in a compact nav; command palette (`Cmd/Ctrl+K`) to launch agents/tools.
- Tasks: multi-step plans surfaced inline with retry/approve controls; show tool invocations with structured cards (inputs/outputs, timing, cost); allow offloading to background with notifications.
- Context: unified context panel (files, calendar, browser tabs, clipboard, DB rows) with explicit opt-in; model/tool selection pinned per session with safety rails.
- Execution: enforce per-task capability scopes (files, network, browser) with human-readable prompts and revocation; log runs to SQLite via Rust for audit.
- Performance: stream tokens with incremental diff view; prefer server-side or local LLM fallbacks gated by `local-llm` feature; keep GPU-heavy work off the UI thread.

## Backend, Auth, and Subscription Notes

- Desktop auth should rely on the website/OIDC handoff (Google or site login) then exchange for a short-lived desktop token stored via OS keychain; refresh via the gateway.
- Subscriptions: Stripe or in-house billing should live in `services/api-gateway`; expose minimal license endpoints to desktop. No billing logic in the client.
- Telemetry/analytics: keep behind explicit consent; send via `services/api-gateway` with per-event privacy filters; avoid direct third-party beacons from the client.
- Update delivery: updater not wired; add a signed update server when ready rather than keeping empty placeholders.

## Cleanup Performed & Owner Actions

- Removed: empty `packages/ui-components`, unused Rust `p2p` module, empty sidecars, empty infra/migration scaffolding, empty extension/mobile stubs, stray .gitkeep files, zero-length Dockerfiles, and the unused update-server folder.
- Updated: dropped the `@agiworkforce/ui-components` path alias from `tsconfig.base.json`; refreshed this document to be the single source of truth.
- Owner actions: supply real infra/IaC when ready; stand up the update server (or drop the feature); configure auth/billing secrets on the website/backend; reintroduce sidecars only when binaries/configs are ready and wired into Tauri.
