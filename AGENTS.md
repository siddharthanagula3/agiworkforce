# Repository Guidelines

## Project Structure & Module Organization

AGI Workforce is a pnpm workspace centered on `apps/desktop`. React UI code lives in `apps/desktop/src`, and the Tauri/Rust backend in `apps/desktop/src-tauri` (folders such as `agi/`, `automation/`, `router/`). Shared helpers go under `packages/types` or `packages/ui-components`. Docs sit in `docs/`; configuration and rollout scripts live in `configs/`, `infrastructure/`, and `scripts/`, with schema updates in `migrations/`. Tests live in `tests/` or co-located `__tests__`, while `artifacts/`, `target/`, and `test-results/` store generated output only.

## Build, Test, and Development Commands

Install via `pnpm install`, then run `pnpm --filter @agiworkforce/desktop dev` for hot reload. `pnpm lint` and `pnpm typecheck` guard TypeScript quality, while `pnpm --filter @agiworkforce/desktop build` emits binaries under `apps/desktop/src-tauri/target/release`. Execute `cargo check`, `cargo test`, `cargo fmt`, and `cargo clippy --all-targets -- -D warnings` from `apps/desktop/src-tauri` for Rust changes. Use `pnpm test` plus Playwright helpers (`pnpm --filter @agiworkforce/desktop test:ui`, `test:e2e`, `test:smoke`) to validate automation behavior.

## Coding Style & Naming Conventions

TypeScript adheres to ESLint plus the repository Prettier config (`tabWidth: 2`, `singleQuote: true`, `trailingComma: all`, `printWidth: 100`). Components use PascalCase, hooks follow `useFeature`, and shared imports should use workspace aliases like `@agiworkforce/types` instead of deep relatives. Rust modules must compile warning-free, avoid `unwrap`, document public APIs with `///`, and keep filenames snake_case.

## Testing Guidelines

Vitest drives unit tests via `pnpm test` with files named `*.test.ts`; use `pnpm test -- path/to/spec` to isolate failures and `pnpm --filter @agiworkforce/desktop test:coverage` to track >=80% coverage on automation/agent code. Playwright handles UI/e2e coverage through `pnpm --filter @agiworkforce/desktop test:ui`, `test:e2e`, and `test:smoke`. Rust tests live in `#[cfg(test)]` modules alongside source; run `cargo test -- --nocapture` when you need logs.

## Commit & Pull Request Guidelines

Commit messages must follow Conventional Commits (e.g., `fix(router): guard provider fallback`), enforced by Husky/commitlint. Before pushing, run `pnpm typecheck`, `pnpm lint`, `pnpm test`, plus the relevant `cargo` tasks to satisfy hooks. Pull requests should summarize the problem, list the solution, show test evidence (commands or UI screenshots), and link issues via `Closes #123`. Keep PRs scoped and update docs (`README.md`, `docs/developer/TESTING.md`, `CLAUDE.md`) when workflows change.

## Security & Configuration Tips

Never commit API keys or secrets; configure providers inside the desktop app so credentials stay in Windows Credential Manager. SQLite state persists at `%APPDATA%/agiworkforce/agiworkforce.db`, so scrub it before sharing logs. Store MCP and LLM endpoints via environment files under `configs/` and redact tokens from issue or PR text.
