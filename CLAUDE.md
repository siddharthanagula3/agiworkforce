# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What This Project Is

AGI Workforce is a Tauri v2 desktop application (Rust backend + React/TypeScript frontend) — an open, model-agnostic AI desktop platform. Users can connect any LLM (cloud or local), use MCP tools, manage agents, and run autonomous workflows. A companion Next.js web app handles marketing, auth, and billing.

## Monorepo Structure

pnpm workspaces monorepo with a Cargo workspace for Rust:

```
apps/
  desktop/              # Tauri v2 desktop app (primary product)
    src/                # React/TS frontend (Vite + React 19 + Tailwind 4)
    src-tauri/          # Rust backend (Tauri v2 commands, system APIs)
  web/                  # Next.js 16 marketing/auth/billing site
  mobile/               # React Native + Expo mobile app (iOS/Android)
  extension/            # Chrome extension (Manifest V3, native messaging)
  extension-vscode/     # VS Code extension
packages/
  types/                # Shared TypeScript type definitions
  utils/                # Shared utility functions
services/
  api-gateway/          # Express API for mobile + external integrations
  signaling-server/     # WebSocket signaling for realtime communication
```

## Build & Development Commands

```bash
# Install dependencies
pnpm install

# Desktop app development (starts Vite frontend + Rust backend)
cd apps/desktop && pnpm dev          # alias: pnpm tauri dev

# Web app development
cd apps/web && pnpm dev              # Next.js dev server

# Mobile app development (iOS/Android via Expo)
cd apps/mobile && pnpm dev           # Expo dev server

# Chrome extension development
cd apps/extension && pnpm dev        # Vite watch build

# VS Code extension development
cd apps/extension-vscode && pnpm dev # Vite watch build

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
cd apps/desktop && pnpm test                                  # Vitest unit tests
cd apps/desktop && pnpm test src/__tests__/foo.test.ts        # Run a single test file
cd apps/desktop && pnpm test:coverage                         # With coverage report
cd apps/desktop && pnpm test:e2e                              # Playwright E2E
cd apps/web && pnpm test                                      # Web app tests
cd services/api-gateway && pnpm test                          # API tests
cargo test                                                    # Rust unit tests (from repo root)
cargo test -p agiworkforce -- module::test_name               # Run a single Rust test
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
    - `capability_detection.rs` — Ollama/local LLM capability probing via `/api/show`; detects tool support to prevent silent failures on non-tool models (caches results)
  - `agent/` — Agent runtime: planner, executor, autonomous mode, background agents, vision, RAG
  - `swarm/` — Parallel agent orchestration: task decomposition, agent spawning, result aggregation
  - `mcp/` — Model Context Protocol: server connections, tool registration, extensions
  - `agi/` — Higher-level AGI orchestration, executors, templates
  - `embeddings/`, `research/`, `scheduler/` (NLP parser, proactive scheduling, types), `skills/`, `intent/`, `artifacts/`

- **`sys/`** — System services and platform integration
  - `commands/chat/` — Chat command handlers
    - `tool_events.rs` — Structured `ToolEvent` emission to frontend (Started, Progress, Completed); display name mapping for Claude Code-style labels (Read, Write, Bash, WebSearch, etc.)
  - `commands/` — All `#[tauri::command]` handlers (100+ files), invoked from frontend via `invoke()`
  - `security/` — ToolGuard (`tool_guard.rs`, 1778 lines), SecretManager, encryption (Argon2id + AES-GCM), auth, RBAC, rate limiting
  - `billing/`, `diagnostics/`, `logging/`, `telemetry/`, `permissions/`, `account/`

- **`automation/`** — Desktop automation: screen capture, input simulation, browser control, computer use, OCR
- **`features/`** — Domain features: terminal, speech/voice, calendar, teams, workflows, documents, canvas
- **`integrations/`** — External service integrations: cloud sync, native messaging, realtime, APIs
- **`data/`** — Data layer: SQLite database, settings, cache, analytics, metrics
- **`ui/`** — Native UI helpers: tray icon (`tray.rs`), window management, overlay, onboarding
- **`models/`** — Shared Rust data model structs (not the AI models — those live in `core/llm/`)
- **`state.rs`** — Global `AppState` that is `app.manage()`d and passed to Tauri commands

`core/` also contains **`orchestration/`** (workflow engine, executor, scheduler) — separate from the swarm orchestration layer.

Entry point: `main.rs` calls `lib.rs::run()` which sets up Tauri with all plugins and managed state.

### TypeScript Frontend (`apps/desktop/src/`)

React 19 SPA with Vite, using react-router-dom for routing:

- **`components/`** — 60+ component directories (Agent, Chat, Settings, Voice, Vision, Terminal, etc.)
  - `UnifiedAgenticChat/ToolLabel.tsx` — Renders individual tool execution with status (running/completed/error), duration, and icon mapping
  - `UnifiedAgenticChat/ToolTimeline.tsx` — Collapsible timeline of tool executions during agentic loop, auto-expands while tools are running
- **`stores/`** — 40+ Zustand stores with Immer and Persist middleware. Key stores:
  - `settingsStore.ts` — App configuration (persist v10 migration)
  - `unifiedChatStore.ts` — Chat state management
  - `chat/toolStore.ts` — Tool execution tracking; listens on `tool:event` Tauri channel to build timeline of executed tools
  - `mcpStore.ts` / `mcpbStore.ts` — MCP connections
  - `modelStore.ts` — Model selection and configuration
- **`services/`** — API services, analytics, Stripe, Supabase auth, caching
- **`hooks/`** — React hooks
- **`constants/`** — LLM model definitions (`llm.ts` is the TS-side model catalog)
- **`types/`** — TypeScript interfaces

### Frontend-Backend Communication

