# AGI Workforce Desktop App

Tauri + Vite + React desktop workspace for the AGI Workforce project.

## Structure

- `src/`: Frontend code (components, pages, stores, api, utils, types)
- `src-tauri/`: Rust backend (Tauri commands, event emitters)
- `future_scope/`: Archived/disabled features (employees, marketplace, ROI dashboard); excluded from builds and lint/typecheck.

## Environment

Copy `.env.example` → `.env` in this directory and set provider keys (`VITE_OPENAI_API_KEY`, `VITE_ANTHROPIC_API_KEY`, `VITE_GOOGLE_API_KEY`, optional Sentry/telemetry flags). MCP servers can be configured via `mcp-servers-config.example.json`.

## Commands

From repository root (preferred):

```bash
pnpm dev:desktop                   # Tauri + Vite dev loop
pnpm build:desktop                 # Build frontend + Tauri bundles
pnpm --filter @agiworkforce/desktop test         # Vitest
pnpm --filter @agiworkforce/desktop test:e2e     # Playwright
pnpm --filter @agiworkforce/desktop typecheck     # TS check
pnpm lint                          # ESLint (future_scope ignored)
```

From `apps/desktop`:

```bash
pnpm dev        # Vite + Tauri dev
pnpm build      # Vite build + tauri build
pnpm test       # Vitest
pnpm test:e2e   # Playwright
pnpm typecheck  # TS check
pnpm lint:fix   # ESLint fix
```

## Notes

- Rust toolchain pinned to 1.90.0 (see `rust-toolchain.toml`).
- Builds are unsigned; no auto-updater configured.
- Approval workflow prompts for dangerous tools when safe mode is enabled.
