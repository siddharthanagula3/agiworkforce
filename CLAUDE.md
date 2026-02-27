# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What This Project Is

AGI Workforce is a Tauri v2 desktop application (Rust backend + React/TypeScript frontend) — an open, model-agnostic AI desktop platform. Users can connect any LLM (cloud or local), use MCP tools, manage agents, and run autonomous workflows. A companion Next.js web app handles marketing, auth, and billing.

## Monorepo Structure

pnpm workspaces monorepo with a Cargo workspace for Rust:

```
apps/
  desktop/              # Tauri desktop app (primary product)
    src/                # React/TS frontend (Vite + React 19 + Tailwind 4)
    src-tauri/          # Rust backend (Tauri v2 commands, system APIs)
  web/                  # Next.js 16 marketing/auth/billing site
  extension/            # Chrome extension (Manifest V3, native messaging)
packages/
  types/                # Shared TypeScript type definitions
  utils/                # Shared utility functions
services/
  api-gateway/          # Express API for mobile companion
  signaling-server/     # WebSocket signaling for realtime
```

## Build & Development Commands

```bash
# Install dependencies
pnpm install

# Desktop app development (starts Vite frontend + Rust backend)
cd apps/desktop && pnpm dev          # alias: pnpm tauri dev

# Web app development
cd apps/web && pnpm dev              # Next.js dev server

# Extension development
cd apps/extension && pnpm dev        # Vite watch build

# Full monorepo build (excludes desktop — it uses tauri build)
pnpm build

# Desktop app build (produces platform installer)
cd apps/desktop && pnpm build        # runs: vite build && tauri build

# Type checking
pnpm typecheck                       # runs: cd apps/desktop && tsc --noEmit
pnpm typecheck:all                   # all workspaces

# Linting
pnpm lint                            # ESLint (excludes apps/extension)
pnpm lint:extension                  # ESLint for extension only
cargo clippy                         # Rust linting (run from repo root)
cargo check                          # Rust type checking

# Formatting
pnpm format                          # Prettier
pnpm format:check                    # Prettier check only

# Tests (only run when explicitly asked)
cd apps/desktop && pnpm test         # Vitest unit tests
cd apps/desktop && pnpm test:e2e     # Playwright E2E
cd apps/web && pnpm test             # Web app tests
cd services/api-gateway && pnpm test # API tests
```

## Commit Conventions

Husky pre-commit runs `lint-staged` (ESLint + Prettier). Commit-msg runs `commitlint` with `@commitlint/config-conventional`.

- Format: `type(scope): lowercase subject` — e.g., `fix(rust): websocket timing fix`
- Header max 100 characters
- Subject MUST be lowercase (not Sentence-case or PascalCase)
- Valid types: feat, fix, chore, docs, refactor, test, perf, ci, build, style

## Architecture

### Rust Backend (`apps/desktop/src-tauri/src/`)

The Rust backend is organized into six top-level modules:

- **`core/`** — AI engine and intelligence layer
  - `llm/` — LLM routing (`llm_router.rs`, 2274 lines), SSE streaming (`sse_parser.rs`), provider adapters, cost calculation, token counting
  - `agent/` — Agent runtime: planner, executor, autonomous mode, background agents, vision, RAG
  - `swarm/` — Parallel agent orchestration: task decomposition, agent spawning, result aggregation
  - `mcp/` — Model Context Protocol: server connections, tool registration, extensions
  - `agi/` — Higher-level AGI orchestration, executors, templates
  - `embeddings/`, `research/`, `scheduler/`, `skills/`, `intent/`, `artifacts/`

- **`sys/`** — System services and platform integration
  - `commands/` — All `#[tauri::command]` handlers (100+ files), invoked from frontend via `invoke()`
  - `security/` — ToolGuard (`tool_guard.rs`, 1778 lines), SecretManager, encryption (Argon2id + AES-GCM), auth, RBAC, rate limiting
  - `billing/`, `diagnostics/`, `logging/`, `telemetry/`, `permissions/`, `account/`

- **`automation/`** — Desktop automation: screen capture, input simulation, browser control, computer use, OCR
- **`features/`** — Domain features: terminal, speech/voice, calendar, teams, workflows, documents, canvas
- **`integrations/`** — External service integrations: cloud sync, native messaging, realtime, APIs
- **`data/`** — Data layer: SQLite database, settings, cache, analytics, metrics

Entry point: `main.rs` calls `lib.rs::run()` which sets up Tauri with all plugins and managed state.

