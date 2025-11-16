# Repository Guidelines

## Project Structure & Module Organization

- `apps/desktop` hosts the React 18/Vite UI while `apps/desktop/src-tauri` contains the Rust automation host, capabilities, and benches.
- `apps/mobile` (Expo) and `apps/extension` deliver the mobile and browser companions; keep platform-only assets inside their respective `src` trees and pipe shared logic through workspace packages.
- Shared TypeScript primitives live in `packages/types`, `packages/utils`, and `packages/ui-components`; update them before copying code into any app.
- Backend helpers live in `services/{api-gateway,signaling-server,update-server}`, each shipping its own `src` folder and Vitest setup.
- Cross-cutting automation, docs, and assets sit in `scripts/`, `docs/`, `examples/`, `artifacts/`, and the aggregated `tests/{unit,integration,e2e,performance}` suites.

## Build, Test, and Development Commands

- Install dependencies with `pnpm install --frozen-lockfile` (Node 20.11+ and pnpm 9.15+ as enforced by `package.json`).
- Desktop loops: `pnpm dev:desktop` launches Tauri, and `pnpm --filter @agiworkforce/desktop dev:vite` runs the pure web shell for UI debugging.
- Companion apps and builds: `pnpm --filter @agiworkforce/mobile start`, `pnpm build:desktop`, and `pnpm build:all` cover Expo, Tauri, and the remaining workspace packages.
- Quality gates: `pnpm typecheck`, `pnpm lint`, `pnpm test`, `pnpm --filter @agiworkforce/desktop test:coverage`, and `pnpm --filter @agiworkforce/desktop test:e2e` must stay green before any PR.
- Rust automation: from `apps/desktop/src-tauri`, run `cargo test`, `cargo fmt --check`, `cargo clippy --all-targets -- -D warnings`, and `cargo llvm-cov --all-features --workspace`.

## Coding Style & Naming Conventions

- Prettier enforces 2-space indentation, 100-character lines, semicolons, single quotes, and trailing commas; use `pnpm format` or `pnpm lint:fix` to auto-apply.
- ESLint (`.eslintrc.cjs`) requires zero warnings, and Husky plus lint-staged auto-run ESLint/Prettier on staged JS/TS/JSON/MD files.
- React components, Zustand stores, and providers under `apps/desktop/src` should use PascalCase filenames (for example, `UnifiedAgenticChat.tsx`), while hooks use the `useName` convention.
- Shared contracts belong in `packages/types` and other workspace packages, and must be imported through the `@agiworkforce/*` aliases defined in `tsconfig.base.json`.
- Rust modules under `src-tauri` follow snake_case files, stay formatted via `cargo fmt`, and keep capability/bench assets inside their current directories.

## Testing Guidelines

- Vitest covers TypeScript/JavaScript units; keep specs as `*.test.ts[x]` or in colocated `__tests__` folders and lean on the helpers plus MSW mocks located in `apps/desktop/src/test`.
- Playwright e2e suites sit in `apps/desktop/e2e`; run `pnpm --filter @agiworkforce/desktop test:e2e`, `test:smoke`, or `test:e2e:ui` and view reports in `apps/desktop/playwright-report`.
- Coverage requirements from `TESTING.md` apply: >=70% repo-wide, >=85% for AGI/security-critical modules, and >=80% for all new code.
- Rust coverage uses `cargo llvm-cov --workspace --all-features`; frontend coverage uses `pnpm --filter @agiworkforce/desktop test:coverage` with the HTML report at `apps/desktop/coverage/index.html`.
- Integration, performance, and scenario tests belong in the root `tests` tree; isolate fixtures per test to keep suites parallelizable.

## Commit & Pull Request Guidelines

- Follow Conventional Commits enforced by commitlint and Husky, e.g., `fix(automation): handle empty UIA window`, and build feature branches like `feat/<short-summary>`.
- Before opening a PR, rerun `pnpm typecheck`, `pnpm lint`, `pnpm test`, `cargo test`, `cargo fmt --check`, and `cargo clippy --all-targets`; CI mirrors these commands.
- PR descriptions should follow the template in `CONTRIBUTING.md` with Summary, Changes, Testing (list commands), and linked issues via `Closes #123`.
- Keep commits focused on a single concern and avoid mixing documentation-only edits with production code changes; rebase on `main` instead of merging.

## Security & Configuration Tips

- Secrets must never enter version control; `SECURITY.md` details how API keys are stored in the OS keyring and how encryption/ACLs are enforced inside `apps/desktop/src-tauri/src/security`.
- Any new automation capability or MCP integration must pass through the validators and command-classification layers under `apps/desktop/src-tauri/src/security` before execution.
- Leverage the config templates in `configs/` for linting, formatting, and bundling, and keep remote services aligned with the TLS, request-signing, and RBAC rules documented in `SECURITY.md`.
