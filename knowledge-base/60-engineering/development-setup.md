---
id: "ENG-development-setup"
type: "engineering"
title: "Development setup"
basis: "code inspection and project documents"
second_reader: "not challenged"
last_reviewed: "2026-11-24"
revision: "f51d16e747"
---
# Development setup

How to set up a Mac for AGI Workforce development: Node 24, the pinned pnpm, the pinned Rust toolchain, then pnpm install. Lists the dev command for each of the six apps, local test accounts, the pre-push gate, and the rule that on a machine with 24 GB of RAM or less heavy jobs run one at a time through scripts/dev/heavy-job.sh. Also lists traps and stale documents.

## Purpose

This page tells an engineer or an LLM what to install on a Mac and how to start each of the six apps (Web, Desktop, Mobile, CLI, VS Code extension, Chrome extension) for development. It also explains the rule that heavy jobs (builds, full test suites, type checks, cargo, dev servers, browsers, emulators, `git push`) run one at a time on a small machine.

Status words used here: *implementation status* means the script or file exists in the repository. *Verification status* means someone ran it. Nothing on this page was run by the author; the project records no run of the setup steps. Every command is [code] or [requirement] taken from the cited files.

## Procedure

**1. Install the toolchain.**

| Tool | Required version | Source |
|---|---|---|
| Node | `>=24.15.0 <25` [code] (package.json:14). `.nvmrc` holds `24` [code]. CI uses Node 24 [code] (.github/workflows/ci.yml:46). | `engine-strict=false` in `.npmrc:9`, so a wrong Node only warns; do not rely on pnpm to stop you [code] |
| pnpm | `>=10.16.0` in engines (package.json:15); exact pin `pnpm@10.34.7` in `packageManager` (package.json:12) [code] | use Corepack or Homebrew `pnpm` |
| Rust | channel `1.99.1` with `clippy` and `rustfmt` (rust-toolchain.toml) [code]; rustup provisions it by itself on first cargo call [inferred] | needed for CLI, GPUI and Tauri desktop, and for `pnpm check:protocol-types` |
| Xcode with the Metal toolchain | only for the GPUI desktop host: `xcodebuild -downloadComponent MetalToolchain` [requirement] (apps/desktop/README.md:~159) | optional |
| `sandbox-exec` | ships with macOS; the CLI needs it to run sandboxed commands [requirement] (apps/cli/README.md, Runtime requirement table) | nothing to install on a Mac |
| Postgres 16 with pgvector | `docker compose up -d postgres` using `docker-compose.yml` (image `pgvector/pgvector:pg16`, port 127.0.0.1:5432, database `agiworkforce_dev`) [code]. The runbook also mentions a Homebrew Postgres used for local work [requirement] (docs/runbooks/database-backup-restore.md:222). | needed for Web with a local database |

**2. Install packages.** From the repository root run `pnpm install`. A release younger than seven days will not install: `minimumReleaseAge: 10080` minutes in `pnpm-workspace.yaml:8` [code]. The `prepare` script runs `husky || true`, which installs the git hooks [code] (package.json:140).

**3. Create env files.** Copy `apps/web/.env.local.example` to apps/web/.env.local (not found) and fill the blank values (Clerk development keys, `DATABASE_URL`, random development secrets for `CSRF_SECRET`, `CRON_SECRET`, `JWT_SECRET` and similar, Stripe test keys only if billing is under test). Keep `STRIPE_CHECKOUT_ENABLED=false` unless Stripe test webhooks and prices exist [code] (apps/web/.env.local.example). Copy `apps/mobile/.env.local.example` to apps/mobile/.env.local (not found) for Mobile. Never commit either file.

**4. Prepare the local database.** Start Postgres, then `AGI_DATABASE_URL=postgresql://127.0.0.1:5432/agiworkforce_dev pnpm db:migrate -- apply --target local` [code] (docker-compose.yml header). The migration chain is append-only; see `pnpm db:migrate -- status` [requirement] (AGENTS.md section 5 and 12).

**5. Seed test accounts.** `pnpm dev:accounts seed` makes one local account per plan and per app lane. Sign in at `http://localhost:3000/login` with `agi-dev-<name>+clerk_test@example.com` and the code `424242` [requirement] (docs/development/local-test-accounts.md). See the Commands section.