### TypeScript Frontend (`apps/desktop/src/`)

React 19 SPA with Vite, using react-router-dom for routing:

- **`components/`** — 60+ component directories (Agent, Chat, Settings, Voice, Vision, Terminal, etc.)
- **`stores/`** — 40+ Zustand stores with Immer and Persist middleware. Key stores:
  - `settingsStore.ts` — App configuration (persist v10 migration)
  - `unifiedChatStore.ts` — Chat state management
  - `mcpStore.ts` / `mcpbStore.ts` — MCP connections
  - `modelStore.ts` — Model selection and configuration
- **`services/`** — API services, analytics, Stripe, Supabase auth, caching
- **`hooks/`** — React hooks
- **`constants/`** — LLM model definitions (`llm.ts` is the TS-side model catalog)
- **`types/`** — TypeScript interfaces

### Frontend-Backend Communication

Frontend calls Rust via `@tauri-apps/api invoke()`. Each command is a `#[tauri::command]` function registered in `lib.rs`. State is passed via Tauri's managed state system (`app.manage(StateWrapper)` → `State<'_, T>` in handlers).

### Web App (`apps/web/`)

Next.js 16 with App Router. Routes: `/login`, `/signup`, `/dashboard`, `/pricing`, `/chat`, `/docs`, `/download`, etc. Uses Supabase for auth (SSR via `@supabase/ssr`), Stripe for billing, Upstash Redis for rate limiting.

### Shared Packages

- `packages/types/` — TypeScript types shared between desktop, web, and services
- `packages/utils/` — Utility functions shared across apps

## Key Technical Details

- **LLM Routing**: `core/llm/llm_router.rs` handles all model routing. `provider_adapter.rs` maps provider-specific API formats. Model catalog lives in both `src/constants/llm.ts` (frontend) and `provider_adapter.rs` (Rust) — these must stay in sync.
- **Streaming**: SSE parsing via `sse_parser.rs`. Uses dual HTTP clients (one with streaming timeout disabled).
- **Security**: ToolGuard validates all tool execution. SecretManager encrypts API keys via Argon2id + AES-GCM, stored in SQLite/keychain. Never plaintext.
- **MCP**: Supports stdio, SSE, and streamable HTTP transports. Config in `.mcp.json`.
- **State Management**: Zustand v5 + Immer + Persist. Settings persist to localStorage with migration support.
- **UI Components**: Radix UI primitives + Tailwind CSS + Lucide icons + Sonner toasts.
- **Rust features**: `default = ["shell", "updater"]`. Optional: `ocr`, `local-llm`, `vad`, `local-whisper`, `remote-databases`, `appstore`, `devtools`.
- **Build dependencies**: `rusqlite` with `bundled-sqlcipher` requires `libclang` (`brew install llvm` on macOS).

## Development Rules

- Do NOT run tests unless explicitly asked
- Do NOT modify Rust/Tauri files directly — write changes to `docs/rust-fixes-needed.md` for manual review
- Research the market (web search) before implementing any user-facing feature
- Conventional commits enforced: `type(scope): lowercase subject`, max 100 chars
- All secrets through SecretManager — never in plaintext, never in committed `.env`
- TypeScript: strict mode, prefer interfaces, named exports, absolute imports from `src/`
- React: functional components only, Tailwind for styling
- Rust: follow Tauri v2 patterns, `#[tauri::command]` for invoke handlers, snake_case

## Persistent Memory

- `MEMORY.md` — AI learnings, patterns, preferences (updated during work)
- `AGENTS.md` — Agent roster, zone ownership, model assignments
- `docs/SESSION_STATE.md` — Session handoff state (updated before compaction)

## Zone-Based File Ownership (Multi-Agent)

When parallel agents work, each writes only to its assigned zone:

| Zone   | Files                                           |
| ------ | ----------------------------------------------- |
| A      | `src/components/**`, `src/pages/**`, `src/styles/**` |
| B      | `src/services/**`, `src/api/**`                 |
| C      | `src/db/**`, `migrations/**`, `src/models/**`   |
| D      | `src/integrations/**`, `src/mcp/**`             |
| E      | `Dockerfile`, `.github/**`, `scripts/**`        |
| F      | `docs/**`, `README.md`, `CHANGELOG.md`          |
| SYSTEM | `apps/desktop/src-tauri/**`                     |
| SHARED | `package.json`, `tsconfig.json`, `CLAUDE.md`    |
