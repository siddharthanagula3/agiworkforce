# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Toolchain

Node 24, pnpm 9.15.3, Rust 1.94.0 (pinned in `rust-toolchain.toml`, kept in lockstep with CI). Install with `pnpm install`.

## Commands

| Task                | Command                                                                                             |
| ------------------- | --------------------------------------------------------------------------------------------------- |
| Lint                | `pnpm lint` (Chrome extension is separate: `pnpm lint:extension`)                                   |
| Typecheck           | `pnpm typecheck:all` — note `pnpm typecheck` only covers `@agiworkforce/desktop`                    |
| Test everything     | `pnpm test`                                                                                         |
| Test what changed   | `pnpm test:affected`                                                                                |
| One package         | `pnpm --filter @agiworkforce/web test`                                                              |
| One file or pattern | `pnpm --filter @agiworkforce/web test <file-or-pattern>`                                            |
| Priority tiers      | `pnpm test:l1`, `pnpm test:l2`, `pnpm test:l3`, `pnpm test:l4`, `pnpm test:security`                |
| Build               | `pnpm build` (excludes desktop); desktop is `pnpm build:desktop`                                    |
| Dev                 | `pnpm dev:desktop`, `pnpm --filter @agiworkforce/web dev`, `pnpm --filter @agiworkforce/mobile dev` |
| Rust tests          | `cargo test -p agiworkforce-desktop --lib`, `cargo test -p agiworkforce-cli`                        |
| Rust lint           | `cargo clippy -p agiworkforce-desktop -p agiworkforce-cli --lib -- -D warnings -D unsafe-code`      |
| Migrations          | `pnpm db:migrate -- status`, `pnpm db:migrate -- apply --target local\|ci\|branch\|production`      |

`docs/agent-context/commands.json` is the machine-readable inventory of the same commands per surface — read it instead of guessing a workspace filter name.

Two things that bite:

- The priority tiers (`pnpm test:l1` etc.) select by matching the token against test paths under `apps/*/__tests__`. A tier that matches nothing passes while running zero tests; `scripts/run-priority-tier.mjs` prints a warning when that happens.
- `apps/web`'s `tsc --noEmit` exhausts Node's default heap. CI runs typecheck with `NODE_OPTIONS=--max-old-space-size=8192`; use the same locally or it dies with SIGABRT.

### Guard chain

`pnpm check:llm-operability` chains ~40 repo-invariant checks and is what `.husky/pre-push` runs. `.husky/pre-commit` runs lint-staged plus `check:audit-inventory`, `check:executable-docs`, `check:structure-conventions`, and `check:llm-failures:staged`. Individual guards are the `check:*` scripts in `package.json`.

Guards read the working tree (`git ls-files -co`), not HEAD. A green local run says nothing about what you committed — re-run after staging, and never treat a local pass as evidence CI will pass.

## Architecture

Polyglot monorepo: pnpm workspaces (`apps/*`, `packages/*/*`, `packages/ai/providers/*`, `services/*`, `infrastructure/*`) orchestrated by Turborepo, plus a Cargo workspace (`apps/desktop/src-tauri`, `apps/cli`, `crates/*`).

Six client surfaces sit on one shared contract layer: `apps/web` (Next.js 16 App Router), `apps/desktop` (Tauri 2, React 19 + Rust), `apps/mobile` (Expo / React Native), `apps/cli` (Rust binary `agi`), `apps/extension` (Chrome MV3), `apps/extension-vscode` (VS Code). `packages/` is grouped by role — `contracts/`, `ai/`, `client/`, `ui/`, `platform/`, `tools/`, `guardian/` — and `pnpm check:boundaries` fails imports that reach past a package's published entrypoints.

The parts you cannot infer from one file:

**The model catalog is generated, and is the only place a model ID may be a literal.** `packages/ai/model-registry/catalog/*.json` (hand-curated plus synced upstream data) compiles via `pnpm sync:models` into `packages/contracts/types/src/models.json` and a Rust mirror. Never hand-edit `models.json` — `pnpm sync:models:check` fails on drift. Consumers resolve IDs through `packages/contracts/types/src/model-catalog.ts` (`getRoutingSlotModel`, `getProviderDefaultModel`, `getModelMetadataById`). An inline model-ID literal anywhere else fails ESLint `no-restricted-syntax` in TS/JS and `scripts/check-no-hardcoded-models.sh` in Rust. Swapping a model must never require editing a consumer.

