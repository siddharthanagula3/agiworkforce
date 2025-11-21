# AGENTS.md — Working Guidelines

Use this condensed guide when contributing as an agent. It merges the repository rules with the Claude playbook so you can move quickly without re-reading multiple docs.

## Project Layout

- Primary focus is `apps/desktop` (React 18 + Vite) with Tauri/Rust backend in `apps/desktop/src-tauri` (`agi/`, `automation/`, `router/`, `mcp/`, `browser/`).
- Companion targets: `apps/mobile` (Expo) and `apps/extension` (browser). Keep platform-only assets inside each app.
- Shared code lives in `packages/{types,ui-components,utils}`; import via `@agiworkforce/*` aliases from `tsconfig.base.json`.
- Backend services live under `services/{api-gateway,signaling-server,update-server}`. Docs in `docs/`, automation/scripts in `scripts/`, infra/config in `configs/` and `infrastructure/`, migrations in `migrations/`. Generated artifacts in `artifacts/`, `target/`, `test-results/` only.

## Tooling & Versions

- Node 20.11+ (use `nvm use` to switch to v22), pnpm 9.15+, Rust 1.90 (`rust-toolchain.toml`), Tauri 2.0.
- Prettier: 2-space, single quotes, trailing commas, `printWidth` 100. ESLint must be clean; Husky + lint-staged run on staged files.

## Install, Dev, Build

```powershell
pnpm install                 # root install (prefer --frozen-lockfile if CI-like)
pnpm --filter @agiworkforce/desktop dev   # Tauri dev (UI + backend)
pnpm --filter @agiworkforce/desktop dev:vite # UI-only shell
pnpm --filter @agiworkforce/desktop build    # Vite build + Tauri bundle
pnpm build:all               # workspace builds excluding desktop
```

Rust backend (from `apps/desktop/src-tauri`):

```powershell
cargo check
cargo test
cargo fmt --check
cargo clippy --all-targets -- -D warnings
```

## Quality Gates & Testing

- TypeScript: `pnpm typecheck` (or `pnpm typecheck:all` for workspace), `pnpm lint`, `pnpm test`.
- Frontend tests: `pnpm --filter @agiworkforce/desktop test`, `test:ui`, `test:coverage` (HTML at `apps/desktop/coverage/index.html`).
- Playwright E2E: `pnpm --filter @agiworkforce/desktop test:e2e`, `test:smoke`, or `test:e2e:ui`.
- Rust coverage: `cargo llvm-cov --workspace --all-features` (HTML in `target/llvm-cov/html`).
- Coverage targets: 70% overall, 85% for security/AGI-critical modules, 80% for new code.
- Co-locate tests as `*.test.ts[x]` or in `__tests__/`; Rust tests live beside modules under `#[cfg(test)]`.

## Coding Standards

- React components and Zustand stores use PascalCase filenames; hooks use `useName`. Favor lazy loading for heavy UI, error boundaries, and avoid state mutation in stores (use Immer helpers).
- Rust files are snake_case; avoid `unwrap`/`expect` in production paths, prefer typed errors, and document public APIs with `///`.
- When adding Tauri commands: annotate with `#[tauri::command]`, re-export in `commands/mod.rs`, register in `invoke_handler!` within `main.rs`, and manage shared state via `app.manage(...)`.

## Security & Configuration

- Never commit secrets; credentials belong in Windows Credential Manager (desktop app settings) or env files under `configs/`. MCP/LLM endpoints must be redacted.
- Enforce permission prompts for automation; keep telemetry and security modules aligned with `SECURITY.md`.
- SQLite state at `%APPDATA%/agiworkforce/agiworkforce.db` is user data—scrub before sharing logs.

## Git, Commits, and PRs

- Conventional Commits (enforced by commitlint/Husky): `feat|fix|chore|docs|test|refactor|perf|ci(scope): summary`.
- Before PR: run `pnpm typecheck`, `pnpm lint`, `pnpm test`, plus `cargo fmt --check`, `cargo clippy --all-targets`, and `cargo test`.
- PRs follow template in `CONTRIBUTING.md`: Summary, Changes, Testing (commands), and issue links (`Closes #123`). Keep scope tight; docs-only changes should stay separate from code changes.
