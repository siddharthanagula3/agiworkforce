# AGI Workforce

Model-agnostic AI desktop platform. One app to replace them all.

Use 25+ LLM providers in a single interface — with your own API keys, local models, desktop autonomy, 150+ non-coding skills, and a mobile companion for on-the-go oversight.

**[Website](https://agiworkforce.com)** &middot; **[Web Chat](https://agiworkforce.com/chat)** &middot; **[Download](https://agiworkforce.com/download)** &middot; **[Changelog](https://agiworkforce.com/changelog)**

---

## Why AGI Workforce

Today you're locked into one provider's app. Claude Desktop only talks to Anthropic. ChatGPT only talks to OpenAI. AGI Workforce is provider-agnostic:

- **Multi-model** — 25+ providers (OpenAI, Anthropic, Google, xAI, DeepSeek, Mistral, Meta, Ollama, and more). Switch models mid-conversation.
- **BYOK** — Bring your own API keys. No markup. Full control over costs and usage.
- **Local LLMs** — Run Ollama, LM Studio, or other local providers for complete privacy.
- **Desktop autonomy** — Computer use, file system access, terminal, browser automation. Not sandboxed like web-only competitors.
- **150+ skills** — Not just a developer tool. Healthcare, finance, legal, education, creative, trades, lifestyle — specialized AI for everything.
- **Mobile companion** — Approve or deny agent actions from your phone. Live monitoring and dispatch.
- **MCP tools** — Full Model Context Protocol support (stdio, SSE, streamable HTTP).

---

## Surfaces

AGI Workforce ships as 8 interconnected surfaces:

| Surface               | Tech                | Description                                                           |
| --------------------- | ------------------- | --------------------------------------------------------------------- |
| **Desktop**           | Tauri v2 + React 19 | Primary app. Chat, agents, computer use, terminal, voice, MCP.        |
| **Web**               | Next.js 16          | Browser chat at agiworkforce.com/chat. Supabase auth, Stripe billing. |
| **Mobile**            | Expo 55             | iOS/Android companion. Approve/deny agent actions, live monitoring.   |
| **CLI**               | Rust                | Terminal agent. 16 subcommands, TUI, OS-level sandboxing.             |
| **Chrome Extension**  | MV3                 | Browser automation, DOM interaction, native messaging bridge.         |
| **VS Code Extension** | TypeScript          | Chat participant `@agi`, agent mode, inline completions, CodeLens.    |
| **API Gateway**       | Express 5           | REST API for mobile + cloud chat SSE.                                 |
| **Signaling Server**  | Express 5 + ws      | WebSocket signaling for cross-device streams.                         |

---

## Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                        Frontend (React 19)                      │
│  Components (85) · Zustand Stores (90) · Hooks (39) · i18n (12)│
└────────────────────────────┬────────────────────────────────────┘
                             │ invoke() / listen()
┌────────────────────────────┴────────────────────────────────────┐
│                   packages/api (1,061 wrappers)                 │
│            packages/runtime (Tauri · HTTP · Mock)               │
└────────────────────────────┬────────────────────────────────────┘
                             │ Tauri IPC
┌────────────────────────────┴────────────────────────────────────┐
│                     Rust Backend (403K LOC)                      │
│                                                                 │
│  core/       LLM router (25 providers), agents, swarm, MCP,    │
│              embeddings, scheduler, skills engine                │
│  sys/        1,448 Tauri commands, security (Argon2id + AES-GCM)│
│              ToolGuard (4-tier safety), billing                  │
│  automation/ Screen capture, input simulation, browser, OCR,    │
│              computer use agent                                  │
│  features/   Terminal (PTY), speech (TTS/STT), calendar          │
│  data/       SQLite (SQLCipher encrypted), settings, cache       │
│  integrations/ Cloud sync, email (IMAP/SMTP), Git, Stripe       │
│  ui/         System tray, window management, overlay, dock       │
└─────────────────────────────────────────────────────────────────┘
```

The CLI (`apps/cli/`) has its own Rust core with 65+ internal crates covering sandboxing, MCP, hooks, git, networking, and a full TUI.

---

## LLM Providers

| Provider             | Flagship Model                                                  | Context |
| -------------------- | --------------------------------------------------------------- | ------- |
| OpenAI               | GPT-5.4                                                         | 1.05M   |
| Anthropic            | Claude Opus 4.6                                                 | 1M      |
| Google               | Gemini 3.1 Pro                                                  | 1M      |
| xAI                  | Grok 4.1                                                        | 2M      |
| DeepSeek             | V3.2                                                            | 128K    |
| Mistral              | Large 3                                                         | 262K    |
| Meta (via providers) | Llama 4 Scout                                                   | 10M     |
| Ollama / LM Studio   | Local models                                                    | Varies  |
| + 17 more            | OpenRouter, Together, Fireworks, Groq, Perplexity, Cohere, etc. |         |

All model IDs live in `apps/desktop/src/constants/models.json` — never hardcoded.

---

## Skills

140+ AI skills organized across 10 categories. Each skill is a specialized LLM personality with its own system prompt, tool set, and expertise routing.

| Category              | Count | Examples                                                  |
| --------------------- | ----- | --------------------------------------------------------- |
| Technical             | 17    | Backend Engineer, System Architect, DevOps, Code Reviewer |
| Healthcare & Wellness | 29    | Primary Care, Psychiatrist, Personal Trainer, Nutrition   |
| Finance & Business    | 21    | Financial Advisor, CPA, Mortgage Broker, Estate Planning  |
| Legal                 | 10    | General Counsel, Family Law, Immigration, IP Attorney     |
| Education             | 11    | SAT/ACT Tutor, Language Tutor, STEM Educator              |
| Creative & Content    | 18    | Video Editor, Music Producer, YouTube Manager, Podcasting |
| E-Commerce            | 6     | Shopify, Amazon FBA, Dropshipping, Etsy                   |
| Trades & Home         | 13    | Electrician, Plumber, HVAC, Auto Mechanic, Contractor     |
| Automotive            | 4     | Car Buying, EV Specialist, Auto Insurance                 |
| Lifestyle & Family    | 15    | Parenting Coach, Wedding Planner, Travel Advisor, Chef    |

Skills are auto-routed based on query keywords, or invoked directly with `@skill-name`.

---

## Prerequisites

- **Node.js** 22+
- **pnpm** 9.15+
- **Rust** toolchain 1.94+ (2021 edition)
- **Tauri v2 prerequisites** — see [Tauri docs](https://v2.tauri.app/start/prerequisites/)

---

## Getting Started

```bash
# Clone
git clone https://github.com/siddhartha/agiworkforce.git
cd agiworkforce

# Install JS dependencies
pnpm install

# Check Rust workspace compiles
cargo check

# Run the desktop app (Vite HMR + Rust rebuild)
cd apps/desktop && pnpm dev

# Or run frontend only (no Rust rebuild — faster iteration)
cd apps/desktop && pnpm dev:vite
```

### Other surfaces

```bash
# Web
cd apps/web && pnpm dev

# Mobile
cd apps/mobile && pnpm dev

# CLI
cd apps/cli && cargo run -- "your prompt here"

# API Gateway
cd services/api-gateway && pnpm dev

# Signaling Server
cd services/signaling-server && pnpm dev
```

---

## Development

```bash
# Type checking
pnpm typecheck          # Desktop workspace only
pnpm typecheck:all      # All TypeScript workspaces

# Linting
pnpm lint               # ESLint (max-warnings=0)
pnpm format:check       # Prettier check
pnpm format             # Prettier fix
cargo clippy --workspace --lib -- -D warnings -D unsafe-code

# Testing
cd apps/desktop && pnpm test                    # Vitest
cargo test --workspace --lib                    # Rust tests
cd apps/desktop && pnpm test:e2e               # Playwright E2E

# Building
pnpm build:all          # Build all packages (except desktop)
pnpm build:desktop      # Tauri production build
```

---

## Project Structure

```
agiworkforce/
├── apps/
│   ├── desktop/            Tauri v2 desktop app (Rust + React)
│   │   ├── src/            React 19 frontend (1,048 files)
│   │   └── src-tauri/src/  Rust backend (732 files, 8 modules)
│   ├── web/                Next.js 16 (App Router, Supabase, Stripe)
│   ├── mobile/             Expo 55 + expo-router (NativeWind)
│   ├── cli/                Rust CLI agent (16 subcommands, TUI)
│   ├── extension/          Chrome MV3 extension
│   └── extension-vscode/   VS Code extension
├── packages/
│   ├── api/                1,061 typed invoke() wrappers
│   ├── runtime/            Capability-aware command routing
│   ├── types/              Shared TypeScript types
│   ├── stores/             Shared Zustand stores
│   ├── chat/               Shared chat components
│   └── utils/              Shared utilities
├── crates/                 65+ Rust crates (CLI core)
│   └── sandbox-policy/     OS-level sandbox (Seatbelt, Bubblewrap, Landlock)
├── services/
│   ├── api-gateway/        Express 5 REST API (port 3000)
│   └── signaling-server/   WebSocket signaling (port 4000)
└── package.json            pnpm monorepo root
```

---

## Security

- **ToolGuard** — 4-tier tool safety: Safe (auto-execute), Notification, Confirmation, Explicit Approval. Rate limits, path allowlists, blocked domains, parameter validation.
- **Encryption** — SQLCipher for local database. Argon2id + AES-GCM for secrets.
- **Sandboxing** — CLI uses OS-level sandboxing: macOS Seatbelt, Linux Bubblewrap/Landlock.
- **CSP** — Content Security Policy enforced in Tauri config and Vite dev server.
- **Audit** — `pnpm audit` and `cargo audit` run in CI. Both block on critical/warnings.
- **No unsafe Rust** — `unsafe_code = "deny"` enforced project-wide.

---

## Tech Stack

| Layer         | Technology                                          |
| ------------- | --------------------------------------------------- |
| Desktop shell | Tauri 2.9                                           |
| Backend       | Rust 2021 (Tokio, serde, reqwest, anyhow/thiserror) |
| Frontend      | React 19, Vite 7 (SWC), Tailwind CSS 4, Zustand 5   |
| UI            | Radix UI, Lucide icons, CVA, Framer Motion          |
| Web           | Next.js 16, Supabase SSR, Stripe                    |
| Mobile        | Expo 55, NativeWind, MMKV, SecureStore              |
| Database      | SQLite (rusqlite + SQLCipher)                       |
| Testing       | Vitest, Playwright, cargo test                      |
| CI/CD         | GitHub Actions                                      |

---

## Release

- **Desktop** — Tag push (`git tag v1.x.x && git push origin v1.x.x`) triggers cross-platform builds (macOS, Windows, Linux). Ed25519 signed binaries. Auto-update via Tauri updater.
- **CLI** — Cross-compiled to 5 targets. Distributed via curl installer, npm, and Homebrew.
- **Web** — Deployed on Vercel. Automatic on push to main.

---

## License

Proprietary. All rights reserved.
