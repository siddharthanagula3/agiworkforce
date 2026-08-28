# AGI Workforce

> **All the AIs you already pay for, in one place. Beyond one model. Beyond one surface.**

[![License](https://img.shields.io/badge/license-Proprietary-red)](LICENSE)

AGI Workforce is a multi-surface AI workspace that unifies 19 catalog providers — including local runtimes — into a single application spanning **Mobile**, **Web**, **Desktop**, **CLI**, **Chrome Extension**, and **VS Code Extension**. Each surface enforces its own trust boundary: Local mode keeps data on-device, BYOK (Bring Your Own Key) lets users route to their own provider accounts, and a managed cloud mode (public alpha, open by default) adds hosted inference.

## What the Project Does

AGI Workforce replaces the need to maintain separate subscriptions and interfaces for every AI provider. Users can chat, generate code, run agentic workflows, automate browsers and desktops, manage files, search the web, and orchestrate multi-step tasks — all through a unified interface that routes requests to the best-fit model across providers.

The application is structured as a polyglot monorepo (TypeScript + Rust) with six client surfaces sharing common packages for types, providers, routing, runtime, artifacts, and a unified chat protocol.

## Key Features

- **Multi-provider model routing** — Catalog of 34 models across 19 providers: AGI managed cloud, OpenAI, Anthropic, Google, xAI, DeepSeek, Qwen, Moonshot, MiniMax, Perplexity, ZhipuAI, Runway, OpenRouter, NVIDIA NIM, AWS Bedrock, and the local runtimes Ollama, LM Studio, llama.cpp, and vLLM. Counts and provider names come from `packages/contracts/types/src/models.json`; `pnpm check:readme-facts` fails when this section drifts from it. Task-aware routing selects models by category (fast completion, code generation, complex reasoning, vision, long context, computer use).
- **Local-first privacy** — Desktop and mobile surfaces run local models via Ollama, LM Studio, and on-device inference (llama.rn, ExecuTorch). No data leaves the device in Local mode.
- **Bring Your Own Key (BYOK)** — Users provide their own API keys; AGI Workforce routes requests directly to the user's provider account.
- **Agentic execution** — Swarm-based orchestration with task decomposition, parallel sub-agent spawning, dependency-graph execution, and result aggregation. The CLI provides an interactive TUI and one-shot execution mode.
- **Computer use and browser automation** — Desktop backend includes screen capture, vision planning, input simulation (keyboard/mouse via enigo/rdev), OCR (Tesseract), and a screen watcher for autonomous desktop control. The Chrome Extension adds page capture, content extraction, and native messaging bridge to the desktop app.
- **MCP (Model Context Protocol)** — First-class MCP client support in the desktop, CLI, web, and extension. Configurable MCP server registry with allowlist-based security.
- **Tool execution engine** — Built-in tools for file operations, code execution, terminal emulation (PTY), git operations, web search, document processing (PDF/DOCX/XLSX extraction), calendar, email (IMAP/SMTP), and clipboard management.
- **Voice input** — Audio capture (cpal), voice activity detection (WebRTC VAD), and optional local speech-to-text (Whisper.cpp) in the desktop app.
- **Skill and plugin system** — Loadable skills with a marketplace, custom slash commands, and a skill-learning pipeline.
- **Multi-surface sync** — WebRTC signaling server and cloud bridge for syncing conversations across web, mobile, and desktop surfaces.
- **i18n** — Internationalization via i18next across desktop, web, and mobile.

## Architecture

```
┌────────────────────────────────────────────────────────────────────────────┐
│                          Client Surfaces                                   │
├──────────┬──────────┬──────────┬────────┬────────────────┬─────────────────┤
│  Mobile  │   Web    │ Desktop  │  CLI   │ Chrome Ext.    │  VS Code Ext.   │
│ Expo 55  │ Next 16  │ Tauri 2  │ Rust   │ Manifest V3    │  Extension API  │
│ React    │ React 19 │ React 19 │ clap/  │ Side panel +   │  Webview + API  │
│ Native   │ App      │ + Vite   │ ratatui│ Native msg     │                 │
│ 0.83     │ Router   │          │ TUI    │                │                 │
└────┬─────┴────┬─────┴────┬─────┴───┬────┴───────┬────────┴────────┬────────┘
     │          │          │         │            │                 │
     └──────────┴──────┬───┴─────────┴────────────┘                 │
                       │                                            │
              ┌────────┴────────┐                                   │
              │ Shared Packages │───────────────────────────────────┘
              │ (TypeScript)    │
              │ types, routing, │
              │ providers, mcp, │
              │ runtime, sync,  │
              │ unified-chat,   │
              │ design-tokens,  │
              │ skills, utils   │
              └────────┬────────┘
                       │
          ┌────────────┴────────────┐
          │                         │
   ┌──────┴───────┐         ┌──────┴──────┐
   │ Web API      │         │  Signaling  │
   │ routes       │         │   Server    │
   │ (Next.js 16) │         │ (Express 5) │
   │ LLM proxy,   │         │ WebRTC +    │
   │ auth, rate   │         │ WebSocket   │
   │ limiting     │         │ relay       │
   └──────┬───────┘         └─────────────┘
          │
   ┌──────┴──────┐     ┌─────────────────┐
   │  Neon       │     │  Rust Crates    │
   │  PostgreSQL │     │  protocol,      │
   │  ledgered   │     │  sandbox-policy,│
   │             │     │  command-registry│
   │             │     │  app-server,    │
   │             │     │  llm, mcp, ...  │
   └─────────────┘     └─────────────────┘
```

### Monorepo Structure

| Directory                   | Contents                                                                                                                                                        |
| --------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `apps/mobile`               | Expo 55 / React Native iOS + Android app with on-device LLM support                                                                                             |
| `apps/web`                  | Next.js 16 web application — product site, chat, billing, docs, admin                                                                                           |
| `apps/desktop`              | Tauri 2 desktop app — React 19 frontend + Rust native backend                                                                                                   |
| `apps/cli`                  | Rust CLI binary (`agi`) — interactive TUI, one-shot exec, daemon mode                                                                                           |
| `apps/extension`            | Chrome Extension (Manifest V3) — browser automation, side panel, native messaging                                                                               |
| `apps/extension-vscode`     | VS Code extension — IDE-native AI surface                                                                                                                       |
| `packages/`                 | 28 shared TypeScript packages outside the provider adapters (types, routing, runtime, MCP, artifacts, UI, etc.)                                                 |
| `packages/ai/providers/`    | 14 per-provider adapter packages (Anthropic, DeepSeek, Factory, Google, LM Studio, MiniMax, Moonshot, Ollama, OpenAI, OpenRouter, Perplexity, Qwen, xAI, Zhipu) |
| `crates/`                   | 12 Rust crates (protocol, llm, agent-core, mcp, sandbox-policy, execpolicy, etc.)                                                                               |
| `services/signaling-server` | Express 5 WebRTC/WebSocket signaling server for cross-device sync                                                                                               |
| `tools/skill-vetting`       | Skill vetting scanner (NVIDIA SkillSpector fork) — developer/CI supply-chain vetting                                                                            |

## Tech Stack

### Frontend

- **React 19** with TypeScript 5.9 — shared across desktop and web
- **React Native 0.83** / Expo 55 — mobile (iOS + Android)
- **Tailwind CSS 4** — styling across all React surfaces
- **Radix UI** — accessible component primitives
- **Framer Motion** — animations
- **Zustand 5** — state management
- **React Router 7** (desktop), **Expo Router** (mobile), **Next.js App Router** (web)
- **Monaco Editor** — in-app code editing
- **xterm.js** — embedded terminal
- **Mermaid** / **KaTeX** / **react-markdown** — rich content rendering
- **i18next** — internationalization

### Backend (Desktop Native)

- **Rust** (edition 2021, toolchain 1.94.0)
- **Tauri 2.11** — desktop application framework with IPC commands
- **SQLite** (rusqlite with SQLCipher) — encrypted local database
- **enigo / rdev / xcap** — cross-platform input simulation, screen capture
- **portable-pty** — terminal emulation
- **git2** — native Git operations
- **cpal** — cross-platform audio capture
- **keyring** — OS-level secure credential storage (macOS Keychain, Windows Credential Manager)
- **reqwest** — HTTP client with retry middleware
- **tokio** — async runtime

### Backend (Services)

- **Express 5** — signaling server
- **Clerk** — authentication (web)
- **Stripe** — payments and subscription management
- **Neon PostgreSQL** — serverless database with ordered, versioned SQL migrations (`apps/web/db/neon`)
- **Upstash Redis** — rate limiting and caching
- **Vercel** — web app deployment
- **Pino** — structured logging

### CLI

- **Rust** with clap 4 — argument parsing
- **ratatui** — terminal UI framework
- **rustyline** — readline-style input
- **syntect** — syntax highlighting
- **crossterm** — terminal control

### Build & CI

- **pnpm 9.15** — workspace package manager
- **Vite 7** — frontend build tooling
- **GitHub Actions** — CI/CD across multiple workflows (lint, typecheck, test, Rust clippy, Semgrep security audit, E2E, release for CLI/desktop/web)
- **Playwright** — end-to-end testing
- **Vitest** — unit testing
- **ESLint 9** + **Prettier** — linting and formatting
- **Husky** + **lint-staged** + **commitlint** — git hooks with conventional commits

### Database migrations

`apps/web/db/neon` is an immutable, contiguous migration chain tracked in
`public.schema_migrations` with exact SHA-256 checksums. The runner reads the
database URL from `AGI_DATABASE_URL`, `DATABASE_URL`, or `NEON_DATABASE_URL`
and never reads credential files or prints the URL.

- Inspect: `pnpm db:migrate -- status`
- Apply: `pnpm db:migrate -- apply --target local|ci|branch|production`
- Verify: `pnpm db:migrate -- verify`
- Probe RLS on local/CI/throwaway branch:
  `pnpm db:rls-probe -- --target local|ci|branch`

Production apply also requires `--confirm-production`. Baseline is an explicit
operator action with `--confirm-baseline`, a sequence, reason, and evidence;
run it only after branch verification.

## AI and Agent Capabilities

### Multi-Provider Model Catalog

The `packages/contracts/types/src/models.json` catalog contains verified model definitions with per-model capability flags (streaming, tools, vision, thinking, computer use, agentic, image/video generation, search, research, code execution), pricing data, benchmark scores, and quality tiers. Task-aware routing in `packages/ai/routing/` selects models by task category.

### Swarm Orchestration

The desktop Rust backend (`core/swarm/`) implements a swarm-based agent orchestrator with:

- Task decomposition into typed subtasks
- Dependency graph construction and topological execution
- Parallel sub-agent spawning with configurable concurrency
- Result aggregation strategies
- Circuit-breaker fault tolerance
- Metrics collection

### Intent Detection and Tool Routing

The `core/intent/` module classifies user requests by complexity and intent category, then routes to the appropriate tool set and model tier. Quick-win optimization handles simple queries without full orchestration overhead.

### Research System

A multi-source research orchestrator (`core/research/`) coordinates web search, document search, email search, calendar search, and memory search agents to produce structured reports with citations.

### Skills and Marketplace

The `core/skills/` module supports loadable skills from local files, marketplace, or learned-from-conversation sources. The CLI's `skill_learner.rs` can extract reusable skills from conversation patterns.

## Security and Privacy

> Trust-boundary model: **[`docs/architecture/trust-boundaries.md`](docs/architecture/trust-boundaries.md)**. Key custody and rotation: **[`docs/security/`](docs/security/)**. The repository has no published vulnerability-reporting policy yet.

- **Trust boundary enforcement** — Local, BYOK, and Managed Cloud are separate trust boundaries. Local chats never silently route to cloud providers. BYOK transitions require explicit user consent with payload preview and secret scanning.
- **Encrypted local storage** — Desktop uses SQLCipher-encrypted SQLite for local data. Credentials stored in OS keychain (macOS Keychain, Windows Credential Manager, Linux Secret Service).
- **Sandbox policies** — The `crates/agiworkforce-sandbox-policy` crate enforces execution policies. The CLI supports Linux seccomp filtering (optional feature).
- **Input validation** — Zod schema validation on API boundaries. Helmet and rate limiting on Express services.
- **Secure automation** — The computer-use loop enforces a `ComputerUseSafetyLayer` (`automation/computer_use/safety.rs`) with shared dangerous-pattern guards (`automation/safety_patterns.rs`) and an allowlist for destructive operations.
- **Chrome Extension CSP** — Strict Content Security Policy with no `unsafe-inline`, localhost-only bridge connections, and native messaging validation.
- **CI security gates** — Dependency audits (npm + cargo-audit), Semgrep OWASP/security scans, CodeQL analysis, and hardcoded-secret detection.

## Setup Instructions

### Prerequisites

| Tool                              | Version |
| --------------------------------- | ------- |
| Node.js                           | 22      |
| pnpm                              | 9.15.3  |
| Rust                              | 1.94.0  |
| Xcode (macOS, for mobile/desktop) | Latest  |
| Android SDK (for mobile)          | Latest  |

### Clone and Install

```bash
git clone https://github.com/siddharthanagula3/agiworkforce.git
cd agiworkforce
nvm use
corepack enable && corepack prepare pnpm@9.15.3 --activate
pnpm install
```

### Desktop App (Tauri)

```bash
# Install Rust toolchain
rustup install 1.94.0
rustup default 1.94.0

# macOS system deps (if building with OCR)
brew install llvm tesseract

# Start development
pnpm dev:desktop
```

### Web App (Next.js)

```bash
cp apps/web/.env.example apps/web/.env.local
# Fill in required values (see Environment Variables below)
pnpm --filter @agiworkforce/web dev
```

### Mobile App (Expo)

```bash
cp apps/mobile/.env.local.example apps/mobile/.env.local
pnpm --filter @agiworkforce/mobile dev
# Then: press 'i' for iOS simulator or 'a' for Android emulator
```

### CLI

```bash
cargo run -p agiworkforce-cli --bin agi -- exec "hello"
# Or for the interactive TUI:
cargo run -p agiworkforce-cli --bin agi
```

### Local Infrastructure (Docker)

```bash
docker compose up -d          # PostgreSQL 16 + pgAdmin
# pgAdmin at http://localhost:5050
```

## Environment Variables

Each surface owns its environment contract. Deployment-oriented examples list
every supported key; local examples contain only local-development inputs.
Never commit `.env`, `.env.local`, signing credentials, or provider secrets.

| Surface          | Contract                                 | Local loading behavior                         |
| ---------------- | ---------------------------------------- | ---------------------------------------------- |
| Desktop          | `apps/desktop/.env.example`              | Vite loads `apps/desktop/.env.local`           |
| Web              | `apps/web/.env.example`                  | Next.js loads `apps/web/.env.local`            |
| Mobile           | `apps/mobile/.env.example`               | Expo loads `.env.local`; EAS uses EAS envs     |
| Chrome extension | `apps/extension/.env.example`            | Vite loads `apps/extension/.env.local`         |
| Signaling        | `services/signaling-server/.env.example` | Loads `services/signaling-server/.env` locally |

For shell-managed services and production checks, keep values in your local Zsh
configuration or deployment secret store, start a fresh shell, and run:

```bash
# Reads process.env only and prints key names, never values.
pnpm env:doctor -- --scope web --mode production
pnpm env:doctor -- --scope gateway --mode production
pnpm env:doctor -- --scope signaling --mode production

# Verifies all templates, git tracking, and the no-/tmp-credentials rule.
pnpm check:env-contract
```

## Local Development Commands

```bash
# Development servers
pnpm dev:desktop              # Tauri desktop dev mode
pnpm --filter @agiworkforce/web dev    # Next.js web dev server
pnpm --filter @agiworkforce/mobile dev # Expo mobile dev server
pnpm --filter @agiworkforce/signaling-server dev  # Signaling server
```

## Testing and Linting

```bash
# Linting
pnpm lint                     # ESLint across all surfaces
pnpm lint:extension           # Chrome extension lint
pnpm format:check             # Prettier format check

# Type checking
pnpm typecheck:all            # TypeScript type check all packages

# Unit tests
pnpm test                     # Run all package tests (Vitest + Jest)
pnpm --filter @agiworkforce/desktop test    # Desktop unit tests
pnpm --filter @agiworkforce/web test        # Web unit tests

# E2E tests
pnpm --filter @agiworkforce/desktop test:e2e   # Playwright E2E
pnpm --filter @agiworkforce/web test:e2e       # Web E2E

# Rust
cargo check --workspace       # Compile check
cargo test -p agiworkforce-desktop -p agiworkforce-cli --lib  # Rust unit tests
cargo clippy -p agiworkforce-desktop -p agiworkforce-cli --lib -- -D warnings  # Lint

# Repo health
pnpm check:llm-operability    # Full repo organization and convention checks
pnpm check:agent-context      # Agent context file validation
pnpm check:boundaries         # Package boundary enforcement
pnpm check:model-catalog      # Model catalog integrity
pnpm check:readme-facts       # README counts, versions, and provider names vs source
```

## Deployment

- **Web** — A successful `CI` run for an exact `main` commit triggers `.github/workflows/deploy-production.yml`, which builds and deploys a prebuilt Vercel artifact. Vercel's direct `main` Git deployment is disabled to prevent an unverified race.
- **Desktop** — `release-desktop.yml` ships Linux `.AppImage`/`.deb` bundles and a notarized universal macOS `.dmg` plus signed updater archive. `build-windows-release.yml` ships the signed Windows NSIS installer.
- **CLI** — Distributed via GitHub Releases, Homebrew (`siddharthanagula3/tap/agiworkforce`), and `cargo install`. Release workflow: `release-cli.yml`.
- **Mobile** — Built with EAS (Expo Application Services). Release scripts for iOS App Store and Google Play in `apps/mobile/scripts/release/`.
- **Signaling Server** — Dockerized with Fly.io and Railway deployment configs; production jobs require successful CI for the exact selected commit.

The production gate, protected variables, path filters, and private-repository
runner budget are documented in
[`docs/development/ci-and-deploys.md`](docs/development/ci-and-deploys.md).

## Current Status

**Active development — pre-v1.0 MVP.**

The long-form serial surface order lives in
[`docs/product/requirements.md`](docs/product/requirements.md).
It is superseded for day-to-day sequencing by the ordered release gate in
[`docs/work/implementation-status.md`](docs/work/implementation-status.md)
(2026-08-09): image/video generation on Web, Mobile, and both Desktop shells;
then tool loop, artifact rendering, and web search on Web, Mobile, and Desktop;
then skills, plugins, and connectors on Web, Mobile, Desktop, CLI, and VS Code.

Every surface below is under active development. The Status column records the
maturity the parity matrix measures, not a shipped-feature claim.

| Surface           | Version | Status                                                                           |
| ----------------- | ------- | -------------------------------------------------------------------------------- |
| Mobile            | 1.2.0   | Partial — App Store release track, Local-first chat and public-alpha Cloud entry |
| Web               | 0.1.1   | Partial — product site, chat, billing                                            |
| Desktop           | 1.2.0   | Partial — parity matrix records partial coverage across chat, models, and tools  |
| CLI               | 1.7.1   | Partial — interactive TUI + one-shot mode                                        |
| Chrome Extension  | 1.2.0   | Partial — browser automation + side panel                                        |
| VS Code Extension | 0.3.0   | Partial — IDE integration                                                        |

Per-capability status is tracked row by row in
[`docs/work/implementation-status.md`](docs/work/implementation-status.md).
Versions here are read from each surface manifest and enforced by
`pnpm check:readme-facts`.

Managed Cloud is in public alpha and open by default (founder decision, 2026-06-27); metering, abuse controls, and provider terms must keep pace with public usage, but they no longer gate access.

## Contributing

- **For a system overview:** [`docs/architecture/overview.md`](docs/architecture/overview.md) — surfaces, trust boundaries, shared layers, and request flow.
- **For product intent:** [`docs/product/definition.md`](docs/product/definition.md), then [`docs/product/requirements.md`](docs/product/requirements.md).
- **For coding agents:** [docs/agent-context/](docs/agent-context/) — machine-readable maps, risk areas, commands, and known flaws.
- **For builds and deployment:** [`docs/development/ci-and-deploys.md`](docs/development/ci-and-deploys.md).

## License

Proprietary and confidential. © 2026 AGI Workforce. All rights reserved.

See [LICENSE](LICENSE) for details.