**6. Start the app you are working on** through the heavy-job wrapper (see Commands). For apps that talk to Cloud, start the Web app first, because Desktop (Electron), Mobile, Chrome and the CLI all call it [inferred] from the env examples (apps/mobile/.env.local.example points at `http://localhost:3000`).

**7. Before you push** run lint, `pnpm typecheck:all`, `pnpm test:affected` and `pnpm check:llm-operability` [requirement] (CONTRIBUTING.md, Before you push). `.husky/pre-push` runs the guard chain and an affected lint and typecheck for you [code].

## Commands

**Run every command below with a wrapper on a machine of 24 GB or less.** Prefix a heavy command with `scripts/dev/heavy-job.sh`, and a scoped one (one test file or package, lint on touched files) with `scripts/dev/light-job.sh`.

| App | Start for development | Notes |
|---|---|---|
| surface:web | `scripts/dev/heavy-job.sh pnpm --filter @agiworkforce/web dev` (runs `next dev`, apps/web/package.json:6) | default port 3000. For checks the project's QA notes prefer a compiled build, not `next dev` [requirement] (knowledge-base/70-qa/setup/web.md); `next start` is exempt from the gate [code] (.claude/hooks/heavy-job-gate.py is_heavy). Build: `pnpm --filter @agiworkforce/web build` (runs `notices` first). |
| surface:desktop (public Electron) | `pnpm --filter @agiworkforce/desktop dev:electron` (builds main process then `electron .`, apps/desktop/package.json:16) | The Electron window loads the hosted web app; a change in `apps/desktop/src` never shows there [requirement] (apps/desktop/README.md). An unpackaged build can point at localhost with `AGI_CLOUD_APP_ORIGIN` [code] (apps/desktop/electron/config.ts:18); a packaged build ignores it (config.ts:58). |
| surface:desktop (Tauri, retained internal) | `pnpm dev:desktop` at root, or `pnpm --filter @agiworkforce/desktop dev` (`tauri dev`, package.json:414; apps/desktop/package.json:8) | renderer is the Vite app in `apps/desktop/src`; renderer only: `dev:vite` |
| surface:desktop (GPUI native host, opt-in) | `pnpm --filter @agiworkforce/desktop dev:gpui` | needs Node 24, Rust 1.99.1, Metal toolchain; closes the app before rebuild [requirement] |
| surface:mobile | `pnpm --filter @agiworkforce/mobile dev` (Metro), `... ios`, `... android`, `... ios:device:dev` for a real phone | `ios` and `android` run `expo run:*` and prebuild the native projects, which are gitignored and generated [requirement] (apps/mobile/README.md). On a real device set `EXPO_PUBLIC_API_URL` to a LAN address, not localhost [code] (apps/mobile/.env.local.example). |
| surface:cli | `cargo install --path apps/cli --bin agi`, then `agi login` (AGI account) or `agi login <provider>` (own key) and `agi auth-status` | [requirement] (apps/cli/README.md). Binary is `agi`; `agiworkforce` is an alias. |
| surface:vscode | `pnpm --filter <vscode package name> watch` (`node esbuild.js --watch`, apps/extension-vscode/package.json:1570); package: `package` script (line 1571) | needs `agi` on PATH, or set `agiWorkforce.cliPath` [requirement] (apps/extension-vscode/README.md). I did not read the package name; use `docs/agent-context/commands.json` for the filter. |
| surface:chrome | `pnpm --filter @agiworkforce/extension dev` (`BUILD_TARGET=content vite build && vite build --watch`, apps/extension/package.json:24); then load apps/extension/dist (not found) unpacked | Add the unpacked extension origin to `CLERK_AUTHORIZED_PARTIES` to sign in from it [code] (apps/web/.env.local.example:11-13). Local artifact previews: set `VITE_ARTIFACT_SANDBOX_ORIGIN=http://127.0.0.1:3002` and run `node infrastructure/sandbox/dev.mjs --extension-id <id> --port 3002` [requirement] (apps/extension/README.md). |

**Repository-wide commands** [code] (package.json):

