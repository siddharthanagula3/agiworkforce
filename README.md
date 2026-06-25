# AGI Workforce

> **All the AIs you already pay for, in one place. Beyond one model. Beyond one surface.**

[![License](https://img.shields.io/badge/license-Proprietary-red)](LICENSE)

AGI Workforce is a multi-surface AI workspace that unifies 20+ LLM providers — including local models — into a single application spanning **Mobile**, **Web**, **Desktop**, **CLI**, **Chrome Extension**, and **VS Code Extension**. Each surface enforces its own trust boundary: Local mode keeps data on-device, BYOK (Bring Your Own Key) lets users route to their own provider accounts, and a managed cloud mode (currently waitlisted) adds hosted inference.

## What the Project Does

AGI Workforce replaces the need to maintain separate subscriptions and interfaces for every AI provider. Users can chat, generate code, run agentic workflows, automate browsers and desktops, manage files, search the web, and orchestrate multi-step tasks — all through a unified interface that routes requests to the best-fit model across providers.

The application is structured as a polyglot monorepo (TypeScript + Rust) with six client surfaces sharing common packages for types, providers, routing, runtime, stores, and a unified chat protocol.

## Key Features

- **Multi-provider model routing** — Catalog of 80+ models from OpenAI, Anthropic, Google, xAI, DeepSeek, Mistral, Perplexity, Qwen, Moonshot, ZhipuAI, Cohere, AI21, Groq, Together, Fireworks, Cerebras, DeepInfra, Sambanova, NVIDIA NIM, OpenRouter, Azure OpenAI, AWS Bedrock, and Ollama / LM Studio for local inference. Task-aware routing selects models by category (fast completion, code generation, complex reasoning, vision, long context, computer use).
- **Local-first privacy** — Desktop and mobile surfaces run local models via Ollama, LM Studio, and on-device inference (llama.rn, ExecuTorch). No data leaves the device in Local mode.
- **Bring Your Own Key (BYOK)** — Users provide their own API keys; AGI Workforce routes requests directly to the user's provider account.
- **Agentic execution** — Swarm-based orchestration with task decomposition, parallel sub-agent spawning, dependency-graph execution, and result aggregation. The CLI provides an interactive TUI and one-shot execution mode.
- **Computer use and browser automation** — Desktop backend includes screen capture, vision planning, input simulation (keyboard/mouse via enigo/rdev), OCR (Tesseract), and a screen watcher for autonomous desktop control. The Chrome Extension adds page capture, content extraction, and native messaging bridge to the desktop app.
- **MCP (Model Context Protocol)** — First-class MCP client support in the desktop, CLI, API gateway, and extension. Configurable MCP server registry with allowlist-based security.
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
              │ stores, runtime,│
              │ unified-chat,   │
              │ design-tokens,  │
              │ skills, utils   │
              └────────┬────────┘
                       │
          ┌────────────┴────────────┐
          │                         │
   ┌──────┴──────┐          ┌──────┴──────┐
   │ API Gateway │          │  Signaling  │
   │ (Express 5) │          │   Server    │
   │ LLM proxy,  │          │ WebRTC +    │
   │ auth, rate   │          │ WebSocket   │
   │ limiting     │          │ relay       │
   └──────┬──────┘          └─────────────┘
          │
   ┌──────┴──────┐     ┌─────────────────┐
   │  Neon       │     │  Rust Crates    │
   │  PostgreSQL │     │  protocol,      │
   │  (34 migr.) │     │  sandbox-policy,│
   │             │     │  command-registry│
   │             │     │  app-server,    │
   │             │     │  + 13 more      │
   └─────────────┘     └─────────────────┘
```

### Monorepo Structure

| Directory                   | Contents                                                                                                |
| --------------------------- | ------------------------------------------------------------------------------------------------------- |
| `apps/mobile`               | Expo 55 / React Native iOS + Android app with on-device LLM support                                     |
| `apps/web`                  | Next.js 16 web application — product site, chat, billing, docs, admin                                   |
| `apps/desktop`              | Tauri 2 desktop app — React 19 frontend + Rust native backend                                           |
| `apps/cli`                  | Rust CLI binary (`agi`) — interactive TUI, one-shot exec, daemon mode                                   |
| `apps/extension`            | Chrome Extension (Manifest V3) — browser automation, side panel, native messaging                       |
| `apps/extension-vscode`     | VS Code extension — IDE-native AI surface                                                               |
| `apps/sandbox`              | Cross-origin artifact renderer (iframe sandbox)                                                         |
| `packages/`                 | 20 shared TypeScript packages (types, providers, routing, runtime, stores, MCP, etc.)                   |
| `packages/providers/`       | Per-provider adapter packages (Anthropic, Google, OpenAI, DeepSeek, xAI, Ollama, LM Studio, Perplexity) |
| `crates/`                   | 17 Rust crates (protocol, sandbox-policy, command-registry, async-utils, etc.)                          |
| `services/api-gateway`      | Express 5 API gateway — LLM proxy, Clerk auth, rate limiting, Redis caching                             |
| `services/signaling-server` | Express 5 WebRTC/WebSocket signaling server for cross-device sync                                       |

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

- **Express 5** — API gateway and signaling server
- **Clerk** — authentication (web + API gateway)
- **Stripe** — payments and subscription management
- **Neon PostgreSQL** — serverless database with 34 migrations
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
- **GitHub Actions** — CI/CD with 11 workflow files (lint, typecheck, test, Rust clippy, Semgrep security audit, E2E, release for CLI/desktop/web)
- **Playwright** — end-to-end testing
- **Vitest** — unit testing
- **ESLint 9** + **Prettier** — linting and formatting
- **Husky** + **lint-staged** + **commitlint** — git hooks with conventional commits

## AI and Agent Capabilities

### Multi-Provider Model Catalog

The `packages/types/src/models.json` catalog contains verified model definitions with per-model capability flags (streaming, tools, vision, thinking, computer use, agentic, image/video generation, search, research, code execution), pricing data, benchmark scores, and quality tiers. Task-aware routing in `packages/routing/` selects models by task category.

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

> Security policy, trust-boundary model, and vulnerability reporting: **[SECURITY.md](SECURITY.md)**.

- **Trust boundary enforcement** — Local, BYOK, and Managed Cloud are separate trust boundaries. Local chats never silently route to cloud providers. BYOK transitions require explicit user consent with payload preview and secret scanning.
- **Encrypted local storage** — Desktop uses SQLCipher-encrypted SQLite for local data. Credentials stored in OS keychain (macOS Keychain, Windows Credential Manager, Linux Secret Service).
- **Sandbox policies** — The `crates/sandbox-policy` crate enforces execution policies. The CLI supports Linux seccomp filtering (optional feature).
- **Input validation** — Zod schema validation on API boundaries. Helmet and rate limiting on Express services.
- **Secure automation** — Automation safety module (`automation/safety.rs`) with pattern-based guards and an allowlist for destructive operations.
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
cp apps/mobile/.env.example apps/mobile/.env
pnpm --filter @agiworkforce/mobile dev
# Then: press 'i' for iOS simulator or 'a' for Android emulator
```

### CLI

```bash
cargo run -p agiworkforce-cli --bin agi -- exec "hello"
# Or for the interactive TUI:
cargo run -p agiworkforce-cli --bin agi
```

### API Gateway

```bash
cp services/api-gateway/.env.example services/api-gateway/.env
pnpm --filter @agiworkforce/api-gateway dev
```

### Local Infrastructure (Docker)

```bash
docker compose up -d          # PostgreSQL 16 + pgAdmin
# pgAdmin at http://localhost:5050
```

## Environment Variables

Copy the relevant `.env.example` files and fill in values. **Never commit `.env.local` files.**

### Web App (`apps/web/.env.local`)

| Variable                             | Purpose                            |
| ------------------------------------ | ---------------------------------- |
| `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY`  | Clerk authentication (public)      |
| `CLERK_SECRET_KEY`                   | Clerk authentication (server)      |
| `DATABASE_URL`                       | Neon PostgreSQL connection string  |
| `STRIPE_SECRET_KEY`                  | Stripe payments (server)           |
| `NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY` | Stripe payments (client)           |
| `STRIPE_WEBHOOK_SECRET`              | Stripe webhook verification        |
| `NEXT_PUBLIC_APP_URL`                | Application base URL               |
| `NEXT_PUBLIC_API_URL`                | API gateway URL                    |
| `OPENAI_API_KEY`                     | Optional — managed cloud LLM proxy |
| `ANTHROPIC_API_KEY`                  | Optional — managed cloud LLM proxy |

### Desktop App (`apps/desktop/.env.local`)

| Variable                  | Purpose                         |
| ------------------------- | ------------------------------- |
| `VITE_API_BASE_URL`       | API gateway base URL            |
| `VITE_WEB_APP_URL`        | Web app URL for OAuth redirects |
| `VITE_SIGNALING_HTTP_URL` | WebRTC signaling server URL     |
| `VITE_SENTRY_DSN`         | Optional — error reporting      |

## Local Development Commands

```bash
# Development servers
pnpm dev:desktop              # Tauri desktop dev mode
pnpm --filter @agiworkforce/web dev    # Next.js web dev server
pnpm --filter @agiworkforce/mobile dev # Expo mobile dev server
pnpm --filter @agiworkforce/api-gateway dev    # API gateway
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
```

## Deployment

- **Web** — Deployed to Vercel from the `main` branch. Configuration in `vercel.json` builds the Next.js app with output at `apps/web/.next`.
- **Desktop** — Tauri builds for macOS, Windows, and Linux via `release-desktop.yml` GitHub Actions workflow. Signed releases with auto-updater support.
- **CLI** — Distributed via GitHub Releases, Homebrew (`siddharthanagula3/tap/agiworkforce`), and `cargo install`. Release workflow: `release-cli.yml`.
- **Mobile** — Built with EAS (Expo Application Services). Release scripts for iOS App Store and Google Play in `apps/mobile/scripts/release/`.
- **API Gateway** — Dockerized (`services/api-gateway/Dockerfile`). Deployable to any container host.
- **Signaling Server** — Dockerized with Fly.io and Railway deployment configs.

## Current Status

**Active development — pre-v1.0 MVP.**

Development follows a serial surface order: **Mobile → Website → Desktop → CLI → Chrome Extension → VS Code Extension**. Mobile is the current release priority, targeting public App Store release with Local-first chat and Cloud waitlist entry.

| Surface           | Version | Status                                               |
| ----------------- | ------- | ---------------------------------------------------- |
| Mobile            | 1.2.0   | Active development — release priority                |
| Web               | 0.1.1   | Active development — product site, chat, billing     |
| Desktop           | 1.2.0   | Active development — full feature set                |
| CLI               | 1.7.1   | Active development — interactive TUI + one-shot mode |
| Chrome Extension  | 1.2.0   | Active development — browser automation + side panel |
| VS Code Extension | 0.3.0   | Active development — IDE integration                 |

Managed Cloud remains in waitlist/private beta until metering, abuse controls, and provider terms are finalized.

## Screenshots

_Screenshots and demo recordings will be added here._

## Contributing

- **For contributors:** [AGI_WORKFORCE.md](AGI_WORKFORCE.md) — product source of truth for humans and high-level context. See [CONTRIBUTING.md](CONTRIBUTING.md) for PR conventions.
- **For coding agents:** read [AGENTS.md](AGENTS.md) first, then the relevant scoped `AGENTS.md` files and [docs/agent-context/](docs/agent-context/).
- **For builds and deployment:** [BUILD.md](BUILD.md).

## License

Proprietary and confidential. © 2026 AGI Workforce. All rights reserved.

See [LICENSE](LICENSE) for details.