**Rust protocol types flow one way into TypeScript.** `crates/agiworkforce-protocol` exports ts-rs bindings into `packages/contracts/types/src/generated/protocol`. Regenerate with `pnpm generate:protocol-types`; `pnpm check:protocol-types` regenerates into a staging dir and diffs, so a failed exporter can never erase the checked-in bindings.

**The desktop is two halves with an enforced seam.** `apps/desktop/src` (React 19 + Vite) reaches `apps/desktop/src-tauri/src` (Rust) only through registered Tauri commands. `apps/desktop/check-wiring.sh` fails both directions of drift: a frontend `invoke('foo')` with no registered `foo`, and a `#[tauri::command]` missing from `generate_handler!` (silently dead code that would fail at runtime, not compile time).

**Local, BYOK, and Managed Cloud are separate trust boundaries.** Nothing may silently route a Local chat, file, or session to BYOK or managed cloud; a Local-to-BYOK move is an explicit fork with consent and a visible provider label. Desktop egress funnels through `apps/desktop/src/lib/egressGuard.ts` so non-managed sessions fail closed, and Rust transports must use the host-owned egress policy (`pnpm check:rust-egress-boundary` blocks a bare `reqwest` client). Each surface owns a `trust-boundary.test.ts` proof that `pnpm check:trust-boundaries` executes.

**Web routing middleware is `apps/web/proxy.ts`, exporting `proxy`.** Next.js 16 renamed it; do not restore `middleware.ts`. `apps/web/AGENTS.md` and `apps/web/CLAUDE.md` are written by `next dev` — commit them with your work rather than reverting the diff, which only re-creates it.

**`apps/web/db/neon` is an append-only, checksummed migration chain** tracked in `public.schema_migrations`. Never edit an applied migration; add the next numbered file. `pnpm check:neon-migrations` verifies contiguity and SHA-256 checksums, and the runner reads its URL from `AGI_DATABASE_URL`/`DATABASE_URL`/`NEON_DATABASE_URL` and never prints it. Production apply needs `--confirm-production`; baselining additionally needs `--confirm-baseline` with a sequence, reason, and evidence.

**CI is scope-gated.** `.github/workflows/ci.yml` starts with a `scope` job that classifies changed surfaces via `scripts/production-deploy-scope.mjs`; the Rust lane runs only when native code changed _and_ only on `main`, so a native regression is caught at merge rather than at review. `pnpm test:affected` stops at the first failing package, so one red package can hide many others.

## Conventions

- Product and source code carries no explanatory comments; name things so the code reads without narration. Comment only for a non-obvious constraint, a correctness or security reason a change would silently break, or a directive the tooling reads. Do not restate the line, narrate history, or describe the diff.
- No hardcoded literals for things the repo already models: model IDs, endpoints (`pnpm check:hardcoded-endpoints`), display arrays that a live store owns (`pnpm check:hardcoded-arrays`), or colors. Every surface has a hex/rgb ratchet with a grandfathered baseline — new literals fail, so use the design tokens.
- Commit subjects are conventional and lowercase; `commitlint` rejects any capitalized token in the subject line, filenames included. Put those in the body.
- Lockfiles (`pnpm-lock.yaml`, `Cargo.lock`) are blocked by a `.claude/hooks/block-lock-files.sh` PreToolUse hook — change the manifest and run the package manager. A PostToolUse hook runs Prettier on every file you write, so do not hand-format or fight the resulting diff.
- Root files are allowlisted in `scripts/check-repo-organization.mjs`; a new root file fails the guard until it is registered there.
- `docs/agent-context/known-flaws.md` records durable defects. Check it before reporting a bug as new, and update the existing entry instead of adding a duplicate.
- Treat prose docs as stale by default — the repository deleted its agent-doc corpus in August 2026 for exactly that reason. Ground claims in code, guards, git history, and live runs; the JSON files under `docs/agent-context/` stay honest because checks consume them.