| Task | Command |
|---|---|
| Install | `pnpm install` |
| Lint (all but the extension) | `pnpm lint` (line 141); extension: `pnpm lint:extension` |
| Typecheck desktop only | `pnpm typecheck` (line 401) |
| Typecheck everything | `pnpm typecheck:all` (line 418); Web needs `NODE_OPTIONS=--max-old-space-size=8192` [requirement] (AGENTS.md section 12) |
| Tests | `pnpm test` (turbo, concurrency 2), `pnpm test:affected`, `pnpm test:l1`, `pnpm test:security` |
| One package's test | `pnpm --filter <workspace-package> test <file-or-pattern>` [requirement] (docs/agent-context/commands.json) |
| Build all except desktop | `pnpm build` / `pnpm build:all`; desktop: `pnpm build:desktop` |
| Guard chain | `pnpm check:llm-operability` (package.json:397) |
| Models | edit curation file then `pnpm sync:models` (line 386) |
| Protocol types | `pnpm generate:protocol-types` (line 420) |
| Rust | `cargo check --workspace`, `cargo fmt --all -- --check`, `cargo clippy --workspace --lib -- -D warnings -D unsafe-code` [requirement] (commands.json) |
| Test accounts | `pnpm dev:accounts seed [name]`, `reset <name\|all>`, `list` (package.json:415) |

**The wrappers** [code]:

```
scripts/dev/heavy-job.sh pnpm typecheck:all
scripts/dev/light-job.sh pnpm --filter @agiworkforce/web test path/to/file.test.ts
```

- `heavy-job.sh` takes one machine-wide lock (`/tmp/agi-heavy.kernel.lock`) so only one heavy job runs at a time (scripts/dev/heavy-job.sh:31). It waits for free memory first: default 3 GB, set by `AGI_HEAVY_MIN_FREE_GB` (line 30). It polls every 15 seconds and gives up waiting after 900 seconds, then runs anyway (lines 34-39). It measures free memory with `vm_stat` (free, inactive, speculative, purgeable pages), falling back to `/proc/meminfo`. It is not re-entrant: never call it from inside a command it already runs (header comment).
- `light-job.sh` has two lock slots (`/tmp/agi-light.slot1.lock`, `slot2`), so two scoped jobs can run at once (scripts/dev/light-job.sh:9).
- Other scripts in `scripts/dev`: `reset-app-mac.sh` (deletes local Desktop app data under `~/Library/Application Support/com.agiworkforce.desktop` after a yes/no prompt; dev only) and `reset-app.ps1` for Windows [code].

## Rules and traps

**The one-at-a-time rule** [requirement] (CLAUDE.md, Delegation): the owner's laptop has 16 GB, so RAM, not tokens, is the limit. Reading, thinking and editing agents may run in parallel. Local heavy jobs (builds, full suites, `tsc`, cargo, dev servers, browsers, emulators, `git push`) go one at a time through `scripts/dev/heavy-job.sh`; scoped tests or lint go through `scripts/dev/light-job.sh`.

**How it is enforced** [code] (.claude/hooks/heavy-job-gate.py, registered for the `Bash` tool in .claude/settings.json):
- It only runs inside Claude Code. A human in a plain terminal is not blocked; the wrappers are a convention there [inferred].
- It acts only when the machine has 24 GB of RAM or less (`SMALL_MACHINE_GB = 24`, line 9; it reads `sysctl hw.memsize`). If RAM cannot be read, it does not block (line 96).
- It splits the command on `&&`, `||`, `;`, pipes and newlines, and denies any segment that looks heavy and is not wrapped.
- Heavy means: a pnpm/npm/yarn/bun script whose name starts with `build`, `dev`, `test`, `e2e`, `typecheck`, `tsc`, `lint`, `knip` or `storybook` (with or without a `:suffix`), or `check:llm-operability`, `check:trust-boundaries`, `check:protocol-types`; the tools `tsc`, `vitest`, `jest`, `playwright`, `next`, `expo`, `eas`, `turbo`, `xcodebuild`, `gradle`, `electron-builder`, `vite`, `webpack`, `knip`, `storybook`; `cargo build|test|check|clippy|run|bench|nextest`; and `git push`. `next start` and `vite preview` are not heavy.
- A wrapped command passes (`heavy-job.sh`, `light-job.sh`, `heavy.sh`, `light.sh`).

