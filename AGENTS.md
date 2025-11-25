# Repository Guidelines

## Project Structure & Module Organization

- Monorepo managed by pnpm; primary app lives in `apps/desktop` (Tauri + Vite + React + Tailwind). Browser extension work is under `apps/extension`; `apps/_future_mobile` is parked.
- Shared code sits in `packages/` (`types`, `ui-components`, `utils`), and backend pieces live in `services/` (`api-gateway`, `signaling-server`, `update-server`). Global configs and scripts are in `configs/`, `scripts/`, and infrastructure assets in `infrastructure/`.
- Tests live both in `tests/` (cross-cutting suites) and inside features (e.g., `apps/desktop/src/__tests__`, `apps/desktop/e2e`).

## Build, Test, and Development Commands

- `pnpm dev:desktop` — run the desktop app in dev mode (Tauri + Vite).
- `pnpm build:desktop` / `pnpm build:all` — create desktop binaries or build every workspace package except the desktop app itself.
- `pnpm test` — run all workspace tests; `pnpm lint` and `pnpm typecheck` gate common CI checks.
- App-specific: `pnpm --filter @agiworkforce/desktop test` (Vitest), `... test:coverage`, `... test:e2e` (Playwright), `... dev` or `... dev:vite` for frontend-only loops.
- Use Node 20.x and pnpm 9.x (see `package.json` engines); Rust 1.90.0 is pinned via `rust-toolchain.toml` for the Tauri backend.

## Coding Style & Naming Conventions

- TypeScript-first; prefer `.tsx` for UI. Prettier enforces 2-space indentation, single quotes default, and no trailing semicolons unless inserted by tooling.
- ESLint configs live at the repo root and under `apps/desktop`; run `pnpm lint` before committing. `lint-staged` + Husky format/ lint staged files automatically after `pnpm prepare`.
- Naming: React components and types use `PascalCase`, hooks `useThing.ts`, utilities `camelCase`, files and folders `kebab-case` or lower-case as in `src/hooks`, `src/stores`.

## Testing Guidelines

- Unit/integration: Vitest with `*.spec.ts(x)` in `__tests__` or colocated next to sources. Use `test:coverage` to monitor deltas; add mocks via `msw` where APIs are touched.
- E2E: Playwright specs in `apps/desktop/e2e`; use `test:smoke` for quick sanity and `test:e2e:ui` for interactive debugging. Keep selectors stable and prefer `data-testid`.
- Rust side: run `cargo fmt && cargo clippy` inside `apps/desktop/src-tauri` before shipping backend changes.

## Commit & Pull Request Guidelines

- Conventional commits enforced by commitlint (e.g., `feat(ui): add agent graph panel`, `fix(api): guard null session`). Keep subjects under ~72 characters and avoid WIP prefixes.
- For PRs: include a concise summary, linked issue/ ticket, a checklist of checks you ran (`pnpm test`, `pnpm lint`, `pnpm typecheck`, relevant Playwright suites), and UI screenshots or recordings when visuals change. Keep PRs scoped; split refactors from feature work when possible.

## Security & Configuration Tips

- Use `.env.example` files (root and `apps/desktop/.env.example`) as templates; never commit real secrets. Prefer `mcp-servers-config.example.json` for MCP server setup.
- Tauri builds depend on the pinned Rust toolchain; run `rustup show` if builds fail. On Windows, the repo disables debug info in dev builds to avoid PDB limits—avoid toggling profile settings unless necessary.
