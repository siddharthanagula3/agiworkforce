# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Single source of truth

`AGI_WORKFORCE.md` (repo root) is the canonical spec. `BUILD.md` covers prerequisites and per-surface build commands. `README.md` is user-facing. Read those before making non-trivial changes — they document verified state, P0/P1 audit status, sprint plans.

## What this repo is

A multi-surface AI agent platform wrapping **10+ providers** (cloud + local + BYOK + managed cloud) into one chat layer. Six shipping surfaces share core packages; the Rust CLI is the engine, the rest wrap it.

| Surface     | Path                     | Stack                                       |
| ----------- | ------------------------ | ------------------------------------------- |
| CLI / TUI   | `apps/cli/`              | Rust monolith, Ratatui TUI, 22 subcommands  |
| Desktop     | `apps/desktop/`          | Tauri v2 + React (Vite), Rust backend       |
| Web         | `apps/web/`              | Next.js 14 (app router) at agiworkforce.com |
| Mobile      | `apps/mobile/` + `ios/`  | Expo + React Native 0.83.6                  |
| Chrome ext  | `apps/extension/`        | MV3 v1.2.0                                  |
| VS Code ext | `apps/extension-vscode/` | v0.3.0, @agi chat participant               |

Shared TS packages: `packages/{chat,api,types,runtime,utils,llm-normalize,providers,mcp,skills,apply-patch,browser-tool,stores}`.
Backend: `services/api-gateway` (Express), `services/signaling-server` (WebRTC, Fly.io), `supabase/` (migrations).
Rust workspace: 14 active crates per `cargo metadata --no-deps` — `agiworkforce-protocol`, `sandbox-policy`, `execpolicy`, `network-proxy`, plus utility crates and the two app workspace members (`apps/cli`, `apps/desktop/src-tauri`).

## Toolchain (pinned)

- Node 22 (`.nvmrc`), pnpm 9.15.3 (via `corepack enable`), Rust 1.94.0 (`apps/desktop/src-tauri/rust-toolchain.toml`).
- TypeScript pinned at 5.9.3 across the workspace via `pnpm.overrides`. If you see TS 6.x in `node_modules/.pnpm/`, run `pnpm install --force`.
- `Cargo.toml` excludes mid-port crates `agiworkforce-tui`, `agiworkforce-tui_app_server`, `agiworkforce-cloud-tasks` — don't depend on them.

## Commands

### Repo-wide

```bash
pnpm install                  # first-time / after lockfile change
pnpm lint                     # eslint --max-warnings=0 (root config; excludes apps/extension)
pnpm lint:extension           # lint apps/extension separately
pnpm typecheck                # desktop typecheck only
pnpm typecheck:all            # tsc --noEmit across every TS workspace
pnpm test                     # vitest across every TS workspace
pnpm format                   # prettier --write .
```

### Per surface

```bash
pnpm dev:desktop                              # Tauri hot-reload
pnpm build:desktop                            # bundles → apps/desktop/src-tauri/target/release/bundle/
pnpm --filter web dev                         # localhost:3000
pnpm --filter web build                       # builds desktop SPA → public/chat, then next build
pnpm --filter @agiworkforce/mobile {start,ios,android}
pnpm --filter agi-workforce build             # VS Code .vsix
pnpm --filter @agiworkforce/extension build   # Chrome extension dist/
```

The web build is unusual: Vite-builds the desktop SPA, copies into `apps/web/public/chat/`, then `next build`. See `apps/web/package.json:scripts.build`.

### Rust (CLI + Tauri backend)

```bash
cargo check --workspace                       # fast type check
cargo build --release -p agiworkforce-cli
cargo run -p agiworkforce-cli -- exec "..."
cargo test -p agiworkforce-cli                # ~999 tests
cargo test --workspace --lib                  # all crate unit tests
cargo clippy --workspace --lib -- -D warnings -D unsafe-code
```

### Running a single test

```bash
# vitest (any TS package)
pnpm --filter <pkg> test -- <path/to/test.ts> -t "test name"

# cargo
cargo test -p agiworkforce-cli <test_name_substring>
cargo test -p agiworkforce-cli --lib <module>::tests::<name> -- --exact

# Desktop E2E (Playwright)
pnpm --filter desktop exec playwright test
```

## Critical rules (LOCKED)

1. **Never hardcode model IDs.** Read from `models.json`. Provider matching uses `apps/cli/src/models.rs` (12 named providers + 1 user-defined `Custom`). Era: GPT-5.4, Claude 4.6, Gemini 3.1, Grok 4. See `memory/rule-models-json.md`.
2. **Web-search before stating facts** about competitors / libraries / current product features. Knowledge cutoff is January 2026.
3. **CI on `main` must stay green.** If it isn't, that is the highest-priority bug.
4. **Commits**: lowercase, ≤100 chars, Conventional Commits, with `Co-Authored-By:` footer (commitlint enforces). Husky `lint-staged` runs eslint+prettier on staged files.
5. **License**: PROPRIETARY. Code lifted from open source carries an SPDX-style attribution header and an entry in `THIRD_PARTY_LICENSES.md` (currently OpenClaw, MIT).