**Other traps**
- Do not wrap a heavy-job inside a heavy-job (deadlock on the same lock) [code].
- The heavy-job wait is a floor, not a guarantee: after 900 seconds it starts the command even if memory is still short [code] (heavy-job.sh:34-39).
- A loaded machine fails tests that pass alone; check `uptime` and re-run in isolation [requirement] (AGENTS.md section 12).
- `apps/web` runs its own Vitest major: use the package script or `pnpm exec vitest` inside `apps/web`, never the root binary [requirement] (AGENTS.md section 12).
- Web `tsc --noEmit` dies with SIGABRT without `NODE_OPTIONS=--max-old-space-size=8192` [requirement]. The pre-push hook sets that heap itself [code] (.husky/pre-push).
- Guards read the working tree, not HEAD. Stage first, run guards, then commit [requirement].
- `.husky/pre-push` normally builds a clean detached worktree of HEAD under `${TMPDIR:-/tmp}/agi-prepush-worktree` and runs the chain there (`scripts/prepush-clean-worktree.sh`); `AGI_PREPUSH_ON_TREE=1` runs it on your tree; `SKIP_PRE_PUSH=1` skips it [code].
- A Clerk `pk_test_` key forces a handshake redirect on every authenticated page; `CLERK_AUTHORIZED_PARTIES` is required or sign-in fails with no clear error [requirement] (docs/development/troubleshooting.md).
- A value exported in your shell beats `.env.local`; check `env | grep AGI_` [requirement].
- If chat fails with a closed-lane error locally, set `AGI_KV_PROVIDER=memory` (or a local Redis with `AGI_KV_REDIS_URL`) so you do not use the shared key-value store [requirement].
- A dev server that slows down over an afternoon: stop it, delete apps/web/.next (not found) and the Turbo cache, restart. Do not reinstall dependencies under a running dev server [requirement].
- Lockfiles (`pnpm-lock.yaml`, `Cargo.lock`) are never hand-edited; a Claude Code hook blocks writes [requirement] (CLAUDE.md, .claude/hooks/block-lock-files.sh).
- Mobile: stale Metro cache makes every `className` stop working; clear it. Generated `ios`/`android` folders are discarded by the next prebuild; never hand-edit them [requirement].
- `pnpm dev:accounts` refuses to run against a non-local database, a preview or production runtime, a production Clerk key or a live Stripe key; there is no override [requirement] (local-test-accounts.md; test:apps/web/scripts/__tests__/dev-accounts.test.ts).
- Local inference and local mode need no subscription, but the dev accounts and Cloud features need a Clerk sign-in; that is an account question, not a payment one [inferred]. Which mode each dev command exercises (mode:local, mode:own-key, mode:cloud) is not stated in the setup documents [unknown].
- Model names must not be written as literals; the only home is the generated catalog (`packages/contracts/types/src/models.json`, produced by `pnpm sync:models`) [requirement] (AGENTS.md section 4).

## Where the canonical document is

| Question | Canonical home |
|---|---|
| Install steps, Node/pnpm/Rust versions | `package.json` (engines, packageManager), `rust-toolchain.toml`, `.nvmrc`; prose in `CONTRIBUTING.md` (Setup) |
| Command inventory per app | `docs/agent-context/commands.json` (last updated 2026-11-09) |
| Heavy-job rule | `CLAUDE.md` (Delegation), `scripts/dev/heavy-job.sh`, `scripts/dev/light-job.sh`, `.claude/hooks/heavy-job-gate.py` |
| Validation rules and what bites | `AGENTS.md` section 12 |
| Symptoms and fixes | `docs/development/troubleshooting.md` |
| Seeded local accounts | `docs/development/local-test-accounts.md`; code in `apps/web/scripts/dev-accounts/` |
| Web env names | `apps/web/.env.local.example` |
| Mobile env and commands | `apps/mobile/.env.local.example`, `apps/mobile/README.md` |
| Desktop shells and GPUI | `apps/desktop/README.md` |
| CLI install and sandbox | `apps/cli/README.md` |
| Chrome extension local previews | `apps/extension/README.md` |
| VS Code extension requirements | `apps/extension-vscode/README.md` |
| CI and pre-push gate | `docs/development/ci-and-deploys.md`, `.husky/pre-push` |
| Worktrees and parallel agents | `docs/development/agent-workflow.md` |
| Index of the development docs | `docs/development/README.md` |
| QA-side run notes for each app | `knowledge-base/70-qa/setup/` (written by reading, not run) |

Related knowledge-base pages: SYS-chat-turn-pipeline (what the apps do once running).

## Gaps in the documents

