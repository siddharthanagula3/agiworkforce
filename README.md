# AGI Workforce (Developer Preview)

Tauri + React desktop agent workspace with tool execution, approvals, and automation rails. This repo is under active development; there are no signed installers or published releases yet—run it from source.

## Status & Scope

- Desktop app lives in `apps/desktop` (Tauri + Vite + React + Tailwind); browser extension is minimal (`apps/extension`).
- Shared code in `packages/{types,utils}`; backend experiments in `services/{api-gateway,signaling-server}`.
- Rust toolchain pinned to 1.90.0 (`rust-toolchain.toml`); Node 20.x and pnpm 9.x required (see `package.json`).
- `apps/desktop/src/future_scope` holds archived/disabled features (employees, marketplace, ROI dashboard) and is excluded from builds.
- No auto-updater or published binaries; build locally for Windows/macOS/Linux.

## What Works Today

- Unified agentic chat with streaming, multi-step tool calls, and per-tool approval flow (safe vs full control modes).
- Multi-provider LLM support (OpenAI, Anthropic, Google, Ollama) configured via `.env`; MCP servers can be added via `mcp-servers-config.example.json`.
- Tooling layer for file ops, terminal commands, browser/automation hooks, API calls, and cost/trace events; dangerous tools require approval when safe mode is enabled.
- Playwright E2E suites and Vitest unit/integration coverage for the desktop app; Rust side backed by Tauri commands with tests under `src-tauri`.

## Prerequisites

- Node.js ≥20.11.0
- pnpm ≥9.15.0
- Rust 1.90.0 + platform toolchains (VS Build Tools on Windows, Xcode CLT on macOS, WebKit/GTK deps on Linux)

## Get Started (Local Dev)

```bash
pnpm install
pnpm dev:desktop        # Tauri + Vite dev loop
```

## Build

```bash
pnpm build:desktop      # Builds the desktop app (frontend + Tauri)
pnpm build:all          # Builds all workspaces except the desktop app
```

Artifacts land under `apps/desktop/src-tauri/target/release` per platform.

## Configuration

- Copy `apps/desktop/.env.example` to `apps/desktop/.env` and set API keys (`VITE_OPENAI_API_KEY`, `VITE_ANTHROPIC_API_KEY`, `VITE_GOOGLE_API_KEY`, optional Sentry DSN, telemetry flag).
- Optional MCP servers: copy `apps/desktop/mcp-servers-config.example.json` and register endpoints.
- Conversation safety mode is controlled in-app; dangerous tools (file writes, terminal, browser/automation, git, API calls) prompt for approval when safe mode is on.

## Testing & QA

```bash
pnpm test                # Workspace tests
pnpm lint                # ESLint (max 15 warnings)
pnpm typecheck           # Desktop TypeScript check
pnpm --filter @agiworkforce/desktop test:e2e     # Playwright
pnpm --filter @agiworkforce/desktop test         # Vitest
cargo fmt && cargo clippy && cargo test          # From apps/desktop/src-tauri
```

## Repository Layout

- `apps/desktop`: Main desktop app (React UI + Tauri backend)
- `apps/extension`: Minimal browser extension scaffold
- `packages/types`, `packages/utils`: Shared code
- `services/api-gateway`, `services/signaling-server`: Backend experiments
- `dev-scripts`: Helper scripts (e.g., reset-app.ps1)

## Security Notes

- No secrets in repo; start from `.env.example`.
- Approval workflow guards dangerous tools; enable safe mode when testing new capabilities.
- Telemetry/analytics are opt-in via env/config; update server is not wired.

## Docs & Support

- Installation/build notes: `INSTALLATION.md`, `apps/desktop/README.md`
- Contribution guidelines: `CONTRIBUTING.md`
- Security policy: `SECURITY.md`
- Issues/feedback: open a GitHub issue in this repository.

## License

MIT license. See `LICENSE`.
