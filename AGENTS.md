# Repository Guidelines

## Project Structure & Module Organization

This repository is a pnpm + Rust monorepo.

- `apps/web`: Next.js web app (`app/`, `__tests__/`, `e2e/`) with SSO, admin security/directory-sync APIs.
- `apps/desktop`: React/Vite desktop UI with Tauri backend in `apps/desktop/src-tauri`.
- `apps/extension`: browser extension (Vite, Manifest v3) with native messaging, side panel, and desktop automation.
- `services/api-gateway`, `services/signaling-server`: Node/Express services with `__tests__/`.
- `packages/types`, `packages/utils`: shared workspace packages.
- `docs/`: architecture, deployment, testing, and operations docs.

## Build, Test, and Development Commands

Use Node `>=22.12` and pnpm `>=9.15`.

- `pnpm install`: install all workspace dependencies.
- `pnpm lint`: run ESLint across the repo.
- `pnpm format:check`: verify Prettier formatting.
- `pnpm typecheck:all`: run TypeScript checks in all workspaces.
- `pnpm test`: run workspace test suites.
- `pnpm build`: build all non-desktop packages.
- `pnpm dev:desktop`: run desktop app locally.
- `pnpm --filter @agiworkforce/web dev`: run web app locally.
- `cargo test --workspace --lib`: run Rust library tests (Tauri workspace).

## Security & Enterprise

- **Database encryption**: SQLCipher for database-at-rest encryption, key derivation from machine ID + master password
- **Kill switch**: `account_status` column on profiles, enforced in API gateway
- **JWT hardening**: Algorithm pinning (HS256), issuer/audience claims
- **Circuit breaker**: LLM provider failure tracking with exponential cooldown
- **Cost caps**: Per-task ($5) and per-session ($50) limits on agent execution
- **Prompt injection prevention**: XML escape and multiline sanitization
- **SSO & SCIM**: Supabase SSO integration with domain detection, WorkOS directory sync webhooks
- **Proxy & TLS**: Custom CA cert support, system certificate store trust via rustls-tls-native-roots

## Coding Style & Naming Conventions

Prettier is authoritative (`.prettierrc.json`): 2-space indent, single quotes, semicolons, trailing commas, `printWidth: 100`.
Follow ESLint rules (`eslint.config.mjs`) and fix warnings before opening a PR.

- React components: `PascalCase.tsx`
- Hooks: `useX.ts`
- Utilities/services: `camelCase.ts`
- Intentionally unused args/vars: prefix with `_`.

## Testing Guidelines

Primary frameworks:

- Vitest for unit/integration tests (`*.test.ts`, `*.test.tsx`).
- Playwright for E2E in `apps/web/e2e` and `apps/desktop/e2e`/`playwright`.
- Rust tests under `apps/desktop/src-tauri/tests` and module `tests` folders.
  Run package-level coverage with `pnpm --filter <workspace> test:coverage` when changing core logic. No global coverage threshold is enforced, but new code should include focused tests.

## Commit & Pull Request Guidelines

Commits must follow Conventional Commits (enforced by commitlint), e.g. `feat: add device pairing endpoint`, `fix: handle websocket reconnect`.
Keep commits scoped to a single concern/workspace when possible.
For PRs, include:

- concise summary and affected paths
- linked issue/ticket (if available)
- validation steps you ran (e.g., `pnpm lint`, `pnpm test`)
- screenshots or recordings for UI changes