- `CONTRIBUTING.md` says Rust 1.94.0; the pin is 1.99.1 (see outdated documents).
- No document gives one end-to-end first-run recipe for a fresh Mac: no Homebrew list, no statement that Docker (or Homebrew Postgres) is needed, no ordering of env file, database, migrate, seed and start. This page assembles it from several files.
- The documents do not say which Node patch is required in prose; only `package.json` engines (`>=24.15.0`) does, while `.nvmrc` says `24`.
- `docs/development/README.md` does not link the heavy-job rule; it appears only in `CLAUDE.md` and some runbooks (chrome-web-store-publish.md:64, vscode-marketplace-publish.md, mobile-store-first-release.md).
- `AGENTS.md` and `CONTRIBUTING.md` do not mention `heavy-job.sh`; a contributor not using Claude Code is not told about it, and the gate hook does not apply to them [inferred].
- No document says how to run the Electron desktop against a local web server step by step (the env name exists in code only; the QA notes describe it).
- The documents do not state minimum Xcode or Android Studio versions for Mobile builds, or the macOS version needed.
- The dev-accounts document says a local database is needed but not how to start it; the compose file supplies it.
- `docs/development/ci-and-deploys.md` and the README do not state which local jobs count as heavy; only the hook regex does.
- Verification status: no document records a clean run of this setup on a new machine [unknown].

## Key facts

| Fact | Basis | Source |
|---|---|---|
| Node must be >=24.15.0 and <25; .nvmrc says 24; CI uses Node 24. | read in the code | `package.json:14`; `/.nvmrc` (not found); `/.github/workflows/ci.yml:46` (not found) |
| pnpm is pinned to 10.34.7 via packageManager; engines allow >=10.16.0. | read in the code | `package.json:12`; `package.json:15` |
| Rust toolchain is pinned to channel 1.99.1 with clippy and rustfmt, in lockstep with CI. | read in the code | `rust-toolchain.toml` |
| engine-strict is false, so a wrong Node version only warns. | read in the code | `.npmrc:9` |
| pnpm refuses package releases younger than seven days (10080 minutes), with exceptions listed by exact version. | read in the code | `pnpm-workspace.yaml:8`; `pnpm-workspace.yaml:10` |
| heavy-job.sh holds one machine-wide lock, waits for 3 GB free memory by default (AGI_HEAVY_MIN_FREE_GB), polls every 15 s, and stops waiting after 900 s. | read in the code | `scripts/dev/heavy-job.sh:30`; `scripts/dev/heavy-job.sh:31`; `scripts/dev/heavy-job.sh:34` |
| light-job.sh allows two concurrent scoped jobs through two lock slots. | read in the code | `scripts/dev/light-job.sh:9` |
| A Claude Code PreToolUse hook denies unwrapped heavy commands only when the machine has 24 GB of RAM or less; if RAM is unreadable it does not block. | read in the code | `.claude/hooks/heavy-job-gate.py:9`; `.claude/hooks/heavy-job-gate.py:96`; `.claude/settings.json` |
| The owner's laptop has 16 GB; RAM, not tokens, is the limit, so reading/editing agents run in parallel but heavy jobs run one at a time. | stated requirement | `CLAUDE.md Delegation section` |
| Heavy commands include pnpm scripts starting with build/dev/test/e2e/typecheck/tsc/lint/knip/storybook, cargo build/test/check/clippy/run, git push, and tools like tsc, vitest, playwright, next, expo, turbo, xcodebuild. | read in the code | `.claude/hooks/heavy-job-gate.py:12-21` |
| Web dev command is next dev (apps/web package script dev); typecheck is tsc --noEmit and needs an 8192 MB heap. | read in the code | `apps/web/package.json:6`; `apps/web/package.json:12`; `AGENTS.md section 12` |
| Mobile runs through Expo: dev (Metro), ios, android, ios:device:dev; native ios/android folders are generated and gitignored. | read in the code | `apps/mobile/package.json:8-11`; `apps/mobile/README.md` |
| The public Desktop is Electron showing the hosted web app; dev:electron builds the main process then runs electron; Tauri (tauri dev) is retained internal code. | read in the code | `apps/desktop/package.json:8`; `apps/desktop/package.json:16`; `apps/desktop/README.md` |
| An unpackaged Electron build can load a different web origin through AGI_CLOUD_APP_ORIGIN; a packaged build ignores it. | read in the code | `apps/desktop/electron/config.ts:18`; `apps/desktop/electron/config.ts:58` |
| The CLI is built with cargo install --path apps/cli --bin agi; sandboxed commands need sandbox-exec, which ships with macOS. | stated requirement | `apps/cli/README.md` |
| The Chrome extension dev command is a watching vite build; loading it unpacked requires its origin in CLERK_AUTHORIZED_PARTIES. | read in the code | `apps/extension/package.json:24`; `apps/web/.env.local.example:11-13` |
| The VS Code extension has a watch script (esbuild) and needs the agi CLI on PATH or agiWorkforce.cliPath. | read in the code | `apps/extension-vscode/package.json:1570`; `apps/extension-vscode/README.md Requirements` |
| pnpm dev:accounts seeds one local account per plan plus lane accounts; sign-in uses an agi-dev-<name>+clerk_test@example.com address and code 424242. | stated requirement | `docs/development/local-test-accounts.md`; `package.json:415` |
| dev:accounts refuses non-local databases, preview or production runtimes, production Clerk keys and live Stripe keys, with no override; a test covers each. | stated requirement | `docs/development/local-test-accounts.md What it refuses`; `apps/web/scripts/__tests__/dev-accounts.test.ts` |
| A local Postgres 16 with pgvector comes from docker-compose.yml on 127.0.0.1:5432; schema is applied by pnpm db:migrate -- apply --target local. | read in the code | `docker-compose.yml:1-30`; `package.json:206` |
| Husky pre-push runs the guard chain in a clean detached worktree by default; AGI_PREPUSH_ON_TREE=1 runs on the working tree and SKIP_PRE_PUSH=1 skips it. | read in the code | `.husky/pre-push`; `scripts/prepush-clean-worktree.sh` |
| CLERK_AUTHORIZED_PARTIES is required locally and a pk_test_ Clerk key forces a handshake redirect on authenticated pages. | stated requirement | `docs/development/troubleshooting.md Running the app locally`; `apps/web/lib/validate-env.ts:68` |
| A shell-exported variable beats .env.local; AGI_KV_PROVIDER=memory avoids the shared key-value store for local chat. | stated requirement | `docs/development/troubleshooting.md`; `apps/web/.env.local.example:52-56` |
| CONTRIBUTING.md states Rust 1.94.0 but rust-toolchain.toml pins 1.99.1; the code wins. | read in the code | `CONTRIBUTING.md:12`; `rust-toolchain.toml` |
| The commands inventory file docs/agent-context/commands.json lists per-app commands and was last updated 2026-11-09. | read in the code | `docs/agent-context/commands.json` |
| GPUI native desktop host needs Node 24, Rust 1.99.1 and the Xcode Metal toolchain on macOS. | stated requirement | `apps/desktop/README.md GPUI build paragraph` |
| No document records a clean first-run of this setup on a new machine. | unknown | `searched docs/development and app READMEs; none records one` (not found) |