Frontend calls Rust via `@tauri-apps/api invoke()`. Each command is a `#[tauri::command]` function registered in `lib.rs`. State is passed via Tauri's managed state system (`app.manage(StateWrapper)` → `State<'_, T>` in handlers).

**Tool & Agentic Events** (Tauri event system):

- `tool:event` — Structured ToolEvent (type: Started, Progress, or Completed) during tool execution. Includes tool metadata (tool_name, display_name, display_args, duration_ms, result_preview).
- `agentic:loop-started` — Agentic loop iteration started
- `agentic:loop-status` — Loop status: current iteration count, tools executed, elapsed time, cost
- `agentic:loop-ended` — Loop completed; includes reason (max_iterations, max_cost, no_tool_calls, error)
- `agentic:message-consumed` — User queued message was consumed by the loop

### Web App (`apps/web/`)

Next.js 16 with App Router. Routes: `/login`, `/signup`, `/dashboard`, `/pricing`, `/chat`, `/docs`, `/download`, etc. Uses Supabase for auth (SSR via `@supabase/ssr`), Stripe for billing, Upstash Redis for rate limiting.

### Shared Packages

- `packages/types/` — TypeScript types shared between desktop, web, and services
- `packages/utils/` — Utility functions shared across apps

## Key Technical Details

- **Tool Events** (sys/commands/chat/tool_events.rs + packages/types/src/tool-events.ts): Structured `ToolEvent` emission via `tool:event` Tauri channel during tool execution. Each event carries `ToolEvent::Started`, `ToolEvent::Progress`, `ToolEvent::Completed` with metadata (tool_name, display_name, display_args, result_preview, duration_ms). Display name mapping converts raw MCP tool names to Claude Code-style labels via pattern matching: `Read(path)`, `Write(path)`, `Bash(cmd)`, `WebSearch(query)`, `Edit(path:lines)`, `Git(cmd)`, etc. Frontend listens and builds timeline in `chat/toolStore.ts`, rendered by `ToolLabel.tsx` + `ToolTimeline.tsx`.
- **Agentic Loop Events**: Frontend subscribes to lifecycle events emitted by the agentic loop executor:
  - `agentic:loop-started` — Agentic loop iteration began
  - `agentic:loop-status` — Current iteration count, tools executed, elapsed time, cost snapshot
  - `agentic:loop-ended` — Loop completed; includes reason (max_iterations, max_cost, no_tool_calls, error)
  - `agentic:message-consumed` — User queued message was consumed by the loop
- **Local LLM Capability Detection** (core/llm/capability_detection.rs): Ollama capability detection via `/api/show` endpoint. Probes model template for tool-calling support tokens and checks model family against known tool-capable families (llama3.1+, qwen2.5+, mistral, etc.). Results cached per session to avoid repeated network calls. Includes fallback to model name heuristics when /api/show is unreachable. Prevents tool injection on non-tool-capable models.
- **Prompt Tool Injection** (planned for Phase 2): Fallback for non-tool-capable local LLMs — converts tool definitions into formatted prompt instructions, allowing models like Mistral 7B to respond with pseudo-tool calls that are parsed and executed server-side.
- **State Management Pattern** (lib.rs): Uses degraded state constructors for optional features — `MemoryState::degraded()`, `MasterPasswordState::degraded()`, `ProjectMemoryState::degraded()`, `McpExtensionsState::degraded()`, `EmbeddingServiceState::degraded()`, `AppState::degraded()`. Allows graceful fallback if initialization fails. However, some commands (embedding\_\*) have type mismatches and may panic if state is not properly managed.
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
- Rust/Tauri files: **CAN be modified directly** — user has authorized full Rust edits (overriding previous restriction). Write directly to `src-tauri/` files. If a spec exists in `docs/rust-fixes-needed.md`, implement it directly.
- Research the market (web search) before implementing any user-facing feature
- Conventional commits enforced: `type(scope): lowercase subject`, max 100 chars
- All secrets through SecretManager — never in plaintext, never in committed `.env`
- TypeScript: strict mode, prefer interfaces, named exports, absolute imports from `src/`
- React: functional components only, Tailwind for styling
- Rust: follow Tauri v2 patterns, `#[tauri::command]` for invoke handlers, snake_case
- **ALWAYS use parallel sub-agents or agent teams** — never do sequential work when tasks can be parallelized. Launch multiple Task tool calls in a single message. Use `TeamCreate` + `TaskCreate` for cross-cutting multi-agent work. Assign tasks, communicate via `SendMessage`, and properly shut down teams with `shutdown_request` when done. This is a hard requirement for all non-trivial tasks.

## Persistent Memory

- `MEMORY.md` — AI learnings, patterns, preferences (updated during work)
- `AGENTS.md` — Agent roster, zone ownership, model assignments
- `docs/SESSION_STATE.md` — Session handoff state (updated before compaction)

## Zone-Based File Ownership (Multi-Agent)

When parallel agents work, each writes only to its assigned zone:

| Zone   | Files                                                                                   |
| ------ | --------------------------------------------------------------------------------------- |
| A      | `apps/desktop/src/components/**`, `apps/desktop/src/pages/**`, `apps/web/components/**` |
| B      | `apps/desktop/src/services/**`, `apps/web/api/**`, `services/**`                        |
| C      | `apps/web/core/storage/**`, `supabase/migrations/**`                                    |
| D      | `apps/desktop/src/stores/mcpStore*`, `apps/extension/**`                                |
| E      | `Dockerfile`, `.github/**`, `scripts/**`                                                |
| F      | `docs/**`, `README.md`, `CHANGELOG.md`                                                  |
| SYSTEM | `apps/desktop/src-tauri/**`                                                             |
| SHARED | `package.json`, `tsconfig.json`, `CLAUDE.md`, `packages/**`                             |