## Local vs Cloud mode

- **Local mode** (Desktop only): SQLite + Ollama/LMStudio, no auth, no sync, no Dispatch.
- **Cloud mode** (Desktop + Web + Mobile): Supabase, BYOK or Hobby cloud, Realtime sync, OAuth, Dispatch.
- Mode picker: `apps/desktop/src/components/Onboarding/OnboardingWizard.tsx` (legacy `ModeSelectionDialog` was removed; do not reintroduce).
- Runtime detection: `packages/runtime/src/detect.ts` (`isTauri`, `isCloudWeb`).

## Provider architecture

Every provider implements the `ProviderAdapter` interface in `packages/types/src/provider-adapter.ts`: `id`, `label`, `auth`, `catalog()`, optional `buildReplayPolicy`, `normalizeToolSchemas`, `wrapStreamFn`, and required `stream()`. Vendor SDKs are used for the wire (`@anthropic-ai/sdk`, `openai`, `ollama`); cross-provider quirks live in `packages/llm-normalize/` (ported from OpenClaw, see `THIRD_PARTY_LICENSES.md`). Adapters live in `packages/providers/{anthropic,openai,ollama,google}/`.

## Three differentiators (do not regress)

1. Multi-provider in one UI (10+ providers, switch mid-conversation).
2. BYOK + Local LLM (Ollama, LMStudio).
3. Cross-provider session continuity (Claude → GPT → Llama in one thread). Tool-call normalization in `llm-normalize` is what makes this robust.

## Active sprint / launch plan

`docs/plans/UNIFIED_LAUNCH_PLAN.md` is canonical. Companion: `wave2-desktop-v1.md`, `wave3-mobile-extensions-web.md`. Stale plans live in `docs/archive/`. Audit ground truth: `docs/audit/` and `/tmp/agi-audit/FINAL_AUDIT.md`. Public MVP (Local + BYOK free) is GO-WITH-CAVEATS; paid Hobby is NO-GO until the Stripe RPC migration ships in `supabase/migrations/`.

## Common pitfalls

- **Two supabase migration directories.** Canonical is `supabase/migrations/`; `apps/web/supabase/migrations/` is legacy and contains Stripe webhook idempotency RPCs the canonical dir lacks. Reconcile before paid-tier launch.
- **Active web chat is `apps/web/features/chat/`.** Do not look for `apps/web/components/UnifiedAgenticChat/` — it doesn't exist. The lazy-import in `apps/desktop/src/App.tsx:153-155` is commented dead code.
- **`.github/workflows/release-desktop.yml`** needs `APPLE_*` + `WINDOWS_CERTIFICATE*` secrets. Builds ship unsigned without them; macOS code-signing identity is `D2PR62RLT4`.
- **`cargo audit`** ignore list lives in `.cargo/audit.toml` with per-entry justifications (mostly optional `remote-databases` feature transitive advisories).

## Workflow Orchestration

### 1. Plan Mode Default

- Enter plan mode for ANY non-trivial task (3+ steps or architectural decisions)
- If something goes sideways, STOP and re-plan immediately
- Use plan mode for verification steps, not just building
- Write detailed specs upfront to reduce ambiguity

### 2. Subagent Strategy

- Use subagents liberally to keep main context window clean
- Offload research, exploration, and parallel analysis to subagents
- For complex problems, throw more compute at it via subagents
- One task per subagent for focused execution

### 3. Self-Improvement Loop

- After ANY correction from the user: update `tasks/lessons.md` with the pattern
- Write rules for yourself that prevent the same mistake
- Ruthlessly iterate on these lessons until mistake rate drops
- Review lessons at session start for relevant project

### 4. Verification Before Done

- Never mark a task complete without proving it works
- Diff behavior between main and your changes when relevant
- Ask yourself: "Would a staff engineer approve this?"
- Run tests, check logs, demonstrate correctness

### 5. Demand Elegance (Balanced)

- For non-trivial changes: pause and ask "is there a more elegant way?"
- If a fix feels hacky: "Knowing everything I know now, implement the elegant solution"
- Skip this for simple, obvious fixes — don't over-engineer
- Challenge your own work before presenting it

### 6. Autonomous Bug Fixing

- When given a bug report: just fix it. Don't ask for hand-holding
- Point at logs, errors, failing tests — then resolve them
- Zero context switching required from the user
- Go fix failing CI tests without being told how

## Task Management

1. **Plan First**: Write plan to `tasks/todo.md` with checkable items
2. **Verify Plan**: Check in before starting implementation
3. **Track Progress**: Mark items complete as you go
4. **Explain Changes**: High-level summary at each step
5. **Document Results**: Add review section to `tasks/todo.md`
6. **Capture Lessons**: Update `tasks/lessons.md` after corrections

## Core Principles

- **Simplicity First**: Make every change as simple as possible. Impact minimal code.
- **No Laziness**: Find root causes. No temporary fixes. Senior developer standards.
- **Minimal Impact**: Changes should only touch what's necessary. Avoid introducing bugs.