## Open questions

- Which Homebrew packages, Xcode version and Android tooling a fresh Mac needs: not stated anywhere I read.
- Whether Docker or Homebrew Postgres is the preferred local database; both are mentioned in different files.
- The exact pnpm filter name of the VS Code extension package (read only the scripts block); use commands.json.
- Whether humans outside Claude Code are expected to use heavy-job.sh; no hook or guard enforces it for them.
- Which execution mode (mode:local, mode:own-key, mode:cloud) each dev command exercises is not stated in the setup documents.
- No recorded run of the setup steps; verification status is unknown.
- Why heavy-job.sh starts the command after the 900 s wait even when memory is still short: a product choice the code leaves undecided.

## Project documents found out of date

- `CONTRIBUTING.md`: Setup section says Rust 1.94.0. The code says: rust-toolchain.toml pins channel 1.99.1, and apps/desktop/README.md also says 1.99.1. (CONTRIBUTING.md:12 versus rust-toolchain.toml)
- `docs/development/README.md`: Index and how-to list omit the heavy-job rule and the scripts/dev wrappers, and give no setup steps. The code says: CLAUDE.md and .claude/hooks/heavy-job-gate.py make the wrappers mandatory on machines of 24 GB or less; the root dev:desktop script runs tauri dev while the public Desktop is Electron. (docs/development/README.md (no mention); .claude/hooks/heavy-job-gate.py:9)
